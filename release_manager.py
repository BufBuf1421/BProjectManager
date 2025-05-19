import os
import sys
import json
import zipfile
import requests
import subprocess
import re
from datetime import datetime
from typing import List, Dict, Tuple
from version import VERSION
import time

class ReleaseManager:
    def __init__(self):
        self.repo = "BufBuf1421/BProjectManager"
        self.api_url = f"https://api.github.com/repos/{self.repo}/releases"
        self.token = os.getenv('GITHUB_TOKEN')
        self.max_retries = 3
        self.timeout = 30
        
        # Загружаем текущую версию
        with open('version.py', 'r', encoding='utf-8') as f:
            version_content = f.read()
            self.current_version = re.search(r'VERSION\s*=\s*["\'](.+?)["\']', version_content).group(1)
    
    def increment_version(self) -> str:
        """Увеличивает номер версии"""
        try:
            major, minor, patch = map(int, self.current_version.split('.'))
            patch += 1
            new_version = f"{major}.{minor}.{patch}"
            
            # Обновляем файл version.py
            with open('version.py', 'w', encoding='utf-8') as f:
                f.write(f'VERSION = "{new_version}"\n')
            
            print(f"Версия обновлена: {self.current_version} -> {new_version}")
            return new_version
        except Exception as e:
            raise ValueError(f"Ошибка при обновлении версии: {str(e)}")
    
    def get_changed_files(self) -> List[str]:
        """Получает список измененных файлов из Git"""
        try:
            # Получаем список измененных файлов
            result = subprocess.run(
                ['git', 'status', '--porcelain'],
                capture_output=True,
                text=True,
                check=True
            )
            
            changed_files = []
            for line in result.stdout.splitlines():
                status = line[:2]
                file_path = line[3:].strip()
                
                # Пропускаем файлы, которые не должны быть в релизе
                if any(file_path.endswith(ext) for ext in ['.pyc', '.log', '.tmp']):
                    continue
                if any(name in file_path for name in ['__pycache__', '.git', 'temp']):
                    continue
                
                if status in ['M ', 'A ', '?? ']:  # Modified, Added, Untracked
                    changed_files.append(file_path)
            
            return changed_files
        except subprocess.CalledProcessError as e:
            raise ValueError(f"Ошибка при получении списка измененных файлов: {str(e)}")
    
    def commit_and_push(self, version: str, changed_files: List[str]):
        """Создает коммит и отправляет изменения в репозиторий"""
        try:
            # Добавляем измененные файлы
            subprocess.run(['git', 'add', *changed_files, 'version.py'], check=True)
            
            # Создаем коммит
            commit_message = f"Release version {version}\n\nChanged files:\n" + "\n".join(f"- {f}" for f in changed_files)
            subprocess.run(['git', 'commit', '-m', commit_message], check=True)
            
            # Создаем тег версии
            subprocess.run(['git', 'tag', f'v{version}'], check=True)
            
            # Отправляем изменения и тег
            subprocess.run(['git', 'push'], check=True)
            subprocess.run(['git', 'push', '--tags'], check=True)
            
            print("Изменения успешно отправлены в репозиторий")
        except subprocess.CalledProcessError as e:
            raise ValueError(f"Ошибка при работе с Git: {str(e)}")
    
    def create_release_archive(self, changed_files: List[str]) -> str:
        """Создание ZIP архива только с измененными файлами"""
        zip_path = f"BProjectManager-{self.current_version}.zip"
        
        try:
            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
                for file_path in changed_files:
                    if os.path.exists(file_path):
                        print(f"Добавление файла: {file_path}")
                        zf.write(file_path)
                    else:
                        print(f"ВНИМАНИЕ: Файл не найден: {file_path}")
                
                # Всегда добавляем version.py
                zf.write('version.py')
            
            if not os.path.getsize(zip_path):
                raise FileNotFoundError("Не удалось создать архив: все файлы отсутствуют")
            
            return zip_path
        except Exception as e:
            if os.path.exists(zip_path):
                os.remove(zip_path)
            raise ValueError(f"Ошибка при создании архива: {str(e)}")
    
    def generate_release_notes(self, changed_files: List[str]) -> str:
        """Генерация описания релиза"""
        return f"""# BProjectManager {self.current_version}

## Изменения в этой версии:
{self._format_changes(changed_files)}

## Измененные файлы:
{self._format_files(changed_files)}

## Информация об обновлении
- Дата релиза: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
- Тип обновления: Частичное (только измененные файлы)
- Размер обновления: {self._get_update_size(changed_files)}

## Установка
1. Приложение автоматически загрузит и установит обновление
2. В случае проблем, скачайте архив BProjectManager-{self.current_version}.zip
3. Распакуйте архив, заменив существующие файлы

## Системные требования
- Windows 10 или выше
- Доступ к интернету для обновлений
"""
    
    def _format_changes(self, files: List[str]) -> str:
        """Форматирует список изменений по категориям"""
        categories = {
            'core': [],      # Основные файлы
            'ui': [],        # Файлы интерфейса
            'plugins': [],   # Плагины
            'other': []      # Прочее
        }
        
        for file in files:
            if file.endswith(('.py', '.bat')):
                if 'plugins' in file:
                    categories['plugins'].append(file)
                elif any(name in file for name in ['window', 'dialog', 'panel', 'card']):
                    categories['ui'].append(file)
                elif file in ['main.py', 'updater.py', 'version.py', 'app_paths.py']:
                    categories['core'].append(file)
                else:
                    categories['other'].append(file)
            else:
                categories['other'].append(file)
        
        result = []
        if categories['core']:
            result.append("### Основные компоненты:")
            result.extend(f"- Обновлен {os.path.basename(f)}" for f in categories['core'])
        
        if categories['ui']:
            result.append("\n### Интерфейс:")
            result.extend(f"- Обновлен {os.path.basename(f)}" for f in categories['ui'])
        
        if categories['plugins']:
            result.append("\n### Плагины:")
            result.extend(f"- Обновлен {os.path.basename(f)}" for f in categories['plugins'])
        
        if categories['other']:
            result.append("\n### Прочие изменения:")
            result.extend(f"- Обновлен {os.path.basename(f)}" for f in categories['other'])
        
        return "\n".join(result)
    
    def _format_files(self, files: List[str]) -> str:
        """Форматирует список файлов с их размерами"""
        result = []
        for file in files:
            if os.path.exists(file):
                size = os.path.getsize(file)
                size_str = self._format_size(size)
                result.append(f"- {file} ({size_str})")
        return "\n".join(result)
    
    def _get_update_size(self, files: List[str]) -> str:
        """Вычисляет общий размер обновления"""
        total_size = sum(os.path.getsize(f) for f in files if os.path.exists(f))
        return self._format_size(total_size)
    
    def _format_size(self, size: int) -> str:
        """Форматирует размер файла в человекочитаемый вид"""
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size < 1024:
                return f"{size:.1f} {unit}"
            size /= 1024
        return f"{size:.1f} TB"
    
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
            # Получаем список измененных файлов
            print("Получение списка измененных файлов...")
            changed_files = self.get_changed_files()
            
            if not changed_files:
                print("Нет измененных файлов для релиза")
                return
            
            print("\nИзмененные файлы:")
            for file in changed_files:
                print(f"  - {file}")
            
            # Увеличиваем версию
            new_version = self.increment_version()
            
            # Создаем архив только с измененными файлами
            print("\nСоздание архива релиза...")
            zip_path = self.create_release_archive(changed_files)
            
            # Проверяем размер архива
            zip_size = os.path.getsize(zip_path)
            if zip_size > 100 * 1024 * 1024:  # 100 MB
                raise ValueError(f"Размер архива ({zip_size / 1024 / 1024:.1f} MB) превышает 100 MB")
            
            # Создаем коммит и отправляем изменения
            print("\nОтправка изменений в репозиторий...")
            self.commit_and_push(new_version, changed_files)
            
            # Создаем релиз на GitHub
            print(f"\nСоздание релиза версии {new_version}...")
            headers = {
                "Authorization": f"token {self.token}",
                "Accept": "application/vnd.github.v3+json"
            }
            
            release_data = {
                "tag_name": f"v{new_version}",
                "target_commitish": "main",
                "name": f"Версия {new_version}",
                "body": self.generate_release_notes(changed_files),
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
                    time.sleep(2 ** attempt)
            
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
                            params={'name': f'BProjectManager-{new_version}.zip'},
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
            
            print(f"\nРелиз версии {new_version} успешно создан!")
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

if __name__ == "__main__":
    try:
        manager = ReleaseManager()
        manager.create_release()
    except Exception as e:
        print(f"\nОШИБКА: {str(e)}")
        sys.exit(1) 