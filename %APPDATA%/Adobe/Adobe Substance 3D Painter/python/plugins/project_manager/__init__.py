import substance_painter
import os
import json
import tempfile
from datetime import datetime
from pathlib import Path
import urllib.parse
import sys
import locale

PLUGIN_NAME = "Project Manager Integration"
PLUGIN_ID = "project.manager.integration"
PLUGIN_VERSION = "1.0.0"
PLUGIN_AUTHOR = "Your Name"

# Глобальные переменные для хранения состояния плагина
_temp_dir = None
_params_file = None

def normalize_path(path):
    """Нормализует путь для использования в Substance Painter."""
    try:
        print(f"[{PLUGIN_NAME}] Нормализация пути: {path}")
        print(f"[{PLUGIN_NAME}] Кодировка системы: {sys.getfilesystemencoding()}")
        print(f"[{PLUGIN_NAME}] Локаль системы: {locale.getpreferredencoding()}")
        
        # Преобразуем путь в объект Path
        path_obj = Path(path)
        
        try:
            # Пробуем импортировать win32api только если он нужен
            if sys.platform == 'win32':
                import win32api
                short_path = win32api.GetShortPathName(str(path_obj.absolute()))
                print(f"[{PLUGIN_NAME}] Короткий путь Windows: {short_path}")
                return short_path.replace("\\", "/")
        except ImportError:
            print(f"[{PLUGIN_NAME}] win32api не установлен, используем стандартный метод")
        except Exception as e:
            print(f"[{PLUGIN_NAME}] Ошибка при получении короткого пути: {str(e)}")
        
        # Если не Windows или не удалось получить короткий путь
        normalized = str(path_obj.absolute()).replace("\\", "/")
        
        # Дополнительная обработка для кириллицы
        try:
            # Пробуем закодировать и раскодировать путь для проверки
            normalized.encode('ascii')
        except UnicodeEncodeError:
            # Если путь содержит не-ASCII символы, используем короткие имена Windows
            if sys.platform == 'win32':
                try:
                    import win32api
                    import win32con
                    normalized = win32api.GetShortPathName(normalized)
                except ImportError:
                    # Если win32api недоступен, используем URL-кодирование для не-ASCII символов
                    parts = normalized.split('/')
                    normalized = '/'.join(urllib.parse.quote(part) if any(ord(c) > 127 for c in part) else part
                                        for part in parts)
        
        print(f"[{PLUGIN_NAME}] Нормализованный путь: {normalized}")
        return normalized
        
    except Exception as e:
        print(f"[{PLUGIN_NAME}] Ошибка при нормализации пути: {str(e)}")
        return path

def get_temp_dir():
    """Получает путь к временной директории."""
    try:
        # Используем директорию в папке с плагином
        plugin_dir = os.path.dirname(os.path.abspath(__file__))
        temp_dir = os.path.join(plugin_dir, "temp")
        os.makedirs(temp_dir, exist_ok=True)
        return normalize_path(temp_dir)
    except Exception as e:
        print(f"[{PLUGIN_NAME}] Ошибка при создании временной директории: {str(e)}")
        return None

def start_plugin():
    """Инициализация плагина при запуске."""
    try:
        print(f"[{PLUGIN_NAME}] Начало инициализации плагина...")
        
        # Получаем путь к временной директории
        global _temp_dir, _params_file
        _temp_dir = get_temp_dir()
        if not _temp_dir:
            print(f"[{PLUGIN_NAME}] Не удалось создать временную директорию")
            return False
        
        _params_file = normalize_path(os.path.join(_temp_dir, "project_params.json"))
        print(f"[{PLUGIN_NAME}] Путь к файлу параметров: {_params_file}")
        
        if os.path.exists(_params_file):
            print(f"[{PLUGIN_NAME}] Найден файл параметров")
            try:
                # Читаем параметры
                with open(_params_file, 'r') as f:
                    params = json.load(f)
                print(f"[{PLUGIN_NAME}] Параметры загружены: {params}")
                
                # Нормализуем пути в параметрах
                if "spp_file" in params:
                    params["spp_file"] = normalize_path(params["spp_file"])
                if "textures_path" in params:
                    params["textures_path"] = normalize_path(params["textures_path"])
                if "project_path" in params:
                    params["project_path"] = normalize_path(params["project_path"])
                
                # Проверяем тип операции
                if "spp_file" in params:
                    print(f"[{PLUGIN_NAME}] Открываем существующий проект: {params['spp_file']}")
                    result = open_project(_params_file)
                    if not result:
                        print(f"[{PLUGIN_NAME}] Не удалось открыть проект")
                        return False
                elif "project_path" in params:
                    print(f"[{PLUGIN_NAME}] Создаем новый проект: {params['project_path']}")
                    result = create_new_project(_params_file)
                    if not result:
                        print(f"[{PLUGIN_NAME}] Не удалось создать проект")
                        return False
                
                # Удаляем временный файл после использования
                try:
                    os.remove(_params_file)
                    print(f"[{PLUGIN_NAME}] Временный файл удален")
                except Exception as e:
                    print(f"[{PLUGIN_NAME}] Ошибка при удалении временного файла: {str(e)}")
            except Exception as e:
                print(f"[{PLUGIN_NAME}] Ошибка при обработке файла параметров: {str(e)}")
                return False
        else:
            print(f"[{PLUGIN_NAME}] Файл параметров не найден")
        
        print(f"[{PLUGIN_NAME}] Плагин успешно запущен")
        return True
    except Exception as e:
        print(f"[{PLUGIN_NAME}] Ошибка при запуске плагина: {str(e)}")
        return False

def stop_plugin():
    """Очистка при остановке плагина."""
    try:
        global _temp_dir, _params_file
        if _params_file and os.path.exists(_params_file):
            os.remove(_params_file)
            print(f"[{PLUGIN_NAME}] Временный файл удален при остановке")
        if _temp_dir and os.path.exists(_temp_dir):
            try:
                os.rmdir(_temp_dir)
                print(f"[{PLUGIN_NAME}] Временная директория удалена")
            except:
                pass
        print(f"[{PLUGIN_NAME}] Плагин успешно остановлен")
        return True
    except Exception as e:
        print(f"[{PLUGIN_NAME}] Ошибка при остановке плагина: {str(e)}")
        return False

def export_path_from_json(json_path):
    """Читает путь экспорта из JSON файла."""
    try:
        with open(json_path, 'r') as f:
            data = json.load(f)
            return data.get('export_path')
    except Exception as e:
        print(f"[{PLUGIN_NAME}] Ошибка при чтении пути экспорта: {str(e)}")
        return None

def create_new_project(json_path):
    """Создает новый проект на основе данных из JSON."""
    try:
        print(f"[{PLUGIN_NAME}] Начало создания проекта...")
        
        # Читаем параметры проекта
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        project_path = data.get('project_path', '')
        project_name = data.get('project_name')
        mesh_file = data.get('mesh_file', '')
        resolution = data.get('resolution', 2048)
        
        if not all([project_path, project_name]):
            print(f"[{PLUGIN_NAME}] Ошибка: не указаны обязательные параметры")
            return False
        
        # Нормализуем пути
        project_path = normalize_path(project_path)
        spp_file = normalize_path(os.path.join(project_path, f"{project_name}.spp"))
        
        print(f"[{PLUGIN_NAME}] Параметры проекта:")
        print(f"[{PLUGIN_NAME}] - Путь проекта: {project_path}")
        print(f"[{PLUGIN_NAME}] - Имя проекта: {project_name}")
        print(f"[{PLUGIN_NAME}] - SPP файл: {spp_file}")
        print(f"[{PLUGIN_NAME}] - Разрешение: {resolution}")
        
        # Проверяем, нет ли уже открытого проекта
        if substance_painter.project.is_open():
            print(f"[{PLUGIN_NAME}] Закрываем текущий проект...")
            substance_painter.project.close()
        
        # Создаем проект
        print(f"[{PLUGIN_NAME}] Создание проекта...")
        try:
            # Проверяем доступные параметры проекта
            print(f"[{PLUGIN_NAME}] Доступные параметры substance_painter.project:")
            for attr in dir(substance_painter.project):
                if not attr.startswith('_'):
                    print(f"[{PLUGIN_NAME}] - {attr}")
            
            # Создаем проект с базовыми параметрами
            print(f"[{PLUGIN_NAME}] Создание проекта с базовыми параметрами...")
            if mesh_file and os.path.exists(mesh_file):
                # Если есть файл модели, создаем проект с моделью
                mesh_file = normalize_path(mesh_file)
                substance_painter.project.create(
                    mesh_file,
                    resolution=(resolution, resolution),
                    normal_map_format=substance_painter.project.NormalMapFormat.OpenGL
                )
            else:
                # Иначе создаем пустой проект
                substance_painter.project.create_empty(
                    resolution=(resolution, resolution)
                )
            print(f"[{PLUGIN_NAME}] Проект создан успешно")
            
            # Проверяем, что проект действительно создан
            if not substance_painter.project.is_open():
                print(f"[{PLUGIN_NAME}] Ошибка: проект не был создан")
                return False
            
            # Проверяем состояние проекта
            print(f"[{PLUGIN_NAME}] Проверка состояния проекта:")
            print(f"[{PLUGIN_NAME}] - Открыт: {substance_painter.project.is_open()}")
            print(f"[{PLUGIN_NAME}] - Путь: {substance_painter.project.file_path()}")
            
            # Сохраняем проект
            print(f"[{PLUGIN_NAME}] Сохранение проекта в {spp_file}")
            substance_painter.project.save_as(spp_file)
            
            # Проверяем, что файл создан
            if not os.path.exists(spp_file):
                print(f"[{PLUGIN_NAME}] Ошибка: файл проекта не был создан")
                return False
            
            print(f"[{PLUGIN_NAME}] Проект успешно создан и сохранен")
            return True
            
        except Exception as e:
            print(f"[{PLUGIN_NAME}] Ошибка при создании проекта: {str(e)}")
            print(f"[{PLUGIN_NAME}] Тип ошибки: {type(e)}")
            import traceback
            print(f"[{PLUGIN_NAME}] Стек вызовов:\n{traceback.format_exc()}")
            return False
            
    except Exception as e:
        print(f"[{PLUGIN_NAME}] Общая ошибка: {str(e)}")
        print(f"[{PLUGIN_NAME}] Тип ошибки: {type(e)}")
        import traceback
        print(f"[{PLUGIN_NAME}] Стек вызовов:\n{traceback.format_exc()}")
        return False

def open_project(json_path):
    """Открывает существующий проект на основе данных из JSON."""
    try:
        print(f"[{PLUGIN_NAME}] Начало открытия проекта из {json_path}")
        
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        spp_file = normalize_path(data.get('spp_file', ''))
        
        if not spp_file:
            print(f"[{PLUGIN_NAME}] Ошибка: не указан путь к .spp файлу")
            return False
        
        print(f"[{PLUGIN_NAME}] Попытка открыть файл: {spp_file}")
        
        # Проверяем существование файла
        if not os.path.exists(spp_file):
            print(f"[{PLUGIN_NAME}] Ошибка: файл не существует: {spp_file}")
            return False
        
        # Закрываем текущий проект, если открыт
        if substance_painter.project.is_open():
            print(f"[{PLUGIN_NAME}] Закрываем текущий проект...")
            substance_painter.project.close()
        
        # Открываем проект
        print(f"[{PLUGIN_NAME}] Открываем проект...")
        substance_painter.project.open(spp_file)
        
        # Проверяем, что проект открылся
        if not substance_painter.project.is_open():
            print(f"[{PLUGIN_NAME}] Ошибка: проект не был открыт")
            return False
        
        print(f"[{PLUGIN_NAME}] Проект успешно открыт")
        return True
        
    except Exception as e:
        print(f"[{PLUGIN_NAME}] Ошибка при открытии проекта: {str(e)}")
        return False 