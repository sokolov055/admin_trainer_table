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
// Сколько держится «Удалено · Вернуть» — одно время на всё приложение, и в
// занятии тоже (аудит 24.10.2026: там было 8 с, в списках 5)
export const UNDO_MS = 5000;
const WAIT_MS = UNDO_MS;

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

  const bar = pending ? <UndoBar text={pending.text} onUndo={undo} /> : null;

  return { remove, hidden, bar, flush };
}

/**
 * Сама плашка «Удалено · Вернуть» — закреплена над нижним меню (портал в
 * body, .undo-bar). Её же показывает экран занятия (Workout.jsx): там своё
 * «вернуть» без сервера, но плашка та же — одна на приложение (аудит
 * 24.10.2026: в занятии была вторая, в потоке и с другим временем). Без
 * настоящей страницы (проверки компонента) — на месте
 */
export function UndoBar({ text, onUndo }) {
  const node = (
    <div className="undo-bar" role="status">
      <span>{text}</span>
      <button type="button" className="button button--ghost" onClick={onUndo}>Вернуть</button>
    </div>
  );
  const dom = typeof document !== 'undefined' && !!document.body && document.body.nodeType === 1;
  return dom ? createPortal(node, document.body) : node;
}
