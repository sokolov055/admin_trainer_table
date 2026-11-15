/** FT-570: идентификаторы совпадают с областями фигуры. Копия — server/src/lib/muscle-regions.js: правите здесь — перенесите туда. */
export const LABELS = {
  chest: 'Грудь',
  serratus: 'Зубчатая',
  'front-deltoids': 'Передняя дельта',
  'side-deltoids': 'Средняя дельта',
  'back-deltoids': 'Задняя дельта',
  'rotator-cuff': 'Ротаторы плеча',
  biceps: 'Бицепс',
  triceps: 'Трицепс',
  forearms: 'Предплечья',
  abs: 'Пресс',
  obliques: 'Косые мышцы живота',
  trapezius: 'Трапеция',
  lats: 'Широчайшие',
  'lower-back': 'Поясница',
  glutes: 'Ягодицы',
  'hip-flexors': 'Сгибатели бедра',
  quadriceps: 'Квадрицепс',
  hamstrings: 'Бицепс бедра',
  adductors: 'Приводящие бедра',
  abductors: 'Отводящие бедра',
  calves: 'Икры',
};

export const GROUP_REGIONS = {
  'Грудь': ['chest'], 'Спина': ['lats', 'trapezius', 'lower-back'],
  'Ноги': ['quadriceps', 'hamstrings', 'adductors', 'abductors', 'calves'],
  'Ягодицы': ['glutes'], 'Плечи': ['front-deltoids', 'side-deltoids', 'back-deltoids'],
  'Руки': ['biceps', 'triceps'], 'Предплечье': ['forearms'], 'Пресс': ['abs', 'obliques'],
  'Всё тело': Object.keys(LABELS), 'Кардио': [],
};
export function musclesForGroup(group) { return { primary: [...(GROUP_REGIONS[group] || [])], secondary: [] }; }
