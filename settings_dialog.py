from PyQt6.QtWidgets import (QDialog, QVBoxLayout, QHBoxLayout, QLabel,
                           QPushButton, QLineEdit, QFileDialog, QProgressBar, QMessageBox)
from PyQt6.QtCore import Qt, pyqtSignal
import json
import os
import sys
import subprocess
import shutil
from styles import SETTINGS_DIALOG_STYLE
from updater import Updater
from version import VERSION
from app_paths import get_app_root, validate_app_path, get_temp_dir, get_backup_dir
import app_paths

class SettingsDialog(QDialog):
    settings_changed = pyqtSignal(dict)  # Сигнал для уведомления об изменении настроек
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Настройки")
        self.setMinimumWidth(600)
        self.setStyleSheet(SETTINGS_DIALOG_STYLE)

        # Определяем корневой путь приложения
        self.app_root = os.path.dirname(os.path.abspath(__file__))

        # Создаем главный layout
        layout = QVBoxLayout(self)
        layout.setSpacing(15)
        
        # Информация о версии
        version_layout = QHBoxLayout()
        version_label = QLabel(f"Текущая версия: {VERSION}")
        version_layout.addWidget(version_label)
        layout.addLayout(version_layout)
        
        # Кнопка проверки обновлений и прогресс-бар
        update_layout = QHBoxLayout()
        self.check_updates_btn = QPushButton("Проверить обновления")
        self.check_updates_btn.clicked.connect(self.check_for_updates)
        update_layout.addWidget(self.check_updates_btn)
        layout.addLayout(update_layout)
        
        # Прогресс-бар и текст статуса
        progress_layout = QVBoxLayout()
        self.status_label = QLabel("")
        self.status_label.hide()
        self.progress_bar = QProgressBar()
        self.progress_bar.hide()
        progress_layout.addWidget(self.status_label)
        progress_layout.addWidget(self.progress_bar)
        layout.addLayout(progress_layout)
        
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
        
        # Инициализация менеджера обновлений
        self.update_manager = Updater()
        self.update_manager.update_available.connect(self.on_update_available)
        self.update_manager.update_progress.connect(self.on_update_progress)
        self.update_manager.update_error.connect(self.on_update_error)
        self.update_manager.update_completed.connect(self.on_update_completed)
    
    def browse_path(self, line_edit, mode="file"):
        if mode == "folder":
            path = QFileDialog.getExistingDirectory(self, "Выберите папку")
        else:
            path, _ = QFileDialog.getOpenFileName(self, "Выберите файл")
            
        if path:
            line_edit.setText(path)
    
    def load_settings(self):
        try:
            settings_path = os.path.join(self.app_root, 'settings.json')
            if os.path.exists(settings_path):
                with open(settings_path, 'r') as f:
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
            settings_path = os.path.join(self.app_root, 'settings.json')
            with open(settings_path, 'w') as f:
                json.dump(settings, f, indent=4)
            self.settings_changed.emit(settings)  # Испускаем сигнал с новыми настройками
            self.accept()
        except Exception as e:
            print(f"Error saving settings: {e}")
    
    def check_for_updates(self):
        """Проверка обновлений"""
        try:
            self.check_updates_btn.setEnabled(False)
            self.check_updates_btn.setText("Проверка обновлений...")
            self.status_label.setText("Проверка обновлений...")
            self.status_label.show()
            
            has_update, version, download_url = self.update_manager.check_for_updates()
            
            if has_update and version and download_url:
                reply = QMessageBox.question(
                    self,
                    "Доступно обновление",
                    f"Доступна новая версия {version}. Хотите обновить приложение?",
                    QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
                )
                
                if reply == QMessageBox.StandardButton.Yes:
                    self.progress_bar.show()
                    self.progress_bar.setValue(0)
                    success = self.update_manager.download_and_apply_update(download_url)
                    if not success:
                        QMessageBox.critical(
                            self,
                            "Ошибка обновления",
                            "Не удалось установить обновление. Проверьте лог для деталей."
                        )
            else:
                QMessageBox.information(
                    self,
                    "Обновление не требуется",
                    "У вас установлена последняя версия приложения."
                )
        except Exception as e:
            QMessageBox.critical(
                self,
                "Ошибка",
                f"Произошла ошибка при проверке обновлений:\n{str(e)}"
            )
        finally:
            self.check_updates_btn.setEnabled(True)
            self.check_updates_btn.setText("Проверить обновления")
            self.status_label.hide()
            self.progress_bar.hide()
    
    def on_update_available(self, version):
        """Обработчик сигнала о доступности обновления"""
        self.status_label.setText(f"Доступно обновление: {version}")
        self.status_label.show()
    
    def on_update_progress(self, progress):
        """Обработчик сигнала о прогрессе обновления"""
        self.progress_bar.setValue(progress)
        if not self.progress_bar.isVisible():
            self.progress_bar.show()
    
    def on_update_error(self, error):
        """Обработчик сигнала об ошибке обновления"""
        self.status_label.setText(f"Ошибка: {error}")
        self.status_label.show()
        self.progress_bar.hide()
        QMessageBox.critical(self, "Ошибка", error)
        self.check_updates_btn.setEnabled(True)
        self.check_updates_btn.setText("Проверить обновления")
    
    def on_update_completed(self):
        """Обработчик сигнала о завершении обновления"""
        self.status_label.setText("Обновление готово к установке")
        self.status_label.show()
        self.progress_bar.hide()
        
        reply = QMessageBox.information(
            self,
            "Обновление готово",
            "Обновление подготовлено к установке. Приложение будет закрыто для завершения обновления.",
            QMessageBox.StandardButton.Ok
        ) 
        
        # Закрываем приложение
        sys.exit(0)  # Используем sys.exit вместо os.execl 