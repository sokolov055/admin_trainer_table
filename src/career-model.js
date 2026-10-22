// FT-563, 19.10.2026: сюжетная карьера через мини-игры (идея владельца 17.10).
// Десять ступеней — от тренировок на улице до собственной сети клубов. На каждой
// по заданию в каждой игре; ступень закрыта, когда выполнены все. 21.10.2026
// добавлены «Блины» — четвёртое задание (решение владельца: сразу в карьеру).
// Сложность только растёт: дальше заезд и строже режим, больше верных ответов
// подряд на более трудных вопросах, меньше ходов и выше цели в «Три в ряд»,
// уровень «Блинов» не раньше и план по тоннажу не ниже.
// Зарплата за задание растёт со ступенью, на неё покупаются бонусы. Валюта —
// игровые монеты, не рубли: рядом настоящие тарифы, путать нельзя (App Store 3.1.1).
// Чистые функции без React; состояние хранится только на устройстве.

import { LEVELS } from './blini-model.js';
import { TRACKS } from './blini-tracks.js';

export const CAREER = Object.freeze([
  { title: 'Тренировки на улице', place: 'Турник во дворе', story: 'Ты тренируешься на площадке у дома. Соседи уже спрашивают, как ты так подтягиваешься.',
    scooter: { difficulty: 'easy', metres: 200 }, plank: { level: 1, streak: 3 }, match: { chapter: 1, moves: 24, target: 1700, count: 10 }, blini: { level: 0, target: 1500 }, salary: 100 },
  { title: 'Тренировки в зале', place: 'Абонемент в клуб', story: 'Первый абонемент в настоящий зал. Пора показать, что ты здесь не на неделю.',
    scooter: { difficulty: 'easy', metres: 300 }, plank: { level: 1, streak: 5 }, match: { chapter: 1, moves: 20, target: 2000, count: 12 }, blini: { level: 1, target: 1800 }, salary: 150 },
  { title: 'Тренер', place: 'Свой первый клиент', story: 'Тебя взяли тренером. Клиенты ждут программ, а администратор — что ты не опоздаешь.',
    scooter: { difficulty: 'easy', metres: 450 }, plank: { level: 2, streak: 4 }, match: { chapter: 1, moves: 19, target: 2250, count: 14 }, blini: { level: 2, target: 2000 }, salary: 220 },
  { title: 'Координатор тренажёрного зала', place: 'Расписание всего зала', story: 'Теперь на тебе весь тренажёрный зал: смены тренеров, инвентарь и очередь к стойке.',
    scooter: { difficulty: 'medium', metres: 450 }, plank: { level: 2, streak: 6 }, match: { chapter: 2, moves: 18, target: 2400, count: 15 }, blini: { level: 3, target: 2000 }, salary: 300 },
  { title: 'Фитнес-директор клуба', place: 'Все тренеры клуба', story: 'Ты отвечаешь за качество тренировок во всём клубе. Тренеры приходят к тебе за советом.',
    scooter: { difficulty: 'medium', metres: 480 }, plank: { level: 3, streak: 5 }, match: { chapter: 2, moves: 18, target: 2500, count: 15 }, blini: { level: 5, target: 2300 }, salary: 400 },
  { title: 'Управляющий клуба', place: 'Клуб целиком', story: 'Под тобой весь клуб: касса, ремонт, продажи и довольные гости.',
    scooter: { difficulty: 'medium', metres: 600 }, plank: { level: 3, streak: 7 }, match: { chapter: 2, moves: 17, target: 2650, count: 16 }, blini: { level: 7, target: 2500 }, salary: 520 },
  { title: 'Директор региона', place: 'Клубы в трёх городах', story: 'Тебе доверили регион. Между клубами — сотни километров и тысяча вопросов.',
    scooter: { difficulty: 'extreme', metres: 300 }, plank: { level: 4, streak: 5 }, match: { chapter: 3, moves: 16, target: 2800, count: 17 }, blini: { level: 8, target: 2500 }, salary: 660 },
  { title: 'Управление сетью клубов', place: 'Вся сеть', story: 'Ты руководишь сетью. Открытия, команды, отчёты — и всё равно хочется самому потренироваться.',
    scooter: { difficulty: 'extreme', metres: 320 }, plank: { level: 4, streak: 7 }, match: { chapter: 3, moves: 16, target: 2950, count: 18 }, blini: { level: 11, target: 2800 }, salary: 820 },
  { title: 'Генеральный директор сети', place: 'Кабинет на последнем этаже', story: 'Совет директоров ждёт рекордов. Покажи, что генеральный в форме лучше всех.',
    scooter: { difficulty: 'extreme', metres: 360 }, plank: { level: 4, streak: 9 }, match: { chapter: 3, moves: 15, target: 3050, count: 18 }, blini: { level: 12, target: 3200 }, salary: 1000 },
  { title: 'Собственник сети', place: 'Своя сеть клубов', story: 'Последний шаг: сеть клубов становится твоей. От турника во дворе до собственного бизнеса.',
    scooter: { difficulty: 'extreme', metres: 420 }, plank: { level: 4, streak: 12 }, match: { chapter: 3, moves: 14, target: 3200, count: 19 }, blini: { level: 13, target: 3400 }, salary: 1250 },
].map(rank => Object.freeze({ ...rank, scooter: Object.freeze(rank.scooter), plank: Object.freeze(rank.plank), match: Object.freeze(rank.match), blini: Object.freeze(rank.blini) })));

export const GAMES = Object.freeze(['scooter', 'plank', 'match', 'blini']);

// Бонусы на одно задание. Цена растёт со ступенью на 20 %, как и зарплата:
// бонус остаётся заметной тратой, а не мелочью, на любой ступени.
export const ITEMS = Object.freeze({
  energy: Object.freeze({ game: 'scooter', name: 'Энергетик', effect: 'Один заряд нитро на старте заезда', price: 120 }),
  cheat: Object.freeze({ game: 'plank', name: 'Шпаргалка', effect: 'Один раз убирает неверный ответ', price: 150 }),
  protein: Object.freeze({ game: 'match', name: 'Протеин', effect: '+3 хода в задании «Три в ряд»', price: 180 }),
  belt: Object.freeze({ game: 'blini', name: 'Пояс', effect: 'Один раз откатывает блины от помоста', price: 160 }),
});

/** Действие бонуса внутри фразы: «Протеин: +3 хода в задании «Три в ряд»» — название игры не теряет заглавную. */
/** «1 250 монет» — неразрывный пробел, чтобы слово не уезжало от числа. */
export const coins = n => n.toLocaleString('ru-RU') + '\u00a0' + plural(n, 'монета', 'монеты', 'монет');

export const itemEffect = item => item.effect.charAt(0).toLowerCase() + item.effect.slice(1);

export const VERSION = 1;

const notDone = () => Object.fromEntries(GAMES.map(game => [game, false]));

export function createCareer() {
  return { version: VERSION, rank: 0, done: notDone(), coins: 0, items: { energy: 0, cheat: 0, protein: 0, belt: 0 }, finished: false, earned: 0 };
}

export const rankOf = state => CAREER[Math.min(state.rank, CAREER.length - 1)];
export const priceOf = (state, item) => Math.round(ITEMS[item].price * (1 + .2 * Math.min(state.rank, CAREER.length - 1)) / 10) * 10;
export const rankComplete = state => GAMES.every(game => state.done[game]);

// Сюжетные фигуры глав «Три в ряд» (match-story.js): гантели, яблоки, диски
const PIECE_WORDS = { 1: ['гантель', 'гантели', 'гантелей'], 2: ['яблоко', 'яблока', 'яблок'], 3: ['диск', 'диска', 'дисков'] };
export const plural = (n, one, few, many) => n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many;

/** Цель задания простыми словами — одна строка для карточки и игры. */
export function goalText(game, goal, boost = false) {
  if (game === 'scooter') return `Проехать ${goal.metres.toLocaleString('ru-RU')} м в режиме «${{ easy: 'Разминка', medium: 'Час пик', extreme: 'Предел' }[goal.difficulty]}»`;
  if (game === 'blini') return `Уровень ${goal.level + 1}, «${TRACKS[LEVELS[goal.level].track].name}»: план ${goal.target.toLocaleString('ru-RU')} кг`;
  if (game === 'plank') return `${goal.streak} ${plural(goal.streak, 'верный ответ', 'верных ответа', 'верных ответов')} подряд · ${['Все уровни', 'Новичок', 'Любитель', 'Продвинутый', 'Профи'][goal.level]}`;
  // Победа в главе — очки, сюжетные фигуры и ящики: в цели всё, без чего её нет
  const moves = goal.moves + (boost ? 3 : 0), piece = PIECE_WORDS[goal.chapter] || PIECE_WORDS[1];
  return `Глава ${goal.chapter}: ${moves} ${plural(moves, 'ход', 'хода', 'ходов')}, ${goal.target.toLocaleString('ru-RU')} очков, ${goal.count} ${plural(goal.count, ...piece)}, 6 ящиков`;
}

/** Выполнено ли задание: заезд — метры, планка — верные ответы подряд, три в ряд и блины — победа. */
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

/** Повышение после всех заданий ступени: премия в две зарплаты, новая ступень. */
export function promote(state) {
  if (!rankComplete(state) || state.finished) return { state, bonus: 0 };
  const bonus = rankOf(state).salary * 2;
  const last = state.rank >= CAREER.length - 1;
  const next = { ...state, coins: state.coins + bonus, earned: state.earned + bonus, rank: last ? state.rank : state.rank + 1, finished: last, done: last ? state.done : notDone() };
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
    // Поправленная руками запись не даёт ни «минус двух» бонусов, ни задания, выполненного строкой
    const count = n => Number.isInteger(n) && n > 0 ? n : 0;
    const done = Object.fromEntries(GAMES.map(game => [game, value.done?.[game] === true]));
    const items = Object.fromEntries(Object.keys(base.items).map(item => [item, count(value.items?.[item])]));
    return { ...base, ...value, done, items, finished: value.finished === true, coins: Math.max(0, Math.floor(Number(value.coins)) || 0), earned: Math.max(0, Math.floor(Number(value.earned)) || 0) };
  } catch (_) { return createCareer(); }
}
