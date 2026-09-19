/**
 * ==========================================================================
 * Блюда и продукты: данные для подбора рациона
 *
 * Тридцать одно домашнее блюдо и справочник продуктов на 56 позиций.
 * Список согласован с тренером 20.09.2026.
 *
 * ПОЧЕМУ ЭТО ЛЕЖИТ ВО ФРОНТЕНДЕ, А НЕ В ТАБЛИЦЕ И НЕ НА СЕРВЕРЕ.
 * Всё остальное в приложении — данные КЛИЕНТА: они живут в таблице,
 * потому что тренер их правит. Рецепты ничей не правит: это справочник,
 * одинаковый для всех восемнадцати человек и меняющийся только релизом.
 * Положить его в зеркало значило бы синхронизировать неизменяемое, а
 * заодно обязать сервер и Apps Script знать про блюда — ради данных,
 * которые обе ветки API просто передавали бы без единой мысли.
 *
 * ОТКУДА КБЖУ. Не из рецептов в сети: там они «на глаз» и почти всегда
 * без веса. Каждое блюдо посчитано сложением по справочнику ниже, сверено
 * с арифметикой 4/9/4 — расхождение нигде не больше пяти процентов.
 *
 * ВЕС — В ТОМ ВИДЕ, В КАКОМ ПРОДУКТ КЛАДУТ НА ВЕСЫ. Крупы, макароны и
 * бобовые сухие, мясо и рыба сырые. Это главный источник ошибки в таких
 * справочниках: варёная гречка втрое легче сухой по калорийности на
 * сто граммов, и перепутать их значит ошибиться в рационе втрое.
 *
 * Файл сгенерирован; правится не он, а исходный расчёт. Если блюдо
 * нужно добавить руками — держите формат и пересчитайте per: сумма по
 * items, делённая на portions.
 * ==========================================================================
 */

/** Продукты на полке магазина идут группами, и вспоминают их так же. */
export const GROUPS = [
  { id: 'grain', title: 'Крупы, мука, хлеб' },
  { id: 'meat', title: 'Мясо, рыба, яйца' },
  { id: 'dairy', title: 'Молочное' },
  { id: 'veg', title: 'Овощи, фрукты, грибы' },
  { id: 'beans', title: 'Бобовые' },
  { id: 'other', title: 'Прочее' },
];

/**
 * Справочник: КБЖУ на 100 г.
 *
 * Ключ — название продукта, оно же показывается человеку. Отдельного
 * кода у продукта нет намеренно: список закрытый, из него же собраны
 * все блюда, и второй идентификатор пришлось бы держать в синхронном
 * состоянии с названием, которое и так уникально.
 */
export const FOOD = {
  'гречка': { kcal: 313, protein: 12.6, fat: 3.3, carbs: 62.1, group: 'grain' },
  'рис': { kcal: 344, protein: 7.0, fat: 1.0, carbs: 78.0, group: 'grain' },
  'овсяные хлопья': { kcal: 352, protein: 12.3, fat: 6.2, carbs: 59.5, group: 'grain' },
  'макароны': { kcal: 344, protein: 10.4, fat: 1.1, carbs: 71.5, group: 'grain' },
  'перловка': { kcal: 320, protein: 9.3, fat: 1.1, carbs: 73.7, group: 'grain' },
  'пшено': { kcal: 348, protein: 11.5, fat: 3.3, carbs: 66.5, group: 'grain' },
  'мука пшеничная': { kcal: 334, protein: 10.3, fat: 1.1, carbs: 70.6, group: 'grain' },
  'манка': { kcal: 333, protein: 10.3, fat: 1.0, carbs: 70.6, group: 'grain' },
  'хлеб ржаной': { kcal: 174, protein: 6.6, fat: 1.2, carbs: 34.2, group: 'grain' },
  'хлебцы цельнозерновые': { kcal: 310, protein: 10.0, fat: 3.0, carbs: 60.0, group: 'grain' },
  'отруби овсяные': { kcal: 246, protein: 17.0, fat: 7.0, carbs: 24.0, group: 'grain' },
  'панировочные сухари': { kcal: 347, protein: 11.2, fat: 1.4, carbs: 72.1, group: 'grain' },
  'куриная грудка': { kcal: 113, protein: 23.1, fat: 1.9, carbs: 0.4, group: 'meat' },
  'куриное бедро': { kcal: 158, protein: 19.0, fat: 9.0, carbs: 0.0, group: 'meat' },
  'индейка филе': { kcal: 120, protein: 21.6, fat: 3.7, carbs: 0.0, group: 'meat' },
  'говядина постная': { kcal: 150, protein: 20.2, fat: 7.1, carbs: 0.0, group: 'meat' },
  'фарш говяжий 10%': { kcal: 168, protein: 18.0, fat: 10.0, carbs: 0.0, group: 'meat' },
  'фарш куриный': { kcal: 143, protein: 17.4, fat: 8.1, carbs: 0.0, group: 'meat' },
  'треска': { kcal: 78, protein: 17.7, fat: 0.7, carbs: 0.0, group: 'meat' },
  'минтай': { kcal: 72, protein: 15.9, fat: 0.9, carbs: 0.0, group: 'meat' },
  'горбуша': { kcal: 142, protein: 20.5, fat: 6.5, carbs: 0.0, group: 'meat' },
  'тунец консервированный': { kcal: 96, protein: 23.5, fat: 1.0, carbs: 0.0, group: 'meat' },
  'яйцо': { kcal: 157, protein: 12.7, fat: 10.9, carbs: 0.7, group: 'meat' },
  'творог 5%': { kcal: 121, protein: 17.2, fat: 5.0, carbs: 1.8, group: 'dairy' },
  'творог 2%': { kcal: 103, protein: 18.0, fat: 2.0, carbs: 3.3, group: 'dairy' },
  'творожный сыр': { kcal: 240, protein: 6.0, fat: 22.0, carbs: 3.5, group: 'dairy' },
  'молоко 2.5%': { kcal: 54, protein: 2.9, fat: 2.5, carbs: 4.8, group: 'dairy' },
  'кефир 1%': { kcal: 40, protein: 3.0, fat: 1.0, carbs: 4.0, group: 'dairy' },
  'йогурт натуральный': { kcal: 60, protein: 4.3, fat: 2.0, carbs: 6.2, group: 'dairy' },
  'сметана 15%': { kcal: 158, protein: 2.6, fat: 15.0, carbs: 3.0, group: 'dairy' },
  'сыр твёрдый': { kcal: 350, protein: 23.0, fat: 30.0, carbs: 0.0, group: 'dairy' },
  'масло сливочное': { kcal: 748, protein: 0.5, fat: 82.5, carbs: 0.8, group: 'dairy' },
  'лук репчатый': { kcal: 41, protein: 1.4, fat: 0.2, carbs: 8.2, group: 'veg' },
  'морковь': { kcal: 32, protein: 1.3, fat: 0.1, carbs: 6.9, group: 'veg' },
  'капуста белокочанная': { kcal: 28, protein: 1.8, fat: 0.1, carbs: 4.7, group: 'veg' },
  'картофель': { kcal: 77, protein: 2.0, fat: 0.4, carbs: 16.3, group: 'veg' },
  'помидор': { kcal: 20, protein: 0.9, fat: 0.2, carbs: 3.9, group: 'veg' },
  'огурец': { kcal: 15, protein: 0.8, fat: 0.1, carbs: 2.8, group: 'veg' },
  'перец болгарский': { kcal: 27, protein: 1.3, fat: 0.0, carbs: 5.3, group: 'veg' },
  'кабачок': { kcal: 24, protein: 0.6, fat: 0.3, carbs: 4.6, group: 'veg' },
  'брокколи': { kcal: 34, protein: 3.0, fat: 0.4, carbs: 5.2, group: 'veg' },
  'свёкла': { kcal: 42, protein: 1.5, fat: 0.1, carbs: 8.8, group: 'veg' },
  'тыква': { kcal: 28, protein: 1.3, fat: 0.3, carbs: 7.7, group: 'veg' },
  'шампиньоны': { kcal: 27, protein: 4.3, fat: 1.0, carbs: 0.1, group: 'veg' },
  'горошек зелёный': { kcal: 55, protein: 5.0, fat: 0.2, carbs: 8.3, group: 'veg' },
  'зелень': { kcal: 38, protein: 3.0, fat: 0.5, carbs: 4.0, group: 'veg' },
  'банан': { kcal: 95, protein: 1.5, fat: 0.2, carbs: 21.8, group: 'veg' },
  'яблоко': { kcal: 47, protein: 0.4, fat: 0.4, carbs: 9.8, group: 'veg' },
  'ягоды замороженные': { kcal: 44, protein: 0.8, fat: 0.5, carbs: 8.0, group: 'veg' },
  'чечевица': { kcal: 295, protein: 24.0, fat: 1.5, carbs: 46.3, group: 'beans' },
  'фасоль консервированная': { kcal: 99, protein: 6.7, fat: 0.3, carbs: 17.4, group: 'beans' },
  'масло растительное': { kcal: 899, protein: 0.0, fat: 99.9, carbs: 0.0, group: 'other' },
  'томатная паста': { kcal: 99, protein: 4.3, fat: 0.5, carbs: 19.0, group: 'other' },
  'мёд': { kcal: 329, protein: 0.8, fat: 0.0, carbs: 80.3, group: 'other' },
  'сахар': { kcal: 399, protein: 0.0, fat: 0.0, carbs: 99.8, group: 'other' },
  'соевый соус': { kcal: 50, protein: 6.0, fat: 0.0, carbs: 6.0, group: 'other' },
};

/**
 * Продукты, которые есть дома у всех.
 *
 * Отмечены заранее и не участвуют в подборе. Спрашивать про масло и
 * сахар значит заставить человека отметить их тридцать один раз подряд
 * ради блюд, где их пять граммов; не спрашивать вовсе — соврать в
 * списке покупок. Поэтому отмечены, но с возможностью снять.
 */
export const STAPLES = ['масло растительное', 'сахар'];

/**
 * С какого веса продукт считается основным.
 *
 * Двадцать граммов — граница между «блюдо из этого состоит» и «этим его
 * приправили». Подбор идёт только по основным: иначе отсутствие зелени
 * весило бы столько же, сколько отсутствие курицы, и наверх попадали бы
 * блюда, которые не из чего готовить.
 */
export const MAIN_GRAMS = 20;

/** Порядок приёмов пищи в течение дня — он же порядок показа. */
export const MEALS = [
  { id: 'завтрак', title: 'Завтрак' },
  { id: 'обед', title: 'Обед' },
  { id: 'ужин', title: 'Ужин' },
  { id: 'перекус', title: 'Перекус' },
];

/**
 * Блюда.
 *
 * `per` — КБЖУ ОДНОЙ порции, `items` — продукты на ВЕСЬ объём. Это не
 * рассогласование, а то, как готовят: борщ варится кастрюлей на шесть
 * порций, а съедается одна. Рацион считается по per, список покупок — по
 * items, и делить второе на portions нельзя: полкартофелины не купишь.
 */
export const RECIPES = [
  {
    id: 'ovsyanka-na-moloke-s-bananom',
    name: 'Овсянка на молоке с бананом',
    meal: 'завтрак',
    portions: 1,
    per: { kcal: 447, protein: 14.8, fat: 8.9, carbs: 75.1 },
    items: [
      { food: 'овсяные хлопья', grams: 60 },
      { food: 'молоко 2.5%', grams: 200 },
      { food: 'банан', grams: 100 },
      { food: 'мёд', grams: 10 },
    ],
  },
  {
    id: 'tvorog-s-yagodami-i-medom',
    name: 'Творог с ягодами и мёдом',
    meal: 'завтрак',
    portions: 1,
    per: { kcal: 292, protein: 31.7, fat: 9.4, carbs: 19.3 },
    items: [
      { food: 'творог 5%', grams: 180 },
      { food: 'ягоды замороженные', grams: 80 },
      { food: 'мёд', grams: 12 },
    ],
  },
  {
    id: 'omlet-s-pomidorami-i-zelenyu',
    name: 'Омлет с помидорами и зеленью',
    meal: 'завтрак',
    portions: 1,
    per: { kcal: 268, protein: 16.6, fat: 18.5, carbs: 7.5 },
    items: [
      { food: 'яйцо', grams: 110 },
      { food: 'молоко 2.5%', grams: 50 },
      { food: 'помидор', grams: 100 },
      { food: 'зелень', grams: 10 },
      { food: 'масло растительное', grams: 5 },
    ],
  },
  {
    id: 'syrniki-zapechennye',
    name: 'Сырники запечённые',
    meal: 'завтрак',
    portions: 2,
    per: { kcal: 431, protein: 40.5, fat: 15.8, carbs: 31.4 },
    items: [
      { food: 'творог 5%', grams: 400 },
      { food: 'яйцо', grams: 55 },
      { food: 'мука пшеничная', grams: 50 },
      { food: 'сахар', grams: 20 },
      { food: 'масло растительное', grams: 5 },
    ],
  },
  {
    id: 'grechnevaya-kasha-na-moloke',
    name: 'Гречневая каша на молоке',
    meal: 'завтрак',
    portions: 1,
    per: { kcal: 306, protein: 11.9, fat: 9.9, carbs: 44.5 },
    items: [
      { food: 'гречка', grams: 60 },
      { food: 'молоко 2.5%', grams: 150 },
      { food: 'масло сливочное', grams: 5 },
    ],
  },
  {
    id: 'pshennaya-kasha-s-tykvoy',
    name: 'Пшённая каша с тыквой',
    meal: 'завтрак',
    portions: 2,
    per: { kcal: 369, protein: 13.2, fat: 10.3, carbs: 58.7 },
    items: [
      { food: 'пшено', grams: 120 },
      { food: 'тыква', grams: 300 },
      { food: 'молоко 2.5%', grams: 300 },
      { food: 'масло сливочное', grams: 10 },
    ],
  },
  {
    id: 'lenivaya-ovsyanka-na-kefire',
    name: 'Ленивая овсянка на кефире',
    meal: 'завтрак',
    portions: 1,
    per: { kcal: 328, protein: 14.2, fat: 6.2, carbs: 49.9 },
    items: [
      { food: 'овсяные хлопья', grams: 50 },
      { food: 'кефир 1%', grams: 200 },
      { food: 'яблоко', grams: 100 },
      { food: 'отруби овсяные', grams: 10 },
    ],
  },
  {
    id: 'grechka-s-kurinoy-grudkoy-i-ovoschami',
    name: 'Гречка с куриной грудкой и овощами',
    meal: 'обед',
    portions: 2,
    per: { kcal: 561, protein: 56.9, fat: 13.9, carbs: 54.1 },
    items: [
      { food: 'гречка', grams: 150 },
      { food: 'куриная грудка', grams: 400 },
      { food: 'морковь', grams: 100 },
      { food: 'лук репчатый', grams: 80 },
      { food: 'масло растительное', grams: 15 },
    ],
  },
  {
    id: 'kurinyy-sup-s-vermishelyu',
    name: 'Куриный суп с вермишелью',
    meal: 'обед',
    portions: 4,
    per: { kcal: 310, protein: 22.9, fat: 12.1, carbs: 26.9 },
    items: [
      { food: 'куриное бедро', grams: 400 },
      { food: 'картофель', grams: 300 },
      { food: 'морковь', grams: 120 },
      { food: 'лук репчатый', grams: 80 },
      { food: 'макароны', grams: 60 },
      { food: 'зелень', grams: 20 },
      { food: 'масло растительное', grams: 10 },
    ],
  },
  {
    id: 'borsch-s-govyadinoy',
    name: 'Борщ с говядиной',
    meal: 'обед',
    portions: 6,
    per: { kcal: 258, protein: 20.6, fat: 9.7, carbs: 20.9 },
    items: [
      { food: 'говядина постная', grams: 500 },
      { food: 'свёкла', grams: 350 },
      { food: 'капуста белокочанная', grams: 300 },
      { food: 'картофель', grams: 300 },
      { food: 'морковь', grams: 150 },
      { food: 'лук репчатый', grams: 120 },
      { food: 'томатная паста', grams: 60 },
      { food: 'масло растительное', grams: 20 },
    ],
  },
  {
    id: 'schi-iz-svezhey-kapusty-s-kuricey',
    name: 'Щи из свежей капусты с курицей',
    meal: 'обед',
    portions: 4,
    per: { kcal: 237, protein: 27.1, fat: 4.9, carbs: 20.4 },
    items: [
      { food: 'куриная грудка', grams: 400 },
      { food: 'капуста белокочанная', grams: 400 },
      { food: 'картофель', grams: 250 },
      { food: 'морковь', grams: 120 },
      { food: 'лук репчатый', grams: 80 },
      { food: 'томатная паста', grams: 30 },
      { food: 'масло растительное', grams: 10 },
    ],
  },
  {
    id: 'ris-s-indeykoy-i-brokkoli',
    name: 'Рис с индейкой и брокколи',
    meal: 'обед',
    portions: 2,
    per: { kcal: 620, protein: 52.6, fat: 16.2, carbs: 67.5 },
    items: [
      { food: 'рис', grams: 150 },
      { food: 'индейка филе', grams: 400 },
      { food: 'брокколи', grams: 250 },
      { food: 'лук репчатый', grams: 60 },
      { food: 'масло растительное', grams: 15 },
    ],
  },
  {
    id: 'makarony-s-farshem-v-tomate',
    name: 'Макароны с фаршем в томате',
    meal: 'обед',
    portions: 2,
    per: { kcal: 631, protein: 37.7, fat: 21.1, carbs: 68.9 },
    items: [
      { food: 'макароны', grams: 160 },
      { food: 'фарш говяжий 10%', grams: 300 },
      { food: 'томатная паста', grams: 60 },
      { food: 'лук репчатый', grams: 80 },
      { food: 'морковь', grams: 80 },
      { food: 'масло растительное', grams: 10 },
    ],
  },
  {
    id: 'treska-zapechennaya-s-kartofelem',
    name: 'Треска запечённая с картофелем',
    meal: 'ужин',
    portions: 2,
    per: { kcal: 408, protein: 40.6, fat: 9.8, carbs: 38.7 },
    items: [
      { food: 'треска', grams: 400 },
      { food: 'картофель', grams: 400 },
      { food: 'морковь', grams: 100 },
      { food: 'лук репчатый', grams: 60 },
      { food: 'масло растительное', grams: 15 },
      { food: 'зелень', grams: 10 },
    ],
  },
  {
    id: 'tushenaya-kapusta-s-kuricey',
    name: 'Тушёная капуста с курицей',
    meal: 'ужин',
    portions: 3,
    per: { kcal: 319, protein: 40.4, fat: 8.3, carbs: 19.6 },
    items: [
      { food: 'капуста белокочанная', grams: 700 },
      { food: 'куриная грудка', grams: 450 },
      { food: 'морковь', grams: 120 },
      { food: 'лук репчатый', grams: 100 },
      { food: 'томатная паста', grams: 40 },
      { food: 'масло растительное', grams: 15 },
    ],
  },
  {
    id: 'plov-s-kuricey-oblegchennyy',
    name: 'Плов с курицей облегчённый',
    meal: 'обед',
    portions: 4,
    per: { kcal: 534, protein: 41.4, fat: 11.2, carbs: 67.4 },
    items: [
      { food: 'рис', grams: 300 },
      { food: 'куриная грудка', grams: 600 },
      { food: 'морковь', grams: 300 },
      { food: 'лук репчатый', grams: 150 },
      { food: 'масло растительное', grams: 30 },
    ],
  },
  {
    id: 'kurinye-kotlety-parovye-s-grechkoy',
    name: 'Куриные котлеты паровые с гречкой',
    meal: 'обед',
    portions: 3,
    per: { kcal: 477, protein: 37.5, fat: 16.3, carbs: 46.8 },
    items: [
      { food: 'фарш куриный', grams: 450 },
      { food: 'яйцо', grams: 55 },
      { food: 'лук репчатый', grams: 80 },
      { food: 'панировочные сухари', grams: 30 },
      { food: 'гречка', grams: 180 },
    ],
  },
  {
    id: 'rybnye-kotlety-iz-mintaya-s-risom',
    name: 'Рыбные котлеты из минтая с рисом',
    meal: 'ужин',
    portions: 3,
    per: { kcal: 457, protein: 34.9, fat: 9.3, carbs: 58.7 },
    items: [
      { food: 'минтай', grams: 500 },
      { food: 'яйцо', grams: 55 },
      { food: 'лук репчатый', grams: 80 },
      { food: 'панировочные сухари', grams: 40 },
      { food: 'рис', grams: 180 },
      { food: 'масло растительное', grams: 15 },
    ],
  },
  {
    id: 'perlovka-s-gribami-i-lukom',
    name: 'Перловка с грибами и луком',
    meal: 'ужин',
    portions: 2,
    per: { kcal: 368, protein: 14.1, fat: 9.9, carbs: 59.5 },
    items: [
      { food: 'перловка', grams: 150 },
      { food: 'шампиньоны', grams: 300 },
      { food: 'лук репчатый', grams: 100 },
      { food: 'масло растительное', grams: 15 },
    ],
  },
  {
    id: 'chechevichnyy-sup',
    name: 'Чечевичный суп',
    meal: 'обед',
    portions: 4,
    per: { kcal: 252, protein: 14.3, fat: 4.8, carbs: 37.8 },
    items: [
      { food: 'чечевица', grams: 200 },
      { food: 'морковь', grams: 150 },
      { food: 'лук репчатый', grams: 100 },
      { food: 'картофель', grams: 200 },
      { food: 'томатная паста', grams: 40 },
      { food: 'масло растительное', grams: 15 },
    ],
  },
  {
    id: 'ovoschnoe-ragu-s-indeykoy',
    name: 'Овощное рагу с индейкой',
    meal: 'ужин',
    portions: 3,
    per: { kcal: 317, protein: 35.1, fat: 12.8, carbs: 15.0 },
    items: [
      { food: 'индейка филе', grams: 450 },
      { food: 'кабачок', grams: 400 },
      { food: 'перец болгарский', grams: 200 },
      { food: 'помидор', grams: 200 },
      { food: 'лук репчатый', grams: 100 },
      { food: 'масло растительное', grams: 20 },
    ],
  },
  {
    id: 'kartofelnaya-zapekanka-s-farshem',
    name: 'Картофельная запеканка с фаршем',
    meal: 'ужин',
    portions: 4,
    per: { kcal: 450, protein: 30.4, fat: 19.3, carbs: 37.1 },
    items: [
      { food: 'картофель', grams: 800 },
      { food: 'фарш говяжий 10%', grams: 400 },
      { food: 'лук репчатый', grams: 120 },
      { food: 'молоко 2.5%', grams: 150 },
      { food: 'яйцо', grams: 110 },
      { food: 'сыр твёрдый', grams: 60 },
    ],
  },
  {
    id: 'gulyash-iz-govyadiny-s-pyure',
    name: 'Гуляш из говядины с пюре',
    meal: 'обед',
    portions: 3,
    per: { kcal: 488, protein: 37.1, fat: 17.5, carbs: 43.4 },
    items: [
      { food: 'говядина постная', grams: 450 },
      { food: 'картофель', grams: 600 },
      { food: 'лук репчатый', grams: 120 },
      { food: 'морковь', grams: 120 },
      { food: 'томатная паста', grams: 50 },
      { food: 'молоко 2.5%', grams: 100 },
      { food: 'масло растительное', grams: 15 },
    ],
  },
  {
    id: 'gorbusha-zapechennaya-s-ovoschami',
    name: 'Горбуша запечённая с овощами',
    meal: 'ужин',
    portions: 2,
    per: { kcal: 381, protein: 38.0, fat: 19.6, carbs: 12.5 },
    items: [
      { food: 'горбуша', grams: 350 },
      { food: 'кабачок', grams: 300 },
      { food: 'помидор', grams: 150 },
      { food: 'лук репчатый', grams: 60 },
      { food: 'масло растительное', grams: 15 },
      { food: 'зелень', grams: 10 },
    ],
  },
  {
    id: 'omlet-s-shampinonami-i-syrom',
    name: 'Омлет с шампиньонами и сыром',
    meal: 'ужин',
    portions: 1,
    per: { kcal: 451, protein: 33.3, fat: 32.9, carbs: 3.7 },
    items: [
      { food: 'яйцо', grams: 165 },
      { food: 'шампиньоны', grams: 120 },
      { food: 'сыр твёрдый', grams: 25 },
      { food: 'молоко 2.5%', grams: 50 },
      { food: 'масло растительное', grams: 5 },
    ],
  },
  {
    id: 'salat-s-tuncom-i-yaycom',
    name: 'Салат с тунцом и яйцом',
    meal: 'ужин',
    portions: 1,
    per: { kcal: 330, protein: 37.2, fat: 17.5, carbs: 7.5 },
    items: [
      { food: 'тунец консервированный', grams: 120 },
      { food: 'яйцо', grams: 55 },
      { food: 'огурец', grams: 100 },
      { food: 'помидор', grams: 100 },
      { food: 'зелень', grams: 10 },
      { food: 'масло растительное', grams: 10 },
    ],
  },
  {
    id: 'salat-s-kuricey-i-kapustoy',
    name: 'Салат с курицей и капустой',
    meal: 'ужин',
    portions: 1,
    per: { kcal: 332, protein: 38.8, fat: 13.1, carbs: 13.9 },
    items: [
      { food: 'куриная грудка', grams: 150 },
      { food: 'капуста белокочанная', grams: 150 },
      { food: 'огурец', grams: 100 },
      { food: 'морковь', grams: 50 },
      { food: 'масло растительное', grams: 10 },
    ],
  },
  {
    id: 'fasol-s-ovoschami-i-zelenyu',
    name: 'Фасоль с овощами и зеленью',
    meal: 'ужин',
    portions: 2,
    per: { kcal: 322, protein: 15.8, fat: 8.4, carbs: 46.0 },
    items: [
      { food: 'фасоль консервированная', grams: 400 },
      { food: 'помидор', grams: 200 },
      { food: 'лук репчатый', grams: 80 },
      { food: 'перец болгарский', grams: 150 },
      { food: 'масло растительное', grams: 15 },
    ],
  },
  {
    id: 'tvorog-s-kefirom-i-otrubyami',
    name: 'Творог с кефиром и отрубями',
    meal: 'перекус',
    portions: 1,
    per: { kcal: 231, protein: 32.5, fat: 5.0, carbs: 12.5 },
    items: [
      { food: 'творог 2%', grams: 150 },
      { food: 'кефир 1%', grams: 100 },
      { food: 'отруби овсяные', grams: 15 },
    ],
  },
  {
    id: 'hlebcy-s-tvorozhnym-syrom-i-ogurcom',
    name: 'Хлебцы с творожным сыром и огурцом',
    meal: 'перекус',
    portions: 1,
    per: { kcal: 201, protein: 6.0, fat: 9.8, carbs: 21.6 },
    items: [
      { food: 'хлебцы цельнозерновые', grams: 30 },
      { food: 'творожный сыр', grams: 40 },
      { food: 'огурец', grams: 80 },
    ],
  },
  {
    id: 'smuzi-iz-kefira-s-bananom',
    name: 'Смузи из кефира с бананом',
    meal: 'перекус',
    portions: 1,
    per: { kcal: 239, protein: 11.0, fat: 3.4, carbs: 38.6 },
    items: [
      { food: 'кефир 1%', grams: 250 },
      { food: 'банан', grams: 120 },
      { food: 'отруби овсяные', grams: 10 },
    ],
  },
];
