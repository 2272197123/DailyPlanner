@echo off
title DailyPlan · 启动

cd /d "C:\Users\Ahsoka·Tano\Desktop\DailyPlan"

echo.
echo   ∿ DailyPlan v9.0
echo   ═══════════════════
echo.

:: Kill any process on port 5000
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000 ^| findstr LISTENING 2^>nul') do (
    echo   已检测到端口 5000 上运行的进程，正在关闭...
    taskkill /F /PID %%a >nul 2>&1
    timeout /t 2 /nobreak >nul
)

echo   正在启动服务器...
echo.
start "DailyPlan Server" /MIN cmd /c "cd /d C:\Users\Ahsoka·Tano\Desktop\DailyPlan\study_planner && python launcher.py"

:: Wait for server to respond
echo   等待服务器就绪
for /l %%i in (1,1,30) do (
    timeout /t 1 /nobreak >nul
    curl -s http://localhost:5000 >nul 2>&1
    if not errorlevel 1 goto open
    echo|set /p="."
)
echo.
echo   [X] 服务器启动超时。请检查是否安装了所有依赖:
echo       pip install fastapi uvicorn pyjwt bcrypt openai
echo.
pause
exit /b 1

:open
echo.
echo   服务器就绪！
echo.
timeout /t 1 /nobreak >nul
start "" http://localhost:5000
echo   [OK] 浏览器已打开。如果未显示，请手动访问:
echo        http://localhost:5000
echo.
echo   关闭此窗口不会停止服务器。
echo   如需停止服务器，请在任务管理器中结束 python.exe。
echo.
timeout /t 5 /nobreak >nul
