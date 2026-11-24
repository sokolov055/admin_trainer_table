import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const MUSCLES = ['Грудь', 'Спина', 'Ноги', 'Ягодицы', 'Плечи', 'Руки', 'Предплечье', 'Пресс', 'Всё тело', 'Кардио'];
const entry = `import React, {useState} from 'react';import {createRoot} from 'react-dom/client';import ExerciseList from './src/trainer/ExerciseList.jsx';import {NO_EXERCISE_FILTERS} from './src/trainer/exercise-list-model.js';import {usePendingDelete} from './src/pendingDelete.jsx';
const MUSCLES=${JSON.stringify(MUSCLES)};
const list=globalThis.__testList||[
{id:1,name:'Жим штанги лёжа',muscle:'Грудь',equipment:'Штанга',common:true,mine:false,media:{kind:'animation',url:'a'},setup:'Лечь на скамью',machines:[{kind:'machine'}],track:{kind:'strength'}},
{id:2,name:'Тяга верхнего блока к груди узким обратным хватом',muscle:'Спина',equipment:'',common:true,mine:false,media:{kind:'clip',url:'b'},setup:'Сесть',machines:[{kind:'machine'},{kind:'machine'}],track:{kind:'strength'}},
{id:3,name:'Подтягивания с помощью',muscle:'Спина',common:true,mine:false,media:null,setup:'',machines:[],track:{kind:'bodyweight',weightMode:'assistance'}},
{id:4,name:'Планка',muscle:'Пресс',equipment:'',common:true,mine:false,media:null,setup:'',machines:[],track:{kind:'timed'}},
{id:5,name:'Беговая дорожка',muscle:'Кардио',equipment:'Дорожка',common:true,mine:false,media:null,setup:'',machines:[],track:{kind:'cardio'}},
{id:6,name:'Моё: Разводка в кроссовере',muscle:'Грудь',equipment:'Кроссовер',common:false,mine:true,media:null,setup:'',machines:[],track:{kind:'strength'}},
{id:7,name:'Моё упражнение без группы',muscle:'',equipment:'',common:false,mine:true,media:null,setup:'Шаги',machines:[],track:{kind:'strength'}}];
function App(){const del=usePendingDelete(async()=>{});const[state,setState]=useState(globalThis.__testState||{scope:'public',q:'',search:false,muscle:'',filters:{...NO_EXERCISE_FILTERS}});const[open,setOpen]=useState(null);const[page,setPage]=useState('');
return <main style={{padding:16,maxWidth:600,margin:'auto'}}>{del.bar}{page?<button onClick={()=>setPage('')}>Назад {page}</button>:open?<button onClick={()=>setOpen(null)}>Назад {open}</button>:<ExerciseList list={list.filter(e=>!del.hidden(e.id))} muscles={MUSCLES} hiddenCount={globalThis.__testHidden??2} state={state} setState={setState} onDelete={e=>del.remove(e.id,e,e.common?'Убрано':'Удалено')} onOpen={setOpen} onCreate={()=>setPage('new')} onSimilar={()=>setPage('similar')} onHidden={()=>setPage('hidden')}/>}</main>};createRoot(document.getElementById('root')).render(<App/>);`;

test('список упражнений — поиск, фильтры, смахивание, возврат, геометрия в обеих темах', async () => {
  const out = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'jsx' }, bundle: true, write: false, outdir: '/tmp/elib-test', format: 'iife', define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'stub', setup(b) { b.onResolve({ filter: /\/telegram\.js$/ }, () => ({ path: 'telegram', namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: "export const haptic=()=>{}; export const getInitData=()=>''; export const environmentInfo=()=>({});" })); } }] });
  const js = out.outputFiles.find((f) => f.path.endsWith('.js')).text;
  const css = readFileSync('src/styles.css', 'utf8') + readFileSync('src/trainer/exercises-lib.css', 'utf8');
  const shots = process.env.ELIB_SHOTS || '';
  const b = await chromium.launch();
  try {
    for (const width of [320, 390, 430]) for (const theme of ['light', 'dark']) {
      const p = await b.newPage({ viewport: { width, height: 850 }, reducedMotion: 'reduce' });
      const errors = [];
      p.on('pageerror', (e) => errors.push(e.message));
      const load = async (extra = '') => {
        await p.setContent(`<html data-theme="${theme}"><style>${css}</style><div id="root"></div><script>${extra}</script></html>`);
        await p.addScriptTag({ content: js });
      };
      const shot = (name) => shots && p.screenshot({ path: `${shots}/${name}-${width}-${theme}.png` });
      const noOverflow = async () => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await load();
      // По умолчанию — «Общие»: база, у общих «общее» и «Убрать»
      await p.locator('.elib-card').first().waitFor();
      assert.equal(await p.locator('.elib-card').count(), 5);
      assert.equal(await p.getByRole('radio', { name: 'Общие 5' }).getAttribute('aria-checked'), 'true');
      await noOverflow();
      await shot('list');

      // Сегменты равной ширины, подписи по центру; цели касания ≥ 44 px
      const seg = await p.locator('.elib-scope .chip').evaluateAll((es) => es.map((e) => { const r = e.getBoundingClientRect(); const t = e.firstElementChild.getBoundingClientRect(); return { w: r.width, h: r.height, d: Math.abs(r.x + r.width / 2 - (t.x + t.width / 2)) }; }));
      assert.ok(Math.abs(seg[0].w - seg[1].w) < 0.1);
      assert.ok(seg.every((g) => g.d < 0.6 && g.h >= 34));
      for (const sel of ['.elib-ib', '.elib-chip']) {
        const sizes = await p.locator(sel).evaluateAll((es) => es.map((e) => Math.round(e.getBoundingClientRect().height)));
        assert.ok(sizes.every((h) => h >= 44), sel + ' ' + sizes);
      }
      // Все карточки одной ширины; длинное название — не больше двух строк, без выхода за карточку
      const cards = await p.locator('.elib-card').evaluateAll((es) => es.map((e) => Math.round(e.getBoundingClientRect().width)));
      assert.ok(new Set(cards).size === 1);
      const longName = p.locator('.elib-name', { hasText: 'Тяга верхнего блока' });
      assert.ok(await longName.evaluate((e) => e.getBoundingClientRect().height <= parseFloat(getComputedStyle(e).lineHeight) * 2 + 1));
      // Содержимое карточки не вылезает за её границы
      assert.ok(await p.locator('.elib-card').evaluateAll((es) => es.every((c) => [...c.querySelectorAll('.elib-body, .elib-side, .elib-cover')].every((x) => { const a = x.getBoundingClientRect(), r = c.getBoundingClientRect(); return a.right <= r.right + 0.5 && a.left >= r.left - 0.5; }))));
      // Значки видео и техники: зелёные только если есть
      const first = p.locator('.elib-card').filter({ hasText: 'Жим штанги лёжа' });
      assert.equal(await first.locator('.elib-flags .is-on').count(), 2);
      assert.equal(await p.locator('.elib-card').filter({ hasText: 'Планка' }).locator('.elib-flags .is-on').count(), 0);
      assert.equal(await first.locator('.elib-cover__play').count(), 1);
      assert.equal(await first.locator('.elib-cover__img').count(), 1, 'анимация — кадр на обложке');
      assert.equal(await p.locator('.elib-card').filter({ hasText: 'Тяга' }).locator('.elib-cover__img').count(), 0, 'видео-клип — значок');
      assert.match(await first.innerText(), /общее/);
      assert.match(await first.innerText(), /1 тренажёр/);
      assert.match(await p.locator('.elib-card').filter({ hasText: 'Тяга' }).innerText(), /2 тренажёра/);
      assert.equal(await p.getByText('На проверке').count(), 0);
      assert.equal(await p.getByText('412').count(), 0);

      // Группа мышц — чип с цветным значком; снятие — повторным нажатием
      await p.getByRole('button', { name: 'Спина', exact: true }).click();
      assert.equal(await p.locator('.elib-card').count(), 2);
      await p.getByRole('button', { name: 'Спина', exact: true }).click();
      assert.equal(await p.locator('.elib-card').count(), 5);

      // Поиск значком, Мои/Общие не сбрасывают запрос; «Назад» возвращает с прежним поиском и фильтром
      await p.getByRole('button', { name: 'Поиск упражнений', exact: true }).click();
      await p.getByPlaceholder('Название или мышца').fill('спина');
      assert.equal(await p.locator('.elib-card').count(), 2);
      await p.getByRole('button', { name: 'Фильтры', exact: true }).click();
      await p.getByRole('button', { name: 'С видео', exact: true }).click();
      await p.getByRole('button', { name: 'Показать: 1', exact: true }).click();
      assert.equal(await p.locator('.elib-card').count(), 1);
      await p.locator('.elib-card').click();
      await p.getByRole('button', { name: /Назад 2/ }).click();
      assert.equal(await p.getByPlaceholder('Название или мышца').inputValue(), 'спина');
      assert.equal(await p.locator('.elib-card').count(), 1);
      assert.match(await p.getByRole('button', { name: /Фильтры/ }).innerText(), /1/);
      await p.getByPlaceholder('Название или мышца').fill('нет такого');
      await p.getByText('Ничего не нашлось', { exact: true }).waitFor();
      await shot('empty');
      await p.getByRole('button', { name: 'Сбросить', exact: true }).click();
      assert.equal(await p.locator('.elib-card').count(), 5);

      // Лист «Фильтры»: плитки, порядок, служебное; плитки одной высоты внутри ряда и выровнены
      await p.getByRole('button', { name: /Фильтры/ }).click();
      await p.getByRole('button', { name: 'Вес помощи', exact: true }).click();
      await p.getByRole('button', { name: 'Показать: 1', exact: true }).waitFor();
      await p.getByRole('button', { name: 'Вес помощи', exact: true }).click();
      await p.getByText('Похожие упражнения', { exact: true }).waitFor();
      assert.match(await p.getByText('Убранные', { exact: true }).locator('xpath=..').innerText(), /2 упражнения/);
      const tiles = await p.locator('.elib-tile').evaluateAll((es) => es.map((e) => { const r = e.getBoundingClientRect(); return { h: r.height, w: r.width }; }));
      assert.ok(tiles.every((t) => t.h >= 44));
      await p.waitForTimeout(450);
      await noOverflow();
      await shot('filters');
      await p.getByRole('button', { name: 'Похожие упражнения' }).click();
      await p.getByRole('button', { name: 'Назад similar' }).click();
      await p.getByRole('button', { name: /Фильтры/ }).click();
      await p.getByRole('button', { name: /^Убранные/ }).click();
      await p.getByRole('button', { name: 'Назад hidden' }).click();

      // «+»: с нуля и из общих
      await p.getByRole('button', { name: 'Новое упражнение', exact: true }).click();
      await p.getByText('С нуля',{exact:true}).waitFor();
      await p.waitForTimeout(900);
      await shot('new');
      await p.getByRole('button', { name: /С нуля/ }).click();
      await p.getByRole('button', { name: 'Назад new' }).click();
      await p.getByRole('radio', { name: /Мои/ }).click();
      await p.getByRole('button', { name: 'Новое упражнение', exact: true }).click();
      await p.getByRole('button', { name: /Из общих/ }).click();
      assert.equal(await p.getByRole('radio', { name: /Общие/ }).getAttribute('aria-checked'), 'true');
      await p.getByRole('button', { name: 'Закрыть поиск', exact: true }).click();

      // Смахивание: у общих «Убрать», у своих «Удалить», возврат
      const row = p.locator('.elib-swipe').first();
      let box = await row.boundingBox();
      await p.mouse.move(box.x + box.width - 15, box.y + 35); await p.mouse.down();
      await p.mouse.move(box.x + box.width - 155, box.y + 35, { steps: 12 }); await p.mouse.up();
      await shot('swipe');
      await row.getByRole('button', { name: /^Убрать «Беговая дорожка»/ }).click();
      await p.getByRole('button', { name: 'Вернуть', exact: true }).waitFor();
      assert.equal(await p.locator('.elib-card').count(), 4);
      await p.getByRole('button', { name: 'Вернуть', exact: true }).click();
      assert.equal(await p.locator('.elib-card').count(), 5);
      await p.getByRole('radio', { name: /Мои/ }).click();
      assert.equal(await p.locator('.elib-card').count(), 2);
      assert.equal(await p.locator('.elib-card .elib-free', { hasText: 'общее' }).count(), 0);
      box = await p.locator('.elib-swipe').first().boundingBox();
      await p.mouse.move(box.x + box.width - 15, box.y + 35); await p.mouse.down();
      await p.mouse.move(box.x + box.width - 155, box.y + 35, { steps: 12 }); await p.mouse.up();
      await p.locator('.elib-swipe').first().getByRole('button', { name: /^Удалить «/ }).waitFor();
      await shot('mine');
      assert.deepEqual(errors, []);

      // Пустые области: нет своих — «Из общих»; общих нет — подсказка без кнопки сброса
      await load('window.__testList=[{id:1,name:"Общее",muscle:"Грудь",common:true,mine:false,machines:[],track:{kind:"strength"}}];window.__testState={scope:"mine",q:"",search:false,muscle:"",filters:{load:"",gear:"",media:false,noSetup:false,sort:"recent"}};window.__testHidden=0');
      await p.getByText('Своих упражнений пока нет', { exact: true }).waitFor();
      await p.getByRole('button', { name: 'Из общих', exact: true }).click();
      assert.equal(await p.locator('.elib-card').count(), 1);
      await p.getByRole('button', { name: /Фильтры/ }).click();
      assert.equal(await p.getByRole('button', { name: /^Убранные/ }).count(), 0);
      assert.deepEqual(errors, []);
      await p.close();
    }
  } finally { await b.close(); }
});
