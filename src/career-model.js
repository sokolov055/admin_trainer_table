// FT-563, 19.10.2026: сюжетная карьера через три мини-игры (идея владельца 17.10).
// Десять ступеней — от тренировок на улице до собственной сети клубов. На каждой
// три задания, по одному в каждой игре; ступень закрыта, когда выполнены все три.
// Сложность только растёт: дальше заезд и строже режим, больше верных ответов
// подряд на более трудных вопросах, меньше ходов и выше цели в «Три в ряд».
// Зарплата за задание растёт со ступенью, на неё покупаются бонусы.
// Чистые функции без React; состояние хранится только на устройстве.

export const CAREER = Object.freeze([
  { title: 'Тренировки на улице', place: 'Турник во дворе', story: 'Ты тренируешься на площадке у дома. Соседи уже спрашивают, как ты так подтягиваешься.',
    scooter: { difficulty: 'easy', metres: 200 }, plank: { level: 1, streak: 3 }, match: { chapter: 1, moves: 24, target: 1700, count: 10 }, salary: 100 },
  { title: 'Тренировки в зале', place: 'Абонемент в клуб', story: 'Первый абонемент в настоящий зал. Пора показать, что ты здесь не на неделю.',
    scooter: { difficulty: 'easy', metres: 300 }, plank: { level: 1, streak: 5 }, match: { chapter: 1, moves: 20, target: 2000, count: 12 }, salary: 150 },
  { title: 'Тренер', place: 'Свой первый клиент', story: 'Тебя взяли тренером. Клиенты ждут программ, а администратор — что ты не опоздаешь.',
    scooter: { difficulty: 'easy', metres: 450 }, plank: { level: 2, streak: 4 }, match: { chapter: 1, moves: 19, target: 2250, count: 14 }, salary: 220 },
  { title: 'Координатор тренажёрного зала', place: 'Расписание всего зала', story: 'Теперь на тебе весь тренажёрный зал: смены тренеров, инвентарь и очередь к стойке.',
    scooter: { difficulty: 'medium', metres: 450 }, plank: { level: 2, streak: 6 }, match: { chapter: 2, moves: 18, target: 2400, count: 15 }, salary: 300 },
  { title: 'Фитнес-директор клуба', place: 'Все тренеры клуба', story: 'Ты отвечаешь за качество тренировок во всём клубе. Тренеры приходят к тебе за советом.',
    scooter: { difficulty: 'medium', metres: 480 }, plank: { level: 3, streak: 5 }, match: { chapter: 2, moves: 18, target: 2500, count: 15 }, salary: 400 },
  { title: 'Управляющий клуба', place: 'Клуб целиком', story: 'Под тобой весь клуб: касса, ремонт, продажи и довольные гости.',
    scooter: { difficulty: 'medium', metres: 600 }, plank: { level: 3, streak: 7 }, match: { chapter: 2, moves: 17, target: 2650, count: 16 }, salary: 520 },
  { title: 'Директор региона', place: 'Клубы в трёх городах', story: 'Тебе доверили регион. Между клубами — сотни километров и тысяча вопросов.',
    scooter: { difficulty: 'extreme', metres: 300 }, plank: { level: 4, streak: 5 }, match: { chapter: 3, moves: 16, target: 2800, count: 17 }, salary: 660 },
  { title: 'Управление сетью клубов', place: 'Вся сеть', story: 'Ты руководишь сетью. Открытия, команды, отчёты — и всё равно хочется самому потренироваться.',
    scooter: { difficulty: 'extreme', metres: 320 }, plank: { level: 4, streak: 7 }, match: { chapter: 3, moves: 16, target: 2950, count: 18 }, salary: 820 },
  { title: 'Генеральный директор сети', place: 'Кабинет на последнем этаже', story: 'Совет директоров ждёт рекордов. Покажи, что генеральный в форме лучше всех.',
    scooter: { difficulty: 'extreme', metres: 360 }, plank: { level: 4, streak: 9 }, match: { chapter: 3, moves: 15, target: 3050, count: 18 }, salary: 1000 },
  { title: 'Собственник сети', place: 'Своя сеть клубов', story: 'Последний шаг: сеть клубов становится твоей. От турника во дворе до собственного бизнеса.',
    scooter: { difficulty: 'extreme', metres: 420 }, plank: { level: 4, streak: 12 }, match: { chapter: 3, moves: 14, target: 3200, count: 19 }, salary: 1250 },
].map(rank => Object.freeze({ ...rank, scooter: Object.freeze(rank.scooter), plank: Object.freeze(rank.plank), match: Object.freeze(rank.match) })));

export const GAMES = Object.freeze(['scooter', 'plank', 'match']);

// Бонусы на одно задание. Цена растёт со ступенью на 20 %, как и зарплата:
// бонус остаётся заметной тратой, а не мелочью, на любой ступени.
export const ITEMS = Object.freeze({
  energy: Object.freeze({ game: 'scooter', name: 'Энергетик', effect: 'Один заряд нитро на старте заезда', price: 120 }),
  cheat: Object.freeze({ game: 'plank', name: 'Шпаргалка', effect: 'Один раз убирает неверный ответ', price: 150 }),
  protein: Object.freeze({ game: 'match', name: 'Протеин', effect: '+3 хода в задании «Три в ряд»', price: 180 }),
});

export const VERSION = 1;

export function createCareer() {
  return { version: VERSION, rank: 0, done: { scooter: false, plank: false, match: false }, coins: 0, items: { energy: 0, cheat: 0, protein: 0 }, finished: false, earned: 0 };
}

export const rankOf = state => CAREER[Math.min(state.rank, CAREER.length - 1)];
export const priceOf = (state, item) => Math.round(ITEMS[item].price * (1 + .2 * Math.min(state.rank, CAREER.length - 1)) / 10) * 10;
export const rankComplete = state => GAMES.every(game => state.done[game]);

const plural = (n, one, few, many) => n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many;

/** Цель задания простыми словами — одна строка для карточки и игры. */
export function goalText(game, goal) {
  if (game === 'scooter') return `Проехать ${goal.metres.toLocaleString('ru-RU')} м в режиме «${{ easy: 'Разминка', medium: 'Час пик', extreme: 'Предел' }[goal.difficulty]}»`;
  if (game === 'plank') return `${goal.streak} ${plural(goal.streak, 'верный ответ', 'верных ответа', 'верных ответов')} подряд · ${['Все уровни', 'Новичок', 'Любитель', 'Продвинутый', 'Профи'][goal.level]}`;
  return `Пройти главу ${goal.chapter} за ${goal.moves} ${plural(goal.moves, 'ход', 'хода', 'ходов')} · ${goal.target.toLocaleString('ru-RU')} очков`;
}

/** Выполнено ли задание: заезд — метры, планка — верные ответы подряд, три в ряд — победа в главе. */
export function missionMet(game, goal, result) {
  if (!result) return false;
  if (game === 'scooter') return result.difficulty === goal.difficulty && result.distance >= goal.metres;
  if (game === 'plank') return result.streak >= goal.streak;
  return result.won === true;
}

/**
 * Результат задания текущей ступени. Повтор уже выполненного задания
 * зарплаты не даёт. Возвращает новое состояние и что произошло.
 */
export function recordResult(state, game, result) {
  if (state.finished || !GAMES.includes(game)) return { state, met: false, earned: 0 };
  const rank = rankOf(state), met = missionMet(game, rank[game], result);
  if (!met || state.done[game]) return { state, met, earned: 0 };
  const next = { ...state, done: { ...state.done, [game]: true }, coins: state.coins + rank.salary, earned: state.earned + rank.salary };
  return { state: next, met, earned: rank.salary };
}

/** Повышение после всех трёх заданий: премия в две зарплаты, новая ступень. */
export function promote(state) {
  if (!rankComplete(state) || state.finished) return { state, bonus: 0 };
  const bonus = rankOf(state).salary * 2;
  const last = state.rank >= CAREER.length - 1;
  const next = { ...state, coins: state.coins + bonus, earned: state.earned + bonus, rank: last ? state.rank : state.rank + 1, finished: last, done: last ? state.done : { scooter: false, plank: false, match: false } };
  return { state: next, bonus };
}

export function buy(state, item) {
  if (!ITEMS[item]) return { state, ok: false };
  const price = priceOf(state, item);
  if (state.coins < price) return { state, ok: false };
  return { state: { ...state, coins: state.coins - price, items: { ...state.items, [item]: (state.items[item] || 0) + 1 } }, ok: true };
}

export function useItem(state, item) {
  if (!(state.items[item] > 0)) return { state, ok: false };
  return { state: { ...state, items: { ...state.items, [item]: state.items[item] - 1 } }, ok: true };
}

/** Чтение сохранённой карьеры: чужая или испорченная запись — начать заново. */
export function restoreCareer(raw) {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!value || value.version !== VERSION || !Number.isInteger(value.rank) || value.rank < 0 || value.rank >= CAREER.length) return createCareer();
    const base = createCareer();
    return { ...base, ...value, done: { ...base.done, ...value.done }, items: { ...base.items, ...value.items }, coins: Math.max(0, Number(value.coins) || 0) };
  } catch (_) { return createCareer(); }
}
