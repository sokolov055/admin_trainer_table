import React, { useEffect, useRef, useState } from 'react';
import { Sheet, Note, Field } from '../ui.jsx';
import { IconAlert, IconPlus, IconClose, IconCamera } from '../icons.jsx';
import { Media } from '../media.jsx';
import { MuscleFigure, MuscleNames, LABELS } from '../muscles/MuscleMap.jsx';
import ExerciseKind from '../ExerciseKind.jsx';
import { apiMutate } from '../api.js';
import { haptic } from '../telegram.js';
import { uploadVideo } from '../library.js';
import { useBackGesture } from '../gestures.jsx';
import { loadLabel } from './exercise-list-model.js';
import { draftOf, changesOf, problemOf, savePlan, moveItem, removeItem, SETUP_MAX } from './exercise-edit-model.js';
import { muscleTone, muscleClass } from '../data-tones.js';
import './exercises-lib.css';

export const SHORT_MAX = 20;

/** Поле, которое растёт по тексту: длинное название и шаги видны целиком */
function Grow({ value, onChange, label, className = '', placeholder = '', single = false, maxLength }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [value]);
  return <textarea ref={ref} rows={single ? 1 : 2} className={'elib-ed__grow ' + className} aria-label={label} value={value} placeholder={placeholder} maxLength={maxLength}
    onKeyDown={(ev) => { if (single && ev.key === 'Enter') ev.preventDefault(); }}
    onChange={(ev) => onChange(single ? ev.target.value.replace(/\n/g, '') : ev.target.value)} />;
}

/** Ключевое слово упражнения: до 20 знаков, видно под картинкой в ленте */
function ShortNameField({ value = '', onChange }) {
  const count = Array.from(value).length;
  return (
    <label className="field">
      <span className="field__label">Коротко — в ленте программы <span className="elib-ed__count">{count} / {SHORT_MAX}</span></span>
      <input className="field__input" type="text" autoComplete="off" aria-label="Коротко — в ленте программы" value={value} placeholder="Пек-дек"
        onChange={(ev) => onChange(Array.from(ev.target.value).slice(0, SHORT_MAX).join(''))} />
      <span className="field__hint">Видно под картинкой в карточке тренировки. Пусто — только номер.</span>
    </label>
  );
}

function Box({ title, action = null, tag = null, children }) {
  return <section className="elib-box elib-ed__box">
    <div className="elib-box__h elib-ed__bh"><span>{title}{tag && <em className="elib-ed__tag">{tag}</em>}</span>{action}</div>
    {children}
  </section>;
}

function Help({ text }) {
  return <span className="elib-ed__help" role="img" aria-label={text} title={text}>?</span>;
}

/**
 * Правка упражнения одним экраном: одно «Сохранить» вверху, поля не сохраняются
 * по отдельности. После сохранения экран остаётся открытым и перечитывает данные.
 * Общее упражнение при сохранении становится вашей версией (сервер).
 */
export default function ExerciseEditor({ exercise: e, owner, muscles, onSaved, onBack }) {
  const [d, setD] = useState(() => draftOf(e));
  const [sheet, setSheet] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(null);
  const [stepDraft, setStepDraft] = useState('');
  const [errDraft, setErrDraft] = useState('');
  const directSetup = e.mine || (e.common && owner);
  const ch = changesOf(e, d);
  const dirty = Object.keys(ch).length > 0 || !!file;
  const problem = problemOf(d);
  const canSave = dirty && !problem && !busy;
  const set = (patch) => setD((x) => ({ ...x, ...patch }));

  const requestBack = () => (dirty ? setConfirm(true) : onBack());
  // Системное «назад» и жест — тот же путь: с несохранённым сначала спрашиваем
  useBackGesture(() => { if (confirm) setConfirm(false); else requestBack(); }, true);

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    setFailure(null);
    try {
      const { main, setup } = savePlan(e, d, { directSetup });
      let saved = null;
      if (setup) await apiMutate('library.exercise.setup', setup);
      if (main) saved = await apiMutate('library.exercise.save', main);
      const id = saved ? saved.id : e.id;
      if (file) {
        setProgress(0);
        await uploadVideo(id, file, setProgress);
        setFile(null);
      }
      haptic('success');
      onSaved(saved || null);
    } catch (err) {
      setFailure(err);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const tone = muscleClass(muscleTone({ group: d.muscle }));
  const hasFile = e.mine && e.media?.kind === 'file';
  const notice = e.mine ? '' : 'Общее упражнение. «Сохранить» создаст вашу версию — общая не изменится.';

  return <div className={'elib-ed ' + tone}>
    <header className="elib-ed__top">
      <button type="button" className="elib-ed__cancel" onClick={requestBack}>Отмена</button>
      <b className="elib-ed__title">Упражнение{dirty && <i className="elib-ed__dot" role="img" aria-label="Есть несохранённое" />}</b>
      <button type="button" className="button button--primary elib-ed__save" disabled={!canSave} onClick={save}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>
    </header>

    {failure && <Note tone="critical" icon={IconAlert}>{failure.message}</Note>}
    {!failure && problem && dirty && <p className="elib-ed__problem">{problem}</p>}
    {notice && <p className="elib-notice">{notice}</p>}

    <Grow single className="elib-ed__name" label="Название" value={d.name} onChange={(v) => set({ name: v })} />

    <Box title="Характеристики" action={<button type="button" className="elib-ed__link" onClick={() => setSheet('chars')}>Изменить</button>}>
      <dl className="elib-pass">
        <div><dt>Группа</dt><dd>{d.muscle || 'Не указана'}</dd></div>
        <div><dt>Нагрузка</dt><dd>{loadLabel({ track: d.track })}</dd></div>
        <div><dt>Инвентарь</dt><dd>{d.equipment || '—'}</dd></div>
        <div><dt>В ленте</dt><dd>{d.shortName || 'номер'}</dd></div>
      </dl>
    </Box>

    <Box title="Видео">
      {e.media && !file && <Media media={e.media} />}
      <Field label="Ссылка" inputMode="url" value={d.link} onChange={(v) => set({ link: v })} placeholder="https://…" hint="Клиент увидит кнопку «Открыть видео». Чтобы видео играло прямо в приложении, загрузите файл." />
      <label className="elib-ed__file">
        <IconCamera size={18} />
        <span>{file ? file.name : 'Файл с телефона'}</span>
        <input type="file" accept="video/mp4,video/quicktime,video/webm,video/x-m4v" onChange={(ev) => setFile(ev.target.files[0] || null)} />
      </label>
      <span className="field__hint">{file ? `${Math.round(file.size / 1024 / 1024)} МБ · заменит прежнее видео` : hasFile ? 'Загружено своё видео — новый файл заменит его' : 'До 500 МБ. Пустая ссылка не стирает загруженное видео.'}</span>
      {progress !== null && (
        <div className="library__progress" role="progressbar" aria-valuenow={Math.round(progress * 100)}>
          <span style={{ transform: `scaleX(${progress})` }} />
          <em>Загружаем видео… {Math.round(progress * 100)}%</em>
        </div>
      )}
    </Box>

    <Box title="Техника">
      <div className="elib-ed__lab">Шаги <Help text="Исходное положение, движение, дыхание" /></div>
      <ol className="elib-ed__steps">
        {d.steps.map((s, i) => <li key={i} className="elib-ed__step">
          <div className="elib-ed__stepbar">
            <span>Шаг {i + 1}</span>
            <button type="button" className="elib-ed__mini" aria-label="Выше" disabled={i === 0} onClick={() => set({ steps: moveItem(d.steps, i, -1) })}>↑</button>
            <button type="button" className="elib-ed__mini" aria-label="Ниже" disabled={i === d.steps.length - 1} onClick={() => set({ steps: moveItem(d.steps, i, 1) })}>↓</button>
            <button type="button" className="elib-ed__mini" aria-label="Удалить шаг" onClick={() => set({ steps: removeItem(d.steps, i) })}><IconClose size={16} /></button>
          </div>
          <Grow label={'Шаг ' + (i + 1)} value={s} placeholder="Что сделать на этом шаге" onChange={(v) => set({ steps: d.steps.map((x, k) => (k === i ? v : x)) })} />
        </li>)}
      </ol>
      <div className="elib-ed__add">
        <Grow single label="Новый шаг" value={stepDraft} placeholder="Новый шаг — Enter" onChange={setStepDraft} />
        <button type="button" className="button button--ghost" disabled={!stepDraft.trim()} onClick={() => { set({ steps: [...d.steps, stepDraft.trim()] }); setStepDraft(''); }}><IconPlus size={16} />Шаг</button>
      </div>

      <div className="elib-ed__lab elib-ed__lab--err"><IconAlert size={16} />Частые ошибки <Help text="Одна ошибка — одна плашка" /></div>
      <div className="elib-ed__errs">
        {d.mistakes.map((m, i) => <span key={i} className="elib-ed__err">{m}<button type="button" aria-label="Убрать ошибку" onClick={() => set({ mistakes: removeItem(d.mistakes, i) })}><IconClose size={14} /></button></span>)}
      </div>
      <input className="field__input elib-ed__errin" aria-label="Добавить ошибку" value={errDraft} placeholder="Ошибка — Enter"
        onChange={(ev) => setErrDraft(ev.target.value)}
        onKeyDown={(ev) => { if (ev.key === 'Enter' && errDraft.trim()) { ev.preventDefault(); set({ mistakes: [...d.mistakes, errDraft.trim()] }); setErrDraft(''); } }} />
    </Box>

    {!e.machines?.length && <Box title="Подготовка" tag="нет тренажёра">
      <Grow label="Подготовка к упражнению" value={d.setup} placeholder={'Сиденье — рукояти на уровне груди.\nСпинка — лопатки прижаты.'} onChange={(v) => set({ setup: v, setupOk: false })} maxLength={SETUP_MAX} className="elib-ed__setup" />
      <span className="field__hint">Клиент видит подготовку, пока к упражнению не привязан тренажёр.</span>
      <label className="library__check"><input type="checkbox" checked={d.setupOk} disabled={!d.setup.trim()} onChange={(ev) => set({ setupOk: ev.target.checked })} />Проверено — показывать клиентам</label>
    </Box>}

    <Box title="Мышцы" action={<button type="button" className="elib-ed__link" onClick={() => setSheet('mmap')}>Настроить</button>}>
      <p className="elib-hint">{d.map ? 'Своя разметка: основные и дополнительные мышцы.' : 'По группе мышц — точная разметка не задана.'}</p>
      {d.map && <MuscleNames primary={d.map.primary || []} secondary={d.map.secondary || []} max={20} />}
    </Box>

    <p className="elib-hint elib-ed__foot">Тренажёры и замены — в карточке, без редактора.</p>

    {sheet === 'chars' && <Sheet title="Характеристики" className="elib-sheet" onClose={() => setSheet('')} onDone={() => setSheet('')}>
      <div className="elib-ed__slab">Группа мышц</div>
      <div className="elib-tiles elib-ed__groups" role="group" aria-label="Группа мышц">
        {[{ value: '', label: 'Не указана' }, ...muscles.map((m) => ({ value: m, label: m }))].map((g) => <button type="button" key={g.value || 'none'} aria-pressed={d.muscle === g.value} className={'elib-tile' + (d.muscle === g.value ? ' is-on' : '')} onClick={() => set({ muscle: g.value })}>{g.label}</button>)}
      </div>
      <div className="elib-ed__slab">Как учитывать нагрузку</div>
      <ExerciseKind track={d.track} allowAuto className="exercise-kind--bare" onChange={(t) => set({ track: t })} />
      <Field label="Инвентарь" inputMode="text" value={d.equipment} onChange={(v) => set({ equipment: v })} hint="По нему считается шаг веса в занятии: гантели и гири — 1–2 кг, остальное — 2,5 кг и больше." />
      <ShortNameField value={d.shortName} onChange={(v) => set({ shortName: v })} />
    </Sheet>}

    {sheet === 'mmap' && <Sheet title="Нагрузка на мышцы" className="elib-sheet" onClose={() => setSheet('')} onDone={() => setSheet('')}>
      <p className="elib-hint">Нажатие: основная, дополнительная, убрать. Без точной разметки используется группа мышц.</p>
      <MuscleFigure primary={d.map?.primary || []} secondary={d.map?.secondary || []} onTap={(r) => set({ map: flip(d.map, r) })} />
      <MuscleNames primary={d.map?.primary || []} secondary={d.map?.secondary || []} max={20} />
      <div className="chips chips--wrap">{Object.entries(LABELS).map(([id, label]) => <button className="chip" type="button" key={id} aria-pressed={!!(d.map?.primary.includes(id) || d.map?.secondary.includes(id))} onClick={() => set({ map: flip(d.map, id) })}>{label}{d.map?.primary.includes(id) ? ' · основная' : d.map?.secondary.includes(id) ? ' · дополнительная' : ''}</button>)}</div>
      <button className="button button--ghost" type="button" onClick={() => set({ map: null })}>Использовать группу</button>
    </Sheet>}

    {confirm && <Sheet title="Выйти без сохранения?" className="elib-sheet" onClose={() => setConfirm(false)}>
      <p className="elib-hint">Изменения в этом упражнении не сохранятся.</p>
      <div className="elib-ed__confirm">
        <button type="button" className="button button--primary" onClick={() => setConfirm(false)}>Остаться</button>
        <button type="button" className="button button--ghost danger" onClick={onBack}>Выйти</button>
      </div>
    </Sheet>}
  </div>;
}

/** Нажатие по фигуре: основная → дополнительная → убрать */
function flip(map, r) {
  const v = map || { primary: [], secondary: [] };
  return {
    primary: v.primary.filter((x) => x !== r).concat(!v.primary.includes(r) && !v.secondary.includes(r) ? [r] : []),
    secondary: v.secondary.filter((x) => x !== r).concat(v.primary.includes(r) ? [r] : []),
  };
}
