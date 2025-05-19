from PyQt6.QtWidgets import (QDialog, QVBoxLayout, QHBoxLayout, 
                           QLabel, QPushButton, QLineEdit)
import os
import json
from styles import SETTINGS_DIALOG_STYLE

class CreateProjectDialog(QDialog):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Создание проекта")
        self.setMinimumWidth(400)
        self.setStyleSheet(SETTINGS_DIALOG_STYLE)

        layout = QVBoxLayout(self)
        layout.setSpacing(15)
        
        # Поле для ввода имени проекта
        name_layout = QHBoxLayout()
        name_label = QLabel("Имя проекта:")
        self.name_input = QLineEdit()
        name_layout.addWidget(name_label)
        name_layout.addWidget(self.name_input)
        layout.addLayout(name_layout)
        
        # Кнопки
        buttons_layout = QHBoxLayout()
        buttons_layout.addStretch()
        
        create_button = QPushButton("Создать")
        create_button.clicked.connect(self.create_project)
        cancel_button = QPushButton("Отменить")
        cancel_button.clicked.connect(self.reject)
        
        buttons_layout.addWidget(create_button)
        buttons_layout.addWidget(cancel_button)
        layout.addLayout(buttons_layout)
        
        self.project_data = None
    
    def create_project(self):
        project_name = self.name_input.text().strip()
        if not project_name:
            return
            
        # Загружаем настройки для получения пути к проектам
        try:
            with open('settings.json', 'r') as f:
                settings = json.load(f)
                projects_path = settings.get('projects_path', '')
        except Exception as e:
            print(f"Error loading settings: {e}")
            return
            
        if not projects_path or not os.path.exists(projects_path):
            print("Projects path not set or doesn't exist")
            return
            
        # Создаем директорию проекта
        project_path = os.path.join(projects_path, project_name)
        if os.path.exists(project_path):
            print("Project already exists")
            return
            
        try:
            # Создаем основную директорию проекта
            os.makedirs(project_path)
            
            # Создаем структуру папок
            os.makedirs(os.path.join(project_path, "Export", "Textures"))
            os.makedirs(os.path.join(project_path, "Export", "models"))
            os.makedirs(os.path.join(project_path, "Rens"))
            os.makedirs(os.path.join(project_path, "Imgs"))
            
            # Сохраняем информацию о проекте
            project_info = {
                "name": project_name,
                "path": project_path,
                "created": os.path.getctime(project_path)
            }
            
            self.project_data = project_info
            self.accept()
            
        except Exception as e:
            print(f"Error creating project: {e}")
            return 