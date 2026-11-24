/**
 * Что показывает лист упражнения (TechSheet.jsx, макет
 * exercise-sheet-mockup.html, владелец 15.11.2026): один и тот же в карточке
 * тренировки и в «Технике» внутри занятия. Здесь только данные, без React —
 * чтобы разбор текстов проверялся тестом (scripts/test-tech-sheet.mjs).
 *
 * Тексты базы не переписываются: шаг делится по «;» на главное (жирно) и
 * пояснение (мелко), «Ошибка: …» — на короткие метки по запятым и «или».
 */
import { resolveGuidance, instructionParts, stepLabel } from './equipment-guidance.js';

const lowerRu = (s) => s.toLocaleLowerCase('ru');
const same = (a, b) => lowerRu(a) === lowerRu(b);

/** «1. Грудь у опоры; руки на уровне плеч.» → главное и пояснение */
export function splitStep(line) {
  const text = String(line || '').replace(/^\s*(\d+[.)]|[-•–])\s*/, '').trim();
  const at = text.indexOf(';');
  const clean = (s) => s.trim().replace(/[.;,]+$/, '');
  if (at > 0 && at < text.length - 1) return { main: clean(text.slice(0, at)), rest: clean(text.slice(at + 1)) };
  return { main: clean(text), rest: '' };
}

/** Первая буква строчной, если это не сокращение («ТРХ», «Смит» не трогаем по второй букве) */
function lowerFirst(s) {
  if (s.length > 1 && s[1] === lowerRu(s[1]) && s[0] !== lowerRu(s[0]) && !/^Смит/.test(s)) return lowerRu(s[0]) + s.slice(1);
  return s;
}

/** Ошибки → короткие метки: по запятым, «;» и «или», без повторов */
export function mistakeChips(list) {
  const out = [];
  for (const item of list || []) {
    String(item || '').replace(/^\s*(частая\s+)?ошибк[аи]\s*:\s*/i, '')
      .split(/\s*[,;]\s*|\s+или\s+/)
      .forEach((part) => {
        const v = lowerFirst(part.trim().replace(/[.!…]+$/, '').replace(/^(и|а)\s+/, ''));
        if (v.length > 1 && !out.some((x) => same(x, v))) out.push(v);
      });
  }
  return out;
}

/** Шаги настройки: «Сиденье — на уровне плеч» → { label, text } */
export function setupRows(lines) {
  return (lines || []).map((line) => {
    const { label, text } = stepLabel(line);
    return { label, text: String(text).trim().replace(/[.;]+$/, '') };
  });
}

function noteText(n) {
  if (!n) return null;
  return typeof n === 'string' ? { text: n } : n.text ? n : null;
}

/**
 * card — упражнение из базы (карточка программы или setups занятия),
 * notes — настройки клиента по ключам machineTarget, muscles — запасная
 * карта мышц (в программе приходит рядом с карточкой)
 */
export function techModel({ name = '', card = {}, muscles = null, notes = {}, targetOf = null }) {
  const c = card || {};
  const g = resolveGuidance(c);
  const tech = instructionParts(g.notes, g.mistakes);
  const machines = [g.primary, ...g.additional].filter(Boolean);
  // «Как настроить» упражнения: в карточке программы приходит только
  // проверенное, в занятии — с отметкой setupOk
  const principle = c.setupOk === false ? { steps: [], mistakes: [] } : instructionParts(c.setup || '');
  // Своей техники нет и тренажёра нет — шагами служит подготовка
  const prepAsSteps = !tech.steps.length && !machines.length;
  const steps = (prepAsSteps ? principle.steps : tech.steps).map(splitStep).filter((s) => s.main);
  const avoid = mistakeChips([...tech.mistakes, ...principle.mistakes]);

  const list = machines.map((m, i) => {
    const own = instructionParts(m.setup || '');
    // Общий принцип — у основного тренажёра, после его регулировок, без повторов
    const extra = i === 0 && !prepAsSteps ? principle.steps.filter((l) => !own.steps.some((x) => same(x, l))) : [];
    const photos = m.photos && m.photos.length ? m.photos : m.photo ? [m.photo] : [];
    return {
      uid: m.uid,
      name: m.name,
      kind: m.kind || 'machine',
      photos,
      note: targetOf ? noteText(notes[targetOf(m.uid)]) : null,
      setup: setupRows([...own.steps, ...extra]),
      // Стикеры и цифры на фото (16.11.2026): по одному на свою строку
      // настройки; общий принцип упражнения (extra) идёт после — без них
      meta: own.steps.map((_, k) => (Array.isArray(m.steps) && m.steps[k]) || {}),
      avoid: mistakeChips(own.mistakes),
    };
  });
  // Без тренажёра подготовка, если шаги свои, — второй вкладкой
  const prep = !machines.length && !prepAsSteps ? setupRows(principle.steps) : [];

  const map = c.muscles || muscles || null;
  return {
    title: c.shortName || name || c.name || '',
    full: c.shortName && (name || c.name) && !same(c.shortName, name || c.name) ? (name || c.name) : '',
    media: g.media || null,
    photo: (list[0] && list[0].photos[0]) || '',
    steps,
    avoid,
    machines: list,
    prep,
    tab: list.length ? (list.every((m) => m.kind === 'equipment') ? 'Оборудование' : 'Тренажёр') : prep.length ? 'Подготовка' : '',
    muscles: map && ((map.primary && map.primary.length) || (map.secondary && map.secondary.length)) ? map : null,
    muscleName: c.muscle || '',
    // Тренер отметил мышцы сам — показываем названия; нет — это группа
    // целиком («Ноги» = пять мышц), и честнее назвать группу
    musclesCustom: !!c.musclesCustom,
    alternatives: (c.alternatives || []).filter((a) => a && a.name).map((a) => ({ id: a.id, name: a.name })),
    // Своя настройка у упражнения без тренажёра (lib/machine-notes.js)
    note: !list.length && c.noteKey ? noteText(notes[c.noteKey]) : null,
  };
}

/** «4 × 15» из подходов занятия (без разминки) */
export function workoutPlan(sets) {
  const work = (sets || []).filter((s) => s.kind !== 'warmup');
  if (!work.length) return '';
  const reps = work.map((s) => String(s.reps || '').trim()).filter(Boolean);
  const all = reps.length && reps.every((r) => r === reps[0]) ? reps[0] : '';
  return all ? work.length + ' × ' + all : work.length + ' ' + (work.length === 1 ? 'подход' : work.length < 5 ? 'подхода' : 'подходов');
}

/** Прошлый раз в занятии: самый тяжёлый рабочий вес или вес прошлого месяца */
export function workoutLast(ex) {
  const ws = ((ex && ex.lastRun && ex.lastRun.weights) || []).map((w) => Number(String(w).replace(',', '.'))).filter((n) => n > 0);
  if (ws.length) return String(Math.max(...ws)).replace('.', ',') + ' кг';
  const prev = Number(String((ex && ex.prevWeight) || '').replace(',', '.'));
  return prev > 0 ? String(prev).replace('.', ',') + ' кг' : '';
}

/** «Сейчас · подход 2 из 4» и «20 кг × 15» — первый неотмеченный рабочий */
export function workoutNow(sets) {
  const work = (sets || []).filter((s) => s.kind !== 'warmup');
  const i = work.findIndex((s) => s.state !== 'done' && s.state !== 'skipped');
  if (i < 0) return null;
  const s = work[i];
  const w = String(s.weight || '').trim();
  const r = String(s.reps || '').trim();
  const value = [w ? w.replace('.', ',') + ' кг' : '', r ? (w ? '× ' : '') + r : ''].filter(Boolean).join(' ');
  return { set: i + 1, of: work.length, value };
}

/**
 * Подпись плитки «Мышцы» (владелец 15.11.2026: «Квадрицепс +4» непонятно):
 * размечено тренером — до двух названий или «X и ещё N»; по группе — группа
 */
export function muscleLine(names, group, custom) {
  if (!custom && group) return group;
  if (!names.length) return group || '';
  if (names.length <= 2) return names.join(', ');
  const n = names.length - 1;
  return names[0] + ' и ещё ' + n;
}
