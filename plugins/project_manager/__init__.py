from PySide6 import QtCore
import substance_painter
import substance_painter.project
from substance_painter.event import DISPATCHER, ProjectCreated, ProjectOpened, ProjectEditionEntered
import os
import logging
import sys

# Настраиваем логирование
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger("ProjectManager")

def get_model_path():
    """Получает путь к модели из переменной окружения"""
    try:
        # Пытаемся получить путь из переменной окружения
        mesh_path = os.getenv('SP_MODEL_PATH')
        logger.info(f"Путь к модели из переменной окружения: {mesh_path}")
        
        if not mesh_path:
            # Пробуем получить из аргументов командной строки
            args = sys.argv
            logger.info(f"Аргументы командной строки: {args}")
            
            # Ищем путь к модели в аргументах
            for arg in args:
                if arg.endswith(('.fbx', '.obj', '.FBX', '.OBJ')):
                    mesh_path = arg
                    logger.info(f"Найден путь к модели в аргументах: {mesh_path}")
                    break
        
        if not mesh_path:
            logger.warning("Путь к модели не найден")
            return None
            
        # Проверяем существование файла
        if os.path.exists(mesh_path):
            logger.info(f"Файл модели найден: {mesh_path}")
            return mesh_path
        else:
            logger.error(f"Файл модели не существует: {mesh_path}")
            return None
        
    except Exception as e:
        logger.error(f"Ошибка при получении пути к модели: {str(e)}")
        return None

def create_project(mesh_file_path):
    """Создает новый проект"""
    try:
        logger.info(f"Создаем новый проект для модели: {mesh_file_path}")
        
        # Проверяем существование файла
        if not os.path.exists(mesh_file_path):
            logger.error(f"Файл модели не найден: {mesh_file_path}")
            return False
        
        # Настройки проекта
        settings = substance_painter.project.Settings(
            import_cameras=False,
            normal_map_format=substance_painter.project.NormalMapFormat.OpenGL
        )
        
        try:
            # Создаем проект
            substance_painter.project.create(
                mesh_file_path=mesh_file_path,
                settings=settings
            )
            logger.info("Проект успешно создан")
            return True
            
                except Exception as e:
            logger.error(f"Ошибка при создании проекта: {str(e)}")
                return False
        
    except Exception as e:
        logger.error(f"Ошибка в create_project: {str(e)}")
        return False

class ProjectManagerPlugin:
    """Плагин для интеграции с менеджером проектов"""
    
    def __init__(self):
        logger.info("Инициализация Project Manager Plugin")
        self.project_ready = False
        self.save_pending = False
        
        # Создаем таймер для периодической проверки состояния
        self.check_timer = QtCore.QTimer()
        self.check_timer.timeout.connect(self._check_project_state)
        self.check_timer.setInterval(2000)  # Проверка каждые 2 секунды
        
        # Подписываемся на события
        DISPATCHER.connect(ProjectCreated, self._on_project_created)
        DISPATCHER.connect(ProjectOpened, self._on_project_opened)
        DISPATCHER.connect(ProjectEditionEntered, self._on_project_edition_entered)
        
        logger.info("Плагин успешно инициализирован")
        
    def _check_project_state(self):
        """Проверяет состояние проекта и выполняет отложенные действия"""
        try:
            if not substance_painter.project.is_open():
                logger.info("Проект не открыт")
                return False
            
            if substance_painter.project.is_busy():
                logger.info("Проект занят")
                return False
                
            if not substance_painter.project.is_in_edition_state():
                logger.info("Проект не в режиме редактирования")
                return False
                
            logger.info("Проект готов к работе")
            self.project_ready = True
            
            if self.save_pending:
                self._save_project()
                
            return True
            
        except Exception as e:
            logger.error(f"Ошибка при проверке состояния: {str(e)}")
            return False
            
    def _get_save_path(self):
        """Определяет путь для сохранения проекта"""
        try:
            # Сначала проверяем текущий путь
            current_path = substance_painter.project.file_path()
            if current_path:
                logger.info(f"Используем текущий путь: {current_path}")
                return current_path
                
            # Получаем путь к последней импортированной модели
            mesh_path = substance_painter.project.last_imported_mesh_path()
            if not mesh_path:
                logger.error("Не удалось получить путь к модели")
                return None
                
            # Формируем путь для сохранения
            project_dir = os.path.dirname(os.path.dirname(os.path.dirname(mesh_path)))
            project_name = os.path.basename(project_dir)
            save_path = os.path.join(project_dir, f"{project_name}.spp")
            
            logger.info(f"Сформирован путь для сохранения: {save_path}")
            return save_path
            
    except Exception as e:
            logger.error(f"Ошибка при определении пути сохранения: {str(e)}")
            return None
            
    def _save_project(self):
        """Выполняет сохранение проекта"""
        try:
            if not self.project_ready:
                logger.info("Проект не готов к сохранению")
                self.save_pending = True
                return
                
            save_path = self._get_save_path()
            if not save_path:
                logger.error("Не удалось получить путь для сохранения")
                return
                
            logger.info(f"Попытка сохранения проекта в: {save_path}")
            
            try:
                # Сохраняем основной проект
                substance_painter.project.save_as(save_path)
                logger.info("Проект успешно сохранен")
                
                # Создаем резервную копию
                backup_path = save_path.replace('.spp', '_backup.spp')
                substance_painter.project.save_as_copy(backup_path)
                logger.info(f"Создана резервная копия: {backup_path}")
                
                self.save_pending = False
                
            except Exception as e:
                logger.error(f"Ошибка при сохранении: {str(e)}")
                
        except Exception as e:
            logger.error(f"Ошибка в процессе сохранения: {str(e)}")
            
    def _on_project_created(self, event):
        """Обработчик создания проекта"""
        logger.info("Событие: создан новый проект")
        self.project_ready = False
        self.save_pending = True
        self.check_timer.start()
        
    def _on_project_opened(self, event):
        """Обработчик открытия проекта"""
        logger.info("Событие: открыт проект")
        self.project_ready = False
        self.save_pending = True
        self.check_timer.start()
        
    def _on_project_edition_entered(self, event):
        """Обработчик входа в режим редактирования"""
        logger.info("Событие: проект готов к редактированию")
        self.project_ready = True
        if self.save_pending:
            self._save_project()

def start_plugin():
    """Функция запуска плагина"""
    logger.info("Запуск Project Manager Plugin")
    return ProjectManagerPlugin() 