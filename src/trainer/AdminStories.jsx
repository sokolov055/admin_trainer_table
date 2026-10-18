import React, { useEffect, useRef, useState } from 'react';

import { apiMutate } from '../api.js';
import { useData } from '../useData.js';
import { ErrorState, Field, Loading, Note, Panel, Row, Rows, Section, Segmented, Tag, formatWhen } from '../ui.jsx';
import { ART } from '../storyArt.jsx';
import { StoryPreview, TOPICS } from '../stories.jsx';
import { IconArrowDown, IconArrowUp, IconChevron, IconEye, IconPlus, IconTrash } from '../icons.jsx';
import { haptic } from '../telegram.js';
import { mediaUrl, shrinkPhoto, uploadStoryImage } from '../library.js';
import {
  DEVICES, LIMITS, TINTS,
  addFrame, draftFrom, frameNote, moveFrame, problems,
  removeFrame, sameDraft, toPayload, updateFrame, updateTopic,
} from './stories-edit.js';

/**
 * «Управление → Истории» (FT-615): владелец сам правит «Что нового» и
 * «Инструкцию» у всех пользователей — без коммита и без сборки.
 *
 * Черновик живёт на экране, пока не нажата «Сохранить»: правка десяти
 * кадров — одна запись в журнал и одно обновление у людей, а не десять.
 * Пока на сервере ничего нет, черновик начинается со вшитого набора —
 * владелец правит то, что люди видят прямо сейчас.
 *
 * Тем всегда две — «Что нового» и «Инструкция» (владелец, 19.10.2026):
 * правятся кадры — текст, порядок и картинка. Картинку владелец вставляет
 * готовую файлом, встроенные рисунки остаются на выбор.
 *
 * Кадр раскрывается для правки по одному: список из двадцати раскрытых
 * форм на телефоне не прочитать. «Посмотреть» открывает тему так, как её
 * увидит клиент на этом устройстве, — и не гасит кружок у владельца.
 */

const ART_NAMES = Object.keys(ART);

export default function AdminStories() {
  const { data, loading, error, reload } = useData('owner.stories', {}, []);
  const [state, setState] = useState(null);
  const [draft, setDraft] = useState(null);
  const [open, setOpen] = useState(null); // { topic, frame } — раскрытый кадр
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

  const save = async () => {
    if (issues.length) return;
    setBusy(true); setProblem(null); setSaved(false);
    try {
      // base — вшитый набор, если сохраняют впервые: сервер по нему пишет
      // в «Логи», сколько кадров новых и сколько изменено
      const r = await apiMutate('owner.stories.save', { topics: toPayload(draft), ...(state.topics ? {} : { base: toPayload(base) }) });
      haptic('success');
      setState(r);
      setDraft(draftFrom(r.topics || TOPICS));
      setSaved(true);
    } catch (err) {
      setProblem(err);
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
      setOpen(null);
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
        «Сохранить» — и истории меняются у всех сразу, без сборки. На телефонах — начиная со следующей
        сборки приложения; до неё там вшитые. Новый кадр зажжёт кружок у всех, правка текста — нет.
      </Note>
      <p className="small muted admin-stories__status">
        {state.topics
          ? `Сейчас у всех — истории из панели, сохранены ${formatWhen(state.updatedAt)}${state.updatedBy ? ' · ' + state.updatedBy : ''}`
          : 'Сейчас у всех — встроенные истории из приложения'}
      </p>

      {draft.map((topic, ti) => (
        <TopicEditor
          key={topic.id}
          topic={topic}
          open={open && open.topic === ti ? open.frame : null}
          disabled={busy}
          onOpen={(fi) => { setOpen(fi === null ? null : { topic: ti, frame: fi }); haptic(); }}
          onTopic={(patch) => edit(updateTopic(draft, ti, patch))}
          onFrame={(fi, patch) => edit(updateFrame(draft, ti, fi, patch))}
          onAddFrame={() => { const r = addFrame(draft, ti); edit(r.draft); setOpen({ topic: ti, frame: r.frame }); haptic(); }}
          onMoveFrame={(fi, d) => {
            edit(moveFrame(draft, ti, fi, d));
            if (open && open.topic === ti && open.frame === fi) setOpen({ topic: ti, frame: fi + d });
            haptic();
          }}
          onRemoveFrame={(fi) => { edit(removeFrame(draft, ti, fi)); setOpen(null); haptic(); }}
          onPreview={(fi) => { setPreview({ topic: ti, frame: fi }); haptic(); }}
        />
      ))}


      <Section title="Сохранить">
        <Panel pad className="admin-stories__save">
          {issues.length > 0 && dirty && (
            <Note tone="critical">
              {issues.slice(0, 5).map((t) => <span key={t} className="admin-stories__issue">{t}</span>)}
              {issues.length > 5 && <span className="admin-stories__issue">и ещё {issues.length - 5}</span>}
            </Note>
          )}
          {problem && <ErrorState error={problem} onRetry={() => setProblem(null)} />}
          {saved && !dirty && <Note tone="good">Сохранено. Люди увидят новые истории при следующем открытии приложения.</Note>}
          <button type="button" className="button button--primary" disabled={busy || !dirty || issues.length > 0} onClick={save}>
            {busy ? 'Сохраняю…' : dirty ? 'Сохранить для всех' : 'Изменений нет'}
          </button>
          {dirty && (
            <button type="button" className="button" disabled={busy} onClick={() => { edit(base); setOpen(null); }}>
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
    </>
  );
}

function TopicEditor({
  topic, open, disabled,
  onOpen, onTopic, onFrame, onAddFrame, onMoveFrame, onRemoveFrame, onPreview,
}) {
  const visible = topic.frames.filter((f) => !f.hidden).length;

  return (
    <Section
      title={topic.label.trim() || 'Без подписи'}
      note={`Кадров ${visible}${visible !== topic.frames.length ? ` из ${topic.frames.length}, остальные скрыты` : ''}`}
    >
      <Panel pad className="admin-stories__topic">
        <div className="admin-stories__fields">
          <Field label="Заголовок над кадром" inputMode="text" value={topic.caption} disabled={disabled}
            hint={topic.id === 'release' ? 'С номером версии: «Что нового в версии 3.10»' : 'Общий для всех кадров темы'}
            onChange={(v) => onTopic({ caption: v })} />
        </div>
        {topic.id === 'release' && (
          <p className="small muted">
            Только то, что клиент может открыть сам, — и как: куда зайти, что нажать. «Откройте „Питание“ → …»,
            а не «появилась функция». Старые новости скрывайте или удаляйте, когда выходит следующая версия.
          </p>
        )}

        <div className="trainer-row__actions">
          <button type="button" className="button button--primary" disabled={disabled || topic.frames.length >= LIMITS.frames} onClick={onAddFrame}>
            <IconPlus size={16} />
            Новый кадр
          </button>
          {visible > 0 && (
            <button type="button" className="button" onClick={() => onPreview(0)}>
              <IconEye size={16} />
              Посмотреть
            </button>
          )}
        </div>

        {topic.frames.length === 0 && (
          <p className="small muted">Кадров нет — кружок у людей не показывается.</p>
        )}

        <ol className="admin-stories__frames">
          {topic.frames.map((frame, fi) => (
            <FrameEditor
              key={frame.id}
              frame={frame}
              index={fi}
              count={topic.frames.length}
              open={open === fi}
              disabled={disabled}
              onToggle={() => onOpen(open === fi ? null : fi)}
              onChange={(patch) => onFrame(fi, patch)}
              onMove={(d) => onMoveFrame(fi, d)}
              onRemove={() => onRemoveFrame(fi)}
              onPreview={() => onPreview(topic.frames.slice(0, fi).filter((f) => !f.hidden).length)}
            />
          ))}
        </ol>

      </Panel>
    </Section>
  );
}

function FrameEditor({ frame, index, count, open, disabled, onToggle, onChange, onMove, onRemove, onPreview }) {
  const [askRemove, setAskRemove] = useState(false);
  const [iosText, setIosText] = useState(!!frame.bodyIos);
  const note = frameNote(frame);
  // Выбранная картинка — на виду: лента прокручивается вбок, и она могла
  // оказаться за краем
  const artsRef = useRef(null);
  useEffect(() => {
    if (!open || !artsRef.current) return;
    const on = artsRef.current.querySelector('.is-on');
    if (on) artsRef.current.scrollLeft += on.getBoundingClientRect().left - artsRef.current.getBoundingClientRect().left - 8;
  }, [open]);

  return (
    <li className={'admin-stories__frame' + (frame.hidden ? ' admin-stories__frame--hidden' : '') + (open ? ' admin-stories__frame--open' : '')}>
      <div className="admin-stories__frame-head">
        <button type="button" className="admin-stories__frame-title" aria-expanded={open} onClick={onToggle}>
          <span className="admin-stories__dot" style={{ background: frame.tint || 'var(--line)' }} aria-hidden="true" />
          <span className="admin-stories__frame-copy">
            <strong>{frame.heading.trim() || 'Без заголовка'}</strong>
            {note && <span>{note}</span>}
          </span>
          <IconChevron size={16} />
        </button>
        <div className="admin-stories__move">
          <button type="button" className="icon-button" aria-label="Кадр выше" disabled={disabled || index === 0} onClick={() => onMove(-1)}>
            <IconArrowUp size={16} />
          </button>
          <button type="button" className="icon-button" aria-label="Кадр ниже" disabled={disabled || index === count - 1} onClick={() => onMove(1)}>
            <IconArrowDown size={16} />
          </button>
        </div>
      </div>

      {open && (
        <div className="admin-stories__frame-body">
          <Field label="Заголовок" inputMode="text" value={frame.heading} disabled={disabled}
            error={frame.heading.trim() ? (frame.heading.length > LIMITS.heading ? `Длиннее ${LIMITS.heading} знаков` : null) : 'Нужен заголовок'}
            onChange={(v) => onChange({ heading: v })} />
          <TextArea label="Текст" value={frame.body} disabled={disabled}
            hint="Куда зайти и что нажать. Шесть секунд на кадр — два-три предложения"
            onChange={(v) => onChange({ body: v })} />
          {iosText || frame.bodyIos ? (
            <TextArea label="Текст для iPhone" value={frame.bodyIos || ''} disabled={disabled}
              hint="На iPhone показывается вместо основного. Пусто — как у всех"
              onChange={(v) => onChange({ bodyIos: v })} />
          ) : (
            <button type="button" className="button button--ghost admin-stories__ios" disabled={disabled} onClick={() => setIosText(true)}>
              <IconPlus size={16} />
              Другой текст для iPhone
            </button>
          )}
          <Field label="Дата над заголовком" inputMode="text" placeholder="19 октября" value={frame.date || ''} disabled={disabled}
            hint="Для новостей. Пусто — без даты" onChange={(v) => onChange({ date: v })} />

          <ImagePicker frame={frame} disabled={disabled} artsRef={artsRef} onChange={onChange} />

          <div className="admin-stories__picker" role="radiogroup" aria-label="Цвет">
            <span className="field__label">Цвет</span>
            <div className="admin-stories__tints">
              {TINTS.map((tint) => (
                <button key={tint} type="button" role="radio" aria-checked={frame.tint === tint} aria-label={'Цвет ' + tint}
                  className={'admin-stories__tint' + (frame.tint === tint ? ' is-on' : '')} style={{ background: tint }}
                  disabled={disabled} onClick={() => onChange({ tint })} />
              ))}
            </div>
          </div>

          <Segmented items={DEVICES} value={frame.only || ''} label="Где показывать" wrap disabled={disabled}
            onChange={(v) => onChange({ only: v })} />

          <label className="library__check">
            <input type="checkbox" checked={!!frame.hidden} disabled={disabled} onChange={(e) => onChange({ hidden: e.target.checked })} />
            <span>Скрыть кадр<br /><span className="small muted">Останется здесь, но людям не показывается</span></span>
          </label>

          <div className="trainer-row__actions">
            {!frame.hidden && frame.heading.trim() && (
              <button type="button" className="button" onClick={onPreview}>
                <IconEye size={16} />
                Посмотреть
              </button>
            )}
            <button type="button" className={'button' + (askRemove ? ' button--critical' : ' button--ghost')} disabled={disabled}
              onClick={() => { if (askRemove) onRemove(); else setAskRemove(true); }}>
              <IconTrash size={16} />
              {askRemove ? 'Точно удалить?' : 'Удалить кадр'}
            </button>
            {frame.hidden && <Tag>скрыт</Tag>}
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * Картинка кадра: своя файлом (её готовит Claude, владелец вставляет) или
 * встроенный рисунок. Своя заменяет рисунок; «Без картинки» убирает обе.
 * PNG остаётся PNG — у нарисованных картинок бывает прозрачный фон.
 */
function ImagePicker({ frame, disabled, artsRef, onChange }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const fileRef = useRef(null);

  const pick = async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true); setProblem('');
    try {
      const blob = await shrinkPhoto(file, 1600, file.type === 'image/png' ? 'image/png' : 'image/jpeg');
      const { url } = await uploadStoryImage(blob);
      onChange({ image: url, art: '' });
      haptic('success');
    } catch (err) {
      setProblem(err.message || 'Не получилось загрузить картинку.');
    } finally {
      setBusy(false);
    }
  };

  const none = !frame.image && !frame.art;
  return (
    <div className="admin-stories__picker" role="radiogroup" aria-label="Картинка">
      <span className="field__label">Картинка</span>
      <div className="admin-stories__arts" ref={artsRef} style={{ '--tint': frame.tint || TINTS[0] }}>
        <button type="button" className="admin-stories__art admin-stories__art--upload" disabled={disabled || busy}
          onClick={() => fileRef.current && fileRef.current.click()}>
          <IconPlus size={18} />
          <span className="small">{busy ? 'Загружаю…' : frame.image ? 'Заменить' : 'Вставить свою'}</span>
        </button>
        {frame.image && (
          <button type="button" role="radio" aria-checked="true" aria-label="Своя картинка" className="admin-stories__art is-on" disabled={disabled}>
            <img src={mediaUrl(frame.image)} alt="" />
          </button>
        )}
        <button type="button" role="radio" aria-checked={none} className={'admin-stories__art' + (none ? ' is-on' : '')}
          disabled={disabled} onClick={() => onChange({ art: '', image: '' })}>
          <span className="small">Без картинки</span>
        </button>
        {ART_NAMES.map((name) => {
          const Picture = ART[name];
          const on = !frame.image && frame.art === name;
          return (
            <button key={name} type="button" role="radio" aria-checked={on}
              className={'admin-stories__art' + (on ? ' is-on' : '')}
              disabled={disabled} onClick={() => onChange({ art: name, image: '' })}>
              <Picture />
            </button>
          );
        })}
      </div>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pick} />
      {problem && <span className="field__error">{problem}</span>}
      <span className="field__hint">Своя картинка — PNG или JPEG, лучше широкая, 16:9. Встроенные рисунки — листайте вбок</span>
    </div>
  );
}

function TextArea({ label, hint, value, onChange, disabled }) {
  const tooLong = value.length > LIMITS.body;
  return (
    <label className={'field' + (tooLong ? ' field--bad' : '')}>
      <span className="field__label">{label}</span>
      <textarea className="field__input library__textarea" rows={5} value={value} disabled={disabled}
        onChange={(e) => onChange(e.target.value)} aria-invalid={tooLong ? 'true' : undefined} />
      <span className={tooLong ? 'field__error' : 'field__hint'}>
        {tooLong ? `Длиннее ${LIMITS.body} знаков: ${value.length}` : `${hint ? hint + ' · ' : ''}${value.length} из ${LIMITS.body}`}
      </span>
    </label>
  );
}
