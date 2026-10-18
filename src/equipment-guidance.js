/** FT-570: единственный источник настройки. Порядок связей не означает основное оборудование. */
export function primaryEquipment(exercise) {
  const items = Array.isArray(exercise?.machines) ? exercise.machines : [];
  if (exercise?.primaryEquipmentUid) return items.find((m) => m.uid === exercise.primaryEquipmentUid) || null;
  return items.length === 1 ? items[0] : null;
}

export function resolveGuidance(exercise = {}) {
  const items = Array.isArray(exercise.machines) ? exercise.machines : [];
  const primary = primaryEquipment(exercise);
  const setup = items.length ? (primary?.setupOk === false ? '' : primary?.setup || '') : (exercise.setupOk === false ? '' : exercise.setup || '');
  return { primary, setup, source: items.length ? (primary ? 'equipment' : 'unselected') : 'exercise',
    additional: items.filter((m) => m.uid !== primary?.uid), notes: exercise.notes || '', mistakes: exercise.mistakes || '', media: exercise.media || null, muscles: exercise.muscles || null };
}

/** Старые «Ошибка: …» выносятся из текста; отдельные ошибки не дублируются. */
export function instructionParts(text, extra = '') {
  const steps = [], mistakes = [];
  const add = (value) => {
    const v = value.trim().replace(/^ошибк[аи]\s*:\s*/i, '');
    if (v && !mistakes.some((x) => x.toLocaleLowerCase('ru') === v.toLocaleLowerCase('ru'))) mistakes.push(v);
  };
  String(text || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean).forEach((line) => {
    if (/^ошибк[аи]\s*:/i.test(line)) add(line); else steps.push(line);
  });
  String(extra || '').split(/\r?\n/).forEach(add);
  return { steps: steps.filter((line) => !mistakes.some((x) => x.toLocaleLowerCase('ru') === line.toLocaleLowerCase('ru'))), mistakes };
}

/** Сравнение строк без регистра, знаков и лишних пробелов */
const same = (s) => String(s).toLocaleLowerCase('ru').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * Вариант А (18.10.2026): одна нумерация — сначала подготовка тренажёра,
 * потом движение. Строка, которая есть и в карточке тренажёра, и в технике
 * упражнения, выводится один раз; ошибки обоих источников — одним списком.
 */
export function guideSteps(g) {
  const setup = instructionParts(g.setup);
  const tech = instructionParts(g.notes, g.mistakes);
  const seen = new Set(setup.steps.map(same));
  const move = tech.steps.filter((line) => !seen.has(same(line)));
  const mistakes = [];
  const known = new Set();
  [...setup.mistakes, ...tech.mistakes].forEach((m) => {
    if (known.has(same(m))) return;
    known.add(same(m));
    mistakes.push(m.charAt(0).toLocaleUpperCase('ru') + m.slice(1));
  });
  return { prep: setup.steps, move, mistakes };
}

/** «Сиденье — на уровне плеч»: короткое слово до тире — метка шага */
export function stepLabel(line) {
  const m = String(line).match(/^([^—–]{2,30}?)\s[—–]\s([\s\S]+)$/);
  return m && m[1].trim().split(/\s+/).length <= 2 ? { label: m[1].trim(), text: m[2] } : { label: '', text: line };
}
