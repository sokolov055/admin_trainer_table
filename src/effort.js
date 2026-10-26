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
 * Вес — главный рычаг, отдых — запасной. Правила — владельца, 22.10.2026
 * (44 ответа «как поступил бы тренер», Notion «Подбор веса как у
 * тренера»), подробно — у rateSet. Главное: отсчёт только от сделанного
 * сейчас — каждое «тяжело» снимает со следующих подходов шаг, «легко»
 * прибавляет один шаг, но не выше лесенки прошлого раза (26.10.2026,
 * FT-755–757). Тяжело — отдых на 60 с дольше.
 *   Разминочные подходы оценок не имеют («Готово») и вес не двигают. Новый
 *   вес встаёт только в нетронутые подходы того же человека: что вписано
 *   руками — не трогаем.
 *
 * Суперсет: оценка — у каждого упражнения круга, вес правится у каждого
 * своим шагом. Не последнее в круге — отдых не запускает, это «дальше».
 * Последнее — отдых по кругу: хоть одно тяжело → +60 с; все легко и
 * прибавить было некуда → −30 с; иначе как выбран.
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

/** На сколько дольше отдых после «тяжело» (владелец, 22.10.2026; было 30 с) */
export const HARD_REST = 60;

/**
 * Отдых после подхода: тяжело — +60 с; легко и прибавлять некуда (помощь
 * уже 0 — capped из rateSet) — −30 с; иначе как выбран. «Легко» на лёгком
 * подходе лесенки отдых не трогает: вес впереди ещё растёт
 */
export function restFor(effort, base, capped = false) {
  if (!base) return 0;
  if (effort === 'hard') return Math.min(1800, base + HARD_REST);
  if (effort === 'easy' && capped) return Math.max(30, base - 30);
  return base;
}

/**
 * Отдых после круга суперсета: хоть одно тяжело — дольше; все легко и
 * прибавить было некуда — короче; иначе как выбран
 */
export function roundRest(efforts, base, capped = false) {
  if (!base) return 0;
  if (efforts.includes('hard')) return Math.min(1800, base + HARD_REST);
  if (efforts.length && efforts.every((e) => e === 'easy') && capped) return Math.max(30, base - 30);
  return base;
}

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
 * Сколько прибавляет «всё легко» к следующему занятию (владелец,
 * 22.10.2026): при шаге 2,5 и меньше — два шага (60 → 65), при крупном шаге
 * (5, 10) и у гантелей — один (присед 100 → 110, гантели 20 → 22). Внутри
 * занятия «Легко» — всегда один шаг (26.10.2026, FT-755)
 */
export function raiseOf(ex, step) {
  return step >= 5 || isDumbbell(ex) ? step : step * 2;
}

/** Повторы плана: «8–12» → { lo: 8, hi: 12 }, «10» → { lo: 10, hi: 10 }; нет — null */
function repsPlan(ex) {
  const g = repsGoal(ex);
  if (g) return g;
  const t = targetOf(ex);
  return t > 0 ? { lo: t, hi: t } : null;
}

/** Свой вес без отягощения (FT-620): двигаются повторы, а не вес */
function bodyweight(ex, set) {
  return !!(ex.track && ex.track.kind === 'bodyweight') && !(num(set.weight) > 0) && num(set.reps) > 0;
}

/**
 * Подход si отмечен оценкой effort: у подхода — оценка, у следующих
 * неотмеченных рабочих того же человека — новый вес (у помощи — помощь, у
 * своего веса — повторы) с причиной в suggest. Правила владельца
 * 22.10.2026 (Notion, «Подбор веса как у тренера») с правкой 26.10.2026
 * (FT-755–758). Отсчёт — только от сделанного сейчас.
 *
 *   Тяжело, не добил повторы  → вес по формуле от сделанного, вниз до блина
 *                               и хотя бы на блин легче (60 × 8 из 10 → 55);
 *   тяжело, повторы сделаны   → −шаг, каждый раз (7,5 → 5 → 2,5); до 26.10
 *                               вес держался, а шаг снимало только второе
 *                               «тяжело» подряд;
 *   тяжело — не ниже разминки → вес разминки упражнения — предел, без
 *                               разминки — один блин;
 *   легко                     → следующим не меньше сделанного + шаг (один,
 *                               26.10; было два), что в лесенке и так
 *                               тяжелее — как было (30 · 40 · 50 · 55, на 40
 *                               «легко» — дальше 50, а не 55);
 *   больше повторов, чем в плане (легко, норм) → вес по формуле на план,
 *                               вниз до блина; у «легко» — не меньше прибавки;
 *   норм и не добил           → первый раз держим, второй — −шаг;
 *   свой вес: легко — +2 повтора, тяжело и не добил — цель по сделанному.
 * Подпись у подходов, которые оценка не сдвинула, снимается: причина в ней —
 * от прежней оценки (FT-758: «Норм» на 50, а у 60 — «было легко»).
 * Разминку оценка не двигает (на ней «Готово»), вписанное руками — тоже.
 * Ограничения на число прибавок за занятие нет.
 */
export function rateSet(ex, si, effort) {
  const set = ex.sets[si];
  const assist = isAssisted(ex);
  const m = measure(assist);
  const who = set.who || '';
  const mine = (x) => (x.who || '') === who;
  // Что можно сдвигать: следующие неотмеченные рабочие того же человека, не вписанные руками
  const open = (x, i) => i > si && mine(x) && x.state === 'pending' && x.kind !== 'warmup' && !x.own;
  const before = ex.sets.slice(0, si).filter((x) => mine(x) && x.state === 'done' && x.kind !== 'warmup');
  const plan = repsPlan(ex);
  const reps = num(set.reps);
  const short = !!plan && reps > 0 && reps < plan.lo;
  const over = !!plan && reps > 0 && reps > plan.hi;
  let key = m.key;
  // to(значение следующего подхода) → новое или null — не трогать
  let to = null;
  let dir = 0;
  let suggest = '';
  // Какие подходы правило может сдвинуть — обычно open
  let touch = open;
  // Впереди подход тяжелее этого (лесенка ещё растёт): «легко» без сдвига —
  // не «прибавлять некуда», отдых не короче
  let ahead = false;
  if (set.kind !== 'warmup' && isEffort(effort) && m.has(set)) {
    const cur = m.load(set);
    const step = assist ? assistStep(ex) : stepOf(ex, cur);
    const unit = assist ? step : unitOf(ex);
    // Шаг оценки — не меньше блина: у лёгкого веса шаг вдвое меньше (1,25 на
    // блоке с 7,5), а груза 6,25 нет — «тяжело» даёт 5 (FT-756)
    const move = Math.max(step, unit);
    const nextAt = ex.sets.map((x, i) => (open(x, i) && m.has(x) ? i : -1)).filter((i) => i >= 0);
    // Какие подходы впереди не легче этого: по прошлому разу, если он есть,
    // — подобранный вес могли поправить руками (21.10.2026: подобрано 50,
    // сделал 45); нет — по тому, что стоит в подходах
    const was = wasLoad(ex, si);
    const thenAt = nextAt.map((i) => wasLoad(ex, i));
    const history = was !== null && thenAt.length > 0 && thenAt.every((w) => w !== null);
    const from = history ? was : cur;
    const loads = history ? thenAt : nextAt.map((i) => m.load(ex.sets[i]));
    // Подход не легче этого (по прошлому разу или по тому, что стоит):
    // его «легко» подтягивает, а сброс и облегчённый последний — свои
    const level = new Map(nextAt.map((i, k) => [i, loads[k] >= from]));
    // Не выше cap: сколько можно, столько и оставить
    const cap = (c) => (w) => (w > c ? c : null);
    // Не ниже top: следующие не легче этого подтянуть
    const lift = (top) => (w, i) => ((w >= cur || level.get(i)) && w < top ? top : null);
    // По формуле вверх — только вес; у помощи формулы нет
    const scaled = over && !assist ? scaleTo(ex, cur, reps, plan.hi) : null;
    if (effort === 'hard') {
      // Каждое «тяжело» — шаг вниз, не ниже разминки (владелец, 26.10.2026,
      // FT-756: 7,5 → 5 → 2,5); разминки нет — не ниже блина, у помощи — без предела
      const warm = ex.sets.filter((x) => mine(x) && x.kind === 'warmup' && m.has(x)).map(m.load);
      const floor = warm.length ? Math.max(...warm) : assist ? -Infinity : unit;
      let down = cur - move;
      if (short) {
        const lack = plan.lo - reps;
        // У помощи формулы нет: +шаг, не добил 4 и больше — +2 шага
        down = assist ? cur - step * (lack >= 4 ? 2 : 1) : Math.min(scaleTo(ex, cur, reps, plan.lo), cur - unit);
      }
      to = cap(Math.min(cur, Math.max(down, floor)));
      dir = -1; suggest = short ? 'short' : 'hard';
    } else if (effort === 'easy') {
      // Один шаг (FT-755), а лесенка прошлого раза выше него — как была:
      // «легко» догоняет план, а не прибавляет к нему (FT-757)
      dir = 1;
      suggest = over ? 'over' : 'easy';
      to = lift(scaled === null ? cur + move : Math.max(cur + move, scaled));
      ahead = nextAt.some((i) => m.load(ex.sets[i]) > cur);
    } else if (effort === 'ok') {
      if (scaled !== null && scaled > cur) { to = lift(scaled); dir = 1; suggest = 'over'; }
      else if (short && before.some((x) => num(x.reps) > 0 && num(x.reps) < plan.lo)) { to = cap(cur - step); dir = -1; suggest = 'again'; }
      // «Норм», а следующий подход легче (владелец, 24.10.2026: пирамида
      // прошлого раза 30–40–35, на 40 «Норм» — дальше снова 35): этот вес по
      // силам — следующий подход не легче. Только ближайший: дальше могут
      // стоять облегчённые нарочно. Ближайший — даже вписанный руками
      // (24.10.2026: вписал 15 во второй, «Норм» на первом 25 — правило
      // перескакивало на третий, а второй оставался 15)
      else {
        const near = ex.sets.findIndex((x, i) => i > si && mine(x) && x.state === 'pending' && x.kind !== 'warmup');
        const lifted = new Set(near >= 0 && m.has(ex.sets[near]) && m.load(ex.sets[near]) < cur ? [near] : []);
        // Шаг на усталость (settleOrder) не взяли — сделали тяжелее
        // подсказанного, и «Норм» (владелец, 26.10.2026, FT-754): все
        // подходы со снятым шагом — до сделанного, а не по одному
        ex.sets.forEach((x, i) => { if (open(x, i) && x.suggest === 'tired' && m.has(x) && m.load(x) < cur) lifted.add(i); });
        if (lifted.size) {
          to = (w, i) => (lifted.has(i) && w < cur ? cur : null); dir = 1; suggest = 'kept';
          touch = (x, i) => lifted.has(i);
        }
      }
    }
  } else if (set.kind !== 'warmup' && isEffort(effort) && !assist && bodyweight(ex, set)) {
    key = 'reps';
    if (effort === 'easy') { to = (r) => (r < reps + 2 ? reps + 2 : null); dir = 1; suggest = 'more'; }
    else if (effort === 'hard' && short) { to = (r) => (!r || r > reps ? reps : null); dir = -1; suggest = 'fewer'; }
  }
  let changed = false;
  // Что сдвинула эта оценка — чтобы «не то нажал» вернуло (unrateAt)
  const moved = [];
  // Чьи подписи сняты: причина в них — от прежней оценки (FT-758)
  const cleared = [];
  const stale = (x, i) => {
    // Подпись усталости — своя, её снимает первый рабочий подход (FT-754)
    if (i <= si || !mine(x) || x.state !== 'pending' || !x.suggest || x.suggest === 'tired') return x;
    cleared.push({ i, suggest: x.suggest });
    const { suggest: _, ...rest } = x;
    return rest;
  };
  const sets = ex.sets.map((x, i) => {
    if (i === si) return { ...x, state: 'done', effort };
    if (!to || !touch(x, i)) return stale(x, i);
    let value;
    if (key === 'reps') {
      const r = to(num(x.reps));
      if (r === null) return stale(x, i);
      value = String(r);
    } else {
      if (!m.has(x)) return stale(x, i);
      const n = to(m.load(x), i);
      if (n === null) return stale(x, i);
      value = text(assist ? Math.max(0, -n) : Math.max(0, n));
    }
    // Сдвигать некуда (помощь уже 0) — подход как был
    if (num(value) === num(x[key]) && String(x[key] ?? '') !== '') return stale(x, i);
    changed = true;
    moved.push({ i, key, from: String(x[key] ?? ''), to: value, suggest: x.suggest || '' });
    return { ...x, [key]: value, suggest };
  });
  // raised / lowered — оценка сдвинула следующие подходы; capped — хотели
  // прибавить, а некуда (помощь уже 0): по нему отдых короче (restFor)
  const capped = effort === 'easy' && key !== 'reps' && dir > 0 && !!to && !changed && !ahead;
  sets[si] = { ...sets[si], ...(moved.length ? { moved } : {}), ...(cleared.length ? { cleared } : {}), ...(dir > 0 && changed ? { raised: true } : {}),
    ...(dir < 0 && changed ? { lowered: true } : {}), ...(capped ? { capped: true } : {}) };
  return { ex: { ...ex, sets }, raised: dir > 0 && changed, lowered: dir < 0 && changed, capped };
}

/** Снять отметку: оценка и признак прибавки уходят вместе с ней */
export function unrate(set) {
  const { effort, raised, lowered, capped, moved, cleared, ...rest } = set;
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
  const cleared = (ex.sets[si] && ex.sets[si].cleared) || [];
  return { ...ex, sets: ex.sets.map((x, i) => {
    if (i === si) return unrate(x);
    const back = cleared.find((c) => c.i === i);
    // Снятая подпись возвращается, если подходу с тех пор не дали новую
    if (back) return x.state === 'pending' && !x.suggest ? { ...x, suggest: back.suggest } : x;
    const mv = moved.find((m) => m.i === i);
    // Вписанный руками тоже: значение то, что поставила оценка, — после неё не трогали
    if (!mv || x.state !== 'pending' || String(x[mv.key] ?? '') !== mv.to) return x;
    const { suggest, ...rest } = x;
    return { ...rest, [mv.key]: mv.from, ...(mv.suggest ? { suggest: mv.suggest } : {}) };
  }) };
}

/** Поменять оценку уже отмеченного подхода: прежняя снимается вместе с её сдвигом веса */
export function rerate(ex, si, effort) {
  return rateSet(unrateAt(ex, si), si, effort);
}

const WHY = { easy: 'было легко', short: 'не добил повторы', hard: 'было тяжело', held: 'было тяжело',
  first: 'тяжело уже на первом', over: 'повторов больше плана', again: 'снова не добил', more: 'было легко', fewer: 'не добил повторы',
  tired: 'после другого на эти мышцы', kept: 'на прошлом «Норм»' };

/**
 * Подпись подобранного веса: «+2,5 кг · было легко»; у помощи — «−5 кг
 * помощи · было легко»; у своего веса — «+2 повт. · было легко»
 */
export function suggestText(set, prev, ex = null) {
  if (!set.suggest || !prev) return '';
  if (set.suggest === 'more' || set.suggest === 'fewer') {
    const b = num(set.reps);
    const a = num(prev.reps);
    if (!(a > 0) || !(b > 0)) return '';
    if (set.suggest === 'fewer') return 'цель ' + b + ' повт. · ' + WHY.fewer;
    return b > a ? '+' + (b - a) + ' повт. · ' + WHY.more : '';
  }
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

/**
 * Группа мышц упражнения — чтобы знать, что до него делали (22.10.2026):
 * из базы, нет — по названию (ноги, спина, грудь); прочее — ''
 */
export function muscleOf(ex) {
  const muscle = String((ex && ex.load && ex.load.muscle) || '').trim().toLowerCase();
  if (muscle) return muscle === 'ягодицы' ? 'ноги' : muscle;
  return { legs: 'ноги', back: 'спина', chest: 'грудь' }[groupOf(ex || {})] || '';
}

/** Сделан хоть один рабочий подход (у пары упражнения не считаем) */
const worked = (ex) => (ex.sets || []).some((s) => s.state === 'done' && s.kind !== 'warmup' && !s.who);

/**
 * Порядок и усталость (владелец, 22.10.2026): жим штанги в прошлый раз был
 * первым, сегодня штанга занята — сначала сведения, потом жим. Начальный
 * вес жима — на шаг легче, с подсказкой «после сведений».
 *
 * began — каким по счёту упражнение начали (первый сделанный рабочий
 * подход): по нему следующий раз знает, что шло до него, даже если в списке
 * порядок не меняли (сервер, lastRun.before). tired — вес уже снят, второй
 * раз не снимается; вписанное руками и суперсет не трогаем. Можно звать
 * сколько угодно раз — сдвигает один раз; ничего не поменялось — тот же
 * список (занятие без нажатий остаётся тем же объектом)
 */
export function settleOrder(exercises) {
  const list = exercises || [];
  let n = Math.max(0, ...list.map((ex) => Number(ex.began) || 0));
  const out = list.map((ex) => (worked(ex) && !(Number(ex.began) > 0) ? { ...ex, began: ++n } : ex));
  const settled = out.map((ex) => {
    if (ex.tired || ex.supersetGroup || worked(ex) || (ex.sets || []).some((s) => s.who)) return ex;
    const before = ex.lastRun && Array.isArray(ex.lastRun.before) ? ex.lastRun.before : null;
    const key = muscleOf(ex);
    if (!before || !key || before.includes(key)) return ex;
    // Вес уже снижен за перерыв — второй раз не снимаем (владелец, FT-764)
    if (ex.lastRun.reason === 'break') return ex;
    const after = out.find((x) => x !== ex && worked(x) && muscleOf(x) === key);
    if (!after) return ex;
    const assist = isAssisted(ex);
    const m = measure(assist);
    // Не легче разминки, нет её — не легче блина, как после «тяжело»
    // (FT-763: перерыв и новые повторы дали 1 кг, усталость — 0 кг)
    const warm = ex.sets.filter((s) => s.kind === 'warmup' && m.has(s)).map(m.load);
    const floor = warm.length ? Math.max(...warm) : assist ? -Infinity : unitOf(ex);
    let step = 0;
    const sets = ex.sets.map((s) => {
      if (s.state !== 'pending' || s.kind === 'warmup' || s.own || !m.has(s)) return s;
      const w = m.load(s);
      if (w <= floor) return s;
      const one = assist ? assistStep(ex) : stepOf(ex, w);
      const load = Math.max(floor, w - one);
      const value = text(assist ? Math.max(0, -load) : load);
      if (num(value) === num(s[m.key])) return s;
      step = Math.round((w - load) * 100) / 100;
      return { ...s, [m.key]: value, suggest: 'tired' };
    });
    return step ? { ...ex, sets, tired: { after: String(after.name || '').slice(0, 80), step: text(step) } } : ex;
  });
  return settled.every((ex, i) => ex === list[i]) ? list : settled;
}

/** Подпись снятого шага: «−2,5 кг · после «Сведения рук»»; у помощи — «+5 кг помощи · …» */
export function tiredText(ex, set) {
  // Рабочий подход уже сделан — дальше вес ведут оценки, «−1 кг» под
  // подходом с другим весом противоречил полю (FT-754)
  if (!ex || !ex.tired || !set || set.suggest !== 'tired' || set.state !== 'pending' || worked(ex)) return '';
  const step = String(ex.tired.step || '').replace('.', ',');
  return (isAssisted(ex) ? '+' + step + ' кг помощи' : '−' + step + ' кг') + ' · после «' + ex.tired.after + '»';
}

/**
 * Строка «сегодня» при усталости (FT-754): «после «Пек-дек» — 2 кг, на шаг
 * легче» — с весом, который стоит в подходе. Две строки («сегодня так же,
 * закрепляем» и ниже «на шаг легче, −1 кг») читались как противоречие, а
 * когда вес вернули руками или с часов, строка писала «−1 кг» над прежним
 * весом. Пусто — шаг не снят: подход уже сделан или вес поменяли
 */
export function tiredToday(tired, sets, assist = false) {
  if (!tired || !tired.after || !Array.isArray(sets)) return '';
  if (sets.some((s) => s.state === 'done' && s.kind !== 'warmup' && !s.who)) return '';
  const set = sets.find((s) => s.state === 'pending' && s.kind !== 'warmup' && s.suggest === 'tired');
  const value = set && String((assist ? set.assist : set.weight) || '').trim();
  if (!value) return '';
  return 'сегодня после «' + tired.after + '» — ' + (assist ? 'помощь ' : '') + value.replace('.', ',') + ' кг, на шаг легче';
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
 * Повторы в занятии поменяли (23.10.2026): «сегодня на 15 повторов, это
 * примерно 37,5 кг» посчитано сервером под план и уже неправда — вес
 * подходов пересчитан под новые повторы (editSetField). Все рабочие на
 * одно другое число — «сегодня на 20 повторов — вес пересчитан от прошлого
 * раза»; вразнобой — подсказки о сегодня нет (''). Не меняли — null
 */
function repsChanged(last, sets) {
  if (!last || last.action !== 'scaled' || !Array.isArray(sets)) return null;
  const lo = parseInt(last.planReps, 10);
  const reps = [...new Set(sets.filter((s) => s.kind !== 'warmup' && !s.who).map((s) => parseInt(s.reps, 10)).filter((n) => n > 0))];
  if (!reps.length || (reps.length === 1 && reps[0] === lo)) return null;
  return reps.length === 1 ? 'сегодня на ' + reps[0] + ' ' + plural(reps[0], 'повтор', 'повтора', 'повторов') + ' — вес пересчитан от прошлого раза' : '';
}

/**
 * То же — частями, для карточки упражнения (20.10.2026): «Прошлый раз ·
 * 09.10 — 100 · 120 · 140 кг на 8 повторов, было легко» и отдельной
 * строкой «Сегодня +5 кг — было легко» со стрелкой. Одна длинная фраза
 * читалась плохо: в зале ищут глазами число и направление
 */
export function lastRunParts(last, sets = null) {
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
  const changed = repsChanged(last, sets);
  if (changed !== null) return { date, was: what + felt, today: changed, action: 'same' };
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
      // 22.10.2026: не добили или тяжело второй раз подряд
      : last.reason === 'short' ? 'не добили повторы — сегодня ' + kg(-1)
        : last.reason === 'hard' ? 'тяжело второй раз подряд — сегодня ' + kg(-1)
          : 'сегодня ' + kg(-1),
    // Тяжело, но повторы сделаны — закрепляем вес (22.10.2026)
    same: last.reason === 'held' ? 'было тяжело, но сделали — сегодня так же, закрепляем' : 'сегодня так же',
    // Тренер поменял вес в программе после того раза (сервер, 22.10.2026)
    trainer: 'тренер поставил ' + String(last.trainer || '').replace('.', ',') + ' кг — сегодня с него',
    // Повторы другие — вес пересчитан в соотношении (сервер, scaleTo)
    scaled: 'сегодня на ' + (lo || '') + ' ' + plural(lo, 'повтор', 'повтора', 'повторов') + ', это примерно ' + String(last.scaled || '').replace('.', ',') + ' кг',
  }[last.action] || '';
  return today;
}
