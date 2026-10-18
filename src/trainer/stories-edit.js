/**
 * Правка историй в «Управлении → Истории» (FT-615) — без React, чтобы её
 * проверял тест (scripts/test-stories-edit.mjs). Хранит и проверяет набор
 * сервер (server/src/lib/stories.js); здесь — черновик на экране.
 *
 * Тем всегда две — «Что нового» и «Инструкция» (владелец, 19.10.2026):
 * правятся кадры, а не сами темы. Картинку к кадру владелец вставляет
 * готовую (её рисует Claude) — или оставляет встроенный рисунок.
 *
 * Черновик — массив тем того же вида, что TOPICS в stories.jsx. Все
 * изменения возвращают новый массив: экран сравнивает его с сохранённым,
 * чтобы «Сохранить» горела только когда есть что сохранять.
 */

/** Те же пределы, что на сервере: подсказать до отправки, а не отказом после */
export const LIMITS = { topics: 8, frames: 24, label: 24, caption: 80, heading: 90, body: 700, date: 30 };

export const DEVICES = [
  { value: '', label: 'Везде' },
  { value: 'ios', label: 'Только iPhone' },
  { value: 'android', label: 'Только Android' },
];

/** Цвета кадров — те, что уже есть во вшитых историях */
export const TINTS = ['#f5c65c', '#8ec0f5', '#7fd97f', '#c9a4f0', '#f0a4a4', '#ffa24c'];

const clone = (v) => JSON.parse(JSON.stringify(v));

/** Вшитые темы → черновик: только данные, «кому» явно */
export function draftFrom(topics) {
  return clone(topics || []).map((t) => ({
    id: t.id,
    label: t.label || '',
    caption: t.caption || '',
    ...(t.cover ? { cover: t.cover } : {}),
    audience: t.audience || 'all',
    frames: (t.frames || []).map((f) => {
      const out = { id: f.id, heading: f.heading || '', body: f.body || '' };
      ['bodyIos', 'date', 'image', 'art', 'tint', 'only'].forEach((k) => { if (f[k]) out[k] = f[k]; });
      if (f.hidden) out.hidden = true;
      return out;
    }),
  }));
}

/** То же, что уйдёт на сервер: пустые поля не отправляются */
export function toPayload(draft) {
  return draftFrom(draft).map((t) => ({
    ...t,
    frames: t.frames.map((f) => {
      const out = { ...f, heading: f.heading.trim(), body: f.body.trim() };
      ['bodyIos', 'date'].forEach((k) => { if (out[k] !== undefined && !String(out[k]).trim()) delete out[k]; });
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

const frameIds = (draft) => draft.flatMap((t) => t.frames.map((f) => f.id));

export function updateTopic(draft, ti, patch) {
  return draft.map((t, i) => (i === ti ? { ...t, ...patch } : t));
}

export function updateFrame(draft, ti, fi, patch) {
  return draft.map((t, i) => (i !== ti ? t : {
    ...t,
    frames: t.frames.map((f, j) => {
      if (j !== fi) return f;
      const next = { ...f, ...patch };
      // Пустое значение — поля нет: «везде», «без даты», «без картинки»
      Object.keys(patch).forEach((k) => { if (patch[k] === '' || patch[k] === false || patch[k] === null) delete next[k]; });
      if (next.heading === undefined) next.heading = '';
      if (next.body === undefined) next.body = '';
      return next;
    }),
  }));
}

/**
 * Новый кадр — первым в теме: в «Что нового» свежая новость идёт первой,
 * а в инструкции владелец передвинет его стрелками. Возвращает и номер,
 * чтобы экран сразу раскрыл его для правки.
 */
export function addFrame(draft, ti, now = Date.now()) {
  const id = newId('f', frameIds(draft), now);
  const tint = TINTS[draft[ti].frames.length % TINTS.length];
  return {
    draft: draft.map((t, i) => (i !== ti ? t : { ...t, frames: [{ id, heading: '', body: '', tint }, ...t.frames] })),
    frame: 0,
  };
}

export function removeFrame(draft, ti, fi) {
  return draft.map((t, i) => (i !== ti ? t : { ...t, frames: t.frames.filter((_, j) => j !== fi) }));
}

/** Сдвинуть кадр на delta; за край — не двигается */
export function moveFrame(draft, ti, fi, delta) {
  const to = fi + delta;
  if (to < 0 || to >= draft[ti].frames.length) return draft;
  return draft.map((t, i) => {
    if (i !== ti) return t;
    const frames = t.frames.slice();
    const [f] = frames.splice(fi, 1);
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
      if (!f.heading.trim()) out.push(`${at}: нет заголовка.`);
      if (f.heading.trim().length > LIMITS.heading) out.push(`${at}: заголовок длиннее ${LIMITS.heading} знаков.`);
      if (f.body.trim().length > LIMITS.body) out.push(`${at}: текст длиннее ${LIMITS.body} знаков.`);
      if ((f.bodyIos || '').trim().length > LIMITS.body) out.push(`${at}: текст для iPhone длиннее ${LIMITS.body} знаков.`);
    });
  });
  return out;
}

/** Строка-сводка под заголовком кадра в списке */
export function frameNote(frame) {
  const parts = [];
  if (frame.hidden) parts.push('скрыт');
  if (frame.only === 'ios') parts.push('только iPhone');
  if (frame.only === 'android') parts.push('только Android');
  if (frame.image) parts.push('своя картинка');
  if (frame.date) parts.push(frame.date);
  if (frame.bodyIos) parts.push('свой текст для iPhone');
  return parts.join(' · ');
}
