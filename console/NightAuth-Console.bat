@echo off
setlocal enabledelayedexpansion
title NightAuth Native Node.js CLI
cd /d "%~dp0"

where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not found in PATH.
    echo Please install Node.js ^(version 18 or higher^) from https://nodejs.org
    echo.
    pause
    exit /b 1
)

node "%~dp0main.js" %*
set "EXIT_CODE=%ERRORLEVEL%"

if %EXIT_CODE% NEQ 0 (
    echo.
    echo Application exited with code %EXIT_CODE%.
    pause
)
endlocal
