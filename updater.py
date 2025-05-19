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
                if not release_info['assets']:
                    print("[DEBUG] No assets found in release")
                    return False, None, None
                    
                download_url = release_info['assets'][0]['browser_download_url']
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
            response = requests.get(download_url, stream=True)
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
            self.update_completed.emit()
            return True
            
        except Exception as e:
            error_msg = f"Ошибка при загрузке обновления: {str(e)}"
            print(f"[ERROR] {error_msg}")
            self.update_error.emit(error_msg)
            return False 