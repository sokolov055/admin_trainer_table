import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { build } from 'esbuild';
import React from 'react';
import renderer, { act } from 'react-test-renderer';

/**
 * «Это то же упражнение, переименованное?» (владелец, 16.10.2026): тренер
 * заменил в программе клиента упражнение, которое тот уже делал, — вопрос,
 * перенос истории этого клиента и отмена тут же.
 */

const calls = [];
globalThis.__api = async (action, params) => {
  calls.push([action, params]);
  if (action === 'client.exercise.history.move') return { moveId: 7, sessions: 3, exercises: 3, notes: 1, to: { id: params.toId, name: 'Жим штанги на грудь' } };
  if (action === 'client.exercise.history.undo') return { restored: 3, kept: 0 };
  throw new Error('нет ' + action);
};
const output = await build({ entryPoints: ['src/trainer/HistoryMove.jsx'], bundle: true, write: false,
  format: 'cjs', platform: 'node', external: ['react'],
  plugins: [{ name: 'test-api', setup(b) {
    b.onResolve({ filter: /\/(api|telegram)\.js$/ }, (args) => ({ path: args.path, namespace: 'test' }));
    b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const apiMutate=(...a)=>globalThis.__api(...a); export const haptic=()=>{};' }));
  } }] });
const mod = { exports: {} };
vm.runInThisContext('(function(require,module,exports){' + output.outputFiles[0].text + '\n})')(createRequire(import.meta.url), mod, mod.exports);
const HistoryMove = mod.exports.default;
const { hadHistory } = mod.exports;

const text = (node) => (typeof node === 'string' ? node : (node.children || []).map(text).join(''));
const delay = () => new Promise((r) => setTimeout(r, 10));

test('спрашиваем только про упражнение с историей клиента', () => {
  assert.equal(hadHistory({ name: 'Жим лёжа' }), false);
  assert.equal(hadHistory({ name: 'Жим лёжа', prevWeight: '70' }), true);
  assert.equal(hadHistory({ name: 'Жим лёжа', lastRun: { date: '2026-10-01' } }), true);
});

test('вопрос → перенос → «Отменить» → отменён', async () => {
  let closed = 0;
  let tree;
  await act(async () => {
    tree = renderer.create(React.createElement(HistoryMove, {
      clientRow: 3, from: { id: 11, name: 'Жим лёжа' }, to: { id: 12, name: 'Жим штанги на грудь' }, onClose: () => { closed += 1; },
    }));
  });
  const button = (label) => tree.root.findAllByType('button').find((b) => text(b) === label);
  assert.match(text(tree.root.findAllByType('p')[0]), /уже делал «Жим лёжа»/);
  assert.ok(tree.root.findAllByType('p').some((p) => /У других клиентов ничего не поменяется/.test(text(p))));

  await act(async () => { button('Да, перенести силовые').props.onClick(); await delay(); });
  assert.deepEqual(calls[0], ['client.exercise.history.move', { clientRow: 3, fromId: 11, fromName: 'Жим лёжа', toId: 12 }]);
  assert.match(text(tree.root.findAllByType('p')[0]), /Перенесено на «Жим штанги на грудь»: 3 занятия и настройка/);

  await act(async () => { button('Отменить').props.onClick(); await delay(); });
  assert.deepEqual(calls[1], ['client.exercise.history.undo', { clientRow: 3, moveId: 7 }]);
  assert.match(text(tree.root.findAllByType('p')[0]), /Перенос отменён/);
  await act(async () => { button('Закрыть').props.onClick(); });
  assert.equal(closed, 1);
  tree.unmount();
});
