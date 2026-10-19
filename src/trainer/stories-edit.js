import { CANVAS_LIMITS, GRADIENTS, emptyCanvas, framesForEditor, legacyFields } from '../story-canvas.js';

/**
 * Правка историй в «Управлении → Истории» (FT-615) — без React, чтобы её
 * проверял тест (scripts/test-stories-edit.mjs). Хранит и проверяет набор
 * сервер (server/src/lib/stories.js); здесь — черновик на экране.
 *
 * Тем всегда две — «Что нового» и «Инструкция» (владелец, 19.10.2026):
 * правятся кадры, а не сами темы.
 *
 * С шага 2 каждый кадр черновика — холст из слоёв (story-canvas.js),
 * правится в редакторе как в Instagram (StoryEditor.jsx). Старые кадры
 * переводятся в холст при открытии панели — одинаково каждый раз, поэтому
 * «Сохранить» не загорается от одного открытия. Заголовок и текст для
 * старых сборок собираются из слоёв при отправке (toPayload).
 *
 * Все изменения возвращают новый массив: экран сравнивает его с
 * сохранённым, чтобы «Сохранить» горела только когда есть что сохранять.
 */

/** Те же пределы, что на сервере: подсказать до отправки, а не отказом после */
export const LIMITS = { topics: 8, frames: 24, label: 24, caption: 80, date: 30, ...CANVAS_LIMITS };

export const DEVICES = [
  { value: '', label: 'Везде' },
  { value: 'ios', label: 'Только iPhone' },
  { value: 'android', label: 'Кроме iPhone' },
];

const clone = (v) => JSON.parse(JSON.stringify(v));

function draftFrame(f) {
  const out = { id: f.id };
  ['date', 'only'].forEach((k) => { if (f[k]) out[k] = f[k]; });
  if (f.hidden) out.hidden = true;
  // Слой без id (сохранён не редактором) — свой id: по нему держится жест
  out.canvas = { ...f.canvas, layers: f.canvas.layers.map((l, k) => (l.id ? l : { ...l, id: 'l' + k })) };
  return out;
}

/** Темы (вшитые или с сервера) → черновик: у каждого кадра холст, «кому» явно */
export function draftFrom(topics) {
  return clone(topics || []).map((t) => ({
    id: t.id,
    label: t.label || '',
    caption: t.caption || '',
    ...(t.cover ? { cover: t.cover } : {}),
    audience: t.audience || 'all',
    frames: framesForEditor(t.frames).map(draftFrame),
  }));
}

/** Холст без лишнего: так его примет сервер */
function cleanCanvas(canvas) {
  const out = { bg: canvas.bg, layers: canvas.layers.map((l) => {
    const layer = { ...l };
    if (layer.type === 'text') layer.text = String(layer.text || '').trim();
    return layer;
  }).filter((l) => l.type !== 'text' || l.text) };
  if (canvas.image) out.image = canvas.image;
  return out;
}

/** То же, что уйдёт на сервер: с заголовком и текстом для старых сборок */
export function toPayload(draft) {
  return clone(draft).map((t) => ({
    ...t,
    frames: t.frames.map((f) => {
      const canvas = cleanCanvas(f.canvas);
      const out = { id: f.id, ...legacyFields(canvas, t.caption) };
      const date = String(f.date || '').trim();
      if (date) out.date = date;
      if (f.only) out.only = f.only;
      if (f.hidden) out.hidden = true;
      out.canvas = canvas;
      return out;
    }),
  }));
}

export function sameDraft(a, b) {
  return JSON.stringify(toPayload(a || [])) === JSON.stringify(toPayload(b || []));
}

/** Новый id: короткий и не повторяется. Новый id — кружок загорится у всех */
export function newId(prefix, taken, now = Date.now()) {
  const used = new Set(taken);
  let n = 0;
  let id;
  do {
    id = `${prefix}-${now.toString(36)}${n ? '-' + n : ''}`;
    n += 1;
  } while (used.has(id));
  return id;
}

export const frameIds = (draft) => draft.flatMap((t) => t.frames.map((f) => f.id));

export function updateTopic(draft, ti, patch) {
  return draft.map((t, i) => (i === ti ? { ...t, ...patch } : t));
}

export function updateFrame(draft, ti, fi, patch) {
  return draft.map((t, i) => (i !== ti ? t : {
    ...t,
    frames: t.frames.map((f, j) => {
      if (j !== fi) return f;
      const next = { ...f, ...patch };
      // Пустое значение — поля нет: «везде», «без даты», «не скрыт»
      Object.keys(patch).forEach((k) => { if (patch[k] === '' || patch[k] === false || patch[k] === null) delete next[k]; });
      return next;
    }),
  }));
}

/**
 * Новый кадр — сразу за текущим (at), фон — следующий градиент после
 * соседнего, чтобы кадры не сливались. Возвращает и номер нового кадра.
 */
export function addFrame(draft, ti, now = Date.now(), at = 0) {
  const id = newId('f', frameIds(draft), now);
  const frames = draft[ti].frames;
  const prev = frames[Math.min(at, frames.length) - 1] || frames[0];
  const gi = prev && prev.canvas.bg.kind === 'gradient' ? GRADIENTS.findIndex((g) => g.id === prev.canvas.bg.value) : -1;
  // Светлый «paper» — последний в списке: новый кадр по кругу его не берёт
  const bg = GRADIENTS[(gi + 1) % (GRADIENTS.length - 1)].id;
  const pos = Math.max(0, Math.min(at, frames.length));
  return {
    draft: draft.map((t, i) => (i !== ti ? t : { ...t, frames: [...frames.slice(0, pos), { id, canvas: emptyCanvas(bg) }, ...frames.slice(pos)] })),
    frame: pos,
  };
}

/** Копия кадра сразу за ним: новый id у кадра и у слоёв */
export function duplicateFrame(draft, ti, fi, now = Date.now()) {
  const src = draft[ti].frames[fi];
  const copy = clone(src);
  copy.id = newId('f', frameIds(draft), now);
  copy.canvas.layers.forEach((l, k) => { l.id = (l.id + 'c' + k).slice(-16); });
  return draft.map((t, i) => (i !== ti ? t : { ...t, frames: [...t.frames.slice(0, fi + 1), copy, ...t.frames.slice(fi + 1)] }));
}

export function removeFrame(draft, ti, fi) {
  return draft.map((t, i) => (i !== ti ? t : { ...t, frames: t.frames.filter((_, j) => j !== fi) }));
}

/** Переставить кадр с места from на место to */
export function moveFrame(draft, ti, from, to) {
  if (to < 0 || to >= draft[ti].frames.length || to === from) return draft;
  return draft.map((t, i) => {
    if (i !== ti) return t;
    const frames = t.frames.slice();
    const [f] = frames.splice(from, 1);
    frames.splice(to, 0, f);
    return { ...t, frames };
  });
}

/**
 * Что помешает сохранить — по-человечески, до отправки. Пустой список —
 * можно сохранять (последнее слово всё равно за сервером).
 */
export function problems(draft) {
  const out = [];
  if (!draft.length) out.push('Нужна хотя бы одна тема.');
  if (draft.length > LIMITS.topics) out.push(`Тем больше ${LIMITS.topics}.`);
  draft.forEach((t) => {
    const name = `«${t.label.trim() || 'Без подписи'}»`;
    if (!t.label.trim()) out.push(`${name}: нет подписи на кружке.`);
    else if (t.label.trim().length > LIMITS.label) out.push(`${name}: подпись на кружке длиннее ${LIMITS.label} знаков.`);
    if (!t.caption.trim()) out.push(`${name}: нет заголовка над кадром.`);
    if (t.caption.trim().length > LIMITS.caption) out.push(`${name}: заголовок над кадром длиннее ${LIMITS.caption} знаков.`);
    if (t.frames.length > LIMITS.frames) out.push(`${name}: кадров больше ${LIMITS.frames}.`);
    t.frames.forEach((f, j) => {
      const at = `${name}, кадр ${j + 1}`;
      if (String(f.date || '').trim().length > LIMITS.date) out.push(`${at}: дата длиннее ${LIMITS.date} знаков.`);
      if (f.canvas.layers.length > LIMITS.layers) out.push(`${at}: слоёв больше ${LIMITS.layers}.`);
      if (f.canvas.layers.some((l) => l.type === 'text' && String(l.text || '').trim().length > LIMITS.text)) {
        out.push(`${at}: текст длиннее ${LIMITS.text} знаков — разбейте на два.`);
      }
    });
  });
  return out;
}

/** Строка-сводка кадра: скрыт, где показывать, дата */
export function frameNote(frame) {
  const parts = [];
  if (frame.hidden) parts.push('скрыт');
  if (frame.only === 'ios') parts.push('только iPhone');
  if (frame.only === 'android') parts.push('кроме iPhone');
  if (frame.date) parts.push(frame.date);
  return parts.join(' · ');
}
