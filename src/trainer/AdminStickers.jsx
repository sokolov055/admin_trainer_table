import React, { useEffect, useRef, useState } from 'react';

import { apiMutate } from '../api.js';
import { useData } from '../useData.js';
import { Confirm, ErrorState, Loading, Note, Panel, Search, Section } from '../ui.jsx';
import { haptic } from '../telegram.js';
import { Sticker, STICKERS, searchStickers, useStickerPack } from '../setup-stickers.jsx';
import { applyStickers } from '../remote-stickers.js';
import '../tech-sheet.css';
import './setup-editor.css';
import './admin-stickers.css';

/**
 * «Управление → Контент → Стикеры» (16.11.2026, макет
 * stickers-upload-mockup-v2.html; сервер — lib/setup-stickers.js).
 *
 * Порядок владельца:
 * - «Добавить стикеры» — файл от Claude (скилл setup-stickers): сервер
 *   проверяет его без записи (dryRun) и отдаёт чистые стикеры, они
 *   двигаются в предпросмотре; «Добавить N» — сразу у всех тренеров;
 *   загрузка ничего не удаляет;
 * - «Стикерпак» — все стикеры с поиском; долгое нажатие включает выделение,
 *   отметить один или несколько, «Удалить N». Встроенный скрывается
 *   (вернуть — тем же файлом), загруженный стирается. Если стикер стоит в
 *   шагах тренажёров — перед удалением сказать, в каких.
 */
const HOLD_MS = 450;

function PackGrid({ state, busy, onRemove }) {
  useStickerPack();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState(null); // null — не выделение; Set — выделение
  const [asking, setAsking] = useState(false);
  const hold = useRef({ t: 0, fired: false });
  const found = searchStickers(q);
  const list = found === null ? STICKERS : found;
  const selecting = picked !== null;

  const toggle = (id) => {
    haptic('light');
    setPicked((p) => {
      const next = new Set(p || []);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const down = (id) => () => {
    hold.current.fired = false;
    clearTimeout(hold.current.t);
    if (selecting) return;
    hold.current.t = setTimeout(() => {
      hold.current.fired = true;
      haptic('medium');
      setPicked(new Set([id]));
    }, HOLD_MS);
  };
  const up = () => clearTimeout(hold.current.t);
  const tap = (id) => () => {
    if (hold.current.fired) { hold.current.fired = false; return; }
    if (selecting) toggle(id);
  };
  const done = () => { setPicked(null); setAsking(false); };

  const ids = picked ? [...picked] : [];
  const used = ids.filter((id) => (state.usage[id] || []).length);
  const machines = [...new Set(used.flatMap((id) => state.usage[id]))];

  return (
    <Panel pad className="ast-pack">
      <div className="ast-head">
        <strong>{selecting ? `Выбрано: ${ids.length}` : `Стикерпак · ${STICKERS.length}`}</strong>
        {selecting
          ? <button type="button" className="button button--ghost ast-done" onClick={done}>Готово</button>
          : <span className="ast-tip">Зажмите стикер, чтобы выделить</span>}
      </div>
      <Search value={q} onChange={setQ} placeholder="Найти: платформа, спинка…" />
      {list.length
        ? (
          <div className={'sed-grid ast-grid' + (selecting ? ' is-sel' : '')}>
            {list.map((s) => {
              const on = !!(picked && picked.has(s.id));
              return (
                <button
                  key={s.id}
                  type="button"
                  className={'sed-st ast-st' + (on ? ' is-on' : '')}
                  aria-pressed={selecting ? on : undefined}
                  onPointerDown={down(s.id)}
                  onPointerUp={up}
                  onPointerLeave={up}
                  onPointerCancel={up}
                  onContextMenu={(e) => e.preventDefault()}
                  onClick={tap(s.id)}
                >
                  {selecting && <i className="ast-ck" aria-hidden="true">{on ? '✓' : ''}</i>}
                  <Sticker id={s.id} />
                  <span>{s.name}</span>
                  {s.custom && <em className="ast-pk">{s.pack || 'файл'}</em>}
                </button>
              );
            })}
          </div>
        )
        : <p className="sed-empty">Ничего не нашлось по «{q}».</p>}

      {selecting && (
        <div className="ast-bar">
          {asking ? (
            <Confirm
              text={`Удалить ${ids.length} из стикерпака?` + (used.length ? ` ${used.length === 1 ? 'Один стоит' : used.length + ' стоят'} в шагах тренажёров: ${machines.slice(0, 6).join(', ')}${machines.length > 6 ? ` и ещё ${machines.length - 6}` : ''}. Там встанет подходящий по подписи шага или номер.` : '')}
              action="Удалить"
              busy={busy}
              onConfirm={async () => { if (await onRemove(ids)) done(); }}
              onCancel={() => setAsking(false)}
            />
          ) : (
            <button type="button" className="button danger ast-del" disabled={!ids.length || busy} onClick={() => setAsking(true)}>
              {ids.length ? `Удалить ${ids.length}` : 'Удалить'}
            </button>
          )}
        </div>
      )}
    </Panel>
  );
}

export default function AdminStickers() {
  const { data, loading, error, reload } = useData('owner.stickers', {}, []);
  const [state, setState] = useState(null);
  const [draft, setDraft] = useState(null);
  const [fileError, setFileError] = useState('');
  const [added, setAdded] = useState(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const input = useRef(null);

  useEffect(() => { if (data) { setState(data); applyStickers(data); } }, [data]);

  if (loading || (data && !state)) return <Loading rows={3} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const apply = (next) => { setState(next); applyStickers(next); };

  const pickFile = (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    setFileError(''); setDraft(null); setAdded(null); setProblem(null);
    if (!file) return;
    if (file.size > 600 * 1024) { setFileError('Файл больше 600 КБ — это не стикеры.'); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      let raw;
      try { raw = JSON.parse(String(reader.result || '')); } catch (_) { setFileError('Это не файл стикеров — не читается как JSON.'); haptic('error'); return; }
      setBusy(true);
      try {
        // Проверка на сервере без записи: в предпросмотр — только чистые стикеры
        const dry = await apiMutate('owner.stickers.upload', { file: raw, dryRun: true }, { quiet: true });
        setDraft({ raw, ...dry });
      } catch (err) {
        setFileError(err.message || 'Файл не прошёл проверку.');
        haptic('error');
      } finally {
        setBusy(false);
      }
    };
    reader.onerror = () => setFileError('Файл не прочитался — выберите его ещё раз.');
    reader.readAsText(file);
  };

  const upload = async () => {
    setBusy(true); setProblem(null);
    try {
      const next = await apiMutate('owner.stickers.upload', { file: draft.raw });
      haptic('success');
      apply(next);
      setAdded({ added: next.added.length, restored: next.restored.length, skipped: next.skipped });
      setDraft(null);
    } catch (err) {
      setProblem(err);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (ids) => {
    setBusy(true); setProblem(null);
    try {
      apply(await apiMutate('owner.stickers.remove', { ids }));
      haptic('success');
      return true;
    } catch (err) {
      setProblem(err);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const fresh = draft ? draft.added.length + draft.restored.length : 0;
  const status = (id) => (draft.added.includes(id) ? 'новый' : draft.restored.includes(id) ? 'вернётся' : 'уже в паке');

  return (
    <>
      {problem && <Note tone="critical">Не получилось: {problem.message || 'нет связи'}</Note>}
      <Section title="Добавить стикеры" note="Файл .json от Claude — новые стикеры сразу появятся у всех тренеров, без сборки">
        <Panel pad className="admin-flag">
          <input ref={input} type="file" accept=".json,application/json" hidden onChange={pickFile} />
          {!draft && (
            <div className="trainer-row__actions">
              <button type="button" className="button button--primary" disabled={busy} onClick={() => input.current && input.current.click()}>
                {busy ? 'Проверяю…' : 'Выбрать файл'}
              </button>
            </div>
          )}
          {fileError && <Note tone="critical">{fileError}</Note>}
          {added && (
            <Note tone="good">
              Добавлено: {added.added}{added.restored ? `, вернулось: ${added.restored}` : ''}.
              {added.skipped.length > 0 && ` Пропущены — уже в паке: ${added.skipped.map((s) => s.name).join(', ')}.`}
            </Note>
          )}
          {draft && (
            <>
              <div className="trainer-row__copy">
                <strong>{draft.name}</strong>
                <span>{fresh ? `${fresh} ${fresh === 1 ? 'стикер' : fresh < 5 ? 'стикера' : 'стикеров'} в стикерпак` : 'Новых стикеров нет'}</span>
              </div>
              <PreviewGrid list={draft.preview} status={status} />
              {draft.skipped.length > 0 && <Note tone="info">Уже в паке — пропущу: {draft.skipped.map((s) => s.name).join(', ')}.</Note>}
              <div className="trainer-row__actions">
                <button type="button" className="button button--primary" disabled={busy || !fresh} onClick={upload}>Добавить {fresh || ''}</button>
                <button type="button" className="button button--ghost" disabled={busy} onClick={() => setDraft(null)}>Отмена</button>
              </div>
            </>
          )}
        </Panel>
      </Section>

      <Section title="Стикерпак" note="Все стикеры редактора тренажёра. Удалить — зажать стикер, отметить, «Удалить»">
        <PackGrid state={state} busy={busy} onRemove={remove} />
      </Section>
    </>
  );
}

/**
 * Предпросмотр файла: стикеры ещё не в паке, поэтому рисуются отсюда — svg
 * уже проверен сервером (dryRun), css — своим тегом на время предпросмотра.
 */
function PreviewGrid({ list, status }) {
  useEffect(() => {
    const el = document.createElement('style');
    el.textContent = list.map((s) => s.css || '').join('');
    document.head.appendChild(el);
    return () => el.remove();
  }, [list]);
  return (
    <div className="sed-grid ast-grid">
      {list.map((s) => (
        <div key={s.id} className="sed-st ast-st">
          <svg className={'stk-ic stk-' + s.id} viewBox="0 0 48 48" aria-hidden="true" dangerouslySetInnerHTML={{ __html: s.svg }} />
          <span>{s.name}</span>
          <em className={'ast-pk' + (status(s.id) === 'уже в паке' ? ' is-old' : '')}>{status(s.id)}</em>
        </div>
      ))}
    </div>
  );
}
