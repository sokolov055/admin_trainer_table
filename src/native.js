/**
 * native.js — приложение для Android (оболочка Capacitor, каталог mobile/
 * основного репозитория).
 *
 * Оболочка открывает эту же живую страницу и добавляет мост к телефону:
 * window.Capacitor с плагинами. Сборка веба одна на всех, поэтому всё
 * здесь включается только при мосте — в браузере и в Telegram этого кода
 * будто нет.
 *
 * Что даёт оболочка:
 *   - системная кнопка «Назад» ведёт по экранам приложения, как жест
 *     «смахнуть вправо», а с главного экрана сворачивает приложение;
 *   - строка состояния телефона — цвета фона приложения и в тёмной теме;
 *   - вышла новая версия самой оболочки — внизу «Обновить» (checkUpdate).
 */
import { goBack } from './gestures.jsx';
import { isNativeApp, plugin } from './native-bridge.js';
import { refreshNativePush, listenNativeTaps } from './native-push.js';
import { syncSteps } from './native-steps.js';

export { isNativeApp };

export function startNative() {
  if (!isNativeApp()) return;
  document.documentElement.classList.add('is-native');

  const app = plugin('App');
  if (app && app.addListener) {
    // Персональная ссылка тренера и одноразовый вход открываются прямо в
    // приложении: Android отдаёт их сюда (intent-filter в mobile/), а
    // страница читает ?access= и #loginTicket= при загрузке
    app.addListener('appUrlOpen', (event) => openLink(event && event.url));
    if (app.getLaunchUrl) app.getLaunchUrl().then((res) => openLink(res && res.url, true)).catch(() => {});
    app.addListener('backButton', () => {
      if (goBack()) return;
      if (app.minimizeApp) app.minimizeApp(); else if (app.exitApp) app.exitApp();
    });
    if (app.getInfo) app.getInfo().then(checkUpdate).catch(() => {});
    // Вернулись в приложение — шаги за это время могли прибавиться
    app.addListener('resume', () => { syncSteps().catch(() => {}); });
  }

  // Уведомления: свежий адрес телефона — серверу; нажали на уведомление —
  // открыть то, о чём оно. Шаги — отправить, если подключены
  refreshNativePush();
  listenNativeTaps((url) => openLink(new URL(url, window.location.href).href));
  syncSteps().catch(() => {});

  const bar = plugin('StatusBar');
  if (bar && bar.setBackgroundColor) {
    // Цвет строки — по настоящему фону страницы: тема бывает выбрана
    // вручную, системной или пришла от Telegram
    let last = '';
    const paint = () => {
      const color = toHex(getComputedStyle(document.body).backgroundColor);
      if (!color || color === last) return;
      last = color;
      bar.setBackgroundColor({ color }).catch(() => {});
      bar.setStyle({ style: isDark(color) ? 'DARK' : 'LIGHT' }).catch(() => {});
    };
    const later = () => requestAnimationFrame(paint);
    new MutationObserver(later).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style', 'class'] });
    try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', later); } catch (_) {}
    if (document.body) later(); else window.addEventListener('DOMContentLoaded', later);
  }
}

/**
 * Новая версия оболочки. Экраны приходят с сайта и обновляются сами, а
 * APK меняется редко — иконка, уведомления, разрешения. Магазина нет,
 * поэтому номер последней версии лежит рядом с сайтом (android/latest.json,
 * пишет mobile/build-apk.sh). Свежее — показываем «Обновить»: скачивание
 * открывается в браузере телефона (APK на другом адресе, и оболочка сама
 * отдаёт его браузеру), дальше Android ставит поверх — подпись та же.
 */
function checkUpdate(info) {
  const mine = Number(info && info.build) || 0;
  if (!mine) return;
  fetch(new URL('android/latest.json', window.location.href).href, { cache: 'no-store' })
    .then((res) => (res.ok ? res.json() : null))
    .then((latest) => {
      if (!latest || !(Number(latest.versionCode) > mine) || !latest.apk) return;
      try { if (sessionStorage.getItem('native_update_later') === String(latest.versionCode)) return; } catch (_) {}
      showUpdate(latest);
    })
    .catch(() => {});
}

function showUpdate(latest) {
  if (document.querySelector('.update-bar')) return;
  const bar = document.createElement('div');
  bar.className = 'undo-bar update-bar';
  bar.setAttribute('role', 'status');
  const text = document.createElement('span');
  text.textContent = 'Вышла новая версия приложения';
  const later = document.createElement('button');
  later.type = 'button';
  later.className = 'button button--ghost';
  later.textContent = 'Позже';
  later.onclick = () => {
    try { sessionStorage.setItem('native_update_later', String(latest.versionCode)); } catch (_) {}
    bar.remove();
  };
  const go = document.createElement('button');
  go.type = 'button';
  go.className = 'button button--primary';
  go.textContent = 'Обновить';
  go.onclick = () => { window.location.href = latest.apk; bar.remove(); };
  bar.append(text, later, go);
  document.body.appendChild(bar);
}

function openLink(href, launch = false) {
  let url;
  try { url = new URL(href); } catch (_) { return; }
  const here = window.location;
  if (url.origin !== here.origin || !url.pathname.startsWith(new URL('./', here.href).pathname)) return;
  if (url.href === here.href) return;
  // Ссылка запуска остаётся у приложения до его закрытия: не открывать её
  // заново при каждой перезагрузке страницы
  if (launch) {
    try {
      if (sessionStorage.getItem('native_launch_url') === url.href) return;
      sessionStorage.setItem('native_launch_url', url.href);
    } catch (_) {}
  }
  window.location.replace(url.href);
}

function toHex(rgb) {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(rgb || '');
  if (!m || (m[4] !== undefined && Number(m[4]) === 0)) return '';
  return '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('');
}

function isDark(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lum = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum < 128;
}
