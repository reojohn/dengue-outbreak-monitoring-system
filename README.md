# Dengue Outbreak Prevention and Forecasting Prototype

React + Tailwind frontend with a FastAPI backend for dengue data upload, cleaning, validation, barangay-level summary, baseline forecasting, hotspot mapping, and report generation.

This project is developed as a thesis prototype for a Barangay-Level Dengue Outbreak Prevention System.

## Current System Status

The system is no longer only a static frontend prototype.

It now includes:

- React + Vite + Tailwind frontend
- FastAPI backend
- CSV and Excel dengue file upload
- Backend file inspection
- Backend dengue data cleaning
- Backend invalid-row validation
- Backend barangay summary generation
- Backend rule-based baseline dengue forecasting
- Dashboard connected to backend forecast output
- Forecast page connected to backend forecast output
- Map page connected to backend forecast output
- Reports page connected to backend forecast output
- PDF, Excel, PowerPoint, and print report exports
- Reset cleanup for uploaded backend results

## Important Note

The current forecast is a rule-based baseline forecast, not yet a trained machine learning model.

This baseline forecast is used for prototype testing while waiting for the official historical dengue dataset from DOH.

Machine learning model training, MAE, RMSE, Accuracy, Precision, Recall, and F1-score evaluation will be added after the official historical dataset is available and validated.

## Screens Included

- Login
- Dashboard
- Upload
- Forecast
- Map
- Reports

## Tech Stack

### Frontend

- React
- Vite
- Tailwind CSS
- Lucide React icons
- Leaflet map
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

## Project Structure

```txt
dengue-prototype-demo/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── routers/
│   │   │   └── uploads.py
│   │   └── services/
│   │       ├── file_inspector.py
│   │       └── baseline_forecast.py
│   ├── requirements.txt
│   └── test_files/
│       ├── sample_doh_dengue.csv
│       └── sample_doh_dengue_invalid.csv
├── src/
│   ├── components/
│   ├── context/
│   │   └── DataContext.jsx
│   ├── pages/
│   │   ├── DashboardPage.jsx
│   │   ├── ForecastPage.jsx
│   │   ├── MapPage.jsx
│   │   ├── ReportsPage.jsx
│   │   └── UploadPage.jsx
│   ├── services/
│   │   └── api.js
│   └── utils/
├── package.json
├── vite.config.js
└── README.md
```

## Backend Setup

Open Git Bash in the project folder.

```bash
cd backend
python -m venv .venv
source .venv/Scripts/activate
pip install -r requirements.txt
```

For PowerShell, activate the virtual environment with:

```powershell
.\.venv\Scripts\activate
```

## Run the Backend

From the `backend` folder:

```bash
source .venv/Scripts/activate
uvicorn app.main:app --reload
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

Expected health response:

```json
{
  "status": "healthy",
  "backend": "running"
}
```

## Frontend Setup

Open a separate Git Bash terminal in the project folder.

```bash
npm install
```

## Run the Frontend

```bash
npm run dev
```

Frontend URL:

```txt
http://localhost:5173
```

The Vite frontend is configured to use port `5173`.

## Backend API Endpoints

### Root Endpoint

```txt
GET /
```

Returns a basic backend running message.

### Health Check

```txt
GET /health
```

Used to confirm that the backend server is running.

### Test Upload

```txt
POST /uploads/test
```

Checks if the backend can receive an uploaded file.

### Inspect Uploaded File

```txt
POST /uploads/inspect
```

Reads a CSV or Excel file and returns:

- filename
- file type
- row count
- column count
- column names
- missing values
- dengue dataset detection result
- preview rows

### Clean Dengue File

```txt
POST /uploads/clean-dengue
```

Cleans dengue records into standard columns:

```txt
barangay
period
date
year
month
week
cases
deaths
```

It also detects invalid rows, including:

- missing barangay
- missing time field
- invalid or negative cases
- invalid or negative deaths

### Summarize Dengue File

```txt
POST /uploads/summarize-dengue
```

Generates barangay-level summary data:

- total cases
- total deaths
- record count
- first period
- latest period
- average cases
- max cases in a period
- historical risk level
- barangay ranking

### Forecast Dengue File

```txt
POST /uploads/forecast-dengue
```

Generates a rule-based baseline dengue forecast:

- barangay
- latest period
- recent average cases
- previous average cases
- trend direction
- forecast next period
- forecast next 4 periods
- risk level
- priority rank
- recommendation

## Supported Upload Files

### Historical Dengue Data

Supported file types:

```txt
.csv
.xlsx
.xls
```

Required fields can use flexible column names.

The backend can detect aliases for:

```txt
barangay
date
year
month
week
cases
deaths
```

Example accepted columns:

```txt
Barangay, Year, Month, Cases, Deaths
```

### Barangay Boundary Data

Supported through the frontend:

```txt
.geojson
.json
```

Boundary data is used for the geospatial hotspot map.

### Weather and Population Data

Weather and population uploads are still handled by the frontend validation workflow.

Backend integration for weather and population can be added later.

## Sample Test Files

The backend includes sample test files:

```txt
backend/test_files/sample_doh_dengue.csv
backend/test_files/sample_doh_dengue_invalid.csv
```

The clean sample file should produce:

```txt
barangay_count: 3
total_cases: 110
total_deaths: 1
risk_counts:
  High: 2
  Moderate: 1
  Low: 0
```

The invalid sample file should detect invalid rows while still processing valid rows.

## Full System Test Flow

Run both backend and frontend first.

Backend:

```bash
cd backend
source .venv/Scripts/activate
uvicorn app.main:app --reload
```

Frontend:

```bash
npm run dev
```

Then open:

```txt
http://localhost:5173
```

### 1. Upload Page

Go to:

```txt
http://localhost:5173/upload
```

Select:

```txt
Historical dengue data
```

Upload:

```txt
backend/test_files/sample_doh_dengue.csv
```

Expected result:

```txt
Backend Validated
6 valid of 6 records
Forecast generated: 2 high, 1 moderate, 0 low-risk barangays
```

### 2. Dashboard Page

Go to:

```txt
http://localhost:5173/dashboard
```

Expected result:

```txt
Total cases: 110
High-risk barangays: 2
Forecast total: 220
Data quality: 100%
Backend forecast loaded message appears
```

### 3. Forecast Page

Go to:

```txt
http://localhost:5173/forecast
```

Expected result:

```txt
Backend forecast loaded
Projected total: 220
Loaded records: 6
Top DSS priority: Baan Riverside
Risk summary: 2 High, 1 Moderate, 0 Low
```

### 4. Map Page

Go to:

```txt
http://localhost:5173/map
```

Expected result:

```txt
Hotspot summary shows:
Baan Riverside
Ampayon
Bancasi
```

The map should use backend-generated risk rows and backend recommendations.

### 5. Reports Page

Go to:

```txt
http://localhost:5173/reports
```

Expected result:

```txt
Total cases: 110
DSS alerts: 2
Forecast total: 220
Data quality: 100%
Backend report data loaded message appears
```

Test one export option, such as PDF.

## Defense Demo Script Flow

Use this order during demonstration:

1. Open the system dashboard.
2. Explain that the system supports dengue data upload, validation, forecasting, mapping, and reporting.
3. Go to the Upload page.
4. Upload the sample dengue CSV file.
5. Show that the backend validates the file and detects dengue fields.
6. Show that the backend cleans the records and rejects invalid data if needed.
7. Go to the Forecast page.
8. Explain the baseline forecast output, risk level, trend direction, priority ranking, and recommendations.
9. Go to the Dashboard page.
10. Show total cases, high-risk barangays, forecast total, and data quality.
11. Go to the Map page.
12. Show barangay hotspot summary and boundary-based mapping.
13. Go to the Reports page.
14. Generate a PDF or Excel report.
15. Explain that machine learning evaluation will be performed after the official DOH historical dataset is available.

## Current Prototype Limitations

The following items are not yet final:

- The forecast is currently rule-based, not a trained ML model.
- MAE and RMSE are not yet computed.
- Accuracy, Precision, Recall, and F1-score are not yet computed.
- No production database is connected yet.
- Weather data is not yet integrated into backend forecasting.
- Population data is not yet integrated into backend forecasting.
- Official DOH historical dengue data is still required for final model training and testing.
- The system is not a final public health deployment tool yet.

## Planned Next Steps

After receiving the official historical dengue dataset:

1. Inspect the real DOH dataset.
2. Clean and validate the official historical records.
3. Adjust backend column aliases if needed.
4. Build the machine learning training pipeline.
5. Train forecasting or classification models.
6. Evaluate using MAE, RMSE, Accuracy, Precision, Recall, and F1-score.
7. Connect model output to the existing dashboard, forecast, map, and reports pages.
8. Prepare final defense demonstration using real historical data.

## Build Frontend

```bash
npm run build
```

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
git commit -m "Your commit message"
```

Push:

```bash
git push
```

## Notes

This system is a thesis prototype for barangay-level dengue outbreak prevention and decision support.

The current version demonstrates backend-supported data ingestion, validation, baseline forecasting, geospatial visualization, and reporting.

Final predictive modeling and official model evaluation will be completed after the official DOH historical dengue dataset is available.