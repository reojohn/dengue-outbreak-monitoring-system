# Dengue Outbreak Prevention and Forecasting Prototype

A React + Vite + Tailwind frontend with a FastAPI backend and Supabase/PostgreSQL database for barangay-level dengue outbreak prevention, predictive analytics, geospatial visualization, reporting, and decision-support monitoring.

This project is developed as a thesis prototype for **A Multi-Source Predictive Analytics and Geospatial Command System for Barangay-Level Dengue Outbreak Prevention**.

---

## Current System Status

The system is now a functional full-stack thesis prototype.

It includes:

- React + Vite + Tailwind frontend
- FastAPI backend
- Supabase/PostgreSQL database integration
- User authentication and protected routes
- Role-based access for CHO, BHW, Supervisor, Admin, and Viewer users
- Multi-source data upload workflow
- Historical dengue data upload
- Weather data upload
- Population data upload
- Barangay boundary / GeoJSON upload
- Backend file inspection and validation
- Backend data cleaning and preprocessing
- Multi-source dataset integration
- Barangay-level forecasting
- Machine learning model comparison
- Model performance metrics:
  - MAE
  - RMSE
  - Accuracy
  - Precision
  - Recall
  - F1-score
- Barangay-level risk scoring
- Risk ranking and priority classification
- Geospatial risk map using Leaflet
- Barangay hotspot visualization
- Dashboard analytics
- Forecast dashboard
- Reports page with export options
- PDF, Excel, PowerPoint, and print report exports
- Notifications panel
- Barangay response/action tracker
- BHW monitoring page
- Supervisor monitoring page
- User management page
- Activity logs and audit traceability
- Reset and cleanup workflow for uploaded/generated data

---

## Thesis System Scope

The system is designed as a **decision-support prototype** for dengue monitoring and prevention at the barangay level.

It supports:

1. Uploading and validating dengue-related datasets.
2. Combining dengue, weather, population, and boundary data.
3. Running predictive analytics and model comparison.
4. Generating barangay-level risk forecasts.
5. Displaying hotspot and risk outputs through maps and dashboards.
6. Producing reports for monitoring and planning.
7. Supporting BHW, Supervisor, CHO, and Admin workflows.

The system does **not** automatically execute public health interventions. It provides decision-support outputs that can help local health workers and decision-makers prioritize response actions.

---

## Important Prototype Limitations

This is still a thesis prototype, not a final public health deployment system.

Current limitations:

- Real-time hospital information system integration is not included.
- Automatic execution of intervention logistics is not included.
- Forecast quality depends on the completeness and quality of uploaded datasets.
- Supabase credentials must be configured locally through environment variables.
- SUS/UAT evaluation is performed outside the system using forms or questionnaires.
- Docker and Nginx deployment files are not included in the current source package unless added later.

---

## Tech Stack

### Frontend

- React
- Vite
- Tailwind CSS
- Lucide React icons
- Leaflet
- XLSX export
- jsPDF export
- pptxgenjs export

### Backend

- FastAPI
- Uvicorn
- Pandas
- NumPy
- scikit-learn
- openpyxl
- python-multipart
- Supabase client / PostgreSQL integration

### Database

- Supabase
- PostgreSQL
- PostGIS-compatible spatial data support

### Version Control

- Git
- GitHub

---

## Database Tables

The Supabase database contains tables that support authentication, uploads, integration, forecasting, reports, notifications, and audit logs.

Main tables include:

```txt
activity_logs
app_users
auth_sessions
barangay_boundaries
barangay_name_aliases
barangays
dataset_uploads
decision_actions
demo_sessions
dengue_case_records
forecast_results
forecast_runs
integrated_dataset_rows
integration_runs
model_training_runs
notification_reads
notifications
population_records
processing_jobs
reports
spatial_ref_sys
user_audit_logs
validation_issues
weather_records
workspace_states
```

These tables support the thesis requirements for centralized data storage, multi-source integration, prediction outputs, reports, notifications, and traceability.

---

## Project Structure

```txt
dengue-prototype-demo/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── routers/
│   │   ├── services/
│   │   ├── ml/
│   │   └── trained_models/
│   ├── requirements.txt
│   └── test_files/
├── src/
│   ├── assets/
│   ├── components/
│   ├── context/
│   ├── pages/
│   │   ├── DashboardPage.jsx
│   │   ├── UploadPage.jsx
│   │   ├── ForecastPage.jsx
│   │   ├── MapPage.jsx
│   │   ├── ReportsPage.jsx
│   │   ├── BHWPage.jsx
│   │   ├── SupervisorPage.jsx
│   │   └── UserManagementPage.jsx
│   ├── services/
│   ├── utils/
│   ├── App.jsx
│   └── main.jsx
├── package.json
├── vite.config.js
├── .gitignore
└── README.md
```

---

## Environment Setup

Create local environment files only on your machine.

Do not upload `.env` files to GitHub.

### Backend `.env` example

Create this file:

```txt
backend/.env
```

Example:

```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_if_required
DATABASE_URL=your_database_connection_string_if_required
```

### Frontend `.env` example

Create this file if your frontend uses environment variables:

```txt
.env
```

Example:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

Never commit real secrets, passwords, service role keys, or database URLs.

---

## Backend Setup

Open Git Bash, CMD, or PowerShell inside the project folder.

```bash
cd backend
python -m venv .venv
```

Activate the virtual environment.

For Git Bash:

```bash
source .venv/Scripts/activate
```

For PowerShell:

```powershell
.\.venv\Scripts\activate
```

Install backend dependencies:

```bash
pip install -r requirements.txt
```

---

## Run the Backend

From the `backend` folder:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Backend URL:

```txt
http://127.0.0.1:8000
```

Swagger API documentation:

```txt
http://127.0.0.1:8000/docs
```

Health check:

```txt
http://127.0.0.1:8000/health
```

---

## Frontend Setup

Open a separate terminal in the project folder.

```bash
npm install
```

---

## Run the Frontend

```bash
npm run dev
```

Frontend URL:

```txt
http://localhost:5173
```

The Vite frontend uses port `5173`.

---

## Mobile Testing Through VS Code Port Forwarding

To test the system on a mobile phone:

1. Run the backend on port `8000`.
2. Run the frontend on port `5173`.
3. Forward the frontend port `5173` in VS Code.
4. Open the forwarded frontend link on your phone.

If the phone needs backend access, also forward the backend port `8000`, or configure the frontend API URL to use the reachable backend address.

---

## Main System Pages

### Login Page

Used for system authentication and role-based access.

### Dashboard Page

Displays overall dengue monitoring summaries, case statistics, risk counts, trends, and decision-support cards.

### Upload Page

Supports uploading and validating dengue-related datasets, including:

- Historical dengue data
- Weather data
- Population data
- Barangay boundary data

### Forecast Page

Displays predictive analytics outputs, selected model results, model rankings, evaluation metrics, barangay risk scoring, and forecast summaries.

### Map Page

Displays barangay-level dengue risk through geospatial visualization using Leaflet and barangay boundary data.

### Reports Page

Generates monitoring and decision-support reports with export options.

Supported exports:

- PDF
- Excel
- PowerPoint
- Print

### BHW Page

Provides barangay health worker monitoring outputs, assigned barangay information, risk summaries, actions, and field-level response support.

### Supervisor Page

Provides higher-level monitoring, comparative summaries, barangay risk overview, and planning support.

### User Management Page

Allows authorized users to manage system accounts, roles, and access.

---

## Supported Upload Files

### Historical Dengue Data

Supported file types:

```txt
.csv
.xlsx
.xls
```

Common fields include:

```txt
barangay
date
year
month
week
cases
deaths
```

The backend supports flexible column aliases where possible.

### Weather Data

Weather data may include:

```txt
date
rainfall
temperature
humidity
barangay or location reference
```

### Population Data

Population data may include:

```txt
barangay
year
population
```

### Barangay Boundary Data

Supported file types:

```txt
.geojson
.json
```

Boundary data is used for map visualization and barangay-level geospatial outputs.

---

## Forecasting and Machine Learning

The system includes a machine learning forecasting workflow that supports model comparison and evaluation.

The system may compare models such as:

- CatBoost
- Gradient Boosting
- XGBoost
- Extra Trees
- LightGBM
- Random Forest
- Ridge Regression
- Decision Tree

Model outputs may include:

- Forecasted dengue cases
- Risk category
- Barangay ranking
- Priority level
- Recommended response action
- Model evaluation metrics

Evaluation metrics include:

```txt
MAE
RMSE
Accuracy
Precision
Recall
F1-score
```

---

## Reports and Exports

The Reports page supports dengue monitoring documentation and planning outputs.

Reports may include:

- Total cases
- Forecast totals
- High-risk barangays
- Risk category summaries
- Hotspot summaries
- Model evaluation metrics
- Decision-support recommendations
- Generated report timestamps

Export formats:

```txt
PDF
Excel
PowerPoint
Print
```

---

## Full System Test Flow

Run both backend and frontend first.

Backend:

```bash
cd backend
source .venv/Scripts/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Frontend:

```bash
npm run dev
```

Then open:

```txt
http://localhost:5173
```

### 1. Login

Log in using an authorized test account.

Expected result:

```txt
User is redirected to the appropriate dashboard based on role.
```

### 2. Upload Page

Go to:

```txt
http://localhost:5173/upload
```

Upload the required dengue, weather, population, and barangay boundary datasets.

Expected result:

```txt
Files are inspected, validated, cleaned, and prepared for integration.
```

### 3. Forecast Page

Go to:

```txt
http://localhost:5173/forecast
```

Expected result:

```txt
Forecast results, model ranking, risk categories, and evaluation metrics are displayed.
```

### 4. Dashboard Page

Go to:

```txt
http://localhost:5173/dashboard
```

Expected result:

```txt
System summary, dengue cases, risk counts, trends, and monitoring cards are displayed.
```

### 5. Map Page

Go to:

```txt
http://localhost:5173/map
```

Expected result:

```txt
Barangay risk levels and hotspot-related outputs are shown on the map.
```

### 6. Reports Page

Go to:

```txt
http://localhost:5173/reports
```

Expected result:

```txt
Report summaries are displayed and export options are available.
```

### 7. BHW Page

Go to the BHW page using a BHW role account.

Expected result:

```txt
Barangay-focused monitoring outputs and response actions are displayed.
```

### 8. Supervisor Page

Go to the Supervisor page using a supervisor role account.

Expected result:

```txt
Comparative barangay risk summaries and planning outputs are displayed.
```

---

## Defense Demo Script Flow

Recommended demo order:

1. Open the system login page.
2. Log in as an authorized user.
3. Show the dashboard and explain the purpose of the system.
4. Go to the Upload page.
5. Upload or show prepared dengue, weather, population, and boundary datasets.
6. Show validation and processing status.
7. Go to the Forecast page.
8. Explain model comparison, selected model, MAE, RMSE, Accuracy, Precision, Recall, and F1-score.
9. Explain barangay risk scoring and ranking.
10. Go to the Map page.
11. Show barangay-level risk visualization and hotspot outputs.
12. Go to the Reports page.
13. Generate or export a report.
14. Show BHW and Supervisor views.
15. Explain that the system is a decision-support prototype and does not automatically execute intervention logistics.
16. Explain that SUS/UAT evaluation will be conducted with health workers using questionnaires and researcher-computed scores.

---

## SUS and UAT Evaluation

The system does not need to contain a built-in SUS questionnaire module.

For thesis evaluation, the researchers may conduct pilot testing with health workers or intended users. Participants will use the prototype, perform assigned tasks, and answer the System Usability Scale questionnaire through printed forms, Google Forms, or another survey tool.

The researchers will then manually calculate:

- Individual SUS scores
- Mean SUS score
- Standard deviation
- Usability interpretation
- Qualitative observations and feedback themes

This follows the thesis methodology, where SUS is used as the main user-centered evaluation instrument.

---

## Build Frontend

```bash
npm run build
```

---

## GitHub and Submission Safety

Before pushing to GitHub, make sure these are not committed:

```txt
node_modules/
dist/
build/
.env
.env.*
backend/.env
backend/.env.*
backend/.venv/
.venv/
venv/
__pycache__/
*.pyc
.git/
```

Recommended `.gitignore` includes:

```gitignore
node_modules/
dist/
build/

.env
.env.*
!.env.example
backend/.env
backend/.env.*
!backend/.env.example

__pycache__/
*.pyc
.pytest_cache/

venv/
.venv/
backend/.venv/

*.log
.DS_Store
Thumbs.db
.vscode/
.idea/

supabase/
```

---

## Git Workflow

Check current status:

```bash
git status
```

Add files:

```bash
git add .
```

Commit:

```bash
git commit -m "Update system documentation"
```

Push:

```bash
git push origin main
```

---

## Notes

This system is a thesis prototype for barangay-level dengue outbreak prevention and decision support.

The current version demonstrates:

- Multi-source data ingestion
- Data validation and preprocessing
- Supabase-backed data storage
- Predictive analytics
- Barangay-level risk scoring
- Geospatial visualization
- Report generation
- Role-based monitoring workflows
- User and activity traceability

The system is intended to support local health monitoring and planning, not to replace official public health decision-making or automated intervention systems.