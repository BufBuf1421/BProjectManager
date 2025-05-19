import substance_painter
import os

def create_project(mesh_path, export_path, project_path):
    # Создаем новый проект
    project = substance_painter.project.create(
        mesh_path,
        project_path,
        resolution=2048,
        normal_map_format="OpenGL"
    )
    
    # Устанавливаем путь экспорта
    substance_painter.export.set_export_path(export_path)
    
    # Сохраняем проект
    substance_painter.project.save()

def save_project():
    # Получаем текущий проект
    project = substance_painter.project

    # Получаем путь к текущей модели
    mesh_path = project.mesh_file_path()
    
    if not mesh_path:
        print("Модель не загружена")
        return
        
    # Получаем путь к папке проекта (родительская папка Export/models)
    project_path = os.path.dirname(os.path.dirname(os.path.dirname(mesh_path)))
    
    # Получаем имя проекта из имени папки
    project_name = os.path.basename(project_path)
    
    # Формируем путь для сохранения .spp файла
    spp_file = os.path.join(project_path, f"{project_name}.spp")
    
    # Устанавливаем путь экспорта текстур
    export_path = os.path.join(project_path, "Export", "Textures")
    substance_painter.export.set_export_path(export_path)
    
    # Сохраняем проект
    project.save_as(spp_file)
    print(f"Проект сохранен: {spp_file}")
    print(f"Путь экспорта текстур: {export_path}")

if __name__ == "__main__":
    import sys
    if len(sys.argv) != 4:
        print("Usage: python substance_painter_plugin.py mesh_path export_path project_path")
        sys.exit(1)
        
    mesh_path = sys.argv[1]
    export_path = sys.argv[2] 
    project_path = sys.argv[3]
    
    create_project(mesh_path, export_path, project_path)
    save_project() 