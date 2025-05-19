bl_info = {
    "name": "Project Manager Integration",
    "author": "BUF",
    "version": (0, 1, 0),
    "blender": (4, 3, 0),
    "location": "View3D > Sidebar > Project Manager",
    "description": "Integration with Project Manager",
    "category": "System",
}

import bpy
import os
import json
from datetime import datetime
import shutil
import subprocess
import tempfile
import sys
import argparse

class CreateProjectOperator(bpy.types.Operator):
    bl_idname = "projectmanager.create_project"
    bl_label = "Create Project"
    bl_description = "Create new project with default settings"
    
    project_path: bpy.props.StringProperty(
        name="Project Path",
        description="Path to the project directory",
        default=""
    )
    
    project_name: bpy.props.StringProperty(
        name="Project Name",
        description="Name of the project",
        default=""
    )
    
    def execute(self, context):
        try:
            if not self.project_path or not self.project_name:
                self.report({'ERROR'}, "Project path and name must be specified")
                return {'CANCELLED'}
                
            if not os.path.exists(self.project_path):
                try:
                    os.makedirs(self.project_path)
                except Exception as e:
                    self.report({'ERROR'}, f"Failed to create project directory: {str(e)}")
                    return {'CANCELLED'}
            
            # Создаем новую сцену без сброса настроек интерфейса
            bpy.ops.wm.read_homefile(load_ui=False)
            bpy.ops.outliner.orphans_purge(do_recursive=True)
            
            # Настраиваем метрическую систему
            bpy.context.scene.unit_settings.system = 'METRIC'
            bpy.context.scene.unit_settings.length_unit = 'METERS'
            
            # Настраиваем рендер движок Cycles
            bpy.context.scene.render.engine = 'CYCLES'
            bpy.context.scene.cycles.device = 'GPU'
            
            # Создаем пути для рендера
            rens_path = os.path.join(self.project_path, "Rens")
            if not os.path.exists(rens_path):
                try:
                    os.makedirs(rens_path)
                except Exception as e:
                    self.report({'ERROR'}, f"Failed to create renders directory: {str(e)}")
                    return {'CANCELLED'}
            
            # Настраиваем пути для рендера
            bpy.context.scene.render.filepath = os.path.join(rens_path, "render_")
            
            # Настраиваем формат изображения
            bpy.context.scene.render.image_settings.file_format = 'PNG'
            bpy.context.scene.render.image_settings.color_mode = 'RGBA'
            bpy.context.scene.render.image_settings.compression = 90
            
            # Настраиваем автоматическую нумерацию кадров
            bpy.context.scene.render.use_file_extension = True
            bpy.context.scene.render.use_placeholder = True
            bpy.context.scene.render.use_overwrite = False
            
            # Сохраняем файл
            blend_path = os.path.join(self.project_path, f"{self.project_name}.blend")
            try:
                bpy.ops.wm.save_as_mainfile(filepath=blend_path)
                self.report({'INFO'}, f"Project created successfully at {blend_path}")
            except Exception as e:
                self.report({'ERROR'}, f"Failed to save project file: {str(e)}")
                return {'CANCELLED'}
            
            return {'FINISHED'}
            
        except Exception as e:
            self.report({'ERROR'}, f"Failed to create project: {str(e)}")
            return {'CANCELLED'}

class ProjectManagerPanel(bpy.types.Panel):
    bl_label = "Project Manager"
    bl_idname = "VIEW3D_PT_project_manager"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = 'Project Manager'
    
    def draw(self, context):
        layout = self.layout
        
        # Получаем путь к текущему файлу
        blend_path = bpy.data.filepath
        if blend_path:
            row = layout.row()
            row.operator(SaveVersionOperator.bl_idname, text="Сохранить версию", icon='FILE_TICK')
            
            # Добавляем кнопку для обновления превью
            row = layout.row()
            row.operator(UpdatePreviewOperator.bl_idname, text="Обновить превью", icon='IMAGE_DATA')
        else:
            row = layout.row()
            row.label(text="Сначала сохраните файл")

def check_custom_preview(project_dir):
    """Проверяет, установлено ли пользовательское превью"""
    try:
        metadata_path = os.path.join(project_dir, "project_info.json")
        if os.path.exists(metadata_path):
            with open(metadata_path, 'r', encoding='utf-8') as f:
                metadata = json.load(f)
                return metadata.get("custom_preview", False)
    except Exception as e:
        print(f"Error checking custom preview: {str(e)}")
    return False

def save_preview(context, filepath):
    """Сохраняет превью текущего вида без интерфейса с соотношением сторон 16:9"""
    # Проверяем наличие пользовательского превью
    project_dir = os.path.dirname(filepath)
    if check_custom_preview(project_dir):
        print("Skipping preview update - custom preview is set")
        return

    for area in context.screen.areas:
        if area.type == 'VIEW_3D':
            # Запоминаем текущие настройки
            old_shading = area.spaces[0].shading.type
            old_overlays = area.spaces[0].overlay.show_overlays
            old_show_gizmo = area.spaces[0].show_gizmo
            old_show_region_header = area.spaces[0].show_region_header
            
            # Настраиваем отображение
            area.spaces[0].shading.type = 'MATERIAL'
            area.spaces[0].overlay.show_overlays = False
            area.spaces[0].show_gizmo = False
            area.spaces[0].show_region_header = False
            
            # Настраиваем рендер
            context.scene.render.image_settings.file_format = 'PNG'
            context.scene.render.image_settings.color_mode = 'RGBA'
            context.scene.render.image_settings.compression = 90
            
            # Рассчитываем размеры с соотношением 16:9
            base_height = 720  # Базовая высота
            width = int(base_height * (16/9))  # Ширина для соотношения 16:9
            height = base_height
            
            # Создаем новое изображение с нужным соотношением сторон
            bpy.ops.image.new(name="Preview", width=width, height=height)
            preview_image = bpy.data.images["Preview"]
            
            # Настраиваем размеры рендера
            context.scene.render.resolution_x = width
            context.scene.render.resolution_y = height
            context.scene.render.resolution_percentage = 100
            
            # Сохраняем скриншот
            context.scene.render.filepath = filepath
            bpy.ops.render.opengl(write_still=True)
            
            # Восстанавливаем настройки
            area.spaces[0].shading.type = old_shading
            area.spaces[0].overlay.show_overlays = old_overlays
            area.spaces[0].show_gizmo = old_show_gizmo
            area.spaces[0].show_region_header = old_show_region_header
            
            # Удаляем временное изображение
            bpy.data.images.remove(preview_image)
            break

class SaveVersionOperator(bpy.types.Operator):
    bl_idname = "projectmanager.save_version"
    bl_label = "Save Version"
    bl_description = "Save a new version of the file"
    
    def execute(self, context):
        try:
            current_file = bpy.data.filepath
            if not current_file:
                self.report({'ERROR'}, "File not saved")
                return {'CANCELLED'}
            
            # Получаем путь к папке проекта и имя файла
            project_dir = os.path.dirname(current_file)
            file_name = os.path.basename(current_file)
            name_without_ext = os.path.splitext(file_name)[0]
            
            # Путь к папке с версиями
            versions_dir = os.path.join(project_dir, "BVersions")
            
            # Проверяем существование папки BVersions, если нет - создаем
            if not os.path.exists(versions_dir):
                try:
                    os.makedirs(versions_dir)
                    self.report({'INFO'}, "Created BVersions directory")
                except Exception as e:
                    self.report({'ERROR'}, f"Failed to create BVersions directory: {str(e)}")
                    return {'CANCELLED'}
            
            # Создаем имя для версии файла
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            version_name = f"{name_without_ext}_v{timestamp}.blend"
            version_path = os.path.join(versions_dir, version_name)
            
            # Сохраняем текущую версию в папку BVersions
            shutil.copy2(current_file, version_path)
            
            # Сохраняем текущий файл
            bpy.ops.wm.save_mainfile()
            
            # Создаем превью только если нет пользовательского
            preview_path = os.path.join(project_dir, "preview.png")
            if not check_custom_preview(project_dir):
            save_preview(context, preview_path)
                self.report({'INFO'}, f"Version saved with preview: {version_name}")
            else:
                self.report({'INFO'}, f"Version saved (custom preview preserved): {version_name}")
            
            return {'FINISHED'}
            
        except Exception as e:
            self.report({'ERROR'}, f"Failed to save version: {str(e)}")
            return {'CANCELLED'}

class UpdatePreviewOperator(bpy.types.Operator):
    bl_idname = "projectmanager.update_preview"
    bl_label = "Update Preview"
    bl_description = "Update project preview"
    
    def execute(self, context):
        try:
            current_file = bpy.data.filepath
            if not current_file:
                self.report({'ERROR'}, "File not saved")
                return {'CANCELLED'}
            
            # Получаем путь к папке проекта
            project_dir = os.path.dirname(current_file)
            
            # Проверяем наличие пользовательского превью
            if check_custom_preview(project_dir):
                self.report({'WARNING'}, "Cannot update custom preview")
                return {'CANCELLED'}
            
            # Создаем превью
            preview_path = os.path.join(project_dir, "preview.png")
            save_preview(context, preview_path)
            
            self.report({'INFO'}, "Preview updated successfully")
            return {'FINISHED'}
            
        except Exception as e:
            self.report({'ERROR'}, f"Failed to update preview: {str(e)}")
            return {'CANCELLED'}

def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument('--project-path', type=str, help='Path to the project directory')
    parser.add_argument('--project-name', type=str, help='Name of the project')
            
    # Находим разделитель '--' в аргументах
    try:
        separator_index = sys.argv.index('--')
        args = parser.parse_args(sys.argv[separator_index + 1:])
        return args
    except (ValueError, IndexError):
        return None

def auto_save_preview(scene):
    """Автоматически обновляет превью при сохранении файла"""
    if bpy.data.is_saved:
        filepath = bpy.data.filepath
        if filepath:
            project_dir = os.path.dirname(filepath)
            # Проверяем наличие пользовательского превью
            if not check_custom_preview(project_dir):
                preview_path = os.path.join(project_dir, "preview.png")
                save_preview(bpy.context, preview_path)

# Регистрация классов
classes = (
    ProjectManagerPanel,
    SaveVersionOperator,
    UpdatePreviewOperator,
    CreateProjectOperator,
)

def register():
    for cls in classes:
        bpy.utils.register_class(cls)
    
    # Проверяем аргументы командной строки
    args = parse_args()
    if args and args.project_path and args.project_name:
        # Создаем новый проект
        bpy.ops.projectmanager.create_project(
            project_path=args.project_path,
            project_name=args.project_name
        )
    
    # Добавляем обработчик для автоматического обновления превью
    bpy.app.handlers.save_post.append(auto_save_preview)

def unregister():
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)
    
    # Удаляем обработчик
    if auto_save_preview in bpy.app.handlers.save_post:
        bpy.app.handlers.save_post.remove(auto_save_preview)

if __name__ == "__main__":
    register() 