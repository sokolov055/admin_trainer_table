import test from 'node:test';
import assert from 'node:assert/strict';
import { shownMachines, machineFilterCount, NO_MACHINE_FILTERS } from '../src/trainer/machine-list-model.js';
const list = [
 { uid:'a', name:'Жим', mine:true, kind:'machine', brand:'Matrix', muscleGroups:['Грудь'], uses:[{name:'Жим лёжа'}] },
 { uid:'b', name:'Блок', mine:true, kind:'machine', brand:'', muscleGroups:['Спина'], uses:[] },
 { uid:'c', name:'Гриф', mine:false, kind:'equipment', brand:'Matrix', uses:[] },
];
const ids = (options) => shownMachines(list, options).map((m) => m.uid);
test('свои и общие разделены; поиск по бренду, модели и связанному упражнению', () => {
 assert.deepEqual(ids(), ['a','b']); assert.deepEqual(ids({scope:'public'}), ['c']);
 assert.deepEqual(ids({q:'ЛЕЖА'}), ['a']); assert.deepEqual(ids({q:'matrix'}), ['a']);
 assert.deepEqual(shownMachines([{...list[0],originalName:'Модель Ёлка'}],{q:'елка'}).map(m=>m.uid),['a']);
});
test('фильтры пересекаются; пустой бренд, без связей и пустая выдача', () => {
 assert.deepEqual(ids({filters:{...NO_MACHINE_FILTERS,brand:'—',muscle:'Спина',missing:true}}), ['b']);
 assert.deepEqual(ids({kind:'equipment'}), []);
 assert.deepEqual(ids({q:'нет такого'}), []);
 assert.equal(machineFilterCount({...NO_MACHINE_FILTERS,brand:'—',missing:true,sort:'uses'}),2);
});
test('порядок не меняет исходные данные и связи; алфавит и число упражнений', () => {
 const before=JSON.stringify(list);assert.deepEqual(ids({filters:{sort:'az'}}),['b','a']);
 assert.deepEqual(ids({filters:{sort:'uses'}}),['a','b']); assert.equal(JSON.stringify(list),before);
});

test('Недавние: дата изменения, затем создания; без даты — в конце, исходник не меняется', () => {
 const items=[{...list[0],uid:'old',updatedAt:'2026-11-01T10:00:00Z'},
  {...list[0],uid:'new',updatedAt:'2026-11-23T10:00:00Z',createdAt:'2026-01-01'},
  {...list[0],uid:'created',updatedAt:'ошибка',createdAt:'2026-11-20T10:00:00Z'},
  {...list[0],uid:'legacy'}];
 assert.deepEqual(shownMachines(items).map(m=>m.uid),['new','created','old','legacy']);
 assert.deepEqual(items.map(m=>m.uid),['old','new','created','legacy']);
});
