from PyQt6.QtWidgets import (QWidget, QVBoxLayout, QHBoxLayout, QLabel, 
                            QLineEdit, QComboBox, QCheckBox, QDateEdit,
                            QPushButton, QFileDialog)
from PyQt6.QtCore import Qt, pyqtSignal, QDate
import os
from styles import SEARCH_PANEL_STYLE

class SearchPanel(QWidget):
    searchRequested = pyqtSignal(dict)  # Сигнал с параметрами поиска
    
    def __init__(self):
        super().__init__()
        self.setStyleSheet(SEARCH_PANEL_STYLE)
        self.setup_ui()
        
    def setup_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        
        # Основное поле поиска
        search_layout = QHBoxLayout()
        self.search_input = QLineEdit()
        self.search_input.setPlaceholderText("Введите текст для поиска...")
        self.search_input.textChanged.connect(self.trigger_search)
        search_layout.addWidget(self.search_input)
        
        # Кнопка расширенного поиска
        self.advanced_btn = QPushButton("▼")
        self.advanced_btn.setObjectName("advanced_btn")
        self.advanced_btn.setFixedWidth(30)
        self.advanced_btn.setCheckable(True)
        self.advanced_btn.clicked.connect(self.toggle_advanced_search)
        search_layout.addWidget(self.advanced_btn)
        
        layout.addLayout(search_layout)
        
        # Панель расширенного поиска
        self.advanced_panel = QWidget()
        advanced_layout = QVBoxLayout(self.advanced_panel)
        advanced_layout.setContentsMargins(10, 10, 10, 10)
        advanced_layout.setSpacing(10)
        
        # Тип файла
        file_type_layout = QHBoxLayout()
        file_type_layout.addWidget(QLabel("Тип файла:"))
        self.file_type_combo = QComboBox()
        self.file_type_combo.addItems(["Все файлы", "Изображения", "Документы", "3D модели", "Архивы"])
        self.file_type_combo.currentTextChanged.connect(self.trigger_search)
        file_type_layout.addWidget(self.file_type_combo)
        advanced_layout.addLayout(file_type_layout)
        
        # Диапазон дат
        date_layout = QHBoxLayout()
        date_layout.addWidget(QLabel("Период:"))
        self.date_from = QDateEdit(QDate.currentDate().addMonths(-1))
        self.date_to = QDateEdit(QDate.currentDate())
        self.date_from.setCalendarPopup(True)
        self.date_to.setCalendarPopup(True)
        date_layout.addWidget(self.date_from)
        date_layout.addWidget(QLabel("—"))
        date_layout.addWidget(self.date_to)
        advanced_layout.addLayout(date_layout)
        
        # Опции поиска
        options_layout = QHBoxLayout()
        self.case_sensitive = QCheckBox("Учитывать регистр")
        self.search_content = QCheckBox("Искать в содержимом")
        options_layout.addWidget(self.case_sensitive)
        options_layout.addWidget(self.search_content)
        advanced_layout.addLayout(options_layout)
        
        self.advanced_panel.hide()
        layout.addWidget(self.advanced_panel)
        
    def toggle_advanced_search(self, checked):
        self.advanced_panel.setVisible(checked)
        self.advanced_btn.setText("▼" if not checked else "▲")
        
    def get_search_params(self):
        return {
            "text": self.search_input.text(),
            "file_type": self.file_type_combo.currentText(),
            "date_from": self.date_from.date().toPyDate(),
            "date_to": self.date_to.date().toPyDate(),
            "case_sensitive": self.case_sensitive.isChecked(),
            "search_content": self.search_content.isChecked()
        }
        
    def trigger_search(self):
        self.searchRequested.emit(self.get_search_params()) 