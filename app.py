from flask import Flask, render_template, request, redirect, url_for, flash, jsonify, send_file
from azure.storage.blob import BlobServiceClient
import requests
import json
import os
import threading
import uuid
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
import io

load_dotenv()

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'your-secret-key-here')

AZURE_CONNECTION_STRING = os.environ.get('AZURE_CONNECTION_STRING', '')
CONTAINER_NAME = os.environ.get('CONTAINER_NAME', 'documents')
FASTAPI_ENDPOINT_1 = os.environ.get('FASTAPI_ENDPOINT_1', 'http://127.0.0.1:5050/docx-to-parsed-json')
FASTAPI_ENDPOINT_2 = os.environ.get('FASTAPI_ENDPOINT_2', 'http://127.0.0.1:5050/summarize-json')
FASTAPI_ENDPOINT_3 = os.environ.get('FASTAPI_ENDPOINT_3', 'http://127.0.0.1:5050/process-json')

# ─────────────────────────────────────────────
# In-memory job tracker  {job_id: {...}}
# ─────────────────────────────────────────────
jobs = {}          # job_id → status dict
jobs_lock = threading.Lock()

def set_job(job_id, **kwargs):
    with jobs_lock:
        if job_id not in jobs:
            jobs[job_id] = {}
        jobs[job_id].update(kwargs)

def get_job(job_id):
    with jobs_lock:
        return dict(jobs.get(job_id, {}))

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
    except:
        pass

def get_all_prospects():
    try:
        container_client = get_container_client()
        blobs = container_client.list_blobs()
        prospects = {}
        for blob in blobs:
            parts = blob.name.split('/')
            if len(parts) > 0 and parts[0] not in prospects:
                prospect_name = parts[0]
                desc = get_prospect_description(prospect_name)
                prospects[prospect_name] = {'prospect_name': prospect_name, 'description': desc}
        return list(prospects.values())
    except:
        return []

def get_prospect_description(prospect_name):
    try:
        container_client = get_container_client()
        blob_client = container_client.get_blob_client(f"{prospect_name}/metadata.json")
        data = blob_client.download_blob().readall()
        return json.loads(data).get('description', '')
    except:
        return ''

def save_prospect_metadata(prospect_name, description):
    try:
        container_client = get_container_client()
        metadata = {'prospect_name': prospect_name, 'description': description}
        container_client.upload_blob(
            name=f"{prospect_name}/metadata.json",
            data=json.dumps(metadata).encode('utf-8'),
            overwrite=True
        )
        container_client.upload_blob(name=f"{prospect_name}/input/.keep",  data=b'', overwrite=True)
        container_client.upload_blob(name=f"{prospect_name}/output/.keep", data=b'', overwrite=True)
        return True
    except:
        return False

def get_prospect_files(prospect_name, folder):
    try:
        container_client = get_container_client()
        blobs = container_client.list_blobs(name_starts_with=f"{prospect_name}/{folder}/")
        files = []
        for blob in blobs:
            filename = blob.name.split('/')[-1]
            if filename and filename not in ['.keep', 'metadata.json', 'master_data.json', 'parsed.json']:
                files.append(filename)
        return files
    except:
        return []

def upload_to_azure(prospect_name, folder, filename, data):
    try:
        container_client = get_container_client()
        blob_path = f"{prospect_name}/{folder}/{filename}"
        container_client.upload_blob(name=blob_path, data=data, overwrite=True)
        return True
    except:
        return False

def download_from_azure(blob_path):
    try:
        container_client = get_container_client()
        blob_client = container_client.get_blob_client(blob_path)
        return blob_client.download_blob().readall()
    except:
        return None

# ─────────────────────────────────────────────
# Pipeline (runs in a background thread)
# ─────────────────────────────────────────────
def process_pipeline(prospect_name, filename, file_data, job_id=None):
    """
    Runs the full 3-step pipeline.
    If job_id is provided, updates the jobs dict so the browser can poll status.
    This function is designed to run inside a daemon thread — it will keep
    running even if the browser disconnects.
    """
    def _update(step, status, message='', output_file=''):
        if job_id:
            set_job(job_id, step=step, status=status, message=message, output_file=output_file)

    try:
        _update(step=1, status='running', message='Converting DOCX to JSON...')

        # ── Step 1: DOCX → Parsed JSON ──────────────────────────────────────
        files = {'file': (filename, file_data,
                          'application/vnd.openxmlformats-officedocument.wordprocessingml.document')}
        response_1 = requests.post(FASTAPI_ENDPOINT_1, files=files)
        response_1.raise_for_status()
        new_parsed_data = response_1.json()

        if 'parsed_data' in new_parsed_data:
            new_parsed_data = new_parsed_data['parsed_data']

        # Merge with existing parsed.json
        parsed_json_path = f"{prospect_name}/input/parsed.json"
        existing_parsed = download_from_azure(parsed_json_path)

        if existing_parsed:
            parsed_master = json.loads(existing_parsed)
            for section_name, section_data in new_parsed_data.items():
                if section_name in parsed_master:
                    for subsection_name, subsection_data in section_data.items():
                        if subsection_name in parsed_master[section_name]:
                            parsed_master[section_name][subsection_name]['content'] += ' ' + subsection_data.get('content', '')
                            parsed_master[section_name][subsection_name]['images'].update(subsection_data.get('images', {}))
                        else:
                            parsed_master[section_name][subsection_name] = subsection_data
                else:
                    parsed_master[section_name] = section_data
        else:
            parsed_master = new_parsed_data

        upload_to_azure(prospect_name, 'input', 'parsed.json',
                        json.dumps(parsed_master, indent=2).encode('utf-8'))

        # ── Step 2: AI Summarize ─────────────────────────────────────────────
        _update(step=2, status='running', message='AI summarising content...')

        response_2 = requests.post(
            FASTAPI_ENDPOINT_2,
            json={'parsed_data': new_parsed_data},
            headers={'Content-Type': 'application/json'}
        )
        response_2.raise_for_status()
        new_summarized_data = response_2.json()

        if 'summarized_data' in new_summarized_data:
            new_summarized_data = new_summarized_data['summarized_data']

        master_data_path = f"{prospect_name}/input/master_data.json"
        existing_master = download_from_azure(master_data_path)

        if existing_master:
            master_data = json.loads(existing_master)
            for section_name, section_data in new_summarized_data.items():
                if section_name in master_data:
                    for analysis_section, analysis_data in section_data.items():
                        if analysis_section in master_data[section_name]:
                            master_data[section_name][analysis_section]['content'] += '\n\n' + analysis_data.get('content', '')
                            master_data[section_name][analysis_section]['images'].update(analysis_data.get('images', {}))
                        else:
                            master_data[section_name][analysis_section] = analysis_data
                else:
                    master_data[section_name] = section_data
        else:
            master_data = new_summarized_data

        upload_to_azure(prospect_name, 'input', 'master_data.json',
                        json.dumps(master_data, indent=2).encode('utf-8'))

        # ── Step 3: Generate Word Document ───────────────────────────────────
        _update(step=3, status='running', message='Generating Word document...')

        response_3 = requests.post(
            FASTAPI_ENDPOINT_3,
            json={'summarized_data': master_data},
            headers={'Content-Type': 'application/json'}
        )
        response_3.raise_for_status()

        docx_files = [f for f in get_prospect_files(prospect_name, 'input') if f.lower().endswith('.docx')]
        total_files = len(docx_files)

        from datetime import datetime
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        file_range = "File1" if total_files == 1 else f"Files1-{total_files}"
        output_filename = f"output_{prospect_name}_{file_range}_{timestamp}.docx"

        upload_to_azure(prospect_name, 'output', output_filename, response_3.content)

        _update(step=3, status='done', message='Document ready!', output_file=output_filename)
        return True

    except Exception as e:
        print(f"Pipeline error: {str(e)}")
        import traceback
        traceback.print_exc()
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
    return jsonify(get_prospect_files(prospect_name, folder))

@app.route('/save-prospect', methods=['POST'])
def save_prospect():
    data = request.json
    prospect_name = secure_filename(data.get('prospect_name', '').strip())
    description = data.get('description', '').strip()
    if save_prospect_metadata(prospect_name, description):
        return jsonify({'success': True})
    return jsonify({'success': False}), 500

@app.route('/upload', methods=['POST'])
def upload_file():
    prospect_name = request.form.get('prospect_name')
    file = request.files.get('file')
    if not file or not prospect_name:
        return jsonify({'success': False}), 400
    filename = secure_filename(file.filename)
    file_data = file.read()
    if upload_to_azure(prospect_name, 'input', filename, file_data):
        return jsonify({'success': True})
    return jsonify({'success': False}), 500

@app.route('/generate', methods=['POST'])
def generate():
    """
    Starts the pipeline in a BACKGROUND THREAD and immediately returns a job_id.
    The browser polls /api/job-status/<job_id> to track progress.
    Closing the browser has NO effect — the thread keeps running on the server.
    """
    data = request.get_json() or {}
    prospect_name = data.get('prospect_name')

    if not prospect_name:
        return jsonify({'success': False, 'error': 'No prospect name provided'}), 400

    input_files = get_prospect_files(prospect_name, 'input')
    docx_files = [f for f in input_files if f.lower().endswith('.docx')]

    if not docx_files:
        return jsonify({'success': False, 'error': 'No DOCX files found'}), 400

    latest_file = docx_files[-1]
    file_data = download_from_azure(f"{prospect_name}/input/{latest_file}")

    if not file_data:
        return jsonify({'success': False, 'error': 'Failed to download file'}), 500

    # Create a job entry
    job_id = str(uuid.uuid4())
    set_job(job_id, step=0, status='starting', message='Job queued…', output_file='',
            prospect_name=prospect_name)

    # Launch background thread (daemon=True so it doesn't block server shutdown)
    t = threading.Thread(
        target=process_pipeline,
        args=(prospect_name, latest_file, file_data, job_id),
        daemon=True
    )
    t.start()

    return jsonify({'success': True, 'job_id': job_id})


@app.route('/api/job-status/<job_id>')
def job_status(job_id):
    """Browser polls this endpoint every few seconds to check progress."""
    job = get_job(job_id)
    if not job:
        return jsonify({'status': 'not_found'}), 404
    return jsonify(job)


@app.route('/view-prospect/<prospect_name>')
def view_prospect(prospect_name):
    input_files = get_prospect_files(prospect_name, 'input')
    output_files = get_prospect_files(prospect_name, 'output')
    return render_template('view_prospect.html',
                           prospect_name=prospect_name,
                           input_files=input_files,
                           output_files=output_files)

@app.route('/delete-prospect/<prospect_name>', methods=['POST'])
def delete_prospect(prospect_name):
    try:
        container_client = get_container_client()
        blobs = container_client.list_blobs(name_starts_with=f"{prospect_name}/")
        for blob in blobs:
            container_client.delete_blob(blob.name)
        return jsonify({'success': True})
    except:
        return jsonify({'success': False}), 500

@app.route('/download/<prospect_name>/<folder>/<filename>')
def download_file(prospect_name, folder, filename):
    try:
        blob_path = f"{prospect_name}/{folder}/{filename}"
        file_data = download_from_azure(blob_path)
        if not file_data:
            return "File not found", 404
        return send_file(
            io.BytesIO(file_data),
            mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            as_attachment=True,
            download_name=filename
        )
    except Exception as e:
        return f"Error downloading file: {str(e)}", 500

if __name__ == '__main__':
    app.run(debug=True)