@echo off
REM WellPerf - starts the Python engine (:8000) and the dashboard (:3000) in their own windows.
REM Both restart automatically if they stop; uploaded parts are restored from engine\uploads.
cd /d "%~dp0"
start "WellPerf engine :8000" "%~dp0engine\run-engine.bat"
start "WellPerf dashboard :3000" "%~dp0client\run-client.bat"
timeout /t 10 >nul
start "" http://localhost:3000/#app
