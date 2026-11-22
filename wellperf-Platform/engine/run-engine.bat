@echo off
REM Keeps the WellPerf engine running on port 8000 (auto-restart watchdog).
cd /d "%~dp0"
:loop
netstat -ano | findstr /R /C:":8000 .*LISTENING" >nul
if not errorlevel 1 (
  timeout /t 15 >nul
  goto loop
)
echo Starting engine on port 8000...
python -m uvicorn api_server:app --host 127.0.0.1 --port 8000
echo engine stopped - restarting in 3 s...
timeout /t 3 >nul
goto loop
