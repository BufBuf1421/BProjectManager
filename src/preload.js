// src/preload.js
const { contextBridge, ipcRenderer, webUtils } = require('electron');

/**
 * Безопасный API для renderer-процесса.
 * Каждый метод — тонкая обёртка над ipcRenderer.invoke с тем же именем канала.
 * Группировка по доменам:
 *   - Системные
 *   - Настройки
 *   - Проекты
 *   - Задачи (локальные, в project.json)
 *   - Задачи (Supabase)
 *   - Заметки
 *   - Теги
 *   - Избранное
 *   - Файлы и директории
 *   - Запуск приложений
 *   - Диалоги ОС
 *   - Наблюдение за файловой системой (live-обновление UI)
 *   - Авторизация
 */
contextBridge.exposeInMainWorld('api', {
  // ===== СИСТЕМА =====
  ping: () => ipcRenderer.invoke('ping'),

  // ===== НАСТРОЙКИ =====
  checkSettings: () => ipcRenderer.invoke('check-settings'),
  loadSettings: () => ipcRenderer.invoke('load-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  loadTemplate: () => ipcRenderer.invoke('load-template'),

  // ===== ШАБЛОНЫ (новая система) =====
  templatesList: () => ipcRenderer.invoke('templates-list'),
  templatesSave: (template) => ipcRenderer.invoke('templates-save', template),
  templatesDelete: (templateId) => ipcRenderer.invoke('templates-delete', templateId),
  templatesSetDefault: (templateId) => ipcRenderer.invoke('templates-set-default', templateId),

  // ===== ПРОЕКТЫ =====
  getProjects: (projectsPath) => ipcRenderer.invoke('get-projects', projectsPath),
  createProject: (projectsPath, name, templateId, checkList, note) =>
    ipcRenderer.invoke('create-project', projectsPath, name, templateId, checkList, note),
  createProjectWithId: (projectsPath, name, id, meshes, templateId, checkList, note) =>
    ipcRenderer.invoke('create-project-with-id', projectsPath, name, id, meshes, templateId, checkList, note),
  renameProject: (projectPath, newName) =>
    ipcRenderer.invoke('rename-project', projectPath, newName),
  deleteProject: (projectPath) => ipcRenderer.invoke('delete-project', projectPath),
  archiveProject: (projectPath) => ipcRenderer.invoke('archive-project', projectPath),
  unarchiveProject: (projectPath) => ipcRenderer.invoke('unarchive-project', projectPath),
  generateProjectId: () => ipcRenderer.invoke('generate-project-id'),

  // ===== СТАТУС И ИЗБРАННОЕ ПРОЕКТА =====
  updateProjectStatus: (projectPath, status, supabaseConfig) =>
    ipcRenderer.invoke('update-project-status', projectPath, status, supabaseConfig),
  updateProjectFavorite: (projectPath, favorite) =>
    ipcRenderer.invoke('update-project-favorite', projectPath, favorite),

  // ===== ПРЕВЬЮ ПРОЕКТА =====
  getProjectPreview: (projectPath) =>
    ipcRenderer.invoke('get-project-preview', projectPath),

  // ===== ЛОКАЛЬНЫЕ ЗАДАЧИ (в project.json) =====
  getProjectTasks: (projectPath) => ipcRenderer.invoke('get-project-tasks', projectPath),
  addTask: (projectPath, taskText) => ipcRenderer.invoke('add-task', projectPath, taskText),
  toggleTask: (projectPath, taskId, done) =>
    ipcRenderer.invoke('toggle-task', projectPath, taskId, done),
  deleteTask: (projectPath, taskId) => ipcRenderer.invoke('delete-task', projectPath, taskId),

  // ===== ЗАДАЧИ SUPABASE =====
  getUserTasks: (data) => ipcRenderer.invoke('get-user-tasks', data),
  updateTaskStatus: (data) => ipcRenderer.invoke('update-task-status', data),
  createTask: (data) => ipcRenderer.invoke('create-task', data),
  getUsersList: (data) => ipcRenderer.invoke('get-users-list', data),

  // ===== ЗАМЕТКИ =====
  getProjectNotes: (projectPath) => ipcRenderer.invoke('get-project-notes', projectPath),
  saveProjectNotes: (projectPath, notes) =>
    ipcRenderer.invoke('save-project-notes', projectPath, notes),

  // ===== ТЕГИ =====
  getProjectTags: (projectPath) => ipcRenderer.invoke('get-project-tags', projectPath),
  addTag: (projectPath, tag) => ipcRenderer.invoke('add-tag', projectPath, tag),
  removeTag: (projectPath, tag) => ipcRenderer.invoke('remove-tag', projectPath, tag),

  // ===== ФАЙЛЫ И ДИРЕКТОРИИ =====
  getProjectFiles: (projectPath) => ipcRenderer.invoke('get-project-files', projectPath),
  getDirectoryContents: (dirPath) => ipcRenderer.invoke('get-directory-contents', dirPath),
  find3dModels: (projectPath) => ipcRenderer.invoke('find-3d-models', projectPath),
  createFile: (filePath, content) => ipcRenderer.invoke('create-file', filePath, content),
  fileExists: (filePath) => ipcRenderer.invoke('file-exists', filePath),
  copyFile: (sourcePath, destPath) => ipcRenderer.invoke('copy-file', sourcePath, destPath),
  saveFileContent: (filePath, content) =>
    ipcRenderer.invoke('save-file-content', filePath, content),
  deletePath: (targetPath) => ipcRenderer.invoke('delete-path', targetPath),
  renamePath: (oldPath, newName) => ipcRenderer.invoke('rename-path', oldPath, newName),
  createFolder: (parentPath, folderName) =>
    ipcRenderer.invoke('create-folder', parentPath, folderName),
  // Возвращает реальный путь на диске для File-объекта (drag&drop из проводника).
  // ВАЖНО: webUtils.getPathForFile должен вызываться в renderer-процессе
  // (документированный паттерн Electron) — поэтому вызываем прямо здесь,
  // а не через IPC в main. Для виртуальных файлов путь пустой — проверяйте.
  getFilePath: (file) => {
    try {
      const p = webUtils.getPathForFile(file);
      return p ? { success: true, path: p } : { success: false, error: 'Нет пути' };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  },
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
  openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url),
  startDrag: (files) => ipcRenderer.send('start-drag', files),

  // ===== ЗАПУСК ПРИЛОЖЕНИЙ =====
  launchApp: (appPath, targetPath) => ipcRenderer.invoke('launch-app', appPath, targetPath),
  launchBlenderSave: (blenderPath, projectPath, fileName, options) =>
    ipcRenderer.invoke('launch-blender-save', blenderPath, projectPath, fileName, options),
  launchSubstance: (substancePath, projectPath, options) =>
    ipcRenderer.invoke('launch-substance', substancePath, projectPath, options),

  // ===== ПОЛЬЗОВАТЕЛЬСКИЕ ЯРЛЫКИ И СКРИПТЫ-ИНТЕГРАЦИИ =====
  // Список ярлыков, добавленных пользователем (кнопка "+" под Blender/SP)
  customAppsList: () => ipcRenderer.invoke('custom-apps-list'),
  // Диалоги выбора: приложения (.exe/.lnk/.bat) и скрипта интеграции (.js)
  customAppsPickExecutable: () => ipcRenderer.invoke('custom-apps-pick-executable'),
  customAppsPickScript: () => ipcRenderer.invoke('custom-apps-pick-script'),
  // CRUD ярлыков
  customAppsAdd: (payload) => ipcRenderer.invoke('custom-apps-add', payload),
  customAppsUpdate: (payload) => ipcRenderer.invoke('custom-apps-update', payload),
  customAppsRemove: (id) => ipcRenderer.invoke('custom-apps-remove', id),
  // Действия (actions) из подключённого скрипта — для контекстного меню
  customAppsGetActions: (id) => ipcRenderer.invoke('custom-apps-get-actions', id),
  // Запуск ярлыка (cwd = папка выбранного проекта) и выполнение действия скрипта
  customAppsLaunch: (id, projectPath) => ipcRenderer.invoke('custom-apps-launch', { id, projectPath }),
  customAppsRunAction: (id, actionId, projectPath) =>
    ipcRenderer.invoke('custom-apps-run-action', { id, actionId, projectPath }),
  // Открытие файла в приложении ярлыка (ассоциация расширения — двойной клик
  // в файловом менеджере и File overview)
  customAppsOpenFile: (id, filePath, projectPath) =>
    ipcRenderer.invoke('custom-apps-open-file', { id, filePath, projectPath }),

  // ===== ДИАЛОГИ ОС =====
  openDirectoryDialog: () => ipcRenderer.invoke('open-directory-dialog'),
  openFileDialog: (filters) => ipcRenderer.invoke('open-file-dialog', filters),

  // ===== НАБЛЮДЕНИЕ ЗА ФАЙЛОВОЙ СИСТЕМОЙ (LIVE-ОБНОВЛЕНИЕ ИНТЕРФЕЙСА) =====
  // Начать следить за каталогом проектов: изменения папок и файлов проектов
  // будут приходить через onFsEvent (File overview и файловый менеджер
  // обновляются без перезагрузки страницы).
  startWatching: (projectsPath) => ipcRenderer.invoke('watch-projects-root', projectsPath),
  // Прекратить наблюдение (например, при переключении рабочей области)
  stopWatching: (projectsPath) => ipcRenderer.invoke('unwatch-projects-root', projectsPath),
  // Подписка на события изменений.
  // payload = { root: <наблюдаемый каталог>, projectsChanged: <список проектов
  // изменился>, projectPaths: [<проекты, в которых изменились файлы>] }
  onFsEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('fs-event', listener);
    return () => ipcRenderer.removeListener('fs-event', listener);
  },

  // ===== АВТОРИЗАЦИЯ =====
  authUser: (data) => ipcRenderer.invoke('auth-user', data),

  // ===== ПОЛЬЗОВАТЕЛЬ (из localStorage, без IPC) =====
  getUserInfo: () => {
    try {
      const data = localStorage.getItem('authSettings');
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error('Ошибка получения пользователя:', e);
      return null;
    }
  },
});
