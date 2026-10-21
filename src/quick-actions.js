import { useEffect, useRef, useState } from 'react';

/**
 * Быстрая запись из «+» нижнего меню (пункт 13 плана, 21.10.2026).
 *
 * Лист «Что записать» живёт в ClientApp, а действия — на вкладках: форма
 * замера в «Прогрессе», начало занятия в «Тренировках», дневник в
 * «Питании». Лист переключает вкладку и оставляет запрос; экран вкладки
 * забирает его сам.
 *
 * Разделы ленивые (keptTabs.js): вкладку, где человек ещё не был, React
 * соберёт только после переключения, и событие к этому моменту уже
 * отзвучит. Поэтому последний запрос каждого вида хранится, пока его не
 * заберут, — экран берёт его при первой отрисовке. Забирают один раз:
 * спрятанный раздел не начнёт второе занятие, когда его покажут снова.
 *
 * Экран может быть не готов — программа ещё грузится. Тогда обработчик
 * возвращает false, запрос остаётся и приходит снова после следующей
 * отрисовки. Ждёт он минуту: открытая через полчаса вкладка не должна
 * внезапно начинать занятие, о котором человек уже забыл.
 */

const EVENT = 'fittrack:quick';
const TTL = 60000;

/**
 * Очередь запросов поверх любого EventTarget. В приложении — window; тест
 * подставляет свой и свои часы.
 */
export function createQuickBus({ target, now = () => Date.now(), ttl = TTL } = {}) {
  const events = target || (typeof window !== 'undefined' ? window : new EventTarget());
  const pending = new Map();

  const take = (kind) => {
    const entry = pending.get(kind);
    if (!entry) return null;
    pending.delete(kind);
    return now() - entry.at > ttl ? null : entry;
  };

  return {
    /** Оставить запрос и разбудить смонтированные экраны */
    request(kind, payload = {}) {
      pending.set(kind, { payload, at: now() });
      events.dispatchEvent(new CustomEvent(EVENT, { detail: { kind } }));
    },

    /** Подписка на запросы одного вида; возвращает отписку */
    listen(kind, fn) {
      const on = (event) => { if (event.detail && event.detail.kind === kind) fn(); };
      events.addEventListener(EVENT, on);
      return () => events.removeEventListener(EVENT, on);
    },

    /**
     * Отдать запрос обработчику. false от обработчика — «ещё не готов»:
     * запрос возвращается на место, если за это время не пришёл новый.
     * true — запрос был и его забрали.
     */
    deliver(kind, handler) {
      const entry = take(kind);
      if (!entry) return false;
      if (handler(entry.payload) === false) {
        if (!pending.has(kind)) pending.set(kind, entry);
        return false;
      }
      return true;
    },

    /** Есть ли живой запрос (для теста) */
    has(kind) {
      const entry = pending.get(kind);
      return !!entry && now() - entry.at <= ttl;
    },
  };
}

const bus = createQuickBus();

/** Попросить вкладку выполнить быстрое действие: 'workout', 'weight', 'food'… */
export function requestQuick(kind, payload = {}) {
  bus.request(kind, payload);
}

/**
 * Принять запрос на экране. handler(payload) вызывается один раз на
 * запрос; вернул false — экран не готов, запрос придёт после следующей
 * отрисовки. enabled = false — экран запросы не берёт (тот же экран у
 * семьи или у тренера в карточке клиента).
 */
export function useQuickRequest(kind, handler, enabled = true) {
  const latest = useRef(handler);
  latest.current = handler;
  const [, wake] = useState(0);

  useEffect(() => {
    if (!enabled) return undefined;
    return bus.listen(kind, () => wake((n) => n + 1));
  }, [kind, enabled]);

  // После каждой отрисовки: запрос мог прийти до монтирования, а экран —
  // дождаться своих данных. Без запроса это одна проверка по Map
  useEffect(() => {
    if (enabled) bus.deliver(kind, (payload) => latest.current(payload));
  });
}
