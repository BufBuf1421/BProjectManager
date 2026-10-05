// src/ProjectCard.js

/**
 * Карточка проекта для левой колонки.
 * Поведение сохранено 1-в-1: фон = превью либо цветной градиент по имени,
 * поверх — overlay, индикатор статуса, звёздочка избранного и название.
 */

// Палитра градиентов, используемая когда у проекта нет превью.
// Вынесена в константу, чтобы не дублировать в createProjectCard / updateCardPreview.
const FALLBACK_GRADIENTS = [
  'linear-gradient(135deg, #2d1b69, #11998e)',
  'linear-gradient(135deg, #fc4a1a, #f7b733)',
  'linear-gradient(135deg, #4facfe, #00f2fe)',
  'linear-gradient(135deg, #43e97b, #38f9d7)',
  'linear-gradient(135deg, #fa709a, #fee140)',
  'linear-gradient(135deg, #a18cd1, #fbc2eb)',
  'linear-gradient(135deg, #fccb90, #d57eeb)',
  'linear-gradient(135deg, #89f7fe, #66a6ff)',
];

const STATUS_CLASSES = {
  open: 'status-open',
  active: 'status-active',
  issue: 'status-issue',
  done: 'status-done',
  archived: 'status-archived',
};

const STATUS_LABELS = {
  open: 'Open',
  active: 'Active',
  issue: 'Issue',
  done: 'Done',
  archived: 'Archived',
};

function getStatusClass(status) {
  return STATUS_CLASSES[status] || STATUS_CLASSES.open;
}

function getStatusLabel(status) {
  return STATUS_LABELS[status] || STATUS_LABELS.open;
}

/**
 * Превращает путь файловой системы в корректный file:// URL.
 * encodeURI не кодирует "#" и "?" — они ломают URL (всё после "#"
 * считается фрагментом), поэтому кодируем их вручную.
 * @param {string} rawPath
 * @returns {string}
 */
function toFileUrl(rawPath) {
  if (!rawPath) return '';
  if (rawPath.startsWith('file://')) return rawPath;
  const encoded = encodeURI(rawPath.replace(/\\/g, '/'))
    .replace(/#/g, '%23')
    .replace(/\?/g, '%3F');
  return `file:///${encoded}`;
}

/**
 * Выбирает градиент по хэшу от имени проекта.
 * @param {string} name
 * @returns {string}
 */
function gradientForName(name) {
  const hash = (name || 'Project')
    .split('')
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return FALLBACK_GRADIENTS[hash % FALLBACK_GRADIENTS.length];
}

/**
 * Применяет к DOM-элементу карточки фоновое изображение (превью)
 * или градиент, если превью нет.
 * @param {HTMLElement} el
 * @param {string|null|undefined} previewPath
 * @param {string} [nameForGradient]
 */
function applyCardBackground(el, previewPath, nameForGradient) {
  if (!el) return;
  if (previewPath) {
    el.style.backgroundImage = `url('${toFileUrl(previewPath)}')`;
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
    el.style.backgroundColor = 'transparent';
  } else {
    el.style.background = gradientForName(nameForGradient || 'Project');
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
  }
}

/**
 * Создаёт DOM-элемент карточки проекта.
 * @param {Object} project - данные проекта
 * @param {Function} [onClick] - колбэк при клике на карточку
 * @returns {HTMLElement}
 */
export function createProjectCard(project, onClick) {
  const card = document.createElement('div');
  card.className = 'project-card';
  card.dataset.projectId = project.id;

  applyCardBackground(card, project.preview, project.name);

  // Затемнение для читаемости текста
  const overlay = document.createElement('div');
  overlay.className = 'project-overlay';
  card.appendChild(overlay);


  const innerframe = document.createElement('span');
  innerframe.className = 'inner-frame';
  card.appendChild(innerframe);

  const wingleft = document.createElement('span');
  wingleft.className = 'wing left';
  card.appendChild(wingleft);

  const wingright = document.createElement('span');
  wingright.className = 'wing right';
  card.appendChild(wingright);

  const tl = document.createElement('span');
  tl.className = 'corner tl';
  card.appendChild(tl);

  const tr = document.createElement('span');
  tr.className = 'corner tr';
  card.appendChild(tr);

  const bl = document.createElement('span');
  bl.className = 'corner bl';
  card.appendChild(bl);

  const br = document.createElement('span');
  br.className = 'corner br';
  card.appendChild(br);

  // Статус
  const status = document.createElement('div');
  const statusKey = project.status || 'open';
  status.className = `project-status ${getStatusClass(statusKey)}`;
  status.title = getStatusLabel(statusKey);
  card.appendChild(status);

  // Избранное
  const favorite = document.createElement('div');
  favorite.className = 'project-favorite';
  favorite.textContent = project.favorite ? '⭐' : '☆';
  favorite.title = project.favorite ? 'В избранном' : 'Добавить в избранное';
  card.appendChild(favorite);

  // Основное содержимое
  const content = document.createElement('div');
  content.className = 'project-card-content';

  const name = document.createElement('div');
  name.className = 'project-name';
  name.textContent = project.name;
  content.appendChild(name);

  card.appendChild(content);

  card.addEventListener('click', () => {
    if (onClick) onClick(project);
  });

  return card;
}

/**
 * Обновляет индикатор статуса на карточке.
 * @param {HTMLElement} cardElement
 * @param {string} newStatus
 */
export function updateCardStatus(cardElement, newStatus) {
  const statusEl = cardElement?.querySelector('.project-status');
  if (!statusEl) return;
  statusEl.className = 'project-status';
  statusEl.classList.add(getStatusClass(newStatus));
  statusEl.title = getStatusLabel(newStatus);
}

/**
 * Обновляет имя проекта на карточке.
 * @param {HTMLElement} cardElement
 * @param {string} newName
 */
export function updateCardName(cardElement, newName) {
  const nameEl = cardElement?.querySelector('.project-name');
  if (nameEl) nameEl.textContent = newName;
}

/**
 * Обновляет превью на карточке.
 * @param {HTMLElement} cardElement
 * @param {string|null} previewPath - путь к превью или null для сброса к градиенту
 */
export function updateCardPreview(cardElement, previewPath) {
  if (!cardElement) return;
  const nameEl = cardElement.querySelector('.project-name');
  const name = nameEl?.textContent || 'Project';
  applyCardBackground(cardElement, previewPath, name);
}
