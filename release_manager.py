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
import hashlib

class ReleaseManager:
    def __init__(self):
        self.repo = "BufBuf1421/BProjectManager"
        self.api_url = f"https://api.github.com/repos/{self.repo}/releases"
        self.token = os.getenv('GITHUB_TOKEN')
        self.max_retries = 3
        self.timeout = 30
        
        if not self.token:
            raise ValueError("GITHUB_TOKEN environment variable is not set")
        
        # Загружаем текущую версию
        self.current_version = VERSION
    
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
    
    def create_manifest(self, changed_files: List[str]) -> Dict:
        """Создает манифест обновления"""
        manifest = {
            "version": self.current_version,
            "release_date": datetime.now().strftime("%Y-%m-%d"),
            "files": []
        }
        
        for file_path in changed_files:
            if os.path.exists(file_path):
                with open(file_path, 'rb') as f:
                    content = f.read()
                    file_hash = hashlib.sha256(content).hexdigest()
                
                manifest["files"].append({
                    "path": file_path,
                    "hash": file_hash,
                    "size": len(content)
                })
        
        return manifest
    
    def create_release_archive(self, changed_files: List[str]) -> str:
        """Создание ZIP архива с измененными файлами"""
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
                
                # Создаем и добавляем манифест
                manifest = self.create_manifest(changed_files)
                manifest_name = f"update_manifest_{self.current_version}.json"
                with open(manifest_name, 'w', encoding='utf-8') as f:
                    json.dump(manifest, f, indent=2, ensure_ascii=False)
                zf.write(manifest_name)
            
            return zip_path
        except Exception as e:
            if os.path.exists(zip_path):
                os.remove(zip_path)
            raise ValueError(f"Ошибка при создании архива: {str(e)}")
    
    def create_github_release(self, version: str, zip_path: str, description: str) -> str:
        """Создает релиз на GitHub"""
        headers = {
            'Authorization': f'token {self.token}',
            'Accept': 'application/vnd.github.v3+json'
        }
        
        # Создаем релиз
        release_data = {
            'tag_name': f'v{version}',
            'name': f'Version {version}',
            'body': description,
            'draft': False,
            'prerelease': False
        }
        
        response = requests.post(self.api_url, headers=headers, json=release_data)
        if response.status_code != 201:
            raise ValueError(f"Failed to create release: {response.text}")
        
        release_info = response.json()
        upload_url = release_info['upload_url'].split('{')[0]
        
        # Загружаем архив
        with open(zip_path, 'rb') as f:
            files = {
                'file': (os.path.basename(zip_path), f, 'application/zip')
            }
            upload_response = requests.post(
                f"{upload_url}?name={os.path.basename(zip_path)}",
                headers={'Authorization': f'token {self.token}'},
                files=files
            )
            if upload_response.status_code != 201:
                raise ValueError(f"Failed to upload release asset: {upload_response.text}")
        
        return release_info['html_url']
    
    def create_release(self, changed_files: List[str], description: str) -> Tuple[str, str]:
        """Создает новый релиз"""
        try:
            # Увеличиваем версию
            new_version = self.increment_version()
            
            # Создаем архив
            zip_path = self.create_release_archive(changed_files)
            
            # Создаем релиз на GitHub
            release_url = self.create_github_release(new_version, zip_path, description)
            
            print(f"Релиз успешно создан: {release_url}")
            return new_version, release_url
            
        except Exception as e:
            raise ValueError(f"Ошибка при создании релиза: {str(e)}")

def main():
    import argparse
    parser = argparse.ArgumentParser(description='Создание релиза BProjectManager')
    parser.add_argument('--files', nargs='+', help='Список измененных файлов')
    parser.add_argument('--description', help='Описание релиза')
    args = parser.parse_args()
    
    if not args.files:
        print("Ошибка: не указаны измененные файлы")
        sys.exit(1)
    
    if not args.description:
        print("Ошибка: не указано описание релиза")
        sys.exit(1)
    
    try:
        manager = ReleaseManager()
        version, url = manager.create_release(args.files, args.description)
        print(f"Релиз версии {version} успешно создан")
        print(f"URL релиза: {url}")
    except Exception as e:
        print(f"Ошибка: {str(e)}")
        sys.exit(1)

if __name__ == '__main__':
    main() 