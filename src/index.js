// src/index.js
// Main process. Все IPC-обработчики сгруппированы по доменам:
//   - Константы и пути
//   - Утилиты
//   - Жизненный цикл окна
//   - Настройки
//   - Шаблоны проектов
//   - Проекты (CRUD, статус, избранное, превью)
//   - Локальные задачи (project.json)
//   - Теги
//   - Заметки
//   - Файлы и директории
//   - Запуск внешних приложений
//   - Наблюдение за файловой системой (live-обновление UI)
//   - Авторизация и задачи Supabase

const { app, BrowserWindow, ipcMain, dialog, shell, webUtils, clipboard } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const vm = require('vm');
const { spawn } = require('child_process');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

// ===== КОНСТАНТЫ И ПУТИ =====
const IS_DEV = process.env.NODE_ENV === 'development' || !!process.env.ELECTRON_IS_DEV;
const userDataPath = app.getPath('userData');
const settingsPath = path.join(userDataPath, 'settings.json');
const templatePath = path.join(__dirname, '../data/template.json'); // старый путь (для миграции)
const templatesPath = path.join(userDataPath, 'templates.json'); // новый путь
const projectIdCounterPath = path.join(userDataPath, 'project_id_counter.json');

// Возможные имена файлов-превью в папке проекта (по приоритету).
// Опечатка "prewiew" сохранена ради обратной совместимости со старыми проектами.
const PREVIEW_FILENAMES = [
  'preview.jpg', 'preview.jpeg', 'preview.png', 'preview.webp',
  'preview_image.jpg', 'preview_image.jpeg', 'preview_image.png', 'preview_image.webp',
  'prewiew.jpg', 'prewiew.jpeg', 'prewiew.png', 'prewiew.webp',
  'prewiew_image.jpg', 'prewiew_image.jpeg', 'prewiew_image.png', 'prewiew_image.webp',
  'thumbnail.jpg', 'thumbnail.png',
];

// ===== УТИЛИТЫ =====

/** Преобразует абсолютный путь файловой системы в file:// URL.
 *  ВАЖНО: encodeURI не кодирует "#" и "?" — а они ломают URL
 *  (всё после "#" превращается во фрагмент). Кодируем их вручную. */
function toFileUrl(filePath) {
  if (!filePath) return '';
  const encoded = encodeURI(filePath.replace(/\\/g, '/'))
    .replace(/#/g, '%23')
    .replace(/\?/g, '%3F');
  return `file:///${encoded}`;
}

/** Унифицированный ответ об ошибке. */
function fail(error, extra = {}) {
  const message = error?.message ?? String(error);
  console.error(message);
  return { success: false, error: message, ...extra };
}

/** Унифицированный успешный ответ. */
function ok(payload = {}) {
  return { success: true, ...payload };
}

/** Читает project.json "как есть" (без проверки на пустоту).
 *  Возвращает объект или null если файл не существует / невалидный JSON. */
async function readRawProjectJson(projectPath) {
  try {
    const data = await fs.readJson(path.join(projectPath, 'project.json'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return null;
    }
    return data;
  } catch {
    // readJson падает если файл пустой, не существует, или содержит невалидный JSON
    return null;
  }
}

/** Проверяет, что данные project.json пригодны для работы:
 *  есть непустое имя (string) и заданный id. Именно эти поля жёстко
 *  валидирует writeProjectJson — без них любая запись упадёт. */
function isUsableProjectData(data) {
  return !!(
    data &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    typeof data.name === 'string' &&
    data.name.trim() &&
    typeof data.id !== 'undefined' &&
    data.id !== null
  );
}

/** Асинхронно читает project.json из папки проекта.
 *  Возвращает объект или null если файл повреждён/пустой
 *  (в т.ч. пустой объект {} без имени и id). */
async function readProjectJson(projectPath) {
  const data = await readRawProjectJson(projectPath);
  return isUsableProjectData(data) ? data : null;
}

/** Отделяет числовой индекс от имени папки проекта.
 *  Папки создаются как "Имя_проекта_индекс" (например, ElectricShield_00000001),
 *  но поддерживаются и другие варианты: "Проект 05", "Проект-05", "Проект_05".
 *  Возвращает { name, index }: index = null, если индекса в конце нет. */
function splitFolderNameAndIndex(folderName) {
  const match = folderName.match(/[\s_-]+(\d+)$/);
  if (!match) return { name: folderName, index: null };
  const name = folderName.slice(0, match.index).trim();
  return { name: name || folderName, index: match[1] };
}

/** Рекурсивно ищет .blend-файлы в папке проекта и возвращает дату изменения
 *  самого свежего из них (или null, если .blend-файлов нет).
 *  Скрытые папки и символические ссылки пропускаем (защита от зацикливания),
 *  глубину рекурсии ограничиваем. */
async function getLatestBlendMtime(projectPath, maxDepth = 6) {
  let latest = null;
  const walk = async (dir, depth) => {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.isSymbolicLink()) continue;
        await walk(fullPath, depth + 1);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.blend')) {
        const st = await fs.stat(fullPath).catch(() => null);
        if (st && st.mtime && (!latest || st.mtime > latest)) latest = st.mtime;
      }
    }
  };
  await walk(projectPath, 0);
  return latest;
}

/** Восстанавливает project.json для пустых/повреждённых файлов.
 *  Логика восстановления:
 *   - имя проекта = имя папки без числового индекса в конце
 *     (ElectricShield_00000001 → ElectricShield);
 *   - id = индекс из имени папки, если он есть (иначе — имя папки);
 *   - дата проекта = дата последнего изменения самого свежего .blend-файла
 *     (ищем рекурсивно); если .blend нет — дата изменения папки;
 *   - статус = 'issue' — проект требует внимания: метаданные были потеряны.
 *  Поля, которые удалось прочитать из повреждённого файла (partial),
 *  сохраняются — восстанавливаются только отсутствующие. */
async function recoverProjectJson(projectPath, partial = {}) {
  const folderName = path.basename(projectPath);
  const { name: nameFromFolder, index } = splitFolderNameAndIndex(folderName);
  const p = (partial && typeof partial === 'object' && !Array.isArray(partial)) ? partial : {};

  // Дата проекта: самый свежий .blend → mtime папки → текущая дата
  let createdAt = null;
  try {
    createdAt = await getLatestBlendMtime(projectPath);
  } catch (err) {
    console.warn('recoverProjectJson: не удалось найти .blend-файлы:', err);
  }
  if (!createdAt) {
    const stat = await fs.stat(projectPath).catch(() => null);
    createdAt = stat && stat.mtime ? stat.mtime : null;
  }

  const recovered = {
    name: (typeof p.name === 'string' && p.name.trim()) ? p.name : nameFromFolder,
    id: (p.id !== undefined && p.id !== null && p.id !== '') ? p.id : (index || folderName),
    createdAt: (typeof p.createdAt === 'string' && p.createdAt)
      ? p.createdAt
      : (createdAt ? createdAt.toISOString() : new Date().toISOString()),
    status: (typeof p.status === 'string' && p.status) ? p.status : 'issue',
    archived: typeof p.archived === 'boolean' ? p.archived : false,
    tags: Array.isArray(p.tags) ? p.tags : [],
    tasks: Array.isArray(p.tasks) ? p.tasks : [],
    notes: typeof p.notes === 'string' ? p.notes : '',
    favorite: typeof p.favorite === 'boolean' ? p.favorite : false,
  };

  // Записываем восстановленные данные (атомарно — через временный файл).
  // Если диск только для чтения — работаем с данными в памяти: файл
  // перезапишется при следующем успешном сохранении (заметки, задачи и т.д.).
  try {
    await writeProjectJson(projectPath, recovered);
    console.log(`project.json восстановлен для: ${folderName}`);
  } catch (err) {
    console.warn(`project.json восстановлен в памяти (запись не удалась): ${folderName}`, err);
  }
  return recovered;
}

/** Безопасно читает project.json с автовосстановлением.
 *  Если файл пустой/повреждённый — восстанавливает структуру и возвращает её.
 *  Поля, которые удалось прочитать, сохраняются. */
async function readProjectJsonWithRecovery(projectPath) {
  const raw = await readRawProjectJson(projectPath);
  if (isUsableProjectData(raw)) return raw;
  return await recoverProjectJson(projectPath, raw || {});
}

/** Асинхронно записывает project.json в папку проекта.
 *  ВАЖНО: жёстко валидирует data и пишет АТОМАРНО (через временный файл).
 *  Если процесс прервать в середине записи, оригинальный project.json не пострадает. */
async function writeProjectJson(projectPath, data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    console.error('writeProjectJson: попытка записать невалидные данные:', typeof data, data);
    throw new Error('Попытка записать невалидные данные в project.json');
  }
  if (typeof data.name !== 'string' || typeof data.id === 'undefined') {
    console.error('writeProjectJson: данные не содержат обязательные поля (name, id):', data);
    throw new Error('Данные project.json не содержат обязательные поля');
  }

  // Атомарная запись: пишем во временный файл, потом переименовываем.
  // fs.rename — атомарная операция на уровне ОС. Если процесс прервать
  // во время записи project.json.tmp, оригинальный project.json останется нетронутым.
  const filePath = path.join(projectPath, 'project.json');
  const tempPath = path.join(projectPath, 'project.json.tmp');
  await fs.writeJson(tempPath, data, { spaces: 2 });
  await fs.rename(tempPath, filePath);
}

// ===== ШАБЛОНЫ ПРОЕКТОВ =====
// Хранение: userData/templates.json
// Структура:
//   {
//     "templates": [
//       { "id": "tpl_xxx", "name": "MainTemplate", "folders": [...], "files": [] }
//     ],
//     "defaultTemplateId": "tpl_xxx"
//   }
//
// Миграция: если templates.json не существует, но есть старый data/template.json —
// импортируем его как первый шаблон и делаем дефолтным.
const DEFAULT_TEMPLATE = {
  name: 'MainTemplate',
  folders: ['Models', 'Textures', 'Export/TosP', 'Export/FBX', 'Export/Anim', 'Ren/Fin', 'References', 'Backup'],
  files: [],
};

function makeTemplateId() {
  return `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Загружает все шаблоны из templates.json. При необходимости делает миграцию. */
async function loadTemplatesData() {
  // Если новый файл существует — читаем его
  if (await fs.pathExists(templatesPath)) {
    try {
      const data = await fs.readJson(templatesPath);
      // Гарантируем корректную структуру
      if (!Array.isArray(data.templates)) data.templates = [];
      if (!data.defaultTemplateId && data.templates.length > 0) {
        data.defaultTemplateId = data.templates[0].id;
      }
      return data;
    } catch (error) {
      console.error('Ошибка чтения templates.json:', error);
    }
  }

  // Миграция со старого template.json, если он есть
  if (await fs.pathExists(templatePath)) {
    try {
      const oldTemplate = await fs.readJson(templatePath);
      const id = makeTemplateId();
      const migrated = {
        templates: [
          {
            id,
            name: oldTemplate.name || 'MainTemplate',
            folders: Array.isArray(oldTemplate.folders) ? oldTemplate.folders : [],
            files: Array.isArray(oldTemplate.files) ? oldTemplate.files : [],
          },
        ],
        defaultTemplateId: id,
      };
      await fs.writeJson(templatesPath, migrated, { spaces: 2 });
      return migrated;
    } catch (error) {
      console.error('Ошибка миграции template.json:', error);
    }
  }

  // Дефолтный шаблон, если ничего нет
  const id = makeTemplateId();
  const fresh = {
    templates: [{ id, ...DEFAULT_TEMPLATE }],
    defaultTemplateId: id,
  };
  await fs.writeJson(templatesPath, fresh, { spaces: 2 });
  return fresh;
}

/** Сохраняет объект templates в templates.json. */
async function saveTemplatesData(data) {
  await fs.writeJson(templatesPath, data, { spaces: 2 });
}

/**
 * Возвращает шаблон по id, либо дефолтный, либо первый.
 * @param {string|null|undefined} templateId
 */
async function getTemplateById(templateId) {
  const data = await loadTemplatesData();
  if (templateId) {
    const found = data.templates.find((t) => t.id === templateId);
    if (found) return found;
  }
  if (data.defaultTemplateId) {
    const def = data.templates.find((t) => t.id === data.defaultTemplateId);
    if (def) return def;
  }
  return data.templates[0] || { ...DEFAULT_TEMPLATE, id: makeTemplateId() };
}

/**
 * Генерирует следующий 8-значный числовой ID проекта на основе файла-счётчика.
 * Вызовы сериализуются через promise-цепочку: быстрые повторные запуски
 * (двойной клик по "Создать") не должны дважды прочитать счётчик до записи,
 * иначе два проекта получат одинаковый ID.
 * @returns {Promise<string>}
 */
let projectIdGeneration = Promise.resolve();

function generateProjectIdInternal() {
  return (async () => {
    let counter = 1;
    if (await fs.pathExists(projectIdCounterPath)) {
      try {
        const data = await fs.readJson(projectIdCounterPath);
        counter = (data.lastId || 0) + 1;
      } catch {
        counter = 1;
      }
    }
    await fs.writeJson(projectIdCounterPath, { lastId: counter }, { spaces: 2 });
    return String(counter).padStart(8, '0');
  })();
}

function generateProjectId() {
  const run = projectIdGeneration.then(generateProjectIdInternal, generateProjectIdInternal);
  // Не даём цепочке "сломаться" при ошибке — следующий вызов всё равно выполнится
  projectIdGeneration = run.then(() => undefined, () => undefined);
  return run;
}

/**
 * Создаёт структуру папок и project.json для нового проекта.
 * @param {string} projectsRootPath - корневая папка всех проектов
 * @param {string} projectName - отображаемое имя проекта
 * @param {string} [projectId] - опциональный ID (если нет — генерируется новый)
 * @param {string[]} [meshes] - опциональный список имён мешей из Supabase
 * @param {string} [templateId] - опциональный id шаблона; если нет — дефолтный
 * @param {string} [checkList] - опциональный чек-лист из Supabase (задачи через ";")
 * @param {string} [note] - опциональные заметки из Supabase
 * @returns {Promise<{success: boolean, path?: string, id?: string, error?: string}>}
 */
async function createProjectInternal(projectsRootPath, projectName, projectId, meshes = [], templateId, checkList, note) {
  if (!projectId) {
    projectId = await generateProjectId();
  }

  // Санитизируем имя проекта для использования в имени папки:
  // убираем недопустимые символы \ / : * ? " < > |
  const safeName = (projectName || 'Project').replace(/[\\/:*?"<>|]/g, '_').trim() || 'Project';

  // Имя папки = Имя_проекта_индекс (например, ElectricShield_00000001)
  const folderName = `${safeName}_${projectId}`;
  const folderPath = path.join(projectsRootPath, folderName);
  const template = await getTemplateById(templateId);

  await fs.ensureDir(folderPath);

  if (Array.isArray(template.folders)) {
    for (const folder of template.folders) {
      // Папки могут содержать "/" — это подпапки. path.join это переварит.
      await fs.ensureDir(path.join(folderPath, folder));
    }
  }

  // Превращаем список имён мешей в готовые задачи чек-листа.
  // Каждой задаче даём уникальный id и метку type: 'mesh',
  // чтобы UI мог показать рядом кнопку "Скопировать в буфер обмена".
  const meshTasks = (Array.isArray(meshes) ? meshes : []).map((meshName, index) => ({
    id: `mesh_${Date.now()}_${index}`,
    text: meshName,
    done: false,
    type: 'mesh',
    createdAt: new Date().toISOString(),
  }));

  // Превращаем чек-лист из Supabase (строка через ";") в обычные задачи.
  // Эти задачи отображаются в чек-листе как обычные (без type: 'mesh').
  const checkListItems = (typeof checkList === 'string' && checkList.trim())
    ? checkList.split(';').map((s) => s.trim()).filter((s) => s)
    : [];
  const checkListTasks = checkListItems.map((text, index) => ({
    id: `task_${Date.now()}_${index}`,
    text,
    done: false,
    createdAt: new Date().toISOString(),
  }));

  const projectData = {
    name: projectName,
    id: projectId,
    createdAt: new Date().toISOString(),
    status: 'open',
    archived: false,
    tags: [],
    tasks: [...meshTasks, ...checkListTasks],
    notes: note || '',
    favorite: false,
  };
  await writeProjectJson(folderPath, projectData);

  // Дополнительные файлы из шаблона (кроме project.json — он уже создан)
  if (Array.isArray(template.files)) {
    for (const file of template.files) {
      if (file.name === 'project.json') continue;
      const filePath = path.join(folderPath, file.name);
      await fs.ensureDir(path.dirname(filePath));
      if (file.content) {
        const content =
          typeof file.content === 'object'
            ? JSON.stringify(file.content, null, 2)
            : file.content;
        await fs.writeFile(filePath, content);
      } else {
        await fs.ensureFile(filePath);
      }
    }
  }

  return { success: true, path: folderPath, id: projectId };
}

/** Ищет превью проекта: сначала по списку имён, потом рядом с .blend-файлами. */
async function findProjectPreview(projectPath) {
  // 1. Ищем готовые файлы превью
  for (const name of PREVIEW_FILENAMES) {
    const candidate = path.join(projectPath, name);
    if (await fs.pathExists(candidate)) {
      return toFileUrl(candidate);
    }
  }

  // 2. Ищем .blend-файлы и пробуем их стандартные превью (blend.blend.jpg)
  const items = await fs.readdir(projectPath).catch(() => []);
  const blendFiles = items.filter((item) => item.toLowerCase().endsWith('.blend'));
  for (const blendFile of blendFiles) {
    const blendPath = path.join(projectPath, blendFile);
    const blendPreviewPath = `${blendPath}.jpg`;
    if (await fs.pathExists(blendPreviewPath)) {
      return toFileUrl(blendPreviewPath);
    }
  }

  return null;
}

// ===== ЖИЗНЕННЫЙ ЦИКЛ ОКНА =====
async function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  try {
    const settingsExists = await fs.pathExists(settingsPath);
    win.loadFile(settingsExists ? 'src/index.html' : 'src/settings.html');
  } catch (error) {
    console.error('Ошибка при запуске:', error);
    win.loadFile('src/settings.html');
  }

  if (IS_DEV) {
    win.webContents.openDevTools();
  }
}

// ===== НАСТРОЙКИ =====
ipcMain.handle('check-settings', async () => {
  try {
    return ok({ exists: await fs.pathExists(settingsPath) });
  } catch (error) {
    return fail(error, { exists: false });
  }
});

ipcMain.handle('load-settings', async () => {
  try {
    if (!(await fs.pathExists(settingsPath))) {
      return fail(new Error('Файл настроек не найден'));
    }
    const data = await fs.readJson(settingsPath);
    return ok({
      settings: {
        ...data,
        supabaseUrl: data.supabaseUrl || '',
        supabaseKey: data.supabaseKey || '',
      },
    });
  } catch (error) {
    return fail(error);
  }
});

ipcMain.handle('save-settings', async (_event, settings) => {
  try {
    await fs.ensureDir(path.dirname(settingsPath));
    await fs.writeJson(settingsPath, settings, { spaces: 2 });
    return ok();
  } catch (error) {
    return fail(error);
  }
});

// ===== ШАБЛОН =====
// ===== ШАБЛОНЫ: IPC =====

// Список всех шаблонов (для UI настроек и для модалки создания проекта)
ipcMain.handle('templates-list', async () => {
  try {
    const data = await loadTemplatesData();
    return ok({ templates: data.templates, defaultTemplateId: data.defaultTemplateId });
  } catch (error) {
    return fail(error);
  }
});

// Сохраняет (создаёт или обновляет) один шаблон.
// template = {id?, name, folders, files}
// Если id нет — создаётся новый с генерируемым id.
// Возвращает итоговый шаблон (с id).
ipcMain.handle('templates-save', async (_event, template) => {
  try {
    if (!template || !template.name || !template.name.trim()) {
      return fail(new Error('Имя шаблона обязательно'));
    }
    const data = await loadTemplatesData();
    const name = template.name.trim();
    const folders = Array.isArray(template.folders) ? template.folders : [];
    const files = Array.isArray(template.files) ? template.files : [];

    let saved;
    if (template.id) {
      // Обновляем существующий
      const idx = data.templates.findIndex((t) => t.id === template.id);
      if (idx === -1) {
        return fail(new Error('Шаблон не найден'));
      }
      // Проверяем уникальность имени (кроме самого себя)
      if (data.templates.some((t) => t.id !== template.id && t.name === name)) {
        return fail(new Error('Шаблон с таким именем уже существует'));
      }
      saved = { ...data.templates[idx], name, folders, files };
      data.templates[idx] = saved;
    } else {
      // Создаём новый
      if (data.templates.some((t) => t.name === name)) {
        return fail(new Error('Шаблон с таким именем уже существует'));
      }
      saved = { id: makeTemplateId(), name, folders, files };
      data.templates.push(saved);
      // Если это первый шаблон — делаем его дефолтным
      if (!data.defaultTemplateId) {
        data.defaultTemplateId = saved.id;
      }
    }

    await saveTemplatesData(data);
    return ok({ template: saved, defaultTemplateId: data.defaultTemplateId });
  } catch (error) {
    return fail(error);
  }
});

// Удаляет шаблон по id. Если удалили дефолтный — назначаем новый дефолт.
ipcMain.handle('templates-delete', async (_event, templateId) => {
  try {
    if (!templateId) return fail(new Error('ID шаблона не указан'));
    const data = await loadTemplatesData();
    const idx = data.templates.findIndex((t) => t.id === templateId);
    if (idx === -1) return fail(new Error('Шаблон не найден'));

    data.templates.splice(idx, 1);

    // Если удалили дефолтный — назначаем первый оставшийся (или null)
    if (data.defaultTemplateId === templateId) {
      data.defaultTemplateId = data.templates.length > 0 ? data.templates[0].id : null;
    }

    await saveTemplatesData(data);
    return ok({ templates: data.templates, defaultTemplateId: data.defaultTemplateId });
  } catch (error) {
    return fail(error);
  }
});

// Назначает шаблон по умолчанию для всего приложения
ipcMain.handle('templates-set-default', async (_event, templateId) => {
  try {
    if (!templateId) return fail(new Error('ID шаблона не указан'));
    const data = await loadTemplatesData();
    if (!data.templates.some((t) => t.id === templateId)) {
      return fail(new Error('Шаблон не найден'));
    }
    data.defaultTemplateId = templateId;
    await saveTemplatesData(data);
    return ok({ defaultTemplateId: templateId });
  } catch (error) {
    return fail(error);
  }
});

// Обратная совместимость: load-template возвращает дефолтный шаблон
// (старый код мог использовать его для предпросмотра структуры)
ipcMain.handle('load-template', async () => {
  try {
    const data = await loadTemplatesData();
    const def = data.templates.find((t) => t.id === data.defaultTemplateId) || data.templates[0];
    if (!def) return fail(new Error('Шаблоны не найдены'));
    return ok({ template: def });
  } catch (error) {
    return fail(error);
  }
});

// ===== ПРОЕКТЫ =====
ipcMain.handle('get-projects', async (_event, projectsPath) => {
  try {
    if (!projectsPath) return fail(new Error('Путь к проектам не указан'));
    if (!(await fs.pathExists(projectsPath))) {
      return fail(new Error('Каталог проектов не существует'));
    }

    const items = await fs.readdir(projectsPath);
    // Сканируем папки ПАРАЛЛЕЛЬНО — на сетевых дисках (NAS) это заметно быстрее,
    // чем последовательный обход. Promise.all сохраняет порядок элементов.
    const projects = (
      await Promise.all(
        items.map(async (item) => {
          const itemPath = path.join(projectsPath, item);
          const stat = await fs.stat(itemPath).catch(() => null);
          if (!stat || !stat.isDirectory()) return null;

          // Автовосстановление: пустой/повреждённый project.json пересоздаётся
          // (имя = папка без индекса, дата = самый свежий .blend, статус = issue),
          // папка без project.json получает его автоматически.
          // В скрытые/системные папки (., $RECYCLE.BIN и т.п.) ничего не пишем.
          let data = null;
          if (item.startsWith('.') || item.startsWith('$')) {
            data = await readProjectJson(itemPath);
          } else {
            try {
              data = await readProjectJsonWithRecovery(itemPath);
            } catch (err) {
              console.warn(`get-projects: автовосстановление не удалось: ${itemPath}`, err);
            }
          }

          if (data) {
            return {
              id: itemPath,
              name: data.name || item,
              projectId: data.id || item,
              status: data.status || 'open',
              archived: data.archived || false,
              path: itemPath,
              tags: data.tags || [],
              tasks: data.tasks || [],
              notes: data.notes || '',
              favorite: data.favorite || false,
              createdAt: data.createdAt || (stat.birthtime ? stat.birthtime.toISOString() : new Date().toISOString()),
              // Дата последнего изменения папки проекта — для сортировки "по изменению"
              modifiedAt: stat.mtime ? stat.mtime.toISOString() : undefined,
            };
          }

          // Восстановить не удалось (например, диск только для чтения) —
          // показываем папку как "активный" без метаданных (прежнее поведение)
          return {
            id: itemPath,
            name: item,
            status: 'active',
            archived: false,
            path: itemPath,
            tags: [],
            tasks: [],
            notes: '',
            favorite: false,
            createdAt: stat.birthtime ? stat.birthtime.toISOString() : new Date().toISOString(),
          };
        })
      )
    ).filter(Boolean);

    return ok({ projects });
  } catch (error) {
    return fail(error);
  }
});

ipcMain.handle('create-project', async (_event, projectsRootPath, projectName, templateId, checkList, note) => {
  try {
    // Без projectId и meshes — обычное создание пустого проекта
    return await createProjectInternal(projectsRootPath, projectName, undefined, [], templateId, checkList, note);
  } catch (error) {
    return fail(error);
  }
});

ipcMain.handle('create-project-with-id', async (_event, projectsPath, projectName, projectId, meshes, templateId, checkList, note) => {
  try {
    return await createProjectInternal(projectsPath, projectName, projectId, meshes, templateId, checkList, note);
  } catch (error) {
    return fail(error);
  }
});

ipcMain.handle('generate-project-id', async () => {
  try {
    return ok({ id: await generateProjectId() });
  } catch (error) {
    return fail(error);
  }
});

ipcMain.handle('rename-project', async (_event, projectPath, newName) => {
  try {
    const data = await readProjectJsonWithRecovery(projectPath);
    if (!data) return fail(new Error("project.json повреждён или пустой"));
    data.name = newName;
    await writeProjectJson(projectPath, data);
    return ok();
  } catch (error) {
    return fail(error);
  }
});

ipcMain.handle('delete-project', async (_event, projectPath) => {
  try {
    await fs.remove(projectPath);
    return ok();
  } catch (error) {
    return fail(error);
  }
});

ipcMain.handle('archive-project', async (_event, projectPath) => {
  try {
    const data = await readProjectJsonWithRecovery(projectPath);
    if (!data) return fail(new Error("project.json повреждён или пустой"));
    data.archived = true;
    await writeProjectJson(projectPath, data);
    return ok();
  } catch (error) {
    return fail(error);
  }
});

ipcMain.handle('unarchive-project', async (_event, projectPath) => {
  try {
    const data = await readProjectJsonWithRecovery(projectPath);
    if (!data) return fail(new Error("project.json повреждён или пустой"));
    data.archived = false;
    await writeProjectJson(projectPath, data);
    return ok();
  } catch (error) {
    return fail(error);
  }
});

ipcMain.handle('update-project-favorite', async (_event, projectPath, favorite) => {
  try {
    const data = await readProjectJsonWithRecovery(projectPath);
    if (!data) return fail(new Error("project.json повреждён или пустой"));
    data.favorite = favorite;
    await writeProjectJson(projectPath, data);
    return ok();
  } catch (error) {
    return fail(error);
  }
});

ipcMain.handle('update-project-status', async (_event, projectPath, status, supabaseConfig) => {
  try {
    // 1. Обновляем локальный project.json
    const data = await readProjectJsonWithRecovery(projectPath);
    if (!data) return fail(new Error("project.json повреждён или пустой"));
    data.status = status;
    await writeProjectJson(projectPath, data);

    // 2. Синхронизируем с Supabase, если есть конфиг и ID проекта
    if (supabaseConfig?.url && supabaseConfig?.key && data.id) {
      try {
        const supabase = createClient(supabaseConfig.url, supabaseConfig.key);
        const taskId = parseInt(data.id, 10);

        // Сначала ищем задачу по id
        const { data: task, error: searchError } = await supabase
          .from('Tasks')
          .select('id, status, project_id')
          .eq('id', taskId)
          .single();

        let targetTaskId = null;

        if (!searchError && task) {
          targetTaskId = task.id;
        } else {
          // Если не нашли по id — пробуем по project_id
          const { data: tasksByProject } = await supabase
            .from('Tasks')
            .select('id, status, project_id')
            .eq('project_id', data.id);
          if (tasksByProject && tasksByProject.length > 0) {
            targetTaskId = tasksByProject[0].id;
          }
        }

        if (targetTaskId !== null) {
          const { error: updateError } = await supabase
            .from('Tasks')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', targetTaskId);

          if (updateError) {
            return ok({ warning: 'Локально обновлено, но синхронизация не удалась' });
          }
          return ok({ synced: true });
        }

        return ok({ warning: 'Локально обновлено, но задача не найдена' });
      } catch (supabaseError) {
        console.error('Ошибка синхронизации с Supabase:', supabaseError);
        return ok({ warning: 'Локально обновлено, но синхронизация не удалась' });
      }
    }

    return ok();
  } catch (error) {
    return fail(error);
  }
});

ipcMain.handle('get-project-preview', async (_event, projectPath) => {
  try {
    const preview = await findProjectPreview(projectPath);
    if (preview) return ok({ preview });
    return ok({ preview: null });
  } catch (error) {
    return fail(error, { preview: null });
  }
});

// ===== ЛОКАЛЬНЫЕ ЗАДАЧИ (project.json) =====
ipcMain.handle('get-project-tasks', async (_event, projectPath) => {
  try {
    const data = await readProjectJsonWithRecovery(projectPath);
    if (!data) return fail(new Error("project.json повреждён или пустой"));
    return ok({ tasks: data.tasks || [] });
  } catch (error) {
    return fail(error);
  }
});

ipcMain.handle('add-task', async (_event, projectPath, taskText) => {
  try {
    const data = await readProjectJsonWithRecovery(projectPath);
    if (!data) return fail(new Error("project.json повреждён или пустой"));
    if (!data.tasks) data.tasks = [];
    const newTask = {
      id: Date.now().toString(),
      text: taskText,
      done: false,
      createdAt: new Date().toISOString(),
    };
    data.tasks.push(newTask);
    await writeProjectJson(projectPath, data);
    return ok({ task: newTask });
  } catch (error) {
    return fail(error);
  }
});

ipcMain.handle('toggle-task', async (_event, projectPath, taskId, done) => {
  try {
    const data = await readProjectJsonWithRecovery(projectPath);
    if (!data) return fail(new Error("project.json повреждён или пустой"));
    const task = data.tasks?.find((t) => t.id === taskId);
    if (!task) return fail(new Error('Задача не найдена'));
    task.done = done;
    await writeProjectJson(projectPath, data);
    return ok();
  } catch (error) {
    return fail(error);
  }
});

ipcMain.handle('delete-task', async (_event, projectPath, taskId) => {
  try {
    const data = await readProjectJsonWithRecovery(projectPath);
    if (!data) return fail(new Error("project.json повреждён или пустой"));
    if (!data.tasks) return fail(new Error('Задача не найдена'));
    data.tasks = data.tasks.filter((t) => t.id !== taskId);
    await writeProjectJson(projectPath, data);
    return ok();
  } catch (error) {
    return fail(error);
  }
});

// ===== ТЕГИ =====
ipcMain.handle('get-project-tags', async (_event, projectPath) => {
  try {
    const data = await readProjectJsonWithRecovery(projectPath);
    if (!data) return fail(new Error("project.json повреждён или пустой"));
    return ok({ tags: data.tags || [] });
  } catch (error) {
    return fail(error);
  }
});

ipcMain.handle('add-tag', async (_event, projectPath, tag) => {
  try {
    const data = await readProjectJsonWithRecovery(projectPath);
    if (!data) return fail(new Error("project.json повреждён или пустой"));
    if (!data.tags) data.tags = [];
    if (!data.tags.includes(tag)) {
      data.tags.push(tag);
      await writeProjectJson(projectPath, data);
    }
    return ok();
  } catch (error) {
    return fail(error);
  }
});

ipcMain.handle('remove-tag', async (_event, projectPath, tag) => {
  try {
    const data = await readProjectJsonWithRecovery(projectPath);
    if (!data) return fail(new Error("project.json повреждён или пустой"));
    if (data.tags) {
      data.tags = data.tags.filter((t) => t !== tag);
      await writeProjectJson(projectPath, data);
    }
    return ok();
  } catch (error) {
    return fail(error);
  }
});

// ===== ЗАМЕТКИ =====
ipcMain.handle('get-project-notes', async (_event, projectPath) => {
  try {
    const data = await readProjectJsonWithRecovery(projectPath);
    if (!data) return fail(new Error("project.json повреждён или пустой"));
    return ok({ notes: data.notes || '' });
  } catch (error) {
    return fail(error);
  }
});

ipcMain.handle('save-project-notes', async (_event, projectPath, notes) => {
  try {
    const data = await readProjectJsonWithRecovery(projectPath);
    if (!data) {
      // project.json повреждён или пустой — не перезаписываем его пустыми данными
      return fail(new Error('project.json повреждён или пустой — заметки не сохранены'));
    }
    data.notes = notes;
    await writeProjectJson(projectPath, data);
    return ok();
  } catch (error) {
    return fail(error);
  }
});

// ===== ФАЙЛЫ И ДИРЕКТОРИИ =====
ipcMain.handle('get-project-files', async (_event, projectPath) => {
  try {
    const items = await fs.readdir(projectPath);
    const files = [];
    for (const item of items) {
      const itemPath = path.join(projectPath, item);
      // Файл мог исчезнуть между readdir и stat — пропускаем его,
      // а не роняем весь список одной ошибкой.
      const stat = await fs.stat(itemPath).catch(() => null);
      if (!stat) continue;
      files.push({
        name: item,
        path: itemPath,
        isDirectory: stat.isDirectory(),
        size: stat.size,
        modified: stat.mtime,
        created: stat.birthtime,
      });
    }
    return ok({ files });
  } catch (error) {
    return fail(error);
  }
});

ipcMain.handle('get-directory-contents', async (_event, dirPath) => {
  try {
    const items = await fs.readdir(dirPath);
    const result = [];
    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      // Аналогично: пропускаем исчезнувшие элементы вместо ошибки всего списка.
      const stat = await fs.stat(itemPath).catch(() => null);
      if (!stat) continue;
      result.push({
        name: item,
        path: itemPath,
        isDirectory: stat.isDirectory(),
        size: stat.size,
        modified: stat.mtime,
      });
    }
    return ok({ items: result });
  } catch (error) {
    return fail(error);
  }
});

// ===== РЕКУРСИВНЫЙ ПОИСК 3D-МОДЕЛЕЙ В ПАПКЕ ПРОЕКТА =====
// Ищет .fbx, .obj, .glb, .gltf во всех вложенных папках, ИСКЛЮЧАЯ папки,
// связанные с анимацией (Anim, anim, animations, Animation, Animations и т.п.).
// Возвращает массив {name, path, size, relativePath}.
ipcMain.handle('find-3d-models', async (_event, projectPath) => {
  try {
    if (!projectPath || !(await fs.pathExists(projectPath))) {
      return ok({ models: [] });
    }

    // Папки, которые исключаем из поиска (case-insensitive).
    // Анимации обычно экспортируются отдельно и не нужны для текстурирования.
    const EXCLUDED_DIR_NAMES = new Set([
      'anim', 'anims', 'animation', 'animations',
      'backup', 'backups', // резервные копии тоже пропускаем
    ]);

    const MODEL_EXTENSIONS = new Set(['.fbx', '.obj', '.glb', '.gltf']);
    const results = [];
    const visited = new Set(); // защита от символических ссылок-циклов

    async function walk(dir, depth) {
      // Ограничиваем глубину рекурсии — 6 уровней достаточно для структуры проекта
      if (depth > 6) return;

      let items;
      try {
        items = await fs.readdir(dir);
      } catch {
        return; // нет прав на чтение и т.п.
      }

      for (const item of items) {
        const itemPath = path.join(dir, item);

        // Защита от циклов через символические ссылки
        if (visited.has(itemPath)) continue;
        visited.add(itemPath);

        let stat;
        try {
          stat = await fs.stat(itemPath);
        } catch {
          continue;
        }

        if (stat.isDirectory()) {
          // Проверяем, не в списке исключений ли папка
          const lowerName = item.toLowerCase();
          if (EXCLUDED_DIR_NAMES.has(lowerName)) {
            continue;
          }
          // Пропускаем скрытые папки (.git, .svn и т.п.)
          if (item.startsWith('.')) continue;
          await walk(itemPath, depth + 1);
        } else {
          // Проверяем расширение
          const ext = path.extname(item).toLowerCase();
          if (MODEL_EXTENSIONS.has(ext)) {
            // relativePath — путь относительно projectPath, для удобства отображения
            let relativePath = path.relative(projectPath, itemPath);
            // Нормализуем слэши для кросс-платформенности
            relativePath = relativePath.split(path.sep).join('/');
            results.push({
              name: item,
              path: itemPath,
              size: stat.size,
              relativePath: relativePath,
            });
          }
        }
      }
    }

    await walk(projectPath, 0);
    return ok({ models: results });
  } catch (error) {
    return fail(error);
  }
});

ipcMain.handle('create-file', async (_event, filePath, content) => {
  try {
    let targetPath = filePath;
    // Если файл уже существует — добавляем суффикс _1, _2, ...
    if (await fs.pathExists(targetPath)) {
      const dir = path.dirname(targetPath);
      const ext = path.extname(targetPath);
      const base = path.basename(targetPath, ext);
      let counter = 1;
      while (await fs.pathExists(path.join(dir, `${base}_${counter}${ext}`))) {
        counter++;
      }
      targetPath = path.join(dir, `${base}_${counter}${ext}`);
    }

    await fs.ensureFile(targetPath);
    if (content) {
      await fs.writeFile(targetPath, content);
    }
    return ok({ path: targetPath });
  } catch (error) {
    return fail(error);
  }
});

ipcMain.handle('file-exists', async (_event, filePath) => {
  try {
    return ok({ exists: await fs.pathExists(filePath) });
  } catch (error) {
    return fail(error);
  }
});

ipcMain.handle('copy-file', async (_event, sourcePath, destPath) => {
  try {
    if (!(await fs.pathExists(sourcePath))) {
      await fs.ensureFile(destPath);
      return ok({ message: 'Создан пустой файл' });
    }
    await fs.ensureDir(path.dirname(destPath));
    await fs.copy(sourcePath, destPath);
    return ok({ path: destPath });
  } catch (error) {
    console.error('Ошибка копирования файла:', error);
    try {
      await fs.ensureFile(destPath);
      return ok({ message: 'Создан пустой файл вместо скопированного' });
    } catch {
      return fail(error);
    }
  }
});

ipcMain.handle('save-file-content', async (_event, filePath, content) => {
  try {
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, Buffer.from(content));
    return ok();
  } catch (error) {
    return fail(error);
  }
});

// ===== УДАЛЕНИЕ ФАЙЛА/ПАПКИ =====
// Удаляет файл или папку (рекурсивно для папок).
ipcMain.handle('delete-path', async (_event, targetPath) => {
  try {
    if (!targetPath) return fail(new Error('Путь не указан'));
    if (!(await fs.pathExists(targetPath))) {
      return fail(new Error('Путь не существует'));
    }
    await fs.remove(targetPath);
    return ok();
  } catch (error) {
    return fail(error);
  }
});

// ===== ПЕРЕИМЕНОВАНИЕ/ПЕРЕМЕЩЕНИЕ ФАЙЛА ИЛИ ПАПКИ =====
// Старый путь -> новое имя в той же директории.
// Если newName совпадает с существующим — возвращает ошибку.
ipcMain.handle('rename-path', async (_event, oldPath, newName) => {
  try {
    if (!oldPath || !newName) return fail(new Error('Путь или имя не указаны'));
    if (!(await fs.pathExists(oldPath))) {
      return fail(new Error('Исходный путь не существует'));
    }
    // Запрещаем опасные символы в имени
    if (/[\\/:*?"<>|]/.test(newName)) {
      return fail(new Error('Имя содержит недопустимые символы: \\ / : * ? " < > |'));
    }
    const dir = path.dirname(oldPath);
    const newPath = path.join(dir, newName);
    if (await fs.pathExists(newPath)) {
      return fail(new Error('Файл или папка с таким именем уже существует'));
    }
    await fs.rename(oldPath, newPath);
    return ok({ path: newPath });
  } catch (error) {
    return fail(error);
  }
});

// ===== СОЗДАНИЕ ПАПКИ =====
// Создаёт новую папку внутри parentPath. Если уже есть — добавляет суффикс _1, _2, ...
ipcMain.handle('create-folder', async (_event, parentPath, folderName) => {
  try {
    if (!parentPath || !folderName) {
      return fail(new Error('Родительский путь или имя папки не указаны'));
    }
    if (/[\\/:*?"<>|]/.test(folderName)) {
      return fail(new Error('Имя содержит недопустимые символы: \\ / : * ? " < > |'));
    }
    await fs.ensureDir(parentPath);
    let targetPath = path.join(parentPath, folderName);
    if (await fs.pathExists(targetPath)) {
      const ext = ''; // у папок нет расширения
      let counter = 1;
      while (await fs.pathExists(path.join(parentPath, `${folderName}_${counter}${ext}`))) {
        counter++;
      }
      targetPath = path.join(parentPath, `${folderName}_${counter}`);
    }
    await fs.ensureDir(targetPath);
    return ok({ path: targetPath });
  } catch (error) {
    return fail(error);
  }
});

// >>> CLIPBOARD-CORE-START
// ===== БУФЕР ОБМЕНА ФАЙЛОВОГО МЕНЕДЖЕРА: КОПИРОВАНИЕ / ПЕРЕМЕЩЕНИЕ =====
// Используется пунктами контекстного меню «Копировать» / «Вырезать» / «Вставить»
// (файловый менеджер и File overview). Renderer запоминает список путей,
// а вставка выполняется здесь — средствами main-процесса.
//
// copyIntoInternal — копирует srcPath ВНУТРЬ destDir (папки — рекурсивно):
//   * при конфликте имён подбирается свободное имя с суффиксом _1, _2, ...
//   * копирование в ту же папку даёт имя «<имя> - копия» (как в проводнике Windows)
//   * папку нельзя копировать в саму себя или внутрь собственной подпапки
async function copyIntoInternal(srcPath, destDir) {
  try {
    if (!srcPath || !destDir) return fail(new Error('Не указан путь копирования'));
    if (!(await fs.pathExists(srcPath))) {
      return fail(new Error('Исходный путь не существует'));
    }
    if (!(await fs.pathExists(destDir))) {
      return fail(new Error('Папка назначения не существует'));
    }

    // Защита от «папка внутрь самой себя»
    const srcStat = await fs.stat(srcPath);
    if (srcStat.isDirectory()) {
      const normSrc = path.resolve(srcPath).toLowerCase();
      const normDest = path.resolve(destDir).toLowerCase();
      if (normDest === normSrc || normDest.startsWith(normSrc + path.sep)) {
        return fail(new Error('Нельзя копировать папку в саму себя'));
      }
    }

    const srcName = path.basename(srcPath);
    const ext = path.extname(srcName);
    const stem = ext ? srcName.slice(0, srcName.length - ext.length) : srcName;
    // Копирование в ту же папку — «<имя> - копия», как в Windows
    const sameDir =
      path.dirname(path.resolve(srcPath)).toLowerCase() ===
      path.resolve(destDir).toLowerCase();
    let baseName = sameDir ? `${stem} - копия${ext}` : srcName;

    // Свободное имя: _1, _2, ...
    let finalName = baseName;
    let counter = 1;
    const baseStem = ext ? baseName.slice(0, baseName.length - ext.length) : baseName;
    while (await fs.pathExists(path.join(destDir, finalName))) {
      finalName = `${baseStem}_${counter}${ext}`;
      counter++;
    }

    const destPath = path.join(destDir, finalName);
    await fs.copy(srcPath, destPath);
    return ok({ path: destPath, name: finalName });
  } catch (error) {
    console.error('Ошибка copy-into:', error);
    return fail(error);
  }
}

// moveIntoInternal — перемещает srcPath ВНУТРЬ destDir (режим «Вырезать»):
//   * перемещение в ту же папку — бездействие (skipped: true)
//   * при конфликте имён — суффикс _1, _2, ...
//   * папку нельзя перемещать в саму себя или внутрь собственной подпапки
async function moveIntoInternal(srcPath, destDir) {
  try {
    if (!srcPath || !destDir) return fail(new Error('Не указан путь перемещения'));
    if (!(await fs.pathExists(srcPath))) {
      return fail(new Error('Исходный путь не существует'));
    }
    if (!(await fs.pathExists(destDir))) {
      return fail(new Error('Папка назначения не существует'));
    }

    const normSrc = path.resolve(srcPath).toLowerCase();
    const normDest = path.resolve(destDir).toLowerCase();
    // Перемещение в ту же папку — делать нечего
    if (path.dirname(normSrc) === normDest) {
      return ok({ skipped: true, path: srcPath, name: path.basename(srcPath) });
    }
    // Защита от «папка внутрь самой себя»
    const srcStat = await fs.stat(srcPath);
    if (srcStat.isDirectory()) {
      if (normDest === normSrc || normDest.startsWith(normSrc + path.sep)) {
        return fail(new Error('Нельзя перемещать папку в саму себя'));
      }
    }

    const srcName = path.basename(srcPath);
    const ext = path.extname(srcName);
    const stem = ext ? srcName.slice(0, srcName.length - ext.length) : srcName;
    let finalName = srcName;
    let counter = 1;
    while (await fs.pathExists(path.join(destDir, finalName))) {
      finalName = `${stem}_${counter}${ext}`;
      counter++;
    }

    const destPath = path.join(destDir, finalName);
    await fs.move(srcPath, destPath);
    return ok({ path: destPath, name: finalName });
  } catch (error) {
    console.error('Ошибка move-into:', error);
    return fail(error);
  }
}

ipcMain.handle('copy-into', (_event, srcPath, destDir) => copyIntoInternal(srcPath, destDir));
ipcMain.handle('move-into', (_event, srcPath, destDir) => moveIntoInternal(srcPath, destDir));
// >>> CLIPBOARD-CORE-END

ipcMain.handle('get-file-path', async (_event, file) => {
  try {
    if (webUtils?.getPathForFile) {
      return ok({ path: webUtils.getPathForFile(file) });
    }
    return fail(new Error('Не удалось получить путь'));
  } catch (error) {
    return fail(error);
  }
});

ipcMain.handle('open-folder', async (_event, folderPath) => {
  try {
    await shell.openPath(folderPath);
    return ok();
  } catch (error) {
    return fail(error);
  }
});

// ===== НАЧАЛО СИСТЕМНОГО DRAG-AND-DROP =====
// Позволяет перетаскивать файлы из встроенного файлового менеджера в другие


// программы (UE5, проводник, и т.д.).
// ВАЖНО: используем ipcMain.on (не handle) + ipcRenderer.send (не invoke),
// потому что startDrag должен вызываться синхронно из события dragstart.
// Если использовать invoke (Promise), HTML5 drag успеет начаться раньше и заблокирует нативный.
// event.sender — это webContents, у которого есть startDrag.
const { nativeImage } = require('electron');

// Создаём иконку для перетаскивания (1x1 прозрачный PNG, чтобы ОС показала свою иконку)
const DRAG_ICON = nativeImage.createFromBuffer(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  'base64'
));

ipcMain.on('start-drag', async (event, files) => {
  try {
    if (!Array.isArray(files) || files.length === 0) {
      console.error('start-drag: не переданы пути файлов');
      return;
    }

    // Фильтруем только существующие файлы (не папки)
    const validFiles = [];
    for (const f of files) {
      if (!f || typeof f !== 'string') continue;
      try {
        const stat = await fs.stat(f);
        if (stat.isFile()) {
          validFiles.push(f);
        }
      } catch {
        // Файл не существует — пропускаем
      }
    }

    if (validFiles.length === 0) {
      console.error('start-drag: нет валидных файлов');
      return;
    }

    // event.sender — это webContents напрямую, не нужно искать окно
    event.sender.startDrag({

      files: validFiles,
      icon: DRAG_ICON,
    });


  } catch (error) {
    console.error('start-drag error:', error);
  }
});

// Открытие внешней ссылки в системном браузере.
// Используется для кликабельных ссылок в заметках.
// Разрешаем ТОЛЬКО http/https:
//   - file:// и пути вида C:\\ убраны (по договорённости — file:// ссылки
//     в заметках не нужны, а открытие локальных путей через openExternal
//     потенциально опасно: так можно запустить произвольный .exe);
//   - javascript:, data: и прочие схемы блокируются.
ipcMain.handle('open-external-url', async (_event, url) => {
  try {
    if (!url || typeof url !== 'string') {
      return fail(new Error('URL не указан'));
    }
    const allowed = /^https?:\/\//i.test(url);
    if (!allowed) {
      return fail(new Error(`Схема URL запрещена: ${url}`));
    }
    await shell.openExternal(url);
    return ok();
  } catch (error) {
    return fail(error);
  }
});

// ===== ЗАПУСК ВНЕШНИХ ПРИЛОЖЕНИЙ =====
ipcMain.handle('launch-app', async (_event, appPath, targetPath) => {
  try {
    const stats = await fs.stat(targetPath).catch(() => null);
    const isDirectory = stats ? stats.isDirectory() : false;

    const args = isDirectory ? [] : [targetPath];
    const cwd = isDirectory ? targetPath : path.dirname(targetPath);

    const child = spawn(appPath, args, {
      detached: true,
      cwd,
      stdio: 'ignore',
    });
    // Без обработчика 'error' неверный путь к .exe (ENOENT) вызывает
    // необработанное исключение в main-процессе — приложение падает.
    // Ошибка асинхронная, вернуть её из invoke нельзя — просто логируем.
    child.once('error', (err) => {
      console.error('launch-app: не удалось запустить приложение:', err);
    });
    child.unref();
    return ok({ pid: child.pid });
  } catch (error) {
    return fail(error);
  }
});

// Скрипт, который записывается в проект как save_blend.py и исполняется
// Blender в headless-режиме (--background). Идентичен src/save_blend.py.
// Превью не генерируется — оно устанавливается вручную через механизм
// превью приложения. Скрипт только создаёт меши и сохраняет .blend.
const BLENDER_TIMEOUT_MS = 120000; // сколько ждём завершения Blender (мс)

const BLENDER_SAVE_SCRIPT = `# save_blend.py
# Автосохранение .blend файла с преднастройкой структуры под меши.
# Аргументы после "--": <filepath> <config_json>
# config = { "mode": "single"|"multi", "meshes": [...], "meshIndex": int }
#
# Превью НЕ генерируется — оно устанавливается вручную
# через механизм превью приложения.

import bpy
import sys
import json


def collection_name_from_mesh(mesh_name):
    if mesh_name.startswith("SM_"):
        return mesh_name[3:]
    return mesh_name


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)
    for col in list(bpy.data.collections):
        bpy.data.collections.remove(col)


def add_mesh_to_collection(mesh_name):
    coll_name = collection_name_from_mesh(mesh_name)
    coll = bpy.data.collections.new(coll_name)
    bpy.context.scene.collection.children.link(coll)
    bpy.ops.mesh.primitive_cube_add(size=2.0, location=(0, 0, 0))
    cube = bpy.context.active_object
    cube.name = mesh_name
    coll.objects.link(cube)
    bpy.context.scene.collection.objects.unlink(cube)


argv = sys.argv
argv = argv[argv.index("--") + 1:] if "--" in argv else []

if len(argv) < 1:
    print("ERROR: No filepath specified")
    sys.exit(1)

filepath = argv[0]
config = {}
if len(argv) >= 2:
    try:
        config = json.loads(argv[1])
    except json.JSONDecodeError as e:
        print("ERROR: Invalid JSON config: " + str(e))
        sys.exit(1)

mode = config.get("mode", "single")
meshes = config.get("meshes", [])
mesh_index = config.get("meshIndex", -1)

clear_scene()

if mode == "multi":
    if mesh_index < 0 or mesh_index >= len(meshes):
        print("ERROR: Invalid meshIndex " + str(mesh_index))
        sys.exit(1)
    add_mesh_to_collection(meshes[mesh_index])
    print("Mesh created: " + meshes[mesh_index])
else:
    for mesh_name in meshes:
        add_mesh_to_collection(mesh_name)
        print("Mesh created: " + mesh_name)

bpy.ops.wm.save_as_mainfile(filepath=filepath)
print("File saved: " + filepath)
`;

// ===== ЗАПУСК BLENDER С АВТОСОХРАНЕНИЕМ =====
// options = { mode: 'single'|'multi', meshes: string[], meshIndex: number }
//   - mode='single': в одном .blend файле создаются коллекции для всех мешей
//   - mode='multi': создаётся только один меш (meshes[meshIndex]); renderer.js
//     вызывает этот обработчик N раз, по разу для каждого меша
// Если options не передан — просто сохраняется пустой .blend файл (обратная совместимость).
ipcMain.handle('launch-blender-save', async (_event, blenderPath, projectPath, fileName, options = {}) => {
  try {
    const scriptPath = path.join(projectPath, 'save_blend.py');

    // Всегда перезаписываем скрипт — гарантируем актуальную версию
    // (в старых проектах могла остаться устаревшая версия save_blend.py).
    // Логика скрипта идентична src/save_blend.py из репозитория.
    await fs.writeFile(scriptPath, BLENDER_SAVE_SCRIPT);

    const filePath = path.join(projectPath, fileName);

    // Формируем конфигурацию для скрипта
    const config = {
      mode: options.mode || 'single',
      meshes: Array.isArray(options.meshes) ? options.meshes : [],
      meshIndex: typeof options.meshIndex === 'number' ? options.meshIndex : -1,
    };
    const configJson = JSON.stringify(config);

    const args = ['--background', '--python', scriptPath, '--', filePath, configJson];

    // Запускаем Blender без detached: в --background он сам завершится после
    // сохранения и рендера превью, и мы можем дождаться этого момента.
    const child = spawn(blenderPath, args, { stdio: 'ignore', windowsHide: true });

    // Ждём РЕАЛЬНОГО завершения Blender (а не фиксированные 3 секунды):
    // так ответ уходит в renderer, когда .blend и превью уже точно на диске.
    const result = await new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(value);
        }
      };
      const timer = setTimeout(() => finish({ timedOut: true }), BLENDER_TIMEOUT_MS);
      child.once('error', (err) => finish({ spawnError: err }));
      child.once('close', (code) => finish({ code }));
    });

    if (result.spawnError) {
      return fail(new Error(
        `Не удалось запустить Blender: ${result.spawnError.message}. Проверьте путь к blender.exe в настройках.`
      ));
    }
    if (result.timedOut) {
      try { child.kill(); } catch (_) { /* уже завершился */ }
      return fail(new Error('Blender не завершился за 2 минуты. Проверьте путь к blender.exe в настройках.'));
    }
    if (result.code !== 0) {
      return fail(new Error(`Blender завершился с кодом ${result.code}. Скрипт сохранения сообщил об ошибке.`));
    }

    return ok({ pid: child.pid });
  } catch (error) {
    return fail(error);
  }
});

// ===== ЗАПУСК SUBSTANCE PAINTER С АВТОМАТИЗАЦИЕЙ =====
// options = {
//   sppFilePath,         // путь к .spp файлу, который нужно создать/открыть
//   meshPath,            // (опц.) путь к FBX для импорта; если нет — пустой проект
//   exportPath,          // (опц.) папка для экспорта текстур; если нет — экспорт не настраивается
//   projectName,         // имя проекта (для логов)
// }
//
// Логика:
//   1. Копируем (или обновляем) плагин project_manager_sp_plugin.js в стандартную
//      папку плагинов Substance Painter, если её можно определить.
//   2. Пишем sp_startup_config.json во временную папку — плагин читает его при загрузке.
//   3. Запускаем SP. Плагин выполняет автоматизацию (импорт, экспорт-пресет, сохранение).
//
// Важно: SP не принимает параметры импорта через CLI, поэтому автоматизация идёт
// через плагин. Если плагин ещё не установлен — пользователь должен включить его
// в SP один раз (Plugins → Project Manager Auto → Enable). После этого все запуски
// будут автоматизированы.

const os = require('os');

/**
 * Возвращает стандартные папки плагинов Substance 3D Painter.
 * В разных версиях SP используются разные пути:
 *   - Adobe (новые, SP 10.1+, сентябрь 2024+):
 *       Documents/Adobe/Adobe Substance 3D Painter/javascript/plugins
 *   - Adobe (старые, 7.2-10.0):
 *       Documents/Adobe/Adobe Substance 3D Painter/plugins
 *   - Allegorithmic (легаси, до 7.2):
 *       Documents/Allegorithmic/Substance Painter/plugins
 * Возвращаем все три — плагин кладётся во все, SP подхватит из нужного.
 */
function getSubstancePluginsDirs() {
  const home = os.homedir();
  const documents = path.join(home, 'Documents');
  return [
    // SP 10.1+ (сентябрь 2024) — новая папка для JS-плагинов
    path.join(documents, 'Adobe', 'Adobe Substance 3D Painter', 'javascript', 'plugins', 'project_manager_auto'),
    // SP 7.2 - 10.0 — старая папка Adobe
    path.join(documents, 'Adobe', 'Adobe Substance 3D Painter', 'plugins', 'project_manager_auto'),
    // Легаси: до 7.2, под брендом Allegorithmic
    path.join(documents, 'Allegorithmic', 'Substance Painter', 'plugins', 'project_manager_auto'),
  ];
}

/** Код плагина Substance 3D Painter (QML + JS).
 *  Согласно официальной документации Adobe:
 *    - Точка входа — main.qml (НЕ main.js)
 *    - Метаданные — plugin.json (НЕ package.json)
 *    - Корневой объект — PainterPlugin с import Painter 1.0
 *    - События: Component.onCompleted, onProjectOpened, onNewProjectCreated
 *    - API: alg.project.open/importMesh/save, alg.mapexport.*
 *
 *  ВАЖНО: на верхнем уровне QML-файла могут быть только QML-объекты.
 *  Все JS-функции и переменные должны быть ВНУТРИ объекта PainterPlugin
 *  (как функции-члены или через property). Нельзя писать `var x = ...` снаружи.
 *
 *  Конфиг встраивается через шаблон __PM_STARTUP_CONFIG__ как property.
 */
const SP_PLUGIN_QML_TEMPLATE = `import QtQuick 2.7
import Painter 1.0

PainterPlugin {
    // ===== КОНФИГУРАЦИЯ (встраивается при генерации плагина) =====
    // JSON-литерал с путями к модели, .spp и папке экспорта.
    // Свойство только для чтения — конфиг не меняется во время работы плагина.
    property var config: __PM_STARTUP_CONFIG__

    // Выключаем таймер onTick и JSON-сервер (не нужны)
    tickIntervalMS: -1
    jsonServerPort: -1

    // Флаг: была ли уже попытка автоматизации (защита от повторного срабатывания
    // onProjectOpened при нескольких открытиях проекта)
    property bool automationStarted: false

    // ===== УТИЛИТЫ (JS-функции внутри объекта) =====

    // Преобразование локального пути в file:// URL (для alg API)
    function toFileUrl(localPath) {
        if (!localPath) return "";
        var p = "";
        for (var i = 0; i < localPath.length; i++) {
            var c = localPath.charAt(i);
            if (c === String.fromCharCode(92)) { // 92 = '\\'
                p = p + "/";
            } else {
                p = p + c;
            }
        }
        // Windows: C:/... → file:///C:/...
        if (p.length >= 3 && p.charAt(1) === ":" && p.charAt(2) === "/") {
            return "file:///" + p;
        }
        // Unix: /home/... → file:///home/...
        if (p.charAt(0) === "/") {
            return "file://" + p;
        }
        return "file:///" + p;
    }

    // Безопасный вызов метода с проверкой существования.
    // Возвращает {ok, result, error}.
    function safeCall(obj, methodName, args) {
        try {
            if (!obj) {
                return {ok: false, error: "object is null"};
            }
            var fn = obj[methodName];
            if (typeof fn !== "function") {
                return {ok: false, error: "method '" + methodName + "' is " + typeof fn};
            }
            var result;
            if (args && args.length) {
                result = fn.apply(obj, args);
            } else {
                result = fn.call(obj);
            }
            return {ok: true, result: result};
        } catch (e) {
            return {ok: false, error: String(e)};
        }
    }

    // Логирует список доступных методов объекта (для диагностики)
    function logMethods(objName, obj) {
        try {
            if (!obj) {
                alg.log.warn("[PM Auto] " + objName + " is null");
                return;
            }
            var keys = [];
            for (var k in obj) {
                keys.push(k);
            }
            alg.log.info("[PM Auto] " + objName + " methods: " + keys.join(", "));
        } catch (e) {
            alg.log.warn("[PM Auto] logMethods error for " + objName + ": " + e);
        }
    }

    // ===== ОСНОВНАЯ ЛОГИКА =====

    // Диагностика: логируем доступное API при первой возможности
    function diagnoseAPI() {
        alg.log.info("[PM Auto] === API DIAGNOSTICS ===");
        logMethods("alg", alg);
        if (alg.project) logMethods("alg.project", alg.project);
        if (alg.mapexport) logMethods("alg.mapexport", alg.mapexport);
        if (alg.fileIO) logMethods("alg.fileIO", alg.fileIO);
        alg.log.info("[PM Auto] === END DIAGNOSTICS ===");
    }

    // Шаг 1: Открыть проект с указанной моделью.
    // Согласно диагностике API, в alg.project есть:
    //   - open(url) — открывает .spp файл (НЕ FBX!)
    //   - create(meshUrl, settings) — создаёт новый проект из меша ← ИСПОЛЬЗУЕМ ЭТО
    //   - importMesh / import — НЕ существуют
    function openProjectWithMesh() {
        alg.log.info("[PM Auto] === openProjectWithMesh ===");

        if (!config.meshPath) {
            alg.log.info("[PM Auto] No meshPath — skipping import");
            if (config.sppFilePath) {
                setupExportAndSave();
            }
            return;
        }

        var meshUrl = toFileUrl(config.meshPath);
        alg.log.info("[PM Auto] Mesh URL: " + meshUrl);

        // 1. Пробуем alg.project.create(meshUrl, settings) — правильный метод
        //    для создания нового проекта из 3D-модели.
        var settings = {
            resolution: 2048
        };
        var r = safeCall(alg.project, "create", [meshUrl, settings]);
        if (r.ok) {
            alg.log.info("[PM Auto] alg.project.create(meshUrl, settings) succeeded");
            // onProjectOpened сработает автоматически и запустит setupExportAndSave
            return;
        }
        alg.log.warn("[PM Auto] alg.project.create(meshUrl, settings) failed: " + r.error);

        // 2. Пробуем alg.project.create(meshUrl) — без настроек
        r = safeCall(alg.project, "create", [meshUrl]);
        if (r.ok) {
            alg.log.info("[PM Auto] alg.project.create(meshUrl) succeeded");
            return;
        }
        alg.log.warn("[PM Auto] alg.project.create(meshUrl) failed: " + r.error);

        // 3. Пробуем alg.project.create(meshUrl, settings, callback) —
        //    в некоторых версиях create асинхронный и требует callback
        r = safeCall(alg.project, "create", [meshUrl, settings, function(err) {
            if (err) {
                alg.log.warn("[PM Auto] create callback error: " + err);
            } else {
                alg.log.info("[PM Auto] create callback: project created");
            }
        }]);
        if (r.ok) {
            alg.log.info("[PM Auto] alg.project.create with callback accepted");
            return;
        }
        alg.log.warn("[PM Auto] alg.project.create with callback failed: " + r.error);

        // 4. Fallback: если .spp уже существует — открываем его через open()
        if (config.sppFilePath) {
            var sppUrl = toFileUrl(config.sppFilePath);
            alg.log.info("[PM Auto] Trying alg.project.open(sppUrl): " + sppUrl);
            r = safeCall(alg.project, "open", [sppUrl]);
            if (r.ok) {
                alg.log.info("[PM Auto] alg.project.open(sppUrl) succeeded");
                return;
            }
            alg.log.warn("[PM Auto] alg.project.open(sppUrl) failed: " + r.error);
        }

        alg.log.warn("[PM Auto] All project creation methods failed — manual import required");
    }

    // Шаг 2: Настроить экспорт и сохранить .spp.
    function setupExportAndSave() {
        alg.log.info("[PM Auto] === setupExportAndSave ===");

        // 1. Настраиваем опции экспорта (если указана папка)
        if (config.exportPath) {
            var exportUrl = toFileUrl(config.exportPath);
            alg.log.info("[PM Auto] Export path: " + exportUrl);

            // Пробуем setProjectExportOptions — передаём exportPath в опциях
            var r = safeCall(alg.mapexport, "setProjectExportOptions", [{
                "padding": "Infinite",
                "dithering": "disabled",
                "bitDepth": 16,
                "keepAlpha": false
            }]);
            if (r.ok) {
                alg.log.info("[PM Auto] Export options set");
            } else {
                alg.log.warn("[PM Auto] setProjectExportOptions failed: " + r.error);
            }
        }

        // 2. Сохраняем проект как .spp
        if (config.sppFilePath) {
            var sppUrl = toFileUrl(config.sppFilePath);
            alg.log.info("[PM Auto] Saving project to: " + sppUrl);

            // Пробуем alg.project.save(url) — основная сигнатура
            var r2 = safeCall(alg.project, "save", [sppUrl]);
            if (r2.ok) {
                alg.log.info("[PM Auto] Project saved via alg.project.save(url)");
                alg.log.info("[PM Auto] Automation complete");
                return;
            }
            alg.log.warn("[PM Auto] alg.project.save(url) failed: " + r2.error);

            // Пробуем alg.project.save(url, SaveMode) — с указанием режима
            // SaveMode доступен как alg.project.SaveMode
            var saveMode = alg.project.SaveMode;
            if (saveMode) {
                r2 = safeCall(alg.project, "save", [sppUrl, saveMode]);
                if (r2.ok) {
                    alg.log.info("[PM Auto] Project saved via alg.project.save(url, SaveMode)");
                    alg.log.info("[PM Auto] Automation complete");
                    return;
                }
                alg.log.warn("[PM Auto] alg.project.save(url, SaveMode) failed: " + r2.error);
            }

            // Пробуем alg.project.saveAsCopy(url) — сохраняет копию
            r2 = safeCall(alg.project, "saveAsCopy", [sppUrl]);
            if (r2.ok) {
                alg.log.info("[PM Auto] Project saved via alg.project.saveAsCopy(url)");
                alg.log.info("[PM Auto] Automation complete");
                return;
            }
            alg.log.warn("[PM Auto] alg.project.saveAsCopy(url) failed: " + r2.error);

            alg.log.warn("[PM Auto] All save methods failed — manual save required");
        }
    }

    // ===== СОБЫТИЯ ЖИЗНЕННОГО ЦИКЛА =====

    Component.onCompleted: {
        alg.log.info("[PM Auto] === Plugin loaded ===");
        alg.log.info("[PM Auto] Config: " + JSON.stringify(config));

        // Диагностика API — логируем доступные методы
        diagnoseAPI();

        // Если meshPath задан — автоматизируем создание проекта.
        // Запускаем с задержкой, чтобы SP завершил инициализацию.
        if (config.meshPath) {
            alg.log.info("[PM Auto] Scheduling openProjectWithMesh in 3s");
            startTimer.start();
        } else if (config.sppFilePath) {
            alg.log.info("[PM Auto] Scheduling saveOnly in 3s");
            saveOnlyTimer.start();
        }
    }

    onProjectOpened: {
        alg.log.info("[PM Auto] onProjectOpened event");
        // Защита от повторного срабатывания
        if (automationStarted) {
            alg.log.info("[PM Auto] Already automated — skipping");
            return;
        }
        automationStarted = true;
        // После открытия проекта настраиваем экспорт и сохраняем
        if (config.meshPath || config.sppFilePath) {
            alg.log.info("[PM Auto] Scheduling setupExportAndSave in 1.5s");
            setupExportTimer.start();
        }
    }

    onNewProjectCreated: {
        alg.log.info("[PM Auto] onNewProjectCreated event");
    }

    // ===== ТАЙМЕРЫ (QML Timer — единственный способ отложенного вызова в QML) =====

    Timer {
        id: startTimer
        interval: 3000
        repeat: false
        onTriggered: {
            openProjectWithMesh();
        }
    }

    Timer {
        id: saveOnlyTimer
        interval: 3000
        repeat: false
        onTriggered: {
            setupExportAndSave();
        }
    }

    Timer {
        id: setupExportTimer
        interval: 1500
        repeat: false
        onTriggered: {
            setupExportAndSave();
        }
    }
}
`;

/** Метаданные плагина (plugin.json). */
const SP_PLUGIN_JSON = {
  description: 'Автоматизация импорта/экспорта/сохранения при запуске из Project Manager',
  version: '1.0.0',
  license: 'MIT',
  min_api_version: '1.0.6',
};

ipcMain.handle('launch-substance', async (_event, substancePath, projectPath, options = {}) => {
  try {
    if (!substancePath) {
      return fail(new Error('Путь к Substance Painter не указан'));
    }
    if (!(await fs.pathExists(substancePath))) {
      return fail(new Error('Исполняемый файл Substance Painter не найден: ' + substancePath));
    }

    const sppFilePath = options.sppFilePath;
    const meshPath = options.meshPath || null;
    const exportPath = options.exportPath || null;
    const projectName = options.projectName || 'Untitled';

    // ===== 1. Готовим плагин во всех возможных папках =====
    // Substance 3D Painter может использовать разные папки в зависимости от версии:
    //   - Adobe (новые, SP 10.1+): Documents/Adobe/Adobe Substance 3D Painter/javascript/plugins
    //   - Adobe (старые, 7.2-10.0): Documents/Adobe/Adobe Substance 3D Painter/plugins
    //   - Allegorithmic (легаси): Documents/Allegorithmic/Substance Painter/plugins
    // Кладём плагин во все варианты — SP подхватит из нужного.
    const pluginsDirs = getSubstancePluginsDirs();
    const writtenDirs = [];
    try {
      const configLiteral = JSON.stringify({
        sppFilePath: sppFilePath || null,
        meshPath: meshPath,
        exportPath: exportPath,
        projectName: projectName,
      });
      // Подставляем конфиг в QML-шаблон.
      // JSON.stringify даёт валидный JS-литерал объекта.
      const pluginQml = SP_PLUGIN_QML_TEMPLATE.replace(
        '__PM_STARTUP_CONFIG__',
        configLiteral
      );
      const pluginJson = JSON.stringify(SP_PLUGIN_JSON, null, 2);

      for (const dir of pluginsDirs) {
        try {
          // ensureDir создаёт всю цепочку папок при необходимости.
          await fs.ensureDir(dir);
          // main.qml — обязательная точка входа (см. документацию Adobe)
          await fs.writeFile(path.join(dir, 'main.qml'), pluginQml, 'utf8');
          // plugin.json — метаданные (description, version, min_api_version)
          await fs.writeFile(path.join(dir, 'plugin.json'), pluginJson, 'utf8');
          writtenDirs.push(dir);
        } catch (e) {
          console.error('Не удалось записать плагин в', dir, ':', e);
        }
      }
    } catch (e) {
      console.error('Не удалось установить плагин SP:', e);
      // Не блокируем запуск — плагин опционален
    }

    // ===== 2. Создаём пустой .spp файл-маркер, если его нет =====
    // SP сам создаст .spp при сохранении; нам нужен только путь для аргумента.
    // Если файл не существует — запускаем SP без аргумента (пустой проект),
    // плагин потом сохранит его по sppFilePath.

    // ===== 3. Запускаем Substance Painter =====
    let args = [];
    if (sppFilePath && await fs.pathExists(sppFilePath)) {
      // Если .spp уже существует — открываем его
      args = [sppFilePath];
    }
    // Иначе — пустой проект; плагин импортирует модель и сохранит

    const child = spawn(substancePath, args, {
      detached: true,
      cwd: path.dirname(substancePath),
      stdio: 'ignore',
    });
    // Аналогично launch-app: без обработчика 'error' — падение main-процесса
    child.once('error', (err) => {
      console.error('launch-substance: не удалось запустить Substance Painter:', err);
    });
    child.unref();

    return ok({ pid: child.pid, pluginsDirs: writtenDirs });
  } catch (error) {
    return fail(error);
  }
});

// ===== ДИАЛОГИ ОС =====
ipcMain.handle('open-directory-dialog', async () => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Выберите папку',
    });
    if (result.canceled) return ok({ canceled: true });
    return ok({ path: result.filePaths[0] });
  } catch (error) {
    return fail(error);
  }
});

ipcMain.handle('open-file-dialog', async (_event, filters) => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: 'Выберите исполняемый файл',
      filters: filters || [{ name: 'Executables', extensions: ['exe'] }],
    });
    if (result.canceled) return ok({ canceled: true });
    return ok({ path: result.filePaths[0] });
  } catch (error) {
    return fail(error);
  }
});

// ===== ПОЛЬЗОВАТЕЛЬСКИЕ ПРИЛОЖЕНИЯ И СКРИПТЫ-ИНТЕГРАЦИИ =====
// Пользователь может добавлять СВОИ ярлыки приложений (кнопка "+" под
// кнопками Blender/SP) и подключать к ярлыку скрипт-интеграцию (.js).
// Скрипт пишет сам пользователь (по аналогии с аддонами Blender) и получает
// доступ к внутреннему API приложения — объекту `bpm`: файлы/папки,
// запуск программ, диалоги, буфер обмена, настройки, данные проекта.
// Контракт скрипта и полное описание API — см. docs/INTEGRATIONS.md
// и пример examples/zbrush-integration.example.js.
//
// Хранилище: userData/customApps.json
//   { "apps": [ { id, name, execPath, icon, exts, scriptPath, scriptName, createdAt } ] }
//   exts — расширения файлов (без точки), ассоциированные с приложением:
//   двойной клик по такому файлу в файловом менеджере и File overview
//   открывает его в этом приложении (а не системным обработчиком).
//
// Контракт скрипта-интеграции:
//   module.exports = {
//     name: 'ZBrush',                       // опционально
//     getLaunchArgs: async (bpm, project) => ['путь/к/файлу'], // ДО запуска:
//                                           // скрипт готовит файлы и возвращает
//                                           // аргументы командной строки (.exe)
//     onLaunch: async (bpm, project, pid) => {}, // хук ПОСЛЕ запуска приложения
//     actions: [ { id, title, run: async (bpm, project) => {} } ] // пункты контекстного меню
//   };
//
// ВАЖНО О БЕЗОПАСНОСТИ: скрипты выполняются с полным доступом Node.js
// (как аддоны Blender). Подключайте только свои или проверенные скрипты.

// >>> CUSTOM-APPS-CORE-START (тесты извлекают эту часть)

const customAppsPath = path.join(userDataPath, 'customApps.json');

function makeCustomAppId() {
  return `app_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Читает список пользовательских ярлыков. Файл может не существовать / быть битым. */
async function readCustomAppsFile(filePath) {
  try {
    const data = await fs.readJson(filePath);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { apps: [] };
    return { apps: Array.isArray(data.apps) ? data.apps : [] };
  } catch {
    return { apps: [] };
  }
}

/** Записывает список пользовательских ярлыков (атомарно — через временный файл). */
async function writeCustomAppsFile(filePath, apps) {
  const tempPath = `${filePath}.tmp`;
  await fs.writeJson(tempPath, { apps }, { spaces: 2 });
  await fs.rename(tempPath, filePath);
}

/** Загружает скрипт-интеграцию и возвращает его module.exports.
 *  Скрипт выполняется в контексте vm; доступ к Node.js даётся полностью —
 *  скрипты локальные и доверенные (модель аддонов Blender). */
function loadIntegrationScript(scriptPath) {
  const code = fs.readFileSync(scriptPath, 'utf8');
  const moduleObj = { exports: {} };
  const sandbox = {
    module: moduleObj,
    exports: moduleObj.exports,
    require,
    console,
    Buffer,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    __filename: scriptPath,
    __dirname: path.dirname(scriptPath),
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: scriptPath });
  const exported = moduleObj.exports;
  if (!exported || typeof exported !== 'object' || Array.isArray(exported)) {
    throw new Error('Скрипт интеграции должен экспортировать объект: module.exports = { ... }');
  }
  return exported;
}

/** Возвращает описания действий скрипта: [{ id, title }] — для контекстного меню. */
function getIntegrationActions(scriptExports) {
  if (!scriptExports || !Array.isArray(scriptExports.actions)) return [];
  return scriptExports.actions
    .filter((a) => a && typeof a === 'object' && typeof a.id === 'string' && typeof a.title === 'string')
    .map((a) => ({ id: a.id, title: a.title }));
}

/**
 * Создаёт `bpm` — внутренний API приложения для скриптов-интеграций.
 * @param {object} appConfig - запись ярлыка (name, execPath, ...)
 * @param {string|null} projectPath - путь выбранного проекта (или null)
 */
function createIntegrationContext(appConfig, projectPath) {
  const bpm = {
    version: '1.1.0', // 1.1.0 — добавлен хук getLaunchArgs (аргументы запуска)
    // Информация о ярлыке, из которого запущен скрипт
    appName: appConfig && appConfig.name ? appConfig.name : null,
    appPath: appConfig && appConfig.execPath ? appConfig.execPath : null,
    // path-модуль Node — для склейки путей в скриптах
    path,
    // Информация о текущем проекте
    project: {
      path: projectPath || null,
      name: projectPath ? path.basename(projectPath) : null,
    },
    /** Лог в консоль main-процесса (DevTools → main). */
    log: (...args) => console.log('[integration]', ...args),
    /** Данные project.json выбранного проекта (или null, если проект не выбран). */
    getProjectData: async () => {
      if (!projectPath) return null;
      return await readProjectJsonWithRecovery(projectPath);
    },
  };

  // ===== ФАЙЛЫ И ПАПКИ =====
  bpm.fs = {
    readFile: (file, encoding) => fs.readFile(file, encoding || 'utf8'),
    writeFile: (file, content) => fs.writeFile(file, content),
    appendFile: (file, content) => fs.appendFile(file, content),
    readJson: (file) => fs.readJson(file),
    writeJson: (file, data, spaces) => fs.writeJson(file, data, { spaces: spaces === undefined ? 2 : spaces }),
    ensureDir: (dir) => fs.ensureDir(dir),
    ensureFile: (file) => fs.ensureFile(file),
    exists: (p) => fs.pathExists(p),
    stat: (p) => fs.stat(p),
    copy: (src, dest) => fs.copy(src, dest, { overwrite: true }),
    move: (src, dest) => fs.move(src, dest, { overwrite: true }),
    remove: (target) => fs.remove(target),
    /** Содержимое папки: [{ name, path, isDirectory }] */
    list: async (dir) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      return entries.map((e) => ({
        name: e.name,
        path: path.join(dir, e.name),
        isDirectory: e.isDirectory(),
      }));
    },
  };

  // ===== ЗАПУСК ПРОГРАММ =====
  bpm.launch = {
    /** Запускает внешнюю программу (detached). Возвращает pid или null. */
    spawn: (execPath, args = [], opts = {}) => {
      const child = spawn(execPath, args, {
        detached: true,
        stdio: 'ignore',
        cwd: opts.cwd || projectPath || undefined,
        ...opts,
      });
      child.once('error', (err) => bpm.log('spawn error:', err.message));
      child.unref();
      return child.pid !== undefined ? child.pid : null;
    },
    /** Открывает файл/папку системным обработчиком (как двойной клик в проводнике). */
    open: (target) => shell.openPath(target),
  };

  // ===== ДИАЛОГИ =====
  bpm.dialog = {
    message: (text, title = 'Интеграция') =>
      dialog.showMessageBox({ type: 'info', title, message: String(text), buttons: ['OK'] }),
    confirm: async (text, title = 'Интеграция') => {
      const r = await dialog.showMessageBox({
        type: 'question',
        title,
        message: String(text),
        buttons: ['Да', 'Отмена'],
        defaultId: 0,
        cancelId: 1,
      });
      return r.response === 0;
    },
    pickFile: async (filters, title = 'Выберите файл') => {
      const r = await dialog.showOpenDialog({
        properties: ['openFile'],
        title,
        filters: filters || [{ name: 'Все файлы', extensions: ['*'] }],
      });
      return r.canceled ? null : r.filePaths[0];
    },
    pickDirectory: async (title = 'Выберите папку') => {
      const r = await dialog.showOpenDialog({ properties: ['openDirectory'], title });
      return r.canceled ? null : r.filePaths[0];
    },
  };

  // ===== БУФЕР ОБМЕНА =====
  bpm.clipboard = {
    writeText: (text) => clipboard.writeText(String(text)),
    readText: () => clipboard.readText(),
  };

  // ===== СИСТЕМНЫЕ ДЕЙСТВИЯ =====
  bpm.shell = {
    showItemInFolder: (p) => shell.showItemInFolder(p),
    openExternal: (url) => shell.openExternal(url),
  };

  // ===== НАСТРОЙКИ ПРИЛОЖЕНИЯ (только чтение) =====
  bpm.settings = {
    /** settings.json: blenderPath, substancePath, projectsPath, supabaseUrl и т.д. */
    get: () => fs.readJson(settingsPath).catch(() => ({})),
  };

  return bpm;
}

/** Выполняет действие скрипта-интеграции. Ошибки пробрасываются наверх. */
async function runIntegrationAction(scriptExports, actionId, bpm) {
  if (!scriptExports || !Array.isArray(scriptExports.actions)) {
    throw new Error('В скрипте нет массива actions');
  }
  const action = scriptExports.actions.find((a) => a && a.id === actionId);
  if (!action || typeof action.run !== 'function') {
    throw new Error(`Действие "${actionId}" не найдено в скрипте или не является функцией`);
  }
  await action.run(bpm, bpm.project);
}

/** Исполняемый ли путь — такой можно запускать напрямую через spawn.
 *  Это .exe/.com либо путь БЕЗ расширения (исполняемые файлы Unix).
 *  Всё остальное (.lnk, .uproject, документы) через spawn запускать
 *  нельзя — Windows вернёт ошибку «spawn EFTYPE». */
function isExecutablePath(p) {
  const file = String(p || '');
  if (!file) return false;
  const ext = path.extname(file).toLowerCase();
  if (!ext) return true; // без расширения — считаем исполняемым (Unix-стиль)
  return ext === '.exe' || ext === '.com';
}

/** Разрешает .lnk-ярлык Windows в его цель (shell.readShortcutLink).
 *  Возвращает { target, cwd, args, description, iconPath, iconIndex }
 *  или null, если это не .lnk, ярлык битый или API недоступен. */
function resolveWindowsShortcut(lnkPath) {
  if (!lnkPath || path.extname(lnkPath).toLowerCase() !== '.lnk') return null;
  if (typeof shell.readShortcutLink !== 'function') return null;
  try {
    const info = shell.readShortcutLink(lnkPath);
    return info && typeof info === 'object' ? info : null;
  } catch (err) {
    console.warn('custom-apps: не удалось прочитать ярлык:', lnkPath, '-', err.message);
    return null;
  }
}

/** Разбивает строку аргументов из поля «Объект» ярлыка (Arguments) по
 *  упрощённым правилам CommandLineToArgvW: разделители — пробел/табуляция,
 *  кавычки группируют ("C:\Program Files\x.exe" → один аргумент). */
function splitShortcutArgs(str) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  let hasToken = false;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"') { inQuotes = !inQuotes; hasToken = true; continue; }
    if (!inQuotes && (ch === ' ' || ch === '\t')) {
      if (cur || hasToken) { out.push(cur); cur = ''; hasToken = false; }
      continue;
    }
    cur += ch;
  }
  if (cur || hasToken) out.push(cur);
  return out;
}

/** Извлекает нативную иконку ярлыка приложения (dataURL) или null.
 *  Для .lnk иконка берётся из ЦЕЛИ ярлыка: Windows отдаёт для самого .lnk
 *  «битую» иконку-страницу (отсюда битые иконки у ярлыков UE5 и др.).
 *  Порядок попыток: iconPath ярлыка → цель ярлыка → сам файл. */
async function extractAppIcon(execPath) {
  const candidates = [];
  const shortcut = resolveWindowsShortcut(execPath);
  if (shortcut) {
    if (shortcut.iconPath) candidates.push(shortcut.iconPath);
    if (shortcut.target) candidates.push(shortcut.target);
  }
  candidates.push(execPath);
  for (const candidate of candidates) {
    try {
      if (!candidate || !(await fs.pathExists(candidate))) continue;
      const image = await app.getFileIcon(candidate, { size: 'large' });
      if (!image || typeof image.toDataURL !== 'function') continue;
      if (typeof image.isEmpty === 'function' && image.isEmpty()) continue;
      return image.toDataURL();
    } catch (err) {
      console.warn('custom-apps: иконка не получена:', candidate, '-', err.message);
    }
  }
  return null;
}

/** Пересобирает иконки у уже добавленных ярлыков: у .lnk/.url — всегда
 *  (раньше .lnk получал «битую» иконку), у остальных — только если иконки
 *  нет. Запускается один раз при старте приложения; запись обновляется,
 *  только если иконка реально изменилась. @returns {Promise<boolean>} */
async function migrateCustomAppIcons(storePath) {
  try {
    const file = storePath || customAppsPath;
    const data = await readCustomAppsFile(file);
    let changed = false;
    for (const appEntry of data.apps) {
      const ext = path.extname(appEntry.execPath || '').toLowerCase();
      const needsRebuild = ext === '.lnk' || ext === '.url' || !appEntry.icon;
      if (!needsRebuild) continue;
      try {
        const icon = await extractAppIcon(appEntry.execPath);
        if (icon && icon !== appEntry.icon) {
          appEntry.icon = icon;
          changed = true;
        }
      } catch (err) {
        console.warn('custom-apps: не удалось обновить иконку:', appEntry.execPath, '-', err.message);
      }
    }
    if (changed) await writeCustomAppsFile(file, data.apps);
    return changed;
  } catch (err) {
    console.warn('custom-apps: ошибка миграции иконок:', err.message);
    return false;
  }
}

/**
 * Запускает пользовательское приложение (+ хук onLaunch скрипта, если подключен).
 * Способ запуска по типу файла:
 *   .exe/.com и пути без расширения — spawn (аргументы getLaunchArgs работают);
 *   .bat/.cmd — cmd.exe (без аргументов);
 *   .lnk — цель ярлыка (если .exe, с аргументами), иначе через ОС;
 *   всё остальное (.url, .uproject, документы) — системный обработчик ОС,
 *   как двойной клик в проводнике (spawn таких файлов даёт spawn EFTYPE).
 * @returns {{ pid: number|null, warning?: string }}
 */
async function launchCustomAppInternal(appConfig, projectPath) {
  let scriptExports = null;
  let bpm = null;
  let warning = null;

  // 1. Скрипт-интеграция (если подключен) — загружаем ДО запуска.
  //    Битый скрипт НЕ мешает запуску приложения — ошибка уйдёт в warning.
  if (appConfig.scriptPath) {
    try {
      if (!(await fs.pathExists(appConfig.scriptPath))) {
        warning = `Скрипт не найден: ${appConfig.scriptPath}`;
      } else {
        scriptExports = loadIntegrationScript(appConfig.scriptPath);
        bpm = createIntegrationContext(appConfig, projectPath);
      }
    } catch (err) {
      console.error('custom-apps: ошибка загрузки скрипта интеграции:', err);
      warning = `Скрипт интеграции: ${err.message}`;
      scriptExports = null;
      bpm = null;
    }
  }

  // 2. Хук getLaunchArgs (опционально) — скрипт готовит файлы ДО запуска и
  //    возвращает аргументы командной строки (например, путь к SVG проекта
  //    для Inkscape). Аргументы применяются при запуске через spawn:
  //    .exe/.com, а также
  //    .lnk, цель которого — исполняемый файл. Для .url/.bat и документов
  //    (их запускает ОС) аргументы не передаются.
  let launchArgs = [];
  if (scriptExports && bpm && typeof scriptExports.getLaunchArgs === 'function') {
    try {
      const args = await scriptExports.getLaunchArgs(bpm, bpm.project);
      if (Array.isArray(args)) launchArgs = args.map((a) => String(a));
    } catch (err) {
      console.error('custom-apps: ошибка в getLaunchArgs:', err);
      warning = warning ? `${warning}; getLaunchArgs: ${err.message}` : `getLaunchArgs: ${err.message}`;
    }
  }

  // 3. Запуск приложения — способ зависит от типа файла
  const ext = path.extname(appConfig.execPath || '').toLowerCase();
  const cwd = projectPath && (await fs.pathExists(projectPath)) ? projectPath : undefined;
  let pid = null;

  if (ext === '.bat' || ext === '.cmd') {
    const child = spawn('cmd.exe', ['/c', appConfig.execPath], { detached: true, stdio: 'ignore', cwd });
    child.once('error', (err) => console.error('custom-apps: ошибка запуска .bat:', err));
    child.unref();
    pid = child.pid !== undefined ? child.pid : null;
  } else if (ext === '.lnk') {
    // Ярлык: если цель — исполняемый файл, запускаем её напрямую через spawn
    // (собственные аргументы ярлыка сохраняются, аргументы getLaunchArgs
    // работают). Иначе (цель — документ/папка или ярлык битый) — через ОС.
    const shortcut = resolveWindowsShortcut(appConfig.execPath);
    if (shortcut && isExecutablePath(shortcut.target)) {
      const args = [...splitShortcutArgs(shortcut.args), ...launchArgs];
      const child = spawn(shortcut.target, args, { detached: true, stdio: 'ignore', cwd });
      child.once('error', (err) => console.error('custom-apps: ошибка запуска цели ярлыка:', err));
      child.unref();
      pid = child.pid !== undefined ? child.pid : null;
    } else {
      const openError = await shell.openPath(appConfig.execPath);
      if (openError) throw new Error(`${openError} (файл: ${appConfig.execPath})`);
    }
  } else if (isExecutablePath(appConfig.execPath)) {
    // .exe/.com (или путь без расширения) — прямой запуск с аргументами
    const child = spawn(appConfig.execPath, launchArgs, { detached: true, stdio: 'ignore', cwd });
    child.once('error', (err) => console.error('custom-apps: ошибка запуска приложения:', err));
    child.unref();
    pid = child.pid !== undefined ? child.pid : null;
  } else {
    // Всё остальное (.url, .uproject, документы проектов) — системный
    // обработчик ОС, как двойной клик в проводнике: .uproject откроется
    // в Unreal Editor, назначенном в Windows. Прямой spawn таких файлов
    // невозможен — Windows вернул бы ошибку «spawn EFTYPE».
    const openError = await shell.openPath(appConfig.execPath);
    if (openError) throw new Error(`${openError} (файл: ${appConfig.execPath})`);
  }

  // 4. Хук onLaunch скрипта — после запуска приложения
  if (scriptExports && bpm) {
    try {
      if (typeof scriptExports.onLaunch === 'function') {
        await scriptExports.onLaunch(bpm, bpm.project, pid);
      }
    } catch (err) {
      console.error('custom-apps: ошибка в onLaunch:', err);
      warning = warning ? `${warning}; onLaunch: ${err.message}` : `onLaunch: ${err.message}`;
    }
  }

  return pid === null && warning ? { pid, warning } : { pid, warning: warning || undefined };
}

/** Нормализует список расширений: строку "SVG, .inx;psd" или массив →
 *  ['svg','inx','psd'] — без точек, в нижнем регистре, без дублей и мусора. */
function normalizeExtensions(input) {
  const raw = Array.isArray(input) ? input.join(',') : String(input || '');
  const seen = new Set();
  const result = [];
  for (const piece of raw.split(/[,;\s]+/)) {
    const ext = String(piece)
      .trim()
      .toLowerCase()
      .replace(/^\.+/, '')
      .replace(/[^a-z0-9]/g, '');
    if (!ext || seen.has(ext)) continue;
    seen.add(ext);
    result.push(ext);
    if (result.length >= 16) break; // разумный максимум на один ярлык
  }
  return result;
}

/** Ищет ярлык, с которым ассоциировано расширение (с точкой или без).
 *  @param {string} ext - расширение, например 'svg' или '.svg'
 *  @param {string} [storePath] - путь к хранилищу (по умолчанию — общий)
 *  @returns {Promise<object|null>} запись ярлыка или null */
async function findCustomAppForExtension(ext, storePath) {
  const normalized = String(ext || '').trim().toLowerCase().replace(/^\.+/, '');
  if (!normalized) return null;
  const data = await readCustomAppsFile(storePath || customAppsPath);
  return data.apps.find((a) => Array.isArray(a.exts) && a.exts.includes(normalized)) || null;
}

/**
 * Открывает файл в пользовательском приложении (ассоциация расширения).
 * Отличия от launchCustomAppInternal: файл задаётся ЯВНО, поэтому хук
 * getLaunchArgs НЕ вызывается (его аргументы уступают явному файлу),
 * а onLaunch выполняется (настройка окружения).
 * .exe передаёт файл аргументом; .lnk — цель ярлыка (если .exe) или ОС;
 * приложение-не-исполняемый файл (.url, документ) — файл откроет ОС.
 * @returns {{ pid: number|null, openedViaOs?: boolean, warning?: string }}
 */
async function openFileWithCustomAppInternal(appConfig, filePath, projectPath) {
  let scriptExports = null;
  let bpm = null;
  let warning = null;

  // 1. Скрипт (если подключен) — только ради onLaunch; ошибки не мешают открытию
  if (appConfig.scriptPath) {
    try {
      if (await fs.pathExists(appConfig.scriptPath)) {
        scriptExports = loadIntegrationScript(appConfig.scriptPath);
        bpm = createIntegrationContext(appConfig, projectPath || null);
      }
    } catch (err) {
      console.error('custom-apps: ошибка загрузки скрипта при открытии файла:', err);
      warning = `Скрипт интеграции: ${err.message}`;
      scriptExports = null;
      bpm = null;
    }
  }

  if (!(await fs.pathExists(filePath))) {
    throw new Error(`Файл не найден: ${filePath}`);
  }

  // 2. Запуск приложения с файлом — способ зависит от типа ярлыка
  const ext = path.extname(appConfig.execPath || '').toLowerCase();
  let pid = null;
  let openedViaOs = false;

  if (ext === '.bat' || ext === '.cmd') {
    const child = spawn('cmd.exe', ['/c', appConfig.execPath, filePath], {
      detached: true,
      stdio: 'ignore',
      cwd: path.dirname(filePath),
    });
    child.once('error', (err) => console.error('custom-apps: ошибка запуска .bat:', err));
    child.unref();
    pid = child.pid !== undefined ? child.pid : null;
  } else if (ext === '.lnk') {
    // Ярлык: если цель — исполняемый файл, запускаем её с файлом аргументом;
    // иначе (цель — документ/папка, ярлык битый) файл откроет ОС.
    const shortcut = resolveWindowsShortcut(appConfig.execPath);
    if (shortcut && isExecutablePath(shortcut.target)) {
      const child = spawn(shortcut.target, [...splitShortcutArgs(shortcut.args), filePath], {
        detached: true,
        stdio: 'ignore',
        cwd: path.dirname(filePath),
      });
      child.once('error', (err) => console.error('custom-apps: ошибка открытия через ярлык:', err));
      child.unref();
      pid = child.pid !== undefined ? child.pid : null;
    } else {
      const openError = await shell.openPath(filePath);
      if (openError) throw new Error(openError);
      openedViaOs = true;
    }
  } else if (isExecutablePath(appConfig.execPath)) {
    const child = spawn(appConfig.execPath, [filePath], {
      detached: true,
      stdio: 'ignore',
      cwd: path.dirname(filePath),
    });
    child.once('error', (err) => console.error('custom-apps: ошибка открытия файла:', err));
    child.unref();
    pid = child.pid !== undefined ? child.pid : null;
  } else {
    // Приложение — не исполняемый файл (.url, документ): файл откроет ОС
    const openError = await shell.openPath(filePath);
    if (openError) throw new Error(openError);
    openedViaOs = true;
  }

  // 3. Хук onLaunch — после запуска
  if (scriptExports && bpm && typeof scriptExports.onLaunch === 'function') {
    try {
      await scriptExports.onLaunch(bpm, bpm.project, pid);
    } catch (err) {
      console.error('custom-apps: ошибка в onLaunch (открытие файла):', err);
      warning = warning ? `${warning}; onLaunch: ${err.message}` : `onLaunch: ${err.message}`;
    }
  }

  return { pid, openedViaOs, warning: warning || undefined };
}

// >>> CUSTOM-APPS-CORE-END

// --- IPC-обработчики пользовательских приложений ---

ipcMain.handle('custom-apps-list', async () => {
  try {
    const data = await readCustomAppsFile(customAppsPath);
    return ok({ apps: data.apps });
  } catch (error) {
    return fail(error);
  }
});

ipcMain.handle('custom-apps-pick-executable', async () => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: 'Выберите приложение или ярлык',
      filters: [
        { name: 'Приложения и проекты', extensions: ['exe', 'lnk', 'url', 'bat', 'cmd', 'uproject'] },
        { name: 'Все файлы', extensions: ['*'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return ok({ canceled: true });
    const execPath = result.filePaths[0];
    const defaultName = path.basename(execPath, path.extname(execPath)) || path.basename(execPath);
    return ok({ path: execPath, defaultName });
  } catch (error) {
    return fail(error);
  }
});

ipcMain.handle('custom-apps-pick-script', async () => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: 'Выберите скрипт интеграции (.js)',
      filters: [
        { name: 'Скрипты интеграции', extensions: ['js'] },
        { name: 'Все файлы', extensions: ['*'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return ok({ canceled: true });
    return ok({ path: result.filePaths[0] });
  } catch (error) {
    return fail(error);
  }
});

ipcMain.handle('custom-apps-add', async (_event, payload = {}) => {
  try {
    const { execPath, name, scriptPath, exts } = payload;
    if (!execPath || typeof execPath !== 'string') {
      return fail(new Error('Не указан путь к приложению'));
    }
    if (!(await fs.pathExists(execPath))) {
      return fail(new Error(`Файл не найден: ${execPath}`));
    }

    // Нативная иконка приложения. Для .lnk берётся из цели ярлыка (у самого
    // ярлыка Windows отдаёт «битую» иконку). Ошибка иконки не критична.
    let icon = null;
    try {
      icon = await extractAppIcon(execPath);
    } catch (err) {
      console.warn('custom-apps: не удалось получить иконку:', err.message);
    }

    const data = await readCustomAppsFile(customAppsPath);
    const entry = {
      id: makeCustomAppId(),
      name: (name && String(name).trim()) || path.basename(execPath),
      execPath,
      icon,
      exts: normalizeExtensions(exts),
      scriptPath: scriptPath || null,
      scriptName: scriptPath ? path.basename(scriptPath) : null,
      createdAt: new Date().toISOString(),
    };
    data.apps.push(entry);
    await writeCustomAppsFile(customAppsPath, data.apps);
    return ok({ app: entry });
  } catch (error) {
    return fail(error);
  }
});

ipcMain.handle('custom-apps-update', async (_event, payload = {}) => {
  try {
    const { id, name, scriptPath, exts } = payload;
    if (!id) return fail(new Error('Не указан id ярлыка'));
    const data = await readCustomAppsFile(customAppsPath);
    const entry = data.apps.find((a) => a.id === id);
    if (!entry) return fail(new Error('Ярлык не найден'));

    if (typeof name === 'string' && name.trim()) {
      entry.name = name.trim();
    }
    if (payload.hasOwnProperty('scriptPath')) {
      // Явная передача null = открепить скрипт
      entry.scriptPath = scriptPath || null;
      entry.scriptName = scriptPath ? path.basename(scriptPath) : null;
    }
    if (payload.hasOwnProperty('exts')) {
      // Ассоциации расширений: строка "svg, inx" или массив; пусто = убрать все
      entry.exts = normalizeExtensions(exts);
    }
    await writeCustomAppsFile(customAppsPath, data.apps);
    return ok({ app: entry });
  } catch (error) {
    return fail(error);
  }
});

ipcMain.handle('custom-apps-remove', async (_event, id) => {
  try {
    if (!id) return fail(new Error('Не указан id ярлыка'));
    const data = await readCustomAppsFile(customAppsPath);
    const filtered = data.apps.filter((a) => a.id !== id);
    await writeCustomAppsFile(customAppsPath, filtered);
    return ok();
  } catch (error) {
    return fail(error);
  }
});

ipcMain.handle('custom-apps-get-actions', async (_event, id) => {
  try {
    const data = await readCustomAppsFile(customAppsPath);
    const entry = data.apps.find((a) => a.id === id);
    if (!entry) return fail(new Error('Ярлык не найден'));
    if (!entry.scriptPath) return ok({ actions: [] });
    if (!(await fs.pathExists(entry.scriptPath))) {
      return ok({ actions: [], scriptError: `Скрипт не найден: ${entry.scriptPath}` });
    }
    try {
      const scriptExports = loadIntegrationScript(entry.scriptPath);
      return ok({ actions: getIntegrationActions(scriptExports) });
    } catch (err) {
      return ok({ actions: [], scriptError: err.message });
    }
  } catch (error) {
    return fail(error);
  }
});

ipcMain.handle('custom-apps-launch', async (_event, payload = {}) => {
  try {
    const { id, projectPath } = payload;
    const data = await readCustomAppsFile(customAppsPath);
    const entry = data.apps.find((a) => a.id === id);
    if (!entry) return fail(new Error('Ярлык не найден'));
    const result = await launchCustomAppInternal(entry, projectPath || null);
    return ok(result);
  } catch (error) {
    return fail(error);
  }
});

ipcMain.handle('custom-apps-run-action', async (_event, payload = {}) => {
  try {
    const { id, actionId, projectPath } = payload;
    const data = await readCustomAppsFile(customAppsPath);
    const entry = data.apps.find((a) => a.id === id);
    if (!entry) return fail(new Error('Ярлык не найден'));
    if (!entry.scriptPath) return fail(new Error('К ярлыку не подключён скрипт интеграции'));
    const scriptExports = loadIntegrationScript(entry.scriptPath);
    const bpm = createIntegrationContext(entry, projectPath || null);
    await runIntegrationAction(scriptExports, actionId, bpm);
    return ok();
  } catch (error) {
    return fail(error);
  }
});

// Открытие файла в приложении ярлыка (ассоциация расширения).
// Используется файловым менеджером и File overview при двойном клике.
ipcMain.handle('custom-apps-open-file', async (_event, payload = {}) => {
  try {
    const { id, filePath, projectPath } = payload;
    if (!filePath || typeof filePath !== 'string') {
      return fail(new Error('Не указан файл'));
    }
    const data = await readCustomAppsFile(customAppsPath);
    const entry = data.apps.find((a) => a.id === id);
    if (!entry) return fail(new Error('Ярлык не найден'));
    const result = await openFileWithCustomAppInternal(entry, filePath, projectPath || null);
    return ok(result);
  } catch (error) {
    return fail(error);
  }
});

// ===== СИСТЕМА =====
ipcMain.handle('ping', () => 'pong');

// ===== АВТОРИЗАЦИЯ (Supabase) =====
ipcMain.handle('auth-user', async (_event, { supabaseUrl, supabaseKey, email, password }) => {
  if (!supabaseUrl || !supabaseKey) {
    return fail(new Error('Supabase URL и Key обязательны'));
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Проверяем доступность таблицы Users
    const { error: testError } = await supabase
      .from('Users')
      .select('count', { count: 'exact', head: true });

    if (testError) {
      return fail(
        new Error(`Ошибка доступа к таблице Users: ${testError.message}. Проверьте настройки RLS.`)
      );
    }

    // Ищем пользователя по email
    const { data: users, error: searchError } = await supabase
      .from('Users')
      .select('*')
      .eq('email', email);

    if (searchError) {
      return fail(new Error(`Ошибка поиска: ${searchError.message}`));
    }

    if (!users || users.length === 0) {
      return fail(new Error(`Пользователь с email "${email}" не найден. Проверьте правильность email.`));
    }

    const user = users[0];
    const hasPassword = user.password_hash && user.password_hash.trim() !== '';

    // Первый вход — устанавливаем пароль
    if (!hasPassword) {
      const hash = await bcrypt.hash(password, 10);
      const { error: updateError } = await supabase
        .from('Users')
        .update({ password_hash: hash })
        .eq('id', user.id);

      if (updateError) {
        return fail(new Error(`Ошибка установки пароля: ${updateError.message}`));
      }

      const { data: updatedUser, error: fetchError } = await supabase
        .from('Users')
        .select('*')
        .eq('id', user.id)
        .single();

      if (fetchError) {
        return fail(new Error(`Ошибка получения данных: ${fetchError.message}`));
      }

      const { password_hash, ...safeUser } = updatedUser;
      return ok({
        user: safeUser,
        firstLogin: true,
        message: 'Пароль успешно установлен!',
      });
    }

    // Проверяем пароль
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return fail(new Error('Неверный пароль'));
    }

    const { password_hash, ...safeUser } = user;
    return ok({ user: safeUser, firstLogin: false });
  } catch (error) {
    return fail(error);
  }
});

// ===== ЗАДАЧИ SUPABASE =====
ipcMain.handle('get-user-tasks', async (_event, { supabaseUrl, supabaseKey, userId, role }) => {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Только задачи со статусом 'created'.
    // Админ/лид видят все, остальные — только назначенные им.
    // Включаем check_list (чек-лист через ";") и note (заметки).
    let query = supabase
      .from('Tasks')
      .select('id, created_at, title, assignee_id, created_by, status, deadline, project_id, check_list, note')
      .eq('status', 'created');

    if (role !== 'admin' && role !== 'lead') {
      query = query.eq('assignee_id', userId);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) {
      return fail(error);
    }

    const tasks = data || [];

    // Подгружаем связанные имена мешей из таблицы Mesh_names.
    if (tasks.length > 0) {
      const taskIds = tasks.map((t) => t.id);
      const { data: meshRows, error: meshError } = await supabase
        .from('Mesh_names')
        .select('mesh_name, task_id')
        .in('task_id', taskIds);

      if (meshError) {
        console.error('Ошибка загрузки Mesh_names:', meshError.message);
      }

      const meshesByTask = {};
      if (meshRows) {
        for (const row of meshRows) {
          if (!meshesByTask[row.task_id]) meshesByTask[row.task_id] = [];
          meshesByTask[row.task_id].push(row.mesh_name);
        }
      }

      for (const task of tasks) {
        task.meshes = meshesByTask[task.id] || [];
      }
    }

    return ok({ tasks });
  } catch (error) {
    return fail(error);
  }
});

ipcMain.handle('get-users-list', async (_event, { supabaseUrl, supabaseKey }) => {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
      .from('Users')
      .select('id, Name, email, role')
      .order('Name');
    if (error) {
      return fail(error);
    }
    return ok({ users: data });
  } catch (error) {
    return fail(error);
  }
});

ipcMain.handle('update-task-status', async (_event, { supabaseUrl, supabaseKey, taskId, status, projectId }) => {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: task, error: checkError } = await supabase
      .from('Tasks')
      .select('id, status')
      .eq('id', taskId)
      .single();

    if (checkError) {
      return fail(new Error(`Задача не найдена: ${checkError.message}`));
    }

    const { data: updated, error: updateError } = await supabase
      .from('Tasks')
      .update({
        status,
        project_id: projectId || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId)
      .select();

    if (updateError) {
      return fail(updateError);
    }

    return ok({ data: updated });
  } catch (error) {
    return fail(error);
  }
});

// ===== СОЗДАНИЕ ЗАДАЧИ В SUPABASE =====
// Создаёт новую задачу в таблице Tasks.
// data = {
//   supabaseUrl, supabaseKey,
//   assigneeId,   — id исполнителя (из таблицы Users)
//   createdById,  — id постановщика задачи
//   title,        — заголовок задачи (обычно = имя проекта)
//   checkList,    — текст чек-листа (задачи через ";")
//   note,         — текст заметок
// }
// status = 'created' (берётся из таблицы status, поле status).
// id генерируется автоматически БД.
// created_at = текущее время.
ipcMain.handle('create-task', async (_event, data) => {
  try {
    const { supabaseUrl, supabaseKey, assigneeId, createdById, title, checkList, note } = data;
    if (!supabaseUrl || !supabaseKey) {
      return fail(new Error('Supabase URL и Key обязательны'));
    }
    if (!assigneeId || !createdById) {
      return fail(new Error('assigneeId и createdById обязательны'));
    }
    if (!title || !title.trim()) {
      return fail(new Error('title обязателен'));
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const insertData = {
      created_at: new Date().toISOString(),
      assignee_id: assigneeId,
      created_by: createdById,
      status: 'created',
      title: title.trim(),
      check_list: checkList || '',
      note: note || '',
    };

    const { data: inserted, error } = await supabase
      .from('Tasks')
      .insert(insertData)
      .select();

    if (error) {
      return fail(error);
    }

    return ok({ task: inserted && inserted[0] ? inserted[0] : null });
  } catch (error) {
    return fail(error);
  }
});

// ===== НАБЛЮДЕНИЕ ЗА ФАЙЛОВОЙ СИСТЕМОЙ (LIVE-ОБНОВЛЕНИЕ ИНТЕРФЕЙСА) =====
// Следим за каталогом проектов (рекурсивно) и сообщаем renderer'у об изменениях:
//   - появились/исчезли/переименовались ПАПКИ проектов → renderer перечитывает
//     список проектов; если удалён выбранный проект — на его месте остаётся
//     приветственный экран;
//   - изменились ФАЙЛЫ внутри проекта → renderer обновляет File overview
//     и файловый менеджер без перезагрузки страницы (F5/Ctrl+R больше не нужны).
// project.json и временные файлы (~$...) игнорируются: их пишет само приложение,
// и лишние перерендеры при задачах/заметках/статусах не нужны.
// На Windows/macOS используется рекурсивный fs.watch; на Linux (recursive не
// поддерживается) — наблюдение корня и папок проектов первого уровня.
// События копятся и отправляются пачкой (дебаунс), чтобы Blender/UE5,
// сохраняющие файл через временные копии, не вызывали лавину перерисовок.

// >>> FS-WATCH-CORE-START (тесты извлекают эту часть)

// В тестах debounce/задержка перезапуска подменяются через global
// (см. scripts/test_fs_watch.js); в приложении работают значения по умолчанию.
const FS_WATCH_DEBOUNCE_MS =
  (typeof global !== 'undefined' && Number(global.__fsWatchDebounceMs)) || 400;
const FS_WATCH_RESTART_DELAY_MS =
  (typeof global !== 'undefined' && Number(global.__fsWatchRestartDelayMs)) || 5000;
const FS_WATCH_MAX_RESTARTS = 12;

// Нормализованный путь корня проектов -> состояние наблюдения
const fsWatchers = new Map();

/** Нормализует путь корня проектов для ключа наблюдения.
 *  Корни дисков ('C:\\', '/') не трогаем — срез хвостового разделителя
 *  превратил бы 'C:\\' в относительный 'C:'. */
function normalizeWatchRoot(p) {
  const raw = String(p || '');
  const norm = path.normalize(raw);
  if (!norm || norm.length <= 3 || /^[a-zA-Z]:[\\/]?$/.test(norm)) return norm;
  return norm.replace(/[\\/]+$/, '');
}

/** Абсолютный ли путь. Учитывает Windows-стиль на любой платформе
 *  (C:\\..., C:/..., UNC \\\\server\\...) — иначе на Linux-тестах
 *  и в кросс-платформенных строках isAbsolute() ошибается. */
function isAbsoluteFsPath(p) {
  if (!p) return false;
  const s = String(p);
  if (path.isAbsolute(s)) return true;
  return /^[a-zA-Z]:[\\/]/.test(s) || /^\\\\[^\\]/.test(s);
}

/** Файлы, на которые интерфейс реагировать не должен:
 *  project.json пишется самим приложением (задачи/заметки/статусы/восстановление),
 *  '~$...' — временные файлы Office и некоторых других программ. */
function isWatchNoiseFileName(name) {
  if (!name) return false;
  const base = path.basename(String(name));
  if (base === 'project.json') return true;
  if (base.startsWith('~')) return true;
  return false;
}

/** Помечает «грязную» область и планирует отправку событий (с дебаунсом).
 *  scope: { kind: 'root' } — изменилось содержимое корня проектов (список
 *  проектов), либо { kind: 'project', projectPath } — изменились файлы проекта. */
function markFsEvent(rootKey, scope, fileName) {
  const state = fsWatchers.get(rootKey);
  if (!state) return;
  if (fileName && isWatchNoiseFileName(fileName)) return;

  if (scope && scope.kind === 'project' && scope.projectPath) {
    state.projects.add(scope.projectPath);
  } else {
    state.rootDirty = true;
  }

  if (state.timer) clearTimeout(state.timer);
  state.timer = setTimeout(() => flushFsEvents(rootKey), FS_WATCH_DEBOUNCE_MS);
}

/** Отправляет накопленные события в renderer (одним сообщением на окно). */
function flushFsEvents(rootKey) {
  const state = fsWatchers.get(rootKey);
  if (!state) return;
  state.timer = null;

  const projectsChanged = state.rootDirty;
  const projectPaths = Array.from(state.projects);
  state.rootDirty = false;
  state.projects.clear();

  if (!projectsChanged && projectPaths.length === 0) return;

  const payload = { root: rootKey, projectsChanged, projectPaths };
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      win.webContents.send('fs-event', payload);
    } catch {
      // окно уже закрывается — пропускаем
    }
  }
}

/** Разбор события рекурсивного watch'ера.
 *  Windows: fileName — полный путь; macOS: относительный (может с '/');
 *  Linux: просто имя файла. Все варианты сводим к одному виду. */
function onRecursiveFsChange(rootKey, fileName) {
  if (!fileName) {
    markFsEvent(rootKey, { kind: 'root' });
    return;
  }
  const name = String(fileName);
  if (isWatchNoiseFileName(name)) return;

  let rel;
  if (isAbsoluteFsPath(name)) {
    rel = path.relative(rootKey, name);
  } else {
    rel = name.split('/').join(path.sep);
  }

  if (!rel || rel.startsWith('..') || isAbsoluteFsPath(rel)) {
    // событие вне наблюдаемого корня — считаем изменением корня
    markFsEvent(rootKey, { kind: 'root' });
    return;
  }

  const parts = rel.split(path.sep).filter(Boolean);
  if (parts.length <= 1) {
    // Непосредственный ребёнок корня: папка проекта добавлена/удалена/переименована
    markFsEvent(rootKey, { kind: 'root' });
    return;
  }

  // project.json меняет само приложение — файловые списки от него не зависят
  if (parts.length === 2 && parts[1] === 'project.json') return;

  markFsEvent(rootKey, { kind: 'project', projectPath: path.join(rootKey, parts[0]) });
}

/** Закрывает все watch'еры состояния и сбрасывает накопленные события. */
function closeFsWatchState(state) {
  for (const w of state.watchers) {
    try {
      w.close();
    } catch {
      // уже закрыт
    }
  }
  state.watchers = [];
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
}

/** Подключает watch'еры к корню проектов. Возвращает true, если удалось
 *  подключить хотя бы один. */
function attachFsWatchers(rootKey, state) {
  let recursiveWatcher = null;
  try {
    recursiveWatcher = fs.watch(rootKey, { recursive: true, persistent: false });
  } catch {
    // Linux: ERR_FEATURE_UNAVAILABLE_ON_PLATFORM — рекурсия не поддерживается
    recursiveWatcher = null;
  }

  if (recursiveWatcher) {
    recursiveWatcher.on('change', (_eventType, fileName) => {
      onRecursiveFsChange(rootKey, fileName);
    });
    recursiveWatcher.on('error', () => scheduleFsWatchRestart(rootKey));
    state.watchers.push(recursiveWatcher);
    return true;
  }

  // ---- Fallback без рекурсии (Linux): корень + папки проектов 1-го уровня ----
  try {
    const rootWatcher = fs.watch(rootKey, { persistent: false });
    rootWatcher.on('change', (_e, fileName) => {
      markFsEvent(rootKey, { kind: 'root' }, fileName);
    });
    rootWatcher.on('error', () => scheduleFsWatchRestart(rootKey));
    state.watchers.push(rootWatcher);
  } catch {
    // корень мог исчезнуть между pathExists и watch
  }

  let entries = [];
  try {
    entries = fs.readdirSync(rootKey, { withFileTypes: true });
  } catch {
    return state.watchers.length > 0;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.') || entry.name.startsWith('$')) continue;
    const projectPath = path.join(rootKey, entry.name);
    try {
      const w = fs.watch(projectPath, { persistent: false });
      w.on('change', (_e, fileName) => {
        markFsEvent(rootKey, { kind: 'project', projectPath }, fileName);
      });
      w.on('error', () => {
        // отдельная папка проекта исчезла — не критично для остальных
      });
      state.watchers.push(w);
    } catch {
      // папка исчезла между readdir и watch
    }
  }

  return state.watchers.length > 0;
}

/** Перезапуск наблюдения после ошибки watch'ера (например, корень был удалён
 *  или недоступен). Интерфейсу сразу уходит событие, чтобы он перечитал список. */
function scheduleFsWatchRestart(rootKey) {
  const state = fsWatchers.get(rootKey);
  if (!state) return;
  closeFsWatchState(state);
  state.rootDirty = true;
  flushFsEvents(rootKey);

  if (state.restartTimer) return; // перезапуск уже запланирован
  if (state.restarts >= FS_WATCH_MAX_RESTARTS) return;
  state.restarts += 1;

  state.restartTimer = setTimeout(async () => {
    const st = fsWatchers.get(rootKey);
    if (!st) return;
    st.restartTimer = null;
    const exists = await fs
      .pathExists(rootKey)
      .catch(() => false);
    if (!exists) {
      scheduleFsWatchRestart(rootKey); // попробуем позже
      return;
    }
    st.watchers = [];
    if (attachFsWatchers(rootKey, st)) {
      st.restarts = 0; // успешное подключение — сбрасываем счётчик
    }
  }, FS_WATCH_RESTART_DELAY_MS);
}

/** Включает наблюдение за каталогом проектов (идемпотентно). */
async function startFsWatchInternal(projectsPath) {
  if (!projectsPath || typeof projectsPath !== 'string') {
    return fail(new Error('Путь к проектам не указан'));
  }
  const rootKey = normalizeWatchRoot(projectsPath);
  if (!rootKey) {
    return fail(new Error('Путь к проектам не указан'));
  }
  if (!(await fs.pathExists(rootKey))) {
    return fail(new Error('Каталог проектов не существует: ' + projectsPath));
  }
  if (fsWatchers.has(rootKey)) {
    return ok({ already: true });
  }

  const state = {
    watchers: [],
    timer: null,
    restartTimer: null,
    restarts: 0,
    rootDirty: false,
    projects: new Set(),
  };
  fsWatchers.set(rootKey, state);

  const attached = attachFsWatchers(rootKey, state);
  if (!attached) {
    fsWatchers.delete(rootKey);
    return fail(new Error('Не удалось наблюдать за каталогом: ' + projectsPath));
  }
  return ok();
}

/** Выключает наблюдение за каталогом проектов (например, при переключении
 *  рабочей области). */
function stopFsWatchInternal(projectsPath) {
  const rootKey = normalizeWatchRoot(projectsPath);
  const state = fsWatchers.get(rootKey);
  if (!state) return ok();
  closeFsWatchState(state);
  if (state.restartTimer) {
    clearTimeout(state.restartTimer);
    state.restartTimer = null;
  }
  fsWatchers.delete(rootKey);
  return ok();
}

// >>> FS-WATCH-CORE-END

ipcMain.handle('watch-projects-root', async (_event, projectsPath) => {
  try {
    return await startFsWatchInternal(projectsPath);
  } catch (error) {
    return fail(error);
  }
});

ipcMain.handle('unwatch-projects-root', (_event, projectsPath) => {
  try {
    return stopFsWatchInternal(projectsPath);
  } catch (error) {
    return fail(error);
  }
});

// ===== ЖИЗНЕННЫЙ ЦИКЛ ПРИЛОЖЕНИЯ =====
app.whenReady().then(() => {
  createWindow();
  // Пересборка иконок ранее добавленных ярлыков: у .lnk Windows отдавал
  // «битую» иконку — теперь иконка берётся из цели ярлыка (например,
  // UnrealEditor.exe). Обновлённая иконка видна после перезапуска приложения.
  migrateCustomAppIcons();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Останавливаем все наблюдения за файловой системой при выходе
app.on('will-quit', () => {
  for (const rootKey of Array.from(fsWatchers.keys())) {
    try {
      stopFsWatchInternal(rootKey);
    } catch {
      // приложение завершается — игнорируем
    }
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
