import React, { useEffect, useRef, useState } from 'react';
import { Sheet, Note, Field } from '../ui.jsx';
import { IconAlert, IconPlus, IconClose, IconCamera, IconLink } from '../icons.jsx';
import { Media } from '../media.jsx';
import { MuscleFigure, MuscleNames } from '../muscles/MuscleMap.jsx';
import ExerciseKind from '../ExerciseKind.jsx';
import { apiMutate } from '../api.js';
import { haptic } from '../telegram.js';
import { uploadVideo } from '../library.js';
import { useBackGesture } from '../gestures.jsx';
import { loadLabel } from './exercise-list-model.js';
import { draftOf, diffDrafts, problemOf, savePlan, moveItem, removeItem, SETUP_MAX } from './exercise-edit-model.js';
import { muscleTone, muscleClass } from '../data-tones.js';
import './exercises-lib.css';

export const SHORT_MAX = 20;

/** Поле, которое растёт по тексту; однострочное не принимает перевод строки */
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

function Box({ title, action = null, tag = null, children }) {
  return <section className="elib-box elib-ed__box">
    <div className="elib-box__h elib-ed__bh"><span>{title}{tag && <em className="elib-ed__tag">{tag}</em>}</span>{action}</div>
    {children}
  </section>;
}

/** Подпись блока и «?»: нажатие показывает подсказку под подписью (на телефоне не бывает всплывающих подсказок) */
function Lab({ children, help, className = '' }) {
  const [open, setOpen] = useState(false);
  return <div className="elib-ed__labwrap">
    <div className={'elib-ed__lab ' + className}>{children}
      <button type="button" className="elib-ed__help" aria-expanded={open} aria-label={'Подсказка: ' + help} onClick={() => setOpen((v) => !v)}><span aria-hidden="true">?</span></button>
    </div>
    {open && <p className="elib-ed__tip">{help}</p>}
  </div>;
}

/**
 * Правка упражнения одним экраном по макету: одно «Сохранить», поля не
 * сохраняются по отдельности. После сохранения экран остаётся открытым и
 * перечитывает данные. Общее упражнение при сохранении становится вашей версией.
 */
export default function ExerciseEditor({ exercise: e, owner, muscles, onSaved, onBack }) {
  const [d, setD] = useState(() => draftOf(e));
  // Последнее сохранённое состояние: точка несохранённого считается от него, а не от исходного упражнения
  const [base, setBase] = useState(() => draftOf(e));
  const [sheet, setSheet] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(null);
  const [linkOpen, setLinkOpen] = useState(!!d.link);
  const [errDraft, setErrDraft] = useState('');
  const directSetup = e.mine || (e.common && owner);
  const dirty = Object.keys(diffDrafts(base, d)).length > 0 || !!file;
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
      const { main, setup } = savePlan(e, d, { directSetup, was: base });
      let saved = null;
      if (setup) await apiMutate('library.exercise.setup', setup);
      if (main) saved = await apiMutate('library.exercise.save', main);
      const id = saved ? saved.id : e.id;
      if (file) {
        setProgress(0);
        await uploadVideo(id, file, setProgress);
        setFile(null);
      }
      // Сохранённое становится базой: точка и «Сохранить» гаснут сразу, даже пока перечитывание в пути
      if (saved) { setBase(draftOf(saved)); setD(draftOf(saved)); } else if (setup) setBase(draftOf({ ...e, setup: setup.setup, setupOk: setup.ok }));
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

  return <div className={'elib-ed ' + tone}>
    <header className="elib-ed__top">
      <button type="button" className="elib-ed__cancel" onClick={requestBack}>Отмена</button>
      <b className="elib-ed__title">Упражнение{dirty && <i className="elib-ed__dot" role="img" aria-label="Есть несохранённое" />}</b>
      <button type="button" className="elib-ed__save" disabled={!canSave} onClick={save}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>
    </header>

    {failure && <Note tone="critical" icon={IconAlert}>{failure.message}</Note>}
    {!failure && problem && dirty && <p className="elib-ed__problem">{problem}</p>}

    <Grow single className="elib-ed__name" label="Название" value={d.name} onChange={(v) => set({ name: v })} />

    <Box title="Характеристики" action={<button type="button" className="elib-ed__link" onClick={() => setSheet('chars')}>Изменить</button>}>
      <div className="elib-ed__pills">
        <span className="elib-ed__pill"><small>Группа</small><b>{d.muscle || 'не указана'}</b></span>
        <span className="elib-ed__pill"><small>Нагрузка</small><b>{loadLabel({ track: d.track })}</b></span>
        <span className="elib-ed__pill"><small>Инвентарь</small><b>{d.equipment || '—'}</b></span>
        <span className="elib-ed__pill"><small>В ленте</small><b>{d.shortName || 'номер'}</b></span>
      </div>
    </Box>

    <Box title="Видео">
      {e.media && !file && <Media media={e.media} />}
      <div className="elib-ed__vrow">
        <button type="button" className={'elib-ed__vbtn' + (linkOpen ? ' is-on' : '')} aria-pressed={linkOpen} onClick={() => setLinkOpen((v) => !v)}><IconLink size={18} />Ссылка</button>
        <label className="elib-ed__vbtn">
          <IconCamera size={18} />Файл
          <input type="file" accept="video/mp4,video/quicktime,video/webm,video/x-m4v" onChange={(ev) => setFile(ev.target.files[0] || null)} />
        </label>
      </div>
      {linkOpen && <Field label="Ссылка" inputMode="url" value={d.link} onChange={(v) => set({ link: v })} placeholder="https://…" />}
      <p className="elib-ed__hint">{file ? `${file.name} · ${Math.round(file.size / 1024 / 1024)} МБ` : hasFile ? 'Загружено своё видео — новый файл заменит его' : 'Файл — до 500 МБ. Пустая ссылка не стирает загруженное видео.'}</p>
      {progress !== null && (
        <div className="library__progress" role="progressbar" aria-valuenow={Math.round(progress * 100)}>
          <span style={{ transform: `scaleX(${progress})` }} />
          <em>Загружаем видео… {Math.round(progress * 100)}%</em>
        </div>
      )}
    </Box>

    <Box title="Техника">
      <Lab help="Исходное положение, движение, дыхание">Шаги</Lab>
      {d.steps.map((s, i) => <div key={i} className="elib-ed__step">
        <div className="elib-ed__stepbar">
          <span>Шаг {i + 1}</span>
          <button type="button" className="elib-ed__mini" aria-label="Выше" disabled={i === 0} onClick={() => set({ steps: moveItem(d.steps, i, -1) })}>↑</button>
          <button type="button" className="elib-ed__mini" aria-label="Ниже" disabled={i === d.steps.length - 1} onClick={() => set({ steps: moveItem(d.steps, i, 1) })}>↓</button>
          <button type="button" className="elib-ed__mini" aria-label="Удалить шаг" onClick={() => set({ steps: removeItem(d.steps, i) })}><IconClose size={16} /></button>
        </div>
        <Grow label={'Шаг ' + (i + 1)} value={s} placeholder="Что сделать на этом шаге" onChange={(v) => set({ steps: d.steps.map((x, k) => (k === i ? v : x)) })} />
      </div>)}
      <button type="button" className="elib-ed__add" onClick={() => set({ steps: [...d.steps, ''] })}><IconPlus size={16} />Добавить шаг</button>

      <div className="elib-ed__errbox">
        <Lab className="elib-ed__lab--err" help="Одна ошибка — одна плашка"><IconAlert size={16} />Частые ошибки</Lab>
        <div className="elib-ed__errs">
          {d.mistakes.map((m, i) => <span key={i} className="elib-ed__err">{m}<button type="button" aria-label="Убрать ошибку" onClick={() => set({ mistakes: removeItem(d.mistakes, i) })}><IconClose size={14} /></button></span>)}
        </div>
        <input className="field__input elib-ed__errin" aria-label="Добавить ошибку" value={errDraft} placeholder="Добавить ошибку и нажать Enter"
          onChange={(ev) => setErrDraft(ev.target.value)}
          onKeyDown={(ev) => { if (ev.key === 'Enter' && errDraft.trim()) { ev.preventDefault(); set({ mistakes: [...d.mistakes, errDraft.trim()] }); setErrDraft(''); } }} />
      </div>
    </Box>

    {!e.machines?.length && <Box title="Подготовка" tag="нет тренажёра">
      <Grow label="Подготовка к упражнению" value={d.setup} placeholder="Сиденье — рукояти на уровне груди…" onChange={(v) => set({ setup: v })} maxLength={SETUP_MAX} className="elib-ed__setup" />
      <p className="elib-ed__hint">{d.setup.trim() && !base.setupOk ? 'Клиенты пока не видят — нажмите «Сохранить».' : 'Клиент видит подготовку, пока к упражнению не привязан тренажёр.'}</p>
    </Box>}

    <Box title="Мышцы" action={<button type="button" className="elib-ed__link" onClick={() => setSheet('mmap')}>Настроить</button>}>
      <div className="elib-ed__sw">
        <b>{d.map ? 'Своя разметка' : 'По группе мышц'}</b>
        <small>{d.map ? 'Основные и дополнительные мышцы' : 'Точная разметка не задана'}</small>
      </div>
    </Box>

    <p className="elib-hint elib-ed__foot">Тренажёры и замены — в карточке, без редактора.</p>

    {sheet === 'chars' && <Sheet title="Характеристики" className="elib-sheet" onClose={() => setSheet('')} onDone={() => setSheet('')}>
      <div className="elib-ed__slab">Группа мышц</div>
      <div className="elib-tiles elib-ed__groups" role="group" aria-label="Группа мышц">
        {muscles.map((m) => <button type="button" key={m} aria-pressed={d.muscle === m} className={'elib-tile' + (d.muscle === m ? ' is-on' : '')} onClick={() => set({ muscle: m })}>{m}</button>)}
      </div>
      <div className="elib-ed__slab">Как учитывать нагрузку</div>
      <ExerciseKind track={d.track} allowAuto className="exercise-kind--bare" onChange={(t) => set({ track: t })} />
      <div className="elib-ed__slab">Инвентарь</div>
      <input className="field__input" aria-label="Инвентарь" value={d.equipment} onChange={(ev) => set({ equipment: ev.target.value })} />
      <p className="elib-ed__hint">По нему считается шаг веса: гантели и гири — 1–2 кг, остальное — от 2,5 кг.</p>
      <div className="elib-ed__slab">Коротко — в ленте программы <span className="elib-ed__count">{Array.from(d.shortName).length} / {SHORT_MAX}</span></div>
      <input className="field__input" aria-label="Коротко — в ленте программы" value={d.shortName} placeholder="Пек-дек"
        onChange={(ev) => set({ shortName: Array.from(ev.target.value).slice(0, SHORT_MAX).join('') })} />
    </Sheet>}

    {sheet === 'mmap' && <Sheet title="Нагрузка на мышцы" className="elib-sheet" onClose={() => setSheet('')} onDone={() => setSheet('')}>
      <MuscleFigure primary={d.map?.primary || []} secondary={d.map?.secondary || []} onTap={(r) => set({ map: flip(d.map, r) })} />
      <MuscleNames primary={d.map?.primary || []} secondary={d.map?.secondary || []} max={20} />
      <button className="button button--ghost" type="button" onClick={() => set({ map: null })}>Использовать группу</button>
    </Sheet>}

    {confirm && <Sheet title="Выйти без сохранения?" className="elib-sheet" onClose={() => setConfirm(false)}>
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
