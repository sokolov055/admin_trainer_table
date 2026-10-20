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
 *      прибавлять некуда (свой вес без нагрузки, помощь уже 0) — отдых
 *      на 30 с короче (capped). Легко на лёгком подходе лесенки или после
 *      двух прибавок — отдых обычный: вес впереди ещё растёт.
 *   2. Норм → вес и отдых как есть.
 *   3. Тяжело и повторов меньше плана → −шаг сразу: не добил.
 *   4. Тяжело второй раз подряд → −шаг, но один раз: прошлое «тяжело»
 *      уже сняло шаг — третье подряд вес не трогает (20.10.2026).
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
 * Вес следующих подходов отсчитывается от сделанного сейчас, а не от веса
 * прошлой тренировки: прошлый раз 50 · 50 · 50, сегодня 60 и «легко» — дальше
 * 62,5, а не 50. Лесенка прошлого раза сохраняется (подход, что был тяжелее
 * на столько-то, тяжелее и теперь); подходы, что были легче, — свои.
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
 * Шаг тренажёра из каталога (load.step, FT-626) важнее всего: плитки по 5 —
 * шаг 5. Вес помощи (гравитрон, FT-628): двигается помощь, в обратную
 * сторону — «легко» убирает помощь.
 *
 * Общая с сервером часть (stepOf, scaleTo, wasIndex, wasSet, rateSet,
 * suggestText) — копия server/src/lib/effort.js; одни и те же примеры
 * проверяют обе копии: scripts/fixtures/effort-cases.json (FT-629).
 *
 * Шаг веса (stepOf) без тренажёра — по группе мышц и снаряду из базы, без
 * них — по названию:
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

const num = (v) => Number(String(v ?? '').replace(',', '.'));
const text = (kg) => String(Math.round(kg * 100) / 100);
const has = (s, words) => words.some((w) => s.includes(w));

const LEGS = ['присед', 'жим ног', 'жим платформ', 'гакк', 'выпад', 'болгарск', 'становая', 'румынск', 'мост', 'hip thrust', 'зашагив', 'ног', 'носк', 'икр'];
const BACK = ['тяга', 'тяги', 'подтяг', 'пуловер', 'гиперэкст', 'шраг', 'спин'];
const CHEST = ['лёжа', 'лежа', 'жим на наклон', 'жим в тренаж', 'брусья', 'разводк', 'сведени', 'бабочк', 'кроссовер', 'отжиман'];
const ISOLATION = ['разгибан', 'сгибан', 'отведен', 'приведен', 'мах', 'разводк', 'сведени', 'бицепс', 'трицепс', 'икр', 'носки', 'пуловер', 'гиперэкст', 'шраг', 'кроссовер'];
const DUMBBELL = ['гантел', 'гир'];

/** Шаг помощи, если у тренажёра свой не указан */
export const ASSIST_STEP = 5;

export function groupOf(ex) {
  const muscle = String((ex.load && ex.load.muscle) || '').toLowerCase();
  if (muscle) {
    if (muscle === 'ноги' || muscle === 'ягодицы') return 'legs';
    if (muscle === 'спина') return 'back';
    if (muscle === 'грудь') return 'chest';
    return 'other';
  }
  const name = String(ex.name || '').toLowerCase();
  if (has(name, LEGS) || has(name, ['мёртв', 'мертв'])) return 'legs';
  if (has(name, BACK)) return 'back';
  if (has(name, CHEST)) return 'chest';
  return 'other';
}

/** Шаг тренажёра из каталога (FT-626): плитки по 5 — шаг 5; нет — 0 */
export function machineStep(ex) {
  const v = num(ex && ex.load && ex.load.step);
  return v > 0 && v <= 50 ? v : 0;
}

export function stepOf(ex, kg) {
  const own = machineStep(ex);
  if (own) return own;
  const name = String(ex.name || '').toLowerCase();
  const equipment = String((ex.load && ex.load.equipment) || '').toLowerCase();
  const group = groupOf(ex);
  const isolation = has(name, ISOLATION);
  let step;
  if (has(equipment, DUMBBELL) || has(name, DUMBBELL)) step = group === 'other' || isolation ? 1 : 2;
  else if (group === 'legs') step = isolation ? 5 : 10;
  else if (group === 'back') step = isolation ? 2.5 : 5;
  else step = 2.5;
  if (kg > 0 && kg < step * 4) step = Math.max(1, step / 2);
  return step;
}

/** До чего округлять вес: шаг тренажёра, гантели — 1 кг, остальное — 2,5 */
export function unitOf(ex) {
  return machineStep(ex) || (isDumbbell(ex) ? 1 : 2.5);
}

/** Вес помощи (гравитрон): двигается помощь, а не вес (FT-628) */
export function isAssisted(ex) {
  return !!(ex && ex.track && ex.track.weightMode === 'assistance');
}

/** Шаг помощи: шаг тренажёра, нет — 5 кг */
export function assistStep(ex) {
  return machineStep(ex) || ASSIST_STEP;
}

/**
 * Вес w на from повторов → на to повторов (формула Эпли), вниз до блина
 * (unitOf)
 */
export function scaleTo(ex, w, from, to) {
  if (!(w > 0) || !(from > 0) || !(to > 0) || from === to) return w;
  const one = w * (1 + Math.min(30, from) / 30);
  const raw = one / (1 + Math.min(30, to) / 30);
  const unit = unitOf(ex);
  return Math.max(unit, Math.floor(raw / unit + 1e-9) * unit);
}

const ASSIST_RE = /^\d+([.,]\d+)?$/;

/**
 * Чем меряем подход: обычное упражнение — весом, с помощью — помощью.
 * load — «тяжесть» (больше — тяжелее): у помощи это минус помощь
 */
function measure(assist) {
  return assist
    ? { has: (s) => ASSIST_RE.test(String(s.assist ?? '').trim()), value: (s) => num(s.assist), load: (s) => -num(s.assist), key: 'assist' }
    : { has: (s) => num(s.weight) > 0, value: (s) => num(s.weight), load: (s) => num(s.weight), key: 'weight' };
}

/**
 * Отдых после подхода: тяжело — +30 с; легко и прибавлять некуда (свой вес,
 * помощь уже 0 — capped из rateSet) — −30 с; иначе как выбран. «Легко» на
 * лёгком подходе лесенки или после двух прибавок отдых не трогает: вес
 * впереди ещё растёт (до 20.10.2026 укорачивался любой отдых без прибавки)
 */
export function restFor(effort, base, capped = false) {
  if (!base) return 0;
  if (effort === 'hard') return Math.min(1800, base + 30);
  if (effort === 'easy' && capped) return Math.max(30, base - 30);
  return base;
}

/**
 * Отдых после круга суперсета: хоть одно тяжело — дольше; все легко и
 * прибавить было некуда — короче; иначе как выбран
 */
export function roundRest(efforts, base, capped = false) {
  if (!base) return 0;
  if (efforts.includes('hard')) return Math.min(1800, base + 30);
  if (efforts.length && efforts.every((e) => e === 'easy') && capped) return Math.max(30, base - 30);
  return base;
}

/** Сколько прибавок веса за занятие на одно упражнение */
/** Сколько прибавок веса за занятие на одно упражнение */
/** Сколько прибавок веса за занятие на одно упражнение */
export const MAX_RAISES = 2;

const EFFORT_SET = ['easy', 'ok', 'hard'];
export const isEffort = (e) => EFFORT_SET.includes(e);

/** Гантели и гири — на часах шаг колёсика 1 кг, остальное — 1,25 */
export function isDumbbell(ex) {
  const equipment = String((ex.load && ex.load.equipment) || '').toLowerCase();
  return has(equipment, DUMBBELL) || has(String(ex.name || '').toLowerCase(), DUMBBELL);
}

export function targetOf(ex) {
  const m = String(ex.target || '').match(/^(\d{1,3})/);
  return m ? Number(m[1]) : 0;
}

const kindOf = (s) => (s && s.kind === 'warmup' ? 'warmup' : 'work');

/**
 * Какой подход прошлого раза (номер в lastRun) соответствует подходу si
 * (FT-621). Подходы, пришедшие с прошлого раза, знают его сами (set.was):
 * добавленная разминка или удалённый подход номера не сдвигают. Занятия,
 * начатые до этого, — по счёту среди подходов того же вида (разминка с
 * разминкой, рабочий с рабочим). Нет такого — −1
 */
export function wasIndex(ex, si) {
  const last = ex && ex.lastRun;
  const set = ex && ex.sets && ex.sets[si];
  if (!last || !set || set.who || !Array.isArray(last.weights)) return -1;
  if (Number.isInteger(set.was)) return set.was >= 0 && set.was < last.weights.length ? set.was : -1;
  if (ex.sets.some((s) => Number.isInteger(s.was))) return -1;
  const kinds = Array.isArray(last.kinds) ? last.kinds : null;
  if (!kinds) return si < last.weights.length ? si : -1;
  const kind = kindOf(set);
  const k = ex.sets.slice(0, si).filter((s) => !s.who && kindOf(s) === kind).length;
  let n = -1;
  for (let i = 0; i < kinds.length; i += 1) if (kinds[i] === kind && ++n === k) return i;
  return -1;
}

/** Тот же подход в прошлый раз: { weight, reps, assist? } или null */
export function wasSet(ex, si) {
  const i = wasIndex(ex, si);
  if (i < 0) return null;
  const last = ex.lastRun;
  if (isAssisted(ex) && Array.isArray(last.assist)) {
    const assist = String(last.assist[i] || '');
    return assist && assist !== '—' ? { weight: '', assist, reps: String((last.reps || [])[i] || '') } : null;
  }
  const weight = String(last.weights[i] || '');
  if (!weight || weight === '—') return null;
  return { weight, reps: String((last.reps || [])[i] || '') };
}

/** «Тяжесть» подхода прошлого раза по номеру: вес, у помощи — минус помощь; нет — null */
function wasLoad(ex, i) {
  const w = wasSet(ex, i);
  if (!w) return null;
  return w.assist !== undefined ? -num(w.assist) : num(w.weight) > 0 ? num(w.weight) : null;
}

/**
 * Подход si отмечен оценкой effort: у подхода — оценка, у следующих
 * подходов того же человека — новый вес (у помощи — помощь) с причиной в
 * suggest. Вес, вписанный руками (own), и разминку не трогаем
 */
export function rateSet(ex, si, effort) {
  const set = ex.sets[si];
  const assist = isAssisted(ex);
  const m = measure(assist);
  const who = set.who || '';
  const mine = (x) => (x.who || '') === who;
  const cur = m.load(set);
  const work = set.kind !== 'warmup';
  const own = ex.sets.filter((x) => mine(x) && x.kind !== 'warmup' && m.has(x));
  const before = ex.sets.slice(0, si).filter((x) => mine(x) && x.state === 'done' && x.kind !== 'warmup');
  const last = before[before.length - 1];
  const raises = before.filter((x) => x.raised).length;
  const heaviest = m.has(set) && cur >= Math.max(...own.map(m.load));
  let dir = 0;
  let suggest = '';
  if (work && m.has(set)) {
    const target = targetOf(ex);
    const short = target > 0 && num(set.reps) > 0 && num(set.reps) < target;
    if (effort === 'easy' && heaviest && raises < MAX_RAISES) { dir = 1; suggest = 'easy'; }
    else if (effort === 'hard' && short) { dir = -1; suggest = 'short'; }
    // «Тяжело» второй раз подряд — −шаг, но не второй раз за одно и то же:
    // прошлое «тяжело» уже сняло шаг (lowered) — хватит (20.10.2026)
    else if (effort === 'hard' && last && last.effort === 'hard' && !last.lowered) { dir = -1; suggest = 'hard'; }
  }
  const step = (load) => (assist ? assistStep(ex) : stepOf(ex, load));
  let changed = false;
  // Что сдвинула эта оценка — чтобы «не то нажал» вернуло веса (unrateAt)
  const moved = [];
  const sets = ex.sets.map((x, i) => {
    if (i === si) return { ...x, state: 'done', effort };
    if (!dir || i < si || !mine(x) || x.state !== 'pending' || x.kind === 'warmup' || x.own) return x;
    if (!m.has(x)) return x;
    const w = m.load(x);
    // Отсчёт — от того, что сделано сейчас, а не от веса прошлой тренировки
    // (владелец, 16.10.2026): сделали 60 при прошлых 50·50·50 — следующим
    // 60 ± шаг, а не 50. Лесенка прошлого раза сохраняется: подход, который
    // был тяжелее на столько-то, тяжелее и теперь
    const was = wasLoad(ex, si);
    const then = wasLoad(ex, i);
    let base;
    if (was !== null && then !== null && then >= was) base = cur + (then - was);
    // Нет истории — как было: не легче этого, лесенка ниже — своя
    else if (w >= cur) base = w;
    else return x;
    const next = text(assist ? Math.max(0, -(base + dir * step(base))) : Math.max(0, base + dir * step(base)));
    // Сдвигать некуда (помощь уже 0) — подход как был
    if (num(next) === num(x[m.key])) return x;
    changed = true;
    moved.push({ i, key: m.key, from: String(x[m.key] ?? ''), to: next, suggest: x.suggest || '' });
    return { ...x, [m.key]: next, suggest };
  });
  // raised / lowered — оценка сдвинула вес следующих подходов; capped —
  // хотели прибавить, а некуда (потолок прибавок не считается: это не
  // «некуда», а «хватит»). По capped отдых короче (restFor)
  const capped = effort === 'easy' && work && m.has(set) && heaviest && dir > 0 && !changed;
  sets[si] = { ...sets[si], ...(moved.length ? { moved } : {}), ...(dir > 0 && changed ? { raised: true } : {}),
    ...(dir < 0 && changed ? { lowered: true } : {}), ...(capped ? { capped: true } : {}) };
  return { ex: { ...ex, sets }, raised: dir > 0 && changed, lowered: dir < 0 && changed, capped };
}

/** Снять отметку: оценка и признак прибавки уходят вместе с ней */
export function unrate(set) {
  const { effort, raised, lowered, capped, moved, ...rest } = set;
  return { ...rest, state: 'pending' };
}

/**
 * Снять отметку у подхода si упражнения и вернуть то, что сдвинула его
 * оценка (19.10.2026): нажали «Легко» вместо «Норм» — следующим подходам
 * прибавили вес, и «снять» оставляло прибавку. Вернуть можно подход, чей
 * вес с тех пор не трогали руками: вписанный человеком остаётся.
 */
export function unrateAt(ex, si) {
  const moved = (ex.sets[si] && ex.sets[si].moved) || [];
  return { ...ex, sets: ex.sets.map((x, i) => {
    if (i === si) return unrate(x);
    const mv = moved.find((m) => m.i === i);
    if (!mv || x.state !== 'pending' || x.own || String(x[mv.key] ?? '') !== mv.to) return x;
    const { suggest, ...rest } = x;
    return { ...rest, [mv.key]: mv.from, ...(mv.suggest ? { suggest: mv.suggest } : {}) };
  }) };
}

/** Поменять оценку уже отмеченного подхода: прежняя снимается вместе с её сдвигом веса */
export function rerate(ex, si, effort) {
  return rateSet(unrateAt(ex, si), si, effort);
}

const WHY = { easy: 'было легко', short: 'не добил повторы', hard: 'дважды тяжело' };

/** Подпись подобранного веса: «+2,5 кг · было легко»; у помощи — «−5 кг помощи · было легко» */
export function suggestText(set, prev, ex = null) {
  if (!set.suggest || !prev) return '';
  const assist = isAssisted(ex);
  const key = assist ? 'assist' : 'weight';
  const b = num(set[key]);
  const a = num(prev[key]);
  if (assist ? !(a >= 0 && String(prev.assist ?? '') !== '') : !(a > 0)) return '';
  if (!(b >= 0) || a === b) return '';
  const diff = text(Math.abs(b - a)).replace('.', ',');
  // Без стрелки-символа: направление рисует значок (IconDelta, на часах — SF Symbol)
  return (b > a ? '+' : '−') + diff + (assist ? ' кг помощи · ' : ' кг · ') + (WHY[set.suggest] || '');
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
/** Диапазон повторов программы занятия: «8–12» → { lo, hi }; одно число или нет — null */
export function repsGoal(ex) {
  const m = String((ex && ex.planReps) || '').trim().match(/^(\d{1,3})\s*[-–—]\s*(\d{1,3})$/);
  return m && Number(m[2]) > Number(m[1]) ? { lo: Number(m[1]), hi: Number(m[2]) } : null;
}

/**
 * Цель диапазона (владелец, 19.10.2026): клиент стремится к верхней
 * границе — она и есть условие прибавки веса (сервер, startPlan). В поле
 * повторов при этом то, что реально делают: неисправленная цель записалась
 * бы как сделанная
 */
export function repsGoalText(ex) {
  const g = repsGoal(ex);
  return g ? 'Повторы ' + g.lo + '–' + g.hi + ': дойдите до ' + g.hi + ' во всех подходах — тогда прибавим вес' : '';
}

/** Под сделанным рабочим подходом: «до цели 2 повтора»; дошли — '' */
export function repsLeftText(ex, set) {
  const g = repsGoal(ex);
  const reps = Number(set && set.reps);
  if (!g || !set || set.state !== 'done' || set.kind === 'warmup' || !(reps > 0) || reps >= g.hi) return '';
  const n = g.hi - reps;
  return 'до цели ' + n + ' ' + plural(n, 'повтор', 'повтора', 'повторов');
}

/**
 * Тренажёр сменился (владелец, 16.10.2026: другой зал, тренажёр другой
 * фирмы): веса по нулям, но видно, что было на прежнем — сервер, otherRun
 */
export function otherMachineText(other) {
  if (!other || !Array.isArray(other.weights) || !other.weights.length) return '';
  const reps = Array.isArray(other.reps) ? other.reps : [];
  const same = reps.length && reps.every((r) => r && r === reps[0]);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(other.date || '') ? ' (' + other.date.slice(8, 10) + '.' + other.date.slice(5, 7) + ')' : '';
  const what = same
    ? other.weights.join(' · ') + ' кг на ' + reps[0] + ' ' + plural(Number(reps[0]), 'повтор', 'повтора', 'повторов')
    : other.weights.map((w, i) => w + (reps[i] ? '×' + reps[i] : '')).join(' · ') + ' кг';
  const where = other.machine ? 'на тренажёре «' + other.machine + '»' : 'без тренажёра';
  return 'Последний раз' + date + ' вы делали это упражнение ' + where + ': ' + what + '. Здесь тренажёр другой — впишите вес заново.';
}

/**
 * То же — частями, для карточки упражнения (20.10.2026): «Прошлый раз ·
 * 09.10 — 100 · 120 · 140 кг на 8 повторов, было легко» и отдельной
 * строкой «Сегодня +5 кг — было легко» со стрелкой. Одна длинная фраза
 * читалась плохо: в зале ищут глазами число и направление
 */
export function lastRunParts(last) {
  if (!last || !Array.isArray(last.weights) || !last.weights.length) return null;
  // Вес помощи (FT-628): «с помощью 30 · 30 кг», сдвиг — помощи
  const assist = last.mode === 'assist' && Array.isArray(last.assist);
  const values = assist ? last.assist : last.weights;
  const reps = Array.isArray(last.reps) ? last.reps : [];
  const same = reps.length && reps.every((r) => r && r === reps[0]);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(last.date || '') ? last.date.slice(8, 10) + '.' + last.date.slice(5, 7) : '';
  const what = (assist ? 'с помощью ' : '') + (same
    ? values.join(' · ') + ' кг на ' + reps[0] + ' ' + plural(Number(reps[0]), 'повтор', 'повтора', 'повторов')
    : values.map((w, i) => w + (reps[i] ? '×' + reps[i] : '')).join(' · ') + ' кг');
  const felt = last.effort ? ', вам было ' + EFFORT_WORD[last.effort] : '';
  return { date, was: what + felt, today: todayText(last, assist), action: last.action || 'same' };
}

export function lastRunText(last) {
  const p = lastRunParts(last);
  if (!p) return '';
  return 'Последний раз' + (p.date ? ' (' + p.date + ')' : '') + ' вы делали ' + p.was + (p.today ? ' — ' + p.today : '');
}

/** Что сегодня: «сегодня +5 кг», «так же», «−10 %: перерыв»; пусто — нечего сказать */
function todayText(last, assist) {
  const step = String(last.step || '').replace('.', ',');
  // Помощь: «up» — меньше помощи, это прогресс
  const kg = (sign) => (assist ? 'помощь ' + (sign > 0 ? '−' : '+') : sign > 0 ? '+' : '−') + step + ' кг';
  const lo = parseInt(last.planReps, 10);
  const weeks = Math.floor(Number(last.gap) / 7);
  const up = {
    streak: 'норм ' + last.streak + ' раза подряд — сегодня пробуем ' + kg(1),
    // Верх диапазона (FT-625): прибавили вес — повторы снова с нижней границы
    reps: 'повторы дошли до верха — сегодня ' + kg(1) + (lo ? ' и снова с ' + lo + ' ' + plural(lo, 'повтора', 'повторов', 'повторов') : ''),
  }[last.reason] || (!last.reason && last.effort === 'ok' ? 'норм ' + last.streak + ' раза подряд — сегодня пробуем ' + kg(1) : 'сегодня ' + kg(1));
  const today = {
    up,
    // Перерыв (FT-627): давно не делали — легче
    down: last.reason === 'break'
      ? 'с тех пор ' + (weeks > 0 ? weeks + ' ' + plural(weeks, 'неделя', 'недели', 'недель') : 'давно') + ' — сегодня ' + kg(-1) + ', втянуться'
      : 'сегодня ' + kg(-1),
    same: 'сегодня так же',
    // Повторы другие — вес пересчитан в соотношении (сервер, scaleTo)
    scaled: 'сегодня на ' + (lo || '') + ' ' + plural(lo, 'повтор', 'повтора', 'повторов') + ', это примерно ' + String(last.scaled || '').replace('.', ',') + ' кг',
  }[last.action] || '';
  return today;
}
