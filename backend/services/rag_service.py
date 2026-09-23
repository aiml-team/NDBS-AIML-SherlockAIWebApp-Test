"""Sherlock AI — Azure AI Search RAG service.

Retrieves relevant Sherlock document chunks via hybrid keyword + vector +
semantic-ranking search, then asks the existing Claude Foundry client to
answer the user's question grounded in the retrieved context.

The Azure AI Search index (``AZURE_SEARCH_INDEX``) is assumed to be
pre-populated and to have an **integrated vectorizer** configured. Query-time
embeddings are computed by the Search service itself via
:class:`azure.search.documents.models.VectorizableTextQuery`, so this module
does not need a client-side Azure OpenAI SDK or an ``AZURE_OPENAI_API_KEY``.

Public surface
--------------
:func:`retrieve_chunks`
    Hybrid retrieval against Azure AI Search.
:func:`build_context`
    Render retrieved chunks in a stable ``[Source N]`` format.
:func:`answer_with_rag`
    Orchestrate retrieval + Claude generation.
:func:`register_routes`
    Register ``POST /api/rag/chat`` on a Flask app.

All Azure/Claude calls are made server-side; no secret ever reaches the
browser. Errors are surfaced as sanitized :class:`RagServiceError` messages;
internal traces stay in the logs.
"""

from __future__ import annotations

import json
import logging
import os
import re
import uuid
from threading import Lock
from typing import Any, Dict, Iterator, List, Optional

from azure.core.credentials import AzureKeyCredential
from azure.core.exceptions import (
    ClientAuthenticationError,
    HttpResponseError,
    ServiceRequestError,
)
from azure.search.documents import SearchClient
from azure.search.documents.models import QueryType, VectorizableTextQuery
from flask import Response, jsonify, request, stream_with_context

logger = logging.getLogger('sherlock-web.rag')

# ── Static configuration (index-specific) ──────────────────────────────────
_SEMANTIC_CONFIG_DEFAULT = 'rag-1788923016782-semantic-configuration'
_VECTOR_FIELD = 'text_vector'
_SELECT_FIELDS = ['chunk_id', 'parent_id', 'title', 'chunk']

# ── Runtime knob defaults (overridden by env if valid) ─────────────────────
_DEFAULT_TOP_K = 5
_DEFAULT_TEMPERATURE = 0.2
_DEFAULT_MAX_TOKENS = 2000
_DEFAULT_CLAUDE_MODEL = 'claude-opus-4-7'

# Bound how long a single Claude request can take. Non-streaming requests
# to ``claude-opus-4-7`` reliably time out because the reasoning model can
# take 60-120 s to produce a full answer; we therefore use the streaming
# API in ``_call_claude`` (Anthropic's own recommendation for long
# requests). With streaming the ``timeout`` value is effectively an
# inactivity timeout — the SDK receives keepalive frames every few seconds
# so a healthy request never trips it. The retry cap is still ``0`` so a
# genuinely stuck request fails fast instead of hiding a silent 3-minute
# retry loop from the user.
_DEFAULT_CLAUDE_TIMEOUT_SEC = 180.0
_DEFAULT_CLAUDE_MAX_RETRIES = 0

# ── Question validation ────────────────────────────────────────────────────
_MAX_QUESTION_LEN = 4000
_CONTROL_RE = re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f]')
_PROSPECT_NAME_RE = re.compile(r'^[\w\s\-]{1,128}$')

# ── Grounding system prompt ────────────────────────────────────────────────
_SYSTEM_PROMPT = """You are Sherlock AI.

Rules:
- Answer only from retrieved context.
- Never hallucinate.
- If answer is not found, explicitly say so.
- Cite [Source 1], [Source 2], etc.
- Show conflicting information if multiple values exist.
- Do not automatically select a conflicting value.
"""

_NO_RESULTS_ANSWER = (
    "I could not find this information in the indexed Sherlock documents."
)

# Separate system prompt for the greeting endpoint — a lightweight LLM call
# used to seed the chat widget with a fresh, varied opener each time it opens.
_GREETING_SYSTEM_PROMPT = """You are the Sherlock AI Assistant — an NTT Data \
internal tool that helps sales representatives explore indexed SAP discovery \
documents about prospect accounts.

Generate ONE opening greeting for a sales representative who has just opened \
your chat widget. Rules:

- Maximum 25 words.
- Friendly and professional. At most one emoji, and only if it feels natural.
- Invite the reader to ask about a prospect, workstream, pain point, SAP \
module, or a comparison between accounts.
- Vary the phrasing, opener, and structure across calls — do NOT sound \
scripted or reuse the same sentence pattern each time.
- Do NOT introduce yourself with a formal title. Keep it conversational.
- Return ONLY the greeting text. No preamble, no quotes, no metadata, no \
markdown formatting.
"""

_GREETING_FALLBACK = (
    "Hello — ask me anything about the indexed prospect discovery documents."
)

# ── Conflict tool definitions ──────────────────────────────────────────────
_GET_CONFLICTS_TOOL = {
    "name": "get_conflicts",
    "description": (
        "Retrieve unresolved data conflicts for the current prospect. "
        "Call this when the user asks about conflicts, contradictions, or inconsistent data. "
        "Returns a list of unresolved conflicts with section, field, value_a, value_b, and description."
    ),
    "input_schema": {"type": "object", "properties": {}, "required": []},
}

_RESOLVE_CONFLICT_TOOL = {
    "name": "resolve_conflict",
    "description": (
        "Mark a specific data conflict as resolved with the user's chosen value. "
        "Call this when the user clearly indicates which conflicting value to keep. "
        "The conflict_id must come from a previous get_conflicts call."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "conflict_id": {
                "type": "string",
                "description": "The unique ID of the conflict to resolve.",
            },
            "chosen_value": {
                "type": "string",
                "description": "The value the user wants to keep.",
            },
        },
        "required": ["conflict_id", "chosen_value"],
    },
}


# ── Errors (safe to surface to the client) ─────────────────────────────────
class RagServiceError(RuntimeError):
    """User-facing (safe) RAG failure."""


class RagConfigurationError(RagServiceError):
    """Missing / invalid environment configuration."""


class RagValidationError(RagServiceError):
    """Client-side input validation failure (400)."""


# ── Lazy singletons ────────────────────────────────────────────────────────
_search_client: Optional[SearchClient] = None
_claude_client: Any = None
_singleton_lock = Lock()

# Some Claude Foundry deployments (e.g. ``claude-opus-4-7``) reject the
# ``temperature`` parameter with a 400 on every request. Instead of paying
# that guaranteed round-trip forever, we remember the first model that told
# us so and skip ``temperature`` proactively on subsequent calls.
_temperature_unsupported_models: set = set()


def _get_search_client() -> SearchClient:
    """Build (once) the Azure AI Search client for the configured index."""
    global _search_client
    if _search_client is not None:
        return _search_client
    with _singleton_lock:
        if _search_client is not None:
            return _search_client

        endpoint = os.environ.get('AZURE_SEARCH_ENDPOINT')
        key = os.environ.get('AZURE_SEARCH_KEY')
        index = os.environ.get('AZURE_SEARCH_INDEX')
        missing = [
            n for n, v in [
                ('AZURE_SEARCH_ENDPOINT', endpoint),
                ('AZURE_SEARCH_KEY', key),
                ('AZURE_SEARCH_INDEX', index),
            ]
            if not v
        ]
        if missing:
            raise RagConfigurationError(
                'Missing Azure AI Search env vars: ' + ', '.join(missing)
            )

        _search_client = SearchClient(
            endpoint=endpoint.rstrip('/'),
            index_name=index,
            credential=AzureKeyCredential(key),
        )
        logger.info('rag: SearchClient initialised for index=%s', index)
        return _search_client


def _get_claude_client() -> Any:
    """Return the shared Anthropic Foundry client.

    Reuses ``ANTHROPIC_FOUNDRY_*`` env vars — no new LLM client is created.
    """
    global _claude_client
    if _claude_client is not None:
        return _claude_client
    with _singleton_lock:
        if _claude_client is not None:
            return _claude_client

        api_key = os.environ.get('ANTHROPIC_FOUNDRY_API_KEY')
        base_url = os.environ.get('ANTHROPIC_FOUNDRY_BASE_URL')
        missing = [
            n for n, v in [
                ('ANTHROPIC_FOUNDRY_API_KEY', api_key),
                ('ANTHROPIC_FOUNDRY_BASE_URL', base_url),
            ]
            if not v
        ]
        if missing:
            raise RagConfigurationError(
                'Missing Claude Foundry env vars: ' + ', '.join(missing)
            )

        # anthropic>=0.121 auto-reads ANTHROPIC_FOUNDRY_RESOURCE from env and
        # errors out if base_url is also passed. Drop the shell-inherited
        # RESOURCE for this process so the explicit base_url wins.
        os.environ.pop('ANTHROPIC_FOUNDRY_RESOURCE', None)

        timeout_sec = _read_float_env(
            'CLAUDE_TIMEOUT_SEC', _DEFAULT_CLAUDE_TIMEOUT_SEC, 5.0, 300.0,
        )
        max_retries = _read_int_env(
            'CLAUDE_MAX_RETRIES', _DEFAULT_CLAUDE_MAX_RETRIES, 0, 5,
        )

        from anthropic import AnthropicFoundry
        _claude_client = AnthropicFoundry(
            api_key=api_key,
            base_url=base_url,
            timeout=timeout_sec,
            max_retries=max_retries,
        )
        logger.info(
            'rag: AnthropicFoundry client initialised (timeout=%.1fs, max_retries=%d)',
            timeout_sec, max_retries,
        )
        return _claude_client


# ── Prospect name validation (inline — avoids circular import from app.py) ─
def _safe_prospect_name(name: Optional[str]) -> Optional[str]:
    if not isinstance(name, str):
        return None
    cleaned = name.strip()
    if not cleaned or '/' in cleaned or '\\' in cleaned or '..' in cleaned:
        return None
    if not _PROSPECT_NAME_RE.match(cleaned):
        return None
    return cleaned


# ── Conflict tool dispatcher ───────────────────────────────────────────────
def _dispatch_tool(name: str, tool_input: Dict[str, Any], prospect_name: str) -> str:
    """Execute a conflict tool call against Azure Blob and return JSON string."""
    from azure.storage.blob import BlobServiceClient

    conn_str = os.environ.get('AZURE_CONNECTION_STRING', '')
    container_name = os.environ.get('CONTAINER_NAME', 'documents')

    if not conn_str:
        return json.dumps({'error': 'Azure storage not configured'})

    blob_path = f"{prospect_name}/input/master_data.json"
    try:
        container = BlobServiceClient.from_connection_string(conn_str).get_container_client(container_name)
        raw = container.get_blob_client(blob_path).download_blob().readall()
        master_data = json.loads(raw)
    except Exception:
        logger.exception('_dispatch_tool: failed to load master_data for prospect=%s', prospect_name)
        return json.dumps({'error': 'Could not load prospect data'})

    conflicts = master_data.get('_conflicts', [])

    if name == 'get_conflicts':
        unresolved = [c for c in conflicts if c.get('status') != 'resolved']
        return json.dumps({'conflicts': unresolved, 'total': len(conflicts), 'unresolved': len(unresolved)})

    if name == 'resolve_conflict':
        conflict_id = tool_input.get('conflict_id', '')
        chosen_value = tool_input.get('chosen_value', '')

        target = next((c for c in conflicts if c.get('id') == conflict_id), None)
        if not target:
            return json.dumps({'error': f'Conflict {conflict_id!r} not found'})

        section = target.get('section', '')
        field = target.get('field', '')
        if section in master_data and isinstance(master_data[section], dict):
            field_data = master_data[section].get(field)
            if isinstance(field_data, dict):
                field_data['content'] = chosen_value

        target['status'] = 'resolved'
        target['resolved_value'] = chosen_value
        remaining = sum(1 for c in conflicts if c.get('status') != 'resolved')

        try:
            container.upload_blob(
                name=blob_path,
                data=json.dumps(master_data, indent=2).encode('utf-8'),
                overwrite=True,
            )
        except Exception:
            logger.exception('_dispatch_tool: failed to upload master_data for prospect=%s', prospect_name)
            return json.dumps({'error': 'Could not save resolution'})

        return json.dumps({'ok': True, 'resolved_value': chosen_value, 'remaining_conflicts': remaining})

    return json.dumps({'error': f'Unknown tool: {name}'})


# ── Retrieval ──────────────────────────────────────────────────────────────
def retrieve_chunks(question: str, top_k: int = _DEFAULT_TOP_K) -> List[Dict[str, Any]]:
    """Retrieve top-K chunks via hybrid semantic + vector search.

    Uses the index's *integrated vectorizer* — the Search service embeds the
    query text server-side, so no client-side embedding call is required.
    Semantic ranking is applied via
    ``AZURE_SEARCH_SEMANTIC_CONFIGURATION`` (default:
    ``rag-1788923016782-semantic-configuration``).

    Parameters
    ----------
    question : str
        The user's natural-language question. Whitespace-only questions are
        rejected.
    top_k : int, optional
        Maximum number of chunks to return after dedup. Defaults to 5.

    Returns
    -------
    list[dict]
        Each entry is ``{"chunk_id", "parent_id", "title", "chunk"}``.
        Empty chunks and chunks whose normalised content matches an
        earlier chunk are removed.
    """
    if not question or not question.strip():
        raise RagValidationError('question must not be empty')
    if top_k < 1 or top_k > 50:
        raise RagValidationError('top_k must be between 1 and 50')

    client = _get_search_client()
    semantic_config = (
        os.environ.get('AZURE_SEARCH_SEMANTIC_CONFIGURATION')
        or _SEMANTIC_CONFIG_DEFAULT
    )
    vector_field = os.environ.get('AZURE_SEARCH_VECTOR_FIELD') or _VECTOR_FIELD

    vector_query = VectorizableTextQuery(
        text=question,
        k_nearest_neighbors=max(top_k * 2, 8),
        fields=vector_field,
    )

    try:
        results = client.search(
            search_text=question,
            vector_queries=[vector_query],
            query_type=QueryType.SEMANTIC,
            semantic_configuration_name=semantic_config,
            select=_SELECT_FIELDS,
            top=top_k,
        )
        raw = list(results)
    except ClientAuthenticationError:
        logger.error('rag.search: authentication failed')
        raise RagServiceError('Azure AI Search authentication failed.') from None
    except ServiceRequestError:
        logger.warning('rag.search: service request error')
        raise RagServiceError('Could not reach Azure AI Search.') from None
    except HttpResponseError as e:
        logger.warning(
            'rag.search: http error status=%s', getattr(e, 'status_code', '?'),
        )
        raise RagServiceError('Azure AI Search request failed.') from None

    chunks: List[Dict[str, Any]] = []
    seen: set = set()
    for doc in raw:
        content = (doc.get('chunk') or '').strip()
        if not content:
            continue
        # Dedup by normalised prefix — cheap and catches near-duplicates.
        key = ' '.join(content.split()).lower()[:512]
        if key in seen:
            continue
        seen.add(key)
        chunks.append({
            'chunk_id': doc.get('chunk_id') or '',
            'parent_id': doc.get('parent_id') or '',
            'title': doc.get('title') or '',
            'chunk': content,
        })
        if len(chunks) >= top_k:
            break

    logger.info('rag.search: question_len=%d returned=%d', len(question), len(chunks))
    return chunks


# ── Context builder ────────────────────────────────────────────────────────
def build_context(chunks: List[Dict[str, Any]]) -> str:
    """Render retrieved chunks in a stable ``[Source N]`` format.

    Format
    ------
        [Source 1]
        File: <title>
        Content:
        <chunk text>

        [Source 2]
        ...
    """
    parts: List[str] = []
    for i, ch in enumerate(chunks, 1):
        title = (ch.get('title') or 'Untitled').strip() or 'Untitled'
        parts.append(f'[Source {i}]')
        parts.append(f'File: {title}')
        parts.append('Content:')
        parts.append((ch.get('chunk') or '').strip())
        parts.append('')  # blank line separator
    return '\n'.join(parts).rstrip()


# ── Orchestrator ───────────────────────────────────────────────────────────
def answer_with_rag(question: str) -> Dict[str, Any]:
    """Retrieve chunks, build context, ask Claude for a grounded answer.

    Returns
    -------
    dict
        ``{"answer": str, "sources": [{"title": str, "parent_id": str}, ...]}``.
        When retrieval returns no chunks, Claude is not called; a fixed
        no-results message is returned with an empty ``sources`` list.
    """
    q = _normalise_question(question)
    top_k = _read_int_env('TOP_K_RESULTS', _DEFAULT_TOP_K, 1, 50)

    chunks = retrieve_chunks(q, top_k=top_k)
    if not chunks:
        logger.info('rag.answer: no results — skipping Claude')
        return {'answer': _NO_RESULTS_ANSWER, 'sources': []}

    context = build_context(chunks)
    user_prompt = (
        'Retrieved Sherlock document context follows. Use it as the ONLY '
        'source of truth.\n\n'
        f'{context}\n\n'
        'Question:\n'
        f'{q}'
    )

    temperature = _read_float_env('TEMPERATURE', _DEFAULT_TEMPERATURE, 0.0, 1.0)
    max_tokens = _read_int_env('MAX_TOKENS', _DEFAULT_MAX_TOKENS, 64, 8192)
    model = os.environ.get('ANTHROPIC_FOUNDRY_MODEL', _DEFAULT_CLAUDE_MODEL)

    answer_text = _call_claude(
        client=_get_claude_client(),
        model=model,
        user_prompt=user_prompt,
        temperature=temperature,
        max_tokens=max_tokens,
    )

    sources = [
        {
            'title': ch.get('title') or 'Untitled',
            'parent_id': ch.get('parent_id') or '',
        }
        for ch in chunks
    ]
    return {'answer': answer_text, 'sources': sources}


# ── Streaming variant for SSE ─────────────────────────────────────────────
def stream_answer_with_rag(question: str) -> Iterator[Dict[str, Any]]:
    """Same as :func:`answer_with_rag` but yields incremental event dicts.

    Event shapes (in order):
        {'type': 'sources', 'sources': [...]}   — always first
        {'type': 'delta',   'text': '...'}      — one per streamed chunk
        {'type': 'done'}                        — terminal on success
        {'type': 'error',   'error': '<msg>'}   — terminal on failure

    Validation errors are raised BEFORE any event so the HTTP route can
    return a proper 4xx status. Anything that goes wrong once we've started
    streaming is surfaced as an ``error`` event (never re-raised) so the
    client sees a clean end-of-stream instead of a torn socket.
    """
    q = _normalise_question(question)
    top_k = _read_int_env('TOP_K_RESULTS', _DEFAULT_TOP_K, 1, 50)

    chunks = retrieve_chunks(q, top_k=top_k)
    sources = [
        {
            'title': ch.get('title') or 'Untitled',
            'parent_id': ch.get('parent_id') or '',
        }
        for ch in chunks
    ]
    yield {'type': 'sources', 'sources': sources}

    if not chunks:
        logger.info('rag.stream: no results — skipping Claude')
        yield {'type': 'delta', 'text': _NO_RESULTS_ANSWER}
        yield {'type': 'done'}
        return

    context = build_context(chunks)
    user_prompt = (
        'Retrieved Sherlock document context follows. Use it as the ONLY '
        'source of truth.\n\n'
        f'{context}\n\n'
        'Question:\n'
        f'{q}'
    )
    temperature = _read_float_env('TEMPERATURE', _DEFAULT_TEMPERATURE, 0.0, 1.0)
    max_tokens = _read_int_env('MAX_TOKENS', _DEFAULT_MAX_TOKENS, 64, 8192)
    model = os.environ.get('ANTHROPIC_FOUNDRY_MODEL', _DEFAULT_CLAUDE_MODEL)

    try:
        for delta in _stream_claude_deltas(
            client=_get_claude_client(),
            model=model,
            user_prompt=user_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
            system=_SYSTEM_PROMPT,
        ):
            if delta:
                yield {'type': 'delta', 'text': delta}
        yield {'type': 'done'}
    except RagServiceError as e:
        yield {'type': 'error', 'error': str(e)}
    except Exception as e:                                            # noqa: BLE001
        logger.exception('rag.stream: unexpected error (%s)', type(e).__name__)
        yield {'type': 'error', 'error': 'The chat service failed to answer this question.'}


# ── Prospect-aware streaming with conflict tool use ────────────────────────
def stream_with_conflict_tools(question: str, prospect_name: str) -> Iterator[Dict[str, Any]]:
    """Like stream_answer_with_rag but with conflict resolution tools enabled.

    Runs an agentic loop (max 4 turns): retrieves RAG context, calls Claude
    with GET_CONFLICTS / RESOLVE_CONFLICT tools, dispatches any tool calls,
    and yields events in the same shapes as stream_answer_with_rag plus:
        {'type': 'conflicts', 'conflicts': [...]}  — emitted after get_conflicts
    """
    q = _normalise_question(question)
    top_k = _read_int_env('TOP_K_RESULTS', _DEFAULT_TOP_K, 1, 50)

    chunks = retrieve_chunks(q, top_k=top_k)
    sources = [
        {'title': ch.get('title') or 'Untitled', 'parent_id': ch.get('parent_id') or ''}
        for ch in chunks
    ]
    yield {'type': 'sources', 'sources': sources}

    context = build_context(chunks) if chunks else ''
    system_prompt = (
        _SYSTEM_PROMPT
        + f"\n\nYou also have access to tools to retrieve and resolve data conflicts for "
          f"the prospect '{prospect_name}'. "
          "When the user asks about conflicts, contradictions, or inconsistent data, "
          "call get_conflicts to fetch the list. "
          "When the user clearly indicates which conflicting value to keep "
          "(e.g. 'keep $100M', 'use the first value'), call resolve_conflict with "
          "the conflict_id and chosen_value. Always confirm what was resolved."
    )

    if context:
        user_content = (
            'Retrieved Sherlock document context follows. Use it as the ONLY '
            'source of truth.\n\n'
            f'{context}\n\n'
            'Question:\n'
            f'{q}'
        )
    else:
        user_content = f'Question:\n{q}'

    messages: List[Dict[str, Any]] = [{'role': 'user', 'content': user_content}]
    model = os.environ.get('ANTHROPIC_FOUNDRY_MODEL', _DEFAULT_CLAUDE_MODEL)
    max_tokens = _read_int_env('MAX_TOKENS', _DEFAULT_MAX_TOKENS, 64, 8192)
    client = _get_claude_client()

    for _turn in range(4):
        try:
            with client.messages.stream(
                model=model,
                system=system_prompt,
                messages=messages,
                tools=[_GET_CONFLICTS_TOOL, _RESOLVE_CONFLICT_TOOL],
                max_tokens=max_tokens,
            ) as stream:
                for text in stream.text_stream:
                    if text:
                        yield {'type': 'delta', 'text': text}
                final = stream.get_final_message()
        except Exception:
            logger.exception('stream_with_conflict_tools: Claude error turn=%d', _turn)
            yield {'type': 'error', 'error': 'The chat service failed to answer this question.'}
            return

        if final.stop_reason in ('end_turn', None):
            yield {'type': 'done'}
            return

        if final.stop_reason != 'tool_use':
            yield {'type': 'done'}
            return

        # Build assistant turn and collect tool results
        assistant_blocks: List[Dict[str, Any]] = []
        tool_results: List[Dict[str, Any]] = []

        for block in final.content:
            btype = getattr(block, 'type', None)
            if btype == 'text':
                assistant_blocks.append({'type': 'text', 'text': block.text})
            elif btype == 'tool_use':
                assistant_blocks.append({
                    'type': 'tool_use',
                    'id': block.id,
                    'name': block.name,
                    'input': block.input,
                })
                result_str = _dispatch_tool(block.name, block.input, prospect_name)
                tool_results.append({
                    'type': 'tool_result',
                    'tool_use_id': block.id,
                    'content': result_str,
                })
                if block.name == 'get_conflicts':
                    try:
                        yield {'type': 'conflicts', 'conflicts': json.loads(result_str).get('conflicts', [])}
                    except Exception:
                        pass

        messages.append({'role': 'assistant', 'content': assistant_blocks})
        messages.append({'role': 'user', 'content': tool_results})

    yield {'type': 'done'}


def _stream_claude_deltas(
    *,
    client: Any,
    model: str,
    user_prompt: str,
    temperature: float,
    max_tokens: int,
    system: str,
) -> Iterator[str]:
    """Yield text deltas from Claude with the same error mapping and
    temperature-cache retry logic as :func:`_call_claude`."""
    from anthropic import (
        APIConnectionError,
        APIStatusError,
        APITimeoutError,
        AuthenticationError,
        BadRequestError,
        RateLimitError,
    )

    base_kwargs: Dict[str, Any] = {
        'model': model,
        'system': system,
        'messages': [{'role': 'user', 'content': user_prompt}],
        'max_tokens': max_tokens,
    }
    kwargs = dict(base_kwargs)
    if temperature is not None and model not in _temperature_unsupported_models:
        kwargs['temperature'] = temperature

    def _open_stream(call_kwargs: Dict[str, Any]):
        return client.messages.stream(**call_kwargs)

    def _run(call_kwargs: Dict[str, Any]) -> Iterator[str]:
        try:
            with _open_stream(call_kwargs) as stream:
                for delta in stream.text_stream:
                    yield delta
        except BadRequestError:
            raise
        except APITimeoutError as e:
            logger.warning('rag.stream.llm: timed out (%s)', str(e)[:200])
            raise RagServiceError('Claude request timed out — please try again.') from None
        except AuthenticationError:
            logger.error('rag.stream.llm: auth failed')
            raise RagServiceError('Claude authentication failed.') from None
        except RateLimitError:
            logger.warning('rag.stream.llm: rate limited')
            raise RagServiceError('Claude rate limit exceeded — try again shortly.') from None
        except APIConnectionError:
            logger.warning('rag.stream.llm: connection error')
            raise RagServiceError('Could not reach Claude.') from None
        except APIStatusError as se:
            logger.warning('rag.stream.llm: status error status=%s',
                           getattr(se, 'status_code', '?'))
            raise RagServiceError('Claude returned an error.') from None

    try:
        yield from _run(kwargs)
    except BadRequestError as e:
        detail = str(e).lower()
        if 'temperature' in kwargs and 'temperature' in detail and 'deprecated' in detail:
            _temperature_unsupported_models.add(model)
            logger.info('rag.stream.llm: temperature deprecated for %s — caching + retrying without',
                        model)
            kwargs.pop('temperature', None)
            yield from _run(kwargs)
        else:
            logger.warning('rag.stream.llm: bad request: %s', str(e)[:200])
            raise RagServiceError('Claude rejected the request.') from None


def _sse_pack(event_name: str, data_json: str) -> str:
    """Format one SSE frame. ``data_json`` must be a single-line JSON string."""
    return f'event: {event_name}\ndata: {data_json}\n\n'


def _call_claude(
    *,
    client: Any,
    model: str,
    user_prompt: str,
    temperature: float,
    max_tokens: int,
    system: str = _SYSTEM_PROMPT,
) -> str:
    """Wrap the Anthropic messages.create call with typed error mapping.

    Some Claude Foundry model deployments (e.g. ``claude-opus-4-7`` reasoning
    models) reject the ``temperature`` parameter with
    ``BadRequestError('temperature is deprecated for this model')``. The
    first time we see that we remember the model and skip ``temperature`` on
    every subsequent call — the previous transparent-retry path is kept as a
    safety net but should no longer fire in steady state.
    """
    from anthropic import (
        APIConnectionError,
        APIStatusError,
        APITimeoutError,
        AuthenticationError,
        BadRequestError,
        RateLimitError,
    )

    base_kwargs: Dict[str, Any] = {
        'model': model,
        'system': system,
        'messages': [{'role': 'user', 'content': user_prompt}],
        'max_tokens': max_tokens,
    }
    kwargs = dict(base_kwargs)
    # Only include ``temperature`` if the model hasn't already told us it
    # doesn't accept it. Saves one guaranteed-to-fail round-trip per request.
    if temperature is not None and model not in _temperature_unsupported_models:
        kwargs['temperature'] = temperature

    def _do_call(call_kwargs: Dict[str, Any]):
        """Invoke Claude via the streaming API and collect the full response.

        Non-streaming ``messages.create`` reliably times out on
        ``claude-opus-4-7`` (a reasoning model that can take 60-120 s to
        produce a full answer). Anthropic's own docs recommend the streaming
        API for any long-running request — the persistent connection carries
        server-side keepalive frames that stop the client from timing out
        even when the model is deep in thought. We collect all deltas and
        return the assembled text so callers see the same shape as before.

        ``BadRequestError`` is intentionally NOT caught here so the outer
        handler can inspect the message and decide whether to retry without
        ``temperature``. Everything else is mapped to a safe user-visible
        ``RagServiceError``.
        """
        try:
            text_parts: List[str] = []
            with client.messages.stream(**call_kwargs) as stream:
                for delta in stream.text_stream:
                    text_parts.append(delta)
                final = stream.get_final_message()
            full_text = ''.join(text_parts)
            # Return a response-shaped object so the caller can keep using
            # ``response.content[*].text``. We synthesise one text block from
            # the streamed deltas so downstream text extraction still works.
            from types import SimpleNamespace
            return SimpleNamespace(
                content=[SimpleNamespace(text=full_text)],
                _final=final,
            )
        except BadRequestError:
            # Let the caller decide what to do (may retry without temperature).
            raise
        except APITimeoutError as e:
            logger.warning('rag.llm: request timed out (%s)', str(e)[:200])
            raise RagServiceError(
                'Claude request timed out — please try again.',
            ) from None
        except AuthenticationError:
            logger.error('rag.llm: authentication failed')
            raise RagServiceError('Claude authentication failed.') from None
        except RateLimitError:
            logger.warning('rag.llm: rate limited')
            raise RagServiceError(
                'Claude rate limit exceeded — try again shortly.',
            ) from None
        except APIConnectionError:
            logger.warning('rag.llm: connection error')
            raise RagServiceError('Could not reach Claude.') from None
        except APIStatusError as se:
            body_snippet = ''
            try:
                body_snippet = (se.response.text if hasattr(se, 'response') else '')[:300]
            except Exception:                                         # noqa: BLE001
                pass
            logger.warning(
                'rag.llm: status error status=%s body=%s',
                getattr(se, 'status_code', '?'), body_snippet,
            )
            raise RagServiceError('Claude returned an error.') from None

    try:
        response = _do_call(kwargs)
    except BadRequestError as e:
        detail = str(e).lower()
        if 'temperature' in kwargs and 'temperature' in detail and 'deprecated' in detail:
            # First time this model has rejected temperature. Remember it so
            # every subsequent request skips the knob outright, and retry
            # this one without it.
            _temperature_unsupported_models.add(model)
            logger.info(
                'rag.llm: temperature deprecated for %s — caching + retrying without',
                model,
            )
            kwargs.pop('temperature', None)
            response = _do_call(kwargs)
        else:
            logger.warning('rag.llm: bad request: %s', str(e)[:200])
            raise RagServiceError('Claude rejected the request.') from None
    except RagServiceError:
        # Already logged + mapped inside _do_call — propagate unchanged.
        raise
    except Exception as e:                                            # noqa: BLE001
        logger.exception('rag.llm: unexpected error (%s)', type(e).__name__)
        raise RagServiceError('Claude request failed.') from None

    if not response.content:
        raise RagServiceError('Claude returned an empty response.')
    text = '\n'.join(
        b.text for b in response.content if getattr(b, 'text', None)
    ).strip()
    if not text:
        raise RagServiceError('Claude returned no text content.')
    return text


# ── Greeting generation ────────────────────────────────────────────────────
def generate_greeting() -> str:
    """Ask Claude for a fresh, short, varied opening greeting.

    No retrieval is performed — this is a pure Claude call. Returns a single
    conversational opener suitable for seeding the chat widget the first time
    it is opened by a signed-in user.

    A modest temperature (0.9) is requested to encourage variety across
    calls; if the deployed model rejects ``temperature`` the shared
    :func:`_call_claude` helper transparently retries without it.
    """
    client = _get_claude_client()
    model = os.environ.get('ANTHROPIC_FOUNDRY_MODEL', _DEFAULT_CLAUDE_MODEL)
    text = _call_claude(
        client=client,
        model=model,
        user_prompt='Generate a fresh greeting now.',
        temperature=0.9,
        max_tokens=120,
        system=_GREETING_SYSTEM_PROMPT,
    )
    # Some models wrap short outputs in stray quotes — strip once, safely.
    return text.strip().strip('"').strip("'").strip()


# ── Flask route registration ───────────────────────────────────────────────
def register_routes(app) -> None:
    """Register the RAG chat blueprint on ``app``.

    Adds a single endpoint::

        POST /api/rag/chat          (requires an authenticated session)

    Request body (JSON): ``{"question": "..."}``.
    Response body (JSON): ``{"answer": str, "sources": [{title, parent_id}]}``
    plus ``success`` and ``request_id`` fields.
    """
    import auth as auth_module
    require_auth = auth_module.require_auth

    @app.get('/api/rag/greeting')
    @require_auth
    def rag_greeting():                                               # noqa: D401
        """Return a freshly-generated assistant greeting.

        Used by the chat widget to seed a friendly opener the first time it
        opens. On any upstream failure a short static fallback is returned
        (still HTTP 200) so the widget never has to render an error just to
        say hello.
        """
        req_id = uuid.uuid4().hex[:12]
        try:
            greeting = generate_greeting()
            logger.info('rag.greeting req_id=%s status=ok', req_id)
            return jsonify({
                'success': True,
                'greeting': greeting,
                'request_id': req_id,
            }), 200
        except RagConfigurationError as e:
            logger.warning('rag.greeting req_id=%s config_error=%s', req_id, e)
            return jsonify({
                'success': True,
                'greeting': _GREETING_FALLBACK,
                'fallback': True,
                'request_id': req_id,
            }), 200
        except RagServiceError as e:
            logger.warning('rag.greeting req_id=%s upstream_error=%s', req_id, e)
            return jsonify({
                'success': True,
                'greeting': _GREETING_FALLBACK,
                'fallback': True,
                'request_id': req_id,
            }), 200
        except Exception:                                             # noqa: BLE001
            logger.exception('rag.greeting req_id=%s unexpected_error', req_id)
            return jsonify({
                'success': True,
                'greeting': _GREETING_FALLBACK,
                'fallback': True,
                'request_id': req_id,
            }), 200

    @app.post('/api/rag/chat')
    @require_auth
    def rag_chat():                                                   # noqa: D401
        req_id = uuid.uuid4().hex[:12]
        body = request.get_json(silent=True) or {}
        question = body.get('question')

        try:
            result = answer_with_rag(question)
        except RagValidationError as e:
            return jsonify({
                'success': False,
                'error': str(e),
                'request_id': req_id,
            }), 400
        except RagConfigurationError as e:
            logger.warning('rag.chat req_id=%s config_error=%s', req_id, e)
            return jsonify({
                'success': False,
                'error': 'RAG chat is not configured on this server.',
                'request_id': req_id,
            }), 503
        except RagServiceError as e:
            logger.warning('rag.chat req_id=%s upstream_error=%s', req_id, e)
            return jsonify({
                'success': False,
                'error': str(e),
                'request_id': req_id,
            }), 502
        except Exception:                                             # noqa: BLE001
            logger.exception('rag.chat req_id=%s unexpected_error', req_id)
            return jsonify({
                'success': False,
                'error': 'The chat service failed to answer this question.',
                'request_id': req_id,
            }), 500

        logger.info(
            'rag.chat req_id=%s sources=%d status=ok',
            req_id, len(result.get('sources', [])),
        )
        return jsonify({
            'success': True,
            'answer': result['answer'],
            'sources': result['sources'],
            'request_id': req_id,
        }), 200

    @app.post('/api/rag/chat/stream')
    @require_auth
    def rag_chat_stream():                                            # noqa: D401
        """SSE variant of ``/api/rag/chat`` — streams tokens as they arrive.

        Validation / config / search errors fail *before* streaming begins
        and return a normal JSON body with the appropriate 4xx/5xx status.
        Once the SSE stream is open (HTTP 200), upstream Claude failures
        surface as ``event: error`` frames so the browser sees a clean
        end-of-stream instead of a torn socket.
        """
        req_id = uuid.uuid4().hex[:12]
        body = request.get_json(silent=True) or {}
        question = body.get('question')
        prospect_name = _safe_prospect_name(body.get('prospect_name') or '')
        logger.info('rag.chat.stream req_id=%s prospect_name=%r body_keys=%s',
                    req_id, prospect_name, list(body.keys()))

        # Validate up-front so bad requests get a real HTTP status.
        try:
            _normalise_question(question)
        except RagValidationError as e:
            return jsonify({
                'success': False,
                'error': str(e),
                'request_id': req_id,
            }), 400

        # Do the cheap upstream-config checks before we commit to SSE.
        try:
            _get_search_client()
            _get_claude_client()
        except RagConfigurationError as e:
            logger.warning('rag.chat.stream req_id=%s config_error=%s', req_id, e)
            return jsonify({
                'success': False,
                'error': 'RAG chat is not configured on this server.',
                'request_id': req_id,
            }), 503

        def generate():
            sources_count = 0
            try:
                stream_gen = (
                    stream_with_conflict_tools(question, prospect_name)
                    if prospect_name
                    else stream_answer_with_rag(question)
                )
                for event in stream_gen:
                    etype = event['type']
                    if etype == 'sources':
                        sources_count = len(event.get('sources', []))
                        yield _sse_pack('sources', json.dumps(
                            {'sources': event.get('sources', [])}
                        ))
                    elif etype == 'delta':
                        yield _sse_pack('delta', json.dumps(
                            {'text': event.get('text', '')}
                        ))
                    elif etype == 'conflicts':
                        yield _sse_pack('conflicts', json.dumps(
                            {'conflicts': event.get('conflicts', [])}
                        ))
                    elif etype == 'done':
                        yield _sse_pack('done', json.dumps(
                            {'request_id': req_id}
                        ))
                    elif etype == 'error':
                        yield _sse_pack('error', json.dumps({
                            'error': event.get('error', 'Chat failed.'),
                            'request_id': req_id,
                        }))
            except GeneratorExit:
                # Client disconnected — the underlying `with` block in
                # stream_answer_with_rag closes the Anthropic stream.
                logger.info('rag.chat.stream req_id=%s client_disconnected', req_id)
                raise
            except Exception:                                         # noqa: BLE001
                logger.exception('rag.chat.stream req_id=%s unexpected', req_id)
                yield _sse_pack('error', json.dumps({
                    'error': 'The chat service failed to answer this question.',
                    'request_id': req_id,
                }))
            finally:
                logger.info(
                    'rag.chat.stream req_id=%s sources=%d status=closed',
                    req_id, sources_count,
                )

        headers = {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
            'Connection': 'keep-alive',
        }
        return Response(stream_with_context(generate()), headers=headers)


# ── Internal helpers ───────────────────────────────────────────────────────
def _normalise_question(q: Optional[str]) -> str:
    if q is None:
        raise RagValidationError('question is required')
    s = _CONTROL_RE.sub('', str(q)).strip()
    if not s:
        raise RagValidationError('question must not be empty')
    if len(s) > _MAX_QUESTION_LEN:
        raise RagValidationError(f'question exceeds {_MAX_QUESTION_LEN} characters')
    return s


def _read_int_env(name: str, default: int, min_v: int, max_v: int) -> int:
    raw = os.environ.get(name)
    if not raw:
        return default
    try:
        v = int(raw)
    except ValueError:
        return default
    return max(min_v, min(max_v, v))


def _read_float_env(name: str, default: float, min_v: float, max_v: float) -> float:
    raw = os.environ.get(name)
    if not raw:
        return default
    try:
        v = float(raw)
    except ValueError:
        return default
    return max(min_v, min(max_v, v))


def reset_singletons_for_tests() -> None:
    """Testing hook — clears the lazy client singletons + per-model caches."""
    global _search_client, _claude_client
    with _singleton_lock:
        _search_client = None
        _claude_client = None
        _temperature_unsupported_models.clear()
