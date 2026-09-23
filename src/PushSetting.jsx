import React, { useState } from 'react';
import { enablePush, disablePush, pushState, pushSupported, installedAsApp } from './push.js';

/**
 * Уведомления на этом устройстве.
 *
 * Спрашиваем разрешение только по нажатию: браузеры наказывают за
 * непрошеный запрос, а человек, которого спросили сразу, жмёт «запретить»
 * не глядя — и вернуть это можно только через настройки браузера.
 *
 * Отдельно предупреждаем про iPhone: там уведомления работают только у
 * приложения, добавленного на домашний экран. Умолчать об этом значит
 * оставить человека с кнопкой, которая у него молча не работает.
 */
export default function PushSetting({ clientRow }) {
  const [state, setState] = useState(() => pushState());
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  if (!pushSupported()) return null;

  const iphone = /iPhone|iPad/.test(navigator.userAgent) && !installedAsApp();

  const turnOn = async () => {
    setBusy(true);
    setProblem('');
    try {
      const result = await enablePush(clientRow);
      if (!result.ok) setProblem(result.reason);
      setState(pushState());
    } catch (error) {
      setProblem(error.message || 'Не получилось включить уведомления.');
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      await disablePush();
      setState(pushState());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="survey__group">
      <div className="survey__legend">
        Напоминания
        <span className="survey__legend-note">
          взвешивание раз в неделю, замеры раз в месяц и конец отдыха на тренировке
        </span>
      </div>

      {iphone ? (
        <p className="small muted">
          На iPhone уведомления приходят только приложению, добавленному на экран «Домой».
          Откройте меню «Поделиться» и выберите «На экран „Домой“» — потом включите здесь.
        </p>
      ) : (
        <div className="survey__actions">
          {state === 'granted'
            ? <button className="button" onClick={turnOff} disabled={busy}>Выключить на этом устройстве</button>
            : <button className="button button--primary" onClick={turnOn} disabled={busy}>
                {busy ? 'Включаю…' : 'Включить уведомления'}
              </button>}
        </div>
      )}

      {problem && <p className="small muted">{problem}</p>}
    </div>
  );
}
