/**
 * «Легко / Норм / Тяжело» вместо галочки подхода (решения владельца
 * 03.10.2026). Оценка остаётся у подхода (set.effort), и по ней занятие
 * само подстраивает вес и отдых. Те же правила — на часах
 * (WorkoutState.swift) и на сервере для часов (watch-workout.js).
 *
 * Что значит оценка (подсказка под кнопками):
 *   легко  — мог бы сделать ещё 3 и больше повторов;
 *   норм   — в запасе 1–2 повтора;
 *   тяжело — на пределе или не добил.
 *
 * Вес — главный рычаг, отдых — запасной:
 *   1. Легко → следующим подходам +шаг. Не больше двух прибавок за
 *      занятие на упражнение (случайное «легко» не уводит вес далеко);
 *      прибавлять некуда (свой вес, потолок) — отдых на 30 с короче.
 *   2. Норм → вес и отдых как есть.
 *   3. Тяжело и повторов меньше плана → −шаг сразу: не добил.
 *   4. Тяжело второй раз подряд → −шаг.
 *   5. Тяжело один раз, повторы сделаны → вес держим, отдых на 30 с дольше.
 *      Тяжело всегда даёт +30 с отдыха.
 *   Разминочные подходы вес не двигают. Новый вес встаёт только в
 *   нетронутые подходы того же человека: что вписано руками — не трогаем.
 *
 * Суперсет: оценка — у каждого упражнения круга, вес правится у каждого
 * своим шагом. Не последнее в круге — отдых не запускает, это «дальше».
 * Последнее — отдых по кругу: хоть одно тяжело → +30 с; все легко и
 * прибавить было некуда → −30 с; иначе как выбран.
 *
 * Внутри занятия подходы идут лесенкой (100 · 120 · 140 · 160) или первый
 * легче остальных, поэтому «легко» прибавляет только после самого
 * тяжёлого подхода — лёгкий разминочный и должен быть лёгким; «тяжело»
 * снимает шаг со всех следующих подходов не легче этого.
 *
 * Следующее занятие — подходы как в последний раз у клиента в этом
 * упражнении, сдвинутые по оценкам; считает сервер (server/src/lib/
 * effort.js, startPlan), здесь — только подсказка lastRunText.
 *
 * Шаг веса (stepOf) — по группе мышц и снаряду из базы, без них — по
 * названию:
 *   ноги, ягодицы: базовые (присед, жим ногами, тяги, выпады, мост) — 10 кг,
 *                  изолирующие (разгибания, сгибания, отведения) — 5 кг;
 *   спина: 5 кг, изолирующие (пуловер, гиперэкстензия) — 2,5 кг;
 *   грудь, плечи, руки, остальное — 2,5 кг;
 *   гантели и гири — на одну: ноги, спина, грудь — 2 кг, остальное — 1 кг.
 *   Вес меньше четырёх шагов — шаг вдвое меньше (на присед с 30 кг
 *   не +10, а +5).
 */

export const EFFORTS = [
  { key: 'easy', label: 'Легко' },
  { key: 'ok', label: 'Норм' },
  { key: 'hard', label: 'Тяжело' },
];

export const EFFORT_WORD = { easy: 'легко', ok: 'нормально', hard: 'тяжело' };

export const EFFORT_HINT = 'Легко — мог ещё 3 повтора и больше, норм — 1–2 в запасе, тяжело — на пределе';

/** Сколько прибавок веса за занятие на одно упражнение */
export const MAX_RAISES = 2;

const num = (v) => Number(String(v ?? '').replace(',', '.'));

const text = (kg) => {
  const r = Math.round(kg * 100) / 100;
  return String(r).replace(/\.0+$/, '');
};

const has = (s, words) => words.some((w) => s.includes(w));

const LEGS = ['присед', 'жим ног', 'жим платформ', 'гакк', 'выпад', 'болгарск', 'становая', 'румынск', 'мост', 'hip thrust', 'зашагив', 'ног', 'носк', 'икр'];
const BACK = ['тяга', 'тяги', 'подтяг', 'пуловер', 'гиперэкст', 'шраг', 'спин'];
const CHEST = ['лёжа', 'лежа', 'жим на наклон', 'жим в тренаж', 'брусья', 'разводк', 'сведени', 'бабочк', 'кроссовер', 'отжиман'];
const ISOLATION = ['разгибан', 'сгибан', 'отведен', 'приведен', 'мах', 'разводк', 'сведени', 'бицепс', 'трицепс', 'икр', 'носки', 'пуловер', 'гиперэкст', 'шраг', 'кроссовер'];
const DUMBBELL = ['гантел', 'гир'];

/** Группа мышц упражнения: из базы (ex.load.muscle), без неё — по названию */
export function groupOf(ex) {
  const muscle = String((ex.load && ex.load.muscle) || '').toLowerCase();
  if (muscle) {
    if (muscle === 'ноги' || muscle === 'ягодицы') return 'legs';
    if (muscle === 'спина') return 'back';
    if (muscle === 'грудь') return 'chest';
    return 'other';
  }
  const name = String(ex.name || '').toLowerCase();
  // Ноги первыми: тяга бывает становой и румынской, «лёжа» — и сгибание ног
  if (has(name, LEGS) || has(name, ['мёртв', 'мертв'])) return 'legs';
  // Спина раньше груди: «тяга блока к груди», «пуловер лёжа»
  if (has(name, BACK)) return 'back';
  if (has(name, CHEST)) return 'chest';
  return 'other';
}

/** Шаг веса для упражнения при текущем весе kg */
export function stepOf(ex, kg) {
  const name = String(ex.name || '').toLowerCase();
  const equipment = String((ex.load && ex.load.equipment) || '').toLowerCase();
  const group = groupOf(ex);
  const isolation = has(name, ISOLATION);
  let step;
  if (has(equipment, DUMBBELL) || has(name, DUMBBELL)) step = group === 'other' || isolation ? 1 : 2;
  else if (group === 'legs') step = isolation ? 5 : 10;
  else if (group === 'back') step = isolation ? 2.5 : 5;
  else step = 2.5;
  // Лёгкий вес — шаг вдвое меньше: +10 к 30 кг — треть веса
  if (kg > 0 && kg < step * 4) step = Math.max(1, step / 2);
  return step;
}

/** Гантели и гири — на часах шаг колёсика 1 кг, остальное — 1,25 */
export function isDumbbell(ex) {
  const equipment = String((ex.load && ex.load.equipment) || '').toLowerCase();
  return has(equipment, DUMBBELL) || has(String(ex.name || '').toLowerCase(), DUMBBELL);
}

/** Повторов по плану: «8», «8–12» → нижняя граница; нет плана — 0 */
export function targetOf(ex) {
  const m = String(ex.target || '').match(/^(\d{1,3})/);
  return m ? Number(m[1]) : 0;
}

/** Отдых после подхода: тяжело — +30 с, легко без прибавки — −30 с */
export function restFor(effort, base, raised = false) {
  if (!base) return 0;
  if (effort === 'hard') return Math.min(1800, base + 30);
  if (effort === 'easy' && !raised) return Math.max(30, base - 30);
  return base;
}

/**
 * Отдых после круга суперсета: хоть одно тяжело — дольше; все легко и
 * прибавить было некуда — короче; иначе как выбран
 */
export function roundRest(efforts, base, raised = false) {
  if (!base) return 0;
  if (efforts.includes('hard')) return Math.min(1800, base + 30);
  if (efforts.length && efforts.every((e) => e === 'easy') && !raised) return Math.max(30, base - 30);
  return base;
}

/**
 * Подход si отмечен оценкой effort. Возвращает упражнение (у подхода —
 * оценка, у следующих подходов того же человека — новый вес с причиной в
 * suggest) и что сделано с весом: raised / lowered. Вес, вписанный
 * руками (own), и разминку не трогаем.
 */
export function rateSet(ex, si, effort) {
  const set = ex.sets[si];
  const who = set.who || '';
  const mine = (x) => (x.who || '') === who;
  const cur = num(set.weight);
  const work = set.kind !== 'warmup';
  const own = ex.sets.filter((x) => mine(x) && x.kind !== 'warmup');
  const before = ex.sets.slice(0, si).filter((x) => mine(x) && x.state === 'done' && x.kind !== 'warmup');
  const last = before[before.length - 1];
  const raises = before.filter((x) => x.raised).length;
  // Самый тяжёлый подход упражнения — по нему решаем, прибавлять ли
  const heaviest = cur > 0 && cur >= Math.max(0, ...own.map((x) => num(x.weight)).filter(Number.isFinite));
  let dir = 0;
  let suggest = '';
  if (work && cur > 0) {
    const target = targetOf(ex);
    const short = target > 0 && num(set.reps) > 0 && num(set.reps) < target;
    if (effort === 'easy' && heaviest && raises < MAX_RAISES) { dir = 1; suggest = 'easy'; }
    else if (effort === 'hard' && short) { dir = -1; suggest = 'short'; }
    else if (effort === 'hard' && last && last.effort === 'hard') { dir = -1; suggest = 'hard'; }
  }
  let changed = false;
  const sets = ex.sets.map((x, i) => {
    if (i === si) return { ...x, state: 'done', effort, ...(dir > 0 ? { raised: true } : {}) };
    if (!dir || i < si || !mine(x) || x.state !== 'pending' || x.kind === 'warmup' || x.own) return x;
    const w = num(x.weight);
    // Двигаем подходы не легче этого: лесенка ниже — своя
    if (!(w > 0) || w < cur) return x;
    changed = true;
    return { ...x, weight: text(Math.max(0, w + dir * stepOf(ex, w))), suggest };
  });
  return { ex: { ...ex, sets }, raised: dir > 0 && changed, lowered: dir < 0 && changed };
}

/** Для старых вызовов: только упражнение */
export function applyEffort(ex, si, effort) {
  return rateSet(ex, si, effort).ex;
}

/** Снять отметку: оценка и признак прибавки уходят вместе с ней */
export function unrate(set) {
  const { effort, raised, ...rest } = set;
  return { ...rest, state: 'pending' };
}

const WHY = { easy: 'было легко', short: 'не добил повторы', hard: 'дважды тяжело' };

/** Подпись подобранного веса: «+2,5 кг · было легко» */
export function suggestText(set, prev) {
  if (!set.suggest || !prev) return '';
  const b = num(set.weight);
  const a = prev ? num(prev.weight) : 0;
  if (!(a > 0) || !(b >= 0) || a === b) return '';
  const diff = text(Math.abs(b - a)).replace('.', ',');
  // Без стрелки-символа: направление рисует значок (IconDelta, на часах — SF Symbol)
  return (b > a ? '+' : '−') + diff + ' кг · ' + (WHY[set.suggest] || '');
}

const plural = (n, one, few, many) => {
  const a = n % 10, b = n % 100;
  return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many;
};

/**
 * Подсказка над подходами (владелец, 03.10.2026): «Последний раз (01.10)
 * вы делали 100 · 120 · 140 · 160 кг на 12 повторов, вам было нормально —
 * сегодня как в прошлый раз». Повторы обязательно: 100 кг на 3 и на 12 —
 * разное.
 */
export function lastRunText(last) {
  if (!last || !Array.isArray(last.weights) || !last.weights.length) return '';
  const reps = Array.isArray(last.reps) ? last.reps : [];
  const same = reps.length && reps.every((r) => r && r === reps[0]);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(last.date || '') ? ' (' + last.date.slice(8, 10) + '.' + last.date.slice(5, 7) + ')' : '';
  const what = same
    ? last.weights.join(' · ') + ' кг на ' + reps[0] + ' ' + plural(Number(reps[0]), 'повтор', 'повтора', 'повторов')
    : last.weights.map((w, i) => w + (reps[i] ? '×' + reps[i] : '')).join(' · ') + ' кг';
  const felt = last.effort ? ', вам было ' + EFFORT_WORD[last.effort] : '';
  const step = String(last.step || '').replace('.', ',');
  const today = {
    up: last.effort === 'ok' ? 'норм ' + last.streak + ' раза подряд — сегодня пробуем +' + step + ' кг' : 'сегодня +' + step + ' кг',
    down: 'сегодня −' + step + ' кг',
    same: 'сегодня так же',
    // Повторы другие — вес пересчитан в соотношении (сервер, scaleTo)
    scaled: 'сегодня на ' + (last.planReps || '') + ' ' + plural(Number(last.planReps), 'повтор', 'повтора', 'повторов') + ', это примерно ' + String(last.scaled || '').replace('.', ',') + ' кг',
  }[last.action] || '';
  return 'Последний раз' + date + ' вы делали ' + what + felt + (today ? ' — ' + today : '');
}
