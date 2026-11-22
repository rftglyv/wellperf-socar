@echo off
REM Keeps the WellPerf dashboard running on port 3000 (auto-restart watchdog).
cd /d "%~dp0"
:loop
netstat -ano | findstr /R /C:":3000 .*LISTENING" >nul
if not errorlevel 1 (
  timeout /t 15 >nul
  goto loop
)
echo Starting dashboard on port 3000...
call npm run dev
echo dashboard stopped - restarting in 3 s...
timeout /t 3 >nul
goto loop
