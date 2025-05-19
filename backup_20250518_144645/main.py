import sys
import traceback
import json
import os
from PyQt6.QtWidgets import (QApplication, QMainWindow, QWidget, QPushButton,
                           QVBoxLayout, QHBoxLayout, QLabel, QFrame, QLineEdit,
                           QScrollArea, QDialog, QGridLayout)
from PyQt6.QtCore import Qt
from PyQt6.QtGui import QPainter, QPen, QColor
from settings_dialog import SettingsDialog
from create_project_dialog import CreateProjectDialog
from project_card import ProjectCard
from project_group import ProjectGroup
from project_window import ProjectWindow
from styles import (MAIN_WINDOW_STYLE, RIGHT_PANEL_STYLE, 
                   SECTION_TITLE_STYLE, PROJECT_CARD_STYLE,
                   SCROLL_AREA_STYLE)

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Менеджер проектов")
        self.setStyleSheet(MAIN_WINDOW_STYLE)
        
        # Создаем главный виджет и горизонтальный layout
        main_widget = QWidget()
        self.setCentralWidget(main_widget)
        main_layout = QHBoxLayout(main_widget)
        main_layout.setSpacing(20)
        main_layout.setContentsMargins(20, 20, 20, 20)
        
        # Создаем левую часть (основную область)
        left_widget = QWidget()
        left_layout = QVBoxLayout(left_widget)
        left_layout.setSpacing(20)
        
        # Верхняя панель с кнопками и поиском
        top_panel = QHBoxLayout()
        new_project_btn = QPushButton("Создать проект")
        new_project_btn.clicked.connect(self.show_create_project_dialog)
        plans_btn = QPushButton("Планы")
        self.search_input = QLineEdit()
        self.search_input.setPlaceholderText("Поиск проектов...")
        self.search_input.textChanged.connect(self.filter_projects)
        settings_btn = QPushButton("⚙")
        settings_btn.setFixedSize(40, 40)
        settings_btn.clicked.connect(self.show_settings)
        
        top_panel.addWidget(new_project_btn)
        top_panel.addWidget(plans_btn)
        top_panel.addStretch()
        top_panel.addWidget(self.search_input)
        top_panel.addWidget(settings_btn)
        left_layout.addLayout(top_panel)
        
        # Область со всеми проектами
        all_projects = QFrame()
        all_projects.setObjectName("projects_container")  # Добавляем идентификатор
        all_layout = QVBoxLayout(all_projects)
        all_title = QLabel("Проекты")
        all_title.setStyleSheet(SECTION_TITLE_STYLE)
        all_layout.addWidget(all_title)
        
        # Контейнер с прокруткой для всех проектов
        self.all_projects_container = QWidget()
        self.all_projects_container.setObjectName("all_projects_container")
        self.all_projects_layout = QGridLayout(self.all_projects_container)
        self.all_projects_layout.setSpacing(20)  # Увеличиваем расстояние между карточками
        self.all_projects_layout.setAlignment(Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignTop)  # Выравнивание слева сверху
        
        all_scroll = QScrollArea()
        all_scroll.setWidget(self.all_projects_container)
        all_scroll.setWidgetResizable(True)
        all_scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        all_scroll.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        all_scroll.setStyleSheet(SCROLL_AREA_STYLE)
        all_scroll.widget().setObjectName("scrollAreaWidgetContents")  # Добавляем идентификатор для внутреннего виджета
        all_layout.addWidget(all_scroll)
        left_layout.addWidget(all_projects)
        
        main_layout.addWidget(left_widget, stretch=7)
        
        # Правая боковая панель
        right_panel = QFrame()
        right_panel.setObjectName("right_panel")
        right_panel.setStyleSheet(RIGHT_PANEL_STYLE)
        right_layout = QVBoxLayout(right_panel)
        
        favorites_title = QLabel("Избранное")
        favorites_title.setStyleSheet("font-size: 16px; font-weight: bold;")
        right_layout.addWidget(favorites_title)
        
        right_layout.addStretch()
        main_layout.addWidget(right_panel, stretch=3)
        
        # Инициализируем переменные для адаптивной сетки
        self.min_card_width = 250  # Минимальная ширина карточки
        self.card_spacing = 20     # Расстояние между карточками
        
        # Словари для хранения групп и открытых окон
        self.project_groups = {}  # Словарь для хранения групп проектов
        self.project_windows = {}  # Словарь для хранения открытых окон проектов
        
        # Загружаем существующие проекты
        self.load_projects()
        
        # Устанавливаем минимальный размер окна
        self.setMinimumSize(800, 600)
    
    def resizeEvent(self, event):
        """Обработчик изменения размера окна"""
        super().resizeEvent(event)
        self.update_grid_layout()
    
    def update_grid_layout(self):
        """Обновляет расположение карточек в сетке"""
        # Получаем ширину области для карточек
        scroll_width = self.all_projects_container.width()
        
        # Вычисляем максимальное количество колонок
        # Учитываем фиксированную ширину карточки (200) и отступы
        max_cols = max(1, (scroll_width - self.card_spacing) // (200 + self.card_spacing))
        
        # Собираем все карточки
        cards = []
        while self.all_projects_layout.count():
            item = self.all_projects_layout.takeAt(0)
            if item.widget():
                cards.append(item.widget())
        
        # Распределяем карточки по новой сетке
        for i, card in enumerate(cards):
            row = i // max_cols
            col = i % max_cols
            self.all_projects_layout.addWidget(card, row, col)
        
        # Устанавливаем отступы
        self.all_projects_layout.setSpacing(self.card_spacing)
    
    def show_settings(self):
        dialog = SettingsDialog(self)
        dialog.exec()
    
    def show_create_project_dialog(self):
        dialog = CreateProjectDialog(self)
        if dialog.exec() and dialog.project_data:
            self.add_project(dialog.project_data)
            self.save_projects()
    
    def load_projects(self):
        try:
            if os.path.exists('projects.json'):
                with open('projects.json', 'r') as f:
                    data = json.load(f)
                    
                    # Очищаем существующие проекты и группы
                    self.clear_projects()
                    self.project_groups.clear()
                    
                    # Проверяем формат данных
                    if isinstance(data, list):
                        # Старый формат - просто список проектов
                        projects = data
                    else:
                        # Новый формат - словарь с projects и groups
                        projects = data.get("projects", [])
                        groups = data.get("groups", {})
                        # Загружаем группы
                        for group_id, group_data in groups.items():
                            self.create_project_group(group_data["name"], group_data["projects"])
                    
                    # Загружаем отдельные проекты
                    projects.sort(key=lambda x: x["created"], reverse=True)
                    for project in projects:
                        self.add_project(project)
                    
                    # Обновляем сетку
                    self.update_grid_layout()
                    
        except Exception as e:
            print(f"Error loading projects: {e}")
            traceback.print_exc()  # Добавляем вывод полного стека ошибки для отладки
    
    def clear_projects(self):
        # Очищаем все проекты
        while self.all_projects_layout.count():
            item = self.all_projects_layout.takeAt(0)
            if item.widget():
                item.widget().deleteLater()
    
    def add_project(self, project_data):
        # Создаем и добавляем карточку
        card = ProjectCard(project_data)
        card.deleted.connect(self.delete_project)
        card.favorite_changed.connect(self.update_favorite)
        card.project_clicked.connect(self.open_project)
        card.group_created.connect(self.create_project_group)
        self.all_projects_layout.addWidget(card, 0, 0)  # Временно добавляем в позицию 0,0
        
        # Если проект помечен как избранный, добавляем его в боковую панель
        if project_data.get("favorite", False):
            self.add_to_favorites(project_data)
        
        # Обновляем сетку
        self.update_grid_layout()
        self.save_projects()

    def open_project(self, project_data):
        # Проверяем, не открыт ли уже проект
        if project_data["path"] in self.project_windows:
            # Если окно уже существует, показываем его и поднимаем на передний план
            window = self.project_windows[project_data["path"]]
            window.show()
            window.raise_()
            window.activateWindow()
        else:
            # Создаем новое окно проекта
            window = ProjectWindow(project_data)
            window.setWindowTitle(f"Проект: {project_data['name']}")
            
            # Сохраняем окно в словаре и устанавливаем обработчик закрытия
            self.project_windows[project_data["path"]] = window
            window.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)  # Автоматическое удаление при закрытии
            
            # Обработчик закрытия окна
            def on_window_closed():
                if project_data["path"] in self.project_windows:
                    del self.project_windows[project_data["path"]]
            
            window.destroyed.connect(on_window_closed)
            window.show()

    def delete_project(self, project_data):
        # Удаляем карточку из сетки
        for i in range(self.all_projects_layout.count()):
            item = self.all_projects_layout.itemAt(i)
            if item and item.widget():
                card = item.widget()
                if isinstance(card, ProjectCard) and card.project_info == project_data:
                    self.all_projects_layout.takeAt(i).widget().deleteLater()
                    break
        
        # Перераспределяем оставшиеся карточки
        cards = []
        while self.all_projects_layout.count():
            item = self.all_projects_layout.takeAt(0)
            if item.widget():
                cards.append(item.widget())
        
        max_cols = 4
        for i, card in enumerate(cards):
            row = i // max_cols
            col = i % max_cols
            self.all_projects_layout.addWidget(card, row, col)
        
        # Удаляем из избранного, если был там
        if project_data.get("favorite", False):
            self.remove_from_favorites(project_data)
        
        # Обновляем JSON файл
        self.save_projects()

    def update_favorite(self, project_data, is_favorite):
        if is_favorite:
            self.add_to_favorites(project_data)
        else:
            self.remove_from_favorites(project_data)
        self.save_projects()

    def add_to_favorites(self, project_data):
        # Находим правую панель
        right_panel = self.findChild(QFrame, "right_panel")
        if right_panel:
            layout = right_panel.layout()
            # Создаем метку с названием проекта
            label = QLabel(project_data["name"])
            label.setStyleSheet("color: #333; padding: 5px;")
            label.setProperty("project_data", project_data)  # Сохраняем данные проекта в свойствах метки
            # Добавляем перед растягивающимся элементом
            layout.insertWidget(layout.count() - 1, label)

    def remove_from_favorites(self, project_data):
        right_panel = self.findChild(QFrame, "right_panel")
        if right_panel:
            layout = right_panel.layout()
            for i in range(layout.count()):
                item = layout.itemAt(i)
                if item and item.widget():
                    widget = item.widget()
                    if isinstance(widget, QLabel) and widget.property("project_data") == project_data:
                        layout.takeAt(i).widget().deleteLater()
                        break

    def filter_projects(self):
        search_text = self.search_input.text().lower()
        
        # Фильтруем все проекты
        for row in range(self.all_projects_layout.rowCount()):
            for col in range(self.all_projects_layout.columnCount()):
                item = self.all_projects_layout.itemAtPosition(row, col)
                if item and item.widget():
                    card = item.widget()
                    if isinstance(card, ProjectCard):
                        project_name = card.project_info["name"].lower()
                        card.setVisible(search_text in project_name)

    def create_project_group(self, name, projects):
        # Создаем новую группу
        group = ProjectGroup(name, projects)
        group.deleted.connect(self.ungroup_projects)
        group.project_clicked.connect(self.open_project)
        group.group_changed.connect(self.save_projects)
        
        # Удаляем отдельные карточки проектов
        for project in projects:
            self.remove_project_card(project)
        
        # Добавляем группу в сетку
        self.all_projects_layout.addWidget(group, 0, 0)
        
        # Сохраняем группу в словаре
        group_id = f"group_{len(self.project_groups)}"
        self.project_groups[group_id] = group
        
        # Обновляем сетку и сохраняем
        self.update_grid_layout()
        self.save_projects()
    
    def ungroup_projects(self, projects):
        # Получаем группу, которая отправила сигнал
        group = self.sender()
        
        # Удаляем группу из сетки и словаря
        self.all_projects_layout.removeWidget(group)
        group_id = None
        for gid, g in self.project_groups.items():
            if g == group:
                group_id = gid
                break
        if group_id:
            del self.project_groups[group_id]
        group.deleteLater()
        
        # Добавляем проекты обратно как отдельные карточки
        for project in projects:
            self.add_project(project)
        
        # Обновляем сетку и сохраняем
        self.update_grid_layout()
        self.save_projects()
    
    def remove_project_card(self, project_data):
        for i in range(self.all_projects_layout.count()):
            item = self.all_projects_layout.itemAt(i)
            if item and item.widget():
                widget = item.widget()
                if isinstance(widget, ProjectCard) and widget.project_info == project_data:
                    self.all_projects_layout.removeWidget(widget)
                    widget.deleteLater()
                    break
    
    def save_projects(self):
        try:
            projects = []
            groups = {}
            
            # Собираем все проекты и группы
            for i in range(self.all_projects_layout.count()):
                item = self.all_projects_layout.itemAt(i)
                if item and item.widget():
                    widget = item.widget()
                    if isinstance(widget, ProjectCard):
                        projects.append(widget.project_info)
                    elif isinstance(widget, ProjectGroup):
                        group_data = {
                            "name": widget.name,
                            "projects": widget.projects
                        }
                        group_id = None
                        for gid, g in self.project_groups.items():
                            if g == widget:
                                group_id = gid
                                break
                        if group_id:
                            groups[group_id] = group_data
            
            # Сохраняем в файл
            data = {
                "projects": projects,
                "groups": groups
            }
            with open('projects.json', 'w') as f:
                json.dump(data, f, indent=4)
                
        except Exception as e:
            print(f"Error saving projects: {e}")

if __name__ == '__main__':
    try:
        app = QApplication(sys.argv)
        window = MainWindow()
        window.resize(1200, 800)
        window.show()
        sys.exit(app.exec())
    except Exception as e:
        print(f"Error in main: {e}")
        traceback.print_exc() 