import sys
from PyQt6.QtWidgets import QApplication, QMainWindow, QPushButton

print("Script started")

app = QApplication(sys.argv)
print("QApplication created")

window = QMainWindow()
print("Window created")

button = QPushButton("Test Button")
window.setCentralWidget(button)

window.show()
print("Window shown")

sys.exit(app.exec()) 