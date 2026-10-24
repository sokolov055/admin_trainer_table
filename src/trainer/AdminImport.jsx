import React, { useRef, useState } from 'react';

import { apiMutate } from '../api.js';
import { useData } from '../useData.js';
import { Confirm, ErrorState, Loading, Note, Panel, Row, Rows, Section, Tag, formatNumber, formatWhen, plural } from '../ui.jsx';
import { haptic } from '../telegram.js';
import { exercisesTable, machinesTable, readCatalogFile, splitUnchanged, toCsv } from './catalog-table.js';

/**
 * «Управление → Загрузка» (владелец, 24.10.2026; FT-619): упражнения и
 * тренажёры пачкой. Выгрузить таблицу → поправить в Excel или Google
 * Таблицах → загрузить. Что в файле — упражнения или тренажёры, —
 * приложение понимает по столбцам (catalog-table.js). До записи — проверка:
 * что создастся, что изменится и в каких полях, ошибки со строкой. Запись
 * одной транзакцией, отмена последней загрузки (сервер — lib/catalog-import.js).
 */

const SHOWN = 40;
const SHEET = { exercises: 'Упражнения', machines: 'Тренажёры' };
const ACTION = { create: 'новое', version: 'своя версия общего', update: 'изменится', error: 'ошибка' };

/** Файл — «Поделиться» на телефоне (в мессенджер, в «Файлы»), иначе скачать */
async function saveFile(name, text) {
  const file = new File([text], name, { type: 'text/csv' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
  } catch (err) {
    if (err && err.name === 'AbortError') return;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function Totals({ sheet, totals, same }) {
  const t = totals[sheet];
  const unchanged = (t.same || 0) + (same[sheet] || 0);
  const rows = t.rows + (same[sheet] || 0);
  if (!rows) return null;
  const parts = [
    t.create && `новых ${formatNumber(t.create)}`,
    t.update && `изменится ${formatNumber(t.update)}`,
    unchanged && `без изменений ${formatNumber(unchanged)}`,
    t.errors && `ошибок ${formatNumber(t.errors)}`,
  ].filter(Boolean);
  return <Row label={SHEET[sheet]}>{formatNumber(rows)} {plural(rows, 'строка', 'строки', 'строк')}: {parts.join(', ')}</Row>;
}

export default function AdminImport() {
  const exercises = useData('library.exercises', {}, []);
  const machines = useData('library.machines', {}, []);
  const history = useData('owner.catalog.imports', {}, []);
  const [draft, setDraft] = useState(null); // { name, payload, same, problems, preview }
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const [done, setDone] = useState(null);
  const [asking, setAsking] = useState(null);
  const input = useRef(null);

  if (exercises.loading || machines.loading) return <Loading rows={3} />;
  const failed = exercises.error || machines.error;
  if (failed) return <ErrorState error={failed} onRetry={() => { exercises.reload(); machines.reload(); }} />;
  const base = { exercises: exercises.data.exercises || [], machines: machines.data.machines || [] };
  const day = new Date().toISOString().slice(0, 10);

  const check = async (payload, name) => {
    const preview = await apiMutate('owner.catalog.import', { ...payload, fileName: name, apply: false });
    return preview;
  };

  const pickFiles = async (event) => {
    const files = [...(event.target.files || [])];
    event.target.value = '';
    setDraft(null); setDone(null); setProblem(null);
    if (!files.length) return;
    setBusy(true);
    try {
      const read = { exercises: [], machines: [], problems: [] };
      for (const f of files) {
        if (f.size > 5 * 1024 * 1024) { read.problems.push(`«${f.name}» больше 5 МБ — это не таблица каталога.`); continue; }
        try {
          const part = await readCatalogFile(f);
          const tag = files.length > 1 ? `«${f.name}», ` : '';
          read.exercises.push(...part.exercises.map((r) => ({ ...r, file: tag })));
          read.machines.push(...part.machines.map((r) => ({ ...r, file: tag })));
          read.problems.push(...part.problems.map((p) => (files.length > 1 ? `«${f.name}»: ${p}` : p)));
        } catch (err) {
          read.problems.push(`«${f.name}»: ${err.message || 'не прочитался'}`);
        }
      }
      const name = files.map((f) => f.name).join(', ');
      const split = splitUnchanged(read, base);
      const payload = {
        exercises: split.exercises.map(({ file, sheetTitle, ...r }) => r),
        machines: split.machines.map(({ file, sheetTitle, ...r }) => r),
      };
      const next = { name, payload, same: split.same, problems: read.problems, preview: null };
      if (payload.exercises.length || payload.machines.length) {
        if (JSON.stringify(payload).length > 900 * 1024) {
          next.problems = [...next.problems, 'Изменений больше, чем уходит за один раз, — разделите таблицу на две и загрузите по очереди.'];
        } else {
          next.preview = await check(payload, name);
        }
      }
      setDraft(next);
      haptic(next.problems.length || (next.preview && (next.preview.totals.exercises.errors || next.preview.totals.machines.errors)) ? 'error' : 'success');
    } catch (err) {
      setProblem(err);
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    setBusy(true); setProblem(null);
    try {
      const result = await apiMutate('owner.catalog.import', { ...draft.payload, fileName: draft.name, apply: true });
      haptic('success');
      setDone(result);
      setDraft(null);
      exercises.reload(); machines.reload(); history.reload();
    } catch (err) {
      setProblem(err);
    } finally {
      setBusy(false);
    }
  };

  const undo = async (id) => {
    setBusy(true); setProblem(null);
    try {
      const result = await apiMutate('owner.catalog.import.undo', { id });
      haptic('success');
      setAsking(null);
      setDone({ undone: result });
      exercises.reload(); machines.reload(); history.reload();
    } catch (err) {
      setProblem(err);
    } finally {
      setBusy(false);
    }
  };

  const preview = draft && draft.preview;
  const results = preview ? preview.results : [];
  const errors = results.filter((r) => r.action === 'error');
  const changes = results.filter((r) => r.action !== 'error' && r.action !== 'same');
  const blocked = !preview || errors.length > 0 || !changes.length;
  const list = (rows) => (
    <Rows>
      {rows.slice(0, SHOWN).map((r, i) => (
        <Row key={i} label={`${SHEET[r.sheet]}, строка ${r.line}`}>
          <strong>{r.name || 'без названия'}</strong> — {r.action === 'error' ? r.error : r.action === 'update' ? `${ACTION.update}: ${r.fields.join(', ')}` : ACTION[r.action]}
        </Row>
      ))}
      {rows.length > SHOWN && <Row label="">ещё {formatNumber(rows.length - SHOWN)}</Row>}
    </Rows>
  );
  const imports = (history.data && history.data.imports) || [];
  const lastOpen = imports.find((h) => !h.undoneAt);

  return (
    <>
      {problem && <Note tone="critical">Не получилось: {problem.message || 'нет связи'}</Note>}
      <Section title="Выгрузить таблицей" note="Всё, что сейчас в каталоге, — файлом для Excel или Google Таблиц. В том же виде таблица загружается обратно">
        <Panel pad className="admin-flag">
          <div className="trainer-row__actions">
            <button type="button" className="button" disabled={busy} onClick={() => saveFile(`fittrack-упражнения-${day}.csv`, toCsv(exercisesTable(base.exercises)))}>
              Упражнения · {formatNumber(base.exercises.length)}
            </button>
            <button type="button" className="button" disabled={busy} onClick={() => saveFile(`fittrack-тренажёры-${day}.csv`, toCsv(machinesTable(base.machines)))}>
              Тренажёры · {formatNumber(base.machines.length)}
            </button>
          </div>
          <p className="small muted">У тренажёров последний столбец — «Где используется»: в каких упражнениях. При загрузке он пропускается.</p>
        </Panel>
      </Section>

      <Section title="Загрузить таблицу" note="CSV или Excel (.xlsx). Упражнения это или тренажёры, приложение поймёт по столбцам; можно выбрать оба файла сразу">
        <Panel pad className="admin-flag">
          <input ref={input} type="file" multiple hidden onChange={pickFiles}
            accept=".csv,.tsv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
          {!draft && (
            <div className="trainer-row__actions">
              <button type="button" className="button button--primary" disabled={busy} onClick={() => input.current && input.current.click()}>
                {busy ? 'Проверяем…' : 'Выбрать файл'}
              </button>
            </div>
          )}
          {done && !done.undone && <Note tone="good">Загружено: упражнений новых {done.totals.exercises.create}, изменено {done.totals.exercises.update}; тренажёров новых {done.totals.machines.create}, изменено {done.totals.machines.update}. Отменить можно ниже.</Note>}
          {done && done.undone && <Note tone="good">Отменено: вернули {formatNumber(done.undone.restored)}{done.undone.kept ? `, оставили ${formatNumber(done.undone.kept)} — их правили после загрузки` : ''}.</Note>}
          {draft && (
            <>
              <div className="trainer-row__copy"><strong>{draft.name}</strong></div>
              {draft.problems.map((p, i) => <Note key={i} tone="critical">{p}</Note>)}
              {(preview || draft.same.exercises || draft.same.machines) && (
                <Rows>
                  <Totals sheet="exercises" totals={preview ? preview.totals : { exercises: { rows: 0 } }} same={draft.same} />
                  <Totals sheet="machines" totals={preview ? preview.totals : { machines: { rows: 0 } }} same={draft.same} />
                </Rows>
              )}
              {!preview && !draft.problems.length && <Note tone="info">Всё как в базе — менять нечего.</Note>}
              {errors.length > 0 && <>
                <Note tone="critical">Исправьте {plural(errors.length, 'строку', 'строки', 'строк')} в таблице и выберите файл снова — пока есть ошибки, ничего не записывается.</Note>
                {list(errors)}
              </>}
              {errors.length === 0 && changes.length > 0 && list(changes)}
              <div className="trainer-row__actions">
                {preview && <button type="button" className="button button--primary" disabled={busy || blocked} onClick={apply}>{busy ? 'Записываем…' : 'Применить'}</button>}
                <button type="button" className="button button--ghost" disabled={busy} onClick={() => setDraft(null)}>{preview && !blocked ? 'Отмена' : 'Закрыть'}</button>
              </div>
            </>
          )}
        </Panel>
      </Section>

      {imports.length > 0 && (
        <Section title="Прошлые загрузки">
          <div className="admin-list">
            {imports.map((h) => (
              <Panel pad key={h.id} className="admin-flag">
                <div className="admin-flag__head">
                  <div className="trainer-row__copy">
                    <strong>№ {h.id}{h.name ? ` · ${h.name}` : ''}</strong>
                    <span>{formatWhen(h.createdAt)} · упражнений +{h.totals.exercises.create}, изменено {h.totals.exercises.update}; тренажёров +{h.totals.machines.create}, изменено {h.totals.machines.update}</span>
                  </div>
                  {h.undoneAt && <Tag tone="warn">отменена</Tag>}
                </div>
                {h === lastOpen && (asking === h.id ? (
                  <Confirm text="Карточки вернутся как были до загрузки. Что правили после неё — останется." action="Отменить загрузку"
                    busy={busy} onConfirm={() => undo(h.id)} onCancel={() => setAsking(null)} />
                ) : (
                  <div className="trainer-row__actions">
                    <button type="button" className="button button--ghost" disabled={busy} onClick={() => setAsking(h.id)}>Отменить загрузку</button>
                  </div>
                ))}
              </Panel>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
