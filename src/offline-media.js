/**
 * Видео упражнений на телефоне (FT-566).
 *
 * Без сети видео техники не открылось бы: файл лежит на сервере
 * (адрес API, /media/…). Видео упражнений текущей программы offline-prefetch.js
 * скачивает заранее — при связи, по одному, — и кладёт сюда, в IndexedDB.
 * Экран берёт сохранённое (useVideoSrc), а если его нет — адрес на сервере,
 * как раньше.
 *
 * Хранится по адресу файла, без метки человека: файлы общие и публичные,
 * и у двух людей на одном телефоне одно и то же видео лежит один раз.
 */
import { useEffect, useState } from 'react';
import { dbDelete, dbGet, dbList, dbPut } from './offline-db.js';

/** Больше — не храним: полгигабайта одного ролика телефону не по карману */
export const VIDEO_MAX_BYTES = 150 * 1024 * 1024;
/** Всего на видео — не больше этого; лишнее не скачиваем */
export const VIDEOS_MAX_BYTES = 800 * 1024 * 1024;

const KEY = 'v|';

export async function hasVideo(url) {
  const old = await dbGet('media', KEY + url).catch(() => null);
  return !!(old && old.blob);
}

/** Сколько уже занято видео (байт) */
export async function videosSize() {
  const rows = await dbList('media', KEY).catch(() => []);
  return rows.reduce((n, r) => n + (Number(r.value && r.value.size) || 0), 0);
}

/**
 * Скачать и сохранить. href — полный адрес, url — как в карточке упражнения
 * (по нему и ищем). Не влезает в предел — не скачиваем: 'skipped'.
 */
export async function saveVideo(url, href, budget = VIDEOS_MAX_BYTES) {
  if (await hasVideo(url)) return 'kept';
  const res = await fetch(href, { cache: 'no-store' });
  if (!res.ok) throw new Error('Видео не скачалось: ' + res.status);
  const declared = Number(res.headers && res.headers.get && res.headers.get('content-length')) || 0;
  if (declared > VIDEO_MAX_BYTES || declared > budget) return 'skipped';
  const blob = await res.blob();
  if (blob.size > VIDEO_MAX_BYTES || blob.size > budget) return 'skipped';
  await dbPut('media', KEY + url, { blob, type: blob.type || res.headers.get('content-type') || 'video/mp4', size: blob.size, at: Date.now() });
  return 'saved';
}

/** Убрать видео, которых нет в программе: место на телефоне не резиновое */
export async function pruneVideos(keep) {
  const wanted = new Set(keep);
  const rows = await dbList('media', KEY).catch(() => []);
  for (const { key } of rows) {
    if (!wanted.has(String(key).slice(KEY.length))) await dbDelete('media', key).catch(() => {});
  }
}

/** Выход из аккаунта — видео тоже долой: они из чужой программы */
export async function forgetVideos() {
  await pruneVideos([]);
}

/**
 * Адрес для <video>: сохранённый файл, если он есть, иначе — сервер.
 * Адрес Blob освобождается, когда экран уходит.
 */
export function useVideoSrc(url, href) {
  const [src, setSrc] = useState(href);
  useEffect(() => {
    let alive = true;
    let local = '';
    setSrc(href);
    dbGet('media', KEY + url)
      .then((saved) => {
        if (!alive || !saved || !saved.blob || typeof URL === 'undefined' || !URL.createObjectURL) return;
        local = URL.createObjectURL(saved.blob);
        setSrc(local);
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (local) { try { URL.revokeObjectURL(local); } catch (_) {} }
    };
  }, [url, href]);
  return src;
}
