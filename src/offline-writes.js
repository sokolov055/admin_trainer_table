/**
 * Записи без сети, кроме тренировок (FT-566, этап 2): замеры и личные
 * настройки тренажёров («спинка 3, сиденье 5»).
 *
 * Обе записи на сервере — «записать поверх»: замер за ту же дату и ту же
 * серию дополняется (lib/measures.js, ON CONFLICT … DO UPDATE), настройка
 * того же тренажёра заменяется (lib/machine-notes.js). Значит, повтор
 * отправки после потерянного ответа ничего не задваивает, и номер
 * сохранения, как у занятия, не нужен. Так же — и на телефоне: второй замер
 * за тот же день дополняет первый, вторая настройка того же тренажёра
 * заменяет первую.
 *
 * Хранятся в IndexedDB (writes) под меткой человека и карточки клиента, без
 * срока — до подтверждения сервером. Отправляет их workout-outbox.js вместе
 * с занятиями, по тем же поводам. Сообщения тренеру (пожелания) сюда не
 * входят: решение владельца — новые сообщения только при связи.
 */
import { apiMutate } from './api.js';
import { dbDelete, dbGet, dbList, dbPut } from './offline-db.js';
import { offlineAccount } from './offline-account.js';

const KINDS = {
  measure: {
    action: 'measure.create',
    key: (p) => 'm:' + String(p.sheetName || '') + ':' + String(p.date || ''),
    // Тот же день и та же серия — один замер: поля дополняют друг друга
    merge: (old, next) => ({ ...next, values: { ...(old.values || {}), ...(next.values || {}) } }),
  },
  note: {
    action: 'client.machine.note.save',
    key: (p) => 'n:' + String(p.member || '') + ':' + String(p.target || ''),
    merge: (old, next) => next,
  },
};

const clientKey = (clientRow) => String(clientRow || 'self');
const scope = (clientRow, account = offlineAccount()) => account + '|' + clientKey(clientRow) + '|';

const listeners = new Set();
export function onWritesChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function changed() {
  listeners.forEach((fn) => { try { fn(); } catch (_) {} });
}

/** Ошибка — «нет связи» (сервер не ответил вовсе), а не отказ сервера */
export const isOffline = (error) => !!error && error.code === 0;

/**
 * Записать на телефон, чтобы отправить позже. params — ровно то, что ушло
 * бы на сервер (с clientRow у тренера). Не вышло — ошибка: обещать
 * сохранение нельзя.
 */
export async function queueWrite(kind, params) {
  const rule = KINDS[kind];
  if (!rule) throw new Error('Неизвестная запись: ' + kind);
  const account = offlineAccount();
  if (!account) throw new Error('Не знаем, чей это телефон: войдите заново, чтобы сохранить.');
  const clientRow = params && params.clientRow ? Number(params.clientRow) : 0;
  const key = scope(clientRow, account) + rule.key(params);
  const old = await dbGet('writes', key).catch(() => null);
  await dbPut('writes', key, {
    kind,
    params: old ? rule.merge(old.params, params) : params,
    // Номер версии записи: по нему отправка видит, что её дописали, пока
    // она уходила (время для этого не годится — две записи в одну миллисекунду)
    rev: ((old && old.rev) || 0) + 1,
    clientRow,
    state: 'local',
    error: '',
    savedAt: new Date().toISOString(),
  });
  changed();
}

/** Записи этой карточки (kind — только такие) */
export async function localWrites(clientRow, kind = '') {
  const account = offlineAccount();
  if (!account) return [];
  const rows = await dbList('writes', scope(clientRow, account)).catch(() => []);
  return rows.map((r) => r.value).filter((v) => !kind || v.kind === kind);
}

/** Сколько ждёт отправки у этого человека — перед выходом из аккаунта */
export async function pendingWrites() {
  const account = offlineAccount();
  if (!account) return 0;
  return (await dbList('writes', account + '|').catch(() => [])).length;
}

/**
 * Отправить всё, что ждёт. Нет связи или кончился вход — стоп, всё на
 * месте; отказ сервера по одной записи — пометка, остальные идут дальше.
 */
export async function flushWrites() {
  const account = offlineAccount();
  if (!account) return { sent: 0, left: 0 };
  const rows = await dbList('writes', account + '|').catch(() => []);
  let sent = 0;
  let left = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const { key, value } = rows[i];
    if (value.state === 'error') { left += 1; continue; }
    const rule = KINDS[value.kind];
    if (!rule) continue;
    try {
      await apiMutate(rule.action, value.params, { quiet: true });
    } catch (error) {
      if (!error || !error.code || error.code === 401) { left += rows.length - i; break; }
      await dbPut('writes', key, { ...value, state: 'error', error: error.message || 'Сервер не принял запись.' });
      left += 1;
      continue;
    }
    // Пока отправляли, могли дописать ещё (второй замер за тот же день) —
    // тогда запись остаётся и уйдёт следующей отправкой
    const now = await dbGet('writes', key).catch(() => null);
    if (now && (now.rev || 0) !== (value.rev || 0)) { left += 1; continue; }
    await dbDelete('writes', key);
    sent += 1;
  }
  if (sent || left) changed();
  return { sent, left };
}

/** Убрать запись с пометкой отказа — человек её увидел и решил не отправлять */
export async function dropWrite(clientRow, kind, params) {
  const rule = KINDS[kind];
  const account = offlineAccount();
  if (!rule || !account) return;
  await dbDelete('writes', scope(clientRow, account) + rule.key(params));
  changed();
}

/* ==========================================================================
 * Замеры на экране «Прогресс»
 * ========================================================================== */

const num = (v) => {
  const n = parseFloat(String(v === undefined || v === null ? '' : v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/**
 * Изменение за всё время — так же, как сервер (handlers.js, computeDeltas):
 * первый и последний замер, где показатель записан.
 */
export function totalDeltas(rows, fields) {
  const out = {};
  const sorted = (rows || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  fields.forEach((f) => {
    const has = sorted.filter((r) => r[f] !== null && r[f] !== undefined && r[f] !== '');
    if (!has.length) return;
    const first = has[0];
    const last = has[has.length - 1];
    out[f] = {
      first: first[f], firstDate: first.date, last: last[f], lastDate: last.date,
      delta: Math.round((last[f] - first[f]) * 10) / 10, points: has.length,
    };
  });
  return out;
}

/**
 * Замеры с сервера плюс записанные на телефоне — как будто сервер их уже
 * принял: строка той же даты дополняется, новая дата — новая строка,
 * изменения пересчитаны. Строки с телефона помечены local: true.
 *
 * measurements — ответ client.measurements ({ series: [{ label, sheetName,
 * rows }], fields }); pending — localWrites(…, 'measure').
 */
export function withLocalMeasures(measurements, pending) {
  if (!pending || !pending.length) return measurements;
  const base = measurements || { series: [], fields: [] };
  const fields = base.fields && base.fields.length ? base.fields : ['Вес'];
  const series = (base.series || []).map((s) => ({ ...s, rows: (s.rows || []).slice() }));

  pending.forEach(({ params }) => {
    const sheet = String(params.sheetName || '');
    let target = series.find((s) => (s.sheetName || 'Показатели') === (sheet || 'Показатели'))
      || (!sheet && series.length === 1 ? series[0] : null);
    if (!target) {
      target = { label: sheet.replace(/^Показатели\s*/, ''), sheetName: sheet || 'Показатели', rows: [] };
      series.push(target);
    }
    const date = String(params.date || '').slice(0, 10) + 'T00:00:00';
    const values = {};
    Object.keys(params.values || {}).forEach((f) => {
      const n = num(params.values[f]);
      if (n !== null) values[f] = n;
    });
    const at = target.rows.findIndex((r) => String(r.date).slice(0, 10) === date.slice(0, 10));
    if (at >= 0) target.rows[at] = { ...target.rows[at], ...values, local: true };
    else target.rows.push({ date, ...values, local: true });
    target.rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  });

  return {
    ...base,
    fields,
    series: series.map((s) => ({ ...s, deltas: totalDeltas(s.rows, fields) })),
  };
}
