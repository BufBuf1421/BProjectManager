# BProjectManager

Менеджер проектов для работы с Blender и Substance Painter.

## Структура проекта

### Основные компоненты
- `main.py` - главный файл приложения
- `app_paths.py` - управление путями приложения
- `settings_dialog.py` - диалог настроек
- `styles.py` - стили интерфейса
- `version.py` - версия приложения
- `updater.py` - система обновлений
- `python_setup.py` - настройка окружения Python
- `requirements.txt` - зависимости проекта

### Управление проектами
- `project_card.py` - карточка проекта
- `project_group.py` - группа проектов
- `project_window.py` - окно проекта
- `search_panel.py` - панель поиска
- `create_project_dialog.py` - создание нового проекта
- `backup_app.py` - система резервного копирования

### Плагины и интеграции
- `plugins/` - директория плагинов
- `blender_addon.py` - аддон для Blender
- `substance_painter_plugin.py` - плагин для Substance Painter

### Ресурсы
- `icons/` - иконки и графические ресурсы

### Конфигурация
- `settings.json` - пользовательские настройки
- `projects.json` - информация о проектах

### Скрипты запуска
- `start_app.bat` - запуск приложения
- `launcher.bat` - альтернативный запуск
- `launch_sp.bat` - запуск Substance Painter

## Служебные файлы
Служебные файлы для разработки и сборки находятся в директории `C:\ProjectManager5\dev_tools` 