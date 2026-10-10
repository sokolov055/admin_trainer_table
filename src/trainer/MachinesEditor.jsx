import React, { useEffect, useState } from 'react';
import { apiMutate } from '../api.js';
import { haptic } from '../telegram.js';
import { useData } from '../useData.js';
import { shrinkPhoto, uploadMachinePhoto, mediaUrl } from '../library.js';
import { Segmented, Note } from '../ui.jsx';
import { IconAlert, IconClose } from '../icons.jsx';

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
 * цифры у каждого клиента свои — сервер, lib/machine-notes.js). Клиент в
 * занятии выбирает, на каком делает, и вес у каждого тренажёра свой.
 * Общее упражнение правит владелец сервиса прямо в базе; другой тренер —
 * в своей версии (сервер создаёт её при первой правке).
 */
export function MachinesEditor({ exercise, owner, onChanged }) {
  const e = exercise;
  const machines = e.machines || [];
  const [editing, setEditing] = useState(null);
  const [failure, setFailure] = useState(null);
  useEffect(() => { setEditing(null); setFailure(null); }, [e.id]);

  const done = (saved) => { setEditing(null); if (saved) onChanged(saved); };
  const first = async (m) => {
    setFailure(null);
    try {
      const r = await apiMutate('library.exercise.machine.move', { exerciseId: e.id, uids: [m.uid] });
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
        {machines.length ? extrasHint(e, owner) : 'Если в залах стоят разные тренажёры для этого упражнения — добавьте каждый: фото и где у него регулировки. Вес и настройка (спинка, сиденье) у каждого клиента на каждом тренажёре свои — их записывают в занятии.'}
      </p>
      {machines.map((m, i) => (editing === m.uid
        ? <MachineForm key={m.uid} exercise={e} machine={m} onDone={done} />
        : (
          <div key={m.uid} className="library__machine">
            {m.photo ? <img className="machines__thumb" src={mediaUrl(m.photo)} alt="" loading="lazy" /> : <span className="machines__thumb machines__thumb--empty" aria-hidden="true" />}
            <div className="library__machine-text">
              <strong>{m.name}</strong>
              <span className="small muted">{m.kind === 'equipment' ? 'Оборудование' : 'Тренажёр'}{(m.photos || []).length > 1 ? ' · ' + m.photos.length + ' фото' : ''}</span>
              <span className="small muted">{m.setup ? m.setup.split('\n')[0] : 'Регулировки не описаны — клиент увидит общий принцип.'}</span>
            </div>
            <div className="library__machine-actions">
              {i > 0 && <button type="button" className="button button--ghost" onClick={() => first(m)}>Первым</button>}
              <button type="button" className="button button--ghost" onClick={() => setEditing(m.uid)}>Изменить</button>
            </div>
          </div>
        )))}
      {editing === 'new'
        ? <MachineForm exercise={e} machine={null} onDone={done} />
        : machines.length < 8 && !editing && (
          <button type="button" className="button button--ghost" onClick={() => setEditing('new')}>+ Тренажёр или оборудование</button>
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
export function MachineForm({ exercise, machine, onDone }) {
  const [name, setName] = useState(machine ? machine.name : '');
  const [setup, setSetup] = useState(machine ? machine.setup : '');
  // Тренажёр или оборудование (владелец, 09.10.2026)
  const [kind, setKind] = useState(machine && machine.kind === 'equipment' ? 'equipment' : 'machine');
  // Фото несколько (09.10.2026): уже сохранённые — убранные удаляются только
  // по «Сохранить» — и новые, ещё не загруженные
  const had = machine ? (machine.photos && machine.photos.length ? machine.photos : machine.photo ? [machine.photo] : []) : [];
  const [dropped, setDropped] = useState([]);
  const [added, setAdded] = useState([]); // [{ blob, url }]
  const [saved, setSaved] = useState({ exerciseId: exercise.id, uid: machine ? machine.uid : '' });
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
      const r = await apiMutate('library.exercise.machine.save', {
        exerciseId: saved.exerciseId, uid: saved.uid || undefined, name, setup, kind,
        ...(dropped.length ? { removePhotoUrls: dropped } : {}),
      });
      result = r.exercise;
      setSaved({ exerciseId: r.exercise.id, uid: r.uid });
      setDropped([]);
      // Новые — по одному, по порядку; загруженное уходит из очереди
      for (const a of added) {
        await uploadMachinePhoto(r.exercise.id, r.uid, a.blob);
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
    if (!saved.uid || !window.confirm(`Убрать «${name || machine.name}»?`)) return;
    setBusy(true);
    try {
      const r = await apiMutate('library.exercise.machine.delete', { exerciseId: saved.exerciseId, uid: saved.uid });
      haptic('success');
      onDone(r.exercise);
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
        <span className="field__label">Название</span>
        <input className="field__input" value={name} maxLength={80} autoFocus={!machine}
          onChange={(ev) => setName(ev.target.value)} placeholder={kind === 'equipment' ? 'Гантели, фитбол, степ-платформа…' : 'Hammer у окна, Technogym…'} />
      </label>
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
          onChange={(ev) => setSetup(ev.target.value)}
          placeholder={kind === 'equipment' ? 'Где лежит, что взять для разминки…' : 'Спинка — рычаг справа под сиденьем.\nВалик — кнопка слева, тянуть на себя.'} />
        <span className="field__hint">Без цифр: настройка у каждого клиента своя — её записывают в занятии. Шаг — строка.</span>
      </label>
      {failure && <Note tone="critical" icon={IconAlert}>{failure.message}</Note>}
      <div className="library__actions">
        <button type="button" className="button" disabled={busy || name.trim().length < 2} onClick={save}>{busy ? 'Сохраняю…' : 'Сохранить'}</button>
        <button type="button" className="button button--ghost" disabled={busy} onClick={() => onDone(null)}>Отмена</button>
        {saved.uid && <button type="button" className="button button--ghost danger" disabled={busy} onClick={remove}>Убрать {word}</button>}
      </div>
    </div>
  );
}

const MAX_MACHINE_PHOTOS = 6;

const normName = (v) => String(v || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

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
  return <MachinesEditor exercise={e} owner={!!data.owner} onChanged={(saved) => { reload(); if (onChanged) onChanged(saved); }} />;
}
