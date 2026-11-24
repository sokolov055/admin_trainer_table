import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const MUSCLES = ['Грудь', 'Спина', 'Ноги', 'Пресс', 'Кардио'];
const OWN={id:3,name:'Моё: Скручивания на наклонной',muscle:'Пресс',equipment:'Скамья',common:false,mine:true,media:null,notes:'',mistakes:'',
  setup:'Фиксируйте ноги\nКолени слегка согнуты',machines:[],alternatives:[],track:{kind:'bodyweight'},musclesCustom:false};

const entry = `import React from 'react';import {createRoot} from 'react-dom/client';import ExerciseCardView from './src/trainer/ExerciseCardView.jsx';
const common={id:1,name:'Тяга верхнего блока к груди узким обратным хватом двумя руками',muscle:'Спина',equipment:'',common:true,mine:false,
  media:{kind:'link',url:'https://example.test/video'},notes:'Сядьте, зафиксируйте бёдра под валиками\\nПотяните рукоять к верху груди\\nМедленно верните руки вверх',
  mistakes:'Раскачка корпусом\\nЛокти уходят назад за линию плеч',setup:'',machines:[{uid:'m1',name:'Блок верхний Technogym',kind:'machine',photos:[],setup:'Сиденье — валики на бёдрах'}],
  alternatives:[{id:2,name:'Подтягивания с помощью'}],track:{kind:'strength'},musclesCustom:false};
const card=globalThis.__testCard||common;
function App(){return <main style={{padding:16,maxWidth:600,margin:'auto'}}><ExerciseCardView exercise={card} owner={false} all={[card]} onBack={()=>{}} onEdit={()=>{}} onChanged={()=>{}} onOpen={()=>{}} onRemove={()=>{}}/></main>}
createRoot(document.getElementById('root')).render(<App/>);`;

test('карточка упражнения — читается сверху вниз, касания и перенос в обеих темах', async () => {
  const out = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'jsx' }, bundle: true, write: false, outdir: '/tmp/ecard-test', format: 'iife', define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'stub', setup(b) { b.onResolve({ filter: /\/telegram\.js$/ }, () => ({ path: 'telegram', namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: "export const haptic=()=>{}; export const getInitData=()=>''; export const environmentInfo=()=>({});" })); } }] });
  const js = out.outputFiles.find((f) => f.path.endsWith('.js')).text;
  const css = readFileSync('src/styles.css', 'utf8') + readFileSync('src/trainer/exercises-lib.css', 'utf8');
  const shots = process.env.ELIB_SHOTS || '';
  const b = await chromium.launch();
  try {
    for (const width of [320, 390, 430]) for (const theme of ['light', 'dark']) {
      const p = await b.newPage({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
      const errors = [];
      p.on('pageerror', (e) => errors.push(e.message));
      const load = async (extra = '') => {
        await p.setContent(`<html data-theme="${theme}"><style>${css}</style><div id="root"></div><script>${extra}</script></html>`);
        await p.addScriptTag({ content: js });
      };
      const shot = (name) => shots && p.screenshot({ path: `${shots}/${name}-${width}-${theme}.png`, fullPage: true });
      const noOverflow = async () => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'нет горизонтального скролла');

      // Общее упражнение с тренажёром: шапка, три факта, видео по ссылке, техника и ошибки
      await load();
      await p.locator('.elib-hero').waitFor();
      assert.match(await p.locator('.elib-hero__g').textContent(), /Спина · общее/);
      assert.equal(await p.locator('.elib-stats > div').count(), 3);
      assert.match(await p.locator('.elib-stats').innerText(), /тренажёр/);
      assert.equal(await p.locator('.elib-steps > li').count(), 3);
      assert.equal(await p.locator('.elib-err li').count(), 2);
      assert.match(await p.locator('.elib-notice').innerText(), /создаст вашу версию/);
      assert.equal(await p.getByText('Подготовка', { exact: true }).count(), 0, 'подготовка скрыта при тренажёре');
      assert.equal(await p.getByText('Техника и видео проверены').count(), 0, 'проверки в карточке нет');
      await noOverflow();

      // Длинное название переносится, не выходит за экран
      const name = await p.locator('.elib-hero__name').evaluate((e) => ({ h: e.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(e).lineHeight), w: e.getBoundingClientRect().width }));
      assert.ok(name.h > name.lh * 1.5, 'длинное название — несколько строк');
      assert.ok(name.w <= width, 'название в ширине экрана');

      // Касания ≥ 44 px: «Назад», «Изменить», «⋯»; нижняя панель закреплена
      const dock = p.locator('.elib-dock');
      assert.equal(await dock.evaluate((e) => getComputedStyle(e).position), 'sticky');
      for (const sel of ['.elib-dock__main', '.elib-dock .elib-ib', '.elib-view > button']) {
        const h = await p.locator(sel).first().evaluate((e) => Math.round(e.getBoundingClientRect().height));
        assert.ok(h >= 44, sel + ' ' + h);
      }
      // Значок и подпись по центру: иконка в заголовке блока и текст — на одной линии
      const boxHead = await p.locator('.elib-box__h').first().evaluate((h) => {
        const ic = h.querySelector('.elib-box__ic').getBoundingClientRect();
        const t = h.getBoundingClientRect();
        return { cy: ic.y + ic.height / 2, ty: t.y + t.height / 2 };
      });
      assert.ok(Math.abs(boxHead.cy - boxHead.ty) < 1.5, 'значок блока по центру строки');
      // Нумерация шагов: кружок по центру строки шага
      const stepLeft = await p.locator('.elib-steps > li').first().evaluate((li) => {
        const s = getComputedStyle(li, '::before');
        return { w: parseFloat(s.width), h: parseFloat(s.height) };
      });
      assert.equal(stepLeft.w, stepLeft.h, 'кружок шага — круг');

      // Отступы блоков одинаковые
      const gaps = await p.locator('.elib-box, .elib-hero, .elib-notice').evaluateAll((es) => es.slice(0, -1).map((e, i) => Math.round(es[i + 1].getBoundingClientRect().top - e.getBoundingClientRect().bottom)));
      assert.ok(new Set(gaps.filter((g) => g > 0)).size <= 2, 'отступы между блоками одинаковые: ' + gaps);

      await shot('card-common');

      // «⋯»: общее убирается у себя, сразу назад — не удаляется
      await p.getByRole('button', { name: 'Ещё', exact: true }).click();
      await p.getByRole('button', { name: /^Убрать у себя/ }).waitFor();
      await p.waitForTimeout(400);
      await shot('card-menu');
      await p.keyboard.press('Escape');
      await p.waitForTimeout(300);

      // Свой вариант без тренажёра: подготовка видна, пустое видео — подсказка
      await load('window.__testCard='+JSON.stringify(OWN));
      await p.locator('.elib-hero').waitFor();
      assert.match(await p.locator('.elib-hero__g').textContent(), /своё/);
      assert.equal(await p.getByText('Подготовка', { exact: true }).count(), 1);
      assert.equal(await p.getByText('Видео нет', { exact: true }).count(), 1);
      assert.equal(await p.getByText('Общее упражнение').count(), 0);
      assert.equal(await p.locator('.elib-steps > li').count(), 2, 'подготовка — два шага');
      assert.equal(await p.getByText('Техника пока не описана').count(), 1);
      await p.getByRole('button', { name: 'Ещё', exact: true }).click();
      await p.getByRole('button', { name: /^Удалить/ }).waitFor();
      await noOverflow();
      await shot('card-own');
      assert.deepEqual(errors, []);
      await p.close();
    }
  } finally { await b.close(); }
});
