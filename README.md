# Sherlock AI — Document Pipeline Web App

> **Internal Tool · NTT DATA Business Solutions**
> Pilot testing version — always validate AI-generated content before sharing externally.

---

## Table of Contents

1. [What This App Does](#what-this-app-does)
2. [System Architecture](#system-architecture)
3. [How the Pipeline Works](#how-the-pipeline-works)
4. [Sherlock AI VTT Integration](#sherlock-ai-vtt-integration)
5. [Azure Blob Storage Structure](#azure-blob-storage-structure)
6. [Project File Structure](#project-file-structure)
7. [Pages and User Flows](#pages-and-user-flows)
8. [Flask API Reference](#flask-api-reference)
9. [Sherlock AI VTT API Reference](#sherlock-ai-vtt-api-reference)
10. [Background Job System](#background-job-system)
11. [Configuration](#configuration)
12. [Setup and Running](#setup-and-running)
13. [Dependencies](#dependencies)
14. [Design Notes](#design-notes)

---

## What This App Does

Sherlock AI is a Flask web application that helps sales teams create AI-powered **SAP Customer Discovery Profile** documents from raw transcripts.

The user flow is:

1. Create a named **prospect** (e.g., a company or client).
2. Upload one or more transcript files — `.docx` discovery documents **or** `.vtt` Teams meeting recordings.
3. Click **Generate Document** — the app sends the files through the correct AI pipeline depending on file type.
4. Download the finished Word document containing the AI-generated customer profile.

All files (input transcripts, intermediate JSON data, and final output documents) are stored in **Azure Blob Storage**, so nothing is kept locally on the server.

---

## System Architecture

```
┌──────────────────────────────────────────────────┐
│                 User's Browser                   │
│   (Jinja2 HTML + vanilla JS, polls every 3s)     │
└──────────────────────┬───────────────────────────┘
                       │ HTTP
┌──────────────────────▼───────────────────────────┐
│              Flask App  (port 5001)              │
│                    app.py                        │
│                                                  │
│  • Serves HTML pages                             │
│  • Manages Azure Blob operations                 │
│  • Routes files to correct pipeline              │
│  • Launches background pipeline threads          │
│  • Exposes REST endpoints for JS polling         │
└──────┬──────────────────────┬────────────────────┘
       │ Azure SDK             │ HTTP (requests)
┌──────▼──────┐   ┌───────────▼──────────────────────────────────┐
│    Azure    │   │  FastAPI Backend        Sherlock AI VTT API   │
│    Blob     │   │  (port 5050)            (Azure — West Europe) │
│   Storage   │   │                                               │
│             │   │  /docx-to-parsed-json   /process              │
│  documents/ │   │  /summarize-json        /status/{job_id}      │
│  container  │   │  /process-json          /json/{job_id}        │
└─────────────┘   │                         /download/{job_id}    │
                  └───────────────────────────────────────────────┘
```

- The **Flask app** is the only server the browser talks to.
- The **FastAPI backend** (port 5050, not part of this repo) handles `.docx` AI processing — Steps 1 and 2.
- The **Sherlock AI VTT API** (hosted on Azure) handles `.vtt` / `.txt` transcript processing — bypasses Steps 1 and 2 entirely.
- **Azure Blob Storage** is the persistent store for all files.

---

## How the Pipeline Works

When the user clicks **Generate Document**, the Flask app:

1. Uploads any newly selected files to Azure Blob Storage.
2. Creates a **job** with a unique UUID and records it in an in-memory dictionary.
3. Starts a **background daemon thread** that runs the pipeline.
4. Immediately returns the `job_id` to the browser.
5. The browser polls `/api/job-status/<job_id>` every 3 seconds to display live progress.

Because the pipeline runs in a background thread, **closing the browser tab does not stop processing**. The server continues until the pipeline completes or fails.

### The Two Paths

File type determines which path is taken. Both paths converge at Step 3.

```
.docx files                          .vtt / .txt files
     │                                      │
     ▼                                      ▼
Step 1: /docx-to-parsed-json         Sherlock AI VTT /process
     │                                      │
     ▼                                      ▼
Step 2: /summarize-json              Poll /status until done
     │                                      │
     ▼                                      ▼
 parsed → master_data.json           Fetch /json → merge into
                                     master_data.json
     │                                      │
     └──────────────┬───────────────────────┘
                    ▼
          Step 3: /process-json
                    │
                    ▼
         output .docx saved to Azure
```

---

### Step 1 — DOCX to Parsed JSON _(DOCX path only)_

```
POST http://localhost:5050/docx-to-parsed-json
  Body: multipart/form-data with the .docx file
  Returns: { parsed_data: { section: { subsection: { content, images } } } }
```

The returned parsed JSON is **merged** with any existing `parsed.json` in Azure for that prospect. Uploading additional files accumulates content rather than overwriting it.

### Step 2 — AI Summarise _(DOCX path only)_

```
POST http://localhost:5050/summarize-json
  Body: { parsed_data: <output from step 1> }
  Returns: { summarized_data: { section: { analysis_section: { content, images } } } }
```

The returned summarized data is **merged** with any existing `master_data.json` in Azure. Section content is appended with double newlines; images are merged into the same map.

### VTT Path — Sherlock AI VTT API _(VTT / TXT path only)_

```
POST https://<vtt-api-host>/process
  Body: multipart/form-data with .vtt / .txt files
  Returns: { job_id }

GET https://<vtt-api-host>/status/{job_id}
  Poll every 3s until status == "done"

GET https://<vtt-api-host>/json/{job_id}
  Returns: structured SAP Customer Discovery Profile JSON
           (same shape as master_data.json)
```

The returned JSON is merged into `master_data.json` using the same merge logic as Step 2, then saved to Azure. See [Sherlock AI VTT Integration](#sherlock-ai-vtt-integration) for full details.

### Step 3 — Generate Word Document _(both paths)_

```
POST http://localhost:5050/process-json
  Body: { summarized_data: <full master_data> }
  Returns: binary .docx file
```

The generated DOCX is saved to the prospect's `output/` folder in Azure with a timestamped filename:

```
output_{prospect_name}_{File1 or Files1-N}_{YYYYMMDD_HHMMSS}.docx
```

### Pipeline State Transitions

```
starting → running (step 1) → running (step 2) → running (step 3) → done
                                                                   ↘ error
```

---

## Sherlock AI VTT Integration

### Why It Exists

The existing 3-step pipeline only accepts `.docx` files at Step 1. Teams meeting recordings are exported as `.vtt` files, which that pipeline cannot handle.

**Sherlock AI VTT** is a separate Azure-hosted service that accepts `.vtt`, `.docx`, and `.txt` files, processes them with Claude Sonnet AI, and returns the same structured JSON that `master_data.json` expects — **completely bypassing Steps 1 and 2**.

**VTT API Base URL:**
```
https://ndbs-aiml-sherlockaiteamstranscript-ewgucedve0cad6e2.westeurope-01.azurewebsites.net
```

### How the VTT JSON Merges into master_data.json

The JSON returned by `/json/{job_id}` has the same `{ section: { field: { content } } }` structure as `master_data.json`. The merge function appends new content to existing content — it never overwrites:

```python
def merge_vtt_json_into_master(master: dict, vtt_json: dict) -> dict:
    import copy
    result = copy.deepcopy(master)

    for section, fields in vtt_json.items():
        if section in ("client_name", "document_date"):
            if not result.get(section):
                result[section] = fields
            continue

        if not isinstance(fields, dict):
            continue

        if section not in result:
            result[section] = {}

        for field, value in fields.items():
            new_content = value.get("content", "").strip() if isinstance(value, dict) else str(value).strip()
            if not new_content:
                continue

            existing = result[section].get(field, {})
            existing_content = existing.get("content", "").strip() if isinstance(existing, dict) else ""

            if existing_content:
                result[section][field] = {"content": existing_content + "\n\n" + new_content}
            else:
                result[section][field] = {"content": new_content}

    return result
```

### Helper Module — `sherlock_vtt_client.py`

This module encapsulates all communication with the VTT API:

```python
import time
import requests

VTT_API_BASE = "https://ndbs-aiml-sherlockaiteamstranscript-ewgucedve0cad6e2.westeurope-01.azurewebsites.net"

def get_vtt_json(file_paths: list[str]) -> dict:
    """
    Upload transcript files (.vtt / .docx / .txt) to Sherlock AI VTT,
    wait for processing, and return the extracted structured JSON.
    """
    files = [("files", (fp.split("/")[-1], open(fp, "rb"))) for fp in file_paths]
    r = requests.post(f"{VTT_API_BASE}/process", files=files, timeout=60)
    r.raise_for_status()
    job_id = r.json()["job_id"]

    while True:
        s = requests.get(f"{VTT_API_BASE}/status/{job_id}", timeout=10).json()
        if s["status"] == "done":
            break
        if s["status"] == "error":
            raise Exception(f"Sherlock VTT error: {s['error']}")
        time.sleep(3)

    result = requests.get(f"{VTT_API_BASE}/json/{job_id}", timeout=30)
    result.raise_for_status()
    return result.json()
```

### Flask Route Integration

In `app.py`, the `/generate` route (or pipeline thread) handles mixed file types:

```python
def pipeline_thread(job_id, prospect_name, file_paths):
    vtt_files  = [f for f in file_paths if f.lower().endswith(".vtt")]
    docx_files = [f for f in file_paths if f.lower().endswith(".docx")]

    master_data = {}
    master_blob = f"{prospect_name}/input/master_data.json"
    try:
        existing = download_from_azure(master_blob)
        master_data = json.loads(existing)
    except Exception:
        pass

    if vtt_files:
        set_job(job_id, step=1, status="running", message="Processing Teams transcripts via Sherlock AI VTT...")
        vtt_json = get_vtt_json(vtt_files)
        master_data = merge_vtt_json_into_master(master_data, vtt_json)

    if docx_files:
        set_job(job_id, step=1, status="running", message="Converting DOCX to JSON...")
        # ... existing Step 1 & 2 logic, merge result into master_data ...

    upload_to_azure(prospect_name, 'input', 'master_data.json',
                    json.dumps(master_data, indent=2).encode('utf-8'))

    set_job(job_id, step=3, status="running", message="Generating Word document...")
    response = requests.post(FASTAPI_ENDPOINT_3,
                             json={"summarized_data": master_data},
                             timeout=300)
    # ... save output .docx to Azure ...
```

### VTT JSON Structure

The `/json/{job_id}` endpoint returns a SAP Customer Discovery Profile with these top-level sections:

| Section | Fields |
|---------|--------|
| `General_Business_Overview` | 17 fields including Schedule_of_Events, System_Landscape, Key_Value_Drivers, etc. |
| `Idea_to_Market` | Current_Processes_Key_Findings, Pain_Points, Proposed_SAP_Solutions_Mapping, Major_Gaps_and_Integrations |
| `Source_to_Pay_S2P` | same 4 fields |
| `Plan_to_Produce_P2P` | same 4 fields |
| `Detect_to_Correct_D2C` | same 4 fields |
| `Forecast_to_Fulfill_F2F` | same 4 fields |
| `Warehouse_Execution_WM_EWM` | same 4 fields |
| `Lead_to_Cash_L2C` | same 4 fields |
| `Logistics_Planning_and_Transportation_TM` | same 4 fields |
| `Request_to_Service_R2S` | same 4 fields |
| `Record_to_Report_R2R` | same 4 fields |
| `Acquire_to_Dispose_A2D` | same 4 fields |
| `Environmental_Social_and_Governance_ESG_Processes` | same 4 fields |
| `Hire_to_Retire_H2R` | same 4 fields |
| `Enterprise_Reporting_Data_and_Analytics_Strategy` | same 4 fields |

Each field has the shape `{ "content": "..." }`. Top-level metadata fields `client_name` and `document_date` are also included.

---

## Azure Blob Storage Structure

Everything lives under a single container (default name: `documents`).

```
documents/                                   ← Azure container
│
├── {prospect_name}/
│   ├── metadata.json                        ← { prospect_name, description }
│   │
│   ├── input/
│   │   ├── .keep                            ← placeholder to create the folder
│   │   ├── transcript1.docx                 ← uploaded .docx files
│   │   ├── meeting.vtt                      ← uploaded .vtt files
│   │   ├── parsed.json                      ← merged output from Step 1 (hidden from UI)
│   │   └── master_data.json                 ← merged AI summaries (hidden from UI)
│   │
│   └── output/
│       ├── .keep                            ← placeholder to create the folder
│       └── output_{name}_Files1-2_{ts}.docx ← final generated document
│
└── {another_prospect}/
    └── ...
```

The UI only shows `.docx` files to the user. Internal files (`parsed.json`, `master_data.json`, `.keep`) are filtered out by `get_prospect_files()`.

---

## Project File Structure

```
sherlock Web App/
│
├── app.py                    ← Main Flask application (all routes + pipeline logic)
├── sherlock_vtt_client.py    ← VTT API client + merge helper (to be added)
├── requirements.txt          ← Python dependencies
├── .env                      ← Environment variables (not committed)
├── .env.example              ← Template for environment variables
├── .gitignore
├── app.log
│
├── templates/
│   ├── index.html            ← Prospect list dashboard
│   ├── create_prospect.html  ← Create new prospect + upload + generate
│   └── view_prospect.html    ← Manage existing prospect files
│
└── static/
    └── Logo-Blue.png         ← NTT Data logo used in header
```

---

## Pages and User Flows

### 1. Dashboard — `/`

The home page. Lists all prospects stored in Azure Blob Storage, sorted by most recently modified.

- **Search** — filters the list client-side as the user types.
- **New Prospect** — navigates to the Create Prospect page.
- **View** — opens the prospect's file management page.
- **Delete** — deletes all Azure blobs under that prospect (with confirmation).
- **Side menu** — links to the Release Document, User Manual, Feedback Form, and Customer Pursuit Library on SharePoint.

### 2. Create Prospect — `/create-prospect`

Two-step form:

**Step 1 — Name your prospect**
- User types a name. As they type, an autocomplete dropdown suggests existing prospects.
- If the entered name already exists, the user is warned and blocked from proceeding.
- On confirm, the prospect is saved to Azure (creates `metadata.json`, `input/.keep`, `output/.keep`). The name field becomes locked.

**Step 2 — Upload & Generate**
Shown only after the prospect is saved. Split into two panels:

- **Left — Input Files:** Drag-and-drop or click-to-browse file picker (`.docx` and `.vtt` files, multiple files allowed). Shows selected files numbered. "Generate Document" button triggers the pipeline.
- **Right — Output Files:** Shows placeholder until generation completes. After completion, displays the output filename with Preview and Download buttons.

Progress is shown with animated bouncing dots and three step indicators (🟡 → ⚙️ → ✅).

### 3. View Prospect — `/view-prospect/<prospect_name>`

Full management page for an existing prospect:

- **Left panel:** Same upload + generate flow as Create Prospect. Also lists all previously uploaded files with individual Delete buttons. File numbers update in-place when a file is deleted.
- **Right panel:** Lists all generated output `.docx` files, each with Preview and Download buttons.

After generation completes, the page auto-reloads to show the new output file.

### Preview Modal

Available on both Create and View pages. Clicking Preview opens a full-screen modal with an `<iframe>` that loads the DOCX converted to styled HTML via the `mammoth` library. The conversion happens server-side at `/preview/<prospect>/<folder>/<filename>`.

---

## Flask API Reference

### Pages (Server-Rendered HTML)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/` | Prospect list dashboard |
| GET | `/create-prospect` | Create prospect form |
| GET | `/view-prospect/<prospect_name>` | View/manage prospect |

### JSON APIs (called by frontend JavaScript)

| Method | Route | Body | Response |
|--------|-------|------|----------|
| GET | `/api/prospects` | — | `[{ prospect_name, description }]` |
| GET | `/api/prospect-files/<name>/<folder>` | — | `["file1.docx", ...]` |
| POST | `/save-prospect` | `{ prospect_name, description }` | `{ success, prospect_name }` |
| POST | `/upload` | `multipart: file + prospect_name` | `{ success }` |
| POST | `/generate` | `{ prospect_name }` | `{ success, job_id }` |
| GET | `/api/job-status/<job_id>` | — | `{ step, status, message, output_file }` |
| POST | `/delete-file/<name>/<folder>/<filename>` | — | `{ success }` |
| POST | `/delete-prospect/<prospect_name>` | — | `{ success }` |

### File Operations

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/preview/<prospect>/<folder>/<filename>` | Returns DOCX as styled HTML |
| GET | `/download/<prospect>/<folder>/<filename>` | Streams DOCX as file download |

### Job Status Fields

```json
{
  "step": 1,
  "status": "running",
  "message": "Converting DOCX to JSON...",
  "output_file": "",
  "prospect_name": "Acme Corp"
}
```

`status` values: `starting` · `running` · `done` · `error`

---

## Sherlock AI VTT API Reference

**Base URL:**
```
https://ndbs-aiml-sherlockaiteamstranscript-ewgucedve0cad6e2.westeurope-01.azurewebsites.net
```

### Endpoints Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Check server is alive |
| POST | `/process` | Upload files, start background job, get `job_id` |
| GET | `/status/{job_id}` | Poll job progress |
| GET | `/json/{job_id}` | Get structured JSON (for Flask integration) |
| GET | `/download/{job_id}` | Download generated `.docx` (standalone use) |

---

### `GET /health`

```bash
curl https://<vtt-api-host>/health
```

**Response:** `{ "status": "ok" }`

---

### `POST /process`

Upload one or more transcript files. Returns a `job_id` immediately — processing runs in the background on Azure.

| Property | Value |
|----------|-------|
| Content-Type | `multipart/form-data` |
| Field name | `files` (repeat for multiple files) |
| Accepted formats | `.vtt`, `.docx`, `.txt`, `.doc`, `.md` |

```bash
curl -X POST https://<vtt-api-host>/process \
  -F "files=@meeting.vtt" \
  -F "files=@notes.docx"
```

**Response:** `{ "job_id": "550e8400-e29b-41d4-a716-446655440000" }`

**Errors:** `400` — No files provided.

---

### `GET /status/{job_id}`

Poll this every 3 seconds to track progress.

```bash
curl https://<vtt-api-host>/status/{job_id}
```

**Response:**
```json
{
  "status":   "running",
  "step":     "Analyzing chunk 2/4 with NTTHAI Claude Sonnet…",
  "pct":      45,
  "error":    null,
  "filename": null
}
```

| Field | Description |
|-------|-------------|
| `status` | `queued` / `running` / `done` / `error` |
| `step` | Human-readable current step |
| `pct` | Progress 0–100 |
| `error` | Error message if status is `error`, else `null` |
| `filename` | Output filename when status is `done`, else `null` |

**Errors:** `404` — Invalid or expired `job_id`.

---

### `GET /json/{job_id}`

**Primary endpoint for Flask integration.** Returns the structured JSON that maps directly onto `master_data.json`. Only available when `status == "done"`.

```bash
curl https://<vtt-api-host>/json/{job_id}
```

**Response (abbreviated):**
```json
{
  "client_name": "Acme Corporation",
  "document_date": "06 April 2026",
  "General_Business_Overview": {
    "Schedule_of_Events":                       { "content": "..." },
    "Contacts_Identified":                      { "content": "..." },
    "Industry_Categorization":                  { "content": "..." },
    "Revenue_Band":                             { "content": "..." },
    "Legal_Entities_and_Names":                 { "content": "..." },
    "Business_Locations":                       { "content": "..." },
    "Fiscal_Year_Format":                       { "content": "..." },
    "Total_SAP_Users":                          { "content": "..." },
    "System_Landscape":                         { "content": "..." },
    "Key_Value_Drivers":                        { "content": "..." },
    "Motivations_for_Transformation":           { "content": "..." },
    "Areas_of_Perceived_Competitive_Advantage": { "content": "..." },
    "Perceived_Change_Resistance":              { "content": "..." },
    "Technical_Challenges_and_Requirements":    { "content": "..." },
    "Regulatory_Compliance_Requirements":       { "content": "..." },
    "Transformation_Program_C_Suite_KPIs":      { "content": "..." },
    "Key_Public_Cloud_Disqualifiers":           { "content": "..." }
  },
  "Idea_to_Market": {
    "Current_Processes_Key_Findings": { "content": "..." },
    "Pain_Points":                    { "content": "..." },
    "Proposed_SAP_Solutions_Mapping": { "content": "..." },
    "Major_Gaps_and_Integrations":    { "content": "..." }
  },
  "Source_to_Pay_S2P":           { "...": "same 4 fields as above" },
  "Plan_to_Produce_P2P":         { "...": "same 4 fields as above" },
  "Detect_to_Correct_D2C":       { "...": "same 4 fields as above" },
  "Forecast_to_Fulfill_F2F":     { "...": "same 4 fields as above" },
  "Warehouse_Execution_WM_EWM":  { "...": "same 4 fields as above" },
  "Lead_to_Cash_L2C":            { "...": "same 4 fields as above" },
  "Logistics_Planning_and_Transportation_TM": { "...": "same 4 fields" },
  "Request_to_Service_R2S":      { "...": "same 4 fields as above" },
  "Record_to_Report_R2R":        { "...": "same 4 fields as above" },
  "Acquire_to_Dispose_A2D":      { "...": "same 4 fields as above" },
  "Environmental_Social_and_Governance_ESG_Processes": { "...": "same 4 fields" },
  "Hire_to_Retire_H2R":          { "...": "same 4 fields as above" },
  "Enterprise_Reporting_Data_and_Analytics_Strategy":  { "...": "same 4 fields" }
}
```

**Errors:** `400` Job not finished · `404` Invalid job_id · `500` No JSON data available.

---

### `GET /download/{job_id}`

Download the generated `.docx` directly (standalone use — not needed in the Flask integration). Only available when `status == "done"`.

```bash
curl -O -J https://<vtt-api-host>/download/{job_id}
```

**Response:** Binary `.docx` file.

**Errors:** `400` Job not finished · `404` Invalid job_id · `500` Document data missing.

---

### VTT API Notes

- Jobs are kept in memory for **1 hour** then auto-deleted.
- Multiple files can be uploaded in a single `/process` request — all are merged before AI processing.
- Processing time: approximately **1–5 minutes** depending on transcript length.
- The `/json` endpoint returns data only and does not generate a Word document, making it faster for Flask integration use.
- Powered by **NTTHAI Claude Sonnet** on Azure.

---

## Background Job System

The in-memory job tracker lives in `app.py`:

```python
jobs = {}          # { job_id: { step, status, message, output_file, prospect_name } }
jobs_lock = threading.Lock()
```

- `set_job(job_id, **kwargs)` — thread-safe write to the jobs dict.
- `get_job(job_id)` — thread-safe read, returns a copy.

**Important limitations:**
- Jobs are stored in memory only. Restarting the server clears all job history.
- If the browser is polling and the server restarts mid-pipeline, the browser will receive a 404 for that `job_id`.
- There is no job queue — all pipelines start immediately in parallel threads.

---

## Configuration

All configuration is loaded from a `.env` file using `python-dotenv`.

| Variable | Default | Description |
|----------|---------|-------------|
| `SECRET_KEY` | `your-secret-key-here` | Flask session secret |
| `AZURE_CONNECTION_STRING` | _(required)_ | Azure Storage connection string |
| `CONTAINER_NAME` | `documents` | Azure Blob container name |
| `FASTAPI_ENDPOINT_1` | `http://127.0.0.1:5050/docx-to-parsed-json` | Step 1 — DOCX parsing |
| `FASTAPI_ENDPOINT_2` | `http://127.0.0.1:5050/summarize-json` | Step 2 — AI summarise |
| `FASTAPI_ENDPOINT_3` | `http://127.0.0.1:5050/process-json` | Step 3 — Generate DOCX |
| `VTT_API_BASE` | `https://ndbs-aiml-sherlockaiteamstranscript-ewgucedve0cad6e2.westeurope-01.azurewebsites.net` | Sherlock AI VTT base URL |

Create your `.env` file:

```env
SECRET_KEY=your-random-secret-key
AZURE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=...
CONTAINER_NAME=documents
FASTAPI_ENDPOINT_1=http://127.0.0.1:5050/docx-to-parsed-json
FASTAPI_ENDPOINT_2=http://127.0.0.1:5050/summarize-json
FASTAPI_ENDPOINT_3=http://127.0.0.1:5050/process-json
VTT_API_BASE=https://ndbs-aiml-sherlockaiteamstranscript-ewgucedve0cad6e2.westeurope-01.azurewebsites.net
```

---

## Setup and Running

### Prerequisites

- Python 3.9+
- An Azure Storage account (the app will create the container automatically if it doesn't exist)
- The FastAPI backend running on port 5050 (required for `.docx` processing and Step 3)
- Network access to the Sherlock AI VTT API on Azure (required for `.vtt` processing)

### Install

```bash
cd "sherlock Web App"
python -m venv sherlockai_web_app_venv
source sherlockai_web_app_venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### Configure

```bash
cp .env.example .env
# Edit .env and fill in AZURE_CONNECTION_STRING and other values
```

### Run

```bash
python app.py
```

The app starts on `http://0.0.0.0:5001`. Open `http://localhost:5001` in your browser.

> The FastAPI backend must be running before you attempt to generate a document from `.docx` files or run Step 3. The Flask app itself starts fine without it.

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `Flask` | Web framework, routing, Jinja2 templating |
| `azure-storage-blob` | Azure Blob Storage read/write/delete |
| `requests` | HTTP calls to FastAPI endpoints and VTT API |
| `Werkzeug` | `secure_filename` for safe file upload handling |
| `python-dotenv` | Load `.env` file into `os.environ` |
| `mammoth` | Convert DOCX to HTML for in-browser preview |

---

## Design Notes

- **No database.** Azure Blob Storage serves as the persistence layer for all data. The only server-side state is the in-memory job tracker.
- **Incremental processing.** Uploading additional files for the same prospect appends to `parsed.json` and `master_data.json` rather than replacing them, so the AI output reflects all transcripts cumulatively.
- **Mixed file type support.** `.vtt` and `.docx` files can be uploaded together in one session. Each type is routed to the appropriate pipeline and results are merged into the same `master_data.json` before Step 3.
- **Browser-safe pipeline.** The background daemon thread continues running even if the user closes the browser tab.
- **Prospect name sanitisation.** On save, the prospect name is stripped of special characters (`re.sub(r'[^\w\s\-]', '', raw)`) to ensure it is safe to use as an Azure blob path prefix.
- **VTT API job expiry.** The VTT API keeps jobs for 1 hour. The Flask pipeline fetches the JSON immediately after the job completes, so expiry is not a concern in normal operation.

---

*© Sherlock AI · NTT DATA Business Solutions · Version 1.0.0*
