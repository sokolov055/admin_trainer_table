/**
 * Анкета подбора программы 2.0 (FT-577, образец — ONLYFITS, FT-560).
 *
 * Порядок как у них: основные данные → базовый обмен → активность → цель
 * и темп → итог. Наши вопросы о занятиях (опыт, место, график) — после
 * цели: из них подбирается программа. Шаги совпадают с сервером
 * (onboarding-handlers.js, ONBOARDING_STEPS) — номер шага хранится там.
 *
 * Данные о теле, активность и темп — необязательные, только для нормы
 * питания. Пропустил — шаги «Базовый обмен», «Активность» и «Ваш план»
 * не показываются, программа подбирается так же.
 */

export const STEPS = ['body', 'bmr', 'lifestyle', 'goal', 'experience', 'place', 'days', 'plan', 'programs'];
export const LAST = STEPS.length - 1;

/** Разделы прогресса сверху — значками, как у ONLYFITS, а не каждый вопрос */
export const STAGES = [
  { id: 'body', label: 'О вас', steps: ['body', 'bmr'] },
  { id: 'activity', label: 'Активность', steps: ['lifestyle'] },
  { id: 'goal', label: 'Цель', steps: ['goal'] },
  { id: 'training', label: 'Тренировки', steps: ['experience', 'place', 'days'] },
  { id: 'plan', label: 'Ваш план', steps: ['plan', 'programs'] },
];

/** Регистрация — первый раздел той же полосы (LoginScreen.jsx) */
export const SIGNUP_STAGE = { id: 'account', label: 'Регистрация', steps: [] };

export const GOALS = [
  { id: 'lose', title: 'Похудеть', hint: 'Снизить жир за счёт дефицита калорий и регулярных тренировок', art: 'lose' },
  { id: 'fitness', title: 'Быть в форме', hint: 'Больше энергии, выносливости и уверенности в теле', art: 'fitness' },
  { id: 'strength', title: 'Стать сильнее', hint: 'Расти в весах в основных движениях', art: 'strength' },
  { id: 'muscle', title: 'Набрать мышцы', hint: 'Рост мышц с небольшим профицитом калорий', art: 'muscle' },
];

/** Активность — три уровня, как в анкете питания (LIFESTYLES на сервере) */
export const LIFESTYLES = [
  { id: 'desk', title: 'Сидячий', hint: 'Работа за столом или за рулём, пешком — немного', art: 'desk' },
  { id: 'feet', title: 'Подвижный', hint: 'Работа стоя, много хожу пешком в течение дня', art: 'feet' },
  { id: 'labor', title: 'Физический труд', hint: 'Стройка, склад, доставка — весь день в движении', art: 'labor' },
];

export const QUESTIONS = {
  experience: { key: 'experience', eyebrow: 'Опыт', title: 'Как давно вы занимаетесь?', hint: 'Подберём нагрузку, с которой легко начать.', options: [
    ['beginner', 'Только начинаю', 'Раньше не занимался или возвращаюсь после долгого перерыва', 'beginner'],
    ['regular', 'Занимаюсь иногда', 'Основные движения знакомы, но регулярности пока нет', 'regular'],
    ['experienced', 'Занимаюсь регулярно', 'Уверенно выполняю упражнения и знаю свои рабочие веса', 'experienced'],
  ] },
  place: { key: 'place', eyebrow: 'Место', title: 'Где будете заниматься?', hint: 'Покажем программы под то, что есть рядом.', options: [
    ['gym', 'В зале', 'Тренажёры и свободные веса', 'gym'],
    ['home', 'Дома', 'Что понадобится — указано в программе', 'home'],
  ] },
  days: { key: 'days', eyebrow: 'График', title: 'Сколько раз в неделю?', hint: 'Выберите график, который точно получится держать.', options: [
    [2, 'Два раза', 'Хватает, чтобы начать и не выгореть', 2],
    [3, 'Три раза', 'Золотая середина для результата', 3],
    [4, 'Четыре раза', 'Больше объёма — для тех, у кого есть время', 4],
  ] },
};

/** Границы — как в анкете питания (lib/nutrition.js LIMITS) */
export const WHEELS = {
  age: { min: 14, max: 100, unit: 'лет', label: 'Возраст' },
  height: { min: 120, max: 230, unit: 'см', label: 'Рост' },
  weight: { min: 30, max: 250, unit: 'кг', label: 'Вес' },
};

/** Значение, с которого открывается барабан, пока ничего не выбрано */
export function wheelStart(key, sex) {
  if (key === 'age') return 30;
  if (key === 'height') return sex === 'f' ? 165 : 178;
  return sex === 'f' ? 62 : 78;
}

export const hasBody = (a) => !!(a.sex && a.age && a.height && a.weight);

/** Можно ли уйти с шага вперёд */
export function canAdvance(answers, step) {
  const id = STEPS[step];
  if (id === 'body') return hasBody(answers);
  if (id === 'lifestyle') return LIFESTYLES.some((l) => l.id === answers.lifestyle);
  if (id === 'goal') return GOALS.some((g) => g.id === answers.goal);
  const q = QUESTIONS[id];
  if (q) return q.options.some(([value]) => value === answers[q.key]);
  return id === 'bmr' || id === 'plan';
}

/** Шаги, которые есть только с данными о теле */
const NEEDS_BODY = ['bmr', 'lifestyle', 'plan'];

export function shown(answers, step) {
  return !NEEDS_BODY.includes(STEPS[step]) || hasBody(answers);
}

/** Следующий показанный шаг (вперёд или назад) */
export function nextStep(answers, step, dir = 1) {
  let s = step + dir;
  while (s > 0 && s < LAST && !shown(answers, s)) s += dir;
  return Math.max(0, Math.min(LAST, s));
}

/**
 * Где открыть сохранённую анкету: на сохранённом шаге, но не дальше
 * первого обязательного вопроса без ответа. Так черновик прежней анкеты
 * (другой порядок шагов) не уводит за неотвеченный вопрос.
 */
export function resumeStep(answers, step) {
  const required = ['goal', 'experience', 'place', 'days'];
  const gap = required.map((k) => STEPS.indexOf(k)).find((i) => !canAdvance(answers, i));
  let s = Math.min(step || 0, gap === undefined ? LAST : gap);
  if (!shown(answers, s)) s = nextStep(answers, s, 1);
  return s;
}

export function stageOf(step) {
  return STAGES.findIndex((st) => st.steps.includes(STEPS[step]));
}

/** Тренировок в неделю → «3 раза в неделю» */
export function timesWeek(n) {
  return n + ' ' + (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'раза' : 'раз') + ' в неделю';
}

/** Темп — те же варианты, что в «Питании» (PACES на сервере) */
export const PACES = {
  lose: { title: 'Темп похудения', options: [
    { id: 'soft', label: 'Мягкий', note: '−10 %', hint: 'Дольше, но почти без чувства голода' },
    { id: 'even', label: 'Ровный', note: '−15 %', hint: 'Средний темп — его и советуем' },
    { id: 'fast', label: 'Быстрый', note: '−20 %', hint: 'Заметный результат, но тяжелее держать' },
  ] },
  muscle: { title: 'Темп набора массы', options: [
    { id: 'soft', label: 'Мягкий', note: '+7 %', hint: 'Медленнее, зато почти без жира' },
    { id: 'even', label: 'Ровный', note: '+11 %', hint: 'Средний темп — его и советуем' },
    { id: 'fast', label: 'Быстрый', note: '+15 %', hint: 'Масса быстрее, но и жира больше' },
  ] },
};

/** Базовый обмен по Миффлину — Сан-Жеору, как на сервере (lib/nutrition.js) */
export function bmrOf(a) {
  if (!hasBody(a)) return null;
  return Math.round(10 * a.weight + 6.25 * a.height - 5 * a.age + (a.sex === 'm' ? 5 : -161));
}
