"""
Tavily web-search enrichment for Sherlock AI — gap-fill mode.

When the user enables the Internet Search toggle, we walk every field in
master_data, identify gaps (empty, very short, or marker phrases like
"N/A" / "Not discussed"), and fill each gap with a Tavily-synthesised
answer plus a couple of source citations. Fields with substantive
transcript-derived content — or with embedded image placeholders — are
left untouched so the original meeting context is preserved.
"""
import logging
import os
import re

import requests

log = logging.getLogger(__name__)

TAVILY_API_URL = "https://api.tavily.com/search"
TAVILY_API_KEY = os.environ.get("TAVILY_API_KEY", "").strip()

SKIP_SECTIONS = {"client_name", "document_date", "prospect_name",
                 "_internet_research_used"}

# When the user enables the Internet Search toggle, ONLY the
# Customer/Business Overview section (Section 1 of the discovery profile)
# is enriched. The other workstream sections (S2P, P2P, L2C, R2R, …) describe
# what was discussed in the meeting; web research adds noise there. Slugified
# match so we accept both "General Business Overview" (DOCX path) and
# "General_Business_Overview" (VTT path) as well as user-typed variants.
ENRICH_ONLY_SECTIONS = {
    "general_business_overview",
    "customer_business_overview",
    "customer_overview",
    "business_overview",
}

GAP_CHAR_THRESHOLD = 50
MAX_SEARCHES_PER_RUN = 40
MAX_SOURCES_IN_OUTPUT = 3
SEARCH_TIMEOUT = 20

NO_INFO_PATTERNS = [
    re.compile(r, re.IGNORECASE) for r in [
        r"^\s*n/?a\.?\s*$",
        r"^\s*none\.?\s*$",
        r"^\s*unknown\.?\s*$",
        r"^\s*not\s+(discussed|mentioned|provided|specified|available|applicable)\.?\s*$",
        r"^\s*no\s+(information|data|details)\s+(provided|available|given)?\.?\s*$",
        r"^\s*tbd\.?\s*$",
        r"^\s*-+\s*$",
    ]
]

# Acronym → expansion. Keeps the acronym in the query so Tavily matches both.
ACRONYM_EXPANSIONS = {
    "I2M": "Idea to Market",
    "S2P": "Source to Pay",
    "P2P": "Plan to Produce",
    "L2C": "Lead to Cash",
    "R2R": "Record to Report",
    "R2S": "Request to Service",
    "F2F": "Forecast to Fulfill",
    "D2C": "Detect to Correct",
    "A2D": "Acquire to Dispose",
    "H2R": "Hire to Retire",
    "ESG": "Environmental Social Governance",
    "WM": "Warehouse Management",
    "EWM": "Extended Warehouse Management",
    "SAP": "SAP",
}

# Discovery-meeting-specific fields where web research adds noise rather
# than signal — they describe what was said in the meeting, not facts
# about the company.
NON_FACTUAL_FIELDS = {
    "schedule_of_events",
    "pain_points",
    "major_gaps_and_integrations",
    "proposed_sap_solutions_mapping",
    "wishlist",
    "wish_list",
    "general_notes_and_wishlist",
    "meeting_notes",
    "action_items",
    "next_steps",
}


def _humanize(name):
    """Turn 'General_Business_Overview' / 'general-business-overview' into
    'General Business Overview' and expand known acronyms in place."""
    if not name:
        return ""
    text = re.sub(r"[_\-]+", " ", str(name)).strip()
    text = re.sub(r"\s+", " ", text)
    parts = []
    for token in text.split(" "):
        upper = token.upper().strip("()")
        if upper in ACRONYM_EXPANSIONS and ACRONYM_EXPANSIONS[upper] != upper:
            parts.append(f"{token} ({ACRONYM_EXPANSIONS[upper]})")
        else:
            parts.append(token)
    return " ".join(parts)


def _slugify(name):
    return re.sub(r"[^a-z0-9]+", "_", str(name).lower()).strip("_")


def _is_gap(content):
    if not content:
        return True
    text = content.strip()
    if len(text) < GAP_CHAR_THRESHOLD:
        return True
    for pat in NO_INFO_PATTERNS:
        if pat.match(text):
            return True
    return False


def _has_images(field_value):
    if not isinstance(field_value, dict):
        return False
    images = field_value.get("images")
    if isinstance(images, dict) and images:
        return True
    content = field_value.get("content") or ""
    return bool(re.search(r"\bIMAGE_[A-Z0-9_]+\b", content))


def _tavily_search(query):
    if not TAVILY_API_KEY:
        raise RuntimeError("TAVILY_API_KEY is not configured")
    payload = {
        "query": query,
        "search_depth": "advanced",
        "include_answer": True,
        "max_results": MAX_SOURCES_IN_OUTPUT,
    }
    headers = {
        "Authorization": f"Bearer {TAVILY_API_KEY}",
        "Content-Type": "application/json",
    }
    r = requests.post(TAVILY_API_URL, json=payload, headers=headers, timeout=SEARCH_TIMEOUT)
    r.raise_for_status()
    return r.json()


_MD_LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
_MD_BOLD_RE = re.compile(r"\*\*(.+?)\*\*", re.DOTALL)
_MD_BOLD_UNDERSCORE_RE = re.compile(r"__(.+?)__", re.DOTALL)
_MD_ITALIC_STAR_RE = re.compile(r"(?<!\w)\*(?!\s)(.+?)(?<!\s)\*(?!\w)", re.DOTALL)
_MD_ITALIC_UND_RE = re.compile(r"(?<!\w)_(?!\s)(.+?)(?<!\s)_(?!\w)", re.DOTALL)
_MD_INLINE_CODE_RE = re.compile(r"`([^`]+)`")
_MD_HEADING_RE = re.compile(r"^\s{0,3}#{1,6}\s+", re.MULTILINE)
_MD_BLOCKQUOTE_RE = re.compile(r"^\s*>\s?", re.MULTILINE)
_MD_LIST_BULLET_RE = re.compile(r"^\s*[-*+]\s+", re.MULTILINE)
_MD_LIST_NUM_RE = re.compile(r"^\s*\d+[.)]\s+", re.MULTILINE)
_BLANK_LINES_RE = re.compile(r"\n{3,}")
_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9“\"'])")


def _strip_markdown(text):
    """Remove common markdown so the Word doc shows clean prose."""
    if not text:
        return ""
    t = str(text)
    t = _MD_LINK_RE.sub(r"\1 (\2)", t)
    t = _MD_BOLD_RE.sub(r"\1", t)
    t = _MD_BOLD_UNDERSCORE_RE.sub(r"\1", t)
    t = _MD_ITALIC_STAR_RE.sub(r"\1", t)
    t = _MD_ITALIC_UND_RE.sub(r"\1", t)
    t = _MD_INLINE_CODE_RE.sub(r"\1", t)
    t = _MD_HEADING_RE.sub("", t)
    t = _MD_BLOCKQUOTE_RE.sub("", t)
    t = _MD_LIST_BULLET_RE.sub("", t)
    t = _MD_LIST_NUM_RE.sub("", t)
    t = _BLANK_LINES_RE.sub("\n\n", t)
    return t.strip()


def _split_into_bullets(text):
    """Split prose into clean bullet-sized fragments."""
    text = _strip_markdown(text)
    if not text:
        return []
    if "\n" in text:
        fragments = [ln.strip(" •-*\t") for ln in text.split("\n") if ln.strip()]
    else:
        fragments = [f.strip() for f in _SENTENCE_SPLIT_RE.split(text) if f.strip()]
    out, buf = [], ""
    for f in fragments:
        if len(f) < 25 and buf:
            buf = (buf + " " + f).strip()
        else:
            if buf:
                out.append(buf)
            buf = f
    if buf:
        out.append(buf)
    return out


def _format_gap_fill(data):
    answer = (data.get("answer") or "").strip()
    sources = data.get("results") or []
    if not answer and not sources:
        return ""

    lines = ["[Internet Research — auto-filled gap]"]

    for bullet in _split_into_bullets(answer):
        lines.append(f"• {bullet}")

    for s in sources[:MAX_SOURCES_IN_OUTPUT]:
        title = _strip_markdown(s.get("title") or "").strip()
        url = (s.get("url") or "").strip()
        if title and url:
            lines.append(f"• Source: {title} — {url}")
        elif url:
            lines.append(f"• Source: {url}")

    return "\n".join(lines)


def _resolve_company(master_data, prospect_name):
    name = (master_data.get("client_name") or "").strip()
    if name:
        return name
    return _humanize(prospect_name) if prospect_name else ""


def enrich_master_data_with_web(master_data, prospect_name, logger=None):
    """
    Mutates master_data in place. For each field detected as a gap, runs
    one Tavily search and writes the answer into that field. Fields with
    real transcript content or embedded images are left untouched.
    Returns (master_data, filled_count).
    """
    log_fn = logger or log.info

    if not isinstance(master_data, dict) or not master_data:
        return master_data, 0
    if not TAVILY_API_KEY:
        log_fn("[Tavily] skipping enrichment: TAVILY_API_KEY not set")
        return master_data, 0

    company = _resolve_company(master_data, prospect_name)
    if not company:
        return master_data, 0

    filled = 0
    searches = 0

    for section_name, section_data in list(master_data.items()):
        if section_name in SKIP_SECTIONS or not isinstance(section_data, dict):
            continue

        # Internet Search is intentionally scoped to Section 1
        # (Customer / Business Overview) only. Skip everything else.
        if _slugify(section_name) not in ENRICH_ONLY_SECTIONS:
            continue

        section_label = _humanize(section_name)

        for field_name, field_value in list(section_data.items()):
            if searches >= MAX_SEARCHES_PER_RUN:
                log_fn(f"[Tavily] hit per-run cap ({MAX_SEARCHES_PER_RUN}); stopping")
                return master_data, filled

            if _slugify(field_name) in NON_FACTUAL_FIELDS:
                continue
            if _has_images(field_value):
                continue

            if isinstance(field_value, dict):
                content = field_value.get("content") or ""
            else:
                content = "" if field_value is None else str(field_value)

            if not _is_gap(content):
                continue

            field_label = _humanize(field_name)
            query = f"{company} {section_label} {field_label}".strip()
            searches += 1
            try:
                data = _tavily_search(query)
            except Exception as e:
                log_fn(f"[Tavily] '{query}' failed: {e}")
                continue

            text = _format_gap_fill(data)
            if not text:
                continue

            if isinstance(field_value, dict):
                field_value["content"] = text
            else:
                section_data[field_name] = {"content": text}
            filled += 1

    log_fn(f"[Tavily] gap-fill complete: filled {filled} field(s) from {searches} search(es)")
    return master_data, filled
