@echo off
chcp 65001 >nul
title DailyPlan v10.0
cd /d "%~dp0study_planner"

echo.
echo   DailyPlan v10.0 — Vue 3 + FastAPI
echo   http://localhost:5000
echo.
echo   DO NOT CLOSE THIS WINDOW.
echo.

python launcher.py

pause
