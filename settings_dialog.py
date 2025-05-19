from PyQt6.QtWidgets import (QDialog, QVBoxLayout, QHBoxLayout, QLabel,
                           QPushButton, QLineEdit, QFileDialog, QProgressBar, QMessageBox)
from PyQt6.QtCore import Qt, pyqtSignal
import json

class SettingsDialog(QDialog):
    settings_changed = pyqtSignal(dict)  # Сигнал для уведомления об изменении настроек
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Настройки")
        self.setGeometry(100, 100, 400, 300)

        layout = QVBoxLayout()

        self.projects_path = QLineEdit(self)
        self.projects_path.setPlaceholderText("Путь к проектам")
        layout.addWidget(QLabel("Путь к проектам:"))
        layout.addWidget(self.projects_path)

        self.blender_path = QLineEdit(self)
        self.blender_path.setPlaceholderText("Путь к Blender")
        layout.addWidget(QLabel("Путь к Blender:"))
        layout.addWidget(self.blender_path)

        self.substance_path = QLineEdit(self)
        self.substance_path.setPlaceholderText("Путь к Substance")
        layout.addWidget(QLabel("Путь к Substance:"))
        layout.addWidget(self.substance_path)

        button_layout = QHBoxLayout()
        self.save_button = QPushButton("Сохранить")
        self.save_button.clicked.connect(self.save_settings)
        button_layout.addWidget(self.save_button)
        self.cancel_button = QPushButton("Отмена")
        self.cancel_button.clicked.connect(self.reject)
        button_layout.addWidget(self.cancel_button)
        layout.addLayout(button_layout)

        self.setLayout(layout)

    def save_settings(self):
        settings = {
            'projects_path': self.projects_path.text(),
            'blender_path': self.blender_path.text(),
            'substance_path': self.substance_path.text()
        }
        
        try:
            with open('settings.json', 'w') as f:
                json.dump(settings, f, indent=4)
            self.settings_changed.emit(settings)  # Испускаем сигнал с новыми настройками
            self.accept()
        except Exception as e:
            print(f"Error saving settings: {e}") 