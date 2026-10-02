/**
 * api.js — единственная точка общения с Apps Script.
 *
 * ГЛАВНОЕ, ЧТО НУЖНО ЗНАТЬ О СКОРОСТИ
 *
 * Apps Script отвечает за секунды, и это почти не зависит от объёма
 * данных: пустой health check стоит столько же, сколько выборка по всем
 * клиентам. Платит время сам факт обращения — холодный старт контейнера
 * плюс редирект на второй домен. Замеры дают разброс от 2 до 60 секунд.
 *
 * Поэтому здесь три приёма, и порядок важен:
 *
 * 1. Показать сразу то, что уже есть. Ответы складываются в localStorage,
 *    и при следующем открытии экран рисуется мгновенно — из прошлых
 *    данных, — а свежие подгружаются в фоне и тихо заменяют их. Человек
 *    не смотрит в пустой экран, пока где-то просыпается контейнер.
 *
 * 2. Ходить реже: несколько действий уезжают одним запросом (batch).
 *
 * 3. Не ходить дважды за одним и тем же: одинаковые запросы, отправленные
 *    одновременно, склеиваются в один.
 *
 * Две особенности Apps Script, из-за которых код выглядит именно так:
 *
 * CORS. Он не отвечает на preflight OPTIONS, поэтому запрос обязан быть
 * «простым» — отсюда Content-Type: text/plain даже для JSON-тела.
 *
 * Редирект. На POST он отвечает редиректом на googleusercontent.com.
 * Браузер по нему идёт сам, но в некоторых WebView это ломается, поэтому
 * при сбое POST запрос повторяется через GET.
 */

import { getInitData } from './telegram.js';
import { getToken, clearToken } from './session.js';
import { loadApiConfig, currentApiUrl, fallbackApiUrl } from './apiConfig.js';

/** Сколько данные из localStorage считаются пригодными для показа.
 *  Не «свежими» — именно пригодными: их всё равно тут же обновляют. */
const STALE_TTL_MS = 12 * 60 * 60 * 1000;

/** Без связи показываем и более старое — лишь бы не пустой экран */
const OFFLINE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Дольше ответа не ждём. Без предела запрос на плохой мобильной связи
 * висел бесконечно, и экран так и стоял на «Открываем журнал…»
 * (27.09.2026, LTE: запросы до сервера не доходили вовсе). Через 20 с —
 * «сервер не отвечает», и экран работает с тем, что есть на телефоне.
 */
const REQUEST_TIMEOUT_MS = 20000;

/**
 * Связи нет — не ждать каждый раз по 20 с (02.10.2026). Под «белыми
 * списками» мобильного оператора соединение не обрывается, а висит: каждый
 * запрос выжидал весь предел, и приложение казалось зависшим, хотя
 * сохранённое уже на экране. Сервер только что не ответил — следующие две
 * минуты ждём не дольше 6 с; ответил — снова обычный предел. Запись при
 * этом не теряется: занятие сохраняется повторно с тем же номером запроса.
 */
const QUIET_TIMEOUT_MS = 6000;
const QUIET_FOR_MS = 120000;
let quietUntil = 0;
const requestTimeout = () => (Date.now() < quietUntil ? QUIET_TIMEOUT_MS : REQUEST_TIMEOUT_MS);

const STORAGE_PREFIX = 'api_cache_v1:';

export class ApiError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'ApiError';
    this.code = code || 0;
  }
}

/** Кэш на время жизни страницы */
const memory = new Map();

/** Запросы, которые прямо сейчас в полёте — чтобы не дублировать */
const inFlight = new Map();

function cacheKey(action, params) {
  return action + '|' + JSON.stringify(params || {});
}

export function clearApiCache() {
  memory.clear();
  inFlight.clear();
  try {
    Object.keys(localStorage)
      .filter((k) => k.indexOf(STORAGE_PREFIX) === 0)
      .forEach((k) => localStorage.removeItem(k));
  } catch (_) {}
}

/* ==========================================================================
 * Хранилище между запусками
 * ========================================================================== */

/**
 * offline — связи нет: годится и старше 12 часов, и помеченное после
 * записи (dirty). Пустой экран «сервер не отвечает» хуже вчерашних цифр:
 * приложение открывают и в зале без сети (27.09.2026, iPhone в авиарежиме).
 */
function readStored(key, offline = false) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.at !== 'number') return null;
    if (Date.now() - parsed.at > (offline ? OFFLINE_TTL_MS : STALE_TTL_MS)) return null;
    if (parsed.dirty && !offline) return null;

    return parsed;
  } catch (_) {
    // приватный режим, переполнение, испорченное значение — просто нет кэша
    return null;
  }
}

function writeStored(key, data) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify({ at: Date.now(), data }));
  } catch (_) {
    // Хранилище переполнено — выбрасываем свои старые записи и пробуем ещё раз
    try {
      Object.keys(localStorage)
        .filter((k) => k.indexOf(STORAGE_PREFIX) === 0)
        .forEach((k) => localStorage.removeItem(k));
      localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify({ at: Date.now(), data }));
    } catch (_) {}
  }
}

/* ==========================================================================
 * Запрос
 * ========================================================================== */

/**
 * @param {string} action   имя эндпоинта, например 'client.plan'
 * @param {object} params   параметры запроса
 * @param {object} options  { fresh: true } — мимо кэша
 */
export async function api(action, params = {}, options = {}) {
  const key = cacheKey(action, params);

  if (!options.fresh && memory.has(key)) return memory.get(key);

  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = request(action, params)
    .then((data) => {
      memory.set(key, data);
      writeStored(key, data);
      inFlight.delete(key);
      return data;
    })
    .catch((err) => {
      inFlight.delete(key);
      // Нет связи (код 0 — сервер не ответил вовсе) — последнее, что
      // знали. Отказ сервера (права, вход) так не подменяем.
      if (err && err.code === 0) {
        const old = readStored(key, true);
        if (old) return old.data;
      }
      throw err;
    });

  inFlight.set(key, promise);
  return promise;
}

/**
 * Чтение с показом устаревшего значения.
 *
 * Возвращает { data, stale, promise }: data — то, что можно нарисовать
 * прямо сейчас (или null), promise — свежие данные, когда приедут.
 * Благодаря этому экран появляется мгновенно и обновляется на месте.
 */
export function apiStale(action, params = {}) {
  const key = cacheKey(action, params);

  let cached = null;
  let stale = false;

  if (memory.has(key)) {
    cached = memory.get(key);
  } else {
    const stored = readStored(key);
    if (stored) {
      cached = stored.data;
      stale = true;
      memory.set(key, cached);
    }
  }

  return { data: cached, stale, promise: api(action, params, { fresh: true }) };
}

/**
 * Несколько действий одним запросом.
 * Результаты раскладываются по тем же ключам кэша, что и одиночные вызовы,
 * поэтому последующий api() за тем же действием попадёт в кэш.
 */
export async function apiBatch(requests) {
  let body;
  try {
    body = await request('batch', {
      requests: requests.map((r) => ({ action: r.action, params: r.params || {} })),
    });
  } catch (error) {
    // Нет связи — собираем пакет из того, что знали (как api() без сети):
    // «Прогресс» раньше без сети был пустым, хотя замеры лежали на телефоне
    if (!error || error.code !== 0) throw error;
    const out = {};
    let any = false;
    requests.forEach((r) => {
      const old = readStored(cacheKey(r.action, r.params || {}), true);
      if (old) { any = true; out[r.action] = { ok: true, data: old.data }; }
      else out[r.action] = { ok: false, error };
    });
    if (!any) throw error;
    return out;
  }

  const out = {};

  (body.results || []).forEach((res, i) => {
    const req = requests[i] || {};
    const key = cacheKey(res.action, req.params || {});

    if (res.ok) {
      memory.set(key, res.data);
      writeStored(key, res.data);
      out[res.action] = { ok: true, data: res.data };
    } else {
      out[res.action] = { ok: false, error: new ApiError(res.error, res.code) };
    }
  });

  return out;
}

/**
 * Запрос до входа: запросить код и спросить, подтвердили ли его.
 *
 * Мимо кэша и мимо склейки одинаковых запросов — оба приёма здесь вредны.
 * Кэш вернул бы «ещё ждём» навсегда, а склейка — один и тот же ответ на
 * два подряд идущих опроса.
 */
export function apiPublic(action, params = {}) {
  return request(action, params);
}

/**
 * Чувствительные одноразовые действия выполняются только на основном
 * Node-сервере и только POST-запросом. Билет нельзя повторять через GET:
 * иначе секрет попадёт в адрес, историю браузера и журналы прокси.
 */
/**
 * Сколько ждать основной сервер на входе.
 *
 * Без предела запрос в плохой сети висел, сколько решит система, — на
 * iPhone это минуты, — и человек смотрел на «Проверяем ссылку», не
 * понимая, что делать. Действия здесь короткие: вход, проверка ссылки,
 * билет для установки. Если за это время ответа нет, честнее сказать
 * «сервер не отвечает» и дать повторить.
 */
const PRIMARY_TIMEOUT_MS = 20000;

export async function apiPrimary(action, params = {}) {
  if (import.meta.env.VITE_MOCK === '1') {
    const { mockApi } = await import('./mock.js');
    return mockApi(action, params);
  }

  await loadApiConfig();
  const url = currentApiUrl();
  if (!url) throw new ApiError('Не задан адрес API — проверьте config.json рядом с приложением.', 0);

  const initData = getInitData();
  const token = initData ? '' : getToken();
  const payload = { action, initData, ...(token ? { token } : {}), ...params };

  let body;
  try {
    body = await postJson(url, payload, Date.now() < quietUntil ? QUIET_TIMEOUT_MS : PRIMARY_TIMEOUT_MS);
  } catch (_) {
    // Частая причина — VPN: через него сервер нередко недоступен, а
    // приложение из кеша при этом открывается и выглядит сломанным.
    throw new ApiError('Сервер не отвечает. Если включён VPN — выключите его; иначе проверьте связь и попробуйте ещё раз.', 0);
  }

  if (!body || body.ok !== true) {
    // Вход стираем только когда сервер прямо сказал, что этой сессии у
    // него нет. Раньше это делал ЛЮБОЙ отказ с кодом 401 — и один сбойный
    // ответ выбрасывал человека на экран входа, хотя сессия была жива.
    if (token && body && body.sessionInvalid) {
      clearApiCache();
      clearToken();
    }
    throw new ApiError((body && body.error) || 'Неизвестная ошибка сервера', (body && body.code) || 500);
  }
  return body.data;
}

/**
 * Выход с этого устройства.
 *
 * Сервер гасит ключ у себя, мы — у себя. Если сервер недоступен, выходим
 * всё равно: человек нажал «Выйти», и отказать ему из-за связи нельзя.
 * Ключ на сервере доживёт свой срок сам, а данные с устройства уйдут
 * сейчас — это то, ради чего кнопку и нажимают.
 */
export async function logout() {
  try {
    await request('auth.logout', {});
  } catch (_) {}

  clearApiCache();
  clearToken();
  // Виджеты iPhone: на экране блокировки не должно остаться занятий
  import('./native-widget.js').then((m) => m.forgetWidgets()).catch(() => {});
}

async function request(action, params) {
  if (import.meta.env.VITE_MOCK === '1') {
    const { mockApi } = await import('./mock.js');
    return mockApi(action, params);
  }

  // Адрес приезжает из config.json рядом с приложением: так переезд между
  // бэкендами не требует пересборки
  await loadApiConfig();

  const url = currentApiUrl();
  if (!url) {
    throw new ApiError('Не задан адрес API — проверьте config.json рядом с приложением.', 0);
  }

  const initData = getInitData();

  // Подпись Telegram главнее выданного ключа, и это не вкусовщина: сервер,
  // получив ключ, проверяет ТОЛЬКО его (server/src/lib/auth.js). Отправь мы
  // оба сразу — запуск из мессенджера пошёл бы по пути «вход с устройства»
  // и однажды сломался бы на чужом или просроченном ключе, хотя рядом
  // лежит свежая подпись. Поэтому ключ едет, лишь когда подписи нет.
  const token = initData ? '' : getToken();

  const payload = { action, initData, ...(token ? { token } : {}), ...params };

  const timeout = requestTimeout();
  let body = await tryEndpoint(url, payload, timeout);

  // Запасной адрес: основной не соединился — идём на запасной. С
  // 27.09.2026 это тот же сервер под прежним именем (nip.io рядом с
  // api.fitness100.ru), поэтому годится для всего.
  //
  // Раньше запасным был Apps Script — тогда без данных семьи (он про семью
  // не знал) и без тренировок (они живут только на сервере). Эти запреты
  // остаются, если запасной адрес снова окажется скриптом.
  //
  // Не дождались ответа (TIMED_OUT) — на запасной не идём: запрос мог дойти
  // до сервера, и повтор записи задвоил бы её.
  const spare = fallbackApiUrl();
  const spareIsScript = /script\.google/.test(spare || '');
  const scriptWouldLie = spareIsScript && (JSON.stringify(params).includes('"familyRow"') || trainingAction(action, params));
  if (body === null && spare && spare !== url && !scriptWouldLie) {
    body = await tryEndpoint(spare, payload, timeout);
  }
  if (body === TIMED_OUT) body = null;
  // Не дозвались — пару минут ждём коротко; дозвались — как обычно
  quietUntil = body === null ? Date.now() + QUIET_FOR_MS : 0;

  if (body === null) {
    throw new ApiError('Сервер не отвечает. Проверьте связь и попробуйте ещё раз.', 0);
  }

  if (!body || body.ok !== true) {
    // Конец срока ключа — не поломка: он живёт 90 дней, и рано или поздно
    // этот ответ придёт у всех. Но ключ выбрасываем только когда сервер
    // прямо сказал, что этой сессии у него нет. Любой другой отказ — повод
    // показать ошибку и дать повторить, а не выбрасывать человека на экран
    // входа: так один сбойный ответ отправлял тренера заново подтверждать
    // вход через бота, хотя сессия была жива.
    if (token && body && body.sessionInvalid) {
      // Кэш чистим целиком: в нём лежат данные того, кто только что вышел
      clearApiCache();
      clearToken();
    }

    throw new ApiError(
      (body && body.error) || 'Неизвестная ошибка сервера',
      (body && body.code) || 500
    );
  }

  return body.data;
}

/** Не дождались ответа — это не «не соединились»: см. запасной адрес в request */
const TIMED_OUT = Symbol('timed-out');

/**
 * Один адрес: сначала POST, при сбое — GET. null, если не отозвался вовсе.
 * Не дождались ответа — GET не пробуем: запрос мог дойти до сервера, и
 * повтор записи (оплата, занятие) задвоил бы её.
 */
async function tryEndpoint(url, payload, timeoutMs) {
  try {
    return await postJson(url, payload, timeoutMs);
  } catch (error) {
    if (error && error.name === 'AbortError') return TIMED_OUT;
    try {
      return await getJson(url, payload, timeoutMs);
    } catch (_) {
      return null;
    }
  }
}

async function postJson(url, payload, timeoutMs) {
  // Предел ставим только там, где его попросили: у Apps Script честный
  // ответ бывает и через минуту, и обрывать его значило бы ломать рабочее.
  const controller = timeoutMs && typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const resp = await fetch(url, {
      method: 'POST',
      // text/plain — единственный способ обойтись без preflight (см. шапку)
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
      ...(controller ? { signal: controller.signal } : {}),
    });
    return await resp.json();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function getJson(url, payload, timeoutMs = 0) {
  const qs = Object.keys(payload)
    .filter((k) => payload[k] !== undefined && payload[k] !== null)
    .map((k) => {
      const v = typeof payload[k] === 'object' ? JSON.stringify(payload[k]) : payload[k];
      return encodeURIComponent(k) + '=' + encodeURIComponent(v);
    })
    .join('&');

  // Тот же предел, что у POST: без него запасной путь висел бесконечно
  const controller = timeoutMs && typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const resp = await fetch(url + '?' + qs, { method: 'GET', redirect: 'follow', ...(controller ? { signal: controller.signal } : {}) });
    return await resp.json();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Операция, меняющая данные.
 *
 * Отличается от обычного запроса тремя вещами, и каждая важна:
 *
 * 1. Никогда не берётся из кэша. Повторное «провести оплату» должно
 *    проводить оплату, а не возвращать прошлый ответ.
 *
 * 2. После успеха кэш сбрасывается целиком. Оплата меняет кассу, долг,
 *    историю и сводку — перечислять, что именно устарело, значит однажды
 *    забыть про что-нибудь и показать человеку неверные деньги.
 *
 * 3. Не повторяется автоматически. Обычный запрос при сбое сети можно
 *    послать ещё раз, а платёж — нельзя: неизвестно, дошёл ли он.
 *    Решение о повторе принимает человек, видя сообщение об ошибке.
 */
export async function apiMutate(action, params = {}, { quiet = false } = {}) {
  const data = await request(action, params);

  memory.clear();
  // Не стираем, а помечаем: при связи экраны всё равно перечитают свежее,
  // а без связи прежнее лучше пустого экрана (readStored, offline)
  try {
    Object.keys(localStorage)
      .filter((k) => k.indexOf(STORAGE_PREFIX) === 0)
      .forEach((k) => {
        try {
          const parsed = JSON.parse(localStorage.getItem(k));
          if (parsed && typeof parsed === 'object') localStorage.setItem(k, JSON.stringify({ ...parsed, dirty: true }));
          else localStorage.removeItem(k);
        } catch (_) { localStorage.removeItem(k); }
      });
  } catch (_) {}

  // Разделы нижнего меню не пересобираются при переходах (keptTabs.js), и
  // спрятанный раздел показал бы цифры до записи. Говорим всем открытым
  // экранам перечитать данные — они сделают это тихо, не пряча старое.
  // quiet — фоновая запись (пересчёт календаря при входе): будить все
  // экраны разом незачем, каждый перечитается при открытии или «потянуть».
  if (!quiet) notifyMutated();

  return data;
}

const mutationListeners = new Set();

export function onMutated(fn) {
  mutationListeners.add(fn);
  return () => mutationListeners.delete(fn);
}

function notifyMutated() {
  mutationListeners.forEach((fn) => {
    try { fn(); } catch (_) {}
  });
}

/** Программы, журнал, библиотека и семья — только основной сервер */
const TRAINING_ACTION = /^(client\.plan|workout\.|plan\.|library\.|family\.)/;

function trainingAction(action, params) {
  if (TRAINING_ACTION.test(action)) return true;
  const requests = params && Array.isArray(params.requests) ? params.requests : [];
  return requests.some((r) => r && TRAINING_ACTION.test(String(r.action || '')));
}
