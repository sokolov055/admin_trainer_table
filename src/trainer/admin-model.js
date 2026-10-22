/**
 * Расчёты панели владельца «Управление» (FT-562) — без React, чтобы их
 * проверял тест (scripts/test-admin.mjs). Сами числа считает сервер
 * (server/src/lib/owner-stats.js); здесь только то, как их показать.
 */

/** Откуда пришёл клиент — подписи в порядке показа */
export const SOURCES = [
  ['trainer', 'Завёл тренер'],
  ['link', 'По ссылке тренера'],
  ['request', 'Принял запрос тренера'],
  ['catalog', 'Из каталога'],
  ['self', 'Сами, без тренера'],
];

const pad = (n) => String(n).padStart(2, '0');

/** «2026-10-11» → «11.10» */
export function shortDay(iso) {
  const [, m, d] = String(iso || '').split('-');
  return d && m ? `${d}.${m}` : '';
}

/** Недели роста → столбики графика. Неделя — семь дней по сегодня, неполной нет */
export function growthPoints(growth, key = 'clients') {
  return (growth || []).map((w) => ({
    key: w.from,
    label: `${shortDay(w.from)}–${shortDay(w.to)}`,
    short: shortDay(w.from),
    value: w[key] || 0,
  }));
}

/** Сумма по источникам за все недели, только непустые */
export function sourceTotals(growth) {
  const sum = {};
  for (const w of growth || []) {
    for (const [k, n] of Object.entries(w.bySource || {})) sum[k] = (sum[k] || 0) + n;
  }
  return SOURCES.filter(([k]) => sum[k]).map(([k, label]) => ({ key: k, label, value: sum[k] }));
}

/** Доля в процентах целым числом; из нуля — прочерк */
export function percent(part, whole) {
  if (!whole) return '—';
  return Math.round((part / whole) * 100) + '%';
}

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

/** «2026-10» → «октябрь 2026» */
export function monthName(key) {
  const [y, m] = String(key || '').split('-').map(Number);
  return m ? `${MONTHS[m - 1]} ${y}` : String(key || '');
}

/**
 * Нужно ли переспросить перед переключением флага: в «опасную» сторону
 * (riskyTo с сервера) — да, с напоминанием, почему он стоит как стоит.
 * Вернуть как в .env — тоже переспросить, если это меняет значение.
 */
export function needsConfirm(flag, next) {
  if (next === null) return flag.envValue !== flag.value;
  return next === flag.riskyTo && next !== flag.value;
}

/** Строка состояния флага под названием */
export function flagStatus(flag) {
  const now = flag.value ? 'Включено' : 'Выключено';
  if (!flag.overridden) return `${now} · как в .env`;
  const env = flag.envValue ? 'вкл' : 'выкл';
  const when = flag.setAt ? new Date(flag.setAt) : null;
  const at = when && !Number.isNaN(when.getTime())
    ? ` ${pad(when.getDate())}.${pad(when.getMonth() + 1)} ${pad(when.getHours())}:${pad(when.getMinutes())}`
    : '';
  return `${now} из панели${at} · в .env — ${env}`;
}

/** Платформы в порядке показа */
export const PLATFORM_NAMES = { ios: 'iPhone', android: 'Android' };

// Число из поля ввода или из настроек: «1 000» и 1000 — одно и то же
const toNum = (v) => (typeof v === 'number' ? v : String(v ?? '').trim() === '' ? NaN : Number(String(v).replace(/\s/g, '')));

/**
 * Цена ступени на одного клиента (FT-545; из разбора SmartGym, 21.10.2026):
 * цена месяца ÷ верхняя граница клиентов, до рубля. «≈ 20 ₽ за клиента»
 * продаёт ступень понятнее, чем «990 ₽ за 50».
 *
 * null — строки нет: бесплатная ступень, последняя (unlimited: предела у
 * неё нет, сверх границы — по цене за клиента), пустое или неверное поле.
 */
export function perClientPrice({ price, upTo } = {}, { unlimited = false } = {}) {
  const p = toNum(price);
  const n = toNum(upTo);
  if (unlimited || !Number.isFinite(p) || p <= 0 || !Number.isInteger(n) || n < 1) return null;
  const each = Math.round(p / n);
  return each >= 1 ? each : null;
}

/** «≈ 20 ₽ за клиента в месяц при 50 клиентах»; без цены на клиента — пусто */
export function perClientNote(tier, opts) {
  const each = perClientPrice(tier, opts);
  if (each === null) return '';
  const n = toNum(tier.upTo);
  const word = n % 10 === 1 && n % 100 !== 11 ? 'клиенте' : 'клиентах';
  return `≈ ${each.toLocaleString('ru-RU')} ₽ за клиента в месяц при ${n.toLocaleString('ru-RU')} ${word}`;
}

/* --- «Вид»: темы файлом (22.10.2026) --- */

const HEX6 = /^#[0-9a-fA-F]{6}$/;

/**
 * Файл темы, выбранный на телефоне: разобрать и коротко проверить до
 * отправки — чтобы «не тот файл» было видно сразу. Окончательная проверка
 * (скрипты, ссылки в SVG) — на сервере (lib/theme-file.js).
 */
export function readThemeFile(text) {
  let theme;
  try { theme = JSON.parse(String(text || '').replace(/^﻿/, '')); } catch (_) {
    return { error: 'Это не файл темы: не читается как JSON.' };
  }
  if (!theme || theme.format !== 'fittrack-theme') return { error: 'Это не файл темы Fit Track.' };
  if (!theme.id || !theme.name) return { error: 'В файле нет id или названия темы.' };
  const bad = ['accent', 'bg', 'fill', 'light', 'dark'].filter((k) => !HEX6.test(theme[k] || ''));
  if (bad.length) return { error: `Неверные цвета: ${bad.join(', ')}.` };
  return { theme };
}

/**
 * Список «Темы»: встроенные (кроме стандартной) и загруженные, у каждой —
 * открыта ли она людям. builtIn — PALETTES из palettes.js, state — owner.themes.
 */
export function themeRows(builtIn, state) {
  const closed = new Set((state && state.closed) || []);
  const own = (state && state.themes) || [];
  return [
    ...builtIn.filter((p) => p.id !== 'standard').map((p) => ({
      id: p.id, name: p.name, swatch: p.swatch, builtIn: true, closed: closed.has(p.id), dark: p.scheme === 'dark',
    })),
    ...own.filter((t) => !builtIn.some((p) => p.id === t.id)).map((t) => ({
      id: t.id, name: t.name, swatch: [t.accent, t.bg, t.fill], builtIn: false, closed: !!t.closed,
      dark: t.scheme === 'dark', at: t.at, by: t.by, theme: t,
    })),
  ];
}

/* --- «Версии» iPhone (22.10.2026) --- */

export function versionsForm(state) {
  const rec = (r) => ({ version: String((r && r.version) || ''), build: String((r && r.build) || ''), url: String((r && r.url) || '') });
  return { appStore: rec(state && state.appStore), testflight: rec(state && state.testflight) };
}

export function versionsPayload(form) {
  const rec = (r) => ({ version: r.version.trim(), build: Number(String(r.build).trim()), url: r.url.trim() });
  return { appStore: rec(form.appStore), testflight: rec(form.testflight) };
}
