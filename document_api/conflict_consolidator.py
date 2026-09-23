"""Deduplicates merged master_data content and flags genuine data conflicts.

Called from process_pipeline() after gap_fill, before bullet normalization.
Uses Claude tool use (forced) to get structured per-field results. Non-fatal —
any failure returns master_data unchanged so the pipeline always completes.
"""

from __future__ import annotations

import copy
import logging
import os
import uuid
from typing import Any, Dict, List, Tuple

logger = logging.getLogger('sherlock-web.conflict')

# ── Tool definition ───────────────────────────────────────────────────────────
_CONSOLIDATE_TOOL = {
    "name": "consolidate_section",
    "description": (
        "Return a cleaned version of each field in the section. "
        "For each field: remove exact or near-exact duplicate statements that say "
        "the same thing in different words. Where two statements are genuinely "
        "contradictory (e.g. different numeric values, dates, or factual claims "
        "for the same attribute), keep BOTH in cleaned_content separated by a "
        "newline, and record the contradiction in the conflicts list. "
        "Paraphrased repetitions should be silently merged — no conflict entry."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "fields": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "field_name": {
                            "type": "string",
                            "description": "Exact field name as provided."
                        },
                        "cleaned_content": {
                            "type": "string",
                            "description": (
                                "Deduplicated content. Keep ALL unique facts. "
                                "Preserve bullet format if present."
                            )
                        },
                        "conflicts": {
                            "type": "array",
                            "description": "Only genuine contradictions — omit paraphrases.",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "value_a": {
                                        "type": "string",
                                        "description": "First conflicting value (verbatim, brief)."
                                    },
                                    "value_b": {
                                        "type": "string",
                                        "description": "Second conflicting value (verbatim, brief)."
                                    },
                                    "description": {
                                        "type": "string",
                                        "description": "One-sentence plain-English explanation."
                                    }
                                },
                                "required": ["value_a", "value_b", "description"]
                            }
                        }
                    },
                    "required": ["field_name", "cleaned_content", "conflicts"]
                }
            }
        },
        "required": ["fields"]
    }
}


# ── Client factory ────────────────────────────────────────────────────────────
def _get_consolidation_client() -> Tuple[Any, str]:
    """Return (AnthropicFoundry client, model). Raises ValueError if env vars missing."""
    from anthropic import AnthropicFoundry

    api_key = os.environ.get('ANTHROPIC_FOUNDRY_API_KEY')
    base_url = os.environ.get('ANTHROPIC_FOUNDRY_BASE_URL')
    model = os.environ.get('ANTHROPIC_FOUNDRY_MODEL', 'claude-opus-4-7')

    if not api_key or not base_url:
        missing = [n for n, v in [('ANTHROPIC_FOUNDRY_API_KEY', api_key),
                                   ('ANTHROPIC_FOUNDRY_BASE_URL', base_url)] if not v]
        raise ValueError(f"Missing env vars: {', '.join(missing)}")

    # anthropic>=0.121 errors if ANTHROPIC_FOUNDRY_RESOURCE conflicts with base_url
    os.environ.pop('ANTHROPIC_FOUNDRY_RESOURCE', None)

    client = AnthropicFoundry(api_key=api_key, base_url=base_url)
    return client, model


# ── Per-section consolidation ─────────────────────────────────────────────────
def consolidate_section(
    section_name: str,
    fields_dict: Dict[str, Any],
    client: Any,
    model: str,
) -> Dict[str, Dict]:
    """Ask Claude to deduplicate and flag conflicts for all fields in one section.

    Returns {field_name: {cleaned_content, conflicts: [{value_a, value_b, description}]}}.
    Returns {} on any failure (non-fatal).
    """
    # Only process fields that have non-empty string content with \n\n (merged indicator)
    candidates = {}
    for field_name, field_val in fields_dict.items():
        if not isinstance(field_val, dict):
            continue
        content = field_val.get('content', '')
        if not isinstance(content, str) or not content.strip():
            continue
        candidates[field_name] = content

    if not candidates:
        return {}

    field_blocks = []
    for fn, content in candidates.items():
        field_blocks.append(f"Field: {fn}\nContent:\n{content}")
    prompt = (
        f"Section: {section_name}\n\n"
        "The following fields contain content merged from multiple source documents. "
        "Deduplicate and flag genuine contradictions.\n\n"
        + "\n\n---\n\n".join(field_blocks)
    )

    try:
        response = client.messages.create(
            model=model,
            max_tokens=4096,
            tools=[_CONSOLIDATE_TOOL],
            tool_choice={"type": "tool", "name": "consolidate_section"},
            messages=[{"role": "user", "content": prompt}],
        )
        # The forced tool_use response always has content[0] as tool_use block
        tool_block = next(
            (b for b in response.content if getattr(b, 'type', None) == 'tool_use'),
            None,
        )
        if not tool_block:
            logger.warning('consolidate_section: no tool_use block for section=%s', section_name)
            return {}

        result = {}
        for item in tool_block.input.get('fields', []):
            fn = item.get('field_name', '')
            if fn in candidates:
                result[fn] = {
                    'cleaned_content': item.get('cleaned_content', candidates[fn]),
                    'conflicts': item.get('conflicts', []),
                }
        return result

    except Exception:
        logger.exception('consolidate_section failed for section=%s', section_name)
        return {}


# ── Master data entry point ───────────────────────────────────────────────────
def consolidate_master_data(master_data: dict) -> dict:
    """Deduplicate content and populate master_data['_conflicts'] across all sections.

    Non-fatal: returns master_data unchanged if Claude is unavailable or any
    section fails. Already-resolved conflicts are preserved across re-runs.
    """
    try:
        client, model = _get_consolidation_client()
    except ValueError as e:
        logger.warning('consolidate_master_data: skipping — %s', e)
        return master_data

    result = copy.deepcopy(master_data)
    all_new_conflicts: List[dict] = []

    for section_name, section_data in result.items():
        if section_name.startswith('_') or not isinstance(section_data, dict):
            continue
        # Also skip scalar top-level keys (prospect_name, client_name, etc.)
        if not any(isinstance(v, dict) for v in section_data.values()):
            continue

        try:
            consolidated = consolidate_section(section_name, section_data, client, model)
        except Exception:
            logger.exception('consolidate_master_data: section=%s failed, skipping', section_name)
            continue

        for field_name, field_result in consolidated.items():
            cleaned = field_result.get('cleaned_content', '')
            if cleaned and isinstance(section_data.get(field_name), dict):
                original = section_data[field_name].get('content', '')
                result[section_name][field_name]['content'] = cleaned

                for conflict in field_result.get('conflicts', []):
                    all_new_conflicts.append({
                        'id': uuid.uuid4().hex,
                        'section': section_name,
                        'field': field_name,
                        'original_content': original,
                        'value_a': conflict.get('value_a', ''),
                        'value_b': conflict.get('value_b', ''),
                        'description': conflict.get('description', ''),
                        'status': 'unresolved',
                    })

    # Preserve already-resolved conflicts from previous runs
    prior_resolved = [
        c for c in master_data.get('_conflicts', [])
        if c.get('status') == 'resolved'
    ]
    result['_conflicts'] = prior_resolved + all_new_conflicts

    logger.info(
        'consolidate_master_data: new_conflicts=%d, preserved_resolved=%d',
        len(all_new_conflicts), len(prior_resolved),
    )
    return result
