import React, { useState } from 'react';
import { useGameProgress, enableProgress, disableProgress } from './game-progress.js';

/**
 * Сохранение игр в аккаунте (FT-700, 22.10.2026): отдельное добровольное
 * согласие — флажок не отмечен, кнопка неактивна без него. Включено — строка
 * с «Выключить»: прогресс на сервере удаляется сразу, на устройстве остаётся.
 */
export default function GameProgressCard({ className = '' }) {
  const progress = useGameProgress();
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  if (!progress.loaded || (progress.error && !progress.enabled)) return null;
  const run = async action => {
    setBusy(true); setError('');
    try { await action(); setConfirm(false); }
    catch (e) { setError(e?.message || 'Не получилось. Проверь связь и попробуй ещё раз.'); }
    finally { setBusy(false); }
  };
  if (progress.enabled) return <div className={'game-save game-save--on ' + className} role="status">
    {confirm
      ? <><span>Удалить прогресс из аккаунта? На этом телефоне он останется.</span>
        <span className="game-save__row"><button type="button" disabled={busy} onClick={() => run(disableProgress)}>Удалить</button><button type="button" onClick={() => setConfirm(false)}>Оставить</button></span></>
      : <><span><b aria-hidden="true">✓</b> Прогресс сохраняется в аккаунте</span><button type="button" className="game-save__link" onClick={() => setConfirm(true)}>Выключить</button></>}
    {error && <small role="alert">{error}</small>}
  </div>;
  return <div className={'game-save ' + className}>
    <strong>Продолжать на любом устройстве</strong>
    <span>Сохраним открытые уровни, незаконченную партию и карьеру в аккаунте — продолжишь с того же места.</span>
    <label><input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} />Даю <a href="game-progress-consent.html" target="_blank" rel="noopener">согласие на обработку игрового прогресса</a></label>
    <button type="button" disabled={!agree || busy} onClick={() => run(enableProgress)}>{busy ? 'Минуту…' : 'Сохранять в аккаунте'}</button>
    {error && <small role="alert">{error}</small>}
  </div>;
}
