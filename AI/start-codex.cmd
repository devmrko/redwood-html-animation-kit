@echo off
cd /d "%~dp0.."
where py >nul 2>nul
if errorlevel 1 (
  python start.py --ai --port 0 --provider cli --tool codex
) else (
  py -3 start.py --ai --port 0 --provider cli --tool codex
)
pause
