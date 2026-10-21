import { useEffect, useRef } from 'react';
import { localWorkouts, withLocalWeights } from '../workout-outbox.js';

/**
 * «Записать подходы» с карточки тренировки с часов (WatchSuggest.jsx, пункт
 * 12 плана трёх разборов, 21.10.2026). «Обзор» просит «Тренировки» открыть
 * тренировку программы — так же, как «Начать тренировку», но с началом по
 * часам: тогда занятие совместится с тренировкой часов (сервер,
 * health-workouts.js), а не ляжет рядом второй тренировкой.
 *
 * Просьба живёт в памяти страницы, пока «Тренировки» её не заберут: раздел
 * мог быть ещё не открыт (заберёт, когда загрузит программу) или уже открыт
 * и спрятан (заберёт по событию). Через минуту она устаревает — иначе
 * программа, не загрузившаяся без связи, открыла бы занятие сама, когда
 * человек давно ушёл в другой раздел.
 */
const EVENT = 'fittrack:watch-launch';
const FRESH_MS = 60000;
let pending = null;

export function requestWatchLaunch({ blockId = '', title = '', startedAt = '' }) {
  pending = { blockId, title, startedAt, at: Date.now() };
  try { window.dispatchEvent(new Event(EVENT)); } catch (_) {}
}

/**
 * Сторона «Тренировок» (Plan в screens.jsx): только свой кабинет клиента.
 * open — тот же переход в журнал, что у «Начать тренировку».
 */
export function useWatchLaunch({ enabled, data, month, setMonth, open }) {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    const run = async () => {
      if (!pending || !data) return;
      if (Date.now() - pending.at > FRESH_MS) { pending = null; return; }
      const want = pending;
      // У старых тренировок id нет — по названию, как в «Выполненных»
      const block = (data.blocks || []).find((b) => (want.blockId ? b.id === want.blockId : b.title === want.title));
      if (!block) {
        // Открыт другой месяц: вернуться к текущему — программа перечитается
        if (month) setMonth('');
        else pending = null;
        return;
      }
      pending = null;
      // «Было» — с занятиями, ещё не дошедшими до сервера, как у «Начать тренировку»
      const local = await localWorkouts(null).catch(() => []);
      if (!mounted.current) return;
      open({ block: withLocalWeights(block, local), month: data.month, members: data.members || [], startedAt: want.startedAt });
    };
    run();
    // Раздел уже открыт: забрать, когда он показан, — снимок для жеста
    // «назад» под журналом должен быть «Тренировками», а не «Обзором»
    const later = () => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => { run(); }) : run());
    window.addEventListener(EVENT, later);
    return () => window.removeEventListener(EVENT, later);
  }, [enabled, data, month]);
}
