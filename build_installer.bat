@echo off
echo Creating installer for BProjectManager...

rem Проверяем наличие Python и зависимостей
if not exist "python\python.exe" (
    echo Ошибка: Python не установлен
    echo Сначала запустите build_environment.bat для подготовки окружения
    pause
    exit /b 1
)

if not exist "python\Lib\site-packages\PyQt6" (
    echo Ошибка: Зависимости не установлены
    echo Сначала запустите build_environment.bat для подготовки окружения
    pause
    exit /b 1
)

rem Создаем директорию для установщика
if not exist "installer" mkdir installer

rem Проверяем наличие Inno Setup
if not exist "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" (
    echo Ошибка: Inno Setup не установлен
    echo Пожалуйста, установите Inno Setup 6 с https://jrsoftware.org/isdl.php
    pause
    exit /b 1
)

rem Очищаем старые файлы установщика
del /q "installer\*" 2>nul

rem Компилируем установщик
echo Building installer...
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" /Q installer.iss

if errorlevel 1 (
    echo Ошибка при создании установщика
    pause
    exit /b 1
)

echo.
echo Установщик успешно создан!
echo Файл установщика находится в папке installer
pause 