import React, { useCallback, useEffect, useState } from 'react';
import { enablePush, disablePush, pushStatus, pushSupported, installedAsApp } from './push.js';

/**
 * Уведомления на этом устройстве.
 *
 * Состояние здесь — подписка, а не разрешение браузера. Разрешение,
 * однажды выданное, обратно не забирается: после «выключить» оно остаётся
 * `granted`. Пока кнопка смотрела на него, она и после выключения говорила
 * «выключить» — человек видел, что ничего не произошло, а включить обратно
 * было уже нечем.
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
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  const refresh = useCallback(() => {
    let alive = true;
    pushStatus().then((next) => { if (alive) setStatus(next); });
    return () => { alive = false; };
  }, []);

  useEffect(refresh, [refresh]);

  if (!pushSupported()) return null;

  const iphone = /iPhone|iPad/.test(navigator.userAgent) && !installedAsApp();

  const turnOn = async () => {
    setBusy(true);
    setProblem('');
    try {
      const result = await enablePush(clientRow);
      if (!result.ok) setProblem(result.reason);
    } catch (error) {
      setProblem(error.message || 'Не получилось включить уведомления.');
    } finally {
      // Состояние перечитываем в любом случае, даже после отказа: браузер
      // мог выдать разрешение и не создать подписку, и врать об этом
      // хуже, чем показать, как есть.
      setStatus(await pushStatus());
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    setProblem('');
    try {
      await disablePush();
    } catch (error) {
      setProblem(error.message || 'Не получилось выключить уведомления.');
    } finally {
      setStatus(await pushStatus());
      setBusy(false);
    }
  };

  return (
    <div className="survey__group panel panel--pad">
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
        <Control status={status} busy={busy} onOn={turnOn} onOff={turnOff} />
      )}

      {problem && <p className="small muted">{problem}</p>}
    </div>
  );
}

/**
 * Кнопка и то, что рядом с ней.
 *
 * Пока состояние неизвестно, кнопки нет вовсе. Показать «включить» до
 * ответа значило бы предложить включить уже включённое, а один раз
 * промелькнувшая не та подпись стоит дороже, чем полсекунды ожидания.
 */
function Control({ status, busy, onOn, onOff }) {
  if (!status) return <p className="small muted">Проверяю…</p>;

  if (status.permission === 'denied') {
    return (
      <p className="small muted">
        Уведомления запрещены для этого сайта. Включить их можно в настройках браузера —
        приложение спросить повторно уже не может.
      </p>
    );
  }

  if (status.subscribed) {
    return (
      <>
        <div className="survey__actions">
          <button className="button" onClick={onOff} disabled={busy}>
            {busy ? 'Выключаю…' : 'Выключить на этом устройстве'}
          </button>
        </div>
        <p className="small muted">Сейчас включены на этом устройстве.</p>
      </>
    );
  }

  return (
    <div className="survey__actions">
      <button className="button button--primary" onClick={onOn} disabled={busy}>
        {busy ? 'Включаю…' : 'Включить уведомления'}
      </button>
    </div>
  );
}
