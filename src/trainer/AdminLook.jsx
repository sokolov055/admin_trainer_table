import React, { useEffect, useRef, useState } from 'react';

import { apiMutate } from '../api.js';
import { useData } from '../useData.js';
import { Confirm, ErrorState, Loading, Note, Panel, Row, Rows, Section, Tag, formatWhen } from '../ui.jsx';
import { haptic, refreshTheme } from '../telegram.js';
import { PALETTES, getPaletteId, paletteFromTheme, setPaletteId, setRemoteThemes } from '../palettes.js';
import { readThemeFile, themeRows } from './admin-model.js';

/**
 * «Управление → Вид» (22.10.2026): темы оформления файлом.
 *
 * Тему делает Claude по скиллу app-theme и присылает файлом; владелец
 * скачивает его на телефон, выбирает здесь — и тема появляется в
 * «Оформлении» у всех, без сборки (сервер — lib/themes.js). Праздник
 * прошёл — «Закрыть»: тема пропадает из списка, у кого была выбрана —
 * «Стандартный». Закрыть можно и встроенную («Хэллоуин»).
 *
 * Своё устройство обновляется сразу после ответа сервера — чтобы
 * «Примерить» и «Оформление» показали новую тему без перезапуска.
 */
export default function AdminLook() {
  const { data, loading, error, reload } = useData('owner.themes', {}, []);
  const [state, setState] = useState(null);
  const [draft, setDraft] = useState(null);
  const [fileError, setFileError] = useState('');
  const [asking, setAsking] = useState(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const [uploaded, setUploaded] = useState('');
  const input = useRef(null);

  useEffect(() => { if (data) setState(data); }, [data]);

  if (loading || (data && !state)) return <Loading rows={4} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  // Ответ сервера — и на своё устройство, как app.themes владельцу: все
  // загруженные (закрытые — для примерки) и закрытые встроенные
  const applyHere = (next) => {
    setState(next);
    const themes = next.themes.map(({ closed, at, by, ...t }) => (closed ? { ...t, closed: true } : t));
    if (setRemoteThemes({ themes, closed: next.closed, trial: true })) refreshTheme();
  };

  const run = async (action, params) => {
    setBusy(true); setProblem(null);
    try {
      const next = await apiMutate(action, params);
      haptic('success');
      setAsking(null);
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
    setFileError(''); setDraft(null);
    if (!file) return;
    if (file.size > 600 * 1024) { setFileError('Файл больше 600 КБ — это не тема.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const { theme, error: why } = readThemeFile(reader.result);
      if (why) { setFileError(why); haptic('error'); return; }
      setDraft(theme);
    };
    reader.onerror = () => setFileError('Файл не прочитался — выберите его ещё раз.');
    reader.readAsText(file);
  };

  const upload = async () => {
    const id = draft.id;
    if (await run('owner.themes.upload', { theme: draft })) {
      setDraft(null);
      setUploaded(id);
    }
  };

  const tryOn = (id) => {
    haptic('light');
    setPaletteId(id);
    refreshTheme();
    // Строка «у вас сейчас» и кнопки — по новой теме
    setState((s) => ({ ...s }));
  };

  const rows = themeRows(PALETTES, state);
  const replacing = draft && rows.find((r) => r.id === draft.id && !r.builtIn);

  return (
    <>
      <Note tone="info">
        Тему делает Claude по скиллу app-theme и присылает файлом. Сохраните его на телефон и загрузите здесь — тема придёт закрытой: людям её не видно. «Примерить у себя» — посмотреть на своём телефоне; понравилась — «Открыть для всех», без новой сборки. Не понравилась — скажите Claude, что переделать, и загрузите новый файл.
      </Note>
      {problem && <Note tone="critical">Не получилось: {problem.message || 'нет связи'}</Note>}

      <Section title="Новая тема">
        <Panel pad className="admin-flag">
          <input ref={input} type="file" accept=".json,application/json" hidden onChange={pickFile} />
          {!draft && (
            <div className="trainer-row__actions">
              <button type="button" className="button button--primary" disabled={busy} onClick={() => input.current && input.current.click()}>
                Выбрать файл темы
              </button>
            </div>
          )}
          {fileError && <Note tone="critical">{fileError}</Note>}
          {uploaded && !draft && <Note tone="good">Загружена и закрыта — видна только вам. Примерьте у себя ниже; понравится — «Открыть для всех».</Note>}
          {draft && (
            <>
              <ThemePreview theme={draft} />
              {replacing && <Note tone="info">Тема «{replacing.name}» уже загружена — файл заменит её и закроет до вашего «Открыть для всех».</Note>}
              <div className="trainer-row__actions">
                <button type="button" className="button button--primary" disabled={busy} onClick={upload}>
                  {replacing ? 'Заменить' : 'Загрузить'}
                </button>
                <button type="button" className="button button--ghost" disabled={busy} onClick={() => setDraft(null)}>Отмена</button>
              </div>
            </>
          )}
        </Panel>
      </Section>

      <Section title="Темы" note="Закрытой нет в «Оформлении» у людей; у кого она выбрана — станет «Стандартный» при следующем открытии приложения. Примерить у себя можно и закрытую">
        <div className="admin-list">
          {rows.map((r) => {
            const removeKey = 'remove:' + r.id;
            const mine = getPaletteId() === r.id;
            return (
              <Panel pad key={r.id} className="admin-flag">
                <div className="admin-flag__head">
                  <span className="admin-theme__disc" style={discStyle(r.swatch)} aria-hidden="true" />
                  <div className="trainer-row__copy admin-theme__copy">
                    <strong>{r.name}</strong>
                    <span>
                      {r.builtIn ? 'встроенная' : `загружена ${formatWhen(r.at)}`}
                      {r.dark ? ' · всегда тёмная' : ''}
                      {mine ? ' · у вас сейчас' : ''}
                    </span>
                  </div>
                  <Tag tone={r.closed ? 'warn' : 'good'}>{r.closed ? 'закрыта' : 'у всех'}</Tag>
                </div>
                {/* Удаление необратимо — вопрос на месте: красная «Удалить» и
                    «Отмена», а не смена текста кнопки на «Точно удалить?» (аудит 24.10.2026) */}
                {asking === removeKey && (
                  <Confirm
                    text="Тема пропадёт совсем. Вернуть — только загрузив файл снова."
                    action="Удалить"
                    busy={busy}
                    onConfirm={() => run('owner.themes.remove', { id: r.id })}
                    onCancel={() => setAsking(null)}
                  />
                )}
                {asking !== removeKey && <div className="trainer-row__actions">
                  {!r.builtIn && (
                    <button type="button" className="button button--ghost danger" disabled={busy} onClick={() => setAsking(removeKey)}>
                      Удалить
                    </button>
                  )}
                  {!mine && (
                    <button type="button" className="button" disabled={busy} onClick={() => tryOn(r.id)}>Примерить у себя</button>
                  )}
                  <button
                    type="button"
                    className={'button' + (r.closed ? ' button--primary' : '')}
                    disabled={busy}
                    onClick={() => run('owner.themes.close', { id: r.id, closed: !r.closed })}
                  >
                    {r.closed ? 'Открыть для всех' : 'Закрыть'}
                  </button>
                </div>}
              </Panel>
            );
          })}
        </div>
      </Section>

      {state.history.length > 0 && (
        <Section title="Последние изменения">
          <Rows>
            {state.history.map((h, i) => (
              <Row key={i} label={formatWhen(h.at)}>{h.text}</Row>
            ))}
          </Rows>
        </Section>
      )}
    </>
  );
}

const discStyle = (swatch) => {
  const [a, b, c] = swatch || [];
  return { background: `conic-gradient(from 225deg, ${a} 0deg 180deg, ${b} 180deg 270deg, ${c} 270deg 360deg)` };
};

/** Что внутри файла: цвета, фон и картинка вместо «+» — до загрузки */
function ThemePreview({ theme }) {
  const p = paletteFromTheme(theme);
  if (!p) return <Note tone="critical">Файл темы повреждён.</Note>;
  const art = p.art ? p.art() : null;
  return (
    <div className="admin-theme">
      <div className="admin-theme__art" style={{ backgroundColor: p.bg, backgroundImage: art || undefined }} aria-hidden="true">
        {p.mascot && <img className="admin-theme__mascot" src={p.mascot.src} alt="" />}
      </div>
      <div className="trainer-row__copy">
        <strong>{p.name}</strong>
        <span>{p.id}{p.scheme === 'dark' ? ' · всегда тёмная' : ''}{p.mascot ? ' · своя картинка вместо «+»' : ''}</span>
        <span className="admin-theme__swatches">
          {p.swatch.map((c) => <span key={c} className="admin-theme__dot" style={{ background: c }} title={c} />)}
        </span>
      </div>
    </div>
  );
}
