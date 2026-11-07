export const STATUS_LABELS = {
  published: 'Опубликовано', draft: 'Черновик',
  cancelled: 'Отменено', archived: 'В архиве',
};

// Каждый столбец знает свой заголовок и способ взять значение из ответа API.
export const COLUMNS = [
  { id: 'title', label: 'Название', value: event => event.title },
  { id: 'starts_at', label: 'Начало', value: event => event.starts_at },
  { id: 'artist', label: 'Исполнитель', value: event => event.artist?.name },
  { id: 'venue', label: 'Площадка', value: event => event.venue?.name },
  { id: 'price_rub', label: 'Цена, ₽', value: event => event.price_rub },
  { id: 'status', label: 'Статус', value: event => STATUS_LABELS[event.status] ?? event.status },
  { id: 'ends_at', label: 'Окончание', value: event => event.ends_at },
  { id: 'genre', label: 'Категория', value: (event, genres) => genres.get(event.genre_code) ?? event.genre_code },
  { id: 'address', label: 'Адрес', value: event => event.venue?.formatted_address },
  { id: 'age_rating', label: 'Возраст', value: event => event.age_rating == null ? '' : `${event.age_rating}+` },
  { id: 'description', label: 'Описание', value: event => event.description },
  { id: 'tags', label: 'Теги', value: event => event.tags?.join(' | ') },
  { id: 'ticket_quota', label: 'Квота билетов', value: event => event.ticket_quota },
  { id: 'sold_tickets', label: 'Продано билетов', value: event => event.sold_tickets },
  { id: 'available_tickets', label: 'Доступно билетов', value: event => event.available_tickets },
  { id: 'id', label: 'ID события', value: event => event.id },
  { id: 'artist_id', label: 'ID исполнителя', value: event => event.artist_id },
  { id: 'venue_id', label: 'ID площадки', value: event => event.venue_id },
  { id: 'series_id', label: 'ID серии', value: event => event.series_id },
  { id: 'created_at', label: 'Дата создания', value: event => event.created_at },
  { id: 'updated_at', label: 'Дата изменения', value: event => event.updated_at },
];

export const DEFAULT_COLUMNS = ['title', 'starts_at', 'artist', 'venue', 'price_rub', 'status'];
const byId = new Map(COLUMNS.map(column => [column.id, column]));

export function selectedDefinitions(ids) {
  return ids.map(id => {
    const column = byId.get(id);
    if (!column) throw new Error(`Неизвестный столбец: ${id}`);
    return column;
  });
}

export function moveColumn(ids, id, direction) {
  const result = [...ids];
  const index = result.indexOf(id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= result.length) return result;
  [result[index], result[target]] = [result[target], result[index]];
  return result;
}

// Предпросмотр и CSV используют одну проекцию, поэтому порядок не расходится.
export function projectEvents(events, columns, genres = new Map()) {
  return events.map(event => columns.map(column => column.value(event, genres) ?? ''));
}
