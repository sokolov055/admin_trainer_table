#!/usr/bin/env node
/**
 * Переключение приложения между бэкендами.
 *
 *   npm run switch-api                        показать текущее состояние
 *   npm run switch-api <адрес>                переключить
 *   npm run switch-api <адрес> --fallback     переключить, оставив запасным прежний
 *   npm run switch-api --rollback             вернуть запасной как основной
 *
 * Пересборка не нужна: адрес живёт в config.json рядом с приложением, а не
 * внутри собранного кода. Достаточно закоммитить изменённый файл — или, если
 * очень спешите, подменить его прямо на хостинге.
 *
 * Перед переключением адрес проверяется живым запросом. Смысл в том, чтобы
 * не узнать о неработающем сервере от клиентов: скрипт спросит его сам и
 * откажется переключать, если ответа нет.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const CONFIG = join(here, '../public/config.json');

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const target = args.find((a) => !a.startsWith('--'));

const config = JSON.parse(readFileSync(CONFIG, 'utf8'));

/* ==========================================================================
 * Показать состояние
 * ========================================================================== */

if (!target && !flags.has('--rollback')) {
  console.log('Текущий адрес API:');
  console.log(`  ${config.apiUrl}`);
  if (config.label) console.log(`  (${config.label})`);
  if (config.fallbackUrl) console.log(`\nЗапасной: ${config.fallbackUrl}`);

  console.log('\nПроверяю доступность…');
  const health = await probe(config.apiUrl);
  report(config.apiUrl, health);

  console.log('\nПереключить:  npm run switch-api <адрес>');
  process.exit(0);
}

/* ==========================================================================
 * Откат
 * ========================================================================== */

if (flags.has('--rollback')) {
  if (!config.fallbackUrl) {
    console.error('Запасной адрес не задан — откатываться некуда.');
    process.exit(1);
  }

  const previous = config.apiUrl;
  config.apiUrl = config.fallbackUrl;
  config.fallbackUrl = previous;
  config.label = detectLabel(config.apiUrl);

  save();
  console.log(`Откат выполнен. Теперь основной: ${config.apiUrl}`);
  finish();
}

/* ==========================================================================
 * Переключение
 * ========================================================================== */

if (!/^https:\/\//i.test(target)) {
  console.error('Адрес должен начинаться с https:// — Telegram работает только по HTTPS.');
  process.exit(1);
}

console.log(`Проверяю ${target} …`);
const health = await probe(target);
report(target, health);

if (!health.ok && !flags.has('--force')) {
  console.error('\nАдрес не отвечает как ожидается. Переключение отменено.');
  console.error('Если уверены, что всё в порядке: добавьте --force');
  process.exit(1);
}

const previous = config.apiUrl;

config.apiUrl = target;
config.label = detectLabel(target);
config.fallbackUrl = flags.has('--fallback') ? previous : '';

save();

console.log(`\nГотово.`);
console.log(`  было:  ${previous}`);
console.log(`  стало: ${config.apiUrl}  (${config.label})`);
if (config.fallbackUrl) {
  console.log(`  запасной: ${config.fallbackUrl}`);
  console.log('  Если новый сервер не ответит, приложение само уйдёт на запасной.');
}

finish();

/* ==========================================================================
 * Вспомогательное
 * ========================================================================== */

function save() {
  writeFileSync(CONFIG, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

function finish() {
  console.log('\nОсталось опубликовать:');
  console.log('  git add public/config.json && git commit -m "chore: переключение API" && git push');
  console.log('\nПересобирать не нужно — адрес читается из файла.');
  process.exit(0);
}

/**
 * Живая проверка адреса.
 *
 * Оба бэкенда на запрос без параметров отвечают строкой о готовности:
 * Apps Script — «WEBAPP_OK», свой сервер — «API_OK». Этого достаточно,
 * чтобы отличить работающий эндпоинт от домена, который просто
 * резолвится.
 */
async function probe(url) {
  const started = Date.now();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);

    const res = await fetch(url, { redirect: 'follow', signal: controller.signal });
    clearTimeout(timer);

    const text = (await res.text()).slice(0, 200);
    const ms = Date.now() - started;

    return {
      ok: res.ok && /WEBAPP_OK|API_OK/.test(text),
      status: res.status,
      ms,
      text: text.trim(),
    };
  } catch (error) {
    return { ok: false, status: 0, ms: Date.now() - started, text: String(error.message || error) };
  }
}

function report(url, health) {
  const mark = health.ok ? 'отвечает' : 'НЕ отвечает';
  console.log(`  ${mark}: HTTP ${health.status}, ${health.ms} мс`);
  if (!health.ok) console.log(`  ответ: ${health.text}`);
  else if (health.ms > 1500) {
    console.log('  медленно — для Apps Script это норма, для своего сервера повод разобраться');
  }
}

function detectLabel(url) {
  if (url.includes('script.google.com')) return 'Apps Script';
  try {
    return new URL(url).hostname;
  } catch {
    return 'свой сервер';
  }
}
