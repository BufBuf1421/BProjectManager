# save_blend.py
# Скрипт автосохранения .blend файла с преднастройкой структуры под меши.
#
# Запуск:
#   blender --background --python save_blend.py -- <filepath> <config_json>
#
# Аргументы после "--":
#   argv[0] — путь к .blend файлу для сохранения
#   argv[1] — JSON-строка конфигурации:
#             {
#               "mode": "single" | "multi",
#               "meshes": ["SM_Cube_00", "SM_Sphere_01", ...],
#               "meshIndex": int  (только для multi — индекс меша в массиве meshes)
#             }
#
# Логика:
#   - single: в одном файле создаём коллекции для всех мешей (без префикса SM_),
#     в каждой коллекции — куб с именем меша (с SM_).
#   - multi: создаём только один меш (meshes[meshIndex]) — скрипт вызывается
#     N раз из renderer.js, по разу для каждого меша.
#
# Имена коллекций: если имя меша начинается с "SM_", убираем этот префикс.
#   SM_Cube_00 → коллекция "Cube_00", куб "SM_Cube_00"
#
# Превью не генерируется — оно устанавливается вручную
# через механизм превью приложения.

import bpy
import sys
import json


def collection_name_from_mesh(mesh_name):
    """Убираем префикс SM_ если есть."""
    if mesh_name.startswith('SM_'):
        return mesh_name[3:]
    return mesh_name


def clear_scene():
    """Полностью очищаем стандартную сцену."""
    # Удаляем все объекты
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)

    # Удаляем все меши из данных
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)

    # Удаляем все коллекции кроме Scene Collection (её удалить нельзя)
    for col in list(bpy.data.collections):
        bpy.data.collections.remove(col)


def add_mesh_to_collection(mesh_name):
    """Создаёт коллекцию для меша и куб с этим именем внутри."""
    coll_name = collection_name_from_mesh(mesh_name)

    # Создаём новую коллекцию и линкуем её в сцену
    coll = bpy.data.collections.new(coll_name)
    bpy.context.scene.collection.children.link(coll)

    # Создаём куб
    bpy.ops.mesh.primitive_cube_add(size=2.0, location=(0, 0, 0))
    cube = bpy.context.active_object
    cube.name = mesh_name

    # Переносим куб из Scene Collection в нашу коллекцию
    coll.objects.link(cube)
    bpy.context.scene.collection.objects.unlink(cube)

    return coll, cube


def main():
    argv = sys.argv
    argv = argv[argv.index("--") + 1:] if "--" in argv else []

    if len(argv) < 1:
        print("ERROR: Не указан путь для сохранения")
        sys.exit(1)

    filepath = argv[0]

    # Конфигурация (опциональная — если нет, просто сохраняем пустой файл)
    config = {}
    if len(argv) >= 2:
        try:
            config = json.loads(argv[1])
        except json.JSONDecodeError as e:
            print(f"ERROR: Неверный JSON конфигурации: {e}")
            sys.exit(1)

    mode = config.get('mode', 'single')
    meshes = config.get('meshes', [])
    mesh_index = config.get('meshIndex', -1)

    # Очищаем сцену перед началом работы
    clear_scene()

    if mode == 'multi':
        # multi: создаём только один меш (по индексу)
        if mesh_index < 0 or mesh_index >= len(meshes):
            print(f"ERROR: Неверный meshIndex {mesh_index} для списка из {len(meshes)} мешей")
            sys.exit(1)
        mesh_name = meshes[mesh_index]
        add_mesh_to_collection(mesh_name)
        print(f"Mesh created: {mesh_name}")
    else:
        # single: создаём все меши в одном файле
        for mesh_name in meshes:
            add_mesh_to_collection(mesh_name)
            print(f"Mesh created: {mesh_name}")

    # Сохраняем файл
    bpy.ops.wm.save_as_mainfile(filepath=filepath)
    print(f"File saved: {filepath}")


if __name__ == '__main__':
    main()
