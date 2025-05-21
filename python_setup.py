import os
import sys
import traceback
import subprocess

def install_package(package_name, version=None, force=False):
    """Install package using pip"""
    try:
        python_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'python', 'python.exe')
        package_spec = f"{package_name}=={version}" if version else package_name
        cmd = [python_path, "-m", "pip", "install", "--no-cache-dir"]
        if force:
            cmd.extend(["--force-reinstall"])
        cmd.extend([package_spec, "--target", os.path.join(os.path.dirname(os.path.abspath(__file__)), 'python', 'Lib', 'site-packages')])
        
        print(f"Installing {package_spec}...")
        subprocess.check_call(cmd)
        return True
    except Exception as e:
        print(f"Error installing {package_name}: {e}")
        return False

def get_pyqt_version():
    """Get PyQt6 version safely"""
    try:
        from PyQt6.QtCore import PYQT_VERSION_STR
        return PYQT_VERSION_STR
    except:
        return "Unknown"

def check_dependencies():
    """Check all required dependencies."""
    dependencies = {
        "charset_normalizer": "3.1.0",
        "urllib3": "1.26.15",  # Changed to match requests requirements
        "idna": "3.4",
        "certifi": "2023.7.22",
        "requests": "2.28.0",
        "PyQt6": "6.5.3",
        "PyQt6-Qt6": "6.5.3",
        "PyQt6-sip": "13.6.0",
        "Pillow": "9.3.0",
        "send2trash": "1.8.2",
        "svglib": "1.5.1"
    }
    
    # Clean up temp directory if exists
    temp_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'python', 'temp')
    if os.path.exists(temp_dir):
        print("Cleaning up temporary files...")
        try:
            import shutil
            shutil.rmtree(temp_dir)
        except Exception as e:
            print(f"Warning: Could not clean temp directory: {e}")
    
    # Install base dependencies first
    base_deps = ["charset_normalizer", "urllib3", "idna", "certifi"]
    print("Installing base dependencies...")
    for dep in base_deps:
        if not install_package(dep, dependencies[dep], force=True):
            return False
    
    # Install requests
    print("Installing requests...")
    if not install_package("requests", dependencies["requests"], force=True):
        return False
    
    # Install PyQt6 and related packages
    print("Installing PyQt6 packages...")
    pyqt_packages = ["PyQt6", "PyQt6-Qt6", "PyQt6-sip"]
    for package in pyqt_packages:
        if not install_package(package, dependencies[package], force=True):
            return False
    
    # Install other dependencies
    print("Installing other dependencies...")
    for package, version in dependencies.items():
        if package not in base_deps + ["requests"] + pyqt_packages:
            if not install_package(package, version):
                return False
    
    # Verify all installations
    print("Verifying installations...")
    try:
        # Check base dependencies
        import charset_normalizer
        print(f"charset_normalizer version: {charset_normalizer.__version__}")
        
        import urllib3
        print(f"urllib3 version: {urllib3.__version__}")
        
        # Check requests
        import requests
        print(f"requests version: {requests.__version__}")
        
        # Check PyQt6
        import PyQt6
        pyqt_version = get_pyqt_version()
        print(f"PyQt6 version: {pyqt_version}")
        
        # Check Pillow
        from PIL import Image
        import PIL
        print(f"Pillow version: {PIL.__version__}")
        
        # Check other packages
        import send2trash
        import svglib
        print("All dependencies verified successfully")
        return True
    except ImportError as e:
        print(f"Error during verification: {e}")
        return False
    except Exception as e:
        print(f"Unexpected error during verification: {e}")
        return False

def setup_python_env():
    """Set up Python environment for working with local installation."""
    try:
        print("Starting Python environment setup...")
        
        # Get application directory path
        app_dir = os.path.dirname(os.path.abspath(__file__))
        print(f"Application directory: {app_dir}")
        
        # Path to local Python
        python_dir = os.path.join(app_dir, 'python')
        site_packages = os.path.join(python_dir, 'Lib', 'site-packages')
        print(f"Python path: {python_dir}")
        print(f"Site-packages path: {site_packages}")
        
        # Check directory existence
        if not os.path.exists(python_dir):
            print(f"Error: Python directory not found: {python_dir}")
            return False
            
        if not os.path.exists(site_packages):
            print(f"Error: Site-packages directory not found: {site_packages}")
            return False
            
        print("All required directories found")
        
        # Set up environment variables
        os.environ['PYTHONHOME'] = python_dir
        os.environ['PYTHONPATH'] = os.pathsep.join([site_packages, app_dir])
        print(f"PYTHONHOME set to: {os.environ.get('PYTHONHOME')}")
        print(f"PYTHONPATH set to: {os.environ.get('PYTHONPATH')}")
        
        # Add paths to sys.path
        if app_dir not in sys.path:
            sys.path.insert(0, app_dir)
            print(f"Added path to sys.path: {app_dir}")
            
        if site_packages not in sys.path:
            sys.path.insert(0, site_packages)
            print(f"Added path to sys.path: {site_packages}")
        
        if python_dir not in sys.path:
            sys.path.insert(0, python_dir)
            print(f"Added path to sys.path: {python_dir}")
        
        # Add python to PATH
        os.environ['PATH'] = python_dir + os.pathsep + os.environ.get('PATH', '')
        print("PATH updated")
        
        print("Current sys.path:")
        for path in sys.path:
            print(f"  {path}")
            
        # Check and install dependencies
        if not check_dependencies():
            print("Error: Not all dependencies are available")
            return False
            
        print("Python environment setup completed successfully")
        return True
        
    except Exception as e:
        print(f"Error during Python environment setup: {e}")
        print("Full error stack:")
        traceback.print_exc()
        return False 