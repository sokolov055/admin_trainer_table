/**
 * mock.js — демо-данные для разработки.
 *
 * Подключается ТОЛЬКО при сборке с VITE_MOCK=1 и грузится динамически,
 * поэтому в обычную сборку не попадает. Нужен, чтобы верстать и смотреть
 * экраны, не поднимая Apps Script и не ожидая его по полсекунды на каждый
 * переход, а также чтобы показать приложение до того, как настроен бэкенд.
 *
 * Роль переключается параметром в адресе: ?mockRole=trainer
 */

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 19);
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
      { name: 'Выпады с гантелями', weight: '20', prevWeight: '20', sets: '3', reps: '12', rpe: '8' },
    ],
  },
];

const MONTHS = ['Сентябрь 2026', 'Август 2026', 'Июль 2026', 'Июнь 2026'];

const CLIENTS = [
  { row: 3, name: 'Анна Морозова', price: 3000, count: 10, balance: 12000, trainings: 6, revenue: 18000, payer: '', template: 'P01 — Набор массы', monthStatus: '✅ Сентябрь 2026 создан', lastMeasureStatus: '✅ 13.09.2026', monthSheetStatus: '✅ Сентябрь 2026', lastTrainingDate: daysAgo(2), startDate: daysAgo(400), birthDate: null, chatId: '11111', clientKey: 'anna', hasLink: true },
  { row: 4, name: 'Евгений и Екатерина', price: 4000, count: 8, balance: -4000, trainings: 4, revenue: 16000, payer: '', template: 'P03 — Сплит', monthStatus: '✅ Сентябрь 2026 создан', lastMeasureStatus: 'Евгений: ✅ 08.09.2026  |  Екатерина: ❌ 20.07.2026', monthSheetStatus: '✅ Сентябрь 2026', lastTrainingDate: daysAgo(5), startDate: daysAgo(220), birthDate: null, chatId: '22222', clientKey: 'evgeny', hasLink: true },
  { row: 5, name: 'Дмитрий Соколов', price: 2500, count: 12, balance: 7500, trainings: 9, revenue: 22500, payer: '', template: 'REPEAT_LAST_MONTH', monthStatus: '✅ Сентябрь 2026 создан', lastMeasureStatus: '❌ 02.08.2026', monthSheetStatus: '✅ Сентябрь 2026', lastTrainingDate: daysAgo(1), startDate: daysAgo(700), birthDate: null, chatId: '33333', clientKey: 'dmitry', hasLink: true },
  { row: 6, name: 'Мария Волкова', price: 3000, count: 10, balance: 0, trainings: 0, revenue: 0, payer: '', template: '', monthStatus: '', lastMeasureStatus: '', monthSheetStatus: '❌ нет "Сентябрь 2026"', lastTrainingDate: daysAgo(38), startDate: daysAgo(120), birthDate: null, chatId: '', clientKey: 'maria', hasLink: false },
  { row: 7, name: 'Игорь Лебедев', price: 3500, count: 8, balance: 14000, trainings: 7, revenue: 24500, payer: '', template: 'P02 — Сила', monthStatus: '✅ Сентябрь 2026 создан', lastMeasureStatus: '✅ 11.09.2026', monthSheetStatus: '✅ Сентябрь 2026', lastTrainingDate: daysAgo(3), startDate: daysAgo(310), birthDate: null, chatId: '44444', clientKey: 'igor', hasLink: true },
];

const MONTH_COLUMNS = ['Май 2026', 'Июнь 2026', 'Июль 2026', 'Август 2026', 'Сентябрь 2026'];

function financeMetric(label, unit, values) {
  const v = {};
  MONTH_COLUMNS.forEach((m, i) => { v[m] = values[i]; });
  v['2026'] = values[5] !== undefined ? values[5] : '';
  return { label, unit, norm: '', planYear: '', values: v };
}

const MOCK = {
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
    startDate: daysAgo(400),
    birthDate: null,
    lastMeasureStatus: '✅ 13.09.2026',
    monthSheetStatus: '✅ Сентябрь 2026',
    currentMonthName: 'Сентябрь 2026',
    hasPersonalSheet: true,
  }),

  'client.measurements': () => ({
    series: [{ label: '', sheetName: 'Показатели', rows: MEASURE_ROWS }],
    fields: FIELDS,
  }),

  'client.plan': (params) => ({
    month: params.month || 'Сентябрь 2026',
    available: MONTHS,
    blocks: PLAN_BLOCKS,
  }),

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
    configured: false,
    targets: { 'Ккал': null, 'Белки': null, 'Жиры': null, 'Углеводы': null },
    meals: [],
    note: 'В личной таблице нет листа «Питание».',
    sheetName: 'Питание',
  }),

  'trainer.clients': () => ({
    clients: CLIENTS,
    summary: {
      count: CLIENTS.length,
      cash: 96000,
      totalRevenue: 81000,
      totalTrainings: 26,
      profit: 81000 - 62000,
      fixedCost: 62000,
      negativeBalance: 1,
      staleClients: 1,
      staleDays: 14,
      currentMonth: 'Сентябрь 2026',
    },
  }),

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
  const handler = MOCK[action];

  return new Promise((resolve, reject) => {
    // Небольшая задержка — чтобы скелетоны и состояния загрузки были видны
    // при разработке, а не проскакивали мгновенно.
    setTimeout(() => {
      if (!handler) {
        reject(Object.assign(new Error('Нет демо-данных для ' + action), { code: 404 }));
        return;
      }
      resolve(handler({ ...params, __role: role }));
    }, 180);
  });
}
