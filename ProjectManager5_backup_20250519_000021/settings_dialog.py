from PyQt6.QtWidgets import (QDialog, QVBoxLayout, QHBoxLayout, QLabel,
                           QPushButton, QLineEdit, QFileDialog)
from PyQt6.QtCore import Qt
import json
import os
from styles import SETTINGS_DIALOG_STYLE

class SettingsDialog(QDialog):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Настройки")
        self.setMinimumWidth(600)
        self.setStyleSheet(SETTINGS_DIALOG_STYLE)

        # Создаем главный layout
        layout = QVBoxLayout(self)
        layout.setSpacing(15)
        
        # Путь к проектам
        projects_layout = QHBoxLayout()
        projects_label = QLabel("Путь к проектам:")
        self.projects_path = QLineEdit()
        browse_projects = QPushButton("...", objectName="browseButton")
        browse_projects.clicked.connect(lambda: self.browse_path(self.projects_path, "folder"))
        projects_layout.addWidget(projects_label)
        projects_layout.addWidget(self.projects_path)
        projects_layout.addWidget(browse_projects)
        layout.addLayout(projects_layout)
        
        # Путь к Blender
        blender_layout = QHBoxLayout()
        blender_label = QLabel("Путь к Blender:")
        self.blender_path = QLineEdit()
        browse_blender = QPushButton("...", objectName="browseButton")
        browse_blender.clicked.connect(lambda: self.browse_path(self.blender_path, "file"))
        blender_layout.addWidget(blender_label)
        blender_layout.addWidget(self.blender_path)
        blender_layout.addWidget(browse_blender)
        layout.addLayout(blender_layout)
        
        # Путь к Substance Painter
        substance_layout = QHBoxLayout()
        substance_label = QLabel("Путь к Substance Painter:")
        self.substance_path = QLineEdit()
        browse_substance = QPushButton("...", objectName="browseButton")
        browse_substance.clicked.connect(lambda: self.browse_path(self.substance_path, "file"))
        substance_layout.addWidget(substance_label)
        substance_layout.addWidget(self.substance_path)
        substance_layout.addWidget(browse_substance)
        layout.addLayout(substance_layout)
        
        # Кнопки
        buttons_layout = QHBoxLayout()
        buttons_layout.addStretch()
        
        save_button = QPushButton("Сохранить")
        save_button.clicked.connect(self.save_settings)
        cancel_button = QPushButton("Отменить")
        cancel_button.clicked.connect(self.reject)
        
        buttons_layout.addWidget(save_button)
        buttons_layout.addWidget(cancel_button)
        layout.addLayout(buttons_layout)
        
        # Загружаем существующие настройки
        self.load_settings()
    
    def browse_path(self, line_edit, mode="file"):
        if mode == "folder":
            path = QFileDialog.getExistingDirectory(self, "Выберите папку")
        else:
            path, _ = QFileDialog.getOpenFileName(self, "Выберите файл")
            
        if path:
            line_edit.setText(path)
    
    def load_settings(self):
        try:
            if os.path.exists('settings.json'):
                with open('settings.json', 'r') as f:
                    settings = json.load(f)
                    self.projects_path.setText(settings.get('projects_path', ''))
                    self.blender_path.setText(settings.get('blender_path', ''))
                    self.substance_path.setText(settings.get('substance_path', ''))
        except Exception as e:
            print(f"Error loading settings: {e}")
    
    def save_settings(self):
        settings = {
            'projects_path': self.projects_path.text(),
            'blender_path': self.blender_path.text(),
            'substance_path': self.substance_path.text()
        }
        
        try:
            with open('settings.json', 'w') as f:
                json.dump(settings, f, indent=4)
            self.accept()
        except Exception as e:
            print(f"Error saving settings: {e}") 