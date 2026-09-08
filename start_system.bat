@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Dengue System Launcher

set "ROOT=%~dp0"
set "BACKEND_DIR=%ROOT%backend"
set "FRONTEND_DIR=%ROOT%"
set "FRONTEND_URL=http://localhost:5173"

rem ============================================================
rem DENGUE OUTBREAK RESPONSE SYSTEM - ONE CLICK LOCAL LAUNCHER
rem ============================================================

rem ----- Locate frontend -----
if not exist "%FRONTEND_DIR%package.json" (
    if exist "%ROOT%frontend\package.json" (
        set "FRONTEND_DIR=%ROOT%frontend"
    ) else (
        echo [ERROR] package.json was not found.
        echo Put start_system.bat in the main Dengue project folder.
        echo.
        pause
        exit /b 1
    )
)

rem ----- Locate backend -----
if not exist "%BACKEND_DIR%\app\main.py" (
    echo [ERROR] backend\app\main.py was not found.
    echo Put start_system.bat in the main Dengue project folder.
    echo.
    pause
    exit /b 1
)

rem ----- Find a working Python that already has uvicorn -----
set "PYTHON_CMD="

if exist "%BACKEND_DIR%\.venv\Scripts\python.exe" (
    "%BACKEND_DIR%\.venv\Scripts\python.exe" -c "import uvicorn" >nul 2>&1
    if not errorlevel 1 set "PYTHON_CMD=%BACKEND_DIR%\.venv\Scripts\python.exe"
)

if not defined PYTHON_CMD if exist "%BACKEND_DIR%\venv\Scripts\python.exe" (
    "%BACKEND_DIR%\venv\Scripts\python.exe" -c "import uvicorn" >nul 2>&1
    if not errorlevel 1 set "PYTHON_CMD=%BACKEND_DIR%\venv\Scripts\python.exe"
)

if not defined PYTHON_CMD if exist "%ROOT%.venv\Scripts\python.exe" (
    "%ROOT%.venv\Scripts\python.exe" -c "import uvicorn" >nul 2>&1
    if not errorlevel 1 set "PYTHON_CMD=%ROOT%.venv\Scripts\python.exe"
)

if not defined PYTHON_CMD if exist "%ROOT%venv\Scripts\python.exe" (
    "%ROOT%venv\Scripts\python.exe" -c "import uvicorn" >nul 2>&1
    if not errorlevel 1 set "PYTHON_CMD=%ROOT%venv\Scripts\python.exe"
)

if not defined PYTHON_CMD (
    where py >nul 2>&1
    if not errorlevel 1 (
        py -c "import uvicorn" >nul 2>&1
        if not errorlevel 1 set "PYTHON_CMD=py"
    )
)

if not defined PYTHON_CMD (
    where python >nul 2>&1
    if not errorlevel 1 (
        python -c "import uvicorn" >nul 2>&1
        if not errorlevel 1 set "PYTHON_CMD=python"
    )
)

if not defined PYTHON_CMD (
    echo [ERROR] A working Python environment with Uvicorn was not found.
    echo.
    echo If your backend virtual environment is missing or broken, open CMD in
    echo the project folder and recreate/install it once, then run this file again.
    echo.
    echo Example:
    echo   py -m venv backend\.venv
    echo   backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
    echo.
    pause
    exit /b 1
)

rem ----- Check npm -----
where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm was not found. Install Node.js first.
    echo.
    pause
    exit /b 1
)

if not exist "%FRONTEND_DIR%\node_modules" (
    echo [ERROR] Frontend node_modules was not found.
    echo Run npm install once in:
    echo   %FRONTEND_DIR%
    echo.
    pause
    exit /b 1
)

echo ============================================================
echo        DENGUE OUTBREAK RESPONSE SYSTEM - LOCAL START
echo ============================================================
echo.
echo Backend folder : %BACKEND_DIR%
echo Frontend folder: %FRONTEND_DIR%
echo Python         : %PYTHON_CMD%
echo.

echo [1/2] Starting FastAPI backend on http://localhost:8000 ...
rem IMPORTANT: Windows CMD uses doubled outer quotes here. Backslash-escaped
rem quotes (\") are NOT valid batch escaping and caused the previous error.
start "Dengue Backend - FastAPI" /D "%BACKEND_DIR%" cmd.exe /k ""%PYTHON_CMD%" -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

echo [2/2] Starting React/Vite frontend on http://localhost:5173 ...
start "Dengue Frontend - Vite" /D "%FRONTEND_DIR%" cmd.exe /k "npm run dev"

echo.
echo Both services are starting in separate terminal windows.
echo Keep those windows open while using the local system.
echo.

timeout /t 5 /nobreak >nul
start "" "%FRONTEND_URL%"

endlocal
exit /b 0
