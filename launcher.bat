@echo off
chcp 65001>nul
setlocal EnableDelayedExpansion

rem Change to application directory
cd /d "%~dp0"

rem Check Python existence
if not exist "python\python.exe" (
    echo Error: Python not found
    echo Please reinstall the application
    pause
    exit /b 1
)

rem Setup environment variables
set "PYTHONPATH=%~dp0python\Lib\site-packages;%~dp0"
set "PATH=%~dp0python;%PATH%"
set "PYTHONHOME=%~dp0python"

rem Clean up temp directory if exists
if exist "python\temp" (
    echo Cleaning up temporary files...
    rmdir /s /q "python\temp"
)

rem Launch application
echo Launching application...
"python\python.exe" main.py

if !errorlevel! neq 0 (
    echo Error launching application
    echo Error code: !errorlevel!
    pause
    exit /b !errorlevel!
) 