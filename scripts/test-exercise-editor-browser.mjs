import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const entry = `import React from 'react';import {createRoot} from 'react-dom/client';import ExerciseEditor from './src/trainer/ExerciseEditor.jsx';
const card={id:1,name:'Тяга верхнего блока к груди узким обратным хватом двумя руками',muscle:'Спина',equipment:'',common:true,mine:false,
  media:{kind:'link',url:'https://example.test/video'},notes:'Сядьте, зафиксируйте бёдра под валиками\\nПотяните рукоять к верху груди\\nМедленно верните руки вверх',
  mistakes:'Раскачка корпусом\\nЛокти уходят назад',setup:'',setupOk:false,shortName:'Тяга блока',machines:[],alternatives:[],track:{kind:'strength',auto:true},musclesCustom:false};
const MUSCLES=['Грудь','Спина','Ноги','Пресс','Кардио'];
function App(){return <main style={{padding:16,maxWidth:600,margin:'auto'}}><ExerciseEditor exercise={card} owner={false} muscles={MUSCLES} onSaved={()=>{}} onBack={()=>{ window.__back=(window.__back||0)+1; }}/></main>}
createRoot(document.getElementById('root')).render(<App/>);`;

test('правка упражнения одним экраном — «Сохранить» только при изменениях, растущие поля, листы и выход с защитой — в обеих темах', async () => {
  const out = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'jsx' }, bundle: true, write: false, outdir: '/tmp/eedit-test', format: 'iife', define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'stub', setup(b) { b.onResolve({ filter: /\/telegram\.js$/ }, () => ({ path: 'telegram', namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: "export const haptic=()=>{}; export const getInitData=()=>''; export const environmentInfo=()=>({});" })); } }] });
  const js = out.outputFiles.find((f) => f.path.endsWith('.js')).text;
  const css = readFileSync('src/styles.css', 'utf8') + readFileSync('src/trainer/exercises-lib.css', 'utf8');
  const shots = process.env.ELIB_SHOTS || '';
  const b = await chromium.launch();
  try {
    for (const width of [320, 390, 430]) for (const theme of ['light', 'dark']) {
      const p = await b.newPage({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
      const errors = [];
      p.on('pageerror', (e) => errors.push(e.message));
      await p.setContent(`<html data-theme="${theme}"><style>${css}</style><div id="root"></div></html>`);
      await p.addScriptTag({ content: js });
      const shot = (name) => shots && p.screenshot({ path: `${shots}/${name}-${width}-${theme}.png`, fullPage: true });
      const noOverflow = async () => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'нет горизонтального скролла');
      const save = p.getByRole('button', { name: 'Сохранить', exact: true });

      await p.locator('.elib-ed__top').waitFor();
      assert.equal(await save.isDisabled(), true, 'без изменений «Сохранить» недоступно');
      assert.equal(await p.locator('.elib-ed__dot').count(), 0, 'точки несохранённого нет');
      await noOverflow();

      // Закреплённая верхняя строка остаётся при прокрутке
      await p.evaluate(() => window.scrollTo(0, 400));
      const topY = await p.locator('.elib-ed__top').evaluate((e) => Math.round(e.getBoundingClientRect().top));
      assert.ok(topY <= 0 + 1, 'верхняя строка закреплена: ' + topY);
      await p.evaluate(() => window.scrollTo(0, 0));

      // Название растёт и не принимает перевод строки
      const name = p.getByRole('textbox', { name: 'Название' });
      await name.fill('Тяга верхнего блока к груди узким обратным хватом двумя руками (вариант)');
      await p.keyboard.press('Enter');
      assert.equal((await name.inputValue()).includes('\n'), false, 'Enter не вставляет перевод строки');
      const nameH = await name.evaluate((e) => e.getBoundingClientRect().height);
      assert.ok(nameH > 60, 'длинное название видно целиком: ' + nameH);
      assert.equal(await save.isEnabled(), true, 'после правки «Сохранить» доступно');
      assert.equal(await p.locator('.elib-ed__dot').count(), 1, 'точка несохранённого есть');

      // Шаги: добавить, переставить, удалить — и снова без изменений
      const steps = p.locator('.elib-ed__step');
      const before = await steps.count();
      await p.getByRole('button', { name: 'Добавить шаг', exact: true }).click();
      assert.equal(await steps.count(), before + 1);
      await steps.nth(before).getByRole('textbox').fill('Держите спину прямо');
      await steps.nth(before).getByRole('button', { name: 'Выше' }).click();
      assert.equal(await steps.nth(before - 1).getByRole('textbox').inputValue(), 'Держите спину прямо');
      await steps.nth(before - 1).getByRole('button', { name: 'Удалить шаг' }).click();
      assert.equal(await steps.count(), before);
      await shot('edit-main');

      // Ошибки: Enter добавляет плашку, × убирает
      const err = p.getByRole('textbox', { name: 'Добавить ошибку' });
      await err.fill('Голова уходит вперёд');
      await err.press('Enter');
      assert.equal(await p.locator('.elib-ed__err', { hasText: 'Голова уходит вперёд' }).count(), 1);
      await p.locator('.elib-ed__err', { hasText: 'Голова уходит вперёд' }).getByRole('button', { name: 'Убрать ошибку' }).click();
      assert.equal(await p.locator('.elib-ed__err', { hasText: 'Голова' }).count(), 0);

      // Цели касания ≥ 44 px
      for (const sel of ['.elib-ed__cancel', '.elib-ed__save', '.elib-ed__mini', '.elib-ed__link', '.elib-ed__vbtn', '.elib-ed__add', '.elib-ed__err button']) {
        const hs = await p.locator(sel).evaluateAll((es) => es.map((e) => Math.round(e.getBoundingClientRect().height)));
        assert.ok(hs.length && hs.every((h) => h >= 44), sel + ' ' + hs);
      }

      // Характеристики — лист с группой, нагрузкой, инвентарём и «В ленте»
      await p.locator('.elib-box').filter({ hasText: 'Характеристики' }).getByRole('button', { name: 'Изменить' }).click();
      await p.locator('.elib-sheet').first().waitFor();
      assert.ok(await p.getByLabel('Коротко — в ленте программы').isVisible());
      await p.waitForTimeout(450);
      await shot('edit-sheet');
      await p.getByRole('button', { name: 'Готово' }).click();

      // Выход с несохранённым спрашивает; «Остаться» — остаёмся, «Выйти» — уходим
      await p.getByRole('button', { name: 'Отмена', exact: true }).click();
      await p.getByText('Выйти без сохранения?', { exact: true }).waitFor();
      await p.evaluate(() => { window.__lastBack = window.__back || 0; });
      await p.getByRole('button', { name: 'Остаться', exact: true }).click();
      assert.equal(await p.evaluate(() => window.__back || 0), 0, '«Остаться» не выходит');
      await p.getByRole('button', { name: 'Отмена', exact: true }).click();
      await p.getByRole('button', { name: 'Выйти', exact: true }).click();
      assert.equal(await p.evaluate(() => window.__back || 0), 1, '«Выйти» уходит назад');
      await noOverflow();
      assert.deepEqual(errors, []);
      await p.close();
    }
  } finally { await b.close(); }
});
