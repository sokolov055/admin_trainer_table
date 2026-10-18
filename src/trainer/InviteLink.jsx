import React, { useEffect, useState } from 'react';

import { copyText, createClientLink, fetchClientLink, shareAccessLink } from '../access.js';
import { haptic } from '../telegram.js';
import { IconAlert, IconCheck, IconCopy, IconRefresh, IconSend } from '../icons.jsx';

/**
 * Приглашение клиента в приложение — прямо из его карточки.
 *
 * Одна кнопка, один результат: ссылка, которую можно отправить чем
 * угодно. Клиент откроет её в браузере и сразу окажется в своём кабинете.
 * Ни бота, ни ключей, ни объяснений, что куда вводить.
 *
 * Ссылка не выпускается заново при каждом открытии карточки: сервер
 * восстанавливает ту же самую по подписи. Поэтому тренер, потерявший
 * переписку, отправляет клиенту ровно то, что отправлял раньше, и старая
 * ссылка не перестаёт работать у того, кто её уже получил.
 *
 * Здесь только две кнопки и строка о том, дошло ли до человека.
 * «Скопировать ссылку» — отдельной кнопкой и всегда на виду (FT-613):
 * бывает, что нужна только ссылка — вставить в свою переписку, — без
 * текста приглашения. Ссылки ещё нет — кнопка её выпустит и скопирует.
 *
 * Раскрытия «Ссылка и доступ» больше нет (FT-614): поле с адресом
 * повторяло «Скопировать ссылку», отзыв ссылки делает «Закрыть все
 * входы», а новую ссылку после него выпускает само приглашение.
 */

// member/memberName — ссылка для одного участника сплита: вход в кабинет
// пары от его имени
export function ClientInviteLink({ client, member, memberName, quiet = false }) {
  const [state, setState] = useState({ loading: true, link: null, error: null });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  // Адрес скопирован кнопкой рядом с ним — подпись держится пару секунд
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(timer);
  }, [copied]);

  const load = () => {
    setState((value) => ({ ...value, loading: true, error: null }));
    fetchClientLink(client.row, {}, member)
      .then((data) => setState({ loading: false, link: data.link, error: null }))
      .catch((error) => setState({ loading: false, link: null, error }));
  };

  useEffect(load, [client.row, member]);

  const run = async (action) => {
    if (busy) return;
    setBusy(true);
    setNote('');
    try {
      await action();
      setState((value) => ({ ...value, error: null }));
    } catch (error) {
      setState((value) => ({ ...value, error }));
    } finally {
      setBusy(false);
    }
  };

  // then — что сделать с только что выпущенной ссылкой: отправить
  // приглашение или просто скопировать
  const create = (then = 'send') => run(async () => {
    const data = await createClientLink(client.row, {}, member);
    setState({ loading: false, link: data.link, error: null });
    haptic('success');
    if (then === 'copy') {
      await copyText(data.link.url);
      setCopied(true);
      return;
    }
    await send(data.link);
  });

  const copy = (link) => run(async () => {
    await copyText(link.url);
    setCopied(true);
    haptic('success');
  });

  const send = async (link) => {
    const result = await shareAccessLink(link.url, memberName);
    if (result === 'cancelled') return;
    setNote(result === 'shared' ? 'Отправлено' : 'Приглашение со ссылкой скопировано — вставьте его в любой мессенджер');
    haptic('success');
  };

  if (state.loading) {
    return (
      <div className="access-link access-link--quiet">
        <IconRefresh size={16} />
        Проверяем доступ клиента…
      </div>
    );
  }

  const link = state.link;

  const copyButton = (onClick) => (
    <button type="button" className="button access-link__copy" onClick={onClick} disabled={busy}>
      {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
      {copied ? 'Скопировано' : 'Скопировать ссылку'}
    </button>
  );

  return (
    <div className="access-link">
      {state.error && (
        <div className="access-reset__error" role="alert">
          {state.error.message || 'Сервер не ответил'}
        </div>
      )}

      {!link && (
        <>
          <div className="access-link__lead">
            <button className="button button--primary access-link__invite" onClick={() => create('send')} disabled={busy}>
              {busy ? <IconRefresh size={16} /> : <IconSend size={16} />}
              {busy ? 'Готовим ссылку…' : memberName ? 'Пригласить: ' + memberName : 'Пригласить в приложение'}
            </button>
            {copyButton(() => create('copy'))}
          </div>
          {!quiet && (
            <p className="access-link__hint">
              Появится ссылка: отправьте её клиенту любым способом. Он откроет её
              в браузере и сразу попадёт в свой кабинет — без Telegram и пароля.
            </p>
          )}
        </>
      )}

      {link && (
        <>
          <div className="access-link__lead">
            <button className="button button--primary access-link__invite" onClick={() => run(() => send(link))} disabled={busy}>
              <IconSend size={16} />
              {navigator.share ? 'Отправить приглашение' : 'Скопировать приглашение'}{memberName ? ': ' + memberName : ''}
            </button>
            {copyButton(() => copy(link))}
          </div>
          <p className="access-link__state">{describeUses(link)}</p>
        </>
      )}

      {note && (
        <div className="access-link__note" role="status">
          <IconCheck size={15} />
          {note}
        </div>
      )}

      {!link && client.chatId && !quiet && (
        <p className="access-link__hint access-link__hint--muted">
          <IconAlert size={14} />
          Клиент уже заходит через Telegram. Ссылка нужна, чтобы он перешёл
          на обычный браузер — старый вход при этом продолжит работать.
        </p>
      )}
    </div>
  );
}

/**
 * Счётчик входов словами.
 *
 * Тренер смотрит сюда не из любопытства, а с вопросом «дошло ли до
 * человека». Поэтому первым делом видно, входили по ссылке или ещё нет.
 */
function describeUses(link) {
  if (!link.useCount) return 'Ещё не открывали';
  const left = link.usesLeft;
  return `Входов: ${link.useCount} из ${link.maxUses}` + (left <= 1 ? ' — почти исчерпана' : '');
}
