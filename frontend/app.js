import { COLUMNS, DEFAULT_COLUMNS, STATUS_LABELS, selectedDefinitions, moveColumn, projectEvents } from './columns.js';
import { makeCsv, downloadCsv, spreadsheetValue } from './csv.js';
import { eventsPath, getJson } from './api.js';

const $ = id => document.getElementById(id);
const state = {
  events: [], total: 0, page: 1, pageSize: 10,
  q: '', genre: '', status: '', sort: 'starts_at',
  genres: new Map(), columns: [...DEFAULT_COLUMNS],
  // Map связывает UUID с событием и сохраняет порядок выбора без дубликатов.
  selected: new Map(), selectedOnly: false, busy: false, error: '',
};
let pendingRequest;
let requestNumber = 0;
const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Europe/Moscow' });
const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
const moneyFormat = new Intl.NumberFormat('ru-RU');

// Данные API добавляем через textContent: HTML из названия события не выполняется.
function element(tag, className = '', text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}

function announce(message) {
  $('announcement').textContent = message;
}

function connection(kind, message) {
  $('connection').className = `connection ${kind}`;
  $('connection-text').textContent = message;
}

function viewRows() {
  if (!state.selectedOnly) return state.events;
  const start = (state.page - 1) * state.pageSize;
  return [...state.selected.values()].slice(start, start + state.pageSize);
}

function viewTotal() {
  return state.selectedOnly ? state.selected.size : state.total;
}

async function loadEvents() {
  pendingRequest?.abort();
  pendingRequest = new AbortController();
  const currentRequest = ++requestNumber;
  state.error = '';
  if (state.selectedOnly) {
    state.busy = false;
    state.page = Math.min(state.page, Math.max(1, Math.ceil(state.selected.size / state.pageSize)));
    renderTable();
    return;
  }
  state.busy = true;
  renderTable();
  try {
    const result = await getJson(eventsPath(state), pendingRequest.signal);
    if (currentRequest !== requestNumber) return;
    if (!Array.isArray(result.data) || !Number.isInteger(result.meta?.total)) {
      throw new Error('Ответ API не содержит корректный список событий.');
    }
    state.events = result.data;
    state.total = result.meta.total;
    const lastPage = Math.max(1, Math.ceil(state.total / state.pageSize));
    if (state.page > lastPage) {
      state.page = lastPage;
      return loadEvents();
    }
    for (const event of state.events) {
      if (state.selected.has(event.id)) state.selected.set(event.id, event);
    }
    connection('ready', 'Каталог подключён');
  } catch (error) {
    if (currentRequest !== requestNumber || error.name === 'AbortError') return;
    state.events = [];
    state.error = error.message;
    connection('failed', 'Нет подключения');
  } finally {
    if (currentRequest === requestNumber) {
      state.busy = false;
      renderTable();
      renderExport();
    }
  }
}

async function loadGenres() {
  try {
    const result = await getJson('/api/v1/meta/genres');
    if (!Array.isArray(result.data)) return;
    state.genres = new Map(result.data.map(item => [item.code, item.name]));
    $('genre').replaceChildren(new Option('Все категории', ''));
    for (const [code, name] of state.genres) $('genre').append(new Option(name, code));
    $('genre').value = state.genre;
    renderExport();
  } catch {
    // Поиск и выгрузка работают и без справочника: используем технический код жанра.
    $('genre').title = 'Справочник категорий пока недоступен. Повторите подключение.';
  }
}

function emptyRow(title, description) {
  const row = element('tr');
  const cell = element('td', 'empty-state');
  cell.colSpan = 5;
  cell.append(element('strong', '', title), element('span', '', description));
  row.append(cell);
  return row;
}

function renderTable() {
  const rows = viewRows();
  const total = viewTotal();
  const body = $('events-body');
  body.replaceChildren();
  $('events-scroll').setAttribute('aria-busy', String(state.busy));
  $('error-banner').hidden = !state.error;
  $('error-message').textContent = state.error;
  $('result-count').textContent = state.busy ? 'Загрузка…' : state.error ? 'Не удалось загрузить' : `Найдено: ${total}`;

  if (state.busy) body.append(emptyRow('Загружаем события…', 'Получаем данные из каталога.'));
  else if (state.error) body.append(emptyRow('Не удалось загрузить каталог', 'Нажмите «Повторить» в сообщении выше. Ваш выбор сохранён.'));
  else if (!rows.length) body.append(emptyRow(
    state.selectedOnly ? 'Пока ничего не выбрано' : 'Событий не найдено',
    state.selectedOnly ? 'Перейдите во «Все события» и отметьте нужные строки.' : 'Попробуйте изменить фильтры. Если каталог пуст, здесь пока нечего выгружать.',
  ));
  else for (const event of rows) {
    const row = element('tr', state.selected.has(event.id) ? 'selected' : '');
    const checkCell = element('td', 'check-cell');
    const check = element('input');
    check.type = 'checkbox';
    check.checked = state.selected.has(event.id);
    check.dataset.eventId = event.id;
    check.setAttribute('aria-label', `Выбрать событие «${event.title}»`);
    check.addEventListener('change', () => {
      if (check.checked) state.selected.set(event.id, event);
      else state.selected.delete(event.id);
      selectionChanged(event.id);
    });
    checkCell.append(check);
    const titleCell = element('td');
    titleCell.append(element('span', 'event-title', event.title));
    titleCell.append(element('span', 'event-subtitle', [event.artist?.name, event.venue?.name].filter(Boolean).join(' · ') || 'Исполнитель и площадка не указаны'));
    const dateCell = element('td', 'event-date');
    const date = new Date(event.starts_at);
    if (Number.isNaN(date.getTime())) dateCell.textContent = '—';
    else dateCell.append(element('span', '', dateFormat.format(date)), element('span', 'event-time', `${timeFormat.format(date)} · МСК`));
    const priceCell = element('td', 'event-price', event.price_rub === 0 ? 'Бесплатно' : `${moneyFormat.format(event.price_rub)} ₽`);
    const statusCell = element('td');
    const knownStatus = Object.hasOwn(STATUS_LABELS, event.status);
    statusCell.append(element('span', `status-badge${knownStatus ? ` status-${event.status}` : ''}`, STATUS_LABELS[event.status] ?? event.status));
    row.append(checkCell, titleCell, dateCell, priceCell, statusCell);
    body.append(row);
  }

  const checked = rows.filter(event => state.selected.has(event.id)).length;
  $('select-page').checked = rows.length > 0 && checked === rows.length;
  $('select-page').indeterminate = checked > 0 && checked < rows.length;
  $('select-page').disabled = state.busy || !!state.error || !rows.length;
  const pages = Math.max(1, Math.ceil(total / state.pageSize));
  $('page-info').textContent = state.error ? '—' : `Страница ${state.page} из ${pages}`;
  $('prev-page').disabled = state.busy || !!state.error || state.page <= 1;
  $('next-page').disabled = state.busy || !!state.error || state.page >= pages;
  $('all-view').setAttribute('aria-pressed', String(!state.selectedOnly));
  $('selected-view').setAttribute('aria-pressed', String(state.selectedOnly));
  // Фильтры относятся к каталогу; вкладка «Выбранные» показывает весь выбор.
  for (const control of $('filters').elements) control.disabled = state.selectedOnly;
}

function selectionChanged(focusId) {
  if (state.selectedOnly) state.page = Math.min(state.page, Math.max(1, Math.ceil(state.selected.size / state.pageSize)));
  renderTable();
  renderExport();
  if (focusId) {
    const check = [...$('events-body').querySelectorAll('input')].find(input => input.dataset.eventId === focusId);
    (check ?? $('selected-view')).focus({ preventScroll: true });
  }
  announce(`Выбрано событий: ${state.selected.size}.`);
}

function columnCheckbox(column, checked) {
  const label = element('label', 'checkbox-label');
  const checkbox = element('input');
  checkbox.type = 'checkbox';
  checkbox.checked = checked;
  checkbox.dataset.columnId = column.id;
  checkbox.setAttribute('aria-label', `Столбец «${column.label}»`);
  checkbox.addEventListener('change', () => {
    if (checkbox.checked) state.columns.push(column.id);
    else state.columns = state.columns.filter(id => id !== column.id);
    renderColumns();
    renderExport();
    if (!checkbox.checked) $('more-columns').open = true;
    document.querySelector(`input[data-column-id="${column.id}"]`)?.focus({ preventScroll: true });
  });
  label.append(checkbox, element('span', '', column.label));
  return label;
}

function renderColumns() {
  const list = $('selected-columns');
  list.replaceChildren();
  const columns = selectedDefinitions(state.columns);
  if (!columns.length) list.append(element('p', 'muted', 'Добавьте хотя бы один столбец из списка ниже.'));
  columns.forEach((column, index) => {
    const row = element('div', 'column-row');
    row.append(columnCheckbox(column, true), element('span', 'column-number', String(index + 1).padStart(2, '0')));
    for (const direction of [-1, 1]) {
      const move = element('button', 'move-button', direction === -1 ? '↑' : '↓');
      move.type = 'button';
      move.setAttribute('aria-label', `${direction === -1 ? 'Поднять' : 'Опустить'} столбец «${column.label}»`);
      move.title = move.getAttribute('aria-label');
      move.disabled = direction === -1 ? index === 0 : index === columns.length - 1;
      move.dataset.move = `${column.id}:${direction}`;
      move.addEventListener('click', () => {
        state.columns = moveColumn(state.columns, column.id, direction);
        renderColumns();
        renderExport();
        const nextButton = document.querySelector(`button[data-move="${column.id}:${direction}"]`);
        const fallback = document.querySelector(`input[data-column-id="${column.id}"]`);
        (nextButton?.disabled ? fallback : nextButton)?.focus({ preventScroll: true });
        announce(`Столбец «${column.label}»: позиция ${state.columns.indexOf(column.id) + 1}.`);
      });
      row.append(move);
    }
    list.append(row);
  });
  const available = COLUMNS.filter(column => !state.columns.includes(column.id));
  $('available-columns').replaceChildren(...available.map(column => columnCheckbox(column, false)));
  $('more-columns').hidden = !available.length;
  $('available-count').textContent = `(${available.length})`;
  $('column-count').textContent = columns.length;
}

function renderExport() {
  const count = state.selected.size;
  $('selected-badge').textContent = count;
  $('export-count').textContent = count;
  $('clear-selection').disabled = count === 0;
  $('download').disabled = !count || !state.columns.length;
  $('export-hint').textContent = !count ? 'Сначала выберите хотя бы одно событие.'
    : !state.columns.length ? 'Добавьте хотя бы один столбец.'
      : `В файл попадёт весь выбор: ${count}. Включая другие страницы.`;
  const empty = !count || !state.columns.length;
  $('preview-empty').hidden = !empty;
  $('preview-scroll').hidden = empty;
  $('preview-empty').querySelector('p').textContent = count && !state.columns.length ? 'Не выбраны столбцы' : 'Здесь появится ваша таблица';
  $('preview-empty').querySelector('span:last-child').textContent = count && !state.columns.length
    ? 'Добавьте поля в настройках файла.' : 'Отметьте события — и проверьте результат перед скачиванием.';
  $('preview-caption').textContent = count ? `Показано ${Math.min(3, count)} из ${count} выбранных` : 'Первые 3 выбранных события';
  const table = $('preview-table');
  table.replaceChildren();
  if (empty) return;
  const columns = selectedDefinitions(state.columns);
  if ($('include-header').checked) {
    const head = element('thead');
    const row = element('tr');
    for (const column of columns) {
      const cell = element('th', '', column.label);
      cell.scope = 'col';
      row.append(cell);
    }
    head.append(row);
    table.append(head);
  }
  const body = element('tbody');
  for (const values of projectEvents([...state.selected.values()].slice(0, 3), columns, state.genres)) {
    const row = element('tr');
    for (const value of values) row.append(element('td', '', spreadsheetValue(value)));
    body.append(row);
  }
  table.append(body);
}

function applyFilters() {
  state.q = $('query').value.trim();
  state.genre = $('genre').value;
  state.status = $('status').value;
  state.sort = $('sort').value;
  state.page = 1;
  loadEvents();
}

$('filters').addEventListener('submit', event => { event.preventDefault(); applyFilters(); });
for (const id of ['genre', 'status', 'sort']) $(id).addEventListener('change', applyFilters);
$('reset-filters').addEventListener('click', () => { $('filters').reset(); applyFilters(); });
$('retry').addEventListener('click', () => { loadGenres(); loadEvents(); });
$('page-size').addEventListener('change', () => { state.pageSize = Number($('page-size').value); state.page = 1; loadEvents(); });
for (const [id, direction] of [['prev-page', -1], ['next-page', 1]]) {
  $(id).addEventListener('click', () => { state.page += direction; loadEvents(); });
}
for (const [id, selectedOnly] of [['all-view', false], ['selected-view', true]]) {
  $(id).addEventListener('click', () => { state.selectedOnly = selectedOnly; state.page = 1; loadEvents(); });
}
$('select-page').addEventListener('change', () => {
  const checked = $('select-page').checked;
  for (const event of viewRows()) {
    if (checked) state.selected.set(event.id, event);
    else state.selected.delete(event.id);
  }
  selectionChanged();
});
$('clear-selection').addEventListener('click', () => { state.selected.clear(); selectionChanged(); });
$('reset-columns').addEventListener('click', () => { state.columns = [...DEFAULT_COLUMNS]; renderColumns(); renderExport(); announce('Состав и порядок столбцов восстановлены.'); });
$('include-header').addEventListener('change', renderExport);
$('download').addEventListener('click', () => {
  if (!state.selected.size || !state.columns.length) return;
  const columns = selectedDefinitions(state.columns);
  const rows = projectEvents([...state.selected.values()], columns, state.genres);
  const csv = makeCsv(columns.map(column => column.label), rows, {
    delimiter: $('delimiter').value,
    includeHeader: $('include-header').checked,
  });
  const filename = downloadCsv(csv);
  announce(`Подготовлен ${filename}: событий ${rows.length}, столбцов ${columns.length}.`);
});

renderColumns();
renderExport();
loadGenres();
loadEvents();
