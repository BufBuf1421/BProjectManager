import os
import json
import requests
from version import VERSION
from PyQt6.QtWidgets import QMessageBox
from PyQt6.QtCore import QObject, pyqtSignal

class Updater(QObject):
    update_available = pyqtSignal(str)  # Сигнал о доступности обновления
    update_progress = pyqtSignal(int)   # Сигнал прогресса загрузки
    update_error = pyqtSignal(str)      # Сигнал ошибки обновления
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.current_version = VERSION
        self.github_api_url = "https://api.github.com/repos/BufBuf1421/BProjectManager/releases/latest"
        print(f"[DEBUG] Updater initialized with current version: {self.current_version}")
    
    def check_for_updates(self):
        """Проверка наличия обновлений"""
        try:
            print(f"[DEBUG] Checking for updates at: {self.github_api_url}")
            response = requests.get(self.github_api_url)
            print(f"[DEBUG] Response status code: {response.status_code}")
            
            if response.status_code == 200:
                release_info = response.json()
                latest_version = release_info['tag_name'].lstrip('v')
                print(f"[DEBUG] Latest version: {latest_version}, Current version: {self.current_version}")
                
                comparison = self._compare_versions(latest_version, self.current_version)
                print(f"[DEBUG] Version comparison result: {comparison}")
                
                if comparison > 0:
                    download_url = release_info['assets'][0]['browser_download_url']
                    print(f"[DEBUG] Update available. Download URL: {download_url}")
                    self.update_available.emit(latest_version)
                    return True, latest_version, download_url
                print("[DEBUG] No update needed")
                return False, None, None
            else:
                error_msg = f"Ошибка при проверке обновлений: {response.status_code}"
                print(f"[ERROR] {error_msg}")
                self.update_error.emit(error_msg)
                return False, None, None
        except Exception as e:
            error_msg = f"Ошибка при проверке обновлений: {str(e)}"
            print(f"[ERROR] {error_msg}")
            self.update_error.emit(error_msg)
            return False, None, None
    
    def download_update(self, download_url, save_path):
        """Загрузка обновления"""
        try:
            print(f"[DEBUG] Starting download from: {download_url}")
            print(f"[DEBUG] Saving to: {save_path}")
            
            # Создаем директорию для сохранения, если она не существует
            os.makedirs(os.path.dirname(save_path), exist_ok=True)
            
            # Удаляем старый файл обновления, если он существует
            if os.path.exists(save_path):
                os.remove(save_path)
            
            response = requests.get(download_url, stream=True)
            if response.status_code != 200:
                raise Exception(f"Failed to download update: HTTP {response.status_code}")
                
            total_size = int(response.headers.get('content-length', 0))
            print(f"[DEBUG] Total download size: {total_size} bytes")
            
            if total_size == 0:
                raise Exception("Invalid download size")
            
            block_size = 1024
            downloaded = 0
            
            with open(save_path, 'wb') as f:
                for data in response.iter_content(block_size):
                    downloaded += len(data)
                    f.write(data)
                    if total_size:
                        progress = int((downloaded / total_size) * 100)
                        print(f"[DEBUG] Download progress: {progress}%")
                        self.update_progress.emit(progress)
            
            # Проверяем, что файл действительно загружен
            if not os.path.exists(save_path):
                raise Exception("Update file was not created")
                
            if os.path.getsize(save_path) == 0:
                raise Exception("Update file is empty")
                
            print("[DEBUG] Download completed successfully")
            return True
        except Exception as e:
            error_msg = f"Ошибка при загрузке обновления: {str(e)}"
            print(f"[ERROR] {error_msg}")
            self.update_error.emit(error_msg)
            return False
    
    def _compare_versions(self, version1, version2):
        """Сравнение версий. Возвращает:
        1 если version1 > version2
        -1 если version1 < version2
        0 если версии равны"""
        try:
            v1_parts = [int(x) for x in version1.split('.')]
            v2_parts = [int(x) for x in version2.split('.')]
            
            for i in range(max(len(v1_parts), len(v2_parts))):
                v1 = v1_parts[i] if i < len(v1_parts) else 0
                v2 = v2_parts[i] if i < len(v2_parts) else 0
                
                if v1 > v2:
                    return 1
                elif v1 < v2:
                    return -1
            return 0
        except Exception as e:
            print(f"[ERROR] Version comparison failed: {str(e)}")
            return 0 