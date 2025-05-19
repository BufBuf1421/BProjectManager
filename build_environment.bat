@echo off
echo Подготовка окружения для BProjectManager...

rem Создаем директории
if not exist "python" mkdir python
if not exist "installer" mkdir installer

rem Скачиваем и распаковываем портативный Python
echo Скачивание Python...
powershell -Command "& {Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.11.0/python-3.11.0-embed-amd64.zip' -OutFile 'python.zip'}"
echo Распаковка Python...
powershell -Command "& {Expand-Archive -Path 'python.zip' -DestinationPath 'python' -Force}"
del python.zip

rem Включаем site-packages
echo Настройка Python...
powershell -Command "& {$pthFile = Get-ChildItem -Path 'python' -Filter 'python*._pth'; if ($pthFile) { $content = Get-Content $pthFile.FullName; $content = $content -replace '#import site', 'import site'; Set-Content $pthFile.FullName $content }}"

rem Устанавливаем pip
echo Установка pip...
powershell -Command "& {Invoke-WebRequest -Uri 'https://bootstrap.pypa.io/get-pip.py' -OutFile 'python\get-pip.py'}"
python\python.exe python\get-pip.py --no-warn-script-location

rem Устанавливаем зависимости
echo Установка зависимостей...
python\python.exe -m pip install --no-cache-dir --no-warn-script-location --only-binary :all: PyQt6==6.4.0 PyQt6-Qt6==6.5.3 PyQt6-sip==13.6.0 --target=python\Lib\site-packages
python\python.exe -m pip install --no-cache-dir --no-warn-script-location --only-binary :all: Pillow==10.2.0 --target=python\Lib\site-packages
python\python.exe -m pip install --no-cache-dir --no-warn-script-location send2trash==1.8.2 svglib==1.5.1 requests==2.28.0 --target=python\Lib\site-packages

rem Проверяем установку
echo Проверка установки...
python\python.exe -c "import PyQt6, PIL, send2trash, svglib, requests; print('Все зависимости установлены успешно')"

rem Очищаем ненужные файлы
echo Очистка временных файлов...
del python\get-pip.py
rmdir /s /q python\Scripts

echo Готово! Теперь можно собрать установщик с помощью build_installer.bat
pause 