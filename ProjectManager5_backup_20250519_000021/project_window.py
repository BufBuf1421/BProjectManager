from PyQt6.QtWidgets import (QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, 
                            QLabel, QPushButton, QTreeWidget, QTreeWidgetItem, 
                            QHeaderView, QMenu, QFileDialog, QMessageBox,
                            QLineEdit, QSplitter, QTreeWidgetItemIterator,
                            QInputDialog)
from PyQt6.QtCore import Qt, QSize, QTimer, QMimeData, QPoint
from PyQt6.QtGui import QIcon, QAction, QPixmap, QDrag, QKeySequence, QShortcut
import os
import shutil
from datetime import datetime
from PIL import Image
import io
from search_panel import SearchPanel
import json

# Создаем класс для элементов дерева с переопределенным методом сравнения
class ProjectTreeItem(QTreeWidgetItem):
    def __lt__(self, other):
        tree = self.treeWidget()
        if not tree:
            return super().__lt__(other)
            
        column = tree.sortColumn()
        
        # Папки всегда должны быть выше файлов
        is_dir_self = os.path.isdir(self.data(0, Qt.ItemDataRole.UserRole))
        is_dir_other = os.path.isdir(other.data(0, Qt.ItemDataRole.UserRole))
        
        if is_dir_self != is_dir_other:
            return is_dir_self
        
        # Сортировка по соответствующему столбцу
        if column == 0:  # Имя
            return self.text(0).lower() < other.text(0).lower()
        elif column in [1, 2]:  # Дата или размер
            return float(self.data(column, Qt.ItemDataRole.UserRole) or 0) < float(other.data(column, Qt.ItemDataRole.UserRole) or 0)
        
        return super().__lt__(other)

class ProjectWindow(QMainWindow):
    def __init__(self, project_info):
        super().__init__()
        self.project_info = project_info
        self.project_path = project_info["path"]
        self.preview_timer = QTimer()
        self.preview_timer.setSingleShot(True)
        self.preview_timer.timeout.connect(self.update_preview)
        self.sort_order = {
            0: Qt.SortOrder.AscendingOrder,  # Имя
            1: Qt.SortOrder.AscendingOrder,  # Дата
            2: Qt.SortOrder.AscendingOrder   # Размер
        }
        
        # Буфер обмена для копирования/перемещения
        self.clipboard = []
        self.clipboard_mode = None  # 'copy' или 'cut'
        
        # Загружаем иконки для интерфейса
        self.expand_icon = QIcon('icons/expand.png')
        self.collapse_icon = QIcon('icons/expand.png')  # Будет повернута программно
        self.add_icon = QIcon('icons/add.png')
        self.folder_icon = QIcon('icons/folder.png')
        
        # Загружаем иконки для разных типов файлов
        self.file_icons = {
            '.blend': QIcon('icons/blend.png'),
            '.spp': QIcon('icons/substance.png'),
            '.fbx': QIcon('icons/model.png'),
            '.obj': QIcon('icons/model.png'),
            '.3ds': QIcon('icons/model.png'),
            '.png': QIcon('icons/image.png'),
            '.jpg': QIcon('icons/image.png'),
            '.jpeg': QIcon('icons/image.png'),
            '.tga': QIcon('icons/image.png'),
            '.psd': QIcon('icons/image.png'),
            '.txt': QIcon('icons/text.png'),
            '.doc': QIcon('icons/document.png'),
            '.docx': QIcon('icons/document.png'),
            '.pdf': QIcon('icons/pdf.png'),
            '.zip': QIcon('icons/archive.png'),
            '.rar': QIcon('icons/archive.png'),
            '.7z': QIcon('icons/archive.png'),
        }
        self.folder_closed_icon = QIcon('icons/folder-closed.png')
        
        self.setWindowTitle(project_info["name"])
        self.resize(1000, 600)
        
        # Создаем центральный виджет
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        layout = QVBoxLayout(central_widget)
        
        # Верхняя панель с названием, поиском и кнопкой настроек
        top_panel = QHBoxLayout()
        
        # Название проекта
        title = QLabel(project_info["name"])
        title.setStyleSheet("""
            font-size: 18px;
            font-weight: bold;
            color: #333333;
        """)
        top_panel.addWidget(title)
        
        # Панель поиска
        self.search_panel = SearchPanel()
        self.search_panel.searchRequested.connect(self.filter_files)
        top_panel.addWidget(self.search_panel)
        
        # Кнопка настроек
        settings_btn = QPushButton("⚙")
        settings_btn.setFixedSize(32, 32)
        settings_btn.setStyleSheet("""
            QPushButton {
                border: none;
                background-color: transparent;
                font-size: 18px;
                color: #666666;
            }
            QPushButton:hover {
                color: #333333;
            }
        """)
        settings_btn.clicked.connect(self.show_project_settings)
        top_panel.addWidget(settings_btn)
        
        layout.addLayout(top_panel)
        
        # Создаем разделитель для дерева файлов и предпросмотра
        splitter = QSplitter(Qt.Orientation.Horizontal)
        
        # Дерево файлов
        self.tree = QTreeWidget()
        self.tree.setHeaderLabels(["Имя", "Дата изменения", "Размер"])
        self.tree.header().setSectionResizeMode(0, QHeaderView.ResizeMode.Stretch)
        self.tree.header().setSectionResizeMode(1, QHeaderView.ResizeMode.Fixed)
        self.tree.header().setSectionResizeMode(2, QHeaderView.ResizeMode.Fixed)
        self.tree.header().setStretchLastSection(False)
        self.tree.header().resizeSection(1, 150)  # Фиксированная ширина для даты
        self.tree.header().resizeSection(2, 100)  # Фиксированная ширина для размера
        self.tree.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self.tree.customContextMenuRequested.connect(self.show_context_menu)
        self.tree.currentItemChanged.connect(self.on_item_selected)
        self.tree.itemClicked.connect(self.on_item_clicked)
        self.tree.header().sectionClicked.connect(self.sort_tree)
        
        # Включаем раскрытие папок одним кликом
        self.tree.setExpandsOnDoubleClick(False)
        self.tree.clicked.connect(self.handle_tree_click)
        
        # Включаем drag & drop
        self.tree.setDragEnabled(True)
        self.tree.setAcceptDrops(True)
        self.tree.setDragDropMode(QTreeWidget.DragDropMode.InternalMove)
        self.tree.dropEvent = self.handleDropEvent
        self.tree.dragEnterEvent = self.handleDragEnterEvent
        
        # Включаем множественное выделение
        self.tree.setSelectionMode(QTreeWidget.SelectionMode.ExtendedSelection)
        
        # Добавляем горячие клавиши
        self.copy_shortcut = QShortcut(QKeySequence.StandardKey.Copy, self)
        self.copy_shortcut.activated.connect(self.copy_selected)
        
        self.cut_shortcut = QShortcut(QKeySequence.StandardKey.Cut, self)
        self.cut_shortcut.activated.connect(self.cut_selected)
        
        self.paste_shortcut = QShortcut(QKeySequence.StandardKey.Paste, self)
        self.paste_shortcut.activated.connect(self.paste_items)
        
        self.tree.setStyleSheet("""
            QTreeWidget {
                border: none;
                background-color: white;
                gridline-color: #e0e0e0;
                show-decoration-selected: 1;
            }
            QTreeWidget::item {
                height: 25px;
                padding: 2px;
                border-bottom: 1px solid #e0e0e0;
                border-right: 1px solid #e0e0e0;
            }
            QTreeWidget::item:!selected {
                color: #000000;
            }
            QTreeWidget::item:selected {
                background-color: #e6f3ff;
                color: #000000;
            }
            QTreeWidget::item:hover {
                background-color: #f5f5f5;
            }
            QHeaderView::section {
                background-color: #f5f5f5;
                padding: 5px;
                border: none;
                border-right: 1px solid #cccccc;
                border-bottom: 1px solid #cccccc;
                color: #000000;
                font-weight: bold;
            }
            QHeaderView::section:hover {
                background-color: #e0e0e0;
            }
        """)
        self.tree.setAlternatingRowColors(True)
        self.tree.setRootIsDecorated(True)
        self.tree.setIndentation(20)
        self.tree.setIconSize(QSize(16, 16))  # Устанавливаем размер иконок
        
        # Добавляем переменную для хранения состояния развернутости папок
        self.expanded_paths = set()
        
        # Виджет предпросмотра
        preview_widget = QWidget()
        preview_layout = QVBoxLayout(preview_widget)
        preview_layout.setContentsMargins(10, 10, 10, 10)
        
        # Метка для изображения
        self.preview_label = QLabel("Выберите файл для просмотра")
        self.preview_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.preview_label.setMinimumWidth(300)
        self.preview_label.setMaximumHeight(300)
        self.preview_label.setStyleSheet("""
            QLabel {
                color: #000000;
                background-color: #f5f5f5;
                border: 1px dashed #cccccc;
                border-radius: 5px;
                padding: 20px;
            }
        """)
        
        # Метка для информации о файле
        self.info_label = QLabel()
        self.info_label.setAlignment(Qt.AlignmentFlag.AlignLeft)
        self.info_label.setStyleSheet("""
            QLabel {
                color: #666666;
                padding: 5px;
                font-size: 11px;
            }
        """)
        self.info_label.hide()
        
        preview_layout.addWidget(self.preview_label)
        preview_layout.addWidget(self.info_label)
        preview_layout.addStretch()
        
        splitter.addWidget(self.tree)
        splitter.addWidget(preview_widget)
        splitter.setStretchFactor(0, 2)
        splitter.setStretchFactor(1, 1)
        
        layout.addWidget(splitter)
        
        # Загружаем структуру файлов
        self.load_project_files()
    
    def filter_files(self, search_params):
        """Фильтрация файлов по заданным параметрам поиска"""
        # Скрываем все элементы
        iterator = QTreeWidgetItemIterator(self.tree)
        while iterator.value():
            item = iterator.value()
            item.setHidden(True)
            iterator += 1
            
        # Если поиск пустой - показываем все
        if not any(search_params.values()):
            iterator = QTreeWidgetItemIterator(self.tree)
            while iterator.value():
                item = iterator.value()
                item.setHidden(False)
                iterator += 1
            return
            
        # Фильтруем по параметрам
        self.filter_tree_items(None, search_params)
        
        # Раскрываем родительские папки найденных элементов
        iterator = QTreeWidgetItemIterator(self.tree)
        while iterator.value():
            item = iterator.value()
            if not item.isHidden():
                parent = item.parent()
                while parent:
                    parent.setHidden(False)
                    parent.setExpanded(True)
                    parent = parent.parent()
            iterator += 1
    
    def filter_tree_items(self, parent_item, search_params):
        """Рекурсивная фильтрация элементов дерева"""
        if parent_item is None:
            items = []
            for i in range(self.tree.topLevelItemCount()):
                items.append(self.tree.topLevelItem(i))
        else:
            items = [parent_item]
        
        for item in items:
            file_path = item.data(0, Qt.ItemDataRole.UserRole)
            show_item = True
            
            # Проверяем текст поиска
            if search_params["text"]:
                text = search_params["text"]
                name = item.text(0)
                if not search_params["case_sensitive"]:
                    text = text.lower()
                    name = name.lower()
                if text not in name:
                    # Если включен поиск по содержимому
                    if search_params["search_content"] and os.path.isfile(file_path):
                        try:
                            with open(file_path, 'r', encoding='utf-8') as f:
                                content = f.read()
                                if not search_params["case_sensitive"]:
                                    content = content.lower()
                                if text not in content:
                                    show_item = False
                        except:
                            show_item = False
                    else:
                        show_item = False
            
            # Проверяем тип файла
            if show_item and search_params["file_type"] != "Все файлы":
                ext = os.path.splitext(file_path)[1].lower()
                if search_params["file_type"] == "Изображения" and ext not in ['.png', '.jpg', '.jpeg', '.tga', '.psd']:
                    show_item = False
                elif search_params["file_type"] == "Документы" and ext not in ['.txt', '.doc', '.docx', '.pdf']:
                    show_item = False
                elif search_params["file_type"] == "3D модели" and ext not in ['.blend', '.fbx', '.obj', '.3ds']:
                    show_item = False
                elif search_params["file_type"] == "Архивы" and ext not in ['.zip', '.rar', '.7z']:
                    show_item = False
            
            # Проверяем даты
            if show_item and os.path.exists(file_path):
                mtime = datetime.fromtimestamp(os.path.getmtime(file_path))
                if mtime.date() < search_params["date_from"] or mtime.date() > search_params["date_to"]:
                    show_item = False
            
            item.setHidden(not show_item)
            
            # Рекурсивно проверяем дочерние элементы
            if item.childCount() > 0:
                for i in range(item.childCount()):
                    self.filter_tree_items(item.child(i), search_params)
    
    def on_item_clicked(self, item, column):
        """Обработчик клика по элементу"""
        if len(self.tree.selectedItems()) == 1:
            self.update_preview_for_item(item)
    
    def on_item_selected(self, current, previous):
        """Обновляем превью при выборе элемента"""
        if not current:
            self.preview_label.setText("Выберите файл для просмотра")
            self.info_label.hide()
            return
            
        # Проверяем, что выбран только один элемент
        if len(self.tree.selectedItems()) != 1:
            return
            
        self.update_preview_for_item(current)
    
    def update_preview_for_item(self, item):
        """Обновляет превью для указанного элемента"""
        if not item:
            return
            
        file_path = item.data(0, Qt.ItemDataRole.UserRole)
        if not os.path.isfile(file_path):
            self.preview_label.setText("Выберите файл для просмотра")
            self.info_label.hide()
            return
            
        # Немедленно обновляем информацию о файле
        self.update_file_info(file_path)
        
        # Немедленно обновляем превью для изображений
        ext = os.path.splitext(file_path)[1].lower()
        if ext in ['.jpg', '.jpeg', '.png', '.bmp', '.gif']:
            self.update_preview()
        else:
            self.preview_label.setText("Предпросмотр недоступен для этого типа файла")
    
    def update_file_info(self, file_path):
        """Обновляет информацию о файле"""
        try:
            size = os.path.getsize(file_path)
            modified = datetime.fromtimestamp(os.path.getmtime(file_path))
            info = f"Имя: {os.path.basename(file_path)}\n"
            info += f"Размер: {self.format_size(size)}\n"
            info += f"Изменен: {modified.strftime('%d.%m.%y %H:%M:%S')}"
            
            # Если это изображение, добавляем информацию о размерах
            ext = os.path.splitext(file_path)[1].lower()
            if ext in ['.jpg', '.jpeg', '.png', '.bmp', '.gif']:
                with Image.open(file_path) as img:
                    info += f"\nРазмеры: {img.width}x{img.height} пикселей"
            
            self.info_label.setText(info)
            self.info_label.show()
        except Exception as e:
            self.info_label.hide()
    
    def update_preview(self):
        """Обновляет превью файла"""
        current = self.tree.currentItem()
        if not current:
            return
            
        file_path = current.data(0, Qt.ItemDataRole.UserRole)
        if not os.path.isfile(file_path):
            return
            
        # Проверяем расширение файла
        ext = os.path.splitext(file_path)[1].lower()
        
        # Обработка изображений
        if ext in ['.jpg', '.jpeg', '.png', '.bmp', '.gif']:
            try:
                with Image.open(file_path) as img:
                    # Создаем копию для превью
                    preview_img = img.copy()
                    # Определяем размер для отображения с сохранением пропорций
                    max_size = (300, 300)
                    preview_img.thumbnail(max_size, Image.Resampling.LANCZOS)
                    
                    # Конвертируем в формат, поддерживаемый Qt
                    img_byte_array = io.BytesIO()
                    preview_img.save(img_byte_array, format=img.format or 'PNG')
                    
                    pixmap = QPixmap()
                    pixmap.loadFromData(img_byte_array.getvalue())
                    
                    # Устанавливаем изображение
                    self.preview_label.setPixmap(pixmap)
                    self.preview_label.setScaledContents(False)
                    
            except Exception as e:
                self.preview_label.setText(f"Ошибка загрузки изображения:\n{str(e)}")
        
        # Обработка текстовых файлов
        elif ext in ['.txt', '.json', '.py', '.cpp', '.h', '.md', '.log', '.ini', '.cfg']:
            try:
                # Читаем первые 1000 символов файла
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read(1000)
                    
                # Если файл больше 1000 символов, добавляем многоточие
                if len(content) == 1000:
                    content += "\n..."
                
                # Форматируем текст для отображения
                self.preview_label.setText(content)
                
                # Устанавливаем моноширинный шрифт для лучшей читаемости кода
                font = self.preview_label.font()
                font.setFamily("Consolas")
                self.preview_label.setFont(font)
                
                # Включаем перенос слов
                self.preview_label.setWordWrap(True)
                
            except UnicodeDecodeError:
                self.preview_label.setText("Файл содержит бинарные данные")
            except Exception as e:
                self.preview_label.setText(f"Ошибка чтения файла:\n{str(e)}")
        
        else:
            self.preview_label.setText("Предпросмотр недоступен для этого типа файла")
    
    def load_project_files(self, parent=None, path=None):
        if path is None:
            # Сохраняем текущее состояние развернутости перед очисткой
            self.save_expanded_state()
            path = self.project_path
            self.tree.clear()
            parent = self.tree
        
        try:
            entries = []
            for entry in os.scandir(path):
                entries.append(entry)
            
            entries.sort(key=lambda x: (not x.is_dir(), x.name.lower()))
            
            for entry in entries:
                item = ProjectTreeItem(parent)
                item.setData(0, Qt.ItemDataRole.UserRole, entry.path)
                
                if entry.is_dir():
                    item.setIcon(0, self.folder_icon)
                    
                    # Создаем виджет-контейнер
                    container = QWidget()
                    container_layout = QHBoxLayout(container)
                    container_layout.setContentsMargins(0, 0, 0, 0)
                    container_layout.setSpacing(9)  # Увеличиваем расстояние между элементами
                    
                    # Добавляем название папки
                    name_label = QLabel(entry.name)
                    name_label.setStyleSheet("""
                        QLabel {
                            color: #000000;
                            padding: 0;
                            margin-left: 4px;  /* Добавляем отступ слева от иконки */
                        }
                    """)
                    
                    # Добавляем кнопку с иконкой
                    add_btn = QPushButton()
                    add_btn.setIcon(self.add_icon)
                    add_btn.setFixedSize(16, 16)
                    add_btn.setStyleSheet("""
                        QPushButton {
                            border: none;
                            background-color: transparent;
                            padding: 0;
                            margin: 0;
                        }
                        QPushButton:hover {
                            background-color: #e0e0e0;
                            border-radius: 8px;
                        }
                    """)
                    add_btn.clicked.connect(lambda checked, path=entry.path: self.add_files_to_folder(path))
                    
                    container_layout.addWidget(name_label)
                    container_layout.addWidget(add_btn)
                    container_layout.addStretch()
                    
                    self.tree.setItemWidget(item, 0, container)
                    
                    # Восстанавливаем состояние развернутости
                    if entry.path in self.expanded_paths:
                        self.tree.expandItem(item)
                    
                    self.load_project_files(item, entry.path)
                else:
                    # Для файлов устанавливаем соответствующую иконку
                    ext = os.path.splitext(entry.name)[1].lower()
                    item.setIcon(0, self.file_icons.get(ext, QIcon('icons/file.png')))
                    item.setText(0, "    " + entry.name)  # Добавляем отступ для имени файла
                    
                    stat = entry.stat()
                    modified_date = datetime.fromtimestamp(stat.st_mtime).strftime("%d.%m.%y %H:%M:%S")
                    size = self.format_size(stat.st_size)
                    
                    item.setText(1, modified_date)
                    item.setText(2, size)
                    item.setData(1, Qt.ItemDataRole.UserRole, stat.st_mtime)
                    item.setData(2, Qt.ItemDataRole.UserRole, stat.st_size)
                    
                    # Устанавливаем выравнивание для колонок
                    item.setTextAlignment(1, Qt.AlignmentFlag.AlignCenter)
                    item.setTextAlignment(2, Qt.AlignmentFlag.AlignCenter)
        
        except Exception as e:
            QMessageBox.warning(self, "Ошибка", f"Не удалось загрузить содержимое папки:\n{str(e)}")
    
    def format_size(self, size):
        for unit in ['б', 'Кб', 'Мб', 'Гб']:
            if size < 1024:
                return f"{size:.0f}{unit}"
            size /= 1024
        return f"{size:.0f}Тб"
    
    def show_context_menu(self, position):
        menu = QMenu()
        selected_items = self.tree.selectedItems()
        
        if not selected_items:
            # Меню для пустого места
            new_folder_action = menu.addAction(QIcon("icons/folder-add.png"), "Создать папку")
            new_folder_action.triggered.connect(lambda: self.create_folder(self.project_path))
            
            import_action = menu.addAction(QIcon("icons/import.png"), "Импортировать файлы")
            import_action.triggered.connect(lambda: self.add_files_to_folder(self.project_path))
            
            if self.clipboard:
                menu.addSeparator()
                paste_action = menu.addAction(QIcon("icons/paste.png"), "Вставить")
                paste_action.triggered.connect(self.paste_items)
        else:
            if len(selected_items) == 1:
                item = selected_items[0]
                file_path = item.data(0, Qt.ItemDataRole.UserRole)
                
                if os.path.isfile(file_path):
                    open_action = menu.addAction(QIcon("icons/open.png"), "Открыть")
                    open_action.triggered.connect(lambda: self.open_file(file_path))
                    
                    open_folder_action = menu.addAction(QIcon("icons/folder.png"), "Открыть папку с файлом")
                    open_folder_action.triggered.connect(lambda: self.open_containing_folder(file_path))
                    
                    rename_action = menu.addAction(QIcon("icons/rename.png"), "Переименовать")
                    rename_action.triggered.connect(lambda: self.rename_item(file_path))
                    
                    menu.addSeparator()
                    
                    ext = os.path.splitext(file_path)[1].lower()
                    if ext in ['.jpg', '.jpeg', '.png', '.bmp', '.gif']:
                        set_preview_action = menu.addAction(QIcon("icons/image.png"), "Установить как превью проекта")
                        set_preview_action.triggered.connect(lambda: self.set_as_project_preview(file_path))
                        menu.addSeparator()
                    
                elif os.path.isdir(file_path):
                    open_folder_action = menu.addAction(QIcon("icons/folder.png"), "Открыть в проводнике")
                    open_folder_action.triggered.connect(lambda: self.open_containing_folder(file_path))
                    
                    new_folder_action = menu.addAction(QIcon("icons/folder-add.png"), "Создать папку")
                    new_folder_action.triggered.connect(lambda: self.create_folder(file_path))
                    
                    import_action = menu.addAction(QIcon("icons/import.png"), "Импортировать файлы")
                    import_action.triggered.connect(lambda: self.add_files_to_folder(file_path))
                    
                    rename_action = menu.addAction(QIcon("icons/rename.png"), "Переименовать")
                    rename_action.triggered.connect(lambda: self.rename_item(file_path))
                    
                    menu.addSeparator()
            
            copy_action = menu.addAction(QIcon("icons/copy.png"), "Копировать")
            cut_action = menu.addAction(QIcon("icons/cut.png"), "Вырезать")
            delete_action = menu.addAction(QIcon("icons/delete.png"), "Удалить")
            
            copy_action.triggered.connect(self.copy_selected)
            cut_action.triggered.connect(self.cut_selected)
            delete_action.triggered.connect(self.delete_selected)
            
            if self.clipboard:
                menu.addSeparator()
                paste_action = menu.addAction(QIcon("icons/paste.png"), "Вставить")
                paste_action.triggered.connect(self.paste_items)
        
        menu.exec(self.tree.viewport().mapToGlobal(position))
    
    def open_containing_folder(self, path):
        """Открывает папку, содержащую файл, в проводнике"""
        if os.path.isfile(path):
            path = os.path.dirname(path)
        os.startfile(path)

    def copy_selected(self):
        """Копирование выделенных элементов в буфер"""
        selected_items = self.tree.selectedItems()
        if not selected_items:
            return
            
        self.clipboard = []
        for item in selected_items:
            path = item.data(0, Qt.ItemDataRole.UserRole)
            if path and os.path.exists(path):
                self.clipboard.append(path)
        
        self.clipboard_mode = 'copy'

    def cut_selected(self):
        """Вырезание выделенных элементов в буфер"""
        self.copy_selected()
        self.clipboard_mode = 'cut'

    def delete_selected(self):
        """Удаление выделенных элементов"""
        selected_items = self.tree.selectedItems()
        if not selected_items:
            return
            
        msg = "выбранные элементы" if len(selected_items) > 1 else "выбранный элемент"
        reply = QMessageBox.question(
            self,
            "Подтверждение удаления",
            f"Вы действительно хотите удалить {msg}?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            QMessageBox.StandardButton.No
        )
        
        if reply == QMessageBox.StandardButton.Yes:
            try:
                for item in selected_items:
                    path = item.data(0, Qt.ItemDataRole.UserRole)
                    if os.path.isfile(path):
                        os.remove(path)
                    elif os.path.isdir(path):
                        shutil.rmtree(path)
                
                self.load_project_files()
            except Exception as e:
                QMessageBox.critical(self, "Ошибка", f"Не удалось удалить:\n{str(e)}")

    def paste_items(self):
        """Вставка элементов из буфера"""
        if not self.clipboard:
            return
            
        # Определяем папку назначения
        selected_items = self.tree.selectedItems()
        if selected_items:
            dest_path = selected_items[0].data(0, Qt.ItemDataRole.UserRole)
            if not os.path.isdir(dest_path):
                dest_path = os.path.dirname(dest_path)
        else:
            dest_path = self.project_path
        
        try:
            for source_path in self.clipboard:
                if not os.path.exists(source_path):
                    continue
                    
                # Формируем путь назначения
                basename = os.path.basename(source_path)
                new_path = os.path.join(dest_path, basename)
                
                # Если файл существует, добавляем номер
                if os.path.exists(new_path):
                    base, ext = os.path.splitext(new_path)
                    counter = 1
                    while os.path.exists(f"{base} ({counter}){ext}"):
                        counter += 1
                    new_path = f"{base} ({counter}){ext}"
                
                # Копируем или перемещаем в зависимости от режима
                if self.clipboard_mode == 'copy':
                    if os.path.isfile(source_path):
                        shutil.copy2(source_path, new_path)
                    else:
                        shutil.copytree(source_path, new_path)
                elif self.clipboard_mode == 'cut':
                    shutil.move(source_path, new_path)
            
            # Очищаем буфер после вырезания
            if self.clipboard_mode == 'cut':
                self.clipboard = []
                self.clipboard_mode = None
            
            self.load_project_files()
        except Exception as e:
            QMessageBox.critical(self, "Ошибка", f"Не удалось выполнить операцию:\n{str(e)}")
    
    def show_project_settings(self):
        # TODO: Реализовать окно настроек проекта
        QMessageBox.information(self, "Настройки проекта", "Здесь будут настройки проекта")
    
    def sort_tree(self, column):
        # Меняем порядок сортировки для текущего столбца
        self.sort_order[column] = Qt.SortOrder.DescendingOrder if self.sort_order[column] == Qt.SortOrder.AscendingOrder else Qt.SortOrder.AscendingOrder
        
        # Сортируем дерево
        self.tree.sortItems(column, self.sort_order[column])
        
        # Устанавливаем индикатор сортировки в заголовке
        for col in range(3):
            if col == column:
                self.tree.headerItem().setIcon(col, QIcon.fromTheme("go-down" if self.sort_order[column] == Qt.SortOrder.DescendingOrder else "go-up"))
            else:
                self.tree.headerItem().setIcon(col, QIcon())
    
    def save_expanded_state(self):
        """Сохраняет состояние развернутости всех папок"""
        self.expanded_paths.clear()
        iterator = QTreeWidgetItemIterator(self.tree)
        while iterator.value():
            item = iterator.value()
            if item.isExpanded():
                path = item.data(0, Qt.ItemDataRole.UserRole)
                if path:
                    self.expanded_paths.add(path)
            iterator += 1
    
    def handle_tree_click(self, index):
        """Обработчик клика по элементу дерева"""
        item = self.tree.itemFromIndex(index)
        if item and index.column() == 0:
            path = item.data(0, Qt.ItemDataRole.UserRole)
            if path and os.path.isdir(path):
                if item.isExpanded():
                    self.tree.collapseItem(item)
                else:
                    self.tree.expandItem(item)
    
    def create_folder(self, parent_path):
        """Создание новой папки"""
        name, ok = QInputDialog.getText(self, "Создать папку", "Введите имя папки:")
        if ok and name:
            try:
                # Проверяем, что имя папки допустимо
                if any(c in r'\/:*?"<>|' for c in name):
                    QMessageBox.warning(self, "Ошибка", "Имя папки содержит недопустимые символы")
                    return
                
                new_folder_path = os.path.join(parent_path, name)
                if os.path.exists(new_folder_path):
                    QMessageBox.warning(self, "Ошибка", "Папка с таким именем уже существует")
                    return
                
                os.makedirs(new_folder_path)
                self.load_project_files()
            except Exception as e:
                QMessageBox.critical(self, "Ошибка", f"Не удалось создать папку:\n{str(e)}")

    def handleDragEnterEvent(self, event):
        """Обработка начала перетаскивания файлов из системы"""
        if event.mimeData().hasUrls():
            event.acceptProposedAction()
    
    def handleDropEvent(self, event):
        """Обработка перетаскивания файлов из системы"""
        # Получаем целевую папку
        drop_item = self.tree.itemAt(self.tree.viewport().mapFrom(self, event.position().toPoint()))
        target_path = self.project_path
        
        if drop_item:
            item_path = drop_item.data(0, Qt.ItemDataRole.UserRole)
            if os.path.isdir(item_path):
                target_path = item_path
            else:
                target_path = os.path.dirname(item_path)
        
        # Копируем файлы
        for url in event.mimeData().urls():
            file_path = url.toLocalFile()
            if os.path.exists(file_path):
                try:
                    if os.path.isfile(file_path):
                        # Копируем файл
                        file_name = os.path.basename(file_path)
                        dest_path = os.path.join(target_path, file_name)
                        
                        # Проверяем существование файла
                        if os.path.exists(dest_path):
                            base, ext = os.path.splitext(file_name)
                            counter = 1
                            while os.path.exists(os.path.join(target_path, f"{base}_{counter}{ext}")):
                                counter += 1
                            dest_path = os.path.join(target_path, f"{base}_{counter}{ext}")
                        
                        shutil.copy2(file_path, dest_path)
                    elif os.path.isdir(file_path):
                        # Копируем папку
                        dir_name = os.path.basename(file_path)
                        dest_path = os.path.join(target_path, dir_name)
                        
                        # Проверяем существование папки
                        if os.path.exists(dest_path):
                            counter = 1
                            while os.path.exists(os.path.join(target_path, f"{dir_name}_{counter}")):
                                counter += 1
                            dest_path = os.path.join(target_path, f"{dir_name}_{counter}")
                        
                        shutil.copytree(file_path, dest_path)
                except Exception as e:
                    QMessageBox.warning(
                        self,
                        "Ошибка копирования",
                        f"Не удалось скопировать {os.path.basename(file_path)}:\n{str(e)}",
                        QMessageBox.StandardButton.Ok
                    )
        
        # Обновляем отображение
        self.load_project_files()
        event.acceptProposedAction()

    def set_as_project_preview(self, image_path):
        """Устанавливает выбранное изображение как превью проекта"""
        try:
            # Загружаем и масштабируем изображение
            with Image.open(image_path) as img:
                # Определяем размер для превью с сохранением пропорций
                max_size = (264, 148)
                img.thumbnail(max_size, Image.Resampling.LANCZOS)
                
                # Путь для превью
                preview_path = os.path.join(self.project_path, "preview.png")
                
                # Сохраняем превью
                img.save(preview_path, "PNG")
                
                # Помечаем что превью установлено вручную
                metadata_path = os.path.join(self.project_path, "project_info.json")
                try:
                    with open(metadata_path, 'r', encoding='utf-8') as f:
                        project_info = json.load(f)
                except:
                    project_info = {}
                
                project_info["custom_preview"] = True
                project_info["preview_source"] = image_path
                
                with open(metadata_path, 'w', encoding='utf-8') as f:
                    json.dump(project_info, f, indent=4, ensure_ascii=False)
                
        except Exception as e:
            QMessageBox.critical(
                self,
                "Ошибка",
                f"Не удалось установить превью:\n{str(e)}",
                QMessageBox.StandardButton.Ok
            )

    def add_files_to_folder(self, folder_path):
        """Добавляет файлы в указанную папку проекта"""
        try:
            # Открываем диалог выбора файлов
            files, _ = QFileDialog.getOpenFileNames(
                self,
                "Выберите файлы для добавления",
                "",
                "Все файлы (*.*);;"
                "Изображения (*.png *.jpg *.jpeg *.bmp *.gif);;"
                "3D модели (*.blend *.fbx *.obj *.3ds);;"
                "Текстуры (*.spp *.psd *.tga);;"
                "Документы (*.txt *.doc *.docx *.pdf)"
            )
            
            if not files:
                return
                
            # Копируем каждый выбранный файл
            for source_path in files:
                try:
                    # Получаем имя файла
                    file_name = os.path.basename(source_path)
                    dest_path = os.path.join(folder_path, file_name)
                    
                    # Если файл с таким именем уже существует, добавляем номер
                    if os.path.exists(dest_path):
                        base, ext = os.path.splitext(file_name)
                        counter = 1
                        while os.path.exists(os.path.join(folder_path, f"{base}_{counter}{ext}")):
                            counter += 1
                        dest_path = os.path.join(folder_path, f"{base}_{counter}{ext}")
                    
                    # Копируем файл
                    shutil.copy2(source_path, dest_path)
                    
                except Exception as e:
                    QMessageBox.warning(
                        self,
                        "Ошибка копирования",
                        f"Не удалось скопировать файл {file_name}:\n{str(e)}",
                        QMessageBox.StandardButton.Ok
                    )
            
            # Обновляем отображение файлов
            self.load_project_files()
            
        except Exception as e:
            QMessageBox.critical(
                self,
                "Ошибка",
                f"Не удалось добавить файлы:\n{str(e)}",
                QMessageBox.StandardButton.Ok
            )

    def rename_item(self, path):
        """Переименование файла или папки"""
        old_name = os.path.basename(path)
        new_name, ok = QInputDialog.getText(
            self,
            "Переименовать",
            "Введите новое имя:",
            text=old_name
        )
        
        if ok and new_name and new_name != old_name:
            try:
                # Проверяем корректность имени
                if any(c in r'\/:*?"<>|' for c in new_name):
                    QMessageBox.warning(
                        self,
                        "Ошибка",
                        "Имя содержит недопустимые символы"
                    )
                    return
                
                # Формируем новый путь
                new_path = os.path.join(os.path.dirname(path), new_name)
                
                # Проверяем существование файла с таким именем
                if os.path.exists(new_path):
                    QMessageBox.warning(
                        self,
                        "Ошибка",
                        "Файл или папка с таким именем уже существует"
                    )
                    return
                
                # Переименовываем
                os.rename(path, new_path)
                
                # Если это был файл превью проекта, обновляем информацию о нем
                if os.path.isfile(path):
                    metadata_path = os.path.join(self.project_path, "project_info.json")
                    try:
                        with open(metadata_path, 'r', encoding='utf-8') as f:
                            project_info = json.load(f)
                            if project_info.get("preview_source") == path:
                                project_info["preview_source"] = new_path
                                with open(metadata_path, 'w', encoding='utf-8') as f:
                                    json.dump(project_info, f, indent=4, ensure_ascii=False)
                    except:
                        pass
                
                # Обновляем отображение
                self.load_project_files()
                
            except Exception as e:
                QMessageBox.critical(
                    self,
                    "Ошибка",
                    f"Не удалось переименовать:\n{str(e)}"
                )

 