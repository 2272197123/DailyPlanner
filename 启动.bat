@echo off
title DailyPlan - Start

cd /d "%~dp0study_planner"

echo DailyPlan v9.0
echo Starting server...
echo.

start /B python launcher.py

echo Server starting at http://localhost:5000
echo.
echo DO NOT CLOSE THIS WINDOW.
echo.
pause
