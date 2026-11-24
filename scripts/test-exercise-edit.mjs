import test from 'node:test';
import assert from 'node:assert/strict';
import { draftOf, changesOf, problemOf, savePlan, moveItem, removeItem, trackPayload } from '../src/trainer/exercise-edit-model.js';

const common = {
  id: 1, name: 'Жим штанги лёжа', shortName: 'Жим лёжа', muscle: 'Грудь', equipment: 'Штанга', common: true, mine: false,
  notes: 'Лягте на скамью\nОпустите штангу\n', mistakes: 'Отрыв таза', setup: 'Сиденье', setupOk: true,
  machines: [], track: { kind: 'strength', auto: true }, media: { kind: 'link', url: 'https://example.test/v' }, musclesCustom: false,
};
const own = { ...common, id: 2, mine: true, common: false };

test('без правок ничего не меняется и на сервер ничего не уходит', () => {
  const d = draftOf(common);
  assert.deepEqual(changesOf(common, d), {});
  assert.deepEqual(savePlan(common, d, { directSetup: false }), { main: null, setup: null });
});

test('шаги: пустые строки и пробелы по краям не считаются изменением', () => {
  const d = { ...draftOf(common), steps: ['Лягте на скамью ', 'Опустите штангу', ''] };
  assert.deepEqual(changesOf(common, d), {});
  const e = { ...draftOf(common), steps: ['Лягте', 'Опустите штангу', 'Выжмите'] };
  assert.deepEqual(Object.keys(changesOf(common, e)), ['notes']);
});

test('сохранение шлёт название, группу и технику всегда, остальное — только изменённое', () => {
  const d = { ...draftOf(common), shortName: 'Жим' };
  const { main, setup } = savePlan(common, d, { directSetup: false });
  assert.equal(setup, null);
  assert.deepEqual(main, { id: 1, name: 'Жим штанги лёжа', muscle: 'Грудь', notes: 'Лягте на скамью\nОпустите штангу', shortName: 'Жим' });
});

test('общее без своих прав: подготовка уходит в сохранение, которое создаст версию', () => {
  const d = { ...draftOf(common), setup: 'Сиденье — рукояти на уровне груди', setupOk: true };
  const { main, setup } = savePlan(common, d, { directSetup: false });
  assert.equal(setup, null);
  assert.equal(main.setup, 'Сиденье — рукояти на уровне груди');
  assert.equal(main.setupOk, true);
});

test('свои и общее при прямых правах владельца: подготовка пишется напрямую, без версии', () => {
  const d = { ...draftOf(own), setup: 'Фиксируйте ноги', setupOk: true };
  const { main, setup } = savePlan(own, d, { directSetup: true });
  assert.deepEqual(setup, { id: 2, setup: 'Фиксируйте ноги', ok: true });
  assert.equal(main, null);
});

test('тип учёта: «авто» — только флаг; явные поля и порядок не зависят от того, как выбрали', () => {
  assert.deepEqual(trackPayload({ kind: 'strength', auto: true }), { auto: true });
  assert.deepEqual(trackPayload({ kind: 'cardio', machine: 'bike', perSide: false, unilateral: true }), { kind: 'cardio', weightMode: undefined, machine: 'bike', unilateral: true, perSide: false });
  assert.deepEqual(changesOf(common, { ...draftOf(common), track: { kind: 'strength', auto: true, perSide: false } }), {});
});

test('мышцы: своя разметка — сравнивается по содержимому; сброс к группе — изменение', () => {
  const custom = { ...common, musclesCustom: true, muscles: { primary: ['chest'], secondary: ['triceps'] } };
  assert.deepEqual(changesOf(custom, draftOf(custom)), {});
  assert.deepEqual(Object.keys(changesOf(custom, { ...draftOf(custom), map: null })), ['muscles']);
});

test('проверки: название от двух знаков, длина техники и ошибок', () => {
  assert.equal(problemOf({ ...draftOf(common), name: ' Ж ' }), 'Название — хотя бы два знака.');
  assert.equal(problemOf(draftOf(common)), '');
  assert.match(problemOf({ ...draftOf(common), steps: ['x'.repeat(2001)] }), /2000/);
  assert.match(problemOf({ ...draftOf(common), mistakes: ['x'.repeat(1501)] }), /1500/);
});

test('порядок шагов и удаление: края не выходят за список, исходный список не меняется', () => {
  const list = ['а', 'б', 'в'];
  assert.deepEqual(moveItem(list, 0, -1), list);
  assert.deepEqual(moveItem(list, 2, 1), list);
  assert.deepEqual(moveItem(list, 1, -1), ['б', 'а', 'в']);
  assert.deepEqual(removeItem(list, 1), ['а', 'в']);
  assert.deepEqual(list, ['а', 'б', 'в']);
});

test('подготовка без публикации (setup_ok=0) — несохранённое: её надо опубликовать без правки текста', () => {
  const draft = { ...common, setup: 'Сиденье — рукояти на уровне груди', setupOk: false };
  const d = draftOf(draft);
  assert.deepEqual(Object.keys(changesOf(draft, d)), ['setup']);
  const { main, setup } = savePlan(draft, d, { directSetup: true });
  assert.deepEqual(setup, { id: 1, setup: 'Сиденье — рукояти на уровне груди', ok: true });
  assert.equal(main, null);
});

test('опубликованная подготовка без правок — не изменение; пустая без публикации — тоже', () => {
  const published = { ...common, setup: 'Сиденье', setupOk: true };
  assert.deepEqual(changesOf(published, draftOf(published)), {});
  assert.deepEqual(changesOf({ ...common, setup: '', setupOk: false }, draftOf({ ...common, setup: '', setupOk: false })), {});
});

test('упражнение с тренажёром: подготовка не редактируется и не публикуется — несохранённого нет', () => {
  const machined = { ...common, machines: [{ id: 1 }], setup: 'Сиденье', setupOk: false };
  assert.deepEqual(changesOf(machined, draftOf(machined)), {});
  const { main, setup } = savePlan(machined, draftOf(machined), { directSetup: false });
  assert.deepEqual({ main, setup }, { main: null, setup: null });
});
