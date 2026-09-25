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
    out.metrics = METRICS.filter((m) => list.includes(m));
    if (!out.metrics.length) out.metrics = ['time'];
  }
  return out;
}

/* ---------------------------------------------------------------- кардио */

/** Что можно записывать у кардио; тренер выбирает любые, по умолчанию время */
export const METRICS = ['time', 'distance', 'kcal', 'pulse'];

export function metricField(key, track) {
  return {
    time: { key: 'time', head: 'Время, мин', short: 'Время', unit: 'мин', mode: 'text', max: 8, placeholder: '20' },
    distance: { key: 'distance', head: 'Расстояние, ' + distanceUnit(track), short: 'Расстояние', unit: distanceUnit(track), mode: 'decimal', max: 8 },
    kcal: { key: 'kcal', head: 'Калории', short: 'Калории', unit: 'ккал', mode: 'numeric', max: 5 },
    pulse: { key: 'pulse', head: 'Пульс', short: 'Пульс', unit: 'уд/мин', mode: 'numeric', max: 7 },
  }[key];
}

/** Основной режим тренажёра: дорожка — скорость и наклон, эллипс — уровень, гребля — нагрузка */
export function settingsFields(track) {
  if (track.machine === 'treadmill') {
    return [
      { key: 'speed', head: 'Скорость, км/ч', unit: 'км/ч', mode: 'decimal', max: 5 },
      { key: 'incline', head: 'Наклон, %', unit: '%', mode: 'decimal', max: 5 },
    ];
  }
  if (track.machine === 'other') return [];
  return [{ key: 'level', head: levelWord(track), unit: levelWord(track) === 'Уровень' ? 'ур.' : 'нагр.', mode: 'decimal', max: 5 }];
}

/** Режим строкой: «8 км/ч, 3%», «уровень 8» */
function modeText(p, track) {
  if (!p) return '';
  if (track.machine === 'treadmill') return [p.speed && p.speed + ' км/ч', p.incline && p.incline + '%'].filter(Boolean).join(', ');
  return p.level ? levelWord(track).toLowerCase() + ' ' + p.level : '';
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

/** Фазы интервалов по порядку: ускорение, замедление — rounds раз */
export function intervalPhases(intervals, track) {
  if (!intervals || !intervals.rounds) return [];
  const list = [];
  for (let r = 1; r <= intervals.rounds; r += 1) {
    [['fast', 'Ускорение'], ['slow', 'Замедление']].forEach(([k, label]) => {
      const p = intervals[k] || {};
      const secs = seconds(p.time);
      if (secs > 0) list.push({ kind: k, label, round: r, seconds: secs, mode: modeText(p, track) });
    });
  }
  return list;
}

/** Интервалы строкой: «8 × ускорение 1:00 (12 км/ч) / замедление 2:00 (6 км/ч)» */
export function intervalsText(intervals, track) {
  if (!intervals || !intervals.rounds) return '';
  const part = (p, label) => {
    const secs = seconds(p && p.time);
    const mode = modeText(p, track);
    return secs ? label + ' ' + clockText(secs) + (mode ? ' (' + mode + ')' : '') : '';
  };
  return intervals.rounds + ' × ' + [part(intervals.fast, 'ускорение'), part(intervals.slow, 'замедление')].filter(Boolean).join(' / ');
}

/** План кардио строкой: цели, режим, интервалы */
export function cardioLine(plan, track) {
  const t = plan.targets || {};
  const targets = (plan.metrics || ['time']).map((m) => {
    if (!t[m]) return '';
    if (m === 'time') return timeText(t.time, track);
    if (m === 'pulse') return 'пульс ' + t.pulse;
    return t[m] + ' ' + metricField(m, track).unit;
  });
  return [...targets, modeText(plan.settings, track), plan.intervals && 'интервалы ' + intervalsText(plan.intervals, track)]
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
const distanceUnit = (track) => (track.machine === 'rower' ? 'м' : 'км');
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
    const list = [time('мин')];
    if (track.machine === 'treadmill') {
      list.push({ key: 'speed', head: 'Км/ч', unit: 'км/ч', mode: 'decimal', max: 5 });
      list.push({ key: 'incline', head: 'Наклон, %', unit: '%', mode: 'decimal', max: 5 });
    } else if (track.machine !== 'other') {
      list.push({ key: 'level', head: levelWord(track), unit: 'ур.', mode: 'decimal', max: 5 });
    }
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
  return set.weight ? set.weight + (track.perSide ? ' кг/стор.' : ' кг') : '';
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
    return [
      timeText(set.time, track),
      set.speed && set.speed + ' км/ч',
      set.incline && set.incline + '%',
      set.level && levelWord(track).toLowerCase() + ' ' + set.level,
      set.distance && set.distance + ' ' + distanceUnit(track),
      set.kcal && set.kcal + ' ккал',
      set.pulse && 'пульс ' + set.pulse,
    ].filter(Boolean).join(' · ') || '?';
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
  const k = (track.perSide ? 2 : 1) * (track.unilateral ? 2 : 1);
  const one = (w, r) => num(w) * (Number(r) || 0) * k;
  return one(set.weight, set.reps) + (set.drops || []).reduce((n, d) => n + one(d.weight, d.reps), 0);
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
  return [base, ex.technique === 'dropset' && 'дропсет в последнем'].filter(Boolean).join(' · ');
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
    // Время-цель — как повторы у силового: чаще всего так и сделают
    const time = String((c.targets && c.targets.time) || '');
    if ((c.metrics || ['time']).includes('time') && /^\d{1,3}(:[0-5]\d){0,2}$/.test(time)) out.time = time;
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
