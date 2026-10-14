#!/usr/bin/env node
/**
 * Прежний адрес сайта (GitHub Pages) — только переадресация (14.10.2026).
 *
 * Сайт переехал на app.fitness100.ru, на наш сервер в России: GitHub (США)
 * больше не получает IP-адреса тех, кто пользуется приложением. Старые
 * ссылки (письма, закладки, иконка на рабочем столе, Android-приложение до
 * версии 7) ещё ведут сюда, поэтому на Pages остаются только крошечные
 * страницы-указатели, без самого приложения:
 *
 * - каждая страница сборки (index.html, privacy.html, guide/…) ведёт на тот
 *   же путь нового адреса, с теми же параметрами;
 * - вход живёт в localStorage старого адреса, и простой переход разлогинил
 *   бы всех. Поэтому вошедший получает одноразовый билет (auth.install.create,
 *   15 минут) и переходит с ним — новый адрес обменивает билет на свою
 *   сессию (auth-transfer.js). Старый ключ после этого стирается: ещё один
 *   заход сюда не размножит сессии;
 * - Android-приложение до версии 7 открывает этот адрес внутри себя, а
 *   переход на другой адрес унесло бы в браузер — ему показываем «Обновите
 *   приложение» со ссылкой на новый APK;
 * - иконка на экране «Домой» iPhone, добавленная со старого адреса, тоже
 *   открывает его, а переход на другой адрес выводит из режима приложения —
 *   новый адрес открывался с панелью Safari. Такому заходу не переходим
 *   молча, а объясняем, как поставить новую иконку (владелец, 14.10.2026);
 * - sw.js снимает прежний сервис-воркер и чистит его кеш: иначе он ещё
 *   долго показывал бы старое приложение с этого адреса.
 *
 * Запуск: node scripts/build-moved-site.mjs dist moved
 */
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const NEW_SITE = 'https://app.fitness100.ru';
const API = 'https://api.fitness100.ru/';
const OLD_PREFIX = '/admin_trainer_table';
const APK = 'https://api.fitness100.ru/android/fit-track.apk';

const [from = 'dist', to = 'moved'] = process.argv.slice(2);

function htmlFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return htmlFiles(path);
    return name.endsWith('.html') ? [path] : [];
  });
}

export function movedPage() {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Fit Track переехал</title>
<style>
body{margin:0;font:16px/1.5 system-ui,-apple-system,sans-serif;background:#faf9f6;color:#1c1b19}
main{max-width:420px;margin:0 auto;padding:48px 24px}
h1{font-size:22px;margin:0 0 12px}
a.button{display:block;margin-top:20px;padding:14px;border-radius:12px;background:#2a6fdb;color:#fff;text-align:center;text-decoration:none;font-weight:600}
[hidden]{display:none}
</style>
</head>
<body>
<main>
<section id="moving">
<h1>Fit Track переехал</h1>
<p>Открываем новый адрес — app.fitness100.ru…</p>
<a class="button" id="go" href="${NEW_SITE}/">Открыть Fit Track</a>
</section>
<section id="icon" hidden>
<h1>Обновите иконку</h1>
<p>Fit Track переехал на app.fitness100.ru. Эта иконка ведёт на старый адрес, поэтому приложение открывается с панелью браузера.</p>
<ol>
<li>Удалите эту иконку с экрана «Домой».</li>
<li>Откройте <b>app.fitness100.ru</b> в Safari.</li>
<li>Нажмите «Поделиться» → «На экран „Домой“».</li>
</ol>
<p>Новая иконка откроется без панели браузера. Войдите в ней ещё раз.</p>
<a class="button" id="go-icon" href="${NEW_SITE}/">Открыть Fit Track сейчас</a>
</section>
<section id="update" hidden>
<h1>Обновите приложение</h1>
<p>Fit Track переехал на наш сервер в России. Эта версия приложения открывает старый адрес — установите новую, она откроется как раньше.</p>
<p>После установки войдите ещё раз.</p>
<a class="button" href="${APK}">Скачать новую версию</a>
</section>
</main>
<script>
(function () {
  var NEW = ${JSON.stringify(NEW_SITE)};
  var API = ${JSON.stringify(API)};
  var path = location.pathname;
  if (path.indexOf(${JSON.stringify(OLD_PREFIX)}) === 0) path = path.slice(${OLD_PREFIX.length});
  if (!path || path === '/index.html') path = '/';
  var target = NEW + path + location.search;
  document.getElementById('go').href = target + location.hash;

  var cap = window.Capacitor;
  if (cap && cap.isNativePlatform && cap.isNativePlatform()) {
    document.getElementById('moving').hidden = true;
    document.getElementById('update').hidden = false;
    return;
  }

  var token = '';
  try { token = localStorage.getItem('auth_token_v1') || ''; } catch (e) {}

  // Старая иконка на экране «Домой»: сначала объяснить, переход — по кнопке
  var standalone = navigator.standalone === true
    || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  if (standalone && path === '/' && !window.__ftGo) {
    document.getElementById('moving').hidden = true;
    document.getElementById('icon').hidden = false;
    document.getElementById('go-icon').addEventListener('click', function (ev) {
      ev.preventDefault();
      window.__ftGo = true;
      document.getElementById('icon').hidden = true;
      document.getElementById('moving').hidden = false;
      move();
    });
    return;
  }
  move();

  function move() {
  // Документы (политика, согласие) открываются без входа
  if (!token || path !== '/') { location.replace(target + location.hash); return; }

  var done = false;
  var plain = function () { if (!done) { done = true; location.replace(target + location.hash); } };
  setTimeout(plain, 8000);
  fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'auth.install.create', initData: '', token: token })
  }).then(function (r) { return r.json(); }).then(function (body) {
    var ticket = body && body.ok && body.data && body.data.ticket;
    if (!ticket || done) return plain();
    done = true;
    try { localStorage.removeItem('auth_token_v1'); } catch (e) {}
    location.replace(target + '#loginTicket=' + encodeURIComponent(ticket));
  }).catch(plain);
  }
})();
</script>
</body>
</html>
`;
}

// Прежний сервис-воркер обновляется сам (registration.update) и получит
// этот файл: чистит кеш, снимается и перезагружает открытые вкладки —
// они попадут на страницу-указатель.
export const GOODBYE_SW = `self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys()
    .then(function (names) { return Promise.all(names.map(function (n) { return caches.delete(n); })); })
    .then(function () { return self.registration.unregister(); })
    .then(function () { return self.clients.matchAll({ type: 'window' }); })
    .then(function (list) { list.forEach(function (c) { c.navigate(c.url); }); }));
});
`;

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  rmSync(to, { recursive: true, force: true });
  const page = movedPage();
  const files = htmlFiles(from).map((f) => relative(from, f));
  for (const file of [...new Set([...files, '404.html'])]) {
    const out = join(to, file);
    mkdirSync(join(out, '..'), { recursive: true });
    writeFileSync(out, page);
  }
  writeFileSync(join(to, 'sw.js'), GOODBYE_SW);
  writeFileSync(join(to, '.nojekyll'), '');
  console.log(`Переадресация: ${files.length + 1} страниц → ${NEW_SITE}`);
}
