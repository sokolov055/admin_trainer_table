/** Правка упражнения (Упражнения, этап 3): черновик, что изменилось и что уйдёт на сервер. Без React. */
import { linesOf } from './exercise-view-model.js';

export const NAME_MIN = 2;
export const NOTES_MAX = 2000;
export const MISTAKES_MAX = 1500;
export const SETUP_MAX = 1500;

/** Черновик из упражнения: то, что правит форма */
export function draftOf(e) {
  return {
    name: e.name || '',
    shortName: e.shortName || '',
    muscle: e.muscle || '',
    equipment: e.equipment || '',
    track: e.track ? { ...e.track } : { kind: 'strength', auto: true },
    steps: linesOf(e.notes),
    mistakes: linesOf(e.mistakes),
    link: e.media?.kind === 'link' ? e.media.url : '',
    map: e.musclesCustom ? e.muscles || null : null,
    setup: e.setup || '',
    setupOk: !!e.setupOk,
  };
}

/** Тип учёта на сервер: «авто» — только флаг, иначе явные поля (как было в карточке) */
export function trackPayload(t) {
  if (!t || t.auto) return { auto: true };
  return {
    kind: t.kind,
    weightMode: t.weightMode || undefined,
    machine: t.machine || 'treadmill',
    unilateral: !!t.unilateral,
    perSide: !!t.perSide,
  };
}

const sameJson = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const cleanLines = (list) => list.map((s) => String(s).trim()).filter(Boolean);

/** Что изменилось относительно упражнения — ключи полей, без пустых изменений */
export function changesOf(e, d) {
  return diffDrafts(draftOf(e), d);
}

/** Различия двух черновиков — база (последнее сохранённое) и текущий */
export function diffDrafts(was, d) {
  const out = {};
  if (d.name.trim() !== was.name.trim()) out.name = true;
  if (d.shortName.trim() !== was.shortName.trim()) out.shortName = true;
  if (d.muscle !== was.muscle) out.muscle = true;
  if (d.equipment.trim() !== was.equipment.trim()) out.equipment = true;
  if (!sameJson(trackPayload(d.track), trackPayload(was.track))) out.track = true;
  if (cleanLines(d.steps).join('\n') !== cleanLines(was.steps).join('\n')) out.notes = true;
  if (cleanLines(d.mistakes).join('\n') !== cleanLines(was.mistakes).join('\n')) out.mistakes = true;
  if (d.link.trim() !== was.link.trim()) out.link = true;
  if (!sameJson(d.map, was.map)) out.muscles = true;
  // Подготовка клиенту видна, когда опубликована (setup_ok): заполненный текст без публикации — несохранённое
  if (d.setup.trim() !== was.setup.trim() || !!d.setup.trim() !== was.setupOk) out.setup = true;
  return out;
}

/** Ошибка, из-за которой «Сохранить» недоступно или запись отклонят на сервере */
export function problemOf(d) {
  if (d.name.trim().length < NAME_MIN) return 'Название — хотя бы два знака.';
  if (cleanLines(d.steps).join('\n').length > NOTES_MAX) return 'Техника длиннее 2000 знаков — сократите шаги.';
  if (cleanLines(d.mistakes).join('\n').length > MISTAKES_MAX) return 'Частые ошибки длиннее 1500 знаков.';
  if (d.setup.length > SETUP_MAX) return 'Подготовка длиннее 1500 знаков.';
  return '';
}

/**
 * Что отправить при «Сохранить». Название, группа и техника уходят всегда
 * (сервер переписывает их целиком), остальное — только если поменяли.
 * Подготовку владелец общего и свои упражнения пишут напрямую (setup),
 * остальные — через сохранение, которое создаст их версию.
 */
export function savePlan(e, d, { directSetup, was = draftOf(e) }) {
  const ch = diffDrafts(was, d);
  // Подготовка показывается клиенту, как только заполнена: отдельной «проверки» нет (решение владельца 24.11)
  const setupDirect = directSetup && !!ch.setup;
  const setup = setupDirect ? { id: e.id, setup: d.setup.trim(), ok: !!d.setup.trim() } : null;
  const mainKeys = Object.keys(ch).filter((k) => !(setupDirect && k === 'setup'));
  if (!mainKeys.length) return { main: null, setup };
  const main = { id: e.id, name: d.name.trim(), muscle: d.muscle, notes: cleanLines(d.steps).join('\n') };
  if (ch.shortName) main.shortName = d.shortName.trim();
  if (ch.equipment) main.equipment = d.equipment.trim();
  if (ch.track) main.track = trackPayload(d.track);
  if (ch.mistakes) main.mistakes = cleanLines(d.mistakes).join('\n');
  if (ch.link) main.link = d.link.trim();
  if (ch.muscles) main.muscles = d.map;
  if (ch.setup && !setupDirect) { main.setup = d.setup.trim(); main.setupOk = !!d.setup.trim(); }
  return { main, setup };
}

/** Перестановка и удаление в списках шагов и ошибок */
export function moveItem(list, i, dir) {
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return list;
  const next = list.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export function removeItem(list, i) {
  return list.filter((_, k) => k !== i);
}
