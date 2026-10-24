import React, { useEffect, useState } from 'react';

import { apiMutate } from '../api.js';
import { useData } from '../useData.js';
import { ErrorState, Field, Loading, Note, Panel, Row, Rows, Section, formatWhen } from '../ui.jsx';
import { StoryPreview, TOPICS } from '../stories.jsx';
import StoryCanvas from '../StoryCanvas.jsx';
import { IconEye, IconPlus } from '../icons.jsx';
import { haptic } from '../telegram.js';
import { Deferred, lazyPage } from '../lazy.js';
import { draftFrom, frameNote, problems, sameDraft, toPayload, updateTopic } from './stories-edit.js';

// Редактор тяжёлый (жесты, листы, шрифты) — грузится, когда его открыли
const StoryEditor = lazyPage(() => import('./StoryEditor.jsx'));

/**
 * «Управление → Истории» (FT-615): владелец сам правит «Что нового» и
 * «Инструкцию» у всех пользователей — без коммита и без сборки.
 *
 * Шаг 2: кадры правятся в редакторе как в Instagram (StoryEditor.jsx) —
 * текст, наклейки, фон прямо на кадре. Здесь — миниатюры кадров, подпись
 * темы, сохранение и журнал.
 *
 * Черновик живёт на экране, пока не нажата «Сохранить»: правка десяти
 * кадров — одна запись в журнал и одно обновление у людей, а не десять.
 * Пока на сервере ничего нет, черновик начинается со вшитого набора —
 * владелец правит то, что люди видят прямо сейчас.
 */

export default function AdminStories() {
  const { data, loading, error, reload } = useData('owner.stories', {}, []);
  const [state, setState] = useState(null);
  const [draft, setDraft] = useState(null);
  const [editor, setEditor] = useState(null); // { topic, frame }
  const [preview, setPreview] = useState(null); // { topic, frame }
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const [saved, setSaved] = useState(false);
  const [askReset, setAskReset] = useState(false);

  useEffect(() => {
    if (!data) return;
    setState(data);
    setDraft(draftFrom(data.topics || TOPICS));
  }, [data]);

  if (loading || (data && !draft)) return <Loading rows={4} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const base = draftFrom(state.topics || TOPICS);
  const dirty = !sameDraft(draft, base);
  const issues = problems(draft);
  const edit = (next) => { setDraft(next); setSaved(false); setProblem(null); setAskReset(false); };

  // Ошибка — текстом (редактор покажет её у себя), успех — null
  const save = async () => {
    if (issues.length) return issues[0];
    setBusy(true); setProblem(null); setSaved(false);
    try {
      // base — вшитый набор, если сохраняют впервые: сервер по нему пишет
      // в «Логи», сколько кадров новых и сколько изменено
      const r = await apiMutate('owner.stories.save', { topics: toPayload(draft), ...(state.topics ? {} : { base: toPayload(base) }) });
      haptic('success');
      setState(r);
      setDraft(draftFrom(r.topics || TOPICS));
      setSaved(true);
      return null;
    } catch (err) {
      setProblem(err);
      return err.message || 'Не получилось сохранить.';
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!askReset) { setAskReset(true); haptic(); return; }
    setBusy(true); setProblem(null); setSaved(false);
    try {
      const r = await apiMutate('owner.stories.reset', {});
      haptic('success');
      setState(r);
      setDraft(draftFrom(TOPICS));
      setAskReset(false);
    } catch (err) {
      setProblem(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Note tone="info">
        «Сохранить» — и истории меняются у всех сразу, без сборки. На телефонах новый вид кадров — со следующей
        сборки приложения; до неё там тот же кадр текстом. Новый кадр зажжёт кружок у всех, правка — нет.
      </Note>
      <p className="small muted admin-stories__status">
        {state.topics
          ? `Сейчас у всех — истории из панели, сохранены ${formatWhen(state.updatedAt)}${state.updatedBy ? ' · ' + state.updatedBy : ''}`
          : 'Сейчас у всех — встроенные истории из приложения'}
      </p>

      {draft.map((topic, ti) => {
        const visible = topic.frames.filter((f) => !f.hidden).length;
        return (
          <Section
            key={topic.id}
            title={topic.label.trim() || 'Без подписи'}
            note={`Кадров ${visible}${visible !== topic.frames.length ? ` из ${topic.frames.length}, остальные скрыты` : ''}`}
          >
            <Panel pad className="admin-stories__topic">
              <Field label="Заголовок над кадром" inputMode="text" value={topic.caption} disabled={busy}
                hint={topic.id === 'release' ? 'С номером версии: «Что нового в версии 3.10»' : 'Общий для всех кадров темы'}
                onChange={(v) => edit(updateTopic(draft, ti, { caption: v }))} />

              <div className="admin-stories__thumbs" role="list" aria-label={'Кадры: ' + topic.label}>
                {topic.frames.map((f, fi) => {
                  const note = frameNote(f);
                  return (
                    <button key={f.id} type="button" role="listitem" disabled={busy}
                      className={'admin-stories__thumb' + (f.hidden ? ' admin-stories__thumb--hidden' : '')}
                      aria-label={`Кадр ${fi + 1}${note ? ', ' + note : ''} — открыть в редакторе`}
                      onClick={() => { setEditor({ topic: ti, frame: fi }); haptic(); }}>
                      <StoryCanvas canvas={f.canvas} />
                      {note && <span className="admin-stories__thumb-note">{note}</span>}
                    </button>
                  );
                })}
              </div>

              <div className="trainer-row__actions">
                <button type="button" className="button button--primary" disabled={busy}
                  onClick={() => { setEditor({ topic: ti, frame: 0 }); haptic(); }}>
                  {topic.frames.length ? 'Открыть редактор' : <><IconPlus size={16} />Первый кадр</>}
                </button>
                {visible > 0 && (
                  <button type="button" className="button" onClick={() => { setPreview({ topic: ti, frame: 0 }); haptic(); }}>
                    <IconEye size={16} />
                    Посмотреть
                  </button>
                )}
              </div>
              {topic.frames.length === 0 && <p className="small muted">Кадров нет — кружок у людей не показывается.</p>}
            </Panel>
          </Section>
        );
      })}

      <Section title="Сохранить">
        <Panel pad className="admin-stories__save">
          {issues.length > 0 && dirty && (
            <Note tone="critical">
              {issues.slice(0, 5).map((t) => <span key={t} className="admin-stories__issue">{t}</span>)}
              {issues.length > 5 && <span className="admin-stories__issue">и ещё {issues.length - 5}</span>}
            </Note>
          )}
          {problem && <Note tone="critical">Не сохранилось: {problem.message || 'нет связи'}</Note>}
          {saved && !dirty && <Note tone="good">Сохранено. Люди увидят новые истории при следующем открытии приложения.</Note>}
          <button type="button" className="button button--primary" disabled={busy || !dirty || issues.length > 0} onClick={save}>
            {busy ? 'Сохраняем…' : dirty ? 'Сохранить для всех' : 'Изменений нет'}
          </button>
          {dirty && (
            <button type="button" className="button" disabled={busy} onClick={() => edit(base)}>
              Отменить правки
            </button>
          )}
          {state.topics && (
            <>
              {askReset && (
                <Note tone="critical">
                  Всё, что сохранено в панели, пропадёт, и у всех снова будут истории, вшитые в приложение.
                </Note>
              )}
              <button type="button" className={'button' + (askReset ? ' button--critical' : '')} disabled={busy} onClick={reset}>
                {askReset ? 'Точно вернуть встроенные?' : 'Вернуть встроенные'}
              </button>
            </>
          )}
        </Panel>
      </Section>

      {state.history && state.history.length > 0 && (
        <Section title="Последние правки">
          <Rows>
            {state.history.map((h, i) => <Row key={i} label={formatWhen(h.at)}>{h.text}</Row>)}
          </Rows>
        </Section>
      )}

      {preview && draft[preview.topic] && (
        <StoryPreview topic={draft[preview.topic]} frame={preview.frame} onClose={() => setPreview(null)} />
      )}

      {editor && (
        <Deferred fallback={<div className="se-loading" aria-busy="true" />}>
          <StoryEditor
            topics={draft}
            topic={editor.topic}
            frame={editor.frame}
            onChange={edit}
            onClose={() => setEditor(null)}
            onSave={save}
            saving={busy}
            dirty={dirty}
          />
        </Deferred>
      )}
    </>
  );
}
