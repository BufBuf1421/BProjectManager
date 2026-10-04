module.exports = {
  name: 'Krita',

  // Хук ПЕРЕД запуском: вычисляем следующий номер версии и пишем путь
  // во временный файл внутри папки проекта. Krita запускается без аргументов,
  // а Python-плагин BPM Autosave читает этот файл и сохраняет документ.
  getLaunchArgs: async (bpm, project) => {
    if (!project.path) {
      bpm.log('[Krita] Проект не выбран — Krita откроется пустой.');
      return [];
    }

    const data = await bpm.getProjectData();
    const rawName = data?.name || project.name || 'Untitled';
    const safeName = String(rawName).replace(/[\\/:*?"<>|]/g, '_');

    // Ищем существующие версии вида "<Имя>_v001.kra", "<Имя>_v002.kra", ...
    let maxVer = 0;
    let list = [];
    try {
      list = await bpm.fs.list(project.path);
    } catch (e) {
      bpm.log(`[Krita] Не удалось прочитать папку проекта: ${e.message}`);
    }

    const re = new RegExp(`^${escapeRegExp(safeName)}_v(\\d{3})\\.kra$`);
    for (const item of list) {
      const m = item.name.match(re);
      if (m) {
        const v = parseInt(m[1], 10);
        if (v > maxVer) maxVer = v;
      }
    }

    const nextVer = String(maxVer + 1).padStart(3, '0');
    const kraPath = bpm.path.join(project.path, `${safeName}_v${nextVer}.kra`);

    // Временный файл с целевым путём — лежит рядом с проектом,
    // чтобы Python-плагин Krita нашёл его без догадок про TEMP.
    const tmpFile = bpm.path.join(project.path, '.bpm_krita_target.txt');
    await bpm.fs.writeFile(tmpFile, kraPath);
    bpm.log(`[Krita] Целевой файл: ${kraPath}`);
    bpm.log(`[Krita] Файл-указатель: ${tmpFile}`);

    // Krita запускается без аргументов — плагин сам создаст и сохранит документ.
    return [];
  },

  // Хук ПОСЛЕ запуска — можно использовать для логов или сервисных папок.
  onLaunch: async (bpm, project, pid) => {
    if (!project.path) return;
    bpm.log(`[Krita] Запущена для проекта ${project.name} (pid=${pid})`);
  },

  actions: [
    {
      id: 'show-target',
      title: 'Показать файл-указатель для Krita',
      run: async (bpm, project) => {
        if (!project.path) {
          await bpm.dialog.message('Проект не выбран.');
          return;
        }
        const tmpFile = bpm.path.join(project.path, '.bpm_krita_target.txt');
        if (await bpm.fs.exists(tmpFile)) {
          const target = await bpm.fs.readFile(tmpFile);
          await bpm.dialog.message(`Следующий файл Krita:\n${target}`);
        } else {
          await bpm.dialog.message('Файл-указатель ещё не создан.');
        }
      },
    },
    {
      id: 'list-versions',
      title: 'Список версий .kra в проекте',
      run: async (bpm, project) => {
        if (!project.path) {
          await bpm.dialog.message('Проект не выбран.');
          return;
        }
        const data = await bpm.getProjectData();
        const safeName = String(data?.name || project.name || 'Untitled')
          .replace(/[\\/:*?"<>|]/g, '_');
        const re = new RegExp(`^${escapeRegExp(safeName)}_v(\\d{3})\\.kra$`);

        const list = await bpm.fs.list(project.path);
        const versions = list
          .filter((i) => !i.isDirectory && re.test(i.name))
          .map((i) => i.name)
          .sort();

        await bpm.dialog.message(
          versions.length
            ? `Версии Krita:\n${versions.join('\n')}`
            : 'Файлов .kra этого проекта ещё нет.'
        );
      },
    },
  ],
};

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}