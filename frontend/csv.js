// Текст с началом формулы сохраняется как текст при открытии в таблицах.
// Числа, включая 0 и отрицательные значения, не изменяются.
export function spreadsheetValue(value) {
  if (value == null) return '';
  const text = String(value);
  if (typeof value === 'string' && (/^[\s\uFEFF]*[=+@-]/u.test(text) || /^[\t\r\n]/u.test(text))) {
    return `'${text}`;
  }
  return text;
}

export function csvCell(value) {
  // Кавычки вокруг всех ячеек допустимы в CSV. Внутреннюю кавычку удваиваем.
  return `"${spreadsheetValue(value).replaceAll('"', '""')}"`;
}

export function makeCsv(headers, rows, { delimiter = ';', includeHeader = true } = {}) {
  if (![',', ';'].includes(delimiter)) throw new Error('Недопустимый разделитель');
  if (!headers.length) throw new Error('Выберите хотя бы один столбец');
  if (rows.some(row => row.length !== headers.length)) throw new Error('Число ячеек не совпадает с заголовками');
  const records = includeHeader ? [headers, ...rows] : rows;
  // BOM помогает Excel распознать UTF-8; строки разделяем CRLF.
  return '\uFEFF' + records.map(row => row.map(csvCell).join(delimiter)).join('\r\n') + '\r\n';
}

export function downloadCsv(contents) {
  const blob = new Blob([contents], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const filename = `moscow-events-${new Date().toISOString().slice(0, 10)}.csv`;
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Даём браузеру начать скачивание, затем освобождаем объект в памяти.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}
