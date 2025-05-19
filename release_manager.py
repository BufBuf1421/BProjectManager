import os
import sys
import json
import zipfile
import requests
from version import VERSION
import time

class ReleaseManager:
    def __init__(self):
        self.repo = "BufBuf1421/BProjectManager"
        self.api_url = f"https://api.github.com/repos/{self.repo}/releases"
        self.token = os.getenv('GITHUB_TOKEN')
        self.max_retries = 3
        self.timeout = 30
        
    def create_release(self):
        """Создание нового релиза"""
        if not self.token:
            print("ОШИБКА: Токен GitHub не найден!")
            print("Установите переменную окружения GITHUB_TOKEN с вашим токеном")
            print("Например:")
            print("$env:GITHUB_TOKEN = 'ваш_токен'")
            return
        
        zip_path = None
        try:
            # Создаем ZIP архив
            print("Создание архива релиза...")
            zip_path = self._create_release_archive()
            
            # Проверяем размер архива
            zip_size = os.path.getsize(zip_path)
            if zip_size > 100 * 1024 * 1024:  # 100 MB
                raise ValueError(f"Размер архива ({zip_size / 1024 / 1024:.1f} MB) превышает 100 MB")
            
            # Создаем релиз на GitHub
            print(f"Создание релиза версии {VERSION}...")
            headers = {
                "Authorization": f"token {self.token}",
                "Accept": "application/vnd.github.v3+json"
            }
            
            release_data = {
                "tag_name": f"v{VERSION}",
                "target_commitish": "main",
                "name": f"Версия {VERSION}",
                "body": self._generate_release_notes(),
                "draft": False,
                "prerelease": False
            }
            
            # Создаем релиз с повторными попытками
            for attempt in range(self.max_retries):
                try:
                    response = requests.post(
                        self.api_url,
                        headers=headers,
                        json=release_data,
                        timeout=self.timeout
                    )
                    response.raise_for_status()
                    release = response.json()
                    break
                except requests.exceptions.RequestException as e:
                    if attempt == self.max_retries - 1:
                        raise
                    print(f"Попытка {attempt + 1} не удалась: {str(e)}")
                    time.sleep(2 ** attempt)  # Экспоненциальная задержка
            
            # Загружаем архив
            print("Загрузка архива...")
            upload_url = release['upload_url'].replace("{?name,label}", "")
            
            # Загружаем файл с повторными попытками
            for attempt in range(self.max_retries):
                try:
                    with open(zip_path, 'rb') as f:
                        response = requests.post(
                            upload_url,
                            headers={**headers, "Content-Type": "application/zip"},
                            params={'name': f'BProjectManager-{VERSION}.zip'},
                            data=f,
                            timeout=self.timeout
                        )
                        response.raise_for_status()
                        break
                except requests.exceptions.RequestException as e:
                    if attempt == self.max_retries - 1:
                        raise
                    print(f"Попытка загрузки {attempt + 1} не удалась: {str(e)}")
                    time.sleep(2 ** attempt)
            
            print(f"Релиз версии {VERSION} успешно создан!")
            print(f"URL релиза: {release['html_url']}")
            
        except Exception as e:
            print(f"Ошибка при создании релиза: {str(e)}")
            raise
        finally:
            # Удаляем временный архив
            if zip_path and os.path.exists(zip_path):
                try:
                    os.remove(zip_path)
                except Exception as e:
                    print(f"Не удалось удалить временный архив: {str(e)}")
    
    def _create_release_archive(self):
        """Создание ZIP архива с файлами релиза"""
        zip_path = f"BProjectManager-{VERSION}.zip"
        
        # Список файлов и директорий для включения в архив
        include_files = [
            # Основные файлы приложения
            'main.py',
            'project_window.py',
            'settings_dialog.py',
            'updater.py',
            'version.py',
            'requirements.txt',
            'README.md',
            'LICENSE',
            
            # Компоненты интерфейса
            'styles.py',
            'create_project_dialog.py',
            'search_panel.py',
            'project_card.py',
            'project_group.py',
            
            # Ресурсы
            'icons/',
            
            # Настройка и запуск
            'python_setup.py',
            'launcher.bat',
            'start_app.bat',
            
            # Плагины и аддоны
            'blender_addon.py',
            'plugins/substance_painter_plugin',
            
            # Утилиты
            'backup_app.py',
            'convert_icons.py'
        ]
        
        # Список файлов для исключения
        exclude_files = [
            '__pycache__',
            '*.pyc',
            '.git',
            '.gitignore',
            'release_manager.py',
            'git_commit.bat',
            'build_installer.bat',
            'build_environment.bat',
            'installer.iss',
            'test.py',
            '*.zip',
            'settings.json',
            'projects.json',
            '*.log',
            'temp_*'
        ]
        
        missing_files = []
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            for item in include_files:
                if not os.path.exists(item):
                    missing_files.append(item)
                    continue
                    
                if os.path.isfile(item):
                    print(f"Добавление файла: {item}")
                    zf.write(item)
                elif os.path.isdir(item):
                    print(f"Добавление директории: {item}")
                    for root, dirs, files in os.walk(item):
                        # Пропускаем исключенные директории
                        dirs[:] = [d for d in dirs if not any(
                            d.startswith(ex.rstrip('/')) or 
                            any(d.endswith(ex.lstrip('*')) for ex in exclude_files if ex.startswith('*'))
                            for ex in exclude_files
                        )]
                        
                        for file in files:
                            # Пропускаем исключенные файлы
                            if any(
                                file.endswith(ex.lstrip('*')) or
                                file == ex
                                for ex in exclude_files
                            ):
                                continue
                            
                            file_path = os.path.join(root, file)
                            print(f"  + {file_path}")
                            zf.write(file_path)
        
        if missing_files:
            print("\nВНИМАНИЕ: Следующие файлы не найдены:")
            for file in missing_files:
                print(f"  - {file}")
            
            if not os.path.getsize(zip_path):
                raise FileNotFoundError("Не удалось создать архив: все файлы отсутствуют")
        
        return zip_path
    
    def _generate_release_notes(self):
        """Генерация описания релиза"""
        return f"""# BProjectManager {VERSION}

## Что нового:
- Улучшена система обновления
- Исправлены проблемы с путями в PowerShell скриптах
- Добавлено автоматическое создание резервной копии перед обновлением
- Улучшена обработка ошибок при обновлении

## Установка
1. Скачайте архив BProjectManager-{VERSION}.zip
2. Распакуйте архив в нужную директорию
3. Запустите `start_app.bat`

## Системные требования
- Windows 10 или выше
- 100 MB свободного места на диске
- Доступ к интернету для обновлений
"""

if __name__ == "__main__":
    try:
        manager = ReleaseManager()
        manager.create_release()
    except Exception as e:
        print(f"\nОШИБКА: {str(e)}")
        sys.exit(1) 