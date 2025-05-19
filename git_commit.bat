@echo off
setlocal enabledelayedexpansion

REM Получаем сообщение коммита как аргумент
set "commit_message=%*"

REM Если сообщение не передано, запрашиваем его
if "!commit_message!"=="" (
    set /p commit_message="Введите сообщение коммита: "
)

REM Добавляем все измененные файлы в индекс
git add .

REM Создаем коммит
git commit -m "!commit_message!"

REM Отправляем изменения в удаленный репозиторий
git push origin main

echo.
echo Коммит успешно создан и отправлен в репозиторий
echo.

pause 