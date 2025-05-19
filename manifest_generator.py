import os
import json
import hashlib
from datetime import datetime
from typing import List, Dict
from version import VERSION

class ManifestGenerator:
    def __init__(self, base_url: str, project_dir: str = None):
        self.version = VERSION  # Берем версию из version.py
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
    
    def _get_required_version(self) -> str:
        """
        Определяет минимальную требуемую версию для обновления.
        По умолчанию это текущая версия минус 0.0.1
        """
        try:
            current_parts = [int(x) for x in self.version.split('.')]
            if current_parts[-1] > 0:
                current_parts[-1] -= 1
            elif len(current_parts) > 1 and current_parts[-2] > 0:
                current_parts[-2] -= 1
                current_parts[-1] = 99
            elif len(current_parts) > 2 and current_parts[-3] > 0:
                current_parts[-3] -= 1
                current_parts[-2] = 99
                current_parts[-1] = 99
            else:
                return "0.0.0"
            return ".".join(str(x) for x in current_parts)
        except:
            return "0.0.0"
    
    def generate_manifest(self, 
                         description: str,
                         include_patterns: List[str] = [".py", ".json", ".bat"],
                         exclude_patterns: List[str] = ["__pycache__", ".git", "temp", "backup", "updates"]) -> Dict:
        """Генерирует манифест обновления"""
        manifest = {
            "version": self.version,
            "release_date": datetime.now().strftime("%Y-%m-%d"),
            "files": self._get_files_info(include_patterns, exclude_patterns),
            "required_version": self._get_required_version(),
            "description": description
        }
        return manifest
    
    def save_manifest(self, manifest: Dict, output_filename: str = None):
        """Сохраняет манифест в файл"""
        if output_filename is None:
            output_filename = f"update_manifest_{self.version}.json"
            
        output_path = os.path.join(self.output_dir, output_filename)
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(manifest, f, indent=4, ensure_ascii=False)
        return output_path
            
def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='Генератор манифеста обновлений')
    parser.add_argument('--base-url', 
                       default="https://github.com/BufBuf1421/BProjectManager/releases/download",
                       help='Базовый URL для загрузки файлов')
    parser.add_argument('--project-dir',
                       default=os.path.dirname(os.path.abspath(__file__)),
                       help='Путь к директории проекта')
    parser.add_argument('--description',
                       default="Обновление включает исправления багов и улучшения производительности",
                       help='Описание обновления')
    parser.add_argument('--include',
                       default=[".py", ".json", ".bat"],
                       nargs='+',
                       help='Паттерны для включения файлов')
    parser.add_argument('--exclude',
                       default=["__pycache__", ".git", "temp", "backup", "test", "updates", "manifest_generator.py"],
                       nargs='+',
                       help='Паттерны для исключения файлов')
    
    args = parser.parse_args()
    
    print(f"Текущая версия приложения: {VERSION}")
    print(f"Генерация манифеста обновления...")
    
    generator = ManifestGenerator(
        base_url=args.base_url,
        project_dir=args.project_dir
    )
    
    manifest = generator.generate_manifest(
        description=args.description,
        include_patterns=args.include,
        exclude_patterns=args.exclude
    )
    
    output_path = generator.save_manifest(manifest)
    print(f"\nМанифест обновления создан: {output_path}")
    print(f"Версия: {manifest['version']}")
    print(f"Минимальная требуемая версия: {manifest['required_version']}")
    print(f"Количество файлов: {len(manifest['files'])}")
    print("\nФайлы для обновления:")
    for file in manifest['files']:
        print(f"  - {file['path']} ({file['size']} байт)")

if __name__ == "__main__":
    main() 