import os
import json
import hashlib
import logging
from datetime import datetime

def get_app_root():
    """Определяет корневой путь приложения"""
    # Для сборки используем текущую директорию
    if os.path.exists('generate_manifest.py'):
        return os.path.abspath('.')
    
    # Для установленного приложения
    return os.path.dirname(os.path.abspath(__file__))

def setup_logging():
    """Настройка логирования"""
    app_root = get_app_root()
    log_dir = os.path.join(app_root, 'logs')
    os.makedirs(log_dir, exist_ok=True)
    
    log_file = os.path.join(log_dir, f'verify_{datetime.now().strftime("%Y%m%d")}.log')
    
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s [%(levelname)s] %(message)s',
        handlers=[
            logging.FileHandler(log_file, encoding='utf-8'),
            logging.StreamHandler()
        ]
    )

def calculate_file_hash(file_path):
    """Вычисление SHA-256 хэша файла"""
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()

def verify_installation():
    """Проверка целостности установленных файлов"""
    try:
        setup_logging()
        app_root = get_app_root()
        manifest_path = os.path.join(app_root, 'update_manifest.json')
        
        if not os.path.exists(manifest_path):
            logging.warning("Manifest file not found")
            return True
        
        logging.info(f"Starting file verification in {app_root}")
        
        with open(manifest_path, 'r', encoding='utf-8') as f:
            manifest = json.load(f)
        
        missing_files = []
        corrupted_files = []
        
        for file_info in manifest['files']:
            file_path = os.path.join(app_root, file_info['path'])
            if not os.path.exists(file_path):
                missing_files.append(file_info['path'])
                continue
            
            actual_hash = calculate_file_hash(file_path)
            if actual_hash != file_info['hash']:
                corrupted_files.append(file_info['path'])
        
        if missing_files or corrupted_files:
            if missing_files:
                logging.error("Missing files:")
                for f in missing_files:
                    logging.error(f"  - {f}")
            
            if corrupted_files:
                logging.error("Corrupted files:")
                for f in corrupted_files:
                    logging.error(f"  - {f}")
            
            return False
        
        logging.info("All files verified successfully")
        return True
        
    except Exception as e:
        logging.error(f"Error during verification: {str(e)}")
        return False

if __name__ == '__main__':
    success = verify_installation()
    if not success:
        exit(1) 