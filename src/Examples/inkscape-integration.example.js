// inkscape-integration.example.js
// ============================================================
// ГОТОВАЯ интеграция BProjectManager + Inkscape.
//
// Что делает:
//   1. При клике по ярлыку Inkscape (с выбранным проектом):
//        - берёт имя проекта из project.json (без индекса папки,
//          например папка "ElectricShield_00000001" → "ElectricShield");
//        - если в папке проекта ещё нет файла "<Имя проекта>.svg" —
//          создаёт его (чистый шаблон с одним слоем);
//        - запускает Inkscape и СРАЗУ открывает этот файл.
//      СУЩЕСТВУЮЩИЙ .svg никогда не перезаписывается —
//      ваша работа в безопасности.
//   2. Если проект не выбран — Inkscape откроется пустым
//      (появится подсказка; можно отключить ниже).
//   3. Действия в контекстном меню ярлыка (правый клик):
//        - «Создать / открыть SVG проекта»
//        - «Резервная копия SVG (с датой)»
//        - «Показать SVG в проводнике»
//
// Подключение: правый клик по ярлыку Inkscape →
// «📜 Подключить скрипт интеграции» → выберите этот файл.
// Полное описание системы — docs/INTEGRATIONS.md.
//
// ВАЖНО: скрипт выполняется с полными правами пользователя.
// Используйте только свои или проверенные скрипты.
// ============================================================

// ---------- НАСТРОЙКИ (можно менять под себя) ----------
const SVG_WIDTH = 1920;                  // ширина нового холста, px
const SVG_HEIGHT = 1080;                 // высота нового холста, px
const SHOW_DIALOG_WHEN_NO_PROJECT = true; // подсказка, если проект не выбран

// ---------- ХЕЛПЕРЫ ----------

/** Убирает из имени символы, запрещённые в именах файлов Windows. */
function safeFileName(name) {
  const cleaned = String(name || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim();
  return cleaned || 'Проект';
}

/** Экранирование спецсимволов XML: & < > " '. */
function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Чистое имя проекта: из project.json (без индекса папки), с фолбэком на имя папки. */
async function resolveProjectName(bpm) {
  try {
    const data = await bpm.getProjectData();
    if (data && data.name && String(data.name).trim()) return String(data.name).trim();
  } catch (err) {
    bpm.log('Не удалось прочитать project.json:', err.message);
  }
  return bpm.project.name || 'Проект';
}

/** Путь к SVG проекта: <папка проекта>/<Имя проекта>.svg */
async function projectSvgPath(bpm) {
  const name = safeFileName(await resolveProjectName(bpm));
  return { name, svgPath: bpm.path.join(bpm.project.path, `${name}.svg`) };
}

/** Минимальный корректный SVG-шаблон: белый фон, слой, подпись с именем проекта. */
function buildSvgTemplate(docName, width, height) {
  const safe = xmlEscape(docName);
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg
   xmlns="http://www.w3.org/2000/svg"
   xmlns:svg="http://www.w3.org/2000/svg"
   xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
   xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.0.dtd"
   width="${width}"
   height="${height}"
   viewBox="0 0 ${width} ${height}"
   version="1.1"
   id="svg1"
   sodipodi:docname="${safe}.svg">
  <sodipodi:namedview
     id="namedview1"
     pagecolor="#ffffff"
     bordercolor="#666666"
     inkscape:document-units="px"
     showgrid="false" />
  <defs id="defs1" />
  <g inkscape:label="Слой 1" inkscape:groupmode="layer" id="layer1">
    <rect id="background" x="0" y="0" width="${width}" height="${height}" style="fill:#ffffff;stroke:none" />
    <text id="label" x="64" y="96" style="font-size:48px;font-family:sans-serif;fill:#c0c0c0;stroke:none">${safe}</text>
  </g>
</svg>
`;
}

/** Гарантирует наличие SVG проекта. Возвращает { svgPath, created }.
 *  Существующий файл НЕ перезаписывается. */
async function ensureProjectSvg(bpm) {
  const { name, svgPath } = await projectSvgPath(bpm);
  if (await bpm.fs.exists(svgPath)) return { svgPath, created: false };
  await bpm.fs.writeFile(svgPath, buildSvgTemplate(name, SVG_WIDTH, SVG_HEIGHT));
  bpm.log('Создан SVG проекта:', svgPath);
  return { svgPath, created: true };
}

/** Открывает SVG в том приложении, которое привязано к ярлыку. */
async function openSvgInApp(bpm, svgPath) {
  const execPath = bpm.appPath || '';
  const ext = (bpm.path.extname(execPath) || '').toLowerCase();
  if (ext === '.exe') {
    // Прямой запуск: inkscape.exe "<файл>.svg"
    bpm.launch.spawn(execPath, [svgPath]);
  } else {
    // У .url и документов нет способа принять аргументы — SVG откроется
    // системным обработчиком (сопоставленным с .svg в Windows).
    // Для .lnk с целью-.exe движок сам передаёт аргументы — этот fallback
    // сработает только для остальных типов ярлыков.
    await bpm.launch.open(svgPath);
  }
}

// ---------- ЭКСПОРТ (контракт интеграции) ----------
module.exports = {
  name: 'Inkscape',

  // ===== ХУК ПЕРЕД ЗАПУСКОМ =====
  // Движок вызывает его ДО старта приложения. Что скрипт вернёт массивом —
  // то попадёт в командную строку: inkscape.exe "C:\...\ИмяПроекта.svg"
  getLaunchArgs: async (bpm, project) => {
    if (!project.path) {
      if (SHOW_DIALOG_WHEN_NO_PROJECT) {
        await bpm.dialog.message(
          'Проект не выбран — Inkscape откроется пустым.\n' +
            'Выберите проект в дереве и запустите Inkscape через ярлык ещё раз.',
          'Inkscape'
        );
      }
      return [];
    }
    const { svgPath } = await ensureProjectSvg(bpm);
    return [svgPath];
  },

  // ===== ХУК ПОСЛЕ ЗАПУСКА =====
  onLaunch: async (bpm, project) => {
    bpm.log('Inkscape запущен. Проект:', project.name || '(не выбран)');
  },

  // ===== ДЕЙСТВИЯ (пункты контекстного меню ярлыка) =====
  actions: [
    {
      id: 'create-or-open-svg',
      title: 'Создать / открыть SVG проекта',
      run: async (bpm, project) => {
        if (!project.path) {
          await bpm.dialog.message('Сначала выберите проект.', 'Inkscape');
          return;
        }
        const { svgPath } = await ensureProjectSvg(bpm);
        await openSvgInApp(bpm, svgPath);
      },
    },

    {
      id: 'backup-svg',
      title: 'Резервная копия SVG (с датой)',
      run: async (bpm, project) => {
        if (!project.path) {
          await bpm.dialog.message('Сначала выберите проект.', 'Inkscape');
          return;
        }
        const { svgPath } = await ensureProjectSvg(bpm);
        const t = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const stamp =
          `_${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}` +
          `_${pad(t.getHours())}-${pad(t.getMinutes())}`;
        const backupPath = svgPath.replace(/\.svg$/i, `${stamp}.svg`);
        await bpm.fs.copy(svgPath, backupPath);
        await bpm.dialog.message(`Копия создана:\n${backupPath}`, 'Inkscape');
        bpm.shell.showItemInFolder(backupPath);
      },
    },

    {
      id: 'show-svg-in-explorer',
      title: 'Показать SVG в проводнике',
      run: async (bpm, project) => {
        if (!project.path) {
          await bpm.dialog.message('Сначала выберите проект.', 'Inkscape');
          return;
        }
        const { svgPath } = await ensureProjectSvg(bpm);
        bpm.shell.showItemInFolder(svgPath);
      },
    },
  ],
};
