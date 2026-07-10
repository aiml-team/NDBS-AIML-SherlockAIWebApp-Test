import io
import json
import logging
import os
import re
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

from azure.storage.blob import BlobServiceClient
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_file, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename

from vtt import run_vtt_pipeline, is_vtt_file, merge_vtt_json_into_master
from document_api import docx_to_parsed, summarize, render_docx, classify_industry_llm, gap_fill
from tavily_search import enrich_master_data_with_web
import auth as auth_module
import admin as admin_module
import feedback as feedback_module

load_dotenv()

app = Flask(__name__, static_folder=None)
app.secret_key = os.environ.get('SECRET_KEY', 'your-secret-key-here')

from datetime import timedelta
app.config.update(
    PERMANENT_SESSION_LIFETIME=timedelta(days=int(os.environ.get('SESSION_LIFETIME_DAYS', '7'))),
    SESSION_COOKIE_SAMESITE='Lax',
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SECURE=os.environ.get('SESSION_COOKIE_SECURE', 'false').lower() in ('1', 'true', 'yes'),
)

CORS(
    app,
    origins=[o.strip() for o in os.environ.get('CORS_ORIGINS', 'http://localhost:5173').split(',') if o.strip()],
    supports_credentials=True,
)

auth_module.init_db()
auth_module.register_routes(app)
admin_module.register_routes(app)
feedback_module.register_routes(app)
require_auth = auth_module.require_auth

# ── Logging ─────────────────────────────────────────────────────────────────
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
TEMPLATE_PATH = os.path.join(os.path.dirname(__file__), os.environ.get('TEMPLATE_FILE', 'word_template.docx'))

STATIC_DIR = os.path.join(os.path.dirname(__file__), 'static')

ALLOWED_FOLDERS = {'input', 'output'}
PROSPECT_NAME_RE = re.compile(r'^[\w\s\-]{1,128}$')

# ── Job tracker ─────────────────────────────────────────────────────────────
jobs = {}
jobs_lock = threading.Lock()
JOBS_BLOB_PREFIX = '_jobs/'

_prospect_locks = {}
_prospect_locks_guard = threading.Lock()

_EXISTING_BULLET_RE = re.compile(r'^[-*•]\s*')
_BULLET_STRIP_RE = re.compile(r'^[•\-*]\s*')

_SUMMARY_CANDIDATES = [
    ('General_Business_Overview', 'Industry_Categorization'),
    ('General Business Overview', 'Industry Categorization'),
    ('General_Business_Overview', 'Key_Value_Drivers'),
    ('General Business Overview', 'Key Value Drivers'),
    ('General_Business_Overview', 'Motivations_for_Transformation'),
    ('General_Business_Overview', 'System_Landscape'),
    ('General_Business_Overview', 'Schedule_of_Events'),
]


def _extract_prospect_summary(master_data):
    def _first_line(content):
        if not isinstance(content, str):
            return ''
        for line in content.split('\n'):
            text = _BULLET_STRIP_RE.sub('', line.strip()).strip()
            if text:
                return text[:160]
        return ''

    for section_key, field_key in _SUMMARY_CANDIDATES:
        section = master_data.get(section_key)
        if not isinstance(section, dict):
            continue
        field = section.get(field_key)
        content = field.get('content', '') if isinstance(field, dict) else str(field or '')
        line = _first_line(content)
        if line:
            return line

    for section_val in master_data.values():
        if not isinstance(section_val, dict):
            continue
        for field_val in section_val.values():
            content = field_val.get('content', '') if isinstance(field_val, dict) else str(field_val or '')
            line = _first_line(content)
            if line:
                return line

    return ''


_SENTENCE_SPLIT_RE = re.compile(r'(?<=[.!?])\s+')
_IR_HEADER = '[Internet Research]'


def _to_bullets(text):
    out = []
    for line in text.split('\n'):
        stripped = line.strip()
        if not stripped:
            continue
        if stripped == _IR_HEADER or stripped.startswith('• Source:') or stripped.startswith('Source:'):
            out.append(stripped)
            continue
        if stripped.startswith('• '):
            out.append(stripped)
            continue
        clean = _EXISTING_BULLET_RE.sub('', stripped).strip()
        if not clean:
            continue
        if len(clean) > 120 and re.search(r'[.!?]\s', clean):
            parts = _SENTENCE_SPLIT_RE.split(clean)
            for part in parts:
                part = part.strip()
                if part:
                    out.append('• ' + part)
        else:
            out.append('• ' + clean)
    return '\n'.join(out)


def _normalize_bullets(master_data):
    for section_val in master_data.values():
        if not isinstance(section_val, dict):
            continue
        for field_val in section_val.values():
            if not isinstance(field_val, dict):
                continue
            raw = field_val.get('content')
            if not isinstance(raw, str) or not raw.strip():
                continue
            field_val['content'] = _to_bullets(raw)
    return master_data


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
        snapshot = dict(jobs[job_id])
    try:
        cc = get_container_client()
        cc.upload_blob(
            name=f"{JOBS_BLOB_PREFIX}{job_id}.json",
            data=json.dumps(snapshot).encode('utf-8'),
            overwrite=True,
        )
    except Exception:
        pass


def get_job(job_id):
    with jobs_lock:
        if job_id in jobs:
            return dict(jobs[job_id])
    try:
        cc = get_container_client()
        raw = cc.get_blob_client(f"{JOBS_BLOB_PREFIX}{job_id}.json").download_blob().readall()
        data = json.loads(raw)
        with jobs_lock:
            jobs[job_id] = data
        return dict(data)
    except Exception:
        return {}


# ── Validation helpers ───────────────────────────────────────────────────────
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


# ── Azure helpers ────────────────────────────────────────────────────────────
def get_blob_service_client():
    return BlobServiceClient.from_connection_string(AZURE_CONNECTION_STRING)


def get_container_client():
    return get_blob_service_client().get_container_client(CONTAINER_NAME)


def ensure_container_exists():
    try:
        get_blob_service_client().create_container(CONTAINER_NAME)
    except Exception:
        pass


_PROSPECTS_CACHE_TTL = 30
_prospects_cache = {'data': None, 'ts': 0.0}
_prospects_cache_lock = threading.Lock()


def _invalidate_prospects_cache():
    with _prospects_cache_lock:
        _prospects_cache['data'] = None


def get_all_prospects():
    with _prospects_cache_lock:
        if _prospects_cache['data'] is not None and time.time() - _prospects_cache['ts'] < _PROSPECTS_CACHE_TTL:
            return _prospects_cache['data']

    try:
        container_client = get_container_client()
        blobs = list(container_client.list_blobs())
        blobs.sort(key=lambda b: b.last_modified, reverse=True)

        ordered_names = []
        last_modified_map = {}
        for blob in blobs:
            parts = blob.name.split('/')
            if not parts:
                continue
            prospect_name = parts[0]
            if prospect_name.startswith('_'):
                continue
            if prospect_name not in last_modified_map:
                ordered_names.append(prospect_name)
                last_modified_map[prospect_name] = (
                    blob.last_modified.isoformat() if blob.last_modified else None
                )

        def _fetch_meta(name):
            return name, get_prospect_metadata(name)

        workers = min(20, max(1, len(ordered_names)))
        with ThreadPoolExecutor(max_workers=workers) as executor:
            meta_results = dict(executor.map(_fetch_meta, ordered_names))

        result = []
        for name in ordered_names:
            meta = meta_results.get(name, {'description': '', 'industry': ''})
            entry = {
                'prospect_name': name,
                'description': meta.get('description', ''),
                'industry': meta.get('industry', ''),
                'last_modified': last_modified_map[name],
            }
            if meta.get('stage'):
                entry['stage'] = meta['stage']
            result.append(entry)

        with _prospects_cache_lock:
            _prospects_cache['data'] = result
            _prospects_cache['ts'] = time.time()

        return result
    except Exception:
        logger.exception("get_all_prospects failed")
        return []


def get_prospect_metadata(prospect_name):
    try:
        container_client = get_container_client()
        meta = {}
        try:
            data = container_client.get_blob_client(f"{prospect_name}/metadata.json").download_blob().readall()
            meta = json.loads(data)
        except Exception:
            pass

        industry = (meta.get('industry') or '').strip().lower()

        if not industry:
            try:
                raw = container_client.get_blob_client(f"{prospect_name}/input/master_data.json").download_blob().readall()
                md = json.loads(raw)
                industry = (md.get('_industry') or '').strip().lower()
            except Exception:
                pass

        stage = (meta.get('stage') or '').strip().lower()
        result = {'description': meta.get('description', ''), 'industry': industry}
        if stage in VALID_STAGES:
            result['stage'] = stage
        return result
    except Exception:
        return {'description': '', 'industry': ''}


def save_prospect_metadata(prospect_name, description, industry=None):
    try:
        container_client = get_container_client()
        metadata = {'prospect_name': prospect_name, 'description': description}
        if industry:
            metadata['industry'] = industry.strip().lower()
        container_client.upload_blob(
            name=f"{prospect_name}/metadata.json",
            data=json.dumps(metadata).encode('utf-8'),
            overwrite=True,
        )
        container_client.upload_blob(name=f"{prospect_name}/input/.keep", data=b'', overwrite=True)
        container_client.upload_blob(name=f"{prospect_name}/output/.keep", data=b'', overwrite=True)
        _invalidate_prospects_cache()
        return True
    except Exception:
        logger.exception("save_prospect_metadata failed for %s", prospect_name)
        return False


HIDDEN_BLOBS = {'.keep', 'metadata.json', 'master_data.json', 'parsed.json'}


def _list_input_blobs(prospect_name, folder):
    container_client = get_container_client()
    for blob in container_client.list_blobs(name_starts_with=f"{prospect_name}/{folder}/"):
        filename = blob.name.split('/')[-1]
        if filename and filename not in HIDDEN_BLOBS:
            yield blob


def get_prospect_files(prospect_name, folder):
    try:
        return sorted(b.name.split('/')[-1] for b in _list_input_blobs(prospect_name, folder))
    except Exception:
        logger.exception("get_prospect_files failed for %s/%s", prospect_name, folder)
        return []


def get_prospect_files_detailed(prospect_name, folder):
    try:
        rows = []
        for b in _list_input_blobs(prospect_name, folder):
            rows.append({
                'filename': b.name.split('/')[-1],
                'size': b.size,
                'last_modified': b.last_modified.isoformat() if b.last_modified else None,
            })
        rows.sort(key=lambda r: r['filename'].lower())
        return rows
    except Exception:
        logger.exception("get_prospect_files_detailed failed for %s/%s", prospect_name, folder)
        return []


def get_latest_supported_file(prospect_name):
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


# ── Merge helpers ────────────────────────────────────────────────────────────
def _merge_section_entry(target_entry, incoming_entry):
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


def _extract_transcript_text(filename: str, file_data: bytes) -> str:
    """Extract plain text from a transcript file to use as gap-fill context."""
    ext = os.path.splitext(filename.lower())[1]
    try:
        if ext in ('.vtt', '.txt', '.md'):
            return file_data.decode('utf-8', errors='replace')
        elif ext in ('.docx', '.doc'):
            import mammoth
            return mammoth.extract_raw_text(io.BytesIO(file_data)).value
    except Exception:
        pass
    return ''


def get_active_job_for_prospect(prospect_name: str):
    """Return the job_id of any currently-running job for this prospect, or None."""
    with jobs_lock:
        for jid, jdata in jobs.items():
            if jdata.get('prospect_name') == prospect_name and \
               jdata.get('status') in ('starting', 'running'):
                return jid
    return None


# ── DOCX parser sanity-check ─────────────────────────────────────────────────
DOCX_PARSE_MIN_TOTAL_CONTENT_CHARS = 200


def _parsed_data_total_content_chars(parsed_data) -> int:
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
    if not parsed_data or not isinstance(parsed_data, dict):
        return True
    return _parsed_data_total_content_chars(parsed_data) < DOCX_PARSE_MIN_TOTAL_CONTENT_CHARS


# ── Pipeline (runs in a background thread) ───────────────────────────────────
def process_pipeline(prospect_name, file_tuples, job_id=None, internet_search=False, bullet_points=False):
    """
    Processes one or more files and merges all results into master_data.
    All service calls are direct Python function calls — no HTTP.
    """
    def _update(step, status, message='', output_file=''):
        if job_id:
            set_job(job_id, step=step, status=status, message=message, output_file=output_file)

    prospect_lock = get_prospect_lock(prospect_name)
    total_files = len(file_tuples)

    try:
        with prospect_lock:
            master_data_path = f"{prospect_name}/input/master_data.json"
            existing_master = download_from_azure(master_data_path)
            master_data = json.loads(existing_master) if existing_master else {}
            master_data['prospect_name'] = prospect_name
            _transcript_texts = []  # raw text from VTT-path files, for gap-fill

            for file_idx, (filename, file_data) in enumerate(file_tuples, 1):
                file_label = f"({file_idx}/{total_files}) {filename}" if total_files > 1 else filename

                use_vtt = is_vtt_file(filename)
                docx_failed_reason = None

                if not use_vtt:
                    _update(step=1, status='running', message=f'Converting DOCX to JSON... {file_label}')
                    try:
                        new_parsed_data = docx_to_parsed(file_data, filename)

                        if _is_docx_parse_effectively_empty(new_parsed_data):
                            total_chars = _parsed_data_total_content_chars(new_parsed_data)
                            docx_failed_reason = (
                                f"DOCX parser extracted no recognisable sections "
                                f"(total content: {total_chars} chars). "
                                f"Routing through VTT/LLM extraction path instead."
                            )
                            logger.warning("%s: %s", filename, docx_failed_reason)
                            _update(step=1, status='running',
                                    message=f'No SAP headings in {file_label} — routing to AI extractor...')
                            use_vtt = True
                        else:
                            parsed_json_path = f"{prospect_name}/input/parsed.json"
                            existing_parsed = download_from_azure(parsed_json_path)
                            parsed_master = json.loads(existing_parsed) if existing_parsed else {}
                            _merge_section_tree(parsed_master, new_parsed_data)
                            upload_to_azure(
                                prospect_name, 'input', 'parsed.json',
                                json.dumps(parsed_master, indent=2).encode('utf-8'),
                            )

                            _update(step=2, status='running', message=f'AI summarising content... {file_label}')
                            new_summarized_data = summarize(new_parsed_data, bullet_points=bullet_points)

                            _merge_section_tree(master_data, new_summarized_data)
                            upload_to_azure(
                                prospect_name, 'input', 'master_data.json',
                                json.dumps(master_data, indent=2).encode('utf-8'),
                            )

                    except Exception as e:
                        docx_failed_reason = f"DOCX processing failed: {e}"
                        logger.warning("DOCX path error for %s, falling back to VTT: %s", filename, e)
                        use_vtt = True

                if use_vtt:
                    raw_text = _extract_transcript_text(filename, file_data)
                    if raw_text:
                        _transcript_texts.append(raw_text[:80000])

                    _update(step=1, status='running',
                            message=f'Sending transcript to AI extractor... {file_label}')
                    vtt_json = run_vtt_pipeline(
                        [(filename, file_data)],
                        prospect_name=prospect_name,
                        bullet_points=bullet_points,
                    )
                    master_data = merge_vtt_json_into_master(master_data, vtt_json)

                    _update(step=2, status='running', message=f'Merging profile into master data... {file_label}')
                    upload_to_azure(
                        prospect_name, 'input', 'master_data.json',
                        json.dumps(master_data, indent=2).encode('utf-8'),
                    )
                    if docx_failed_reason:
                        logger.info("VTT fallback succeeded for %s after: %s", filename, docx_failed_reason)

            # ── Optional: web research enrichment ────────────────────────────
            if internet_search:
                _update(step=2, status='running',
                        message='Building Section 1 company profile from the web...')
                try:
                    _, filled_count = enrich_master_data_with_web(
                        master_data, prospect_name, logger=logger.info
                    )
                    if filled_count:
                        master_data['_internet_research_used'] = True
                        _update(step=2, status='running',
                                message=f'Enriched {filled_count} Section 1 field(s) from the web')
                except Exception:
                    logger.exception("Internet search enrichment failed; continuing without it")
                upload_to_azure(
                    prospect_name, 'input', 'master_data.json',
                    json.dumps(master_data, indent=2).encode('utf-8'),
                )

            # ── Gap-fill empty workstream sections from transcript ────────────
            try:
                _update(step=2, status='running',
                        message='AI gap-filling empty workstream sections...')
                combined_transcript = '\n\n=====\n\n'.join(_transcript_texts)[:120000]
                master_data = gap_fill(master_data, transcript_text=combined_transcript,
                                       bullet_points=bullet_points)
                upload_to_azure(
                    prospect_name, 'input', 'master_data.json',
                    json.dumps(master_data, indent=2).encode('utf-8'),
                )
            except Exception:
                logger.exception("Gap-fill step failed; continuing without it")

            # ── Normalise bullet chars before render ──────────────────────────
            if bullet_points:
                _normalize_bullets(master_data)

            # ── Classify industry ─────────────────────────────────────────────
            detected = classify_prospect_industry(master_data, prospect_name)
            if detected:
                master_data['_industry'] = detected
            else:
                master_data.pop('_industry', None)

            upload_to_azure(
                prospect_name, 'input', 'master_data.json',
                json.dumps(master_data, indent=2).encode('utf-8'),
            )

            summary = _extract_prospect_summary(master_data)
            save_prospect_metadata(prospect_name, summary, industry=master_data.get('_industry'))

            # ── Step 3: generate Word document ────────────────────────────────
            _update(step=3, status='running', message='Generating Word document...')
            docx_bytes = render_docx(
                {'summarized_data': master_data, 'prospect_name': prospect_name},
                TEMPLATE_PATH,
            )

            all_input_files = get_prospect_files(prospect_name, 'input')
            total_file_count = len(all_input_files)
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            file_range = "File1" if total_file_count == 1 else f"Files1-{total_file_count}"
            output_filename = f"output_{prospect_name}_{file_range}_{timestamp}.docx"

            upload_to_azure(prospect_name, 'output', output_filename, docx_bytes)

        _update(step=3, status='done', message='Document ready!', output_file=output_filename)
        return True

    except Exception as e:
        logger.exception("Pipeline error for prospect %s", prospect_name)
        _update(step=0, status='error', message=str(e))
        return False


# ── Routes ───────────────────────────────────────────────────────────────────

@app.route('/api/prospects')
@require_auth
def api_prospects():
    return jsonify(get_all_prospects())


@app.route('/api/prospect-files/<prospect_name>/<folder>')
@require_auth
def api_prospect_files(prospect_name, folder):
    p = safe_prospect(prospect_name)
    f = safe_folder(folder)
    if not p or not f:
        return jsonify([]), 400
    if request.args.get('detailed') == '1':
        return jsonify(get_prospect_files_detailed(p, f))
    return jsonify(get_prospect_files(p, f))


@app.route('/save-prospect', methods=['POST'])
@require_auth
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
@require_auth
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
@require_auth
def generate():
    data = request.get_json() or {}
    p = safe_prospect(data.get('prospect_name'))
    if not p:
        return jsonify({'success': False, 'error': 'Invalid or missing prospect name'}), 400

    internet_search = bool(data.get('internet_search', False))
    bullet_points = bool(data.get('bullet_points', False))

    requested_names = [n for n in (data.get('filenames') or []) if isinstance(n, str) and n.strip()]

    if requested_names:
        candidates = [secure_filename(n) for n in requested_names if safe_filename(secure_filename(n))]
    else:
        latest = get_latest_supported_file(p)
        candidates = [latest] if latest else []

    if not candidates:
        return jsonify({'success': False,
                        'error': 'No supported files found (DOCX, VTT, TXT)'}), 400

    existing_job = get_active_job_for_prospect(p)
    if existing_job:
        return jsonify({
            'success': False,
            'error': 'A generation is already running for this prospect. Please wait for it to finish.',
            'active_job_id': existing_job,
        }), 409

    file_tuples = []
    for fname in candidates:
        fdata = download_from_azure(f"{p}/input/{fname}")
        if fdata:
            file_tuples.append((fname, fdata))
        else:
            logger.warning("generate: could not download %s/%s — skipping", p, fname)

    if not file_tuples:
        return jsonify({'success': False, 'error': 'Failed to download uploaded files'}), 500

    job_id = str(uuid.uuid4())
    set_job(job_id, step=0, status='starting', message='Job queued…',
            output_file='', prospect_name=p)

    t = threading.Thread(
        target=process_pipeline,
        args=(p, file_tuples, job_id, internet_search, bullet_points),
        daemon=False,
    )
    t.start()

    return jsonify({'success': True, 'job_id': job_id})


@app.route('/api/job-status/<job_id>')
@require_auth
def job_status(job_id):
    job = get_job(job_id)
    if not job:
        return jsonify({'status': 'not_found'}), 404
    return jsonify(job)


@app.route('/delete-file/<prospect_name>/<folder>/<filename>', methods=['POST'])
@require_auth
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
@require_auth
def preview_file(prospect_name, folder, filename):
    p = safe_prospect(prospect_name)
    f = safe_folder(folder)
    fn = safe_filename(filename)
    if not p or not f or not fn:
        return "Invalid path", 400
    try:
        file_data = download_from_azure(f"{p}/{f}/{fn}")
        if not file_data:
            return "File not found", 404
        ext = fn.rsplit('.', 1)[-1].lower() if '.' in fn else ''
        if ext == 'docx':
            import mammoth
            body = mammoth.convert_to_html(io.BytesIO(file_data)).value
        elif ext in ('vtt', 'txt'):
            from markupsafe import escape
            text = file_data.decode('utf-8', errors='replace')
            body = f"<pre>{escape(text)}</pre>"
        else:
            return "Preview not available for this file type", 415
        full_html = f"""<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<style>
  body {{ font-family: Arial, sans-serif; max-width: 900px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #333; }}
  pre {{ white-space: pre-wrap; word-wrap: break-word; font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 13px; background: #f5f7fa; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0; }}
  table {{ border-collapse: collapse; width: 100%; margin: 1em 0; }}
  td, th {{ border: 1px solid #ccc; padding: 8px 12px; }}
  th {{ background: #f0f0f0; }}
  img {{ max-width: 100%; }}
  h1,h2,h3,h4 {{ color: #0072bc; }}
</style>
</head><body>{body}</body></html>"""
        return full_html
    except Exception as e:
        logger.exception("preview_file failed for %s/%s/%s", p, f, fn)
        return f"Preview error: {str(e)}", 500


@app.route('/delete-prospect/<prospect_name>', methods=['POST'])
@require_auth
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
        _invalidate_prospects_cache()
        return jsonify({'success': True})
    except Exception as e:
        logger.exception("delete_prospect failed for %s", p)
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/download/<prospect_name>/<folder>/<filename>')
@require_auth
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
        ext = fn.rsplit('.', 1)[-1].lower() if '.' in fn else ''
        mimetype = {
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'vtt': 'text/vtt',
            'txt': 'text/plain',
        }.get(ext, 'application/octet-stream')
        return send_file(
            io.BytesIO(file_data),
            mimetype=mimetype,
            as_attachment=True,
            download_name=fn,
        )
    except Exception as e:
        logger.exception("download_file failed for %s/%s/%s", p, f, fn)
        return f"Error downloading file: {str(e)}", 500


VALID_INDUSTRIES = {'chemical', 'consumer_goods', 'life_sciences', 'manufacturing', 'professional_services', 'wholesale_distribution'}
VALID_STAGES = {'stage_1', 'stage_2', 'stage_3'}

_INDUSTRY_KEYWORDS = {
    'chemical': [
        'chemical', 'chemicals', 'polymer', 'resin', 'coating', 'adhesive',
        'petrochemical', 'industrial gas', 'specialty chemical', 'lubricant',
        'fertilizer', 'pigment', 'solvent', 'plastics', 'rubber', 'catalyst',
    ],
    'consumer_goods': [
        'consumer goods', 'fmcg', 'food', 'beverage', 'personal care',
        'household product', 'cpg', 'grocery', 'apparel', 'fashion',
        'packaged goods', 'consumer product', 'beauty', 'cosmetic',
        'snack', 'dairy', 'nutrition', 'confectionery', 'toiletries',
    ],
    'life_sciences': [
        'pharma', 'pharmaceutical', 'biotech', 'biotechnology',
        'medical device', 'diagnostic', 'clinical', 'drug discovery',
        'life science', 'medtech', 'therapeutics', 'genomic',
        'vaccine', 'biologic', 'pathology', 'clinical trial', 'cro',
    ],
    'manufacturing': [
        'manufactur', 'automotive', 'aerospace', 'industrial', 'factory',
        'production line', 'assembly', 'equipment', 'machinery', 'electronic',
        'semiconductor', 'component', 'circuit', 'metal', 'steel',
        'fabricat', 'defense', 'aviation', 'shipbuilding', 'tooling',
        'precision engineering', 'oem', 'tier 1', 'tier 2',
    ],
    'professional_services': [
        'consulting', 'consultant', 'advisory', 'managed service',
        'it service', 'staffing', 'legal', 'accounting', 'audit',
        'system integrat', 'professional service', 'outsourc',
        'technology service', 'digital transformation', 'implementation partner',
    ],
    'wholesale_distribution': [
        'distribut', 'wholesale', 'logistics', 'supply chain',
        'warehouse', '3pl', 'third-party logistic', 'fulfillment',
        'freight', 'transport network', 'last mile', 'cross-dock',
    ],
}


def _classify_industry_by_keywords(text):
    t = text.lower()
    scores = {ind: sum(1 for kw in kws if kw in t) for ind, kws in _INDUSTRY_KEYWORDS.items()}
    best = max(scores, key=scores.get)
    return (best, scores[best]) if scores[best] > 0 else ('', 0)


def _build_classification_corpus(master_data, prospect_name):
    parts = [prospect_name]
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
            if text:
                parts.append(text[:400])
    return ' '.join(parts)


def classify_prospect_industry(master_data, prospect_name):
    corpus = _build_classification_corpus(master_data, prospect_name)
    keyword_industry, keyword_score = _classify_industry_by_keywords(corpus)
    logger.info("Keyword classify '%s': industry='%s' score=%d", prospect_name, keyword_industry, keyword_score)

    llm_industry = ''
    try:
        llm_industry = classify_industry_llm(master_data, prospect_name)
        if llm_industry not in VALID_INDUSTRIES:
            llm_industry = ''
        logger.info("LLM classify '%s': industry='%s'", prospect_name, llm_industry)
    except Exception as exc:
        logger.warning("LLM classify unavailable for '%s': %s", prospect_name, exc)

    result = llm_industry or keyword_industry
    logger.info("Final industry for '%s': '%s' (llm='%s', keyword='%s' score=%d)",
                prospect_name, result, llm_industry, keyword_industry, keyword_score)
    return result


@app.route('/api/prospect/<prospect_name>/set-industry', methods=['POST'])
@require_auth
def set_industry(prospect_name):
    p = safe_prospect(prospect_name)
    if not p:
        return jsonify({'error': 'Invalid prospect name'}), 400
    data = request.get_json(silent=True) or {}
    industry = (data.get('industry') or '').strip().lower()
    if industry not in VALID_INDUSTRIES:
        return jsonify({'error': f'Invalid industry. Valid values: {sorted(VALID_INDUSTRIES)}'}), 400
    try:
        raw = download_from_azure(f"{p}/input/master_data.json")
        if raw:
            master_data = json.loads(raw)
            master_data['_industry'] = industry
            upload_to_azure(p, 'input', 'master_data.json',
                            json.dumps(master_data, indent=2).encode('utf-8'))
        meta_raw = download_from_azure(f"{p}/metadata.json")
        meta = json.loads(meta_raw) if meta_raw else {'prospect_name': p, 'description': ''}
        meta['industry'] = industry
        get_container_client().upload_blob(
            name=f"{p}/metadata.json",
            data=json.dumps(meta).encode('utf-8'),
            overwrite=True,
        )
        _invalidate_prospects_cache()
        return jsonify({'ok': True, 'prospect': p, 'industry': industry})
    except Exception as e:
        logger.exception("set_industry failed for %s", p)
        return jsonify({'error': str(e)}), 500


@app.route('/api/prospect/<prospect_name>/set-stage', methods=['POST'])
@require_auth
def set_stage(prospect_name):
    p = safe_prospect(prospect_name)
    if not p:
        return jsonify({'error': 'Invalid prospect name'}), 400
    data = request.get_json(silent=True) or {}
    stage = (data.get('stage') or '').strip().lower()
    if stage and stage not in VALID_STAGES:
        return jsonify({'error': f'Invalid stage. Valid values: {sorted(VALID_STAGES)}'}), 400
    try:
        meta_raw = download_from_azure(f"{p}/metadata.json")
        meta = json.loads(meta_raw) if meta_raw else {'prospect_name': p, 'description': ''}
        if stage:
            meta['stage'] = stage
        else:
            meta.pop('stage', None)
        get_container_client().upload_blob(
            name=f"{p}/metadata.json",
            data=json.dumps(meta).encode('utf-8'),
            overwrite=True,
        )
        _invalidate_prospects_cache()
        return jsonify({'ok': True, 'prospect': p, 'stage': stage or None})
    except Exception as e:
        logger.exception("set_stage failed for %s", p)
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/backfill-industries', methods=['POST'])
@require_auth
def backfill_industries():
    results = {'updated': [], 'skipped': [], 'failed': []}
    try:
        prospects = get_all_prospects()
    except Exception as e:
        return jsonify({'error': str(e)}), 500

    for p in prospects:
        name = p['prospect_name']
        try:
            raw = download_from_azure(f"{name}/input/master_data.json")
            if not raw:
                results['skipped'].append({'name': name, 'reason': 'no master_data.json'})
                continue

            master_data = json.loads(raw)

            if master_data.get('_industry'):
                results['skipped'].append({'name': name, 'reason': 'already labelled', 'industry': master_data['_industry']})
                continue

            industry = classify_prospect_industry(master_data, name)

            if industry:
                master_data['_industry'] = industry
            else:
                master_data.pop('_industry', None)
            upload_to_azure(name, 'input', 'master_data.json',
                            json.dumps(master_data, indent=2).encode('utf-8'))

            summary = p.get('description', '') or _extract_prospect_summary(master_data)
            save_prospect_metadata(name, summary, industry=industry or None)

            results['updated'].append({'name': name, 'industry': industry or 'unclassified'})

        except Exception as e:
            logger.exception("backfill_industries failed for %s", name)
            results['failed'].append({'name': name, 'error': str(e)})

    return jsonify({
        'updated': len(results['updated']),
        'skipped': len(results['skipped']),
        'failed': len(results['failed']),
        'details': results,
    })


# ── React SPA catch-all (must be registered LAST) ────────────────────────────
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_react(path):
    """
    Serve the React SPA from the static/ build directory.
    Known static files are served directly; everything else returns index.html
    so that React Router can handle client-side navigation.
    """
    ensure_container_exists()
    if path:
        full = os.path.join(STATIC_DIR, path)
        if os.path.exists(full) and os.path.isfile(full):
            return send_from_directory(STATIC_DIR, path)
    return send_from_directory(STATIC_DIR, 'index.html')


if __name__ == '__main__':
    host = os.environ.get('FLASK_HOST', '127.0.0.1')
    debug = os.environ.get('FLASK_DEBUG', 'True').lower() in ('1', 'true', 'yes')
    port = int(os.environ.get('FLASK_PORT', '5001'))
    app.run(debug=debug, host=host, port=port)
