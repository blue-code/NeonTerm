@echo off
title NeonTerm - Build EXE

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

echo [NeonTerm] Building Windows EXE...
call npm run build
if errorlevel 1 (
    echo [ERROR] Build failed
    pause
    exit /b 1
)

echo.
echo [DONE] Output: %~dp0dist\r
explorer "%~dp0dist"

pause
