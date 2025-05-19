import os
import sys

print("Запуск main.py")
print(f"Текущая директория: {os.getcwd()}")
print(f"Путь к Python: {sys.executable}")
print(f"Версия Python: {sys.version}")
print(f"sys.path: {sys.path}")

# Добавляем текущую директорию в путь поиска модулей
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)
    print(f"Добавлен путь в sys.path: {current_dir}")

# Настраиваем окружение Python перед импортом других модулей
print("Импорт python_setup...")
try:
    from python_setup import setup_python_env
    print("Модуль python_setup успешно импортирован")
except ImportError as e:
    print(f"Ошибка импорта python_setup: {e}")
    print("Содержимое текущей директории:")
    for item in os.listdir(current_dir):
        print(f"  {item}")
    sys.exit(1)

print("Настройка окружения...")
if not setup_python_env():
    print("Ошибка: Не удалось настроить окружение Python")
    sys.exit(1)

print("Импорт необходимых модулей...")
try:
    import traceback
    import json
    import zipfile
    import shutil
    from datetime import datetime
    from PyQt6.QtWidgets import (QApplication, QMainWindow, QWidget, QPushButton,
                               QVBoxLayout, QHBoxLayout, QLabel, QFrame, QLineEdit,
                               QScrollArea, QDialog, QGridLayout, QFileDialog, QMessageBox)
    from PyQt6.QtCore import Qt
    from PyQt6.QtGui import QPainter, QPen, QColor
    from settings_dialog import SettingsDialog
    from create_project_dialog import CreateProjectDialog
    from project_card import ProjectCard
    from project_group import ProjectGroup
    from project_window import ProjectWindow
    from styles import (MAIN_WINDOW_STYLE, RIGHT_PANEL_STYLE, 
                       SECTION_TITLE_STYLE, PROJECT_CARD_STYLE,
                       SCROLL_AREA_STYLE, SIZES)
    print("Импорт PyQt6 успешен")
except ImportError as e:
    print(f"Ошибка импорта: {e}")
    print("Полный стек ошибки:")
    traceback.print_exc()
    sys.exit(1)

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
        
        # Включаем поддержку перетаскивания
        self.setAcceptDrops(True)
        
        # Создаем левую часть (основную область)
        left_widget = QWidget()
        left_layout = QVBoxLayout(left_widget)
        left_layout.setSpacing(20)
        
        # Верхняя панель с кнопками и поиском
        top_panel = QHBoxLayout()
        new_project_btn = QPushButton("Создать проект")
        new_project_btn.clicked.connect(self.show_create_project_dialog)
        import_btn = QPushButton("Импорт проекта")
        import_btn.clicked.connect(self.import_project)
        plans_btn = QPushButton("Планы")
        self.search_input = QLineEdit()
        self.search_input.setPlaceholderText("Поиск проектов...")
        self.search_input.textChanged.connect(self.filter_projects)
        settings_btn = QPushButton("⚙")
        settings_btn.setFixedSize(40, 40)
        settings_btn.clicked.connect(self.show_settings)
        
        top_panel.addWidget(new_project_btn)
        top_panel.addWidget(import_btn)
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
        # Учитываем фиксированную ширину карточки и отступы
        card_width = int(SIZES['card_width'].replace('px', ''))
        max_cols = max(1, (scroll_width - self.card_spacing) // (card_width + self.card_spacing))
        
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
        dialog.settings_changed.connect(self.on_settings_changed)
        dialog.exec()
    
    def on_settings_changed(self, settings):
        """Обработчик изменения настроек"""
        # Перезагружаем проекты при изменении пути к проектам
        self.reload_projects()
    
    def reload_projects(self):
        """Перезагружает все карточки проектов"""
        # Удаляем все существующие карточки
        while self.all_projects_layout.count():
            item = self.all_projects_layout.takeAt(0)
            if item.widget():
                item.widget().deleteLater()
        
        # Очищаем избранное
        while self.favorites_layout.count():
            item = self.favorites_layout.takeAt(0)
            if item.widget():
                item.widget().deleteLater()
        
        # Очищаем группы
        self.project_groups.clear()
        
        # Загружаем проекты заново
        try:
            if os.path.exists('projects.json'):
                with open('projects.json', 'r') as f:
                    projects_data = json.load(f)
                    
                    # Загружаем отдельные проекты
                    for project in projects_data.get('projects', []):
                        self.add_project(project)
                    
                    # Загружаем группы
                    for group_data in projects_data.get('groups', []):
                        self.create_project_group(group_data['name'], group_data['projects'])
        except Exception as e:
            print(f"Error reloading projects: {e}")
        
        # Обновляем сетку
        self.update_grid_layout()
    
    def show_create_project_dialog(self):
        dialog = CreateProjectDialog(self)
        if dialog.exec() and dialog.project_data:
            self.add_project(dialog.project_data)
            self.save_projects()
    
    def restore_missing_projects(self):
        """Восстанавливает проекты, которые есть в файловой системе, но отсутствуют в интерфейсе"""
        try:
            # Получаем список всех проектов из файловой системы
            projects_dir = os.path.expanduser("~/Documents/Projects5")
            if not os.path.exists(projects_dir):
                return
            
            # Собираем все существующие пути проектов
            existing_paths = set()
            for i in range(self.all_projects_layout.count()):
                item = self.all_projects_layout.itemAt(i)
                if item and item.widget():
                    widget = item.widget()
                    if isinstance(widget, ProjectCard):
                        existing_paths.add(widget.project_info["path"])
                    elif isinstance(widget, ProjectGroup):
                        for project in widget.projects:
                            existing_paths.add(project["path"])
            
            # Проверяем каждую папку в директории проектов
            for project_name in os.listdir(projects_dir):
                project_path = os.path.join(projects_dir, project_name).replace("\\", "/")
                if os.path.isdir(project_path) and project_path not in existing_paths:
                    # Создаем новую информацию о проекте
                    project_info = {
                        "name": project_name,
                        "path": project_path,
                        "created": os.path.getctime(project_path),
                        "favorite": False
                    }
                    # Добавляем проект
                    self.add_project(project_info)
            
            # Сохраняем изменения
            self.save_projects()
            
        except Exception as e:
            print(f"Error in restore_missing_projects: {e}")
            traceback.print_exc()

    def load_projects(self):
        try:
            # Очищаем существующие проекты и группы
            self.clear_projects()
            self.project_groups.clear()
            
            # Получаем путь к каталогу проектов
            projects_dir = os.path.expanduser("~/Documents/Projects5")
            if not os.path.exists(projects_dir):
                return
            
            # Словарь для хранения информации о проектах
            projects_info = {}
            groups_info = {}
            
            # Список служебных папок, которые нужно исключить
            excluded_dirs = {'backups', 'archives', 'exports', '.temp_archive'}
            
            # Сканируем каталог проектов
            for project_name in os.listdir(projects_dir):
                if project_name in excluded_dirs:
                    continue
                    
                project_path = os.path.join(projects_dir, project_name).replace("\\", "/")
                if not os.path.isdir(project_path):
                    continue
                
                # Путь к файлу с информацией о проекте
                info_file = os.path.join(project_path, "project_info.json")
                
                try:
                    if os.path.exists(info_file):
                        # Загружаем существующую информацию
                        with open(info_file, 'r', encoding='utf-8') as f:
                            project_info = json.load(f)
                    else:
                        # Создаем новую информацию о проекте
                        project_info = {
                            "name": project_name,
                            "path": project_path,
                            "created": os.path.getctime(project_path),
                            "favorite": False,
                            "description": "",
                            "tags": [],
                            "last_modified": os.path.getmtime(project_path)
                        }
                        # Сохраняем информацию в файл
                        with open(info_file, 'w', encoding='utf-8') as f:
                            json.dump(project_info, f, indent=4, ensure_ascii=False)
                    
                    projects_info[project_path] = project_info
                    
                except Exception as e:
                    print(f"Error processing project {project_path}: {e}")
                    continue
            
            # Загружаем информацию о группах, если она есть
            groups_file = os.path.join(projects_dir, "groups.json")
            if os.path.exists(groups_file):
                try:
                    with open(groups_file, 'r', encoding='utf-8') as f:
                        groups_info = json.load(f)
                except:
                    groups_info = {}
            
            # Создаем группы
            for group_id, group_data in groups_info.items():
                # Проверяем существование всех проектов группы
                valid_projects = []
                for project in group_data["projects"]:
                    if project["path"] in projects_info:
                        valid_projects.append(projects_info[project["path"]])
                        del projects_info[project["path"]]  # Удаляем из словаря, чтобы не создавать отдельную карточку
                
                if valid_projects:
                    self.create_project_group(group_data["name"], valid_projects)
            
            # Создаем карточки для оставшихся проектов
            for project_info in sorted(projects_info.values(), key=lambda x: x["created"], reverse=True):
                self.add_project(project_info)
            
            # Обновляем сетку
            self.update_grid_layout()
            
        except Exception as e:
            print(f"Error loading projects: {e}")
            traceback.print_exc()
    
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
        # Удаляем проекты из других групп
        for project in projects:
            # Удаляем из групп
            for group in self.project_groups.values():
                if project in group.projects:
                    group.remove_project(project)
            # Удаляем отдельные карточки
            self.remove_project_card(project)
        
        # Создаем новую группу
        group = ProjectGroup(name, projects)
        group.deleted.connect(self.ungroup_projects)
        group.project_clicked.connect(self.open_project)
        group.group_changed.connect(self.save_projects)
        group.group_created.connect(self.create_project_group)
        
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
        # Ищем карточку проекта во всех ячейках сетки
        for row in range(self.all_projects_layout.rowCount()):
            for col in range(self.all_projects_layout.columnCount()):
                item = self.all_projects_layout.itemAtPosition(row, col)
                if item and item.widget():
                    widget = item.widget()
                    if isinstance(widget, ProjectCard) and widget.project_info == project_data:
                        # Удаляем виджет из layout
                        self.all_projects_layout.removeWidget(widget)
                        widget.deleteLater()
                        # Обновляем сетку
                        self.update_grid_layout()
                        return True
        return False
    
    def save_projects(self):
        try:
            projects_dir = os.path.expanduser("~/Documents/Projects5")
            if not os.path.exists(projects_dir):
                return
            
            # Сохраняем информацию о группах
            groups_data = {}
            for group_id, group in self.project_groups.items():
                groups_data[group_id] = {
                    "name": group.name,
                    "projects": group.projects
                }
            
            # Сохраняем информацию о группах в отдельный файл
            groups_file = os.path.join(projects_dir, "groups.json")
            with open(groups_file, 'w', encoding='utf-8') as f:
                json.dump(groups_data, f, indent=4, ensure_ascii=False)
            
            # Обновляем информацию о проектах
            for i in range(self.all_projects_layout.count()):
                item = self.all_projects_layout.itemAt(i)
                if item and item.widget():
                    widget = item.widget()
                    if isinstance(widget, ProjectCard):
                        self._save_project_info(widget.project_info)
                    elif isinstance(widget, ProjectGroup):
                        for project in widget.projects:
                            self._save_project_info(project)
                            
        except Exception as e:
            print(f"Error saving projects: {e}")
            traceback.print_exc()
    
    def _save_project_info(self, project_info):
        """Сохраняет информацию о проекте в его project_info.json"""
        try:
            info_file = os.path.join(project_info["path"], "project_info.json")
            # Обновляем время последнего изменения
            project_info["last_modified"] = os.path.getmtime(project_info["path"])
            with open(info_file, 'w', encoding='utf-8') as f:
                json.dump(project_info, f, indent=4, ensure_ascii=False)
        except Exception as e:
            print(f"Error saving project info for {project_info['path']}: {e}")

    def dragEnterEvent(self, event):
        if event.mimeData().hasText():
            event.acceptProposedAction()
        else:
            event.ignore()

    def dropEvent(self, event):
        if event.mimeData().hasText():
            try:
                # Получаем данные о проекте
                project_data = eval(event.mimeData().text())
                
                # Сначала удаляем проект из всех групп
                # Создаем копию списка групп для безопасной итерации
                groups_to_check = list(self.project_groups.values())
                for group in groups_to_check:
                    if project_data in group.projects:
                        group.remove_project(project_data)
                
                # Проверяем, не находится ли проект уже в основной области
                for i in range(self.all_projects_layout.count()):
                    item = self.all_projects_layout.itemAt(i)
                    if item and item.widget():
                        widget = item.widget()
                        if isinstance(widget, ProjectCard) and widget.project_info == project_data:
                            event.ignore()
                            return
                
                # Добавляем проект в основную область
                self.add_project(project_data)
                event.acceptProposedAction()
                
                # Сохраняем изменения
                self.save_projects()
            except Exception as e:
                print(f"Error in dropEvent: {e}")
                traceback.print_exc()  # Добавляем вывод полного стека ошибки
                event.ignore()
        else:
            event.ignore()

    def dragMoveEvent(self, event):
        if event.mimeData().hasText():
            event.acceptProposedAction()
        else:
            event.ignore()

    def import_project(self):
        """Импортирует проект из архива"""
        try:
            # Открываем диалог выбора архива
            archive_path, _ = QFileDialog.getOpenFileName(
                self,
                "Выберите архив проекта для импорта",
                "",
                "Архивы проектов (*.zip)"
            )
            
            if not archive_path:
                return
            
            print(f"Выбран архив: {archive_path}")
            
            # Создаем временную папку для распаковки
            temp_dir = os.path.join(os.path.expanduser("~/Documents/Projects5"), ".temp_import")
            if os.path.exists(temp_dir):
                shutil.rmtree(temp_dir)
            os.makedirs(temp_dir)
            print(f"Создана временная папка: {temp_dir}")
            
            try:
                # Распаковываем архив во временную папку
                with zipfile.ZipFile(archive_path, 'r') as zipf:
                    print(f"Содержимое архива: {zipf.namelist()}")
                    zipf.extractall(temp_dir)
                
                # Проверяем наличие файла с метаданными
                project_info_path = os.path.join(temp_dir, "project_info.json")
                if not os.path.exists(project_info_path):
                    raise Exception("Архив не содержит информации о проекте (project_info.json)")
                
                # Читаем метаданные проекта
                with open(project_info_path, 'r', encoding='utf-8') as f:
                    project_info = json.load(f)
                    print(f"Прочитанные метаданные: {project_info}")
                
                # Создаем новый путь для проекта
                projects_dir = os.path.expanduser("~/Documents/Projects5")
                
                # Получаем имя проекта из архива или из имени архива
                if "name" in project_info:
                    project_name = project_info["name"]
                else:
                    # Извлекаем имя из имени архива
                    project_name = os.path.basename(archive_path)
                    if project_name.endswith('.zip'):
                        project_name = project_name[:-4]
                    if '_archive_' in project_name:
                        project_name = project_name.split('_archive_')[0]
                
                print(f"Имя проекта: {project_name}")
                new_project_path = os.path.join(projects_dir, project_name)
                
                # Проверяем, не существует ли уже проект с таким именем
                if os.path.exists(new_project_path):
                    # Добавляем к имени timestamp
                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                    project_name = f"{project_name}_{timestamp}"
                    new_project_path = os.path.join(projects_dir, project_name)
                    print(f"Создано новое имя проекта: {project_name}")
                
                # Перемещаем содержимое временной папки в новую папку проекта
                print(f"Перемещение в: {new_project_path}")
                shutil.move(temp_dir, new_project_path)
                
                # Создаем или обновляем информацию о проекте
                project_info = {
                    "name": project_name,
                    "path": new_project_path.replace("\\", "/"),
                    "created": datetime.now().timestamp(),
                    "favorite": False,
                    "description": project_info.get("description", ""),
                    "tags": project_info.get("tags", []),
                    "last_modified": datetime.now().timestamp()
                }
                
                print(f"Новые метаданные проекта: {project_info}")
                
                # Сохраняем обновленную информацию о проекте
                with open(os.path.join(new_project_path, "project_info.json"), 'w', encoding='utf-8') as f:
                    json.dump(project_info, f, indent=4, ensure_ascii=False)
                
                # Добавляем проект в интерфейс
                self.add_project(project_info)
                self.save_projects()
                
                QMessageBox.information(
                    self,
                    "Импорт проекта",
                    f"Проект успешно импортирован как:\n{project_name}",
                    QMessageBox.StandardButton.Ok
                )
                
            except Exception as e:
                print(f"Ошибка при импорте: {e}")
                # Очищаем временную папку в случае ошибки
                if os.path.exists(temp_dir):
                    shutil.rmtree(temp_dir)
                raise
            
        except Exception as e:
            print(f"Критическая ошибка при импорте: {e}")
            QMessageBox.critical(
                self,
                "Ошибка импорта",
                f"Не удалось импортировать проект:\n{str(e)}",
                QMessageBox.StandardButton.Ok
            )

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