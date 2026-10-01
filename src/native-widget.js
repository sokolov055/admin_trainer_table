/**
 * Виджеты iPhone «Занятия сегодня» (01.10.2026): экран блокировки и главный
 * экран, рисует расширение приложения (mobile/ios/App/FitTrackActivity,
 * TodayWidget.swift). Виджет сам спрашивает сервер (widget.today) — ему
 * нужен ключ: отдельный сеанс «Виджеты iPhone» (auth.widget.token), его
 * видно и можно отозвать в списке устройств, как часы.
 *
 * Ключ просим, только если его у виджетов нет: иначе в списке устройств
 * копились бы сеансы на каждом запуске. Расписание поменяли — просим
 * виджеты перечитать сразу. Вышли из аккаунта — виджеты всё забывают.
 * В браузере, на Android и в старой сборке без этих методов — тихо ничего.
 */
import { apiPrimary } from './api.js';
import { currentApiUrl, loadApiConfig } from './apiConfig.js';
import { getToken } from './session.js';
import { bridge, isNativeApp, plugin } from './native-bridge.js';

function native() {
  if (!isNativeApp()) return null;
  const cap = bridge();
  try { if (cap.isPluginAvailable && !cap.isPluginAvailable('WorkoutActivity')) return null; } catch (_) { return null; }
  const p = plugin('WorkoutActivity');
  return p && p.widgetStatus && p.setWidgetAuth ? p : null;
}

let running = null;

/** Выдать виджетам ключ, если его у них нет. Тихо: сбой не мешает человеку */
export function linkWidgets() {
  if (running) return running;
  running = (async () => {
    const p = native();
    if (!p || !getToken()) return false;
    const status = await p.widgetStatus();
    if (!status || status.linked) return false;
    await loadApiConfig();
    const { token } = await apiPrimary('auth.widget.token');
    await p.setWidgetAuth({ token, api: currentApiUrl() });
    return true;
  })().catch(() => false).finally(() => { running = null; });
  return running;
}

/** Расписание поменялось — виджеты перечитают его сейчас */
export function reloadWidgets() {
  const p = native();
  if (p && p.reloadWidgets) p.reloadWidgets().catch(() => {});
}

/** Вышли из аккаунта — виджеты забывают ключ и занятия */
export function forgetWidgets() {
  const p = native();
  if (p && p.forgetWidgets) return p.forgetWidgets().catch(() => {});
  return Promise.resolve();
}
