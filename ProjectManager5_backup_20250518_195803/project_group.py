from PyQt6.QtWidgets import (QFrame, QVBoxLayout, QLabel, QHBoxLayout, 
                            QPushButton, QMessageBox, QWidget, QMenu, QSizePolicy,
                            QInputDialog, QApplication, QGridLayout, QScrollArea, QLineEdit)
from PyQt6.QtCore import (pyqtSignal, QSize, Qt, QPoint, QTimer, QPropertyAnimation, 
                       QEasingCurve, QRect)
from PyQt6.QtGui import (QPixmap, QPainter, QCursor, QAction, QPalette, QColor)
from styles import PROJECT_CARD_STYLES, GROUP_CARD_STYLES, COLORS, SIZES
from project_card import ProjectCard
import traceback

class GroupPopup(QWidget):
    name_changed = pyqtSignal(str)  # Сигнал для уведомления об изменении имени
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setWindowFlags(Qt.WindowType.Popup | Qt.WindowType.FramelessWindowHint)
        
        # Основной layout
        self.layout = QVBoxLayout(self)
        self.layout.setSpacing(24)
        self.layout.setContentsMargins(32, 32, 32, 32)
        
        # Заголовок
        self.header = QWidget()
        self.header_layout = QHBoxLayout(self.header)
        self.header_layout.setContentsMargins(0, 0, 0, 16)
        
        # Поле ввода для названия
        self.title = QLineEdit()
        self.title.setStyleSheet(f"""
            QLineEdit {{
                color: {COLORS['text_light']};
                font-size: 24px;
                font-weight: bold;
                background: transparent;
                border: none;
                border-radius: 8px;
                padding: 4px 8px;
            }}
            QLineEdit:hover, QLineEdit:focus {{
                background: rgba(255, 255, 255, 0.1);
            }}
        """)
        self.title.setMinimumWidth(300)
        self.title.setClearButtonEnabled(False)
        self.title.setPlaceholderText("Введите название группы")
        self.title.editingFinished.connect(self._on_name_changed)
        self.header_layout.addWidget(self.title)
        
        # Кнопка закрытия
        self.close_btn = QPushButton("×")
        self.close_btn.setFixedSize(32, 32)
        self.close_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.close_btn.setStyleSheet(f"""
            QPushButton {{
                background: rgba(255, 255, 255, 0.1);
                color: {COLORS['text_light']};
                font-size: 24px;
                border: none;
                border-radius: 16px;
                margin: 0px;
                padding: 0px;
                text-align: center;
                line-height: 32px;
            }}
            QPushButton:hover {{
                background: rgba(255, 255, 255, 0.2);
            }}
        """)
        self.header_layout.addWidget(self.close_btn)
        self.layout.addWidget(self.header)
        
        # Контейнер для карточек
        self.grid = QWidget()
        self.grid.setObjectName("scrollContent")
        self.grid_layout = QGridLayout(self.grid)
        self.grid_layout.setSpacing(20)
        self.grid_layout.setContentsMargins(0, 0, 0, 0)
        self.grid_layout.setAlignment(Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignTop)
        self.layout.addWidget(self.grid)
        
        # Создаем виджет-подложку для фона
        self.background = QFrame(self)
        self.background.setObjectName("background")
        self.background.setStyleSheet(f"""
            QFrame#background {{
                background: {COLORS['background']};
                border-radius: {SIZES['radius_large']};
                border: 1px solid {COLORS['text_light']};
            }}
        """)
        self.background.lower()
        
        # Настройка внешнего вида
        self.setStyleSheet("""
            GroupPopup {
                background: transparent;
            }
        """)
        
        # Добавляем анимацию
        self.animation = QPropertyAnimation(self, b"geometry")
        self.animation.setDuration(300)
        self.animation.setEasingCurve(QEasingCurve.Type.OutCubic)
        
        # Подключаем сигналы
        self.close_btn.clicked.connect(self.hide)

    def resizeEvent(self, event):
        """Обработчик изменения размера для обновления фона"""
        super().resizeEvent(event)
        self.background.setGeometry(self.rect())

    def calculate_size(self):
        """Рассчитывает необходимый размер попапа"""
        # Получаем размер экрана
        screen = QApplication.primaryScreen().availableGeometry()
        
        # Рассчитываем размер попапа на основе количества карточек
        cards_count = self.grid_layout.count()
        cols = min(3, max(1, cards_count))  # Минимум 1, максимум 3 колонки
        rows = (cards_count + 2) // 3  # Округляем вверх
        
        # Получаем размеры карточки из констант
        card_width = int(SIZES['card_width'].replace('px', ''))
        card_height = int(SIZES['card_min_height'].replace('px', ''))
        
        # Рассчитываем размеры контента
        content_width = cols * card_width + (cols - 1) * 20  # Ширина карточек + отступы между ними
        content_height = rows * card_height + (rows - 1) * 20  # Высота карточек + отступы между ними
        
        # Добавляем отступы для заголовка и полей
        popup_width = content_width + 64  # 32px отступ слева и справа
        popup_height = content_height + 140  # 32px сверху и снизу + 76px для заголовка
        
        # Рассчитываем позицию (по центру экрана)
        x = (screen.width() - popup_width) // 2
        y = (screen.height() - popup_height) // 2
        
        return QRect(x, y, popup_width, popup_height)
        
    def animate_resize(self):
        """Анимированное изменение размера попапа"""
        if not self.isVisible():
            return
            
        # Отключаем предыдущие соединения
        try:
            self.animation.finished.disconnect()
        except:
            pass
            
        # Получаем текущую и целевую геометрию
        current_geometry = self.geometry()
        target_geometry = self.calculate_size()
        
        # Настраиваем анимацию
        self.animation.setStartValue(current_geometry)
        self.animation.setEndValue(target_geometry)
        
        # Запускаем анимацию
        self.animation.start()

    def show(self):
        """Показывает попап с анимацией"""
        # Отключаем предыдущие соединения, если они были
        try:
            self.animation.finished.disconnect()
        except:
            pass
            
        # Получаем целевую геометрию
        final_geometry = self.calculate_size()
        
        # Начальная геометрия (уменьшенная и смещенная вверх)
        start_x = int(final_geometry.x() + final_geometry.width() * 0.1)
        start_width = int(final_geometry.width() * 0.8)
        start_height = int(final_geometry.height() * 0.8)
        
        start_geometry = QRect(
            start_x,
            final_geometry.y() - 50,
            start_width,
            start_height
        )
        
        # Настраиваем анимацию
        self.setGeometry(start_geometry)
        self.animation.setStartValue(start_geometry)
        self.animation.setEndValue(final_geometry)
        
        # Показываем виджет и запускаем анимацию
        super().show()
        self.animation.start()

    def hide(self):
        """Скрывает попап с анимацией"""
        # Отключаем предыдущие соединения, если они были
        try:
            self.animation.finished.disconnect()
        except:
            pass
            
        current_geometry = self.geometry()
        
        # Конечная геометрия (уменьшенная и смещенная вверх)
        end_x = int(current_geometry.x() + current_geometry.width() * 0.1)
        end_width = int(current_geometry.width() * 0.8)
        end_height = int(current_geometry.height() * 0.8)
        
        end_geometry = QRect(
            end_x,
            current_geometry.y() - 50,
            end_width,
            end_height
        )
        
        # Настраиваем анимацию
        self.animation.setStartValue(current_geometry)
        self.animation.setEndValue(end_geometry)
        
        # Подключаем сигнал завершения анимации к закрытию
        def finish_hide():
            super(GroupPopup, self).hide()
            try:
                self.animation.finished.disconnect(finish_hide)
            except:
                pass
                
        self.animation.finished.connect(finish_hide)
        
        # Запускаем анимацию
        self.animation.start()

    def mousePressEvent(self, event):
        # Предотвращаем закрытие при клике внутри попапа
        event.accept()

    def _on_name_changed(self):
        """Обработчик изменения имени группы"""
        new_name = self.title.text().strip()
        if new_name:
            self.name_changed.emit(new_name)

    def set_title(self, title):
        """Устанавливает название группы"""
        self.title.setText(title)

class ProjectGroup(QFrame):
    deleted = pyqtSignal(list)  # Сигнал для уведомления об удалении группы
    project_clicked = pyqtSignal(dict)  # Сигнал для открытия проекта
    group_changed = pyqtSignal()  # Сигнал для уведомления об изменении группы
    group_created = pyqtSignal(str, list)  # Сигнал для создания новой группы
    
    def __init__(self, name="Новая группа", projects=None, parent=None):
        super().__init__(parent)
        self.projects = projects or []
        self.name = name
        
        # Настраиваем внешний вид
        self.setObjectName("project_group")
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)  # Делаем фон прозрачным
        
        # Добавляем отступы для теней (по 16px с каждой стороны)
        self.setFixedHeight(180 + 16)  # Высота контента + отступ для теней снизу
        self.setFixedWidth(250 + 16)   # Ширина контента + отступ для теней справа
        
        # Создаем основной контейнер
        self.content = QFrame(self)
        self.content.setObjectName("content_frame")
        self.content.setFixedHeight(180)
        self.content.setFixedWidth(250)
        # Позиционируем контент с учетом теней слева и сверху
        self.content.move(0, 0)
        
        # Основной layout
        self.layout = QVBoxLayout(self.content)
        self.layout.setSpacing(8)
        self.layout.setContentsMargins(12, 12, 12, 12)
        
        # Название группы
        self.name_label = QLabel(self.name)
        self.name_label.setObjectName("title")
        self.name_label.setStyleSheet(f"""
            color: {COLORS['text_primary']};
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 4px;
        """)
        self.layout.addWidget(self.name_label)
        
        # Количество проектов
        self.count_label = QLabel()
        self.count_label.setStyleSheet(f"""
            color: {COLORS['text_secondary']};
            font-size: 14px;
            margin-bottom: 8px;
        """)
        self.layout.addWidget(self.count_label)
        
        # Растягивающийся спейсер
        self.layout.addStretch()
        
        # Создаем попап
        self.popup = GroupPopup()
        self.popup.set_title(self.name)
        self.popup.close_btn.clicked.connect(self.close_popup)
        self.popup.name_changed.connect(self._on_name_changed)
        
        # Создаем карточки проектов
        self.project_cards = []
        for project in self.projects:
            self._create_card(project)
        
        # Обновляем информацию и внешний вид
        self.update_info()
        
        # Настройка для приема drop
        self.setAcceptDrops(True)
        
        # Добавляем обработку кликов
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        
        # Контекстное меню
        self.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self.customContextMenuRequested.connect(self.show_context_menu)

    def _create_card(self, project):
        """Создание карточки проекта"""
        card = ProjectCard(project)
        # Устанавливаем размер карточки в соответствии с размерами из styles.py
        card_width = int(SIZES['card_width'].replace('px', ''))
        card_height = int(SIZES['card_min_height'].replace('px', ''))
        card.setFixedSize(card_width, card_height)
        
        card.deleted.connect(lambda p: self.remove_project(p))
        card.project_clicked.connect(self.project_clicked.emit)
        card.dragged_out.connect(self.handle_project_dragged)
        card.drag_finished.connect(self.handle_drag_finished)
        
        self.project_cards.append(card)
        return card

    def update_stack_appearance(self):
        """Обновляет внешний вид стопки карточек"""
        num_projects = len(self.projects)
        
        # Основной контейнер
        self.content.setStyleSheet(f"""
            QFrame#content_frame {{
                background-color: {COLORS['card_background']};
                border-radius: 16px;
                border: 1px solid {COLORS['input_border']};
            }}
            QFrame#content_frame:hover {{
                border: 1px solid {COLORS['primary']};
                background-color: {COLORS['card_hover']};
            }}
        """)

    def update_info(self):
        """Обновляет информацию о группе"""
        count = len(self.projects)
        self.count_label.setText(f"{count} проект{'ов' if count != 1 else ''}")
        
        # Обновляем внешний вид стопки
        self.update_stack_appearance()
        
        # Обновляем сетку в попапе
        while self.popup.grid_layout.count():
            item = self.popup.grid_layout.takeAt(0)
            if item.widget():
                item.widget().setParent(None)
        
        # Добавляем карточки в сетку по 3 в ряд с отступами
        self.popup.grid_layout.setSpacing(20)  # Устанавливаем отступы между карточками
        for i, card in enumerate(self.project_cards):
            row = i // 3
            col = i % 3
            self.popup.grid_layout.addWidget(card, row, col, Qt.AlignmentFlag.AlignTop)
            
        # Анимируем изменение размера попапа, если он видим
        self.popup.animate_resize()

    def add_project(self, project):
        """Добавление проекта в группу"""
        if project not in self.projects:
            self.projects.append(project)
            card = self._create_card(project)
            
            # Добавляем карточку в попап
            row = (len(self.project_cards) - 1) // 3
            col = (len(self.project_cards) - 1) % 3
            self.popup.grid_layout.addWidget(card, row, col)
            
            # Обновляем информацию и внешний вид
            self.update_info()
            self.group_changed.emit()

    def remove_project(self, project):
        """Удаление проекта из группы"""
        if project in self.projects:
            index = self.projects.index(project)
            self.projects.remove(project)
            card = self.project_cards.pop(index)
            card.deleteLater()
            
            if len(self.projects) == 0:
                self.popup.hide()  # Скрываем попап, если группа пуста
                self.deleted.emit([])
            else:
                self.update_info()
                self.group_changed.emit()
            
            return project
        return None

    def close_popup(self):
        """Закрывает попап"""
        self.popup.hide()

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            # Показываем попап
            self.popup.show()
        super().mousePressEvent(event)

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
        """Обработка начала перетаскивания"""
        if event.mimeData().hasText():
            try:
                project_data = eval(event.mimeData().text())
                # Проверяем, не находится ли проект уже в этой группе
                if project_data not in self.projects:
                    # Подсвечиваем всю область группы
                    self.setStyleSheet(f"""
                        QFrame#project_group {{
                            background: rgba(74, 144, 226, 0.1);
                            border-radius: 16px;
                            border: 2px dashed {COLORS['primary']};
                        }}
                    """)
                    event.acceptProposedAction()
                    return
            except Exception as e:
                print(f"Ошибка при обработке dragEnter: {str(e)}")
                traceback.print_exc()
        event.ignore()

    def dragLeaveEvent(self, event):
        """Обработка выхода перетаскивания за пределы группы"""
        # Возвращаем обычный стиль
        self.setStyleSheet(f"""
            QFrame#project_group {{
                background-color: {COLORS['card_background']};
                border-radius: 16px;
                border: 1px solid {COLORS['input_border']};
            }}
            QFrame#project_group:hover {{
                border: 1px solid {COLORS['primary']};
                background-color: {COLORS['card_hover']};
            }}
        """)
        super().dragLeaveEvent(event)

    def dropEvent(self, event):
        """Обработка сброса проекта на группу"""
        # Возвращаем обычный стиль
        self.setStyleSheet(f"""
            QFrame#project_group {{
                background-color: {COLORS['card_background']};
                border-radius: 16px;
                border: 1px solid {COLORS['input_border']};
            }}
            QFrame#project_group:hover {{
                border: 1px solid {COLORS['primary']};
                background-color: {COLORS['card_hover']};
            }}
        """)
        
        if event.mimeData().hasText():
            try:
                project_data = eval(event.mimeData().text())
                
                # Проверяем, не находится ли проект уже в этой группе
                if project_data not in self.projects:
                    # Находим родительское окно
                    main_window = self.window()
                    
                    # Проверяем, не является ли источник перетаскивания карточкой из этой группы
                    source_widget = event.source()
                    if source_widget and source_widget.parent() == self:
                        event.ignore()
                        return
                    
                    # Удаляем проект из других групп
                    if hasattr(main_window, 'project_groups'):
                        for group in main_window.project_groups.values():
                            if group != self and project_data in group.projects:
                                group.remove_project(project_data)
                    
                    # Удаляем карточку с главного экрана
                    if hasattr(main_window, 'remove_project_card'):
                        main_window.remove_project_card(project_data)
                    
                    # Добавляем проект в группу
                    self.add_project(project_data)
                    
                    # Анимация успешного добавления
                    self.animate_drop_success()
                    event.acceptProposedAction()
                    return
            except Exception as e:
                print(f"Ошибка при обработке drop: {str(e)}")
                traceback.print_exc()
        event.ignore()

    def animate_drop_success(self):
        """Анимация успешного добавления проекта"""
        # Создаем анимацию подсветки
        self.setStyleSheet(f"""
            QFrame#project_group {{
                background: rgba(74, 144, 226, 0.2);
                border-radius: 16px;
                border: 2px solid {COLORS['primary']};
            }}
        """)
        
        # Возвращаем исходный стиль через 300мс
        QTimer.singleShot(300, lambda: self.setStyleSheet(f"""
            QFrame#project_group {{
                background-color: {COLORS['card_background']};
                border-radius: 16px;
                border: 1px solid {COLORS['input_border']};
            }}
            QFrame#project_group:hover {{
                border: 1px solid {COLORS['primary']};
                background-color: {COLORS['card_hover']};
            }}
        """))
        
        # Обновляем информацию о группе
        self.update_info()
        
        # Уведомляем об изменении группы
        self.group_changed.emit()

    def handle_drag_finished(self, project_data, drop_accepted):
        """Обработка завершения перетаскивания проекта"""
        if drop_accepted:
            # Если перетаскивание завершилось успешно (карточка была принята где-то),
            # удаляем проект из группы
            self.remove_project(project_data)
            
            # Находим родительское окно
            main_window = self.window()
            
            # Добавляем проект обратно на главный экран
            if hasattr(main_window, 'add_project_card'):
                main_window.add_project_card(project_data)
            
            # Обновляем информацию о группе
            self.update_info()
            self.group_changed.emit()

    def handle_project_dragged(self, project_data):
        """Обработка начала перетаскивания проекта из группы"""
        # Этот метод вызывается, когда начинается перетаскивание
        # Можно использовать его для визуальной обратной связи
        pass
    
    def _on_name_changed(self, new_name):
        """Обработчик изменения имени группы"""
        self.name = new_name
        self.name_label.setText(new_name)
        self.group_changed.emit()

    def rename_group(self):
        """Переименование группы через диалог больше не нужно, 
        так как теперь это делается через попап"""
        pass

    def paintEvent(self, event):
        """Отрисовка теней"""
        if len(self.projects) > 1:
            painter = QPainter(self)
            painter.setRenderHint(QPainter.RenderHint.Antialiasing)
            
            # Рисуем тени в обратном порядке (снизу вверх)
            num_shadows = min(len(self.projects) - 1, 2)
            for i in range(num_shadows - 1, -1, -1):
                offset = 8 * (i + 1)
                opacity = 0.8 - (i * 0.3)
                
                painter.setOpacity(opacity)
                painter.setBrush(QColor(COLORS['card_background']))
                painter.setPen(Qt.PenStyle.NoPen)
                
                # Рисуем тень как прямоугольник со скругленными углами
                # Смещаем тени вправо и вниз от основной карточки
                shadow_rect = self.content.rect().translated(offset, offset)
                painter.drawRoundedRect(shadow_rect, 16, 16)
        
        super().paintEvent(event) 