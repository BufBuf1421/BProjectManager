from PyQt6.QtWidgets import (QFrame, QVBoxLayout, QLabel, QHBoxLayout, 
                            QPushButton, QMessageBox, QWidget, QMenu, QSizePolicy,
                            QApplication, QFileDialog, QProgressDialog, QGridLayout)
from PyQt6.QtCore import pyqtSignal, QSize, Qt, QMimeData, QPoint, QTimer
from PyQt6.QtGui import QPixmap, QColor, QPainter, QCursor, QAction, QDrag, QIcon
from styles import PROJECT_CARD_STYLES, COLORS, SIZES
import os
from datetime import datetime
import shutil
import zipfile
import json
import subprocess
import traceback

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
        
        # Таймер для обновления превью
        self.preview_timer = QTimer()
        self.preview_timer.setSingleShot(True)
        self.preview_timer.timeout.connect(self.update_preview)
        
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
        name_label = QLabel(project_info["name"])
        name_label.setObjectName("title")
        name_label.setStyleSheet(PROJECT_CARD_STYLES['name_label'])
        name_label.setWordWrap(True)
        name_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        name_label.setMinimumHeight(38)
        content_layout.addWidget(name_label)
        
        # Нижняя панель с информацией
        bottom_panel = QHBoxLayout()
        bottom_panel.setSpacing(4)
        
        # Левая часть с информацией
        info_layout = QVBoxLayout()
        info_layout.setSpacing(0)
        
        # Дата создания
        created_date = datetime.fromtimestamp(project_info["created"]).strftime("%d.%m.%y")
        date_label = QLabel(f"Дата создания: {created_date}")
        date_label.setObjectName("date")
        date_label.setStyleSheet(PROJECT_CARD_STYLES['date_label'])
        info_layout.addWidget(date_label)
        
        # Количество файлов и размер
        try:
            file_count = 0
            total_size = 0
            for root, dirs, files in os.walk(project_info["path"]):
                file_count += len(files)
                for file in files:
                    total_size += os.path.getsize(os.path.join(root, file))
            
            files_label = QLabel(f"{file_count} файлов {self.format_size(total_size)}")
            files_label.setStyleSheet(PROJECT_CARD_STYLES['files_label'])
            info_layout.addWidget(files_label)
        except:
            pass
        
        bottom_panel.addLayout(info_layout)
        bottom_panel.addStretch()
        
        # Правая часть с иконками программ
        icons_layout = QHBoxLayout()
        icons_layout.setSpacing(4)
        
        # Иконки программ
        if project_info.get("blender_project", True):
            blender_button = QPushButton()
            blender_button.setFixedSize(20, 20)
            blender_button.setIcon(QIcon("icons/blend.png"))
            blender_button.setIconSize(QSize(20, 20))
            blender_button.setStyleSheet("QPushButton { border: none; background: transparent; }")
            blender_button.setCursor(Qt.CursorShape.PointingHandCursor)
            blender_button.clicked.connect(self.open_in_blender)
            icons_layout.addWidget(blender_button)
        
        if project_info.get("substance_project", True):
            substance_icon = QLabel()
            substance_icon.setFixedSize(20, 20)
            pixmap = QPixmap("icons/substance.png")
            substance_icon.setPixmap(pixmap.scaled(20, 20, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation))
            icons_layout.addWidget(substance_icon)
        
        bottom_panel.addLayout(icons_layout)
        content_layout.addLayout(bottom_panel)
        
        # Включаем контекстное меню
        self.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self.customContextMenuRequested.connect(self.show_context_menu)
    
    def resizeEvent(self, event):
        """Обработчик изменения размера для поддержания центрирования превью"""
        super().resizeEvent(event)
        if hasattr(self, 'preview_widget'):
            # Фиксированное позиционирование превью
            preview_width = int(SIZES['preview_width'].replace('px', ''))
            preview_height = int(SIZES['preview_height'].replace('px', ''))
            preview_padding = int(SIZES['preview_padding'].replace('px', ''))
            self.preview_widget.setGeometry(preview_padding, preview_padding, preview_width, preview_height)
    
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

            # Проверяем наличие blend файла в корне проекта
            project_path = self.project_info["path"]
            project_name = self.project_info["name"]
            blend_file = os.path.join(project_path, f"{project_name}.blend")

            try:
                if os.path.exists(blend_file):
                    # Если файл существует, открываем его
                    subprocess.Popen([blender_path, blend_file])
                else:
                    # Проверяем наличие аддона
                    addon_path = "blender_addon.py"
                    if not os.path.exists(addon_path):
                        QMessageBox.warning(self, "Ошибка", "Не найден файл аддона blender_addon.py")
                        return
                        
                    # Если файла нет, запускаем Blender с аддоном
                    subprocess.Popen([
                        blender_path,
                        "--python", addon_path,
                        "--",  # Разделитель для передачи аргументов в Python скрипт
                        "--project-path", project_path,
                        "--project-name", project_name
                    ])
                
                # Запускаем отложенное обновление превью
                self.check_preview_update()
                
            except subprocess.SubprocessError as e:
                QMessageBox.critical(self, "Ошибка", f"Не удалось запустить Blender:\n{str(e)}")
            
        except Exception as e:
            QMessageBox.critical(self, "Ошибка", f"Произошла ошибка при работе с Blender:\n{str(e)}")
            print(f"Ошибка при работе с Blender: {e}")
            traceback.print_exc()
    
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
            if os.path.exists(preview_path):
                pixmap = QPixmap(preview_path)
                if not pixmap.isNull():
                    # Масштабируем изображение с заполнением всей области
                    scaled_pixmap = pixmap.scaled(
                        264, 148,
                        Qt.AspectRatioMode.IgnoreAspectRatio,  # Игнорируем пропорции для полного заполнения
                        Qt.TransformationMode.SmoothTransformation
                    )
                    self.preview_widget.setPixmap(scaled_pixmap)
                    return
            
            # Если превью нет или не удалось загрузить, показываем иконку папки
            folder_pixmap = QPixmap("icons/open-folder.png")
            if not folder_pixmap.isNull():
                # Масштабируем иконку папки с сохранением пропорций
                scaled_folder = folder_pixmap.scaled(
                    100, 100,  # Размер иконки папки
                    Qt.AspectRatioMode.KeepAspectRatio,
                    Qt.TransformationMode.SmoothTransformation
                )
                self.preview_widget.setPixmap(scaled_folder)
                self.preview_widget.setAlignment(Qt.AlignmentFlag.AlignCenter)
            else:
                self.preview_widget.clear()
                self.preview_widget.setText("Нет превью")
            
        except Exception as e:
            print(f"Ошибка при обновлении превью: {e}")
            self.preview_widget.clear()
            self.preview_widget.setText("Ошибка превью")
    
    def check_preview_update(self):
        """Запускает отложенное обновление превью"""
        self.preview_timer.start(1000)  # Обновляем через 1 секунду после последнего изменения 

    def showEvent(self, event):
        """Вызывается при отображении виджета"""
        super().showEvent(event)
        # Проверяем размеры после отображения
        print(f"Размеры после отображения:")
        print(f"Карточка: {self.width()}x{self.height()}")
        print(f"Превью: {self.preview_widget.width()}x{self.preview_widget.height()}")
        print(f"Геометрия превью: {self.preview_widget.geometry()}")
        print(f"Родительский виджет: {self.parentWidget().size() if self.parentWidget() else 'Нет родителя'}") 