// OCR предлагает только однозначные значения. Не угадываем пропущенные цифры,
// колонку таблицы и вес порции. Этикетка напитка «на 100 мл» читается как
// есть: продукт заводится в миллилитрах, плотность не нужна.
export function validBarcode(value) {
  const code = String(value || '').trim();
  if (!/^(?:\d{8}|\d{12,14})$/.test(code)) return false;
  const digits = [...code].map(Number), check = digits.pop();
  const sum = digits.reverse().reduce((s, n, i) => s + n * (i % 2 ? 1 : 3), 0);
  return (10 - sum % 10) % 10 === check;
}

export function parseLabel(text) {
  const normalized = String(text || '').toLowerCase().replace(/ё/g, 'е').replace(/\u00a0/g, ' ');
  const lines = normalized.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const grams = /(?:на|per|в)\s*100\s*(?:г\b|g\b|грам)/.test(normalized);
  const ml = /(?:на|per|в)\s*100\s*(?:мл\b|ml\b)/.test(normalized);
  const portion = /(?:на|per|в)\s*(?:одну\s*)?(?:порци|serving)/.test(normalized);
  const fields = {}, warnings = [];
  // В JS \b не считает кириллицу буквой: проверяем границу русской единицы отдельно.
  const hasGrams = grams || /(?:на|per|в)\s*100\s*г(?:[^а-я]|$)/.test(normalized);
  const hasMl = ml || /(?:на|per|в)\s*100\s*мл(?:[^а-я]|$)/.test(normalized);
  // Либо на 100 г, либо на 100 мл; обе колонки или порция рядом — не угадываем
  const basis = hasGrams && !hasMl && !portion ? '100g' : hasMl && !hasGrams && !portion ? '100ml' : hasGrams && hasMl ? 'mixed' : portion ? 'portion' : 'unknown';
  if (basis !== '100g' && basis !== '100ml') {
    warnings.push(basis === 'mixed' ? 'На этикетке есть и значения на 100 г, и на 100 мл. Выберите одну колонку и внесите цифры вручную.' : basis === 'portion' ? 'На этикетке есть значения на порцию. Выберите значения на 100 г или 100 мл и внесите их вручную.' : 'Не удалось подтвердить, что значения указаны на 100 г или 100 мл. Сверьте этикетку и внесите цифры вручную.');
    return { fields, warnings, basis, unit: null };
  }
  const unit = basis === '100ml' ? 'ml' : 'g';
  const specs = [['protein', /(?:белк|protein)/], ['fat', /(?:жир[ыа]?|total fat|^fat)/], ['carbs', /(?:углевод|carbohydrat)/]];
  const numbers = s => [...s.matchAll(/\d+(?:[.,]\d+)?/g)].map(m => Number(m[0].replace(',', '.')));
  for (const [key, pattern] of specs) {
    const matches = lines.filter(s => pattern.test(s) && !/насыщ|saturat/.test(s));
    if (matches.length !== 1) continue;
    if (/-\s*\d/.test(matches[0])) continue;
    const nums = numbers(matches[0]);
    if (nums.length === 1 && nums[0] <= 100) fields[key] = String(nums[0]);
  }
  const energies = [...normalized.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:ккал|kcal)/g)];
  if (energies.length === 1 && !/-\s*\d+(?:[.,]\d+)?\s*(?:ккал|kcal)/.test(normalized) && Number(energies[0][1].replace(',', '.')) <= 1000) fields.kcal = energies[0][1].replace(',', '.');
  if (basis === '100ml') warnings.push('На этикетке значения на 100 мл: продукт сохранится в миллилитрах, порции — тоже в мл.');
  if (Object.keys(fields).length < 4) warnings.push('Часть значений не прочитана однозначно. Заполните пустые поля по этикетке.');
  warnings.push('Сверьте каждую цифру с фотографией. Распознавание может ошибаться.');
  return { fields, warnings, basis, unit };
}
