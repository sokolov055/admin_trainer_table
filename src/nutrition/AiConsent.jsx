import React, { useState } from 'react';
import { apiMutate } from '../api.js';
import { Sheet, Note } from '../ui.jsx';
import { haptic } from '../telegram.js';
import { FOOD_PHOTO_CONSENT_URL } from '../PrivacyLink.jsx';

/**
 * Сканер еды · AI — один раз перед первой отправкой кадра (FT-752).
 *
 * Кадр уходит в Yandex AI Studio: App Store 5.1.2(i) требует сказать, что и
 * кому уходит, и спросить до отправки; 152-ФЗ — отдельное согласие с
 * названным обработчиком. Галочка не отмечена, без неё кнопка неактивна.
 * На самом сканере про Яндекс больше не пишем (просьба владельца).
 * Отозвать — «Питание → Ещё → Сканер еды · AI» (AiScannerSettings).
 */
export function AiConsentSheet({ version, onAgreed, onClose }) {
  const [agree, setAgree] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const submit = async () => {
    setBusy(true); setError('');
    try {
      await apiMutate('diary.photo.consent', { accept: true, version });
      haptic('success');
      onAgreed();
    } catch (e) { setError(e?.message || 'Не получилось. Проверьте связь и попробуйте ещё раз.'); setBusy(false); }
  };
  return <Sheet title="Сканер еды · AI" onClose={onClose} className="ai-consent">
    <p className="ai-consent__lead">Сканер узнаёт еду на фото с помощью нейросети. Перед первым снимком — коротко, куда уходит кадр.</p>
    <ul className="ai-consent__list">
      <li><strong>Кадр тарелки или упаковки</strong> уходит в Yandex AI Studio — сервис ООО «Яндекс.Облако», Россия.</li>
      <li><strong>Только картинка:</strong> без имени, почты и места съёмки. Снимок мы не храним и просим Яндекс не сохранять запрос.</li>
      <li><strong>Ответ сканера и что вы записали</strong> храним 90 дней — по ним улучшаем распознавание.</li>
      <li><strong>Передумаете</strong> — «Питание → Ещё → Сканер еды · AI».</li>
    </ul>
    <label className="ai-consent__check">
      <input type="checkbox" checked={agree} disabled={busy} onChange={e => setAgree(e.target.checked)} />
      <span>Даю <a href={FOOD_PHOTO_CONSENT_URL} target="_blank" rel="noopener noreferrer">отдельное согласие на распознавание еды по фото</a></span>
    </label>
    {error && <Note tone="critical">{error}</Note>}
    <div className="ai-consent__actions">
      <button type="button" className="button button--primary button--block" disabled={!agree || busy} onClick={submit}>{busy ? 'Минуту…' : 'Разрешить и открыть сканер'}</button>
      <button type="button" className="button button--ghost button--block" disabled={busy} onClick={onClose}>Не сейчас</button>
    </div>
  </Sheet>;
}

/** «Ещё → Сканер еды · AI»: согласие дано — отозвать; не дано — разрешить */
export function AiScannerSettings({ consent, onAllow, onRevoked, onClose }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [sure, setSure] = useState(false);
  const revoke = async () => {
    setBusy(true); setError('');
    try { await apiMutate('diary.photo.revoke', {}); haptic('success'); onRevoked(); }
    catch (e) { setError(e?.message || 'Не получилось. Проверьте связь и попробуйте ещё раз.'); setBusy(false); }
  };
  return <Sheet title="Сканер еды · AI" onClose={onClose} className="ai-consent">
    {consent ? <>
      <p className="ai-consent__lead">Сканер включён. Кадры распознаёт Yandex AI Studio (ООО «Яндекс.Облако», Россия) по вашему <a href={FOOD_PHOTO_CONSENT_URL} target="_blank" rel="noopener noreferrer">согласию</a>.</p>
      <p className="small muted">Если отозвать согласие, сканер выключится, а ответы сканера за последние 90 дней сразу удалятся. Записи в дневнике останутся.</p>
      {error && <Note tone="critical">{error}</Note>}
      <div className="ai-consent__actions">
        {sure
          ? <><button type="button" className="button danger button--block" disabled={busy} onClick={revoke}>{busy ? 'Минуту…' : 'Отозвать и удалить'}</button><button type="button" className="button button--ghost button--block" disabled={busy} onClick={() => setSure(false)}>Оставить</button></>
          : <button type="button" className="button button--block" onClick={() => setSure(true)}>Отозвать согласие</button>}
      </div>
    </> : <>
      <p className="ai-consent__lead">Сканер выключен. Еду можно добавлять поиском и по штрихкоду — так кадры в Яндекс не уходят.</p>
      <div className="ai-consent__actions"><button type="button" className="button button--primary button--block" onClick={onAllow}>Включить сканер</button></div>
    </>}
  </Sheet>;
}
