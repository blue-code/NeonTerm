@echo off
title NeonTerm - Dev Server

cd /d "%~dp0"

if not exist node_modules (
    echo [NeonTerm] Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed
        pause
        exit /b 1
    )
    echo.
)

echo [NeonTerm] Starting dev server...
call npm run dev

pause
