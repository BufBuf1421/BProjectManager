import os
import json
import requests
import hashlib
import shutil
import logging
from datetime import datetime
from version import VERSION, APP_NAME, PUBLISHER, GITHUB_REPO, LAUNCHER_FILENAME
from PyQt6.QtWidgets import QMessageBox
from PyQt6.QtCore import QObject, pyqtSignal
from app_paths import get_temp_dir, get_backup_dir, get_app_root

# Настройка логирования
def setup_logging():
    log_dir = os.path.join(get_app_root(), 'logs')
    os.makedirs(log_dir, exist_ok=True)
    
    log_file = os.path.join(log_dir, f'updater_{datetime.now().strftime("%Y%m%d")}.log')
    
    # Ротация логов (оставляем только последние 5 файлов)
    log_files = sorted([f for f in os.listdir(log_dir) if f.startswith('updater_')])
    while len(log_files) >= 5:
        os.remove(os.path.join(log_dir, log_files[0]))
        log_files = log_files[1:]
    
    logging.basicConfig(
        level=logging.DEBUG,
        format='%(asctime)s [%(levelname)s] %(message)s',
        handlers=[
            logging.FileHandler(log_file, encoding='utf-8'),
            logging.StreamHandler()
        ]
    )

class Updater(QObject):
    update_available = pyqtSignal(str)  # Сигнал о доступности обновления
    update_progress = pyqtSignal(int)   # Сигнал прогресса загрузки
    update_error = pyqtSignal(str)      # Сигнал ошибки обновления
    update_completed = pyqtSignal()     # Сигнал завершения обновления
    restart_required = pyqtSignal()     # Сигнал о необходимости перезапуска
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.current_version = VERSION
        self.github_api_url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
        setup_logging()
        logging.info(f"Updater initialized with version: {self.current_version}")
    
    def calculate_file_hash(self, file_path):
        """Вычисление SHA-256 хэша файла"""
        sha256_hash = hashlib.sha256()
        with open(file_path, "rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()

    def verify_files(self, source_dir, manifest_path):
        """Проверка хэшей файлов после обновления"""
        try:
            with open(manifest_path, 'r') as f:
                manifest = json.load(f)
            
            for file_info in manifest['files']:
                file_path = os.path.join(source_dir, file_info['path'])
                if os.path.exists(file_path):
                    actual_hash = self.calculate_file_hash(file_path)
                    if actual_hash != file_info['hash']:
                        logging.error(f"Hash mismatch for {file_info['path']}")
                        return False
                else:
                    logging.error(f"File not found: {file_info['path']}")
                    return False
            return True
        except Exception as e:
            logging.error(f"Error verifying files: {str(e)}")
            return False
    
    def check_for_updates(self):
        """Проверка наличия обновлений"""
        try:
            logging.info("Checking for updates")
            
            headers = {'User-Agent': f'{APP_NAME}-Updater'}
            response = requests.get(self.github_api_url, headers=headers)
            if response.status_code != 200:
                raise Exception(f"Failed to get releases: HTTP {response.status_code}")
            
                release_info = response.json()
                latest_version = release_info['tag_name'].lstrip('v')
            
            logging.info(f"Latest version: {latest_version}")
            logging.info(f"Current version: {self.current_version}")
                
            current_parts = [int(x) for x in self.current_version.split('.')]
            latest_parts = [int(x) for x in latest_version.split('.')]
            
            while len(current_parts) < len(latest_parts):
                current_parts.append(0)
            while len(latest_parts) < len(current_parts):
                latest_parts.append(0)
            
            is_update_available = False
            for current, latest in zip(current_parts, latest_parts):
                if latest > current:
                    is_update_available = True
                    break
                elif current > latest:
                    break
            
            if is_update_available:
                logging.info(f"Update available: {latest_version}")
                self.update_available.emit(latest_version)
                
                if 'assets' not in release_info or not release_info['assets']:
                    logging.warning("No assets found in release")
                    if 'zipball_url' in release_info:
                        download_url = release_info['zipball_url']
                        return True, latest_version, download_url
                    else:
                        error_msg = f"Доступно обновление {latest_version}, но файлы недоступны"
                        self.update_error.emit(error_msg)
                        return False, latest_version, None
                
                    download_url = release_info['assets'][0]['browser_download_url']
                    return True, latest_version, download_url
            else:
                logging.info("No updates available")
                return False, None, None
                
        except Exception as e:
            error_msg = f"Ошибка при проверке обновлений: {str(e)}"
            logging.error(error_msg)
            self.update_error.emit(error_msg)
            return False, None, None
    
    def create_backup(self, app_dir, backup_dir):
        """Создание резервной копии"""
        try:
            backup_path = os.path.join(backup_dir, f"backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}")
            logging.info(f"Creating backup at: {backup_path}")
            
            if os.path.exists(app_dir):
                shutil.copytree(app_dir, backup_path, ignore=shutil.ignore_patterns(
                    'python', 'backups', '.temp_*', 'settings.json', '__pycache__', 'logs'
                ))
            return backup_path
        except Exception as e:
            logging.error(f"Error creating backup: {str(e)}")
            raise

    def download_and_apply_update(self, download_url):
        """Загрузка и применение обновления"""
        try:
            logging.info(f"Starting update download from {download_url}")
            
            temp_dir = get_temp_dir()
            backup_dir = get_backup_dir()
            update_dir = os.path.join(temp_dir, f"update_{datetime.now().strftime('%Y%m%d_%H%M%S')}")
            os.makedirs(update_dir, exist_ok=True)
            
            # Загрузка архива
            headers = {'User-Agent': f'{APP_NAME}-Updater'}
            response = requests.get(download_url, stream=True, headers=headers)
            if response.status_code != 200:
                raise Exception(f"Failed to download update: HTTP {response.status_code}")
                
            zip_path = os.path.join(update_dir, "update.zip")
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
            
            logging.info("Download completed")
            
            # Распаковка и подготовка файлов
            import zipfile
            extract_dir = os.path.join(update_dir, "extracted")
            os.makedirs(extract_dir, exist_ok=True)
            
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(extract_dir)
            
            # Создание бэкапа
            app_dir = get_app_root()
            backup_path = self.create_backup(app_dir, backup_dir)
            
            # Подготовка новых файлов
            staged_dir = os.path.join(update_dir, "staged")
            os.makedirs(staged_dir, exist_ok=True)
            
            source_dir = os.path.join(extract_dir, os.listdir(extract_dir)[0])
            if not os.path.isdir(source_dir):
                source_dir = extract_dir
            
            # Копирование новых файлов
            for item in os.listdir(source_dir):
                if item not in ['settings.json', 'python', 'backups', '.temp_*', '__pycache__', 'logs']:
                    s = os.path.join(source_dir, item)
                    d = os.path.join(staged_dir, item)
                    if os.path.isfile(s):
                        shutil.copy2(s, d)
                    elif os.path.isdir(s):
                        shutil.copytree(s, d)
            
            # Проверка хэшей файлов
            manifest_path = os.path.join(source_dir, 'update_manifest.json')
            if os.path.exists(manifest_path):
                if not self.verify_files(staged_dir, manifest_path):
                    raise Exception("File verification failed")
            
            # Создание информации об обновлении
            update_info = {
                'staged_dir': staged_dir,
                'backup_path': backup_path,
                'version': self.current_version,
                'timestamp': datetime.now().isoformat()
            }
            
            with open(os.path.join(update_dir, 'update_info.json'), 'w') as f:
                json.dump(update_info, f, indent=4)
            
            # Создание скрипта завершения обновления
            finish_update_bat = os.path.join(update_dir, 'finish_update.bat')
            with open(finish_update_bat, 'w', encoding='utf-8') as f:
                f.write('@echo off\n')
                f.write('chcp 65001>nul\n')
                f.write('echo Завершение обновления...\n')
                f.write(f'xcopy /y /s /e "{staged_dir}\\*" "{app_dir}\\"\n')
                f.write('if errorlevel 1 (\n')
                f.write('    echo Ошибка при обновлении!\n')
                f.write(f'    echo Восстанавливаем файлы из резервной копии: {backup_path}\n')
                f.write(f'    xcopy /y /s /e "{backup_path}\\*" "{app_dir}\\"\n')
                f.write('    pause\n')
                f.write('    exit /b 1\n')
                f.write(')\n')
                f.write(f'rmdir /s /q "{update_dir}"\n')
                f.write('echo Обновление успешно завершено\n')
                f.write(f'start "" "{app_dir}\\{LAUNCHER_FILENAME}"\n')
                f.write('exit\n')
            
            logging.info("Update prepared successfully")
            self.update_completed.emit()
            self.restart_required.emit()
            
            os.startfile(finish_update_bat)
            return True
            
        except Exception as e:
            error_msg = f"Ошибка при обновлении: {str(e)}"
            logging.error(error_msg)
            self.update_error.emit(error_msg)
            return False