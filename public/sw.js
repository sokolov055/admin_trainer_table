/**
 * Сервис-воркер: оболочка приложения отдаётся из кеша.
 *
 * До него каждый запуск с рабочего стола выглядел так: сходить на GitHub
 * Pages за index.html, оттуда за бандлом на 310 КБ, и только потом рисовать.
 * На телефоне в метро это секунды пустого экрана у человека, который
 * нажал иконку приложения и вправе ждать, что оно откроется как приложение.
 *
 * Правила по типам запросов разные, и это не украшательство:
 *
 * - Переходы (открытие приложения) берут index.html из кеша сразу, а сеть
 *   спрашивают в фоне. Свежая версия доедет и встанет на следующий запуск.
 *   Так запуск не зависит от сети вовсе — ценой одного запуска на старой
 *   версии после выкладки.
 *
 * - `assets/*` кешируются навсегда: Vite кладёт в имя файла хеш содержимого,
 *   и файл с таким именем уже не изменится. Новая сборка — новые имена.
 *
 * - Остальная статика (иконки, манифест, SDK Telegram) отдаётся из кеша и
 *   обновляется в фоне: имён с хешем у неё нет, и ждать выкладки нового
 *   воркера ради новой иконки не нужно.
 *
 * - `config.json` — наоборот, сначала сеть: это переключатель адреса API,
 *   он для того и лежит отдельно, чтобы менять его без пересборки. Кеш у
 *   него только на случай, когда сети нет совсем.
 *
 * - Чужие адреса (сервер API, telegram.org) воркер не трогает: кеш ответов
 *   с данными клиента здесь означал бы показ вчерашнего баланса.
 *
 * Версию поднимать при изменении САМИХ ПРАВИЛ. Обычная выкладка обновляет
 * файлы и без этого; поднятая версия просто выбросит весь кеш.
 */

const VERSION = 'v1';
const CACHE = 'shell-' + VERSION;

/** Сколько ждать сеть там, где кеш — запасной вариант, а не основной */
const NETWORK_TIMEOUT_MS = 3000;

const INDEX_URL = new URL('index.html', self.registration.scope).href;

self.addEventListener('install', () => {
  // Новый воркер не ждёт, пока закроются старые вкладки: ждать нечего,
  // правила обратно совместимы, а отложенное обновление означало бы, что
  // выложенная правка доезжает до человека через неделю.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch (_) {
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(openShell());
    return;
  }

  if (url.pathname.endsWith('/config.json')) {
    event.respondWith(networkFirst(url.href));
    return;
  }

  if (url.pathname.includes('/assets/')) {
    event.respondWith(cacheForever(request));
    return;
  }

  event.respondWith(cacheThenUpdate(request));
});

/**
 * Открытие приложения.
 *
 * Адрес перехода может нести токен из ссылки тренера (`?access=…`), но
 * страница у приложения одна, и кешируется она по чистому адресу — иначе
 * каждая персональная ссылка заводила бы в кеше свою копию оболочки.
 */
async function openShell() {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(INDEX_URL);

  if (cached) {
    // Обновление в фоне: ответ человеку уже ушёл, ждать сеть незачем
    refreshShell(cache);
    return cached;
  }

  try {
    const response = await fetch(INDEX_URL);
    if (response.ok) cache.put(INDEX_URL, response.clone());
    return response;
  } catch (error) {
    // Ни кеша, ни сети — пусть браузер покажет свою страницу об ошибке.
    // Своя заглушка здесь врала бы: приложение не сломано, сети нет.
    return Response.error();
  }
}

async function cacheForever(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function cacheThenUpdate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);

  if (cached) {
    refresh(cache, request);
    return cached;
  }

  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirst(href) {
  const cache = await caches.open(CACHE);

  try {
    const response = await withTimeout(fetch(href, { cache: 'no-store' }), NETWORK_TIMEOUT_MS);
    if (response.ok) cache.put(href, response.clone());
    return response;
  } catch (_) {
    const cached = await cache.match(href);
    if (cached) return cached;
    return Response.error();
  }
}

/**
 * Обновление оболочки в фоне — и слово странице, если оболочка сменилась.
 *
 * Без этого выложенная правка доезжала до человека молча и на следующий
 * запуск: он открывал приложение, видел вчерашнюю версию и решал, что
 * выкладки не было. Поэтому воркер не просто кладёт новую оболочку в кеш,
 * а сравнивает её с прежней и говорит открытой странице, что версия
 * сменилась. Перезагружаться или нет — решает страница: воркер не знает,
 * идёт ли сейчас тренировка.
 *
 * Сравниваем содержимое целиком, а не заголовки: у GitHub Pages ни ETag,
 * ни дата не обещают того, что нам нужно, а «файл изменился» — обещают.
 */
async function refreshShell(cache) {
  let fresh;
  try {
    fresh = await fetch(INDEX_URL, { cache: 'no-store' });
  } catch (_) {
    return;
  }

  if (!fresh.ok) return;

  const previous = await cache.match(INDEX_URL);
  const before = previous ? await previous.text() : '';
  const after = await fresh.clone().text();

  await cache.put(INDEX_URL, fresh);

  if (!before || before === after) return;

  const pages = await self.clients.matchAll({ type: 'window' });
  pages.forEach((page) => page.postMessage({ type: 'shell-updated' }));
}

/** Тихое обновление кеша. Ошибка сети здесь ничего не значит: показывать уже нечего */
function refresh(cache, request) {
  fetch(request)
    .then((response) => { if (response.ok) cache.put(request, response.clone()); })
    .catch(() => {});
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

/* ==========================================================================
 * Уведомления
 *
 * Пуш приходит и когда приложение закрыто — в этом весь смысл: телефон
 * лежит в кармане, а отдых между подходами кончился.
 *
 * Показать уведомление ОБЯЗАТЕЛЬНО: браузеры не дают получить пуш и
 * промолчать, и за молчание отбирают разрешение. Поэтому даже на пустое
 * или испорченное содержимое показываем что-то осмысленное.
 * ========================================================================== */

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { data = {}; }

  const title = data.title || 'Fit Track';

  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: 'icon-192.png',
    badge: 'icon-192.png',

    // Одинаковый тег заменяет прежнее уведомление, а не кладёт рядом:
    // три напоминания об отдыхе подряд — это не три дела, а одно.
    tag: data.tag || 'fit',
    renotify: true,
    data: { url: data.url || '' },
  }));
});

/**
 * Нажатие открывает приложение, а не новую вкладку: у человека оно уже
 * запущено в половине случаев, и вторая копия только запутает.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const target = new URL(event.notification.data?.url || '', self.registration.scope).href;

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

    for (const client of clients) {
      if (client.url.startsWith(self.registration.scope)) {
        await client.focus();
        if ('navigate' in client && event.notification.data?.url) await client.navigate(target);
        return;
      }
    }

    await self.clients.openWindow(target);
  })());
});
