@echo off
title DailyPlan v10.0
cd /d "%~dp0study_planner"

echo.
echo   DailyPlan v10.0 — Vue 3 + FastAPI
echo   http://localhost:5000
echo.
echo   DO NOT CLOSE THIS WINDOW.
echo.

start http://localhost:5000
python launcher.py

pause
