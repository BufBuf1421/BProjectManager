@echo off
chcp 65001>nul

cd /d "%~dp0"

if not exist "python\python.exe" goto error_python

set PYTHONPATH=%~dp0python\Lib\site-packages;%~dp0
set PATH=%~dp0python;%PATH%
set PYTHONHOME=%~dp0python
set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1

"%~dp0python\python.exe" main.py
if errorlevel 1 goto error_run
goto end

:error_python
echo Python not found. Please reinstall the application.
pause
exit /b 1

:error_run
echo Application error. Error code: %errorlevel%
    pause
exit /b 1

:end
exit /b 0 