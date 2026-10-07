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

/**
 * Фото тренажёра (07.10.2026, FT-478): телефон уменьшает снимок до 1600 px
 * по длинной стороне и пересохраняет в JPEG. Мегабайты с камеры не идут
 * по мобильной сети, а пересохранение выбрасывает метаданные снимка — в
 * том числе место съёмки, которое серверу знать незачем.
 */
export async function shrinkPhoto(file, max = 1600) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Не получилось открыть фото — выберите другое.'));
      el.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob) throw new Error('Не получилось подготовить фото.');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Фото к тренажёру упражнения: сначала тренажёр сохраняют, потом фото — к нему */
export async function uploadMachinePhoto(exerciseId, uid, blob) {
  if (import.meta.env.VITE_MOCK === '1') {
    const url = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.readAsDataURL(blob);
    });
    const { mockMachinePhoto } = await import('./mock.js');
    mockMachinePhoto(exerciseId, uid, url);
    return { url };
  }

  await loadApiConfig();
  const base = String(currentApiUrl() || '').replace(/\/$/, '');
  if (!base) throw new Error('Не задан адрес сервера.');
  const headers = { 'Content-Type': blob.type || 'image/jpeg' };
  const initData = getInitData();
  if (initData) headers['X-Init-Data'] = initData;
  else headers.Authorization = 'Bearer ' + getToken();

  let res;
  try {
    res = await fetch(base + '/media/photo?exerciseId=' + encodeURIComponent(exerciseId) + '&uid=' + encodeURIComponent(uid), {
      method: 'POST', headers, body: blob,
    });
  } catch (_) {
    throw new Error('Не получилось загрузить фото. Проверьте связь.');
  }
  const body = await res.json().catch(() => null);
  if (!body || !body.ok) throw new Error((body && body.error) || (res.status === 413 ? 'Фото больше 10 МБ.' : 'Сервер не принял фото.'));
  return body.data;
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
