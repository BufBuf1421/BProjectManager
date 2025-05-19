@echo off
echo Starting Substance Painter...
echo.
echo Model path: %1
echo.
set SP_MODEL_PATH=%1

REM Проверяем существование файла
if not exist "%SP_MODEL_PATH%" (
    echo Error: Model file not found!
    echo Path: %SP_MODEL_PATH%
    pause
    exit /b 1
)

echo Launching Substance Painter...
start "" "C:\Program Files\Adobe\Adobe Substance 3D Painter\Adobe Substance 3D Painter.exe" 