// Снимки сценариев клиента по демо-сборке (VITE_MOCK=1) для визуальной
// проверки: ширины 320/360/390, светлая и тёмная тема, крупный шрифт.
// Не тест: шаги, которые не удались, пишутся в журнал, прогон идёт дальше.
//
//   node scripts/review-shots.mjs [--no-build] [--only=<сценарий>] [--variants=360,320,390d,360b]
//
// Снимки — в .impeccable/review/<вариант>/<сценарий>-<шаг>.png, журнал —
// .impeccable/review/log.txt (ошибки шагов, горизонтальная прокрутка,
// ошибки консоли). Сводный лист всех снимков варианта — contact-<вариант>.png.
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'dist-review');
const shots = join(root, '.impeccable/review');
const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v = '1'] = a.replace(/^--/, '').split('='); return [k, v]; }));

const VARIANTS = {
  '360': { width: 360, height: 780 },
  '320': { width: 320, height: 640 },
  '390d': { width: 390, height: 844, dark: true },
  '360b': { width: 360, height: 780, big: true },
};
const variants = (args.variants || '360,320,390d,360b').split(',').map(v => [v, VARIANTS[v]]).filter(([, v]) => v);

const log = [];
const note = line => { log.push(line); console.log(line); };

// Шаги: [действие, ...параметры]. Все ищут по доступному имени, как человек.
const S = {
  tab: name => ['tab', name],
  click: (name, opts) => ['click', name, opts],
  dialog: (name, opts) => ['dialog', name, opts],
  text: (text, opts) => ['text', text, opts],
  fill: (label, value) => ['fill', label, value],
  menu: item => ['menu', item],
  close: () => ['close'],
  back: () => ['back'],
  wait: ms => ['wait', ms],
  shot: (name, full) => ['shot', name, full],
  bottom: name => ['bottom', name],
  eval: fn => ['eval', fn],
  press: key => ['press', key],
};

const SCENARIOS = [
  // 1. Новичок без нормы: вопрос, «Ладонь», порции, итог, смена режима, продукт
  { id: 'n1-palm', query: '', steps: [
    S.tab('Питание'), S.shot('01-approach'), S.bottom('01b-approach-bottom'),
    S.click('Никогда не считал(а)'), S.shot('02-approach-palm'),
    S.click('Продолжить'), S.wait(600), S.shot('03-diary-palm', true),
    S.click('Добавить в обед'), S.wait(400), S.shot('04-palm-sheet'),
    S.click('Белок: 2 ладони'), S.click('Ещё половина: Овощи'), S.shot('05-palm-filled'),
    S.eval(async page => { await page.getByRole('dialog').getByRole('button', { name: /^Сохранить/ }).click(); }), S.wait(700), S.shot('06-palm-saved', true),
    S.click('Ещё'), S.wait(500), S.shot('07-more', true), S.bottom('07b-more-bottom'),
    S.click('Как считать еду'), S.wait(400), S.shot('08-mode-sheet'),
    S.click('Считаю калории и хочу точности'), S.click('Продолжить'), S.wait(600), S.shot('09-diary-grams', true),
    S.click('Добавить в обед'), S.wait(500), S.shot('10-picker'),
    S.dialog('Все'), S.wait(500), S.shot('11-picker-all'),
    S.eval(async page => { await page.getByRole('dialog').locator('.diary-catalog-row button.diary-food-main, .diary-catalog-row > button').first().click(); }), S.wait(400), S.shot('12-product'),
    S.dialog(/^Записать/), S.wait(700), S.shot('13-saved', true), S.bottom('14-diary-bottom'),
  ] },
  // 2. Обычный день в граммах: поиск, «Только калории», кадр сканера, вода, «Завершить день»
  { id: 'n2-day', query: '', steps: [
    S.tab('Питание'), S.click('Считаю калории и хочу точности'), S.click('Продолжить'), S.wait(600),
    S.click('Добавить в обед'), S.fill('Поиск продуктов и блюд', 'овс'), S.wait(700), S.shot('01-search'),
    S.eval(async page => { await page.getByRole('dialog').locator('button').filter({ hasText: /овс/i }).first().click(); }), S.wait(400), S.shot('02-entry-form'),
    S.dialog(/^Записать/), S.wait(700),
    S.click('Добавить в обед'), S.dialog('Ещё способы'), S.dialog('Только калории'), S.wait(400), S.shot('03-quick'),
    S.fill('Калории, ккал', '650'), S.fill('Что это было', 'Бизнес-ланч'), S.shot('04-quick-filled'),
    S.dialog(/^Добавить \d/), S.wait(700), S.shot('05-quick-saved', true),
    S.click('Добавить в обед'), S.dialog('Ещё способы'), S.dialog('Фото этикетки'), S.wait(400), S.shot('06-scan-guide'),
    S.close(), S.wait(300),
    S.click(/250 мл/), S.wait(500), S.shot('07-water', true),
    S.click('Завершить день'), S.wait(400), S.shot('08-finish-sheet'),
    S.dialog('Завершить день'), S.wait(700), S.shot('09-day-done', true),
    S.click('Дописать'), S.wait(500), S.shot('10-reopened', true),
  ] },
  // 3. Норма по приёмам
  { id: 'n3-shares', query: '', steps: [
    S.tab('Питание'), S.click('Считаю калории и хочу точности'), S.click('Продолжить'), S.wait(600),
    S.click('Ещё'), S.click('Норма по приёмам'), S.wait(400), S.shot('01-shares'),
    S.click('Больше: Ужин'), S.click('Меньше: Завтрак'), S.shot('02-shares-changed'),
    S.dialog('Сохранить'), S.wait(700), S.click('Дневник'), S.wait(400), S.shot('03-meals', true),
    S.click('Добавить в обед'), S.dialog('Ещё способы'), S.dialog('Только калории'), S.fill('Калории, ккал', '900'), S.dialog(/^Добавить \d/), S.wait(700), S.shot('04-over', true),
  ] },
  // 4. Рецепты под остаток и из холодильника
  { id: 'n4-recipes', query: '', steps: [
    S.tab('Питание'), S.click('Считаю калории и хочу точности'), S.click('Продолжить'), S.wait(600),
    S.click('Рецепты'), S.wait(600), S.shot('01-recipes', true),
    S.click('Ужин'), S.click('Быстро'), S.wait(300), S.shot('02-filtered', true),
    S.eval(async page => { await page.locator('.nutrition-diary').getByRole('button', { name: /^Добавить$/ }).first().click(); }), S.wait(400), S.shot('03-add-sheet'),
    S.dialog(/^Записать/), S.wait(700), S.click('Дневник'), S.wait(400), S.shot('04-added', true),
    S.click('Рецепты'), S.click('Из того, что есть'), S.wait(600), S.shot('05-fridge', true),
  ] },
  // 5. «+» на всех вкладках
  { id: 'n5-plus', query: '', steps: [
    S.click('Быстрая запись'), S.wait(400), S.shot('01-overview-plus'),
    S.close(), S.tab('Тренировки'), S.wait(500), S.click('Быстрая запись'), S.wait(400), S.shot('02-plan-plus'),
    S.dialog('Вес'), S.wait(600), S.shot('03-weight-form'),
    S.close(), S.tab('Прогресс'), S.click('Быстрая запись'), S.dialog('Замеры'), S.wait(600), S.shot('04-measure-form'),
    S.close(), S.tab('Питание'), S.click('Считаю калории и хочу точности'), S.click('Продолжить'), S.wait(600),
    S.tab('Обзор'), S.click('Быстрая запись'), S.dialog('Вода'), S.wait(700), S.shot('05-water-from-overview', true),
    S.tab('Обзор'), S.click('Быстрая запись'), S.dialog('Еда'), S.wait(700), S.shot('06-food-from-overview'),
    S.close(), S.tab('Обзор'), S.click('Быстрая запись'), S.dialog('Написать тренеру'), S.wait(700), S.shot('07-wish', true),
    S.tab('Обзор'), S.click('Быстрая запись'), S.press('Escape'), S.wait(300), S.shot('08-escape-closed'),
    S.click('Быстрая запись'), S.back(), S.wait(400), S.shot('09-back-closed'),
    S.click('Быстрая запись'), S.eval(async page => { await page.getByRole('dialog').locator('.quick-main').click(); }), S.wait(900), S.shot('10-workout', true),
  ] },
  // 6. «Обзор»: «Сегодня», «Записать подходы?»
  { id: 'n6-overview', query: '?mockWatch=1', steps: [
    S.wait(800), S.shot('01-overview', true), S.bottom('01b-overview-bottom'),
    S.click('Не сейчас'), S.wait(300), S.shot('02-later', true),
    S.eval(async page => { await page.reload(); await page.waitForTimeout(900); }), S.shot('03-after-reload', true),
    S.eval(async page => { await page.evaluate(() => localStorage.removeItem('fittrack.watchSuggest.hidden')); await page.reload(); await page.waitForTimeout(900); }),
    S.eval(async page => { await page.getByRole('button', { name: /^Записать подходы к/ }).click(); }), S.wait(1200), S.shot('04-workout-from-watch', true),
    S.back(), S.wait(600), S.shot('05-back-to-plan', true),
    S.tab('Обзор'), S.wait(500), S.eval(async page => { await page.locator('.today-strip__tile').first().click(); }), S.wait(500), S.shot('06-today-tap', true),
  ] },
  // 7. «Прогресс» → цели точками
  { id: 'n7-goals', query: '', steps: [
    S.tab('Прогресс'), S.wait(800), S.shot('01-progress', true), S.bottom('01b-progress-bottom'),
    S.eval(async page => { await page.locator('.goal-card').first().scrollIntoViewIfNeeded(); }), S.shot('02-goals'),
  ] },
  // 8. «Ещё → Как пользоваться» → туры
  { id: 'n8-tours', query: '', steps: [
    S.menu('Как пользоваться'), S.wait(500), S.shot('01-help', true),
    S.eval(async page => { await page.locator('.help-row:not(.help-row--plain)').filter({ hasText: 'Обзор' }).click(); }), S.wait(1500), S.shot('02-tour-overview-1'),
    S.click('Далее'), S.wait(900), S.shot('03-tour-overview-2'),
    S.click('Далее'), S.wait(900), S.shot('04-tour-overview-3'),
    S.click('Далее'), S.wait(900), S.shot('05-tour-overview-4'),
    S.click('Готово'), S.wait(400),
    S.menu('Как пользоваться'), S.wait(500), S.shot('06-help-passed', true),
    S.eval(async page => { await page.locator('.help-row:not(.help-row--plain)').filter({ hasText: 'Питание' }).click(); }), S.wait(1500), S.shot('07-tour-nutrition-1'),
    S.click('Далее'), S.wait(900), S.shot('08-tour-nutrition-2'),
    S.click('Далее'), S.wait(900), S.shot('09-tour-nutrition-3'),
    S.click('Далее'), S.wait(900), S.shot('10-tour-nutrition-4'),
    S.click('Закрыть'), S.wait(400),
    S.menu('Как пользоваться'), S.eval(async page => { await page.locator('.help-row:not(.help-row--plain)').filter({ hasText: 'Прогресс и цели' }).click(); }), S.wait(1500), S.shot('11-tour-progress-1'),
    S.click('Далее'), S.wait(900), S.shot('12-tour-progress-2'), S.click('Далее'), S.wait(900), S.shot('13-tour-progress-3'), S.click('Далее'), S.wait(900), S.shot('14-tour-progress-4'),
    S.click('Готово'), S.wait(300),
    S.menu('Как пользоваться'), S.eval(async page => { await page.locator('.help-row:not(.help-row--plain)').filter({ hasText: 'Тренировка в зале' }).click(); }), S.wait(1500), S.shot('15-tour-workout-1'),
    S.click('Далее'), S.wait(900), S.shot('16-tour-workout-2'), S.click('Далее'), S.wait(900), S.shot('17-tour-workout-3'), S.click('Далее'), S.wait(900), S.shot('18-tour-workout-4'),
  ] },
  // 9. Настройки
  { id: 'n9-settings', query: '', steps: [
    S.menu('Настройки'), S.wait(600), S.shot('01-settings', true),
    S.eval(async page => { await page.locator('.conn-row__main--button').first().click(); }), S.wait(400), S.shot('02-reminders', true),
    S.click('Скопировать данные для поддержки'), S.wait(400), S.shot('03-copied', true),
  ] },
  // 10. Программы тренера
  { id: 'n10-programs', query: '?mockShowcase=1', steps: [
    S.tab('Тренировки'), S.wait(800), S.shot('01-plan', true),
    S.eval(async page => { await page.locator('.programs__title, .programs').first().scrollIntoViewIfNeeded(); }), S.shot('02-programs-row'),
    S.click('Все'), S.wait(600), S.shot('03-showcase', true), S.bottom('03b-showcase-bottom'),
    S.eval(async page => { await page.getByRole('group', { name: 'Фильтры программ' }).getByRole('button').nth(1).click(); }), S.wait(300), S.shot('04-filtered', true),
    S.click('Сбросить фильтры'), S.wait(300),
    S.eval(async page => { await page.locator('.programs__group button').first().click(); }), S.wait(500), S.shot('05-program-card'),
    S.click('Хочу эту программу'), S.wait(700), S.shot('06-requested', true),
  ] },
  // 11. Тренер: карточка клиента — дневник, цели, витрина; Управление → Тарифы
  { id: 't11-trainer', query: '?mockRole=trainer', role: 'trainer', steps: [
    S.wait(800), S.shot('01-trainer-home', true),
    S.eval(async page => { await page.locator('.item').filter({ hasText: 'Анна Морозова' }).first().click(); }), S.wait(1000), S.shot('02-client-card', true),
    S.click('Питание'), S.wait(800), S.shot('03-client-diary', true),
    S.click('Ещё'), S.wait(400), S.shot('04-client-diary-more', true),
    S.click('Прогресс'), S.wait(800), S.shot('05-client-progress', true),
    S.click('Тренировки'), S.wait(800), S.shot('06-client-plan', true),
    S.menu('Управление'), S.wait(800), S.click('Тренеры и тарифы'), S.wait(400), S.click('Тарифы'), S.wait(600), S.shot('07-tariffs', true),
  ] },
];

async function run(page, step, ctx) {
  const [kind, a, b] = step;
  const dialog = () => page.getByRole('dialog').last();
  switch (kind) {
    case 'tab': await page.locator('.tabbar').getByRole('button', { name: a, exact: true }).click(); await page.waitForTimeout(500); return;
    case 'click': {
      const btn = page.getByRole('button', { name: a, exact: typeof a === 'string', ...(b || {}) });
      if (await btn.count()) { await btn.last().click({ timeout: 4000 }); } else await page.getByText(a, { exact: true }).last().click({ timeout: 4000 });
      return;
    }
    case 'dialog': await dialog().getByRole('button', { name: a, exact: typeof a === 'string', ...(b || {}) }).last().click({ timeout: 4000 }); return;
    case 'bottom': { await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(300); const file = join(ctx.dir, ctx.scenario + '-' + a + '.png'); await page.screenshot({ path: file }); ctx.files.push(file); await page.evaluate(() => window.scrollTo(0, 0)); return; }
    case 'text': await page.getByText(a, { exact: false }).first().click({ timeout: 4000 }); return;
    case 'fill': await page.getByLabel(a, { exact: true }).last().fill(b); return;
    case 'menu': await page.locator('.app__bar [aria-label="Меню"]').click(); await page.locator('.menu__item').filter({ hasText: a }).click(); return;
    case 'close': { const b = dialog().getByRole('button', { name: 'Закрыть', exact: true }); if (await b.count()) await b.first().click({ timeout: 4000 }); await page.waitForTimeout(350); return; }
    case 'back': await page.goBack(); return;
    case 'wait': await page.waitForTimeout(a); return;
    case 'press': await page.keyboard.press(a); return;
    case 'eval': await a(page); return;
    case 'shot': {
      const file = join(ctx.dir, ctx.scenario + '-' + a + '.png');
      await page.screenshot({ path: file, fullPage: !!b });
      ctx.files.push(file);
      const over = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
      if (over > 1) note(`[${ctx.variant}/${ctx.scenario}/${a}] горизонтальная прокрутка: +${over}px`);
      return;
    }
  }
}

async function contact(browser, variant, files, size) {
  // Сводный лист: все снимки варианта плитками, чтобы смотреть одним файлом
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const cells = files.map(f => `<figure><img src="file:///${f.replace(/\\/g, '/')}"><figcaption>${f.split(/[\\/]/).pop()}</figcaption></figure>`).join('');
  await page.setContent(`<style>body{margin:8px;background:#444;font:11px system-ui;color:#eee}main{display:flex;flex-wrap:wrap;gap:8px}figure{margin:0;width:${Math.round(size.width * 0.5)}px}img{width:100%;display:block;background:#fff}figcaption{padding:2px 0}</style><main>${cells}</main>`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(shots, `contact-${variant}.png`), fullPage: true });
  await page.close();
}

async function main() {
  if (!args['no-build']) {
    note('Сборка демо в dist-review…');
    execFileSync(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', out], { cwd: root, env: { ...process.env, VITE_MOCK: '1' }, stdio: 'ignore' });
  }
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.json': 'application/json' };
  const server = createServer((req, res) => {
    const name = decodeURIComponent(req.url.split('?')[0]);
    const file = join(out, name === '/' ? 'index.html' : name);
    const target = existsSync(file) && extname(file) ? file : join(out, 'index.html');
    res.writeHead(200, { 'Content-Type': types[extname(target)] || 'application/octet-stream' });
    res.end(readFileSync(target));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  mkdirSync(shots, { recursive: true });
  const only = args.only ? args.only.split(',') : null;
  for (const [variant, size] of variants) {
    const dir = join(shots, variant);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const files = [];
    for (const sc of SCENARIOS) {
      if (only && !only.includes(sc.id)) continue;
      const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, locale: 'ru-RU', reducedMotion: 'reduce', colorScheme: size.dark ? 'dark' : 'light', isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      const page = await context.newPage();
      page.setDefaultTimeout(5000);
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await page.addInitScript(() => { localStorage.setItem('auth_token_v1', 'demo-session'); localStorage.setItem('tour_seen_v1', '1'); localStorage.setItem('first_run_seen_v1', '1'); });
      // Тему приложение берёт из своей настройки (telegram.js), а не только из prefers-color-scheme
      if (size.dark) await page.addInitScript(() => { localStorage.setItem('app_theme_v1', 'dark'); });
      await page.goto(origin + (sc.role === 'trainer' ? '/trainer' : '/') + sc.query);
      if (size.big) await page.addStyleTag({ content: 'html { font-size: 24px !important; }' });
      await page.waitForTimeout(1800);
      // Первый запуск и туры не должны мешать сценариям: закрыть, если показались
      { const b = page.locator('.tour__skip'); if (await b.count()) { try { await b.first().click({ timeout: 1000 }); await page.waitForTimeout(300); } catch (_) { /* не было */ } } }
      const ctx = { variant, scenario: sc.id, dir, files };
      for (let i = 0; i < sc.steps.length; i++) {
        const step = sc.steps[i];
        try { await run(page, step, ctx); }
        catch (e) {
          const msg = String(e.message || e).split('\n')[0].slice(0, 160);
          note(`[${variant}/${sc.id}] шаг ${i + 1} ${step[0]} «${typeof step[1] === 'string' ? step[1] : String(step[1] || '')}»: ${msg}`);
          try { await page.screenshot({ path: join(dir, `${sc.id}-FAIL-${i + 1}.png`) }); } catch (_) { /* страница закрыта */ }
        }
      }
      if (errors.length) note(`[${variant}/${sc.id}] консоль: ${[...new Set(errors)].slice(0, 5).join(' | ').slice(0, 400)}`);
      await context.close();
    }
    await contact(browser, variant, files, size);
  }
  await browser.close();
  server.close();
  writeFileSync(join(shots, 'log.txt'), log.join('\n') + '\n');
  note('Готово: ' + shots);
}

main().catch(e => { console.error(e); process.exit(1); });
