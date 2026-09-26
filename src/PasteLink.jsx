import React, { useState } from 'react';
import { linkTarget } from './access.js';

/**
 * Вход в Android-приложении по ссылке, вставленной руками.
 *
 * Тренер шлёт ссылку в Telegram, и Telegram открывает её у себя внутри —
 * до приложения она сама не доходит. Страница входа в Telegram предлагает
 * «Открыть в приложении», но если не вышло, остаётся самый понятный путь:
 * зажать ссылку в чате → «Копировать» → вставить сюда.
 *
 * Разбираем что угодно, где есть ?access=… (персональная ссылка) или
 * #loginTicket=… (одноразовый вход), и открываем тот же адрес внутри
 * приложения — дальше обычный экран входа с именем и кнопкой.
 */

export default function PasteLink() {
  const [value, setValue] = useState('');
  const [problem, setProblem] = useState('');

  const open = (text) => {
    const target = linkTarget(text, window.location.href);
    if (!target) {
      setProblem('Это не похоже на ссылку для входа. Скопируйте ссылку из сообщения тренера целиком.');
      return;
    }
    window.location.replace(target);
  };

  const fromClipboard = async () => {
    setProblem('');
    try {
      const text = await navigator.clipboard.readText();
      if (text) { setValue(text); open(text); return; }
    } catch (_) { /* буфер не отдали — вставят руками */ }
    setProblem('Не получилось прочитать буфер. Вставьте ссылку в поле: зажмите его и выберите «Вставить».');
  };

  return (
    <form className="paste-link" onSubmit={(e) => { e.preventDefault(); setProblem(''); open(value); }}>
      <p className="paste-link__lead">Ссылка пришла в Telegram?</p>
      <p className="small muted">Зажмите её в чате → «Копировать» — и вставьте сюда.</p>
      <input
        className="field__input"
        inputMode="url"
        placeholder="Вставьте ссылку от тренера"
        aria-label="Ссылка от тренера"
        value={value}
        onChange={(e) => { setValue(e.target.value); setProblem(''); }}
      />
      <div className="paste-link__actions">
        <button type="submit" className="button button--primary" disabled={!value.trim()}>Войти по ссылке</button>
        <button type="button" className="button" onClick={fromClipboard}>Вставить из буфера</button>
      </div>
      {problem && <p className="small muted" role="alert">{problem}</p>}
    </form>
  );
}
