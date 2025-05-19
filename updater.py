import os
import json
import shutil
import hashlib
import requests
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass
from version import VERSION
from PyQt6.QtWidgets import QMessageBox
from PyQt6.QtCore import QObject, pyqtSignal

@dataclass
class UpdateFile:
    path: str
    hash: str
    size: int

class UpdateManager(QObject):
    update_available = pyqtSignal(str)
    update_progress = pyqtSignal(int, str)
    update_error = pyqtSignal(str)
    update_completed = pyqtSignal()
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.current_version = VERSION
        self.github_api_url = "https://api.github.com/repos/BufBuf1421/BProjectManager/releases/latest"
        self.root_dir = os.path.dirname(os.path.abspath(__file__))
        self.temp_dir = os.path.join(self.root_dir, "temp_update")
        self.backup_dir = os.path.join(self.root_dir, "backup")
        
    def _calculate_file_hash(self, file_path: str) -> str:
        """Вычисляет SHA256 хеш файла"""
        sha256_hash = hashlib.sha256()
        with open(file_path, "rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()
    
    def _get_local_files_info(self) -> Dict[str, UpdateFile]:
        """Собирает информацию о локальных файлах"""
        local_files = {}
        
        for root, _, files in os.walk(self.root_dir):
            for file in files:
                if file.startswith('.') or root.startswith(('.', '_')):
                    continue
                    
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, self.root_dir)
                
                local_files[rel_path] = UpdateFile(
                    path=rel_path,
                    hash=self._calculate_file_hash(full_path),
                    size=os.path.getsize(full_path)
                )
        
        return local_files
    
    def check_for_updates(self) -> Tuple[bool, Optional[str], Optional[str]]:
        """Проверяет наличие обновлений"""
        try:
            response = requests.get(self.github_api_url)
            if response.status_code == 200:
                release_info = response.json()
                latest_version = release_info['tag_name'].lstrip('v')
                
                if self._compare_versions(latest_version, self.current_version) > 0:
                    manifest_url = next(
                        (asset['browser_download_url'] for asset in release_info['assets'] 
                         if asset['name'] == 'update_manifest.json'),
                        None
                    )
                    
                    if manifest_url:
                        self.update_available.emit(latest_version)
                        return True, latest_version, manifest_url
                    
                return False, None, None
            else:
                self.update_error.emit(f"Ошибка при проверке обновлений: {response.status_code}")
                return False, None, None
                
        except Exception as e:
            self.update_error.emit(f"Ошибка при проверке обновлений: {str(e)}")
            return False, None, None
    
    def download_and_apply_update(self, manifest_url: str) -> bool:
        """Загружает и применяет обновление"""
        try:
            # Создаем временную директорию
            os.makedirs(self.temp_dir, exist_ok=True)
            os.makedirs(self.backup_dir, exist_ok=True)
            
            # Загружаем манифест обновления
            manifest_response = requests.get(manifest_url)
            if manifest_response.status_code != 200:
                raise Exception("Не удалось загрузить манифест обновления")
                
            update_manifest = manifest_response.json()
            local_files = self._get_local_files_info()
            
            # Определяем файлы для обновления
            files_to_update = []
            for file_info in update_manifest['files']:
                local_file = local_files.get(file_info['path'])
                if not local_file or local_file.hash != file_info['hash']:
                    files_to_update.append(file_info)
            
            total_files = len(files_to_update)
            for index, file_info in enumerate(files_to_update, 1):
                # Загружаем файл
                file_url = file_info['url']
                local_path = os.path.join(self.temp_dir, file_info['path'])
                os.makedirs(os.path.dirname(local_path), exist_ok=True)
                
                response = requests.get(file_url, stream=True)
                if response.status_code != 200:
                    raise Exception(f"Не удалось загрузить файл: {file_info['path']}")
                
                with open(local_path, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)
                
                # Проверяем хеш загруженного файла
                if self._calculate_file_hash(local_path) != file_info['hash']:
                    raise Exception(f"Ошибка проверки целостности файла: {file_info['path']}")
                
                # Создаем резервную копию и заменяем файл
                dest_path = os.path.join(self.root_dir, file_info['path'])
                backup_path = os.path.join(self.backup_dir, file_info['path'])
                
                if os.path.exists(dest_path):
                    os.makedirs(os.path.dirname(backup_path), exist_ok=True)
                    shutil.copy2(dest_path, backup_path)
                
                os.makedirs(os.path.dirname(dest_path), exist_ok=True)
                shutil.copy2(local_path, dest_path)
                
                progress = int((index / total_files) * 100)
                self.update_progress.emit(progress, f"Обновление файла {index} из {total_files}")
            
            # Очищаем временные файлы
            shutil.rmtree(self.temp_dir, ignore_errors=True)
            self.update_completed.emit()
            return True
            
        except Exception as e:
            self.update_error.emit(f"Ошибка при установке обновления: {str(e)}")
            # Восстанавливаем файлы из резервной копии
            self._restore_backup()
            return False
            
    def _restore_backup(self):
        """Восстанавливает файлы из резервной копии"""
        if os.path.exists(self.backup_dir):
            try:
                for root, _, files in os.walk(self.backup_dir):
                    for file in files:
                        backup_file = os.path.join(root, file)
                        relative_path = os.path.relpath(backup_file, self.backup_dir)
                        dest_file = os.path.join(self.root_dir, relative_path)
                        
                        os.makedirs(os.path.dirname(dest_file), exist_ok=True)
                        shutil.copy2(backup_file, dest_file)
                        
                shutil.rmtree(self.backup_dir, ignore_errors=True)
            except Exception as e:
                self.update_error.emit(f"Ошибка при восстановлении из резервной копии: {str(e)}")
    
    def _compare_versions(self, version1: str, version2: str) -> int:
        """Сравнение версий"""
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
        except Exception:
            return 0 