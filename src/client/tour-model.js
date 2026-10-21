/**
 * Шаги тура по разделам (FT-577) — без React, чтобы выбор шагов проверял
 * тест (scripts/test-onboarding.mjs).
 *
 * Шаги сгруппированы по разделам «Как пользоваться» (21.10.2026, пункт 5
 * плана трёх разборов; образец — «Help» в SmartGym): тур любого раздела
 * можно пройти заново, в 3–4 шага. Первый вход идёт прежним потоком —
 * первыми шагами разделов по нижнему меню, «Меню «Ещё»» и первым
 * действием (FIRST_RUN ниже).
 *
 * Шаг: tab — какую вкладку открыть; target — что подсветить (строка или
 * список: берётся первое, что нашлось на экране); wait — цель внутри
 * раздела: может появиться после загрузки данных, к ней прокручиваем.
 * Нет цели — карточка по центру, без подсветки. text — строка или
 * функция от { unlinked, app }. onlyFirst — шаг только первого входа.
 */

// Цель внутри открытого раздела: спрятанные вкладки тоже в документе
const PAGE = 'main.app__body:not([hidden]) ';
const TAB = (id) => `.tabbar [data-tab="${id}"]`;

export const TOUR_SECTIONS = [
  {
    id: 'overview',
    title: 'Обзор',
    note: 'Что сегодня и куда нажать',
    steps: [
      { id: 'tab', tab: 'overview', target: TAB('overview'), title: 'Обзор — главное на сегодня',
        text: ({ unlinked }) => (unlinked
          ? 'Что сегодня: тренировки за неделю, шаги и калории. Когда появится тренер — здесь же его занятия и оплата.'
          : 'Что сегодня, следующая тренировка с тренером и сколько занятий оплачено.') },
      { id: 'today', tab: 'overview', wait: true, target: PAGE + '.today-strip', title: 'Сегодня',
        text: 'Тренировки за неделю, шаги и калории за день — против цели. Касание открывает раздел, где живёт число.' },
      { id: 'stories', tab: 'overview', wait: true, target: PAGE + '.stories', title: 'Истории',
        text: 'Что нового в приложении, инструкция и ваши итоги недели. Кружок светится, пока его не досмотрели.' },
      // Меню — только в первом входе: тур раздела запускают из этого меню
      { id: 'menu', onlyFirst: true, tab: 'overview', target: '.app__bar [aria-label="Меню"]', title: 'Меню «Ещё»',
        text: 'Ваш тренер и ID для привязки, ваши данные, настройки и «Как пользоваться» — инструкция и короткие туры, если что-то забудется.' },
    ],
  },
  {
    id: 'workout',
    title: 'Тренировка в зале',
    note: 'Подход, вес, «Легко / Норм / Тяжело», отдых',
    steps: [
      { id: 'tab', tab: 'plan', target: TAB('plan'), title: 'Тренировки',
        text: 'Программа по занятиям. «Начать тренировку» — и отмечайте подходы по ходу, отдых считает таймер. Проведённые — во вкладке «Выполненные».' },
      // Своя кнопка помечена для первого действия; у тренера «глазами
      // клиента» метки нет — тогда любая кнопка занятия, без программы —
      // свободная тренировка
      { id: 'start', tab: 'plan', wait: true, title: 'Начать тренировку',
        target: [PAGE + '[data-first-action="workout"]', PAGE + '.plan__block .button--primary', PAGE + '.plan__free'],
        text: 'Откроются упражнения занятия. Веса подставлены по прошлому разу, под подходом — что было тогда. Программы нет — «Свободная тренировка»: что сделали, то и записали.' },
      { id: 'effort', tab: 'plan', title: '«Легко», «Норм» или «Тяжело»',
        text: 'Сделали подход — оцените его одной кнопкой: по оценке приложение подстроит вес следующих подходов и отдых. Отдых можно свернуть, а после последнего подхода — «Завершить» вверху.' },
      // Переключатель «Очередь / Выполненные / Вся программа» — прямо в
      // разделе; месяцы стоят своим рядом внутри .plan__months
      { id: 'done', tab: 'plan', wait: true, target: PAGE + '> .chips', title: 'Выполненные',
        text: 'Проведённые тренировки — с весами, которые вы записали; тренер видит то же. «Вся программа» — весь месяц и карта мышц.' },
    ],
  },
  {
    id: 'progress',
    title: 'Прогресс и цели',
    note: 'Замеры, итоги недели, серии',
    steps: [
      { id: 'tab', tab: 'progress', target: TAB('progress'), title: 'Прогресс',
        text: ({ app }) => (app
          ? 'Ваша цель вверху, под ней замеры, рабочие веса, шаги с телефона и награды за серии — видно, как вы к ней идёте.'
          : 'Ваша цель вверху, под ней замеры, рабочие веса, шаги и награды за серии — видно, как вы к ней идёте. Шаги приходят из приложения на телефоне.') },
      { id: 'measure', tab: 'progress', wait: true, title: 'Новый замер',
        target: [PAGE + '.progress__add > .button', PAGE + '.state__action .button'],
        text: '«Записать замер» — вес и обхваты, хватит и одного показателя. Из замеров строятся график и изменения.' },
      { id: 'goals', tab: 'progress', wait: true, target: [PAGE + '.goal-card', PAGE + '.goals'], title: 'Цели и серии',
        text: 'Тренировки за неделю, месяц и год — против цели. Выполнили цель недели — растёт серия; за тренировки, серии и рекорды — награды.' },
      { id: 'summary', tab: 'progress', wait: true, target: [PAGE + '.summary__bar', PAGE + '.summary'], title: 'Итоги недели и месяца',
        text: 'Что сделано за неделю и месяц, со стрелками к прошлому такому же периоду. Листайте стрелками или пальцем вбок.' },
    ],
  },
  {
    id: 'nutrition',
    title: 'Питание',
    note: 'Норма, дневник, рецепты',
    steps: [
      { id: 'tab', tab: 'nutrition', target: TAB('nutrition'), title: 'Питание',
        text: 'Норма калорий и БЖУ под вашу цель и рацион из того, что есть дома, — со списком покупок.' },
      // Итог дня: граммами, порциями «Ладони» (п. 8 плана) или без дневника — норма
      { id: 'norm', tab: 'nutrition', wait: true, target: [PAGE + '.diary-summary', PAGE + '.palm-summary', PAGE + '.lead'], title: 'Норма на день',
        text: 'Сколько съедено и сколько осталось до нормы калорий и БЖУ. Норму считает анкета из семи вопросов, назначить её может и тренер.' },
      // «Добавить еду» — внизу экрана (FT-646), в прежних сборках — у даты
      { id: 'add', tab: 'nutrition', wait: true, target: [PAGE + '.diary-addbar .button', PAGE + '.diary-toolbar .button--primary'], title: 'Дневник',
        text: '«Добавить еду» — продукт и вес или порции ладонью, смотря как вы считаете еду. Тренер видит дневник и может оставить комментарий к дню.' },
      { id: 'recipes', tab: 'nutrition', wait: true, target: PAGE + '.nutrition-diary .chips', title: 'Неделя, рецепты, ещё',
        text: '«Неделя» — итоги по дням, «Рецепты» — блюда тренера и свои, «Ещё» — норма, анкета и короткие уроки о питании.' },
    ],
  },
  {
    // Часы — только в приложении на iPhone: в браузере и на Android их нет
    id: 'watch',
    only: 'ios',
    title: 'Apple Watch',
    note: 'Тренировка с запястья',
    steps: [
      { id: 'install', tab: 'plan', target: TAB('plan'), title: 'Поставьте Fit Track на часы',
        text: 'Из приложения Watch на iPhone. На часах — те же тренировки, что здесь, в «Тренировках»: выберите нужную и ведите её с руки.' },
      { id: 'wrist', tab: 'plan', title: 'Подход с запястья',
        text: 'Вес — колёсиком или барабаном, оценка подхода — кнопками, отдых и пульс — на экране часов.' },
      { id: 'offline', tab: 'plan', wait: true, target: PAGE + '> .chips', title: 'Без связи — тоже',
        text: 'Тренировка с часов доедет, когда появится связь, и встанет в «Выполненные» — как проведённая с телефона.' },
    ],
  },
];

/** Первый вход (FT-577): по нижнему меню, затем меню «Ещё» — раздел:шаг */
export const FIRST_RUN = ['overview:tab', 'workout:tab', 'progress:tab', 'nutrition:tab', 'overview:menu'];

/** Разделы для «Как пользоваться»: часы — только в приложении на iPhone */
export function tourSections({ ios = false } = {}) {
  return TOUR_SECTIONS.filter((s) => s.only !== 'ios' || ios);
}

function stepOf(ref) {
  const [section, id] = ref.split(':');
  const s = TOUR_SECTIONS.find((x) => x.id === section);
  return s && s.steps.find((x) => x.id === id);
}

// Текст под человека; служебные поля наружу не нужны, в карточку — как было
function resolve({ id, onlyFirst, text, ...step }, ctx) {
  return { ...step, text: typeof text === 'function' ? text(ctx) : text };
}

/**
 * Шаги одного показа. section — тур раздела из «Как пользоваться»;
 * без него — первый вход: прежний поток и последним — первое действие.
 * Неизвестный раздел — пусто: тур не показывается.
 */
export function tourSteps({ unlinked = false, action, app = false, section } = {}) {
  const ctx = { unlinked: !!unlinked, app: !!app };
  if (section) {
    const s = TOUR_SECTIONS.find((x) => x.id === section);
    return s ? s.steps.filter((step) => !step.onlyFirst).map((step) => resolve(step, ctx)) : [];
  }
  const steps = FIRST_RUN.map((ref) => resolve(stepOf(ref), ctx));
  if (action === 'workout') {
    steps.push({ tab: 'plan', action: 'workout', wait: true, title: 'Начните первое занятие',
      target: 'main.app__body:not([hidden]) [data-first-action="workout"]',
      text: 'Нажмите «Начать тренировку» — откроются упражнения программы. Подходы отмечаете по ходу.' });
  } else if (action === 'steps') {
    steps.push({ tab: 'overview', action: 'steps', title: 'Посмотрите свои шаги', target: '.tabbar [data-tab="progress"]',
      text: 'Нажмите «Прогресс» — там шаги за сегодня и за две недели. Не подключены — там же кнопка «Подключить шаги».' });
  } else {
    steps.push({ tab: 'overview', title: 'Готово!', text: 'Всё самое важное — в нижнем меню. Приятных тренировок!' });
  }
  return steps;
}

/* Пройденные туры — отметка на этом устройстве: личная, не данные.
   Хранилище может быть недоступно (приватный режим) — тогда всё «новое» */
const PASSED_KEY = 'tours_passed_v1';

export function passedTours() {
  try {
    const list = JSON.parse(localStorage.getItem(PASSED_KEY) || '[]');
    return Array.isArray(list) ? list.filter((x) => typeof x === 'string') : [];
  } catch (_) {
    return [];
  }
}

export function markTourPassed(id) {
  try {
    const list = passedTours();
    if (!list.includes(id)) localStorage.setItem(PASSED_KEY, JSON.stringify(list.concat(id)));
  } catch (_) { /* не запомнили — останется «новое» */ }
}
