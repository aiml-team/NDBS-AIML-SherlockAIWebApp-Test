"""
Tavily web-search enrichment for Sherlock AI — Section 1 company profile.

When the user enables the Internet Search toggle and a company name can be
resolved, we walk every factual field in Section 1 (Customer / Business
Overview) and run a Tavily search per field to build a comprehensive
company profile. If the transcript already produced real content for a
field, the web research block is appended below it; if the field was empty
or sparse, the web research becomes the field's content. Non-factual
meeting-specific fields (pain_points, wishlist, action_items, …) and
fields containing image placeholders are left untouched.
"""
import logging
import os
import re

import requests

log = logging.getLogger(__name__)

TAVILY_API_URL = "https://api.tavily.com/search"


def _get_tavily_api_key():
    # Read lazily so the key is picked up even when this module is imported
    # before load_dotenv() runs in app.py.
    return os.environ.get("TAVILY_API_KEY", "").strip()

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
    "contacts_identified",
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


# Per-field query templates. {company} is substituted at runtime. A template
# tuned to the field (e.g. "{company} annual revenue 2025") gets vastly
# better Tavily results than a generic "{company} Customer Business Overview
# Revenue Band" mash. Fields not in this map fall back to a generic template.
# When `None`, the field is enterprise-internal data (SAP user counts,
# system landscape specifics) where Tavily has nothing useful — we skip the
# search and write a "no public information" marker directly.
FIELD_QUERY_TEMPLATES = {
    "industry_categorization":                  "{company} industry sector primary business",
    "revenue_band":                             "{company} annual revenue latest fiscal year",
    "legal_entities_and_names":                 "{company} legal entity name subsidiaries corporate structure",
    "business_locations":                       "{company} headquarters offices global locations",
    "fiscal_year_format":                       "{company} fiscal year end calendar",
    "total_sap_users":                          None,
    "system_landscape":                         "{company} IT systems ERP technology stack",
    "key_value_drivers":                        "{company} strategic value drivers growth priorities",
    "motivation_s_for_transformation":          "{company} digital transformation initiative drivers",
    "motivations_for_transformation":           "{company} digital transformation initiative drivers",
    "motivation_for_transformation":            "{company} digital transformation initiative drivers",
    "areas_of_perceived_competitive_advantage": "{company} competitive advantage market position strengths",
    "perceived_change_resistance":              None,
    "technical_challenges_and_requirements":    "{company} technology challenges modernization requirements",
    "regulatory_compliance_requirements":       "{company} regulatory compliance industry requirements",
    "transformation_program_c_suite_kpis":      "{company} strategic priorities CEO KPIs annual report",
    "key_public_cloud_disqualifiers":           None,
}


NO_INFO_MARKER_TEMPLATE = (
    "[Internet Research]\n"
    "• No public information found for \"{field}\" — this is internal to {company} "
    "and must be supplied by the customer."
)


# Canonical Section 1 (General Business Overview) field keys, matching
# TEMPLATE_SCHEMA in the VTT backend and the renderer's expected keys.
# Extractors only emit keys for fields they found content for, so most of
# these are missing from master_data when the transcript is sparse. We seed
# them all here so the enrichment loop can fill them from the web.
SECTION_1_CANONICAL_KEY = "General_Business_Overview"
SECTION_1_CANONICAL_FIELDS = (
    "Schedule_of_Events",
    "Contacts_Identified",
    "Industry_Categorization",
    "Revenue_Band",
    "Legal_Entities_and_Names",
    "Business_Locations",
    "Fiscal_Year_Format",
    "Total_SAP_Users",
    "System_Landscape",
    "Key_Value_Drivers",
    "Motivations_for_Transformation",
    "Areas_of_Perceived_Competitive_Advantage",
    "Perceived_Change_Resistance",
    "Technical_Challenges_and_Requirements",
    "Regulatory_Compliance_Requirements",
    "Transformation_Program_C_Suite_KPIs",
    "Key_Public_Cloud_Disqualifiers",
)


def _ensure_section_1_seeded(master_data):
    """Ensure master_data has a Section 1 dict and every canonical subsection
    key exists (empty {"content": ""} for any that are missing). Mutates in
    place; returns the section dict so the caller can iterate it.
    """
    section_key = None
    for k in master_data:
        if isinstance(master_data.get(k), dict) and _slugify(k) in ENRICH_ONLY_SECTIONS:
            section_key = k
            break
    if section_key is None:
        section_key = SECTION_1_CANONICAL_KEY
        master_data[section_key] = {}

    section_data = master_data[section_key]
    for field in SECTION_1_CANONICAL_FIELDS:
        if field not in section_data:
            section_data[field] = {"content": ""}
    return section_data


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
    api_key = _get_tavily_api_key()
    if not api_key:
        raise RuntimeError("TAVILY_API_KEY is not configured")
    payload = {
        "query": query,
        "search_depth": "advanced",
        "include_answer": True,
        "max_results": MAX_SOURCES_IN_OUTPUT,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
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

    lines = ["[Internet Research]"]

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


def _combine_existing_and_web(existing_content, web_block):
    """Return the new field content. If existing content is a gap (empty /
    short / "N/A" / etc.) the web block replaces it; otherwise the web block
    is appended below the existing content so transcript context stays on top.
    If an [Internet Research] block is already present it is replaced rather
    than stacked, preventing duplicates on re-generation.
    """
    if not web_block:
        return existing_content or ""
    IR_MARKER = '[Internet Research]'
    if existing_content and IR_MARKER in existing_content:
        idx = existing_content.find(IR_MARKER)
        before = existing_content[:idx].rstrip()
        return f"{before}\n\n{web_block}".lstrip('\n') if before else web_block
    if _is_gap(existing_content):
        return web_block
    return f"{existing_content.rstrip()}\n\n{web_block}"


# Common company suffix words that don't distinguish one company from another
_COMPANY_STOP_WORDS = frozenset({
    'inc', 'corp', 'llc', 'ltd', 'limited', 'company', 'co', 'group',
    'holding', 'holdings', 'enterprise', 'enterprises', 'international',
    'global', 'solutions', 'services', 'technologies', 'technology',
    'industries', 'industry', 'systems', 'associates', 'partners',
    'the', 'and', 'of', 'for',
})


def _company_tokens(company_name: str) -> list:
    """Extract distinctive words (>=3 chars, not stop words) from a company name."""
    tokens = re.findall(r"[A-Za-z]+", company_name)
    return [t.lower() for t in tokens if len(t) >= 3 and t.lower() not in _COMPANY_STOP_WORDS]


def _result_mentions_company(result: dict, tokens: list) -> bool:
    """Return True if at least 2 distinctive company tokens appear in the result text."""
    if not tokens:
        return True
    text = ' '.join([
        result.get('title') or '',
        result.get('url') or '',
        result.get('content') or '',
        result.get('snippet') or '',
    ]).lower()
    matches = sum(1 for t in tokens if t in text)
    return matches >= min(2, len(tokens))


def _filter_results_by_company(data: dict, tokens: list) -> dict:
    """Remove Tavily results that don't appear to be about the target company."""
    if not tokens:
        return data
    results = data.get('results') or []
    filtered = [r for r in results if _result_mentions_company(r, tokens)]
    if len(filtered) == len(results):
        return data
    if not filtered:
        return {'answer': '', 'results': []}
    answer = (data.get('answer') or '').lower()
    answer_ok = sum(1 for t in tokens if t in answer) >= min(2, len(tokens))
    return {'answer': data.get('answer', '') if answer_ok else '', 'results': filtered}


def _resolve_company(master_data, prospect_name):
    name = (master_data.get("client_name") or "").strip()
    if name:
        return name
    return _humanize(prospect_name) if prospect_name else ""


def enrich_master_data_with_web(master_data, prospect_name, logger=None):
    """
    Mutates master_data in place. For every factual Section 1 field, runs
    one Tavily search about the resolved company and writes the result into
    that field. Existing transcript content is preserved by appending the
    web block below it; empty/sparse fields are populated from web data
    alone. Non-factual meeting-specific fields and fields containing image
    placeholders are skipped. Returns (master_data, filled_count) where
    filled_count is the number of fields whose content was modified.
    """
    log_fn = logger or log.info

    if not isinstance(master_data, dict) or not master_data:
        return master_data, 0
    if not _get_tavily_api_key():
        log_fn("[Tavily] skipping enrichment: TAVILY_API_KEY not set")
        return master_data, 0

    company = _resolve_company(master_data, prospect_name)
    if not company:
        return master_data, 0

    ctokens = _company_tokens(company)

    # Make sure every canonical Section 1 field exists in master_data before
    # we iterate — extractors only emit keys for fields they found content
    # for, so most subsections are missing when the transcript is sparse.
    _ensure_section_1_seeded(master_data)

    filled = 0
    searches = 0

    for section_name, section_data in list(master_data.items()):
        if section_name in SKIP_SECTIONS or not isinstance(section_data, dict):
            continue

        # Internet Search is intentionally scoped to Section 1
        # (Customer / Business Overview) only. Skip everything else.
        if _slugify(section_name) not in ENRICH_ONLY_SECTIONS:
            continue

        for field_name, field_value in list(section_data.items()):
            if _slugify(field_name) in NON_FACTUAL_FIELDS:
                continue
            if _has_images(field_value):
                continue

            if isinstance(field_value, dict):
                content = field_value.get("content") or ""
            else:
                content = "" if field_value is None else str(field_value)

            field_label = _humanize(field_name)
            field_slug = _slugify(field_name)

            # Internal-only fields: no point asking Tavily, write the marker.
            if field_slug in FIELD_QUERY_TEMPLATES and FIELD_QUERY_TEMPLATES[field_slug] is None:
                web_block = NO_INFO_MARKER_TEMPLATE.format(
                    field=field_label, company=company
                )
            else:
                if searches >= MAX_SEARCHES_PER_RUN:
                    log_fn(f"[Tavily] hit per-run cap ({MAX_SEARCHES_PER_RUN}); stopping")
                    return master_data, filled

                primary_tpl = FIELD_QUERY_TEMPLATES.get(
                    field_slug, "{company} " + field_label
                )
                primary_q = primary_tpl.format(company=company).strip()
                web_block = _search_and_format(primary_q, log_fn, company_tokens=ctokens)
                searches += 1

                # Retry once with a generic query if first attempt was empty.
                if not web_block and searches < MAX_SEARCHES_PER_RUN:
                    fallback_q = f"{company} company profile {field_label}".strip()
                    if fallback_q != primary_q:
                        web_block = _search_and_format(fallback_q, log_fn, company_tokens=ctokens)
                        searches += 1

                if not web_block:
                    web_block = NO_INFO_MARKER_TEMPLATE.format(
                        field=field_label, company=company
                    )

            new_content = _combine_existing_and_web(content, web_block)
            if new_content == content:
                continue

            if isinstance(field_value, dict):
                field_value["content"] = new_content
            else:
                section_data[field_name] = {"content": new_content}
            filled += 1

    log_fn(f"[Tavily] enrichment complete: filled {filled} field(s) from {searches} search(es)")
    return master_data, filled


def _search_and_format(query, log_fn, company_tokens=None):
    """Run one Tavily search; return the formatted block or '' on empty/error.
    When company_tokens is provided, results that don't mention the company are filtered out."""
    try:
        data = _tavily_search(query)
    except Exception as e:
        log_fn(f"[Tavily] '{query}' failed: {e}")
        return ""
    if company_tokens:
        data = _filter_results_by_company(data, company_tokens)
    return _format_gap_fill(data)
