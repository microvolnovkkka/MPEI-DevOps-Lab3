import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCsv, csvCell, spreadsheetValue } from '../frontend/csv.js';
import { selectedDefinitions, projectEvents, moveColumn, DEFAULT_COLUMNS } from '../frontend/columns.js';
import { eventsPath } from '../frontend/api.js';

test('CSV сохраняет кириллицу, кавычки, разделители и переносы строк', () => {
  const csv = makeCsv(['Название', 'Описание'], [['Концерт, «Мир»', 'Зал "А"; вход\nсо двора']], { delimiter: ',' });
  assert.equal(csv, '\uFEFF"Название","Описание"\r\n"Концерт, «Мир»","Зал ""А""; вход\nсо двора"\r\n');
  assert.deepEqual([...new TextEncoder().encode(csv).slice(0, 3)], [239, 187, 191]);
});

test('Выключенный заголовок не оставляет пустую строку перед данными', () => {
  assert.equal(makeCsv(['Цена', 'Описание'], [[0, null]], { includeHeader: false }), '\uFEFF"0";""\r\n');
});

test('Текстовые формулы обезвреживаются, числа не получают апостроф', () => {
  for (const value of ['=1+1', '+SUM(A1)', '-1+2', '@SUM(A1)', '  =1+1', '\ttext', '\ntext']) assert.equal(spreadsheetValue(value), `'${value}`);
  assert.equal(csvCell(-25), '"-25"');
  assert.equal(csvCell(0), '"0"');
  assert.equal(csvCell('Обычный текст'), '"Обычный текст"');
});

test('Набор и порядок колонок управляют заголовками и ячейками', () => {
  const event = { title: 'Бесплатная выставка', price_rub: 0, venue: { name: 'Зал' }, status: 'published' };
  const columns = selectedDefinitions(['venue', 'price_rub', 'title']);
  const rows = projectEvents([event], columns);
  assert.deepEqual(rows, [['Зал', 0, 'Бесплатная выставка']]);
  assert.equal(makeCsv(columns.map(column => column.label), rows), '\uFEFF"Площадка";"Цена, ₽";"Название"\r\n"Зал";"0";"Бесплатная выставка"\r\n');
});

test('Нет связанных данных — в CSV пустые ячейки', () => {
  const columns = selectedDefinitions(['artist', 'venue', 'series_id', 'description', 'tags']);
  assert.deepEqual(projectEvents([{ artist: null, venue: null, series_id: null, description: null, tags: [] }], columns), [['', '', '', '', '']]);
});

test('Категория берётся из справочника, неизвестный код сохраняется', () => {
  assert.deepEqual(projectEvents([{ genre_code: 'concert' }, { genre_code: 'new-kind' }], selectedDefinitions(['genre']), new Map([['concert', 'Концерт']])), [['Концерт'], ['new-kind']]);
});

test('Даты сохраняют часовой пояс, теги объединяются в одну ячейку', () => {
  const event = { starts_at: '2027-03-01T19:00:00+03:00', tags: ['вечер', 'семья'] };
  assert.deepEqual(projectEvents([event], selectedDefinitions(['starts_at', 'tags'])), [['2027-03-01T19:00:00+03:00', 'вечер | семья']]);
});

test('Перестановка сохраняет состав и не меняет исходный массив', () => {
  const original = [...DEFAULT_COLUMNS];
  assert.deepEqual(moveColumn(original, 'starts_at', -1), ['starts_at', 'title', 'artist', 'venue', 'price_rub', 'status']);
  assert.deepEqual(original, DEFAULT_COLUMNS);
  assert.deepEqual(moveColumn(original, 'title', -1), original);
  assert.deepEqual(moveColumn(original, 'status', 1), original);
});

test('Некорректные настройки CSV отклоняются', () => {
  assert.throws(() => makeCsv([], [[]]), /столбец/);
  assert.throws(() => makeCsv(['Название'], [['A', 'B']]), /Число ячеек/);
  assert.throws(() => makeCsv(['Название'], [['A']], { delimiter: '|' }), /разделитель/);
});

test('Запрос содержит страницу, фильтры, связанные данные и кодирует поиск', () => {
  const url = new URL(eventsPath({ page: 3, pageSize: 25, q: 'Джаз & рок + кино', genre: 'concert', status: 'published', sort: '-price_rub' }), 'http://localhost');
  assert.equal(url.pathname, '/api/v1/events');
  assert.deepEqual(Object.fromEntries(url.searchParams), { page: '3', page_size: '25', include: 'venue,artist', sort: '-price_rub', q: 'Джаз & рок + кино', genre_code: 'concert', status: 'published' });
  assert.equal(new URL(eventsPath(), 'http://localhost').searchParams.has('status'), false);
});
