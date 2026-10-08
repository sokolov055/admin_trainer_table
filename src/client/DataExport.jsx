import React, { useState } from 'react';
import { apiPrimary } from '../api.js';
import { Panel, Note } from '../ui.jsx';
import { IconAlert } from '../icons.jsx';

/**
 * «Копия моих данных» в «Моих данных» (FT-496, ст. 14 152-ФЗ).
 *
 * Сервер собирает всё, что о человеке хранится, в одну страницу HTML
 * (server/src/lib/data-export.js) и отдаёт её по короткой одноразовой
 * ссылке. Два шага, а не один, намеренно: во встроенном окне приложения на
 * iPhone и Android файл не скачать — ссылку открывает системный браузер,
 * и открыть его должно нажатие человека на настоящую ссылку. Иначе браузер
 * на компьютере посчитает окно непрошеным и заблокирует.
 */
export default function DataExport() {
  const [link, setLink] = useState(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  const prepare = async () => {
    setBusy(true);
    setProblem('');
    try {
      setLink(await apiPrimary('account.export', {}));
    } catch (error) {
      setProblem(error.message || 'Сервер не отвечает.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel pad className="data-export">
      <div className="survey__legend">
        Копия моих данных
        <span className="survey__legend-note">
          всё, что сервис хранит о вас: профиль, замеры, шаги, тренировки, питание, оплаты, согласия
        </span>
      </div>
      {link ? (
        <>
          <a className="button button--primary button--block" href={link.url} target="_blank" rel="noopener noreferrer" download>
            Скачать файл
          </a>
          <p className="small muted">
            Ссылка работает 10 минут. Файл — страница, которая открывается в любом браузере; внутри
            те же данные в формате JSON для переноса в другой сервис.
          </p>
        </>
      ) : (
        <button className="button button--block" onClick={prepare} disabled={busy}>
          {busy ? 'Собираю…' : 'Подготовить файл'}
        </button>
      )}
      {problem && <Note tone="critical" icon={IconAlert}>{problem}</Note>}
    </Panel>
  );
}
