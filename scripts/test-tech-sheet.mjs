// Лист упражнения (TechSheet, 15.11.2026): разбор текстов базы — главное и
// пояснение шага, ошибки метками, тренажёр второй вкладкой, «Сейчас» в занятии
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitStep, mistakeChips, setupRows, techModel, workoutPlan, workoutLast, workoutNow } from '../src/tech-sheet-model.js';

test('шаг делится по «;» на главное и пояснение, без точки в конце', () => {
  assert.deepEqual(splitStep('1. Грудь у опоры, корпус неподвижен; руки на уровне плеч, локти слегка согнуты.'),
    { main: 'Грудь у опоры, корпус неподвижен', rest: 'руки на уровне плеч, локти слегка согнуты' });
  assert.deepEqual(splitStep('Выжимайте вверх.'), { main: 'Выжимайте вверх', rest: '' });
});

test('ошибки — короткими метками по запятым и «или», без повторов', () => {
  assert.deepEqual(mistakeChips(['Ошибка: раскачивать корпус, сильно сгибать локти, пожимать плечами или уводить руки слишком далеко назад.', 'Раскачивать корпус']),
    ['раскачивать корпус', 'сильно сгибать локти', 'пожимать плечами', 'уводить руки слишком далеко назад']);
  assert.deepEqual(mistakeChips(['Не раскачивайтесь.']), ['не раскачивайтесь']);
});

test('настройка — «что — как» двумя столбцами', () => {
  assert.deepEqual(setupRows(['Сиденье — рукояти на уровне плеч.', 'Плавно возвращайте рукояти вперёд']),
    [{ label: 'Сиденье', text: 'рукояти на уровне плеч' }, { label: '', text: 'Плавно возвращайте рукояти вперёд' }]);
});

test('модель: «Коротко» заголовком, тренажёр вкладкой, общий принцип — у основного, ошибки принципа — в «Не делайте»', () => {
  const card = {
    name: 'Обратное разведение рук в тренажёре «Пек-дек»', shortName: 'Пек-дек на заднюю', noteKey: 'e:пек',
    notes: 'Грудь у опоры; руки на уровне плеч\nРазводите рукояти до линии плеч', mistakes: '',
    setup: 'Сиденье — рукояти на уровне плеч.\nОшибка: раскачивать корпус, пожимать плечами.',
    machines: [{ uid: 'pd1', name: 'Пек-дек', photo: '/m/1.jpg', setup: 'Спинка — по росту.' }],
    muscles: { primary: ['rear-deltoids'], secondary: [] }, media: { kind: 'animation', url: 'Reverse_Fly' },
    alternatives: [{ id: 2, name: 'Махи в наклоне' }],
  };
  const m = techModel({ name: card.name, card, notes: { 'm:pd1|пек': { text: 'Сиденье 4', by: 'trainer' } }, targetOf: (uid) => 'm:' + uid + '|пек' });
  assert.equal(m.title, 'Пек-дек на заднюю');
  assert.equal(m.full, card.name);
  assert.equal(m.tab, 'Тренажёр');
  assert.deepEqual(m.steps.map((s) => s.main), ['Грудь у опоры', 'Разводите рукояти до линии плеч']);
  assert.deepEqual(m.avoid, ['раскачивать корпус', 'пожимать плечами']);
  assert.deepEqual(m.machines[0].setup.map((r) => r.label), ['Спинка', 'Сиденье'], 'регулировки тренажёра, потом общий принцип');
  assert.deepEqual(m.machines[0].note, { text: 'Сиденье 4', by: 'trainer' });
  assert.deepEqual(m.alternatives, [{ id: 2, name: 'Махи в наклоне' }]);
  assert.equal(m.photo, '/m/1.jpg');
});

test('без тренажёра и без своей техники подготовка становится шагами; без названия «Коротко» — полное', () => {
  const m = techModel({ name: 'Планка', card: { setup: 'Локти под плечами.\nКорпус прямой.', noteKey: 'e:планка' }, notes: { 'e:планка': 'на коврике' } });
  assert.equal(m.title, 'Планка');
  assert.equal(m.full, '');
  assert.equal(m.tab, '');
  assert.deepEqual(m.steps.map((s) => s.main), ['Локти под плечами', 'Корпус прямой']);
  assert.deepEqual(m.note, { text: 'на коврике' });
  const p = techModel({ name: 'Отжимания', card: { notes: 'Спина прямая', setup: 'Ладони — шире плеч.' } });
  assert.equal(p.tab, 'Подготовка');
  assert.deepEqual(p.prep, [{ label: 'Ладони', text: 'шире плеч' }]);
});

test('в занятии: план, прошлый раз и «Сейчас · подход N из M»', () => {
  const sets = [{ kind: 'warmup', weight: '10', reps: '10', state: 'done' }, { weight: '20', reps: '15', state: 'done' }, { weight: '20', reps: '15', state: 'pending' }, { weight: '22.5', reps: '15', state: 'pending' }];
  assert.equal(workoutPlan(sets), '3 × 15');
  assert.deepEqual(workoutNow(sets), { set: 2, of: 3, value: '20 кг × 15' });
  assert.equal(workoutNow(sets.map((s) => ({ ...s, state: 'done' }))), null);
  assert.equal(workoutLast({ lastRun: { weights: ['17.5', '20', '20'] } }), '20 кг');
  assert.equal(workoutLast({ prevWeight: '12,5' }), '12,5 кг');
  assert.equal(workoutLast({}), '');
});
