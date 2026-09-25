import React, { useEffect, useRef, useState } from 'react';
import { apiPublic, apiMutate } from './api.js';
import { getInitData } from './telegram.js';
import { getToken } from './session.js';
import { blankSet, clock, fromPlan, summary, uid, setLabel } from './workout-model.js';
import { IconCheck, IconClose, IconLinkPair } from './icons.jsx';
import { useBackGesture } from './gestures.jsx';
import { useFlip } from './flip.js';
import { KIND_LABELS, MACHINE_LABELS, METRICS, trackOf, rowFields, missing, metricField, settingsFields } from './exercise-track.js';
import IntervalTimer from './IntervalTimer.jsx';
import './workout.css';

const labels = { active: 'Идёт', paused: 'На паузе', completed: 'Завершена', cancelled: 'Отменена' };

// Черновик изолирован по вошедшему пользователю и карточке клиента.
// Подпись Telegram меняется при запуске, поэтому из неё берём только id.
async function storageKey(clientRow) {
  const data = new URLSearchParams(getInitData());
  let identity = getToken();
  try { identity = JSON.parse(data.get('user')).id || identity; } catch (_) {}
  if (import.meta.env.VITE_MOCK === '1') identity = 'demo';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(identity)));
  return 'workout_draft_v1:' + Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('') + ':' + (clientRow || 'self');
}

/**
 * Подпись про суперсет.
 *
 * Группа приезжает из плана, но упражнения в занятии можно менять
 * местами и удалять, поэтому считаем по текущему списку: осталось одно —
 * подписи нет, «суперсет из одного» только собьёт.
 */
function supersetMark(exercises, index) {
  const group = exercises[index].supersetGroup;
  if (!group) return '';

  const same = exercises.filter(e => e.supersetGroup === group);
  if (same.length < 2) return '';

  return `Суперсет · ${same.indexOf(exercises[index]) + 1} из ${same.length}, без отдыха между упражнениями`;
}

export default function WorkoutJournal({ clientRow, clientView = false, launch, onClose }) {
  const [record, setRecord] = useState(null);
  const [history, setHistory] = useState([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [storageError, setStorageError] = useState(false);
  const [conflict, setConflict] = useState(null);
  const [confirm, setConfirm] = useState('');

  // id занятия, которое сейчас подтверждают к удалению. Отдельным
  // состоянием, а не флагом «показать диалог»: подтверждение обязано быть
  // привязано к конкретной строке, иначе список перерисуется и человек
  // подтвердит удаление не того занятия.
  const [erase, setErase] = useState('');
  const [undo, setUndo] = useState(null);
  // Разъединили или соединили суперсет — подходы перелетают на новые места
  const fieldsRef = useRef(null);
  const flip = useFlip(fieldsRef);
  const [now, setNow] = useState(Date.now());
  const state = useRef(null), key = useRef(''), saving = useRef(false), mounted = useRef(true);
  const conflictRef = useRef(null);
  const params = clientRow ? { clientRow } : {};

  const store = value => {
    state.current = value;
    if (mounted.current) setRecord(value);
    try {
      if (value) localStorage.setItem(key.current, JSON.stringify(value));
      else localStorage.removeItem(key.current);
      if (mounted.current) setStorageError(false);
    } catch (_) { if (mounted.current) setStorageError(true); }
  };
  const list = async () => {
    const result = await apiPublic('workout.list', params);
    if (mounted.current) setHistory(result.sessions);
    return result.sessions;
  };
  // Удаление записи журнала. Доступно только тренеру — у клиента этой
  // кнопки нет, и сервер откажет ему по роли.
  //
  // Отмена оставляет занятие в истории, и для несостоявшейся тренировки
  // это правильно. Но пробные и ошибочные записи копятся там же, а убрать
  // их можно было только руками в таблице.
  const remove = async id => {
    setBusy(true); setMessage('');
    try {
      await apiMutate('workout.delete', { ...params, id });
      setErase('');
      await list();
    } catch (e) { setMessage(e.message); }
    finally { setBusy(false); }
  };

  const open = async id => {
    setBusy(true); setMessage('');
    try {
      const result = await apiPublic('workout.get', { ...params, id });
      store({ session: result.session, revision: result.session.revision, dirty: false, tick: Date.now() });
    } catch (e) { setMessage(e.message); }
    finally { setBusy(false); }
  };
  const freshRecord = session => ({ session, revision: 0, dirty: true, tick: Date.now(), edit: 1 });

  useEffect(() => {
    mounted.current = true;
    let alive = true;
    (async () => {
      key.current = await storageKey(clientRow);
      let draft = null;
      try { draft = JSON.parse(localStorage.getItem(key.current)); } catch (_) { setStorageError(true); }
      if (!alive) return;
      if (draft && draft.session) store(draft);
      try {
        const sessions = await list();
        if (!alive) return;
        // Занятие, которое попросили открыть с экрана программы («Посмотреть
        // веса»). Оно важнее незакрытого: человек нажал на конкретную
        // проведённую тренировку. Несохранённый черновик всё равно
        // побеждает — его негде взять заново.
        const wanted = launch && launch.sessionId;
        const starting = !!(launch && launch.block);

        // Черновик ЗАВЕРШЁННОГО занятия — это след, а не работа. Он
        // остаётся в хранилище, если экран закрыли, не нажав «К журналу»,
        // и до сих пор перехватывал запуск следующей тренировки: человек
        // жал «Начать» у второй, а открывалась первая, уже проведённая и
        // с чужими весами внутри.
        const finished = draft && draft.session
          && ['completed', 'cancelled'].includes(draft.session.status);

        if (draft && finished && starting && !draft.dirty) draft = null;

        if (draft && !draft.dirty) await open(wanted || draft.session.id);
        if (!draft) {
          const active = sessions.find(s => ['active', 'paused'].includes(s.status));
          if (wanted) await open(wanted);
          else if (active) await open(active.id);
          else if (launch && launch.block) store(freshRecord(fromPlan(launch.block, launch.month, launch.members || [])));
        }
      } catch (e) {
        if (alive) {
          setMessage('Нет связи с журналом. ' + e.message);
          if (!draft && launch && launch.block) store(freshRecord(fromPlan(launch.block, launch.month, launch.members || [])));
        }
      } finally { if (alive) setReady(true); }
    })();
    return () => { alive = false; mounted.current = false; };
  }, []);

  const change = transform => {
    const r = state.current;
    if (!r) return;
    const elapsed = r.session.status === 'active' ? Math.max(0, Date.now() - r.tick) : 0;
    const session = transform({ ...r.session, elapsedMs: Math.min(604800000, r.session.elapsedMs + elapsed) });
    store({ ...r, session, tick: Date.now(), dirty: true, edit: (r.edit || 0) + 1 });
    setMessage('');
  };

  const save = async () => {
    let r = state.current;
    if (!r || !r.dirty || saving.current || conflictRef.current || !key.current) return;
    saving.current = true; if (mounted.current) setBusy(true);
    // Повторяем ровно тот снимок, чей ответ потерялся. Новые нажатия
    // остаются в черновике и отправятся уже следующей версией.
    if (!r.pending) {
      const elapsed = r.session.status === 'active' ? Math.max(0, Date.now() - r.tick) : 0;
      r = { ...r, session: { ...r.session, elapsedMs: Math.min(604800000, r.session.elapsedMs + elapsed) }, tick: Date.now() };
      r.pending = { session: r.session, revision: r.revision, requestId: uid(), edit: r.edit };
      store(r);
    }
    try {
      const result = await apiMutate('workout.save', { ...params, ...r.pending });
      if (result.conflict || result.activeConflict) {
        conflictRef.current = result;
        if (mounted.current) setConflict(result);
        return;
      }
      let current = state.current;
      // Экран могли закрыть и открыть снова, пока Apps Script отвечал.
      // Старый экземпляр не должен затереть уже новый черновик на диске.
      if (!mounted.current) {
        try { current = JSON.parse(localStorage.getItem(key.current)); }
        catch (_) { return; }
      }
      if (!current || current.session.id !== r.session.id) return;
      const unchanged = current.edit === r.pending.edit;
      store({ ...current, session: unchanged ? result.session : {
        ...current.session, startedAt: result.session.startedAt, updatedAt: result.session.updatedAt,
      }, revision: result.session.revision, pending: null, dirty: !unchanged });
      if (mounted.current) { setMessage(''); list().catch(() => {}); }
    } catch (e) {
      // Явный отказ валидации позволяет исправить снимок. При потере
      // связи сохраняем прежний requestId: запись могла уже состояться.
      if (mounted.current && e.code && state.current?.session.id === r.session.id) store({ ...state.current, pending: null });
      if (mounted.current) setMessage('Не сохранено в облаке: ' + e.message + ' Черновик остаётся на устройстве.');
    } finally {
      saving.current = false; if (mounted.current) setBusy(false);
    }
  };

  useEffect(() => {
    if (!ready || !record?.dirty || busy || message || conflict) return;
    const timer = setTimeout(save, 1800);
    return () => clearTimeout(timer);
  }, [record, ready, busy, message, conflict]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    const online = () => { setMessage(''); save(); };
    const unload = e => { if (state.current?.dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('online', online);
    window.addEventListener('beforeunload', unload);
    return () => { clearInterval(interval); window.removeEventListener('online', online); window.removeEventListener('beforeunload', unload); };
  }, []);

  /**
   * Чужие изменения того же занятия.
   *
   * Занятие одно на двоих: клиент отмечает подходы, тренер смотрит в него
   * со своего телефона и правит вес. Поэтому экран не только пишет, но и
   * перечитывает — и делает это не только по таймеру.
   *
   * Возврат к приложению — главный момент: телефон убирают в карман между
   * подходами, и в свёрнутой вкладке опрос не идёт. Без этого тренер,
   * открыв приложение, до двадцати секунд смотрел на устаревшие цифры и
   * не мог понять, синхронизируется вообще что-нибудь или нет.
   *
   * Свой несохранённый черновик всегда важнее чужой версии: его негде
   * взять заново, а чужая доедет следующим чтением.
   */
  useEffect(() => {
    if (!ready) return;

    const refresh = async () => {
      const r = state.current;
      if (!r || r.dirty || saving.current || conflictRef.current || document.hidden) return;
      try {
        const result = await apiPublic('workout.get', { ...params, id: r.session.id });
        if (!mounted.current || state.current?.dirty || state.current?.session.id !== r.session.id) return;
        if (result.session.revision !== r.revision) store({ session: result.session, revision: result.session.revision, dirty: false, tick: Date.now() });
      } catch (_) { /* Сбой чтения не должен мешать записи локального подхода. */ }
    };

    const timer = setInterval(refresh, 20000);
    const listen = (target, event) => {
      if (target && target.addEventListener) target.addEventListener(event, refresh);
      return () => { if (target && target.removeEventListener) target.removeEventListener(event, refresh); };
    };

    const off = [
      listen(document, 'visibilitychange'),
      listen(window, 'focus'),
      listen(window, 'online'),
    ];

    return () => { clearInterval(timer); off.forEach(fn => fn()); };
  }, [ready]);

  /**
   * Запуск отдыха.
   *
   * Сохраняем НЕМЕДЛЕННО, не дожидаясь обычной задержки в полторы
   * секунды. Причина простая и обнаружилась на живом телефоне: отдых
   * начинается ровно тогда, когда человек убирает телефон в карман, —
   * страница засыпает, отложенное сохранение не срабатывает, и сервер
   * узнаёт время окончания только когда приложение снова открыли. Пуш
   * приходил с опозданием в минуту, а то и позже.
   */
  const startRest = (seconds) => {
    const length = seconds || (state.current && state.current.session.restSeconds);
    if (!length) return;

    change(v => ({ ...v, restUntil: Date.now() + length * 1000 }));
    save();
  };

  const updateExercise = (index, fn) => change(s => ({ ...s, exercises: s.exercises.map((e, i) => i === index ? fn(e) : e) }));
  const updateSet = (ei, si, fn) => updateExercise(ei, e => ({ ...e, sets: e.sets.map((s, i) => i === si ? fn(s) : s) }));
  const close = () => { if (state.current?.dirty) save(); onClose(); };

  // Смахнуть вправо — то же, что «Назад»: с сохранением незаписанного
  useBackGesture(close);
  const exportDraft = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(state.current, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'тренировка.json'; a.click(); URL.revokeObjectURL(url);
  };
  const useRemote = () => {
    // Перед разрешением конфликта сохраняем локальную копию отдельно.
    try { localStorage.setItem(key.current + ':backup:' + Date.now(), JSON.stringify(state.current)); }
    catch (_) { setMessage('Скачайте черновик перед загрузкой другой версии.'); return; }
    const remote = conflict.session;
    conflictRef.current = null; setConflict(null);
    store({ session: remote, revision: remote.revision, dirty: false, tick: Date.now() });
  };


  /**
   * Строка подхода: вес, повторы, отметка, настройки. Одна и та же в обычном
   * упражнении и в круге суперсета. restAfter — запускать ли отдых по
   * отметке: в суперсете отдыхают после круга, а не после каждого
   * упражнения.
   */
  const setRow = (ex, ei, si, label, restAfter = true, inRound = false) => {
    if (trackOf(ex).kind === 'cardio') return cardioSet(ex, ei, si, label, restAfter, inRound);
    const set = ex.sets[si];
    const track = trackOf(ex);
    const fields = rowFields(track);
    const edit = (key, value) => updateSet(ei, si, s => ({ ...s, [key]: value }));
    const drops = set.drops || [];
    const editDrop = (di, key, value) => updateSet(ei, si, s => ({ ...s, drops: s.drops.map((d, i) => (i === di ? { ...d, [key]: value } : d)) }));
    // Стороны разошлись: пишем обе, а в «повторы» — меньшее, по нему
    // сервер и проверяет, что подход сделан
    const side = (key, value) => updateSet(ei, si, s => {
      const next = { ...s, [key]: value };
      const l = Number(next.left), r = Number(next.right);
      if (l >= 1 && r >= 1) next.reps = String(Math.min(l, r));
      return next;
    });
    return <div className={'workout__set ' + (set.state === 'done' ? 'workout__set--done' : '')} key={si} data-flip={ex.id + ':' + si} data-flip-delay={si * 140}>
            <div className={'workout__set-row' + (set.who ? ' workout__set-row--who' : '')} style={{ '--cols': fields.length }}><span>{label}{set.kind === 'warmup' ? ' · Р' : ''}</span>
              {fields.map(f => (
                <input key={f.key} aria-label={`${ex.name}, подход ${si + 1}, ${f.key === 'weight' ? 'вес в кг' : f.key === 'reps' ? 'повторы' : f.head.toLowerCase()}`} inputMode={f.mode} placeholder={f.placeholder || ''} value={set[f.key] || ''} maxLength={f.max} onChange={e => edit(f.key, e.target.value)} />
              ))}
              <button className="workout__check" aria-label={`${ex.name}, подход ${si + 1}: ${set.state === 'done' ? 'снять отметку' : 'выполнен'}`} aria-pressed={set.state === 'done'} onClick={() => {
                const lack = set.state !== 'done' && missing(set, track);
                if (lack) { setMessage(lack); return; }
                const starting = set.state !== 'done';
                updateSet(ei, si, s => ({ ...s, state: s.state === 'done' ? 'pending' : 'done' }));
                // Отдых начинается там, где человек нажал, а не там, где
                // стоит переключатель: подход отмечен — время пошло.
                if (starting && restAfter) startRest();
              }}><IconCheck size={20} /></button>
            </div>
            {/* Дропсет: сбросы идут сразу за подходом, без отдыха, — поэтому
                они на виду, а не в настройках */}
            {drops.map((d, di) => (
              <div className="workout__set-row workout__drop" key={'d' + di} style={{ '--cols': 2 }}>
                <span>сброс</span>
                <input aria-label={`${ex.name}, подход ${si + 1}, сброс ${di + 1}, вес`} inputMode="decimal" placeholder="кг" maxLength={12} value={d.weight} onChange={e => editDrop(di, 'weight', e.target.value)} />
                <input aria-label={`${ex.name}, подход ${si + 1}, сброс ${di + 1}, повторы`} inputMode="numeric" placeholder="повт." maxLength={6} value={d.reps} onChange={e => editDrop(di, 'reps', e.target.value)} />
                <button type="button" className="workout__drop-remove" aria-label={`Убрать сброс ${di + 1}`} onClick={() => updateSet(ei, si, s => ({ ...s, drops: s.drops.filter((_, i) => i !== di) }))}><IconClose size={16} /></button>
              </div>
            ))}
            {drops.length > 0 && drops.length < 5 && (
              <button type="button" className="workout__drop-add" onClick={() => updateSet(ei, si, s => ({ ...s, drops: [...s.drops, { weight: '', reps: '' }] }))}>Ещё сброс</button>
            )}
            {track.unilateral && set.left !== undefined && (
              <div className="workout__set-row workout__drop" style={{ '--cols': 2 }}>
                <span>Л / П</span>
                <input aria-label={`${ex.name}, подход ${si + 1}, повторы левой`} inputMode="numeric" placeholder="левая" maxLength={6} value={set.left} onChange={e => side('left', e.target.value)} />
                <input aria-label={`${ex.name}, подход ${si + 1}, повторы правой`} inputMode="numeric" placeholder="правая" maxLength={6} value={set.right || ''} onChange={e => side('right', e.target.value)} />
                <button type="button" className="workout__drop-remove" aria-label="Стороны поровну" onClick={() => updateSet(ei, si, ({ left, right, ...s }) => s)}><IconClose size={16} /></button>
              </div>
            )}
            {/* В круге суперсета своих настроек у подхода нет — они общие,
                «Настройки круга» под кругом */}
            {!inRound && <details className="workout__set-options"><summary>{set.state === 'skipped' ? 'Пропущен · изменить' : 'Настройки подхода'}</summary>
              {setExtras(ex, ei, si)}
              <div className="workout__toolbar">
                <label>Тип<select value={set.kind} onChange={e => updateSet(ei, si, s => ({ ...s, kind: e.target.value }))}><option value="work">Рабочий</option><option value="warmup">Разминка</option></select></label>
                <label>RPE<input aria-label={`${ex.name}, подход ${si + 1}, RPE`} inputMode="decimal" placeholder="1–10" maxLength={4} value={set.rpe} onChange={e => updateSet(ei, si, s => ({ ...s, rpe: e.target.value }))} /></label>
                {setTools(ex, ei, si)}
                <button className="button" onClick={() => updateSet(ei, si, s => ({ ...s, state: s.state === 'skipped' ? 'pending' : 'skipped' }))}>{set.state === 'skipped' ? 'Вернуть' : 'Пропустить'}</button>
                <button className="button" disabled={ex.sets.length === 1} onClick={() => { setUndo(s.exercises); updateExercise(ei, ex => ({ ...ex, sets: ex.sets.filter((_, i) => i !== si) })); }}>Удалить подход</button>
              </div>
            </details>}
          </div>;
  };

  /**
   * Отрезок кардио: режим тренажёра и выбранные метрики — подписанными
   * полями сеткой, а не строкой колонок: полей бывает до шести, и в строку
   * телефона они не помещаются.
   */
  const cardioSet = (ex, ei, si, label, restAfter, inRound) => {
    const set = ex.sets[si];
    const track = trackOf(ex);
    const fields = [...settingsFields(track), ...track.metrics.map(m => metricField(m, track))];
    const edit = (key, value) => updateSet(ei, si, s => ({ ...s, [key]: value }));
    return <div className={'workout__set workout__set--cardio ' + (set.state === 'done' ? 'workout__set--done' : '')} key={si} data-flip={ex.id + ':' + si} data-flip-delay={si * 140}>
      <div className="workout__cardio-head">
        <span>{/^\d+$/.test(label) ? 'Отрезок ' + label : label}{set.kind === 'warmup' ? ' · разминка' : ''}</span>
        <button className="workout__check" aria-label={`${ex.name}, отрезок ${si + 1}: ${set.state === 'done' ? 'снять отметку' : 'выполнен'}`} aria-pressed={set.state === 'done'} onClick={() => {
          const lack = set.state !== 'done' && missing(set, track);
          if (lack) { setMessage(lack); return; }
          const starting = set.state !== 'done';
          updateSet(ei, si, s => ({ ...s, state: s.state === 'done' ? 'pending' : 'done' }));
          if (starting && restAfter) startRest();
        }}><IconCheck size={20} /></button>
      </div>
      <div className="workout__cardio-grid">
        {fields.map(f => (
          <label key={f.key}><span>{f.head}</span><input aria-label={`${ex.name}, отрезок ${si + 1}, ${f.head.toLowerCase()}`} inputMode={f.mode} placeholder={f.placeholder || ''} maxLength={f.max} value={set[f.key] || ''} onChange={e => edit(f.key, e.target.value)} /></label>
        ))}
      </div>
      {!inRound && <details className="workout__set-options"><summary>{set.state === 'skipped' ? 'Пропущен · изменить' : 'Настройки отрезка'}</summary>
        <div className="workout__toolbar">
          <label>Тип<select value={set.kind} onChange={e => updateSet(ei, si, s => ({ ...s, kind: e.target.value }))}><option value="work">Рабочий</option><option value="warmup">Разминка</option></select></label>
          <label>RPE<input aria-label={`${ex.name}, отрезок ${si + 1}, RPE`} inputMode="decimal" placeholder="1–10" maxLength={4} value={set.rpe} onChange={e => updateSet(ei, si, s => ({ ...s, rpe: e.target.value }))} /></label>
          <button className="button" onClick={() => updateSet(ei, si, s => ({ ...s, state: s.state === 'skipped' ? 'pending' : 'skipped' }))}>{set.state === 'skipped' ? 'Вернуть' : 'Пропустить'}</button>
          <button className="button" disabled={ex.sets.length === 1} onClick={() => { setUndo(s.exercises); updateExercise(ei, ex => ({ ...ex, sets: ex.sets.filter((_, i) => i !== si) })); }}>Удалить отрезок</button>
        </div>
      </details>}
    </div>;
  };

  /** Кардио: добавить метрику, которой нет в плане, — калории с экрана тренажёра, пульс с часов */
  const metricAdd = (ex, ei) => {
    const track = trackOf(ex);
    const rest = METRICS.filter(m => !track.metrics.includes(m));
    if (!rest.length) return null;
    return <div className="workout__metric-add">
      {rest.map(m => (
        <button type="button" key={m} className="chip" onClick={() => updateExercise(ei, x => ({ ...x, track: { ...trackOf(x), metrics: [...trackOf(x).metrics, m] } }))}>+ {metricField(m, track).short}</button>
      ))}
    </div>;
  };

  /** Поля подхода сверх строки: у своего веса и статики — поддержка */
  const setExtras = (ex, ei, si) => {
    const set = ex.sets[si];
    const track = trackOf(ex);
    const edit = (key, value) => updateSet(ei, si, s => ({ ...s, [key]: value }));
    return <>
      {(track.kind === 'bodyweight' || track.kind === 'timed') && (
        <label className="workout__field">Поддержка<input aria-label={`${ex.name}, подход ${si + 1}, поддержка`} placeholder="резинка, гравитрон 20" maxLength={40} value={set.assist || ''} onChange={e => edit('assist', e.target.value)} /></label>
      )}
    </>;
  };

  /** Кнопки подхода по типу: дропсет, стороны отдельно */
  const setTools = (ex, ei, si) => {
    const set = ex.sets[si];
    const track = trackOf(ex);
    return <>
      {(track.kind === 'strength' || track.kind === 'bodyweight') && !(set.drops || []).length && (
        <button className="button" onClick={() => updateSet(ei, si, s => ({ ...s, drops: [{ weight: '', reps: '' }] }))}>Дропсет</button>
      )}
      {track.unilateral && set.left === undefined && (
        <button className="button" onClick={() => updateSet(ei, si, s => ({ ...s, left: s.reps || '', right: s.reps || '' }))}>Л и П отдельно</button>
      )}
    </>;
  };

  /**
   * Настройки круга суперсета — одни на круг, а не у каждого упражнения:
   * разминочный круг, пропустить или убрать круг целиком. RPE, поддержка,
   * дропсет — у каждого упражнения внутри.
   */
  const roundOptions = (members, r) => {
    const group = members[0].ex.supersetGroup;
    const inRound = members.filter(({ ex }) => ex.sets[r]);
    const skipped = inRound.every(({ ex }) => ex.sets[r].state === 'skipped');
    const kind = inRound.every(({ ex }) => ex.sets[r].kind === 'warmup') ? 'warmup' : 'work';
    const rounds = Math.max(...members.map(({ ex }) => ex.sets.length));
    const all = fn => change(v => ({ ...v, exercises: v.exercises.map(e => (e.supersetGroup === group && e.sets[r] ? fn(e) : e)) }));
    const setAll = patch => all(e => ({ ...e, sets: e.sets.map((x, i) => (i === r ? { ...x, ...patch } : x)) }));
    return <details className="workout__set-options workout__round-options">
      <summary>{skipped ? 'Круг пропущен · изменить' : 'Настройки круга'}</summary>
      {inRound.map(({ ex, ei }) => (
        <div className="workout__round-set" key={ex.id}>
          <div className="workout__round-set-name">{ex.name}</div>
          {setExtras(ex, ei, r)}
          <div className="workout__toolbar">
            <label>RPE<input aria-label={`${ex.name}, круг ${r + 1}, RPE`} inputMode="decimal" placeholder="1–10" maxLength={4} value={ex.sets[r].rpe} onChange={e => updateSet(ei, r, s => ({ ...s, rpe: e.target.value }))} /></label>
            {setTools(ex, ei, r)}
          </div>
        </div>
      ))}
      <div className="workout__toolbar">
        <label>Круг<select value={kind} onChange={e => setAll({ kind: e.target.value })}><option value="work">Рабочий</option><option value="warmup">Разминка</option></select></label>
        <button className="button" onClick={() => setAll({ state: skipped ? 'pending' : 'skipped' })}>{skipped ? 'Вернуть круг' : 'Пропустить круг'}</button>
        <button className="button" disabled={rounds === 1} onClick={() => { setUndo(s.exercises); all(e => (e.sets.length > 1 ? { ...e, sets: e.sets.filter((_, i) => i !== r) } : e)); }}>Удалить круг</button>
      </div>
    </details>;
  };

  /**
   * Тип упражнения — для этого занятия: снимок, база не меняется. Нужен,
   * когда упражнение вписано руками или тип в базе угадан не так.
   */
  const trackEditor = (ex, ei) => {
    const track = trackOf(ex);
    const set = patch => updateExercise(ei, x => {
      const next = { ...x, track: { ...trackOf(x), ...patch } };
      if (next.track.kind !== 'cardio') delete next.cardio;
      else if (x.cardio && patch.machine) next.cardio = { ...x.cardio, machine: patch.machine };
      return next;
    });
    return <div className="workout__track">
      <label className="workout__field">Что записывать<select value={track.kind} onChange={e => set({ kind: e.target.value, machine: e.target.value === 'cardio' ? (track.machine || 'treadmill') : '' })}>
        {Object.entries(KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select></label>
      {track.kind === 'cardio' && <label className="workout__field">Тренажёр<select value={track.machine} onChange={e => set({ machine: e.target.value })}>
        {Object.entries(MACHINE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select></label>}
      {track.kind !== 'cardio' && <label className="workout__check-line"><input type="checkbox" checked={track.unilateral} onChange={e => set({ unilateral: e.target.checked })} />Повторы на каждую сторону</label>}
      {track.kind === 'strength' && <label className="workout__check-line"><input type="checkbox" checked={track.perSide} onChange={e => set({ perSide: e.target.checked })} />Вес с одной стороны</label>}
    </div>;
  };

  /**
   * Суперсет — кругами: «Круг 1» — все упражнения группы подряд, каждое со
   * своим весом и повторами, потом «Круг 2». Так его и делают в зале.
   * «Разъединить» делает упражнения отдельными; подходов у каждого остаётся
   * столько, сколько было кругов.
   */
  const supersetBlock = (members) => {
    const rounds = Math.max(...members.map(({ ex }) => ex.sets.length));
    const group = members[0].ex.supersetGroup;
    const split = () => { flip('name:' + members[0].ex.id); change(v => ({ ...v, exercises: v.exercises.map(e => (e.supersetGroup === group ? { ...e, supersetGroup: '' } : e)) })); };
    const addRound = () => change(v => ({
      ...v,
      exercises: v.exercises.map(e => (e.supersetGroup === group && e.sets.length < 20
        ? { ...e, sets: [...e.sets, { ...e.sets[e.sets.length - 1], state: 'pending' }] }
        : e)),
    }));
    return <section className="workout__exercise workout__rounds" key={'g' + group} data-flip-enter="">
      <div className="workout__rounds-head">
        <h3 data-flip={'name:' + members[0].ex.id}>Суперсет · {rounds} {rounds % 10 === 1 && rounds % 100 !== 11 ? 'круг' : [2, 3, 4].includes(rounds % 10) && ![12, 13, 14].includes(rounds % 100) ? 'круга' : 'кругов'}</h3>
        <button className="button button--ghost" onClick={split}>Разъединить</button>
      </div>
      <p className="small muted">Упражнения подряд, без отдыха; отдых — после круга.</p>
      {(members[0].ex.prescription || members.some(({ ex }) => ex.prevWeight)) && (
        <p className="small muted">{members.map(({ ex }) => ex.name + (ex.prescription ? ': ' + ex.prescription : '') + (ex.prevWeight ? ' · было ' + ex.prevWeight : '')).join('; ')}</p>
      )}
      {Array.from({ length: rounds }, (_, r) => (
        <div className="workout__round" key={r}>
          <h4 className="workout__round-title" data-flip-enter="" data-flip-delay={r * 140}>Круг {r + 1}</h4>
          {members.map(({ ex, ei }, k) => ex.sets[r] && (
            <div className="workout__round-item" key={ex.id}>
              <div className="workout__round-name" data-flip={r === 0 && k > 0 ? 'name:' + ex.id : undefined}>{ex.name}<span className="workout__round-units"> · {rowFields(trackOf(ex)).map(f => f.unit).join(' · ')}</span></div>
              {setRow(ex, ei, r, '', k === members.length - 1, true)}
            </div>
          ))}
          {roundOptions(members, r)}
        </div>
      ))}
      <button className="button button--block" disabled={members.some(({ ex }) => ex.sets.length >= 20)} onClick={addRound}>Добавить круг</button>
      <details><summary>Упражнения суперсета</summary>
        {members.map(({ ex, ei }) => (
          <div key={ex.id} className="workout__round-edit">
            <label className="workout__field">Название<input value={ex.name} maxLength={160} onChange={e => updateExercise(ei, x => ({ ...x, name: e.target.value }))} /></label>
            {trackEditor(ex, ei)}
            <label className="workout__field">Заметка<textarea value={ex.note} maxLength={500} rows={2} onChange={e => updateExercise(ei, x => ({ ...x, note: e.target.value }))} /></label>
          </div>
        ))}
      </details>
    </section>;
  };

  /**
   * Между карточками — «Соединить в суперсет»: упражнение с упражнением,
   * суперсет с соседом. Решают это в зале, глядя на следующее упражнение,
   * поэтому кнопка там, где его видно, а не в настройках. У сплита подходы
   * идут по людям, круги там не собрать — кнопки нет.
   */
  const joinBefore = (ei) => {
    const list = record?.session?.exercises || [];
    const a = list[ei - 1];
    const b = list[ei];
    if (!a || !b || (a.supersetGroup && a.supersetGroup === b.supersetGroup)) return null;
    if (a.sets.some(x => x.who) || b.sets.some(x => x.who)) return null;
    const join = () => {
      const group = a.supersetGroup || b.supersetGroup || 'superset-' + uid();
      const merged = [a.supersetGroup, b.supersetGroup].filter(Boolean);
      flip('name:' + ((a.supersetGroup ? list.find(e => e.supersetGroup === a.supersetGroup) : a).id));
      change(v => ({ ...v, exercises: v.exercises.map(e => (e.id === a.id || e.id === b.id || merged.includes(e.supersetGroup) ? { ...e, supersetGroup: group } : e)) }));
    };
    return <button type="button" className="workout__join" onClick={join}><IconLinkPair aria-hidden="true" />Соединить в суперсет</button>;
  };

  const s = record?.session;
  const stats = s ? summary(s) : null;
  const editable = s && ['active', 'paused'].includes(s.status);
  const elapsed = s ? s.elapsedMs + (s.status === 'active' ? Math.max(0, now - record.tick) : 0) : 0;
  return <div className="workout">
    <button className="button" onClick={close}>К программе</button>
    {!ready && <p role="status">Открываем журнал тренировок…</p>}
    {storageError && <p role="alert" className="workout__error">Устройство не сохранило черновик. Не закрывайте экран до сохранения в облаке.</p>}
    {message && <div role="alert" className="workout__error"><p>{message}</p><button className="button" disabled={busy} onClick={() => { setMessage(''); record?.dirty ? save() : list().catch(e => setMessage(e.message)); }}>Повторить</button></div>}
    {conflict && <div role="alert" className="workout__error">
      <h3>{conflict.activeConflict ? 'Уже есть текущее занятие' : 'Занятие изменено на другом устройстве'}</h3>
      <p>Ваш черновик сохранён отдельно. Скачайте его, затем откройте актуальную версию и перенесите нужные изменения.</p>
      <button className="button" onClick={exportDraft}>Скачать мой черновик</button>
      <button className="button" onClick={useRemote}>Открыть актуальное занятие</button>
    </div>}
    {s && <>
      <header className="workout__header">
        <h2>{s.title}</h2><p>{s.month || 'Свободная тренировка'} · {labels[s.status]}</p>
        <div className="workout__metrics"><span>Время <strong>{clock(elapsed)}</strong></span><span>Подходы <strong>{stats.done} / {stats.total}</strong></span></div>
        {/* Полоса своя, а не браузерный progress: системный выглядит
            по-разному в каждом движке и ни в одной теме не совпадает с
            палитрой приложения. Значение дублируется для чтения вслух. */}
        <div
          className="workout__bar"
          role="progressbar"
          aria-label="Выполненные подходы"
          aria-valuemin={0}
          aria-valuemax={stats.total || 1}
          aria-valuenow={stats.done}
        >
          <span style={{ width: Math.round((stats.done / (stats.total || 1)) * 100) + '%' }} />
        </div>
        <p className="workout__status" role="status">{busy ? 'Сохраняем…' : record.dirty ? 'Есть несохранённые изменения' : 'Сохранено в облаке'}</p>
      </header>
      <fieldset disabled={!editable || !!conflict} className="workout__fields" ref={fieldsRef}>
        <label className="workout__field">Название занятия<input value={s.title} maxLength={160} onChange={e => change(s => ({ ...s, title: e.target.value }))} /></label>
        {editable && <div className="workout__toolbar">
          <button className="button" onClick={() => change(s => ({ ...s, status: s.status === 'active' ? 'paused' : 'active', restUntil: 0 }))}>{s.status === 'active' ? 'Пауза' : 'Продолжить'}</button>
          {/* Длительность не только запускает отдых, но и запоминается:
              дальше он стартует сам после каждого отмеченного подхода.
              Раньше за ним приходилось возвращаться в шапку экрана
              после каждого подхода — то есть листать вверх весь список. */}
          <label>Отдых <select aria-label="Таймер отдыха" value={String(s.restSeconds || 0)} onChange={e => { const seconds = Number(e.target.value); change(v => ({ ...v, restSeconds: seconds })); if (seconds) startRest(seconds); else change(v => ({ ...v, restUntil: 0 })); }}><option value="0">Вручную</option><option value="60">1 мин</option><option value="90">1:30</option><option value="120">2 мин</option><option value="180">3 мин</option></select></label>
        </div>}
        {/* Полоса отдыха прижата к низу экрана, а не стоит в шапке: между
            подходами человек листает список упражнений вниз, и таймер,
            оставшийся наверху, приходилось искать прокруткой. */}
        {!!s.restUntil && <div className="workout__rest workout__rest--float" role="status">
          <span>{now < s.restUntil ? 'Отдых ' + clock(s.restUntil - now) : 'Отдых закончен — следующий подход'}</span>
          <span className="workout__rest-actions">
            <button className="button" onClick={() => change(v => ({ ...v, restUntil: Math.max(now, v.restUntil) + 30000 }))}>+30 с</button>
            <button className="button" onClick={() => change(v => ({ ...v, restUntil: 0 }))}>Сбросить</button>
          </span>
        </div>}
        {s.exercises.map((ex, ei) => {
          const group = ex.supersetGroup;
          const members = group ? s.exercises.map((e, i) => ({ ex: e, ei: i })).filter(m => m.ex.supersetGroup === group) : [];
          // Круги — для обычного суперсета; у сплита подходы по людям, там по-старому
          if (members.length > 1 && !members.some(m => m.ex.sets.some(x => x.who))) {
            return members[0].ei === ei ? <React.Fragment key={'g' + group}>{joinBefore(ei)}{supersetBlock(members)}</React.Fragment> : null;
          }
          return <React.Fragment key={ex.id}>{joinBefore(ei)}<section className="workout__exercise" key={ex.id} data-flip-enter="">
          <h3 data-flip={'name:' + ex.id}>{ei + 1}. {ex.name || 'Новое упражнение'}</h3>
          {supersetMark(s.exercises, ei) && <p className="workout__superset">{supersetMark(s.exercises, ei)}</p>}
          {(ex.prescription || ex.prevWeight) && (
            <p className="small muted">
              {ex.prescription ? 'План: ' + ex.prescription : ''}
              {ex.prevWeight && <span className="workout__prev">было {ex.prevWeight}</span>}
            </p>
          )}
          <details><summary>Изменить упражнение</summary>
            <label className="workout__field">Название<input value={ex.name} maxLength={160} onChange={e => updateExercise(ei, ex => ({ ...ex, name: e.target.value }))} /></label>
            {trackEditor(ex, ei)}
            <div className="workout__toolbar">
              <button className="button button--ghost" disabled={ei === 0} onClick={() => change(s => { const exercises = [...s.exercises]; [exercises[ei - 1], exercises[ei]] = [exercises[ei], exercises[ei - 1]]; return { ...s, exercises }; })}>Выше</button>
              <button className="button button--ghost" disabled={ei === s.exercises.length - 1} onClick={() => change(s => { const exercises = [...s.exercises]; [exercises[ei + 1], exercises[ei]] = [exercises[ei], exercises[ei + 1]]; return { ...s, exercises }; })}>Ниже</button>
              <button className="button button--ghost" disabled={s.exercises.length === 1} onClick={() => { setUndo(s.exercises); change(s => ({ ...s, exercises: s.exercises.filter(e => e.id !== ex.id) })); }}>Убрать</button>
            </div>
          </details>
          {trackOf(ex).kind === 'cardio' && ex.cardio && ex.cardio.intervals && <IntervalTimer intervals={ex.cardio.intervals} track={trackOf(ex)} />}
          {trackOf(ex).kind !== 'cardio' && <div className={'workout__set-head' + (ex.sets.some(x => x.who) ? ' workout__set-head--who' : '')} style={{ '--cols': rowFields(trackOf(ex)).length }} aria-hidden="true"><span>{trackOf(ex).kind === 'cardio' ? 'Отрезок' : 'Подход'}</span>{rowFields(trackOf(ex)).map(f => <span key={f.key}>{f.head}</span>)}<span>Готово</span></div>}
          {ex.sets.map((set, si) => setRow(ex, ei, si, setLabel(ex.sets, si)))}
          {trackOf(ex).kind === 'cardio' && metricAdd(ex, ei)}
          {/* У пары подход добавляется кругом — по одному каждому, кто
              делает упражнение, с его последним весом */}
          {(() => {
            const who = [...new Set(ex.sets.map(x => x.who).filter(Boolean))];
            const round = who.length
              ? who.map(w => ({ ...[...ex.sets].reverse().find(x => x.who === w), state: 'pending' }))
              : [{ ...ex.sets[ex.sets.length - 1], state: 'pending' }];
            return (
              <button className="button button--block" disabled={ex.sets.length + round.length > 20} onClick={() => updateExercise(ei, ex => ({ ...ex, sets: [...ex.sets, ...round] }))}>
                {who.length > 1 ? 'Добавить круг' : trackOf(ex).kind === 'cardio' ? 'Добавить отрезок' : 'Добавить подход'}
              </button>
            );
          })()}
          <label className="workout__field">Заметка к упражнению<textarea value={ex.note} maxLength={500} rows={2} onChange={e => updateExercise(ei, ex => ({ ...ex, note: e.target.value }))} /></label>
        </section></React.Fragment>;
        })}
        {undo && <button className="button" onClick={() => { change(s => ({ ...s, exercises: undo })); setUndo(null); }}>Отменить последнее удаление</button>}
        <button className="button button--block" disabled={s.exercises.length >= 30} onClick={() => change(s => ({ ...s, exercises: [...s.exercises, { id: uid(), name: 'Новое упражнение', note: '', prescription: '', prevWeight: '', sets: [blankSet()] }] }))}>Добавить упражнение</button>
        <label className="workout__field">Как прошла тренировка<textarea value={s.note} maxLength={1000} rows={3} onChange={e => change(s => ({ ...s, note: e.target.value }))} /></label>
      </fieldset>
      {editable && <div className="workout__finish">
        {!confirm ? <><button className="button button--primary button--block" onClick={() => setConfirm('complete')}>Завершить тренировку</button><button className="button" onClick={() => setConfirm('cancel')}>Отменить занятие</button></> : <>
          <p>{confirm === 'complete' ? `Выполнено ${stats.done} подходов. Оставшиеся ${stats.pending} будут отмечены пропущенными.` : 'Занятие останется в журнале с отметкой «Отменена».'}</p>
          <button className="button" disabled={busy || !!conflict || (confirm === 'complete' && !stats.done)} onClick={() => { change(s => ({ ...s, status: confirm === 'complete' ? 'completed' : 'cancelled', restUntil: 0, exercises: s.exercises.map(e => ({ ...e, sets: e.sets.map(s => s.state === 'pending' ? { ...s, state: 'skipped' } : s) })) })); setConfirm(''); save(); }}>Подтвердить</button><button className="button" onClick={() => setConfirm('')}>Продолжить занятие</button>
        </>}
      </div>}
      {!editable && <div className="workout__finish"><h3>{labels[s.status]}</h3><p>{stats.done} подходов · {Math.round(stats.volume).toLocaleString('ru-RU')} кг рабочего объёма</p><p className="small muted">Оплаты и учёт занятий по календарю не изменены.</p><button className="button" disabled={busy || !!conflict} onClick={() => change(s => ({ ...s, status: 'paused' }))}>Исправить результат</button><button className="button" disabled={record.dirty || busy} onClick={() => { store(null); list().catch(e => setMessage(e.message)); }}>К журналу</button></div>}
      <button className="button" disabled={busy || !!conflict || !record.dirty} onClick={save}>Сохранить сейчас</button>
      <button className="button" onClick={exportDraft}>Скачать результат</button>
    </>}
    {!s && ready && <>
      <h2>Журнал тренировок</h2><p className="muted">Начните занятие из программы или соберите свободную тренировку.</p>
      <button className="button button--primary button--block" disabled={busy} onClick={() => store(freshRecord(fromPlan({ title: 'Свободная тренировка', exercises: [{ name: 'Первое упражнение', sets: 3 }] }, '')))}>Начать свободную тренировку</button>
      {!history.length && <p>Здесь появятся проведённые занятия и их результаты.</p>}
      {history.map(s => <div className="workout__history-row" key={s.id}>
        <button className="workout__history" disabled={busy} onClick={() => open(s.id)}><strong>{s.title}</strong><span>{new Date(s.startedAt).toLocaleDateString('ru-RU')} · {labels[s.status]} · {s.done} подходов</span></button>

        {/* Кнопка удаления только у тренера: журнал — это его записи о
            клиенте. Подтверждение обязательно и называет занятие: удаление
            безвозвратно, а строки в списке похожи друг на друга. */}
        {clientRow && !clientView && (erase === s.id
          ? <span className="workout__erase" role="alert">
              <span className="small">Удалить «{s.title}» навсегда?</span>
              <button className="button" disabled={busy} onClick={() => remove(s.id)}>Удалить</button>
              <button className="button" onClick={() => setErase('')}>Отмена</button>
            </span>
          : <button className="button" disabled={busy} onClick={() => setErase(s.id)} aria-label={'Удалить занятие ' + s.title}>Удалить</button>)}
      </div>)}
    </>}
  </div>;
}
