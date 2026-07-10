import copy
import os
import json
import re
from typing import Dict, Any, List, Optional
from anthropic import AnthropicFoundry
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, BaseMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_core.prompts import PromptTemplate
from pydantic import PrivateAttr
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv(override=True)

# Standard SAP workstream sections used for gap-filling
_WORKSTREAM_SECTIONS = [
    "Customer/Business Overview",
    "Idea to Market",
    "Source to Pay (S2P)",
    "Plan to Produce (P2P)",
    "Detect to Correct (D2C)",
    "Forecast to Fulfill (F2F)",
    "Warehouse Execution (WM / EWM)",
    "Lead to Cash (L2C)",
    "Logistics Planning & Transportation (TM)",
    "Request to Service (R2S)",
    "Record to Report (R2R)",
    "Acquire to Dispose (A2D)",
    "Environmental, Social, and Governance (ESG) Processes",
    "Hire to Retire (H2R)",
    "Enterprise Reporting; Data & Analytics Strategy",
]

# Section-specific topic hints to guide the LLM during gap-filling
_SECTION_TOPICS = {
    "Customer/Business Overview": "company profile, business model, IT landscape, ERP systems, key metrics, number of employees/plants/customers",
    "Idea to Market": "R&D, product design, recipe/formula management, BOMs, engineering change, testing and approvals, PLM",
    "Source to Pay (S2P)": "procurement, purchasing, sourcing, supplier management, purchase orders, goods receipt, invoice processing, AP",
    "Plan to Produce (P2P)": "production planning, MRP, MPS, demand forecasting, capacity planning, shop floor, work orders, costing",
    "Detect to Correct (D2C)": "quality management, inspections, non-conformances, CAPA, audits, compliance, regulatory",
    "Forecast to Fulfill (F2F)": "supply chain planning, demand planning, ATP, available-to-promise, inventory planning, distribution",
    "Warehouse Execution (WM / EWM)": "warehouse management, inbound/outbound, put-away, picking, packing, inventory counts, slotting",
    "Lead to Cash (L2C)": "CRM, sales orders, pricing, discounts, credit management, customer master, billing, order management, ATP, quotes, returns",
    "Logistics Planning & Transportation (TM)": "transportation management, freight, carrier, shipping, delivery routes, parcel, LTL, FTL, freight costing",
    "Request to Service (R2S)": "field service, service tickets, SLAs, warranty, installed base, customer support, service billing",
    "Record to Report (R2R)": "general ledger, accounts payable, accounts receivable, bank reconciliation, financial close, month-end, asset accounting, cost centers, financial reporting",
    "Acquire to Dispose (A2D)": "fixed assets, capital investments, CAPEX, asset depreciation, asset transfers, asset disposal, asset master",
    "Environmental, Social, and Governance (ESG) Processes": "ESG, sustainability, emissions tracking, carbon footprint, ESG reporting, green initiatives",
    "Hire to Retire (H2R)": "HR, payroll, headcount, employee master, recruiting, onboarding, time and attendance, benefits, talent management, learning",
    "Enterprise Reporting; Data & Analytics Strategy": "business intelligence, BI, analytics, data warehousing, reporting strategy, KPIs, dashboards, must-keep reports",
}

# Pattern to detect "not discussed" placeholder text written by the LLM
_NOT_DISCUSSED_RE = re.compile(
    r'not discussed|not mentioned|not addressed|not covered|not explored|'
    r'no (information|data|details|mention|evidence|discussion)|'
    r'was not discussed|were not discussed|not specifically discussed|'
    r'no explicit mention|nothing was (said|discussed|mentioned)',
    re.IGNORECASE,
)

class ChatAnthropicFoundry(BaseChatModel):
    """LangChain-compatible wrapper around AnthropicFoundry for Azure AI Foundry deployments."""
    foundry_api_key: str = ""
    foundry_base_url: str = ""
    model_name: str = "claude-opus-4-7"
    temperature: float = 0.3
    max_tokens: int = 8000
    _client: Any = PrivateAttr(default=None)

    def model_post_init(self, __context: Any) -> None:
        self._client = AnthropicFoundry(
            api_key=self.foundry_api_key,
            base_url=self.foundry_base_url,
        )

    def _generate(
        self,
        messages: List[BaseMessage],
        stop: Optional[List[str]] = None,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> ChatResult:
        anthropic_messages = []
        system_content: Optional[str] = None
        for msg in messages:
            if isinstance(msg, SystemMessage):
                system_content = msg.content
            elif isinstance(msg, HumanMessage):
                anthropic_messages.append({"role": "user", "content": msg.content})
            elif isinstance(msg, AIMessage):
                anthropic_messages.append({"role": "assistant", "content": msg.content})
            else:
                anthropic_messages.append({"role": "user", "content": str(msg.content)})

        call_kwargs: Dict[str, Any] = {
            "model": self.model_name,
            "messages": anthropic_messages,
            "max_tokens": self.max_tokens,
        }
        if system_content:
            call_kwargs["system"] = system_content

        response = self._client.messages.create(**call_kwargs)
        content = response.content[0].text if response.content else ""
        return ChatResult(generations=[ChatGeneration(message=AIMessage(content=content))])

    @property
    def _llm_type(self) -> str:
        return "anthropic-foundry"


class JSONContentSummarizer:
    def __init__(self, bullet_points=False):
        """Initialize the summarizer with Claude Opus 4.7 via Azure AI Foundry."""
        self.bullet_points = bullet_points

        foundry_api_key = os.getenv("ANTHROPIC_FOUNDRY_API_KEY")
        foundry_base_url = os.getenv("ANTHROPIC_FOUNDRY_BASE_URL")
        foundry_model = os.getenv("ANTHROPIC_FOUNDRY_MODEL", "claude-opus-4-7")
        if not foundry_api_key or not foundry_base_url:
            raise ValueError(
                "Missing required environment variables: ANTHROPIC_FOUNDRY_API_KEY and ANTHROPIC_FOUNDRY_BASE_URL"
            )

        print(f"Initializing {foundry_model} via Azure AI Foundry...")

        self.llm = ChatAnthropicFoundry(
            foundry_api_key=foundry_api_key,
            foundry_base_url=foundry_base_url,
            model_name=foundry_model,
            temperature=0.3,
            max_tokens=8000,
        )

        if self.bullet_points:
            format_instructions = (
                "4. MANDATORY BULLET POINT FORMAT — NO EXCEPTIONS: Every answer MUST be written "
                "as bullet points only. Each bullet MUST start with \"• \" (unicode U+2022 + space) "
                "on its own line. NEVER write prose paragraphs. NEVER use \"- \" or \"* \" — ONLY \"• \".\n"
                "5. Keep image references on the same line as the bullet point they relate to — "
                "do NOT put them on separate lines"
            )
            placeholder_note = "as bullet points (• point per line, NO prose) with image references inline"
        else:
            format_instructions = (
                "4. Write in plain text format WITHOUT markdown formatting — "
                "do not use **, -, bullets, or any markdown symbols\n"
                "5. Do NOT use escape characters like \\n — write naturally flowing text with proper spacing\n"
                "6. Keep image references on the same line as surrounding text — "
                "do NOT put them on separate lines"
            )
            placeholder_note = "in plain text with relevant image references from original content only"

        self._format_instructions = format_instructions
        self._placeholder_note = placeholder_note

        self.prompt_template = PromptTemplate(
            input_variables=["all_content"],
            template=f"""You are a professional SAP business analyst. Analyze the following content and provide detailed answers to these four questions:

1. Current Processes (Key Findings)
2. Pain Points
3. Proposed SAP Solution(s) Mapping
4. Major Gap(s) & Integration(s)

CRITICAL REQUIREMENTS:
1. Maintain ALL image references (like [IMAGE_A3F2B1C4D5E6F7G8], [IMAGE_9876543210FEDCBA], etc.) in their EXACT original positions within the relevant sections
2. DO NOT change image reference IDs - preserve the exact alphanumeric hash codes (e.g., IMAGE_A3F2B1C4D5E6F7G8)
3. These are unique identifiers - do NOT simplify them to IMAGE_1, IMAGE_2, etc.
{format_instructions}
7. Provide comprehensive professional analysis for each question
8. Use proper business terminology and SAP-specific language where applicable
9. DO NOT generate new image references that don't exist in the original content
10. Structure your response EXACTLY as follows:

Current Processes (Key Findings):
[Your detailed analysis here {placeholder_note} - preserve exact IDs like [IMAGE_A3F2B1C4D5E6F7G8] inline with text]

Pain Points:
[Your detailed analysis here {placeholder_note} - preserve exact IDs inline with text]

Proposed SAP Solution(s) Mapping:
[Your detailed SAP solution recommendations here {placeholder_note} - DO NOT add image references here]

Major Gap(s) & Integration(s):
[Your detailed gap and integration analysis here {placeholder_note} - DO NOT add image references here]

Content to analyze:
{{all_content}}

Analysis:"""
        )
        
        # Create the chain using modern LangChain syntax
        self.summarization_chain = self.prompt_template | self.llm

        # Gap-fill chain: fills empty workstream sections from transcript + master_data context
        _gap_fill_template_str = f"""You are a professional SAP business analyst. Based on the transcript excerpts and company profile below, extract everything relevant to the prospect's **{{section_name}}** workstream.

Focus on {{section_name}} topics: {{section_topics}}

CRITICAL REQUIREMENTS:
1. Extract ONLY information explicitly present in the provided content — do NOT hallucinate
2. If a sub-section has NO evidence in the content, leave it COMPLETELY BLANK — do NOT write "not discussed", "not mentioned", or any similar phrase
3. DO NOT generate image references
{format_instructions}
7. Structure your response EXACTLY as follows (omit the heading's answer text if nothing relevant was found):

Current Processes (Key Findings):
[Current {{section_name}} processes stated in the content — blank if none found]

Pain Points:
[{{section_name}} challenges stated in the content — blank if none found]

Proposed SAP Solution(s) Mapping:
[SAP solutions relevant to what was actually discussed — blank if insufficient context]

Major Gap(s) & Integration(s):
[Gaps or integration topics for {{section_name}} stated in content — blank if none found]

Content to analyze:
{{context}}

Analysis:"""

        self.gap_fill_prompt_template = PromptTemplate(
            input_variables=["section_name", "section_topics", "context"],
            template=_gap_fill_template_str,
        )
        self.gap_fill_chain = self.gap_fill_prompt_template | self.llm

    def extract_image_references(self, text: str) -> List[str]:
        """Extract all image references from text (supports hash-based IDs)"""
        return re.findall(r'\[IMAGE_[A-Z0-9]+\]', text)
    
    def normalize_text(self, text: str) -> str:
        """Normalize Unicode characters to ASCII equivalents and clean formatting"""
        # Replace Unicode quotes
        text = text.replace('\u201c', '"')
        text = text.replace('\u201d', '"')
        text = text.replace('\u2018', "'")
        text = text.replace('\u2019', "'")
        text = text.replace('\u2013', '-')
        text = text.replace('\u2014', '--')
        text = text.replace('\u2026', '...')
        
        return text
    
    def collect_content_for_section(self, section_data: Any, section_path: str = "") -> tuple[str, Dict[str, str]]:
        """Recursively collect all content fields within a section and their associated images"""
        all_content = []
        all_images = {}
        
        if isinstance(section_data, dict):
            for key, value in section_data.items():
                current_path = f"{section_path}.{key}" if section_path else key
                
                if key == 'content' and isinstance(value, str):
                    normalized_content = self.normalize_text(value)
                    all_content.append(normalized_content)
                
                elif key == 'images' and isinstance(value, dict):
                    # Collect all images
                    all_images.update(value)
                
                elif isinstance(value, (dict, list)):
                    content, images = self.collect_content_for_section(value, current_path)
                    if content:
                        all_content.append(content)
                    all_images.update(images)
        
        elif isinstance(section_data, list):
            for i, item in enumerate(section_data):
                content, images = self.collect_content_for_section(item, f"{section_path}[{i}]")
                if content:
                    all_content.append(content)
                all_images.update(images)
        
        return ' '.join(all_content), all_images
    
    def parse_llm_response(self, response_text: str) -> Dict[str, str]:
        """Parse the LLM response into structured sections"""
        sections = {
            'Current Processes (Key Findings)': '',
            'Pain Points': '',
            'Proposed SAP Solution(s) Mapping': '',
            'Major Gap(s) & Integration(s)': ''
        }
        
        # Normalize the response
        response_text = self.normalize_text(response_text)
        
        # Split response by section headers
        current_section = None
        lines = response_text.split('\n')
        
        for line in lines:
            line_stripped = line.strip()
            
            # Check if line is a section header
            if 'Current Processes' in line_stripped and ':' in line_stripped:
                current_section = 'Current Processes (Key Findings)'
            elif 'Pain Points' in line_stripped and ':' in line_stripped:
                current_section = 'Pain Points'
            elif 'Proposed SAP Solution' in line_stripped and ':' in line_stripped:
                current_section = 'Proposed SAP Solution(s) Mapping'
            elif 'Major Gap' in line_stripped and ':' in line_stripped:
                current_section = 'Major Gap(s) & Integration(s)'
            elif current_section:
                # Add content to current section
                if line.strip():
                    sections[current_section] += line + '\n'
        
        # Clean up sections
        for key in sections:
            sections[key] = sections[key].strip()
        
        return sections
    
    def clean_ai_content(self, content: str) -> str:
        """Clean AI-generated content from markdown and escape sequences"""
        if not content:
            return content
            
        # Replace literal \n with space (AI sometimes adds these)
        content = content.replace('\\n', ' ')
        
        # Remove markdown bold
        content = content.replace('**', '')
        
        # Remove markdown emphasis
        content = content.replace('__', '')
        
        import re
        _sentence_re = re.compile(r'(?<=[.!?])\s+')
        _marker_re   = re.compile(r'^[-*•]\s*')
        _ir_header   = '[Internet Research]'
        if self.bullet_points:
            forced_lines = []
            for line in content.split('\n'):
                stripped = line.strip()
                if not stripped:
                    continue
                # Keep Internet Research markers unmodified for red-colour post-processing
                if stripped == _ir_header or stripped.startswith('• Source:') or stripped.startswith('Source:'):
                    forced_lines.append(stripped)
                    continue
                if stripped.startswith('• '):
                    forced_lines.append(stripped)
                    continue
                text = _marker_re.sub('', stripped).strip()
                if not text:
                    continue
                # Split prose paragraphs into sentence-level bullets
                if len(text) > 120 and re.search(r'[.!?]\s', text):
                    for part in _sentence_re.split(text):
                        part = part.strip()
                        if part:
                            forced_lines.append('• ' + part)
                else:
                    forced_lines.append('• ' + text)
            content = '\n'.join(forced_lines)
        else:
            content = re.sub(r'(?m)^\s*-\s+', '', content)
        
        # Clean up multiple spaces but preserve single spaces
        content = re.sub(r' {2,}', ' ', content)
        
        return content.strip()
    
    def extract_images_from_section(self, section_text: str, available_images: Dict[str, str]) -> tuple[str, Dict[str, str]]:
        """Extract image references from section text and return cleaned text with images dict
        Only include images that actually exist in the original data"""
        
        # Clean the AI-generated content first
        cleaned_text = self.clean_ai_content(section_text)
        
        image_refs = self.extract_image_references(cleaned_text)
        images_dict = {}
        
        for img_ref in image_refs:
            img_key = img_ref.strip('[]')
            
            # Only add image if it exists in the original collected images
            if img_key in available_images:
                images_dict[img_key] = available_images[img_key]
            else:
                # Remove the non-existent image reference from the text
                cleaned_text = cleaned_text.replace(img_ref, '').strip()
        
        return cleaned_text, images_dict
    
    def analyze_section(self, section_name: str, section_data: Any) -> Dict[str, Any]:
        """Analyze a single top-level section and return structured output"""
        print(f"\nAnalyzing section: {section_name}")
        print("-" * 80)
        
        # Collect all content and images from this section
        all_content, all_images = self.collect_content_for_section(section_data, section_name)
        
        if not all_content.strip():
            print(f"No content found in section: {section_name}")
            return None
        
        print(f"Collected {len(all_content)} characters of content")
        print(f"Collected {len(all_images)} images")
        
        # Send to LLM for analysis
        print("Sending content to LLM for analysis...")
        try:
            result = self.summarization_chain.invoke({"all_content": all_content})
            
            # Extract content from the AI message
            if hasattr(result, 'content'):
                analysis_text = result.content
            else:
                analysis_text = str(result)
            
            print("Analysis completed!")
            
        except Exception as e:
            print(f"Error during LLM analysis: {e}")
            return None
        
        # Parse LLM response into structured sections
        parsed_sections = self.parse_llm_response(analysis_text)
        
        # Structure output for this section
        section_output = {}
        
        # Add each of the 4 analysis sections with content and images
        for analysis_section_name, analysis_content in parsed_sections.items():
            section_text, section_images = self.extract_images_from_section(analysis_content, all_images)
            
            section_output[analysis_section_name] = {
                "content": section_text,
                "images": section_images
            }
        
        return section_output
    
    def summarize_json(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """Main method to analyze JSON content and structure output
        Returns data in format compatible with Word document generator
        """
        print("Starting JSON analysis process...")
        print("=" * 80)
        
        # Initialize output structure - DIRECT format for Word generator
        output = {}
        
        # Process each top-level section independently
        for section_name, section_data in input_data.items():
            print(f"\n{'='*80}")
            print(f"Processing top-level section: {section_name}")
            print(f"{'='*80}")
            
            section_result = self.analyze_section(section_name, section_data)
            
            if section_result:
                output[section_name] = section_result
            else:
                print(f"Skipping section {section_name} - no content to analyze")
        
        print("\n" + "=" * 80)
        print("JSON analysis completed!")
        print("=" * 80)
        return output

    def _section_content_chars(self, section_data: Any) -> int:
        """Return total character count of all content fields within a section."""
        if not section_data or not isinstance(section_data, dict):
            return 0
        total = 0
        for value in section_data.values():
            if isinstance(value, dict):
                text = value.get('content', '')
            elif isinstance(value, str):
                text = value
            else:
                continue
            total += len(text.strip())
        return total

    def _parse_batch_response(self, response_text: str, expected_sections: List[str]) -> Dict[str, Dict]:
        """Parse a batch LLM response that contains multiple === Section Name === blocks."""
        results = {}
        header_re = re.compile(r'^===\s*(.+?)\s*===[ \t]*$', re.MULTILINE)
        matches = list(header_re.finditer(response_text))
        if not matches:
            return results

        for idx, m in enumerate(matches):
            section_name_raw = m.group(1).strip()
            content_start = m.end()
            content_end = matches[idx + 1].start() if idx + 1 < len(matches) else len(response_text)
            section_content = response_text[content_start:content_end]

            matched = None
            for exp in expected_sections:
                if exp.lower() in section_name_raw.lower() or section_name_raw.lower() in exp.lower():
                    matched = exp
                    break
            if not matched:
                continue

            parsed = self.parse_llm_response(section_content)
            section_output = {}
            for sub_name, sub_content in parsed.items():
                clean_text, images = self.extract_images_from_section(sub_content, {})
                if clean_text.strip() and _NOT_DISCUSSED_RE.search(clean_text) and len(clean_text.strip()) < 250:
                    clean_text = ''
                    images = {}
                section_output[sub_name] = {"content": clean_text, "images": images}
            results[matched] = section_output

        return results

    def _extract_sections_from_transcript(self, transcript_text: str, sections_to_fill: List[str]) -> Dict[str, Dict]:
        """Send the full transcript to GPT-4o in batches of 4 sections.
        Replaces keyword-window extraction — catches all natural-language references
        regardless of exact phrasing (e.g. 'Jewel' == 'Joule AI')."""
        BATCH_SIZE = 4
        transcript_chunk = transcript_text[:80000]
        all_results: Dict[str, Dict] = {}

        batches = [sections_to_fill[i:i + BATCH_SIZE] for i in range(0, len(sections_to_fill), BATCH_SIZE)]
        for batch_idx, batch in enumerate(batches):
            sections_spec = ''
            for sname in batch:
                topics = _SECTION_TOPICS.get(sname, sname)
                sections_spec += f'- {sname}\n  (Focus: {topics})\n'

            prompt = f"""You are a professional SAP discovery analyst extracting information from a REAL customer meeting transcript.

Your task: Read the FULL meeting transcript below and extract ALL content relevant to each listed SAP workstream section.

OUTPUT FORMAT — use this EXACT structure, one block per section:

=== {{Section Name}} ===
Current Processes (Key Findings):
[All current processes, tools, and systems for this section mentioned in the transcript — BLANK if nothing found]

Pain Points:
[All challenges, problems, or frustrations for this section mentioned in the transcript — BLANK if nothing found]

Proposed SAP Solution(s) Mapping:
[Any SAP modules or tools discussed that relate to this section — BLANK if nothing found]

Major Gap(s) & Integration(s):
[Integration needs, missing capabilities, or gaps for this section — BLANK if nothing found]

CRITICAL RULES:
1. COMPREHENSIVENESS: Capture ALL relevant mentions — even indirect ones. Examples:
   - "Joule AI" or "Jewel AI" → belongs in Enterprise Reporting
   - "Esker", "TermSync", "collections", "credit holds" → Lead to Cash
   - "Lisa said we track fixed assets in spreadsheets" → Acquire to Dispose
   - "GL close takes 10 days", "bank reconciliation", "1099s" → Record to Report
2. ACCURACY: Extract ONLY what the transcript explicitly states — no hallucination
3. BLANK POLICY: If there is genuinely nothing for a sub-section, leave it completely blank — do NOT write "not discussed", "not mentioned", or any similar phrase
4. INCLUDE SPECIFICS: names, system names, numbers, timelines, person names
5. FORMAT: Plain text only, no markdown, no bullet points

Sections to extract (output one === block per section below):
{sections_spec}
=== FULL TRANSCRIPT ===
{transcript_chunk}
=== END TRANSCRIPT ===

Now output one === Section Name === block for each section listed above:"""

            try:
                gf_result = self.llm.invoke(prompt)
                response_text = gf_result.content if hasattr(gf_result, 'content') else str(gf_result)
                batch_results = self._parse_batch_response(response_text, batch)
                all_results.update(batch_results)
                found = [s for s in batch if s in batch_results and
                         any(v.get('content', '').strip() for v in batch_results[s].values())]
                print(f"  -> Batch {batch_idx + 1}/{len(batches)} — found content in: {found or 'none'}")
            except Exception as e:
                print(f"  -> Batch extraction error (batch {batch_idx + 1}): {e}")

        return all_results

    def gap_fill_from_master(self, master_data: Dict[str, Any], transcript_text: str = '') -> Dict[str, Any]:
        """
        Fill / supplement standard workstream sections using:
          1. Full-transcript batch LLM extraction (primary):
             - Sections with <= FILL_THRESHOLD chars  → REPLACE with batch output
             - Sections with <= SUPPLEMENT_THRESHOLD  → APPEND batch output to existing content
               so call-specific details (system names, numbers, sub-contractors, etc.) are never
               lost just because the briefing doc already filled the section.
          2. Supplementary context from already-filled sections (fallback for still-empty sections)
        Returns a deep-copied, updated master_data dict.
        """
        FILL_THRESHOLD = 200        # sections with ≤ this are empty enough to replace
        SUPPLEMENT_THRESHOLD = 4000 # sections with ≤ this also get call details appended

        result = copy.deepcopy(master_data)

        supp_parts = []
        for sname, sdata in result.items():
            if sname.startswith('_') or not isinstance(sdata, dict):
                continue
            if self._section_content_chars(sdata) < 50:
                continue
            content_str, _ = self.collect_content_for_section(sdata)
            if content_str.strip():
                supp_parts.append(f"[{sname}]\n{content_str[:2000]}")

        supplementary_context = '\n\n'.join(supp_parts)[:8000]

        if not supplementary_context and not transcript_text.strip():
            print("Gap-fill: no context available, skipping")
            return result

        # Run batch extraction for ALL sections that are below the supplement threshold
        sections_for_extraction = [
            s for s in _WORKSTREAM_SECTIONS
            if self._section_content_chars(result.get(s)) <= SUPPLEMENT_THRESHOLD
        ]

        batch_extracted: Dict[str, Dict] = {}
        if transcript_text.strip() and sections_for_extraction:
            print(f"Gap-fill: batch-extracting {len(sections_for_extraction)} section(s) from full transcript...")
            batch_extracted = self._extract_sections_from_transcript(transcript_text, sections_for_extraction)

        filled_count = 0
        for section_name in _WORKSTREAM_SECTIONS:
            existing_chars = self._section_content_chars(result.get(section_name))
            if existing_chars > SUPPLEMENT_THRESHOLD:
                continue

            if section_name in batch_extracted:
                section_output = batch_extracted[section_name]
                has_content = any(v.get('content', '').strip() for v in section_output.values())

                if not has_content:
                    pass  # fall through to supplementary context
                elif existing_chars <= FILL_THRESHOLD:
                    # Section was empty — replace entirely
                    result[section_name] = section_output
                    filled_count += 1
                    print(f"  -> Filled from transcript: {section_name}")
                    continue
                else:
                    # Section has briefing content — append call-specific findings
                    if not isinstance(result.get(section_name), dict):
                        result[section_name] = {}
                    appended = False
                    for sub_name, sub_data in section_output.items():
                        new_content = sub_data.get('content', '').strip()
                        if not new_content:
                            continue
                        existing_sub = result[section_name].get(sub_name, {})
                        if isinstance(existing_sub, dict):
                            existing_content = existing_sub.get('content', '').strip()
                            existing_images = existing_sub.get('images', {})
                        else:
                            existing_content = ''
                            existing_images = {}
                        combined = (existing_content + '\n' + new_content).strip() if existing_content else new_content
                        result[section_name][sub_name] = {
                            'content': combined,
                            'images': {**existing_images, **sub_data.get('images', {})},
                        }
                        appended = True
                    if appended:
                        filled_count += 1
                        print(f"  -> Supplemented from transcript: {section_name}")
                    continue

            if existing_chars > FILL_THRESHOLD or not supplementary_context:
                continue

            print(f"  -> Supplementary-context fallback for: {section_name}")
            section_topics = _SECTION_TOPICS.get(section_name, section_name)
            section_context = f"[Company profile from other sections]\n{supplementary_context[:8000]}"

            try:
                gf_result = self.gap_fill_chain.invoke({
                    "section_name": section_name,
                    "section_topics": section_topics,
                    "context": section_context,
                })
                analysis_text = gf_result.content if hasattr(gf_result, 'content') else str(gf_result)
                parsed = self.parse_llm_response(analysis_text)

                section_output = {}
                for sub_name, sub_content in parsed.items():
                    clean_text, images = self.extract_images_from_section(sub_content, {})
                    if clean_text.strip() and _NOT_DISCUSSED_RE.search(clean_text) and len(clean_text.strip()) < 250:
                        clean_text = ''
                        images = {}
                    section_output[sub_name] = {"content": clean_text, "images": images}

                if any(v.get('content', '').strip() for v in section_output.values()):
                    result[section_name] = section_output
                    filled_count += 1
                    print(f"  -> Filled from supplementary context: {section_name}")
                else:
                    print(f"  -> No relevant content found for: {section_name}")

            except Exception as e:
                print(f"  -> Gap-fill error for {section_name}: {e}")

        print(f"Gap-fill complete: {filled_count} section(s) filled")
        return result


def process_json_file(file_path: str, output_path: str = None):
    """Process JSON from file and return data ready for Word document generator
    
    Args:
        file_path: Path to input JSON file
        output_path: Path to save output JSON (optional)
    
    Returns:
        Dictionary in format compatible with Word document generator
    """
    
    try:
        summarizer = JSONContentSummarizer()
    except ValueError as e:
        print(f"Configuration error: {e}")
        return None
    
    try:
        # Load JSON from file
        with open(file_path, 'r', encoding='utf-8') as f:
            input_data = json.load(f)
        
        # Process the JSON - returns data ready for Word generator
        summarized_data = summarizer.summarize_json(input_data)
        
        if summarized_data is None:
            print("Analysis failed!")
            return None
        
        # Determine output path
        if output_path is None:
            output_path = file_path.replace('.json', '_analyzed.json')
        
        # Save analyzed JSON
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(summarized_data, f, indent=2, ensure_ascii=False)
        
        print(f"\nAnalyzed JSON saved to: {output_path}")
        print(f"Output format: Compatible with Word document generator")
        return summarized_data
        
    except Exception as e:
        print(f"Error processing JSON file: {e}")
        return None

if __name__ == "__main__":
    # Example usage with the provided input format
    test_data = {
        'Idea to Market': {
            'Product Design & Engineering': {
                'content': "Today they use Genesis today for recipe development. 95% are formulas are provided by the customer.",
                'images': {}
            }
        },
        'Source to Pay (S2P)': {
            'General Notes & "Wish List"': {
                'content': 'Procure to Pay Wednesday, November 19, 2025 10:59 AM Some raw materials are customer specific',
                'images': {}
            }
        }
    }
    
    try:
        summarizer = JSONContentSummarizer()
        result = summarizer.summarize_json(test_data)
        if result:
            print("\n" + "=" * 80)
            print("OUTPUT STRUCTURE (READY FOR WORD GENERATOR):")
            print("=" * 80)
            print(json.dumps(result, indent=2))
            print("\n" + "=" * 80)
            print("USAGE WITH WORD GENERATOR:")
            print("=" * 80)
            print("from word_generator import generate_document_in_memory")
            print("document_bytes = generate_document_in_memory('template.docx', result)")
    except Exception as e:
        print(f"Error: {e}")