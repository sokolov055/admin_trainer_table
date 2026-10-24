import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { totalEntries, withPending, DIARY_MEALS, today, mealNow, dayVerdict } from '../src/nutrition/diary-model.js';
import { palmSnapshot, palmNorm, palmUnit, palmCount } from '../src/nutrition/palm-model.js';

const food = { kind: 'food', id: 1, name: 'Йогурт', kcal: 70, protein: 8, fat: 2, carbs: 5, unit: 'g' };
test('КБЖУ: граммы и порции используют разные базы расчёта', () => {
  const t = totalEntries([{ product: food, amount: 150 }, { product: { ...food, unit: 'portion', kcal: 400 }, amount: .5 }]);
  assert.equal(t.kcal, 305);
});
test('очередь не удваивает подтверждённое; чужой день не подмешивается', () => {
  const day = { day: '2026-10-17', entries: [{ requestId: 'one', product: food, amount: 100 }], complete: true };
  const writes = [
    { kind: 'diaryEntry', params: { requestId: 'one', day: day.day, preview: food, amount: 100 } },
    { kind: 'diaryEntry', params: { requestId: 'two', day: day.day, preview: food, amount: 50 }, error: 'Проверьте продукт' },
    { kind: 'diaryEntry', params: { requestId: 'other', day: '2026-10-18', preview: food, amount: 200 } },
  ];
  const result = withPending(day, writes);
  assert.equal(result.entries.length, 2);
  assert.equal(result.totals.kcal, 105);
  assert.equal(result.complete, false);
  assert.equal(result.entries[1].error, 'Проверьте продукт');
});

const stubs = {
  api: `export const apiPublic=(a,p)=>globalThis.__diary.read(a,p); export const apiStale=(a,p)=>({data:null,promise:globalThis.__diary.read(a,p)}); export const apiMutate=(a,p)=>globalThis.__diary.mutate(a,p);`,
  gestures: `export const useBackGesture=()=>{};`,
  offline: `export const localWrites=async()=>[]; export const onWritesChange=()=>()=>{}; export const queueWrite=async(k,p)=>{globalThis.__diary.queued.push({kind:k,params:p})}; export const isOffline=e=>e?.code===0; export const dropWrite=async()=>{};`,
  account: `export const offlineAccount=()=> 'unit-account';`,
  ui: `import React from 'react'; export const Section=({children})=><section>{children}</section>;export const Panel=({children})=><div>{children}</div>;export const Note=({children})=><aside>{children}</aside>;export const Loading=()=> <div>Загрузка</div>;export const Sheet=({title,children})=><section role="dialog"><h2>{title}</h2>{children}</section>;export const formatNumber=n=>String(n);export const Qty=({value,unit})=><span>{value}{unit?' '+unit:''}</span>;export const BackButton=({label,onClick})=><button aria-label={'Назад: '+label} onClick={onClick}>{label}</button>;export const Chips=({items,value,onChange,label})=><div role="tablist" aria-label={label}>{items.map(i=><button key={i.value} role="tab" aria-selected={i.value===value} onClick={()=>onChange(i.value)}>{i.label}</button>)}</div>;`,
  icons: `import React from 'react';const I=()=> <i/>; export const IconPlus=I,IconMinus=I,IconClose=I,IconHeart=I,IconCopy=I,IconTrash=I,IconChevron=I,IconNutrition=I,IconCheck=I;`,
  // Смахивание и «Вернуть» — свои модули с проверками; здесь удаление уходит сразу, чтобы видеть вызов сервера.
  SwipeRow: `import React from 'react'; export default ({children,onDelete,label,disabled})=><div data-swipe={label} data-disabled={disabled?'1':''}><button aria-label={label} onClick={onDelete}>x</button>{children}</div>;`,
  pendingDelete: `export const usePendingDelete=(commit,{onDone,onError}={})=>({remove:(id,payload)=>{globalThis.__diary.removed.push(id);Promise.resolve(commit(payload)).then(()=>onDone&&onDone(payload),e=>onError&&onError(e));},hidden:()=>false,bar:null,flush(){}});`,
};
// «+» нижнего меню: requestQuick — из той же сборки, что и дневник (одна очередь запросов)
const bundle = await build({ stdin: { contents: "export * from './src/nutrition/Diary.jsx'; export { default } from './src/nutrition/Diary.jsx'; export { requestQuick } from './src/quick-actions.js';", resolveDir: process.cwd(), loader: 'js' }, bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'], logLevel: 'silent', plugins: [{ name: 'diary-stubs', setup(b) {
  b.onResolve({ filter: /\/(api|gestures|ui|icons|offline-writes|offline-account|SwipeRow|pendingDelete)\.(js|jsx)$/ }, a => ({ path: ({ 'offline-writes': 'offline', 'offline-account': 'account' })[a.path.split('/').at(-1).split('.')[0]] || a.path.split('/').at(-1).split('.')[0], namespace: 'stub' }));
  b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({ contents: stubs[a.path], loader: 'jsx' }));
  b.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
} }] });
const module = { exports: {} };
vm.runInThisContext('(function(require,module,exports){' + bundle.outputFiles[0].text + '\n})')(createRequire(import.meta.url), module, module.exports);
const { useDiaryResource, DiaryEntryForm, default: NutritionDiary, requestQuick } = module.exports;
globalThis.window = { addEventListener() {}, removeEventListener() {} };
globalThis.document = { activeElement: null, addEventListener() {}, removeEventListener() {} };
globalThis.__diary = { queued: [], removed: [] };
test('поздний ответ прошлого дня не заменяет открытый день', async () => {
  const pending = new Map();
  __diary.read = (_a, p) => new Promise(resolve => pending.set(p.day, resolve));
  const Probe = ({ day }) => { const r = useDiaryResource('diary.get', { day }); return React.createElement('span', null, r.data?.day || 'loading'); };
  let tree;
  await act(async () => { tree = renderer.create(React.createElement(Probe, { day: '2026-10-16' })); });
  await act(async () => tree.update(React.createElement(Probe, { day: '2026-10-17' })));
  await act(async () => pending.get('2026-10-17')({ day: '2026-10-17' }));
  await act(async () => pending.get('2026-10-16')({ day: '2026-10-16' }));
  assert.equal(tree.toJSON().children[0], '2026-10-17');
  tree.unmount();
});
test('новая еда при потере ответа сохраняется в очереди с тем же requestId', async () => {
  let sent, saved;
  __diary.mutate = async (a, p) => { sent = { action: a, params: p }; throw Object.assign(new Error('Нет связи'), { code: 0 }); };
  __diary.queued = [];
  let tree;
  await act(async () => { tree = renderer.create(React.createElement(DiaryEntryForm, { product: food, day: '2026-10-17', meal: 'dinner', onClose() {}, onSaved: text => { saved = text; } })); });
  await act(async () => tree.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.equal(__diary.queued[0].params.requestId, sent.params.requestId);
  assert.equal(__diary.queued[0].params.meal, 'dinner');
  assert.equal(__diary.queued[0].params.preview.name, 'Йогурт');
  assert.ok(saved.includes('телефоне'));
  tree.unmount();
});
test('отказ сервера не маскируется как сохранение без сети', async () => {
  let saved = false;
  __diary.mutate = async () => { throw Object.assign(new Error('Конфликт записи'), { code: 409 }); };
  __diary.queued = [];
  let tree;
  await act(async () => { tree = renderer.create(React.createElement(DiaryEntryForm, { product: food, onClose() {}, onSaved() { saved = true; } })); });
  await act(async () => tree.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.equal(saved, false); assert.equal(__diary.queued.length, 0);
  assert.ok(JSON.stringify(tree.toJSON()).includes('Конфликт записи'));
  tree.unmount();
});
test('«Удалить запись» в форме не трогает сервер сам — отдаёт запись родителю (FT-642)', async () => {
  let removed = null, mutated = 0;
  __diary.mutate = async () => { mutated++; };
  const entry = { id: 7, revision: 2, day: '2026-10-17', meal: 'lunch', amount: 120, product: food };
  let tree;
  await act(async () => { tree = renderer.create(React.createElement(DiaryEntryForm, { entry, onClose() {}, onSaved() {}, onRemove: e => { removed = e; } })); });
  const buttons = tree.root.findAllByType('button').filter(b => Array.isArray(b.props.children) && b.props.children.includes(' Удалить запись'));
  assert.equal(buttons.length, 1);
  await act(async () => buttons[0].props.onClick());
  assert.equal(removed.id, 7); assert.equal(mutated, 0);
  tree.unmount();
});
test('дневник: четыре вкладки, смахивание строки удаляет запись с revision, «План меню» — кнопка в итоге', async () => {
  const calls = [];
  __diary.read = async (a, p) => a === 'diary.get' ? { day: p.day, entries: [{ id: 7, revision: 2, day: p.day, meal: 'lunch', amount: 120, product: food }], totals: totalEntries([{ product: food, amount: 120 }]), targets: { kcal: 2000, protein: 100, fat: 60, carbs: 250 }, complete: false, waterMl: 0, comment: '', revision: 1 } : { products: [] };
  __diary.mutate = async (a, p) => { calls.push([a, p]); return {}; };
  __diary.removed = [];
  let planned = null, tree;
  await act(async () => { tree = renderer.create(React.createElement(NutritionDiary, { onPlan: p => { planned = p; } })); });
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  const tabs = tree.root.findAllByProps({ role: 'tab' }).map(t => t.props.children);
  assert.deepEqual(tabs, ['Дневник', 'Неделя', 'Рецепты', 'Ещё']);
  const plan = tree.root.findAllByType('button').find(b => b.props.children === 'Что приготовить на остаток');
  assert.ok(plan && !plan.props.disabled);
  await act(async () => plan.props.onClick());
  assert.equal(planned.targets.kcal, 2000); assert.equal(planned.totals.kcal, 84);
  const swipe = tree.root.findAllByProps({ 'aria-label': 'Удалить: Йогурт' }).find(n => n.type === 'button');
  await act(async () => swipe.props.onClick());
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  assert.deepEqual(__diary.removed, [7]);
  assert.equal(calls[0][0], 'diary.entry.remove'); assert.equal(calls[0][1].id, 7); assert.equal(calls[0][1].revision, 2);
  tree.unmount();
});

// План трёх разборов: «Ладонь» и итог дня
test('«Ладонь»: норма в порциях из нормы КБЖУ, подписи порций, счёт по группам', async () => {
  const { palmNorm, palmCount, palmUnit, PALM } = await import('../src/nutrition/palm-model.js');
  assert.equal(palmNorm(null), null);
  assert.equal(palmNorm({ kcal: 0 }), null);
  // 1800 ккал, Б 120 / Ж 60 / У 200: 5 ладоней, 8 горстей, (60 − 20) / 9 ≈ 4 пальца, овощей 5
  assert.deepEqual(palmNorm({ kcal: 1800, protein: 120, fat: 60, carbs: 200 }), { protein: 5, carbs: 8, fat: 4, veg: 5 });
  assert.deepEqual(palmNorm({ kcal: 1200, protein: 20, fat: 10, carbs: 10 }), { protein: 2, carbs: 1, fat: 1, veg: 4 });
  assert.equal(palmUnit('protein', 1), 'ладонь');
  assert.equal(palmUnit('protein', 1.5), 'ладони');
  assert.equal(palmUnit('carbs', 5), 'горстей');
  assert.equal(palmUnit('fat', 2), 'больших пальца');
  const entries = [{ amount: 1.5, product: { kind: 'palm', id: 'protein' } }, { amount: 1, product: { kind: 'palm', id: 'protein' } }, { amount: 100, product: food }];
  assert.deepEqual(palmCount(entries), { protein: 2.5, carbs: 0, fat: 0, veg: 0 });
  assert.equal(totalEntries([{ amount: 2, product: { ...PALM.protein, unit: 'portion' } }]).kcal, 270);
});
test('итог дня: в пределах 10 % — норма, меньше и больше — со словами', async () => {
  const { dayVerdict, mealNow } = await import('../src/nutrition/diary-model.js');
  assert.equal(dayVerdict(1700, 1800).tone, 'good');
  assert.equal(dayVerdict(1000, 1800).tone, 'under');
  assert.match(dayVerdict(2200, 1800).text, /на 400 ккал/);
  assert.equal(dayVerdict(500, 0).tone, 'neutral');
  assert.equal(mealNow(8), 'breakfast'); assert.equal(mealNow(13), 'lunch'); assert.equal(mealNow(19), 'dinner'); assert.equal(mealNow(23), 'snack');
});

// Проверка плана трёх разборов (21.10.2026): «+» нижнего меню, правка записей «ладонью» и «примерно», дневник глазами тренера
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });
const textOf = node => node === null || node === undefined || typeof node === 'boolean' ? '' : typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(textOf).join(' ') : node.children !== undefined ? textOf(node.children) : node.props ? textOf(node.props.children) : '';
const screen = tree => textOf(tree.toJSON()).replace(/\s+/g, ' ');
const buttonsText = tree => tree.root.findAllByType('button').map(b => textOf(b.props.children).replace(/\s+/g, ' ').trim()).filter(Boolean);
const dialogTitle = tree => { const d = tree.root.findAll(n => n.type === 'section' && n.props.role === 'dialog'); return d.length ? textOf(d.at(-1).findByType('h2').props.children) : ''; };
const mealLabel = id => DIARY_MEALS.find(m => m.id === id).label;
const dayAnswer = (p, { entries = [], settings, targets = { kcal: 2000, protein: 100, fat: 60, carbs: 250 }, complete = false } = {}) => ({ day: p.day, entries, totals: totalEntries(entries), targets, complete, waterMl: 0, comment: '', revision: 1, ...(settings ? { settings } : {}) });
async function mountDiary(props = {}, opts = {}) {
  __diary.read = async (a, p) => a === 'diary.get' ? dayAnswer(p, opts) : { products: [] };
  let tree;
  await act(async () => { tree = renderer.create(React.createElement(NutritionDiary, props)); });
  await settle();
  return tree;
}
const palmEntry = { id: 11, revision: 1, day: today(), meal: 'lunch', amount: 1.5, product: palmSnapshot('protein') };
const quickEntry = { id: 12, revision: 1, day: today(), meal: 'dinner', amount: 2, product: { kind: 'quick', id: 'q1', name: 'Бизнес-ланч', kcal: 600, protein: 20, fat: 20, carbs: 70, unit: 'portion', approx: true, source: 'Только калории · примерно' } };

test('«+» → «Еда» до открытия дневника: при показе — «Добавить еду» на приём по часам; «Вода» — +250 мл; у тренера запрос не берётся', async () => {
  const calls = [];
  __diary.mutate = async (a, p) => { calls.push([a, p]); return {}; };
  requestQuick('food');
  let tree = await mountDiary({});
  assert.equal(dialogTitle(tree), 'Добавить еду · ' + mealLabel(mealNow()));
  tree.unmount();
  requestQuick('water');
  tree = await mountDiary({});
  await settle();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'diary.day.save'); assert.equal(calls[0][1].waterDelta, 250); assert.equal(calls[0][1].day, today());
  assert.match(screen(tree), /Вода: \+250 мл\./);
  assert.equal(dialogTitle(tree), '', 'вода — без листа');
  tree.unmount();
  // Тренер в карточке клиента запрос не берёт — он остаётся дневнику клиента
  requestQuick('food');
  tree = await mountDiary({ clientRow: 5, readOnly: true });
  assert.equal(dialogTitle(tree), '');
  assert.equal(calls.length, 1);
  tree.unmount();
  tree = await mountDiary({});
  assert.match(dialogTitle(tree), /^Добавить еду · /);
  tree.unmount();
});

// Плашку анкеты («Норма ещё не посчитана») дневник рисует только без нормы дня:
// норму мог назначить тренер — тогда плашка рядом с «из 2 000 ккал» только путает.
test('плашка анкеты: с нормой от тренера не показывается, без нормы — показывается', async () => {
  const notice = React.createElement('p', { className: 'survey-notice' }, 'Норма ещё не посчитана');
  let tree = await mountDiary({ notice });
  assert.doesNotMatch(screen(tree), /Норма ещё не посчитана/);
  tree.unmount();
  tree = await mountDiary({ notice }, { targets: {} });
  assert.match(screen(tree), /Норма ещё не посчитана/);
  tree.unmount();
});

// Сервер принимает порции ладонью от 0,5 до 10 шагом 0,5 (diary-handlers.js); форма должна отказать сама, не ждать ответа.
// Пока открывается общая DiaryEntryForm с пределом «до 30 порций» — тест красный до правки Diary.jsx.
test('запись «ладонью»: 1,3 порции отклоняется формой до отправки — подсказка про шаг 0,5', async () => {
  const calls = [];
  __diary.mutate = async (a, p) => { calls.push([a, p]); return {}; };
  const tree = await mountDiary({}, { entries: [palmEntry] });
  assert.match(screen(tree), /1\.5 ладони · примерно/);
  await act(async () => tree.root.findByProps({ 'aria-label': 'Изменить: Белок · ладонь' }).props.onClick());
  const input = tree.root.findAll(n => n.type === 'input' && n.props.id === 'diary-amount')[0];
  await act(async () => input.props.onChange({ target: { value: '1,3' } }));
  await act(async () => tree.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  await settle();
  assert.equal(calls.length, 0, 'на сервер не ушло');
  assert.match(screen(tree), /0,5/, 'подсказка про шаг 0,5');
  tree.unmount();
});

test('«примерная» запись («Только калории»): правка открывает общую форму с «Количество порций» — текущее поведение', async () => {
  const tree = await mountDiary({}, { entries: [quickEntry] });
  const text = screen(tree);
  assert.match(text, /примерно · ×2/);
  assert.match(text, /≈ 1200 ккал/);
  assert.match(text, /из съеденного примерно 1200 ккал/);
  await act(async () => tree.root.findByProps({ 'aria-label': 'Изменить: Бизнес-ланч' }).props.onClick());
  assert.equal(dialogTitle(tree), 'Изменить запись');
  assert.equal(tree.root.findAll(n => n.type === 'span' && n.props.className === 'field__label' && n.props.children === 'Количество порций').length, 1);
  assert.equal(tree.root.findAll(n => n.type === 'input' && n.props.id === 'diary-amount')[0].props.value, '2');
  tree.unmount();
});

test('тренер в карточке клиента: видит «примерно», круги «Ладони» и норму приёма; завершить день, режим, норму по приёмам — нет', async () => {
  const entries = [quickEntry, palmEntry, { id: 13, revision: 1, day: today(), meal: 'breakfast', amount: 100, product: food }];
  const tree = await mountDiary({ clientRow: 5, readOnly: true }, { entries, settings: { mode: 'palm', meals: { breakfast: 25, lunch: 35, dinner: 30, snack: 10 }, chosen: true } });
  const text = screen(tree);
  assert.match(text, /примерно · ×2/);
  assert.match(text, /1\.5 ладони · примерно/);
  assert.equal(tree.root.findAll(n => n.type === 'div' && n.props.className === 'palm-summary').length, 1, 'круги «Ладони» при mode = palm');
  assert.match(text, /Съедено ≈ 1473 ккал из 2000/, '70 + 1,5 × 135 + 2 × 600');
  assert.match(text, /Ужин 1200 из 600 ккал на 600 больше/, 'перебор по приёму — словами');
  assert.match(text, /70 из 500 ккал/, 'норма завтрака — 25 % от 2000');
  assert.match(text, /Клиент ещё не завершил этот день/);
  let buttons = buttonsText(tree);
  assert.doesNotMatch(buttons.join(' | '), /Завершить день|Дописать|Как считать|Добавить еду|Отметить порции|Повторить еду|\+ 250 мл/);
  assert.ok(buttons.includes('Назначить цель') && buttons.includes('Сохранить комментарий'), 'тренер назначает цель и пишет комментарий');
  assert.equal(tree.root.findAllByProps({ 'aria-label': 'Добавить в завтрак' }).length, 0);
  assert.equal(tree.root.findByProps({ 'aria-label': 'Изменить: Йогурт' }).props.disabled, true, 'записи клиента тренер не правит');
  assert.equal(tree.root.findByProps({ 'aria-label': 'Удалить: Йогурт' }).parent.props['data-disabled'], '1');
  await act(async () => tree.root.findAllByProps({ role: 'tab' }).find(t => t.props.children === 'Ещё').props.onClick());
  buttons = buttonsText(tree);
  assert.doesNotMatch(buttons.join(' | '), /Норма по приёмам|Как считать еду/);
  assert.match(screen(tree), /Как читать этикетку/, 'уроки — есть');
  tree.unmount();
});

test('границы: итог ровно на 10 % — норма; приём по часам — 11, 16, 21; «Ладонь» — пределы нормы, склонения, счёт', () => {
  assert.equal(dayVerdict(1620, 1800).tone, 'good'); assert.equal(dayVerdict(1619, 1800).tone, 'under');
  assert.equal(dayVerdict(1980, 1800).tone, 'good'); assert.equal(dayVerdict(1981, 1800).tone, 'over');
  assert.match(dayVerdict(1619, 1800).text, /на 181 ккал/); assert.match(dayVerdict(1981, 1800).text, /на 181 ккал/);
  assert.equal(dayVerdict(0, 1800).tone, 'under');
  assert.equal(dayVerdict(100, NaN).tone, 'neutral'); assert.equal(dayVerdict(100, -5).tone, 'neutral'); assert.equal(dayVerdict(100, undefined).tone, 'neutral');
  assert.deepEqual([0, 10, 11, 15, 16, 20, 21, 23].map(mealNow), ['breakfast', 'breakfast', 'lunch', 'lunch', 'dinner', 'dinner', 'snack', 'snack']);
  // Норма в порциях: пределы 2–10 ладоней, 1–12 горстей, 1–10 пальцев; овощей — не меньше ладоней
  assert.deepEqual(palmNorm({ kcal: 3000, protein: 400, fat: 200, carbs: 600 }), { protein: 10, carbs: 12, fat: 10, veg: 10 });
  assert.deepEqual(palmNorm({ kcal: 1500, protein: 100, fat: 10, carbs: 150 }), { protein: 4, carbs: 6, fat: 1, veg: 4 }, 'жира меньше, чем с белком, — всё равно один палец');
  assert.deepEqual(palmNorm({ kcal: '1800', protein: '120' }), { protein: 5, carbs: 1, fat: 1, veg: 5 }, 'строки с сервера и пустые поля');
  assert.equal(palmNorm({ kcal: -1 }), null); assert.equal(palmNorm(undefined), null);
  assert.deepEqual([1, 2, 5, 11, 21, 2.5, 0.5].map(k => palmUnit('protein', k)), ['ладонь', 'ладони', 'ладоней', 'ладоней', 'ладонь', 'ладони', 'ладони']);
  assert.deepEqual([1, 3, 7].map(k => palmUnit('veg', k)), ['кулак', 'кулака', 'кулаков']);
  assert.deepEqual([palmUnit('carbs', 1), palmUnit('fat', 1), palmUnit('fat', 5)], ['горсть', 'большой палец', 'больших пальцев']);
  assert.deepEqual(palmCount([{ amount: '2', product: { kind: 'palm', id: 'veg' } }, { amount: 1, product: { kind: 'palm', id: 'sugar' } }, { amount: 3 }, { amount: 'x', product: { kind: 'palm', id: 'fat' } }]), { protein: 0, carbs: 0, fat: 0, veg: 2 });
  assert.deepEqual(palmSnapshot('veg'), { kind: 'palm', id: 'veg', name: 'Овощи · кулак', kcal: 25, protein: 1.5, fat: 0, carbs: 5, unit: 'portion', approx: true, source: 'Ладонь · примерно' });
});

// Углеводы по дням тренировок (FT-709): цель дня с пояснением, «Рецепты» по дню, переключатель тренера
const carbDay = { kind: 'train', at: '18:00', source: 'calendar', percent: 20, base: { kcal: 2000, protein: 100, fat: 60, carbs: 250 } };
const carbDishes = [
  { kind: 'dish', id: 'kasha', name: 'Каша с бананом', meal: 'завтрак', kcal: 400, protein: 12, fat: 8, carbs: 70, unit: 'portion' },
  { kind: 'dish', id: 'omlet', name: 'Омлет с сыром', meal: 'завтрак', kcal: 400, protein: 28, fat: 30, carbs: 5, unit: 'portion' },
];
const carbRead = async (a, p) => a === 'diary.get' ? { ...dayAnswer(p, { targets: { kcal: 2000, protein: 100, fat: 47, carbs: 300 } }), carbDay } : { products: carbDishes };
test('углеводы по дням: клиент видит цель дня с пояснением, «Рецепты» сначала с углеводами и строкой почему', async () => {
  __diary.read = carbRead;
  let tree;
  await act(async () => { tree = renderer.create(React.createElement(NutritionDiary, {})); });
  await settle();
  assert.match(screen(tree), /День тренировки: углеводов на 20 % больше, жиров меньше — калории и белок те же\./);
  assert.match(screen(tree), /Углеводы 0 \/ 300 г/, 'цель дня — уже со сдвигом');
  await act(async () => tree.root.findAllByProps({ role: 'tab' }).find(t => t.props.children === 'Рецепты').props.onClick());
  await settle();
  const text = screen(tree);
  assert.match(text, /Сегодня тренировка в 18:00 — больше углеводов, особенно в перекус до неё и в ужин после\./);
  assert.match(text, /Каша с бананом/);
  assert.doesNotMatch(text, /Омлет с сыром/, 'в день тренировки по умолчанию — блюда с углеводами');
  assert.match(text, /углеводов много/, 'подпись уровня у блюда');
  await act(async () => tree.root.findAll(n => n.type === 'button' && n.props.children === 'Любые')[0].props.onClick());
  assert.match(screen(tree), /Омлет с сыром/);
  tree.unmount();
});
test('углеводы по дням: тренер открывает цель с базовыми цифрами, видит дни и отправляет процент', async () => {
  const calls = [];
  __diary.read = carbRead;
  __diary.mutate = async (a, p) => { calls.push([a, p]); return {}; };
  let tree;
  await act(async () => { tree = renderer.create(React.createElement(NutritionDiary, { clientRow: 5, readOnly: true })); });
  await settle();
  await act(async () => tree.root.findAll(n => n.type === 'button' && textOf(n.props.children) === 'Назначить цель')[0].props.onClick());
  const text = screen(tree);
  assert.match(text, /Углеводы по дням тренировок/);
  assert.match(text, /День тренировки: У 300 г · Ж 38 г/, 'предпросмотр из базовой цели 250 г, а не из цели дня');
  assert.match(text, /День отдыха: У 200 г · Ж 82 г/);
  await act(async () => tree.root.findAll(n => n.type === 'button' && n.props.children?.join?.('') === '±10 %')[0].props.onClick());
  await act(async () => tree.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  const [action, params] = calls.find(c => c[0] === 'diary.target.save');
  assert.equal(action, 'diary.target.save');
  assert.equal(params.carbCycle, 10);
  assert.equal(Number(params.targets.carbs), 250, 'уходит базовая цель, не цель дня');
  tree.unmount();
});
