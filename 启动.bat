@echo off
chcp 65001 >nul
title DailyPlan · 启动中...

cd /d "C:\Users\Ahsoka·Tano\Desktop\DailyPlan"

echo.
echo   ∿ DailyPlan v9.0
echo   ═══════════════════
echo.

:: Kill any existing server on port 5000
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)

:: Start the FastAPI server
start "DailyPlan Server" /MIN python study_planner/launcher.py

:: Wait for server to be ready
echo   等待服务器启动...
:waitloop
timeout /t 1 /nobreak >nul
curl -s http://localhost:5000 >nul 2>&1
if errorlevel 1 goto waitloop

echo   服务器就绪，正在打开浏览器...
echo.

:: Open in default browser
start "" http://localhost:5000

echo   如果浏览器没有自动打开，请手动访问:
echo   http://localhost:5000
echo.
