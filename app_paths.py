import os
import sys

def get_app_root():
    """
    Определяет корневой путь приложения.
    Работает как для скомпилированного приложения, так и для запуска из исходников.
    """
    try:
        # Проверяем текущую рабочую директорию первой
        cwd = os.getcwd()
        print(f"[DEBUG] Checking current working directory: {cwd}")
        if validate_app_path_internal(cwd):
            return cwd
            
        # Если приложение запущено как exe
        if getattr(sys, 'frozen', False):
            app_path = os.path.dirname(os.path.abspath(sys.executable))
            print(f"[DEBUG] Checking frozen app path: {app_path}")
            if validate_app_path_internal(app_path):
                return app_path
        
        # Пробуем определить путь через Python
        python_path = os.path.abspath(sys.executable)
        print(f"[DEBUG] Checking Python path: {python_path}")
        if 'python\\python.exe' in python_path.lower():
            # Встроенный Python в нашем приложении
            app_path = os.path.dirname(os.path.dirname(python_path))
            print(f"[DEBUG] Checking app path from Python: {app_path}")
            if validate_app_path_internal(app_path):
                return app_path
        
        # Пробуем через текущий файл
        current_file = os.path.abspath(__file__)
        current_dir = os.path.dirname(current_file)
        print(f"[DEBUG] Checking current file directory: {current_dir}")
        
        # Проверяем текущую директорию
        if validate_app_path_internal(current_dir):
            return current_dir
        
        # Проверяем родительскую директорию
        parent_dir = os.path.dirname(current_dir)
        print(f"[DEBUG] Checking parent directory: {parent_dir}")
        if validate_app_path_internal(parent_dir):
            return parent_dir
        
        # Проверяем путь через sys.argv[0]
        if getattr(sys, 'argv', None) and sys.argv[0]:
            argv_dir = os.path.dirname(os.path.abspath(sys.argv[0]))
            print(f"[DEBUG] Checking argv directory: {argv_dir}")
            if validate_app_path_internal(argv_dir):
                return argv_dir
            
            argv_parent = os.path.dirname(argv_dir)
            print(f"[DEBUG] Checking argv parent directory: {argv_parent}")
            if validate_app_path_internal(argv_parent):
                return argv_parent
        
        # Если находимся в папке python, поднимаемся на уровень выше
        if os.path.basename(cwd).lower() == 'python':
            parent_cwd = os.path.dirname(cwd)
            print(f"[DEBUG] Checking parent of python directory: {parent_cwd}")
            if validate_app_path_internal(parent_cwd):
                return parent_cwd
        
        # Если путь передан через переменную окружения
        env_path = os.environ.get('BPROJECTMANAGER_PATH')
        if env_path:
            print(f"[DEBUG] Checking environment path: {env_path}")
            if validate_app_path_internal(env_path):
                return env_path
        
        raise ValueError("Не удалось определить корневую папку приложения")
    except Exception as e:
        print(f"[DEBUG] Error in get_app_root: {str(e)}")
        print(f"[DEBUG] sys.executable: {sys.executable}")
        print(f"[DEBUG] __file__: {__file__}")
        print(f"[DEBUG] sys.argv[0]: {sys.argv[0] if sys.argv else 'None'}")
        print(f"[DEBUG] cwd: {os.getcwd()}")
        raise

def validate_app_path_internal(path):
    """
    Внутренняя функция для проверки пути к приложению.
    Возвращает True если путь валидный, False если нет.
    Не выбрасывает исключения.
    """
    try:
        print(f"[DEBUG] Validating path: {path}")
        
        if not path or len(path) < 4:
            print(f"[DEBUG] Path too short: {path}")
            return False
        
        if path.lower() in ["c:", "c:\\", "c:/", "/", "c:\\windows", "c:/windows"]:
            print(f"[DEBUG] Unsafe path: {path}")
            return False
        
        required_files = ['main.py', 'launcher.bat', 'python']
        missing_files = []
        for f in required_files:
            full_path = os.path.join(path, f)
            if not os.path.exists(full_path):
                missing_files.append(f)
                print(f"[DEBUG] Required file not found: {full_path}")
        
        if missing_files:
            print(f"[DEBUG] Missing required files: {', '.join(missing_files)}")
            return False
        
        print(f"[DEBUG] Path validation successful: {path}")
        return True
    except Exception as e:
        print(f"[DEBUG] Error in validate_app_path_internal: {str(e)}")
        return False

def validate_app_path(path):
    """
    Проверяет, что указанный путь является корректной папкой приложения.
    Выбрасывает исключение с подробным описанием проблемы.
    """
    if not path or len(path) < 4:
        raise ValueError(f"Слишком короткий путь: {path}")
    
    if path.lower() in ["c:", "c:\\", "c:/", "/", "c:\\windows", "c:/windows"]:
        raise ValueError(f"Небезопасный путь: {path}")
    
    required_files = ['main.py', 'launcher.bat', 'python']
    missing_files = [f for f in required_files if not os.path.exists(os.path.join(path, f))]
    
    if missing_files:
        raise ValueError(
            f"Путь {path} не является папкой приложения.\n"
            f"Отсутствуют файлы: {', '.join(missing_files)}\n"
            f"Текущая директория: {os.getcwd()}\n"
            f"Python: {sys.executable}"
        )
    
    return True

def get_temp_dir():
    """
    Возвращает путь к временной директории приложения.
    """
    app_root = get_app_root()
    temp_dir = os.path.join(app_root, 'python', 'temp')
    os.makedirs(temp_dir, exist_ok=True)
    return temp_dir

def get_backup_dir():
    """
    Возвращает путь к директории для резервных копий.
    """
    app_root = get_app_root()
    backup_dir = os.path.join(app_root, 'backups')
    os.makedirs(backup_dir, exist_ok=True)
    return backup_dir

# При импорте модуля проверяем и выводим отладочную информацию
try:
    print(f"[DEBUG] app_paths.py loaded")
    print(f"[DEBUG] Current directory: {os.getcwd()}")
    print(f"[DEBUG] Python executable: {sys.executable}")
    print(f"[DEBUG] Module file: {__file__}")
    print(f"[DEBUG] sys.argv[0]: {sys.argv[0] if sys.argv else 'None'}")
    app_root = get_app_root()
    print(f"[DEBUG] Determined app root: {app_root}")
except Exception as e:
    print(f"[ERROR] Failed to determine app root: {str(e)}") 