import React, { useState } from 'react';
import { apiPrimary } from '../api.js';
import { Panel } from '../ui.jsx';
import { IconLink, IconCopy, IconCheck, IconRefresh, IconSend } from '../icons.jsx';
import { haptic } from '../telegram.js';
import { trainerLinkUrl } from '../trainer-link.js';

/**
 * Привязать клиента, который зарегистрировался сам.
 *
 * Два пути, и оба требуют согласия клиента (lib/accounts.js на сервере):
 * ID из его «Моего тренера» — клиенту приходит запрос; или своя ссылка —
 * открыв её, клиент видит «Тренер приглашает» и нажимает «Привязаться».
 * До согласия тренер не видит о человеке ничего, даже имени: иначе ID
 * работал бы как ключ от чужих данных.
 *
 * Живёт рядом с «Добавить клиента»: это то же действие — появился новый
 * человек, — только карточку он завёл себе сам.
 */
export default function LinkClient({ onLinked }) {
  const [open, setOpen] = useState(false);
  const [publicId, setPublicId] = useState('');
  const [link, setLink] = useState(null);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState('');
  const [copied, setCopied] = useState(false);

  const run = async (what, fn) => {
    setBusy(what);
    setProblem('');
    setNote('');
    try { await fn(); } catch (error) { setProblem(error.message || 'Не получилось.'); } finally { setBusy(''); }
  };

  const loadLink = (renew = false) => run(renew ? 'renew' : 'link', async () => {
    const res = await apiPrimary('trainer.link.url', renew ? { renew: true } : {});
    setLink(res);
    if (renew) setNote('Новая ссылка готова. Прежняя больше не работает.');
  });

  const openPanel = () => {
    setOpen(true);
    haptic();
    if (!link) loadLink();
  };

  const send = (event) => {
    event.preventDefault();
    if (!publicId.trim() || busy) return;
    run('id', async () => {
      const res = await apiPrimary('trainer.link.byid', { publicId });
      haptic('success');
      setPublicId('');
      setNote(`Запрос отправлен ${res.publicId}. Клиент подтвердит его в приложении — и появится в списке.`);
      const fresh = await apiPrimary('trainer.link.url', {});
      setLink(fresh);
      if (onLinked) onLinked();
    });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(trainerLinkUrl(link.token));
      setCopied(true);
      haptic('success');
      setTimeout(() => setCopied(false), 2000);
    } catch (_) {
      setProblem('Скопировать не вышло — выделите ссылку вручную.');
    }
  };

  if (!open) {
    return (
      <button className="button button--ghost button--block" onClick={openPanel}>
        <IconLink size={17} />
        Привязать клиента по ID или ссылке
      </button>
    );
  }

  return (
    <Panel pad className="link-client">
      <form className="link-client" onSubmit={send}>
        <label className="field">
          <span className="field__label">ID клиента</span>
          <input
            className="field__input"
            value={publicId}
            onChange={(e) => setPublicId(e.target.value.toUpperCase())}
            placeholder="FT-XXXXXX"
            autoComplete="off"
            maxLength={12}
          />
          <span className="field__hint">Клиент найдёт его в приложении: меню → «Мой тренер».</span>
        </label>
        <button className="button button--primary" disabled={!!busy || !publicId.trim()}>
          {busy === 'id' ? <IconRefresh size={16} /> : <IconSend size={16} />}
          {busy === 'id' ? 'Отправляю…' : 'Отправить запрос'}
        </button>
      </form>

      <div className="field">
        <span className="field__label">Или ваша ссылка для привязки</span>
        {link ? (
          <div className="link-client__row">
            <span className="link-client__url">{trainerLinkUrl(link.token)}</span>
            <button type="button" className="button button--ghost" onClick={copy}>
              {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
              {copied ? 'Скопирована' : 'Скопировать'}
            </button>
          </div>
        ) : <span className="small muted">{busy === 'link' ? 'Загружаю…' : ''}</span>}
        <span className="field__hint">
          Одна на всех ваших клиентов. Открыв её, человек войдёт или зарегистрируется
          и подтвердит привязку.
        </span>
      </div>

      {link && link.pending && link.pending.length > 0 && (
        <p className="small muted">
          Ждут подтверждения: {link.pending.map((p) => p.publicId).join(', ')}
        </p>
      )}

      {note && <p className="small" role="status">{note}</p>}
      {problem && <p className="small muted" role="alert">{problem}</p>}

      <div className="add-client__actions">
        <button type="button" className="button button--ghost" onClick={() => loadLink(true)} disabled={!!busy}>
          {busy === 'renew' ? 'Выпускаю…' : 'Выпустить новую ссылку'}
        </button>
        <button type="button" className="button button--ghost" onClick={() => setOpen(false)} disabled={!!busy}>
          Свернуть
        </button>
      </div>
    </Panel>
  );
}

/**
 * В карточке клиента из таблицы: связать её с кабинетом, который человек
 * завёл себе сам. Без этого клиент, скачавший приложение и
 * зарегистрировавшийся по почте, сидел бы в пустом втором кабинете, а
 * его история оставалась бы в карточке, куда он не входит. После
 * согласия клиента кабинет сливается с карточкой (lib/accounts.js,
 * mergeIntoCard) — вход по той же почте открывает уже её.
 */
export function LinkExisting({ client }) {
  const [open, setOpen] = useState(false);
  const [publicId, setPublicId] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState('');

  const send = async (event) => {
    event.preventDefault();
    if (!publicId.trim() || busy) return;
    setBusy(true);
    setProblem('');
    setNote('');
    try {
      const res = await apiPrimary('trainer.link.byid', { publicId, clientRow: client.row });
      haptic('success');
      setPublicId('');
      setNote(`Запрос отправлен ${res.publicId}. Когда клиент подтвердит, его кабинет объединится с этой карточкой.`);
    } catch (error) {
      setProblem(error.message || 'Не получилось.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button className="button button--ghost" onClick={() => { setOpen(true); haptic(); }}>
        <IconLink size={16} />
        Клиент уже зарегистрировался сам? Связать по ID
      </button>
    );
  }

  return (
    <form className="link-client" onSubmit={send}>
      <label className="field">
        <span className="field__label">ID из приложения клиента</span>
        <input
          className="field__input"
          value={publicId}
          onChange={(e) => setPublicId(e.target.value.toUpperCase())}
          placeholder="FT-XXXXXX"
          autoComplete="off"
          maxLength={12}
          autoFocus
        />
        <span className="field__hint">
          Меню → «Мой тренер». История из этой карточки появится у клиента, вход — по его почте.
        </span>
      </label>
      {note && <p className="small" role="status">{note}</p>}
      {problem && <p className="small muted" role="alert">{problem}</p>}
      <div className="add-client__actions">
        <button className="button button--primary" disabled={busy || !publicId.trim()}>
          {busy ? 'Отправляю…' : 'Отправить запрос'}
        </button>
        <button type="button" className="button button--ghost" onClick={() => setOpen(false)} disabled={busy}>
          Отмена
        </button>
      </div>
    </form>
  );
}
