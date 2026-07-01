"""
document_api/__init__.py — Direct Python wrappers replacing the Sherlock API FastAPI service.

Each function mirrors one of the original HTTP endpoints:
  docx_to_parsed()      ← /docx-to-parsed-json
  summarize()           ← /summarize-json
  render_docx()         ← /process-json
  classify_industry_llm() ← /classify-industry
"""

import os
import tempfile

from .docx_to_json import convert_docx_to_json_memory
from .algorithm_from_json_to_required_json import parse_document_sections
from .ai_summarizer import JSONContentSummarizer
from .render_json_into_word import generate_document_in_memory

# ── SAP workstream sections list (mirrors Sherlock API/Sherlock_AI_ForAPI/main.py) ─
SECTIONS_LIST = [
    "General Business Overview",
    "General Notes & “Wish List”",
    "Key Value Drivers",
    "Motivation(s) for Transformation",
    "Business Locations and Entities",
    "Technical Challenges and Requirements",

    "Idea to Market",
    "For R&D-driven industries (subset of I2M).",
    "General Notes & “Wish List”",
    "Product Design & Engineering",
    "Product Data Management (BOMs, Specs, Integrations)",
    "Testing & Approvals",
    "Production Execution",

    "Source to Pay (S2P)",
    "Broader view of Procure to Pay including sourcing.",
    "General Notes & “Wish List”",
    "Supplier Discovery & Data Management",
    "Contract Management",
    "Sourcing Methods",
    "Catalog Management",
    "Purchase Requisition / Order Management",
    "Goods/Services Receipt",
    "If the prospect needs (E)WM, place notes HERE",
    "Invoice & Payment",
    "Payment Processing",
    "Supplier / Procurement Analytics & Reporting",

    "Plan to Produce (P2P)",
    "General Notes & “Wish List”",
    "Production Planning (MPS, MRP)",
    "Forecasting & Demand Management",
    "Capacity Planning",
    "BOM & Routing Management",
    "Work Center Management",
    "Shop Floor Execution",
    "Order Release & Confirmation",
    "Quality Management in Production",
    "Production Costing",
    "Make-to-Order / Make-to-Stock / Engineer-to-Order Scenarios",
    "Manufacturing Analytics",

    "Detect to Correct (D2C)",
    "Managing quality and compliance issues.",
    "General Notes & “Wish List”",
    "Quality Planning",
    "Inspection Lot Processing",
    "Non-Conformance Management",
    "Corrective & Preventive Actions (CAPA)",
    "Audit Management",
    "Regulatory Compliance",
    "Issue Resolution & Documentation",

    "Forecast to Fulfill (F2F)",
    "Integrated supply chain and demand fulfillment.",
    "General Notes & “Wish List”",
    "Sales Forecasting",
    "Demand Planning",
    "Supply Network Planning",
    "Inventory Planning",
    "Distribution Requirement Planning (DRP)",
    "ATP / CTM (Capable to Match)",
    "Fulfillment Execution",
    "Logistics Optimization",

    "Warehouse Execution (WM / EWM)",
    "General Notes & “Wish List”",
    "Inbound / Put Away Processes",
    "Inventory & Count Processes",
    "Kitting, Assembly, & Value-Added Services",
    "Replenishment & Slotting",
    "Outbound / Staging Processes",

    "Lead to Cash (L2C)",
    "End-to-end customer engagement cycle (includes part of CRM and O2C).",
    "General Notes & “Wish List”",
    "Campaign Management",
    "Lead Generation & Scoring",
    "Opportunity Management",
    "Quotation Management",
    "Customer Master Data Management",
    "Sales Products (BOMs, VC, MTO, MTS)",
    "Sales Order Creation & Management",
    "Availability Check / ATP",
    "Pricing & Discounts",
    "Credit Management",
    "Outbound Delivery Processing",
    "If the prospect needs (E)WM, place notes HERE",
    "Shipping & Transportation",
    "If the prospect needs TM, place notes HERE",
    "Billing / Invoicing",
    "Complaints & Returns",
    "Sales Analytics & Reporting",

    "Logistics Planning & Transportation (TM)",
    "General Notes & “Wish List”",
    "% of parcel, LTL, and FTL",
    "Transportation Planning, Consolidation & Optimization",
    "Carrier Management & Network",
    "Freight Costing & Settlement",
    "Compliance & Documentation",

    "Request to Service (R2S)",
    "Service and support management.",
    "General Notes & “Wish List”",
    "Service Request / Ticket Management",
    "Service Level Agreement (SLA) Tracking",
    "Field Service Management",
    "Warranty & Returns",
    "Installed Base Management",
    "Customer Self-Service Portals",
    "Service Billing",
    "Customer Satisfaction & Feedback",

    "Record to Report (R2R)",
    "Accounting and financial closing activities.",
    "General Notes & “Wish List”",
    "General Ledger Accounting",
    "Accounts Payable / Receivable",
    "Asset Accounting",
    "Cost Center / Internal Order Accounting",
    "Profit Center Accounting",
    "Bank Reconciliation",
    "Intercompany Reconciliation",
    "Financial Closing (Month-End, Year-End)",
    "Consolidation",
    "Financial Reporting & Analytics",

    "Acquire to Dispose (A2D)",
    "Fixed asset lifecycle management.",
    "General Notes & “Wish List”",
    "Asset Master Data Management",
    "Capital Investment Management",
    "Asset Acquisition",
    "Asset Depreciation",
    "Asset Transfers",
    "Asset Retirement & Disposal",
    "Asset Reconciliation & Reporting",

    "Environmental, Social, and Governance (ESG) Processes",
    "Newer strategic reporting area.",
    "General Notes & “Wish List”",
    "Emission Data Collection",
    "ESG Goal Setting",
    "Sustainability Performance Management",
    "ESG Reporting & Audit Trails",
    "Risk & Impact Analysis",

    "Hire to Retire (H2R)",
    "Employee lifecycle management.",
    "General Notes & “Wish List”",
    "Organizational Management",
    "Position Management",
    "Recruiting & Onboarding",
    "Employee Master Data Management",
    "Time & Attendance",
    "Payroll Processing",
    "Benefits Administration",
    "Talent & Performance Management",
    "Learning Management",
    "Succession Planning",
    "Employee Offboarding",
    "HR Analytics",

    "Enterprise Reporting; Data & Analytics Strategy",
    "General Notes & “Wish List”",
    "Team Dynamics",
    "Data Warehousing",
    "“Must Keep” Reports",

    "Other Workstream(s)",
    "Additional Workstream 1 =",
    "Additional Workstream 2 =",
    "Additional Workstream 3 =",
    "Additional Workstream 4 =",
    "Additional Workstream 5 =",
]

_INDUSTRY_KEYS = [
    'chemical', 'consumer_goods', 'life_sciences',
    'manufacturing', 'professional_services', 'wholesale_distribution',
]


def docx_to_parsed(file_bytes: bytes, filename: str) -> dict:
    """Step 1: DOCX bytes → parsed section dict. Mirrors /docx-to-parsed-json."""
    with tempfile.NamedTemporaryFile(delete=False, suffix='.docx') as f:
        f.write(file_bytes)
        tmp = f.name
    try:
        raw_json = convert_docx_to_json_memory(tmp)
        if not raw_json:
            return {}
        parsed = parse_document_sections(SECTIONS_LIST, raw_json)
        return parsed or {}
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def summarize(parsed_data: dict, bullet_points: bool = False) -> dict:
    """Step 2: parsed JSON → AI-summarized JSON. Mirrors /summarize-json."""
    return JSONContentSummarizer(bullet_points=bullet_points).summarize_json(parsed_data)


def render_docx(request_data: dict, template_path: str) -> bytes:
    """
    Step 3: summarized JSON → DOCX bytes. Mirrors /process-json exactly,
    including extraction of prospect_name and _internet_research_used.
    Pass {'summarized_data': master_data, 'prospect_name': name} as request_data.
    """
    if "summarized_data" in request_data:
        summarized_data = request_data["summarized_data"]
    else:
        summarized_data = request_data

    prospect_name = (
        request_data.get("prospect_name")
        or (summarized_data.pop("prospect_name", None) if isinstance(summarized_data, dict) else None)
        or ""
    )
    internet_research_used = bool(
        request_data.get("internet_research_used")
        or (summarized_data.pop("_internet_research_used", False)
            if isinstance(summarized_data, dict) else False)
    )

    buf = generate_document_in_memory(
        template_path,
        summarized_data,
        prospect_name=prospect_name,
        internet_research_used=internet_research_used,
    )
    return buf.getvalue()


def classify_industry_llm(master_data: dict, prospect_name: str) -> str:
    """
    LLM-only industry classify using Azure OpenAI. Mirrors /classify-industry.
    Returns a valid industry key string, or '' if none matches or on error.
    Keyword fallback is handled by the caller in app.py.
    """
    try:
        snippets = []
        for section_val in master_data.values():
            if not isinstance(section_val, dict):
                continue
            for field_val in section_val.values():
                if isinstance(field_val, dict):
                    text = field_val.get('content', '')
                elif isinstance(field_val, str):
                    text = field_val
                else:
                    continue
                if text and len(text.strip()) > 20:
                    snippets.append(text.strip()[:300])
                if len(snippets) >= 8:
                    break
            if len(snippets) >= 8:
                break

        content_snapshot = '\n'.join(snippets)[:2000]

        if not content_snapshot and not prospect_name:
            return ""

        from langchain_openai import AzureChatOpenAI
        llm = AzureChatOpenAI(
            deployment_name=os.getenv("AZURE_OPENAI_DEPLOYMENT"),
            api_version=os.getenv("OPENAI_API_VERSION", "2024-02-15-preview"),
            temperature=0,
            max_tokens=20,
        )

        prompt = (
            f"Prospect name: {prospect_name}\n\n"
            f"Content excerpt:\n{content_snapshot}\n\n"
            "Classify this company into exactly ONE of these SAP industry keys, or respond with 'none' if it does not clearly fit any:\n"
            "chemical, consumer_goods, life_sciences, manufacturing, professional_services, wholesale_distribution\n\n"
            "Definitions:\n"
            "- chemical = chemical companies, specialty chemicals, petrochemicals, industrial gases\n"
            "- consumer_goods = FMCG, food & beverage, personal care, household products, CPG\n"
            "- life_sciences = pharmaceuticals, biotech, medical devices, diagnostics, CROs\n"
            "- manufacturing = discrete or process manufacturing, automotive, aerospace, industrial equipment\n"
            "- professional_services = consulting, IT services, legal, accounting, staffing, managed services\n"
            "- wholesale_distribution = wholesale distributors, logistics, supply chain, third-party distribution\n"
            "- none = company does not clearly fit any of the above\n\n"
            "Respond with ONLY the single key (e.g. 'manufacturing') or 'none'. Nothing else."
        )

        response = llm.invoke(prompt)
        raw = response.content.strip().lower()
        first_token = raw.split()[0].rstrip('.,;:') if raw.split() else 'none'
        first_token = first_token.replace(' ', '_')
        key = first_token if first_token in _INDUSTRY_KEYS else ''
        return key

    except Exception:
        return ""
