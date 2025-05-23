"""
Файл стилей приложения
Здесь вы можете настроить внешний вид всех элементов интерфейса
"""

# ============= ОСНОВНЫЕ ЦВЕТА =============
# Здесь можно изменить основные цвета приложения
COLORS = {
    # Цвета фона
    'background': '#000000',          # Основной фон приложения
    'card_background': '#ffffff',     # Фон карточек и панелей
    'projects_block': '#000000',      # Фон блока с проектами
    'hover_background': '#f8f8f8',    # Фон при наведении
    'scrollbar_bg': '#f0f0f0',       # Фон полосы прокрутки
    'scrollbar_handle': '#c1c1c1',   # Цвет ползунка прокрутки
    'scrollbar_hover': '#a8a8a8',    # Цвет ползунка при наведении
    'placeholder_bg': '#f0f0f0',     # Фон плейсхолдера изображения
    'card_hover': '#f5f5f5',         # Фон карточки при наведении
    'badge_background': '#f0f0f0',    # Фон бейджей
    
    # Цвета текста
    'text_primary': '#333333',        # Основной цвет текста
    'text_secondary': '#666666',      # Дополнительный цвет текста
    'text_light': '#ffffff',          # Светлый текст
    'text_dark': '#1a1a1a',          # Темный текст
    'text': '#333333',               # Основной цвет текста
    'secondary_text': '#666666',      # Дополнительный цвет текста
    
    # Цвета элементов
    'button_background': '#ffffff',    # Фон кнопок
    'button_hover': '#e0e0e0',        # Фон кнопок при наведении
    'input_border': '#cccccc',        # Рамка полей ввода
    'input_focus': '#4a90e2',         # Рамка полей ввода при фокусе
    'accent': '#4a90e2',             # Акцентный цвет
    'primary': '#4a90e2',            # Основной цвет элементов
    
    # Цвета кнопок
    'favorite_btn': '#FFD700',        # Цвет кнопки избранного
    'delete_btn': '#FF4444',          # Цвет кнопки удаления
    
    # Цвета иконок программ
    'blender_icon': '#ff6600',        # Цвет иконки Blender
    'substance_icon': '#1a472a',      # Цвет иконки Substance
}

# ============= РАЗМЕРЫ И ОТСТУПЫ =============
# Здесь можно настроить размеры элементов и отступы
SIZES = {
    # Размеры элементов
    'button_height': '30px',          # Высота кнопок
    'input_height': '30px',           # Высота полей ввода
    'card_min_height': '270px',       # Минимальная высота карточек
    'card_width': '280px',            # Ширина карточек
    'preview_width': '272px',         # Ширина превью
    'preview_height': '153px',        # Высота превью
    'preview_padding': '4px',         # Отступы превью
    
    # Радиусы скругления
    'radius_large': '16px',           # Большое скругление (карточки, панели)
    'radius_medium': '10px',          # Среднее скругление (кнопки)
    'radius_small': '5px',            # Малое скругление (мелкие элементы)
    
    # Отступы
    'padding_large': '16px',          # Большие отступы
    'padding_medium': '8px',          # Средние отступы
    'padding_small': '5px',           # Малые отступы
    
    # Шрифты
    'font_large': '16px',             # Крупный шрифт
    'font_medium': '14px',            # Средний шрифт
    'font_small': '12px',             # Мелкий шрифт
}

# ============= СТИЛИ КОМПОНЕНТОВ =============

# Главное окно
MAIN_WINDOW_STYLE = f"""
    /* Основное окно */
    QMainWindow {{
        background-color: {COLORS['background']};
    }}
    
    /* Кнопки */
    QPushButton {{
        background-color: {COLORS['button_background']};
        color: {COLORS['text_primary']};
        border: none;
        border-radius: {SIZES['radius_medium']};
        padding: {SIZES['padding_medium']};
        height: {SIZES['button_height']};
    }}
    QPushButton:hover {{
        background-color: {COLORS['button_hover']};
    }}
    
    /* Поля ввода */
    QLineEdit {{
        background-color: {COLORS['card_background']};
        color: {COLORS['text_primary']};
        border: 1px solid {COLORS['input_border']};
        border-radius: {SIZES['radius_medium']};
        padding: {SIZES['padding_medium']};
        height: {SIZES['input_height']};
    }}
    
    /* Текстовые метки */
    QLabel {{
        color: {COLORS['text_light']};
    }}
    
    QFrame#projects_container {{
        background-color: {COLORS['projects_block']};
        border-radius: {SIZES['radius_large']};
    }}
    QWidget#all_projects_container {{
        background-color: {COLORS['projects_block']};
    }}
"""

# Правая панель
RIGHT_PANEL_STYLE = f"""
    QFrame {{
        background-color: {COLORS['card_background']};
        border-radius: {SIZES['radius_large']};
        padding: {SIZES['padding_large']};
    }}
    QLabel {{
        color: {COLORS['text_primary']};
        font-size: {SIZES['font_medium']};
    }}
"""

# Заголовки секций
SECTION_TITLE_STYLE = f"""
    font-size: {SIZES['font_large']};
    font-weight: bold;
    color: {COLORS['text_light']};
"""

# Карточки проектов
PROJECT_CARD_STYLE = f"""
    background-color: {COLORS['card_background']};
    min-height: 150px;
    max-width: 250px;
"""

# Окно настроек
SETTINGS_DIALOG_STYLE = f"""
    QDialog {{
        background-color: {COLORS['background']};
    }}
    QLabel {{
        color: {COLORS['text_light']};
        font-size: {SIZES['font_medium']};
    }}
    QPushButton {{
        background-color: {COLORS['button_background']};
        color: {COLORS['text_primary']};
        border-radius: {SIZES['radius_medium']};
        padding: {SIZES['padding_medium']};
        height: {SIZES['button_height']};
    }}
    QLineEdit {{
        background-color: {COLORS['card_background']};
        color: {COLORS['text_primary']};
        border: 1px solid {COLORS['input_border']};
        border-radius: {SIZES['radius_small']};
        padding: {SIZES['padding_small']};
        height: {SIZES['input_height']};
    }}
"""

# Панель поиска
SEARCH_PANEL_STYLE = f"""
    /* Основной контейнер */
    QWidget {{
        background-color: {COLORS['card_background']};
    }}
    
    /* Поле поиска */
    QLineEdit {{
        padding: {SIZES['padding_small']};
        border: 1px solid {COLORS['input_border']};
        border-radius: {SIZES['radius_medium']};
        background-color: {COLORS['card_background']};
        height: {SIZES['input_height']};
    }}
    QLineEdit:focus {{
        border-color: {COLORS['input_focus']};
    }}
    
    /* Кнопка расширенного поиска */
    QPushButton#advanced_btn {{
        border: 1px solid {COLORS['input_border']};
        border-radius: {SIZES['radius_medium']};
        background-color: {COLORS['card_background']};
        height: {SIZES['button_height']};
    }}
    QPushButton#advanced_btn:hover {{
        background-color: {COLORS['button_hover']};
    }}
    
    /* Выпадающие списки */
    QComboBox {{
        padding: {SIZES['padding_small']};
        border: 1px solid {COLORS['input_border']};
        border-radius: {SIZES['radius_small']};
        background-color: {COLORS['card_background']};
        height: {SIZES['input_height']};
    }}
    
    /* Метки */
    QLabel {{
        color: {COLORS['text_secondary']};
        font-size: {SIZES['font_medium']};
    }}
"""

# Стиль области прокрутки
SCROLL_AREA_STYLE = f"""
    QScrollArea {{ 
        border: none; 
        background: {COLORS['projects_block']}; 
    }}
    QWidget#scrollAreaWidgetContents {{
        background: {COLORS['projects_block']};
    }}
    QScrollBar:vertical {{
        border: none;
        background: {COLORS['scrollbar_bg']};
        width: 10px;
        margin: 0px;
    }}
    QScrollBar::handle:vertical {{
        background: {COLORS['scrollbar_handle']};
        min-height: 30px;
        border-radius: 5px;
    }}
    QScrollBar::handle:vertical:hover {{
        background: {COLORS['scrollbar_hover']};
    }}
    QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {{
        height: 0px;
    }}
    QScrollBar::add-page:vertical, QScrollBar::sub-page:vertical {{
        background: none;
    }}
"""

# Стили для карточки проекта
PROJECT_CARD_STYLES = {
    'main': f"""
        QFrame#project_card {{
            background-color: {COLORS['card_background']};
            border-radius: {SIZES['radius_large']};
            border: 1px solid {COLORS['input_border']};
        }}
        QFrame#project_card:hover {{
            border: 1px solid {COLORS['accent']};
            background-color: {COLORS['card_hover']};
        }}
    """,
    'image_placeholder': f"""
        background-color: {COLORS['placeholder_bg']};
        border-radius: {SIZES['radius_medium']};
        padding: {SIZES['padding_medium']};
    """,
    'name_label': f"""
        color: {COLORS['text_primary']};
        font-size: {SIZES['font_large']};
        font-weight: bold;
    """,
    'date_label': f"""
        QLabel {{
            color: {COLORS['secondary_text']};
            font-size: {SIZES['font_small']};
            padding: {SIZES['padding_small']};
        }}
    """,
    'files_label': f"""
        color: {COLORS['text_secondary']};
        font-size: {SIZES['font_small']};
    """
}

# Стили для карточек в группе
GROUP_CARD_STYLES = {
    'container': f"""
        QWidget {{
            background-color: transparent;
        }}
    """,
    'top_card': f"""
        QFrame#top_card {{
            background-color: {COLORS['card_background']};
            border-radius: {SIZES['radius_large']};
            border: 1px solid {COLORS['input_border']};
        }}
        QFrame#top_card:hover {{
            border: 1px solid {COLORS['primary']};
            background-color: {COLORS['card_hover']};
        }}
    """,
    'name_label': f"""
        color: {COLORS['text_primary']};
        font-size: 16px;
        font-weight: bold;
    """,
    'info_label': f"""
        color: {COLORS['text_secondary']};
        font-size: 14px;
    """
} 