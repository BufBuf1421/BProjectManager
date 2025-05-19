import os
import sys
import app_paths

def test_paths():
    try:
        app_root = app_paths.get_app_root()
        temp_dir = app_paths.get_temp_dir()
        backup_dir = app_paths.get_backup_dir()
        
        print("=== Path Test Results ===")
        print(f"App Root: {app_root}")
        print(f"Temp Dir: {temp_dir}")
        print(f"Backup Dir: {backup_dir}")
        print("\n=== Environment Info ===")
        print(f"Current Directory: {os.getcwd()}")
        print(f"Python Executable: {sys.executable}")
        print(f"Script Location: {__file__}")
        print(f"Main Script: {sys.argv[0]}")
        
        print("\n=== Required Files ===")
        required_files = ['main.py', 'launcher.bat', 'python']
        for f in required_files:
            path = os.path.join(app_root, f)
            exists = os.path.exists(path)
            print(f"{f}: {'Found' if exists else 'Not Found'} at {path}")
            
    except Exception as e:
        print(f"\nERROR: {str(e)}")
        print("\n=== Debug Info ===")
        print(f"Current Directory: {os.getcwd()}")
        print(f"Python Executable: {sys.executable}")
        print(f"Script Location: {__file__}")
        print(f"Main Script: {sys.argv[0] if sys.argv else 'None'}")

if __name__ == '__main__':
    test_paths() 