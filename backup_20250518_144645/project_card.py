from PyQt6.QtWidgets import (QFrame, QVBoxLayout, QLabel, QHBoxLayout, 
                            QPushButton, QMessageBox, QWidget, QMenu, QSizePolicy,
                            QApplication)
from PyQt6.QtCore import pyqtSignal, QSize, Qt, QMimeData, QPoint
from PyQt6.QtGui import QPixmap, QColor, QPainter, QCursor, QAction, QDrag
from styles import PROJECT_CARD_STYLES, COLORS
import os
from datetime import datetime
import shutil

class ProjectCard(QFrame):
    deleted = pyqtSignal(dict)  # Сигнал для уведомления об удалении
    favorite_changed = pyqtSignal(dict, bool)  # Сигнал для уведомления об изменении избранного
    project_clicked = pyqtSignal(dict)  # Сигнал для открытия проекта
    group_created = pyqtSignal(str, list)  # Сигнал для создания новой группы
    
    def __init__(self, project_info, parent=None):
        super().__init__(parent)
        self.project_info = project_info
        self.setObjectName("project_card")
        self.setStyleSheet(PROJECT_CARD_STYLES['main'])
        
        # Настраиваем политику размеров для адаптивности
        self.setSizePolicy(QSizePolicy.Policy.Fixed, QSizePolicy.Policy.Fixed)
        self.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        
        # Включаем поддержку drag & drop
        self.setAcceptDrops(True)
        
        # Позиция начала перетаскивания
        self.drag_start_position = None
        
        layout = QVBoxLayout(self)
        layout.setSpacing(8)
        layout.setContentsMargins(8, 8, 8, 8)
        
        # Плейсхолдер для изображения
        image_placeholder = QWidget()
        image_placeholder.setFixedSize(184, 90)
        image_placeholder.setStyleSheet(PROJECT_CARD_STYLES['image_placeholder'])
        layout.addWidget(image_placeholder, alignment=Qt.AlignmentFlag.AlignCenter)
        
        # Название проекта
        name_label = QLabel(project_info["name"])
        name_label.setObjectName("title")
        name_label.setStyleSheet(PROJECT_CARD_STYLES['name_label'])
        name_label.setWordWrap(True)
        name_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        name_label.setFixedHeight(20)
        layout.addWidget(name_label)
        
        # Нижняя панель с информацией
        bottom_panel = QHBoxLayout()
        bottom_panel.setSpacing(4)
        bottom_panel.setContentsMargins(0, 0, 0, 0)
        
        # Левая часть с информацией
        info_layout = QVBoxLayout()
        info_layout.setSpacing(0)
        info_layout.setContentsMargins(0, 0, 0, 0)
        
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
        icons_layout.setContentsMargins(0, 0, 0, 0)
        
        # Иконки программ
        if project_info.get("blender_project", True):
            blender_icon = QLabel()
            blender_icon.setFixedSize(20, 20)
            pixmap = QPixmap("icons/blend.png")
            blender_icon.setPixmap(pixmap.scaled(20, 20, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation))
            icons_layout.addWidget(blender_icon)
        
        if project_info.get("substance_project", True):
            substance_icon = QLabel()
            substance_icon.setFixedSize(20, 20)
            pixmap = QPixmap("icons/substance.png")
            substance_icon.setPixmap(pixmap.scaled(20, 20, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation))
            icons_layout.addWidget(substance_icon)
        
        bottom_panel.addLayout(icons_layout)
        layout.addLayout(bottom_panel)
        
        # Включаем контекстное меню
        self.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self.customContextMenuRequested.connect(self.show_context_menu)
    
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
        super().mousePressEvent(event)
    
    def mouseMoveEvent(self, event):
        if not (event.buttons() & Qt.MouseButton.LeftButton):
            return
        if not self.drag_start_position:
            return
        
        # Проверяем, достаточно ли далеко переместилась мышь для начала drag
        if (event.pos() - self.drag_start_position).manhattanLength() < QApplication.startDragDistance():
            return
        
        # Создаем drag
        drag = QDrag(self)
        mime_data = QMimeData()
        
        # Сериализуем информацию о проекте
        mime_data.setData("application/x-project", str(self.project_info).encode())
        mime_data.setText(str(self.project_info))
        
        drag.setMimeData(mime_data)
        
        # Создаем превью для drag
        pixmap = self.grab()
        drag.setPixmap(pixmap.scaled(100, 100, Qt.AspectRatioMode.KeepAspectRatio))
        drag.setHotSpot(QPoint(50, 50))
        
        # Выполняем drag
        result = drag.exec(Qt.DropAction.MoveAction)
    
    def dragEnterEvent(self, event):
        if event.mimeData().hasFormat("application/x-project"):
            event.accept()
        else:
            event.ignore()
    
    def dropEvent(self, event):
        if event.mimeData().hasFormat("application/x-project"):
            dropped_project = eval(event.mimeData().text())  # Безопасно, так как мы сами создаем эти данные
            if dropped_project != self.project_info:
                # Создаем новую группу
                self.group_created.emit("Новая группа", [self.project_info, dropped_project])
            event.accept()
        else:
            event.ignore() 