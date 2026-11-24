import { primaryEquipment } from '../equipment-guidance.js';
import React, { useEffect, useRef, useState } from 'react';
import { apiMutate } from '../api.js';
import { haptic } from '../telegram.js';
import { useData } from '../useData.js';
import { shrinkPhoto, uploadMachinePhoto, mediaUrl } from '../library.js';
import { Confirm, Loading, Segmented, Note, Search, Sheet } from '../ui.jsx';
import { IconAlert, IconClose, IconPlus, IconBench } from '../icons.jsx';
import '../exercise-kind-tiles.css';
import { useReveal } from '../reveal.js';
import { useBackGesture, useTabLock } from '../gestures.jsx';
import './machines-lib.css';
import SetupStepsEditor from './SetupStepsEditor.jsx';

/*
 * Тренажёры и оборудование упражнения — редактор. Живёт отдельно от
 * библиотеки (10.10.2026, владелец): тренер прикрепляет тренажёр к
 * упражнению там, где его видит, — в шаблоне, программе клиента, идущем
 * занятии и «Моих тренировках», а не только в базе упражнений.
 */

export const MACHINE_KIND_ITEMS = [
  { value: 'machine', label: 'Тренажёр' },
  { value: 'equipment', label: 'Оборудование' },
];

/** Кто увидит правку тренажёров и замен — и не станет ли она своей версией */
export function extrasHint(e, owner) {
  if (e.mine) return 'Видите вы и ваши клиенты.';
  if (owner) return 'Общая база: видят все тренеры и их клиенты. Тренер может сделать свою версию под свой клуб.';
  return 'Первая правка создаст вашу версию упражнения — с этими тренажёрами и заменами. Общая не изменится.';
}

/**
 * Подпись раздела «Об упражнении» с «?» (FT-802, 18.11.2026): пояснение
 * не висит абзацем каждый раз, а открывается по нажатию
 */
export function HelpLabel({ title, help }) {
  const [open, setOpen] = useState(false);
  return <>
    <div className="ab-lab">
      {title}
      {help && <button type="button" className="ab-lab__q" aria-expanded={open} aria-label={title + ': что это'} onClick={() => { setOpen(!open); haptic(); }}>?</button>}
    </div>
    {open && <p className="ab-tip">{help}</p>}
  </>;
}

const MACHINES_HELP = 'На чём делают это упражнение: тренажёр или набор — штанга, гриф, скамья. Клиент видит именно это и ничего не выбирает. Вес и настройка (спинка, сиденье) у каждого клиента свои — их записывают в занятии.';
const ALTS_HELP = 'Чем заменить, если тренажёр занят или упражнение не подходит: клиент меняет его в занятии одним касанием, вес подтянется с прошлого раза. Связь работает в обе стороны.';

/**
 * Тренажёры карточками в ленту (FT-802): фото и название, нажать — правка
 * под лентой; пустая пунктирная — «+ Тренажёр»: из каталога или новый
 */
function MachinesCompact({ exercise, owner, onChanged }) {
  const e = exercise;
  const machines = e.machines || [];
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [picking, setPicking] = useState(false);
  const [failure, setFailure] = useState(null);
  useEffect(() => { setEditing(null); setAdding(false); setPicking(false); setFailure(null); }, [e.id]);
  const primary = primaryEquipment(e)?.uid;
  const done = (saved) => { setEditing(null); setAdding(false); if (saved) onChanged(saved); };
  const first = async (m) => {
    setFailure(null);
    try {
      const r = await apiMutate('library.exercise.machine.primary', { exerciseId: e.id, uid: m.uid });
      haptic('success');
      onChanged(r.exercise);
    } catch (err) {
      setFailure(err);
    }
  };
  const open = machines.find((m) => m.uid === editing) || null;
  return (
    <div className="ab-sec">
      <HelpLabel title="Тренажёры" help={machines.length ? MACHINES_HELP + ' ' + extrasHint(e, owner) : MACHINES_HELP} />
      <div className="ab-eqs">
        {machines.length < 8 && (
          <button type="button" className="ab-add" aria-expanded={adding || picking || editing === 'new'}
            onClick={() => { haptic(); setEditing(null); setPicking(false); setAdding(!(adding || picking || editing === 'new')); }}>
            <IconPlus size={22} />
            Тренажёр
            <small>из каталога или новый</small>
          </button>
        )}
        {machines.map((m) => (
          <button type="button" key={m.uid} className={'ab-eq' + (editing === m.uid ? ' is-open' : '')} aria-expanded={editing === m.uid}
            onClick={() => { haptic(); setAdding(false); setPicking(false); setEditing(editing === m.uid ? null : m.uid); }}>
            {machines.length > 1 && primary === m.uid && <span className="ab-eq__star">основной</span>}
            <span className="ab-eq__pic">{m.photo ? <img src={mediaUrl(m.photo)} alt="" loading="lazy" /> : <IconBench size={26} />}</span>
            <span className="ab-eq__name">{m.name}</span>
          </button>
        ))}
      </div>
      {adding && (
        <div className="ab-eq-act">
          <button type="button" className="button" onClick={() => { setAdding(false); setPicking(true); }}>Из каталога</button>
          <button type="button" className="button" onClick={() => { setAdding(false); setEditing('new'); }}>Создать новый</button>
        </div>
      )}
      {picking && <MachinePicker exercise={e} attached={machines} onDone={(saved) => { setPicking(false); if (saved) onChanged(saved); }} />}
      {editing === 'new' && <MachineForm exercise={e} machine={null} onDone={done} />}
      {open && <>
        {machines.length > 1 && primary !== open.uid && (
          <div className="ab-eq-act"><button type="button" className="button button--ghost" onClick={() => first(open)}>Сделать основным</button></div>
        )}
        <MachineForm key={open.uid} exercise={e} machine={open} onDone={done} />
      </>}
      {failure && <Note tone="critical" icon={IconAlert}>{failure.message}</Note>}
    </div>
  );
}

/**
 * Тренажёры упражнения (07.10.2026, FT-478): в разных залах жим ногами
 * стоит разный — у каждого название, фото и где регулировки (без цифр:
 * цифры у каждого клиента свои — сервер, lib/machine-notes.js). С
 * 16.10.2026 (владелец) это не выбор, а то, на чём делают: тренер один раз
 * привязывает тренажёр или набор (штанга, гриф, скамья), клиент видит
 * именно его и ничего не выбирает; первый — по нему ведётся вес.
 * Общее упражнение правит владелец сервиса прямо в базе; другой тренер —
 * в своей версии (сервер создаёт её при первой правке).
 */
export function MachinesEditor({ exercise, owner, onChanged, compact = false }) {
  if (compact) return <MachinesCompact exercise={exercise} owner={owner} onChanged={onChanged} />;
  return <MachinesFull exercise={exercise} owner={owner} onChanged={onChanged} />;
}

function MachinesFull({ exercise, owner, onChanged }) {
  const e = exercise;
  const machines = e.machines || [];
  const [editing, setEditing] = useState(null);
  const [picking, setPicking] = useState(false);
  const [failure, setFailure] = useState(null);
  useEffect(() => { setEditing(null); setPicking(false); setFailure(null); }, [e.id]);

  const done = (saved) => { setEditing(null); if (saved) onChanged(saved); };
  const first = async (m) => {
    setFailure(null);
    try {
      const r = await apiMutate('library.exercise.machine.primary', { exerciseId: e.id, uid: m.uid });
      haptic('success');
      onChanged(r.exercise);
    } catch (err) {
      setFailure(err);
    }
  };

  return (
    <div className="library__extras">
      <h3 className="setup__title">Тренажёры и оборудование</h3>
      <p className="small muted">
        {machines.length ? extrasHint(e, owner) : 'Добавьте, на чём делают это упражнение: тренажёр или набор — штанга, гриф, скамья. Клиент увидит именно это и ничего не выбирает. Вес и настройка (спинка, сиденье) у каждого клиента свои — их записывают в занятии.'}
      </p>
      {machines.map((m, i) => (editing === m.uid
        ? <MachineForm key={m.uid} exercise={e} machine={m} onDone={done} />
        : (
          <div key={m.uid} className="library__machine">
            {m.photo ? <img className="machines__thumb" src={mediaUrl(m.photo)} alt="" loading="lazy" /> : <span className="machines__thumb machines__thumb--empty" aria-hidden="true" />}
            <div className="library__machine-text">
              <strong>{m.name}</strong>
              <span className="small muted">{m.kind === 'equipment' ? 'Оборудование' : 'Тренажёр'}{(m.photos || []).length > 1 ? ' · ' + m.photos.length + ' фото' : ''}</span>
              <span className="small muted">{m.setup ? m.setup.split('\n')[0] : 'Инструкция не заполнена. Резервная настройка упражнения не показывается.'}</span>
            </div>
            <div className="library__machine-actions">
              {primaryEquipment(e)?.uid !== m.uid && <button type="button" className="button button--ghost" onClick={() => first(m)}>Основное</button>}
              <button type="button" className="button button--ghost" onClick={() => setEditing(m.uid)}>Изменить</button>
            </div>
          </div>
        )))}
      {picking && <MachinePicker exercise={e} attached={machines} onDone={(saved) => { setPicking(false); if (saved) onChanged(saved); }} />}
      {editing === 'new'
        ? <MachineForm exercise={e} machine={null} onDone={done} />
        : machines.length < 8 && !editing && (
          <div className="library__machine-actions">
            <button type="button" className="button button--ghost" onClick={() => setPicking((v) => !v)}>{picking ? 'Закрыть каталог' : 'Добавить из каталога'}</button>
            <button type="button" className="button button--ghost" onClick={() => { setPicking(false); setEditing('new'); }}>+ Создать новое</button>
          </div>
        )}
      {failure && <Note tone="critical" icon={IconAlert}>{failure.message}</Note>}
    </div>
  );
}

/**
 * Один тренажёр: название, фото, где регулировки. Тренажёр сохраняется
 * первым — сервер решает, своё это упражнение или новая своя версия, — и
 * фото кладётся уже к нему. Не загрузилось фото — тренажёр остаётся, форма
 * открыта: повторное «Сохранить» правит его, а не заводит второй.
 */
export function MachineForm({ exercise = null, machine, onDone, canDelete = true, kind: initialKind = 'machine', library = false }) {
  const [name, setName] = useState(machine ? machine.name : '');
  const [setup, setSetup] = useState(machine ? machine.setup : '');
  // Стикеры и цифры на фото у шагов (16.11.2026)
  const [meta, setMeta] = useState(machine?.steps || []);
  const [originalName, setOriginalName] = useState(machine?.originalName || '');
  const [brand, setBrand] = useState(machine?.brand || '');
  const [muscleGroups, setMuscleGroups] = useState(machine?.muscleGroups || []);
  const setupOk = !!setup.trim();
  // Шаг веса тренажёра, кг (FT-626): «Легко» прибавляет столько, пересчёт
  // округляет до него; пусто — шаг по группе мышц, как раньше
  const [weightStep, setWeightStep] = useState(machine?.weightStep ? String(machine.weightStep).replace('.', ',') : '');
  // Тренажёр или оборудование (владелец, 09.10.2026)
  const [kind, setKind] = useState((machine ? machine.kind : initialKind) === 'equipment' ? 'equipment' : 'machine');
  // Поля настройки (FT-760): «Сиденье», «Спинка» — общие для всех, кто на
  // этом тренажёре; значения вписывает клиент в занятии
  const [setupFields, setSetupFields] = useState(machine?.fields?.length ? machine.fields : []);
  // Фото несколько (09.10.2026): уже сохранённые — убранные удаляются только
  // по «Сохранить» — и новые, ещё не загруженные
  const had = machine ? (machine.photos && machine.photos.length ? machine.photos : machine.photo ? [machine.photo] : []) : [];
  const [dropped, setDropped] = useState([]);
  const [added, setAdded] = useState([]); // [{ blob, url }]
  const [saved, setSaved] = useState({ exerciseId: exercise ? exercise.id : 0, uid: machine ? machine.uid : '' });
  // Запись уже могла пройти, даже если фото не загрузились: при выходе
  // каталог должен перечитаться и открыть фактически сохранённый UID.
  const [persisted, setPersisted] = useState(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const [asking, setAsking] = useState(false); // «Убрать / Удалить» — вопрос на месте

  const [passport, setPassport] = useState(false);
  const [help, setHelp] = useState('');
  const [leaving, setLeaving] = useState(false);
  const snapshot = JSON.stringify([name, setup, meta, originalName, brand, muscleGroups, weightStep, kind, setupFields, dropped, added.map(a => a.url)]);
  const initial = useRef(snapshot);
  const dirty = snapshot !== initial.current;
  const cancel = () => { if (busy) return; if (library && dirty) setLeaving(true); else onDone(library ? persisted : null); };
  useTabLock(library);
  useBackGesture(cancel, library);
  useEffect(() => {
    if (!library || !dirty) return;
    const guard = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [library, dirty]);

  const kept = had.filter((u) => !dropped.includes(u));
  const total = kept.length + added.length;
  const pick = async (ev) => {
    const files = [...(ev.target.files || [])].slice(0, MAX_MACHINE_PHOTOS - total);
    ev.target.value = '';
    if (!files.length) return;
    setFailure(null);
    try {
      const next = [];
      for (const file of files) {
        const blob = await shrinkPhoto(file);
        next.push({ blob, url: URL.createObjectURL(blob) });
      }
      setAdded((v) => [...v, ...next]);
    } catch (err) {
      setFailure(err);
    }
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    let result = null;
    try {
      const r = await apiMutate(exercise ? 'library.exercise.machine.save' : 'library.machine.save', {
        ...(exercise ? { exerciseId: saved.exerciseId } : {}), uid: saved.uid || undefined, name, setup, kind, originalName, brand, muscleGroups, setupOk, weightStep,
        setupFields: setupFields.map((f) => f.trim()).filter(Boolean),
        setupMeta: meta,
        ...(dropped.length ? { removePhotoUrls: dropped } : {}),
      });
      result = exercise ? r.exercise : { ...r.machine, uid: r.uid };
      setPersisted(result);
      setSaved({ exerciseId: exercise ? r.exercise.id : 0, uid: r.uid });
      setDropped([]);
      // Новые — по одному, по порядку; загруженное уходит из очереди
      for (const a of added) {
        await uploadMachinePhoto(exercise ? r.exercise.id : null, r.uid, a.blob);
        setAdded((v) => v.filter((x) => x !== a));
      }
      haptic('success');
      onDone(result);
    } catch (err) {
      setFailure(result ? new Error('Сохранено, а фото загрузилось не всё: ' + err.message) : err);
    } finally {
      setBusy(false);
    }
  };

  const word = kind === 'equipment' ? 'оборудование' : 'тренажёр';
  // Карточка с фото и настройкой пропадает насовсем — вопрос на месте,
  // красная кнопка и «Отмена», а не системное окно window.confirm (аудит 24.10.2026)
  const question = exercise
    ? `Убрать «${name || (machine && machine.name)}» из упражнения?`
    : `Удалить «${name || (machine && machine.name)}» из каталога и всех упражнений?`;
  const remove = async () => {
    if (!saved.uid) return;
    setBusy(true);
    try {
      const r = await apiMutate(exercise ? 'library.exercise.machine.delete' : 'library.machine.delete', {
        ...(exercise ? { exerciseId: saved.exerciseId } : {}), uid: saved.uid,
      });
      haptic('success');
      onDone(exercise ? r.exercise : null);
    } catch (err) {
      setFailure(err);
      setBusy(false);
      setAsking(false);
    }
  };

  const touch = typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  return (
    <div className={'library__form library__machine-form' + (library ? ' mlib-editor' : '')}>
      {library && <>
        <div className="mlib-etop"><button type="button" disabled={busy} onClick={cancel}>Отмена</button><b>{kind === 'equipment' ? 'Оборудование' : 'Тренажёр'}{dirty && <span className="mlib-dirty" aria-label="Есть несохранённые изменения" />}</b><button type="button" disabled={busy || name.trim().length < 2} onClick={save}>{busy ? 'Сохраняем…' : 'Сохранить'}</button></div>
        <textarea rows={1} ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 2 + 'px'; } }} className="mlib-ename" aria-label="Название тренажёра" value={name} maxLength={80} placeholder="Название тренажёра" onChange={e => setName(e.target.value)} />
        <section className="mlib-characteristics"><div className="mlib-blockhead"><b>Характеристики</b><button type="button" onClick={()=>setPassport(true)}>Изменить</button></div><div className="mlib-pass">{[muscleGroups.join(', ') || 'Мышцы', kind === 'equipment' ? 'Оборудование' : 'Тренажёр', brand || 'Бренд', ...(kind === 'machine' ? [weightStep ? weightStep + ' кг' : 'Шаг веса'] : [])].map((text, i) => <button type="button" key={i} className="mlib-pchip" onClick={() => setPassport(true)}>{text}</button>)}</div>
        <button type="button" className="mlib-model" onClick={() => setPassport(true)}>{originalName || 'Модель не указана'}</button></section>
      </>}
      {(!library || passport) && <SheetOrInline library={library} onClose={() => setPassport(false)}>
      <div className="field">
        <span className="field__label">Что это</span>
        <Segmented label="Что это" items={MACHINE_KIND_ITEMS} value={kind} onChange={setKind} />
      </div>
      {!library && <label className="field">
        <span className="field__label">Название для клиента</span>
        <input className="field__input" value={name} maxLength={80} autoFocus={!machine}
          onChange={(ev) => setName(ev.target.value)} placeholder={kind === 'equipment' ? 'Гантели, фитбол, степ-платформа…' : 'Hammer у окна, Technogym…'} />
      </label>}
      <label className="field"><span className="field__label">Оригинальное название модели</span><input className="field__input" value={originalName} maxLength={120} onChange={(e) => setOriginalName(e.target.value)} /></label>
      <label className="field"><span className="field__label">Производитель / бренд</span><input className="field__input" value={brand} maxLength={120} onChange={(e) => setBrand(e.target.value)} /></label>
      {kind === 'machine' && <label className="field">
        <span className="field__label">Шаг веса, кг</span>
        <input className="field__input" inputMode="decimal" value={weightStep} maxLength={5} placeholder="например, 5"
          onChange={(e) => setWeightStep(e.target.value.replace(/[^\d.,]/g, ''))} />
        <span className="small muted">Сколько весит одна плитка. На столько приложение прибавляет вес после «Легко» и до него округляет. Пусто — по группе мышц.</span>
      </label>}
      <fieldset className="field"><legend className="field__label">Мышечные группы</legend>
        {['Грудь', 'Спина', 'Ноги', 'Ягодицы', 'Плечи', 'Руки', 'Предплечье', 'Пресс', 'Всё тело', 'Кардио'].map((g) => <label className="library__check" key={g}><input type="checkbox" checked={muscleGroups.includes(g)} onChange={(e) => setMuscleGroups(e.target.checked ? [...muscleGroups, g] : muscleGroups.filter((x) => x !== g))} />{g}</label>)}
      </fieldset>
      </SheetOrInline>}
      {machine && !library && <p className="small muted">Инструкция изменится во всех упражнениях с этой карточкой оборудования.</p>}
      <div className="field">
        <span className="field__label">Фото{library && <button className="mlib-help" type="button" aria-label="О фотографиях" onClick={()=>setHelp('Первое фото — главное. Снимайте без людей в кадре. Номера шагов можно поставить и переместить на главном фото.')}>?</button>}{total ? ' · ' + total + ' из ' + MAX_MACHINE_PHOTOS : ''}</span>
        {total > 0 && (
          <div className="library__photos">
            {kept.map((u) => (
              <div key={u} className="library__photo">
                {library && u === kept[0] ? <div id="mlib-primary-photo" /> : <img src={mediaUrl(u)} alt="" loading="lazy" />}
                <button type="button" className="library__photo-x" aria-label="Убрать фото" onClick={() => setDropped((v) => [...v, u])}><IconClose size={14} /></button>
              </div>
            ))}
            {added.map((a) => (
              <div key={a.url} className="library__photo">
                {library && !kept.length && a === added[0] ? <div id="mlib-primary-photo" /> : <img src={a.url} alt="" />}
                <button type="button" className="library__photo-x" aria-label="Убрать фото" onClick={() => setAdded((v) => v.filter((x) => x !== a))}><IconClose size={14} /></button>
              </div>
            ))}
          </div>
        )}
        {total < MAX_MACHINE_PHOTOS && (
          <div className="library__machine-actions">
            {/* Камера — отдельной кнопкой (08.10.2026): без capture Android
                открывал только галерею, снять тренажёр было нечем */}
            {touch && (
              <label className="button button--ghost">
                Сфотографировать
                <input type="file" accept="image/*" capture="environment" hidden onChange={pick} />
              </label>
            )}
            <label className="button button--ghost">
              {touch ? 'Из галереи' : total ? 'Ещё фото' : 'Выбрать фото'}
              <input type="file" accept="image/*" multiple hidden onChange={pick} />
            </label>
          </div>
        )}
        {!library && <span className="field__hint">Первое фото — главное. Снимайте без людей в кадре — фото увидят клиенты.</span>}
      </div>
      <div className="field">
        <span className="field__label">{library ? 'Шаги настройки' : 'Как настроить'}{library && <button type="button" className="mlib-help" aria-label="О шагах настройки" onClick={()=>setHelp('Подпись — название регулировки. Главное видно сразу, подробности раскрываются клиентом. Стикер и номер фото сохраняются у шага.')}>?</button>}</span>
        <SetupStepsEditor library={library} value={setup} meta={meta} kind={kind} name={name}
          photo={kept.length ? mediaUrl(kept[0]) : added.length ? added[0].url : ''}
          onChange={(text, m) => { setSetup(text); setMeta(m); }} />
        {!library && <span className="field__hint">Без цифр в тексте: настройка у каждого клиента своя — её записывают в занятии. Стикер подбирается по подписи сам, если не выбрать.</span>}
      </div>

      <fieldset className="field library__setup-fields">
        <legend className="field__label">{library ? 'Регулировки клиента' : 'Регулировки'}{library && <button type="button" className="mlib-help" aria-label="О регулировках клиента" onClick={()=>setHelp('Здесь только названия общих полей. Значения каждый клиент записывает в занятии; личные значения не меняют карточку оборудования.')}>?</button>}</legend>
        {setupFields.map((f, i) => (
          <div className="library__setup-field" key={i}>
            <input className="field__input" value={f} maxLength={40} placeholder="Сиденье, спинка, высота блока…" autoFocus={!f}
              aria-label={'Регулировка ' + (i + 1)} onChange={(e) => setSetupFields((v) => v.map((x, k) => (k === i ? e.target.value : x)))} />
            <button type="button" className="library__setup-field-x" aria-label={'Убрать регулировку ' + (f || i + 1)}
              onClick={() => setSetupFields((v) => v.filter((_, k) => k !== i))}><IconClose size={14} /></button>
          </div>
        ))}
        {setupFields.length < 12 && <button type="button" className="button button--ghost" onClick={() => setSetupFields((v) => [...v, ''])}>+ Регулировка</button>}
        {!library && <span className="field__hint">Что клиент выставляет на тренажёре: сиденье, спинка, высота блока. Цифры у каждого свои — их вписывают в занятии, текстом или числом. Клиент может добавить и свою регулировку — она только у него.</span>}
      </fieldset>
      {library && <div id="mlib-preview-action" />}
      {help && <Sheet title="Справка" onClose={()=>setHelp('')}>{help}</Sheet>}
      {failure && <Note tone="critical" icon={IconAlert}>{failure.message}</Note>}
      {library && leaving && <Sheet title="Выйти без сохранения?" onClose={() => setLeaving(false)}><p>Изменения карточки ещё не сохранены.</p><button type="button" className="button button--primary button--block" onClick={() => setLeaving(false)}>Продолжить редактирование</button><button type="button" className="button button--ghost button--block" onClick={() => onDone(persisted)}>Выйти без сохранения</button></Sheet>}
      {!library && (asking ? (
        <Confirm
          text={question}
          action={exercise ? 'Убрать' : 'Удалить'}
          busy={busy}
          onConfirm={remove}
          onCancel={() => setAsking(false)}
        />
      ) : (
        <div className="library__actions">
          <button type="button" className="button" disabled={busy || name.trim().length < 2} onClick={save}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>
          <button type="button" className="button button--ghost" disabled={busy} onClick={() => onDone(null)}>Отмена</button>
          {saved.uid && canDelete && <button type="button" className="button button--ghost danger" disabled={busy} onClick={() => setAsking(true)}>{exercise ? 'Убрать ' + word : 'Удалить из каталога'}</button>}
        </div>
      ))}
    </div>
  );
}

function SheetOrInline({ library, onClose, children }) {
  return library ? <Sheet title="Характеристики" className="mlib-sheet" onClose={onClose}>{children}<button type="button" className="button button--primary button--block" onClick={onClose}>Готово</button></Sheet> : <>{children}</>;
}

const MAX_MACHINE_PHOTOS = 6;

const normName = (v) => String(v || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

function MachinePicker({ exercise, attached, onDone }) {
  const { loading, data, error, reload } = useData('library.machines', {}, []);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');
  const [failure, setFailure] = useState(null);
  const used = new Set((attached || []).map((m) => m.uid));
  const list = (data && data.machines || []).filter((m) => !used.has(m.uid) && (!normName(q) || normName(m.name).includes(normName(q))));

  const attach = async (m) => {
    setBusy(m.uid);
    setFailure(null);
    try {
      const r = await apiMutate('library.exercise.machine.attach', { exerciseId: exercise.id, uid: m.uid });
      haptic('success');
      onDone(r.exercise);
    } catch (err) {
      setFailure(err);
      setBusy('');
    }
  };

  return (
    <div className="library__form">
      <label className="field">
        <span className="field__label">Найти в каталоге</span>
        <input className="field__input" value={q} onChange={(ev) => setQ(ev.target.value)} placeholder="Гантели, скамья, гриф…" />
      </label>
      {loading && <Loading lead={false} rows={3} />}
      {error && <Note tone="critical" icon={IconAlert}>{error.message}<button type="button" className="button button--ghost" onClick={reload}>Повторить</button></Note>}
      {!loading && !error && !list.length && <p className="small muted">Ничего не нашлось. Создайте новый рядом.</p>}
      {list.slice(0, 50).map((m) => (
        <button type="button" key={m.uid} className="item" disabled={!!busy} onClick={() => attach(m)}>
          <span className="item__name">{m.name}</span>
          <span className="item__meta">{m.kind === 'equipment' ? 'Оборудование' : 'Тренажёр'}{m.uses.length ? ' · ещё в ' + m.uses.length : ''}</span>
        </button>
      ))}
      {failure && <Note tone="critical" icon={IconAlert}>{failure.message}</Note>}
    </div>
  );
}

/**
 * Замены упражнения (07.10.2026, FT-479): тренажёр занят — клиент в
 * занятии одним касанием меняет упражнение на одно из этих. У общего
 * упражнения в общей базе — замены тоже из общей базы
 */
export function AlternativesEditor({ exercise, owner, all, onChanged, onOpen = null, compact = false }) {
  const e = exercise;
  const alts = e.alternatives || [];
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  useEffect(() => { setAdding(false); setQ(''); setFailure(null); }, [e.id]);
  // Открыли поиск — он на экран, не под нижнее меню (FT-595)
  const formRef = useReveal(adding ? 'form' : null);

  const save = async (ids) => {
    setBusy(true);
    setFailure(null);
    try {
      const r = await apiMutate('library.exercise.alternatives', { exerciseId: e.id, ids });
      haptic('success');
      setQ('');
      onChanged(r.exercise);
    } catch (err) {
      setFailure(err);
    } finally {
      setBusy(false);
    }
  };

  const key = (t) => String(t || '').toLowerCase().replace(/ё/g, 'е');
  const commonOnly = e.common && owner;
  const found = q.trim().length < 2 ? [] : (all || [])
    .filter((x) => x.id !== e.id && !alts.some((a) => a.id === x.id) && (!commonOnly || x.common))
    .filter((x) => key(x.name).includes(key(q.trim())))
    .slice(0, 8);

  if (compact) {
    return (
      <div className="ab-sec">
        <HelpLabel title="Замены" help={alts.length ? ALTS_HELP + ' ' + extrasHint(e, owner) : ALTS_HELP} />
        <div className="ab-alts">
          {alts.map((a) => (
            <span key={a.id} className="alt-chip">
              {onOpen
                ? <button type="button" className="alt-chip__name" onClick={() => { haptic(); onOpen(a.id); }}>{a.name}</button>
                : <span className="alt-chip__name">{a.name}</span>}
              <button type="button" className="alt-chip__x" disabled={busy} aria-label={`Убрать замену «${a.name}»`}
                onClick={() => save(alts.filter((x) => x.id !== a.id).map((x) => x.id))}>×</button>
            </span>
          ))}
          {!adding && alts.length < 6 && <button type="button" className="ab-pill" onClick={() => { haptic(); setAdding(true); }}><IconPlus size={16} />Замена</button>}
        </div>
        {adding && (
          <div className="library__form" ref={formRef}>
            <Search value={q} onChange={setQ} placeholder="Найти упражнение" />
            {found.map((x) => (
              <button key={x.id} type="button" className="button button--ghost library__alt-pick" disabled={busy}
                onClick={() => save([...alts.map((a) => a.id), x.id])}>{x.name}</button>
            ))}
            {q.trim().length >= 2 && !found.length && <p className="small muted">Не нашлось.{commonOnly ? ' В общей базе — только общие упражнения.' : ''}</p>}
            <button type="button" className="button button--ghost" onClick={() => { setAdding(false); setQ(''); }}>Готово</button>
          </div>
        )}
        {failure && <Note tone="critical" icon={IconAlert}>{failure.message}</Note>}
      </div>
    );
  }

  return (
    <div className="library__extras">
      <h3 className="setup__title">Замены упражнения</h3>
      <p className="small muted">
        {alts.length ? extrasHint(e, owner) : 'Чем заменить, если тренажёр занят или упражнение не подходит: клиент поменяет его в занятии одним касанием, а вес подтянется с прошлого раза. Связь работает в обе стороны.'}
      </p>
      {alts.length > 0 && (
        <div className="alt-chips">
          {/* Касание названия — к карточке замены, убирает только крестик (владелец, 18.10.2026) */}
          {alts.map((a) => (
            <span key={a.id} className="alt-chip">
              {onOpen
                ? <button type="button" className="alt-chip__name" onClick={() => { haptic(); onOpen(a.id); }}>{a.name}</button>
                : <span className="alt-chip__name">{a.name}</span>}
              <button type="button" className="alt-chip__x" disabled={busy} aria-label={`Убрать замену «${a.name}»`}
                onClick={() => save(alts.filter((x) => x.id !== a.id).map((x) => x.id))}>×</button>
            </span>
          ))}
        </div>
      )}
      {adding ? (
        <div className="library__form" ref={formRef}>
          <Search value={q} onChange={setQ} placeholder="Найти упражнение" />
          {found.map((x) => (
            <button key={x.id} type="button" className="button button--ghost library__alt-pick" disabled={busy}
              onClick={() => save([...alts.map((a) => a.id), x.id])}>{x.name}</button>
          ))}
          {q.trim().length >= 2 && !found.length && <p className="small muted">Не нашлось.{commonOnly ? ' В общей базе — только общие упражнения.' : ''}</p>}
          <button type="button" className="button button--ghost" onClick={() => { setAdding(false); setQ(''); }}>Готово</button>
        </div>
      ) : alts.length < 6 && (
        <button type="button" className="button button--ghost" onClick={() => setAdding(true)}>+ Замена</button>
      )}
      {failure && <Note tone="critical" icon={IconAlert}>{failure.message}</Note>}
    </div>
  );
}

/**
 * Тренажёры упражнения по его id или названию — для строки программы,
 * шаблона или занятия. Список берётся из базы тренера: у общего с своей
 * версией показывается своя (сервер, exercisesList), поэтому ищем и по
 * названию. onChanged(saved) — сохранено; saved.id может быть новым, если
 * первая правка общего создала свою версию.
 */
export function ExerciseMachines({ exerciseId, name, onChanged, compact = false }) {
  const { data, error, reload } = useData('library.exercises', {}, []);
  if (error) return <Note tone="critical" icon={IconAlert}>{error.message}</Note>;
  // Заглушка той же высоты, что разделы, — приехавшие не двигают лист
  if (!data && compact) {
    return <div aria-busy="true">
      <div className="ab-sec"><div className="ab-lab">Тренажёры</div><div className="skeleton ab-skel-eq" /></div>
      <div className="ab-sec"><div className="ab-lab">Замены</div><div className="skeleton ab-skel-alt" /></div>
    </div>;
  }
  if (!data) return <Loading lead={false} rows={1} />;
  const all = data.exercises || [];
  const key = normName(name);
  const e = (exerciseId && all.find((x) => x.id === Number(exerciseId)))
    || (key && all.find((x) => normName(x.name) === key))
    || null;
  if (!e && compact) {
    return <div className="ab-sec"><div className="ab-lab">Тренажёры и замены</div><p className="ab-tip">Появятся, когда упражнение будет из базы: выберите его из списка упражнений.</p></div>;
  }
  if (!e) {
    return <p className="small muted">Тренажёр прикрепляется к упражнению из базы. Выберите упражнение из списка — потом добавьте к нему тренажёр или оборудование.</p>;
  }
  const changed = (saved) => { reload(); if (onChanged) onChanged(saved); };
  return <>
    <MachinesEditor exercise={e} owner={!!data.owner} onChanged={changed} compact={compact} />
    {/* Замены (владелец, 16.10.2026): прикрепляются там же, где тренажёры, —
        в программе, шаблоне и занятии, а не только в базе упражнений */}
    <AlternativesEditor exercise={e} owner={!!data.owner} all={all} onChanged={changed} compact={compact} />
  </>;
}
