@echo off
cd /d "%~dp0"

rem Настройка переменных окружения
set "PYTHONPATH=%~dp0python\Lib\site-packages;%~dp0"
set "PATH=%~dp0python;%PATH%"
set "PYTHONHOME=%~dp0python"

rem Запуск приложения
"%~dp0python\python.exe" "%~dp0main.py"

if errorlevel 1 (
    echo Ошибка при запуске приложения
    echo Код ошибки: %errorlevel%
    pause
) 