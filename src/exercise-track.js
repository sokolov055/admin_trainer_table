/**
 * Тип учёта упражнения — что записывать в подходе. Тип приходит с
 * сервера (`track` у упражнения программы, server/src/lib/exercise-kind.js)
 * и живёт в снимке занятия; нет его — упражнение силовое, как раньше.
 *
 *   strength   — вес и повторы; perSide — вес одной стороны (гантели,
 *                Смит, рычажные), в объём удвоенный
 *   bodyweight — свой вес; вес — добавка (пояс с блином), assist —
 *                поддержка (резинка, гравитрон)
 *   timed      — статика на время (планка); число без двоеточия — секунды
 *   cardio     — тренажёр: время (число — минуты), и по тренажёру скорость
 *                с наклоном, уровень или нагрузка; дистанция, калории, пульс
 *
 * unilateral — «на сторону»: повторы одной ноги или руки; разошлись
 * стороны — left/right, а reps тогда меньшее из них.
 * drops — дропсет: сбросы веса внутри подхода, без отдыха.
 */

export const KIND_LABELS = {
  strength: 'Силовое',
  bodyweight: 'Собственный вес',
  timed: 'На время',
  cardio: 'Кардио',
};

export const MACHINE_LABELS = {
  treadmill: 'Беговая дорожка',
  skillmill: 'Механическая дорожка (SkillMill)',
  rower: 'Гребля (SkillRow)',
  elliptical: 'Эллипс',
  bike: 'Велотренажёр',
  stepper: 'Степпер',
  other: 'Другое',
};

const STRENGTH = { kind: 'strength', machine: '', unilateral: false, perSide: false };

export function trackOf(ex) {
  const plan = ex && ex.cardio;
  // Тренажёр, выбранный в кардио-плане, важнее угаданного по названию
  const t = plan && plan.machine ? { ...(ex.track || {}), kind: 'cardio', machine: plan.machine } : ex && ex.track;
  if (!t || !KIND_LABELS[t.kind]) return STRENGTH;
  const out = {
    kind: t.kind,
    machine: t.kind === 'cardio' ? (MACHINE_LABELS[t.machine] ? t.machine : 'other') : '',
    unilateral: t.kind !== 'cardio' && !!t.unilateral,
    perSide: t.kind === 'strength' && !!t.perSide,
  };
  if (out.kind === 'cardio') {
    const list = (t.metrics && t.metrics.length ? t.metrics : plan && plan.metrics) || [];
    out.goal = cardioGoal({ goal: t.goal || (plan && plan.goal), metrics: list, intervals: plan && plan.intervals });
    out.metrics = goalFirst(list, out.goal);
    // Настройки выбраны тренером (09.10.2026) — важнее тренажёра
    const modes = (plan && Array.isArray(plan.modes) && plan.modes) || (Array.isArray(t.modes) && t.modes);
    if (modes) out.modes = MODES.filter((m) => modes.includes(m));
    if ((t.speedUnit || (plan && plan.speedUnit)) === 'rpm' && (SPEED_UNIT_MACHINES.includes(out.machine) || out.modes)) out.speedUnit = 'rpm';
  }
  return out;
}

/* ---------------------------------------------------------------- кардио */

/** Что можно записывать у кардио; тренер выбирает любые, по умолчанию время */
export const METRICS = ['time', 'distance', 'kcal', 'pulse'];

/**
 * Главная цель кардио (FT-475, 07.10.2026): время, расстояние, калории или
 * интервалы — с неё начинаются план, отрезок в занятии и строка на часах.
 * Пульс — зона, а не итог, главной не бывает. Интервалы — цель «пройти
 * круги»: отдельной цели-числа у них нет. Нет отметки (старые планы) —
 * интервалы, если они есть, иначе время, если его записывают, иначе первое
 * из записываемого.
 */
export const GOALS = ['time', 'distance', 'kcal', 'intervals'];
const METRIC_GOALS = ['time', 'distance', 'kcal'];

export function cardioGoal(c) {
  // Пока тренер вписывает число кругов, их может не быть — цель та же
  if (c && c.goal === 'intervals' && c.intervals) return 'intervals';
  if (c && METRIC_GOALS.includes(c.goal)) return c.goal;
  if (c && !c.goal && c.intervals && Number(c.intervals.rounds) > 0) return 'intervals';
  const list = (c && c.metrics) || [];
  return METRIC_GOALS.find((m) => list.includes(m)) || 'time';
}

/**
 * Что записывать, по порядку: главная — первой (и всегда в списке). У
 * интервалов — выбранное тренером, ничего не выбрано — время
 */
export function goalFirst(list, goal) {
  if (!METRICS.includes(goal)) {
    const rest = METRICS.filter((m) => (list || []).includes(m));
    return rest.length ? rest : ['time'];
  }
  return [goal, ...METRICS.filter((m) => m !== goal && (list || []).includes(m))];
}

/**
 * Скорость у велотренажёра и прочих — в км/ч или в оборотах (об/мин): так
 * показывают разные тренажёры (владелец, 07.10.2026). У дорожки — км/ч.
 */
export const SPEED_UNIT_MACHINES = ['bike', 'other'];
// Об/мин разрешает trackOf: у тренажёра из списка или при настройках, выбранных тренером
const speedUnit = (track) => (track.speedUnit === 'rpm' && (SPEED_UNIT_MACHINES.includes(track.machine) || track.modes) ? 'об/мин' : 'км/ч');

export function metricField(key, track) {
  return {
    time: { key: 'time', head: 'Время, мин', short: 'Время', unit: 'мин', mode: 'text', max: 8, placeholder: '20' },
    distance: { key: 'distance', head: 'Расстояние, ' + distanceUnit(track), short: 'Расстояние', unit: distanceUnit(track), mode: 'decimal', max: 8 },
    kcal: { key: 'kcal', head: 'Калории', short: 'Калории', unit: 'ккал', mode: 'numeric', max: 5 },
    pulse: { key: 'pulse', head: 'Пульс', short: 'Пульс', unit: 'уд/мин', mode: 'numeric', max: 7 },
  }[key];
}

/**
 * Настройки кардио (09.10.2026, владелец): тренер сам выбирает любые из
 * скорости, наклона и уровня — modes в плане. Нет выбора (старые планы) —
 * по тренажёру: дорожка — скорость и наклон, велотренажёр и «другое» —
 * скорость (км/ч или об/мин) и уровень, остальные — уровень или нагрузка.
 */
export const MODES = ['speed', 'incline', 'level'];

export function machineModes(track) {
  if (track.machine === 'treadmill') return ['speed', 'incline'];
  if (SPEED_UNIT_MACHINES.includes(track.machine)) return ['speed', 'level'];
  return ['level'];
}

/** Все настройки с подписями — и для фаз интервалов, где их выбирают у каждой */
function settingDefs(track) {
  return {
    speed: { key: 'speed', head: 'Скорость, ' + speedUnit(track), unit: speedUnit(track), mode: 'decimal', max: 5 },
    incline: { key: 'incline', head: 'Наклон, %', unit: '%', mode: 'decimal', max: 5 },
    level: { key: 'level', head: levelWord(track), unit: levelWord(track) === 'Уровень' ? 'ур.' : 'нагр.', mode: 'decimal', max: 5 },
  };
}

export function settingsFields(track) {
  const all = settingDefs(track);
  const keys = track.modes || machineModes(track);
  return MODES.filter((k) => keys.includes(k)).map((k) => all[k]);
}

/** Режим строкой: «8 км/ч, 3%», «уровень 8», «90 об/мин, уровень 5» */
function modeText(p, track) {
  if (!p) return '';
  return [
    p.speed && p.speed + ' ' + speedUnit(track),
    p.incline && p.incline + '%',
    p.level && levelWord(track).toLowerCase() + ' ' + p.level,
  ].filter(Boolean).join(', ');
}

/** «1:30» → 90, «45» → 45 секунд */
export function seconds(value) {
  const v = String(value || '').trim();
  if (!v) return 0;
  const parts = v.split(':').map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

export function clockText(total) {
  const t = Math.max(0, Math.round(total));
  return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
}

/**
 * Интервалы (09.10.2026, владелец): в круге сколько угодно фаз, у каждой
 * своё название и свой набор — время, расстояние, калории, пульс, скорость,
 * наклон, уровень (fields), например ускорение — 20 ккал, замедление —
 * 6 км/ч. Старые планы — ускорение и замедление (fast/slow) с временем и
 * режимом — читаются как две фазы.
 */
export const PHASE_KEYS = ['time', 'distance', 'kcal', 'pulse', 'speed', 'incline', 'level'];
const PHASE_NAMES = ['Ускорение', 'Замедление'];
export const MAX_PHASES = 10;

export const phaseName = (p, i) => String((p && p.name) || '').trim() || PHASE_NAMES[i] || 'Интервал ' + (i + 1);

/** Что задано у фазы; у старой — время и то, что вписано */
export const phaseKeys = (p) => (p && Array.isArray(p.fields)
  ? PHASE_KEYS.filter((k) => p.fields.includes(k))
  : PHASE_KEYS.filter((k) => k === 'time' || (p && String(p[k] || '').trim())));

export function phasesOf(intervals) {
  if (!intervals) return [];
  if (Array.isArray(intervals.phases)) return intervals.phases;
  return [intervals.fast, intervals.slow].filter(Boolean).map((p) => ({ ...p, fields: phaseKeys(p) }));
}

/** Поле фазы по ключу: подпись, клавиатура, длина */
export function phaseField(key, track) {
  // Время интервала — секундами (владелец, FT-513): «30» — 30 с, «90» — полторы
  // минуты. Старые «1:00» читаются как раньше (seconds)
  if (key === 'time') return { key, head: 'Время, с', short: 'Время', mode: 'numeric', max: 4, placeholder: '30' };
  if (key === 'pulse') return { ...metricField(key, track), mode: 'text', max: 9, placeholder: '130–150' };
  if (METRICS.includes(key)) return metricField(key, track);
  const f = settingDefs(track)[key];
  return { ...f, short: key === 'speed' ? 'Скорость' : key === 'incline' ? 'Наклон' : levelWord(track) };
}

/** Фаза строкой без времени: «12 км/ч, 3%, 200 м, пульс 150–160» */
function phaseText(p, track) {
  if (!p) return '';
  const keys = phaseKeys(p);
  const v = (k) => keys.includes(k) && String(p[k] || '').trim();
  return [
    modeText({ speed: v('speed'), incline: v('incline'), level: v('level') }, track),
    v('distance') && v('distance') + ' ' + distanceUnit(track),
    v('kcal') && v('kcal') + ' ккал',
    v('pulse') && 'пульс ' + v('pulse'),
  ].filter(Boolean).join(', ');
}

const phaseSeconds = (p) => (phaseKeys(p).includes('time') ? seconds(p.time) : 0);

/**
 * Фазы интервалов по порядку, rounds раз. seconds: 0 — фаза без времени
 * («до 20 ккал»): таймер ждёт «Дальше»
 */
export function intervalPhases(intervals, track) {
  if (!intervals || !intervals.rounds) return [];
  const phases = phasesOf(intervals);
  const list = [];
  for (let r = 1; r <= intervals.rounds; r += 1) {
    phases.forEach((p, i) => {
      const secs = phaseSeconds(p);
      const mode = phaseText(p, track);
      if (secs > 0 || mode) list.push({ kind: i === 0 ? 'fast' : i === 1 ? 'slow' : 'p' + i, index: i, label: phaseName(p, i), round: r, seconds: secs, mode });
    });
  }
  return list;
}

/** Что записывать и какие настройки у отрезка — по фазам: время всегда */
export function intervalsUse(intervals) {
  const keys = new Set(phasesOf(intervals).flatMap(phaseKeys));
  return { metrics: METRICS.filter((m) => m === 'time' || keys.has(m)), modes: MODES.filter((m) => keys.has(m)) };
}

/** Интервалы строкой: «8 × ускорение 1:00 (12 км/ч, пульс 160) / замедление (20 ккал)» */
export function intervalsText(intervals, track) {
  if (!intervals || !intervals.rounds) return '';
  const part = (p, i) => {
    const secs = phaseSeconds(p);
    const mode = phaseText(p, track);
    if (!secs && !mode) return '';
    return phaseName(p, i).toLowerCase() + (secs ? ' ' + clockText(secs) : '') + (mode ? ' (' + mode + ')' : '');
  };
  return intervals.rounds + ' × ' + phasesOf(intervals).map(part).filter(Boolean).join(' / ');
}

/** План кардио строкой: цели, режим, интервалы */
export function cardioLine(plan, track) {
  const t = plan.targets || {};
  const goal = cardioGoal(plan);
  const targets = goalFirst(plan.metrics || ['time'], goal).map((m) => {
    if (!t[m]) return '';
    if (m === 'time') return timeText(t.time, track);
    if (m === 'pulse') return 'пульс ' + t.pulse;
    return t[m] + ' ' + metricField(m, track).unit;
  });
  // Интервалы главной целью — первыми
  const iv = plan.intervals && 'интервалы ' + intervalsText(plan.intervals, track);
  return [goal === 'intervals' && iv, ...targets, modeText(plan.settings, track), goal !== 'intervals' && iv]
    .filter(Boolean).join(' · ');
}

/**
 * Кардио-план из старой записи: время лежало в «повторах», режим — в
 * «весе» («6 км/ч, 5%», «уровень 8»).
 */
export function cardioFrom(ex, track) {
  if (ex.cardio) return ex.cardio;
  const set = planSet({ ...ex, cardio: null }, track);
  return {
    machine: track.machine || '',
    metrics: ['time'],
    targets: { time: set.time || '', distance: '', kcal: '', pulse: '' },
    settings: { speed: set.speed || '', incline: set.incline || '', level: set.level || '' },
    intervals: null,
  };
}

/** Записывается временем, а не повторами */
export const byTime = (track) => track.kind === 'cardio' || track.kind === 'timed';

/** У гребли дистанция в метрах — так её показывает тренажёр; у остальных км */
// Расстояние — в метрах у всех тренажёров (владелец, 07.10.2026: и раньше
// вписывал метры, а не километры)
const distanceUnit = () => 'м';
const levelWord = (track) => (track.machine === 'rower' || track.machine === 'skillmill' ? 'Нагрузка' : 'Уровень');

/**
 * Колонки строки подхода — то, что вписывают каждый подход. Остальное
 * (дистанция, калории, пульс, поддержка) — в «Настройках подхода».
 */
export function rowFields(track) {
  const weight = { key: 'weight', head: 'Вес, кг', unit: 'кг', mode: 'decimal', max: 12 };
  const reps = { key: 'reps', head: track.unilateral ? 'Повт. / стор.' : 'Повторы', unit: track.unilateral ? 'повт./стор.' : 'повт.', mode: 'numeric', max: 6 };
  const time = (unit) => ({ key: 'time', head: 'Время, ' + unit, unit, mode: 'text', max: 8, placeholder: unit === 'с' ? '60' : '20' });

  if (track.kind === 'cardio') {
    // Первая колонка — главная цель: время, расстояние или калории
    const first = (track.metrics && track.metrics[0]) || 'time';
    const goal = first !== 'time' ? metricField(first, track) : null;
    const list = [goal ? { ...goal, head: goal.short } : time('мин')];
    settingsFields(track).forEach((f) => list.push(f.key === 'speed'
      ? { ...f, head: speedUnit(track) === 'км/ч' ? 'Км/ч' : 'Об/мин' }
      : f.key === 'level' ? { ...f, unit: 'ур.' } : f));
    return list;
  }
  if (track.kind === 'timed') return [{ ...weight, head: 'Доп. вес', placeholder: 'свой' }, time('с')];
  if (track.kind === 'bodyweight') return [{ ...weight, head: 'Доп. вес, кг', placeholder: 'свой' }, reps];
  return [track.perSide ? { ...weight, head: 'Кг / сторона', unit: 'кг/стор.' } : weight, reps];
}

/** Поля кардио в настройках подхода */
export function cardioExtras(track) {
  return [
    { key: 'distance', head: 'Дистанция, ' + distanceUnit(track), mode: 'decimal', max: 8 },
    { key: 'kcal', head: 'Калории', mode: 'numeric', max: 5 },
    { key: 'pulse', head: 'Пульс', mode: 'numeric', max: 3 },
  ];
}

const TIME = /^\d{1,3}(:[0-5]\d){0,2}$/;
const num = (v) => Number(String(v || '').replace(',', '.')) || 0;

/**
 * Чего не хватает, чтобы отметить подход выполненным; пусто — всё есть.
 * Сервер проверяет то же самое (validateSession).
 */
export function missing(set, track) {
  if (track.kind === 'cardio') {
    const any = TIME.test(String(set.time || '')) || num(set.distance) > 0 || num(set.kcal) > 0;
    return any ? '' : 'Введите время, расстояние или калории перед отметкой.';
  }
  if (byTime(track)) return TIME.test(String(set.time || '')) ? '' : 'Введите время перед отметкой: минуты или мм:сс.';
  // Силовое: вес обязателен — число от нуля (владелец, 07.10.2026). Пустой вес
  // раньше сохранялся, и «было» у следующего раза нечем было считать. Со своим
  // весом и статикой вес — «добавка», он может быть пустым
  if (track.kind === 'strength' && !/^\d+([.,]\d+)?$/.test(String(set.weight || '').trim())) {
    return 'Введите вес перед отметкой подхода — число, 0 и больше.';
  }
  return /^\d+$/.test(String(set.reps || '')) && Number(set.reps) >= 1 ? '' : 'Введите число повторов перед отметкой подхода.';
}

/** «20» → «20 мин» (у статики — «60 с»), «20:30» — как есть */
export function timeText(value, track) {
  const v = String(value || '');
  if (!v) return '';
  if (v.includes(':')) return v;
  return v + (track.kind === 'timed' ? ' с' : ' мин');
}

function weightText(set, track) {
  if (track.kind === 'bodyweight' || track.kind === 'timed') {
    if (set.weight) return '+' + set.weight + ' кг';
    if (set.assist) return 'поддержка: ' + set.assist;
    return track.kind === 'bodyweight' ? 'свой вес' : '';
  }
  return set.weight ? set.weight + (setOneSide(set, track) ? ' кг/стор.' : ' кг') : '';
}

function repsText(set, track) {
  if (set.left && set.right && set.left !== set.right) return 'Л ' + set.left + ' / П ' + set.right;
  return (set.reps || '?') + (track.unilateral ? ' на ст.' : '');
}

const dropsText = (set) => (set.drops || [])
  .map((d) => ' → ' + (d.weight ? d.weight + ' × ' : '') + (d.reps || '?')).join('');

/** Один подход строкой: «40 кг × 8 → 30 × 6», «20 мин · 8 км/ч · 3%» */
export function setText(set, track = STRENGTH) {
  if (track.kind === 'cardio') {
    const parts = [
      ['time', timeText(set.time, track)],
      ['speed', set.speed && set.speed + ' ' + speedUnit(track)],
      ['incline', set.incline && set.incline + '%'],
      ['level', set.level && levelWord(track).toLowerCase() + ' ' + set.level],
      ['distance', set.distance && set.distance + ' ' + distanceUnit(track)],
      ['kcal', set.kcal && set.kcal + ' ккал'],
      ['pulse', set.pulse && 'пульс ' + set.pulse],
    ];
    // Главная цель — первой: «3000 м · 8 км/ч · 18 мин»
    const goal = track.goal || 'time';
    return [...parts.filter(([k]) => k === goal), ...parts.filter(([k]) => k !== goal)]
      .map(([, v]) => v).filter(Boolean).join(' · ') || '?';
  }
  if (track.kind === 'timed') return [timeText(set.time, track) || '?', weightText(set, track)].filter(Boolean).join(' · ');
  const w = weightText(set, track);
  return (w ? w + ' × ' : '') + repsText(set, track) + dropsText(set);
}

/**
 * Одинаковые подходы — «3 × 12 · 20 кг», разные — каждый через запятую.
 * rounds: false — без числа подходов (в суперсете круги стоят у скобки).
 */
export function setsLine(sets, track = STRENGTH, rounds = true) {
  const list = sets || [];
  if (!list.length) return '';
  const key = (x) => setText(x, track);
  const same = list.every((x) => key(x) === key(list[0]));
  if (!same) return list.map(key).join(', ');
  const one = list[0];
  if (track.kind === 'cardio' || track.kind === 'timed' || one.drops?.length || (one.left && one.right && one.left !== one.right)) {
    return (rounds && list.length > 1 ? list.length + ' × ' : '') + key(one);
  }
  const w = weightText(one, track);
  const r = repsText(one, track);
  return (rounds ? list.length + ' × ' + r : r + ' повт.') + (w ? ' · ' + w : '');
}

/** Объём подхода, кг × повторы: сторона ×2, на сторону ×2, сбросы — тоже */
export function volumeOf(set, track = STRENGTH) {
  if (byTime(track) || track.kind === 'bodyweight') return 0;
  const k = (setOneSide(set, track) ? 2 : 1) * (track.unilateral ? 2 : 1);
  const one = (w, r) => num(w) * (Number(r) || 0) * k;
  return one(set.weight, set.reps) + (set.drops || []).reduce((n, d) => n + one(d.weight, d.reps), 0);
}

/**
 * Приём упражнения в программе (03.10.2026): разминочные подходы в начале
 * и дропсет в последнем — одним полем technique: 'warmup2 dropset',
 * 'dropset', 'warmup1'. Отдельной колонки нет: поле уже ходит везде —
 * программа, шаблоны, занятие
 */
export function techniqueOf(t) {
  const s = String(t || '');
  const m = s.match(/warmup(\d)/);
  // side1 / side2 — вес в программе на одну сторону или на обе (07.10.2026);
  // нет отметки — как у упражнения в базе (perSide)
  const side = /(^|\s)side1(\s|$)/.test(s) ? 'one' : /(^|\s)side2(\s|$)/.test(s) ? 'two' : '';
  return { dropset: /(^|\s)dropset(\s|$)/.test(s), warmup: m ? Math.min(5, Number(m[1])) : 0, side };
}

export function techniqueText({ dropset = false, warmup = 0, side = '' } = {}) {
  const n = Math.max(0, Math.min(5, Math.floor(Number(warmup) || 0)));
  return [n ? 'warmup' + n : '', dropset ? 'dropset' : '', side === 'one' ? 'side1' : side === 'two' ? 'side2' : ''].filter(Boolean).join(' ');
}

/**
 * Вес на одну сторону (гантель в руке, блины с одной стороны) — у силового.
 * В программе — отметка тренера (technique side1/side2), без неё — как в базе;
 * в занятии — у каждого подхода своя (set.side), у старых занятий — как в базе.
 * Работа одной стороной (unilateral, «по одной стороне») — это про повторы
 */
export function planOneSide(ex) {
  const track = trackOf(ex);
  if (track.kind !== 'strength') return false;
  const side = techniqueOf(ex && ex.technique).side;
  return side ? side === 'one' : !!track.perSide;
}

export function setOneSide(set, track = STRENGTH) {
  if (track.kind !== 'strength') return false;
  return set && (set.side === 'one' || set.side === 'two') ? set.side === 'one' : !!track.perSide;
}

/**
 * План упражнения строкой — для программы и подсказки в занятии.
 * У кардио в «повторах» программы — время («20 мин»), в «весе» — режим
 * («8 км/ч, 3%»): колонки те же, смысл по типу.
 */
export function planScheme(ex, inSuperset = false) {
  const track = trackOf(ex);
  const sets = String(ex.sets || '');
  const reps = String(ex.reps || '');
  if (track.kind === 'cardio' && ex.cardio) return cardioLine(ex.cardio, track);
  if (track.kind === 'cardio') {
    const time = /^\d+$/.test(reps) ? reps + ' мин' : reps;
    return [(Number(sets) > 1 ? sets + ' × ' : '') + time, ex.weight].filter(Boolean).join(' · ');
  }
  const unit = track.kind === 'timed' && /^\d+$/.test(reps) ? ' с' : '';
  const side = track.unilateral && reps ? ' на сторону' : '';
  const base = inSuperset ? (reps && reps + unit + (unit ? '' : ' повт.') + side) : (sets && sets + ' × ' + (reps || '?') + unit + side);
  const tech = techniqueOf(ex.technique);
  // Разминка — перед схемой: «2 разм. + 4 × 12»
  return [(tech.warmup && base ? tech.warmup + ' разм. + ' : '') + base, tech.dropset && 'дропсет в последнем'].filter(Boolean).join(' · ');
}

/**
 * Что вписать в подход из плана: время — из «повторов», если там число;
 * у кардио режим тренажёра — из «веса»: «6 км/ч, 5%» → скорость и наклон,
 * «уровень 8» → уровень.
 */
export function planSet(ex, track) {
  if (track.kind === 'cardio' && ex.cardio) {
    const c = ex.cardio;
    const st = c.settings || {};
    const out = {};
    ['speed', 'incline', 'level'].forEach((k) => { if (st[k]) out[k] = String(st[k]).replace(',', '.'); });
    // Цель — как повторы у силового: чаще всего так и сделают. Время — если
    // его записывают, главная цель — всегда: по ней отрезок и отмечают
    const t = c.targets || {};
    const goal = cardioGoal(c);
    const time = String(t.time || '');
    if (((c.metrics || ['time']).includes('time') || goal === 'time') && /^\d{1,3}(:[0-5]\d){0,2}$/.test(time)) out.time = time;
    const amount = String(t[goal] || '').trim();
    if (goal !== 'time' && /^\d+([.,]\d+)?$/.test(amount)) out[goal] = amount.replace(',', '.');
    // Интервалы: время отрезка — все круги подряд, «6 × (1:00 + 2:00)» → 18:00
    // Время — только если оно есть у каждой фазы: иначе итог не сосчитать
    const phases = phasesOf(c.intervals);
    if (goal === 'intervals' && !out.time && (c.metrics || ['time']).includes('time') && phases.every((p) => phaseSeconds(p) > 0)) {
      const total = intervalPhases(c.intervals, track).reduce((n, p) => n + p.seconds, 0);
      if (total > 0 && total < 1000 * 60) out.time = clockText(total);
    }
    // Расстояние и калории фаз — тоже за все круги: 6 × (200 + 300) → 3000 м
    if (goal === 'intervals' && c.intervals) {
      ['distance', 'kcal'].forEach((m) => {
        if (out[m] || !(c.metrics || []).includes(m)) return;
        const one = phases.reduce((n, p) => n + (phaseKeys(p).includes(m) ? num(p[m]) : 0), 0);
        const total = Math.round(one * (Number(c.intervals.rounds) || 0) * 100) / 100;
        if (total > 0) out[m] = String(total);
      });
    }
    return out;
  }
  const reps = String(ex.reps || '');
  if (byTime(track)) {
    const m = reps.match(/^(\d{1,3}(:[0-5]\d){0,2})/);
    const out = { time: m ? m[1] : '' };
    if (track.kind !== 'cardio') return out;
    const mode = String(ex.weight || '').replace(/,(\d)/g, '.$1');
    const numAt = (re) => { const x = mode.match(re); return x ? x[1] : ''; };
    if (track.machine === 'treadmill') {
      const speed = numAt(/(\d+(?:\.\d+)?)\s*км/);
      const incline = numAt(/(\d+(?:\.\d+)?)\s*%/);
      return { ...out, ...(speed ? { speed } : {}), ...(incline ? { incline } : {}) };
    }
    const level = track.machine !== 'other' && numAt(/(\d+(?:\.\d+)?)/);
    return { ...out, ...(level ? { level } : {}) };
  }
  return { reps: /^\d+$/.test(reps) ? reps : '' };
}
