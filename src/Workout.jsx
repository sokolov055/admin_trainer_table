import React, { useEffect, useRef, useState } from 'react';
import { apiPublic, apiMutate } from './api.js';
import { getInitData } from './telegram.js';
import { getToken } from './session.js';
import { blankSet, clock, fromPlan, summary, uid } from './workout-model.js';
import { IconCheck } from './icons.jsx';
import { useBackGesture } from './gestures.jsx';
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
          else if (launch && launch.block) store(freshRecord(fromPlan(launch.block, launch.month)));
        }
      } catch (e) {
        if (alive) {
          setMessage('Нет связи с журналом. ' + e.message);
          if (!draft && launch) store(freshRecord(fromPlan(launch.block, launch.month)));
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
      <fieldset disabled={!editable || !!conflict} className="workout__fields">
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
        {s.exercises.map((ex, ei) => <section className="workout__exercise" key={ex.id}>
          <h3>{ei + 1}. {ex.name || 'Новое упражнение'}</h3>
          {supersetMark(s.exercises, ei) && <p className="workout__superset">{supersetMark(s.exercises, ei)}</p>}
          {(ex.prescription || ex.prevWeight) && (
            <p className="small muted">
              {ex.prescription ? 'План: ' + ex.prescription : ''}
              {ex.prevWeight && <span className="workout__prev">было {ex.prevWeight}</span>}
            </p>
          )}
          <details><summary>Изменить упражнение</summary>
            <label className="workout__field">Название<input value={ex.name} maxLength={160} onChange={e => updateExercise(ei, ex => ({ ...ex, name: e.target.value }))} /></label>
            <div className="workout__toolbar">
              <button className="button button--ghost" disabled={ei === 0} onClick={() => change(s => { const exercises = [...s.exercises]; [exercises[ei - 1], exercises[ei]] = [exercises[ei], exercises[ei - 1]]; return { ...s, exercises }; })}>Выше</button>
              <button className="button button--ghost" disabled={ei === s.exercises.length - 1} onClick={() => change(s => { const exercises = [...s.exercises]; [exercises[ei + 1], exercises[ei]] = [exercises[ei], exercises[ei + 1]]; return { ...s, exercises }; })}>Ниже</button>
              <button className="button button--ghost" disabled={s.exercises.length === 1} onClick={() => { setUndo(s.exercises); change(s => ({ ...s, exercises: s.exercises.filter(e => e.id !== ex.id) })); }}>Убрать</button>
            </div>
          </details>
          <div className="workout__set-head" aria-hidden="true"><span>Подход</span><span>Вес, кг</span><span>Повторы</span><span>Готово</span></div>
          {ex.sets.map((set, si) => <div className={'workout__set ' + (set.state === 'done' ? 'workout__set--done' : '')} key={si}>
            <div className="workout__set-row"><span>{si + 1}{set.kind === 'warmup' ? ' · Р' : ''}</span>
              <input aria-label={`${ex.name}, подход ${si + 1}, вес в кг`} inputMode="decimal" value={set.weight} maxLength={12} onChange={e => updateSet(ei, si, s => ({ ...s, weight: e.target.value }))} />
              <input aria-label={`${ex.name}, подход ${si + 1}, повторы`} inputMode="numeric" value={set.reps} maxLength={6} onChange={e => updateSet(ei, si, s => ({ ...s, reps: e.target.value }))} />
              <button className="workout__check" aria-label={`${ex.name}, подход ${si + 1}: ${set.state === 'done' ? 'снять отметку' : 'выполнен'}`} aria-pressed={set.state === 'done'} onClick={() => {
                if (set.state !== 'done' && (!/^\d+$/.test(set.reps) || Number(set.reps) < 1)) { setMessage('Введите число повторов перед отметкой подхода.'); return; }
                const starting = set.state !== 'done';
                updateSet(ei, si, s => ({ ...s, state: s.state === 'done' ? 'pending' : 'done' }));
                // Отдых начинается там, где человек нажал, а не там, где
                // стоит переключатель: подход отмечен — время пошло.
                if (starting) startRest();
              }}><IconCheck size={20} /></button>
            </div>
            <details className="workout__set-options"><summary>{set.state === 'skipped' ? 'Пропущен · изменить' : 'Настройки подхода'}</summary>
              <div className="workout__toolbar">
                <label>Тип<select value={set.kind} onChange={e => updateSet(ei, si, s => ({ ...s, kind: e.target.value }))}><option value="work">Рабочий</option><option value="warmup">Разминка</option></select></label>
                <label>RPE<input aria-label={`${ex.name}, подход ${si + 1}, RPE`} inputMode="decimal" placeholder="1–10" maxLength={4} value={set.rpe} onChange={e => updateSet(ei, si, s => ({ ...s, rpe: e.target.value }))} /></label>
                <button className="button" onClick={() => updateSet(ei, si, s => ({ ...s, state: s.state === 'skipped' ? 'pending' : 'skipped' }))}>{set.state === 'skipped' ? 'Вернуть' : 'Пропустить'}</button>
                <button className="button" disabled={ex.sets.length === 1} onClick={() => { setUndo(s.exercises); updateExercise(ei, ex => ({ ...ex, sets: ex.sets.filter((_, i) => i !== si) })); }}>Удалить подход</button>
              </div>
            </details>
          </div>)}
          <button className="button button--block" disabled={ex.sets.length >= 20} onClick={() => updateExercise(ei, ex => ({ ...ex, sets: [...ex.sets, { ...ex.sets[ex.sets.length - 1], state: 'pending' }] }))}>Добавить подход</button>
          <label className="workout__field">Заметка к упражнению<textarea value={ex.note} maxLength={500} rows={2} onChange={e => updateExercise(ei, ex => ({ ...ex, note: e.target.value }))} /></label>
        </section>)}
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
