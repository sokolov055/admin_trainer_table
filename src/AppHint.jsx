import React, { useState } from 'react';
import { canOpenInApp, openInApp, appInstalled, ANDROID_APK_URL } from './open-in-app.js';
import { detectBrowser, androidBrowserUrl } from './browser.js';
import { IconClose, IconPhone, IconExternal } from './icons.jsx';

/**
 * Android: поставить приложение Fit Track прямо из кабинета и перенести в
 * него вход — без ссылок в переписке.
 *
 * Два шага, и оба здесь же:
 *   1. «Установить» — скачивается APK, Android его ставит. Из браузера
 *      Telegram скачивание не работает, поэтому оттуда APK открывается в
 *      Chrome (intent), а тот уже скачивает.
 *   2. «Открыть в приложении» — открытый здесь кабинет переезжает в
 *      приложение одноразовым билетом (open-in-app.js). Приложения ещё нет —
 *      вместо открытия начнётся то же скачивание.
 *
 * Приложение уже стоит (Chrome это знает, см. appInstalled) — не
 * предлагаем, а сразу переходим в него с переносом кабинета. Один раз за
 * визит: вернулся в браузер — значит, хотел остаться, и второй раз не
 * выкидываем. Где узнать нельзя (браузер Telegram) — обе кнопки.
 *
 * Вместо подсказки «Добавить на экран»: у Android есть приложение лучше
 * ярлыка — с шагами и уведомлениями. Закрыли — не навязываем; вернуть можно
 * из меню («Приложение для Android»), см. showAppHint.
 */
const KEY = 'android_app_hint_v1';
const AUTO_KEY = 'android_app_auto_v1';

export function appHintHidden() {
  try { return localStorage.getItem(KEY) === '1'; } catch (_) { return false; }
}

let listeners = new Set();
/** Показать плашку снова — из меню */
export function showAppHint() {
  try { localStorage.removeItem(KEY); } catch (_) {}
  listeners.forEach((fn) => fn());
}

export default function AppHint({ active }) {
  const [hidden, setHidden] = useState(appHintHidden);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [installed, setInstalled] = useState(null);

  React.useEffect(() => {
    const again = () => setHidden(false);
    listeners.add(again);
    return () => listeners.delete(again);
  }, []);

  // Стоит ли приложение — и если стоит, сразу туда (раз за визит)
  React.useEffect(() => {
    if (!active || !canOpenInApp()) return undefined;
    let alive = true;
    const check = () => appInstalled().then((yes) => {
      if (!alive) return;
      setInstalled(yes);
      if (!yes) return;
      try {
        if (sessionStorage.getItem(AUTO_KEY)) return;
        sessionStorage.setItem(AUTO_KEY, '1');
      } catch (_) { return; }
      openInApp().catch(() => {});
    });
    check();
    // Скачал, поставил, вернулся во вкладку — проверяем снова: теперь
    // приложение есть, и кабинет сам переходит в него
    const back = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', back);
    return () => { alive = false; document.removeEventListener('visibilitychange', back); };
  }, [active]);

  if (!active || !canOpenInApp()) return null;
  // Закрытую плашку не показываем, но если приложение стоит — кнопка
  // «Открыть» нужнее, чем уважение к давно закрытой рекламе установки
  if (hidden && installed !== true) return null;
  const where = detectBrowser();
  // Внутри Telegram (WebView) файл не скачать — отдаём ссылку Chrome
  const installHref = where.kind === 'webview' ? androidBrowserUrl(ANDROID_APK_URL) : ANDROID_APK_URL;

  const close = () => {
    try { localStorage.setItem(KEY, '1'); } catch (_) {}
    setHidden(true);
  };

  const open = async () => {
    setBusy(true);
    setProblem('');
    try {
      await openInApp();
    } catch (e) {
      setProblem(e.message || 'Не получилось открыть приложение. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="install-hint app-hint" aria-labelledby="app-hint-title">
      <button className="install-hint__close" onClick={close} aria-label="Закрыть подсказку">
        <IconClose size={18} />
      </button>
      <div className="install-hint__icon"><IconPhone size={20} /></div>
      <div className="install-hint__body">
        <h2 className="install-hint__title" id="app-hint-title">
          {installed ? 'Кабинет — в приложении Fit Track' : 'Приложение Fit Track для Android'}
        </h2>
        <p className="install-hint__text">
          {installed
            ? 'Приложение уже стоит на телефоне. Откройте кабинет в нём: вход перенесётся сам.'
            : 'Шаги из телефона и уведомления. Установите — и откройте кабинет в нём: вход перенесётся сам.'}
        </p>
        <div className="app-hint__actions">
          {installed !== true && (
            <a className="button button--primary install-hint__action" href={installHref}>
              <IconExternal size={16} />
              Установить
            </a>
          )}
          {installed !== false && (
            <button className={'button install-hint__action' + (installed ? ' button--primary' : '')} onClick={open} disabled={busy}>
              {busy ? 'Открываем…' : 'Открыть в приложении'}
            </button>
          )}
        </div>
        {installed !== true && (
          <p className="small muted app-hint__note">
            После скачивания нажмите на файл и разрешите установку. Потом вернитесь сюда
            {installed === false ? ' — кабинет сам перейдёт в приложение.' : ' и нажмите «Открыть в приложении».'}
          </p>
        )}
        {problem && <p className="install-hint__error" role="alert">{problem}</p>}
      </div>
    </aside>
  );
}
