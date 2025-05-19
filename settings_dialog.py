import os
import sys
import subprocess
from PyQt5.QtWidgets import QMessageBox

class SettingsDialog:
    def install_update(self, update_file):
        """Установка обновления"""
        try:
            # Создаем bat-файл для обновления
            update_script = os.path.join(os.path.dirname(update_file), 'update.bat')
            ps_script = os.path.join(os.path.dirname(update_file), 'update.ps1')
            app_path = os.path.dirname(os.path.dirname(sys.executable))  # Путь к корневой папке приложения
            
            print(f"[DEBUG] Update file path: {update_file}")
            print(f"[DEBUG] App path: {app_path}")
            print(f"[DEBUG] Python executable: {sys.executable}")
            
            # Создаем PowerShell скрипт
            with open(ps_script, 'w', encoding='utf-8') as f:
                f.write('$ErrorActionPreference = "Stop"\n')
                f.write('try {\n')
                f.write('    Write-Host "Starting update..."\n')
                f.write(f'    Expand-Archive -Path "{update_file}" -DestinationPath "{app_path}" -Force\n')
                f.write('    if ($LASTEXITCODE -ne 0) { throw "Archive extraction failed" }\n')
                f.write('    Write-Host "Update extracted successfully"\n')
                f.write(f'    Remove-Item "{update_file}" -Force\n')
                f.write('    Write-Host "Starting application..."\n')
                f.write(f'    Start-Process "{os.path.join(app_path, "launcher.bat")}"\n')
                f.write('} catch {\n')
                f.write('    Write-Host ("Update failed: " + $_.Exception.Message)\n')
                f.write('    Write-Host "Press any key to continue..."\n')
                f.write('    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")\n')
                f.write('    exit 1\n')
                f.write('}\n')
            
            # Создаем BAT файл
            with open(update_script, 'w', encoding='utf-8') as f:
                f.write('@echo off\n')
                f.write('echo Waiting for application to close...\n')
                f.write('timeout /t 2 /nobreak\n')
                f.write(f'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "{ps_script}"\n')
                f.write('if errorlevel 1 (\n')
                f.write('    echo Update failed\n')
                f.write('    pause\n')
                f.write('    del "%~f0"\n')
                f.write(f'    del "{ps_script}"\n')
                f.write(') else (\n')
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