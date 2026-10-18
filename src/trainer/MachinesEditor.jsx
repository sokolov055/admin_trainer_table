import { primaryEquipment } from '../equipment-guidance.js';
import React, { useEffect, useState } from 'react';
import { apiMutate } from '../api.js';
import { haptic } from '../telegram.js';
import { useData } from '../useData.js';
import { shrinkPhoto, uploadMachinePhoto, mediaUrl } from '../library.js';
import { Segmented, Note, Search } from '../ui.jsx';
import { IconAlert, IconClose } from '../icons.jsx';
import { useReveal } from '../reveal.js';

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
 * Тренажёры упражнения (07.10.2026, FT-478): в разных залах жим ногами
 * стоит разный — у каждого название, фото и где регулировки (без цифр:
 * цифры у каждого клиента свои — сервер, lib/machine-notes.js). С
 * 16.10.2026 (владелец) это не выбор, а то, на чём делают: тренер один раз
 * привязывает тренажёр или набор (штанга, гриф, скамья), клиент видит
 * именно его и ничего не выбирает; первый — по нему ведётся вес.
 * Общее упражнение правит владелец сервиса прямо в базе; другой тренер —
 * в своей версии (сервер создаёт её при первой правке).
 */
export function MachinesEditor({ exercise, owner, onChanged }) {
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
export function MachineForm({ exercise = null, machine, onDone, canDelete = true }) {
  const [name, setName] = useState(machine ? machine.name : '');
  const [setup, setSetup] = useState(machine ? machine.setup : '');
  const [originalName, setOriginalName] = useState(machine?.originalName || '');
  const [brand, setBrand] = useState(machine?.brand || '');
  const [muscleGroups, setMuscleGroups] = useState(machine?.muscleGroups || []);
  const [setupOk, setSetupOk] = useState(machine?.setupOk !== false && !!machine?.setup);
  // Тренажёр или оборудование (владелец, 09.10.2026)
  const [kind, setKind] = useState(machine && machine.kind === 'equipment' ? 'equipment' : 'machine');
  // Фото несколько (09.10.2026): уже сохранённые — убранные удаляются только
  // по «Сохранить» — и новые, ещё не загруженные
  const had = machine ? (machine.photos && machine.photos.length ? machine.photos : machine.photo ? [machine.photo] : []) : [];
  const [dropped, setDropped] = useState([]);
  const [added, setAdded] = useState([]); // [{ blob, url }]
  const [saved, setSaved] = useState({ exerciseId: exercise ? exercise.id : 0, uid: machine ? machine.uid : '' });
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);

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
    setBusy(true);
    setFailure(null);
    let result = null;
    try {
      const r = await apiMutate(exercise ? 'library.exercise.machine.save' : 'library.machine.save', {
        ...(exercise ? { exerciseId: saved.exerciseId } : {}), uid: saved.uid || undefined, name, setup, kind, originalName, brand, muscleGroups, setupOk,
        ...(dropped.length ? { removePhotoUrls: dropped } : {}),
      });
      result = exercise ? r.exercise : r.machine;
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
  const remove = async () => {
    const question = exercise
      ? `Убрать «${name || machine.name}» из упражнения?`
      : `Удалить «${name || machine.name}» из каталога и всех упражнений?`;
    if (!saved.uid || !window.confirm(question)) return;
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
    }
  };

  const touch = typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  return (
    <div className="library__form library__machine-form">
      <div className="field">
        <span className="field__label">Что это</span>
        <Segmented label="Что это" items={MACHINE_KIND_ITEMS} value={kind} onChange={setKind} />
      </div>
      <label className="field">
        <span className="field__label">Клиентское название</span>
        <input className="field__input" value={name} maxLength={80} autoFocus={!machine}
          onChange={(ev) => setName(ev.target.value)} placeholder={kind === 'equipment' ? 'Гантели, фитбол, степ-платформа…' : 'Hammer у окна, Technogym…'} />
      </label>
      <label className="field"><span className="field__label">Оригинальное название модели</span><input className="field__input" value={originalName} maxLength={120} onChange={(e) => setOriginalName(e.target.value)} /></label>
      <label className="field"><span className="field__label">Производитель / бренд</span><input className="field__input" value={brand} maxLength={120} onChange={(e) => setBrand(e.target.value)} /></label>
      <fieldset className="field"><legend className="field__label">Мышечные группы</legend>
        {['Грудь', 'Спина', 'Ноги', 'Ягодицы', 'Плечи', 'Руки', 'Предплечье', 'Пресс', 'Всё тело', 'Кардио'].map((g) => <label className="library__check" key={g}><input type="checkbox" checked={muscleGroups.includes(g)} onChange={(e) => setMuscleGroups(e.target.checked ? [...muscleGroups, g] : muscleGroups.filter((x) => x !== g))} />{g}</label>)}
      </fieldset>
      {machine && <p className="small muted">Инструкция изменится во всех упражнениях с этой карточкой оборудования.</p>}
      <div className="field">
        <span className="field__label">Фото{total ? ' · ' + total + ' из ' + MAX_MACHINE_PHOTOS : ''}</span>
        {total > 0 && (
          <div className="library__photos">
            {kept.map((u) => (
              <div key={u} className="library__photo">
                <img src={mediaUrl(u)} alt="" loading="lazy" />
                <button type="button" className="library__photo-x" aria-label="Убрать фото" onClick={() => setDropped((v) => [...v, u])}><IconClose size={14} /></button>
              </div>
            ))}
            {added.map((a) => (
              <div key={a.url} className="library__photo">
                <img src={a.url} alt="" />
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
        <span className="field__hint">Первое фото — главное. Снимайте без людей в кадре — фото увидят клиенты.</span>
      </div>
      <label className="field">
        <span className="field__label">Настройка</span>
        <textarea className="field__input library__textarea" value={setup} maxLength={1500} rows={4}
          onChange={(ev) => { setSetup(ev.target.value); setSetupOk(false); }}
          placeholder={kind === 'equipment' ? 'Где лежит, что взять для разминки…' : 'Спинка — рычаг справа под сиденьем.\nВалик — кнопка слева, тянуть на себя.'} />
        <span className="field__hint">Без цифр: настройка у каждого клиента своя — её записывают в занятии. Шаг — строка.</span>
      </label>
      <label className="library__check"><input type="checkbox" checked={setupOk} disabled={!setup.trim()} onChange={(e) => setSetupOk(e.target.checked)} />Инструкция оборудования проверена</label>
      {failure && <Note tone="critical" icon={IconAlert}>{failure.message}</Note>}
      <div className="library__actions">
        <button type="button" className="button" disabled={busy || name.trim().length < 2} onClick={save}>{busy ? 'Сохраняю…' : 'Сохранить'}</button>
        <button type="button" className="button button--ghost" disabled={busy} onClick={() => onDone(null)}>Отмена</button>
        {saved.uid && canDelete && <button type="button" className="button button--ghost danger" disabled={busy} onClick={remove}>{exercise ? 'Убрать ' + word : 'Удалить из каталога'}</button>}
      </div>
    </div>
  );
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
      {loading && <p className="small muted">Загружаю каталог…</p>}
      {error && <Note tone="critical" icon={IconAlert}>{error.message}<button type="button" className="button button--ghost" onClick={reload}>Повторить</button></Note>}
      {!loading && !error && !list.length && <p className="small muted">Подходящих объектов нет. Создайте новый рядом.</p>}
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
export function AlternativesEditor({ exercise, owner, all, onChanged }) {
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

  return (
    <div className="library__extras">
      <h3 className="setup__title">Замены упражнения</h3>
      <p className="small muted">
        {alts.length ? extrasHint(e, owner) : 'Чем заменить, если тренажёр занят или упражнение не подходит: клиент поменяет его в занятии одним касанием, а вес подтянется с прошлого раза. Связь работает в обе стороны.'}
      </p>
      {alts.length > 0 && (
        <div className="chips chips--flush chips--wrap">
          {alts.map((a) => (
            <button key={a.id} type="button" className="chip" disabled={busy} aria-label={`Убрать замену «${a.name}»`}
              onClick={() => save(alts.filter((x) => x.id !== a.id).map((x) => x.id))}>
              {a.name} ×
            </button>
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
export function ExerciseMachines({ exerciseId, name, onChanged }) {
  const { data, error, reload } = useData('library.exercises', {}, []);
  if (error) return <Note tone="critical" icon={IconAlert}>{error.message}</Note>;
  if (!data) return <p className="small muted">Загружаю тренажёры…</p>;
  const all = data.exercises || [];
  const key = normName(name);
  const e = (exerciseId && all.find((x) => x.id === Number(exerciseId)))
    || (key && all.find((x) => normName(x.name) === key))
    || null;
  if (!e) {
    return <p className="small muted">Тренажёр прикрепляется к упражнению из базы. Выберите упражнение из списка — потом добавьте к нему тренажёр или оборудование.</p>;
  }
  const changed = (saved) => { reload(); if (onChanged) onChanged(saved); };
  return <>
    <MachinesEditor exercise={e} owner={!!data.owner} onChanged={changed} />
    {/* Замены (владелец, 16.10.2026): прикрепляются там же, где тренажёры, —
        в программе, шаблоне и занятии, а не только в базе упражнений */}
    <AlternativesEditor exercise={e} owner={!!data.owner} all={all} onChanged={changed} />
  </>;
}
