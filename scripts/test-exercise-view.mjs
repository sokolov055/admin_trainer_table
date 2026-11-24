import test from 'node:test';
import assert from 'node:assert/strict';
import { linesOf, machinesWord, cardFacts, showSetup, commonNotice, removeLabel } from '../src/trainer/exercise-view-model.js';

test('шаги и ошибки — строки без пустых и пробелов по краям', () => {
  assert.deepEqual(linesOf('  Лечь на скамью \n\n Выжать вверх  \n'), ['Лечь на скамью', 'Выжать вверх']);
  assert.deepEqual(linesOf(null), []);
});

test('подпись к числу тренажёров: 1 / 2–4 / 5 и числа 11–14', () => {
  assert.equal(machinesWord(1), 'тренажёр');
  assert.equal(machinesWord(3), 'тренажёра');
  assert.equal(machinesWord(5), 'тренажёров');
  assert.equal(machinesWord(12), 'тренажёров');
  assert.equal(machinesWord(21), 'тренажёр');
});

test('три факта: с тренажёром — число, без — инвентарь или прочерк', () => {
  const withMachine = cardFacts({ muscle: 'Грудь', equipment: 'Штанга', machines: [{}, {}], track: { kind: 'strength' } });
  assert.deepEqual(withMachine[2], { value: '2', label: 'тренажёра' });
  assert.equal(withMachine[1].value, 'Грудь');
  const free = cardFacts({ muscle: '', equipment: 'Гири', machines: [], track: { kind: 'strength' } });
  assert.deepEqual(free[2], { value: 'Гири', label: 'инвентарь' });
  assert.equal(free[1].value, 'Без группы');
  assert.equal(cardFacts({ machines: [] })[2].value, '—');
});

test('подготовка клиенту только без тренажёра — правило из программы не меняется', () => {
  assert.equal(showSetup({ setup: 'Сиденье', machines: [] }), true);
  assert.equal(showSetup({ setup: 'Сиденье', machines: [{}] }), false);
  assert.equal(showSetup({ setup: '   ', machines: [] }), false);
});

test('общее упражнение объясняет, что создаст правка; своё — без пояснения', () => {
  assert.match(commonNotice({ mine: false }), /создаст вашу версию/);
  assert.equal(commonNotice({ mine: true }), '');
});

test('нижнее «⋯»: своё удаляется, общее убирается у себя', () => {
  assert.equal(removeLabel({ mine: true }), 'Удалить');
  assert.equal(removeLabel({ mine: false }), 'Убрать у себя');
});
