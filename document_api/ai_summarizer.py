import os
import json
import re
from typing import Dict, Any, List
from langchain_openai import AzureChatOpenAI
from langchain_core.prompts import PromptTemplate
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

class JSONContentSummarizer:
    def __init__(self, bullet_points=False):
        """Initialize the summarizer with Azure OpenAI configuration from environment variables"""
        self.bullet_points = bullet_points
        
        # Load configuration from environment variables
        endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
        deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT")
        subscription_key = os.getenv("AZURE_OPENAI_API_KEY")
        api_version = os.getenv("OPENAI_API_VERSION", "2024-02-15-preview")
        api_type = os.getenv("AZURE_OPENAI_API_TYPE", "azure")
        
        # Validate required environment variables
        if not all([endpoint, deployment, subscription_key, api_version]):
            missing_vars = []
            if not endpoint: missing_vars.append("AZURE_OPENAI_ENDPOINT")
            if not deployment: missing_vars.append("AZURE_OPENAI_DEPLOYMENT")
            if not subscription_key: missing_vars.append("AZURE_OPENAI_API_KEY")
            if not api_version: missing_vars.append("OPENAI_API_VERSION")
            raise ValueError(f"Missing required environment variables: {', '.join(missing_vars)}. Please set these environment variables.")
        
        # Set up Azure OpenAI environment variables
        os.environ["AZURE_OPENAI_ENDPOINT"] = endpoint
        os.environ["AZURE_OPENAI_API_KEY"] = subscription_key
        os.environ["AZURE_OPENAI_API_VERSION"] = api_version
        os.environ["OPENAI_API_VERSION"] = api_version
        os.environ["AZURE_OPENAI_API_TYPE"] = api_type
        
        print("Environment variables loaded successfully!")
        
        # Initialize LangChain Azure ChatOpenAI with higher token limit
        self.llm = AzureChatOpenAI(
            deployment_name=deployment,
            api_version=api_version,
            temperature=0.3,
            max_tokens=4000
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