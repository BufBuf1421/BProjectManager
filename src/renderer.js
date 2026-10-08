// src/renderer.js
import { createProjectCard } from './ProjectCard.js';
function joinPath(...segments) {
  return segments.join('/').replace(/\\/g, '/');
}

document.addEventListener('DOMContentLoaded', async () => {
  console.log('✅ Project Manager запущен');

  // ===== DOM-ЭЛЕМЕНТЫ =====
  const projectList = document.getElementById('projectList');
  const searchInput = document.getElementById('searchInput');
  const createBtn = document.getElementById('createProjectBtn');
  const projectNameEl = document.getElementById('projectName');
  const openFolderBtn = document.getElementById('openFolderBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const addTaskBtn = document.getElementById('addTaskBtn');
  const notesContainer = document.getElementById('notesContainer');
  const taskList = document.getElementById('taskList');

  // ===== СОСТОЯНИЕ =====
  let projects = [];
  let selectedProjectId = null;
  let settings = null;
  let currentTab = 'all';
  let currentStatusFilter = 'all';
  let filteredProjects = [];
  let currentProject = null;
  let sortField = 'date';
  let sortAscending = false;
  let currentUser = null; // ← ВАЖНО: ДОЛЖНО БЫТЬ ЗДЕСЬ, ПЕРЕД loadUserInfo!
  let usersList = []; // Список пользователей из Supabase (для Lead/Admin)

  // ===== ИНФОРМАЦИЯ О ПОЛЬЗОВАТЕЛЕ =====
  function loadUserInfo() {
    try {
      const authSettings = localStorage.getItem('authSettings');
      if (authSettings) {
        try {
          const data = JSON.parse(authSettings);
          currentUser = data;

          const userNameEl = document.getElementById('userName');
          if (userNameEl) {
            updateUserUI(data);
          } else {
            setTimeout(() => {
              updateUserUI(data);
            }, 100);
          }
          return data;
        } catch (parseError) {
          console.error('❌ Ошибка парсинга authSettings:', parseError);
          localStorage.removeItem('authSettings');
          currentUser = null;
          updateUserUI(null);
          return null;
        }
      } else {
        currentUser = null;
        updateUserUI(null);
        return null;
      }
    } catch (error) {
      console.error('❌ Ошибка загрузки информации о пользователе:', error);
      currentUser = null;
      updateUserUI(null);
      return null;
    }
  }

  // Обновление UI пользователя
  function updateUserUI(userData) {
    const userNameEl = document.getElementById('userName');
    const logoutBtn = document.getElementById('logoutBtn');

    if (!userNameEl) return;

    if (userData && userData.authEmail) {
      const displayName = userData.authUserName || userData.authEmail;
      userNameEl.textContent = displayName;
      userNameEl.classList.remove('guest');
      if (logoutBtn) logoutBtn.style.display = 'inline-block';
    } else {
      userNameEl.textContent = 'Не авторизован';
      userNameEl.classList.add('guest');
      if (logoutBtn) logoutBtn.style.display = 'inline-block';
    }
  }

  // ===== ЗАГРУЗКА СПИСКА ПОЛЬЗОВАТЕЛЕЙ (только для Lead/Admin) =====
  // Загружает список пользователей из Supabase и сохраняет локально.
  // Используется для поля "Исполнитель" в модалке создания проекта и в content-header.
  async function loadUsersList() {
    console.log('📋 loadUsersList() вызвана');

    if (!currentUser) {
      console.log('📋 loadUsersList: currentUser = null, выходим');
      return;
    }

    // Проверяем роль (case-insensitive — в БД может быть 'Lead', 'lead', 'LEAD')
    const role = (currentUser.authRole || 'user').toLowerCase();
    console.log(`📋 loadUsersList: роль пользователя = "${currentUser.authRole}" (lowercase: "${role}")`);

    if (role !== 'admin' && role !== 'lead') {
      console.log(`📋 loadUsersList: роль "${role}" не admin/lead — список пользователей не загружается`);
      usersList = [];
      return;
    }

    try {
      const settingsResult = await window.api.loadSettings();
      console.log('📋 loadUsersList: loadSettings result:', settingsResult.success ? 'OK' : 'FAIL');
      if (!settingsResult.success) {
        console.log('📋 loadUsersList: настройки не загружены, выходим');
        return;
      }
      const { supabaseUrl, supabaseKey } = settingsResult.settings;
      console.log(`📋 loadUsersList: supabaseUrl = "${supabaseUrl ? 'есть' : 'пусто'}", supabaseKey = "${supabaseKey ? 'есть' : 'пусто'}"`);
      if (!supabaseUrl || !supabaseKey) {
        console.log('📋 loadUsersList: нет Supabase URL/Key, выходим');
        return;
      }

      console.log('📋 loadUsersList: вызываем getUsersList...');
      const result = await window.api.getUsersList({ supabaseUrl, supabaseKey });
      console.log('📋 loadUsersList: getUsersList result:', result);

      if (result.success) {
        usersList = result.users || [];
        console.log(`📋 loadUsersList: загружено пользователей: ${usersList.length}`);
        if (usersList.length > 0) {
          console.log('📋 loadUsersList: первый пользователь:', usersList[0]);
          console.log('📋 loadUsersList: поля первого пользователя:', Object.keys(usersList[0]));
        }
      } else {
        console.error('📋 loadUsersList: ошибка загрузки пользователей:', result.error);
      }
    } catch (error) {
      console.error('📋 loadUsersList: исключение:', error);
    }
  }

  // Заполняет <datalist> для автозаполнения исполнителя.
  // dataListId — id элемента <datalist>.
  function populateAssigneeDatalist(dataListId) {
    const datalist = document.getElementById(dataListId);
    if (!datalist) return;
    datalist.innerHTML = '';
    usersList.forEach((user) => {
      const opt = document.createElement('option');
      // value = "Name (email)" для удобства поиска; data-user-id храним через атрибут
      opt.value = user.Name || user.email || '';
      opt.dataset.userId = user.id;
      datalist.appendChild(opt);
    });
  }

  // Находит id пользователя по введённому имени.
  // Возвращает id или null.
  function findUserIdByName(name) {
    if (!name || !usersList.length) return null;
    const trimmed = name.trim().toLowerCase();
    const user = usersList.find((u) =>
      (u.Name || '').toLowerCase() === trimmed ||
      (u.email || '').toLowerCase() === trimmed
    );
    return user ? user.id : null;
  }

  // ===== ЗАГРУЖАЕМ ПОЛЬЗОВАТЕЛЯ =====
  // Вызываем после объявления всех функций
  loadUserInfo();
  // Загружаем список пользователей (асинхронно, не блокируем старт)
  loadUsersList();

  // ===== КНОПКА "ВЫЙТИ ИЗ АККАУНТА" =====
  // Очищает authSettings из localStorage и перенаправляет на страницу настроек,
  // где пользователь сможет заново авторизоваться (или выбрать другого пользователя).
  const logoutBtnEl = document.getElementById('logoutBtn');
  if (logoutBtnEl) {
    logoutBtnEl.addEventListener('click', () => {
      const authSettings = localStorage.getItem('authSettings');
      if (!authSettings) {
        // Уже не авторизован — просто редирект
        window.location.href = 'settings.html';
        return;
      }

      let userName = '';
      try {
        const data = JSON.parse(authSettings);
        userName = data.authUserName || data.authEmail || '';
      } catch {}

      const confirmLogout = confirm(
        `Выйти из аккаунта${userName ? ' "' + userName + '"' : ''}?\n\n` +
        `Вам потребуется заново ввести email и пароль для входа.`
      );
      if (!confirmLogout) return;

      localStorage.removeItem('authSettings');
      window.location.href = 'settings.html';
    });
  }



// ===== РАБОЧИЕ ОБЛАСТИ (WORKSPACES) =====
let workspaces = [];
let currentWorkspaceId = null;
let workspaceIdCounter = 0;
let renameInput = null;
let isRenaming = false;

// Сохранение рабочих областей
function saveWorkspaces() {
  const data = workspaces.map(w => ({
    id: w.id,
    name: w.name,
    path: w.path,
    // Сохраняем defaultTemplateId, если он задан для этой рабочей области
    //...(w.defaultTemplateId ? { defaultTemplateId: w.defaultTemplateId } : {})
  }));
  localStorage.setItem('workspaces', JSON.stringify(data));
  if (currentWorkspaceId !== null && currentWorkspaceId !== undefined) {
    localStorage.setItem('currentWorkspaceId', String(currentWorkspaceId));
  }
}

// Загрузка рабочих областей
function loadWorkspaces() {
  const saved = localStorage.getItem('workspaces');
  if (saved) {
    try {
      workspaces = JSON.parse(saved).map(w => ({
        ...w,
        element: null
      }));
      workspaceIdCounter = workspaces.reduce((max, w) => Math.max(max, w.id), 0) + 1;
    } catch (e) {
      workspaces = [];
    }
  }
   // Восстанавливаем ID текущей рабочей области
  const savedId = localStorage.getItem('currentWorkspaceId');
  if (savedId) {
    const id = parseInt(savedId);
    // Проверяем, что такая рабочая область существует
    if (workspaces.some(w => w.id === id)) {
      currentWorkspaceId = id;
      return;
    }
  }
  
  // Если нет сохраненной или она не существует — выбираем первую
  if (workspaces.length > 0) {
    currentWorkspaceId = workspaces[0].id;
  }
} 

// Создание новой рабочей области
async function createWorkspace(name, path) {
  const id = workspaceIdCounter++;
  const workspace = { id, name, path, element: null };
  workspaces.push(workspace);
  renderWorkspaceTabs();
  selectWorkspace(id);
  saveWorkspaces();
  return workspace;
}

// Выбор рабочей области
function selectWorkspace(id) {
  // Если идет редактирование — завершаем его без перерендера
  if (isRenaming) {
    finishRename(true, true);
  }
  
  currentWorkspaceId = id;
  const workspace = workspaces.find(w => w.id === id);
  if (workspace) {
    settings.projectsPath = workspace.path;
    // Переносим наблюдение за файловой системой на новый каталог проектов
    startWatchingProjects();
    // Обновляем классы вкладок
    document.querySelectorAll('.workspace-tab').forEach(el => {
      const wid = parseInt(el.dataset.workspaceId);
      el.classList.toggle('active', wid === id);
    });
    loadProjects();
    saveWorkspaces(); // ← Сохраняем выбор
  }
}

// Рендеринг вкладок
function renderWorkspaceTabs() {
  const container = document.getElementById('workspaceTabs');
  if (!container) return;
  
  container.innerHTML = '';
  
  workspaces.forEach((workspace) => {
    const tab = document.createElement('button');
    tab.className = `workspace-tab${workspace.id === currentWorkspaceId ? ' active' : ''}`;
    tab.dataset.workspaceId = workspace.id;
    
    // Контейнер для имени
    const nameContainer = document.createElement('span');
    nameContainer.className = 'tab-name-container';
    nameContainer.textContent = workspace.name;
    tab.appendChild(nameContainer);
    
    // Путь
    const pathSpan = document.createElement('span');
    pathSpan.className = 'tab-path';
    const shortPath = workspace.path.length > 30 ? '...' + workspace.path.slice(-27) : workspace.path;
    pathSpan.textContent = shortPath;
    tab.appendChild(pathSpan);
    
    // Кнопка закрытия
    if (workspaces.length > 1) {
      const closeBtn = document.createElement('button');
      closeBtn.className = 'tab-close';
      closeBtn.textContent = '✕';
      closeBtn.title = 'Закрыть рабочую область';
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeWorkspace(workspace.id);
      });
      tab.appendChild(closeBtn);
    }
    
    // Двойной клик для переименования
    tab.addEventListener('dblclick', (e) => {
      if (e.target.classList.contains('tab-close')) return;
      startRenameWorkspace(workspace.id);
    });
    
    tab.addEventListener('click', () => {
      if (!isRenaming) {
        selectWorkspace(workspace.id);
      }
    });
    
    container.appendChild(tab);
    workspace.element = tab;
  });
}

// ===== ПЕРЕИМЕНОВАНИЕ РАБОЧЕЙ ОБЛАСТИ =====
function startRenameWorkspace(workspaceId) {
  // Если уже есть активное редактирование — завершаем его
  if (isRenaming) {
    finishRename(true, true);
    return;
  }
  
  const workspace = workspaces.find(w => w.id === workspaceId);
  if (!workspace) return;
  
  // Находим таб
  const tab = document.querySelector(`.workspace-tab[data-workspace-id="${workspaceId}"]`);
  if (!tab) return;
  
  // Находим контейнер с именем
  const nameContainer = tab.querySelector('.tab-name-container');
  if (!nameContainer) return;
  
  const currentName = workspace.name;
  isRenaming = true;
  
  // Создаем input
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'tab-rename-input';
  input.value = currentName;
  input.maxLength = 50;
  
  // Заменяем текст на input
  nameContainer.textContent = '';
  nameContainer.appendChild(input);
  renameInput = input;
  
  // Фокус и выделение
  setTimeout(() => {
    input.focus();
    input.select();
  }, 50);
  
  // Обработчики
  input.addEventListener('blur', () => {
    finishRename(true, true);
  });
  
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finishRename(true, true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finishRename(false, true);
    }
  });
}

function finishRename(save = true, fromBlur = false) {
  if (!isRenaming || !renameInput) {
    isRenaming = false;
    renameInput = null;
    return;
  }
  
  const input = renameInput;
  const workspaceId = parseInt(input.closest('.workspace-tab')?.dataset.workspaceId);
  const workspace = workspaces.find(w => w.id === workspaceId);
  
  // Очищаем состояние ДО рендера
  renameInput = null;
  isRenaming = false;
  
  if (workspace && save) {
    const newName = input.value.trim();
    if (newName && newName !== workspace.name) {
      // Проверяем дубликаты
      const exists = workspaces.some(w => w.id !== workspaceId && w.name === newName);
      if (exists) {
        alert('Рабочая область с таким именем уже существует');
        // Возвращаем фокус
        isRenaming = true;
        renameInput = input;
        setTimeout(() => input.focus(), 100);
        return;
      }
      workspace.name = newName;
      saveWorkspaces();
    } else if (!newName) {
      alert('Имя не может быть пустым');
      isRenaming = true;
      renameInput = input;
      setTimeout(() => input.focus(), 100);
      return;
    }
  }
  
  // Перерендерим вкладки (но не запускаем selectWorkspace)
  renderWorkspaceTabs();
  
  // Восстанавливаем активную вкладку
  if (currentWorkspaceId) {
    document.querySelectorAll('.workspace-tab').forEach(el => {
      const wid = parseInt(el.dataset.workspaceId);
      el.classList.toggle('active', wid === currentWorkspaceId);
    });
  }
}

/// Закрытие рабочей области
function closeWorkspace(id) {
  if (workspaces.length <= 1) {
    alert('Нельзя закрыть последнюю рабочую область');
    return;
  }
  
  // Если идет редактирование — завершаем его
  if (isRenaming) {
    finishRename(true, true);
  }
  
  const index = workspaces.findIndex(w => w.id === id);
  if (index === -1) return;
  
  workspaces.splice(index, 1);
  
  if (currentWorkspaceId === id) {
    const newWorkspace = workspaces[Math.min(index, workspaces.length - 1)];
    currentWorkspaceId = null;
    selectWorkspace(newWorkspace.id);
  }
  
  renderWorkspaceTabs();
  saveWorkspaces();
}

// Добавление новой рабочей области
document.getElementById('addWorkspaceBtn')?.addEventListener('click', async () => {
  try {
    const result = await window.api.openDirectoryDialog();
    if (result.success && result.path) {
      const path = result.path;
      const name = path.split(/[\\/]/).pop() || 'Workspace';
      
      const exists = workspaces.some(w => w.path === path);
      if (exists) {
        alert('Эта папка уже добавлена как рабочая область');
        const existing = workspaces.find(w => w.path === path);
        if (existing) selectWorkspace(existing.id);
        return;
      }
      
      await createWorkspace(name, path);
    }
  } catch (error) {
    console.error('Ошибка создания рабочей области:', error);
    alert('Ошибка: ' + error.message);
  }
});

// Глобальный обработчик для завершения редактирования при клике вне
document.addEventListener('mousedown', (e) => {
  if (isRenaming && renameInput) {
    if (e.target === renameInput) return;
    const tab = renameInput.closest('.workspace-tab');
    if (tab && tab.contains(e.target)) return;
    finishRename(true, true);
  }
});



  // ===== РАЗМЕР КОЛОНОК (РЕСАЙЗ) С СНАППИНГОМ =====
let isResizingLeft = false;
let isResizingRight = false;
let resizeStartX = 0;
let startWidth = 0;

// Стандартные ширины для снаппинга
const SNAP_WIDTHS = [293];
const SNAP_THRESHOLD = 45;

// Получаем элементы
const sidebar = document.getElementById('sidebar');
const rightSidebar = document.getElementById('rightSidebar');
const leftHandle = document.getElementById('leftResizeHandle');
const rightHandle = document.getElementById('rightResizeHandle');

// ===== ОБНОВЛЕНИЕ КОЛОНОК СЕТКИ (ПЕРЕНЕСЕНО НАВЕРХ) =====
function updateGridColumns(sidebarWidth) {
  const projectList = document.getElementById('projectList');
  if (!projectList) return;
  
  const padding = 32;
  const gap = 10;
  const cardMinWidth = 130;
  
  const availableWidth = sidebarWidth - padding;
  const maxCols = 6;
  const possibleCols = Math.floor((availableWidth + gap) / (cardMinWidth + gap));
  let cols = Math.max(1, Math.min(possibleCols, maxCols));
  cols = Math.min(cols, maxCols);
  
  projectList.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  console.log(`📐 Ширина: ${sidebarWidth}px, Колонок: ${cols}`);
}

// Функция поиска ближайшего снаппинга
function findSnapPosition(currentWidth, snapWidths) {
  let closest = null;
  let closestDiff = Infinity;
  
  for (const snap of snapWidths) {
    const diff = Math.abs(currentWidth - snap);
    if (diff < closestDiff) {
      closestDiff = diff;
      closest = snap;
    }
  }
  
  return closestDiff < SNAP_THRESHOLD ? closest : null;
}

// --- Левая колонка ---
if (leftHandle) {
  leftHandle.addEventListener('mousedown', (e) => {
    isResizingLeft = true;
    resizeStartX = e.clientX;
    startWidth = sidebar.offsetWidth;
    document.body.style.cursor = 'col-resize';
    leftHandle.classList.add('active');
    e.preventDefault();
  });
}

// --- Правая колонка ---
if (rightHandle) {
  rightHandle.addEventListener('mousedown', (e) => {
    isResizingRight = true;
    resizeStartX = e.clientX;
    startWidth = rightSidebar.offsetWidth;
    document.body.style.cursor = 'col-resize';
    rightHandle.classList.add('active');
    e.preventDefault();
  });
}

// --- Общий обработчик движения мыши ---
document.addEventListener('mousemove', (e) => {
  if (isResizingLeft && sidebar) {
    const appRect = document.getElementById('app').getBoundingClientRect();
    let newWidth = e.clientX - appRect.left;
    
    const minWidth = 180;
    const maxWidth = window.innerWidth * 0.7;
    newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
    
    const snapWidth = findSnapPosition(newWidth, SNAP_WIDTHS);
    if (snapWidth !== null) {
      newWidth = snapWidth;
      leftHandle.style.background = '#6c63ff';
      setTimeout(() => {
        leftHandle.style.background = '';
      }, 300);
    }
    
    sidebar.style.width = newWidth + 'px';
    sidebar.style.minWidth = newWidth + 'px';
    updateGridColumns(newWidth);
  }
  
  if (isResizingRight && rightSidebar) {
    const appRect = document.getElementById('app').getBoundingClientRect();
    let newWidth = appRect.right - e.clientX;
    
    const minWidth = 120;
    const maxWidth = window.innerWidth * 0.35;
    newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
    
    const snapWidth = findSnapPosition(newWidth, SNAP_WIDTHS);
    if (snapWidth !== null) {
      newWidth = snapWidth;
      rightHandle.style.background = '#6c63ff';
      setTimeout(() => {
        rightHandle.style.background = '';
      }, 300);
    }
    
    rightSidebar.style.width = newWidth + 'px';
    rightSidebar.style.minWidth = newWidth + 'px';
  }
});

// --- Отпускание мыши ---
document.addEventListener('mouseup', () => {
  if (isResizingLeft) {
    isResizingLeft = false;
    document.body.style.cursor = '';
    if (leftHandle) {
      leftHandle.classList.remove('active');
      leftHandle.style.background = '';
    }
    if (sidebar) {
      localStorage.setItem('sidebarWidth', sidebar.style.width);
    }
  }
  if (isResizingRight) {
    isResizingRight = false;
    document.body.style.cursor = '';
    if (rightHandle) {
      rightHandle.classList.remove('active');
      rightHandle.style.background = '';
    }
    if (rightSidebar) {
      localStorage.setItem('rightSidebarWidth', rightSidebar.style.width);
    }
  }
});

// --- Восстановление сохраненной ширины ---
function restoreSidebarWidths() {
  const savedLeft = localStorage.getItem('sidebarWidth');
  if (savedLeft && sidebar) {
    let width = parseInt(savedLeft);
    const maxWidth = window.innerWidth * 0.7;
    if (width > maxWidth) width = maxWidth;
    if (width < 180) width = 180;
    
    const snapWidth = findSnapPosition(width, SNAP_WIDTHS);
    if (snapWidth !== null) width = snapWidth;
    
    sidebar.style.width = width + 'px';
    sidebar.style.minWidth = width + 'px';
    updateGridColumns(width);
  }
  
  const savedRight = localStorage.getItem('rightSidebarWidth');
  if (savedRight && rightSidebar) {
    let width = parseInt(savedRight);
    const maxWidth = window.innerWidth * 0.35;
    if (width > maxWidth) width = maxWidth;
    if (width < 120) width = 120;
    
    const snapWidth = findSnapPosition(width, SNAP_WIDTHS);
    if (snapWidth !== null) width = snapWidth;
    
    rightSidebar.style.width = width + 'px';
    rightSidebar.style.minWidth = width + 'px';
  }
}

// ===== ОБНОВЛЕНИЕ ГРИДА ПРИ ИЗМЕНЕНИИ РАЗМЕРА ОКНА =====
window.addEventListener('resize', () => {
  if (sidebar) {
    const width = parseInt(sidebar.style.width) || 280;
    updateGridColumns(width);
  }
});

  // ===== МОДАЛЬНОЕ ОКНО ДЛЯ ПРОЕКТА =====
  const modal = document.getElementById('createProjectModal');
  const projectNameInput = document.getElementById('projectNameInput');
  const modalCreateBtn = document.getElementById('modalCreateBtn');
  const modalCancelBtn = document.getElementById('modalCancelBtn');
  // Элементы выбора шаблона (показываются только если шаблонов > 1)
  const templateSelectGroup = document.getElementById('templateSelectGroup');
  const templateSelect = document.getElementById('templateSelect');
  //const setAsWorkspaceDefaultChk = document.getElementById('setAsWorkspaceDefault');
  // Кэш шаблонов для текущей модалки
  let modalTemplates = [];
  let modalDefaultTemplateId = null;

  async function loadTemplatesForModal() {
    try {
      const result = await window.api.templatesList();
      if (result.success) {
        modalTemplates = result.templates || [];
        modalDefaultTemplateId = result.defaultTemplateId;

        // Определяем шаблон по умолчанию для текущей рабочей области
        const currentWs = workspaces.find((w) => w.id === currentWorkspaceId);
        const wsDefaultTemplateId = currentWs?.defaultTemplateId;

        // Если шаблонов больше одного — показываем выбор
        if (modalTemplates.length > 1) {
          templateSelectGroup.style.display = 'block';
          templateSelect.innerHTML = '';
          modalTemplates.forEach((tpl) => {
            const opt = document.createElement('option');
            opt.value = tpl.id;
            opt.textContent = tpl.name + (tpl.id === modalDefaultTemplateId ? ' ★' : '');
            templateSelect.appendChild(opt);
          });
          // Выбираем шаблон: приоритет — у рабочей области, потом глобальный дефолт
          const initialId = wsDefaultTemplateId || modalDefaultTemplateId || modalTemplates[0].id;
          templateSelect.value = initialId;
          // Чекбокс показываем, только если выбран НЕ шаблон рабочей области
          //setAsWorkspaceDefaultChk.checked = (wsDefaultTemplateId === initialId);
          //setAsWorkspaceDefaultChk.disabled = (wsDefaultTemplateId === initialId);
        } else {
          templateSelectGroup.style.display = 'none';
        }
      }
    } catch (error) {
      console.error('Ошибка загрузки шаблонов для модалки:', error);
      templateSelectGroup.style.display = 'none';
    }
  }

  function openModal() {
    modal.style.display = 'flex';
    projectNameInput.value = '';
    projectNameInput.disabled = false;

    // ===== Поле "Исполнитель" — только для Lead/Admin =====
    const assigneeGroup = document.getElementById('assigneeSelectGroup');
    const assigneeInput = document.getElementById('assigneeInput');
    if (assigneeGroup && assigneeInput) {
      const role = currentUser ? (currentUser.authRole || 'user').toLowerCase() : 'user';
      console.log(`📋 openModal: роль = "${role}", usersList.length = ${usersList.length}`);
      if ((role === 'admin' || role === 'lead')) {
        // Если список пользователей пуст — пробуем загрузить (возможно, при старте не успел)
        if (usersList.length === 0) {
          console.log('📋 openModal: usersList пуст, перезагружаем...');
          loadUsersList().then(() => {
            // После загрузки показываем поле, если пользователи появились
            if (usersList.length > 0) {
              assigneeGroup.style.display = 'block';
              // Placeholder подсказывает, что по умолчанию = текущий пользователь.
              // НЕ предзаполняем value — иначе datalist фильтрует список.
              assigneeInput.value = '';
              assigneeInput.placeholder = 'Себе (по умолчанию) или начните вводить имя...';
              populateAssigneeDatalist('assigneeList');
              console.log(`📋 openModal: поле показано, пользователей: ${usersList.length}`);
            } else {
              assigneeGroup.style.display = 'block';
              // Placeholder подсказывает про "себя", но value пустое —
              // тогда datalist показывает ВСЕХ пользователей при фокусе/вводе.
              assigneeInput.value = '';
              assigneeInput.placeholder = 'Себе (по умолчанию) или начните вводить имя...';
              populateAssigneeDatalist('assigneeList');
              console.log(`📋 openModal: поле показано, пользователей: ${usersList.length}`);
            }
          });
        } else {
          assigneeGroup.style.display = 'block';
          assigneeInput.value = currentUser.authUserName || currentUser.authEmail || '';
          populateAssigneeDatalist('assigneeList');
          console.log(`📋 openModal: поле показано, пользователей: ${usersList.length}`);
        }
      } else {
        assigneeGroup.style.display = 'none';
        assigneeInput.value = '';
        console.log(`📋 openModal: роль "${role}" не admin/lead, поле скрыто`);
      }
    }

    // Загружаем шаблоны асинхронно — не блокируем открытие модалки
    loadTemplatesForModal();
    setTimeout(() => {
      projectNameInput.focus();
      projectNameInput.select();
    }, 150);
  }

  function closeModal() {
    modal.style.display = 'none';
  }

  // ===== КОНТЕКСТНОЕ МЕНЮ =====
const contextMenu = document.createElement('div');
contextMenu.className = 'context-menu';
contextMenu.id = 'contextMenu';
contextMenu.innerHTML = `
  <div class="context-menu-item" id="menuRename">✏️ Rename</div>
  <div class="context-menu-item" id="menuArchive">📦 Archive</div>
  <div class="context-menu-item" id="menuUnarchive">📂 Unarchive</div>
  <div class="context-menu-divider"></div>
  <div class="context-menu-item danger" id="menuDelete">🗑️ Delete</div>
`;
document.body.appendChild(contextMenu);

// ===== ФУНКЦИИ КОНТЕКСТНОГО МЕНЮ =====
let contextMenuTarget = null;

function showContextMenu(event, project) {
  event.preventDefault();
  contextMenuTarget = project;
  
  const archiveItem = document.getElementById('menuArchive');
  const unarchiveItem = document.getElementById('menuUnarchive');
  
  if (project.archived) {
    archiveItem.style.display = 'none';
    unarchiveItem.style.display = 'flex';
  } else {
    archiveItem.style.display = 'flex';
    unarchiveItem.style.display = 'none';
  }
  
  let x = event.clientX;
  let y = event.clientY;
  
  const menuWidth = 180;
  const menuHeight = 120;
  if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 10;
  if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 10;
  
  contextMenu.style.left = x + 'px';
  contextMenu.style.top = y + 'px';
  contextMenu.style.display = 'block';
}

function hideContextMenu() {
  contextMenu.style.display = 'none';
}

// Клик вне меню закрывает его
document.addEventListener('click', (e) => {
  if (!contextMenu.contains(e.target)) {
    contextMenu.style.display = 'none';
    contextMenuTarget = null;
  }
});



  // ===== ПОИСК ПРЕВЬЮ ДЛЯ ПРОЕКТА =====
  // Примечание: модуль `path` node.js НЕ доступен в renderer-процессе,
  // поэтому для склейки путей используем joinPath(), объявленную выше.
  // Локальная копия поиска превью удалена: она нигде не вызывалась —
  // превью всегда получает getProjectPreview() через главный процесс,
  // где единый список имён и единая логика кодирования file:// URL.

// Функция для получения превью через главный процесс (для работы с путями)
async function getProjectPreview(projectPath) {
  try {
    const result = await window.api.getProjectPreview(projectPath);
    if (result.success && result.preview) {
      return result.preview;
    }
    return null;
  } catch (error) {
    console.error('Ошибка получения превью:', error);
    return null;
  }
}

  // ===== ОБРАБОТЧИКИ КОНТЕКСТНОГО МЕНЮ =====

// Rename
document.getElementById('menuRename').addEventListener('click', async () => {
  // Сохраняем target в локальную переменную до закрытия меню
  const target = contextMenuTarget;
  if (!target) {
    alert('Проект не выбран');
    return;
  }
  
  // Закрываем меню
  hideContextMenu();
  
  const newName = await openRenameModal(target.name);
  if (newName === null) return;
  if (!newName.trim()) {
    alert('Имя не может быть пустым');
    return;
  }
  
  try {
    const result = await window.api.renameProject(target.path, newName.trim());
    if (result.success) {
      // Обновляем имя в объекте проекта
      target.name = newName.trim();
      
      // Обновляем карточку
      const cards = projectList.querySelectorAll('.project-card');
      cards.forEach((card) => {
        if (card.dataset.projectId === target.id) {
          const nameEl = card.querySelector('.project-name');
          if (nameEl) nameEl.textContent = newName.trim();
        }
      });
      
      // Если проект выбран — обновляем заголовок
      if (selectedProjectId === target.id) {
        projectNameEl.textContent = newName.trim();
      }
      
      // Обновляем список (для поиска)
      applyFiltersAndSearch();
    } else {
      alert(`Ошибка переименования: ${result.error}`);
    }
  } catch (error) {
    alert(`Ошибка: ${error.message}`);
  }
});

// Archive
document.getElementById('menuArchive').addEventListener('click', async () => {
  const target = contextMenuTarget;
  if (!target) return;
  hideContextMenu();
  
  try {
    const result = await window.api.archiveProject(target.path);
    if (result.success) {
      target.archived = true;
      applyFiltersAndSearch();
    } else {
      alert(`Ошибка: ${result.error}`);
    }
  } catch (error) {
    alert(`Ошибка: ${error.message}`);
  }
});

// Unarchive
document.getElementById('menuUnarchive').addEventListener('click', async () => {
  const target = contextMenuTarget;
  if (!target) return;
  hideContextMenu();
  
  try {
    const result = await window.api.unarchiveProject(target.path);
    if (result.success) {
      target.archived = false;
      applyFiltersAndSearch();
    } else {
      alert(`Ошибка: ${result.error}`);
    }
  } catch (error) {
    alert(`Ошибка: ${error.message}`);
  }
});

// Delete
document.getElementById('menuDelete').addEventListener('click', async () => {
  const target = contextMenuTarget;
  if (!target) return;
  hideContextMenu();
  
  const confirmDelete = confirm(
    `Удалить проект "${target.name}"?\n\n` +
    `Все файлы и папки проекта будут удалены безвозвратно!`
  );
  
  if (!confirmDelete) return;
  
  try {
    const result = await window.api.deleteProject(target.path);
    if (result.success) {
      const index = projects.findIndex(p => p.id === target.id);
      if (index !== -1) {
        const wasSelected = selectedProjectId === target.id;
        projects.splice(index, 1);
        // Сначала перерисовываем список (карточка исчезает),
        // затем, если удалили ВЫБРАННЫЙ проект, — показываем приветственный
        // экран вместо «мёртвого» центрального блока.
        applyFiltersAndSearch();
        if (wasSelected) {
          selectProject(null);
        }
      }
    } else {
      alert(`Ошибка: ${result.error}`);
    }
  } catch (error) {
    alert(`Ошибка: ${error.message}`);
  }
});

  // ===== ВКЛАДКИ =====
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.tab;
      applyFiltersAndSearch();
    });
  });

  // ===== ПОИСК =====
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      applyFiltersAndSearch();
    });
  }

  // ===== СОРТИРОВКА =====
  const sortSelect = document.getElementById('sortSelect');
  const sortOrderBtn = document.getElementById('sortOrderBtn');

  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      sortField = sortSelect.value;
      applyFiltersAndSearch();
    });
  }

  if (sortOrderBtn) {
    sortOrderBtn.addEventListener('click', () => {
      sortAscending = !sortAscending;
      // ↓ — по убыванию (новые/большие сверху, дефолт)
      // ↑ — по возрастанию (старые/меньшие сверху)
      sortOrderBtn.textContent = sortAscending ? '↑' : '↓';
      applyFiltersAndSearch();
    });
  }

// ===== ОСНОВНАЯ ФУНКЦИЯ ФИЛЬТРАЦИИ, ПОИСКА И СОРТИРОВКИ =====
function applyFiltersAndSearch() {
  const query = searchInput ? searchInput.value.trim() : '';
  
  let filtered = [...projects];
  
  // 1. Фильтр по вкладке
  if (currentTab === 'favorite') {
    filtered = filtered.filter(p => p.favorite === true);
  } else if (currentTab === 'archive') {
    filtered = filtered.filter(p => p.archived === true);
  } else {
    filtered = filtered.filter(p => p.archived !== true);
  }
  
  // 2. Фильтр по статусу
  if (currentStatusFilter !== 'all') {
    filtered = filtered.filter(p => p.status === currentStatusFilter);
  }
  
  // 3. Поиск (по имени и тегам)
  if (query) {
    const searchQuery = query.toLowerCase();
    const searchTerms = searchQuery.split(',').map(s => s.trim()).filter(s => s);
    
    filtered = filtered.filter(project => {
      const nameMatch = project.name.toLowerCase().includes(searchQuery);
      
      let tagsMatch = false;
      if (project.tags && project.tags.length > 0) {
        const projectTagsLower = project.tags.map(t => t.toLowerCase());
        
        if (searchTerms.length > 1) {
          tagsMatch = searchTerms.every(term => 
            projectTagsLower.some(tag => tag.includes(term))
          );
        } else {
          tagsMatch = projectTagsLower.some(tag => tag.includes(searchQuery));
        }
      }
      
      let hashTagMatch = false;
      if (searchQuery.startsWith('#')) {
        const hashTag = searchQuery.substring(1);
        if (project.tags && project.tags.length > 0) {
          hashTagMatch = project.tags.some(tag => 
            tag.toLowerCase().includes(hashTag)
          );
        }
      }
      
      return nameMatch || tagsMatch || hashTagMatch;
    });
  }
  
  // 4. Сортировка
  filtered.sort((a, b) => {
    let comparison = 0;
    if (sortField === 'name') {
      comparison = a.name.localeCompare(b.name);
    } else if (sortField === 'date') {
      const dateA = new Date(a.createdAt || a.created || 0);
      const dateB = new Date(b.createdAt || b.created || 0);
      comparison = dateA - dateB;
    } else if (sortField === 'modified') {
      // Дата последнего изменения: modifiedAt (из stat.mtime) или fallback на createdAt
      const dateA = new Date(a.modifiedAt || a.createdAt || a.created || 0);
      const dateB = new Date(b.modifiedAt || b.createdAt || b.created || 0);
      comparison = dateA - dateB;
    }
    return sortAscending ? comparison : -comparison;
  });
  
  filteredProjects = filtered;
  renderProjects(filtered);
  
  console.log(`🔍 Фильтр: статус=${currentStatusFilter}, вкладка=${currentTab}, поиск="${query}" → ${filtered.length} проектов`);
}
// ===== ФИЛЬТР ПО СТАТУСУ =====
document.querySelectorAll('.status-filter-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.status-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentStatusFilter = btn.dataset.status;
    applyFiltersAndSearch();
  });
});

  // ===== КНОПКА "NEW PROJECT" =====
  if (createBtn) {
    createBtn.addEventListener('click', () => {
      if (!settings || !settings.projectsPath) {
        alert('Путь к проектам не указан в настройках');
        return;
      }
      openModal();
    });
  }

  // ===== КНОПКА "СОЗДАТЬ ПРОЕКТ" НА ПРИВЕТСТВЕННОМ ЭКРАНЕ =====
const welcomeCreateBtn = document.getElementById('welcomeCreateBtn');
if (welcomeCreateBtn) {
  welcomeCreateBtn.addEventListener('click', () => {
    if (!settings || !settings.projectsPath) {
      alert('Путь к проектам не указан в настройках');
      return;
    }
    openModal();
  });
}

  async function handleCreateProject() {
  const name = projectNameInput.value.trim();

  if (!name) {
    alert('Введите название проекта');
    projectNameInput.focus();
    return;
  }

  // Проверяем только по имени, не по папке
  if (projects.some(p => p.name === name)) {
    alert(`Проект с именем "${name}" уже существует`);
    projectNameInput.focus();
    projectNameInput.select();
    return;
  }

  // Определяем выбранный шаблон (если модалка показывает выбор)
  let templateId = null;
  if (templateSelectGroup.style.display !== 'none') {
    templateId = templateSelect.value || null;
  }

  try {
    const result = await window.api.createProject(settings.projectsPath, name, templateId);

    // Если стоит галочка "По умолчанию для этой рабочей области" — сохраняем
    /*if (templateId && setAsWorkspaceDefaultChk.checked) {
      const ws = workspaces.find((w) => w.id === currentWorkspaceId);
      if (ws) {
        ws.defaultTemplateId = templateId;
        saveWorkspaces();
      }
    }*/

    if (result.success) {
      const newProject = {
        id: result.path,
        name: name,
        projectId: result.id || joinPath(result.path).split('/').pop(),
        status: 'open',
        archived: false,
        path: result.path,
        tags: [],
        tasks: [],
        notes: '',
        favorite: false,
        createdAt: new Date().toISOString(),
      };
      projects.push(newProject);
      applyFiltersAndSearch();
      selectProject(newProject.id);
      closeModal();
      console.log(`✅ Проект "${name}" создан с ID: ${newProject.projectId}`);

      // ===== ОТПРАВКА ЗАДАЧИ ИСПОЛНИТЕЛЮ =====
      // Если выбран исполнитель (для Lead/Admin) и это не текущий пользователь —
      // создаём задачу в Supabase с пустым чек-листом и заметками
      // (проект только что создан, задач и заметок ещё нет).
      // Если поле пустое — считается "себе" (текущий пользователь), задача не отправляется.
      const assigneeGroup = document.getElementById('assigneeSelectGroup');
      if (assigneeGroup && assigneeGroup.style.display !== 'none') {
        const assigneeInputEl = document.getElementById('assigneeInput');
        const assigneeName = assigneeInputEl ? assigneeInputEl.value.trim() : '';

        const currentUserId = currentUser ? currentUser.authUserId : null;

        // Пустое поле = "себе" = не отправляем задачу
        if (assigneeName) {
          const assigneeId = findUserIdByName(assigneeName);

          if (assigneeId && assigneeId !== currentUserId) {
            // Отправляем задачу другому пользователю
            try {
              const taskResult = await window.api.createTask({
                supabaseUrl: settings.supabaseUrl,
                supabaseKey: settings.supabaseKey,
                assigneeId: assigneeId,
                createdById: currentUserId,
                title: name,
                checkList: '',
                note: '',
              });
              if (taskResult.success) {
                showToast(`📤 Задача отправлена: ${assigneeName}`);
              } else {
                alert(`Ошибка отправки задачи: ${taskResult.error}`);
              }
            } catch (error) {
              console.error('Ошибка отправки задачи:', error);
              alert(`Ошибка отправки задачи: ${error.message}`);
            }


          } else if (!assigneeId) {
            // Имя введено, но не найдено в списке
            alert(`Исполнитель "${assigneeName}" не найден в базе. Задача не отправлена.`);
          }




          // Если assigneeId === currentUserId — задача не отправляется (себе)
        }
      }
    } else {
      alert(`Ошибка создания проекта: ${result.error}`);
      projectNameInput.focus();
    }
  } catch (error) {
    alert(`Ошибка: ${error.message}`);
    projectNameInput.focus();
  }
}

  modalCreateBtn.addEventListener('click', handleCreateProject);
  projectNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleCreateProject();
  });
  modalCancelBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

// ===== ЗАГРУЗКА НАСТРОЕК И ПРОЕКТОВ =====
async function loadData() {
  try {
        loadUserInfo();
    const settingsResult = await window.api.loadSettings();
    if (!settingsResult.success) {
      console.error('Не удалось загрузить настройки:', settingsResult.error);
      window.location.href = 'settings.html';
      return;
    }
    settings = settingsResult.settings;
    console.log('📁 Настройки загружены:', settings);

    // ===== ЗАГРУЗКА РАБОЧИХ ОБЛАСТЕЙ =====
    loadWorkspaces();
    
    // Если нет рабочих областей — создаем из настроек
    if (workspaces.length === 0 && settings.projectsPath) {
      const name = settings.projectsPath.split(/[\\/]/).pop() || 'Projects';
      const id = workspaceIdCounter++;
      workspaces.push({ id, name, path: settings.projectsPath, element: null });
      currentWorkspaceId = id;
      renderWorkspaceTabs();
      saveWorkspaces();
    } else {
      // Проверяем, что currentWorkspaceId валидный
      if (currentWorkspaceId !== null && currentWorkspaceId !== undefined) {
        const ws = workspaces.find(w => w.id === currentWorkspaceId);
        if (ws) {
          settings.projectsPath = ws.path;
        } else if (workspaces.length > 0) {
          // Если сохраненная рабочая область не найдена — выбираем первую
          currentWorkspaceId = workspaces[0].id;
          settings.projectsPath = workspaces[0].path;
        }
      } else if (workspaces.length > 0) {
        // Если нет сохраненной — выбираем первую
        currentWorkspaceId = workspaces[0].id;
        settings.projectsPath = workspaces[0].path;
      }
      
      renderWorkspaceTabs();
      
      // Обновляем активную вкладку
      document.querySelectorAll('.workspace-tab').forEach(el => {
        const wid = parseInt(el.dataset.workspaceId);
        el.classList.toggle('active', wid === currentWorkspaceId);
      });
      
      saveWorkspaces();
    }

    // Включаем наблюдение за каталогом проектов: fs-события будут
    // автоматически обновлять список проектов, File overview и файловый менеджер
    startWatchingProjects();

    await loadProjects();

    selectProject(null);
    
    restoreSidebarWidths();
    setTimeout(() => {
      if (sidebar) {
        const width = parseInt(sidebar.style.width) || 280;
        updateGridColumns(width);
      }
    }, 100);

  } catch (error) {
    console.error('Ошибка загрузки данных:', error);
  }
}

// ===== УВЕДОМЛЕНИЯ И ЗАДАЧИ =====
let unreadTasks = [];
let currentUserRole = '';

// Проверка прав пользователя
function getUserRole() {
  try {
    const authSettings = localStorage.getItem('authSettings');
    if (authSettings) {
      const data = JSON.parse(authSettings);
      currentUserRole = data.authRole || 'user';
      return currentUserRole;
    }
  } catch (error) {
    console.error('Ошибка получения роли:', error);
  }
  return 'user';
}

// Обновление бейджа уведомлений
function updateNotificationBadge() {
  const badge = document.getElementById('notificationBadge');
  const btn = document.getElementById('notificationsBtn');

  if (unreadTasks.length > 0) {
    badge.textContent = unreadTasks.length;
    badge.style.display = 'flex';
    btn.classList.add('has-notifications');
  } else {
    badge.style.display = 'none';
    btn.classList.remove('has-notifications');
  }

  // Заодно обновляем блок уведомлений на welcome-экране
  renderWelcomeNotifications();
}

// ===== БЛОК УВЕДОМЛЕНИЙ НА WELCOME-ЭКРАНЕ =====
// Показывает непрочитанные задачи прямо в центральной колонке, когда нет
// выбранного проекта. Каждая задача — карточка с заголовком, датой и кнопкой
// "Создать проект" (как в модалке уведомлений, но без split-button рабочих областей).
function renderWelcomeNotifications() {
  const container = document.getElementById('welcomeNotifications');
  const list = document.getElementById('welcomeNotificationsList');
  if (!container || !list) return;

  if (unreadTasks.length === 0) {
    container.style.display = 'none';
    list.innerHTML = '';
    return;
  }

  container.style.display = 'block';
  list.innerHTML = '';

  unreadTasks.forEach((task) => {
    const item = document.createElement('div');
    item.className = 'welcome-notification-item';

    const info = document.createElement('div');
    info.className = 'welcome-notification-info';

    const title = document.createElement('div');
    title.className = 'welcome-notification-title';
    title.textContent = task.title;
    info.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'welcome-notification-meta';
    meta.textContent = `Создано: ${new Date(task.created_at).toLocaleDateString()}`;
    info.appendChild(meta);

    if (task.deadline) {
      const deadline = document.createElement('div');
      deadline.className = 'welcome-notification-deadline';
      const date = new Date(task.deadline);
      const daysLeft = Math.ceil((date - new Date()) / (1000 * 60 * 60 * 24));
      deadline.textContent = `📅 ${date.toLocaleDateString()}`;
      if (daysLeft < 3 && daysLeft >= 0) {
        deadline.classList.add('urgent');
      }
      info.appendChild(deadline);
    }

    // Если есть меши — показываем их количество
    if (task.meshes && task.meshes.length > 0) {
      const meshesInfo = document.createElement('div');
      meshesInfo.className = 'welcome-notification-meshes';
      meshesInfo.textContent = `🎬 Мешей: ${task.meshes.length}`;
      info.appendChild(meshesInfo);
    }

    item.appendChild(info);

    const actionBtn = document.createElement('button');
    actionBtn.className = 'welcome-notification-action-btn';
    actionBtn.textContent = '📁 Создать проект';
    actionBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await createProjectFromTask(task);
      // createProjectFromTask сам обновляет unreadTasks и badge,
      // что вызовет renderWelcomeNotifications повторно.
    });
    item.appendChild(actionBtn);

    list.appendChild(item);
  });
}
// ===== ОБРАБОТЧИКИ УВЕДОМЛЕНИЙ =====
const notificationsBtn = document.getElementById('notificationsBtn');
const notificationsCloseBtn = document.getElementById('notificationsCloseBtn');
const notificationsModal = document.getElementById('notificationsModal');

// Открытие модального окна
function showNotifications() {
  console.log('🔔 showNotifications() вызвана');
  
  const modal = document.getElementById('notificationsModal');
  const list = document.getElementById('notificationsList');
  
  if (!modal) {
    console.error('❌ Модальное окно не найдено!');
    return;
  }
  
  if (!list) {
    console.error('❌ Список уведомлений не найден!');
    return;
  }
  
  console.log('📋 unreadTasks:', unreadTasks);
  
  if (unreadTasks.length === 0) {
    list.innerHTML = '<p class="placeholder-text">Нет новых задач</p>';
  } else {
    list.innerHTML = '';
    unreadTasks.forEach(task => {
      const item = document.createElement('div');
      item.className = 'notification-item';
      
      const info = document.createElement('div');
      info.className = 'notification-info';
      
      const title = document.createElement('div');
      title.className = 'notification-title';
      title.textContent = task.title;
      info.appendChild(title);
      
      const meta = document.createElement('div');
      meta.className = 'notification-meta';
      meta.textContent = `Создано: ${new Date(task.created_at).toLocaleDateString()}`;
      info.appendChild(meta);
      
      item.appendChild(info);
      
      if (task.deadline) {
        const deadline = document.createElement('span');
        deadline.className = 'notification-deadline';
        const date = new Date(task.deadline);
        const daysLeft = Math.ceil((date - new Date()) / (1000 * 60 * 60 * 24));
        deadline.textContent = `📅 ${date.toLocaleDateString()}`;
        if (daysLeft < 3 && daysLeft >= 0) {
          deadline.classList.add('urgent');
        }
        info.appendChild(deadline);
      }
      
      // ===== КНОПКА "СОЗДАТЬ ПРОЕКТ" + ВЫПАДАЮЩИЙ СПИСОК РАБОЧИХ ОБЛАСТЕЙ =====
      // Split-button: основная кнопка создаёт в текущей рабочей области,
      // стрелка ▼ рядом открывает список всех рабочих областей.
      const actionWrapper = document.createElement('div');
      actionWrapper.className = 'notification-action-wrapper';

      const actionBtn = document.createElement('button');
      actionBtn.className = 'notification-action-btn';
      actionBtn.textContent = '📁 Создать проект';
      actionBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await createProjectFromTask(task);
        unreadTasks = unreadTasks.filter(t => t.id !== task.id);
        updateNotificationBadge();
        showNotifications();
      });
      actionWrapper.appendChild(actionBtn);

      // Стрелку показываем только если есть несколько рабочих областей
      if (workspaces.length > 1) {
        const arrowBtn = document.createElement('button');
        arrowBtn.className = 'notification-action-arrow';
        arrowBtn.textContent = '▼';
        arrowBtn.title = 'Выбрать рабочую область';

        const dropdown = document.createElement('div');
        dropdown.className = 'notification-workspace-dropdown';

        workspaces.forEach((ws) => {
          const wsItem = document.createElement('div');
          wsItem.className = 'notification-workspace-item';
          if (ws.id === currentWorkspaceId) {
            wsItem.classList.add('current');
          }

          const wsName = document.createElement('span');
          wsName.className = 'notification-workspace-name';
          wsName.textContent = ws.name;
          wsItem.appendChild(wsName);

          const wsPath = document.createElement('span');
          wsPath.className = 'notification-workspace-path';
          const shortPath = ws.path.length > 38 ? '…' + ws.path.slice(-35) : ws.path;
          wsPath.textContent = shortPath;
          wsPath.title = ws.path;
          wsItem.appendChild(wsPath);

          if (ws.id === currentWorkspaceId) {
            const currentTag = document.createElement('span');
            currentTag.className = 'notification-workspace-current-tag';
            currentTag.textContent = 'текущая';
            wsItem.appendChild(currentTag);
          }

          wsItem.addEventListener('click', async (e) => {
            e.stopPropagation();
            dropdown.classList.remove('open');
            await createProjectFromTask(task, ws.path);
            unreadTasks = unreadTasks.filter(t => t.id !== task.id);
            updateNotificationBadge();
            showNotifications();
          });

          dropdown.appendChild(wsItem);
        });

        actionWrapper.appendChild(dropdown);

        arrowBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          // Закрываем все остальные открытые dropdown
          document.querySelectorAll('.notification-workspace-dropdown.open').forEach((d) => {
            if (d !== dropdown) d.classList.remove('open');
          });
          dropdown.classList.toggle('open');
        });

        actionWrapper.appendChild(arrowBtn);
      }

      item.appendChild(actionWrapper);
      
      list.appendChild(item);
    });
  }
  
  modal.style.display = 'flex';
}

// Закрытие модального окна
function closeNotifications() {
  const modal = document.getElementById('notificationsModal');
  if (modal) modal.style.display = 'none';
}

// Привязываем обработчики
if (notificationsBtn) {
  console.log('🔔 Кнопка уведомлений найдена');
  notificationsBtn.addEventListener('click', (e) => {
    console.log('🖱️ Клик по кнопке уведомлений');
    e.preventDefault();
    e.stopPropagation();
    showNotifications();
  });
} else {
  console.error('❌ Кнопка уведомлений не найдена!');
}

if (notificationsCloseBtn) {
  notificationsCloseBtn.addEventListener('click', closeNotifications);
}

if (notificationsModal) {
  notificationsModal.addEventListener('click', (e) => {
    if (e.target === notificationsModal) closeNotifications();
  });
}

// Закрытие выпадающих списков рабочих областей при клике вне них.
// Стрелка и элементы списка используют stopPropagation, поэтому этот
// обработчик срабатывает только при клике на "пустое" место.
document.addEventListener('click', () => {
  document.querySelectorAll('.notification-workspace-dropdown.open').forEach((d) => {
    d.classList.remove('open');
  });
});
// ===== СОЗДАНИЕ ПРОЕКТА ИЗ ЗАДАЧИ =====
async function createProjectFromTask(task, workspacePath) {
  try {
    // Если workspacePath не передан — используем текущую рабочую область
    const targetPath = workspacePath || (settings && settings.projectsPath);
    if (!targetPath) {
      alert('Путь к проектам не указан в настройках');
      return;
    }

    const projectName = task.title || 'Без названия';
    const projectId = String(task.id);

    // Определяем шаблон: если целевая рабочая область имеет defaultTemplateId —
    // используем его; иначе null (IPC возьмёт глобальный дефолтный).
    const targetWs = workspaces.find((w) => w.path === targetPath);
    const templateId = targetWs?.defaultTemplateId || null;

    const result = await window.api.createProjectWithId(
      targetPath,
      projectName,
      projectId,
      task.meshes || [],
      templateId,
      task.check_list || '',
      task.note || ''
    );

    if (!result.success) {
      alert(`Ошибка создания проекта: ${result.error}`);
      return;
    }

    // ===== ОБНОВЛЯЕМ СТАТУС ЗАДАЧИ В SUPABASE =====
    if (settings && settings.supabaseUrl && settings.supabaseKey) {
      try {
        await window.api.updateTaskStatus({
          supabaseUrl: settings.supabaseUrl,
          supabaseKey: settings.supabaseKey,
          taskId: task.id,
          status: 'open',
          projectId: projectId,
        });
      } catch (error) {
        console.error('Ошибка при обновлении статуса:', error);
      }
    }

    // ===== ОПРЕДЕЛЯЕМ, НУЖНО ЛИ ПЕРЕКЛЮЧАТЬ РАБОЧУЮ ОБЛАСТЬ =====
    const targetWorkspace = workspaces.find((w) => w.path === targetPath);
    const isDifferentWorkspace =
      targetWorkspace && targetWorkspace.id !== currentWorkspaceId;

    if (isDifferentWorkspace) {
      // Переключаем рабочую область вручную (selectWorkspace не awaited,
      // поэтому делаем это здесь, чтобы дождаться loadProjects).
      currentWorkspaceId = targetWorkspace.id;
      settings.projectsPath = targetWorkspace.path;
      document.querySelectorAll('.workspace-tab').forEach((el) => {
        const wid = parseInt(el.dataset.workspaceId);
        el.classList.toggle('active', wid === targetWorkspace.id);
      });
      saveWorkspaces();

      // Перезагружаем проекты из новой рабочей области
      await loadProjects();

      // Находим и выделяем только что созданный проект
      const newProject = projects.find((p) => p.projectId === projectId);
      if (newProject) {
        selectProject(newProject.id);
      }
    } else {
      // Та же рабочая область — добавляем проект в массив и выделяем.
      // ВАЖНО: формируем tasks из task.meshes И task.check_list так же,
      // как это делает createProjectInternal в index.js — иначе project.tasks
      // будет неполным и модалка выбора режима Blender для мешей не покажется.
      const meshTasks = (task.meshes || []).map((meshName, index) => ({
        id: `mesh_${Date.now()}_${index}`,
        text: meshName,
        done: false,
        type: 'mesh',
        createdAt: new Date().toISOString(),
      }));

      // Чек-лист из задачи Supabase (строка через ";") → обычные задачи
      const checkListItems = (task.check_list && task.check_list.trim())
        ? task.check_list.split(';').map((s) => s.trim()).filter((s) => s)
        : [];
      const checkListTasks = checkListItems.map((text, index) => ({
        id: `task_${Date.now()}_${index}`,
        text,
        done: false,
        createdAt: new Date().toISOString(),
      }));

      const newProject = {
        id: result.path,
        name: projectName,
        projectId: projectId,
        status: 'open',
        archived: false,
        path: result.path,
        tags: [],
        tasks: [...meshTasks, ...checkListTasks],
        notes: task.note || '',
        favorite: false,
        createdAt: new Date().toISOString(),
      };
      projects.push(newProject);
      applyFiltersAndSearch();
      selectProject(newProject.id);
    }

    // Удаляем задачу из уведомлений
    unreadTasks = unreadTasks.filter((t) => t.id !== task.id);
    updateNotificationBadge();

    const modal = document.getElementById('notificationsModal');
    if (modal) modal.style.display = 'none';

    const wsName = targetWorkspace ? targetWorkspace.name : 'текущей области';
    alert(`✅ Проект "${projectName}" создан в "${wsName}"!`);
  } catch (error) {
    console.error('Ошибка создания проекта из задачи:', error);
    alert(`Ошибка: ${error.message}`);
  }
}

// Загрузка новых задач из Supabase
async function loadTasksFromSupabase() {
  console.log('🔍 loadTasksFromSupabase() вызвана');
  
  const authSettings = localStorage.getItem('authSettings');
  console.log('📋 authSettings:', authSettings);
  
  if (!authSettings) {
    console.log('❌ Нет authSettings');
    return;
  }
  
  try {
    const userData = JSON.parse(authSettings);
    console.log('👤 userData:', userData);
    
    const settingsResult = await window.api.loadSettings();
    console.log('📁 settingsResult:', settingsResult);
    
    if (!settingsResult.success) {
      console.log('❌ Настройки не загружены');
      return;
    }
    
    const { supabaseUrl, supabaseKey } = settingsResult.settings;
    console.log('🔑 supabaseUrl:', supabaseUrl);
    console.log('🔑 supabaseKey:', supabaseKey ? 'есть' : 'нет');
    
    if (!supabaseUrl || !supabaseKey) {
      console.log('❌ Нет Supabase данных');
      return;
    }
    
    console.log('📤 Запрос задач для userId:', userData.authUserId, 'role:', userData.authRole);
    
    const result = await window.api.getUserTasks({
      supabaseUrl,
      supabaseKey,
      userId: userData.authUserId,
      role: userData.authRole
    });
    
    console.log('📥 Результат запроса:', result);
    
    if (result.success) {
      console.log(`📊 Получено ${result.tasks.length} задач со статусом 'created'`);
      console.log('📋 Задачи:', result.tasks);
      
      // Фильтруем задачи, которых нет в локальных проектах
      const projectIds = projects.map(p => p.projectId);
      console.log('📁 Существующие projectId:', projectIds);
      
      const newTasks = result.tasks.filter(task => {
        // Проверяем, что статус 'created' и нет в проектах
        const isCreated = task.status === 'created';
        const exists = projectIds.includes(String(task.id));
        console.log(`🔍 Задача ${task.id} (${task.title}): статус=${task.status}, exists=${exists}`);
        return isCreated && !exists;
      });
      
      console.log(`🆕 Новых задач (статус 'created'): ${newTasks.length}`);
      unreadTasks = newTasks;
      updateNotificationBadge();
    } else {
      console.error('❌ Ошибка получения задач:', result.error);
    }
  } catch (error) {
    console.error('❌ Ошибка загрузки задач:', error);
  }
}

async function loadProjects() {
  if (!settings || !settings.projectsPath) {
    projects = [];
    applyFiltersAndSearch();
    return;
  }
  
  try {
    const projectsResult = await window.api.getProjects(settings.projectsPath);
    if (projectsResult.success) {
      projects = projectsResult.projects;
      console.log(`📂 Загружено ${projects.length} проектов из ${settings.projectsPath}`);
      await loadPreviewsForProjects(projects);
      
      // ===== ЗАГРУЖАЕМ ЗАДАЧИ ПОСЛЕ ЗАГРУЗКИ ПРОЕКТОВ =====
      await loadTasksFromSupabase();
    } else {
      console.error('Ошибка загрузки проектов:', projectsResult.error);
      projects = [];
    }
  } catch (error) {
    console.error('Ошибка загрузки проектов:', error);
    projects = [];
  }
  
  // Сбрасываем фильтр статуса на "All"
  currentStatusFilter = 'all';
  document.querySelectorAll('.status-filter-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.status-filter-btn[data-status="all"]')?.classList.add('active');
  
  applyFiltersAndSearch();
  selectProject(null);
}

// ===== ОТОБРАЖЕНИЕ ПРОЕКТОВ =====
function renderProjects(projectsToRender) {
  projectList.innerHTML = '';

  if (!projectsToRender || projectsToRender.length === 0) {
    const placeholder = document.createElement('p');
    placeholder.className = 'placeholder-text';
    placeholder.textContent = 'Нет проектов';
    projectList.appendChild(placeholder);
    return;
  }

  projectsToRender.forEach((project) => {
    if (!project.status) project.status = 'open';
    
    const card = createProjectCard(project, (selectedProject) => {
      selectProject(selectedProject.id);
    });

    // Проверяем, что showContextMenu определена
    if (typeof showContextMenu === 'function') {
      card.addEventListener('contextmenu', (e) => {
        showContextMenu(e, project);
      });
    } else {
      console.error('showContextMenu не определена!');
    }

    if (project.id === selectedProjectId) {
      card.classList.add('active');
    }

    projectList.appendChild(card);
  });
}

// ===== ЗАГРУЗКА ПРЕВЬЮ ДЛЯ ВСЕХ ПРОЕКТОВ =====
async function loadPreviewsForProjects(projectsList) {
  console.log('🖼️ Загрузка превью для проектов...');

  // Загружаем ПАРАЛЛЕЛЬНО — при десятках проектов это заметно быстрее,
  // чем последовательный перебор (каждое превью — отдельный IPC-вызов).
  await Promise.all(
    projectsList.map(async (project) => {
      if (project.preview) return;
      try {
        const preview = await getProjectPreview(project.path);
        if (!preview) return;
        project.preview = preview;

        // Обновляем карточку если она уже отображается
        const cards = projectList.querySelectorAll('.project-card');
        cards.forEach((card) => {
          if (card.dataset.projectId === project.id) {
            // Обновляем фон карточки
            let previewPath = preview;
            if (!previewPath.startsWith('file://')) {
              previewPath = `file:///${previewPath.replace(/\\/g, '/')}`;
            }
            card.style.backgroundImage = `url('${previewPath}')`;
            card.style.backgroundSize = 'cover';
            card.style.backgroundPosition = 'center';
            card.style.backgroundColor = 'transparent';
          }
        });
      } catch (error) {
        console.error(`❌ Ошибка загрузки превью для ${project.name}:`, error);
      }
    })
  );
}

  // ===== ВЫБОР ПРОЕКТА =====
function selectProject(projectId) {
  const welcomeScreen = document.getElementById('welcomeScreen');
  const projectContent = document.getElementById('projectContent');
  
  // Если projectId === null или undefined — показываем приветственный экран
  if (!projectId) {
    console.log("welcomeScreen");
    selectedProjectId = null;
    currentProject = null;
    if (welcomeScreen) {
      welcomeScreen.style.display = 'flex';
      welcomeScreen.style.alignItems = 'center';
      welcomeScreen.style.justifyContent = 'center';
      welcomeScreen.style.height = '80%';
    }
    if (projectContent) projectContent.style.display = 'none';
    
    // Очищаем данные
    projectNameEl.textContent = 'Project name';
    taskList.innerHTML = '<p class="placeholder-text">Нет задач</p>';
    fileList.innerHTML = '<p class="placeholder-text">Нет файлов</p>';
    if (notesContainer) notesContainer.innerHTML = '';
    if (tagsContainer) tagsContainer.innerHTML = '<p class="placeholder-text">Нет тегов</p>';
    if (fileManagerContainer) fileManagerContainer.innerHTML = '<p class="placeholder-text">Выберите проект</p>';
    if (fileManagerPath) fileManagerPath.textContent = '';
    
    // Снимаем выделение с карточек
    document.querySelectorAll('.project-card').forEach(c => c.classList.remove('active'));
    return;
  }
  
  // Если есть проект — показываем контент
  if (welcomeScreen) welcomeScreen.style.display = 'none';
  if (projectContent) projectContent.style.display = 'block';
  
  selectedProjectId = projectId;
  currentProject = projects.find((p) => p.id === projectId);

  const cards = projectList.querySelectorAll('.project-card');
  cards.forEach((card) => {
    card.classList.toggle('active', card.dataset.projectId === projectId);
  });

   if (currentProject) {
    projectNameEl.textContent = currentProject.name;
    console.log(`📁 Выбран проект: ${currentProject.name}`);
    console.log(`🏷️ Теги: ${(currentProject.tags || []).join(', ')}`);
    
    if (statusBtn) {
      const status = currentProject.status || 'open';
      // statusLabels теперь доступна
      statusBtn.textContent = statusLabels[status] || statusLabels.open;
      statusBtn.dataset.status = status;
      statusIndex = statuses.indexOf(status);
      if (statusIndex === -1) statusIndex = 0;
    }
    
    loadFavoriteState(currentProject);
    loadTags(currentProject.path);
    loadProjectTasks(currentProject.path);
    loadProjectFiles(currentProject.path);
    loadFileManagerFiles(currentProject.path);

    if (window.loadNotes) {
      window.loadNotes(currentProject.path);
    }

    // ===== Поле "Исполнитель" + кнопка "Отправить задачу" =====
    // Показываем только для Lead/Admin.
    const assigneeRow = document.getElementById('assigneeRow');
    const assigneeField = document.getElementById('assigneeField');
    if (assigneeRow && assigneeField) {
      const role = currentUser ? (currentUser.authRole || 'user').toLowerCase() : 'user';
      if ((role === 'admin' || role === 'lead')) {
        // Если список пользователей пуст — пробуем загрузить
        if (usersList.length === 0) {
          loadUsersList().then(() => {
            if (usersList.length > 0) {
              assigneeRow.style.display = 'flex';
              populateAssigneeDatalist('assigneeFieldList');
              assigneeField.value = '';
            } else {
              assigneeRow.style.display = 'none';
            }
          });
        } else {
          assigneeRow.style.display = 'flex';
          populateAssigneeDatalist('assigneeFieldList');
          assigneeField.value = '';
        }
      } else {
        assigneeRow.style.display = 'none';
      }
    }
  } else {
    projectNameEl.textContent = 'Нет проектов';
    // Скрываем поле исполнителя если нет проекта
    const assigneeRow = document.getElementById('assigneeRow');
    if (assigneeRow) assigneeRow.style.display = 'none';
  }
}

  // ===== КНОПКА "OPEN FOLDER" =====
  if (openFolderBtn) {
    openFolderBtn.addEventListener('click', async () => {
      const project = projects.find((p) => p.id === selectedProjectId);
      if (!project) {
        alert('Сначала выберите проект');
        return;
      }

      try {
        await window.api.openFolder(project.path);
      } catch (error) {
        alert(`Ошибка открытия папки: ${error.message}`);
      }
    });
  }

  // ===== КНОПКА "COPY PATH" — копирует путь текущего проекта в буфер =====
  const copyProjectPathBtn = document.getElementById('copyProjectPathBtn');
  if (copyProjectPathBtn) {
    copyProjectPathBtn.addEventListener('click', async () => {
      const project = projects.find((p) => p.id === selectedProjectId);
      if (!project) {
        alert('Сначала выберите проект');
        return;
      }

      const pathToCopy = project.path;
      try {
        await navigator.clipboard.writeText(pathToCopy);
        showToast(`Скопировано: ${pathToCopy}`);
      } catch (err) {
        // Fallback на устаревший execCommand
        try {
          const textarea = document.createElement('textarea');
          textarea.value = pathToCopy;
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
          showToast(`Скопировано: ${pathToCopy}`);
        } catch (fallbackErr) {
          alert('Не удалось скопировать путь: ' + (fallbackErr.message || fallbackErr));
        }
      }
    });
  }

  // ===== КНОПКА "SETTINGS" (в top-bar) =====
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      window.location.href = 'settings.html';
    });
  }

  // ===== КНОПКА "ОТПРАВИТЬ ЗАДАЧУ" (в content-header, для Lead/Admin) =====
  // Отправляет задачу выбранному исполнителю:
  //   - title = имя проекта
  //   - check_list = задачи из .tasks-section через ";"
  //   - note = текст заметок
  const sendTaskBtn = document.getElementById('sendTaskBtn');
  if (sendTaskBtn) {
    sendTaskBtn.addEventListener('click', async () => {
      if (!currentProject) {
        alert('Сначала выберите проект');
        return;
      }
      if (!settings || !settings.supabaseUrl || !settings.supabaseKey) {
        alert('Supabase не настроен');
        return;
      }
      if (!currentUser || !currentUser.authUserId) {
        alert('Пользователь не авторизован');
        return;
      }

      const assigneeField = document.getElementById('assigneeField');
      const assigneeName = assigneeField ? assigneeField.value.trim() : '';
      const assigneeId = findUserIdByName(assigneeName);

      if (!assigneeName) {
        alert('Выберите исполнителя');
        assigneeField?.focus();
        return;
      }
      if (!assigneeId) {
        alert(`Исполнитель "${assigneeName}" не найден в базе. Выберите из списка.`);
        assigneeField?.focus();
        return;
      }
      if (assigneeId === currentUser.authUserId) {
        alert('Нельзя отправить задачу самому себе');
        return;
      }

      // Собираем чек-лист из задач проекта
      const taskItems = taskList.querySelectorAll('.task-item');
      const checkListItems = [];
      taskItems.forEach((item) => {
        const label = item.querySelector('.task-label');
        if (label && label.textContent) {
          checkListItems.push(label.textContent.trim());
        }
      });
      const checkList = checkListItems.join('; ');

      // Собираем заметки (HTML или текст)
      let note = '';
      if (notesContainer) {
        note = notesContainer.innerHTML || '';
        // Если заметки пустые/плейсхолдер — отправляем пустую строку
        if (note === '<p class="placeholder-text">Add note...</p>' || note === '<br>' || note === '<p><br></p>') {
          note = '';
        }
      }

      const confirmSend = confirm(
        `Отправить задачу "${currentProject.name}" пользователю ${assigneeName}?\n\n` +
        `Чек-лист: ${checkListItems.length} ${checkListItems.length === 1 ? 'задача' : 'задач'}\n` +
        `Заметки: ${note ? 'есть' : 'нет'}`
      );
      if (!confirmSend) return;

      try {
        const result = await window.api.createTask({
          supabaseUrl: settings.supabaseUrl,
          supabaseKey: settings.supabaseKey,
          assigneeId: assigneeId,
          createdById: currentUser.authUserId,
          title: currentProject.name,
          checkList: checkList,
          note: note,
        });
        if (result.success) {
          showToast(`📤 Задача отправлена: ${assigneeName}`);
        } else {
          alert(`Ошибка отправки задачи: ${result.error}`);
        }
      } catch (error) {
        alert(`Ошибка: ${error.message}`);
      }
    });
  }

  // ===== МОДАЛЬНОЕ ОКНО ДЛЯ СОЗДАНИЯ ФАЙЛА =====
  const fileModal = document.getElementById('createFileModal');
  const fileNameInput = document.getElementById('fileNameInput');
  const fileModalCreateBtn = document.getElementById('fileModalCreateBtn');
  const fileModalCancelBtn = document.getElementById('fileModalCancelBtn');

  let fileModalResolve = null;

  function openFileModal(defaultName) {
    return new Promise((resolve) => {
      fileModalResolve = resolve;
      fileNameInput.value = defaultName || '';
      fileModal.style.display = 'flex';
      setTimeout(() => {
        fileNameInput.focus();
        fileNameInput.select();
      }, 100);
    });
  }

  function closeFileModal() {
    fileModal.style.display = 'none';
    if (fileModalResolve) {
      fileModalResolve(null);
      fileModalResolve = null;
    }
  }

  fileModalCreateBtn.addEventListener('click', () => {
    const name = fileNameInput.value.trim();
    if (!name) {
      alert('Введите имя файла');
      return;
    }
    if (fileModalResolve) {
      fileModalResolve(name);
      fileModalResolve = null;
    }
    fileModal.style.display = 'none';
  });

  fileNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      fileModalCreateBtn.click();
    }
    if (e.key === 'Escape') {
      closeFileModal();
    }
  });

  fileModalCancelBtn.addEventListener('click', closeFileModal);
  fileModal.addEventListener('click', (e) => {
    if (e.target === fileModal) closeFileModal();
  });

  // ===== ДИАЛОГ ВЫБОРА 3D-МОДЕЛИ ДЛЯ SUBSTANCE PAINTER =====
  // Показывается при запуске SP, если в папке проекта есть .fbx/.obj/.glb/.gltf файлы.
  // Возвращает Promise<{canceled, path}>:
  //   - canceled=true если пользователь отменил
  //   - path — путь к выбранной модели (null если моделей не было или отменено)
  function showModelSelectionDialog(modelFiles) {
    return new Promise((resolve) => {
      // Если моделей нет — сразу возвращаем null
      if (!modelFiles || modelFiles.length === 0) {
        resolve({ canceled: false, path: null });
        return;
      }

      const modal = document.createElement('div');
      modal.className = 'mesh-mode-dialog';
      modal.innerHTML = `
        <div class="mesh-mode-dialog-content">
          <h3>🎨 Импорт модели в Substance Painter</h3>
          <p class="mesh-mode-dialog-description">
            Выберите 3D-модель для импорта. Substance Painter откроется, импортирует
            выбранную модель и сохранит .spp файл проекта.
          </p>
          <div class="model-selection-list">
            ${modelFiles.map((f, i) => `
              <label class="mesh-mode-option">
                <input type="radio" name="modelSelect" value="${i}" ${i === 0 ? 'checked' : ''}>
                <span class="mesh-mode-option-text">
                  <b>${escapeHtml(f.name)}</b>
                  <small>${escapeHtml(f.relativePath && f.relativePath !== f.name ? f.relativePath : '')} ${formatFileSize(f.size)}</small>
                </span>
              </label>
            `).join('')}
          </div>
          <div class="mesh-mode-dialog-actions">
            <button type="button" id="modelSelectCancel">Отмена</button>
            <button type="button" id="modelSelectOk" class="btn-primary">Импортировать</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      modal.style.display = 'flex';

      const okBtn = modal.querySelector('#modelSelectOk');
      const cancelBtn = modal.querySelector('#modelSelectCancel');

      setTimeout(() => okBtn.focus(), 50);

      function close() {
        modal.remove();
      }

      okBtn.addEventListener('click', () => {
        const selected = modal.querySelector('input[name="modelSelect"]:checked');
        const idx = selected ? parseInt(selected.value) : 0;
        const file = modelFiles[idx];
        close();
        resolve({ canceled: false, path: file ? file.path : null });
      });

      cancelBtn.addEventListener('click', () => {
        close();
        resolve({ canceled: true });
      });

      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          close();
          resolve({ canceled: true });
        }
      });

      modal.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); okBtn.click(); }
        if (e.key === 'Escape') { e.preventDefault(); cancelBtn.click(); }
      });
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatFileSize(bytes) {
    if (!bytes) return '';
    const units = ['Б', 'КБ', 'МБ', 'ГБ'];
    let i = 0;
    let size = bytes;
    while (size >= 1024 && i < units.length - 1) {
      size /= 1024;
      i++;
    }
    return `${size.toFixed(1)} ${units[i]}`;
  }

  // ===== ДИАЛОГ ВЫБОРА РЕЖИМА BLENDER ДЛЯ МЕШЕЙ =====
  // Показывается, когда в проекте есть меши и не задан "запомненный" режим.
  // Возвращает Promise<{canceled, mode, remember}>:
  //   - canceled=true если пользователь отменил
  //   - mode='single' (один .blend для всех мешей) или 'multi' (по файлу на меш)
  //   - remember=true если стоит галочка "Запомнить мой выбор"
  function showMeshModeDialog(meshesCount) {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'mesh-mode-dialog';
      modal.innerHTML = `
        <div class="mesh-mode-dialog-content">
          <h3>🌀 Создание .blend файлов для мешей</h3>
          <p class="mesh-mode-dialog-description">
            В проекте найдено <b>${meshesCount}</b> ${meshesCount === 1 ? 'меш' : (meshesCount < 5 ? 'меша' : 'мешей')}.
            Как создать .blend файлы?
          </p>
          <label class="mesh-mode-option">
            <input type="radio" name="meshMode" value="single" checked>
            <span class="mesh-mode-option-text">
              <b>Один файл для всех мешей</b>
              <small>Создаст один .blend файл с коллекциями для каждого меша</small>
            </span>
          </label>
          <label class="mesh-mode-option">
            <input type="radio" name="meshMode" value="multi">
            <span class="mesh-mode-option-text">
              <b>Отдельный файл для каждого меша</b>
              <small>Создаст ${meshesCount} .blend файлов — по одному на меш</small>
            </span>
          </label>
          <label class="mesh-mode-remember">
            <input type="checkbox" id="meshModeRemember">
            <span>Запомнить мой выбор (не спрашивать снова)</span>
          </label>
          <div class="mesh-mode-dialog-actions">
            <button type="button" id="meshModeCancel">Отмена</button>
            <button type="button" id="meshModeOk" class="btn-primary">Создать</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      modal.style.display = 'flex';

      const okBtn = modal.querySelector('#meshModeOk');
      const cancelBtn = modal.querySelector('#meshModeCancel');
      const rememberChk = modal.querySelector('#meshModeRemember');

      // Enter = OK, Escape = Cancel
      modal.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); okBtn.click(); }
        if (e.key === 'Escape') { e.preventDefault(); cancelBtn.click(); }
      });

      setTimeout(() => okBtn.focus(), 50);

      function close() {
        modal.remove();
      }

      okBtn.addEventListener('click', () => {
        const selected = modal.querySelector('input[name="meshMode"]:checked');
        const mode = selected ? selected.value : 'single';
        const remember = rememberChk.checked;
        close();
        resolve({ canceled: false, mode, remember });
      });

      cancelBtn.addEventListener('click', () => {
        close();
        resolve({ canceled: true });
      });

      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          close();
          resolve({ canceled: true });
        }
      });
    });
  }

  // Сохраняет выбор режима Blender в settings.json через IPC
  async function saveBlenderMeshMode(mode) {
    try {
      const result = await window.api.loadSettings();
      if (result.success) {
        const newSettings = { ...result.settings, blenderMeshMode: mode };
        await window.api.saveSettings(newSettings);
        // Обновляем локальный объект settings, чтобы не перезагружать
        if (settings) settings.blenderMeshMode = mode;
      }
    } catch (error) {
      console.error('Ошибка сохранения blenderMeshMode:', error);
    }
  }

  // ===== КНОПКИ ЗАПУСКА ПРИЛОЖЕНИЙ =====
  // (пользовательские ярлыки .custom-app-btn/.custom-app-add-btn обрабатываются отдельно)
  document.querySelectorAll('.launcher-btn:not(.custom-app-btn):not(.custom-app-add-btn)').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const project = projects.find((p) => p.id === selectedProjectId);
      if (!project) {
        alert('Сначала выберите проект');
        return;
      }

      const appName = btn.textContent.trim();
      let appPath = null;
      let extension = null;

      if (appName.toLowerCase().includes('blender')) {
        appPath = settings.blenderPath;
        extension = 'blend';
      } else if (appName.toLowerCase().includes('substance')) {
        appPath = settings.substancePath;
        extension = 'spp';
      } else {
        alert('Приложение не настроено');
        return;
      }

      if (!appPath) {
        alert(`Путь к ${appName} не указан в настройках`);
        return;
      }

      const projectFiles = currentFiles.filter(f =>
        f.name.toLowerCase().endsWith(`.${extension}`)
      );

      // Вычисляем имя файла только для Blender — Substance имеет свою логику
      // (запрос имени только если .spp уже есть; если .spp нет — имя = имя проекта)
      let finalFileName;
      let filePath;

      if (extension === 'blend') {
        if (projectFiles.length === 0) {
          finalFileName = `${project.name}.${extension}`;
        } else {
          let maxVersion = 0;
          projectFiles.forEach(f => {
            const match = f.name.match(new RegExp(`_v(\\d+)\\.${extension}$`));
            if (match) {
              const v = parseInt(match[1]);
              if (v > maxVersion) maxVersion = v;
            }
          });
          const newVersion = maxVersion + 1;
          const defaultName = `${project.name}_v${newVersion}`;

          const fileName = await openFileModal(defaultName);

          if (fileName === null) return;
          if (!fileName || !fileName.trim()) {
            alert('Имя файла не может быть пустым');
            return;
          }

          finalFileName = `${fileName.trim()}.${extension}`;
        }
        filePath = `${project.path}/${finalFileName}`;
      }
      
      try {
        // Проверка существования файла — только для Blender.
        // Для Substance проверка делается внутри ветки ниже (после формирования имени).
        if (extension === 'blend') {
          const exists = await window.api.fileExists(filePath);
          if (exists.exists) {
            alert(`Файл "${finalFileName}" уже существует. Введите другое имя.`);
            return;
          }
        }

        if (extension === 'blend') {
          // ===== ПРОВЕРКА МЕШЕЙ =====
          // Если в проекте есть задачи типа 'mesh' — нужно решить:
          // один .blend для всех или по файлу на меш.
          const meshTasks = (project.tasks || []).filter(
            (t) => t.type === 'mesh' && t.text && t.text.trim()
          );
          const meshNames = meshTasks.map((t) => t.text.trim());

          let mode = 'single'; // по умолчанию — без мешей, обычный single-режим

          if (meshNames.length > 0) {
            // Проверяем запомненный выбор из настроек
            const savedMode = settings ? settings.blenderMeshMode : null;
            if (savedMode === 'single' || savedMode === 'multi') {
              mode = savedMode;
            } else {
              // Показываем модалку выбора
              const dialogResult = await showMeshModeDialog(meshNames.length);
              if (dialogResult.canceled) return;
              mode = dialogResult.mode;
              if (dialogResult.remember) {
                await saveBlenderMeshMode(mode);
              }
            }
          }

          if (mode === 'multi' && meshNames.length > 0) {
            // ===== MULTI-РЕЖИМ: создаём N .blend файлов, по одному на меш =====
            let createdCount = 0;
            let lastError = null;
            for (let i = 0; i < meshNames.length; i++) {
              const meshName = meshNames[i];
              const meshFileName = `${meshName}.${extension}`;
              const meshFilePath = `${project.path}/${meshFileName}`;

              // Проверяем, не существует ли уже файл
              const meshExists = await window.api.fileExists(meshFilePath);
              if (meshExists.exists) {
                console.log(`⚠️ Файл "${meshFileName}" уже существует, пропускаем`);
                continue;
              }

              const meshSaveResult = await window.api.launchBlenderSave(
                appPath, project.path, meshFileName,
                { mode: 'multi', meshes: meshNames, meshIndex: i }
              );

              if (meshSaveResult.success) {
                createdCount++;
              } else {
                lastError = meshSaveResult.error;
                console.error(`Ошибка создания файла ${meshFileName}:`, lastError);
              }
            }

            if (createdCount === 0) {
              alert(`Не удалось создать ни одного .blend файла${lastError ? ': ' + lastError : ''}`);
              return;
            }

            // Запускаем Blender с первым созданным файлом
            const firstMeshName = meshNames[0];
            const firstFilePath = `${project.path}/${firstMeshName}.${extension}`;
            const launchResult = await window.api.launchApp(appPath, firstFilePath);
            if (!launchResult.success) {
              alert(`Создано файлов: ${createdCount}. Ошибка запуска Blender: ${launchResult.error}`);
            }

            // launchBlenderSave теперь дожидается реального завершения Blender,
            // поэтому .blend и превью уже на диске — обновляем список сразу.
            await loadProjectFiles(project.path);

          } else {
            // ===== SINGLE-РЕЖИМ (или нет мешей): один .blend файл =====
            const saveResult = await window.api.launchBlenderSave(
              appPath, project.path, finalFileName,
              { mode: 'single', meshes: meshNames }
            );

            if (!saveResult.success) {
              alert(`Ошибка создания файла: ${saveResult.error}`);
              return;
            }

            const launchResult = await window.api.launchApp(appPath, filePath);
            if (!launchResult.success) {
              alert(`Ошибка запуска: ${launchResult.error}`);
            }

            // launchBlenderSave теперь дожидается реального завершения Blender,
            // поэтому .blend и превью уже на диске — обновляем список сразу.
            await loadProjectFiles(project.path);
          }

        } else {
          // ===== SUBSTANCE PAINTER =====
          // Логика (по аналогии с Blender):
          //   1. Если .spp НЕТ — выбираем FBX (через find-3d-models), создаём .spp с именем проекта
          //   2. Если .spp УЖЕ ЕСТЬ — выбор FBX + ввод имени файла (версии) для нового .spp
          //   3. Ищем папку Textures/textures для экспорта
          //   4. Запускаем SP через launch-substance — плагин импортирует модель,
          //      настроит экспорт и сохранит .spp

          const existingSpp = currentFiles.find(f =>
            f.name.toLowerCase().endsWith('.spp')
          );

          let selectedMeshPath = null;
          let exportPath = null;
          let finalSppFileName;

          // Рекурсивный поиск 3D-моделей (нужен в обоих случаях)
          let modelFiles = [];
          try {
            const findResult = await window.api.find3dModels(project.path);
            if (findResult.success) {
              modelFiles = findResult.models || [];
            }
          } catch (e) {
            console.error('Ошибка поиска 3D-моделей:', e);
          }

          if (!existingSpp) {
            // ===== СЛУЧАЙ 1: .spp файла нет — создаём новый проект =====
            if (modelFiles.length > 0) {
              const meshSelection = await showModelSelectionDialog(modelFiles);
              if (meshSelection.canceled) return;
              selectedMeshPath = meshSelection.path;
            }
            // Имя .spp = имя проекта (как в Blender при отсутствии .blend)
            finalSppFileName = `${project.name}.${extension}`;
          } else {
            // ===== СЛУЧАЙ 2: .spp уже есть — создаём версию =====
            // Сначала выбор FBX (если есть модели)
            if (modelFiles.length > 0) {
              const meshSelection = await showModelSelectionDialog(modelFiles);
              if (meshSelection.canceled) return;
              selectedMeshPath = meshSelection.path;
            }

            // Вычисляем максимальный номер версии
            const sppFiles = currentFiles.filter(f =>
              f.name.toLowerCase().endsWith('.spp')
            );
            let maxVersion = 0;
            sppFiles.forEach(f => {
              const match = f.name.match(new RegExp(`_v(\\d+)\\.${extension}$`));
              if (match) {
                const v = parseInt(match[1]);
                if (v > maxVersion) maxVersion = v;
              }
            });
            const newVersion = maxVersion + 1;
            const defaultName = `${project.name}_v${newVersion}`;

            // Запрос имени файла через существующую модалку
            const fileName = await openFileModal(defaultName);
            if (fileName === null) return; // пользователь отменил
            if (!fileName || !fileName.trim()) {
              alert('Имя файла не может быть пустым');
              return;
            }
            finalSppFileName = `${fileName.trim()}.${extension}`;
          }

          // Ищем папку Textures/textures для экспорта
          try {
            const dirContents = await window.api.getDirectoryContents(project.path);
            if (dirContents.success) {
              const texturesDir = dirContents.items.find(item =>
                item.isDirectory && item.name.toLowerCase() === 'textures'
              );
              if (texturesDir) {
                exportPath = texturesDir.path;
              }
            }
          } catch {
            // Игнорируем — экспорт останется не настроенным
          }

          // Полный путь к .spp файлу
          const sppFilePath = `${project.path}/${finalSppFileName}`;

          // Проверяем, не существует ли уже .spp
          const sppExists = await window.api.fileExists(sppFilePath);
          if (sppExists.exists) {
            alert(`Файл "${finalSppFileName}" уже существует. Введите другое имя.`);
            return;
          }

          // Запускаем SP через launch-substance
          const launchOptions = {
            sppFilePath: sppFilePath,
            meshPath: selectedMeshPath,
            exportPath: exportPath,
            projectName: project.name,
          };

          const result = await window.api.launchSubstance(
            appPath,
            project.path,
            launchOptions
          );

          if (result.success) {
            // Если плагин только что установлен и есть импорт модели —
            // предупреждаем пользователя, что нужно один раз включить плагин в SP.
            if (result.pluginsDirs && result.pluginsDirs.length > 0 && selectedMeshPath) {
              setTimeout(() => {
                alert(
                  'Substance Painter запущен.\n\n' +
                  'Если автоматизация (импорт модели, сохранение .spp) не сработала — ' +
                  'включите плагин "Project Manager Auto" в SP:\n' +
                  'Plugins (JavaScript) → Project Manager Auto → Enable.\n\n' +
                  'Это нужно сделать один раз, потом все запуски будут автоматическими.\n\n' +
                  'Папки плагина:\n' + result.pluginsDirs.join('\n')
                );
              }, 100);
            }
            setTimeout(async () => {
              await loadProjectFiles(project.path);
            }, 3000);
          } else {
            alert(`Ошибка запуска: ${result.error}`);
          }
        }
      } catch (error) {
        alert(`Ошибка: ${error.message}`);
      }
    });
  });

  // ===== ПОЛЬЗОВАТЕЛЬСКИЕ ЯРЛЫКИ ПРИЛОЖЕНИЙ =====
  // Кнопка "+" под Blender/SP добавляет ярлык любого приложения (.exe/.lnk/.bat).
  // К ярлыку можно подключить свой скрипт-интеграцию (.js): он выполняется
  // при запуске (onLaunch) и добавляет действия в контекстное меню (actions).
  // Описание API скриптов — docs/INTEGRATIONS.md, пример — examples/zbrush-integration.example.js

  const customAppsRow = document.getElementById('customAppsRow');
  const addCustomAppBtn = document.getElementById('addCustomAppBtn');
  let customAppsCache = [];

  async function reloadCustomApps() {
    try {
      const result = await window.api.customAppsList();
      customAppsCache = result.success ? result.apps || [] : [];
    } catch (error) {
      console.error('Ошибка загрузки ярлыков:', error);
      customAppsCache = [];
    }
    renderCustomApps();
  }

  /** Заглушка-иконка с первой буквой имени, если нативную иконку получить не удалось. */
  function letterIconDataUrl(name) {
    const letter = ((name || '?').trim()[0] || '?').toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" rx="8" fill="#5C509F"/><text x="20" y="28" font-size="20" font-family="Arial" fill="#ffffff" text-anchor="middle">${letter}</text></svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  /** Ярлык, с которым ассоциировано расширение (без точки), или null.
   *  Используется при двойном клике по файлу (файловый менеджер и File overview). */
  function findCustomAppForExt(ext) {
    if (!ext) return null;
    const e = String(ext).toLowerCase().replace(/^\.+/, '');
    if (!e) return null;
    return customAppsCache.find((a) => Array.isArray(a.exts) && a.exts.includes(e)) || null;
  }

  function renderCustomApps() {
    if (!customAppsRow) return;
    // Удаляем старые ярлыки (кнопка "+" остаётся)
    customAppsRow.querySelectorAll('.custom-app-btn').forEach((el) => el.remove());
    const plusBtn = document.getElementById('addCustomAppBtn');

    for (const app of customAppsCache) {
      const btn = document.createElement('button');
      btn.className = 'launcher-btn custom-app-btn';
      const extsInfo = Array.isArray(app.exts) && app.exts.length ? `\nОткрывает: ${app.exts.join(', ')}` : '';
      btn.title = (app.scriptName ? `${app.name}\nСкрипт: ${app.scriptName}` : app.name) + extsInfo;

      const icon = document.createElement('img');
      icon.alt = app.name;
      icon.src = app.icon || letterIconDataUrl(app.name);
      btn.appendChild(icon);

      const label = document.createElement('span');
      label.textContent = app.name;
      btn.appendChild(label);

      // Клик — запуск приложения (рабочая папка = папка выбранного проекта)
      btn.addEventListener('click', async () => {
        const project = projects.find((p) => p.id === selectedProjectId);
        if (!project) {
          alert('Сначала выберите проект');
          return;
        }
        try {
          const result = await window.api.customAppsLaunch(app.id, project.path);
          if (!result.success) {
            alert(`Ошибка запуска ${app.name}: ${result.error}`);
          } else if (result.warning) {
            alert(`${app.name} запущено, но скрипт интеграции сообщил об ошибке:\n${result.warning}`);
          }
        } catch (error) {
          alert(`Ошибка: ${error.message}`);
        }
      });

      // Правый клик — контекстное меню (действия скрипта + управление ярлыком)
      btn.addEventListener('contextmenu', async (e) => {
        e.preventDefault();
        await showCustomAppContextMenu(e, app);
      });

      customAppsRow.insertBefore(btn, plusBtn);
    }
  }

  // Добавление ярлыка через "+": выбор приложения → ярлык появляется на месте кнопки
  if (addCustomAppBtn) {
    addCustomAppBtn.addEventListener('click', async () => {
      try {
        const pick = await window.api.customAppsPickExecutable();
        if (!pick.success || pick.canceled || !pick.path) return;
        const result = await window.api.customAppsAdd({ execPath: pick.path, name: pick.defaultName });
        if (result.success) {
          await reloadCustomApps();
        } else {
          alert(`Не удалось добавить приложение: ${result.error}`);
        }
      } catch (error) {
        alert(`Ошибка: ${error.message}`);
      }
    });
  }

  // ----- Контекстное меню ярлыка (динамическое — пункты зависят от скрипта) -----
  const customAppMenu = document.createElement('div');
  customAppMenu.className = 'context-menu';
  customAppMenu.style.display = 'none';
  document.body.appendChild(customAppMenu);

  function hideCustomAppMenu() {
    customAppMenu.style.display = 'none';
  }

  document.addEventListener('click', (e) => {
    if (!customAppMenu.contains(e.target)) hideCustomAppMenu();
  });
  document.addEventListener('contextmenu', (e) => {
    if (!e.target.closest('.custom-app-btn')) hideCustomAppMenu();
  });

  function addCustomAppMenuItem(label, handler, extraClass) {
    const item = document.createElement('div');
    item.className = 'context-menu-item' + (extraClass ? ` ${extraClass}` : '');
    item.textContent = label;
    if (handler) {
      item.addEventListener('click', async () => {
        hideCustomAppMenu();
        try {
          await handler();
        } catch (err) {
          alert(`Ошибка: ${err.message}`);
        }
      });
    }
    customAppMenu.appendChild(item);
    return item;
  }

  function addCustomAppMenuSeparator() {
    const sep = document.createElement('div');
    sep.style.borderTop = '1px solid #444444';
    sep.style.margin = '4px 0';
    sep.style.pointerEvents = 'none';
    customAppMenu.appendChild(sep);
  }

  async function showCustomAppContextMenu(e, app) {
    // Действия из подключённого скрипта (если есть)
    let actions = [];
    let scriptError = null;
    try {
      const actionsResult = await window.api.customAppsGetActions(app.id);
      if (actionsResult.success) {
        actions = actionsResult.actions || [];
        scriptError = actionsResult.scriptError || null;
      }
    } catch (err) {
      console.error('Ошибка получения действий скрипта:', err);
    }

    customAppMenu.innerHTML = '';

    if (actions.length > 0) {
      for (const action of actions) {
        addCustomAppMenuItem(`▶ ${action.title}`, async () => {
          const project = projects.find((p) => p.id === selectedProjectId);
          const result = await window.api.customAppsRunAction(app.id, action.id, project ? project.path : null);
          if (!result.success) alert(`Ошибка действия: ${result.error}`);
        });
      }
      addCustomAppMenuSeparator();
    }

    if (scriptError) {
      const errItem = addCustomAppMenuItem(`⚠️ ${scriptError}`, null);
      errItem.style.color = '#e0a0a0';
      errItem.style.maxWidth = '280px';
      errItem.style.whiteSpace = 'normal';
      addCustomAppMenuSeparator();
    }

    if (app.scriptPath) {
      const infoItem = addCustomAppMenuItem(`📜 Скрипт: ${app.scriptName || 'подключён'}`, null);
      infoItem.style.opacity = '0.6';
      addCustomAppMenuItem('🔁 Заменить скрипт', async () => {
        const pick = await window.api.customAppsPickScript();
        if (!pick.success || pick.canceled || !pick.path) return;
        const result = await window.api.customAppsUpdate({ id: app.id, scriptPath: pick.path });
        if (result.success) await reloadCustomApps();
        else alert(`Ошибка: ${result.error}`);
      });
      addCustomAppMenuItem('❌ Открепить скрипт', async () => {
        const result = await window.api.customAppsUpdate({ id: app.id, scriptPath: null });
        if (result.success) await reloadCustomApps();
        else alert(`Ошибка: ${result.error}`);
      });
    } else {
      addCustomAppMenuItem('📜 Подключить скрипт интеграции', async () => {
        const pick = await window.api.customAppsPickScript();
        if (!pick.success || pick.canceled || !pick.path) return;
        const result = await window.api.customAppsUpdate({ id: app.id, scriptPath: pick.path });
        if (result.success) {
          await reloadCustomApps();
          const actionsAfter = await window.api.customAppsGetActions(app.id);
          const count = actionsAfter.success ? (actionsAfter.actions || []).length : 0;
          if (count > 0) {
            alert(`Скрипт подключён. Действия (${count}) доступны в контекстном меню ярлыка (правый клик).`);
          } else {
            alert('Скрипт подключён, но действий (actions) в нём нет.\nСм. docs/INTEGRATIONS.md — пример структуры скрипта.');
          }
        } else {
          alert(`Ошибка: ${result.error}`);
        }
      });
    }

    // Ассоциации расширений файлов
    addCustomAppMenuSeparator();
    if (Array.isArray(app.exts) && app.exts.length) {
      const extsItem = addCustomAppMenuItem(`🔗 Открывает: ${app.exts.join(', ')}`, null);
      extsItem.style.opacity = '0.6';
    }
    addCustomAppMenuItem('🔗 Расширения файлов…', async () => {
      const value = await openExtensionsModal(app);
      if (value === null) return;
      const result = await window.api.customAppsUpdate({ id: app.id, exts: value });
      if (result.success) {
        await reloadCustomApps();
        // File overview мог отображать не все файлы — перезагружаем список
        const project = projects.find((p) => p.id === selectedProjectId);
        if (project && project.path) await loadProjectFiles(project.path);
      } else {
        alert(`Ошибка: ${result.error}`);
      }
    });

    addCustomAppMenuSeparator();
    addCustomAppMenuItem('✏️ Переименовать', async () => {
      const newName = await openRenameModal(app.name, {
        title: '✏️ Переименовать приложение',
        confirmLabel: 'Переименовать',
      });
      if (newName === null) return;
      if (!newName.trim()) {
        alert('Имя не может быть пустым');
        return;
      }
      const result = await window.api.customAppsUpdate({ id: app.id, name: newName.trim() });
      if (result.success) await reloadCustomApps();
      else alert(`Ошибка: ${result.error}`);
    });
    addCustomAppMenuItem('🗑️ Удалить ярлык', async () => {
      if (!confirm(`Удалить ярлык "${app.name}"?\n(само приложение и его папки не удаляются)`)) return;
      const result = await window.api.customAppsRemove(app.id);
      if (result.success) await reloadCustomApps();
      else alert(`Ошибка: ${result.error}`);
    }, 'danger');

    // Показываем меню у курсора (с учётом границ окна)
    const menuWidth = 240;
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - 8);
    const y = Math.min(e.clientY, window.innerHeight - 320);
    customAppMenu.style.left = Math.max(8, x) + 'px';
    customAppMenu.style.top = Math.max(8, y) + 'px';
    customAppMenu.style.display = 'block';
  }

  // ----- Модальное окно ассоциаций расширений файлов -----
  const extModal = document.getElementById('extModal');
  const extModalInput = document.getElementById('extModalInput');
  const extModalTitle = document.getElementById('extModalTitle');
  const extModalHint = document.getElementById('extModalHint');
  const extModalConfirmBtn = document.getElementById('extModalConfirmBtn');
  const extModalCancelBtn = document.getElementById('extModalCancelBtn');
  let extModalResolve = null;

  /** Открывает окно редактирования расширений ярлыка. Резолвится строкой
   *  (можно пустой — убрать все ассоциации) или null при отмене. */
  function openExtensionsModal(app) {
    return new Promise((resolve) => {
      extModalResolve = resolve;
      if (extModalTitle) extModalTitle.textContent = `🔗 Расширения — ${app.name}`;
      if (extModalInput) extModalInput.value = Array.isArray(app.exts) ? app.exts.join(', ') : '';
      if (extModalHint) {
        extModalHint.textContent =
          'Файлы с этими расширениями будут открываться двойным кликом в этом приложении ' +
          'и появятся в File overview. Через запятую, например: svg, inx. ' +
          'Оставьте пустым, чтобы убрать ассоциации.';
      }
      extModal.style.display = 'flex';
      setTimeout(() => { if (extModalInput) extModalInput.focus(); }, 100);
    });
  }

  function closeExtensionsModal(value) {
    extModal.style.display = 'none';
    if (extModalResolve) {
      extModalResolve(value === undefined ? null : value);
      extModalResolve = null;
    }
  }

  if (extModalConfirmBtn) {
    extModalConfirmBtn.addEventListener('click', () => {
      closeExtensionsModal(extModalInput ? extModalInput.value : '');
    });
  }
  if (extModalCancelBtn) {
    extModalCancelBtn.addEventListener('click', () => closeExtensionsModal());
  }
  if (extModalInput) {
    extModalInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') closeExtensionsModal(extModalInput.value);
      if (e.key === 'Escape') closeExtensionsModal();
    });
  }
  if (extModal) {
    extModal.addEventListener('click', (e) => {
      if (e.target === extModal) closeExtensionsModal();
    });
  }

  // Загружаем сохранённые ярлыки при старте
  reloadCustomApps();

  // ===== СТАТУС ПРОЕКТА =====
  const statuses = ['open', 'active', 'issue', 'done'];
const statusLabels = {
  open: '● Open',
  active: '● Active',
  issue: '● Issue',
  done: '● Done'
};
let statusIndex = 0;

const statusBtn = document.getElementById('statusBtn');
if (statusBtn) {
  statusBtn.addEventListener('click', async () => {
    if (!currentProject) return;
    
    statusIndex = (statusIndex + 1) % statuses.length;
    const newStatus = statuses[statusIndex];
    
    console.log(`🔄 Изменение статуса проекта "${currentProject.name}" на ${newStatus}`);
    console.log('📋 currentProject:', currentProject);
    console.log('📋 projectId:', currentProject.projectId);
    
    try {
      // Подготавливаем конфиг для Supabase
      let supabaseConfig = null;
      if (settings && settings.supabaseUrl && settings.supabaseKey) {
        supabaseConfig = {
          url: settings.supabaseUrl,
          key: settings.supabaseKey
        };
        console.log('🔑 Supabase config:', supabaseConfig);
      }
      
      const result = await window.api.updateProjectStatus(
        currentProject.path, 
        newStatus,
        supabaseConfig
      );
      
      console.log('📥 Результат обновления статуса:', result);
      
      if (result.success) {
        currentProject.status = newStatus;
        statusBtn.textContent = statusLabels[newStatus];
        statusBtn.dataset.status = newStatus;
        
        const project = projects.find(p => p.id === currentProject.id);
        if (project) project.status = newStatus;
        
        // Обновляем карточку
        const cards = projectList.querySelectorAll('.project-card');
        cards.forEach((card) => {
          if (card.dataset.projectId === currentProject.id) {
            const statusEl = card.querySelector('.project-status');
            if (statusEl) {
              statusEl.className = 'project-status';
              const statusClassMap = {
                open: 'status-open',
                active: 'status-active',
                issue: 'status-issue',
                done: 'status-done',
                archived: 'status-archived'
              };
              statusEl.classList.add(statusClassMap[newStatus] || 'status-open');
              statusEl.title = getStatusLabel(newStatus);
            }
          }
        });
        
        console.log(`✅ Статус проекта "${currentProject.name}" обновлен на ${newStatus}`);
      } else {
        alert(`Ошибка обновления статуса: ${result.error}`);
      }
    } catch (error) {
      console.error('❌ Ошибка:', error);
      alert(`Ошибка: ${error.message}`);
    }
  });
}

function getStatusLabel(status) {
  const labels = {
    open: 'Open',
    active: 'Active',
    issue: 'Issue',
    done: 'Done',
    archived: 'Archived'
  };
  return labels[status] || 'Open';
}

  // ===== ИЗБРАННОЕ =====
const favoriteBtn = document.getElementById('favoriteBtn');

if (favoriteBtn) {
  favoriteBtn.addEventListener('click', async () => {
    if (!currentProject) return;
    
    const newFavoriteState = !currentProject.favorite;
    
    try {
      const result = await window.api.updateProjectFavorite(currentProject.path, newFavoriteState);
      if (result.success) {
        currentProject.favorite = newFavoriteState;
        updateFavoriteButton(newFavoriteState);
        
        // Обновляем в списке проектов
        const project = projects.find(p => p.id === currentProject.id);
        if (project) project.favorite = newFavoriteState;
        
        // Обновляем карточку
        const cards = projectList.querySelectorAll('.project-card');
        cards.forEach((card) => {
          if (card.dataset.projectId === currentProject.id) {
            const favEl = card.querySelector('.project-favorite');
            if (favEl) {
              favEl.textContent = newFavoriteState ? '⭐' : '☆';
            }
          }
        });
        
        // Обновляем список (если мы во вкладке Favorite)
        applyFiltersAndSearch();
        
        console.log(`⭐ Проект "${currentProject.name}" ${newFavoriteState ? 'добавлен в избранное' : 'удален из избранного'}`);
      } else {
        alert(`Ошибка: ${result.error}`);
      }
    } catch (error) {
      alert(`Ошибка: ${error.message}`);
    }
  });
}

// Функция обновления кнопки избранного
function updateFavoriteButton(isFavorite) {
  if (!favoriteBtn) return;
  favoriteBtn.textContent = isFavorite ? '⭐' : '☆';
  favoriteBtn.classList.toggle('active', isFavorite);
}

// Функция загрузки состояния избранного при выборе проекта
function loadFavoriteState(project) {
  if (!favoriteBtn) return;
  const isFavorite = project.favorite || false;
  updateFavoriteButton(isFavorite);
}

  // ===== ТЕГИ =====
  const tagsContainer = document.getElementById('tagsContainer');
  const tagInput = document.getElementById('tagInput');
  const addTagBtn = document.getElementById('addTagBtn');

  async function loadTags(projectPath) {
    if (!tagsContainer) return;
    try {
      const result = await window.api.getProjectTags(projectPath);
      if (result.success) {
        renderTags(result.tags);
      }
    } catch (error) {
      console.error('Ошибка загрузки тегов:', error);
    }
  }

  function renderTags(tags) {
    if (!tagsContainer) return;
    tagsContainer.innerHTML = '';
    
    if (!tags || tags.length === 0) {
      const placeholder = document.createElement('p');
      placeholder.className = 'placeholder-text';
      placeholder.textContent = 'Нет тегов';
      tagsContainer.appendChild(placeholder);
      return;
    }
    
    tags.forEach((tag) => {
      const tagEl = document.createElement('span');
      tagEl.className = 'tag-item';
      tagEl.innerHTML = `
        ${tag}
        <span class="tag-delete" data-tag="${tag}">✕</span>
      `;
      
      tagEl.querySelector('.tag-delete').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!currentProject) return;
        
        try {
          const result = await window.api.removeTag(currentProject.path, tag);
          if (result.success) {
            // Обновляем теги в currentProject
            if (currentProject.tags) {
              currentProject.tags = currentProject.tags.filter(t => t !== tag);
            }
            await loadTags(currentProject.path);
            // Обновляем поиск
            applyFiltersAndSearch();
          } else {
            alert(`Ошибка удаления тега: ${result.error}`);
          }
        } catch (error) {
          alert(`Ошибка: ${error.message}`);
        }
      });
      
      tagsContainer.appendChild(tagEl);
    });
  }

  if (addTagBtn && tagInput) {
    addTagBtn.addEventListener('click', async () => {
      if (!currentProject) {
        alert('Сначала выберите проект');
        return;
      }
      
      const tag = tagInput.value.trim();
      if (!tag) {
        alert('Введите название тега');
        return;
      }
      
      try {
        const result = await window.api.addTag(currentProject.path, tag);
        if (result.success) {
          tagInput.value = '';
          // Добавляем тег в currentProject
          if (!currentProject.tags) currentProject.tags = [];
          if (!currentProject.tags.includes(tag)) {
            currentProject.tags.push(tag);
          }
          await loadTags(currentProject.path);
          // Обновляем поиск
          applyFiltersAndSearch();
        } else {
          alert(`Ошибка добавления тега: ${result.error}`);
        }
      } catch (error) {
        alert(`Ошибка: ${error.message}`);
      }
    });

    tagInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        addTagBtn.click();
      }
    });
  }


// ===== ФАЙЛОВЫЙ МЕНЕДЖЕР =====
const fileManagerContainer = document.getElementById('fileManagerContainer');
const fileManagerPath = document.getElementById('fileManagerPath');
const backBtn = document.getElementById('backBtn');
const forwardBtn = document.getElementById('forwardBtn');
const refreshBtn = document.getElementById('refreshBtn');

let fileManagerProjectPath = null;
let currentPath = null;
let history = [];
let historyIndex = -1;

// Кнопки навигации
if (backBtn) {
  backBtn.addEventListener('click', goBack);
}
if (forwardBtn) {
  forwardBtn.addEventListener('click', goForward);
}
if (refreshBtn) {
  refreshBtn.addEventListener('click', () => {
    if (currentPath) loadDirectory(currentPath, false);
  });
}

// Кнопки мыши (назад/вперед)
document.addEventListener('mouseup', (e) => {
  if (e.button === 3) { e.preventDefault(); goBack(); }
  else if (e.button === 4) { e.preventDefault(); goForward(); }
});
document.addEventListener('mousedown', (e) => {
  if (e.button === 3 || e.button === 4) e.preventDefault();
});

function goBack() {
  if (historyIndex > 0) {
    historyIndex--;
    loadDirectory(history[historyIndex], false);
    updateNavButtons();
  }
}

function goForward() {
  if (historyIndex < history.length - 1) {
    historyIndex++;
    loadDirectory(history[historyIndex], false);
    updateNavButtons();
  }
}

function updateNavButtons() {
  if (backBtn) backBtn.disabled = historyIndex <= 0;
  if (forwardBtn) forwardBtn.disabled = historyIndex >= history.length - 1;
}

function addToHistory(path) {
  history = history.slice(0, historyIndex + 1);
  history.push(path);
  historyIndex = history.length - 1;
  updateNavButtons();
}

// Загрузка файлов проекта
async function loadFileManagerFiles(projectPath) {
  if (!projectPath) {
    fileManagerContainer.innerHTML = '<div class="placeholder-text">Выберите проект</div>';
    fileManagerPath.textContent = '';
    return;
  }
  
  fileManagerProjectPath = projectPath;
  currentPath = projectPath;
  history = [projectPath];
  historyIndex = 0;
  updateNavButtons();
  
  await loadDirectory(projectPath);
}

// Загрузка директории
async function loadDirectory(dirPath, addToHistoryFlag = true) {
  try {
    const result = await window.api.getDirectoryContents(dirPath);
    if (result.success) {
      currentPath = dirPath;
      if (addToHistoryFlag) addToHistory(dirPath);
      
      const displayPath = dirPath.replace(fileManagerProjectPath, '');
      fileManagerPath.textContent = displayPath || '/';
      
      const items = result.items.filter(item => !item.name.startsWith('.'));
      renderTreeItems(items);
    } else {
      fileManagerContainer.innerHTML = `<div class="placeholder-text">Ошибка: ${result.error}</div>`;
    }
  } catch (error) {
    console.error('Ошибка загрузки директории:', error);
    fileManagerContainer.innerHTML = '<div class="placeholder-text">Ошибка загрузки</div>';
  }
}

// ===== РЕНДЕРИНГ ДЕРЕВА =====
function renderTreeItems(items) {
  if (!items || items.length === 0) {
    fileManagerContainer.innerHTML = '<div class="placeholder-text">Папка пуста</div>';
    return;
  }

  // Сортируем: папки сначала
  const sorted = [...items].sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });
  
  fileManagerContainer.innerHTML = '';
  
  sorted.forEach((item) => {
    const el = createTreeItem(item);
    fileManagerContainer.appendChild(el);
  });

  // Восстанавливаем приглушённый вид «вырезанных» объектов (буфер обмена)
  if (typeof updateCutMarks === 'function') updateCutMarks();

  // Настраиваем drag&drop для новых элементов и контейнера.
  // Откладываем на microtask, чтобы DOM успел отрисоваться.
  setTimeout(() => {
    setupDragDropForTreeItems();
    if (!fileManagerContainer._dragSetup) {
      setupDragAndDrop(fileManagerContainer);
    }
  }, 50);
}

// Создание элемента дерева
// ===== ВЫДЕЛЕНИЕ В ДЕРЕВЕ ФАЙЛОВ =====
// Якорь выделения: последний файл, выбранный обычным кликом или Ctrl+кликом.
// Shift+клик выделяет диапазон от якоря до кликнутого элемента (как в проводнике).
let lastSelectedTreeItem = null;

/** Визуально выделяет/снимает выделение с элемента дерева. */
function setTreeItemSelected(el, selected) {
  if (!el) return;
  el.dataset.selected = selected ? 'true' : 'false';
  el.classList.toggle('selected', selected);
  el.style.background = selected ? '#5C509F' : 'transparent';
  el.style.borderColor = selected ? '#5C509F' : 'transparent';
  el.style.color = selected ? '#ffffff' : '#e0e0e0';
}

/** Снимает выделение со всех элементов дерева. */
function clearTreeSelection() {
  document.querySelectorAll('.tree-item').forEach((el) => setTreeItemSelected(el, false));
}

/** Видимые элементы дерева (в DOM-порядке, сверху вниз).
 *  offsetParent === null у скрытых элементов — пропускаем содержимое
 *  свёрнутых веток, чтобы Shift-диапазон не захватывал невидимые файлы. */
function getVisibleTreeItems() {
  return Array.from(document.querySelectorAll('.tree-item'))
    .filter((el) => el.offsetParent !== null);
}

/** Выделяет диапазон элементов дерева между fromEl и toEl (включительно).
 *  Если якорь не найден (дерево перестроено или выделения ещё не было) —
 *  диапазон берётся от первого видимого элемента. */
function selectTreeItemRange(fromEl, toEl) {
  const items = getVisibleTreeItems();
  if (!toEl || items.length === 0) return;
  let startIdx = items.indexOf(fromEl);
  if (startIdx === -1) startIdx = 0;
  const endIdx = items.indexOf(toEl);
  if (endIdx === -1) return;
  clearTreeSelection();
  const from = Math.min(startIdx, endIdx);
  const to = Math.max(startIdx, endIdx);
  for (let i = from; i <= to; i++) setTreeItemSelected(items[i], true);
}

function createTreeItem(item, level = 0) {
  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.width = '100%';
  
    const el = document.createElement('div');
  el.className = 'tree-item';
  el.dataset.path = item.path || '';
  el.dataset.name = item.name || '';
  el.dataset.isDirectory = item.isDirectory ? 'true' : 'false';
  el.style.paddingLeft = (level * 16 + 4) + 'px';
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.gap = '6px';
  el.style.padding = '5px 8px';
  el.style.borderRadius = '6px';
  el.style.cursor = 'pointer';
  el.style.transition = 'background 0.15s ease';
  el.style.fontSize = '13px';
  el.style.color = '#e0e0e0';
  el.style.userSelect = 'none';
  el.style.border = '1px solid transparent';
  el.style.minHeight = '28px';
  el.style.width = '100%';

  // ===== ВЫДЕЛЕНИЕ ФАЙЛОВ ДЛЯ ПЕРЕТАСКИВАНИЯ =====
  // Множественный выбор:
  //   Ctrl+клик  — добавить/убрать файл в выделении (по одному);
  //   Shift+клик — выделить диапазон от последнего выбранного файла;
  //   Обычный клик — снимает всё, выделяет только текущий.
  // Выделенные файлы можно перетащить в другие программы (UE5, проводник).
  el.dataset.selected = 'false';
  
  // Проверяем, есть ли дети
  const hasChildren = item.isDirectory && item.children && item.children.length > 0;
  
  // Стрелка
  const toggle = document.createElement('span');
  toggle.textContent = hasChildren ? '▼' : ' ';
  toggle.style.width = '20px';
  toggle.style.textAlign = 'center';
  toggle.style.fontSize = '11px';
  toggle.style.color = '#888888';
  toggle.style.flexShrink = '0';
  if (!hasChildren) {
    toggle.style.opacity = '0';
    toggle.style.pointerEvents = 'none';
  } else {
    toggle.style.cursor = 'pointer';
  }
  el.appendChild(toggle);
  
  // Иконка
  const icon = document.createElement('span');
  icon.textContent = item.isDirectory ? '📁' : getFileIcon(item.name);
  icon.style.fontSize = '16px';
  icon.style.width = '24px';
  icon.style.textAlign = 'center';
  icon.style.flexShrink = '0';
  el.appendChild(icon);
  
  // Имя
  const name = document.createElement('span');
  name.textContent = item.name;
  name.style.flex = '1';
  name.style.fontSize = '12px';
  name.style.overflow = 'hidden';
  name.style.textOverflow = 'ellipsis';
  name.style.whiteSpace = 'nowrap';
  name.style.color = 'inherit';
  el.appendChild(name);
  
  // Наведение
  el.addEventListener('mouseenter', function() {
    if (!this.classList.contains('selected')) {
      this.style.background = '#333333';
      this.style.borderColor = '#444444';
    }
  });
  el.addEventListener('mouseleave', function() {
    if (!this.classList.contains('selected')) {
      this.style.background = 'transparent';
      this.style.borderColor = 'transparent';
    }
  });
  
  // ===== СИСТЕМНЫЙ DRAG-AND-DROP (перетаскивание в UE5, проводник и т.д.) =====
  // Делаем файлы (не папки) перетаскиваемыми. Папки startDrag не поддерживает.
  if (!item.isDirectory && item.path) {
    el.draggable = true;

    el.addEventListener('dragstart', function(e) {
      // ВАЖНО: preventDefault() обязателен! Без него HTML5 drag берёт верх
      // и блокирует нативный startDrag. preventDefault отменяет HTML5 drag,
      // позволяя нативному OLE drag работать.
      e.preventDefault();

      // Собираем все выделенные файлы (для перетаскивания нескольких сразу).
      let filesToDrag = [];
      if (el.dataset.selected === 'true') {
        document.querySelectorAll('.tree-item[data-selected="true"]').forEach((selectedEl) => {
          if (selectedEl.dataset.isDirectory !== 'true' && selectedEl.dataset.path) {
            filesToDrag.push(selectedEl.dataset.path);
          }
        });
      }
      if (filesToDrag.length === 0) {
        filesToDrag = [item.path];
      }

      // ipcRenderer.send — синхронный вызов, не возвращает Promise.
      // startDrag запускается в main process и держит "захват" до отпускания мыши.
      window.api.startDrag(filesToDrag);
    });

    // Курсор при наведении на перетаскиваемый файл
    el.style.cursor = 'grab';
  }



  // Клик
  el.addEventListener('click', function(e) {
    // Если клик по стрелке
    if (e.target === toggle && hasChildren) {
      const childrenContainer = this.parentElement.querySelector('.tree-children');
      if (childrenContainer) {
        const isCollapsed = childrenContainer.classList.toggle('collapsed');
        toggle.textContent = isCollapsed ? '▶' : '▼';
      }
      return;
    }
    
    // ===== Множественный выбор (Shift+клик — диапазон) =====
    if (e.shiftKey) {
      e.preventDefault();
      selectTreeItemRange(lastSelectedTreeItem, this);
      // Якорь (последний обычный/Ctrl-клик) не переносим — как в проводнике:
      // следующие Shift+клики расширяют диапазон от той же точки.
      return;
    }

    // ===== Множественный выбор (Ctrl+клик — по одному) =====
    if (e.ctrlKey || e.metaKey) {
      // Переключаем выделение текущего файла
      const isCurrentlySelected = (this.dataset.selected === 'true');
      setTreeItemSelected(this, !isCurrentlySelected);
      // Этот файл становится якорем для последующего Shift+клика
      lastSelectedTreeItem = this;
      return;
    }

    // Обычный клик — снимаем выделение со всех, выделяем текущий
    clearTreeSelection();
    setTreeItemSelected(this, true);
    // Этот файл становится якорем для последующего Shift+клика
    lastSelectedTreeItem = this;
  });
  
  // Двойной клик
  el.addEventListener('dblclick', function() {
    if (item.isDirectory) {
      if (item.path) loadDirectory(item.path);
    } else {
      if (item.path) openFileInApp(item.path);
    }
  });
  
  wrapper.appendChild(el);
  
  // Дети
  if (hasChildren) {
    const childrenContainer = document.createElement('div');
    childrenContainer.className = 'tree-children';
    childrenContainer.style.display = 'flex';
    childrenContainer.style.flexDirection = 'column';
    
    const sorted = [...item.children].sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
    
    sorted.forEach((child) => {
      const childEl = createTreeItem(child, level + 1);
      childrenContainer.appendChild(childEl);
    });
    
    wrapper.appendChild(childrenContainer);
  }
  
  return wrapper;
}

// Иконка файла
function getFileIcon(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const icons = {
    'blend': '🌀', 'spp': '🎨', 'png': '🖼️', 'jpg': '🖼️',
    'jpeg': '🖼️', 'gif': '🖼️', 'webp': '🖼️', 'fbx': '📦',
    'obj': '📦', 'gltf': '📦', 'glb': '📦', 'mp4': '🎬',
    'mov': '🎬', 'avi': '🎬', 'wav': '🔊', 'mp3': '🔊',
    'txt': '📄', 'md': '📄', 'json': '📄', 'xml': '📄',
    'py': '🐍', 'js': '🟨', 'html': '🟧', 'css': '🟦',
    'exe': '⚙️', 'zip': '📦', 'rar': '📦'
  };
  return icons[ext] || '📄';
}

// Открытие файла
async function openFileInApp(filePath) {
  const ext = filePath.split('.').pop().toLowerCase();

  // 1) Ассоциация расширения с пользовательским приложением — приоритет
  const customApp = findCustomAppForExt(ext);
  if (customApp) {
    try {
      const project = projects.find((p) => p.id === selectedProjectId);
      const result = await window.api.customAppsOpenFile(
        customApp.id,
        filePath,
        project ? project.path : null
      );
      if (!result.success) {
        alert(`Ошибка открытия файла в ${customApp.name}: ${result.error}`);
      } else if (result.warning) {
        alert(`${customApp.name}: файл открывается, но скрипт интеграции сообщил об ошибке:\n${result.warning}`);
      }
    } catch (error) {
      console.error('Ошибка открытия файла:', error);
      alert(`Ошибка открытия файла: ${error.message}`);
    }
    return;
  }

  // 2) Встроенные приложения
  let appPath = null;
  if (ext === 'blend') appPath = settings?.blenderPath;
  else if (ext === 'spp') appPath = settings?.substancePath;

  if (appPath) {
    try {
      await window.api.launchApp(appPath, filePath);
    } catch (error) {
      console.error('Ошибка открытия файла:', error);
    }
  } else {
    window.api.openFolder(filePath);
  }
}

// ===== DRAG & DROP ДЛЯ ФАЙЛОВОГО МЕНЕДЖЕРА =====

// Состояние перетаскивания
let draggedFiles = [];
let dragTargetFolder = null;

// Настройка Drag & Drop для контейнера
function setupDragAndDrop(container) {
  if (!container) return;
  if (container._dragSetup) return;
  container._dragSetup = true;
  
  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    container.classList.add('drag-over');
  });
  
  container.addEventListener('dragleave', (e) => {
    e.preventDefault();
    container.classList.remove('drag-over');
  });
  
  container.addEventListener('drop', async (e) => {
    e.preventDefault();
    container.classList.remove('drag-over');
    
    const files = e.dataTransfer.files;
    if (files.length === 0) {
      console.log('Нет файлов для копирования');
      return;
    }
    
    draggedFiles = files;
    const targetPath = dragTargetFolder || currentPath;
    
    if (!targetPath) {
      alert('Сначала выберите папку для копирования');
      return;
    }
    
    await copyFilesToFolder(files, targetPath);
    dragTargetFolder = null;
    draggedFiles = [];
  });
}

// Настройка Drag & Drop для элементов дерева
function setupTreeItemDragDrop(itemElement, itemPath) {
  if (!itemElement) return;
  if (itemElement._dragSetup) return;
  itemElement._dragSetup = true;
  
  const isDirectory = itemElement.dataset.isDirectory === 'true';
  if (!isDirectory) return;
  
  itemElement.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    itemElement.classList.add('drag-over');
    dragTargetFolder = itemPath;
  });
  
  itemElement.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    itemElement.classList.remove('drag-over');
    dragTargetFolder = null;
  });
  
  itemElement.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    itemElement.classList.remove('drag-over');
    
    const files = e.dataTransfer.files;
    if (files.length === 0) return;
    
    const targetPath = itemPath;
    if (!targetPath) return;
    
    await copyFilesToFolder(files, targetPath);
    dragTargetFolder = null;
  });
}

// Копирование файлов в папку
async function copyFilesToFolder(files, targetPath) {
  if (!targetPath) {
    alert('Папка не выбрана');
    return;
  }

  console.log(`📁 Копирование в: ${targetPath}`);
  console.log(`📄 Файлов: ${files.length}`);

  let copiedCount = 0;
  let errorCount = 0;

  for (const file of files) {
    try {
      const destPath = `${targetPath}/${file.name}`;

      // Проверяем, существует ли уже файл, и подбираем свободное имя
      const exists = await window.api.fileExists(destPath);
      let finalPath = destPath;
      if (exists.exists) {
        const ext = file.name.includes('.') ? '.' + file.name.split('.').pop() : '';
        const base = file.name.replace(ext, '');
        let counter = 1;
        let newPath = `${targetPath}/${base}_${counter}${ext}`;
        while (await window.api.fileExists(newPath)) {
          counter++;
          newPath = `${targetPath}/${base}_${counter}${ext}`;
        }
        finalPath = newPath;
      }

      // ОПТИМИЗАЦИЯ: если файл перетащен из проводника ОС — у него есть
      // реальный путь на диске. Копируем средствами main-процесса (fs.copy):
      // потоково и без чтения всего файла в память. Раньше multi-гигабайтный
      // .blend целиком проходил через FileReader в renderer-процессе —
      // это было медленно и могло уронить вкладку.
      // Для виртуальных файлов (пути нет) — прежний путь через FileReader.
      let result = null;
      let srcPath = null;
      try {
        const pathResult = window.api.getFilePath ? window.api.getFilePath(file) : null;
        if (pathResult && pathResult.success && pathResult.path) {
          srcPath = pathResult.path;
        }
      } catch {
        // Пути нет — копируем через содержимое
      }

      if (srcPath) {
        result = await window.api.copyFile(srcPath, finalPath);
      } else {
        // Получаем содержимое файла через FileReader
        const content = await readFileAsBuffer(file);
        result = await window.api.saveFileContent(finalPath, content);
      }

      if (result.success) {
        copiedCount++;
        console.log(`✅ Скопирован: ${file.name} → ${finalPath}`);
      } else {
        errorCount++;
        console.error(`❌ Ошибка сохранения ${file.name}:`, result.error);
      }
    } catch (error) {
      errorCount++;
      console.error(`❌ Ошибка обработки ${file.name}:`, error);
    }
  }

  if (copiedCount > 0) {
    //alert(`✅ Скопировано файлов: ${copiedCount}${errorCount > 0 ? `, ошибок: ${errorCount}` : ''}`);
    showToast(`✅ Скопировано файлов: ${copiedCount}${errorCount > 0 ? `, ошибок: ${errorCount}` : ''}`);
    await loadDirectory(currentPath, false);
  } else if (errorCount > 0) {
    alert(`❌ Ошибка копирования: ${errorCount} файлов`);
  } else {
    alert('ℹ️ Нет файлов для копирования');
  }
}

// Чтение файла как ArrayBuffer
function readFileAsBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      resolve(e.target.result);
    };
    reader.onerror = (e) => {
      reject(e.target.error);
    };
    reader.readAsArrayBuffer(file);
  });
}

// Обновление элементов дерева с поддержкой Drag & Drop
function setupDragDropForTreeItems() {
  document.querySelectorAll('.tree-item').forEach((el) => {
    const path = el.dataset.path;
    const isDirectory = el.dataset.isDirectory === 'true';
    if (path && isDirectory && !el._dragSetup) {
      setupTreeItemDragDrop(el, path);
    }
  });
}

// ===== БУФЕР ОБМЕНА ФАЙЛОВ (Копировать / Вырезать / Вставить) =====
// Работает как в проводнике Windows:
//   «Копировать» запоминает объекты (режим copy), «Вырезать» — режим cut
//   (объекты приглушаются), «Вставить» копирует/перемещает их в целевую папку.
// Буфер общий для файлового менеджера и File overview.

// SVG-иконки контекстных меню (стиль Windows 11 / Fluent, line-иконки)
const MENU_ICONS = {
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
  cut: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><line x1="20" y1="4" x2="8.12" y2="15.88"></line><line x1="14.47" y1="14.48" x2="20" y2="20"></line><line x1="8.12" y1="8.12" x2="12" y2="12"></line></svg>',
  paste: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>',
  folderPlus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><line x1="12" y1="11" x2="12" y2="17"></line><line x1="9" y1="14" x2="15" y2="14"></line></svg>',
  pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>',
};

let fileClipboard = [];        // [{ path, name, isDirectory }]
let fileClipboardMode = null;  // 'copy' | 'cut' | null

/** Все выделенные элементы дерева (в порядке DOM). */
function getSelectedTreeEntries() {
  return Array.from(document.querySelectorAll('.tree-item[data-selected="true"]'))
    .map((el) => ({
      path: el.dataset.path,
      name: el.dataset.name || '',
      isDirectory: el.dataset.isDirectory === 'true',
      element: el,
    }))
    .filter((t) => t.path);
}

/** Список объектов для операции (Копировать/Вырезать/Удалить/Путь).
 *  Правый клик по объекту ИЗ выделения — операция применяется ко всем
 *  выделенным (как в проводнике); по невыделенному — только к нему. */
function collectOpEntries(target) {
  if (!target || !target.path) return [];
  if (target.element && target.element.dataset.selected === 'true') {
    const entries = getSelectedTreeEntries();
    if (entries.length > 1) return entries;
  }
  return [{
    path: target.path,
    name: target.name,
    isDirectory: target.isDirectory,
    element: target.element || null,
  }];
}

/** Запоминает объекты в буфере обмена (mode: 'copy' | 'cut'). */
async function copyEntriesToClipboard(entries, mode) {
  if (!entries || entries.length === 0) return;
  fileClipboard = entries.map(({ path, name, isDirectory }) => ({ path, name, isDirectory }));
  fileClipboardMode = mode;
  updateCutMarks();
  showToast(
    mode === 'cut'
      ? (entries.length === 1 ? `Вырезано: ${entries[0].name}` : `Вырезано объектов: ${entries.length}`)
      : (entries.length === 1 ? `Скопировано: ${entries[0].name}` : `Скопировано объектов: ${entries.length}`)
  );
}

/** Приглушает «вырезанные» объекты (как в проводнике) и снимает старые метки. */
function updateCutMarks() {
  document.querySelectorAll('.tree-item[data-cut="true"], .file-card[data-cut="true"]')
    .forEach((el) => {
      el.style.opacity = '';
      el.removeAttribute('data-cut');
    });
  if (fileClipboardMode !== 'cut' || fileClipboard.length === 0) return;
  const allTree = Array.from(document.querySelectorAll('.tree-item'));
  const allCards = Array.from(document.querySelectorAll('.file-card'));
  for (const entry of fileClipboard) {
    const el = allTree.find((n) => n.dataset.path === entry.path) ||
      allCards.find((n) => n.dataset.filePath === entry.path);
    if (el) {
      el.dataset.cut = 'true';
      el.style.opacity = '0.45';
    }
  }
}

/** Вставка буфера обмена в destDir. Возвращает true, если были изменения. */
async function pasteClipboardInto(destDir) {
  if (!destDir) {
    alert('Папка назначения не выбрана');
    return false;
  }
  if (!fileClipboard.length || !fileClipboardMode) {
    showToast('Буфер обмена пуст');
    return false;
  }

  const isCut = fileClipboardMode === 'cut';
  let done = 0;
  let skipped = 0;
  const errors = [];

  for (const entry of fileClipboard) {
    try {
      // Объект могли удалить/переместить после «Копировать» — проверяем
      const exists = await window.api.fileExists(entry.path);
      if (!exists || !exists.exists) {
        skipped++;
        continue;
      }
      // Папку нельзя вложить в саму себя или в свою подпапку
      if (entry.isDirectory && isSubPath(destDir, entry.path)) {
        errors.push(`${entry.name}: нельзя вложить папку в саму себя`);
        continue;
      }
      const result = isCut
        ? await window.api.moveInto(entry.path, destDir)
        : await window.api.copyInto(entry.path, destDir);
      if (result.success) {
        if (result.skipped) skipped++;
        else done++;
      } else {
        errors.push(`${entry.name}: ${result.error}`);
      }
    } catch (err) {
      errors.push(`${entry.name}: ${err.message || err}`);
    }
  }

  // Вставка опустошает буфер в режиме «Вырезать» (как в проводнике)
  if (isCut) {
    fileClipboard = [];
    fileClipboardMode = null;
  }
  updateCutMarks();

  if (done > 0) {
    showToast(
      isCut
        ? (done === 1 ? 'Перемещено: 1 объект' : `Перемещено объектов: ${done}`)
        : (done === 1 ? 'Вставлено: 1 объект' : `Вставлено объектов: ${done}`)
    );
  } else if (skipped > 0 && errors.length === 0) {
    showToast('Объекты уже находятся в этой папке');
  }
  if (errors.length > 0) {
    alert('Не удалось вставить:\n' + errors.join('\n'));
  }

  // Живое обновление File overview и текущей папки менеджера
  try { await refreshCurrentProjectFiles(); } catch { /* уже обновится по fs-событию */ }
  return done > 0;
}

/** Включает/выключает кнопку-иконку в контекстном меню. */
function setMenuBtnEnabled(id, enabled) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.classList.toggle('disabled', !enabled);
}

// ===== КОНТЕКСТНОЕ МЕНЮ ФАЙЛОВОГО МЕНЕДЖЕРА =====
// Строка иконок (как в Windows 11): Вырезать / Копировать / Вставить.
// Пункты:
//   - Создать папку (всегда, если есть currentPath)
//   - Переименовать, Скопировать путь (для конкретного файла/папки)
//   - Удалить (для ВСЕХ выделенных объектов, красный)
const fileContextMenu = document.createElement('div');
fileContextMenu.className = 'context-menu';
fileContextMenu.id = 'fileContextMenu';
fileContextMenu.innerHTML = `
  <div class="context-menu-icon-row">
    <div class="context-menu-icon-btn" id="fileMenuCut" title="Вырезать">${MENU_ICONS.cut}</div>
    <div class="context-menu-icon-btn" id="fileMenuCopy" title="Копировать">${MENU_ICONS.copy}</div>
    <div class="context-menu-icon-btn" id="fileMenuPaste" title="Вставить">${MENU_ICONS.paste}</div>
  </div>
  <div class="context-menu-divider"></div>
  <div class="context-menu-item" id="fileMenuCreateFolder">${MENU_ICONS.folderPlus}<span>Создать папку</span></div>
  <div class="context-menu-divider" id="fileMenuDivider"></div>
  <div class="context-menu-item" id="fileMenuRename">${MENU_ICONS.pencil}<span>Переименовать</span></div>
  <div class="context-menu-item" id="fileMenuCopyPath">${MENU_ICONS.link}<span>Скопировать путь</span></div>
  <div class="context-menu-divider" id="fileMenuDivider2"></div>
  <div class="context-menu-item danger" id="fileMenuDelete">${MENU_ICONS.trash}<span>Удалить</span></div>
`;
document.body.appendChild(fileContextMenu);

let fileContextMenuTarget = null; // { path, name, isDirectory, element } или null (клик по пустому месту)

function showFileContextMenu(event, target) {
  event.preventDefault();
  event.stopPropagation();

  fileContextMenuTarget = target;

  // Скрываем/показываем пункты в зависимости от того, есть ли конкретный файл
  const hasTarget = !!(target && target.path);
  document.getElementById('fileMenuRename').style.display = hasTarget ? 'flex' : 'none';
  document.getElementById('fileMenuCopyPath').style.display = hasTarget ? 'flex' : 'none';
  document.getElementById('fileMenuDelete').style.display = hasTarget ? 'flex' : 'none';
  // Разделитель между «Создать папку» и «Переименовать» — только с файлом
  document.getElementById('fileMenuDivider').style.display =
    hasTarget ? 'block' : 'none';
  // Разделитель перед «Удалить» — тоже только с файлом (иначе висячая линия)
  document.getElementById('fileMenuDivider2').style.display =
    hasTarget ? 'block' : 'none';

  // Кнопки-иконки: копировать/вырезать можно только конкретный объект,
  // вставить — только при непустом буфере и открытой папке
  setMenuBtnEnabled('fileMenuCopy', hasTarget);
  setMenuBtnEnabled('fileMenuCut', hasTarget);
  setMenuBtnEnabled('fileMenuPaste', !!currentPath && fileClipboard.length > 0);

  // Позиционируем меню
  let x = event.clientX;
  let y = event.clientY;
  const menuWidth = 230;
  const menuHeight = 300;
  if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 10;
  if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 10;

  fileContextMenu.style.left = x + 'px';
  fileContextMenu.style.top = y + 'px';
  fileContextMenu.style.display = 'block';
}

function hideFileContextMenu() {
  fileContextMenu.style.display = 'none';
  fileContextMenuTarget = null;
}

// Закрытие меню при клике вне него
document.addEventListener('click', (e) => {
  if (!fileContextMenu.contains(e.target)) {
    hideFileContextMenu();
  }
});
document.addEventListener('contextmenu', (e) => {
  // Если правый клик не по tree-item и не по файловому менеджеру — закрываем
  if (!e.target.closest('.tree-item') && !e.target.closest('#fileManagerContainer')) {
    hideFileContextMenu();
  }
});

// Правый клик на элементе дерева — показываем меню для этого файла/папки.
// Если объект не был выделен — выделяем только его (как в проводнике);
// если был — сохраняем всё выделение (операции применятся ко всем выбранным).
fileManagerContainer.addEventListener('contextmenu', (e) => {
  const treeItem = e.target.closest('.tree-item');
  if (treeItem) {
    if (treeItem.dataset.selected !== 'true') {
      clearTreeSelection();
      setTreeItemSelected(treeItem, true);
      lastSelectedTreeItem = treeItem;
    }
    const target = {
      path: treeItem.dataset.path,
      name: treeItem.dataset.name || '',
      isDirectory: treeItem.dataset.isDirectory === 'true',
      element: treeItem,
    };
    showFileContextMenu(e, target);
  } else {
    // Клик по пустой области — только «Создать папку» и «Вставить»
    if (currentPath) {
      showFileContextMenu(e, null);
    }
  }
});

// --- Иконки: Вырезать / Копировать / Вставить ---
document.getElementById('fileMenuCopy').addEventListener('click', async () => {
  const target = fileContextMenuTarget;
  hideFileContextMenu();
  if (!target || !target.path) return;
  await copyEntriesToClipboard(collectOpEntries(target), 'copy');
});

document.getElementById('fileMenuCut').addEventListener('click', async () => {
  const target = fileContextMenuTarget;
  hideFileContextMenu();
  if (!target || !target.path) return;
  await copyEntriesToClipboard(collectOpEntries(target), 'cut');
});

document.getElementById('fileMenuPaste').addEventListener('click', async () => {
  const target = fileContextMenuTarget;
  hideFileContextMenu();
  // Вставляем в папку, на которую кликнули правой кнопкой, иначе в текущую
  const destDir = (target && target.isDirectory && target.path) ? target.path : currentPath;
  await pasteClipboardInto(destDir);
});

// ===== ОБРАБОТЧИКИ ПУНКТОВ МЕНЮ =====

// --- Создать папку ---
document.getElementById('fileMenuCreateFolder').addEventListener('click', async () => {
  hideFileContextMenu();

  // Если кликнули правой кнопкой по папке — создаём внутри неё.
  // Если по пустой области — внутри currentPath.
  // Если по файлу — внутри родительской папки файла.
  let parentPath = currentPath;
  if (fileContextMenuTarget && fileContextMenuTarget.isDirectory) {
    parentPath = fileContextMenuTarget.path;
  } else if (fileContextMenuTarget && !fileContextMenuTarget.isDirectory) {
    // Получаем родительскую папку файла без использования node `path`
    // (он недоступен в renderer-процессе). Поддерживаем оба слеша.
    const fp = fileContextMenuTarget.path;
    const lastSep = Math.max(fp.lastIndexOf('/'), fp.lastIndexOf('\\'));
    parentPath = lastSep > 0 ? fp.substring(0, lastSep) : fp;
  }
  if (!parentPath) {
    alert('Не выбрана папка для создания');
    return;
  }

  const folderName = await openRenameModal('Новая папка', {
    title: '📁 Создать папку',
    confirmLabel: 'Создать',
  });
  if (!folderName) return;
  if (!folderName.trim()) {
    alert('Имя папки не может быть пустым');
    return;
  }

  try {
    const result = await window.api.createFolder(parentPath, folderName.trim());
    if (result.success) {
      // Если создали в текущей открытой папке — перезагружаем
      if (parentPath === currentPath) {
        await loadDirectory(currentPath, false);
      } else if (fileContextMenuTarget && fileContextMenuTarget.isDirectory) {
        // Если создали внутри поддиректории и она раскрыта — перезагружаем текущую
        await loadDirectory(currentPath, false);
      }
    } else {
      alert(`Ошибка создания папки: ${result.error}`);
    }
  } catch (error) {
    alert(`Ошибка: ${error.message}`);
  }
});

// --- Переименовать ---
document.getElementById('fileMenuRename').addEventListener('click', async () => {
  const target = fileContextMenuTarget;
  hideFileContextMenu();
  if (!target || !target.path) return;

  const newName = await openRenameModal(target.name, {
    title: target.isDirectory ? '✏️ Переименовать папку' : '✏️ Переименовать файл',
    confirmLabel: 'Переименовать',
  });
  if (newName === null) return;
  if (!newName.trim()) {
    alert('Имя не может быть пустым');
    return;
  }
  if (newName.trim() === target.name) return; // ничего не менялось

  try {
    const result = await window.api.renamePath(target.path, newName.trim());
    if (result.success) {
      await loadDirectory(currentPath, false);
    } else {
      alert(`Ошибка переименования: ${result.error}`);
    }
  } catch (error) {
    alert(`Ошибка: ${error.message}`);
  }
});

// --- Скопировать путь ---
// При множественном выделении копируются пути ВСЕХ выделенных объектов
// (по одному в строке).
document.getElementById('fileMenuCopyPath').addEventListener('click', async () => {
  const target = fileContextMenuTarget;
  hideFileContextMenu();
  if (!target || !target.path) return;

  const targets = collectOpEntries(target);
  const pathToCopy = targets.map((t) => t.path).join('\n');
  try {
    await navigator.clipboard.writeText(pathToCopy);
    showToast(targets.length > 1 ? `Скопировано путей: ${targets.length}` : `Скопировано: ${pathToCopy}`);
  } catch (err) {
    // Fallback на устаревший execCommand
    try {
      const textarea = document.createElement('textarea');
      textarea.value = pathToCopy;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      showToast(`Скопировано: ${pathToCopy}`);
    } catch (fallbackErr) {
      alert('Не удалось скопировать путь: ' + (fallbackErr.message || fallbackErr));
    }
  }
});

// --- Удаление выделенных объектов дерева (общая для меню и клавиши Delete) ---
async function deleteTreeEntries(entries) {
  if (!entries || entries.length === 0) return;

  // Подтверждение: для нескольких объектов показываем список имён
  let confirmText;
  if (entries.length === 1) {
    const t = entries[0];
    const typeLabel = t.isDirectory ? 'папку' : 'файл';
    confirmText =
      `Удалить ${typeLabel} "${t.name}"?\n\n` +
      (t.isDirectory
        ? 'Все файлы и подпапки будут удалены безвозвратно!'
        : 'Файл будет удалён безвозвратно!');
  } else {
    const MAX_NAMES = 10;
    const names = entries
      .slice(0, MAX_NAMES)
      .map((t) => `  • ${t.name}`)
      .join('\n');
    const more = entries.length > MAX_NAMES ? `\n  …и ещё ${entries.length - MAX_NAMES}` : '';
    confirmText =
      `Удалить выбранные объекты (${entries.length})?\n\n${names}${more}\n\n` +
      'Все выбранные файлы и папки будут удалены безвозвратно!';
  }
  if (!confirm(confirmText)) return;

  let deleted = 0;
  const errors = [];
  // Если среди выделенных есть папка и файлы внутри неё — файлы удалятся
  // вместе с папкой; не считаем их повторное удаление ошибкой.
  const deletedDirs = [];
  const isInsideDeleted = (p) => {
    const norm = String(p || '').replace(/[\\/]+$/, '').toLowerCase();
    return deletedDirs.some((d) => norm === d || norm.startsWith(d + '\\') || norm.startsWith(d + '/'));
  };

  for (const t of entries) {
    try {
      if (isInsideDeleted(t.path)) {
        deleted++; // уже удалён вместе с родительской папкой
        continue;
      }
      const result = await window.api.deletePath(t.path);
      if (result.success) {
        deleted++;
        if (t.isDirectory) {
          deletedDirs.push(String(t.path).replace(/[\\/]+$/, '').toLowerCase());
        }
      } else {
        errors.push(`${t.name}: ${result.error}`);
      }
    } catch (error) {
      errors.push(`${t.name}: ${error.message}`);
    }
  }

  // Очищаем выделение — удалённые объекты исчезнут после перерисовки
  clearTreeSelection();
  lastSelectedTreeItem = null;

  // Обновляем File overview и файловый менеджер: если удалена текущая
  // папка — refreshCurrentProjectFiles сам поднимется к существующей родительской
  try { await refreshCurrentProjectFiles(); } catch { /* fs-событие обновит */ }

  if (errors.length > 0) {
    alert(`Удалено: ${deleted}, ошибок: ${errors.length}\n${errors.join('\n')}`);
  } else if (entries.length > 1) {
    showToast(`Удалено объектов: ${deleted}`);
  }
}

// --- Удалить (меню) — удаляет ВСЕ выделенные объекты ---
document.getElementById('fileMenuDelete').addEventListener('click', async () => {
  const target = fileContextMenuTarget;
  hideFileContextMenu();
  if (!target || !target.path) return;

  await deleteTreeEntries(collectOpEntries(target));
});

// --- Клавиша Delete — удалить выделенные в файловом менеджере ---
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Delete') return;
  if (e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
  // Не мешаем вводу текста (переименование, поиск, заметки и т.д.)
  const ae = document.activeElement;
  if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;
  if (!currentPath) return;
  const entries = getSelectedTreeEntries();
  if (entries.length === 0) return;
  e.preventDefault();
  deleteTreeEntries(entries);
});

// ===== ТОСТ (всплывающее уведомление) =====
// Простое ненавязчивое уведомление, используется для "путь скопирован"
let toastTimeout = null;
function showToast(message, duration = 2000) {
  let toast = document.getElementById('appToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'appToast';
    toast.className = 'app-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('visible');
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('visible');
  }, duration);
}

  // ===== ЗАГРУЗКА ЗАДАЧ ПРОЕКТА =====
  async function loadProjectTasks(projectPath) {
    try {
      const result = await window.api.getProjectTasks(projectPath);
      if (result.success) {
        taskList.innerHTML = '';
        
        if (result.tasks.length === 0) {
          const placeholder = document.createElement('p');
          placeholder.className = 'placeholder-text';
          placeholder.textContent = 'Нет задач';
          taskList.appendChild(placeholder);
          return;
        }

        result.tasks.forEach((task) => {
          const taskItem = createTaskElement(task, projectPath);
          taskList.appendChild(taskItem);
        });
      }
    } catch (error) {
      console.error('Ошибка загрузки задач:', error);
    }
  }

  // ===== СОЗДАНИЕ ЭЛЕМЕНТА ЗАДАЧИ =====
  function createTaskElement(task, projectPath) {
    const taskItem = document.createElement('div');
    taskItem.className = 'task-item';
    if (task.type === 'mesh') {
      taskItem.classList.add('task-item-mesh');
    }
    taskItem.dataset.taskId = task.id;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.done || false;

    const label = document.createElement('span');
    label.className = 'task-label';
    label.textContent = task.text;
    if (task.done) {
      label.style.textDecoration = 'line-through';
      label.style.color = 'var(--text-dim)';
    }

    // Для задач типа 'mesh' (имена мешей из Supabase) добавляем кнопку
    // "Скопировать в буфер обмена" — копирует имя меша (task.text).
    let copyBtn = null;
    if (task.type === 'mesh') {
      copyBtn = document.createElement('button');
      copyBtn.className = 'task-copy-btn';
      copyBtn.type = 'button';
      copyBtn.textContent = '📋';
      copyBtn.title = 'Скопировать в буфер обмена';

      copyBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const text = String(task.text || '');
        try {
          // Современный Clipboard API работает в Electron с contextIsolation
          await navigator.clipboard.writeText(text);
          copyBtn.textContent = '✓';
          copyBtn.classList.add('copied');
          setTimeout(() => {
            copyBtn.textContent = '📋';
            copyBtn.classList.remove('copied');
          }, 1200);
        } catch (err) {
          // Fallback через устаревший execCommand, если clipboard API недоступен
          console.error('Ошибка копирования в буфер:', err);
          try {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            copyBtn.textContent = '✓';
            setTimeout(() => { copyBtn.textContent = '📋'; }, 1200);
          } catch (fallbackErr) {
            alert('Не удалось скопировать: ' + (fallbackErr.message || fallbackErr));
          }
        }
      });
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'task-delete-btn';
    deleteBtn.textContent = '✕';
    deleteBtn.title = 'Удалить задачу';

    taskItem.appendChild(checkbox);
    taskItem.appendChild(label);
    if (copyBtn) taskItem.appendChild(copyBtn);
    taskItem.appendChild(deleteBtn);

    checkbox.addEventListener('change', async () => {
      try {
        await window.api.toggleTask(projectPath, task.id, checkbox.checked);
        if (checkbox.checked) {
          label.style.textDecoration = 'line-through';
          label.style.color = '#6a6a8a';
        } else {
          label.style.textDecoration = 'none';
          label.style.color = '#e0e0e0';
        }
      } catch (error) {
        console.error('Ошибка обновления задачи:', error);
        checkbox.checked = !checkbox.checked;
      }
    });

    deleteBtn.addEventListener('click', async () => {
      if (confirm(`Удалить задачу "${task.text}"?`)) {
        try {
          await window.api.deleteTask(projectPath, task.id);
          taskItem.remove();
          if (taskList.children.length === 0) {
            const placeholder = document.createElement('p');
            placeholder.className = 'placeholder-text';
            placeholder.textContent = 'Нет задач';
            taskList.appendChild(placeholder);
          }
        } catch (error) {
          console.error('Ошибка удаления задачи:', error);
          alert('Ошибка удаления задачи');
        }
      }
    });

    return taskItem;
  }

  // ===== КНОПКА "ADD TASK" =====
  if (addTaskBtn) {
    addTaskBtn.addEventListener('click', () => {
      const project = projects.find((p) => p.id === selectedProjectId);
      if (!project) {
        alert('Сначала выберите проект');
        return;
      }
      
      const placeholder = taskList.querySelector('.placeholder-text');
      if (placeholder) placeholder.remove();
      
      const existingRow = taskList.querySelector('.task-create-row');
      if (existingRow) {
        existingRow.querySelector('input[type="text"]')?.focus();
        return;
      }
      
      const row = document.createElement('div');
      row.className = 'task-create-row';
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.disabled = true;
      
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'Введите название задачи...';
      input.autofocus = true;
      
      const confirmBtn = document.createElement('button');
      confirmBtn.className = 'task-confirm-btn';
      confirmBtn.textContent = 'Добавить';
      
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'task-cancel-btn';
      cancelBtn.textContent = 'Отмена';
      
      row.appendChild(checkbox);
      row.appendChild(input);
      row.appendChild(confirmBtn);
      row.appendChild(cancelBtn);
      
      taskList.insertBefore(row, taskList.firstChild);
      input.focus();
      
      async function addTask() {
        const text = input.value.trim();
        if (!text) {
          alert('Введите название задачи');
          return;
        }
        
        try {
          const result = await window.api.addTask(project.path, text);
          if (result.success) {
            row.remove();
            const taskElement = createTaskElement(result.task, project.path);
            taskList.insertBefore(taskElement, taskList.firstChild);
          } else {
            alert(`Ошибка: ${result.error}`);
          }
        } catch (error) {
          alert(`Ошибка: ${error.message}`);
        }
      }
      
      confirmBtn.addEventListener('click', addTask);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addTask();
        if (e.key === 'Escape') row.remove();
      });
      cancelBtn.addEventListener('click', () => row.remove());
      
      input.addEventListener('blur', () => {
        if (!input.value.trim()) {
          row.remove();
        }
      });
    });
  }

  // ===== РАБОТА С ФАЙЛАМИ =====
  const fileList = document.getElementById('fileList');
  let currentFiles = [];
  let selectedFile = null;

  /** Отслеживаемый файл: .blend/.spp или расширение, ассоциированное с ярлыком приложения. */
  function isWatchedFileName(name) {
    const ext = String(name || '').split('.').pop().toLowerCase();
    if (!ext) return false;
    if (ext === 'blend' || ext === 'spp') return true;
    return !!findCustomAppForExt(ext);
  }

  /** Подпись списка отслеживаемых расширений для плейсхолдера. */
  function getWatchedExtensionsText() {
    const parts = ['.blend', '.spp'];
    for (const app of customAppsCache) {
      for (const e of Array.isArray(app.exts) ? app.exts : []) {
        const dotted = '.' + e;
        if (!parts.includes(dotted)) parts.push(dotted);
      }
    }
    return parts.join(', ');
  }

  async function loadProjectFiles(projectPath) {
    try {
      const result = await window.api.getProjectFiles(projectPath);
      if (result.success) {
        currentFiles = result.files.filter(
          (f) => !f.isDirectory && isWatchedFileName(f.name)
        );
        renderFiles(currentFiles);
      } else {
        console.error('Ошибка загрузки файлов:', result.error);
        currentFiles = [];
        renderFiles([]);
      }
    } catch (error) {
      console.error('Ошибка загрузки файлов:', error);
      currentFiles = [];
      renderFiles([]);
    }
  }

  function renderFiles(files) {
    fileList.innerHTML = '';

    const filteredFiles = files.filter((f) => isWatchedFileName(f.name));

    const fileCountEl = document.getElementById('fileCount');
    if (fileCountEl) {
      fileCountEl.textContent = `${filteredFiles.length} files`;
    }

    if (!filteredFiles || filteredFiles.length === 0) {
      const placeholder = document.createElement('p');
      placeholder.className = 'placeholder-text';
      placeholder.textContent = `Нет файлов (${getWatchedExtensionsText()})`;
      fileList.appendChild(placeholder);
      return;
    }

    const sortedFiles = [...filteredFiles].sort((a, b) => {
      return a.name.localeCompare(b.name);
    });

    // Для .blend файлов параллельно проверяем наличие превью (<filepath>.jpg)
    // и рендерим карточки после получения результатов.
    Promise.all(sortedFiles.map((file) => checkBlendPreview(file))).then((filesWithPreview) => {
      filesWithPreview.forEach((item) => {
        const card = createFileCard(item.file, item.previewUrl);
        fileList.appendChild(card);
      });
      // Восстанавливаем приглушённый вид «вырезанных» файлов (буфер обмена)
      if (typeof updateCutMarks === 'function') updateCutMarks();
    });
  }

  // Проверяет наличие превью для .blend файла (<filepath>.jpg рядом с .blend).
  // Возвращает {file, previewUrl} — previewUrl null, если превью нет или это не .blend.
  async function checkBlendPreview(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'blend') {
      return { file, previewUrl: null };
    }
    const previewPath = `${file.path}.jpg`;
    try {
      const result = await window.api.fileExists(previewPath);
      if (result.exists) {
        // file:// URL для превью (CSP должен разрешать file: для img-src).
        // encodeURI не кодирует "#" и "?" — кодируем их вручную,
        // иначе путь с такими символами даст битую ссылку на картинку.
        const encoded = encodeURI(previewPath.replace(/\\/g, '/'))
          .replace(/#/g, '%23')
          .replace(/\?/g, '%3F');
        return { file, previewUrl: `file:///${encoded}` };
      }
    } catch {
      // Игнорируем — покажем иконку
    }
    return { file, previewUrl: null };
  }

  function createFileCard(file, previewUrl) {
    const card = document.createElement('div');
    card.className = 'file-card';
    card.dataset.filePath = file.path;

    const ext = file.name.split('.').pop().toLowerCase();

    const iconEl = document.createElement('div');
    iconEl.className = 'file-icon file-icon-' + ext;

    if (ext === 'blend') {
      if (previewUrl) {
        // Показываем превью вьюпорта вместо иконки
        const img = document.createElement('img');
        img.className = 'file-preview-img';
        img.src = previewUrl;
        img.alt = file.name;
        img.loading = 'lazy';
        img.addEventListener('error', () => {
          // Если превью не загрузилось — fallback на иконку Blender
          iconEl.innerHTML = '';
          const fallbackImg = document.createElement('img');
          fallbackImg.className = 'file-icon-img';
          fallbackImg.src = 'ico/blender_icon_512x512.png';
          fallbackImg.alt = 'Blender';
          iconEl.appendChild(fallbackImg);
        });
        iconEl.appendChild(img);
        card.classList.add('has-preview');
      } else {
        // Иконка Blender
        const img = document.createElement('img');
        img.className = 'file-icon-img';
        img.src = 'ico/blender_icon_512x512.png';
        img.alt = 'Blender';
        iconEl.appendChild(img);
      }
    } else if (ext === 'spp') {
      // Иконка Substance Painter
      const img = document.createElement('img');
      img.className = 'file-icon-img';
      img.src = 'ico/splogo.png';
      img.alt = 'Substance Painter';
      iconEl.appendChild(img);
    } else {
      // Файл, ассоциированный с пользовательским приложением — показываем его иконку
      const customApp = findCustomAppForExt(ext);
      if (customApp && customApp.icon) {
        const img = document.createElement('img');
        img.className = 'file-icon-img';
        img.src = customApp.icon;
        img.alt = customApp.name;
        iconEl.appendChild(img);
      } else {
        iconEl.textContent = '📄';
      }
    }
    card.appendChild(iconEl);

    const nameEl = document.createElement('div');
    nameEl.className = 'file-name';
    nameEl.textContent = file.name;
    nameEl.title = file.name;
    card.appendChild(nameEl);

    const extEl = document.createElement('div');
    extEl.className = 'file-extension';
    extEl.textContent = ext.toUpperCase();
    card.appendChild(extEl);

    card.addEventListener('click', () => {
      document.querySelectorAll('.file-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedFile = file;
    });

    // Правый клик — контекстное меню File overview
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Выделяем карточку (как по левому клику)
      document.querySelectorAll('.file-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedFile = file;
      showFileOverviewMenu(e, { path: file.path, name: file.name });
    });

    card.addEventListener('dblclick', async () => {
      const project = projects.find((p) => p.id === selectedProjectId);

      if (!project) return;

      // 1) Ассоциация расширения с пользовательским приложением — приоритет
      const customApp = findCustomAppForExt(ext);
      if (customApp) {
        try {
          const result = await window.api.customAppsOpenFile(customApp.id, file.path, project.path);
          if (!result.success) {
            alert(`Ошибка открытия: ${result.error}`);
          } else if (result.warning) {
            alert(`${customApp.name}: файл открывается, но скрипт сообщил об ошибке:\n${result.warning}`);
          }
        } catch (error) {
          alert(`Ошибка: ${error.message}`);
        }
        return;
      }

      // 2) Встроенные приложения
      let appPath = null;
      if (ext === 'blend') {
        appPath = settings.blenderPath;
      } else if (ext === 'spp') {
        appPath = settings.substancePath;
      }

      if (!appPath) {
        alert(`Путь к приложению для .${ext} не указан в настройках`);
        return;
      }

      try {
        const result = await window.api.launchApp(appPath, file.path);
        if (!result.success) {
          alert(`Ошибка открытия: ${result.error}`);
        }
      } catch (error) {
        alert(`Ошибка: ${error.message}`);
      }
      showToast(`${file.name} открывается`);
    });

    return card;
  }

  // ===== КОНТЕКСТНОЕ МЕНЮ FILE OVERVIEW =====
  // Строка иконок (как в Windows 11): Вырезать / Копировать / Вставить +
  // пункты «Переименовать», «Скопировать путь», «Удалить».
  // «Вставить» помещает файлы из буфера обмена в корень проекта.
  const fileOverviewMenu = document.createElement('div');
  fileOverviewMenu.className = 'context-menu';
  fileOverviewMenu.id = 'fileOverviewContextMenu';
  fileOverviewMenu.innerHTML = `
    <div class="context-menu-icon-row">
      <div class="context-menu-icon-btn" id="foMenuCut" title="Вырезать">${MENU_ICONS.cut}</div>
      <div class="context-menu-icon-btn" id="foMenuCopy" title="Копировать">${MENU_ICONS.copy}</div>
      <div class="context-menu-icon-btn" id="foMenuPaste" title="Вставить">${MENU_ICONS.paste}</div>
    </div>
    <div class="context-menu-divider"></div>
    <div class="context-menu-item" id="foMenuRename">${MENU_ICONS.pencil}<span>Переименовать</span></div>
    <div class="context-menu-item" id="foMenuCopyPath">${MENU_ICONS.link}<span>Скопировать путь</span></div>
    <div class="context-menu-divider" id="foMenuDivider2"></div>
    <div class="context-menu-item danger" id="foMenuDelete">${MENU_ICONS.trash}<span>Удалить</span></div>
  `;
  document.body.appendChild(fileOverviewMenu);

  let foMenuTarget = null; // { path, name } или null (клик по пустому месту)

  function showFileOverviewMenu(event, target) {
    event.preventDefault();
    event.stopPropagation();
    foMenuTarget = target;

    const hasTarget = !!(target && target.path);
    document.getElementById('foMenuRename').style.display = hasTarget ? 'flex' : 'none';
    document.getElementById('foMenuCopyPath').style.display = hasTarget ? 'flex' : 'none';
    document.getElementById('foMenuDelete').style.display = hasTarget ? 'flex' : 'none';
    document.getElementById('foMenuDivider2').style.display = hasTarget ? 'block' : 'none';
    setMenuBtnEnabled('foMenuCopy', hasTarget);
    setMenuBtnEnabled('foMenuCut', hasTarget);
    setMenuBtnEnabled('foMenuPaste',
      !!(currentProject && currentProject.path) && fileClipboard.length > 0);

    let x = event.clientX;
    let y = event.clientY;
    const menuWidth = 230;
    const menuHeight = 280;
    if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 10;
    if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 10;

    fileOverviewMenu.style.left = x + 'px';
    fileOverviewMenu.style.top = y + 'px';
    fileOverviewMenu.style.display = 'block';
  }

  function hideFileOverviewMenu() {
    fileOverviewMenu.style.display = 'none';
    foMenuTarget = null;
  }

  // Закрытие меню при клике вне него / правом клике в другом месте
  document.addEventListener('click', (e) => {
    if (!fileOverviewMenu.contains(e.target)) hideFileOverviewMenu();
  });
  document.addEventListener('contextmenu', (e) => {
    if (!e.target.closest('.file-card') && !e.target.closest('#fileList')) {
      hideFileOverviewMenu();
    }
  });

  // Правый клик по пустому месту File overview — только «Вставить»
  fileList.addEventListener('contextmenu', (e) => {
    if (!e.target.closest('.file-card')) {
      e.preventDefault();
      e.stopPropagation();
      if (currentProject && currentProject.path) {
        showFileOverviewMenu(e, null);
      }
    }
  });

  // --- Иконки File overview: Вырезать / Копировать / Вставить ---
  document.getElementById('foMenuCopy').addEventListener('click', async () => {
    const target = foMenuTarget;
    hideFileOverviewMenu();
    if (!target || !target.path) return;
    await copyEntriesToClipboard(
      [{ path: target.path, name: target.name, isDirectory: false }],
      'copy'
    );
  });

  document.getElementById('foMenuCut').addEventListener('click', async () => {
    const target = foMenuTarget;
    hideFileOverviewMenu();
    if (!target || !target.path) return;
    await copyEntriesToClipboard(
      [{ path: target.path, name: target.name, isDirectory: false }],
      'cut'
    );
  });

  document.getElementById('foMenuPaste').addEventListener('click', async () => {
    hideFileOverviewMenu();
    // Вставляем в корень проекта
    await pasteClipboardInto(currentProject ? currentProject.path : null);
  });

  // --- Переименовать ---
  document.getElementById('foMenuRename').addEventListener('click', async () => {
    const target = foMenuTarget;
    hideFileOverviewMenu();
    if (!target || !target.path) return;

    const newName = await openRenameModal(target.name, {
      title: '✏️ Переименовать файл',
      confirmLabel: 'Переименовать',
    });
    if (newName === null) return;
    if (!newName.trim()) {
      alert('Имя не может быть пустым');
      return;
    }
    if (newName.trim() === target.name) return; // ничего не менялось

    try {
      const result = await window.api.renamePath(target.path, newName.trim());
      if (result.success) {
        await refreshCurrentProjectFiles();
      } else {
        alert(`Ошибка переименования: ${result.error}`);
      }
    } catch (error) {
      alert(`Ошибка: ${error.message}`);
    }
  });

  // --- Скопировать путь ---
  document.getElementById('foMenuCopyPath').addEventListener('click', async () => {
    const target = foMenuTarget;
    hideFileOverviewMenu();
    if (!target || !target.path) return;

    try {
      await navigator.clipboard.writeText(target.path);
      showToast(`Скопировано: ${target.path}`);
    } catch (err) {
      // Fallback на устаревший execCommand
      try {
        const textarea = document.createElement('textarea');
        textarea.value = target.path;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast(`Скопировано: ${target.path}`);
      } catch (fallbackErr) {
        alert('Не удалось скопировать путь: ' + (fallbackErr.message || fallbackErr));
      }
    }
  });

  // --- Удалить ---
  document.getElementById('foMenuDelete').addEventListener('click', async () => {
    const target = foMenuTarget;
    hideFileOverviewMenu();
    if (!target || !target.path) return;

    const confirmDelete = confirm(
      `Удалить файл "${target.name}"?\n\nФайл будет удалён безвозвратно!`
    );
    if (!confirmDelete) return;

    try {
      const result = await window.api.deletePath(target.path);
      if (result.success) {
        document.querySelectorAll('.file-card').forEach((c) => c.classList.remove('selected'));
        selectedFile = null;
        await refreshCurrentProjectFiles();
      } else {
        alert(`Ошибка удаления: ${result.error}`);
      }
    } catch (error) {
      alert(`Ошибка: ${error.message}`);
    }
  });

  let sortOrder = 'name';
  document.getElementById('sortFilesBtn')?.addEventListener('click', () => {
    sortOrder = sortOrder === 'name' ? 'date' : 'name';
    const sorted = [...currentFiles].sort((a, b) => {
      if (sortOrder === 'name') {
        return a.name.localeCompare(b.name);
      } else {
        return new Date(b.modified) - new Date(a.modified);
      }
    });
    renderFiles(sorted);
    document.getElementById('sortFilesBtn').textContent = sortOrder === 'name' ? 'Sort: Name' : 'Sort: Date';
  });

  // ===== ЗАМЕТКИ =====
  // Полноценный текстовый редактор на contentEditable с расширенным тулбаром,
  // авто-детекцией URL, кликабельными ссылками и санитизацией HTML при загрузке.
  if (notesContainer) {
    let saveTimeout = null;
    // Флаг программного обновления контента — чтобы не запускать авто-сохранение
    // и авто-детекцию URL во время самой загрузки заметок.
    let isProgrammaticUpdate = false;
    // Сохранённая позицию курсора перед открытием модалок (ссылка и т.д.)
    let savedRange = null;

    // ----- Санитизация HTML -----
    // Whitelist разрешённых тегов и атрибутов. Всё остальное удаляется.
    const ALLOWED_TAGS = new Set([
      'P', 'BR', 'HR', 'SPAN', 'DIV',
      'STRONG', 'B', 'EM', 'I', 'U', 'S', 'STRIKE',
      'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
      'UL', 'OL', 'LI',
      'BLOCKQUOTE', 'CODE', 'PRE',
      'A',
    ]);
    const ALLOWED_ATTRS = {
      A: ['href', 'title', 'target'],
      SPAN: ['class'],
    };

    function sanitizeHtml(html) {
      const tpl = document.createElement('template');
      tpl.innerHTML = html;
      walkAndClean(tpl.content);
      return tpl.innerHTML;
    }

    function walkAndClean(node) {
      const children = Array.from(node.childNodes);
      for (const child of children) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          const tag = child.tagName;
          if (!ALLOWED_TAGS.has(tag)) {
            // Разворачиваем неизвестный тег в его содержимое
            const parent = child.parentNode;
            while (child.firstChild) {
              parent.insertBefore(child.firstChild, child);
            }
            parent.removeChild(child);
            continue;
          }
          // Чистим атрибуты
          const allowed = ALLOWED_ATTRS[tag] || [];
          const attrs = Array.from(child.attributes);
          for (const attr of attrs) {
            const name = attr.name.toLowerCase();
            const value = attr.value;
            // Удаляем on*-обработчики
            if (name.startsWith('on')) {
              child.removeAttribute(attr.name);
              continue;
            }
            // Блокируем javascript: в href/src
            if ((name === 'href' || name === 'src') &&
                /^\s*javascript:/i.test(value)) {
              child.removeAttribute(attr.name);
              continue;
            }
            if (!allowed.includes(name)) {
              child.removeAttribute(attr.name);
            }
          }
          // Для ссылок — гарантируем target и rel
          if (tag === 'A') {
            if (!child.getAttribute('target')) {
              child.setAttribute('target', '_blank');
            }
            child.setAttribute('rel', 'noopener noreferrer');
          }
          walkAndClean(child);
        } else if (child.nodeType === Node.TEXT_NODE) {
          // Текстовые узлы оставляем как есть
        } else if (child.nodeType === Node.COMMENT_NODE) {
          // Комментарии удаляем
          node.removeChild(child);
        }
      }
    }

    // ----- Сохранение / загрузка -----
    async function saveNotes() {
      const project = projects.find((p) => p.id === selectedProjectId);
      if (!project) return;

      // Если контейнер пуст или содержит только пустой <p>/<br> — сохраняем пустоту
      const html = notesContainer.innerHTML;
      const isEmpty = !html ||
                      html === '<br>' ||
                      html === '<p><br></p>' ||
                      (notesContainer.textContent.trim() === '' &&
                       !notesContainer.querySelector('img, hr, ul, ol'));
      try {
        await window.api.saveProjectNotes(project.path, isEmpty ? '' : html);
      } catch (error) {
        console.error('Ошибка сохранения заметок:', error);
      }
    }

    async function loadNotes(projectPath) {
      try {
        const result = await window.api.getProjectNotes(projectPath);
        isProgrammaticUpdate = true;
        if (result.success && result.notes && result.notes.trim()) {
          // Санитизируем загруженный HTML — на случай, если файл подменяли вручную
          notesContainer.innerHTML = sanitizeHtml(result.notes);
          // Авто-детекция URL во всём загруженном тексте
          autolinkAll();
        } else {
          notesContainer.innerHTML = '';
        }
        isProgrammaticUpdate = false;
        updateToolbarState();
      } catch (error) {
        console.error('Ошибка загрузки заметок:', error);
        isProgrammaticUpdate = true;
        notesContainer.innerHTML = '';
        isProgrammaticUpdate = false;
      }
    }

    // ----- Авто-сохранение -----
    function scheduleSave(delay = 1500) {
      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = setTimeout(saveNotes, delay);
    }

    notesContainer.addEventListener('input', () => {
      if (isProgrammaticUpdate) return;
      scheduleSave(1500);
      // Авто-детекция URL в текущем текстовом узле
      autolinkCurrentText();
      updateToolbarState();
    });

    notesContainer.addEventListener('blur', () => {
      if (saveTimeout) {
        clearTimeout(saveTimeout);
        saveTimeout = null;
      }
      saveNotes();
    });

    // Сохранение при закрытии окна — best effort, IPC может не успеть,
    // но у нас есть авто-сохранение по input, так что потеря минимальна.
    window.addEventListener('beforeunload', () => {
      saveNotes();
    });

    // ----- Кликабельные ссылки -----
    // Ctrl/Cmd+клик или просто клик (если клик строго по <a>) — открываем во внешнем браузере.
    notesContainer.addEventListener('click', (e) => {
      const a = e.target.closest('a');
      if (!a) return;
      // В режиме редактирования ссылка открывается только с Ctrl/Cmd
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const href = a.getAttribute('href');
        if (href) {
          window.api.openExternalUrl(href);
        }
      } else {
        // Без модификатора — фокус для редактирования, но не переход
        e.preventDefault();
        // Двойной клик без модификатора — открыть ссылку (для удобства)
      }
    });

    notesContainer.addEventListener('dblclick', (e) => {
      const a = e.target.closest('a');
      if (!a) return;
      e.preventDefault();
      const href = a.getAttribute('href');
      if (href) {
        window.api.openExternalUrl(href);
      }
    });

    // ----- Авто-детекция URL в текущем текстовом узле -----
    // Ищем URL вида http(s)://... в тексте, где стоит курсор, и оборачиваем в <a>.
    const URL_RE = /(https?:\/\/[^\s<>"']+)/gi;

    function autolinkCurrentText() {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const node = sel.anchorNode;
      if (!node || node.nodeType !== Node.TEXT_NODE) return;
      const parent = node.parentNode;
      if (!parent || parent.tagName === 'A') return; // уже внутри ссылки

      const text = node.nodeValue;
      URL_RE.lastIndex = 0;
      const match = URL_RE.exec(text);
      if (!match) return;

      // Сохраняем позицию курсора
      const caretOffset = sel.anchorOffset;

      // Разбиваем текстовый узел на 3 части: до / ссылка / после
      const before = text.slice(0, match.index);
      const url = match[0];
      const after = text.slice(match.index + url.length);

      const beforeNode = document.createTextNode(before);
      const linkNode = document.createElement('a');
      linkNode.href = url;
      linkNode.target = '_blank';
      linkNode.rel = 'noopener noreferrer';
      linkNode.textContent = url;
      const afterNode = document.createTextNode(after);

      parent.insertBefore(beforeNode, node);
      parent.insertBefore(linkNode, node);
      parent.insertBefore(afterNode, node);
      parent.removeChild(node);

      // Восстанавливаем курсор в afterNode на той же позиции
      const newOffset = Math.max(0, caretOffset - before.length - url.length);
      const range = document.createRange();
      range.setStart(afterNode, Math.min(newOffset, afterNode.length));
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }

    // ----- Вставка из буфера: преобразуем в plain text, потом sanitizer вычистит лишнее -----
    notesContainer.addEventListener('paste', (e) => {
      // Если в буфере есть HTML — позволяем браузеру вставить, но потом санитизируем
      // через setTimeout, чтобы вставка уже была в DOM.
      setTimeout(() => {
        if (isProgrammaticUpdate) return;
        const html = notesContainer.innerHTML;
        const cleaned = sanitizeHtml(html);
        if (cleaned !== html) {
          isProgrammaticUpdate = true;
          notesContainer.innerHTML = cleaned;
          isProgrammaticUpdate = false;
        }
        // Авто-детекция URL в вставленном тексте
        autolinkAll();
        scheduleSave(1500);
      }, 0);
    });

    // Авто-детекция URL во всём документе (для paste и первичной загрузки)
    function autolinkAll() {
      const walker = document.createTreeWalker(
        notesContainer,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode(node) {
            // ВАЖНО: URL_RE — глобальный regexp, test() двигает lastIndex.
            // Без сброса после каждого теста последующие вызовы начинали
            // с середины строки и пропускали URL. Сбрасываем всегда.
            const hasUrl = !!(node.nodeValue && URL_RE.test(node.nodeValue));
            URL_RE.lastIndex = 0;
            if (!hasUrl) {
              return NodeFilter.FILTER_REJECT;
            }
            // Пропускаем текст внутри ссылок и кода
            const parent = node.parentNode;
            if (parent && (parent.tagName === 'A' || parent.tagName === 'CODE' || parent.tagName === 'PRE')) {
              return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
          },
        }
      );

      const nodesToProcess = [];
      while (walker.nextNode()) {
        nodesToProcess.push(walker.currentNode);
      }

      for (const node of nodesToProcess) {
        const text = node.nodeValue;
        const parent = node.parentNode;
        if (!parent) continue;

        const frag = document.createDocumentFragment();
        let lastIdx = 0;
        URL_RE.lastIndex = 0;
        let m;
        while ((m = URL_RE.exec(text)) !== null) {
          if (m.index > lastIdx) {
            frag.appendChild(document.createTextNode(text.slice(lastIdx, m.index)));
          }
          const link = document.createElement('a');
          link.href = m[0];
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = m[0];
          frag.appendChild(link);
          lastIdx = m.index + m[0].length;
        }
        if (lastIdx < text.length) {
          frag.appendChild(document.createTextNode(text.slice(lastIdx)));
        }
        if (frag.childNodes.length > 0) {
          parent.insertBefore(frag, node);
          parent.removeChild(node);
        }
      }
    }

    // ----- Сохранение/восстановление выделения -----
    function saveSelection() {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        savedRange = sel.getRangeAt(0).cloneRange();
      }
    }

    function restoreSelection() {
      if (!savedRange) return false;
      const sel = window.getSelection();
      if (!sel) return false;
      sel.removeAllRanges();
      sel.addRange(savedRange);
      return true;
    }

    // ----- Действия тулбара -----
    function execCommand(command, value = null) {
      notesContainer.focus();
      document.execCommand(command, false, value);
      updateToolbarState();
      scheduleSave(1500);
    }

    function formatBlock(tag) {
      // document.execCommand('formatBlock', false, tag) — требует угловых скобок в Chrome
      notesContainer.focus();
      document.execCommand('formatBlock', false, `<${tag}>`);
      updateToolbarState();
      scheduleSave(1500);
    }

    function insertLinkAtSelection() {
      saveSelection();
      const sel = window.getSelection();
      let selectedText = '';
      if (sel && sel.rangeCount > 0) {
        selectedText = sel.toString();
      }

      // Создаём простое модальное окно поверх заметок
      const linkModal = document.createElement('div');
      linkModal.className = 'link-modal';
      linkModal.innerHTML = `
        <div class="link-modal-content">
          <h3>Вставить ссылку</h3>
          <label>Текст ссылки</label>
          <input type="text" id="linkText" placeholder="Текст отображения" value="${escapeHtml(selectedText)}" />
          <label>URL</label>
          <input type="text" id="linkUrl" placeholder="https://..." />
          <div class="link-modal-actions">
            <button type="button" id="linkCancel">Отмена</button>
            <button type="button" id="linkOk" class="btn-primary">Вставить</button>
          </div>
        </div>
      `;
      document.body.appendChild(linkModal);
      linkModal.style.display = 'flex';

      const urlInput = linkModal.querySelector('#linkUrl');
      const textInput = linkModal.querySelector('#linkText');
      setTimeout(() => urlInput.focus(), 50);

      function close() {
        linkModal.remove();
      }

      function confirm() {
        const url = urlInput.value.trim();
        const text = textInput.value.trim() || url;
        if (!url) {
          urlInput.focus();
          return;
        }
        // Нормализуем — если нет схемы, добавляем https://
        const finalUrl = /^https?:\/\//i.test(url) || /^file:\/\//i.test(url) ? url : `https://${url}`;

        if (!restoreSelection()) {
          // Курсора не было — просто вставляем в конец
          notesContainer.focus();
          const range = document.createRange();
          range.selectNodeContents(notesContainer);
          range.collapse(false);
          const sel2 = window.getSelection();
          sel2.removeAllRanges();
          sel2.addRange(range);
        }

        const link = document.createElement('a');
        link.href = finalUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = text;
        document.execCommand('insertHTML', false, link.outerHTML);

        close();
        scheduleSave(500);
      }

      linkModal.querySelector('#linkCancel').addEventListener('click', close);
      linkModal.querySelector('#linkOk').addEventListener('click', confirm);
      linkModal.addEventListener('click', (e) => {
        if (e.target === linkModal) close();
      });
      urlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); confirm(); }
        if (e.key === 'Escape') { e.preventDefault(); close(); }
      });
      textInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); confirm(); }
        if (e.key === 'Escape') { e.preventDefault(); close(); }
      });
    }

    function insertCodeBlock() {
      notesContainer.focus();
      const sel = window.getSelection();
      let text = '';
      if (sel && sel.rangeCount > 0) {
        text = sel.toString();
      }
      if (!text) text = 'код';
      const code = document.createElement('code');
      code.textContent = text;
      document.execCommand('insertHTML', false, code.outerHTML);
      scheduleSave(500);
    }

    function insertHr() {
      notesContainer.focus();
      document.execCommand('insertHorizontalRule');
      scheduleSave(500);
    }

    function escapeHtml(s) {
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    // ----- Привязка кнопок тулбара -----
    document.querySelectorAll('.note-tool-btn').forEach((btn) => {
      btn.addEventListener('mousedown', (e) => {
        // Чтобы клик по кнопке не уводил фокус из contenteditable и не терял выделение
        e.preventDefault();
      });
      btn.addEventListener('click', () => {
        const command = btn.dataset.command;
        const block = btn.dataset.block;
        const action = btn.dataset.action;

        if (command) {
          if (command === 'insertUnorderedList' || command === 'insertOrderedList') {
            execCommand(command);
          } else if (command === 'removeFormat') {
            execCommand('removeFormat');
            // Дополнительно снимаем блочное форматирование
            execCommand('formatBlock', '<p>');
          } else {
            execCommand(command);
          }
          return;
        }

        if (block) {
          formatBlock(block);
          return;
        }

        if (action === 'insertLink') {
          insertLinkAtSelection();
          return;
        }
        if (action === 'insertCode') {
          insertCodeBlock();
          return;
        }
        if (action === 'insertHr') {
          insertHr();
          return;
        }
      });
    });

    // ----- Подсветка активных кнопок в зависимости от курсора -----
    function updateToolbarState() {
      document.querySelectorAll('.note-tool-btn').forEach((btn) => {
        const command = btn.dataset.command;
        const block = btn.dataset.block;
        let active = false;

        if (command) {
          try {
            if (['bold', 'italic', 'underline', 'strikeThrough',
                 'insertUnorderedList', 'insertOrderedList'].includes(command)) {
              active = document.queryCommandState(command);
            }
          } catch { /* queryCommandState может бросать на несуществующих командах */ }
        }

        if (block) {
          // Получаем текущий блочный элемент под курсором
          const sel = window.getSelection();
          if (sel && sel.anchorNode) {
            let node = sel.anchorNode;
            if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
            const currentBlock = getBlockTag(node);
            if (block === 'p') {
              active = currentBlock === 'P' || !currentBlock;
            } else {
              active = currentBlock === block.toUpperCase();
            }
          }
        }

        btn.classList.toggle('active', active);
      });
    }

    function getBlockTag(node) {
      while (node && node !== notesContainer) {
        const tag = node.tagName;
        if (['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'BLOCKQUOTE', 'PRE', 'LI'].includes(tag)) {
          return tag;
        }
        node = node.parentNode;
      }
      return null;
    }

    document.addEventListener('selectionchange', () => {
      // Обновляем тулбар только если фокус внутри notesContainer
      const active = document.activeElement;
      if (active === notesContainer || notesContainer.contains(active)) {
        updateToolbarState();
      }
    });

    // ----- Горячие клавиши -----
    notesContainer.addEventListener('keydown', (e) => {
      const ctrl = e.ctrlKey || e.metaKey;

      // Ctrl+S — сохранить
      if (ctrl && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (saveTimeout) { clearTimeout(saveTimeout); saveTimeout = null; }
        saveNotes();
        flashSaved();
        return;
      }
      // Ctrl+K — вставить ссылку
      if (ctrl && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        insertLinkAtSelection();
        return;
      }
      // Ctrl+B/I/U — стандартные, но обновляем тулбар
      if (ctrl && (e.key.toLowerCase() === 'b' ||
                   e.key.toLowerCase() === 'i' ||
                   e.key.toLowerCase() === 'u')) {
        // Не preventDefault — пусть браузер сам сделает execCommand
        setTimeout(updateToolbarState, 0);
        return;
      }
      // Tab — вставляем 4 пробела вместо потери фокуса
      if (e.key === 'Tab') {
        e.preventDefault();
        document.execCommand('insertHTML', false, '&nbsp;&nbsp;&nbsp;&nbsp;');
        scheduleSave(1500);
        return;
      }
      // Shift+Enter — <br> вместо нового <p>
      if (e.shiftKey && e.key === 'Enter') {
        // По умолчанию в contenteditable в Chrome Shift+Enter и так вставляет <br>,
        // но на всякий случай не мешаем.
        return;
      }
    });

    function flashSaved() {
      notesContainer.classList.add('notes-saved-flash');
      setTimeout(() => {
        notesContainer.classList.remove('notes-saved-flash');
      }, 700);
    }

    // Экспортируем loadNotes для selectProject
    window.loadNotes = loadNotes;
  }

  // ===== МОДАЛЬНОЕ ОКНО ДЛЯ ПЕРЕИМЕНОВАНИЯ =====
const renameModal = document.getElementById('renameProjectModal');
const renameProjectInput = document.getElementById('renameProjectInput'); // ← переименовано
const renameConfirmBtn = document.getElementById('renameModalConfirmBtn');
const renameCancelBtn = document.getElementById('renameModalCancelBtn');
// Заголовок модалки — можем менять его под контекст (проект / файл / папка)
const renameModalTitle = renameModal?.querySelector('h2');
// Подпись кнопки подтверждения тоже может меняться
const renameConfirmLabel = renameConfirmBtn?.textContent || 'Переименовать';

let renameResolve = null;

/**
 * Открывает модалку переименования.
 * @param {string} defaultName - значение по умолчанию в поле ввода
 * @param {Object} [opts] - опции
 * @param {string} [opts.title] - заголовок модалки
 * @param {string} [opts.confirmLabel] - текст кнопки подтверждения
 * @returns {Promise<string|null>} - новое имя или null при отмене
 */
function openRenameModal(defaultName, opts = {}) {
  return new Promise((resolve) => {
    renameResolve = resolve;
    renameProjectInput.value = defaultName;
    if (renameModalTitle && opts.title) {
      renameModalTitle.textContent = opts.title;
    } else if (renameModalTitle) {
      renameModalTitle.textContent = '✏️ Переименование';
    }
    if (renameConfirmBtn && opts.confirmLabel) {
      renameConfirmBtn.textContent = opts.confirmLabel;
    } else if (renameConfirmBtn) {
      renameConfirmBtn.textContent = renameConfirmLabel;
    }
    renameModal.style.display = 'flex';
    setTimeout(() => {
      renameProjectInput.focus();
      renameProjectInput.select();
    }, 100);
  });
}

function closeRenameModal() {
  renameModal.style.display = 'none';
  if (renameResolve) {
    renameResolve(null);
    renameResolve = null;
  }
}

renameConfirmBtn.addEventListener('click', () => {
  const name = renameProjectInput.value.trim(); // ← исправлено
  if (!name) {
    alert('Имя не может быть пустым');
    return;
  }
  if (renameResolve) {
    renameResolve(name);
    renameResolve = null;
  }
  renameModal.style.display = 'none';
});

renameCancelBtn.addEventListener('click', closeRenameModal);
renameProjectInput.addEventListener('keydown', (e) => { // ← исправлено
  if (e.key === 'Enter') renameConfirmBtn.click();
  if (e.key === 'Escape') closeRenameModal();
});
renameModal.addEventListener('click', (e) => {
  if (e.target === renameModal) closeRenameModal();
});

  // ===== LIVE-ОБНОВЛЕНИЕ ИНТЕРФЕЙСА (НАБЛЮДЕНИЕ ЗА ФАЙЛАМИ) =====
  // Главный процесс следит за каталогом проектов (рекурсивно) и присылает
  // события fs-event: { root, projectsChanged, projectPaths: [...] }.
  //   - projectsChanged — изменился список проектов (папка добавлена/удалена);
  //   - projectPaths — в этих проектах изменились файлы.
  // Благодаря этому File overview и файловый менеджер обновляются сами
  // (без F5/Ctrl+R), а удалённый — извне или из приложения — выбранный проект
  // сменяется приветственным экраном.
  // project.json и временные файлы главный процесс отфильтровывает сам.

  let watchingRoot = null;
  let projectsRefreshTimer = null;
  let filesRefreshTimer = null;

  /** Сравнение путей без учёта регистра, разделителей и хвостового слэша. */
  function samePath(a, b) {
    const norm = (p) => String(p || '').replace(/[\\/]+$/, '').toLowerCase();
    return norm(a) === norm(b);
  }

  /** true, если child === parent или child лежит внутри parent. */
  function isSubPath(child, parent) {
    const c = String(child || '').replace(/[\\/]+$/, '').toLowerCase();
    const p = String(parent || '').replace(/[\\/]+$/, '').toLowerCase();
    return c === p || c.startsWith(p + '\\') || c.startsWith(p + '/');
  }

  /** Родительский путь (без хвостового разделителя). null для корня диска. */
  function parentPathOf(p) {
    const norm = String(p || '').replace(/[\\/]+$/, '');
    const idx = Math.max(norm.lastIndexOf('\\'), norm.lastIndexOf('/'));
    return idx > 0 ? norm.slice(0, idx) : null;
  }

  /** Включает наблюдение за текущим каталогом проектов. При переключении
   *  рабочей области наблюдение автоматически переезжает на новый каталог. */
  function startWatchingProjects() {
    const root = settings && settings.projectsPath;
    if (!root || !window.api.startWatching) return;
    if (watchingRoot) {
      if (samePath(watchingRoot, root)) return; // уже наблюдаем этот каталог
      window.api.stopWatching(watchingRoot).catch(() => {});
    }
    watchingRoot = root;
    window.api.startWatching(root).catch((err) => {
      console.warn('Не удалось включить наблюдение за папкой проектов:', err);
    });
  }

  function stopWatchingProjects() {
    if (!watchingRoot) return;
    window.api.stopWatching(watchingRoot).catch(() => {});
    watchingRoot = null;
  }

  /** Обновление списка проектов БЕЗ сброса выбора/фильтров/сортировки
   *  (в отличие от loadProjects, который всё обнуляет и дергает Supabase). */
  async function refreshProjectsList() {
    if (!settings || !settings.projectsPath) return;
    try {
      const result = await window.api.getProjects(settings.projectsPath);
      if (!result.success) {
        // Каталог проектов удалён или стал недоступен
        projects = [];
        applyFiltersAndSearch();
        if (selectedProjectId) selectProject(null);
        return;
      }

      projects = result.projects;
      loadPreviewsForProjects(projects); // фоном, без ожидания
      applyFiltersAndSearch();

      if (selectedProjectId) {
        const stillExists = projects.some((p) => p.id === selectedProjectId);
        if (!stillExists) {
          // Выбранный проект удалён (извне или из приложения) —
          // приветственный экран вместо устаревшего центрального блока
          showToast('Проект удалён', 2500);
          selectProject(null);
          return;
        }
        // Обновляем объект выбранного проекта актуальными данными
        currentProject = projects.find((p) => p.id === selectedProjectId) || null;
      }
    } catch (error) {
      console.error('Ошибка обновления списка проектов:', error);
    }
  }

  /** Обновление File overview и файлового менеджера выбранного проекта.
   *  Если текущая папка менеджера удалена — поднимаемся к ближайшей
   *  существующей родительской папке внутри проекта. */
  async function refreshCurrentProjectFiles() {
    const project = currentProject;
    if (!project) return;

    // Проект мог исчезнуть целиком (список ещё не успел обновиться)
    if (!projects.some((p) => p.id === project.id)) {
      selectProject(null);
      return;
    }

    // 1. File overview (раздел данных проекта: .blend/.spp + ассоциированные)
    await loadProjectFiles(project.path);

    // 2. Файловый менеджер: обновляем ТЕКУЩУЮ папку, без записи в историю.
    //    Если она удалена — поднимаемся вверх до существующей папки проекта.
    let dir = currentPath || project.path;
    if (!isSubPath(dir, project.path)) dir = project.path;

    let guard = 0;
    while (guard++ < 40) {
      try {
        const check = await window.api.fileExists(dir);
        if (check && check.exists) break;
      } catch {
        // считаем папку несуществующей
      }
      if (samePath(dir, project.path)) break; // сам проект исчез — это обработает projects-событие
      const parent = parentPathOf(dir);
      if (!parent || samePath(parent, dir) || !isSubPath(parent, project.path)) {
        dir = project.path;
        break;
      }
      dir = parent;
    }

    if (dir) await loadDirectory(dir, false);
  }

  function queueProjectsRefresh() {
    if (projectsRefreshTimer) clearTimeout(projectsRefreshTimer);
    projectsRefreshTimer = setTimeout(() => {
      projectsRefreshTimer = null;
      refreshProjectsList();
    }, 150);
  }

  function queueFilesRefresh() {
    if (filesRefreshTimer) clearTimeout(filesRefreshTimer);
    filesRefreshTimer = setTimeout(() => {
      filesRefreshTimer = null;
      refreshCurrentProjectFiles();
    }, 250);
  }

  /** Точка входа событий от главного процесса. */
  function handleFsEvent(payload) {
    if (!payload || !payload.root) return;
    // Интересуют только события текущей рабочей области
    if (!settings || !settings.projectsPath) return;
    if (!samePath(payload.root, settings.projectsPath)) return;

    if (payload.projectsChanged) queueProjectsRefresh();

    const changedPaths = Array.isArray(payload.projectPaths) ? payload.projectPaths : [];
    if (currentProject && changedPaths.some((p) => samePath(p, currentProject.path))) {
      queueFilesRefresh();
    }
  }

  if (window.api.onFsEvent) {
    window.api.onFsEvent(handleFsEvent);
  }

  // ===== ИНИЦИАЛИЗАЦИЯ =====
  await loadData();
});


