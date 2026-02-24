# Sherlock AI - Document Pipeline

Flask application with Tailwind CSS UI for managing document processing with Azure Blob Storage and FastAPI endpoints.

## Directory Structure

```
flask_app_integrated/
│
├── app.py                      # Main Flask application
├── requirements.txt            # Python dependencies
├── .env                        # Environment variables
├── .gitignore                  # Git ignore file
│
├── templates/                  # HTML templates (Tailwind CSS)
│   ├── index.html             # Prospect list dashboard
│   ├── create_prospect.html   # Create/edit prospect page
│   └── view_prospect.html     # View prospect files
│
└── static/                     # Static files
    └── Logo-Blue.png          # NTT Data logo
```

## Setup

1. **Install dependencies:**
```bash
pip install -r requirements.txt
```

2. **Configure .env file:**
```bash
# Update with your actual credentials
AZURE_CONNECTION_STRING=your_connection_string
CONTAINER_NAME=documents
FASTAPI_ENDPOINT_A=http://0.0.0.0:5050/process-docx-upload
FASTAPI_ENDPOINT_B=http://0.0.0.0:5050/process-json
SECRET_KEY=your-secret-key
```

3. **Run the application:**
```bash
python app.py
```

4. **Open browser:**
```
http://localhost:5000
```

## Features

- ✅ Prospect list with search
- ✅ Create/Edit prospects with descriptions
- ✅ Upload .docx files
- ✅ Automated processing pipeline
- ✅ View input/output files
- ✅ Clean Tailwind CSS UI matching NTT Data design
- ✅ Responsive layout
- ✅ Side menu navigation

## How It Works

1. Create a prospect from the dashboard
2. Upload a .docx file
3. System automatically:
   - Sends file to FastAPI Endpoint A (returns JSON)
   - Appends JSON to master_data.json
   - Sends latest JSON to FastAPI Endpoint B (returns .docx)
   - Saves output to Azure Blob Storage
4. Download generated documents

## UI Pages

- **Index** (`/`) - Prospect list with CRUD operations
- **Create Prospect** (`/create-prospect`) - New prospect with file upload
- **View Prospect** (`/view-prospect/<name>`) - View files and download outputs# NDBS-AIML-SherlockAIWebApp
