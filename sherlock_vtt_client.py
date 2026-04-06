import copy
import time
import requests
import os

VTT_API_BASE = os.environ.get(
    'VTT_API_BASE',
    'https://ndbs-aiml-sherlockaiteamstranscript-ewgucedve0cad6e2.westeurope-01.azurewebsites.net'
).rstrip('/')

VTT_SUPPORTED_EXTENSIONS = {'.vtt', '.txt', '.doc', '.md'}


def is_vtt_file(filename):
    ext = os.path.splitext(filename.lower())[1]
    return ext in VTT_SUPPORTED_EXTENSIONS


def get_vtt_json_from_bytes(file_tuples, timeout_upload=60, poll_interval=3, timeout_fetch=60):
    """
    Upload transcript files to Sherlock AI VTT, wait for processing,
    and return the extracted structured JSON.

    file_tuples: list of (filename, file_bytes) tuples
    Returns: dict — the structured SAP Customer Discovery Profile JSON
    Raises: Exception on upload error, processing error, or timeout
    """
    files = [
        ('files', (name, data, 'application/octet-stream'))
        for name, data in file_tuples
    ]

    r = requests.post(f'{VTT_API_BASE}/process', files=files, timeout=timeout_upload)
    r.raise_for_status()

    job_id = r.json().get('job_id')
    if not job_id:
        raise Exception('Sherlock AI VTT did not return a job_id')

    while True:
        s = requests.get(f'{VTT_API_BASE}/status/{job_id}', timeout=15).json()
        status = s.get('status')

        if status == 'done':
            break
        if status == 'error':
            raise Exception(f"Sherlock AI VTT processing error: {s.get('error', 'unknown')}")

        time.sleep(poll_interval)

    result = requests.get(f'{VTT_API_BASE}/json/{job_id}', timeout=timeout_fetch)
    result.raise_for_status()
    return result.json()


def merge_vtt_json_into_master(master, vtt_json):
    """
    Merge Sherlock AI VTT output JSON into an existing master_data dict.
    Appends new content to existing content — never overwrites.

    master:   dict — existing master_data (may be empty {})
    vtt_json: dict — JSON returned by /json/{job_id}
    Returns:  dict — merged result (deep copy, original untouched)
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
