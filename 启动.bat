@echo off
chcp 65001 >nul
title DailyPlan
cd /d "%~dp0"

echo.
echo   DailyPlan — Vue 3 + FastAPI
echo   http://localhost:5000
echo.
echo   DO NOT CLOSE THIS WINDOW.
echo.

python -m uvicorn server.main:app --host 0.0.0.0 --port 5000

pause
