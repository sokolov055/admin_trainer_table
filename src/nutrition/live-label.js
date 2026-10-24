import { parseLabel, labelScore } from './label-model.js';

// Живой текст этикетки с камеры iPhone (FT-732): кадр за кадром разбираем тем
// же parseLabel и подсказываем поверх камеры, чего не хватает. Закрываем камеру,
// когда база («на 100 г» / «на 100 мл») и все четыре цифры прочитаны двумя
// кадрами подряд одинаково: одиночный кадр бывает с ошибкой в цифре.
const NAMES = { kcal: 'ккал', protein: 'белки', fat: 'жиры', carbs: 'углеводы' };
const FULL = 1 + Object.keys(NAMES).length;

export const LABEL_HINT = 'Наведите рамку на таблицу «Пищевая ценность» со строкой «на 100 г» или «на 100 мл»';

// prev — прошлое состояние (или пусто); best — лучший текст на случай «Закрыть»
export function liveLabel(text, prev = {}) {
  const parsed = parseLabel(text || ''), score = labelScore(parsed);
  const key = score ? JSON.stringify([parsed.basis, parsed.fields]) : '';
  const better = score >= (prev.bestScore || 0) && score > 0;
  const state = { key, score, bestScore: better ? score : prev.bestScore || 0, best: better ? text : prev.best || '' };
  const have = Object.keys(NAMES).filter(k => parsed.fields[k] !== undefined);
  if (score === FULL) return { ...state, ready: true, done: prev.key === key, hint: 'Всё прочитано — держите ещё мгновение' };
  if (!score) return { ...state, ready: false, done: false, hint: have.length ? 'Цифры видно, а строку «на 100 г» — нет. Захватите таблицу целиком' : LABEL_HINT };
  const miss = Object.keys(NAMES).filter(k => !have.includes(k)).map(k => NAMES[k]);
  return { ...state, ready: false, done: false, hint: (have.length ? 'Есть: ' + have.map(k => NAMES[k]).join(', ') + '. ' : '') + 'Ещё: ' + miss.join(', ') + ' — держите ровно, без бликов' };
}
