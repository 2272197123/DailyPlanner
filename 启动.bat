@echo off
title DailyPlan · 启动
echo.
echo   ∿ DailyPlan v9.0
echo   ═══════════════════
echo.
echo   正在启动...
echo.

cd /d "C:\Users\Ahsoka·Tano\Desktop\DailyPlan\study_planner"

:: Start Python server (launcher.py handles browser open + port)
start "" /B python launcher.py

echo   [OK] 服务器应该正在启动。
echo.
echo   浏览器会自动打开。如果没有，请手动访问:
echo   http://localhost:5000
echo.
echo   请勿关闭此窗口。关闭即停止服务器。
echo.
pause
