from PyQt6.QtWidgets import (QFrame, QVBoxLayout, QLabel, QHBoxLayout, 
                            QPushButton, QMessageBox, QWidget, QMenu, QSizePolicy,
                            QInputDialog, QApplication)
from PyQt6.QtCore import pyqtSignal, QSize, Qt, QPoint, QTimer
from PyQt6.QtGui import QPixmap, QPainter, QCursor, QAction, QPalette, QColor
from styles import PROJECT_CARD_STYLES, COLORS
from project_card import ProjectCard

class ProjectGroup(QFrame):
    deleted = pyqtSignal(list)  # Сигнал для уведомления об удалении группы
    project_clicked = pyqtSignal(dict)  # Сигнал для открытия проекта
    group_changed = pyqtSignal()  # Сигнал для уведомления об изменении группы
    
    def __init__(self, name="Новая группа", projects=None, parent=None):
        super().__init__(parent)
        self.projects = projects or []
        self.name = name
        self.is_expanded = False
        self.setObjectName("project_group")
        self.setStyleSheet(PROJECT_CARD_STYLES['main'])
        
        # Настраиваем политику размеров
        self.setSizePolicy(QSizePolicy.Policy.Fixed, QSizePolicy.Policy.Fixed)
        self.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        
        # Основной layout
        self.layout = QVBoxLayout(self)
        self.layout.setSpacing(8)
        self.layout.setContentsMargins(8, 8, 8, 8)
        
        # Создаем верхнюю карточку
        self.top_card = QWidget()
        top_layout = QVBoxLayout(self.top_card)
        top_layout.setSpacing(8)
        top_layout.setContentsMargins(8, 8, 8, 8)
        
        # Название группы
        self.name_label = QLabel(self.name)
        self.name_label.setObjectName("title")
        self.name_label.setStyleSheet(PROJECT_CARD_STYLES['name_label'])
        self.name_label.setWordWrap(True)
        self.name_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        top_layout.addWidget(self.name_label)
        
        # Информация о количестве проектов
        self.info_label = QLabel(f"Проектов в группе: {len(self.projects)}")
        self.info_label.setStyleSheet(PROJECT_CARD_STYLES['files_label'])
        top_layout.addWidget(self.info_label)
        
        self.layout.addWidget(self.top_card)
        
        # Контейнер для карточек проектов
        self.cards_container = QWidget()
        self.cards_layout = QVBoxLayout(self.cards_container)
        self.cards_layout.setSpacing(8)
        self.cards_layout.setContentsMargins(0, 0, 0, 0)
        self.layout.addWidget(self.cards_container)
        self.cards_container.hide()
        
        # Создаем карточки для проектов
        self.project_cards = []
        for project in self.projects:
            card = ProjectCard(project)
            card.deleted.connect(lambda p: self.remove_project(p))
            card.project_clicked.connect(self.project_clicked.emit)
            self.project_cards.append(card)
            self.cards_layout.addWidget(card)
        
        # Включаем контекстное меню
        self.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self.customContextMenuRequested.connect(self.show_context_menu)
        
        # Настройка для приема drop
        self.setAcceptDrops(True)
        
        # Обновляем визуальное представление
        self.update_appearance()
        
        # Таймер для автоматического сворачивания
        self.collapse_timer = QTimer(self)
        self.collapse_timer.setSingleShot(True)
        self.collapse_timer.timeout.connect(self.collapse_group)
        
        # Устанавливаем фильтр событий для отслеживания кликов вне группы
        QApplication.instance().installEventFilter(self)
    
    def update_appearance(self):
        # Обновляем информацию
        self.info_label.setText(f"Проектов в группе: {len(self.projects)}")
        
        # Устанавливаем минимальный размер с учетом смещения карточек
        base_width = 200
        base_height = 200
        if not self.is_expanded:
            offset = 8  # Смещение для каждой следующей карточки
            total_offset = min(len(self.projects) - 1, 2) * offset  # Максимум 3 карточки в стопке
            self.setMinimumSize(base_width + total_offset, base_height + total_offset)
        else:
            self.setMinimumSize(base_width, base_height * len(self.projects) + 8 * (len(self.projects) - 1))
        self.update()
    
    def paintEvent(self, event):
        super().paintEvent(event)
        if not self.is_expanded and len(self.projects) > 1:
            painter = QPainter(self)
            painter.setRenderHint(QPainter.RenderHint.Antialiasing)
            
            # Рисуем "тени" карточек
            offset = 8
            max_cards = min(len(self.projects) - 1, 2)  # Максимум 3 карточки в стопке
            
            for i in range(max_cards):
                painter.setPen(Qt.PenStyle.NoPen)
                painter.setBrush(QColor(COLORS['card_background']))
                painter.setOpacity(0.7 - i * 0.2)  # Уменьшаем прозрачность для каждой следующей карточки
                painter.drawRoundedRect(offset * (i + 1), offset * (i + 1), 
                                      self.width() - offset * (i + 1) * 2, 
                                      self.height() - offset * (i + 1) * 2, 10, 10)
    
    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.toggle_expansion()
        super().mousePressEvent(event)
    
    def toggle_expansion(self):
        self.is_expanded = not self.is_expanded
        if self.is_expanded:
            self.cards_container.show()
            self.collapse_timer.stop()
        else:
            self.cards_container.hide()
        self.update_appearance()
    
    def collapse_group(self):
        if self.is_expanded:
            self.toggle_expansion()
    
    def eventFilter(self, obj, event):
        if event.type() == event.Type.MouseButtonPress and self.is_expanded:
            if obj != self and not self.isAncestorOf(obj):
                # Клик был вне группы
                self.collapse_timer.start(100)  # Небольшая задержка перед сворачиванием
        return False
    
    def add_project(self, project):
        if project not in self.projects:
            self.projects.append(project)
            card = ProjectCard(project)
            card.deleted.connect(lambda p: self.remove_project(p))
            card.project_clicked.connect(self.project_clicked.emit)
            self.project_cards.append(card)
            self.cards_layout.addWidget(card)
            self.update_appearance()
            self.group_changed.emit()
    
    def remove_project(self, project):
        if project in self.projects:
            index = self.projects.index(project)
            self.projects.remove(project)
            card = self.project_cards.pop(index)
            self.cards_layout.removeWidget(card)
            card.deleteLater()
            
            if len(self.projects) == 0:
                self.deleted.emit([])
            else:
                self.update_appearance()
                self.group_changed.emit()
    
    def rename_group(self):
        new_name, ok = QInputDialog.getText(
            self, 'Переименовать группу',
            'Введите новое название группы:',
            text=self.name
        )
        if ok and new_name:
            self.name = new_name
            self.name_label.setText(new_name)
            self.group_changed.emit()
    
    def show_context_menu(self, position):
        menu = QMenu(self)
        
        # Действие для переименования
        rename_action = QAction("Переименовать группу", self)
        rename_action.triggered.connect(self.rename_group)
        menu.addAction(rename_action)
        
        if len(self.projects) > 0:
            menu.addSeparator()
            
            # Подменю для проектов
            projects_menu = QMenu("Проекты", self)
            for project in self.projects:
                project_action = QAction(project["name"], self)
                project_action.triggered.connect(lambda p=project: self.project_clicked.emit(p))
                projects_menu.addAction(project_action)
            menu.addMenu(projects_menu)
            
            menu.addSeparator()
            
            # Действие для роспуска группы
            ungroup_action = QAction("Распустить группу", self)
            ungroup_action.triggered.connect(lambda: self.deleted.emit(self.projects))
            menu.addAction(ungroup_action)
        
        menu.exec(self.mapToGlobal(position))
    
    def dragEnterEvent(self, event):
        if event.mimeData().hasFormat("application/x-project"):
            event.accept()
        else:
            event.ignore()
    
    def dropEvent(self, event):
        if event.mimeData().hasFormat("application/x-project"):
            project_data = eval(event.mimeData().text())  # Безопасно, так как мы сами создаем эти данные
            self.add_project(project_data)
            event.accept()
        else:
            event.ignore() 