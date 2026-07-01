#!/usr/bin/env python3
"""
Docx To JSON Converter Function - Azure Ready
--------------------------------------------

Converts a .docx file to JSON format with sequential content extraction.
Extracts paragraphs, tables, and images from Word documents in EXACT SEQUENTIAL ORDER.
Memory-based approach suitable for cloud deployment.
"""

import os
import json
import base64
from datetime import datetime
from typing import Any, Dict, List
from docx import Document
from docx.text.paragraph import Paragraph
from docx.table import Table
from docx.oxml.text.paragraph import CT_P
from docx.oxml.table import CT_Tbl

def human_ts(ts: float) -> str:
    """Convert timestamp to human-readable format."""
    return datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M:%S")

def iter_block_items(parent):
    """
    Generate a reference to each paragraph and table child within *parent*, 
    in document order. Each returned value is an instance of either Table or Paragraph.
    """
    if hasattr(parent, 'element'):
        parent_elm = parent.element.body if hasattr(parent.element, 'body') else parent.element
    else:
        parent_elm = parent

    for child in parent_elm:
        if isinstance(child, CT_P):
            yield Paragraph(child, parent)
        elif isinstance(child, CT_Tbl):
            yield Table(child, parent)

def extract_images_from_document(doc: Document) -> Dict[str, Dict[str, Any]]:
    """Extract all images from document and return mapping by rId."""
    images = {}
    
    try:
        for rel in doc.part.rels.values():
            if hasattr(rel, 'target_part') and hasattr(rel.target_part, 'content_type'):
                if "image" in rel.target_part.content_type:
                    rId = rel.rId
                    blob = rel.target_part.blob
                    target_ref = getattr(rel, "target_ref", f"media/{rId}")
                    filename = os.path.basename(str(target_ref)) or f"{rId}.bin"
                    content_type = rel.target_part.content_type
                    
                    images[rId] = {
                        "id": rId,
                        "filename": filename,
                        "content_type": content_type,
                        "blob": blob
                    }
    except Exception as e:
        print(f"Warning: Error extracting images: {e}")
    
    return images

def get_paragraph_images(paragraph: Paragraph) -> List[str]:
    """Get all image rIds from a paragraph in order."""
    image_rids = []
    
    try:
        # Method 1: Look for drawing elements (modern format)
        for run in paragraph.runs:
            for elem in run._element.iter():
                if elem.tag.endswith('}blip'):
                    embed_attr = elem.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed')
                    if embed_attr:
                        image_rids.append(embed_attr)
        
        # Method 2: Look for VML shapes (older format)
        for elem in paragraph._element.iter():
            if elem.tag.endswith('}imagedata'):
                id_attr = elem.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
                if id_attr:
                    image_rids.append(id_attr)
                
    except Exception as e:
        print(f"Warning: Error getting paragraph images: {e}")
    
    return image_rids

def extract_docx_sequence_memory(docx_path: str) -> Dict[str, Any]:
    """Extract docx content in exact sequential order - memory optimized."""
    doc = Document(docx_path)
    sequence = []
    
    # Extract all images first
    all_images = extract_images_from_document(doc)
    
    print(f"Processing document: {os.path.basename(docx_path)}")
    print(f"Found {len(all_images)} images in document")
    
    # Process each block item in document order
    item_count = {'paragraph': 0, 'table': 0, 'image': 0}
    
    for block_item in iter_block_items(doc):
        if isinstance(block_item, Paragraph):
            # Process paragraph
            text = block_item.text.strip()
            if text:
                sequence.append({"type": "paragraph", "content": text})
                item_count['paragraph'] += 1
                print(f"Added paragraph: '{text[:50]}...'" if len(text) > 50 else f"Added paragraph: '{text}'")
            
            # Check for images in this paragraph
            image_rids = get_paragraph_images(block_item)
            for rId in image_rids:
                if rId in all_images:
                    img_info = all_images[rId]
                    
                    # Always embed as base64 for cloud deployment
                    img_data = {
                        "type": "image",
                        "id": img_info["id"],
                        "filename": img_info["filename"],
                        "content_type": img_info["content_type"],
                        "content": base64.b64encode(img_info["blob"]).decode("utf-8")
                    }
                    
                    sequence.append(img_data)
                    item_count['image'] += 1
                    print(f"Added image: {img_info['filename']} ({img_info['content_type']})")
                    
        elif isinstance(block_item, Table):
            # Process table
            table_data = []
            for row in block_item.rows:
                row_data = [cell.text.strip() for cell in row.cells]
                table_data.append(row_data)
            
            sequence.append({"type": "table", "content": table_data})
            item_count['table'] += 1
            print(f"Added table with {len(table_data)} rows and {len(table_data[0]) if table_data else 0} columns")
    
    print(f"Final count - Paragraphs: {item_count['paragraph']}, Tables: {item_count['table']}, Images: {item_count['image']}")
    print(f"Total items in sequence: {len(sequence)}")
    
    # File metadata
    try:
        st = os.stat(docx_path)
        meta = {
            "name": os.path.basename(docx_path),
            "folder": os.path.basename(os.path.dirname(docx_path)),
            "path": os.path.abspath(docx_path),
            "size_bytes": st.st_size,
            "modified": human_ts(st.st_mtime),
            "created": human_ts(st.st_ctime),
        }
    except:
        # Fallback metadata if file stat fails
        meta = {
            "name": os.path.basename(docx_path),
            "folder": "unknown",
            "path": docx_path,
            "size_bytes": 0,
            "modified": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "created": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        }
    
    return {"file": meta, "sequence": sequence}

def convert_docx_to_json_memory(input_file_path: str) -> Dict[str, Any]:
    """
    Convert a DOCX file to JSON format - memory optimized for cloud deployment.
    
    Args:
        input_file_path (str): Full path to the input .docx file
    
    Returns:
        Dict[str, Any]: JSON data structure or None if failed
    """
    
    # Validate input file
    if not os.path.exists(input_file_path):
        print(f"Input file not found: {input_file_path}")
        return None
    
    if not input_file_path.lower().endswith('.docx'):
        print(f"Input file must be a .docx file: {input_file_path}")
        return None
    
    print(f"Processing: {input_file_path}")
    
    try:
        # Extract document content
        data = extract_docx_sequence_memory(input_file_path)
        
        print(f"Conversion completed successfully")
        return data
        
    except Exception as e:
        print(f"Error during conversion: {e}")
        return None

def convert_docx_to_json(
    input_file_path: str, 
    output_base_dir: str = "Output JSON", 
    save_images_as_files: bool = False
) -> str:
    """
    Legacy function for backward compatibility - converts DOCX and saves to file.
    For cloud deployment, use convert_docx_to_json_memory instead.
    """
    
    # Get JSON data
    json_data = convert_docx_to_json_memory(input_file_path)
    
    if not json_data:
        return None
    
    # Extract folder name from input path
    input_dir = os.path.dirname(input_file_path)
    folder_name = os.path.basename(input_dir)
    
    # Create output directory structure
    output_subfolder = os.path.join(output_base_dir, folder_name)
    os.makedirs(output_subfolder, exist_ok=True)
    
    # Create output JSON file path
    base_name = os.path.splitext(os.path.basename(input_file_path))[0]
    json_filename = f"{base_name}.json"
    output_json_path = os.path.join(output_subfolder, json_filename)
    
    # Save JSON file
    with open(output_json_path, "w", encoding="utf-8") as f:
        json.dump(json_data, f, indent=2, ensure_ascii=False)
    
    print(f"JSON saved: {output_json_path}")
    return output_json_path

if __name__ == "__main__":
    # Example usage for testing
    sample_input = "test_document.docx"
    
    if os.path.exists(sample_input):
        # Test memory-based conversion
        json_data = convert_docx_to_json_memory(sample_input)
        if json_data:
            print("Memory conversion successful!")
            print(f"Sequence items: {len(json_data.get('sequence', []))}")
        else:
            print("Memory conversion failed!")
    else:
        print(f"Test file not found: {sample_input}")
        print("To test, provide a valid .docx file path")