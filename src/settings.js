// src/settings.js
// Страница настроек с двумя вкладками: "Основные" и "Шаблоны".
// Вкладка "Основные": пути к Blender/Substance/проектам, режим Blender для мешей,
//   авторизация Supabase.
// Вкладка "Шаблоны": CRUD шаблонов проектов с tree-editor структуры папок.

document.addEventListener('DOMContentLoaded', () => {
  // ===== DOM-элементы вкладки "Основные" =====
  const form = document.getElementById('settingsForm');
  const projectsInput = document.getElementById('projectsPath');
  const blenderInput = document.getElementById('blenderPath');
  const substanceInput = document.getElementById('substancePath');
  const supabaseUrlInput = document.getElementById('supabaseUrl');
  const supabaseKeyInput = document.getElementById('supabaseKey');
  const authEmail = document.getElementById('authEmail');
  const authPassword = document.getElementById('authPassword');
  const authBtn = document.getElementById('authBtn');
  const authStatus = document.getElementById('authStatus');
  const statusMessage = document.getElementById('statusMessage');

  if (!authBtn || !authEmail || !authPassword || !supabaseUrlInput || !supabaseKeyInput) {
    console.error('Не найдены обязательные элементы формы настроек');
    return;
  }

  // ===== ВКЛАДКИ =====
  document.querySelectorAll('.settings-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.settings-tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.settings-tab-content').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      const tabId = btn.dataset.tab;
      const content = document.getElementById(`tab-${tabId}`);
      if (content) content.classList.add('active');
    });
  });

  // ===== КНОПКИ "ОБЗОР" =====
  document.getElementById('browseProjects')?.addEventListener('click', async () => {
    try {
      const result = await window.api.openDirectoryDialog();
      if (result.success) projectsInput.value = result.path;
    } catch (error) {
      console.error('Ошибка выбора папки:', error);
    }
  });

  document.getElementById('browseBlender')?.addEventListener('click', async () => {
    try {
      const result = await window.api.openFileDialog([{ name: 'Blender', extensions: ['exe'] }]);
      if (result.success) blenderInput.value = result.path;
    } catch (error) {
      console.error('Ошибка выбора Blender:', error);
    }
  });

  document.getElementById('browseSubstance')?.addEventListener('click', async () => {
    try {
      const result = await window.api.openFileDialog([{ name: 'Substance Painter', extensions: ['exe'] }]);
      if (result.success) substanceInput.value = result.path;
    } catch (error) {
      console.error('Ошибка выбора Substance Painter:', error);
    }
  });

  // ===== АВТОРИЗАЦИЯ =====
  async function handleAuth() {
    const url = supabaseUrlInput.value.trim();
    const key = supabaseKeyInput.value.trim();
    const email = authEmail.value.trim();
    const password = authPassword.value.trim();

    if (!url || !key) {
      showAuthStatus('Сначала укажите Supabase URL и Anon Key', 'error');
      return;
    }
    if (!email || !password) {
      showAuthStatus('Введите email и пароль', 'error');
      return;
    }

    try {
      authBtn.disabled = true;
      authBtn.textContent = '⏳ Подключение...';
      showAuthStatus('Проверка пользователя...', 'info');

      const result = await window.api.authUser({
        supabaseUrl: url,
        supabaseKey: key,
        email,
        password,
      });

      if (result.success) {
        let message = `✅ Добро пожаловать, ${result.user.Name || result.user.email}!`;
        if (result.firstLogin) {
          message += ' 🎉 Пароль успешно установлен!';
        }
        showAuthStatus(message, 'success');

        saveAuthToSettings(url, key, email, result.user);

        setTimeout(() => {
          window.location.href = 'index.html';
        }, 1000);
      } else {
        showAuthStatus(`❌ ${result.error}`, 'error');
      }
    } catch (error) {
      console.error('Ошибка авторизации:', error);
      showAuthStatus(`❌ Ошибка: ${error.message}`, 'error');
    } finally {
      authBtn.disabled = false;
      authBtn.textContent = 'Войти';
    }
  }

  authBtn.addEventListener('click', handleAuth);

  authPassword.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleAuth();
  });

  // ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====
  function saveAuthToSettings(url, key, email, user) {
    const settings = {
      supabaseUrl: url,
      supabaseKey: key,
      authEmail: email,
      authUserId: user.id,
      authUserName: user.Name || email,
      authRole: user.role || 'user',
    };
    try {
      localStorage.setItem('authSettings', JSON.stringify(settings));
    } catch (error) {
      console.error('Ошибка сохранения authSettings:', error);
    }
  }

  function showAuthStatus(message, type) {
    if (!authStatus) return;
    authStatus.textContent = message;
    authStatus.className = `auth-status ${type}`;
    authStatus.style.display = 'block';
  }

  function showStatus(message, type) {
    if (!statusMessage) return;
    statusMessage.textContent = message;
    statusMessage.className = type;
  }

  // ===== ЗАГРУЗКА СУЩЕСТВУЮЩИХ НАСТРОЕК =====
  async function loadExistingSettings() {
    try {
      const result = await window.api.loadSettings();
      if (result.success) {
        const settings = result.settings;
        if (settings.projectsPath) projectsInput.value = settings.projectsPath;
        if (settings.blenderPath) blenderInput.value = settings.blenderPath;
        if (settings.substancePath) substanceInput.value = settings.substancePath;
        if (settings.supabaseUrl) supabaseUrlInput.value = settings.supabaseUrl;
        if (settings.supabaseKey) supabaseKeyInput.value = settings.supabaseKey;

        const meshMode = settings.blenderMeshMode || 'ask';
        const radio = document.querySelector(`input[name="blenderMeshMode"][value="${meshMode}"]`);
        if (radio) radio.checked = true;
      }
    } catch (error) {
      console.error('Ошибка загрузки настроек:', error);
    }

    try {
      const authSettings = localStorage.getItem('authSettings');
      if (authSettings) {
        const data = JSON.parse(authSettings);
        if (data.supabaseUrl) supabaseUrlInput.value = data.supabaseUrl;
        if (data.supabaseKey) supabaseKeyInput.value = data.supabaseKey;
        if (data.authEmail) {
          authEmail.value = data.authEmail;
          showAuthStatus(`🔐 Авторизован как ${data.authUserName || data.authEmail}`, 'success');
        }
      }
    } catch (error) {
      console.error('Ошибка загрузки настроек авторизации:', error);
    }
  }

  loadExistingSettings();

  // ===== СОХРАНЕНИЕ ОСНОВНЫХ НАСТРОЕК =====
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const projectsPath = projectsInput.value.trim();
    const blenderPath = blenderInput.value.trim();
    const substancePath = substanceInput.value.trim();
    const supabaseUrl = supabaseUrlInput.value.trim();
    const supabaseKey = supabaseKeyInput.value.trim();

    const meshModeRadio = document.querySelector('input[name="blenderMeshMode"]:checked');
    const blenderMeshMode = meshModeRadio ? meshModeRadio.value : 'ask';

    if (!projectsPath) {
      showStatus('Укажите путь к каталогу проектов', 'error');
      return;
    }

    const settings = {
      projectsPath,
      blenderPath,
      substancePath,
      supabaseUrl,
      supabaseKey,
      blenderMeshMode,
    };

    try {
      const result = await window.api.saveSettings(settings);
      if (result.success) {
        showStatus('✅ Настройки сохранены!', 'success');
        setTimeout(() => {
          window.location.href = 'index.html';
        }, 1500);
      } else {
        showStatus(`❌ Ошибка: ${result.error}`, 'error');
      }
    } catch (error) {
      showStatus(`❌ Ошибка: ${error.message}`, 'error');
    }
  });

  document.getElementById('cancelBtn')?.addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  // ========================================================================
  // ===== ВКЛАДКА "ШАБЛОНЫ" ===============================================
  // ========================================================================

  // Состояние UI шаблонов
  let templatesData = { templates: [], defaultTemplateId: null };
  let editingTemplate = null; // null = режим списка, объект = режим редактирования

  // DOM-элементы вкладки шаблонов
  const templatesListEl = document.getElementById('templatesList');
  const templateEditorEl = document.getElementById('templateEditor');
  const templateEditorTitle = document.getElementById('templateEditorTitle');
  const templateNameInput = document.getElementById('templateName');
  const folderTreeEl = document.getElementById('folderTree');
  const btnAddTemplate = document.getElementById('btnAddTemplate');
  const btnCloseEditor = document.getElementById('btnCloseEditor');
  const btnCancelTemplate = document.getElementById('btnCancelTemplate');
  const btnSaveTemplate = document.getElementById('btnSaveTemplate');
  const btnAddFolder = document.getElementById('btnAddFolder');

  // ===== ЗАГРУЗКА СПИСКА ШАБЛОНОВ =====
  async function loadTemplates() {
    try {
      const result = await window.api.templatesList();
      if (result.success) {
        templatesData = { templates: result.templates, defaultTemplateId: result.defaultTemplateId };
        renderTemplatesList();
      } else {
        templatesListEl.innerHTML = `<p class="placeholder-text">Ошибка: ${result.error}</p>`;
      }
    } catch (error) {
      console.error('Ошибка загрузки шаблонов:', error);
      templatesListEl.innerHTML = `<p class="placeholder-text">Ошибка: ${error.message}</p>`;
    }
  }

  // ===== РЕНДЕР СПИСКА ШАБЛОНОВ =====
  function renderTemplatesList() {
    const { templates, defaultTemplateId } = templatesData;

    if (!templates || templates.length === 0) {
      templatesListEl.innerHTML = '<p class="placeholder-text">Шаблонов пока нет. Создайте первый!</p>';
      return;
    }

    templatesListEl.innerHTML = '';

    templates.forEach((tpl) => {
      const isDefault = tpl.id === defaultTemplateId;

      const card = document.createElement('div');
      card.className = 'template-card' + (isDefault ? ' default' : '');

      const header = document.createElement('div');
      header.className = 'template-card-header';

      const nameEl = document.createElement('div');
      nameEl.className = 'template-card-name';
      nameEl.textContent = tpl.name;
      if (isDefault) {
        const badge = document.createElement('span');
        badge.className = 'template-default-badge';
        badge.textContent = 'по умолчанию';
        nameEl.appendChild(badge);
      }
      header.appendChild(nameEl);

      const actions = document.createElement('div');
      actions.className = 'template-card-actions';

      const btnSetDefault = document.createElement('button');
      btnSetDefault.type = 'button';
      btnSetDefault.className = 'template-action-btn';
      btnSetDefault.textContent = '★ По умолчанию';
      btnSetDefault.title = 'Назначить шаблоном по умолчанию для всего приложения';
      btnSetDefault.disabled = isDefault;
      if (isDefault) btnSetDefault.classList.add('disabled');
      btnSetDefault.addEventListener('click', () => setDefaultTemplate(tpl.id));
      actions.appendChild(btnSetDefault);

      const btnEdit = document.createElement('button');
      btnEdit.type = 'button';
      btnEdit.className = 'template-action-btn';
      btnEdit.textContent = '✏️ Изменить';
      btnEdit.addEventListener('click', () => openEditor(tpl));
      actions.appendChild(btnEdit);

      const btnDelete = document.createElement('button');
      btnDelete.type = 'button';
      btnDelete.className = 'template-action-btn danger';
      btnDelete.textContent = '🗑️ Удалить';
      btnDelete.addEventListener('click', () => deleteTemplate(tpl));
      actions.appendChild(btnDelete);

      header.appendChild(actions);
      card.appendChild(header);

      // Превью структуры папок
      const foldersEl = document.createElement('div');
      foldersEl.className = 'template-card-folders';
      if (tpl.folders && tpl.folders.length > 0) {
        foldersEl.textContent = '📁 ' + tpl.folders.join('  ·  ');
      } else {
        foldersEl.textContent = '📁 (без папок)';
      }
      card.appendChild(foldersEl);

      templatesListEl.appendChild(card);
    });
  }

  // ===== НАЗНАЧИТЬ ШАБЛОН ПО УМОЛЧАНИЮ =====
  async function setDefaultTemplate(templateId) {
    try {
      const result = await window.api.templatesSetDefault(templateId);
      if (result.success) {
        templatesData.defaultTemplateId = templateId;
        renderTemplatesList();
      } else {
        alert(`Ошибка: ${result.error}`);
      }
    } catch (error) {
      alert(`Ошибка: ${error.message}`);
    }
  }

  // ===== УДАЛИТЬ ШАБЛОН =====
  async function deleteTemplate(tpl) {
    const confirmDelete = confirm(
      `Удалить шаблон "${tpl.name}"?\n\nЭто не повлияет на уже созданные проекты.`
    );
    if (!confirmDelete) return;

    try {
      const result = await window.api.templatesDelete(tpl.id);
      if (result.success) {
        templatesData = { templates: result.templates, defaultTemplateId: result.defaultTemplateId };
        renderTemplatesList();
      } else {
        alert(`Ошибка: ${result.error}`);
      }
    } catch (error) {
      alert(`Ошибка: ${error.message}`);
    }
  }

  // ===== ОТКРЫТЬ РЕДАКТОР =====
  function openEditor(template) {
    editingTemplate = template ? { ...template, folders: [...(template.folders || [])] } : null;
    templateEditorTitle.textContent = template ? `Редактирование: ${template.name}` : 'Новый шаблон';
    templateNameInput.value = template ? template.name : '';
    renderFolderTree(editingTemplate ? editingTemplate.folders : []);
    templateEditorEl.style.display = 'block';
    templateNameInput.focus();
  }

  // ===== ЗАКРЫТЬ РЕДАКТОР =====
  function closeEditor() {
    editingTemplate = null;
    templateEditorEl.style.display = 'none';
    templateNameInput.value = '';
    folderTreeEl.innerHTML = '';
  }

  btnAddTemplate.addEventListener('click', () => openEditor(null));
  btnCloseEditor.addEventListener('click', closeEditor);
  btnCancelTemplate.addEventListener('click', closeEditor);

  // ===== INLINE-ВВОД ИМЕНИ ПАПКИ =====
  // Показывает строку с input для ввода имени новой папки.
  // container — куда добавить строку (обычно folderTreeEl или дочерний контейнер)
  // parentPath — путь родителя ('' для корня)
  // onConfirm(newPath) — вызывается при подтверждении (Enter) с полным путём
  function showInlineFolderInput(container, parentPath, onConfirm) {
    const item = document.createElement('div');
    item.className = 'folder-tree-item folder-tree-input-item';

    const indent = document.createElement('span');
    indent.className = 'folder-tree-indent';
    indent.textContent = parentPath ? '└─' : '';
    item.appendChild(indent);

    const icon = document.createElement('span');
    icon.className = 'folder-tree-icon';
    icon.textContent = '📁';
    item.appendChild(icon);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'folder-tree-rename-input';
    input.placeholder = 'Имя папки (можно с / для подпапок)';
    input.value = 'NewFolder';
    item.appendChild(input);

    container.insertBefore(item, container.firstChild);

    setTimeout(() => {
      input.focus();
      input.select();
    }, 0);

    let finished = false;
    function finish(save) {
      if (finished) return;
      finished = true;
      const value = input.value.trim();
      item.remove();
      if (save && value) {
        const cleanName = value.split('/').filter((p) => p.trim() !== '').join('/');
        if (cleanName) {
          const fullPath = parentPath ? `${parentPath}/${cleanName}` : cleanName;
          onConfirm(fullPath);
        }
      }
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
  }

  // ===== РЕНДЕР ДЕРЕВА ПАПОК =====
  // folders — массив строк вида "Folder" или "Folder/Subfolder"
  // В UI показываем как дерево с возможностью добавить/удалить/переименовать.
  function renderFolderTree(folders) {
    folderTreeEl.innerHTML = '';

    if (!folders || folders.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'placeholder-text';
      empty.textContent = 'Нет папок. Нажмите "Добавить папку".';
      folderTreeEl.appendChild(empty);
      return;
    }

    // Строим дерево из плоского массива с путями
    const tree = buildFolderTree(folders);
    renderTreeNodes(tree, folderTreeEl, 0);
  }

  // Преобразует ["A", "A/B", "C"] в дерево {A: {B: {}}, C: {}}
  function buildFolderTree(folders) {
    const root = {};
    for (const path of folders) {
      const parts = path.split('/').filter((p) => p.trim() !== '');
      let current = root;
      for (const part of parts) {
        if (!current[part]) current[part] = {};
        current = current[part];
      }
    }
    return root;
  }

  // Рекурсивно рендерит узлы дерева
  function renderTreeNodes(node, container, level, parentPath = '') {
    Object.keys(node).sort().forEach((name) => {
      const fullPath = parentPath ? `${parentPath}/${name}` : name;
      const children = node[name];

      const item = document.createElement('div');
      item.className = 'folder-tree-item';
      item.style.paddingLeft = `${level * 20 + 8}px`;

      const indent = document.createElement('span');
      indent.className = 'folder-tree-indent';
      indent.textContent = level > 0 ? '└─' : '';
      item.appendChild(indent);

      const icon = document.createElement('span');
      icon.className = 'folder-tree-icon';
      icon.textContent = '📁';
      item.appendChild(icon);

      const nameEl = document.createElement('span');
      nameEl.className = 'folder-tree-name';
      nameEl.textContent = name;
      nameEl.title = 'Двойной клик для переименования';
      item.appendChild(nameEl);

      // Поле ввода для переименования (скрыто по умолчанию)
      const renameInput = document.createElement('input');
      renameInput.type = 'text';
      renameInput.className = 'folder-tree-rename-input';
      renameInput.value = name;
      renameInput.style.display = 'none';
      item.appendChild(renameInput);

      const actions = document.createElement('div');
      actions.className = 'folder-tree-actions';

      // Кнопка "Добавить подпапку"
      const btnAddSub = document.createElement('button');
      btnAddSub.type = 'button';
      btnAddSub.className = 'folder-tree-btn';
      btnAddSub.textContent = '➕';
      btnAddSub.title = 'Добавить подпапку';
      btnAddSub.addEventListener('click', (e) => {
        e.stopPropagation();
        // Используем inline-ввод. После подтверждения просто перерисовываем
        // всё дерево — renderFolderTree сам расставит правильные отступы.
        showInlineFolderInput(folderTreeEl, fullPath, (newPath) => {
          if (!editingTemplate.folders.includes(newPath)) {
            editingTemplate.folders.push(newPath);
            renderFolderTree(editingTemplate.folders);
          }
        });
      });
      actions.appendChild(btnAddSub);

      // Кнопка "Переименовать"
      const btnRename = document.createElement('button');
      btnRename.type = 'button';
      btnRename.className = 'folder-tree-btn';
      btnRename.textContent = '✏️';
      btnRename.title = 'Переименовать';
      btnRename.addEventListener('click', (e) => {
        e.stopPropagation();
        startRename(nameEl, renameInput, fullPath);
      });
      actions.appendChild(btnRename);

      // Кнопка "Удалить"
      const btnDelete = document.createElement('button');
      btnDelete.type = 'button';
      btnDelete.className = 'folder-tree-btn danger';
      btnDelete.textContent = '🗑️';
      btnDelete.title = 'Удалить папку';
      btnDelete.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteFolderRecursive(fullPath);
      });
      actions.appendChild(btnDelete);

      item.appendChild(actions);

      // Двойной клик по имени — переименование
      nameEl.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        startRename(nameEl, renameInput, fullPath);
      });

      container.appendChild(item);

      // Рекурсивно рендерим детей
      if (Object.keys(children).length > 0) {
        const childContainer = document.createElement('div');
        childContainer.className = 'folder-tree-children';
        renderTreeNodes(children, childContainer, level + 1, fullPath);
        container.appendChild(childContainer);
      }
    });
  }

  // Запуск режима переименования
  function startRename(nameEl, renameInput, oldPath) {
    nameEl.style.display = 'none';
    renameInput.style.display = 'inline-block';
    renameInput.focus();
    renameInput.select();

    const finish = (save) => {
      const newName = renameInput.value.trim();
      renameInput.style.display = 'none';
      nameEl.style.display = 'inline';

      if (save && newName && newName !== nameEl.textContent) {
        // Переименовываем: обновляем все пути, начинающиеся с oldPath
        const parentParts = oldPath.split('/');
        parentParts[parentParts.length - 1] = newName.split('/')[0]; // берём только первую часть
        const newPath = parentParts.join('/');

        editingTemplate.folders = editingTemplate.folders.map((p) => {
          if (p === oldPath) return newPath;
          if (p.startsWith(oldPath + '/')) return newPath + p.substring(oldPath.length);
          return p;
        });
        renderFolderTree(editingTemplate.folders);
      }
    };

    renameInput.addEventListener('keydown', function handler(e) {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); renameInput.removeEventListener('keydown', handler); }
      if (e.key === 'Escape') { e.preventDefault(); finish(false); renameInput.removeEventListener('keydown', handler); }
    });
    renameInput.addEventListener('blur', function handler() {
      finish(true);
      renameInput.removeEventListener('blur', handler);
    });
  }

  // Удаляет папку и все её подпапки
  function deleteFolderRecursive(folderPath) {
    const hasChildren = editingTemplate.folders.some(
      (p) => p.startsWith(folderPath + '/')
    );
    const msg = hasChildren
      ? `Удалить папку "${folderPath}" и все её подпапки?`
      : `Удалить папку "${folderPath}"?`;
    if (!confirm(msg)) return;

    editingTemplate.folders = editingTemplate.folders.filter(
      (p) => p !== folderPath && !p.startsWith(folderPath + '/')
    );
    renderFolderTree(editingTemplate.folders);
  }

  // ===== КНОПКА "ДОБАВИТЬ ПАПКУ" (на верхнем уровне) =====
  // Используем inline-ввод вместо prompt(), потому что prompt() может быть
  // заблокирован в Electron с строгой CSP.
  btnAddFolder.addEventListener('click', () => {
    if (!editingTemplate) {
      editingTemplate = { folders: [] };
    }
    showInlineFolderInput(folderTreeEl, '', (newPath) => {
      if (newPath && !editingTemplate.folders.includes(newPath)) {
        editingTemplate.folders.push(newPath);
        renderFolderTree(editingTemplate.folders);
      }
    });
  });

  // ===== СОХРАНИТЬ ШАБЛОН =====
  btnSaveTemplate.addEventListener('click', async () => {
    const name = templateNameInput.value.trim();
    if (!name) {
      alert('Введите название шаблона');
      templateNameInput.focus();
      return;
    }

    const template = {
      name,
      folders: editingTemplate ? editingTemplate.folders : [],
      files: [],
    };
    if (editingTemplate && editingTemplate.id) {
      template.id = editingTemplate.id;
    }

    try {
      const result = await window.api.templatesSave(template);
      if (result.success) {
        templatesData = await refreshTemplatesData();
        renderTemplatesList();
        closeEditor();
      } else {
        alert(`Ошибка сохранения: ${result.error}`);
      }
    } catch (error) {
      alert(`Ошибка: ${error.message}`);
    }
  });

  async function refreshTemplatesData() {
    const result = await window.api.templatesList();
    if (result.success) {
      return { templates: result.templates, defaultTemplateId: result.defaultTemplateId };
    }
    return { templates: [], defaultTemplateId: null };
  }

  // Загружаем шаблоны при старте
  loadTemplates();
});
