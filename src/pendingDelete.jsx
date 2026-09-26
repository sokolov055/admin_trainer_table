import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { haptic } from './telegram.js';

/**
 * Удаление с «Вернуть» вместо вопроса «Точно удалить?» — как в «Почте»
 * iPhone. Строка пропадает сразу, внизу — «Удалено · Вернуть», а на
 * сервер удаление уходит через несколько секунд, если не вернули.
 *
 * Почему не подтверждение. Смахнуть и нажать (или протянуть до конца) —
 * уже намеренное действие; второй вопрос приучает жать «Да» не читая.
 * Ошибку исправляет «Вернуть», а не диалог перед ней (apple-design:
 * forgiveness).
 *
 * Отложенное не теряется: новое удаление, уход с экрана и закрытие
 * страницы отправляют ожидающее сразу.
 *
 *   const del = usePendingDelete((item) => apiMutate('x.delete', { id: item.id }),
 *     { onDone: reload, onError: setFailure });
 *   list.filter((x) => !del.hidden(x.id))
 *   del.remove(x.id, x, 'Расход удалён')
 *   {del.bar}
 */
const WAIT_MS = 5000;

export function usePendingDelete(commit, { onDone, onError } = {}) {
  const [pending, setPending] = useState(null);
  const [gone, setGone] = useState(() => new Set());
  const current = useRef(null);
  const timer = useRef(null);
  const handlers = useRef({});
  handlers.current = { commit, onDone, onError };

  const flush = () => {
    const p = current.current;
    if (!p) return;
    clearTimeout(timer.current);
    current.current = null;
    setPending(null);
    // Пока сервер не ответил и список не перечитан — строки нет
    setGone((prev) => new Set(prev).add(p.id));
    Promise.resolve()
      .then(() => handlers.current.commit(p.payload))
      .then(() => { if (handlers.current.onDone) handlers.current.onDone(p.payload); })
      .catch((error) => {
        setGone((prev) => { const next = new Set(prev); next.delete(p.id); return next; });
        if (handlers.current.onError) handlers.current.onError(error);
      });
  };

  const remove = (id, payload, text = 'Удалено') => {
    flush();
    const p = { id, payload, text };
    current.current = p;
    setPending(p);
    timer.current = setTimeout(flush, WAIT_MS);
  };

  const undo = () => {
    clearTimeout(timer.current);
    current.current = null;
    setPending(null);
    haptic('light');
  };

  // Ушли с экрана или закрыли страницу — отправить, а не забыть
  useEffect(() => {
    const leave = () => flush();
    const win = typeof window !== 'undefined' ? window : null;
    if (win) win.addEventListener('pagehide', leave);
    return () => { if (win) win.removeEventListener('pagehide', leave); flush(); };
  }, []);

  const hidden = (id) => gone.has(id) || (pending !== null && pending.id === id);

  const bar = pending && typeof document !== 'undefined'
    ? createPortal(
      <div className="undo-bar" role="status">
        <span>{pending.text}</span>
        <button type="button" className="button button--ghost" onClick={undo}>Вернуть</button>
      </div>,
      document.body,
    )
    : null;

  return { remove, hidden, bar, flush };
}
