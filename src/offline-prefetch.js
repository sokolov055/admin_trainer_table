/**
 * Запас на время без сети (FT-566).
 *
 * Клиент открывает приложение со связью — и, пока смотрит на первый экран,
 * телефон в фоне забирает всё, что понадобится в зале без интернета:
 *
 * - программу: текущий месяц и до двух предыдущих, все тренировки целиком
 *   — значит, и те, что ещё ни разу не открывали;
 * - список занятий и сами занятия за 90 дней — «Выполненные», «Было» и
 *   журнал открываются без сети;
 * - настройки тренажёров к упражнениям тренировок;
 * - видео упражнений текущей программы (решение владельца 15.10.2026).
 *
 * Ответы ложатся туда же, откуда их читают экраны (api.js — программа,
 * список, настройки; offline-db.js — занятия и видео), поэтому экраны о
 * запасе не знают: без сети они просто получают сохранённое.
 *
 * Не чаще раза в полчаса и только при связи: это фоновая работа, и спорить
 * за сеть с экраном, который человек открыл, ей незачем. Сбой — молча: не
 * вышло сейчас — выйдет при следующем запуске.
 */
import { apiBatch, apiFresh, apiPublic } from './api.js';
import { mediaUrl } from './library.js';
import { dbGet, dbPut, askPersistent } from './offline-db.js';
import { offlineAccount } from './offline-account.js';
import { saveRecentWorkouts } from './workout-outbox.js';
import { saveVideo, pruneVideos, videosSize, VIDEOS_MAX_BYTES } from './offline-media.js';

const EVERY_MS = 30 * 60 * 1000;
const MONTHS_BACK = 2;
/** Сервер отдаёт пакет не больше чем из 8 действий (routes.js, BATCH_LIMIT) */
const BATCH = 8;

let running = null;

export function prefetchOffline(me, { force = false } = {}) {
  if (running) return running;
  running = run(me, force).catch(() => false).finally(() => { running = null; });
  return running;
}

/** Числовые id упражнений тренировки строкой — так их просит журнал */
export function setupIdsOf(exercises) {
  return [...new Set((exercises || []).map((e) => e.exerciseId).filter(Boolean))].sort((a, b) => a - b).join(',');
}

/** Видео-файлы (не ссылки на чужие сайты) из упражнений программы */
export function programVideos(plan) {
  const out = [];
  ((plan && plan.blocks) || []).forEach((b) => (b.exercises || []).forEach((e) => {
    const media = e.exercise && e.exercise.media;
    if (media && media.kind === 'file' && media.url && !out.includes(media.url)) out.push(media.url);
  }));
  return out;
}

async function run(me, force) {
  // Запас — у клиента: тренер ведёт занятия из карточек, и запасать за него
  // программы всех клиентов значило бы тянуть их все на телефон
  if (!me || me.role !== 'client' || me.unlinked) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  const account = offlineAccount();
  if (!account) return false;

  const mark = 'prefetch|' + account;
  if (!force) {
    const last = await dbGet('meta', mark).catch(() => null);
    if (last && Date.now() - Number(last.at || 0) < EVERY_MS) return false;
  }

  const current = await apiFresh('client.plan', {});
  if (current.offline) return false;
  const plan = current.data || {};
  askPersistent();

  // Прошлые месяцы — по одному пакету: их открывают реже, но открывают
  const older = (plan.available || []).filter((m) => m && m !== plan.month).slice(0, MONTHS_BACK);
  if (older.length) await apiBatch(older.map((month) => ({ action: 'client.plan', params: { month } }))).catch(() => {});

  // Журнал: список — для «Выполненных», занятия целиком — для «Было» и
  // открытия любого занятия без сети
  await apiFresh('workout.list', {}).catch(() => {});
  // Мимо кеша api.js: сотни занятий в localStorage его переполнили бы, и
  // api.js выбросил бы при этом весь свой кеш — программу в том числе
  const recent = await apiPublic('workout.recent', {}).catch(() => null);
  if (recent && Array.isArray(recent.sessions)) await saveRecentWorkouts('', recent.sessions);

  // Настройки тренажёров: тот же ключ, что спросит журнал занятия
  const ids = [...new Set((plan.blocks || []).map((b) => setupIdsOf(b.exercises)).filter(Boolean))];
  for (let i = 0; i < ids.length; i += BATCH) {
    await apiBatch(ids.slice(i, i + BATCH).map((list) => ({ action: 'exercise.setup', params: { ids: list } }))).catch(() => {});
  }

  await dbPut('meta', mark, { at: Date.now() }).catch(() => {});

  // Видео — последними и по одному: они самые тяжёлые, а остальное уже
  // на телефоне. Старое, которого в программе больше нет, убираем
  const videos = programVideos(plan);
  await pruneVideos(videos);
  let budget = VIDEOS_MAX_BYTES - await videosSize();
  for (const url of videos) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) break;
    try {
      const before = budget;
      const result = await saveVideo(url, mediaUrl(url), budget);
      if (result === 'saved') budget = VIDEOS_MAX_BYTES - await videosSize();
      if (budget <= 0 || before <= 0) break;
    } catch (_) { /* следующее видео — может, пройдёт */ }
  }
  return true;
}
