import os
import sys
import traceback

def check_dependencies():
    """Проверяет наличие всех необходимых зависимостей."""
    try:
        import PyQt6
        from PyQt6 import QtWidgets
        import PIL
        import send2trash
        import svglib
        import requests
        print("Все зависимости успешно импортированы")
        return True
    except ImportError as e:
        print(f"Ошибка импорта зависимостей: {e}")
        return False

def setup_python_env():
    """Настраивает окружение Python для работы с локальной установкой."""
    try:
        print("Начало настройки окружения Python...")
        
        # Получаем путь к директории приложения
        app_dir = os.path.dirname(os.path.abspath(__file__))
        print(f"Директория приложения: {app_dir}")
        
        # Путь к локальному Python
        python_dir = os.path.join(app_dir, 'python')
        site_packages = os.path.join(python_dir, 'Lib', 'site-packages')
        print(f"Путь к Python: {python_dir}")
        print(f"Путь к site-packages: {site_packages}")
        
        # Проверяем существование директорий
        if not os.path.exists(python_dir):
            print(f"Ошибка: Директория Python не найдена: {python_dir}")
            return False
            
        if not os.path.exists(site_packages):
            print(f"Ошибка: Директория site-packages не найдена: {site_packages}")
            return False
            
        print("Все необходимые директории найдены")
        
        # Настраиваем переменные окружения
        os.environ['PYTHONHOME'] = python_dir
        os.environ['PYTHONPATH'] = os.pathsep.join([site_packages, app_dir])
        print(f"PYTHONHOME установлен как: {os.environ.get('PYTHONHOME')}")
        print(f"PYTHONPATH установлен как: {os.environ.get('PYTHONPATH')}")
        
        # Добавляем пути в sys.path
        if app_dir not in sys.path:
            sys.path.insert(0, app_dir)
            print(f"Добавлен путь в sys.path: {app_dir}")
            
        if site_packages not in sys.path:
            sys.path.insert(0, site_packages)
            print(f"Добавлен путь в sys.path: {site_packages}")
        
        if python_dir not in sys.path:
            sys.path.insert(0, python_dir)
            print(f"Добавлен путь в sys.path: {python_dir}")
        
        # Добавляем python в PATH
        os.environ['PATH'] = python_dir + os.pathsep + os.environ.get('PATH', '')
        print("PATH обновлен")
        
        print("Текущий sys.path:")
        for path in sys.path:
            print(f"  {path}")
            
        # Проверяем зависимости
        if not check_dependencies():
            print("Ошибка: Не все зависимости доступны")
            return False
            
        print("Настройка окружения Python завершена успешно")
        return True
        
    except Exception as e:
        print(f"Ошибка при настройке окружения Python: {e}")
        print("Полный стек ошибки:")
        traceback.print_exc()
        return False 