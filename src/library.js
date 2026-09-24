import { loadApiConfig, currentApiUrl } from './apiConfig.js';
import { getInitData } from './telegram.js';
import { getToken } from './session.js';

/**
 * Видео к упражнению — отдельным запросом, не через общий API.
 *
 * Общий запрос несёт JSON в несколько килобайт, а видео с телефона — сотни
 * мегабайт. Поэтому файл уходит как есть, сырым телом, на свой адрес
 * (сервер: api/media.js), а представляется тренер заголовком. XHR, а не
 * fetch — ради полосы загрузки: полгигабайта по мобильной сети идут
 * минуты, и без прогресса это выглядит как зависание.
 */
export async function uploadVideo(exerciseId, file, onProgress = () => {}) {
  if (import.meta.env.VITE_MOCK === '1') {
    onProgress(1);
    return { url: '', kind: 'file' };
  }

  await loadApiConfig();
  const base = String(currentApiUrl() || '').replace(/\/$/, '');
  if (!base) throw new Error('Не задан адрес сервера.');

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', base + '/media/upload?exerciseId=' + encodeURIComponent(exerciseId));

    const initData = getInitData();
    if (initData) xhr.setRequestHeader('X-Init-Data', initData);
    else xhr.setRequestHeader('Authorization', 'Bearer ' + getToken());
    xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');

    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText);
        if (body.ok) resolve(body.data);
        else reject(new Error(body.error || 'Сервер не принял видео.'));
      } catch (_) {
        reject(new Error(xhr.status === 413 ? 'Видео больше 500 МБ.' : 'Сервер не принял видео.'));
      }
    };
    xhr.onerror = () => reject(new Error('Не получилось загрузить видео. Проверьте связь.'));
    xhr.send(file);
  });
}

/** Адрес видео с сервера — относительный, к нему нужен адрес API */
export function mediaUrl(url) {
  if (!url) return '';
  if (!url.startsWith('/')) return url;
  return String(currentApiUrl() || '').replace(/\/$/, '') + url;
}

/** Встраиваемый YouTube: плеер прямо в приложении, а не уход в браузер */
export function youtubeEmbed(url) {
  const m = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([\w-]{11})/.exec(url || '');
  return m ? 'https://www.youtube.com/embed/' + m[1] : '';
}

/** «Сентябрь 2026» — месяц так называется в программе клиента */
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

export function monthName(date = new Date()) {
  return MONTHS[date.getMonth()] + ' ' + date.getFullYear();
}
