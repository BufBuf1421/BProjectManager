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
    update_completed = pyqtSignal()      # Сигнал завершения обновления
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.current_version = VERSION
        self.github_api_base = "https://api.github.com/repos/BufBuf1421/BProjectManager"
        self.github_raw_base = "https://raw.githubusercontent.com/BufBuf1421/BProjectManager"
        self.app_root = get_app_root()
        self.temp_dir = get_temp_dir()
        self.backup_dir = get_backup_dir()
        print(f"[DEBUG] Updater initialized with current version: {self.current_version}")
    
    def _get_latest_version_from_github(self):
        """Получает последнюю версию из version.py в репозитории"""
        try:
            # Сначала получаем информацию о последней версии в main ветке
            headers = {'User-Agent': 'BProjectManager-Updater'}
            
            # Получаем последний коммит в main ветке
            branches_url = f"{self.github_api_base}/branches/main"
            branch_response = requests.get(branches_url, headers=headers)
            if branch_response.status_code != 200:
                raise Exception(f"Failed to get branch info: HTTP {branch_response.status_code}")
            
            # Получаем содержимое version.py из последнего коммита
            version_url = f"{self.github_raw_base}/main/BProjectManager/version.py"
            version_response = requests.get(version_url, headers=headers)
            if version_response.status_code != 200:
                raise Exception(f"Failed to get version.py: HTTP {version_response.status_code}")
            
            # Извлекаем версию из содержимого файла
            version_content = version_response.text
            version_line = version_content.strip()
            if version_line.startswith('VERSION = "') and version_line.endswith('"'):
                latest_version = version_line[len('VERSION = "'):-1]
                print(f"[DEBUG] Found version in repository: {latest_version}")
                return latest_version
            else:
                raise Exception("Invalid version.py format")
            
        except Exception as e:
            print(f"[ERROR] Failed to get latest version: {str(e)}")
            raise
    
    def check_for_updates(self):
        """Проверка наличия обновлений"""
        try:
            print(f"[DEBUG] Checking for updates in repository")
            
            try:
                latest_version = self._get_latest_version_from_github()
            except Exception as e:
                print(f"[DEBUG] Failed to get version from repository, falling back to releases")
                # Если не удалось получить версию из файла, пробуем получить из релизов
                headers = {'User-Agent': 'BProjectManager-Updater'}
                response = requests.get(f"{self.github_api_base}/releases/latest", headers=headers)
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
                elif latest < current:
                    break
            
            print(f"[DEBUG] Update available: {is_update_available}")
            
            if is_update_available:
                # Получаем информацию о последнем релизе для загрузки манифеста
                headers = {'User-Agent': 'BProjectManager-Updater'}
                response = requests.get(f"{self.github_api_base}/releases/latest", headers=headers)
                if response.status_code != 200:
                    raise Exception(f"Failed to get releases: HTTP {response.status_code}")
                
                release_info = response.json()
                # Ищем манифест в ассетах
                manifest_url = None
                for asset in release_info['assets']:
                    if asset['name'].startswith('update_manifest_') and asset['name'].endswith('.json'):
                        manifest_url = asset['browser_download_url']
                        break
                
                if not manifest_url:
                    raise Exception("Manifest file not found in release assets")
                    
                print(f"[DEBUG] Found manifest URL: {manifest_url}")
                self.update_available.emit(latest_version)
                return True, latest_version, manifest_url
                
            print("[DEBUG] No update needed - current version is up to date")
            return False, None, None
            
        except Exception as e:
            error_msg = f"Ошибка при проверке обновлений: {str(e)}"
            print(f"[ERROR] {error_msg}")
            self.update_error.emit(error_msg)
            return False, None, None
    
    def download_and_apply_update(self, manifest_url):
        """Загрузка и применение обновления"""
        try:
            # Загружаем манифест
            manifest_response = requests.get(manifest_url)
            if manifest_response.status_code != 200:
                raise Exception(f"Failed to download manifest: HTTP {manifest_response.status_code}")
            
            manifest = manifest_response.json()
            total_files = len(manifest['files'])
            updated_files = 0
            
            # Создаем временную директорию для загрузки
            os.makedirs(self.temp_dir, exist_ok=True)
            
            # Создаем директорию для бэкапов
            backup_timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_dir = os.path.join(self.backup_dir, f"backup_{backup_timestamp}")
            os.makedirs(backup_dir, exist_ok=True)
            
            # Обрабатываем каждый файл из манифеста
            for file_info in manifest['files']:
                file_path = os.path.join(self.app_root, file_info['path'])
                temp_path = os.path.join(self.temp_dir, file_info['path'])
                backup_path = os.path.join(backup_dir, file_info['path'])
                
                # Создаем необходимые директории
                os.makedirs(os.path.dirname(temp_path), exist_ok=True)
                os.makedirs(os.path.dirname(backup_path), exist_ok=True)
                
                # Проверяем хеш существующего файла
                if os.path.exists(file_path):
                    current_hash = self._calculate_file_hash(file_path)
                    if current_hash == file_info['hash']:
                        # Файл не изменился, пропускаем
                        updated_files += 1
                        progress = int((updated_files / total_files) * 100)
                        self.update_progress.emit(progress)
                        continue
                    
                    # Создаем резервную копию
                    shutil.copy2(file_path, backup_path)
                
                # Загружаем новый файл
                print(f"[DEBUG] Downloading file: {file_info['url']}")
                file_response = requests.get(file_info['url'], stream=True)
                if file_response.status_code != 200:
                    raise Exception(f"Failed to download file {file_info['path']}: HTTP {file_response.status_code}")
                
                # Сохраняем во временную директорию
                with open(temp_path, 'wb') as f:
                    for chunk in file_response.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)
                
                # Проверяем хеш загруженного файла
                downloaded_hash = self._calculate_file_hash(temp_path)
                if downloaded_hash != file_info['hash']:
                    raise Exception(f"Hash mismatch for file {file_info['path']}")
                
                # Копируем файл в целевую директорию
                os.makedirs(os.path.dirname(file_path), exist_ok=True)
                shutil.copy2(temp_path, file_path)
                
                updated_files += 1
                progress = int((updated_files / total_files) * 100)
                self.update_progress.emit(progress)
            
            # Очищаем временную директорию
            shutil.rmtree(self.temp_dir)
            
            self.update_completed.emit()
            return True
            
        except Exception as e:
            error_msg = f"Ошибка при обновлении: {str(e)}"
            print(f"[ERROR] {error_msg}")
            self.update_error.emit(error_msg)
            
            # В случае ошибки пытаемся восстановить файлы из бэкапа
            try:
                if os.path.exists(backup_dir):
                    for root, _, files in os.walk(backup_dir):
                        for file in files:
                            backup_file = os.path.join(root, file)
                            relative_path = os.path.relpath(backup_file, backup_dir)
                            target_file = os.path.join(self.app_root, relative_path)
                            os.makedirs(os.path.dirname(target_file), exist_ok=True)
                            shutil.copy2(backup_file, target_file)
            except Exception as restore_error:
                print(f"[ERROR] Failed to restore backup: {str(restore_error)}")
            
            return False
    
    def _calculate_file_hash(self, file_path):
        """Вычисляет SHA256 хеш файла"""
        sha256_hash = hashlib.sha256()
        with open(file_path, "rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()
    
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