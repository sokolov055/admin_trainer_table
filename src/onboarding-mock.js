// Только демо-сборка: ответы переживают перезагрузку для проверки прерывания.
const KEY = 'fittrack_demo_onboarding';
const load = () => JSON.parse(localStorage.getItem(KEY) || '{"step":0,"answers":{},"revision":0,"consentNeeded":true}');
const store = (r) => localStorage.setItem(KEY, JSON.stringify(r));
const enabled = () => new URLSearchParams(location.search).get('mockOnboarding') === '1'
  && localStorage.getItem('fittrack_demo_onboarding_off') !== '1';
const programs = [
  { id: 1, title: 'Старт в зале', description: 'Базовые движения всего тела, по три подхода', blocks: [
    { title: 'Занятие А', exercises: [{ name: 'Жим ногами', sets: '3', reps: '12' }, { name: 'Тяга верхнего блока', sets: '3', reps: '12' }, { name: 'Жим гантелей лёжа', sets: '3', reps: '10' }] },
    { title: 'Занятие Б', exercises: [{ name: 'Гоблет-присед', sets: '3', reps: '10' }, { name: 'Тяга гантели в наклоне', sets: '3', reps: '10' }] }] },
  { id: 2, title: 'Сила: основа', description: 'Присед, жим и тяга с постепенной прибавкой', blocks: [
    { title: 'Занятие', exercises: [{ name: 'Присед со штангой', sets: '4', reps: '6' }, { name: 'Жим лёжа', sets: '4', reps: '6' }] }] },
  { id: 3, title: 'Кардио и тонус', description: 'Круговые тренировки и интервалы', blocks: [
    { title: 'Круг', exercises: [{ name: 'Выпады', sets: '3', reps: '12' }, { name: 'Отжимания', sets: '3', reps: '10' }] }] },
];
// Мышцы для карты на карточке программы — как их отдаёт сервер
const M = {
  'Жим ногами': [['quadriceps', 'glutes'], ['hamstrings']], 'Тяга верхнего блока': [['lats'], ['biceps', 'back-deltoids']],
  'Жим гантелей лёжа': [['chest'], ['triceps', 'front-deltoids']], 'Гоблет-присед': [['quadriceps', 'glutes'], ['abs']],
  'Тяга гантели в наклоне': [['lats'], ['biceps', 'trapezius']], 'Присед со штангой': [['quadriceps', 'glutes'], ['lower-back']],
  'Жим лёжа': [['chest'], ['triceps', 'front-deltoids']], 'Выпады': [['quadriceps', 'glutes'], ['hamstrings']],
  'Отжимания': [['chest'], ['triceps']],
};
programs.forEach((p) => p.blocks.forEach((b) => b.exercises.forEach((e) => {
  const m = M[e.name] || [[], []];
  e.muscles = { primary: m[0], secondary: m[1] };
})));
// Шаблон на месяц: одни и те же занятия по кругу — карточка показывает их один раз
programs[0].blocks = [...programs[0].blocks, ...programs[0].blocks.map((b) => ({ ...b }))];
const NUTRITION_GOAL = { lose: 'lose', fitness: 'keep', strength: 'keep', muscle: 'gain' };
const GOAL_LABELS = { lose: 'Похудеть', fitness: 'Быть в форме', strength: 'Стать сильнее', muscle: 'Набрать мышцы' };
const NUT_LABELS = { lose: 'Похудение', keep: 'Поддержание формы', gain: 'Набор мышечной массы' };
const complete = (a) => ['goal', 'experience', 'place', 'days'].every((k) => a[k] !== undefined);
const ageOf = (a) => (a.birth ? Math.floor((Date.now() - new Date(a.birth + 'T12:00:00Z')) / (365.25 * 86400000)) : a.age);
const body = (a) => ['sex', 'height', 'weight'].every((k) => a[k] !== undefined) && !!ageOf(a);

/** Норма — той же демо-формулой, что анкета питания (mockCompute в mock.js) */
function norm(a, compute) {
  if (!body(a)) return null;
  const goal = NUTRITION_GOAL[a.goal] || 'keep';
  const calc = compute({ age: ageOf(a), height: a.height, weight: a.weight, sex: a.sex, lifestyle: a.lifestyle || 'desk', trainings: a.days || 0, goal, pace: a.pace });
  const out = { bmr: calc.bmr, age: ageOf(a), height: a.height, weight: a.weight, paces: [] };
  if (!a.lifestyle || !a.goal) return out;
  return { ...out, ready: true, goal, goalLabel: NUT_LABELS[goal], tdee: calc.tdee, pace: calc.pace, paceLabel: calc.paceLabel,
    kcal: calc.kcal, protein: calc.protein, fat: calc.fat, carbs: calc.carbs };
}

export function onboardingMock(action, p, compute) {
  const saved = load();
  if (action === 'owner.onboarding.get') return { enabled: enabled(), emergencyOff: false, catalog: [], templates: programs };
  if (action === 'owner.onboarding.save') {
    localStorage.setItem('fittrack_demo_onboarding_off', p.enabled ? '0' : '1');
    return { enabled: enabled(), emergencyOff: false, catalog: p.catalog || [], templates: programs };
  }
  if (!enabled()) {
    if (action === 'client.onboarding.get') return { enabled: false, eligible: false };
    throw new Error('Анкета отключена. Вернитесь в приложение.');
  }
  if (action === 'client.onboarding.consent') { saved.consentNeeded = false; store(saved); }
  if (action === 'client.onboarding.save') {
    if (p.revision !== saved.revision) throw new Error('Ответы изменились на другом устройстве.');
    Object.assign(saved, { answers: p.answers, step: p.step, revision: saved.revision + 1 }); store(saved);
  }
  if (action === 'client.onboarding.choose') {
    const picked = programs.find((r) => r.id === p.templateId);
    const n = norm(saved.answers, compute);
    Object.assign(saved, { completed: true, selectedTitle: picked.title, revision: saved.revision + 1 }); store(saved);
    return { completed: true, selectedTitle: picked.title, days: saved.answers.days, goal: saved.answers.goal,
      norm: n && n.ready ? { kcal: n.kcal, protein: n.protein, fat: n.fat, carbs: n.carbs, goalLabel: n.goalLabel, paceLabel: n.paceLabel } : null };
  }
  return { enabled: true, eligible: !saved.completed, ...saved,
    programs: complete(saved.answers) ? programs.map((r) => ({ ...r, days: saved.answers.days })) : [],
    norm: norm(saved.answers, compute), prefill: { sex: null, birth: null, age: null, height: null, weight: null, lifestyle: null } };
}

/** Цель для разделов в демо: из пройденной анкеты, иначе из анкеты питания */
export function focusMock(nutrition, compute) {
  const s = load();
  let goal = s.completed ? s.answers.goal : null;
  if (!goal && nutrition) goal = { lose: 'lose', keep: 'fitness', gain: 'muscle' }[nutrition.survey.goal] || null;
  const n = s.completed ? norm(s.answers, compute) : null;
  const kcal = nutrition ? nutrition.targets : n && n.ready ? n : null;
  return { goal, goalLabel: goal ? GOAL_LABELS[goal] : '', source: s.completed ? 'onboarding' : 'nutrition',
    week: s.completed ? s.answers.days : 2, program: s.completed ? s.selectedTitle : '',
    norm: kcal ? { kcal: kcal.kcal, protein: kcal.protein, fat: kcal.fat, carbs: kcal.carbs } : null };
}

// Первые шаги (FT-561/FT-510) в демо — только с ?mockFirstSteps=1, чтобы
// подсказка не перекрывала остальные демо-сценарии. День в режиме в демо
// засчитывается сразу после подсказки: журнала с датами здесь нет.
const FS_KEY = 'fittrack_demo_first_steps';
export function firstStepsMock(action, p) {
  // Флаг запоминается: приложение убирает лишнее из адреса при запуске
  if (new URLSearchParams(location.search).get('mockFirstSteps') === '1') sessionStorage.setItem('mockFirstSteps', '1');
  if (sessionStorage.getItem('mockFirstSteps') !== '1') return { hint: null, tour: false, action: null, regime: null, notify: false };
  const s = JSON.parse(localStorage.getItem(FS_KEY) || '{}');
  if (action === 'client.firstSteps.hint' && !s.hint) s.hint = p.result;
  if (action === 'client.firstSteps.regimeSeen') s.regime = true;
  if (action === 'client.firstSteps.notify' && !s.notify) s.notify = p.result;
  localStorage.setItem(FS_KEY, JSON.stringify(s));
  const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const today = (new Date().getDay() + 6) % 7;
  return {
    hint: s.hint ? null : 'workout',
    tour: !s.hint,
    action: s.hint ? null : 'workout',
    regime: s.hint && !s.regime ? { count: 1, week: days.map((label, i) => ({ day: 'd' + i, label, on: i === today, today: i === today })) } : null,
    notify: !!s.hint && !s.notify,
  };
}
