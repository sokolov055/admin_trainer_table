/**
 * api.js — единственная точка общения с Apps Script.
 *
 * Две особенности Apps Script, от которых здесь всё пляшет:
 *
 * 1) Он не отвечает на preflight OPTIONS. Значит запрос обязан быть
 *    «простым» по правилам CORS — отсюда Content-Type: text/plain даже для
 *    JSON-тела. Поставить application/json = гарантированная ошибка CORS.
 *
 * 2) На POST он отвечает редиректом на googleusercontent.com. Браузер по
 *    нему идёт сам, но в некоторых WebView это ломается. Поэтому при сбое
 *    POST мы один раз повторяем запрос через GET — тот же эндпоинт умеет
 *    оба способа.
 *
 * Ответ всегда HTTP 200; настоящий статус лежит внутри тела в поле ok.
 */

const API_URL = import.meta.env.VITE_API_URL || '';

export class ApiError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'ApiError';
    this.code = code || 0;
  }
}

/** Живёт столько же, сколько открытое приложение: повторные переходы по
 *  вкладкам не должны каждый раз ждать Apps Script по полсекунды. */
const cache = new Map();

function cacheKey(action, params) {
  return action + '|' + JSON.stringify(params || {});
}

export function clearApiCache() {
  cache.clear();
}

/**
 * @param {string} action     имя эндпоинта, например 'client.plan'
 * @param {object} params     параметры запроса
 * @param {object} options    { fresh: true } — мимо кэша
 */
export async function api(action, params = {}, options = {}) {
  if (!API_URL && import.meta.env.VITE_MOCK !== '1') {
    throw new ApiError(
      'Не задан адрес API. При сборке нужен VITE_API_URL — см. webapp/.env.example',
      0
    );
  }

  const key = cacheKey(action, params);
  if (!options.fresh && cache.has(key)) return cache.get(key);

  // Демо-режим: сборка с VITE_MOCK=1 работает на вымышленных данных, без
  // Apps Script вообще. Импорт динамический, поэтому в обычную сборку
  // демо-данные не попадают.
  if (import.meta.env.VITE_MOCK === '1') {
    const { mockApi } = await import('./mock.js');
    const data = await mockApi(action, params);
    cache.set(key, data);
    return data;
  }

  const initData = getInitDataLazy();
  const payload = { action, initData, ...params };

  let body;
  try {
    body = await postJson(payload);
  } catch (postErr) {
    // Сеть/редирект не сложились — пробуем тот же вызов через GET
    try {
      body = await getJson(payload);
    } catch (getErr) {
      throw new ApiError(
        'Сервер не отвечает. Проверьте подключение и попробуйте ещё раз.',
        0
      );
    }
  }

  if (!body || body.ok !== true) {
    const message = (body && body.error) || 'Неизвестная ошибка сервера';
    const code = (body && body.code) || 500;
    throw new ApiError(message, code);
  }

  cache.set(key, body.data);
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
    .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(payload[k]))
    .join('&');

  const resp = await fetch(API_URL + '?' + qs, { method: 'GET', redirect: 'follow' });
  return resp.json();
}

/** Импорт по требованию, чтобы api.js не тянул за собой SDK Telegram
 *  в тестах и при рендере вне мессенджера */
function getInitDataLazy() {
  const app = typeof window !== 'undefined' && window.Telegram ? window.Telegram.WebApp : null;
  if (app && app.initData) return app.initData;
  return import.meta.env.VITE_DEV_INIT_DATA || '';
}
