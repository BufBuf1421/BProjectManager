// zbrush-integration.example.js
// ПРИМЕР скрипта-интеграции для BProjectManager.
// Скопируйте файл, переименуйте (например my-integration.js), отредактируйте
// под своё приложение и подключите к ярлыку: правый клик по ярлыку →
// «Подключить скрипт интеграции».
//
// Что доступно внутри скрипта:
//   - объект `bpm` передаётся в каждую функцию (полное описание — docs/INTEGRATIONS.md)
//   - стандартный require Node.js (fs, path, http и т.д. — всё доступно)
//
// ВАЖНО: скрипт выполняется с полными правами пользователя.
// Не подключайте скрипты из недоверенных источников.

module.exports = {
  // Необязательное имя интеграции (используется только для логов)
  name: 'ZBrush',

  // ===== ХУК ЗАПУСКА =====
  // Вызывается при каждом клике по ярлыку (после запуска приложения).
  // project = { path, name } — выбранный в приложении проект (или path: null).
  onLaunch: async (bpm, project, pid) => {
    bpm.log('ZBrush запущен, проект:', project.name || '(не выбран)');

    if (!project.path) return;

    // Пример: гарантируем структуру папок под ZBrush в проекте
    await bpm.fs.ensureDir(bpm.path.join(project.path, 'ZBrush'));
    await bpm.fs.ensureDir(bpm.path.join(project.path, 'ZBrush', 'Tools'));
  },

  // ===== ДЕЙСТВИЯ (пункты контекстного меню ярлыка) =====
  // Правый клик по ярлыку → «▶ <title>».
  actions: [
    {
      id: 'open-project-folder',
      title: 'Открыть папку проекта',
      run: async (bpm, project) => {
        if (!project.path) {
          await bpm.dialog.message('Проект не выбран.');
          return;
        }
        await bpm.launch.open(project.path);
      },
    },

    {
      id: 'export-task-list',
      title: 'Экспорт задач проекта в tasks.txt',
      run: async (bpm, project) => {
        if (!project.path) {
          await bpm.dialog.message('Сначала выберите проект.');
          return;
        }
        const data = await bpm.getProjectData();
        const tasks = (data && Array.isArray(data.tasks)) ? data.tasks : [];
        if (tasks.length === 0) {
          await bpm.dialog.message(`В проекте "${project.name}" нет задач.`);
          return;
        }
        const lines = tasks.map((t, i) => {
          const mark = t.done ? '[x]' : '[ ]';
          return `${i + 1}. ${mark} ${t.text || '(без названия)'}`;
        });
        const content = `Задачи проекта: ${project.name}\nДата: ${new Date().toLocaleString()}\n\n${lines.join('\n')}\n`;
        const target = bpm.path.join(project.path, 'tasks.txt');
        await bpm.fs.writeFile(target, content);
        await bpm.dialog.message(`Сохранено: ${target}`);
        bpm.shell.showItemInFolder(target);
      },
    },

    {
      id: 'copy-project-path',
      title: 'Скопировать путь проекта в буфер обмена',
      run: async (bpm, project) => {
        if (!project.path) return;
        bpm.clipboard.writeText(project.path);
        await bpm.dialog.message(`Путь скопирован:\n${project.path}`);
      },
    },

    {
      id: 'launch-zbrush-with-project',
      title: 'Запустить ZBrush из папки проекта',
      run: async (bpm, project) => {
        // Читаем настройки приложения — там могут быть пути к программам
        const settings = await bpm.settings.get();
        bpm.log('Путь к Blender из настроек:', settings.blenderPath || '(не задан)');

        // Здесь можно запустить своё приложение с аргументами:
        // bpm.launch.spawn('C:/Program Files/Pixologic/ZBrush/ZBrush.exe', [], { cwd: project.path });
        await bpm.dialog.message('Пример: раскомментируйте bpm.launch.spawn(...) и укажите путь к ZBrush.');
      },
    },
  ],
};
