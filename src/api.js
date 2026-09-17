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

const API_URL = import.meta.env.VITE_API_URL || '';

/** Сколько данные из localStorage считаются пригодными для показа.
 *  Не «свежими» — именно пригодными: их всё равно тут же обновляют. */
const STALE_TTL_MS = 12 * 60 * 60 * 1000;

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

function readStored(key) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.at !== 'number') return null;
    if (Date.now() - parsed.at > STALE_TTL_MS) return null;

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
  const body = await request('batch', {
    requests: requests.map((r) => ({ action: r.action, params: r.params || {} })),
  });

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

async function request(action, params) {
  if (!API_URL && import.meta.env.VITE_MOCK !== '1') {
    throw new ApiError(
      'Не задан адрес API. При сборке нужен VITE_API_URL — см. webapp/.env.example',
      0
    );
  }

  if (import.meta.env.VITE_MOCK === '1') {
    const { mockApi } = await import('./mock.js');
    return mockApi(action, params);
  }

  const payload = { action, initData: getInitData(), ...params };

  let body;
  try {
    body = await postJson(payload);
  } catch (postErr) {
    try {
      body = await getJson(payload);
    } catch (getErr) {
      throw new ApiError('Сервер не отвечает. Проверьте связь и попробуйте ещё раз.', 0);
    }
  }

  if (!body || body.ok !== true) {
    throw new ApiError(
      (body && body.error) || 'Неизвестная ошибка сервера',
      (body && body.code) || 500
    );
  }

  return body.data;
}

async function postJson(payload) {
  const resp = await fetch(API_URL, {
    method: 'POST',
    // text/plain — единственный способ обойтись без preflight (см. шапку)
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
    redirect: 'follow',
  });
  return resp.json();
}

async function getJson(payload) {
  const qs = Object.keys(payload)
    .filter((k) => payload[k] !== undefined && payload[k] !== null)
    .map((k) => {
      const v = typeof payload[k] === 'object' ? JSON.stringify(payload[k]) : payload[k];
      return encodeURIComponent(k) + '=' + encodeURIComponent(v);
    })
    .join('&');

  const resp = await fetch(API_URL + '?' + qs, { method: 'GET', redirect: 'follow' });
  return resp.json();
}
