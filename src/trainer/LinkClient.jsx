import React, { useState } from 'react';
import { apiPrimary } from '../api.js';
import { shareText } from '../access.js';
import { Panel } from '../ui.jsx';
import { IconLink, IconCopy, IconCheck, IconRefresh, IconSend, IconHelp } from '../icons.jsx';
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
 * Инструкция клиенту, где взять ID (FT-613): тренер отправляет её одним
 * нажатием, а не объясняет своими словами. Путь — как в клиентском
 * приложении: кнопка меню справа вверху → «Мой тренер» → «Мой ID».
 */
export const ID_INSTRUCTION = 'Здравствуйте! Чтобы связать ваш кабинет в Fit Track с моей карточкой, пришлите мне ваш ID.'
  + ' Где его найти: откройте приложение → кнопка меню справа вверху → «Мой тренер».'
  + ' Там код вида FT-XXXXXX и кнопка «Скопировать». Пришлите этот код в ответ —'
  + ' потом подтвердите в приложении запрос от меня.';

/**
 * В карточке клиента из таблицы: связать её с кабинетом, который человек
 * завёл себе сам. Без этого клиент, скачавший приложение и
 * зарегистрировавшийся по почте, сидел бы в пустом втором кабинете, а
 * его история оставалась бы в карточке, куда он не входит. После
 * согласия клиента кабинет сливается с карточкой (lib/accounts.js,
 * mergeIntoCard) — вход по той же почте открывает уже её.
 *
 * Где клиенту взять ID, было непонятно (FT-613): рядом — «?» с
 * подсказкой и кнопка, которая отправляет клиенту готовую инструкцию.
 * Подсказка раскрывается касанием, а не наведением: на телефоне
 * наведения нет.
 */
export function LinkExisting({ client }) {
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [publicId, setPublicId] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState('');
  const helpId = 'link-id-help-' + client.row;

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

  const sendInstruction = async () => {
    setProblem('');
    try {
      const result = await shareText(ID_INSTRUCTION);
      if (result === 'cancelled') return;
      haptic('success');
      setNote(result === 'shared' ? 'Инструкция отправлена.' : 'Инструкция скопирована — вставьте её в переписку с клиентом.');
    } catch (_) {
      setProblem('Не получилось — перескажите клиенту подсказку под «?».');
    }
  };

  return (
    <div className="link-existing">
      <div className="link-existing__head">
        <strong className="manage__label">Клиент уже зарегистрировался сам?</strong>
        <button
          type="button"
          className="icon-button link-existing__help"
          aria-label="Где клиенту взять ID"
          aria-expanded={help}
          aria-controls={helpId}
          onClick={() => { setHelp((v) => !v); haptic(); }}
        >
          <IconHelp size={20} />
        </button>
      </div>
      <p className="manage__hint">
        Свяжите его кабинет с этой карточкой по ID — история отсюда появится у клиента.
      </p>

      {help && (
        <div className="link-existing__tip" id={helpId} role="note">
          <p>
            ID — код вида <code>FT-XXXXXX</code>. Клиент находит его у себя в приложении:
            кнопка меню справа вверху → «Мой тренер». Там же кнопка «Скопировать».
          </p>
          <button type="button" className="button" onClick={sendInstruction}>
            <IconSend size={16} />
            Отправить инструкцию клиенту
          </button>
        </div>
      )}

      {!open ? (
        <button className="button button--ghost link-existing__open" onClick={() => { setOpen(true); haptic(); }}>
          <IconLink size={16} />
          Связать по ID
        </button>
      ) : (
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
              Клиенту придёт запрос. Когда он подтвердит — вход по его почте откроет эту карточку.
            </span>
          </label>
          <div className="add-client__actions">
            <button className="button button--primary" disabled={busy || !publicId.trim()}>
              {busy ? 'Отправляю…' : 'Отправить запрос'}
            </button>
            <button type="button" className="button button--ghost" onClick={() => setOpen(false)} disabled={busy}>
              Отмена
            </button>
          </div>
        </form>
      )}
      {note && <p className="small" role="status">{note}</p>}
      {problem && <p className="small muted" role="alert">{problem}</p>}
    </div>
  );
}
