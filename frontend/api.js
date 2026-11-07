export function eventsPath({ page = 1, pageSize = 10, q = '', genre = '', status = '', sort = 'starts_at' } = {}) {
  const query = new URLSearchParams({ page: String(page), page_size: String(pageSize), include: 'venue,artist', sort });
  if (q.trim()) query.set('q', q.trim());
  if (genre) query.set('genre_code', genre);
  if (status) query.set('status', status);
  return `/api/v1/events?${query}`;
}

export async function getJson(path, signal) {
  const controller = new AbortController();
  const forwardAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', forwardAbort, { once: true });
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 20000);
  try {
    const response = await fetch(path, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) {
      const message = response.status === 503
        ? 'Сервер ещё готовится к работе. Подождите немного и повторите запрос.'
        : `Не удалось загрузить данные (HTTP ${response.status}). Попробуйте ещё раз.`;
      throw new Error(message);
    }
    return await response.json();
  } catch (error) {
    if (timedOut) throw new Error('Сервер не ответил за 20 секунд. Проверьте подключение и повторите запрос.');
    if (error.name === 'AbortError') throw error;
    if (error instanceof TypeError) throw new Error('Нет связи с сервером. Проверьте подключение и повторите запрос.');
    if (error instanceof SyntaxError) throw new Error('Сервер вернул неожиданный ответ. Проверьте работу API.');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', forwardAbort);
  }
}
