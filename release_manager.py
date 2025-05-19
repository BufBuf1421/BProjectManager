import os
import sys
import json
import zipfile
import requests
from version import VERSION
from getpass import getpass

class ReleaseManager:
    def __init__(self):
        self.repo = "BufBuf1421/BProjectManager"
        self.api_url = f"https://api.github.com/repos/{self.repo}/releases"
        self.token = None
        
    def create_release(self):
        """Создание нового релиза"""
        if not self.token:
            print("Для создания релиза необходим токен GitHub.")
            print("Создайте его в настройках GitHub: Settings -> Developer settings -> Personal access tokens -> Tokens (classic)")
            print("Токен должен иметь права: repo")
            self.token = getpass("Введите ваш GitHub токен: ")
        
        # Создаем ZIP архив
        print("Создание архива релиза...")
        zip_path = self._create_release_archive()
        
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
        
        try:
            # Создаем релиз
            response = requests.post(self.api_url, headers=headers, json=release_data)
            response.raise_for_status()
            release = response.json()
            
            # Загружаем архив
            print("Загрузка архива...")
            upload_url = release['upload_url'].replace("{?name,label}", "")
            files = {'file': open(zip_path, 'rb')}
            params = {'name': f'BProjectManager-{VERSION}.zip'}
            
            response = requests.post(
                upload_url,
                headers={**headers, "Content-Type": "application/zip"},
                params=params,
                data=open(zip_path, 'rb')
            )
            response.raise_for_status()
            
            print(f"Релиз версии {VERSION} успешно создан!")
            print(f"URL релиза: {release['html_url']}")
            
            # Удаляем временный архив
            os.remove(zip_path)
            
        except requests.exceptions.RequestException as e:
            print(f"Ошибка при создании релиза: {str(e)}")
            if os.path.exists(zip_path):
                os.remove(zip_path)
    
    def _create_release_archive(self):
        """Создание ZIP архива с файлами релиза"""
        zip_path = f"BProjectManager-{VERSION}.zip"
        
        # Список файлов и директорий для включения в архив
        include_files = [
            'main.py',
            'project_window.py',
            'settings_dialog.py',
            'updater.py',
            'version.py',
            'requirements.txt',
            'README.md',
            'icons/'
        ]
        
        # Список файлов для исключения
        exclude_files = [
            '__pycache__',
            '*.pyc',
            '.git',
            '.gitignore',
            'release_manager.py'
        ]
        
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            for item in include_files:
                if os.path.isfile(item):
                    zf.write(item)
                elif os.path.isdir(item):
                    for root, dirs, files in os.walk(item):
                        # Пропускаем исключенные директории
                        dirs[:] = [d for d in dirs if not any(d.startswith(ex.rstrip('/')) for ex in exclude_files)]
                        
                        for file in files:
                            # Пропускаем исключенные файлы
                            if any(file.endswith(ex.lstrip('*')) for ex in exclude_files):
                                continue
                            
                            file_path = os.path.join(root, file)
                            zf.write(file_path)
        
        return zip_path
    
    def _generate_release_notes(self):
        """Генерация описания релиза"""
        return f"""# BProjectManager {VERSION}

## Что нового:
- Добавлена система автоматического обновления
- Улучшен интерфейс окна настроек
- Исправлены мелкие ошибки

## Установка
1. Скачайте архив BProjectManager-{VERSION}.zip
2. Распакуйте архив в нужную директорию
3. Установите зависимости: `pip install -r requirements.txt`
4. Запустите приложение: `python main.py`

## Системные требования
- Python 3.8 или выше
- PyQt6
- Pillow
- Requests
"""

if __name__ == "__main__":
    manager = ReleaseManager()
    manager.create_release() 