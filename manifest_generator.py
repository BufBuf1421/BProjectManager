import os
import json
import hashlib
from datetime import datetime
from typing import List, Dict

class ManifestGenerator:
    def __init__(self, version: str, base_url: str, project_dir: str = None):
        self.version = version
        self.base_url = base_url.rstrip('/')
        # Используем указанную директорию проекта или текущую директорию
        self.root_dir = project_dir if project_dir else os.path.dirname(os.path.abspath(__file__))
        # Создаем директории для временных файлов внутри проекта
        self.temp_dir = os.path.join(self.root_dir, "temp_update")
        self.output_dir = os.path.join(self.root_dir, "updates")
        
        # Создаем директорию для выходных файлов, если её нет
        os.makedirs(self.output_dir, exist_ok=True)
        
    def _calculate_file_hash(self, file_path: str) -> str:
        """Вычисляет SHA256 хеш файла"""
        sha256_hash = hashlib.sha256()
        with open(file_path, "rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()
    
    def _get_files_info(self, include_patterns: List[str], exclude_patterns: List[str]) -> List[Dict]:
        """Собирает информацию о файлах для обновления"""
        files_info = []
        
        def should_include(path: str) -> bool:
            """Проверяет, должен ли файл быть включен в манифест"""
            # Исключаем файлы по паттернам
            for pattern in exclude_patterns:
                if pattern in path:
                    return False
                    
            # Проверяем соответствие паттернам включения
            for pattern in include_patterns:
                if pattern in path:
                    return True
            return False
        
        for root, _, files in os.walk(self.root_dir):
            for file in files:
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, self.root_dir)
                
                # Пропускаем файлы, которые не соответствуют паттернам
                if not should_include(rel_path):
                    continue
                
                # Нормализуем путь для разных ОС
                normalized_path = rel_path.replace("\\", "/")
                    
                # Получаем информацию о файле
                file_info = {
                    "path": normalized_path,
                    "hash": self._calculate_file_hash(full_path),
                    "size": os.path.getsize(full_path),
                    "url": "{}/v{}/{}".format(self.base_url, self.version, normalized_path)
                }
                files_info.append(file_info)
        
        return files_info
    
    def generate_manifest(self, 
                         required_version: str,
                         description: str,
                         include_patterns: List[str] = [".py", ".json", ".bat"],
                         exclude_patterns: List[str] = ["__pycache__", ".git", "temp", "backup", "updates"]) -> Dict:
        """Генерирует манифест обновления"""
        manifest = {
            "version": self.version,
            "release_date": datetime.now().strftime("%Y-%m-%d"),
            "files": self._get_files_info(include_patterns, exclude_patterns),
            "required_version": required_version,
            "description": description
        }
        return manifest
    
    def save_manifest(self, manifest: Dict, output_filename: str = "update_manifest.json"):
        """Сохраняет манифест в файл"""
        output_path = os.path.join(self.output_dir, output_filename)
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(manifest, f, indent=4, ensure_ascii=False)
        return output_path
            
def main():
    # Путь к директории проекта
    project_dir = r"C:\ProjectManager5\BProjectManager"
    
    # Пример использования
    generator = ManifestGenerator(
        version="1.0.0",
        base_url="https://github.com/BufBuf1421/BProjectManager/releases/download",
        project_dir=project_dir
    )
    
    manifest = generator.generate_manifest(
        required_version="0.9.0",
        description="Обновление включает исправления багов и улучшения производительности",
        include_patterns=[".py", ".json", ".bat"],  # Файлы для включения
        exclude_patterns=[
            "__pycache__", 
            ".git", 
            "temp", 
            "backup", 
            "test",
            "updates",
            "manifest_generator.py"  # Исключаем сам генератор из манифеста
        ]
    )
    
    output_path = generator.save_manifest(manifest)
    print("Манифест обновления создан: {}".format(output_path))

if __name__ == "__main__":
    main() 