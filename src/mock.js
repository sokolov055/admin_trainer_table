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

import { RECIPES as RECIPES_DEMO, FOOD as FOOD_DEMO } from './nutrition/recipes.js';
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

// Правки расписания в демо живут до перезагрузки страницы. Этого хватает,
// чтобы проверить создание и перетаскивание тем же путём, что в приложении.
const DEMO_SCHEDULE_CHANGES = new Map();

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

// Тренеры сервиса: владелец, одна заявка и работающий тренер
let mockTrainers = [
  { id: 1, email: 'owner@fittrack.demo', name: 'Константин Соколов', status: 'active', owner: true, clients: 23, appliedAt: null },
  { id: 2, email: 'maria@fittrack.demo', name: 'Мария Ковалёва', status: 'pending', owner: false, clients: 0, appliedAt: daysAgo(0) },
  { id: 3, email: 'igor@fittrack.demo', name: 'Игорь Власов', status: 'active', owner: false, clients: 6, appliedAt: daysAgo(12) },
];

const PLAN_BLOCKS = [
  {
    title: 'Тренировка 1 — верх',
    exercises: [
      { name: 'Жим лёжа', weight: '72.5', prevWeight: '70', sets: '4', reps: '8', rpe: '8' },
      // Типы упражнений (track) — как их отдаёт сервер: дропсет, вес
      // одной гантели, свой вес с добавкой
      { name: 'Тяга штанги в наклоне', weight: '65', prevWeight: '62.5', sets: '4', reps: '10', rpe: '7', technique: 'dropset' },
      { name: 'Жим гантелей сидя', weight: '24', prevWeight: '24', sets: '3', reps: '12', rpe: '8', track: { kind: 'strength', machine: '', unilateral: false, perSide: true } },
      { name: 'Подтягивания', weight: '+5', prevWeight: '0', sets: '4', reps: 'макс', rpe: '9', track: { kind: 'bodyweight', machine: '', unilateral: false, perSide: false } },
    ],
  },
  {
    title: 'Тренировка 2 — низ',
    exercises: [
      // Кардио-разминка: время, скорость, наклон
      { name: 'Беговая дорожка', weight: '', prevWeight: '', sets: '1', reps: '', rpe: '', track: { kind: 'cardio', machine: 'treadmill', unilateral: false, perSide: false },
        cardio: { machine: 'treadmill', metrics: ['time', 'distance'], targets: { time: '10', distance: '1.2', kcal: '', pulse: '' }, settings: { speed: '6', incline: '5', level: '' }, intervals: null } },
      // Из базы: карточка с техникой и проверенной инструкцией «Как настроить»
      // startSets/lastRun — как посчитал бы сервер (lib/effort.js): в
      // последний раз лесенка 60 · 80 · 95 · 95 · 95 на 5 и «легко» —
      // сегодня рабочим +10
      { name: 'Присед со штангой', weight: '95', prevWeight: '90', lastWeight: '95', sets: '5', reps: '5', rpe: '8', exerciseId: 3,
        startSets: [['70', 'work'], ['90', 'work'], ['105', 'work'], ['105', 'work'], ['105', 'work']].map(([weight, kind]) => ({ weight, reps: '5', kind })),
        lastRun: { date: '2026-09-29', weights: ['60', '80', '95', '95', '95'], reps: ['5', '5', '5', '5', '5'], planReps: '5', effort: 'easy', streak: 0, action: 'up', step: 10 },
        // Тренажёры и замены (FT-478, FT-479): прошлый раз — на раме у окна
        machine: { uid: 'rack01', name: 'Силовая рама у окна' },
        notes: { 'm:rack01': 'Крюки на 4-й, упоры на 2-й' },
        exercise: { name: 'Приседания со штангой', muscle: 'Ноги', equipment: 'Штанга', notes: '', media: { kind: 'animation', url: 'Barbell_Squat' },
          machines: [
            { uid: 'rack01', name: 'Силовая рама у окна', photo: `${(import.meta.env && import.meta.env.BASE_URL) || '/'}anim/Barbell_Squat/0.jpg`, setup: 'Крюки — переставляются по отметкам на стойках.\nСтраховочные упоры — штыри, вынимаются наружу.' },
            { uid: 'smith1', name: 'Стойка у зеркала', photo: '', setup: '' },
          ],
          alternatives: [{ id: 10, name: 'Жим ногами' }],
          noteKey: 'e:приседания со штангой',
          setup: 'Стойки — крюки на уровне середины груди.\nСтраховочные упоры — чуть ниже нижней точки приседа.\nОшибка: упоры выше нижней точки — штанга на них ляжет.' } },
      // Повторы другие: в последний раз 100 × 3, сегодня 10 — пересчёт
      { name: 'Румынская тяга', weight: '85', prevWeight: '80', sets: '4', reps: '10', rpe: '7',
        startSets: ['82.5', '82.5', '82.5', '82.5'].map((weight) => ({ weight, reps: '10', kind: 'work' })),
        lastRun: { date: '2026-09-26', weights: ['100', '100', '100'], reps: ['3', '3', '3'], planReps: '10', effort: 'ok', streak: 1, action: 'scaled', step: 0, scaled: '82.5' } },
      // Суперсет: в таблице это объединённая ячейка «Подходы», здесь —
      // общая группа. Демо должно показывать и его, иначе увидеть эту
      // часть экрана можно только на живом клиенте.
      { name: 'Выпады с гантелями', weight: '20', prevWeight: '20', sets: '3', reps: '12', rpe: '8', supersetGroup: 'superset-9-10', track: { kind: 'strength', machine: '', unilateral: true, perSide: true } },
      { name: 'Подъём на носки', weight: '40', prevWeight: '40', sets: '3', reps: '15', rpe: '7', supersetGroup: 'superset-9-10' },
    ],
  },
  {
    // Кардио отдельным днём: цели по калориям и пульсу, интервалы
    title: 'Кардио — интервалы',
    exercises: [
      { name: 'Эллипс', weight: '', prevWeight: '', sets: '1', reps: '', rpe: '', track: { kind: 'cardio', machine: 'elliptical', unilateral: false, perSide: false },
        cardio: { machine: 'elliptical', metrics: ['time', 'kcal', 'pulse'], targets: { time: '30', distance: '', kcal: '300', pulse: '130–150' }, settings: { speed: '', incline: '', level: '6' },
          intervals: { rounds: 6, fast: { time: '1:00', speed: '', incline: '', level: '12' }, slow: { time: '2:00', speed: '', incline: '', level: '5' } } } },
    ],
  },
];

const MONTHS = ['Сентябрь 2026', 'Август 2026', 'Июль 2026', 'Июнь 2026'];

const CLIENTS = [
  { row: 3, name: 'Анна Морозова', price: 3000, count: 10, balance: 12000, trainings: 6, revenue: 18000, payer: '', template: 'P01 — Набор массы', monthStatus: '✅ Сентябрь 2026 создан', lastMeasureStatus: '✅ 13.09.2026', monthSheetStatus: '✅ Сентябрь 2026', lastTrainingDate: daysAgo(2), nextTrainingDate: daysAhead(2, '10:00'), startDate: daysAgo(400), birthDate: null, chatId: '11111', clientKey: 'anna', hasLink: true },
  { row: 4, name: 'Евгений и Екатерина', price: 4000, count: 8, balance: -4000, trainings: 4, revenue: 16000, payer: '', template: 'P03 — Сплит', monthStatus: '✅ Сентябрь 2026 создан', lastMeasureStatus: 'Евгений: ✅ 08.09.2026  |  Екатерина: ❌ 20.07.2026', monthSheetStatus: '✅ Сентябрь 2026', lastTrainingDate: daysAgo(5), nextTrainingDate: daysAhead(5, '19:00'), startDate: daysAgo(220), birthDate: null, chatId: '22222', clientKey: 'evgeny', hasLink: true, members: ['Евгений', 'Екатерина'] },
  // Сплит отдельными карточками (30.09.2026): пара скрыта, участники — в скобке
  { row: 29, name: 'Олег + Светлана', price: 4000, balance: 16000, trainings: 3, revenue: 12000, payer: '', lastTrainingDate: daysAgo(2), nextTrainingDate: daysAhead(0, '23:30'), chatId: '', clientKey: 'os', hasLink: false, members: ['Олег', 'Светлана'], pairHidden: true },
  { row: 30, name: 'Олег', price: 2500, balance: 0, trainings: 3, revenue: 0, payer: '', lastTrainingDate: daysAgo(2), nextTrainingDate: daysAhead(0, '23:30'), chatId: '66666', clientKey: 'oleg', hasLink: false, invited: true, splitOf: 29, splitName: 'Олег + Светлана', splitPayer: true, splitPayerRow: 30, splitPayerName: 'Олег', splitBalance: 16000, splitTrainingsLeft: 4 },
  { row: 31, name: 'Светлана', price: 2500, balance: 0, trainings: 3, revenue: 0, payer: '', lastTrainingDate: daysAgo(2), nextTrainingDate: daysAhead(0, '23:30'), chatId: '77777', clientKey: 'sveta', hasLink: false, invited: true, splitOf: 29, splitName: 'Олег + Светлана', splitPayer: false, splitPayerRow: 30, splitPayerName: 'Олег', splitBalance: 16000, splitTrainingsLeft: 4 },
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
  // Два вопроса (с 25.09.2026): чем занят день и тренировки в неделю
  lifestyles: [
    { value: 'desk', label: 'Сидячий: работа за столом, на машине', factor: 1.2 },
    { value: 'feet', label: 'Подвижный: работа стоя, много хожу пешком', factor: 1.35 },
    { value: 'labor', label: 'Физический труд: стройка, склад, доставка', factor: 1.5 },
  ],
  trainingStep: 0.05,
  trainingsMax: 14,
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

let mockWishes = [{ id: 1, text: 'Колено побаливает при выпадах — можно заменить на что-то полегче?', status: 'read', createdAt: daysAgo(2), reply: '', repliedAt: null }];
let mockPhoneLogin = '';
let mockPhoneCheck = null;

function mockPhoneRequest(p = {}) {
  const phone = String(p.phone || '').replace(/\D/g, '');
  if (!/^7\d{10}$/.test(phone)) mockFail('Проверьте номер: нужен российский, +7 и десять цифр.');
  mockPhoneCheck = { key: 'demo-' + Date.now(), phone, method: p.method === 'sms' ? 'sms' : 'call', polls: 0 };
  return mockPhoneCheck.method === 'sms'
    ? { key: mockPhoneCheck.key, method: 'sms', ttlMin: 10 }
    : { key: mockPhoneCheck.key, method: 'call', callPhone: '+78005008275', callPhonePretty: '+7 (800) 500-8275', ttlMin: 5 };
}

function mockPhoneConfirm(p = {}) {
  if (!mockPhoneCheck || p.key !== mockPhoneCheck.key) mockFail('Проверка устарела. Начните заново.');
  if (mockPhoneCheck.method === 'call') {
    mockPhoneCheck.polls += 1;
    if (mockPhoneCheck.polls < 3 && !mockPhoneCheck.ok) return { waiting: true };
    mockPhoneCheck.ok = true;
    return {};
  }
  if (!mockPhoneCheck.ok && String(p.code || '') !== '123456') mockFail('Код не подошёл.');
  mockPhoneCheck.ok = true;
  return {};
}

let mockGoal = { week: 2, steps: 8000, setBy: null, updatedAt: null };

function mockAwards(params = {}) {
  const now = new Date();
  const day = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const g = mockGoal;
  const thisWeek = Math.min(1, g.week);
  // Клиент 5 в демо — тот, у кого серия прервалась: тренеру видно, кому написать
  const lastMonday = new Date(now);
  lastMonday.setDate(lastMonday.getDate() - ((lastMonday.getDay() + 6) % 7) - 7);
  const broke = Number(params.clientRow) === 5;
  const awards = [
    { id: 'train-1', title: 'Первая тренировка', note: 'С тренером, по программе в приложении или с часов', got: '2026-02-03' },
    { id: 'train-10', title: '10 тренировок', note: 'Дней с тренировкой за всё время', got: '2026-03-02' },
    { id: 'train-25', title: '25 тренировок', note: 'Дней с тренировкой за всё время', got: '2026-04-20' },
    { id: 'train-50', title: '50 тренировок', note: 'Дней с тренировкой за всё время', got: '2026-07-01' },
    { id: 'train-100', title: '100 тренировок', note: 'Дней с тренировкой за всё время', got: null, done: 87, need: 100 },
    { id: 'train-250', title: '250 тренировок', note: 'Дней с тренировкой за всё время', got: null, done: 87, need: 250 },
    { id: 'weeks-4', title: 'Месяц без пропусков', note: '4 недели подряд с выполненной целью недели', got: '2026-03-08' },
    { id: 'weeks-12', title: 'Три месяца подряд', note: '12 недель подряд с выполненной целью недели', got: null, done: 9, need: 12 },
    { id: 'weeks-26', title: 'Полгода подряд', note: '26 недель подряд с выполненной целью недели', got: null, done: 9, need: 26 },
    { id: 'record-1', title: 'Первый рекорд', note: 'Рабочий вес в упражнении больше, чем когда-либо раньше', got: '2026-02-17' },
    { id: 'record-10', title: '10 рекордов', note: 'Десять раз побить свой лучший вес', got: null, done: 7, need: 10 },
    { id: 'measure-1', title: 'Первый замер', note: 'Вес или обхваты в «Прогрессе»', got: '2026-02-03' },
    { id: 'measure-4', title: 'Замеры месяц подряд', note: 'Хотя бы один замер каждую неделю четыре недели подряд', got: null, done: 2, need: 4 },
    { id: 'steps-1', title: 'Норма шагов', note: 'Первый день с нормой шагов', got: '2026-09-27' },
    { id: 'steps-7', title: 'Неделя шагов', note: 'Норма шагов семь дней подряд', got: '2026-10-03' },
    { id: 'steps-20k', title: '20 000 шагов', note: 'За один день', got: null, done: 0, need: 1 },
  ];
  return {
    today: day(now),
    goal: g,
    rings: [
      { id: 'week', label: 'Неделя', done: thisWeek, target: g.week },
      { id: 'month', label: 'Месяц', done: Math.min(now.getDate() <= 7 ? 2 : 5, daysInMonth), target: Math.max(1, Math.round((g.week * daysInMonth) / 7)) },
      { id: 'year', label: String(now.getFullYear()), done: 61, target: g.week * 52 },
    ],
    trainings: { total: 87, last: day(now) },
    streak: broke
      ? { weeks: 0, best: 6, thisWeek, broke: { week: day(lastMonday), done: 0, after: 6 } }
      : { weeks: 5, best: 9, thisWeek, broke: null },
    steps: { goal: g.steps, today: 5300, days: 4, best: 12, frozen: true },
    records: 7,
    awards,
    got: awards.filter((a) => a.got).length,
  };
}

/**
 * Итоги недели и месяца (FT-493): правдоподобные цифры, разные для каждого
 * периода, чтобы в демо стрелки листания что-то меняли. Самое раннее —
 * полгода назад: дальше левая стрелка гаснет.
 */
function mockDay(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function mockPeriod(kind, offset) {
  const now = new Date();
  if (kind === 'week') {
    const from = new Date(now);
    from.setDate(from.getDate() - ((from.getDay() + 6) % 7) - 7 * offset);
    const to = new Date(from);
    to.setDate(to.getDate() + 6);
    return { from: mockDay(from), to: mockDay(to) };
  }
  const from = new Date(now.getFullYear(), now.getMonth() - offset, 1);
  const to = new Date(now.getFullYear(), now.getMonth() - offset + 1, 0);
  return { from: mockDay(from), to: mockDay(to) };
}

function mockMetrics(kind, offset) {
  const k = kind === 'week' ? 1 : 4.3;
  const wave = [3, 2, 3, 1, 2, 3, 2][offset % 7];
  const trainings = Math.round(wave * k);
  return {
    trainings,
    minutes: trainings * (55 + (offset % 3) * 5),
    tonnage: trainings * (3800 + (offset % 4) * 350),
    steps: 7200 + ((offset * 937) % 2600),
  };
}

function mockSummary(params = {}) {
  const kind = params.period === 'month' ? 'month' : 'week';
  const offset = Math.max(0, Math.floor(Number(params.offset) || 0));
  const range = mockPeriod(kind, offset);
  const today = mockDay(new Date());
  const current = range.to >= today;
  const prev = mockPeriod(kind, offset + 1);
  const scale = current ? 0.6 : 1;
  const now = mockMetrics(kind, offset);
  const before = mockMetrics(kind, offset + 1);
  const cut = (m) => ({ ...m, trainings: Math.round(m.trainings * scale), minutes: Math.round(m.minutes * scale), tonnage: Math.round(m.tonnage * scale) });
  const records = offset % 2 === 0
    ? [{ name: 'Жим лёжа', machine: null, before: 60, after: 62.5 }, { name: 'Тяга верхнего блока', machine: 'Блок у окна', before: 50, after: 55 }]
    : offset % 3 === 1 ? [{ name: 'Присед', machine: null, before: 80, after: 85 }] : [];
  return {
    period: kind, offset, ...range, current, until: current ? today : range.to,
    prev: { from: prev.from, to: prev.to },
    now: current ? cut(now) : now,
    before: current ? cut(before) : before,
    records,
    empty: false,
    older: offset < (kind === 'week' ? 26 : 6),
  };
}

function mockSummaryStories() {
  const today = new Date();
  const week = { ...mockSummary({ period: 'week', offset: 1 }), current: false };
  const stories = [{
    id: 'week-' + week.from, ...week,
    goal: { target: mockGoal.week, done: week.now.trainings, met: week.now.trainings >= mockGoal.week, left: Math.max(0, mockGoal.week - week.now.trainings) },
    streak: 5,
  }];
  // В демо «Итоги месяца» видны всегда — иначе их не показать половину месяца
  const month = mockSummary({ period: 'month', offset: 1 });
  const target = Math.round((mockGoal.week * 30) / 7);
  stories.push({
    id: 'month-' + month.from, ...month,
    goal: { target, done: month.now.trainings, met: month.now.trainings >= target, left: Math.max(0, target - month.now.trainings) },
    streak: 5,
  });
  return { today: mockDay(today), stories };
}

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
  const lifestyle = String(params.lifestyle || '');
  if (!NUTRITION_OPTIONS.lifestyles.some((l) => l.value === lifestyle)) mockFail('Не выбран образ жизни');
  const trainings = Number(params.trainings);
  if (!Number.isInteger(trainings) || trainings < 0 || trainings > 14) mockFail('Тренировок в неделю — от 0 до 14');

  const goal = String(params.goal || '');
  if (!GOAL_MATH[goal]) mockFail('Не выбрана цель');

  return {
    age,
    weight: Math.round(weight * 10) / 10,
    height: Math.round(height * 10) / 10,
    sex,
    pace: mockPace(goal, params.pace).id,
    lifestyle,
    trainings,
    activity: NUTRITION_OPTIONS.activity.some((a) => a.value === activity) ? activity : 'light',
    goal,
  };
}

/** Миффлин—Сан Жеор с теми же предохранителями, что в src/150_OpsApi.js */
function mockCompute(s) {
  const base = NUTRITION_OPTIONS.lifestyles.find((l) => l.value === s.lifestyle).factor;
  const factor = Math.min(1.9, Math.round((base + s.trainings * 0.05) * 1000) / 1000);
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
  // Белок и жир — от веса при ИМТ 25, если вес выше
  const ref = Math.round(Math.min(s.weight, 25 * (s.height / 100) ** 2) * 10) / 10;
  let protein = Math.round(ref * goal.protein);
  let fat = Math.round(ref * goal.fat);
  let carbs = Math.round((kcal - protein * 4 - fat * 9) / 4);

  if (carbs < 50) {
    protein = Math.min(protein, Math.round(ref * 1.6));
    fat = Math.min(fat, Math.round(ref * 0.8));
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

const DEMO_MUSCLES = ['Грудь', 'Спина', 'Ноги', 'Ягодицы', 'Плечи', 'Руки', 'Предплечье', 'Пресс', 'Всё тело', 'Кардио'];

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
  ['Жим ногами', 'Ноги', 'Тренажёр', null],
].map(([name, muscle, equipment, anim], i) => ({
  id: i + 1, name, muscle, equipment, notes: '', mine: false, common: true,
  media: anim ? { kind: 'animation', url: anim } : null,
  setup: '', setupOk: false, machines: [], alternatives: [],
}));
Object.assign(demoExercises[7], { setup: 'Стойки — крюки чуть выше колена.\nОшибка: спина круглится внизу.' });
// «Как настроить тренажёр»: одна проверенная инструкция и один черновик
Object.assign(demoExercises[1], { setupOk: true, setup: 'Валик — плотно прижимает бёдра, стопы стоят на полу.\nСиденье — руки вверх дотягиваются до рукояти, чуть согнуты.\nХват — шире плеч, большой палец сверху.\nОшибка: раскачка корпусом назад.\nОшибка: тянуть за голову.' });
Object.assign(demoExercises[2], { setupOk: true, setup: 'Стойки — крюки на уровне середины груди.\nСтраховочные упоры — чуть ниже нижней точки приседа.\nОшибка: упоры выше нижней точки — штанга на них ляжет.' });

// Тренажёры (FT-478) и замены (FT-479): у приседа — две стойки в разных
// залах, занято — жим ногами
const DEMO_RACK = { uid: 'rack01', name: 'Силовая рама у окна', photo: `${(import.meta.env && import.meta.env.BASE_URL) || '/'}anim/Barbell_Squat/0.jpg`, setup: 'Крюки — переставляются по отметкам на стойках.\nСтраховочные упоры — штыри, вынимаются наружу.' };
const DEMO_SMITH = { uid: 'smith1', name: 'Стойка у зеркала', photo: '', setup: '' };
Object.assign(demoExercises[2], { machines: [DEMO_RACK, DEMO_SMITH], alternatives: [{ id: 10, name: 'Жим ногами' }] });
let demoMachineSeq = 0;
// Своя настройка Анны на раме — записал тренер
let demoNotes = { 'm:rack01': { text: 'Крюки на 4-й, упоры на 2-й', by: 'trainer', updatedAt: '2026-10-01T10:00:00.000Z' } };

/** Фото тренажёра в демо — data-URL сразу в каталог (library.js, uploadMachinePhoto) */
export function mockMachinePhoto(exerciseId, uid, url) {
  const e = demoExercises.find((x) => x.id === Number(exerciseId));
  const m = e && (e.machines || []).find((x) => x.uid === uid);
  if (m) m.photo = url;
}

/** Правка тренажёров и замен общего — своя версия (как на сервере), своё — на месте */
function demoEditable(id) {
  const e = demoExercises.find((x) => x.id === Number(id));
  if (!e) throw new Error('Упражнение не найдено.');
  return e;
}

let demoHidden = new Set();
// Похожие упражнения объединены (демо): группа больше не показывается
let demoMerged = false;

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
    // ?mockUnlinked=1 — клиент, зарегистрировавшийся сам, без тренера
    unlinked: new URLSearchParams(window.location.search).get('mockUnlinked') === '1',
    // ?mockConsent=1 — согласие по новым правилам ещё не подтверждено
    consentNeeded: params.__role !== 'trainer' && new URLSearchParams(window.location.search).get('mockConsent') === '1',
    // ?mockCoach=1 — тренер со своими клиентами, не владелец сервиса
    owner: new URLSearchParams(window.location.search).get('mockCoach') !== '1',
  }),
  'consent.accept': () => ({ version: '2026-09-26', givenAt: new Date().toISOString() }),
  // Вход тренера и заявка на кабинет: новый адрес — имя и согласия, потом
  // «ждёт одобрения»; адрес owner@… — сразу кабинет
  'auth.trainer.request': () => ({ sent: true, ttlMin: 15 }),
  'auth.trainer.confirm': (p) => (String(p.email || '').startsWith('owner@')
    ? { token: 'demo-session', email: p.email }
    : p.name ? { pending: true, email: p.email } : { needName: true, email: p.email }),
  // Тренеры сервиса — экран владельца (Trainers.jsx)
  'owner.trainers': () => ({ trainers: mockTrainers }),
  'owner.trainer.decide': (p) => {
    const next = { approve: 'active', reject: 'rejected', block: 'blocked', unblock: 'active' }[p.decision];
    mockTrainers = mockTrainers.map((t) => (t.id === p.id ? { ...t, status: next } : t));
    return { trainers: mockTrainers };
  },
  // Сверка денег таблица ↔ сервер (LedgerCheck.jsx): одно расхождение
  'trainer.ledger': () => ({
    state: { open: true, since: daysAgo(4), clients: 5, matched: 4, off: 1 },
    rows: [
      { row: 3, name: 'Анна Морозова', price: 3000, inSheet: 12000, opening: 15000, openedAt: daysAgo(4), paid: 0, trainings: 2, adjusted: 0, spent: 6000, ours: 9000, diff: -3000, settled: false },
      { row: 5, name: 'Дмитрий Соколов', price: 2500, inSheet: 7500, opening: 7500, openedAt: daysAgo(4), paid: 0, trainings: 0, adjusted: 0, spent: 0, ours: 7500, diff: 0, settled: true },
    ],
  }),
  'trainer.ledger.settle': (p) => ({ row: { row: p.clientRow, settled: true } }),

  // Аккаунт без тренера и привязка (lib/accounts.js на сервере)
  'auth.client.request': () => ({ sent: true, ttlMin: 15 }),
  'auth.client.confirm': (p) => (p.name ? { token: 'demo-session', created: true } : { needName: true }),
  'auth.trainer.link.inspect': () => ({ trainerName: 'Константин Соколов' }),
  // Вход по телефону (FT-489): звонок «проходит» на третьем опросе, код
  // из СМС в демо — 123456; ?mockPhone=0 — способа нет, как без ключа SMS.ru
  'auth.phone.options': () => (new URLSearchParams(window.location.search).get('mockPhone') === '0'
    ? { call: false, sms: false } : { call: true, sms: true }),
  'auth.phone.request': (p) => mockPhoneRequest(p),
  'auth.phone.confirm': (p) => {
    const r = mockPhoneConfirm(p);
    if (r.waiting) return r;
    return p.name ? { token: 'demo-session', created: true } : { needName: true };
  },
  'account.phone.get': () => ({ phone: mockPhoneLogin, options: { call: true, sms: true } }),
  'account.phone.request': (p) => mockPhoneRequest(p),
  'account.phone.confirm': (p) => {
    const r = mockPhoneConfirm(p);
    if (r.waiting) return r;
    mockPhoneLogin = '+7 ' + mockPhoneCheck.phone.slice(1, 4) + ' ' + mockPhoneCheck.phone.slice(4, 7) + '-' + mockPhoneCheck.phone.slice(7, 9) + '-' + mockPhoneCheck.phone.slice(9);
    return { phone: mockPhoneLogin };
  },
  'account.phone.remove': () => { mockPhoneLogin = ''; return { phone: '' }; },
  // Пожелания к программе (FT-498): одно уже есть, тренер его прочитал
  'wish.list': () => ({ wishes: mockWishes.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }),
  'wish.create': (p) => {
    const text = String(p.text || '').trim();
    if (text.length < 3) mockFail('Напишите пожелание — хотя бы несколько слов.');
    const wish = { id: Date.now(), text, status: 'new', createdAt: new Date().toISOString(), reply: '', repliedAt: null };
    mockWishes.push(wish);
    return wish;
  },
  'wish.delete': (p) => { mockWishes = mockWishes.filter((w) => w.id !== Number(p.id)); return { deleted: true }; },
  'wish.answer': (p) => {
    const w = mockWishes.find((x) => x.id === Number(p.id));
    if (!w) mockFail('Пожелание не найдено.');
    if (p.reply !== undefined) { w.reply = String(p.reply).trim(); w.repliedAt = new Date().toISOString(); }
    w.status = p.done === true ? 'done' : p.done === false ? 'read' : (w.status === 'new' ? 'read' : w.status);
    return w;
  },
  // Копия своих данных (FT-496): в демо — заглушка вместо файла с сервера
  'account.export': () => ({ url: 'data:text/html;charset=utf-8,' + encodeURIComponent('<!doctype html><meta charset="utf-8"><h1>Мои данные в Fit Track</h1><p>Демо: здесь будет выгрузка.</p>'), expiresAt: new Date(Date.now() + 600000).toISOString() }),
  'account.get': () => (new URLSearchParams(window.location.search).get('mockUnlinked') === '1'
    ? { publicId: 'FT-7K2QM4', trainer: null, requests: [{ id: 1, trainerName: 'Константин Соколов', createdAt: daysAgo(0) }] }
    : { publicId: 'FT-A3B9CD', trainer: { name: 'Константин Соколов' }, requests: [] }),
  'account.link.answer': (p) => ({ linked: !!p.accept }),
  'account.link.join': () => ({ linked: true, trainerName: 'Константин Соколов' }),
  'trainer.link.byid': (p) => {
    if (!/^FT-?[A-Z0-9]{6}$/i.test(String(p.publicId || '').trim())) throw new Error('ID выглядит как FT-XXXXXX — проверьте, что вписано.');
    return { sent: true, publicId: String(p.publicId).toUpperCase() };
  },
  'trainer.link.url': () => ({ token: 'Vx3kP9qLm2Rt8YwZ4nB7cJ5h', pending: [{ publicId: 'FT-7K2QM4', createdAt: daysAgo(0) }] }),

  'client.overview': () => ({
    unlinked: new URLSearchParams(window.location.search).get('mockUnlinked') === '1',
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
    // Отмены и переносы — как отдаёт сервер тренеру
    scheduleChanges: {
      month: { cancelClient: 1, cancelTrainer: 0, cancelLate: 1, cancelCharged: 1, moveClient: 1, moveTrainer: 0 },
      total: { cancelClient: 3, cancelTrainer: 1, cancelLate: 2, cancelCharged: 1, moveClient: 4, moveTrainer: 1 },
    },
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
  'dishes.list': () => ({
    dishes: RECIPES_DEMO.map((r, i) => ({
      ...r,
      items: r.items,
      minutes: 20 + (i % 4) * 10,
      steps: ['Подготовьте продукты.', 'Приготовьте по привычному рецепту.', 'Подавайте тёплым.'],
      tags: i % 3 ? ['быстро'] : ['вегетарианское', 'без молочного'],
      status: i < 3 ? 'draft' : 'published',
      budget: true,
    })),
    foods: Object.entries(FOOD_DEMO).map(([name, f]) => ({ name, ...f, source: 'ru' })),
  }),
  'dish.status': (params) => ({ id: params.id, status: params.status }),
  'dish.save': (params) => ({ id: 'demo-dish', ...params, per: { kcal: 300, protein: 20, fat: 10, carbs: 30 }, tags: [], status: 'draft', items: params.items || [], steps: params.steps || [] }),
  'ration.get': () => ({ saved: false, pantry: null, liked: [], seen: [], extras: [], day: '' }),
  'ration.save': () => ({ ok: true }),
  'ration.extra.add': (params) => ({ id: Date.now(), product: params.product, grams: params.grams, pieces: params.pieces || 0 }),
  'ration.extra.remove': () => ({ ok: true }),
  'ration.summary': () => ({
    saved: true, pantry: ['гречка', 'яйцо', 'курица', 'творог', 'банан'], liked: ['ovsyanka-na-moloke-s-bananom', 'grechnevaya-kasha-na-moloke'], seen: [],
    extras: [{ id: 1, product: { id: 1, name: 'Сникерс', kcal: 507, protein: 9.3, fat: 27.6, carbs: 55.5, piece: 50 }, grams: 50, pieces: 1 }],
    frequent: [{ name: 'Сникерс', times: 6, kcal: 1521 }, { name: 'Капучино 300 мл', times: 4, kcal: 540 }],
    days: [],
  }),
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
  // Демо-неделя тренера на любой запрошенный период: утро, день, вечер,
  // одно пересечение, одно отменённое со списанием и одно «не узнано»
  'trainer.schedule': (params = {}) => {
    const from = new Date(params.from || Date.now());
    const to = new Date(params.to || from.getTime() + 7 * 86400000);
    const plan = [
      [8, 0, 60, 3], [10, 30, 75, 5], [14, 0, 60, 7], [19, 0, 60, 30], [19, 30, 60, 6], [20, 30, 60, 3],
    ];
    const events = [];
    const now = Date.now();
    for (let d = new Date(from.getFullYear(), from.getMonth(), from.getDate()); d < to; d.setDate(d.getDate() + 1)) {
      const k = d.getDate();
      // Событие на весь день, как день рождения в Google: дата без времени
      // приходит полуночью по UTC и длится сутки
      if (k % 7 === 4) {
        const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(k).padStart(2, '0')}`;
        events.push({ id: 'demo-all-' + k, clientRow: null, clientName: '', title: 'День рождения',
          startsAt: day + 'T00:00:00.000Z', endsAt: new Date(Date.parse(day + 'T00:00:00.000Z') + 86400000).toISOString(), done: false });
      }
      plan.forEach(([h, m, mins, row], j) => {
        if ((k + j) % 3 === 0) return;
        const s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m);
        const c = CLIENTS.find((x) => x.row === row);
        const unknown = j === 2 && k % 5 === 0;
        events.push({
          id: 'demo-ev-' + k + '-' + j,
          clientRow: unknown ? null : c.row,
          clientName: unknown ? '' : c.name,
          title: unknown ? 'Массаж' : c.name,
          startsAt: s.toISOString(),
          endsAt: new Date(s.getTime() + mins * 60000).toISOString(),
          done: s.getTime() + mins * 60000 < now,
          cancelledCharged: j === 1 && k % 4 === 0,
        });
      });
    }
    const known = new Set(events.map((e) => e.id));
    const changed = events
      .map((e) => DEMO_SCHEDULE_CHANGES.has(e.id) ? DEMO_SCHEDULE_CHANGES.get(e.id) : e)
      .filter(Boolean);
    DEMO_SCHEDULE_CHANGES.forEach((e, id) => {
      if (!e || known.has(id)) return;
      const start = new Date(e.startsAt);
      if (start >= from && start < to) changed.push(e);
    });
    return {
      events: changed,
      calendar: true,
      serviceEmail: 'demo@example.iam.gserviceaccount.com',
      feedUrl: 'https://example.invalid/ics/t-demo.ics',
    };
  },
  'trainer.schedule.save': (params) => {
    const id = params.id || 'demo-custom-' + Date.now();
    const client = params.personal ? null : CLIENTS.find((x) => x.row === Number(params.clientRow));
    const startsAt = new Date(params.startsAt).toISOString();
    const event = {
      id,
      clientRow: client ? client.row : null,
      clientName: client ? client.name : '',
      personal: !client,
      title: client ? client.name : params.title,
      startsAt,
      endsAt: new Date(new Date(startsAt).getTime() + Number(params.minutes || 60) * 60000).toISOString(),
      done: false,
      cancelledCharged: false,
    };
    DEMO_SCHEDULE_CHANGES.set(id, event);
    return { id };
  },
  'trainer.schedule.delete': (params) => {
    if (!['client', 'trainer', 'error'].includes(params.who)) throw new Error('Отметьте, кто отменил занятие.');
    DEMO_SCHEDULE_CHANGES.set(params.id, null);
    return params.charge ? { cancelled: params.id, charged: true } : { deleted: params.id };
  },
  'trainer.schedule.stats': () => ({
    total: { done: 41, cancelClient: 5, cancelTrainer: 1, cancelLate: 3, cancelCharged: 2, moveClient: 4, moveTrainer: 2 },
    lateHours: 24,
    clients: [
      { clientRow: 3, name: 'Анна Морозова', done: 6, cancelClient: 2, cancelTrainer: 0, cancelLate: 1, cancelCharged: 1, moveClient: 2, moveTrainer: 0 },
      { clientRow: 4, name: 'Евгений и Екатерина', done: 8, cancelClient: 1, cancelTrainer: 1, cancelLate: 1, cancelCharged: 0, moveClient: 1, moveTrainer: 1 },
    ],
    recent: [
      { kind: 'cancel', who: 'client', late: true, charged: true, reason: 'заболела', clientRow: 3, clientName: 'Анна Морозова', fromAt: daysAgo(1), toAt: null },
      { kind: 'move', who: 'client', late: false, charged: false, reason: 'работа', clientRow: 3, clientName: 'Анна Морозова', fromAt: daysAgo(4), toAt: daysAgo(3) },
      { kind: 'cancel', who: 'trainer', late: false, charged: false, reason: '', clientRow: 4, clientName: 'Евгений и Екатерина', fromAt: daysAgo(6), toAt: null },
    ],
  }),
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
      // «Мои тренировки» в демо — карточка №99
      self: trainer && Number(params.clientRow) === 99,
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
        lifestyle: survey.lifestyle,
        lifestyleLabel: NUTRITION_OPTIONS.lifestyles.find((l) => l.value === survey.lifestyle).label,
        trainings: survey.trainings,
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

  // Шаги из телефона (client/Steps.jsx): две недели похожих на правду чисел
  // У Дмитрия (строка 5) приложение стоит, а шагов нет — тренер видит почему
  'steps.list': (params = {}) => {
    const device = { platform: 'android', appVersion: '1.2 (3)', webVersion: '2.1', steps: 'on', seenAt: daysAgo(0) };
    if (Number(params.clientRow) === 5) {
      return { from: daysAgo(13), days: [], syncedAt: null, device: { ...device, steps: 'empty' } };
    }
    const days = [];
    const base = [7400, 9100, 6200, 11800, 8300, 4100, 12600, 9800, 7200, 10400, 6900, 8800, 13100, 5300];
    for (let i = 13; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      days.push({ member: '', date, steps: base[13 - i] });
    }
    return { from: days[0].date, days, syncedAt: daysAgo(0), ...(params.clientRow ? { device } : {}) };
  },
  'steps.sync': (params) => ({ saved: (params.days || []).length }),
  // Цели и награды (FT-490): сервер считает их из журнала, календаря, часов,
  // шагов и замеров (server/src/lib/awards.js); здесь — правдоподобный снимок
  // с целью, которую можно поменять
  'client.awards': (params = {}) => mockAwards(params),
  'client.summary': (params = {}) => mockSummary(params),
  'client.summary.stories': () => mockSummaryStories(),
  'client.goals.save': (params = {}) => {
    const week = Math.round(Number(params.week));
    const steps = Math.round(Number(params.steps) / 500) * 500;
    if (!(week >= 1 && week <= 7)) mockFail('Тренировок в неделю — от 1 до 7.');
    if (!(steps >= 1000 && steps <= 50000)) mockFail('Шагов в день — от 1000 до 50000.');
    mockGoal = { week, steps, setBy: params.clientRow ? 'trainer' : 'client', updatedAt: new Date().toISOString() };
    return mockAwards(params);
  },
  // Тренировки с часов в «Моих тренировках»: одна совмещена с занятием
  'health.workouts.list': () => {
    const at = (dAgo, h, m) => { const d = new Date(); d.setDate(d.getDate() - dAgo); d.setHours(h, m, 0, 0); return d.toISOString(); };
    return {
      workouts: [
        { id: 'hw1', type: 'traditionalStrengthTraining', startedAt: at(1, 19, 12), endedAt: at(1, 20, 20), duration: 4080, kcal: 412, distance: null, source: 'Apple Watch',
          session: { id: 's1', title: 'Верх', minutes: 75, notes: ['часы включили на 7 мин позже'] } },
        { id: 'hw2', type: 'running', startedAt: at(3, 8, 5), endedAt: at(3, 8, 41), duration: 2160, kcal: 356, distance: 5230, source: 'Apple Watch' },
        { id: 'hw3', type: 'walking', startedAt: at(5, 18, 30), endedAt: at(5, 19, 25), duration: 3300, kcal: 190, distance: 4800, source: 'iPhone' },
      ],
    };
  },
  'health.workouts.sync': (params) => ({ saved: (params.workouts || []).length }),
  'device.report': () => ({ saved: true }),
  'account.delete': () => ({ deleted: true }),
  'push.native.status': () => ({ enabled: true }),
  'push.native.register': () => ({ saved: true }),
  'push.native.unregister': () => ({ dropped: 1 }),
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

  'library.exercise.setup': (params) => {
    const e = demoExercises.find((x) => x.id === Number(params.id));
    if (!e) throw new Error('Упражнение не найдено');
    const setup = String(params.setup ?? e.setup).trim().slice(0, 1500);
    Object.assign(e, { setup, setupOk: !!setup && (params.ok === undefined ? e.setupOk : !!params.ok) });
    return { ...e };
  },
  'exercise.setup': (params = {}) => {
    const ids = String(params.ids || '').split(',').map(Number);
    const setups = {};
    demoExercises
      .filter((e) => ids.includes(e.id))
      .forEach((e) => { setups[e.id] = { name: e.name, setup: e.setupOk ? e.setup : '', machines: e.machines || [], alternatives: e.alternatives || [], noteKey: 'e:' + e.name.toLowerCase() }; });
    return { setups, notes: { ...demoNotes } };
  },
  // Своя настройка тренажёра у клиента — у каждого своя (07.10.2026)
  'client.machine.note.save': (params) => {
    const text = String(params.text || '').trim().slice(0, 300);
    if (!text) { delete demoNotes[params.target]; return { target: params.target, note: null }; }
    demoNotes[params.target] = { text, by: params.__role === 'trainer' ? 'trainer' : 'client', updatedAt: new Date().toISOString() };
    return { target: params.target, note: demoNotes[params.target] };
  },
  'library.exercise.machine.save': (params) => {
    const e = demoEditable(params.exerciseId);
    const machines = e.machines || (e.machines = []);
    const name = String(params.name || '').trim();
    if (name.length < 2) throw new Error('Назовите тренажёр — например, «Hammer у окна».');
    let m = params.uid && machines.find((x) => x.uid === params.uid);
    if (params.uid && !m) throw new Error('Тренажёр не найден.');
    if (!m) {
      if (machines.length >= 8) throw new Error('Тренажёров у упражнения — не больше 8.');
      m = { uid: 'demo' + (++demoMachineSeq), name, photo: '', setup: '' };
      machines.push(m);
    }
    Object.assign(m, { name, setup: String(params.setup || '').trim(), ...(params.removePhoto ? { photo: '' } : {}) });
    return { exercise: { ...e }, uid: m.uid };
  },
  'library.exercise.machine.delete': (params) => {
    const e = demoEditable(params.exerciseId);
    e.machines = (e.machines || []).filter((x) => x.uid !== params.uid);
    return { exercise: { ...e } };
  },
  'library.exercise.machine.move': (params) => {
    const e = demoEditable(params.exerciseId);
    const uids = params.uids || [];
    e.machines = [...(e.machines || [])].sort((a, b) => (uids.includes(b.uid) ? 1 : 0) - (uids.includes(a.uid) ? 1 : 0));
    return { exercise: { ...e } };
  },
  'library.exercise.alternatives': (params) => {
    const e = demoEditable(params.exerciseId);
    e.alternatives = (params.ids || []).map(Number).filter((id) => id !== e.id)
      .map((id) => demoExercises.find((x) => x.id === id)).filter(Boolean).map((x) => ({ id: x.id, name: x.name }));
    return { exercise: { ...e } };
  },
  'library.exercises': (params = {}) => ({
    exercises: demoExercises.filter((e) => demoHidden.has(e.id) === !!params.hidden),
    muscles: DEMO_MUSCLES,
    hiddenCount: demoHidden.size,
    owner: true,
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
  // Вид упражнения — в базу: своё правится, у общего — своя версия, нет в базе — новое своё
  'library.exercise.track': (params) => {
    const key = String(params.name || '').trim().toLowerCase();
    const found = demoExercises.find((e) => e.id === Number(params.exerciseId))
      || demoExercises.find((e) => e.name.trim().toLowerCase() === key);
    const mine = (found && found.mine && found)
      || (found && demoExercises.find((e) => e.mine && e.name === found.name))
      || { id: ++demoExerciseSeq, name: (found && found.name) || params.name, muscle: (found && found.muscle) || '', equipment: '', notes: '', media: found ? found.media : null, mine: true, common: false };
    mine.track = { ...params.track, auto: false };
    demoExercises = [...demoExercises.filter((e) => e !== mine && !(found && found.common && e === found)), mine];
    return { exercise: mine };
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
  // «Мои тренировки»: карточка самого тренера — в демо №99 (своей нет в списке клиентов)
  'trainer.self': () => ({ clientRow: 99, name: 'Константин' }),
  // Похожие: одна демо-группа — общее, своя копия и вписанное руками
  'library.exercises.similar': () => (demoMerged ? { groups: [] } : { groups: [{ keep: 9001, items: [
    { kind: 'library', id: 9001, name: 'Жим лёжа', common: true, mine: false, clients: 5, templates: 2 },
    { kind: 'library', id: 9002, name: 'Жим штанги лёжа на скамье 30', common: false, mine: true, clients: 2, templates: 1 },
    { kind: 'name', key: 'жим лежа со штангой', name: 'жим лежа со штангой', clients: 1, templates: 0 },
  ] }] }),
  'library.exercise.merge': () => {
    demoMerged = true;
    return { plans: 3, templates: 1, sessions: 4, removed: 1, hidden: 0, keep: { id: 9001, name: 'Жим лёжа' } };
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
