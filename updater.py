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
        
    def check_for_updates(self):
        """Проверка наличия обновлений"""
        try:
            response = requests.get(self.github_api_url)
            if response.status_code == 200:
                release_info = response.json()
                latest_version = release_info['tag_name'].lstrip('v')
                
                if self._compare_versions(latest_version, self.current_version) > 0:
                    self.update_available.emit(latest_version)
                    return True, latest_version, release_info['assets'][0]['browser_download_url']
                return False, None, None
            else:
                self.update_error.emit("Ошибка при проверке обновлений")
                return False, None, None
        except Exception as e:
            self.update_error.emit(f"Ошибка при проверке обновлений: {str(e)}")
            return False, None, None
    
    def download_update(self, download_url, save_path):
        """Загрузка обновления"""
        try:
            response = requests.get(download_url, stream=True)
            total_size = int(response.headers.get('content-length', 0))
            block_size = 1024
            downloaded = 0
            
            with open(save_path, 'wb') as f:
                for data in response.iter_content(block_size):
                    downloaded += len(data)
                    f.write(data)
                    if total_size:
                        progress = int((downloaded / total_size) * 100)
                        self.update_progress.emit(progress)
            
            return True
        except Exception as e:
            self.update_error.emit(f"Ошибка при загрузке обновления: {str(e)}")
            return False
    
    def _compare_versions(self, version1, version2):
        """Сравнение версий. Возвращает:
        1 если version1 > version2
        -1 если version1 < version2
        0 если версии равны"""
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