import io
import json
import logging
import os
import re
import threading
import uuid
from datetime import datetime

import requests
from azure.storage.blob import BlobServiceClient
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request, send_file
from werkzeug.utils import secure_filename

from sherlock_vtt_client import (
    get_vtt_json_from_bytes,
    is_vtt_file,
    merge_vtt_json_into_master,
)
from tavily_search import enrich_master_data_with_web

load_dotenv()

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'your-secret-key-here')

# ─────────────────────────────────────────────
# Logging — write to app.log AND stdout
# ─────────────────────────────────────────────
_log_path = os.path.join(os.path.dirname(__file__), 'app.log')
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    handlers=[logging.FileHandler(_log_path), logging.StreamHandler()],
)
logger = logging.getLogger('sherlock-web')
app.logger.handlers = logger.handlers
app.logger.setLevel(logging.INFO)

AZURE_CONNECTION_STRING = os.environ.get('AZURE_CONNECTION_STRING', '')
CONTAINER_NAME = os.environ.get('CONTAINER_NAME', 'documents')
FASTAPI_ENDPOINT_1 = os.environ.get('FASTAPI_ENDPOINT_1', 'http://127.0.0.1:5050/docx-to-parsed-json')
FASTAPI_ENDPOINT_2 = os.environ.get('FASTAPI_ENDPOINT_2', 'http://127.0.0.1:5050/summarize-json')
FASTAPI_ENDPOINT_3 = os.environ.get('FASTAPI_ENDPOINT_3', 'http://127.0.0.1:5050/process-json')

ALLOWED_FOLDERS = {'input', 'output'}
PROSPECT_NAME_RE = re.compile(r'^[\w\s\-]{1,128}$')

# ─────────────────────────────────────────────
# In-memory job tracker  {job_id: {...}}
# ─────────────────────────────────────────────
jobs = {}
jobs_lock = threading.Lock()

# Per-prospect locks for master_data.json read-modify-write safety.
_prospect_locks = {}
_prospect_locks_guard = threading.Lock()


def get_prospect_lock(prospect_name):
    with _prospect_locks_guard:
        lock = _prospect_locks.get(prospect_name)
        if lock is None:
            lock = threading.Lock()
            _prospect_locks[prospect_name] = lock
        return lock


def set_job(job_id, **kwargs):
    with jobs_lock:
        if job_id not in jobs:
            jobs[job_id] = {}
        jobs[job_id].update(kwargs)


def get_job(job_id):
    with jobs_lock:
        return dict(jobs.get(job_id, {}))


# ─────────────────────────────────────────────
# Validation helpers — defend against path traversal
# ─────────────────────────────────────────────
def safe_prospect(name):
    if not isinstance(name, str):
        return None
    cleaned = name.strip()
    if not cleaned or '/' in cleaned or '\\' in cleaned or '..' in cleaned:
        return None
    if not PROSPECT_NAME_RE.match(cleaned):
        return None
    return cleaned


def safe_folder(folder):
    return folder if folder in ALLOWED_FOLDERS else None


def safe_filename(name):
    if not isinstance(name, str):
        return None
    cleaned = name.strip()
    if not cleaned or '/' in cleaned or '\\' in cleaned or cleaned.startswith('.') or '..' in cleaned:
        return None
    return cleaned


# ─────────────────────────────────────────────
# Azure helpers
# ─────────────────────────────────────────────
def get_blob_service_client():
    return BlobServiceClient.from_connection_string(AZURE_CONNECTION_STRING)


def get_container_client():
    return get_blob_service_client().get_container_client(CONTAINER_NAME)


def ensure_container_exists():
    try:
        get_blob_service_client().create_container(CONTAINER_NAME)
    except Exception:
        # Container already exists or transient error; safe to continue.
        pass


def get_all_prospects():
    try:
        container_client = get_container_client()
        blobs = list(container_client.list_blobs())
        blobs.sort(key=lambda b: b.last_modified, reverse=True)
        prospects = {}
        for blob in blobs:
            parts = blob.name.split('/')
            if len(parts) > 0 and parts[0] not in prospects:
                prospect_name = parts[0]
                desc = get_prospect_description(prospect_name)
                prospects[prospect_name] = {'prospect_name': prospect_name, 'description': desc}
        return list(prospects.values())
    except Exception:
        logger.exception("get_all_prospects failed")
        return []


def get_prospect_description(prospect_name):
    try:
        container_client = get_container_client()
        blob_client = container_client.get_blob_client(f"{prospect_name}/metadata.json")
        data = blob_client.download_blob().readall()
        return json.loads(data).get('description', '')
    except Exception:
        return ''


def save_prospect_metadata(prospect_name, description):
    try:
        container_client = get_container_client()
        metadata = {'prospect_name': prospect_name, 'description': description}
        container_client.upload_blob(
            name=f"{prospect_name}/metadata.json",
            data=json.dumps(metadata).encode('utf-8'),
            overwrite=True,
        )
        container_client.upload_blob(name=f"{prospect_name}/input/.keep", data=b'', overwrite=True)
        container_client.upload_blob(name=f"{prospect_name}/output/.keep", data=b'', overwrite=True)
        return True
    except Exception:
        logger.exception("save_prospect_metadata failed for %s", prospect_name)
        return False


HIDDEN_BLOBS = {'.keep', 'metadata.json', 'master_data.json', 'parsed.json'}


def _list_input_blobs(prospect_name, folder):
    """Yield blob objects (with last_modified) for a prospect/folder, hiding internal blobs."""
    container_client = get_container_client()
    for blob in container_client.list_blobs(name_starts_with=f"{prospect_name}/{folder}/"):
        filename = blob.name.split('/')[-1]
        if filename and filename not in HIDDEN_BLOBS:
            yield blob


def get_prospect_files(prospect_name, folder):
    """Backwards-compatible: returns just filenames. Sorted alphabetically."""
    try:
        return sorted(b.name.split('/')[-1] for b in _list_input_blobs(prospect_name, folder))
    except Exception:
        logger.exception("get_prospect_files failed for %s/%s", prospect_name, folder)
        return []


def get_latest_supported_file(prospect_name):
    """Return the filename of the most-recently-uploaded supported file in /input, or None."""
    try:
        candidates = []
        for blob in _list_input_blobs(prospect_name, 'input'):
            name = blob.name.split('/')[-1]
            if name.lower().endswith('.docx') or is_vtt_file(name):
                candidates.append((blob.last_modified, name))
        if not candidates:
            return None
        candidates.sort(key=lambda x: x[0], reverse=True)
        return candidates[0][1]
    except Exception:
        logger.exception("get_latest_supported_file failed for %s", prospect_name)
        return None


def upload_to_azure(prospect_name, folder, filename, data):
    try:
        container_client = get_container_client()
        blob_path = f"{prospect_name}/{folder}/{filename}"
        container_client.upload_blob(name=blob_path, data=data, overwrite=True)
        return True
    except Exception:
        logger.exception("upload_to_azure failed for %s/%s/%s", prospect_name, folder, filename)
        return False


def download_from_azure(blob_path):
    try:
        container_client = get_container_client()
        blob_client = container_client.get_blob_client(blob_path)
        return blob_client.download_blob().readall()
    except Exception:
        logger.exception("download_from_azure failed for %s", blob_path)
        return None


# ─────────────────────────────────────────────
# Merge helpers — schema-tolerant (no KeyError on missing 'images')
# ─────────────────────────────────────────────
def _merge_section_entry(target_entry, incoming_entry):
    """Merge incoming {'content': ..., 'images': {...}} into target in place."""
    if not isinstance(target_entry, dict):
        target_entry = {'content': str(target_entry) if target_entry is not None else ''}
    target_entry.setdefault('content', '')
    target_entry.setdefault('images', {})

    incoming_content = incoming_entry.get('content', '') if isinstance(incoming_entry, dict) else str(incoming_entry or '')
    incoming_images = incoming_entry.get('images', {}) if isinstance(incoming_entry, dict) else {}

    if incoming_content:
        if target_entry['content']:
            target_entry['content'] = target_entry['content'] + '\n\n' + incoming_content
        else:
            target_entry['content'] = incoming_content
    if isinstance(incoming_images, dict):
        target_entry['images'].update(incoming_images)
    return target_entry


def _merge_section_tree(target, incoming, content_join='\n\n'):
    """Merge incoming section tree into target {section: {field: {content, images}}}."""
    for section_name, section_data in incoming.items():
        if not isinstance(section_data, dict):
            target[section_name] = section_data
            continue
        if section_name not in target or not isinstance(target[section_name], dict):
            target[section_name] = {}
        for field_name, field_value in section_data.items():
            if field_name in target[section_name]:
                target[section_name][field_name] = _merge_section_entry(
                    target[section_name][field_name], field_value
                )
            else:
                target[section_name][field_name] = field_value
    return target


# ─────────────────────────────────────────────
# DOCX parser sanity-check
# ─────────────────────────────────────────────
# The Sherlock API's /docx-to-parsed-json endpoint splits an uploaded docx
# into named sections by matching paragraph text against a fixed list of
# canonical SAP workstream headings (e.g. "Lead to Cash (L2C)"). If the
# input is a free-form meeting transcript with no such headings — which is
# the common case for customers — the parser silently discards every
# paragraph, returns {} (or a near-empty dict), and the downstream LLM
# summarizer has nothing to work with. The result is a Discovery Profile
# with mostly empty sections.
#
# This function detects that failure mode so the pipeline can fall back to
# the VTT path, which uses an LLM to extract structured profile data from
# free-form transcripts directly.
DOCX_PARSE_MIN_TOTAL_CONTENT_CHARS = 200  # below this threshold, treat as "didn't extract anything useful"


def _parsed_data_total_content_chars(parsed_data) -> int:
    """Sum the length of all 'content' strings across every (section, field)
    in the parser's output. Tolerant of missing keys / non-dict values so a
    malformed payload counts as 0 rather than crashing."""
    if not isinstance(parsed_data, dict):
        return 0
    total = 0
    for section_value in parsed_data.values():
        if not isinstance(section_value, dict):
            continue
        for field_value in section_value.values():
            if isinstance(field_value, dict):
                content = field_value.get('content', '')
            else:
                content = field_value
            if isinstance(content, str):
                total += len(content.strip())
    return total


def _is_docx_parse_effectively_empty(parsed_data) -> bool:
    """True when the docx parser found no recognised sections, or found some
    but extracted essentially no text into them. Used to trigger the VTT
    fallback for transcripts that don't carry canonical SAP section headings."""
    if not parsed_data or not isinstance(parsed_data, dict):
        return True
    return _parsed_data_total_content_chars(parsed_data) < DOCX_PARSE_MIN_TOTAL_CONTENT_CHARS


# ─────────────────────────────────────────────
# Pipeline (runs in a background thread)
# ─────────────────────────────────────────────
def process_pipeline(prospect_name, filename, file_data, job_id=None, internet_search=False):
    """
    Routes by file type:
      - .docx → FastAPI Steps 1 & 2 (parse + summarize); falls back to VTT only on transport errors
      - .vtt / .txt / .doc / .md → Sherlock AI VTT API directly
    Both paths converge on Step 3 (Word doc generation). If internet_search is True,
    master_data is gap-filled with Tavily web research between merging and Step 3.
    """
    def _update(step, status, message='', output_file=''):
        if job_id:
            set_job(job_id, step=step, status=status, message=message, output_file=output_file)

    prospect_lock = get_prospect_lock(prospect_name)

    try:
        with prospect_lock:
            master_data_path = f"{prospect_name}/input/master_data.json"
            existing_master = download_from_azure(master_data_path)
            master_data = json.loads(existing_master) if existing_master else {}

            # Always (re)stamp the prospect name so the renderer can fill the
            # {{ prospect_name }} placeholder on the cover page. Set it before
            # any merge so it cannot be wiped.
            master_data['prospect_name'] = prospect_name

            use_vtt = is_vtt_file(filename)
            docx_failed_reason = None

            if not use_vtt:
                _update(step=1, status='running', message='Converting DOCX to JSON...')
                try:
                    files = {
                        'file': (
                            filename,
                            file_data,
                            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                        )
                    }
                    response_1 = requests.post(FASTAPI_ENDPOINT_1, files=files, timeout=120)
                    response_1.raise_for_status()
                    new_parsed_data = response_1.json()
                    if 'parsed_data' in new_parsed_data:
                        new_parsed_data = new_parsed_data['parsed_data']

                    # Sanity-check: did the parser actually extract anything?
                    # The /docx-to-parsed-json endpoint only recognises
                    # paragraphs whose text exactly matches one of the
                    # canonical SAP workstream headings. Free-form meeting
                    # transcripts have no such headings, so the parser drops
                    # every paragraph and returns {} (or near-empty). When
                    # that happens we MUST NOT continue down the docx path —
                    # the LLM summarizer would just produce empty sections.
                    # Instead, fall back to the VTT pipeline, which uses an
                    # LLM to extract structured profile data from raw
                    # transcript text and is built precisely for this case.
                    if _is_docx_parse_effectively_empty(new_parsed_data):
                        total_chars = _parsed_data_total_content_chars(new_parsed_data)
                        docx_failed_reason = (
                            f"DOCX parser extracted no recognisable sections "
                            f"(total content: {total_chars} chars across "
                            f"{len(new_parsed_data) if isinstance(new_parsed_data, dict) else 0} "
                            f"sections). The file appears to be a free-form "
                            f"transcript without canonical SAP section "
                            f"headings; routing through VTT/LLM extraction "
                            f"path instead."
                        )
                        logger.warning(docx_failed_reason)
                        _update(step=1, status='running',
                                message='DOCX has no canonical SAP headings — '
                                        'routing to AI transcript extractor...')
                        use_vtt = True
                        # Skip parsed.json persistence and the summarize call;
                        # the VTT branch below will produce master_data
                        # directly from the raw transcript text.
                    else:
                        parsed_json_path = f"{prospect_name}/input/parsed.json"
                        existing_parsed = download_from_azure(parsed_json_path)
                        parsed_master = json.loads(existing_parsed) if existing_parsed else {}
                        _merge_section_tree(parsed_master, new_parsed_data)

                        upload_to_azure(
                            prospect_name, 'input', 'parsed.json',
                            json.dumps(parsed_master, indent=2).encode('utf-8'),
                        )

                        _update(step=2, status='running', message='AI summarising content...')
                        response_2 = requests.post(
                            FASTAPI_ENDPOINT_2,
                            json={'parsed_data': new_parsed_data},
                            headers={'Content-Type': 'application/json'},
                            timeout=300,
                        )
                        response_2.raise_for_status()
                        new_summarized_data = response_2.json()
                        if 'summarized_data' in new_summarized_data:
                            new_summarized_data = new_summarized_data['summarized_data']

                        _merge_section_tree(master_data, new_summarized_data)
                        upload_to_azure(
                            prospect_name, 'input', 'master_data.json',
                            json.dumps(master_data, indent=2).encode('utf-8'),
                        )

                except requests.exceptions.RequestException as e:
                    docx_failed_reason = f"DOCX FastAPI unreachable: {e}"
                    logger.warning("DOCX path transport error, falling back to VTT: %s", e)
                    use_vtt = True

            if use_vtt:
                _update(step=1, status='running',
                        message='Sending transcript to Sherlock AI VTT...')
                vtt_json = get_vtt_json_from_bytes(
                    [(filename, file_data)], prospect_name=prospect_name
                )
                master_data = merge_vtt_json_into_master(master_data, vtt_json)

                _update(step=2, status='running', message='Merging profile into master data...')
                upload_to_azure(
                    prospect_name, 'input', 'master_data.json',
                    json.dumps(master_data, indent=2).encode('utf-8'),
                )
                if docx_failed_reason:
                    logger.info("VTT fallback succeeded after: %s", docx_failed_reason)

            # ── Optional: fill missing fields with Tavily web research ────────
            # Tavily is scoped to Section 1 (Customer/Business Overview) only,
            # so any non-zero fill count means Section 1 was enriched and we
            # need to flag it for the renderer (it will inject a fact-check
            # disclaimer immediately under the Section 1 heading).
            if internet_search:
                _update(step=2, status='running',
                        message='Filling missing fields from the web...')
                try:
                    _, filled_count = enrich_master_data_with_web(
                        master_data, prospect_name, logger=logger.info
                    )
                    if filled_count:
                        master_data['_internet_research_used'] = True
                        _update(step=2, status='running',
                                message=f'Filled {filled_count} missing field(s) from the web')
                except Exception:
                    logger.exception("Internet search enrichment failed; continuing without it")
                # Always persist whatever we have, even on partial failure.
                upload_to_azure(
                    prospect_name, 'input', 'master_data.json',
                    json.dumps(master_data, indent=2).encode('utf-8'),
                )

            # ── Step 3: generate Word document ────────────────────────────────
            _update(step=3, status='running', message='Generating Word document...')
            response_3 = requests.post(
                FASTAPI_ENDPOINT_3,
                json={'summarized_data': master_data},
                headers={'Content-Type': 'application/json'},
                timeout=300,
            )
            response_3.raise_for_status()

            all_input_files = get_prospect_files(prospect_name, 'input')
            total_files = len(all_input_files)
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            file_range = "File1" if total_files == 1 else f"Files1-{total_files}"
            output_filename = f"output_{prospect_name}_{file_range}_{timestamp}.docx"

            upload_to_azure(prospect_name, 'output', output_filename, response_3.content)

        _update(step=3, status='done', message='Document ready!', output_file=output_filename)
        return True

    except Exception as e:
        logger.exception("Pipeline error for prospect %s", prospect_name)
        _update(step=0, status='error', message=str(e))
        return False


# ─────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────
@app.route('/')
def index():
    ensure_container_exists()
    prospects = get_all_prospects()
    return render_template('index.html', prospects=prospects)


@app.route('/create-prospect')
def create_prospect():
    return render_template('create_prospect.html')


@app.route('/api/prospects')
def api_prospects():
    return jsonify(get_all_prospects())


@app.route('/api/prospect-files/<prospect_name>/<folder>')
def api_prospect_files(prospect_name, folder):
    p = safe_prospect(prospect_name)
    f = safe_folder(folder)
    if not p or not f:
        return jsonify([]), 400
    return jsonify(get_prospect_files(p, f))


@app.route('/save-prospect', methods=['POST'])
def save_prospect():
    data = request.json or {}
    raw = (data.get('prospect_name') or '').strip()
    sanitized = re.sub(r'[^\w\s\-]', '', raw).strip()
    p = safe_prospect(sanitized)
    if not p:
        return jsonify({'success': False, 'error': 'Invalid prospect name'}), 400
    description = (data.get('description') or '').strip()
    if save_prospect_metadata(p, description):
        return jsonify({'success': True, 'prospect_name': p})
    return jsonify({'success': False}), 500


@app.route('/upload', methods=['POST'])
def upload_file():
    raw_prospect = request.form.get('prospect_name')
    file = request.files.get('file')
    if not file or not raw_prospect:
        return jsonify({'success': False, 'error': 'Missing file or prospect'}), 400

    p = safe_prospect(raw_prospect)
    if not p:
        return jsonify({'success': False, 'error': 'Invalid prospect name'}), 400

    filename = secure_filename(file.filename or '')
    if not filename or not safe_filename(filename):
        return jsonify({'success': False, 'error': 'Invalid filename'}), 400

    file_data = file.read()
    if not file_data:
        return jsonify({'success': False, 'error': 'Empty file'}), 400

    if upload_to_azure(p, 'input', filename, file_data):
        return jsonify({'success': True})
    return jsonify({'success': False, 'error': 'Upload failed'}), 500


@app.route('/generate', methods=['POST'])
def generate():
    """
    Starts the pipeline in a BACKGROUND THREAD and immediately returns a job_id.
    The browser polls /api/job-status/<job_id> to track progress.
    """
    data = request.get_json() or {}
    p = safe_prospect(data.get('prospect_name'))
    if not p:
        return jsonify({'success': False, 'error': 'Invalid or missing prospect name'}), 400

    internet_search = bool(data.get('internet_search', False))

    latest_file = get_latest_supported_file(p)
    if not latest_file:
        return jsonify({'success': False,
                        'error': 'No supported files found (DOCX, VTT, TXT)'}), 400

    file_data = download_from_azure(f"{p}/input/{latest_file}")
    if not file_data:
        return jsonify({'success': False, 'error': 'Failed to download file'}), 500

    job_id = str(uuid.uuid4())
    set_job(job_id, step=0, status='starting', message='Job queued…',
            output_file='', prospect_name=p)

    t = threading.Thread(
        target=process_pipeline,
        args=(p, latest_file, file_data, job_id, internet_search),
        daemon=True,
    )
    t.start()

    return jsonify({'success': True, 'job_id': job_id})


@app.route('/api/job-status/<job_id>')
def job_status(job_id):
    job = get_job(job_id)
    if not job:
        return jsonify({'status': 'not_found'}), 404
    return jsonify(job)


@app.route('/view-prospect/<prospect_name>')
def view_prospect(prospect_name):
    p = safe_prospect(prospect_name)
    if not p:
        return "Invalid prospect name", 400
    input_files = get_prospect_files(p, 'input')
    output_files = get_prospect_files(p, 'output')
    return render_template('view_prospect.html',
                           prospect_name=p,
                           input_files=input_files,
                           output_files=output_files)


@app.route('/delete-file/<prospect_name>/<folder>/<filename>', methods=['POST'])
def delete_file(prospect_name, folder, filename):
    p = safe_prospect(prospect_name)
    f = safe_folder(folder)
    fn = safe_filename(filename)
    if not p or not f or not fn:
        return jsonify({'success': False, 'error': 'Invalid path'}), 400
    try:
        get_container_client().delete_blob(f"{p}/{f}/{fn}")
        return jsonify({'success': True})
    except Exception as e:
        logger.exception("delete_file failed for %s/%s/%s", p, f, fn)
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/preview/<prospect_name>/<folder>/<filename>')
def preview_file(prospect_name, folder, filename):
    """Convert DOCX to HTML for in-browser preview using mammoth."""
    p = safe_prospect(prospect_name)
    f = safe_folder(folder)
    fn = safe_filename(filename)
    if not p or not f or not fn:
        return "Invalid path", 400
    try:
        file_data = download_from_azure(f"{p}/{f}/{fn}")
        if not file_data:
            return "File not found", 404
        import mammoth
        result = mammoth.convert_to_html(io.BytesIO(file_data))
        html_content = result.value
        full_html = f"""<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<style>
  body {{ font-family: Arial, sans-serif; max-width: 900px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #333; }}
  table {{ border-collapse: collapse; width: 100%; margin: 1em 0; }}
  td, th {{ border: 1px solid #ccc; padding: 8px 12px; }}
  th {{ background: #f0f0f0; }}
  img {{ max-width: 100%; }}
  h1,h2,h3,h4 {{ color: #0072bc; }}
</style>
</head><body>{html_content}</body></html>"""
        return full_html
    except Exception as e:
        logger.exception("preview_file failed for %s/%s/%s", p, f, fn)
        return f"Preview error: {str(e)}", 500


@app.route('/delete-prospect/<prospect_name>', methods=['POST'])
def delete_prospect(prospect_name):
    p = safe_prospect(prospect_name)
    if not p:
        return jsonify({'success': False, 'error': 'Invalid prospect name'}), 400
    try:
        container_client = get_container_client()
        deleted = 0
        for blob in container_client.list_blobs(name_starts_with=f"{p}/"):
            container_client.delete_blob(blob.name)
            deleted += 1
        logger.info("delete_prospect %s deleted %d blob(s)", p, deleted)
        return jsonify({'success': True})
    except Exception as e:
        logger.exception("delete_prospect failed for %s", p)
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/download/<prospect_name>/<folder>/<filename>')
def download_file(prospect_name, folder, filename):
    p = safe_prospect(prospect_name)
    f = safe_folder(folder)
    fn = safe_filename(filename)
    if not p or not f or not fn:
        return "Invalid path", 400
    try:
        file_data = download_from_azure(f"{p}/{f}/{fn}")
        if not file_data:
            return "File not found", 404
        return send_file(
            io.BytesIO(file_data),
            mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            as_attachment=True,
            download_name=fn,
        )
    except Exception as e:
        logger.exception("download_file failed for %s/%s/%s", p, f, fn)
        return f"Error downloading file: {str(e)}", 500


if __name__ == '__main__':
    # Default to localhost-only because debug=True exposes the Werkzeug
    # debugger (which allows arbitrary code execution). Override via env
    # FLASK_HOST=0.0.0.0 if you need network access — and set FLASK_DEBUG=False
    # in that case.
    host = os.environ.get('FLASK_HOST', '127.0.0.1')
    debug = os.environ.get('FLASK_DEBUG', 'True').lower() in ('1', 'true', 'yes')
    port = int(os.environ.get('FLASK_PORT', '5001'))
    app.run(debug=debug, host=host, port=port)
