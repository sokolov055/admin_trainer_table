import React, { useEffect, useRef, useState } from 'react';

import { apiMutate } from '../api.js';
import { useData } from '../useData.js';
import { ErrorState, Loading, Note, Panel, Row, Rows, Section, Tag, formatWhen } from '../ui.jsx';
import { haptic } from '../telegram.js';
import { isTried, setGamePacks, setTried } from '../game-packs-store.js';
import { readPackFile } from './admin-model.js';

/**
 * «Управление → Игры → Вопросы и уровни» (22.10.2026): наборы для игр файлом —
 * вопросы «Тренера в планке» и уровни «Блинов» без сборки (сервер —
 * lib/game-packs.js). Порядок владельца, как у тем: загружен — закрыт;
 * «Примерить у себя» — включить на своём телефоне и поиграть; понравилось —
 * «Открыть для всех»; «Закрыть» — у всех пропадает; «Удалить» — из базы.
 */
const GAME = { plank: 'Тренер в планке', blini: 'Блины' };

export default function AdminGamePacks() {
  const { data, loading, error, reload } = useData('owner.gamepacks', {}, []);
  const [state, setState] = useState(null);
  const [draft, setDraft] = useState(null);
  const [fileError, setFileError] = useState('');
  const [uploaded, setUploaded] = useState(false);
  const [asking, setAsking] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const [, redraw] = useState(0);
  const input = useRef(null);

  useEffect(() => { if (data) setState(data); }, [data]);

  if (loading || (data && !state)) return <Loading rows={3} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  // Ответ сервера — и на своё устройство, как app.gamepacks владельцу
  const applyHere = (next) => {
    setState(next);
    setGamePacks({ packs: next.packs.map(({ at, by, summary, ...p }) => p), trial: true });
  };

  const run = async (action, params) => {
    setBusy(true); setProblem(null);
    try {
      const next = await apiMutate(action, params);
      haptic('success');
      setAsking('');
      applyHere(next);
      return true;
    } catch (err) {
      setProblem(err);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const pickFile = (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    setFileError(''); setDraft(null); setUploaded(false);
    if (!file) return;
    if (file.size > 600 * 1024) { setFileError('Файл больше 600 КБ — это не набор.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const { pack, error: why } = readPackFile(reader.result);
      if (why) { setFileError(why); haptic('error'); return; }
      setDraft(pack);
    };
    reader.onerror = () => setFileError('Файл не прочитался — выберите его ещё раз.');
    reader.readAsText(file);
  };

  const upload = async () => {
    if (await run('owner.gamepacks.upload', { pack: draft })) { setDraft(null); setUploaded(true); }
  };

  const tryOn = (id, on) => {
    haptic('light');
    setTried(id, on);
    redraw((n) => n + 1);
  };

  const replacing = draft && state.packs.find((p) => p.id === draft.id);

  return (
    <>
      {problem && <Note tone="critical">Не получилось: {problem.message || 'нет связи'}</Note>}
      <Section title="Вопросы и уровни" note="Набор вопросов для «Тренера в планке» или уровней для «Блинов» — файлом от Claude, без новой сборки">
        <Panel pad className="admin-flag">
          <input ref={input} type="file" accept=".json,application/json" hidden onChange={pickFile} />
          {!draft && (
            <div className="trainer-row__actions">
              <button type="button" className="button button--primary" disabled={busy} onClick={() => input.current && input.current.click()}>
                Выбрать файл набора
              </button>
            </div>
          )}
          {fileError && <Note tone="critical">{fileError}</Note>}
          {uploaded && !draft && <Note tone="good">Загружен и закрыт — людям не виден. «Примерить у себя» — и поиграйте; понравится — «Открыть для всех».</Note>}
          {draft && (
            <>
              <div className="trainer-row__copy">
                <strong>{draft.name}</strong>
                <span>«{GAME[draft.game]}» · {draft.summary}</span>
              </div>
              {draft.preview.length > 0 && (
                <Rows>
                  {draft.preview.map((line, i) => <Row key={i} label={line.label}>{line.text}</Row>)}
                </Rows>
              )}
              {replacing && <Note tone="info">Набор «{replacing.name}» уже загружен — файл заменит его и закроет до вашего «Открыть для всех».</Note>}
              <div className="trainer-row__actions">
                <button type="button" className="button" disabled={busy} onClick={() => setDraft(null)}>Отмена</button>
                <button type="button" className="button button--primary" disabled={busy} onClick={upload}>{replacing ? 'Заменить' : 'Загрузить'}</button>
              </div>
            </>
          )}
        </Panel>

        {state.packs.length > 0 && (
          <div className="admin-list" style={{ marginTop: 'var(--space-2)' }}>
            {state.packs.map((p) => {
              const removeKey = 'remove:' + p.id;
              const tried = isTried(p.id);
              return (
                <Panel pad key={p.id} className="admin-flag">
                  <div className="admin-flag__head">
                    <div className="trainer-row__copy">
                      <strong>{p.name}</strong>
                      <span>«{GAME[p.game]}» · {p.summary} · {formatWhen(p.at)}{p.closed && tried ? ' · у вас включён' : ''}</span>
                    </div>
                    <Tag tone={p.closed ? 'warn' : 'good'}>{p.closed ? 'закрыт' : 'у всех'}</Tag>
                  </div>
                  {asking === removeKey && <Note tone="critical">Набор пропадёт совсем. Вернуть — только загрузив файл снова.</Note>}
                  <div className="trainer-row__actions">
                    <button
                      type="button"
                      className={'button' + (asking === removeKey ? ' button--critical' : '')}
                      disabled={busy}
                      onClick={() => (asking === removeKey ? run('owner.gamepacks.remove', { id: p.id }) : (setAsking(removeKey), haptic()))}
                    >
                      {asking === removeKey ? 'Точно удалить?' : 'Удалить'}
                    </button>
                    {p.closed && (
                      <button type="button" className="button" disabled={busy} onClick={() => tryOn(p.id, !tried)}>
                        {tried ? 'Снять у себя' : 'Примерить у себя'}
                      </button>
                    )}
                    <button
                      type="button"
                      className={'button' + (p.closed ? ' button--primary' : '')}
                      disabled={busy}
                      onClick={() => run('owner.gamepacks.close', { id: p.id, closed: !p.closed })}
                    >
                      {p.closed ? 'Открыть для всех' : 'Закрыть'}
                    </button>
                  </div>
                </Panel>
              );
            })}
          </div>
        )}
      </Section>

      {state.history.length > 0 && (
        <Section title="Наборы: последние изменения">
          <Rows>
            {state.history.map((h, i) => <Row key={i} label={formatWhen(h.at)}>{h.text}</Row>)}
          </Rows>
        </Section>
      )}
    </>
  );
}
