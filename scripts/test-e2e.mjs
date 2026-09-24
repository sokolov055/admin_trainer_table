import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';

/**
 * Проход по экранам настоящим браузером.
 *
 * Остальные проверки смотрят на функции и данные, и этого не хватило:
 * пропавшее первое упражнение тренировки, вес в программе, который никто
 * не обновляет, таймер отдыха, уехавший за край экрана, — всё это нашёл
 * человек с телефоном, а не тесты. Ошибка такого рода живёт не в разборе
 * листа, а на экране, и увидеть её можно только открыв экран.
 *
 * Идём по демо-сборке (VITE_MOCK=1), а не по живому приложению. Причин
 * две: данные в ней те же самые при каждом запуске, поэтому проверка не
 * мигает, и ни одного настоящего клиента она не трогает — проходить весь
 * путь, вплоть до завершения тренировки и записи замера, можно смело.
 *
 * Живое приложение проверяется отдельно, после выкладки: там вопрос не
 * «работает ли кнопка», а «доехало ли то, что выложили».
 */

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = join(ROOT, 'dist-demo');
const VIEWPORT = { width: 390, height: 844 };

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
};

let server;
let browser;
let page;
let origin;

/** Ошибки в консоли — такой же провал, как непрошедший сценарий */
const consoleErrors = [];

before(async () => {
  execFileSync(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', 'dist-demo'], {
    cwd: ROOT,
    env: { ...process.env, VITE_MOCK: '1' },
    stdio: 'ignore',
  });

  server = createServer((req, res) => {
    const path = decodeURIComponent(req.url.split('?')[0]);
    const file = path === '/' ? join(OUT, 'index.html') : join(OUT, path);
    const target = existsSync(file) && extname(file) ? file : join(OUT, 'index.html');

    res.writeHead(200, { 'Content-Type': TYPES[extname(target)] || 'application/octet-stream' });
    res.end(readFileSync(target));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;

  browser = await chromium.launch();
  page = await browser.newPage({ viewport: VIEWPORT, locale: 'ru-RU' });

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(String(error)));
}, { timeout: 180000 });

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  rmSync(OUT, { recursive: true, force: true });
});

/** Открыть вкладку нижней панели */
const openTab = async (label) => {
  await page.getByRole('button', { name: label, exact: true }).click();
};

const section = (title) => page.locator('.section', { has: page.getByRole('heading', { name: title }) });

test('вход в кабинет доходит до программы', async () => {
  await page.goto(origin);

  // Главный путь — персональная ссылка от тренера; код спрятан во второй
  // способ, и это осознанно. Проверяем именно его: ссылку в демо взять
  // неоткуда, а пройти вход целиком надо.
  await page.getByText('Другой способ входа').click();
  await page.getByRole('button', { name: /Войти через код/ }).click();

  // Демо-сервер подтверждает код сам через несколько опросов — как человек
  // с телефоном, только быстрее.
  await page.getByRole('button', { name: 'Тренировки', exact: true }).waitFor({ timeout: 60000 });

  await openTab('Тренировки');
  await page.getByRole('heading', { name: /Тренировка 1/ }).waitFor({ timeout: 20000 });
});

/**
 * Первое упражнение блока терялось: строка с заголовком «Тренировка»
 * пропускалась целиком, а у части тренеров в ней же стоит первое
 * упражнение. Снаружи это выглядело так, что тренировка начинается со
 * второго.
 */
test('в блоке видны все упражнения, включая первое', async () => {
  const block = section('Тренировка 1 — верх');

  await assert.doesNotReject(block.getByText('Жим лёжа', { exact: true }).waitFor({ timeout: 5000 }));
  assert.equal(await block.locator('.exercise').count(), 4, 'ни одно упражнение не потерялось');
});

/**
 * Вес со строк программы убран намеренно: в листе месяца это план
 * тренера, занятие его не переписывает, и число рядом с упражнением
 * читалось как «твой рабочий вес».
 */
test('в программе нет весов — только подходы и повторы', async () => {
  const block = section('Тренировка 1 — верх');

  assert.equal(await block.locator('.exercise__weight').count(), 0);
  await assert.doesNotReject(block.getByText('4 × 8').waitFor({ timeout: 5000 }));
});

/** Суперсет в таблице не подписан словом — он должен собраться в группу */
test('суперсет показан одной группой с числом кругов', async () => {
  const group = section('Тренировка 2 — низ').locator('.superset');

  assert.equal(await group.count(), 1);
  await assert.doesNotReject(group.getByText(/Суперсет · 3 круга/).waitFor({ timeout: 5000 }));
  assert.equal(await group.locator('.exercise').count(), 2, 'в группе оба упражнения');
});

/**
 * Полный круг: провести тренировку и вернуться к программе. Проверяем
 * то, ради чего экран и сделан, — что проведённый блок помечен и ведёт к
 * настоящим весам.
 */
test('тренировку можно провести, и блок становится проведённым', async () => {
  await section('Тренировка 1 — верх').getByRole('button', { name: 'Начать тренировку' }).click();
  await page.getByRole('heading', { name: 'Тренировка 1 — верх' }).first().waitFor({ timeout: 20000 });

  // Отмечаем первый подход первого упражнения
  const first = page.locator('.workout__set').first();
  await first.getByRole('textbox').nth(1).fill('8');
  await first.locator('.workout__check').click();

  // Прошлый вес — подсказка рядом с планом: по ней в зале решают,
  // добавлять ли сегодня.
  await assert.doesNotReject(
    page.locator('.workout__exercise').first().getByText('было 70').waitFor({ timeout: 5000 }),
  );

  // Таймер отдыха должен быть виден на любом упражнении, а не только в шапке
  await page.getByLabel('Таймер отдыха').selectOption('60');
  const rest = page.locator('.workout__rest--float');
  await rest.waitFor({ timeout: 5000 });
  assert.ok(await rest.isVisible(), 'полоса отдыха прижата к низу экрана');

  await page.getByRole('button', { name: 'Завершить тренировку' }).click();
  await page.getByRole('button', { name: 'Подтвердить' }).click();

  // Журнал открыт ВНУТРИ экрана программы, поэтому назад ведёт «К
  // программе», а не вкладка внизу: вкладка уже выбрана, и нажатие на неё
  // ничего не закрывает.
  await page.getByRole('button', { name: 'К программе' }).click({ timeout: 20000 });

  // Проведённая тренировка уезжает во вторую вкладку: наверху очереди
  // должна оставаться та, которую делать следующей.
  await page.getByRole('tab', { name: /^Выполненные/ }).click({ timeout: 20000 });

  const done = section('Тренировка 1 — верх').locator('.plan__done');
  await done.waitFor({ timeout: 20000 });
  await assert.doesNotReject(done.getByText('Тренировка проведена').waitFor({ timeout: 5000 }));

  await done.getByRole('button', { name: 'Посмотреть веса' }).click();
  await page.getByRole('heading', { name: 'Тренировка 1 — верх' }).first().waitFor({ timeout: 20000 });
});

/**
 * Замер вносят с телефона сразу после весов. Проверяем и отказ: пустая
 * форма должна объяснять, чего от человека ждут, а не молчать погасшей
 * кнопкой.
 */
/**
 * Наверху очереди — следующая невыполненная. К середине месяца
 * проведённых больше, чем оставшихся, и они отодвигали бы её вниз.
 */
test('проведённая тренировка уходит из очереди', async () => {
  await page.getByRole('button', { name: 'К программе' }).click({ timeout: 20000 });
  await page.getByRole('tab', { name: /^Очередь/ }).click({ timeout: 20000 });

  // Только видимый раздел: посещённые остаются в разметке спрятанными
  const titles = await page.locator('#root main:not([hidden]) .section__title').allInnerTexts();

  assert.equal(titles.includes('Тренировка 1 — верх'), false, 'проведённой в очереди нет');
  assert.equal(titles[0], 'Тренировка 2 — низ', 'наверху следующая невыполненная');
});

test('замер записывается, а пустая форма объясняет отказ', async () => {
  await openTab('Прогресс');
  await page.getByRole('button', { name: 'Записать замер' }).click({ timeout: 20000 });

  await page.getByRole('button', { name: 'Записать' }).click();
  await assert.doesNotReject(
    page.getByText('Введите хотя бы один показатель.').waitFor({ timeout: 5000 }),
  );

  await page.getByRole('textbox', { name: 'Вес, кг' }).fill('75,4');
  await page.getByRole('button', { name: 'Записать' }).click();

  await assert.doesNotReject(page.getByText(/Замер за .* записан/).waitFor({ timeout: 20000 }));
});

/**
 * Профиль — пункт бокового меню, открывается отдельным экраном. Заполняют его между делом, поэтому проверяем
 * не «форма есть», а то, что незаполненное не мешает сохранить, а мусор
 * объясняет себя.
 */
test('профиль сохраняется и объясняет опечатку', async () => {
  await page.getByRole('button', { name: 'Меню' }).click();
  await page.getByRole('button', { name: /Мои данные/ }).click();
  await page.getByRole('textbox', { name: 'Рост, см' }).waitFor({ timeout: 10000 });

  await page.getByRole('textbox', { name: 'Рост, см' }).fill('17');
  await page.getByRole('button', { name: 'Сохранить' }).click();

  await assert.doesNotReject(
    page.getByText(/от 100 до 250/).waitFor({ timeout: 10000 }),
    'опечатку в росте не записываем молча',
  );

  await page.getByRole('textbox', { name: 'Рост, см' }).fill('168');
  await page.getByRole('textbox', { name: 'Имя пользователя' }).fill('@anna_fit');
  await page.getByRole('button', { name: 'Сохранить' }).click();

  await assert.doesNotReject(page.getByText('Сохранено.').waitFor({ timeout: 10000 }));

  // Тренеру нужна не строка, а ссылка, по которой открывается переписка
  await assert.doesNotReject(
    page.getByRole('link', { name: 'Открыть переписку' }).waitFor({ timeout: 5000 }),
  );
});

/**
 * Правка программы — тренерская работа, и у клиента её быть не должно.
 *
 * Сам редактор живёт в тренерской оболочке, которую этот проход не
 * открывает: вход туда — отдельный сценарий, и покрывать его надо
 * отдельно. А вот то, что клиенту он не достаётся, проверяется здесь и
 * стоит одной строки: права — это не то, о чём узнают из отчёта.
 */
test('клиенту правка программы не предлагается', async () => {
  const forbidden = ['Изменить программу', 'Новый месяц', 'Сохранить программу'];

  for (const label of forbidden) {
    assert.equal(await page.getByRole('button', { name: label }).count(), 0, label);
  }
});

/**
 * Вход по персональной ссылке — так клиенты попадают в кабинет.
 *
 * Здесь жили две поломки, которые видел только человек с телефоном.
 * Во встроенном браузере Telegram вместо входа стояла стена «Откройте в
 * Safari», и клиенты считали, что ссылка не грузится. А после входа
 * кабинет висел скелетом до ручной перезагрузки: загрузку, запущенную
 * сохранённым ключом, затирал сброс состояния на «Готово». Демо-сервер
 * отвечает мгновенно, поэтому гонка воспроизводится здесь каждый раз.
 *
 * Отдельный контекст с агентом iPhone-Telegram: свой localStorage, чтобы
 * не зависеть от входа по коду в первом сценарии.
 */
test('ссылка тренера из Telegram на iPhone открывает кабинет без перезагрузки', async () => {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    locale: 'ru-RU',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  });
  const phone = await context.newPage();
  phone.on('pageerror', (error) => consoleErrors.push(String(error)));

  try {
    await phone.goto(origin + '/?access=' + 'A'.repeat(44));

    await phone.getByRole('heading', { name: 'Анна Морозова' }).waitFor({ timeout: 10000 });
    await assert.doesNotReject(
      phone.getByText(/открыть в Safari/i).first().waitFor({ timeout: 5000 }),
      'совет про Safari остаётся, но под входом',
    );

    await phone.getByRole('button', { name: 'Войти в кабинет' }).click();

    await assert.doesNotReject(
      phone.getByRole('button', { name: 'Тренировки', exact: true }).waitFor({ timeout: 10000 }),
      'кабинет открывается сам, без перезагрузки',
    );
    assert.equal(new URL(phone.url()).searchParams.has('access'), false, 'ключ ссылки убран из адреса');
  } finally {
    await context.close();
  }
});

/**
 * Жесты пальцем: смахнуть вправо — назад, потянуть вниз — обновить.
 *
 * Палец ведём настоящими событиями касания по кадрам, а не вызовом
 * функции: проверить надо ровно то, что делает человек, — с выбором
 * направления после первых пикселей и с решением на отпускании.
 */
async function swipe(page, from, to, { steps = 12, frameMs = 16 } = {}) {
  await page.evaluate(async ({ from, to, steps, frameMs }) => {
    const target = document.elementFromPoint(from.x, from.y) || document.body;
    const touch = (x, y) => new Touch({ identifier: 1, target, clientX: x, clientY: y });
    const fire = (type, x, y) => {
      const t = touch(x, y);
      target.dispatchEvent(new TouchEvent(type, {
        bubbles: true,
        cancelable: true,
        touches: type === 'touchend' ? [] : [t],
        targetTouches: type === 'touchend' ? [] : [t],
        changedTouches: [t],
      }));
    };
    const wait = () => new Promise((r) => setTimeout(r, frameMs));

    fire('touchstart', from.x, from.y);
    for (let i = 1; i <= steps; i += 1) {
      await wait();
      fire('touchmove', from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
    }
    await wait();
    fire('touchend', to.x, to.y);
  }, { from, to, steps, frameMs });
}

test('смахнуть вправо возвращает из «Моих данных», вниз — обновляет', async () => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'ru-RU',
    hasTouch: true,
    isMobile: true,
  });
  const phone = await context.newPage();
  phone.on('pageerror', (error) => consoleErrors.push(String(error)));

  try {
    await phone.goto(origin + '/?access=' + 'A'.repeat(44));
    await phone.getByRole('button', { name: 'Войти в кабинет' }).click();
    await phone.locator('#root .app__subtitle', { hasText: 'Обзор' }).waitFor({ timeout: 10000 });

    // Назад: из экрана меню пальцем вправо — на вкладку, откуда пришли
    await phone.getByRole('button', { name: 'Меню' }).click();
    await phone.getByRole('button', { name: /Мои данные/ }).click();
    await phone.locator('#root .app__subtitle', { hasText: 'Мои данные' }).waitFor({ timeout: 5000 });
    // Меню закрывается с анимацией — пока оно в DOM, жесты выключены
    await phone.waitForFunction(() => document.body.style.overflow !== 'hidden', null, { timeout: 5000 });

    // Прямо по полям анкеты: над полем, где не печатают, «назад» работает
    await swipe(phone, { x: 60, y: 420 }, { x: 330, y: 430 });

    await assert.doesNotReject(
      phone.locator('#root .app__subtitle', { hasText: 'Обзор' }).waitFor({ timeout: 5000 }),
      'смахнули вправо — вернулись на обзор',
    );
    // Пока едет сцена, на ней копии экранов — дожидаемся настоящего
    await phone.waitForFunction(() => !document.querySelector('.swipeback'), null, { timeout: 3000 });

    // Возвращённый экран встаёт без лесенки появления: снимок уже показал
    // его целиком, и повторное проявление мигало
    assert.equal(
      await phone.evaluate(() => getComputedStyle(document.querySelector('#root .enter')).animationName),
      'none',
      'после жеста экран не проявляется заново',
    );
    // И не проявляется позже: снятие класса «после жеста» раньше
    // перезапускало анимацию на уже видимых блоках — они «мигали»
    await phone.waitForTimeout(900);
    assert.equal(
      await phone.evaluate(() => getComputedStyle(document.querySelector('#root .enter')).animationName),
      'none',
      'через секунду блоки не проявляются заново',
    );

    // Лента одна: разделы нижнего меню, а за последним — боковое меню.
    // Влево — следующий раздел; «вперёд» на прежний экран больше нет.
    await phone.waitForTimeout(700);
    await swipe(phone, { x: 330, y: 420 }, { x: 60, y: 430 });
    await phone.waitForFunction(() => !document.querySelector('.swipeback'), null, { timeout: 3000 });
    assert.equal(await phone.locator('#root .app__subtitle').textContent(), 'Тренировки', 'влево — следующий раздел');

    await swipe(phone, { x: 60, y: 420 }, { x: 330, y: 430 });
    await phone.waitForFunction(() => !document.querySelector('.swipeback'), null, { timeout: 3000 });
    assert.equal(await phone.locator('#root .app__subtitle').textContent(), 'Обзор', 'вправо — предыдущий');

    // Раздел, где уже были, не пересобирается: тот же экран и то же
    // место прокрутки — переход без задержки загрузки
    await phone.getByRole('button', { name: 'Тренировки', exact: true }).click();
    const scrolled = await phone.evaluate(() => {
      window.__kept = document.querySelector('#root main:not([hidden])');
      window.scrollTo(0, 300);
      return Math.round(window.scrollY);
    });
    assert.ok(scrolled > 0, 'раздел длинный — есть что прокрутить');
    await phone.getByRole('button', { name: 'Прогресс', exact: true }).click();
    await phone.evaluate(() => window.scrollTo(0, 0));
    await phone.getByRole('button', { name: 'Тренировки', exact: true }).click();
    assert.equal(await phone.evaluate(() => document.querySelector('#root main:not([hidden])') === window.__kept), true, 'тот же экран, не собран заново');
    assert.equal(await phone.evaluate(() => Math.round(window.scrollY)), scrolled, 'прокрутка на своём месте');
    await phone.getByRole('button', { name: 'Обзор', exact: true }).click();
    await phone.evaluate(() => window.scrollTo(0, 0));

    // Первый раздел — дальше вправо некуда: резина и возврат на место
    await swipe(phone, { x: 60, y: 420 }, { x: 330, y: 430 });
    await phone.waitForFunction(() => !document.querySelector('.swipeback'), null, { timeout: 3000 });
    assert.equal(await phone.locator('#root .app__subtitle').textContent(), 'Обзор', 'с первого раздела вправо некуда');

    // С последнего раздела влево — боковое меню тянется за пальцем, а
    // страница стоит на месте. Чуть потянули и медленно отпустили — меню
    // уезжает обратно.
    await phone.getByRole('button', { name: 'Питание', exact: true }).click();
    await phone.locator('#root .app__subtitle', { hasText: 'Питание' }).waitFor({ timeout: 5000 });
    await phone.waitForTimeout(300);
    await swipe(phone, { x: 330, y: 420 }, { x: 290, y: 422 }, { steps: 20, frameMs: 30 });
    assert.equal(await phone.locator('.swipeback').count(), 0, 'страница не съезжает');
    await phone.waitForFunction(() => document.body.style.overflow !== 'hidden', null, { timeout: 5000 });
    assert.equal(await phone.getByRole('button', { name: 'Закрыть меню' }).count(), 0, 'короткий жест меню не оставляет');
    await swipe(phone, { x: 330, y: 420 }, { x: 150, y: 430 });
    await assert.doesNotReject(
      phone.getByRole('button', { name: 'Закрыть меню' }).waitFor({ timeout: 3000 }),
      'за последним разделом — боковое меню',
    );
    await phone.getByRole('button', { name: 'Закрыть меню' }).click();
    await phone.waitForFunction(() => document.body.style.overflow !== 'hidden', null, { timeout: 5000 });

    // Короткое движение без скорости «назад» не делает: экран пружиной
    // возвращается на место
    await phone.getByRole('button', { name: 'Меню' }).click();
    await phone.getByRole('button', { name: /Настройки/ }).click();
    await phone.waitForFunction(() => document.body.style.overflow !== 'hidden', null, { timeout: 5000 });
    // На экране бокового меню нижнее меню уезжает, а не висит пустым
    assert.equal(await phone.locator('.tabbar').getAttribute('aria-hidden'), 'true', 'нижнее меню спрятано');
    await swipe(phone, { x: 60, y: 60 }, { x: 110, y: 62 }, { steps: 20, frameMs: 30 });
    await phone.waitForTimeout(700);
    assert.equal(await phone.locator('#root .app__subtitle').textContent(), 'Настройки', 'короткий жест не уводит');

    // Потянуть вниз: индикатор докручивается до конца обновления и уходит
    await swipe(phone, { x: 195, y: 160 }, { x: 195, y: 520 }, { steps: 16 });
    await assert.doesNotReject(
      phone.locator('.pull--spinning').waitFor({ timeout: 3000 }),
      'потянули за порог — пошло обновление',
    );
    await assert.doesNotReject(
      phone.waitForFunction(() => !document.querySelector('.pull--spinning'), null, { timeout: 8000 }),
      'обновилось — индикатор ушёл',
    );
  } finally {
    await context.close();
  }
});

/**
 * Просмотр глазами клиента — та же лента, что у клиента, а слева от
 * первого раздела — список клиентов тренера. Смахнули вправо с первого
 * раздела — вернулись к списку.
 */
test('из просмотра глазами клиента смахивание вправо возвращает к списку клиентов', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', hasTouch: true, isMobile: true });
  const phone = await context.newPage();
  phone.on('pageerror', (error) => consoleErrors.push(String(error)));

  try {
    await phone.goto(origin + '/?mockRole=trainer');
    await phone.evaluate(() => localStorage.setItem('auth_token_v1', 'demo-session'));
    await phone.goto(origin + '/?mockRole=trainer');

    await phone.getByRole('button', { name: 'Меню' }).click();
    await phone.getByRole('button', { name: /Клиентская версия/ }).click();
    await phone.getByText('Выберите клиента').waitFor({ timeout: 10000 });
    await phone.waitForFunction(() => document.body.style.overflow !== 'hidden', null, { timeout: 5000 });

    await phone.locator('#root main:not([hidden]) .item').first().click();
    await phone.getByText('Вы смотрите как клиент').waitFor({ timeout: 10000 });
    await phone.waitForTimeout(500);

    await swipe(phone, { x: 60, y: 420 }, { x: 330, y: 430 });
    await phone.waitForFunction(() => !document.querySelector('.swipeback'), null, { timeout: 4000 });

    await assert.doesNotReject(
      phone.locator('#root').getByText('Выберите клиента').waitFor({ timeout: 5000 }),
      'вернулись к списку клиентов',
    );
  } finally {
    await context.close();
  }
});

test('за весь проход в консоли не было ошибок', () => {
  assert.deepEqual(consoleErrors, []);
});
