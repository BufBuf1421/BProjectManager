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
    
    # Список расширений текстовых файлов
    TEXT_FILE_EXTENSIONS = {'.py', '.txt', '.json', '.md', '.bat', '.html', '.css', '.js'}
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.current_version = VERSION
        self.github_api_url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
        setup_logging()
        logging.info(f"Updater initialized. Current version: {VERSION}")
    
    def is_text_file(self, file_path):
        """Проверяет, является ли файл текстовым на основе расширения"""
        return any(file_path.lower().endswith(ext) for ext in self.TEXT_FILE_EXTENSIONS)
    
    def normalize_text_content(self, content):
        """Нормализует содержимое текстового файла"""
        # Нормализация символов конца строки
        content = content.replace('\r\n', '\n').replace('\r', '\n')
        # Удаление пробелов в конце строк и пустых строк в конце файла
        lines = [line.rstrip() for line in content.split('\n')]
        while lines and not lines[-1]:
            lines.pop()
        return '\n'.join(lines)
    
    def get_file_content(self, file_path):
        """Получает содержимое файла с учетом его типа"""
        try:
            if self.is_text_file(file_path):
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                return self.normalize_text_content(content)
            else:
                with open(file_path, 'rb') as f:
                    return f.read()
        except UnicodeDecodeError:
            # Если не удалось прочитать как текст, читаем как бинарный
            with open(file_path, 'rb') as f:
                return f.read()
    
    def calculate_file_hash(self, file_path):
        """Вычисление SHA-256 хэша файла с учетом его типа"""
        content = self.get_file_content(file_path)
        if isinstance(content, str):
            content = content.encode('utf-8')
        return hashlib.sha256(content).hexdigest()
    
    def compare_files(self, file1_path, file2_path):
        """Сравнивает два файла и возвращает результат сравнения"""
        content1 = self.get_file_content(file1_path)
        content2 = self.get_file_content(file2_path)
        
        if content1 == content2:
            return True, "Files are identical"
        
        if isinstance(content1, str) and isinstance(content2, str):
            # Для текстовых файлов показываем различия
            import difflib
            diff = list(difflib.unified_diff(
                content1.splitlines(keepends=True),
                content2.splitlines(keepends=True),
                fromfile=file1_path,
                tofile=file2_path
            ))
            return False, ''.join(diff)
        else:
            # Для бинарных файлов просто отмечаем различие
            return False, "Binary files are different"

    def verify_files(self, staged_dir, manifest_path):
        """Проверка файлов после обновления (без проверки хэшей)"""
        try:
            logging.info(f"Checking files in {staged_dir} using manifest {manifest_path}")
            
            with open(manifest_path, 'r', encoding='utf-8') as f:
                manifest = json.load(f)
            
            logging.info(f"Manifest version: {manifest.get('version', 'unknown')}")
            logging.info(f"Total files to check: {len(manifest['files'])}")
            
            # Создаем список всех файлов в staged_dir
            staged_files = []
            for root, _, files in os.walk(staged_dir):
                for file in files:
                    full_path = os.path.join(root, file)
                    rel_path = os.path.relpath(full_path, staged_dir).replace('\\', '/')
                    staged_files.append(rel_path)
            
            logging.info(f"Files in staged directory: {staged_files}")
            
            # Проверяем наличие всех файлов
            for file_info in manifest['files']:
                file_path = os.path.join(staged_dir, file_info['path'])
                logging.info(f"Checking file: {file_info['path']}")
                
                # Пропускаем некоторые файлы при обновлении через zipball
                if file_info['path'] in ['update_manifest.json', 'launcher.bat']:
                    logging.info(f"Skipping check for {file_info['path']}")
                    continue
                
                if not os.path.exists(file_path):
                    logging.error(f"File not found: {file_path}")
                    logging.error(f"Source directory contents: {os.listdir(staged_dir)}")
                    return False
                
                # Только логируем различия для отладки, но не блокируем обновление
                current_file = os.path.join(get_app_root(), file_info['path'])
                if os.path.exists(current_file):
                    is_identical, diff = self.compare_files(current_file, file_path)
                    if not is_identical:
                        logging.info(f"File differences found in {file_info['path']}:")
                        logging.info(diff)
                
                logging.debug(f"File check passed: {file_info['path']}")
            
            logging.info("All files checked successfully")
            return True
            
        except Exception as e:
            logging.error(f"Error checking files: {str(e)}")
            logging.error(f"Stack trace:", exc_info=True)
            return False
    
    def check_for_updates(self):
        """Проверка наличия обновлений"""
        try:
            headers = {'User-Agent': f'{APP_NAME}-Updater'}
            response = requests.get(self.github_api_url, headers=headers)
            if response.status_code != 200:
                raise Exception(f"Failed to get releases: HTTP {response.status_code}")
            
            release_info = response.json()
            latest_version = release_info['tag_name'].lstrip('v')
            
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
                if 'assets' not in release_info or not release_info['assets']:
                    if 'zipball_url' in release_info:
                        download_url = release_info['zipball_url']
                        return True, latest_version, download_url
                    else:
                        error_msg = f"Доступно обновление {latest_version}, но файлы недоступны"
                        self.update_error.emit(error_msg)
                        return False, latest_version, None
                else:
                    download_url = release_info['assets'][0]['browser_download_url']
                    return True, latest_version, download_url
            else:
                return False, None, None
                
        except Exception as e:
            error_msg = f"Ошибка при проверке обновлений: {str(e)}"
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
            error_msg = f"Error creating backup: {str(e)}"
            logging.error(error_msg)
            raise

    def apply_update(self, staged_dir, app_dir, backup_path):
        """Применяет обновление напрямую через Python"""
        try:
            logging.info("Applying update...")
            logging.info(f"Source: {staged_dir}")
            logging.info(f"Destination: {app_dir}")
            
            # Принудительно завершаем процессы Python
            import psutil
            current_pid = os.getpid()
            for proc in psutil.process_iter(['pid', 'name']):
                try:
                    if proc.info['name'].lower() in ['python.exe', 'pythonw.exe']:
                        if proc.pid != current_pid:  # Не завершаем текущий процесс
                            proc.kill()
                            logging.info(f"Terminated process: {proc.info['name']} (PID: {proc.pid})")
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
            
            # Ждем завершения процессов
            import time
            time.sleep(2)
            
            # Копируем файлы
            success = True
            error_files = []
            
            for root, dirs, files in os.walk(staged_dir):
                rel_path = os.path.relpath(root, staged_dir)
                dest_dir = os.path.join(app_dir, rel_path) if rel_path != '.' else app_dir
                
                # Создаем директории
                os.makedirs(dest_dir, exist_ok=True)
                
                # Копируем файлы
                for file in files:
                    src_file = os.path.join(root, file)
                    dest_file = os.path.join(dest_dir, file)
                    try:
                        # Пытаемся удалить целевой файл, если он существует
                        if os.path.exists(dest_file):
                            try:
                                os.remove(dest_file)
                            except:
                                os.chmod(dest_file, 0o777)  # Даем полные права
                                os.remove(dest_file)
                        
                        # Копируем файл
                        shutil.copy2(src_file, dest_file)
                        logging.info(f"Copied: {os.path.relpath(dest_file, app_dir)}")
                    except Exception as e:
                        error_msg = f"Failed to copy {file}: {str(e)}"
                        logging.error(error_msg)
                        error_files.append((file, str(e)))
                        success = False
            
            if not success:
                # Восстанавливаем из бэкапа при ошибке
                logging.error("Errors occurred during update, restoring from backup...")
                logging.error("Failed files:")
                for file, error in error_files:
                    logging.error(f"  {file}: {error}")
                
                # Восстанавливаем файлы
                for root, dirs, files in os.walk(backup_path):
                    rel_path = os.path.relpath(root, backup_path)
                    dest_dir = os.path.join(app_dir, rel_path) if rel_path != '.' else app_dir
                    
                    os.makedirs(dest_dir, exist_ok=True)
                    for file in files:
                        src_file = os.path.join(root, file)
                        dest_file = os.path.join(dest_dir, file)
                        try:
                            if os.path.exists(dest_file):
                                os.remove(dest_file)
                            shutil.copy2(src_file, dest_file)
                            logging.info(f"Restored: {os.path.relpath(dest_file, app_dir)}")
                        except Exception as e:
                            logging.error(f"Failed to restore {file}: {str(e)}")
                
                raise Exception("Update failed, backup restored")
            
            logging.info("Update applied successfully")
            return True
            
        except Exception as e:
            logging.error(f"Error applying update: {str(e)}")
            raise
    
    def download_update(self, download_url, save_path):
        """Загрузка обновления"""
        try:
            headers = {'User-Agent': f'{APP_NAME}-Updater'}
            response = requests.get(download_url, stream=True, headers=headers)
            if response.status_code != 200:
                raise Exception(f"Failed to download update: HTTP {response.status_code}")
                
            total_size = int(response.headers.get('content-length', 0))
            block_size = 8192
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
            self.update_error.emit(str(e))
            return False
    
    def download_and_apply_update(self, download_url):
        """Загрузка и применение обновления"""
        try:
            logging.info(f"Starting update download from {download_url}")
            
            temp_dir = get_temp_dir()
            backup_dir = get_backup_dir()
            app_dir = get_app_root()
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
            backup_path = self.create_backup(app_dir, backup_dir)
            
            # Подготовка новых файлов
            staged_dir = os.path.join(update_dir, "staged")
            os.makedirs(staged_dir, exist_ok=True)
            
            # Находим правильную директорию с файлами
            source_dir = extract_dir
            contents = os.listdir(extract_dir)
            logging.info(f"Extracted contents: {contents}")
            
            if contents:
                potential_dir = os.path.join(extract_dir, contents[0])
                if os.path.isdir(potential_dir) and 'BProjectManager' in contents[0]:
                    source_dir = potential_dir
                    logging.info(f"Using source directory: {source_dir}")
            
            # Копирование новых файлов
            logging.info(f"Copying files from {source_dir} to {staged_dir}")
            for item in os.listdir(source_dir):
                if item not in ['settings.json', 'python', 'backups', '.temp_*', '__pycache__', 'logs']:
                    s = os.path.join(source_dir, item)
                    d = os.path.join(staged_dir, item)
                    if os.path.isfile(s):
                        shutil.copy2(s, d)
                        logging.info(f"Copied file: {item}")
                    elif os.path.isdir(s):
                        shutil.copytree(s, d)
                        logging.info(f"Copied directory: {item}")
            
            # Проверка файлов
            manifest_path = os.path.join(source_dir, 'update_manifest.json')
            logging.info(f"Looking for manifest at: {manifest_path}")
            
            if os.path.exists(manifest_path):
                logging.info("Found manifest file, verifying files...")
                if not self.verify_files(staged_dir, manifest_path):
                    raise Exception("File verification failed")
            else:
                logging.error(f"Manifest file not found at {manifest_path}")
                logging.error(f"Source directory contents: {os.listdir(source_dir)}")
                raise Exception("Manifest file not found")
            
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
                f.write('timeout /t 2 /nobreak\n')  # Ждем 2 секунды
                f.write('taskkill /F /IM python.exe /T\n')  # Принудительно завершаем все процессы Python
                f.write('taskkill /F /IM pythonw.exe /T\n')
                f.write('timeout /t 3 /nobreak\n')  # Ждем еще 3 секунды после завершения процессов
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
            
            # Показываем сообщение пользователю
            msg = QMessageBox()
            msg.setIcon(QMessageBox.Icon.Information)
            msg.setText("Обновление готово к установке")
            msg.setInformativeText("Приложение будет закрыто для завершения обновления. Нажмите OK для продолжения.")
            msg.setWindowTitle("Обновление")
            msg.exec()
            
            os.startfile(finish_update_bat)
            return True
            
        except Exception as e:
            error_msg = f"Error applying update: {str(e)}"
            logging.error(error_msg)
            self.update_error.emit(error_msg)
            return False