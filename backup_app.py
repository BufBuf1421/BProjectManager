import os
import shutil
import zipfile
from datetime import datetime

def create_readme():
    """Создает файл README.md с описанием проекта"""
    readme_content = """# Менеджер проектов

Приложение для управления проектами на PyQt6.

## Основные возможности

- Управление проектами через карточки
- Группировка проектов
- Система тегов и поиска
- Экспорт/импорт проектов
- Избранные проекты
- Адаптивный интерфейс

## Зависимости

- Python 3.8+
- PyQt6
- См. requirements.txt для полного списка

## Файлы проекта

- main.py - главное окно приложения
- project_card.py - виджет карточки проекта
- project_group.py - виджет группы проектов
- project_window.py - окно проекта
- styles.py - стили интерфейса
- settings_dialog.py - диалог настроек
- create_project_dialog.py - диалог создания проекта
- search_panel.py - панель поиска
- icons/ - иконки и ресурсы

## Установка

1. Установите Python 3.8 или выше
2. Установите зависимости: pip install -r requirements.txt
3. Запустите приложение: python main.py
"""
    return readme_content

def create_backup():
    """Создает резервную копию приложения"""
    print("Начало выполнения функции create_backup")
    try:
        # Создаем имя архива с текущей датой и временем
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        archive_name = f"ProjectManager5_backup_{timestamp}.zip"
        print(f"Создаем архив с именем: {archive_name}")
        
        # Список файлов и папок для включения в архив
        include_files = [
            'main.py',
            'project_card.py',
            'project_group.py',
            'project_window.py',
            'styles.py',
            'settings_dialog.py',
            'create_project_dialog.py',
            'search_panel.py',
            'requirements.txt',
            'settings.json',
            'icons'
        ]
        
        # Список расширений файлов для исключения
        exclude_extensions = ['.pyc', '.pyo', '.pyd', '.db']
        
        # Создаем временную папку для сбора файлов
        temp_dir = 'backup_temp'
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)
        os.makedirs(temp_dir)
        
        print("Создание резервной копии приложения...")
        print(f"Архив будет сохранен как: {archive_name}")
        
        # Копируем файлы во временную папку
        for item in include_files:
            src = item
            dst = os.path.join(temp_dir, item)
            
            if os.path.isfile(src):
                # Проверяем расширение файла
                if not any(src.endswith(ext) for ext in exclude_extensions):
                    print(f"Копирование файла: {item}")
                    shutil.copy2(src, dst)
            elif os.path.isdir(src):
                print(f"Копирование папки: {item}")
                shutil.copytree(src, dst, ignore=shutil.ignore_patterns(
                    '*__pycache__*',
                    '*.pyc',
                    '*.pyo',
                    '*.pyd',
                    '*.db'
                ))
        
        # Создаем README.md
        readme_path = os.path.join(temp_dir, 'README.md')
        with open(readme_path, 'w', encoding='utf-8') as f:
            f.write(create_readme())
        print("Создан файл README.md")
        
        # Создаем архив
        with zipfile.ZipFile(archive_name, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for root, dirs, files in os.walk(temp_dir):
                for file in files:
                    file_path = os.path.join(root, file)
                    arcname = os.path.relpath(file_path, temp_dir)
                    print(f"Добавление в архив: {arcname}")
                    zipf.write(file_path, arcname)
        
        # Удаляем временную папку
        shutil.rmtree(temp_dir)
        
        print("\nРезервная копия успешно создана!")
        print(f"Путь к архиву: {os.path.abspath(archive_name)}")
        
    except Exception as e:
        print(f"Ошибка при создании резервной копии: {e}")
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)

if __name__ == '__main__':
    create_backup() 