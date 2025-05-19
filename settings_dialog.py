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

        # Создаем главный layout
        layout = QVBoxLayout(self)
        layout.setSpacing(15)
        
        # Информация о версии
        version_layout = QHBoxLayout()
        version_label = QLabel(f"Текущая версия: {VERSION}")
        version_layout.addWidget(version_label)
        layout.addLayout(version_layout)
        
        # Кнопка проверки обновлений
        update_layout = QHBoxLayout()
        self.check_updates_btn = QPushButton("Проверить обновления")
        self.check_updates_btn.clicked.connect(self.check_for_updates)
        update_layout.addWidget(self.check_updates_btn)
        layout.addLayout(update_layout)
        
        # Прогресс-бар (скрыт по умолчанию)
        self.progress_bar = QProgressBar()
        self.progress_bar.hide()
        layout.addWidget(self.progress_bar)
        
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
        
        # Инициализация updater
        self.updater = Updater(self)
        self.updater.update_available.connect(self.on_update_available)
        self.updater.update_progress.connect(self.on_update_progress)
        self.updater.update_error.connect(self.on_update_error)
    
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
            self.settings_changed.emit(settings)  # Испускаем сигнал с новыми настройками
            self.accept()
        except Exception as e:
            print(f"Error saving settings: {e}")
    
    def check_for_updates(self):
        """Проверка обновлений"""
        self.check_updates_btn.setEnabled(False)
        self.check_updates_btn.setText("Проверка обновлений...")
        has_update, version, download_url = self.updater.check_for_updates()
        
        if has_update:
            reply = QMessageBox.question(
                self,
                "Доступно обновление",
                f"Доступна новая версия {version}. Хотите обновить приложение?",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
            )
            
            if reply == QMessageBox.StandardButton.Yes:
                self.download_update(download_url)
        else:
            QMessageBox.information(
                self,
                "Обновление не требуется",
                "У вас установлена последняя версия приложения."
            )
        
        self.check_updates_btn.setEnabled(True)
        self.check_updates_btn.setText("Проверить обновления")
    
    def download_update(self, download_url):
        """Загрузка обновления"""
        try:
            self.progress_bar.show()
            self.progress_bar.setValue(0)
            
            # Определяем корневой путь приложения
            app_root = app_paths.get_app_root()
            print(f"[DEBUG] App root path: {app_root}")
            
            # Создаем временную директорию внутри корневого пути
            temp_dir = os.path.join(app_root, 'python', 'temp')
            os.makedirs(temp_dir, exist_ok=True)
            save_path = os.path.join(temp_dir, 'update.zip')
            
            print(f"[DEBUG] Using temp directory: {temp_dir}")
            print(f"[DEBUG] Update will be saved to: {save_path}")
            
            if self.updater.download_update(download_url, save_path):
                self.install_update(save_path)
        except Exception as e:
            error_msg = f"Ошибка при подготовке к загрузке обновления: {str(e)}"
            print(f"[ERROR] {error_msg}")
            self.on_update_error(error_msg)
    
    def install_update(self, update_file):
        """Установка обновления"""
        try:
            # Определяем корневой путь приложения
            app_root = app_paths.get_app_root()
            print(f"[DEBUG] App root path: {app_root}")
            
            # Создаем пути для скриптов обновления
            scripts_dir = os.path.dirname(update_file)
            update_script = os.path.join(scripts_dir, 'update.bat')
            ps_script = os.path.join(scripts_dir, 'update.ps1')
            
            # Создаем пути для временных файлов и бэкапа
            temp_extract_dir = os.path.join(scripts_dir, 'temp_extract')
            backup_dir = os.path.join(scripts_dir, f'backup_{os.path.basename(update_file)}')
            
            print(f"[DEBUG] Update file path: {update_file}")
            print(f"[DEBUG] App path: {app_root}")
            print(f"[DEBUG] Python executable: {sys.executable}")
            print(f"[DEBUG] Temp extract dir: {temp_extract_dir}")
            print(f"[DEBUG] Backup dir: {backup_dir}")
            
            # Проверяем существование файла обновления
            if not os.path.exists(update_file):
                raise FileNotFoundError(f"Файл обновления не найден: {update_file}")
            
            # Проверяем, что это действительно zip-файл
            import zipfile
            if not zipfile.is_zipfile(update_file):
                raise ValueError(f"Файл {update_file} не является ZIP архивом")
            
            # Проверяем права доступа к папке приложения
            try:
                test_file = os.path.join(app_root, 'test_write_access')
                with open(test_file, 'w') as f:
                    f.write('test')
                os.remove(test_file)
            except Exception as e:
                raise PermissionError(f"Нет прав на запись в папку приложения: {app_root}. Запустите приложение от имени администратора.")
            
            # Подготавливаем пути для PowerShell (используем прямые слеши)
            ps_update_file = os.path.abspath(update_file).replace('\\', '/')
            ps_temp_dir = temp_extract_dir.replace('\\', '/')
            ps_app_path = app_root.replace('\\', '/')
            ps_backup_dir = backup_dir.replace('\\', '/')
            ps_launcher = os.path.join(app_root, "launcher.bat").replace('\\', '/')
            
            # Создаем PowerShell скрипт
            with open(ps_script, 'w', encoding='utf-8') as f:
                f.write('$ErrorActionPreference = "Stop"\n')
                f.write('$ProgressPreference = "Continue"\n')
                f.write('try {\n')
                f.write('    Write-Host "Starting update..."\n')
                f.write(f'    $updateFile = "{ps_update_file}"\n')
                f.write(f'    $tempDir = "{ps_temp_dir}"\n')
                f.write(f'    $appPath = "{ps_app_path}"\n')
                f.write(f'    $backupDir = "{ps_backup_dir}"\n')
                f.write('\n')
                f.write('    Write-Host "Checking paths..."\n')
                f.write('    Write-Host "Update file: $updateFile"\n')
                f.write('    Write-Host "Temp directory: $tempDir"\n')
                f.write('    Write-Host "Application path: $appPath"\n')
                f.write('    Write-Host "Backup directory: $backupDir"\n')
                f.write('\n')
                f.write('    # Проверка безопасности пути\n')
                f.write('    if ($appPath -eq "C:/" -or $appPath -eq "C:\\" -or $appPath.Length -lt 4) {\n')
                f.write('        throw "Invalid application path. Update stopped for security reasons."\n')
                f.write('    }\n')
                f.write('\n')
                f.write('    Write-Host "Creating backup..."\n')
                f.write('    if (Test-Path $backupDir) { Remove-Item $backupDir -Recurse -Force }\n')
                f.write('    Copy-Item -Path $appPath -Destination $backupDir -Recurse\n')
                f.write('\n')
                f.write('    Write-Host "Checking update file..."\n')
                f.write('    if (-not (Test-Path $updateFile)) { throw "Update file not found" }\n')
                f.write('\n')
                f.write('    Write-Host "Preparing temp directory..."\n')
                f.write('    if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }\n')
                f.write('    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null\n')
                f.write('\n')
                f.write('    Write-Host "Extracting update..."\n')
                f.write('    Add-Type -AssemblyName System.IO.Compression.FileSystem\n')
                f.write('    try {\n')
                f.write('        [System.IO.Compression.ZipFile]::ExtractToDirectory($updateFile, $tempDir)\n')
                f.write('    } catch {\n')
                f.write('        throw "Archive extraction failed: $($_.Exception.Message)"\n')
                f.write('    }\n')
                f.write('\n')
                f.write('    Write-Host "Verifying extracted files..."\n')
                f.write('    if (-not (Test-Path "$tempDir/*")) { throw "No files found in extracted directory" }\n')
                f.write('\n')
                f.write('    Write-Host "Updating files..."\n')
                f.write('    $filesToUpdate = Get-ChildItem -Path $tempDir -Recurse -File\n')
                f.write('\n')
                f.write('    $success = $true\n')
                f.write('    foreach ($file in $filesToUpdate) {\n')
                f.write('        try {\n')
                f.write('            $relativePath = $file.FullName.Substring($tempDir.Length + 1)\n')
                f.write('            $targetPath = Join-Path -Path $appPath -ChildPath $relativePath\n')
                f.write('            $targetDir = Split-Path -Parent $targetPath\n')
                f.write('\n')
                f.write('            if (-not [string]::IsNullOrEmpty($targetDir)) {\n')
                f.write('                if (-not (Test-Path $targetDir)) {\n')
                f.write('                    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null\n')
                f.write('                }\n')
                f.write('            }\n')
                f.write('\n')
                f.write('            if (Test-Path $targetPath) {\n')
                f.write('                Write-Host "Removing: $relativePath"\n')
                f.write('                Remove-Item -Path $targetPath -Force\n')
                f.write('            }\n')
                f.write('\n')
                f.write('            Write-Host "Copying: $relativePath"\n')
                f.write('            Copy-Item -Path $file.FullName -Destination $targetPath -Force\n')
                f.write('        } catch {\n')
                f.write('            $success = $false\n')
                f.write('            Write-Host "Failed to copy file $relativePath : $($_.Exception.Message)" -ForegroundColor Red\n')
                f.write('            break\n')
                f.write('        }\n')
                f.write('    }\n')
                f.write('\n')
                f.write('    if (-not $success) {\n')
                f.write('        Write-Host "Update failed, restoring backup..." -ForegroundColor Yellow\n')
                f.write('        Remove-Item -Path "$appPath/*" -Recurse -Force\n')
                f.write('        Copy-Item -Path "$backupDir/*" -Destination $appPath -Recurse -Force\n')
                f.write('        throw "Update failed, backup restored"\n')
                f.write('    }\n')
                f.write('\n')
                f.write('    Write-Host "Cleaning up..."\n')
                f.write('    Remove-Item $updateFile -Force\n')
                f.write('    Remove-Item $tempDir -Recurse -Force\n')
                f.write('    Remove-Item $backupDir -Recurse -Force\n')
                f.write('\n')
                f.write('    Write-Host "Update completed successfully!"\n')
                f.write('    Write-Host "Verifying launcher.bat exists..."\n')
                f.write(f'    if (-not (Test-Path "{ps_launcher}")) {{ throw "launcher.bat not found after update" }}\n')
                f.write('    Write-Host "Starting application..."\n')
                f.write(f'    Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "cd /d \\"$appPath\\" && launcher.bat"\n')
                f.write('} catch {\n')
                f.write('    Write-Host ("Update failed: " + $_.Exception.Message) -ForegroundColor Red\n')
                f.write('    Write-Host ("Stack trace: " + $_.ScriptStackTrace) -ForegroundColor Red\n')
                f.write('    Write-Host "Press any key to continue..."\n')
                f.write('    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")\n')
                f.write('    exit 1\n')
                f.write('}\n')
            
            # Создаем BAT файл
            with open(update_script, 'w', encoding='utf-8') as f:
                f.write('@echo off\n')
                f.write('echo Waiting for application to close...\n')
                f.write('timeout /t 2 /nobreak\n')
                f.write('echo Running update script...\n')
                f.write(f'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "{ps_script}" > "{os.path.join(os.path.dirname(update_file), "update_log.txt")}" 2>&1\n')
                f.write('if errorlevel 1 (\n')
                f.write('    echo Update failed! Check update_log.txt for details\n')
                f.write('    pause\n')
                f.write('    del "%~f0"\n')
                f.write(f'    del "{ps_script}"\n')
                f.write(') else (\n')
                f.write('    echo Update completed successfully!\n')
                f.write('    timeout /t 2 /nobreak\n')
                f.write('    del "%~f0"\n')
                f.write(f'    del "{ps_script}"\n')
                f.write(')\n')
            
            print(f"[DEBUG] Created update scripts: {update_script}, {ps_script}")
            
            # Запускаем скрипт обновления и закрываем приложение
            subprocess.Popen([update_script], shell=True)
            print("[DEBUG] Update script started, closing application...")
            self.parent().close()
        except Exception as e:
            print(f"[ERROR] Update installation failed: {str(e)}")
            QMessageBox.critical(
                self,
                "Ошибка обновления",
                f"Не удалось установить обновление:\n{str(e)}"
            )
    
    def on_update_available(self, version):
        """Обработчик сигнала о доступности обновления"""
        pass
    
    def on_update_progress(self, progress):
        """Обработчик сигнала прогресса загрузки"""
        self.progress_bar.setValue(progress)
    
    def on_update_error(self, error):
        """Обработчик сигнала ошибки обновления"""
        QMessageBox.critical(
            self,
            "Ошибка обновления",
            f"Произошла ошибка при обновлении:\n{error}"
        ) 