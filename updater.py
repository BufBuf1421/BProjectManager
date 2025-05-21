import os
import json
import requests
import hashlib
import shutil
from datetime import datetime
from version import VERSION
from PyQt6.QtWidgets import QMessageBox
from PyQt6.QtCore import QObject, pyqtSignal
from app_paths import get_temp_dir, get_backup_dir, get_app_root

class Updater(QObject):
    update_available = pyqtSignal(str)  # Сигнал о доступности обновления
    update_progress = pyqtSignal(int)   # Сигнал прогресса загрузки
    update_error = pyqtSignal(str)      # Сигнал ошибки обновления
    update_completed = pyqtSignal()     # Сигнал завершения обновления
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.current_version = VERSION
        self.github_api_url = "https://api.github.com/repos/BufBuf1421/BProjectManager/releases/latest"
        print(f"[DEBUG] Updater initialized with current version: {self.current_version}")
    
    def check_for_updates(self):
        """Проверка наличия обновлений"""
        try:
            print(f"[DEBUG] Checking for updates")
            
            # Получаем информацию о последнем релизе
            headers = {'User-Agent': 'BProjectManager-Updater'}
            response = requests.get(self.github_api_url, headers=headers)
            if response.status_code != 200:
                raise Exception(f"Failed to get releases: HTTP {response.status_code}")
            
            release_info = response.json()
            latest_version = release_info['tag_name'].lstrip('v')
            
            print(f"[DEBUG] Latest version from GitHub: {latest_version}")
            print(f"[DEBUG] Current installed version: {self.current_version}")
            print(f"[DEBUG] Release info: {release_info}")
            
            # Преобразуем версии в числа для сравнения
            current_parts = [int(x) for x in self.current_version.split('.')]
            latest_parts = [int(x) for x in latest_version.split('.')]
            
            # Дополняем версии нулями, если разной длины
            while len(current_parts) < len(latest_parts):
                current_parts.append(0)
            while len(latest_parts) < len(current_parts):
                latest_parts.append(0)
            
            # Сравниваем версии
            is_update_available = False
            for current, latest in zip(current_parts, latest_parts):
                if latest > current:
                    is_update_available = True
                    break
                elif current > latest:
                    break
            
            if is_update_available:
                print(f"[DEBUG] Update available: {latest_version}")
                self.update_available.emit(latest_version)
                
                # Проверяем наличие ассетов
                if 'assets' not in release_info or not isinstance(release_info['assets'], list):
                    print("[DEBUG] No assets field found in release info")
                    error_msg = f"Доступно обновление {latest_version}, но структура релиза некорректна. Попробуйте позже."
                    self.update_error.emit(error_msg)
                    return False, latest_version, None
                    
                print(f"[DEBUG] Found {len(release_info['assets'])} assets")
                if len(release_info['assets']) == 0:
                    print("[DEBUG] Assets list is empty, using source code archive")
                    if 'zipball_url' in release_info:
                        download_url = release_info['zipball_url']
                        print(f"[DEBUG] Using zipball URL: {download_url}")
                        return True, latest_version, download_url
                    else:
                        print("[DEBUG] No zipball URL found")
                        error_msg = f"Доступно обновление {latest_version}, но файлы обновления недоступны. Попробуйте позже."
                        self.update_error.emit(error_msg)
                        return False, latest_version, None
                
                download_url = release_info['assets'][0]['browser_download_url']
                print(f"[DEBUG] Download URL: {download_url}")
                return True, latest_version, download_url
            else:
                print("[DEBUG] No updates available")
                return False, None, None
                
        except Exception as e:
            error_msg = f"Ошибка при проверке обновлений: {str(e)}"
            print(f"[ERROR] {error_msg}")
            self.update_error.emit(error_msg)
            return False, None, None
    
    def download_and_apply_update(self, download_url):
        """Загрузка и применение обновления"""
        try:
            print(f"[DEBUG] Starting update download from {download_url}")
            
            # Создаем временную директорию
            temp_dir = get_temp_dir()
            os.makedirs(temp_dir, exist_ok=True)
            
            # Загружаем архив
            headers = {'User-Agent': 'BProjectManager-Updater'}
            response = requests.get(download_url, stream=True, headers=headers)
            if response.status_code != 200:
                raise Exception(f"Failed to download update: HTTP {response.status_code}")
                
            # Сохраняем архив
            zip_path = os.path.join(temp_dir, "update.zip")
            total_size = int(response.headers.get('content-length', 0))
            block_size = 8192
            downloaded = 0
            
            with open(zip_path, 'wb') as f:
                for data in response.iter_content(block_size):
                    downloaded += len(data)
                    f.write(data)
                    if total_size:
                        progress = int((downloaded / total_size) * 100)
                        self.update_progress.emit(progress)
                
            print("[DEBUG] Download completed successfully")
            
            # Распаковываем архив
            import zipfile
            extract_dir = os.path.join(temp_dir, "extracted")
            os.makedirs(extract_dir, exist_ok=True)
            
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(extract_dir)
            
            print("[DEBUG] Archive extracted successfully")
            
            # Находим корневую директорию в распакованном архиве
            extracted_contents = os.listdir(extract_dir)
            if len(extracted_contents) == 0:
                raise Exception("Extracted archive is empty")
            
            source_dir = os.path.join(extract_dir, extracted_contents[0])
            if not os.path.isdir(source_dir):
                source_dir = extract_dir
            
            print(f"[DEBUG] Source directory: {source_dir}")
            
            # Копируем файлы в целевую директорию
            app_dir = get_app_root()
            print(f"[DEBUG] Target directory: {app_dir}")
            
            # Копируем все файлы, кроме settings.json и других конфигурационных файлов
            for item in os.listdir(source_dir):
                s = os.path.join(source_dir, item)
                d = os.path.join(app_dir, item)
                if item not in ['settings.json']:
                    if os.path.isfile(s):
                        shutil.copy2(s, d)
                    elif os.path.isdir(s):
                        if os.path.exists(d):
                            shutil.rmtree(d)
                        shutil.copytree(s, d)
            
            print("[DEBUG] Files copied successfully")
            self.update_completed.emit()
            return True
            
        except Exception as e:
            error_msg = f"Ошибка при загрузке обновления: {str(e)}"
            print(f"[ERROR] {error_msg}")
            self.update_error.emit(error_msg)
            return False