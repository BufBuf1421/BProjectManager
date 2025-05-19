from PyQt6.QtWidgets import (QFrame, QVBoxLayout, QLabel, QHBoxLayout, 
                            QPushButton, QMessageBox, QWidget, QMenu, QSizePolicy,
                            QApplication, QFileDialog, QProgressDialog, QGridLayout,
                            QDialog, QScrollArea)
from PyQt6.QtCore import pyqtSignal, QSize, Qt, QMimeData, QPoint, QTimer, QFileSystemWatcher
from PyQt6.QtGui import QPixmap, QColor, QPainter, QCursor, QAction, QDrag, QIcon
from styles import PROJECT_CARD_STYLES, COLORS, SIZES
import os
from datetime import datetime
import shutil
import zipfile
import json
import subprocess
import traceback
import logging

logger = logging.getLogger(__name__)

class ProjectCard(QFrame):
    deleted = pyqtSignal(dict)  # Сигнал для уведомления об удалении
    favorite_changed = pyqtSignal(dict, bool)  # Сигнал для уведомления об изменении избранного
    project_clicked = pyqtSignal(dict)  # Сигнал для открытия проекта
    group_created = pyqtSignal(str, list)  # Сигнал для создания новой группы
    dragged_out = pyqtSignal(dict)  # Сигнал для уведомления о перетаскивании за пределы группы
    drag_finished = pyqtSignal(dict, bool)  # Сигнал для уведомления о завершении перетаскивания (проект, успешно ли)
    
    def __init__(self, project_info, parent=None):
        super().__init__(parent)
        self.project_info = project_info
        self.setObjectName("project_card")
        self.setStyleSheet(PROJECT_CARD_STYLES['main'])
        
        # Флаг для предотвращения рекурсивных обновлений
        self._is_updating = False
        
        # Таймер для отложенного обновления
        self._update_timer = QTimer(self)
        self._update_timer.setSingleShot(True)
        self._update_timer.setInterval(1000)  # 1 секунда задержки
        self._update_timer.timeout.connect(self._delayed_update)
        
        # Настраиваем политику размеров для адаптивности
        self.setSizePolicy(
            QSizePolicy.Policy.Fixed,
            QSizePolicy.Policy.Fixed
        )
        
        # Устанавливаем фиксированный размер карточки
        card_width = int(SIZES['card_width'].replace('px', ''))
        card_height = int(SIZES['card_min_height'].replace('px', ''))
        self.setFixedSize(card_width, card_height)
        
        self.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        
        # Включаем поддержку drag & drop
        self.setAcceptDrops(True)
        
        # Позиция начала перетаскивания
        self.drag_start_position = None
        
        # Создаем интерфейс
        self.setup_ui()
        
        # Инициализация наблюдателя за файловой системой
        self.fs_watcher = QFileSystemWatcher(self)
        self.setup_file_watcher()
        
        # Включаем контекстное меню
        self.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self.customContextMenuRequested.connect(self.show_context_menu)
    
    def setup_ui(self):
        """Создает все элементы интерфейса"""
        # Виджет для превью с абсолютным позиционированием
        self.preview_widget = QLabel(self)
        preview_width = int(SIZES['preview_width'].replace('px', ''))
        preview_height = int(SIZES['preview_height'].replace('px', ''))
        preview_padding = int(SIZES['preview_padding'].replace('px', ''))
        self.preview_widget.setGeometry(preview_padding, preview_padding, preview_width, preview_height)
        self.preview_widget.setStyleSheet(PROJECT_CARD_STYLES['image_placeholder'])
        self.preview_widget.setAlignment(Qt.AlignmentFlag.AlignCenter)
        
        # Загружаем превью если оно есть
        self.update_preview()
        
        # Контейнер для остального содержимого
        content_widget = QWidget(self)
        content_widget.setGeometry(0, preview_height + 16, self.width(), self.height() - preview_height - 16)
        content_layout = QVBoxLayout(content_widget)
        content_layout.setSpacing(8)
        content_layout.setContentsMargins(8, 4, 8, 8)
        
        # Название проекта
        self.name_label = QLabel(self.project_info["name"])
        self.name_label.setObjectName("title")
        self.name_label.setStyleSheet(PROJECT_CARD_STYLES['name_label'])
        self.name_label.setWordWrap(True)
        self.name_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.name_label.setMinimumHeight(38)
        content_layout.addWidget(self.name_label)
        
        # Нижняя панель с информацией
        bottom_panel = QHBoxLayout()
        bottom_panel.setSpacing(4)
        
        # Левая часть с информацией
        info_layout = QVBoxLayout()
        info_layout.setSpacing(0)
        
        # Дата создания
        created_date = datetime.fromtimestamp(self.project_info["created"]).strftime("%d.%m.%y")
        self.date_label = QLabel(f"Дата создания: {created_date}")
        self.date_label.setObjectName("date")
        self.date_label.setStyleSheet(PROJECT_CARD_STYLES['date_label'])
        info_layout.addWidget(self.date_label)
        
        # Количество файлов и размер
        self.files_label = QLabel()
        self.files_label.setObjectName("files_label")
        self.files_label.setStyleSheet(PROJECT_CARD_STYLES['files_label'])
        info_layout.addWidget(self.files_label)
        
        # Обновляем информацию о файлах
        self.update_file_info()
        
        bottom_panel.addLayout(info_layout)
        bottom_panel.addStretch()
        
        # Правая часть с иконками программ
        icons_layout = QHBoxLayout()
        icons_layout.setSpacing(4)
        
        # Иконки программ
        if self.project_info.get("blender_project", True):
            blender_button = QPushButton()
            blender_button.setFixedSize(20, 20)
            blender_button.setIcon(QIcon("icons/blend.png"))
            blender_button.setIconSize(QSize(20, 20))
            blender_button.setStyleSheet("QPushButton { border: none; background: transparent; }")
            blender_button.setCursor(Qt.CursorShape.PointingHandCursor)
            blender_button.clicked.connect(self.open_in_blender)
            icons_layout.addWidget(blender_button)
        
        if self.project_info.get("substance_project", True):
            substance_button = QPushButton()
            substance_button.setFixedSize(20, 20)
            substance_button.setIcon(QIcon("icons/substance.png"))
            substance_button.setIconSize(QSize(20, 20))
            substance_button.setStyleSheet("QPushButton { border: none; background: transparent; }")
            substance_button.setCursor(Qt.CursorShape.PointingHandCursor)
            substance_button.clicked.connect(self.open_in_substance)
            icons_layout.addWidget(substance_button)
        
        bottom_panel.addLayout(icons_layout)
        content_layout.addLayout(bottom_panel)
    
    def setup_file_watcher(self):
        """Настраивает отслеживание изменений в директории проекта"""
        try:
            # Сначала удаляем все старые пути
            if self.fs_watcher.files():
                self.fs_watcher.removePaths(self.fs_watcher.files())
            if self.fs_watcher.directories():
                self.fs_watcher.removePaths(self.fs_watcher.directories())
            
            project_path = self.project_info["path"]
            
            # Добавляем основную директорию проекта
            if os.path.exists(project_path):
                self.fs_watcher.addPath(project_path)
                
                # Добавляем поддиректории
                for root, dirs, files in os.walk(project_path):
                    for dir in dirs:
                        dir_path = os.path.join(root, dir)
                        if os.path.exists(dir_path):
                            self.fs_watcher.addPath(dir_path)
                    
                    # Добавляем файл превью для отслеживания
                    preview_path = os.path.join(root, "preview.png")
                    if os.path.exists(preview_path):
                        self.fs_watcher.addPath(preview_path)
                
                # Подключаем обработчики событий
                self.fs_watcher.directoryChanged.connect(self.schedule_update)
                self.fs_watcher.fileChanged.connect(self.schedule_update)
            
        except Exception as e:
            logger.error(f"Ошибка при настройке отслеживания файлов: {str(e)}")
            traceback.print_exc()

    def schedule_update(self, path):
        """Планирует отложенное обновление"""
        if not self._is_updating:
            self._update_timer.start()

    def _delayed_update(self):
        """Выполняет отложенное обновление"""
        if self._is_updating:
            return
            
        try:
            self._is_updating = True
            
            # Обновляем информацию
            self.update_file_info()
            self.update_preview()
            
            # Обновляем отслеживание
            self.setup_file_watcher()
            
        finally:
            self._is_updating = False

    def update_file_info(self):
        """Обновляет информацию о количестве файлов и размере проекта"""
        try:
            file_count = 0
            total_size = 0
            
            # Проверяем существование пути
            if os.path.exists(self.project_info["path"]):
                for root, dirs, files in os.walk(self.project_info["path"]):
                    file_count += len(files)
                    for file in files:
                        file_path = os.path.join(root, file)
                        if os.path.exists(file_path):
                            total_size += os.path.getsize(file_path)
            
            # Обновляем текст метки
            if hasattr(self, 'files_label'):
                self.files_label.setText(f"{file_count} файлов {self.format_size(total_size)}")
                
        except Exception as e:
            logger.error(f"Ошибка при обновлении информации о файлах: {str(e)}")
            traceback.print_exc()

    def resizeEvent(self, event):
        """Обработчик изменения размера для поддержания центрирования превью"""
        super().resizeEvent(event)
        if hasattr(self, 'preview_widget'):
            # Фиксированное позиционирование превью
            preview_width = int(SIZES['preview_width'].replace('px', ''))
            preview_height = int(SIZES['preview_height'].replace('px', ''))
            preview_padding = int(SIZES['preview_padding'].replace('px', ''))
            self.preview_widget.setGeometry(preview_padding, preview_padding, preview_width, preview_height)
    
    def find_project_files(self, extension):
        """Ищет все файлы проекта с указанным расширением, исключая BVersions"""
        project_files = []
        for root, dirs, files in os.walk(self.project_info["path"]):
            # Пропускаем папку BVersions
            if "BVersions" in root:
                continue
            
            for file in files:
                if file.lower().endswith(extension.lower()):
                    project_files.append(os.path.join(root, file))
        return project_files

    def select_file_dialog(self, files, title):
        """Показывает диалог выбора файла из списка"""
        if not files:
            return None
            
        if len(files) == 1:
            return files[0]
            
        # Создаем и показываем диалог выбора
        dialog = FileSelectDialog(files, title, self)
        result = dialog.exec()
        
        # Возвращаем выбранный файл или None, если отменено
        return dialog.selected_file if result == QDialog.DialogCode.Accepted else None

    def open_in_blender(self):
        try:
            # Загружаем настройки для получения пути к Blender
            with open('settings.json', 'r') as f:
                settings = json.load(f)
                blender_path = settings.get('blender_path', '')
            
            if not blender_path:
                QMessageBox.warning(self, "Ошибка", "Путь к Blender не настроен. Пожалуйста, укажите путь в настройках.")
                return
                
            if not os.path.exists(blender_path):
                QMessageBox.warning(self, "Ошибка", f"Не найден исполняемый файл Blender по пути:\n{blender_path}")
                return

            # Ищем все blend файлы в проекте
            blend_files = self.find_project_files(".blend")
            
            if not blend_files:
                # Если файлов нет, запускаем с аддоном
                addon_path = "blender_addon.py"
                if not os.path.exists(addon_path):
                    QMessageBox.warning(self, "Ошибка", "Не найден файл аддона blender_addon.py")
                    return
                    
                subprocess.Popen([
                    blender_path,
                    "--python", addon_path,
                    "--",  # Разделитель для передачи аргументов в Python скрипт
                    "--project-path", self.project_info["path"],
                    "--project-name", self.project_info["name"]
                ])
            else:
                # Если есть файлы, даем выбрать
                selected_file = self.select_file_dialog(blend_files, "Выбор файла Blender")
                if selected_file:
                    subprocess.Popen([blender_path, selected_file])
            
            # Запускаем отложенное обновление превью
            self.check_preview_update()
            
        except Exception as e:
            QMessageBox.critical(self, "Ошибка", f"Произошла ошибка при работе с Blender:\n{str(e)}")
            print(f"Ошибка при работе с Blender: {e}")
            traceback.print_exc()

    def open_in_substance(self):
        try:
            # Загружаем настройки для получения пути к Substance Painter
            with open('settings.json', 'r') as f:
                settings = json.load(f)
                substance_path = settings.get('substance_path', '')
            
            if not substance_path:
                QMessageBox.warning(self, "Ошибка", "Путь к Substance Painter не настроен. Пожалуйста, укажите путь в настройках.")
                return
                
            if not os.path.exists(substance_path):
                QMessageBox.warning(self, "Ошибка", f"Не найден исполняемый файл Substance Painter по пути:\n{substance_path}")
                return

            # Ищем все spp файлы в проекте
            spp_files = self.find_project_files(".spp")
            
            if not spp_files:
                # Если файлов нет, предлагаем выбрать 3D модель
                model_file, _ = QFileDialog.getOpenFileName(
                    self,
                    "Выберите 3D модель",
                    os.path.join(self.project_info["path"], "Export", "models"),
                    "3D модели (*.fbx *.obj *.3ds *.gltf *.glb)"
                )
                
                if not model_file:
                    return

                # Формируем путь для экспорта текстур
                export_path = os.path.join(self.project_info["path"], "Export", "Textures")
                
                # Создаем директорию для экспорта, если её нет
                os.makedirs(export_path, exist_ok=True)

                # Формируем команду запуска с параметрами
                cmd = f'"{substance_path}" --mesh "{model_file}" --export-path "{export_path}"'
                
                # Запускаем Substance Painter
                subprocess.Popen(cmd, shell=True)
            else:
                # Если есть файлы, даем выбрать
                selected_file = self.select_file_dialog(spp_files, "Выбор файла Substance Painter")
                if selected_file:
                    subprocess.Popen([substance_path, selected_file])

        except Exception as e:
            QMessageBox.critical(self, "Ошибка", f"Ошибка при запуске Substance Painter:\n{str(e)}")
    
    def format_size(self, size):
        for unit in ['б', 'Кб', 'Мб', 'Гб']:
            if size < 1024:
                return f"{size:.0f}{unit}"
            size /= 1024
        return f"{size:.0f}Тб"
    
    def show_context_menu(self, position):
        menu = QMenu(self)
        
        # Действие для открытия проекта
        open_action = QAction("Открыть", self)
        open_action.triggered.connect(lambda: self.project_clicked.emit(self.project_info))
        menu.addAction(open_action)
        
        menu.addSeparator()
        
        # Действие для избранного
        is_favorite = self.project_info.get("favorite", False)
        favorite_action = QAction("Убрать из избранного" if is_favorite else "Добавить в избранное", self)
        favorite_action.triggered.connect(self.toggle_favorite)
        menu.addAction(favorite_action)
        
        menu.addSeparator()
        
        # Действие для экспорта
        export_action = QAction("Экспортировать", self)
        export_action.triggered.connect(self.create_archive)
        menu.addAction(export_action)
        
        menu.addSeparator()
        
        # Действие для удаления
        delete_action = QAction("Удалить", self)
        delete_action.triggered.connect(self.confirm_delete)
        menu.addAction(delete_action)
        
        # Показываем меню в позиции курсора
        menu.exec(self.mapToGlobal(position))
    
    def confirm_delete(self):
        reply = QMessageBox.question(
            self,
            'Подтверждение удаления',
            f'Вы уверены, что хотите удалить проект "{self.project_info["name"]}"?\n\nВсе файлы проекта будут удалены безвозвратно!',
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            QMessageBox.StandardButton.No
        )
        
        if reply == QMessageBox.StandardButton.Yes:
            try:
                # Удаляем физические файлы
                project_path = self.project_info["path"]
                if os.path.exists(project_path):
                    for root, dirs, files in os.walk(project_path, topdown=False):
                        for name in files:
                            os.remove(os.path.join(root, name))
                        for name in dirs:
                            os.rmdir(os.path.join(root, name))
                    os.rmdir(project_path)
                
                # Отправляем сигнал об удалении
                self.deleted.emit(self.project_info)
            except Exception as e:
                QMessageBox.critical(
                    self,
                    'Ошибка удаления',
                    f'Не удалось удалить файлы проекта:\n{str(e)}',
                    QMessageBox.StandardButton.Ok
                )
    
    def toggle_favorite(self):
        is_favorite = not self.project_info.get("favorite", False)
        self.project_info["favorite"] = is_favorite
        self.favorite_changed.emit(self.project_info, is_favorite)

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.drag_start_position = event.pos()
            # Принимаем событие, чтобы показать, что мы его обработали
            event.accept()
        super().mousePressEvent(event)
    
    def mouseReleaseEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            # Если не было перетаскивания, открываем проект
            if self.drag_start_position is not None:
                drag_distance = (event.pos() - self.drag_start_position).manhattanLength()
                if drag_distance < QApplication.startDragDistance():
                    self.project_clicked.emit(self.project_info)
            self.drag_start_position = None
            event.accept()
        super().mouseReleaseEvent(event)
    
    def mouseMoveEvent(self, event):
        if not (event.buttons() & Qt.MouseButton.LeftButton):
            return
        
        if self.drag_start_position is None:
            return
            
        drag_distance = (event.pos() - self.drag_start_position).manhattanLength()
        if drag_distance < QApplication.startDragDistance():
            return

        drag = QDrag(self)
        mime_data = QMimeData()
        # Сериализуем информацию о проекте
        mime_data.setText(str(self.project_info))
        drag.setMimeData(mime_data)

        # Создаем превью для перетаскивания
        pixmap = self.grab()
        drag.setPixmap(pixmap.scaled(256, 280, Qt.AspectRatioMode.KeepAspectRatio))  # Обновляем размер превью для drag&drop
        drag.setHotSpot(event.pos())

        # Уведомляем о начале перетаскивания
        self.dragged_out.emit(self.project_info)

        # Начинаем перетаскивание
        result = drag.exec(Qt.DropAction.MoveAction)
        
        # Уведомляем о завершении перетаскивания
        self.drag_finished.emit(self.project_info, result == Qt.DropAction.MoveAction)
    
    def dragEnterEvent(self, event):
        if event.mimeData().hasText():
            # Проверяем, что это другой проект
            try:
                dropped_project = eval(event.mimeData().text())
                if dropped_project != self.project_info:
                    event.acceptProposedAction()
                    return
            except:
                pass
        event.ignore()

    def dropEvent(self, event):
        if event.mimeData().hasText():
            try:
                dropped_project = eval(event.mimeData().text())
                if dropped_project != self.project_info:
                    # Находим родительское окно
                    main_window = self.window()
                    
                    # Проверяем, не находятся ли оба проекта уже в одной группе
                    if hasattr(main_window, 'project_groups'):
                        for group in main_window.project_groups.values():
                            if dropped_project in group.projects and self.project_info in group.projects:
                                event.ignore()
                                return
                    
                    # Создаем новую группу
                    self.group_created.emit("Новая группа", [self.project_info, dropped_project])
                    event.acceptProposedAction()
                    return
            except Exception as e:
                print(f"Error in dropEvent: {e}")
        event.ignore()

    def create_archive(self):
        """Создает архив проекта"""
        try:
            # Создаем имя для архива
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            project_name = os.path.basename(self.project_info["path"])
            archive_name = f"{project_name}_archive_{timestamp}"
            
            # Открываем диалог сохранения файла
            archive_path, _ = QFileDialog.getSaveFileName(
                self,
                "Сохранить архив проекта",
                archive_name,
                "Архивы (*.zip)"
            )
            
            if not archive_path:
                return
            
            # Убираем расширение .zip, если оно есть
            if archive_path.lower().endswith('.zip'):
                archive_path = archive_path[:-4]
            
            # Получаем путь к проекту и проверяем его существование
            project_path = os.path.normpath(self.project_info["path"])
            print(f"Путь к проекту: {project_path}")
            
            if not os.path.exists(project_path):
                QMessageBox.critical(
                    self,
                    "Ошибка экспорта",
                    f"Путь проекта не существует:\n{project_path}",
                    QMessageBox.StandardButton.Ok
                )
                return
            
            if not os.path.isdir(project_path):
                QMessageBox.critical(
                    self,
                    "Ошибка экспорта",
                    f"Указанный путь не является директорией:\n{project_path}",
                    QMessageBox.StandardButton.Ok
                )
                return
            
            # Создаем временную папку для метаданных
            temp_dir = os.path.join(os.path.dirname(project_path), ".temp_archive")
            if not os.path.exists(temp_dir):
                os.makedirs(temp_dir)
            
            # Создаем файл с метаданными
            backup_info = {
                "original_path": project_path,
                "backup_date": timestamp,
                "project_info": self.project_info
            }
            
            metadata_path = os.path.join(project_path, "project_info.json")
            with open(metadata_path, 'w', encoding='utf-8') as f:
                json.dump(backup_info, f, indent=4, ensure_ascii=False)
            
            # Создаем архив всей папки проекта
            try:
                # Показываем прогресс
                progress = QProgressDialog("Создание архива проекта...", None, 0, 0, self)
                progress.setWindowTitle("Экспорт проекта")
                progress.setWindowModality(Qt.WindowModality.WindowModal)
                progress.show()
                QApplication.processEvents()
                
                # Создаем архив
                archive_path = shutil.make_archive(
                    archive_path,  # базовое имя архива
                    'zip',        # формат архива
                    project_path  # путь к папке для архивации
                )
                
                print(f"Архив создан: {archive_path}")
                
            except Exception as e:
                print(f"Ошибка при создании архива: {e}")
                if os.path.exists(archive_path + '.zip'):
                    os.remove(archive_path + '.zip')
                raise
            finally:
                progress.close()
            
            # Проверяем размер архива
            archive_size = os.path.getsize(archive_path)
            
            # Выводим информацию об архиве
            QMessageBox.information(
                self,
                "Экспорт проекта",
                f"Проект успешно экспортирован в:\n{archive_path}\n\n"
                f"Размер архива: {self.format_size(archive_size)}",
                QMessageBox.StandardButton.Ok
            )
            
        except Exception as e:
            print(f"Ошибка при создании архива: {e}")
            QMessageBox.critical(
                self,
                "Ошибка экспорта",
                f"Не удалось экспортировать проект:\n{str(e)}",
                QMessageBox.StandardButton.Ok
            )

    def update_preview(self):
        """Обновляет превью проекта"""
        try:
            preview_path = os.path.join(self.project_info["path"], "preview.png")
            
            # Проверяем метаданные проекта
            metadata_path = os.path.join(self.project_info["path"], "project_info.json")
            try:
                with open(metadata_path, 'r', encoding='utf-8') as f:
                    metadata = json.load(f)
            except:
                metadata = {}
            
            # Если превью существует и установлено пользователем, используем его
            if os.path.exists(preview_path) and metadata.get("custom_preview", False):
                pixmap = QPixmap(preview_path)
                if not pixmap.isNull():
                    scaled_pixmap = pixmap.scaled(
                        264, 148,
                        Qt.AspectRatioMode.IgnoreAspectRatio,
                        Qt.TransformationMode.SmoothTransformation
                    )
                    self.preview_widget.setPixmap(scaled_pixmap)
                    return
            
            # Если нет пользовательского превью, ищем автоматически созданное
            if os.path.exists(preview_path):
                pixmap = QPixmap(preview_path)
                if not pixmap.isNull():
                    scaled_pixmap = pixmap.scaled(
                        264, 148,
                        Qt.AspectRatioMode.IgnoreAspectRatio,
                        Qt.TransformationMode.SmoothTransformation
                    )
                    self.preview_widget.setPixmap(scaled_pixmap)
                    return
            
            # Если превью нет или не удалось загрузить, показываем иконку папки
            folder_pixmap = QPixmap("icons/open-folder.png")
            if not folder_pixmap.isNull():
                scaled_folder = folder_pixmap.scaled(
                    100, 100,
                    Qt.AspectRatioMode.KeepAspectRatio,
                    Qt.TransformationMode.SmoothTransformation
                )
                self.preview_widget.setPixmap(scaled_folder)
                self.preview_widget.setAlignment(Qt.AlignmentFlag.AlignCenter)
            else:
                self.preview_widget.clear()
                self.preview_widget.setText("Нет превью")
            
        except Exception as e:
            logger.error(f"Ошибка при обновлении превью: {str(e)}")
            self.preview_widget.clear()
            self.preview_widget.setText("Ошибка превью")
    
    def check_preview_update(self):
        """Немедленно обновляет превью"""
        self.schedule_update(None)  # Используем систему отложенных обновлений
    
    def showEvent(self, event):
        """Вызывается при отображении виджета"""
        super().showEvent(event)
        # Проверяем размеры после отображения
        print(f"Размеры после отображения:")
        print(f"Карточка: {self.width()}x{self.height()}")
        print(f"Превью: {self.preview_widget.width()}x{self.preview_widget.height()}")
        print(f"Геометрия превью: {self.preview_widget.geometry()}")
        print(f"Родительский виджет: {self.parentWidget().size() if self.parentWidget() else 'Нет родителя'}") 

class FileSelectDialog(QDialog):
    """Диалог выбора файла с вертикальным списком"""
    def __init__(self, files, title, parent=None):
        super().__init__(parent)
        self.selected_file = None
        self.setup_ui(files, title)
        
    def setup_ui(self, files, title):
        # Настройка окна
        self.setWindowTitle(title)
        self.setMinimumWidth(400)
        self.setStyleSheet("""
            QDialog {
                background-color: #2D2D2D;
                border: 1px solid #3D3D3D;
            }
            QLabel {
                color: #FFFFFF;
                font-size: 14px;
                padding: 10px;
            }
            QPushButton {
                background-color: #3D3D3D;
                color: #FFFFFF;
                border: none;
                padding: 10px;
                margin: 2px;
                text-align: left;
                font-size: 13px;
            }
            QPushButton:hover {
                background-color: #4D4D4D;
            }
            QPushButton:pressed {
                background-color: #5D5D5D;
            }
            QPushButton#file_button {
                padding-left: 40px;  /* Место для иконки */
            }
            QPushButton#cancel_button {
                background-color: #555555;
                margin-top: 10px;
                text-align: center;
            }
            QScrollArea {
                border: none;
                background-color: transparent;
            }
            QWidget#scroll_content {
                background-color: transparent;
            }
        """)
        
        # Основной layout
        layout = QVBoxLayout(self)
        layout.setSpacing(0)
        layout.setContentsMargins(0, 0, 0, 0)
        
        # Заголовок
        header = QLabel("Выберите файл для открытия:")
        header.setStyleSheet("background-color: #3D3D3D;")
        layout.addWidget(header)
        
        # Создаем область прокрутки
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        
        # Контейнер для кнопок
        scroll_content = QWidget()
        scroll_content.setObjectName("scroll_content")
        buttons_layout = QVBoxLayout(scroll_content)
        buttons_layout.setSpacing(0)
        buttons_layout.setContentsMargins(0, 0, 0, 0)
        
        # Загружаем иконки
        blend_icon = QIcon("icons/blend.png")
        substance_icon = QIcon("icons/substance.png")
        
        # Добавляем кнопки для каждого файла
        for file_path in files:
            file_name = os.path.basename(file_path)
            button = QPushButton(file_name)
            button.setObjectName("file_button")
            
            # Устанавливаем соответствующую иконку
            if file_name.lower().endswith('.blend'):
                button.setIcon(blend_icon)
            elif file_name.lower().endswith('.spp'):
                button.setIcon(substance_icon)
                
            # Настраиваем размер иконки
            button.setIconSize(QSize(24, 24))
            
            button.clicked.connect(lambda checked, path=file_path: self.select_file(path))
            buttons_layout.addWidget(button)
        
        scroll.setWidget(scroll_content)
        layout.addWidget(scroll)
        
        # Кнопка отмены внизу
        cancel_button = QPushButton("Отмена")
        cancel_button.setObjectName("cancel_button")
        cancel_button.clicked.connect(self.reject)
        layout.addWidget(cancel_button)
        
    def select_file(self, file_path):
        self.selected_file = file_path
        self.accept() 