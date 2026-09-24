/**
 * mock.js — демо-данные для разработки.
 *
 * Подключается ТОЛЬКО при сборке с VITE_MOCK=1 и грузится динамически,
 * поэтому в обычную сборку не попадает. Нужен, чтобы верстать и смотреть
 * экраны, не поднимая Apps Script и не ожидая его по полсекунды на каждый
 * переход, а также чтобы показать приложение до того, как настроен бэкенд.
 *
 * Роль переключается параметром в адресе: ?mockRole=trainer
 *
 * Вход по коду здесь тоже настоящий — с экраном, кодом и ожиданием. Не
 * хватает только человека с телефоном, поэтому демо-сервер подтверждает
 * код сам через пару опросов. Пройти этот путь глазами важнее, чем
 * сэкономить четыре секунды: экран входа — первое, что видит человек.
 */

import { workoutMock } from './workout-mock.js';

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 19);
};

/** Ближайшее занятие — с временем: на экране оно показывается по часам */
const daysAhead = (n, time) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10) + 'T' + time + ':00';
};

/** Профиль демо-клиента: пустой, чтобы экран показывал именно заполнение */
const demoProfile = {
  birthAt: '', sex: '', height: '', phone: '', email: '', telegram: '', telegramUrl: '',
};

const MEASURE_ROWS = [
  { date: daysAgo(150), 'Вес': 82.4, 'Талия': 94, 'Грудь': 104, 'Бедро': 59, 'Рука': 34, 'Ягодицы': 101, 'Плечи': 118 },
  { date: daysAgo(120), 'Вес': 81.1, 'Талия': 92.5, 'Грудь': 104.5, 'Бедро': 59.5, 'Рука': 34.5, 'Ягодицы': 100.5, 'Плечи': 118.5 },
  { date: daysAgo(90), 'Вес': 79.8, 'Талия': 90, 'Грудь': 105, 'Бедро': 60, 'Рука': 35, 'Ягодицы': 100, 'Плечи': 119 },
  { date: daysAgo(60), 'Вес': 78.9, 'Талия': 88.5, 'Грудь': 105.5, 'Бедро': 60.5, 'Рука': 35.5, 'Ягодицы': 99.5, 'Плечи': 120 },
  { date: daysAgo(30), 'Вес': 77.6, 'Талия': 87, 'Грудь': 106, 'Бедро': 61, 'Рука': 36, 'Ягодицы': 99, 'Плечи': 120.5 },
  { date: daysAgo(4), 'Вес': 76.9, 'Талия': 85.5, 'Грудь': 106.5, 'Бедро': 61.5, 'Рука': 36.5, 'Ягодицы': 98.5, 'Плечи': 121 },
];

const FIELDS = ['Вес', 'Талия', 'Ягодицы', 'Грудь', 'Рука', 'Бедро', 'Плечи'];

/** Какие месяцы тренер скрыл от клиента. Демо начинает с одного скрытого:
 *  оба состояния кнопки должны быть видны без лишних нажатий. */
let hiddenMonths = ['Июль 2026'];

const PLAN_BLOCKS = [
  {
    title: 'Тренировка 1 — верх',
    exercises: [
      { name: 'Жим лёжа', weight: '72.5', prevWeight: '70', sets: '4', reps: '8', rpe: '8' },
      { name: 'Тяга штанги в наклоне', weight: '65', prevWeight: '62.5', sets: '4', reps: '10', rpe: '7' },
      { name: 'Жим гантелей сидя', weight: '24', prevWeight: '24', sets: '3', reps: '12', rpe: '8' },
      { name: 'Подтягивания', weight: '+5', prevWeight: '0', sets: '4', reps: 'макс', rpe: '9' },
    ],
  },
  {
    title: 'Тренировка 2 — низ',
    exercises: [
      { name: 'Присед со штангой', weight: '95', prevWeight: '90', sets: '5', reps: '5', rpe: '8' },
      { name: 'Румынская тяга', weight: '85', prevWeight: '80', sets: '4', reps: '10', rpe: '7' },
      // Суперсет: в таблице это объединённая ячейка «Подходы», здесь —
      // общая группа. Демо должно показывать и его, иначе увидеть эту
      // часть экрана можно только на живом клиенте.
      { name: 'Выпады с гантелями', weight: '20', prevWeight: '20', sets: '3', reps: '12', rpe: '8', supersetGroup: 'superset-9-10' },
      { name: 'Подъём на носки', weight: '40', prevWeight: '40', sets: '3', reps: '15', rpe: '7', supersetGroup: 'superset-9-10' },
    ],
  },
];

const MONTHS = ['Сентябрь 2026', 'Август 2026', 'Июль 2026', 'Июнь 2026'];

const CLIENTS = [
  { row: 3, name: 'Анна Морозова', price: 3000, count: 10, balance: 12000, trainings: 6, revenue: 18000, payer: '', template: 'P01 — Набор массы', monthStatus: '✅ Сентябрь 2026 создан', lastMeasureStatus: '✅ 13.09.2026', monthSheetStatus: '✅ Сентябрь 2026', lastTrainingDate: daysAgo(2), nextTrainingDate: daysAhead(2, '10:00'), startDate: daysAgo(400), birthDate: null, chatId: '11111', clientKey: 'anna', hasLink: true },
  { row: 4, name: 'Евгений и Екатерина', price: 4000, count: 8, balance: -4000, trainings: 4, revenue: 16000, payer: '', template: 'P03 — Сплит', monthStatus: '✅ Сентябрь 2026 создан', lastMeasureStatus: 'Евгений: ✅ 08.09.2026  |  Екатерина: ❌ 20.07.2026', monthSheetStatus: '✅ Сентябрь 2026', lastTrainingDate: daysAgo(5), nextTrainingDate: daysAhead(5, '19:00'), startDate: daysAgo(220), birthDate: null, chatId: '22222', clientKey: 'evgeny', hasLink: true, members: ['Евгений', 'Екатерина'] },
  { row: 5, name: 'Дмитрий Соколов', price: 2500, count: 12, balance: 7500, trainings: 9, revenue: 22500, payer: '', template: 'REPEAT_LAST_MONTH', monthStatus: '✅ Сентябрь 2026 создан', lastMeasureStatus: '❌ 02.08.2026', monthSheetStatus: '✅ Сентябрь 2026', lastTrainingDate: daysAgo(1), nextTrainingDate: daysAhead(1, '08:30'), startDate: daysAgo(700), birthDate: null, chatId: '33333', clientKey: 'dmitry', hasLink: true },
  { row: 6, name: 'Мария Волкова', price: 3000, count: 10, balance: 0, trainings: 0, revenue: 0, payer: '', template: '', monthStatus: '', lastMeasureStatus: '', monthSheetStatus: '❌ нет "Сентябрь 2026"', lastTrainingDate: daysAgo(38), startDate: daysAgo(120), birthDate: null, chatId: '', clientKey: 'maria', hasLink: false },
  { row: 7, name: 'Игорь Лебедев', price: 3500, count: 8, balance: 14000, trainings: 7, revenue: 24500, payer: '', template: 'P02 — Сила', monthStatus: '✅ Сентябрь 2026 создан', lastMeasureStatus: '✅ 11.09.2026', monthSheetStatus: '✅ Сентябрь 2026', lastTrainingDate: daysAgo(3), startDate: daysAgo(310), birthDate: null, chatId: '44444', clientKey: 'igor', hasLink: true },
];

// Демо-ссылки входа: карточка → «Пригласить в приложение»
let accessLinks = {};

let trainerInvites = [
  {
    id: 'demo-reusable', kind: 'reusable', label: 'Ссылка для новых клиентов',
    createdAt: new Date().toISOString(), expiresAt: daysAhead(60, '12:00'),
    useCount: 2, active: true, url: window.location.origin + window.location.pathname + '?invite=demo-reusable-token',
  },
];

const MONTH_COLUMNS = ['Май 2026', 'Июнь 2026', 'Июль 2026', 'Август 2026', 'Сентябрь 2026'];

function financeMetric(label, unit, values) {
  const v = {};
  MONTH_COLUMNS.forEach((m, i) => { v[m] = values[i]; });
  v['2026'] = values[5] !== undefined ? values[5] : '';
  return { label, unit, norm: '', planYear: '', values: v };
}

/* ==========================================================================
 * Питание
 *
 * Справочники и формула здесь повторяют серверные намеренно: mock.js — это
 * и есть подменный сервер, и раз он отвечает на nutrition.save, отвечать он
 * обязан тем же, чем ответил бы настоящий (server/src/lib/nutrition.js и
 * src/150_OpsApi.js). Копия шкалы во фронте была бы ошибкой; копия в
 * заглушке сервера — её работа.
 * ========================================================================== */

const NUTRITION_OPTIONS = {
  sexes: [
    { value: 'm', label: 'Мужской' },
    { value: 'f', label: 'Женский' },
  ],
  activity: [
    { value: 'sedentary', label: 'Сидячий: работа за столом, тренировок нет', factor: 1.2 },
    { value: 'light', label: 'Лёгкая: 1–3 тренировки в неделю', factor: 1.375 },
    { value: 'moderate', label: 'Средняя: 3–5 тренировок в неделю', factor: 1.55 },
    { value: 'high', label: 'Высокая: 6–7 тренировок в неделю', factor: 1.725 },
    { value: 'very_high', label: 'Очень высокая: 2 тренировки в день или тяжёлая работа', factor: 1.9 },
  ],
  goal: [
    { value: 'lose', label: 'Похудение' },
    { value: 'keep', label: 'Поддержание формы' },
    { value: 'gain', label: 'Набор мышечной массы' },
  ],
  limits: {
    age: { min: 14, max: 100 },
    weight: { min: 30, max: 250 },
    height: { min: 120, max: 230 },
  },
};

const GOAL_MATH = {
  lose: { protein: 2.2, fat: 0.8 },
  keep: { protein: 1.8, fat: 1.0 },
  gain: { protein: 2.0, fat: 1.0 },
};

/** Шкала темпов — копия скриптовой (NUTRITION_PACE в src/150_OpsApi.js),
 *  по той же причине, что и остальная математика заглушки. */
const PACE_MATH = {
  lose: [
    { id: 'soft', factor: 0.90, label: 'Мягкий', note: '−10 %', hint: 'Дольше, но почти без голода' },
    { id: 'even', factor: 0.85, label: 'Ровный', note: '−15 %', hint: 'Средний темп, его и советуют' },
    { id: 'fast', factor: 0.80, label: 'Быстрый', note: '−20 %', hint: 'Заметный результат, тяжелее держать' },
  ],
  gain: [
    { id: 'soft', factor: 1.07, label: 'Мягкий', note: '+7 %', hint: 'Медленнее, но почти без жира' },
    { id: 'even', factor: 1.11, label: 'Ровный', note: '+11 %', hint: 'Средний темп, его и советуют' },
    { id: 'fast', factor: 1.15, label: 'Быстрый', note: '+15 %', hint: 'Быстрее масса, но и жира больше' },
  ],
  keep: [
    { id: 'even', factor: 1.00, label: 'Поддержание', note: '0 %', hint: 'Столько, сколько тратите' },
  ],
};

function mockPace(goal, id) {
  const list = PACE_MATH[goal] || PACE_MATH.keep;
  return list.find((p) => p.id === id) || list.find((p) => p.id === 'even') || list[0];
}

/** Анкета демо-клиента. null — ещё не заполнена, и экран открывается
 *  пустым: обе стороны сценария должны быть видны без перезагрузки. */
let nutrition = null;

function mockFail(message) {
  const err = new Error(message);
  err.code = 400;
  throw err;
}

function mockNumber(raw, title) {
  const s = String(raw === undefined || raw === null ? '' : raw).replace(',', '.').trim();
  if (!s) mockFail(title + ': не заполнено');

  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) mockFail(title + ': нужно число больше нуля');
  return n;
}

function mockParseSurvey(params) {
  const L = NUTRITION_OPTIONS.limits;

  const age = Math.round(mockNumber(params.age, 'Возраст'));
  if (age < L.age.min || age > L.age.max) {
    mockFail('Возраст должен быть от ' + L.age.min + ' до ' + L.age.max + ' лет');
  }

  const height = mockNumber(params.height, 'Рост');
  if (height > 1.2 && height < 2.3) {
    mockFail('Рост укажите в сантиметрах, а не в метрах — например 175');
  }
  if (height < L.height.min || height > L.height.max) {
    mockFail('Рост должен быть от ' + L.height.min + ' до ' + L.height.max + ' см');
  }

  const weight = mockNumber(params.weight, 'Вес');
  if (weight < L.weight.min || weight > L.weight.max) {
    mockFail('Вес должен быть от ' + L.weight.min + ' до ' + L.weight.max + ' кг');
  }

  const raw = String(params.sex || '').toLowerCase();
  const sex = raw === 'm' ? 'm' : raw === 'f' ? 'f' : null;
  if (!sex) mockFail('Не выбран пол: формула основного обмена без него не считается');

  const activity = String(params.activity || '');
  if (!NUTRITION_OPTIONS.activity.some((a) => a.value === activity)) {
    mockFail('Не выбран уровень активности');
  }

  const goal = String(params.goal || '');
  if (!GOAL_MATH[goal]) mockFail('Не выбрана цель');

  return {
    age,
    weight: Math.round(weight * 10) / 10,
    height: Math.round(height * 10) / 10,
    sex,
    pace: mockPace(goal, params.pace).id,
    activity,
    goal,
  };
}

/** Миффлин—Сан Жеор с теми же предохранителями, что в src/150_OpsApi.js */
function mockCompute(s) {
  const factor = NUTRITION_OPTIONS.activity.find((a) => a.value === s.activity).factor;
  const bmr = 10 * s.weight + 6.25 * s.height - 5 * s.age + (s.sex === 'm' ? 5 : -161);
  const tdee = bmr * factor;

  const list = PACE_MATH[s.goal] || PACE_MATH.keep;
  const plans = list.map((pace) => mockPlan(s, pace, bmr, tdee));
  const chosen = mockPace(s.goal, s.pace);
  const picked = plans.find((p) => p.id === chosen.id) || plans[0];

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    pace: picked.id,
    paceLabel: picked.label,
    kcal: picked.kcal,
    protein: picked.protein,
    fat: picked.fat,
    carbs: picked.carbs,
    adjusted: picked.adjusted,
    notes: picked.notes,
    plans,
  };
}

function mockPlan(s, pace, bmr, tdee) {
  const goal = GOAL_MATH[s.goal];
  const notes = [];
  let adjusted = false;

  let target = tdee * pace.factor;

  if (target < bmr) {
    target = bmr;
    adjusted = true;
    notes.push('Норма поднята до уровня основного обмена: ниже него дефицит не назначают.');
  }

  let kcal = Math.round(target / 10) * 10;
  let protein = Math.round(s.weight * goal.protein);
  let fat = Math.round(s.weight * goal.fat);
  let carbs = Math.round((kcal - protein * 4 - fat * 9) / 4);

  if (carbs < 50) {
    protein = Math.min(protein, Math.round(s.weight * 1.6));
    fat = Math.min(fat, Math.round(s.weight * 0.8));
    carbs = Math.round((kcal - protein * 4 - fat * 9) / 4);
    adjusted = true;
    notes.push('Белки и жиры снижены до нижней границы (1.6 и 0.8 г/кг): '
      + 'при таком весе и такой цели на углеводы ничего не оставалось.');
  }

  if (carbs < 50) {
    carbs = 50;
    kcal = protein * 4 + fat * 9 + carbs * 4;
    adjusted = true;
    notes.push('Дефицит смягчён: норма поднята до ' + kcal
      + ' ккал, чтобы осталось хотя бы 50 г углеводов.');
  }

  return {
    id: pace.id, label: pace.label, note: pace.note, hint: pace.hint,
    kcal, protein, fat, carbs, adjusted, notes,
  };
}

/**
 * Сколько раз демо-сервер ответит «ещё ждём», прежде чем подтвердит вход.
 * Двух хватает, чтобы увидеть ожидание, и мало, чтобы оно надоело.
 */
const DEMO_POLLS_BEFORE_CONFIRM = 2;

let demoLogin = null;


/* ==========================================================================
 * Сводка тренера: показатели и ряд для графика
 *
 * Выручка по месяцам — с сезоном: летом проседает, к осени растёт. Так на
 * демо видно и зелёные, и красные столбики, а не одну ровную лестницу.
 * ========================================================================== */

const DEMO_REVENUE = [
  ['2025-06', 180000], ['2025-07', 150000], ['2025-08', 165000], ['2025-09', 240000],
  ['2025-10', 262000], ['2025-11', 255000], ['2025-12', 230000], ['2026-01', 210000],
  ['2026-02', 268000], ['2026-03', 301000], ['2026-04', 290000], ['2026-05', 312000],
  ['2026-06', 276000], ['2026-07', 245000], ['2026-08', 340250], ['2026-09', 216850],
];

function demoFinance(months) {
  const revenue = months.reduce((sum, m) => sum + (DEMO_REVENUE.find((r) => r[0] === m) || [0, 0])[1], 0);
  const expenses = 62000 * months.length;
  const trainings = Math.round(revenue / 2437);
  const cash = Math.round(revenue * 0.9);
  const payments = Math.max(1, Math.round(cash / 26000));
  return {
    revenue,
    expenses,
    profit: revenue - expenses,
    cash,
    payments,
    trainings,
    activeClients: 15,
    bank: 281800,
    averageCheck: Math.round(cash / payments),
    perTraining: trainings ? Math.round(revenue / trainings) : null,
    perClient: Math.round(revenue / 15),
    topShare: 58.3,
    bankCover: revenue ? Math.round((281800 / (revenue / months.length)) * 100) / 100 : null,
  };
}

function demoProcess(months) {
  const trainings = demoFinance(months).trainings;
  return {
    activeClients: 23,
    measuredClients: 9 * months.length,
    measuredShare: 39,
    trainings,
    perClient: Math.round((trainings / 15) * 10) / 10,
    withPlan: 18,
    planShare: 78,
    silentClients: 4,
  };
}

function demoPrevMonth(month) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}

function demoMetrics(params) {
  const last = DEMO_REVENUE[DEMO_REVENUE.length - 1][0];

  if (params.year) {
    const year = Number(params.year);
    const through = year === Number(last.slice(0, 4)) ? Number(last.slice(5)) : 12;
    const months = (y) => Array.from({ length: through }, (_, i) => y + '-' + String(i + 1).padStart(2, '0'));
    return {
      year,
      previousYear: year - 1,
      throughMonth: through,
      finance: { now: demoFinance(months(year)), before: demoFinance(months(year - 1)) },
      process: { now: demoProcess(months(year)), before: demoProcess(months(year - 1)) },
    };
  }

  const month = params.month || last;
  const before = params.compare === 'year'
    ? (Number(month.slice(0, 4)) - 1) + month.slice(4)
    : demoPrevMonth(month);

  return {
    month,
    compare: params.compare === 'year' ? 'year' : 'month',
    previousMonth: before,
    finance: { now: demoFinance([month]), before: demoFinance([before]) },
    process: { now: demoProcess([month]), before: demoProcess([before]) },
  };
}

function demoSeries(params) {
  const by = ['month', 'quarter', 'year'].includes(params.by) ? params.by : 'month';
  const last = DEMO_REVENUE[DEMO_REVENUE.length - 1][0];
  const buckets = new Map();

  DEMO_REVENUE.forEach(([month]) => {
    const [y, m] = month.split('-').map(Number);
    const key = by === 'year' ? String(y) : by === 'quarter' ? y + '-Q' + Math.ceil(m / 3) : month;
    if (!buckets.has(key)) buckets.set(key, { key, y, m, months: [] });
    buckets.get(key).months.push(month);
  });

  return {
    by,
    points: [...buckets.values()].map((b) => ({
      key: b.key,
      label: by === 'year' ? String(b.y)
        : by === 'quarter' ? ['I', 'II', 'III', 'IV'][Math.ceil(b.m / 3) - 1] + ' кв. ' + b.y
          : b.key,
      partial: b.months.includes(last),
      finance: demoFinance(b.months),
      process: demoProcess(b.months),
    })),
  };
}


/* ==========================================================================
 * Библиотека тренера: упражнения и шаблоны (демо, в памяти)
 * ========================================================================== */

const DEMO_MUSCLES = ['Грудь', 'Спина', 'Ноги', 'Ягодицы', 'Плечи', 'Руки', 'Пресс', 'Всё тело', 'Кардио'];

let demoExercises = [
  ['Жим гантелей лёжа', 'Грудь', 'Гантели', 'Dumbbell_Bench_Press'],
  ['Тяга верхнего блока к груди', 'Спина', 'Блок', 'Wide-Grip_Lat_Pulldown'],
  ['Приседания со штангой', 'Ноги', 'Штанга', 'Barbell_Squat'],
  ['Ягодичный мост со штангой', 'Ягодицы', 'Штанга', 'Barbell_Hip_Thrust'],
  ['Махи гантелями в стороны', 'Плечи', 'Гантели', 'Side_Lateral_Raise'],
  ['Подъём гантелей на бицепс', 'Руки', 'Гантели', 'Dumbbell_Bicep_Curl'],
  ['Планка', 'Пресс', 'Собственный вес', 'Plank'],
  ['Румынская тяга', 'Ноги', 'Штанга', 'Romanian_Deadlift'],
  ['Бёрпи', 'Всё тело', 'Собственный вес', null],
].map(([name, muscle, equipment, anim], i) => ({
  id: i + 1, name, muscle, equipment, notes: '', mine: false, common: true,
  media: anim ? { kind: 'animation', url: anim } : null,
}));

let demoHidden = new Set();

const demoBlocks = [
  { title: 'Тренировка 1 — верх', exercises: [
    { name: 'Жим гантелей лёжа', sets: '3', reps: '12', weight: '', rpe: '', supersetGroup: '' },
    { name: 'Тяга верхнего блока к груди', sets: '3', reps: '12', weight: '', rpe: '', supersetGroup: '' },
  ] },
  { title: 'Тренировка 2 — низ', exercises: [
    { name: 'Приседания со штангой', sets: '4', reps: '10', weight: '', rpe: '', supersetGroup: '' },
    { name: 'Ягодичный мост со штангой', sets: '4', reps: '12', weight: '', rpe: '', supersetGroup: '' },
  ] },
];

let demoTemplates = [
  { id: 1, kind: 'program', title: 'Похудение, 3 раза в неделю', goal: 'Похудение', level: 'Новичок', description: 'Круговой формат, отдых 60 секунд.', isPublic: false, mine: true, author: 'Константин', blocks: demoBlocks, uses: 0 },
  { id: 2, kind: 'program', title: 'Сила: база 5×5', goal: 'Сила', level: 'Средний', description: '', isPublic: true, mine: false, author: 'Мария', blocks: demoBlocks, uses: 4 },
  { id: 3, kind: 'workout', title: 'Ноги и ягодицы', goal: 'Тонус', level: '', description: '', isPublic: false, mine: true, author: 'Константин', blocks: [demoBlocks[1]], uses: 0 },
];

let demoTemplateSeq = 10;
let demoExerciseSeq = 100;

function demoTemplateCard(t, withBlocks) {
  const exercises = t.blocks.reduce((s, b) => s + b.exercises.length, 0);
  const card = { ...t, workouts: t.blocks.length, exercises };
  if (!withBlocks) delete card.blocks;
  return card;
}

function demoTemplatesList(params) {
  const scope = params.scope === 'public' ? 'public' : 'mine';
  const list = demoTemplates
    .filter((t) => (scope === 'public' ? !t.mine && t.isPublic : t.mine))
    .filter((t) => !params.kind || t.kind === params.kind)
    .map((t) => demoTemplateCard(t, false));
  return { scope, templates: list, goals: [...new Set(list.map((t) => t.goal).filter(Boolean))] };
}

function demoTemplate(id) {
  const t = demoTemplates.find((x) => x.id === Number(id));
  if (!t) throw Object.assign(new Error('Шаблон не найден.'), { code: 404 });
  return t;
}

function demoTemplateSave(params) {
  const fields = {
    kind: params.kind || 'program',
    title: params.title || 'Без названия',
    goal: params.goal || '',
    level: params.level || '',
    description: params.description || '',
    isPublic: !!params.isPublic,
    blocks: params.blocks || [],
  };
  if (params.id) {
    const t = demoTemplate(params.id);
    Object.assign(t, fields);
    return demoTemplateCard(t, true);
  }
  const t = { id: ++demoTemplateSeq, mine: true, author: 'Константин', uses: 0, ...fields };
  demoTemplates = [t, ...demoTemplates];
  return demoTemplateCard(t, true);
}

const MOCK = {
  // Пакет: те же обработчики, только за один «поход на сервер». Нужен
  // здесь, чтобы демо-режим повторял боевой путь загрузки, а не шёл
  // мимо него по запасной ветке.
  'batch': (params) => {
    const list = typeof params.requests === 'string'
      ? JSON.parse(params.requests)
      : (params.requests || []);

    return {
      results: list.map((req) => {
        const handler = MOCK[req.action];
        if (!handler) {
          return { action: req.action, ok: false, code: 404, error: 'Нет демо-данных для ' + req.action };
        }
        return {
          action: req.action,
          ok: true,
          data: handler({ ...(req.params || {}), __role: params.__role }),
        };
      }),
    };
  },

  /* ---------- Вход ---------- */

  'auth.request': (params) => {
    demoLogin = { code: 'D3M0FT', polls: 0, device: params.device || '' };

    return {
      code: demoLogin.code,
      link: 'https://t.me/demo_fit_bot?start=login_' + demoLogin.code,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      ttlSec: 15 * 60,
    };
  },

  'auth.poll': (params) => {
    // Кода нет вовсе — ровно то, что ответил бы сервер после перезапуска
    // с сохранённым, но уже забытым им кодом
    if (!demoLogin || demoLogin.code !== String(params.code || '').toUpperCase()) {
      return { status: 'unknown', message: 'Код не найден, запросите вход заново.' };
    }

    demoLogin.polls += 1;
    if (demoLogin.polls <= DEMO_POLLS_BEFORE_CONFIRM) return { status: 'pending' };

    demoLogin = null;

    return {
      status: 'confirmed',
      token: 'demo-token',
      chatId: '11111',
      expiresAt: new Date(Date.now() + 90 * 86400 * 1000).toISOString(),
    };
  },

  'auth.transfer.create': () => ({
    ticket: 'demo-transfer-ticket',
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    ttlSec: 300,
  }),

  'auth.transfer.consume': () => ({
    token: 'demo-token',
    chatId: '11111',
    expiresAt: new Date(Date.now() + 90 * 86400 * 1000).toISOString(),
  }),

  'auth.install.create': () => ({
    ticket: 'demo-install-ticket',
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    ttlSec: 900,
  }),

  'auth.logout': () => ({ ok: true, revoked: 1 }),

  'me': (params) => ({
    role: params.__role === 'trainer' ? 'trainer' : 'client',
    name: params.__role === 'trainer' ? 'Константин' : 'Анна Морозова',
    chatId: '11111',
    tgName: 'Demo',
    tgUsername: 'demo',
    photoUrl: '',
    hasPersonalSheet: true,
  }),

  'client.overview': () => ({
    name: 'Анна Морозова',
    row: 3,
    balance: 12000,
    price: 3000,
    trainingsLeft: 4,
    trainingsThisMonth: 6,
    lastTrainingDate: daysAgo(2),
    nextTrainingDate: daysAhead(2, '10:00'),
    scheduleKnown: true,
    startDate: daysAgo(400),
    birthDate: null,
    lastMeasureStatus: '✅ 13.09.2026',
    monthSheetStatus: '✅ Сентябрь 2026',
    currentMonthName: 'Сентябрь 2026',
    hasPersonalSheet: true,
  }),

  'trainer.split.save': (params) => ({ row: params.clientRow, name: '', members: params.members || [] }),

  'food.search': (params) => {
    const all = [
      { id: 1, name: 'Сникерс', kcal: 507, protein: 9.3, fat: 27.6, carbs: 55.5, piece: 50, uses: 12 },
      { id: 2, name: 'Капучино 300 мл', kcal: 45, protein: 2.4, fat: 2.1, carbs: 3.9, piece: 300, uses: 7 },
    ];
    const q = String(params.q || '').toLowerCase();
    return { foods: all.filter((f) => !q || f.name.toLowerCase().includes(q)) };
  },
  'food.add': (params) => ({ food: { id: 99, name: params.name, kcal: Number(params.kcal) || 0, protein: Number(params.protein) || 0, fat: Number(params.fat) || 0, carbs: Number(params.carbs) || 0, piece: Number(params.piece) || 0, uses: 0 }, existed: false }),
  'food.use': () => ({ ok: true }),
  'food.like': (params) => ({ id: params.id, liked: !!params.liked }),

  'expense.list': (params) => ({
    month: params.month || new Date().toISOString().slice(0, 7),
    expenses: [
      { id: 1, spent_at: new Date().toISOString().slice(0, 10), category: 'Аренда зала', amount: 45000, note: '' },
      { id: 2, spent_at: new Date().toISOString().slice(0, 10), category: 'Реклама', amount: 12000, note: 'Таргет, сентябрь' },
      { id: 3, spent_at: new Date().toISOString().slice(0, 10), category: 'Инвентарь', amount: 5000, note: '' },
    ],
    total: 62000,
    categories: ['Аренда зала', 'Реклама', 'Инвентарь'],
  }),

  // Расписание в демо: занятия клиентов на этой неделе
  'trainer.schedule': () => ({
    events: CLIENTS.filter((c) => c.nextTrainingDate).map((c, i) => ({
      id: 'demo-ev-' + i,
      clientRow: c.row,
      clientName: c.name,
      title: c.name,
      startsAt: c.nextTrainingDate,
      endsAt: new Date(new Date(c.nextTrainingDate).getTime() + 3600000).toISOString(),
      done: false,
    })),
    calendar: true,
    serviceEmail: 'demo@example.iam.gserviceaccount.com',
    feedUrl: 'https://example.invalid/ics/t-demo.ics',
  }),
  'trainer.schedule.save': () => ({ id: 'demo-ev-new' }),
  'trainer.schedule.delete': (params) => ({ deleted: params.id }),
  'client.schedule.feed': () => ({ url: 'https://example.invalid/ics/c-demo.ics' }),

  // Семья в демо: у Анны — брат, за которого она платит
  'family.list': () => ({ members: [{ row: 5, name: 'Дмитрий Соколов', payer: false }] }),
  'trainer.client.family': (params) => ({
    row: params.clientRow,
    family: { enabled: !!params.enabled, members: [{ name: 'Дмитрий Соколов', payer: false, enabled: true }] },
  }),

  'client.measurements': () => ({
    series: [{ label: '', sheetName: 'Показатели', rows: MEASURE_ROWS }],
    fields: FIELDS,
  }),

  // Правка программы. Демо держит её в памяти: показать редактор без
  // настоящего сервера иначе нечем, а результат должен быть виден сразу.
  'plan.save': (params) => {
    const blocks = (params.blocks || [])
      .map((b) => ({
        title: b.title,
        exercises: (b.exercises || []).filter((e) => String(e.name || '').trim()),
      }))
      .filter((b) => b.exercises.length);

    PLAN_BLOCKS.length = 0;
    PLAN_BLOCKS.push(...blocks);

    return { month: params.month, blocks };
  },

  'plan.month.create': (params) => ({ month: params.month, blocks: [] }),

  // Профиль клиента. Живёт в памяти демо: показать экран без настоящего
  // сервера иначе нечем, а сохранение должно быть видно сразу.
  'profile.get': () => ({
    clientRow: 3,
    name: 'Анна Морозова',
    profile: { ...demoProfile },
    age: demoProfile.birthAt ? new Date().getFullYear() - Number(demoProfile.birthAt.slice(0, 4)) : null,
    canEdit: true,
  }),

  'profile.save': (params) => {
    ['birthAt', 'sex', 'height', 'phone', 'email'].forEach((field) => {
      if (params[field] !== undefined) demoProfile[field] = String(params[field] || '').trim();
    });

    if (params.telegram !== undefined) {
      const name = String(params.telegram || '').trim().replace(/^https?:\/\//i, '')
        .replace(/^t\.me\//i, '').replace(/^@/, '').split(/[/?#]/)[0];

      if (name && !/^[a-zA-Z0-9_]{4,32}$/.test(name)) {
        throw new Error('Имя пользователя в Telegram — латиница, цифры и подчёркивание.');
      }

      demoProfile.telegram = name;
      demoProfile.telegramUrl = name ? 'https://t.me/' + name : '';
    }

    if (demoProfile.height && Number(demoProfile.height) < 100) {
      throw new Error('Рост: ожидали от 100 до 250 см.');
    }

    return MOCK['profile.get']();
  },

  'profile.telegram.link': () => ({ url: 'https://t.me/demo_fit_bot?start=tg_demo' }),

  // Замер из приложения. Демо-сервер ведёт себя как настоящий: пустое поле
  // значит «не мерил», замер за тот же день заменяет прежний, а не
  // добавляет вторую точку на график.
  'measure.create': (params) => {
    const values = {};
    FIELDS.forEach((field) => {
      const raw = params.values && params.values[field];
      const text = String(raw === undefined || raw === null ? '' : raw).trim().replace(',', '.');
      if (text) values[field] = Math.round(Number(text) * 10) / 10;
    });

    if (!Object.keys(values).length) throw new Error('Введите хотя бы один показатель.');

    const date = String(params.date || '').trim() || new Date().toISOString().slice(0, 10);
    const existing = MEASURE_ROWS.find((r) => String(r.date).slice(0, 10) === date);

    if (existing) Object.assign(existing, values);
    else MEASURE_ROWS.push({ date, ...values });

    return { sheetName: 'Показатели', date, values, replaced: !!existing };
  },

  // Видимость месяцев живёт здесь же: демо должно показывать оба состояния
  // кнопки, иначе проверить её нечем.
  'client.plan': (params) => {
    const clientView = params.clientView === true || String(params.clientView).toLowerCase() === 'true';
    const trainer = !!params.clientRow && !clientView;
    const visible = MONTHS.filter((m) => trainer || hiddenMonths.indexOf(m) === -1);
    const month = visible.indexOf(params.month) !== -1 ? params.month : visible[0] || '';

    return {
      month,
      available: visible,
      hidden: trainer ? hiddenMonths.slice() : [],
      canHide: trainer,
      // Сплит в демо — «Евгений и Екатерина» (строка 4)
      members: Number(params.clientRow) === 4 ? ['Евгений', 'Екатерина'] : [],
      blocks: month
        ? (Number(params.clientRow) === 4
          ? PLAN_BLOCKS.map((b) => ({ ...b, exercises: b.exercises.map((e, i) => ({
            ...e,
            performers: i === 1 ? ['Екатерина'] : [],
            splitWeights: i === 1 ? { Екатерина: '20' } : { Евгений: '60', Екатерина: '30' },
            splitPrev: {},
          })) }))
          : PLAN_BLOCKS)
        : [],
      note: month ? '' : 'В таблице клиента пока нет ни одного листа с программой.',
    };
  },

  'plan.month.visibility': (params) => {
    const month = String(params.month || '');
    const want = params.hidden === true || String(params.hidden) === 'true';
    const at = hiddenMonths.indexOf(month);

    if (want && at === -1) hiddenMonths.push(month);
    if (!want && at !== -1) hiddenMonths.splice(at, 1);

    return { row: params.clientRow || 3, month, hidden: want };
  },

  'client.progress': () => ({
    series: [{
      label: '',
      rows: MEASURE_ROWS,
      deltas: {
        'Вес': { first: 82.4, firstDate: daysAgo(150), last: 76.9, lastDate: daysAgo(4), delta: -5.5, points: 6 },
        'Талия': { first: 94, firstDate: daysAgo(150), last: 85.5, lastDate: daysAgo(4), delta: -8.5, points: 6 },
        'Грудь': { first: 104, firstDate: daysAgo(150), last: 106.5, lastDate: daysAgo(4), delta: 2.5, points: 6 },
        'Рука': { first: 34, firstDate: daysAgo(150), last: 36.5, lastDate: daysAgo(4), delta: 2.5, points: 6 },
      },
    }],
    lifts: [
      { name: 'Присед со штангой', block: 'Тренировка 2 — низ', weight: 95, prevWeight: 90, delta: 5, deltaPct: 5.6 },
      { name: 'Румынская тяга', block: 'Тренировка 2 — низ', weight: 85, prevWeight: 80, delta: 5, deltaPct: 6.3 },
      { name: 'Жим лёжа', block: 'Тренировка 1 — верх', weight: 72.5, prevWeight: 70, delta: 2.5, deltaPct: 3.6 },
      { name: 'Тяга штанги в наклоне', block: 'Тренировка 1 — верх', weight: 65, prevWeight: 62.5, delta: 2.5, deltaPct: 4 },
      { name: 'Жим гантелей сидя', block: 'Тренировка 1 — верх', weight: 24, prevWeight: 24, delta: 0, deltaPct: 0 },
    ],
    monthsAvailable: MONTHS,
    currentMonth: 'Сентябрь 2026',
    hasCurrentMonthSheet: true,
  }),

  'client.nutrition': () => ({
    configured: !!nutrition,
    survey: nutrition ? nutrition.survey : null,
    targets: nutrition ? nutrition.targets : null,
    filledAt: nutrition ? nutrition.filledAt : null,
    daysSinceFilled: nutrition ? 0 : null,
    isNew: !!nutrition,
    pace: nutrition ? nutrition.pace : null,
    plans: nutrition ? nutrition.plans : [],
    options: NUTRITION_OPTIONS,
    meals: [],
    sheetName: 'Питание',
    note: nutrition ? '' : 'Анкета питания ещё не заполнена.',
  }),

  // Запись анкеты. Считаем по-настоящему, той же формулой, что и таблица:
  // демо нужно, чтобы смотреть экран на живых числах, а заглушка с
  // фиксированной нормой показывала бы одно и то же при любых ответах.
  // Проверки тоже настоящие — иначе форму нечем проверить.
  'nutrition.save': (params) => {
    const survey = mockParseSurvey(params);
    const calc = mockCompute(survey);
    const name = params.clientRow ? 'Дмитрий Соколов' : 'Анна Морозова';

    nutrition = {
      survey: {
        age: survey.age,
        weight: survey.weight,
        height: survey.height,
        sex: survey.sex,
        activity: survey.activity,
        activityLabel: NUTRITION_OPTIONS.activity.find((a) => a.value === survey.activity).label,
        goal: survey.goal,
        goalLabel: NUTRITION_OPTIONS.goal.find((g) => g.value === survey.goal).label,
        pace: calc.pace,
        paceLabel: calc.paceLabel,
      },
      targets: { kcal: calc.kcal, protein: calc.protein, fat: calc.fat, carbs: calc.carbs },
      pace: calc.pace,
      plans: calc.plans,
      filledAt: new Date().toISOString().slice(0, 19),
    };

    return {
      row: params.clientRow || 3,
      name,
      clientName: name,
      survey: nutrition.survey,
      targets: nutrition.targets,
      pace: calc.pace,
      plans: calc.plans,
      bmr: calc.bmr,
      tdee: calc.tdee,
      adjusted: calc.adjusted,
      notes: calc.notes,
      filledAt: nutrition.filledAt,
      filledBy: params.clientRow ? 'trainer' : 'client',
      columnsCreated: [],
    };
  },

  // Смена темпа. Анкету не трогаем — ровно как настоящая операция: она
  // читает ответы из строки клиента, а здесь они лежат в nutrition.
  'nutrition.pace': (params) => {
    if (!nutrition) mockFail('Анкета питания ещё не заполнена');

    const survey = { ...nutrition.survey, pace: mockPace(nutrition.survey.goal, params.pace).id };
    const calc = mockCompute(survey);
    const name = params.clientRow ? 'Дмитрий Соколов' : 'Анна Морозова';

    nutrition.survey = { ...nutrition.survey, pace: calc.pace, paceLabel: calc.paceLabel };
    nutrition.targets = { kcal: calc.kcal, protein: calc.protein, fat: calc.fat, carbs: calc.carbs };
    nutrition.pace = calc.pace;
    nutrition.plans = calc.plans;

    return {
      row: params.clientRow || 3,
      name,
      clientName: name,
      survey: nutrition.survey,
      targets: nutrition.targets,
      pace: calc.pace,
      plans: calc.plans,
      bmr: calc.bmr,
      tdee: calc.tdee,
      adjusted: calc.adjusted,
      notes: calc.notes,
    };
  },

  // Пересчёт по календарю в демо ничего не считает, но отвечает той же
  // формой и с той же задержкой: кнопка в демо должна вести себя как в бою,
  // иначе проверять по ней нечего.
  'calendar.refresh': () => ({
    clients: 5, trainings: 34, revenue: 102000,
    mirrorUpdated: true, ms: 12400, at: new Date().toISOString(),
  }),

  'trainer.clients': () => ({
    clients: CLIENTS,
    summary: {
      count: CLIENTS.length,
      totalTrainings: 26,
      today: {
        total: 4,
        done: 1,
        next: { name: CLIENTS[0].name, at: new Date(Date.now() + 90 * 60000).toISOString() },
      },
      negativeBalance: 1,
      staleClients: 1,
      staleDays: 14,
      currentMonth: 'Сентябрь 2026',
    },
  }),

  'trainer.invites': () => ({ invites: trainerInvites }),

  'trainer.invite.create': (params) => {
    const invite = {
      id: 'demo-' + Date.now(), kind: params.kind === 'single' ? 'single' : 'reusable',
      label: String(params.label || ''), createdAt: new Date().toISOString(),
      expiresAt: daysAhead(params.kind === 'single' ? 7 : 90, '12:00'), useCount: 0, active: true,
      url: window.location.origin + window.location.pathname + '?invite=demo-' + Date.now(),
    };
    trainerInvites = [invite, ...trainerInvites];
    return invite;
  },

  'trainer.invite.revoke': (params) => {
    trainerInvites = trainerInvites.filter((invite) => invite.id !== params.inviteId);
    return { ok: true, id: params.inviteId };
  },

  'trainer.client.create': (params) => {
    const row = Math.max(...CLIENTS.map((client) => client.row)) + 1;
    const created = {
      row, name: String(params.name || '').trim(), price: 0, count: 0, balance: 0,
      trainings: 0, revenue: 0, payer: '', template: '', monthStatus: '',
      lastMeasureStatus: '', monthSheetStatus: '', lastTrainingDate: null,
      startDate: new Date().toISOString().slice(0, 10), birthDate: null,
      chatId: '', clientKey: 'demo_' + row, hasLink: false,
    };
    CLIENTS.push(created);
    return { row, name: created.name, clientKey: created.clientKey, created: true, mirrored: true };
  },

  'trainer.client.link': (params) => ({ link: accessLinks[params.clientRow] || null }),

  'trainer.client.link.create': (params) => {
    const token = 'demo-access-' + params.clientRow + '-' + Date.now();
    accessLinks[params.clientRow] = {
      id: token, clientRow: params.clientRow, createdAt: new Date().toISOString(),
      expiresAt: daysAhead(30, '12:00'), useCount: 0, maxUses: 5, usesLeft: 5,
      lastUsedAt: null, active: true, token,
      url: window.location.origin + window.location.pathname + '?access=' + token,
    };
    return { link: accessLinks[params.clientRow] };
  },

  'trainer.client.link.revoke': (params) => {
    delete accessLinks[params.clientRow];
    return { revoked: 1 };
  },

  'auth.access.inspect': () => ({
    active: true, name: 'Анна Морозова', expiresAt: daysAhead(30, '12:00'), usesLeft: 5,
  }),

  'auth.access.enter': () => ({
    token: 'demo-session', name: 'Анна Морозова', expiresAt: daysAhead(90, '12:00'),
  }),

  'auth.invite.inspect': () => ({
    active: true, kind: 'reusable', label: '', expiresAt: daysAhead(30, '12:00'),
    telegramUrl: 'https://t.me/example_bot?start=join_demo',
    methods: { telegram: true, email: false },
  }),

  'trainer.client.access.reset': (params) => ({
    clientRow: params.clientRow,
    clientName: CLIENTS.find((client) => client.row === params.clientRow)?.name || 'Клиент',
    revokedSessions: 2,
    hadTelegram: true,
    unlinked: params.unlinkTelegram === true,
  }),

  'library.exercises': (params = {}) => ({
    exercises: demoExercises.filter((e) => demoHidden.has(e.id) === !!params.hidden),
    muscles: DEMO_MUSCLES,
    hiddenCount: demoHidden.size,
  }),
  'library.exercise.save': (params) => {
    const existing = demoExercises.find((e) => e.id === Number(params.id));
    if (existing && existing.mine) {
      Object.assign(existing, { name: params.name, muscle: params.muscle, equipment: params.equipment, notes: params.notes, media: params.link ? { kind: 'link', url: params.link } : existing.media });
      return existing;
    }
    const inherited = existing && existing.media && existing.media.kind === 'animation' ? existing.media : null;
    const mine = { id: ++demoExerciseSeq, name: params.name, muscle: params.muscle || '', equipment: params.equipment || '', notes: params.notes || '', media: params.link ? { kind: 'link', url: params.link } : inherited, mine: true, common: false };
    demoExercises = [...demoExercises.filter((e) => !(existing && e.id === existing.id)), mine];
    return mine;
  },
  'library.exercise.delete': (params) => {
    const e = demoExercises.find((x) => x.id === Number(params.id));
    if (e && e.common) { demoHidden.add(e.id); return { deleted: true, hidden: true }; }
    demoExercises = demoExercises.filter((x) => x.id !== Number(params.id));
    return { deleted: true };
  },
  'library.exercise.restore': (params) => {
    const ids = (params.ids || [params.id]).map(Number);
    ids.forEach((id) => demoHidden.delete(id));
    return { restored: ids.length };
  },
  'library.templates': (params) => demoTemplatesList(params),
  'library.template.get': (params) => demoTemplateCard(demoTemplate(params.id), true),
  'library.template.save': (params) => demoTemplateSave(params),
  'library.template.delete': (params) => {
    demoTemplates = demoTemplates.filter((t) => t.id !== Number(params.id));
    return { deleted: true };
  },
  'library.template.copy': (params) => {
    const source = demoTemplate(params.id);
    return demoTemplateSave({ ...source, id: undefined, isPublic: false });
  },
  'library.template.fromClient': (params) => demoTemplateSave({ kind: params.kind || 'program', title: params.title, goal: params.goal, isPublic: params.isPublic, blocks: demoBlocks }),
  'plan.fromTemplate': (params) => ({ month: params.month, blocks: demoTemplate(params.templateId).blocks }),

  'trainer.metrics': (params) => demoMetrics(params),
  'trainer.metrics.series': (params) => demoSeries(params),

  'trainer.finance': () => ({
    sheet: 'BSC_Финансы',
    columns: [
      ...MONTH_COLUMNS.map((label, i) => ({ index: 6 + i, label, isYearTotal: false })),
      { index: 11, label: '2026', isYearTotal: true },
    ],
    metrics: [
      financeMetric('Выручка', '₽', ['214 000', '228 500', '196 000', '243 000', '81 000', '962 500']),
      financeMetric('Прибыль', '₽', ['152 000', '166 500', '134 000', '181 000', '19 000', '652 500']),
      financeMetric('Средний чек', '₽', ['3 100', '3 150', '3 200', '3 200', '3 200', '3 170']),
      financeMetric('Тренировок проведено', 'шт', ['69', '73', '62', '76', '26', '306']),
      financeMetric('Активных клиентов', 'чел', ['12', '13', '11', '14', '5', '5']),
      financeMetric('Банк(предоплата)', '₽', ['180 000', '195 000', '160 000', '210 000', '96 000', '96 000']),
      financeMetric('Выручка на тренировку', '₽', ['3 101', '3 130', '3 161', '3 197', '3 115', '3 141']),
      financeMetric('Выручка на клиента', '₽', ['17 833', '17 577', '17 818', '17 357', '16 200', '17 357']),
      financeMetric('Доля топ-5 клиентов', '%', ['52,1', '49,8', '54,3', '47,6', '100', '60,8']),
      financeMetric('Покрытие банком', 'мес', ['0,84', '0,85', '0,82', '0,86', '1,19', '0,91']),
    ],
  }),

  'trainer.processes': () => ({
    sheet: 'BSC_Процессы',
    columns: MONTH_COLUMNS.map((label, i) => ({ index: 6 + i, label, isYearTotal: false })),
    metrics: [
      financeMetric('Клиентов с замерами в месяц', 'чел', ['9', '11', '8', '12', '3']),
      financeMetric('% охвата замерами', '%', ['75%', '85%', '73%', '86%', '60%']),
      financeMetric('Тренировок на клиента', 'шт', ['5,8', '5,6', '5,6', '5,4', '5,2']),
      financeMetric('Клиентов с актуальной программой', 'чел', ['12', '13', '10', '14', '4']),
      financeMetric('Клиентов без таблиц тренировок', 'чел', ['0', '0', '1', '0', '1']),
      financeMetric('Клиентов без тренировок > 14 дней', 'чел', ['1', '0', '2', '1', '1']),
    ],
  }),

  'trainer.lost': () => ({
    clients: [
      { row: 2, name: 'Олег Петров', moveDate: daysAgo(40), balance: -3000, price: 3000, revenue: 9000, trainings: 3 },
      { row: 3, name: 'Светлана Гусева', moveDate: daysAgo(95), balance: 0, price: 2800, revenue: 22400, trainings: 8 },
    ],
  }),

  'trainer.logs': () => ({
    entries: [
      { at: '17.09.2026 12:04:11', action: 'Оплата', client: 'Анна Морозова', row: '3', details: '+30000', result: '✅' },
      { at: '17.09.2026 11:58:02', action: 'Календарь', client: 'ALL', row: '0', details: 'Обновить (row2)', result: '✅ Обновлено' },
      { at: '16.09.2026 19:22:47', action: 'Создать мес', client: 'Игорь Лебедев', row: '7', details: 'template=P02', result: '✅ Сентябрь 2026 создан по шаблону P02' },
      { at: '16.09.2026 09:15:30', action: 'Архив', client: 'Олег Петров', row: '8', details: 'Клиенты → Пропащие, баланс на момент переноса: -3000', result: '✅' },
      { at: '15.09.2026 21:40:05', action: 'BSC', client: 'ALL', row: '0', details: 'Обновить с дашборда, месяцев: 9', result: '✅' },
      { at: '15.09.2026 08:03:19', action: 'Статистика клиентов', client: 'ALL', row: '0', details: 'обновлено: 5, пропущено: 1', result: '⚠️' },
    ],
    total: 482,
  }),

  'trainer.sheets': () => ({
    spreadsheetName: 'Админ панель тренировок',
    sheets: [
      { name: 'Клиенты', rows: 5, cols: 24 },
      { name: 'Пропащие', rows: 2, cols: 18 },
      { name: 'БанкИстория', rows: 128, cols: 4 },
      { name: 'Логи', rows: 482, cols: 6 },
      { name: 'BSC_Финансы', rows: 10, cols: 11 },
      { name: 'BSC_Процессы', rows: 6, cols: 11 },
      { name: 'Август 2026', rows: 14, cols: 24 },
      { name: 'Июль 2026', rows: 11, cols: 24 },
    ],
  }),

  'payment.list': () => ({
    payments: [
      { id: 'P12', date: daysAgo(3), client: 'Анна Морозова', amount: 30000, cancellable: true },
      { id: 'P8', date: daysAgo(34), client: 'Анна Морозова', amount: 30000, cancellable: true },
      { id: '', date: daysAgo(70), client: 'Анна Морозова', amount: 28000, cancellable: false },
    ],
  }),

  'payment.create': (params) => ({
    ok: true,
    paymentId: 'P13',
    amount: Math.round((params.price || 0) * (params.count || 0)),
    clientName: 'Анна Морозова',
  }),

  'payment.cancel': (params) => ({
    ok: true,
    paymentId: params.paymentId,
    amount: 30000,
  }),

  'trainer.sheet': (params) => ({
    name: params.name,
    headers: ['Дата оплаты', 'Имя клиента', 'Сумма', 'Строка'],
    rows: [
      ['17.09.2026', 'Анна Морозова', '30 000', '3'],
      ['12.09.2026', 'Игорь Лебедев', '28 000', '7'],
      ['05.09.2026', 'Дмитрий Соколов', '30 000', '5'],
      ['02.09.2026', 'Евгений и Екатерина', '32 000', '4'],
    ],
    total: 128,
    truncated: true,
  }),
};

export function mockApi(action, params) {
  const role = new URLSearchParams(window.location.search).get('mockRole') || 'client';
  const handler = action.startsWith('workout.') ? p => workoutMock(action, p) : MOCK[action];

  return new Promise((resolve, reject) => {
    // Небольшая задержка — чтобы скелетоны и состояния загрузки были видны
    // при разработке, а не проскакивали мгновенно.
    setTimeout(() => {
      if (!handler) {
        reject(Object.assign(new Error('Нет демо-данных для ' + action), { code: 404 }));
        return;
      }

      // Отказ демо-сервера должен доехать до экрана отклонённым обещанием.
      // Исключение, брошенное прямо из таймера, не поймает никто: оно
      // уронит вкладку, а форма так и останется ждать ответа.
      try {
        resolve(handler({ ...params, __role: role }));
      } catch (err) {
        if (action.startsWith('workout.')) err.code = err.code || 400;
        reject(err);
      }
    }, 180);
  });
}
