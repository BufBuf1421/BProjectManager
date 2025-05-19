from updater import Updater
from PyQt6.QtCore import QCoreApplication
import sys

def on_update_available(version):
    print(f"[TEST] Update available: {version}")

def on_update_error(error):
    print(f"[TEST] Error: {error}")

def main():
    app = QCoreApplication(sys.argv)
    
    updater = Updater()
    updater.update_available.connect(on_update_available)
    updater.update_error.connect(on_update_error)
    
    print("[TEST] Starting update check...")
    updater.check_for_updates()
    
    # Запускаем event loop на короткое время для обработки сигналов
    app.processEvents()
    
    print("[TEST] Update check completed")

if __name__ == "__main__":
    main() 