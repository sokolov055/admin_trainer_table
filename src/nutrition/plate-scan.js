/**
 * AI-сканер еды (FT-746): когда снимать кадр без кнопки. Видоискатель раз в
 * 150 мс уменьшает центр кадра до 24×24 в оттенки серого; кадр уходит на
 * распознавание, когда в рамке что-то есть, светло и телефон замер на
 * STEADY_MS. Запрос к модели — один на тарелку, а не поток кадров.
 * Чистые функции без DOM — проверяет scripts/test-diary-extras.mjs.
 */
export const SCAN_SIZE = 24;
export const STEADY_MS = 1100;
const DARK = 40, FLAT = 10, MOVING = 9;

/** RGBA (getImageData) → яркость 0–255 на точку */
export function frameGray(rgba) {
  const out = new Uint8Array(rgba.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = (rgba[i * 4] * 3 + rgba[i * 4 + 1] * 6 + rgba[i * 4 + 2]) / 10;
  return out;
}

/** Средняя яркость и разброс: тёмный кадр или пустая стена — снимать нечего */
export function frameStats(gray) {
  let sum = 0, sq = 0;
  for (const v of gray) { sum += v; sq += v * v; }
  const mean = sum / gray.length;
  return { mean, spread: Math.sqrt(Math.max(0, sq / gray.length - mean * mean)) };
}

/** Насколько кадр сдвинулся: средняя разница яркости точек */
export function frameMotion(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

/**
 * Следующее состояние сканера. phase: 'dark' — темно, 'empty' — в рамке
 * пусто, 'moving' — телефон движется, 'steady' — держат ровно (progress
 * 0–1), 'ready' — снимать
 */
export function scanStep(state, gray, now) {
  const { mean, spread } = frameStats(gray);
  const motion = frameMotion(state.prev, gray);
  const base = { prev: gray, since: null, progress: 0 };
  if (mean < DARK) return { ...base, phase: 'dark' };
  if (spread < FLAT) return { ...base, phase: 'empty' };
  if (motion > MOVING) return { ...base, phase: 'moving' };
  const since = state.since ?? now, progress = Math.min(1, (now - since) / STEADY_MS);
  return { prev: gray, since, progress, phase: progress >= 1 ? 'ready' : 'steady' };
}

export const SCAN_HINTS = {
  start: 'Включаем камеру…',
  dark: 'Темновато — нужен свет',
  empty: 'Наведите камеру на тарелку',
  moving: 'Держите телефон ровно',
  steady: 'Держите ровно — смотрю',
  ready: 'Распознаю…',
};
