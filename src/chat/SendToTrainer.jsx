import React, { useState } from 'react';
import { haptic } from '../telegram.js';
import { useChatInbox } from './chat-context.js';

/**
 * После тренировки у клиента: «Отправить тренеру итог» одной кнопкой
 * (FT-808, этап 2). Карточку собирает сервер из сохранённого занятия;
 * повторное нажатие не дублирует (тот же localId). Нет чата с тренером
 * (флаг CHAT выключен, тренер не подключён) — кнопки нет.
 */
export default function SendToTrainer({ sessionId }) {
  const inbox = useChatInbox();
  const [state, setState] = useState('idle');
  const [note, setNote] = useState('');
  if (!inbox.enabled || !inbox.chats.length || !sessionId) return null;
  const send = async () => {
    haptic();
    setState('busy');
    setNote('');
    try {
      await inbox.sendCard('workout', sessionId, 'wk-' + sessionId);
      setState('done');
    } catch (e) {
      setState('idle');
      setNote(e && e.code === 404 ? 'Занятие ещё сохраняется — попробуйте через минуту.' : (e && e.message) || 'Не получилось отправить.');
    }
  };
  return (
    <>
      <button type="button" className="button" disabled={state !== 'idle'} onClick={send}>
        {state === 'done' ? '✓ Итог отправлен тренеру' : state === 'busy' ? 'Отправляем…' : '💬 Отправить тренеру итог'}
      </button>
      {note && <p className="small muted">{note}</p>}
    </>
  );
}
