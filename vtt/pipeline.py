"""
vtt/pipeline.py — VTT/transcript → structured JSON pipeline.

This module contains the async LLM pipeline extracted from the standalone
Sherlock AI VTT service. It is called synchronously from Flask background
threads via run_vtt_pipeline() which wraps asyncio.run().

The DOCX-building step from the original standalone service is omitted here —
the Flask orchestrator in app.py uses document_api.render_docx() for that.
"""

import asyncio
import copy
import json
import logging
import os
import re

import httpx
from dotenv import load_dotenv

from .tools import (
    parse_vtt,
    parse_docx,
    chunk_text,
    get_extraction_system,
    get_synthesis_system,
    merge_chunk_results,
    safe_parse_json,
    _clean_transcript,
)

load_dotenv()
logger = logging.getLogger(__name__)

# ── Supported transcript extensions ────────────────────────────────────────────
VTT_SUPPORTED_EXTENSIONS = {'.vtt', '.txt', '.doc', '.md'}


def is_vtt_file(filename: str) -> bool:
    ext = os.path.splitext(filename.lower())[1]
    return ext in VTT_SUPPORTED_EXTENSIONS


# ── Content-filter sanitizer ───────────────────────────────────────────────────
_FILTER_RE = re.compile(
    r"\b(sex|sexy|naked|nude|porn|erotic|fetish|orgasm|cock|dick|"
    r"pussy|boob|breast|vagina|penis|anal|lesbian|intercourse)\b",
    re.IGNORECASE,
)


def _sanitize(text: str) -> str:
    return _FILTER_RE.sub("[REDACTED]", text)


# ── NTTHAI Claude client ───────────────────────────────────────────────────────
class NTTHAIClient:
    """
    Async wrapper around the NTTHAI API (OpenAI-compatible).
    Auth: Authorization: Bearer app:<api_id>:<api_secret>
    """
    _TIMEOUT = 300

    def __init__(self, api_id: str, api_secret: str, base_url: str, model: str):
        self.url = f"{base_url.rstrip('/')}/chat/completions"
        self.model = model
        self.headers = {
            "Authorization": f"Bearer app:{api_id}:{api_secret}",
            "Content-Type": "application/json",
        }

    async def chat(self, system: str, user: str, max_tokens: int = 8000) -> str:
        payload = {
            "model": self.model,
            "max_tokens": max_tokens,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
        last_exc: Exception | None = None

        for attempt in range(1, 5):
            try:
                async with httpx.AsyncClient(timeout=self._TIMEOUT) as http:
                    resp = await http.post(self.url, headers=self.headers, json=payload)

                if resp.status_code == 429:
                    wait = int(resp.headers.get("Retry-After", 15 * attempt))
                    logger.warning("NTTHAI 429 (attempt %d/4) — waiting %d s", attempt, wait)
                    await asyncio.sleep(wait)
                    last_exc = Exception(f"NTTHAI 429 (attempt {attempt})")
                    continue

                if resp.status_code in (500, 502, 503, 504):
                    wait = 5 * attempt
                    logger.warning("NTTHAI %d (attempt %d/4) — retrying in %d s", resp.status_code, attempt, wait)
                    await asyncio.sleep(wait)
                    last_exc = Exception(f"NTTHAI {resp.status_code} (attempt {attempt})")
                    continue

                if not resp.is_success:
                    err_body = resp.text[:1000]
                    logger.error("NTTHAI HTTP %d (attempt %d/4): %s", resp.status_code, attempt, err_body)
                    resp.raise_for_status()

                data = resp.json()
                choices = data.get("choices", [])
                if not choices:
                    logger.warning("NTTHAI returned no choices (attempt %d/4): %s", attempt, str(data)[:300])
                    last_exc = Exception("NTTHAI returned empty choices")
                    await asyncio.sleep(5 * attempt)
                    continue

                text = choices[0].get("message", {}).get("content", "")
                if not text:
                    logger.warning("NTTHAI empty content (attempt %d/4)", attempt)
                    last_exc = Exception("NTTHAI returned empty content")
                    await asyncio.sleep(5 * attempt)
                    continue

                return text

            except httpx.TimeoutException as exc:
                wait = 10 * attempt
                logger.warning("NTTHAI TIMEOUT (attempt %d/4) — retrying in %d s", attempt, wait)
                last_exc = exc
                await asyncio.sleep(wait)

            except (httpx.ConnectError, httpx.ConnectTimeout) as exc:
                logger.error("NTTHAI unreachable (DNS/connect): %s", exc)
                raise RuntimeError(
                    f"Cannot reach NTTHAI API ({self.url}). "
                    "Check your internet connection."
                ) from exc

            except httpx.RequestError as exc:
                wait = 5 * attempt
                logger.warning("NTTHAI network error (attempt %d/4) %s: %s — retrying in %d s",
                               attempt, type(exc).__name__, exc, wait)
                last_exc = exc
                await asyncio.sleep(wait)

        raise last_exc or Exception("NTTHAI chat failed after 4 attempts")


def _get_client() -> NTTHAIClient:
    ntthai_id = os.getenv("NTTHAI_API_ID", "")
    ntthai_secret = os.getenv("NTTHAI_API_SECRET", "")
    ntthai_url = os.getenv("NTTHAI_BASE_URL", "https://api.ntthai.ai/v1")
    ntthai_model = os.getenv("NTTHAI_MODEL", "claude-sonnet-4-5")

    if not ntthai_id or not ntthai_secret:
        raise RuntimeError("NTTHAI Claude not configured. Set NTTHAI_API_ID + NTTHAI_API_SECRET in .env")

    return NTTHAIClient(ntthai_id, ntthai_secret, ntthai_url, ntthai_model)


# ── File parsing ───────────────────────────────────────────────────────────────
async def _extract_text(filename: str, raw: bytes) -> str:
    fname = filename.lower()
    if fname.endswith(".vtt"):
        return parse_vtt.invoke({"content": raw.decode("utf-8", errors="replace")})
    if fname.endswith(".docx"):
        return parse_docx.invoke({"file_bytes_hex": raw.hex()})
    if fname.endswith((".txt", ".doc", ".md")):
        return _clean_transcript(raw.decode("utf-8", errors="replace"))
    return raw.decode("utf-8", errors="replace")


# ── LLM call helpers ───────────────────────────────────────────────────────────
async def _extract_chunk(client: NTTHAIClient, chunk: str, idx: int, total: int,
                         bullet_points: bool = False) -> dict:
    system = get_extraction_system(bullet_points)

    def _prompt(c: str) -> str:
        return (
            f"This is chunk {idx + 1} of {total} from the uploaded transcript(s).\n"
            f"Extract all relevant information:\n\n{c}"
        )

    async def _call(prompt: str) -> dict:
        text = await client.chat(system, prompt, max_tokens=4000)
        if not text or not text.strip():
            return {}
        result = safe_parse_json(text)
        if not result:
            logger.warning("Chunk %d/%d — JSON parse failed. Preview: %.200s", idx + 1, total, text)
        return result or {}

    try:
        return await _call(_prompt(chunk))
    except RuntimeError:
        raise
    except Exception as exc:
        exc_str = str(exc)
        if "content_filter" in exc_str or "ResponsibleAIPolicyViolation" in exc_str:
            logger.warning("Chunk %d/%d — content_filter. Retrying sanitized…", idx + 1, total)
            try:
                result = await _call(_prompt(_sanitize(chunk)))
                if result:
                    logger.info("Chunk %d/%d — sanitized retry succeeded", idx + 1, total)
                return result
            except Exception as retry_exc:
                logger.warning("Chunk %d/%d — sanitized retry failed: %s", idx + 1, total, retry_exc)
                return {}
        logger.warning("Chunk %d/%d — %s: %s — skipping", idx + 1, total, type(exc).__name__, exc_str or "(no message)")
        return {}


async def _synthesize(client: NTTHAIClient, merged: dict, bullet_points: bool = False) -> dict:
    merged_json = json.dumps(merged, indent=2)
    if len(merged_json) > 80_000:
        logger.warning("Merged data too large for synthesis (%d chars) — skipping", len(merged_json))
        return merged
    prompt = "Synthesize this merged transcript data into clean professional summaries:\n" + merged_json
    system = get_synthesis_system(bullet_points)
    text = await client.chat(system, prompt, max_tokens=8000)
    result = safe_parse_json(text)
    return result if result else merged


# ── Core async pipeline (no DOCX step — returns final_data dict) ──────────────
async def _run_pipeline_core(
    file_data: list[tuple[str, bytes]],
    prospect_name: str = "",
    bullet_points: bool = False,
) -> dict:
    """
    Async pipeline: parse files → chunk → extract → merge → synthesize.
    Returns the structured JSON dict (no DOCX generated here).
    Called via run_vtt_pipeline() which wraps asyncio.run().
    """
    # Step 1 — init client
    client = _get_client()
    label = "NTTHAI Claude"

    # Step 2 — parse uploaded files
    all_text_parts = []
    for filename, raw in file_data:
        try:
            text = await _extract_text(filename, raw)
            if text.strip():
                all_text_parts.append(f"=== FILE: {filename} ===\n{text}")
        except Exception as ex:
            logger.warning("Could not parse %s: %s", filename, ex)

    if not all_text_parts:
        raise RuntimeError("No readable content found in the uploaded files.")

    combined = "\n\n".join(all_text_parts)
    logger.info("VTT pipeline: extracted %d chars from %d file(s)", len(combined), len(file_data))

    # Step 3 — chunk
    chunks_json = chunk_text.invoke({"text": combined, "chunk_size": 24_000, "overlap": 400})
    chunks: list[str] = json.loads(chunks_json)
    logger.info("VTT pipeline: %d chunk(s), processing with %s…", len(chunks), label)

    # Step 4 — extract per chunk concurrently (semaphore = 3 at a time)
    sem = asyncio.Semaphore(3)

    async def _bounded_extract(i: int, chunk: str) -> dict:
        async with sem:
            return await _extract_chunk(client, chunk, i, len(chunks), bullet_points=bullet_points)

    chunk_results = await asyncio.gather(
        *[_bounded_extract(i, c) for i, c in enumerate(chunks)]
    )

    # Step 5 — merge
    merged = merge_chunk_results(list(chunk_results))

    # Step 6 — synthesize when more than one chunk
    final_data = merged
    if len(chunks) > 1:
        try:
            final_data = await _synthesize(client, merged, bullet_points=bullet_points)
        except Exception as ex:
            logger.warning("Synthesis failed (%s: %s) — using raw merge", type(ex).__name__, ex)
            final_data = merged

    if prospect_name:
        final_data["prospect_name"] = prospect_name

    logger.info("VTT pipeline complete for '%s'", prospect_name or "(unnamed)")
    return final_data


# ── Public sync entry point (called from Flask background threads) ─────────────
def run_vtt_pipeline(
    file_tuples: list[tuple[str, bytes]],
    prospect_name: str = "",
    bullet_points: bool = False,
) -> dict:
    """
    Sync wrapper: runs the async VTT pipeline in a new event loop.
    Safe to call from any Flask background thread.
    """
    return asyncio.run(_run_pipeline_core(file_tuples, prospect_name, bullet_points))


# ── Merge helper (replaces sherlock_vtt_client.merge_vtt_json_into_master) ─────
def merge_vtt_json_into_master(master: dict, vtt_json: dict) -> dict:
    """
    Merge Sherlock AI VTT output JSON into an existing master_data dict.
    Appends new content to existing content — never overwrites.
    """
    result = copy.deepcopy(master)

    for section, fields in vtt_json.items():
        if section in ('client_name', 'document_date'):
            if not result.get(section):
                result[section] = fields
            continue

        if not isinstance(fields, dict):
            continue

        if section not in result:
            result[section] = {}

        for field, value in fields.items():
            if isinstance(value, dict):
                new_content = value.get('content', '').strip()
            else:
                new_content = str(value).strip()

            if not new_content:
                continue

            existing = result[section].get(field, {})
            if isinstance(existing, dict):
                existing_content = existing.get('content', '').strip()
            else:
                existing_content = ''

            if existing_content:
                result[section][field] = {'content': existing_content + '\n\n' + new_content}
            else:
                result[section][field] = {'content': new_content}

    return result
