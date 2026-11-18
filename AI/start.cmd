@echo off
cd /d "%~dp0.."
where py >nul 2>nul
if errorlevel 1 (
  python start.py --ai --port 0
) else (
  py -3 start.py --ai --port 0
)
pause
