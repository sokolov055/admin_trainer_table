import React, { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { apiPublic, apiMutate } from './api.js';
import { storageKey } from './workout-draft.js';
import { haptic } from './telegram.js';
import { blankSet, clock, fromPlan, summary, uid, setLabel } from './workout-model.js';
import { IconCheck, IconClose, IconLinkPair, IconSliders, IconPlus, IconDelta } from './icons.jsx';
import { useBackGesture, useTabLock } from './gestures.jsx';
import SwipeRow from './SwipeRow.jsx';
import { usePendingDelete } from './pendingDelete.jsx';
import { vanish } from './remove.js';
import { useFlip } from './flip.js';
import { KIND_LABELS, MACHINE_LABELS, METRICS, trackOf, rowFields, missing, metricField, settingsFields } from './exercise-track.js';
import IntervalTimer from './IntervalTimer.jsx';
import { localRestPlatform, scheduleRestEnd, cancelRestEnd, alarmRings } from './native-rest.js';
import { showWorkoutActivity, endWorkoutActivity, takePendingRest, takeActions, applyActions, setWorkoutOpen, onWatchState, isCoaching } from './native-activity.js';
import './workout.css';
import { usePinch } from './pinch.js';
import ExercisePicker from './trainer/ExercisePicker.jsx';
import { useData } from './useData.js';
import { SetupText } from './media.jsx';
import { EFFORTS, EFFORT_WORD, EFFORT_HINT, restFor, roundRest, rateSet, unrate, suggestText, lastRunText } from './effort.js';
import { unlockAlarm, ringOnce, stopVibration } from './rest-alarm.js';

const labels = { active: 'Идёт', paused: 'На паузе', completed: 'Завершена', cancelled: 'Отменена' };

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

// backLabel — куда ведёт «назад»: из программы — к ней, из меню — к списку клиентов
export default function WorkoutJournal({ clientRow, clientView = false, launch, onClose, backLabel = 'К программе' }) {
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
  const [undo, setUndoState] = useState(null);
  const [undoText, setUndoText] = useState('');
  const setUndo = (value, text = 'Удалено') => { setUndoState(value); setUndoText(value ? text : ''); };
  useEffect(() => {
    if (!undo) return undefined;
    const t = setTimeout(() => setUndo(null), 8000);
    return () => clearTimeout(t);
  }, [undo]);
  // Выбор нескольких упражнений: удалить, дублировать, соединить в суперсет
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState(() => new Set());
  // Настройки подхода открываются по номеру подхода — одна за раз, а не
  // строкой «Настройки подхода» под каждым: их читают редко, а место они
  // занимали у цифр, ради которых экран и открыт
  const [openSet, setOpenSet] = useState('');
  // Отметка подхода — с оценкой «легко / норм / тяжело» (03.10.2026):
  // галочка раскрывает выбор под подходом (ключ подхода или круга)
  const [effortFor, setEffortFor] = useState('');
  const restSpan = useRef({ until: 0, total: 0 });
  // Разъединили или соединили суперсет — подходы перелетают на новые места
  const fieldsRef = useRef(null);
  const flip = useFlip(fieldsRef);
  const [now, setNow] = useState(Date.now());
  const state = useRef(null), key = useRef(''), saving = useRef(false), mounted = useRef(true);
  const conflictRef = useRef(null);
  // Просили сохранить, пока шло прежнее сохранение (см. save)
  const saveAgain = useRef(false);
  // Чего не хватает, чтобы отметить круг суперсета: { key: 'группа:круг', text }
  const [roundLack, setRoundLack] = useState(null);
  // Переименование касанием по названию (02.10.2026): id упражнения
  const [renaming, setRenaming] = useState('');
  // Перестановка удержанием (02.10.2026): { key } — какой блок тащат.
  // Пока тащат, карточки свёрнуты в строки (как в «Выбрать»): развёрнутая
  // карточка выше экрана, цель за ней не видна
  const [reorder, setReorder] = useState(null);
  const drag = useRef(null);
  const swallowClick = useRef(false);
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
  // Смахнули занятие в журнале — пропадает сразу, на сервер уходит через
  // несколько секунд, если не нажали «Вернуть» (pendingDelete.jsx)
  const erase = usePendingDelete(id => apiMutate('workout.delete', { ...params, id }), {
    onDone: () => list().catch(e => setMessage(e.message)),
    onError: e => setMessage(e.message),
  });

  const open = async id => {
    setBusy(true); setMessage('');
    try {
      const result = await apiPublic('workout.get', { ...params, id });
      store({ session: result.session, revision: result.session.revision, serverTitle: result.session.title, dirty: false, tick: Date.now() });
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
        // Начинают тренировку из программы — журнал не ждём дольше 6 с: без
        // связи (белые списки у оператора, подвал) тренировка идёт на
        // телефоне и сохранится, когда связь появится (02.10.2026)
        const sessions = launch && launch.block
          ? await Promise.race([list(), new Promise((_, no) => setTimeout(() => no(new Error('Сервер не отвечает.')), 6000))])
          : await list();
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

        // Идёт другое занятие (начали на часах), а в черновике — завершённое:
        // «Вернуться к занятию» открывало его, и идущее приходилось искать в
        // журнале (02.10.2026). Недосохранённое завершённое сначала дошлём —
        // оно не потеряется, — потом откроем идущее
        const running = sessions.find(s => ['active', 'paused'].includes(s.status));
        const wantedOther = wanted && draft && wanted !== draft.session.id;
        if (draft && finished && running && running.id !== draft.session.id && (!wanted || wanted === running.id)) {
          if (draft.dirty) { try { await save(); } catch (_) {} }
          if (!alive) return;
          draft = null;
        } else if (draft && finished && wantedOther) {
          if (draft.dirty) { try { await save(); } catch (_) {} }
          if (!alive) return;
          draft = null;
        }

        if (draft && !draft.dirty) await open(wanted || draft.session.id);
        if (!draft) {
          const active = sessions.find(s => ['active', 'paused'].includes(s.status));
          if (wanted) await open(wanted);
          else if (active) await open(active.id);
          else if (launch && launch.block) store(freshRecord(fromPlan(launch.block, launch.month, launch.members || [])));
        }
      } catch (e) {
        if (alive) {
          setMessage(launch && launch.block
            ? 'Нет связи — тренировка идёт на телефоне и сохранится, когда связь появится.'
            : 'Нет связи с журналом. ' + e.message);
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
    // Вписали недостающее — подсказка под кнопкой круга больше не нужна
    setRoundLack(null);
  };

  const save = async () => {
    let r = state.current;
    // Идёт прежнее сохранение — не теряем просьбу, а повторяем сразу после
    // него. Иначе отдых, начатый вслед за отметкой подхода, ждал обычную
    // задержку, телефон тем временем уходил в карман, iPhone замораживал
    // страницу — и сервер не узнавал об отдыхе (уведомление не приходило).
    if (r && r.dirty && saving.current) { saveAgain.current = true; return; }
    if (!r || !r.dirty || saving.current || conflictRef.current || !key.current) return;
    saving.current = true; if (mounted.current) setBusy(true);
    // Повторяем ровно тот снимок, чей ответ потерялся. Новые нажатия
    // остаются в черновике и отправятся уже следующей версией.
    if (!r.pending) {
      const elapsed = r.session.status === 'active' ? Math.max(0, Date.now() - r.tick) : 0;
      r = { ...r, session: { ...r.session, elapsedMs: Math.min(604800000, r.session.elapsedMs + elapsed) }, tick: Date.now() };
      // baseTitle — название, которое сервер отдал последним. По нему сервер
      // отличает «переименовали здесь» (тогда переименует и тренировку в
      // программе) от «здесь не знали, что её переименовали в программе»
      r.pending = { session: r.session, revision: r.revision, requestId: uid(), edit: r.edit,
        ...(typeof r.serverTitle === 'string' ? { baseTitle: r.serverTitle } : {}) };
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
        // Связь с программой и месяц ведёт сервер: переименование тренировки
        // или месяца меняет их, пока здесь дописывают занятие
        sourceBlock: result.session.sourceBlock, sourceBlockId: result.session.sourceBlockId, month: result.session.month,
      }, revision: result.session.revision, serverTitle: result.session.title, pending: null, dirty: !unchanged });
      if (mounted.current) { setMessage(''); list().catch(() => {}); }
    } catch (e) {
      // Явный отказ валидации позволяет исправить снимок. При потере
      // связи сохраняем прежний requestId: запись могла уже состояться.
      if (mounted.current && e.code && state.current?.session.id === r.session.id) store({ ...state.current, pending: null });
      if (mounted.current) setMessage('Не сохранено в облаке: ' + e.message + ' Черновик остаётся на устройстве.');
    } finally {
      saving.current = false; if (mounted.current) setBusy(false);
      if (saveAgain.current) { saveAgain.current = false; save(); }
    }
  };

  // Отдых закончился раньше срока: сбросили, пауза, занятие завершено
  const restUntil = record?.session?.restUntil || 0;
  const restStatus = record?.session?.status;
  useEffect(() => {
    if (!restUntil || restStatus !== 'active') cancelRestEnd();
  }, [restUntil, restStatus]);

  // Отдых, начатый кнопкой на плашке, пока приложение спало: в занятие —
  // и на сервер. Уведомление о конце уже поставил телефон (restLocal)
  const applyPendingRest = async () => {
    // Сборка с очередью подходов: журнал нажатий — «Отдых» (подход сделан
    // + отдых) и вес — проигрываем по порядку
    const actions = await takeActions();
    const cur = state.current?.session;
    if (actions.length && cur && ['active', 'paused'].includes(cur.status)) {
      if (applyActions(cur, actions) !== cur) { change(v => applyActions(v, actions, localRestPlatform())); save(); }
    }
    const rest = await takePendingRest();
    const s = state.current?.session;
    if (!rest || !s || s.id !== rest.sessionId || s.status !== 'active' || rest.restUntil <= (s.restUntil || 0)) return;
    change(v => ({ ...v, restUntil: rest.restUntil, restLocal: localRestPlatform() }));
    save();
  };
  useEffect(() => { if (ready) applyPendingRest(); }, [ready]);

  // Экран открыт — нажатое на плашке забирает он сам, а не досохранение
  // при запуске (live-settle.js): иначе двое писали бы один черновик
  useEffect(() => { setWorkoutOpen(true); return () => setWorkoutOpen(false); }, []);

  // Тренировку ведут часы через сервер: их нажатия (подход, отдых, пауза,
  // «Завершить») — сразу и здесь, а не при следующем открытии экрана.
  // Несохранённое своё не затираем — его сохранит save, а расхождение
  // покажет обычный конфликт
  useEffect(() => onWatchState(({ sessionId }) => {
    const r = state.current;
    if (!ready || !sessionId || saving.current || (r && (r.dirty || r.pending))) return;
    if (!r || r.session.id === sessionId) open(sessionId).catch(() => {});
  }), [ready]);

  // Плашка на экране блокировки iPhone: идёт занятие — показать и
  // обновлять, завершили или отменили — убрать (native-activity.js)
  useEffect(() => {
    const status = record?.session?.status;
    if (['active', 'paused'].includes(status)) showWorkoutActivity(record, clientRow, { coach: isCoaching(clientRow, clientView) });
    else if (['completed', 'cancelled'].includes(status)) endWorkoutActivity(record.session.id);
  }, [record]);

  useEffect(() => {
    if (!ready || !record?.dirty || busy || message || conflict) return;
    const timer = setTimeout(save, 1800);
    return () => clearTimeout(timer);
  }, [record, ready, busy, message, conflict]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    const online = () => { setMessage(''); save(); };
    const unload = e => { if (state.current?.dirty) { e.preventDefault(); e.returnValue = ''; } };
    // Свернули приложение или заблокировали экран — несохранённое уходит
    // сразу: на iPhone у страницы после этого мгновения, не секунды
    const hide = () => { if (document.hidden) save(); else applyPendingRest(); };
    window.addEventListener('online', online);
    window.addEventListener('beforeunload', unload);
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', save);
    return () => {
      clearInterval(interval); window.removeEventListener('online', online); window.removeEventListener('beforeunload', unload);
      document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', save);
    };
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
        if (result.session.revision !== r.revision) store({ session: result.session, revision: result.session.revision, serverTitle: result.session.title, dirty: false, tick: Date.now() });
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

    restAt(Date.now() + length * 1000);
  };

  /** +30 секунд к отдыху — и уведомление переставить */
  const extendRest = () => {
    restAt(Math.max(Date.now(), (state.current && state.current.session.restUntil) || 0) + 30000);
  };

  /**
   * Отдых до времени until. Сначала — на сервер (он пришлёт уведомление,
   * если телефон не сможет сам), потом телефон ставит своё
   * (native-rest.js) и, только если поставил, говорит серверу молчать:
   * restLocal — платформа этого телефона. Запрещены уведомления — отметки
   * нет, и уведомление придёт с сервера, как раньше.
   */
  const restAt = (until) => {
    // Длина отдыха — для кольца на экране отдыха
    restSpan.current = { until, total: Math.max(1000, until - Date.now()) };
    change(v => ({ ...v, restUntil: until, restLocal: '' }));
    save();
    // Что дальше — в уведомление о конце отдыха и в шторку (Android)
    scheduleRestEnd(until, nextText(state.current && state.current.session)).then((ok) => {
      if (!ok || state.current?.session.restUntil !== until) return;
      change(v => (v.restUntil === until ? { ...v, restLocal: localRestPlatform() } : v));
      save();
    });
  };

  const updateExercise = (index, fn) => change(s => ({ ...s, exercises: s.exercises.map((e, i) => i === index ? fn(e) : e) }));
  const updateSet = (ei, si, fn) => updateExercise(ei, e => ({ ...e, sets: e.sets.map((s, i) => i === si ? fn(s) : s) }));
  const close = () => { if (state.current?.dirty) save(); onClose(); };

  // Смахнуть вправо — то же, что «Назад»: с сохранением незаписанного
  useBackGesture(close);
  // Идущая тренировка — не раздел: смахнуть влево в «Прогресс» посреди
  // подхода нельзя, выход только «назад» (смахнуть вправо)
  useTabLock(true);
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
    store({ session: remote, revision: remote.revision, serverTitle: remote.title, dirty: false, tick: Date.now() });
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
    // Свой вес — подсказка «подобрано» больше не нужна, и оценки этот
    // подход больше не двигают (own)
    const edit = (key, value) => updateSet(ei, si, ({ suggest, ...s }) => ({ ...s, [key]: value, ...(key !== 'weight' && suggest ? { suggest } : {}), ...(key === 'weight' ? { own: true } : {}) }));
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
    const key = ex.id + ':' + si;
    const current = focus.ex === ex.id && focus.set === si;
    const removeSet = () => { setUndo(s.exercises, 'Подход удалён'); setOpenSet(''); updateExercise(ei, ex => ({ ...ex, sets: ex.sets.filter((_, i) => i !== si) })); };
    return <SwipeRow className={'workout__set' + (set.state === 'done' ? ' workout__set--done' : '') + (set.state === 'skipped' ? ' workout__set--skipped' : '') + (current ? ' workout__set--current' : '')} key={si} data-flip={key} data-flip-delay={si * 90}
      disabled={inRound || ex.sets.length === 1 || !editable} label={`Удалить подход ${si + 1}`} onDelete={removeSet}>
            <div className={'workout__set-row' + (set.who ? ' workout__set-row--who' : '') + (inRound ? ' workout__set-row--round' : '')} style={{ '--cols': fields.length }}>
              {inRound
                ? <span>{label}</span>
                : <button type="button" className="workout__set-num" aria-expanded={openSet === key} aria-label={`${ex.name}, подход ${si + 1}: настройки`} onClick={() => setOpenSet(openSet === key ? '' : key)}>
                  <span>{label}{set.kind === 'warmup' ? ' · Р' : ''}</span>
                  {set.state === 'done' && set.effort
                    ? <span className={'workout__effort-dot workout__effort-dot--' + set.effort} title={EFFORT_WORD[set.effort]} aria-label={EFFORT_WORD[set.effort]} />
                    : <IconSliders size={12} aria-hidden="true" />}
                </button>}
              {fields.map(f => (
                <input key={f.key} aria-label={`${ex.name}, подход ${si + 1}, ${f.key === 'weight' ? 'вес в кг' : f.key === 'reps' ? 'повторы' : f.head.toLowerCase()}`} inputMode={f.mode} placeholder={f.placeholder || ''} value={set[f.key] || ''} maxLength={f.max} onChange={e => edit(f.key, e.target.value)} />
              ))}
            </div>
            {/* Галочки нет (03.10.2026): под ближайшим подходом упражнения —
                «Легко / Норм / Тяжело», каждая отмечает подход и запускает
                отдых. Снять отметку — номер подхода → «Снять отметку» */}
            {!inRound && editable && set.state === 'pending' && nextOf(ex, si) && effortChooser((effort) => {
              const lack = missing(set, track);
              if (lack) { setMessage(lack); return; }
              updateExercise(ei, x => rateSet(x, si, effort).ex);
              // Отдых начинается там, где человек нажал: подход отмечен —
              // время пошло. Длительность — по оценке и по тому, прибавили
              // ли вес (effort.js)
              if (restAfter) startRest(restFor(effort, state.current && state.current.session.restSeconds, rateSet(ex, si, effort).raised));
            }, current)}
            {set.state === 'pending' && set.suggest && (() => {
              // Только у ближайшего: сразу за отмеченным подходом того же человека
              const prev = ex.sets.slice(0, si).filter(x => (x.who || '') === (set.who || '')).pop();
              if (!prev || prev.state !== 'done') return null;
              const t = suggestText(set, prev);
              return t ? <p className={'workout__suggest workout__suggest--' + set.suggest}><IconDelta value={t.startsWith('+') ? 1 : -1} />{t}</p> : null;
            })()}
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
            {set.state === 'skipped' && !inRound && openSet !== key && <p className="workout__skipped">Пропущен — нажмите номер, чтобы вернуть</p>}
            {!inRound && openSet === key && <div className="workout__set-options">
              {setExtras(ex, ei, si)}
              <div className="workout__toolbar">
                <label>Тип<select value={set.kind} onChange={e => updateSet(ei, si, s => ({ ...s, kind: e.target.value }))}><option value="work">Рабочий</option><option value="warmup">Разминка</option></select></label>
                {setTools(ex, ei, si)}
                {set.state === 'done'
                  ? <button className="button" onClick={() => { setOpenSet(''); updateSet(ei, si, unrate); }}>Снять отметку</button>
                  : <button className="button" onClick={() => updateSet(ei, si, s => ({ ...s, state: s.state === 'skipped' ? 'pending' : 'skipped' }))}>{set.state === 'skipped' ? 'Вернуть' : 'Пропустить'}</button>}
              </div>
            </div>}
          </SwipeRow>;
  };

  /** Ближайший неотмеченный подход упражнения (у пары — своего человека) */
  const nextOf = (ex, si) => {
    const who = ex.sets[si].who || '';
    return ex.sets.findIndex(x => (x.who || '') === who && x.state === 'pending') === si;
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
    const key = ex.id + ':' + si;
    const current = focus.ex === ex.id && focus.set === si;
    const removeSet = () => { setUndo(s.exercises, 'Отрезок удалён'); setOpenSet(''); updateExercise(ei, ex => ({ ...ex, sets: ex.sets.filter((_, i) => i !== si) })); };
    return <SwipeRow className={'workout__set workout__set--cardio' + (set.state === 'done' ? ' workout__set--done' : '') + (current ? ' workout__set--current' : '')} key={si} data-flip={key} data-flip-delay={si * 90}
      disabled={inRound || ex.sets.length === 1 || !editable} label={`Удалить отрезок ${si + 1}`} onDelete={removeSet}>
      <div className="workout__cardio-head">
        {inRound
          ? <span>{/^\d+$/.test(label) ? 'Отрезок ' + label : label}</span>
          : <button type="button" className="workout__set-num" aria-expanded={openSet === key} aria-label={`${ex.name}, отрезок ${si + 1}: настройки`} onClick={() => setOpenSet(openSet === key ? '' : key)}>
            <span>{/^\d+$/.test(label) ? 'Отрезок ' + label : label}{set.kind === 'warmup' ? ' · разминка' : ''}</span><IconSliders size={12} aria-hidden="true" />
          </button>}
        {!inRound && set.state === 'done' && <span className="workout__cardio-done"><IconCheck size={16} /> сделан</span>}
      </div>
      <div className="workout__cardio-grid">
        {fields.map(f => (
          <label key={f.key}><span>{f.head}</span><input aria-label={`${ex.name}, отрезок ${si + 1}, ${f.head.toLowerCase()}`} inputMode={f.mode} placeholder={f.placeholder || ''} maxLength={f.max} value={set[f.key] || ''} onChange={e => edit(f.key, e.target.value)} /></label>
        ))}
      </div>
      {/* Как у силовых: отрезок отмечается оценкой, она же запускает отдых */}
      {!inRound && editable && set.state === 'pending' && nextOf(ex, si) && effortChooser((effort) => {
        const lack = missing(set, track);
        if (lack) { setMessage(lack); return; }
        updateSet(ei, si, s => ({ ...s, state: 'done', effort }));
        if (restAfter) startRest(restFor(effort, state.current && state.current.session.restSeconds));
      }, current)}
      {!inRound && openSet === key && <div className="workout__set-options">
        <div className="workout__toolbar">
          <label>Тип<select value={set.kind} onChange={e => updateSet(ei, si, s => ({ ...s, kind: e.target.value }))}><option value="work">Рабочий</option><option value="warmup">Разминка</option></select></label>
          {set.state === 'done'
            ? <button className="button" onClick={() => { setOpenSet(''); updateSet(ei, si, unrate); }}>Снять отметку</button>
            : <button className="button" onClick={() => updateSet(ei, si, s => ({ ...s, state: s.state === 'skipped' ? 'pending' : 'skipped' }))}>{set.state === 'skipped' ? 'Вернуть' : 'Пропустить'}</button>}
        </div>
      </div>}
    </SwipeRow>;
  };

  /** В занятии уже есть оценка — подсказку под кнопками больше не показываем */
  const rated = () => !!(state.current && state.current.session.exercises.some(e => e.sets.some(x => x.effort)));

  /**
   * Выбор оценки подхода (круга): три кнопки, каждая отмечает и запускает
   * отдых — короче после «Легко», дольше после «Тяжело» (effort.js)
   */
  const effortChooser = (onPick, current = true) => (
    <>
      <div className={'workout__effort' + (current ? '' : ' workout__effort--quiet')} role="group" aria-label="Подход сделан — как прошло?">
        {EFFORTS.map(e => (
          <button type="button" key={e.key} className={'workout__effort-btn workout__effort-btn--' + e.key}
            onClick={() => { haptic(); unlockAlarm(); onPick(e.key); }}>{e.label}</button>
        ))}
      </div>
      {/* Что значат кнопки — под текущими, пока в занятии нет ни одной оценки */}
      {current && !rated() && <p className="workout__effort-hint">{EFFORT_HINT}</p>}
    </>
  );

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
   * Оценка упражнения в круге суперсета (03.10.2026, владелец): у каждого
   * упражнения свои «Легко / Норм / Тяжело», вес правится у каждого своим
   * шагом. Не последнее в круге — это «дальше»: отмечает и ведёт к
   * следующему без отдыха. Последнее — запускает отдых по всему кругу
   * (roundRest). Сделанное в незаконченном круге — плашкой с оценкой,
   * касание снимает отметку.
   */
  const memberEffort = (members, k, r) => {
    if (!editable) return null;
    const { ex, ei } = members[k];
    const set = ex.sets[r];
    const group = ex.supersetGroup;
    const live = members.filter(({ ex: e }) => e.sets[r] && e.sets[r].state !== 'skipped');
    if (set.state === 'done') {
      if (live.every(({ ex: e }) => e.sets[r].state === 'done')) return null;
      return <button type="button" className="workout__member-done" onClick={() => updateSet(ei, r, unrate)}>
        <span className={'workout__effort-dot workout__effort-dot--' + (set.effort || 'ok')} aria-hidden="true" />
        {(set.effort ? EFFORT_WORD[set.effort] : 'сделано')} · снять
      </button>;
    }
    if (set.state !== 'pending') return null;
    // Только в ближайшем незаконченном круге
    const open = (i) => members.some(({ ex: e }) => e.sets[i] && e.sets[i].state === 'pending');
    if (Array.from({ length: r }, (_, i) => i).some(open)) return null;
    const waiting = live.filter(({ ex: e }) => e.sets[r].state === 'pending');
    const last = waiting.length === 1;
    const after = members.slice(k + 1).find(({ ex: e }) => e.sets[r] && e.sets[r].state === 'pending');
    const key = group + ':' + r;
    const pick = (effort) => {
      const why = missing(set, trackOf(ex));
      if (why) { setRoundLack({ key, text: ex.name + ': ' + why.replace(/ перед отметкой.*$/, '').toLowerCase() }); return; }
      setRoundLack(null);
      const rated = rateSet(ex, r, effort);
      updateExercise(ei, x => rateSet(x, r, effort).ex);
      if (!last) return;
      // Круг закончен — отдых по всем оценкам круга
      const others = live.filter(m => m.ex.id !== ex.id).map(m => m.ex.sets[r]);
      const efforts = [...others.map(x => x.effort || 'ok'), effort];
      const raised = rated.raised || others.some(x => x.raised);
      startRest(roundRest(efforts, state.current && state.current.session.restSeconds, raised));
    };
    return <>
      {effortChooser(pick, waiting[0] && waiting[0].ex.id === ex.id)}
      {/* Подпись — по порядку круга: последнее упражнение запускает отдых */}
      <p className="workout__effort-next">{last || !after ? 'Последнее в круге — запустит отдых' : 'Без отдыха → ' + after.ex.name}</p>
    </>;
  };

  /**
   * Круг суперсета сделан — кнопка «Круг N выполнен», касание снимает
   * отметки со всего круга. Отмечают круг оценками у каждого упражнения
   * (memberEffort); чего не хватает — пишем под кругом с названием
   * упражнения: подсказка вверху экрана не видна за клавиатурой.
   */
  const roundCheck = (members, r) => {
    const group = members[0].ex.supersetGroup;
    const inRound = members.filter(({ ex }) => ex.sets[r] && ex.sets[r].state !== 'skipped');
    if (!inRound.length) return null;
    const done = inRound.every(({ ex }) => ex.sets[r].state === 'done');
    const key = group + ':' + r;
    const toggle = () => {
      setRoundLack(null);
      change(v => ({ ...v, exercises: v.exercises.map(e => (e.supersetGroup === group && e.sets[r] && e.sets[r].state === 'done'
        ? { ...e, sets: e.sets.map((x, i) => (i === r ? unrate(x) : x)) } : e)) }));
    };
    return <>
      {done && <button type="button" className="button button--block workout__round-check workout__round-check--done" aria-pressed onClick={toggle}>
        <IconCheck size={18} />{`Круг ${r + 1} выполнен`}
      </button>}
      {roundLack && roundLack.key === key && <p className="workout__round-lack" role="alert">{roundLack.text}</p>}
    </>;
  };

  /**
   * Настройки круга суперсета — одни на круг, а не у каждого упражнения:
   * разминочный круг, пропустить или убрать круг целиком. Поддержка,
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
    const currentHere = members.some(({ ex }) => ex.id === focus.ex);
    return <section className={'workout__exercise workout__rounds' + (currentHere ? ' workout__exercise--current' : '')} key={'g' + group} data-unit={'g' + group} data-flip-enter="" data-flip-scope={'sec:g' + group}>
      <div className="workout__rounds-head" onPointerDown={holdToMove('g' + group)}>
        <h3 data-flip={'name:' + members[0].ex.id}>Суперсет · {rounds} {rounds % 10 === 1 && rounds % 100 !== 11 ? 'круг' : [2, 3, 4].includes(rounds % 10) && ![12, 13, 14].includes(rounds % 100) ? 'круга' : 'кругов'}</h3>
        <button className="button button--ghost" onClick={split}>Разъединить</button>
      </div>
      <p className="small muted">Упражнения подряд, без отдыха; отдых — после круга.{editable ? ' Порядок внутри — подержите название и перетащите.' : ''}</p>
      {(members[0].ex.prescription || members.some(({ ex }) => ex.prevWeight)) && (
        <p className="small muted">{members.map(({ ex }) => ex.name + (ex.prescription ? ': ' + ex.prescription : '') + (ex.prevWeight && !ex.lastRun ? ' · было ' + ex.prevWeight : '')).join('; ')}</p>
      )}
      {members.filter(({ ex }) => lastRunText(ex.lastRun)).map(({ ex }) => (
        <p className="workout__last" key={'last' + ex.id}>{ex.name}: {lastRunText(ex.lastRun).replace(/^Последний раз/, 'последний раз')}</p>
      ))}
      {Array.from({ length: rounds }, (_, r) => (
        <div className="workout__round" key={r}>
          <h4 className="workout__round-title" data-flip-enter="" data-flip-delay={r * 90}>Круг {r + 1}</h4>
          {members.map(({ ex, ei }, k) => ex.sets[r] && (
            <div className="workout__round-item" key={ex.id} data-member={ex.id}>
              {renaming === ex.id + ':' + r
                ? nameEditor(ex, ei, ex.id + ':' + r)
                : <div className="workout__round-name" data-flip={r === 0 && k > 0 ? 'name:' + ex.id : undefined}
                  onPointerDown={holdToMove(ex.id, (head) => ({ container: head.closest('.workout__round'), commit: reorderMembers(group) }))}>
                  {/* Название — касанием: из базы или новое прямо здесь */}
                  <button type="button" className="workout__name-tap" onClick={() => startRename(ex.id + ':' + r)}>{ex.name}</button>
                  <span className="workout__round-units"> · {rowFields(trackOf(ex)).map(f => f.unit).join(' · ')}</span>
                </div>}
              {setRow(ex, ei, r, '', k === members.length - 1, true)}
              {memberEffort(members, k, r)}
            </div>
          ))}
          {roundCheck(members, r)}
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
   * Название упражнения — касанием (02.10.2026). Тренер выбирает из базы или
   * добавляет новое прямо здесь (ExercisePicker); у клиента базы нет —
   * просто поле. «Готово», Enter или уход с поля — закрыть.
   */
  const startRename = (id) => {
    if (swallowClick.current || !editable) return;
    setRenaming(id);
  };
  const nameEditor = (ex, ei, id) => (
    <div className="workout__rename" key={'rename-' + id}>
      {clientRow
        ? <NameFromBase ex={ex} autoFocus onPick={(patch) => updateExercise(ei, x => ({ ...x, ...patch }))} />
        : <input className="field__input" aria-label="Название упражнения" autoFocus value={ex.name} maxLength={160}
          onChange={e => updateExercise(ei, ({ exerciseId, ...x }) => ({ ...x, name: e.target.value }))}
          onKeyDown={e => { if (e.key === 'Enter') setRenaming(''); }} />}
      <button type="button" className="button button--ghost" onClick={() => setRenaming('')}>Готово</button>
    </div>
  );

  /**
   * Порядок — удержанием (02.10.2026), без кнопок «Выше/Ниже». Подержали
   * название ~0,45 с — карточки свернулись в строки, взятая едет за
   * пальцем, соседи расступаются; отпустили — встала. Суперсет едет целиком.
   * Сдвинули палец раньше — это прокрутка, перестановки нет.
   */
  const units = (list) => {
    const out = [];
    list.forEach(e => {
      const key = e.supersetGroup && list.filter(x => x.supersetGroup === e.supersetGroup).length > 1 ? 'g' + e.supersetGroup : e.id;
      const found = out.find(u => u.key === key);
      if (found) found.items.push(e); else out.push({ key, items: [e] });
    });
    return out;
  };
  /**
   * Порядок упражнений внутри суперсета — тем же удержанием, но только
   * среди своих (02.10.2026): строка ездит в пределах круга, из суперсета не
   * выходит. Порядок общий для всех кругов. ids — упражнения круга в новом
   * порядке; у кого в этом круге подхода нет — остаются на своих местах
   */
  const reorderMembers = (group) => (ids) => change(v => {
    const byId = new Map(v.exercises.map(e => [e.id, e]));
    const slots = v.exercises.map((e, i) => (e.supersetGroup === group && ids.includes(e.id) ? i : -1)).filter(i => i >= 0);
    const exercises = [...v.exercises];
    slots.forEach((at, k) => { exercises[at] = byId.get(ids[k]); });
    return { ...v, exercises };
  });
  const holdToMove = (key, inner = null) => (e) => {
    if (!editable || picking || reorder || drag.current || (e.button !== undefined && e.button !== 0)) return;
    // Внутри суперсета — не тащить заодно весь суперсет
    if (inner) e.stopPropagation();
    const x0 = e.clientX, y0 = e.clientY, id = e.pointerId, head = e.currentTarget;
    const off = () => {
      clearTimeout(timer);
      window.removeEventListener('pointermove', early);
      window.removeEventListener('pointerup', off);
      window.removeEventListener('pointercancel', off);
    };
    const early = (ev) => { if (ev.pointerId === id && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 8) off(); };
    const timer = setTimeout(() => { off(); begin(key, id, y0, head, inner && inner(head)); }, 450);
    window.addEventListener('pointermove', early);
    window.addEventListener('pointerup', off);
    window.addEventListener('pointercancel', off);
  };
  const begin = (key, pointerId, y0, head, inner = null) => {
    haptic('medium');
    setRenaming('');
    // Внутри суперсета карточки не сворачиваются — двигаются строки круга
    if (!inner) flushSync(() => setReorder({ key }));
    const root = inner ? inner.container : fieldsRef.current;
    if (!root) return;
    try { head.setPointerCapture && head.setPointerCapture(pointerId); } catch (_) {}
    const rows = inner ? [...root.querySelectorAll(':scope > [data-member]')] : [...root.querySelectorAll('[data-unit]')];
    const from = rows.findIndex(r => (inner ? r.dataset.member : r.dataset.unit) === key);
    if (from < 0) { if (!inner) setReorder(null); return; }
    // Карточки свернулись — строка уехала из-под пальца: прокрутить так,
    // чтобы она снова была под ним (остаток — сдвигом самой строки)
    const was = rows[from].getBoundingClientRect();
    if (!inner) window.scrollBy(0, was.top + was.height / 2 - y0);
    const rects = rows.map(r => r.getBoundingClientRect());
    const centerOf = (r) => r.top + r.height / 2;
    rows[from].style.transform = `translate3d(0, ${y0 - centerOf(rects[from])}px, 0)`;
    const gap = rects.length > 1 ? Math.max(0, rects[1].top - rects[0].bottom) : 8;
    const g = { key, from, to: from, rows, rects, gap, y0, pointerId };
    drag.current = g;
    rows[from].classList.add('workout__exercise--lifted');
    // Пока тащат — страница не листается
    const stopScroll = (ev) => ev.preventDefault();
    const move = (ev) => {
      if (ev.pointerId !== pointerId) return;
      // Середина строки — под пальцем
      // Внутри суперсета — не дальше первой и последней строки круга
      const center = inner
        ? Math.max(centerOf(rects[0]), Math.min(centerOf(rects[rects.length - 1]), ev.clientY))
        : ev.clientY;
      const dy = center - centerOf(rects[from]);
      // Новое место — за всеми, чью середину строка перешла
      let to = from;
      rects.forEach((r, k) => {
        const mid = r.top + r.height / 2;
        if (k > from && center >= mid) to = Math.max(to, k);
        if (k < from && center <= mid) to = Math.min(to, k);
      });
      const shift = rects[from].height + gap;
      rows.forEach((row, k) => {
        if (k === from) { row.style.transform = `translate3d(0, ${dy}px, 0)`; return; }
        let s = 0;
        if (from < to && k > from && k <= to) s = -shift;
        if (from > to && k >= to && k < from) s = shift;
        row.style.transform = s ? `translate3d(0, ${s}px, 0)` : '';
      });
      if (to !== g.to) { g.to = to; haptic('light'); }
    };
    const finish = (ev) => {
      if (ev.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      document.removeEventListener('touchmove', stopScroll);
      rows.forEach(row => { row.style.transform = ''; row.classList.remove('workout__exercise--lifted'); });
      drag.current = null;
      // Касание после перетаскивания — не «переименовать»
      swallowClick.current = true;
      setTimeout(() => { swallowClick.current = false; }, 350);
      if (ev.type === 'pointerup' && g.to !== from && inner) {
        const ids = rows.map(r => r.dataset.member);
        const [moved] = ids.splice(from, 1);
        ids.splice(g.to, 0, moved);
        inner.commit(ids);
      } else if (ev.type === 'pointerup' && g.to !== from) {
        change(v => {
          const list = units(v.exercises);
          const [moved] = list.splice(from, 1);
          list.splice(g.to, 0, moved);
          return { ...v, exercises: list.flatMap(u => u.items) };
        });
      }
      if (!inner) setReorder(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    document.addEventListener('touchmove', stopScroll, { passive: false });
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
    const canJoin = !a.sets.some(x => x.who) && !b.sets.some(x => x.who);
    // Вставить упражнение прямо здесь — между этими двумя, а не в конец.
    // Нижние карточки съезжают вниз, освобождая место, новая проявляется
    const add = () => { flip('', { duration: 380, only: 'sec:' }); change(v => {
      const exercises = [...v.exercises];
      const at = exercises.findIndex(e => e.id === b.id);
      exercises.splice(at, 0, { id: uid(), name: 'Новое упражнение', note: '', prescription: '', prevWeight: '', sets: [blankSet()] });
      return { ...v, exercises };
    }); };
    const join = () => {
      const group = a.supersetGroup || b.supersetGroup || 'superset-' + uid();
      const merged = [a.supersetGroup, b.supersetGroup].filter(Boolean);
      flip('name:' + ((a.supersetGroup ? list.find(e => e.supersetGroup === a.supersetGroup) : a).id));
      change(v => ({ ...v, exercises: v.exercises.map(e => (e.id === a.id || e.id === b.id || merged.includes(e.supersetGroup) ? { ...e, supersetGroup: group } : e)) }));
    };
    return (
      <div className="workout__between">
        <button type="button" className="workout__join" disabled={list.length >= 30} onClick={add}><IconPlus aria-hidden="true" />Упражнение</button>
        {canJoin && <button type="button" className="workout__join" onClick={join}><IconLinkPair aria-hidden="true" />Соединить в суперсет</button>}
      </div>
    );
  };

  const togglePick = (id) => setPicked(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const endPick = () => { setPicking(false); setPicked(new Set()); };
  // Кнопкой «Выбрать» — к началу короткого списка; щипок держит место сам
  const pickFromButton = () => {
    setPicking(true);
    (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => setTimeout(fn, 0))(() => {
      const first = document.querySelector && document.querySelector('.workout__exercise');
      if (first && first.scrollIntoView) first.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  };
  // Щипок: свели пальцы — выбор упражнений (удалить, суперсет), развели — обычный вид
  usePinch({
    // Своя проверка, а не editable: та объявлена ниже, в разметке
    enabled: !!record && ['active', 'paused'].includes(record.session && record.session.status),
    // Вслед за пальцами упражнения ужимаются до строк названия (pinch.js)
    target: () => document.querySelector && document.querySelector('.workout'),
    collapsed: picking,
    morph: {
      items: () => document.querySelectorAll && document.querySelectorAll('.workout__exercise'),
      head: '.workout__ex-head, .workout__rounds-head',
      rows: '.workout__exercise--compact',
    },
    onIn: () => { if (!picking) setPicking(true); },
    onOut: () => { if (picking) endPick(); },
  });
  const pickDelete = () => {
    const ids = new Set(picked);
    const snapshot = record.session.exercises;
    // Выйти из выбора до рассыпания: полоски между карточками в выборе
    // спрятаны, и узнать, какие из них уйдут, можно только когда они есть
    flushSync(endPick);
    const cards = [...ids].map(id => fieldsRef.current && fieldsRef.current.querySelector(`[data-flip-scope="sec:${id}"]`)).filter(Boolean);
    vanish(cards, () => {
      setUndo(snapshot, ids.size === 1 ? 'Упражнение удалено' : 'Удалено упражнений: ' + ids.size);
      change(v => ({ ...v, exercises: v.exercises.filter(e => !ids.has(e.id)) }));
    }, leavingBars(cards));
  };
  /**
   * Полоски «+ Упражнение / Соединить», которые исчезнут вместе с
   * карточками: полоска стоит перед карточкой и живёт, пока у той
   * остаётся сосед сверху. Уходят — вместе, иначе в конце ступенька.
   */
  const leavingBars = (cards) => {
    const root = fieldsRef.current;
    if (!root || !cards.length) return [];
    const gone = (node) => {
      if (cards.includes(node)) return true;
      const inner = node.matches('.workout__exercise') ? [] : [...node.querySelectorAll('.workout__exercise')];
      return inner.length > 0 && inner.every((card) => cards.includes(card));
    };
    const parent = cards[0].parentElement;
    const bars = [];
    let alive = false;
    [...parent.children].forEach((node) => {
      if (node.matches('.workout__between')) {
        const owner = node.nextElementSibling;
        if (!owner || gone(owner) || !alive) bars.push(node);
        return;
      }
      if (!gone(node) && (node.matches('.workout__exercise') || node.querySelector('.workout__exercise'))) alive = true;
    });
    return bars;
  };
  // Копия — сразу за своим упражнением, с неотмеченными подходами
  const pickCopy = () => {
    change(v => ({
      ...v,
      exercises: v.exercises.flatMap(e => (picked.has(e.id)
        ? [e, { ...e, id: uid(), supersetGroup: '', note: '', sets: e.sets.map(x => ({ ...x, state: 'pending' })) }]
        : [e])).slice(0, 30),
    }));
    endPick();
  };
  // Выбранные — в один суперсет; вместе с их прежними группами
  const pickSuperset = () => {
    const first = record.session.exercises.find(e => picked.has(e.id));
    flip('name:' + first.id);
    const group = 'superset-' + uid();
    change(v => {
      // Суперсет делают подряд: выбранные встают за первым из них
      const chosen = v.exercises.filter(e => picked.has(e.id)).map(e => ({ ...e, supersetGroup: group }));
      const at = v.exercises.findIndex(e => picked.has(e.id));
      const rest = v.exercises.filter(e => !picked.has(e.id));
      const before = v.exercises.slice(0, at).filter(e => !picked.has(e.id)).length;
      return { ...v, exercises: [...rest.slice(0, before), ...chosen, ...rest.slice(before)] };
    });
    endPick();
  };

  const s = record?.session;

  // «Как настроить тренажёр» — только проверенные тренером инструкции к
  // упражнениям из базы. Грузим раз на набор упражнений: занятие правят
  // часто, а список id при этом почти не меняется.
  const setupIds = s ? [...new Set(s.exercises.map(e => e.exerciseId).filter(Boolean))].sort((a, b) => a - b).join(',') : '';
  const [setups, setSetups] = useState({});
  useEffect(() => {
    if (!setupIds) return undefined;
    let alive = true;
    apiPublic('exercise.setup', { ...params, ids: setupIds })
      .then(r => { if (alive && r && r.setups) setSetups(r.setups); })
      .catch(() => {});
    return () => { alive = false; };
  }, [setupIds]);

  // Куда смотреть: первое упражнение с неотмеченным подходом и этот
  // подход. Оно обведено, подход подсвечен, его «готово» — залито; всё
  // остальное тише. Иначе в зале глаза разбегаются по одинаковым строкам.
  const focus = focusOf(s);
  const stats = s ? summary(s) : null;
  const editable = s && ['active', 'paused'].includes(s.status);
  const elapsed = s ? s.elapsedMs + (s.status === 'active' ? Math.max(0, now - record.tick) : 0) : 0;
  return <div className="workout">
    <button className="button" onClick={close}>{backLabel}</button>
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
          <span style={{ transform: `scaleX(${stats.done / (stats.total || 1)})` }} />
        </div>
        <p className="workout__status" role="status">{busy ? 'Сохраняем…' : record.dirty ? 'Есть несохранённые изменения' : 'Сохранено в облаке'}</p>
      </header>
      <fieldset disabled={!editable || !!conflict} className="workout__fields" ref={fieldsRef}>
        <label className="workout__field">Название занятия<input value={s.title} maxLength={160} onChange={e => change(s => ({ ...s, title: e.target.value }))} /></label>
        {editable && <div className="workout__toolbar">
          <button className="button" onClick={() => change(s => ({ ...s, status: s.status === 'active' ? 'paused' : 'active', restUntil: 0 }))}>{s.status === 'active' ? 'Пауза' : 'Продолжить'}</button>
          <button className="button button--ghost workout__pick-toggle" onClick={() => (picking ? endPick() : pickFromButton())}>{picking ? 'Готово' : 'Выбрать'}</button>
          {/* Длительность не только запускает отдых, но и запоминается:
              дальше он стартует сам после каждого отмеченного подхода.
              Раньше за ним приходилось возвращаться в шапку экрана
              после каждого подхода — то есть листать вверх весь список. */}
          <label>Отдых <select aria-label="Таймер отдыха" value={String(s.restSeconds || 0)} onChange={e => { const seconds = Number(e.target.value); change(v => ({ ...v, restSeconds: seconds })); if (seconds) startRest(seconds); else change(v => ({ ...v, restUntil: 0 })); }}><option value="0">Вручную</option><option value="60">1 мин</option><option value="90">1:30</option><option value="120">2 мин</option><option value="180">3 мин</option></select></label>
        </div>}
        {/* Полоса отдыха прижата к низу экрана, а не стоит в шапке: между
            подходами человек листает список упражнений вниз, и таймер,
            оставшийся наверху, приходилось искать прокруткой. */}
        {!!s.restUntil && s.status === 'active' && <RestScreen
          until={s.restUntil}
          total={restSpan.current.until === s.restUntil ? restSpan.current.total : (s.restSeconds || 90) * 1000}
          now={now}
          next={nextInfo(s, focus)}
          onMore={extendRest}
          onStop={() => change(v => ({ ...v, restUntil: 0 }))}
        />}
        {s.exercises.map((ex, ei) => {
          const group = ex.supersetGroup;
          const members = group ? s.exercises.map((e, i) => ({ ex: e, ei: i })).filter(m => m.ex.supersetGroup === group) : [];
          // Круги — для обычного суперсета; у сплита подходы по людям, там по-старому
          if (members.length > 1 && !members.some(m => m.ex.sets.some(x => x.who))) {
            if (members[0].ei !== ei) return null;
            // В режиме выбора и пока тащат — одной строкой, как остальные
            // упражнения. Та же разметка шапки, что у развёрнутого: палец
            // держит её во время перестановки, её нельзя пересоздать
            if (picking || reorder) {
              return <section className="workout__exercise workout__exercise--compact" key={'g' + group} data-unit={'g' + group}>
                <div className="workout__rounds-head" onPointerDown={holdToMove('g' + group)}><h3><span className="workout__ex-num">{ei + 1}</span> Суперсет: {members.map(m => m.ex.name).join(' + ')}</h3></div>
              </section>;
            }
            return <React.Fragment key={'g' + group}>{joinBefore(ei)}{supersetBlock(members)}</React.Fragment>;
          }
          const doneSets = ex.sets.filter(x => x.state !== 'pending').length;
          const finished = doneSets === ex.sets.length;
          const [main, ...rest] = String(ex.prescription || '').split(' · ').filter(Boolean);
          const compact = picking || !!reorder;
          return <React.Fragment key={ex.id}>{!compact && joinBefore(ei)}<section className={'workout__exercise' + (focus.ex === ex.id ? ' workout__exercise--current' : '') + (finished ? ' workout__exercise--done' : '') + (picking && picked.has(ex.id) ? ' workout__exercise--picked' : '') + (compact ? ' workout__exercise--compact' : '')} key={ex.id} data-unit={ex.id} data-flip-enter="" data-flip-scope={'sec:' + ex.id}>
          <SwipeRow className="workout__ex-swipe" removeClosest=".workout__exercise" removeWith={(card) => leavingBars([card])} disabled={compact || s.exercises.length === 1 || !editable} label={`Удалить упражнение «${ex.name}»`}
            onDelete={() => { setUndo(s.exercises, 'Упражнение удалено'); change(v => ({ ...v, exercises: v.exercises.filter(e => e.id !== ex.id) })); }}>
          <div className={'workout__ex-head' + (picking ? ' workout__ex-head--pick' : '')} onPointerDown={picking ? undefined : holdToMove(ex.id)} {...(picking ? { role: 'checkbox', 'aria-checked': picked.has(ex.id), tabIndex: 0, onClick: () => togglePick(ex.id), onKeyDown: (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); togglePick(ex.id); } } } : {})}>
            {picking && <span className={'workout__pick' + (picked.has(ex.id) ? ' is-on' : '')} aria-hidden="true">{picked.has(ex.id) && <IconCheck size={14} />}</span>}
            <h3 data-flip={'name:' + ex.id}><span className="workout__ex-num">{ei + 1}</span> {compact
              ? (ex.name || 'Новое упражнение')
              // Название — касанием: из базы или новое прямо здесь
              : <button type="button" className="workout__name-tap" onClick={() => startRename(ex.id)}>{ex.name || 'Новое упражнение'}</button>}</h3>
            <span className="workout__ex-count" aria-label={`Сделано ${doneSets} из ${ex.sets.length}`}>{finished ? <IconCheck size={16} /> : null}{doneSets}/{ex.sets.length}</span>
          </div>
          </SwipeRow>
          {/* Режим выбора — свёрнутый: одна строка на упражнение, чтобы
              выделять, удалять и собирать суперсет, не листая подходы */}
          {!compact && renaming === ex.id && nameEditor(ex, ei, ex.id)}
          {!compact && <>
          {supersetMark(s.exercises, ei) && <p className="workout__superset">{supersetMark(s.exercises, ei)}</p>}
          {ex.exerciseId && setups[ex.exerciseId] && (
            <details className="workout__setup"><summary>Как настроить тренажёр</summary><SetupText text={setups[ex.exerciseId].setup} /></details>
          )}
          {(main || ex.prevWeight) && (
            <p className="workout__target">
              {main && <strong>{main}</strong>}
              {rest.map((r, i) => <span key={i}>{r}</span>)}
              {ex.prevWeight && !ex.lastRun && <span className="workout__prev">было {ex.prevWeight}</span>}
            </p>
          )}
          {/* Последнее выполнение клиентом — с повторами и оценкой */}
          {lastRunText(ex.lastRun) && <p className="workout__last">{lastRunText(ex.lastRun)}</p>}
          <details><summary>Изменить упражнение</summary>
            {clientRow
              ? <NameFromBase ex={ex} onPick={(patch) => updateExercise(ei, x => ({ ...x, ...patch }))} />
              : <label className="workout__field">Название<input value={ex.name} maxLength={160} onChange={e => updateExercise(ei, ({ exerciseId, ...ex }) => ({ ...ex, name: e.target.value }))} /></label>}
            {trackEditor(ex, ei)}
            <p className="small muted">Порядок — подержите название упражнения и перетащите.</p>
          </details>
          {trackOf(ex).kind === 'cardio' && ex.cardio && ex.cardio.intervals && <IntervalTimer intervals={ex.cardio.intervals} track={trackOf(ex)} />}
          {trackOf(ex).kind !== 'cardio' && <div className={'workout__set-head' + (ex.sets.some(x => x.who) ? ' workout__set-head--who' : '')} style={{ '--cols': rowFields(trackOf(ex)).length }} aria-hidden="true"><span>{trackOf(ex).kind === 'cardio' ? 'Отрезок' : 'Подход'}</span>{rowFields(trackOf(ex)).map(f => <span key={f.key}>{f.head}</span>)}</div>}
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
              <button className="button button--ghost button--block workout__add" disabled={ex.sets.length + round.length > 20} onClick={() => updateExercise(ei, ex => ({ ...ex, sets: [...ex.sets, ...round] }))}>
                {who.length > 1 ? 'Добавить круг' : trackOf(ex).kind === 'cardio' ? 'Добавить отрезок' : 'Добавить подход'}
              </button>
            );
          })()}
          {/* Заметка — свёрнута, пока пустая: поле ввода на всю ширину в
              каждом упражнении перетягивало взгляд с подходов */}
          <details className="workout__note" {...(ex.note ? { open: true } : {})}>
            <summary>{ex.note ? 'Заметка' : 'Добавить заметку'}</summary>
            <textarea aria-label="Заметка к упражнению" value={ex.note} maxLength={500} rows={2} onChange={e => updateExercise(ei, ex => ({ ...ex, note: e.target.value }))} />
          </details>
          </>}
        </section></React.Fragment>;
        })}
        {undo && (
          <div className="workout__undo" role="status">
            <span>{undoText}</span>
            <button type="button" className="button button--ghost" onClick={() => { change(s => ({ ...s, exercises: undo })); setUndo(null); }}>Вернуть</button>
          </div>
        )}
        {picking && (
          <div className="workout__pick-bar" role="toolbar" aria-label="Действия с выбранными упражнениями">
            <span className="workout__pick-count">{picked.size ? 'Выбрано ' + picked.size : 'Отметьте упражнения'}</span>
            <button type="button" className="button" disabled={picked.size < 2 || s.exercises.some(e => picked.has(e.id) && e.sets.some(x => x.who))} onClick={pickSuperset}>
              <IconLinkPair size={16} />Суперсет
            </button>
            <button type="button" className="button" disabled={!picked.size} onClick={pickCopy}>Дублировать</button>
            <button type="button" className="button button--critical" disabled={!picked.size || picked.size >= s.exercises.length} onClick={pickDelete}>Удалить</button>
          </div>
        )}
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
      {!history.length && <p className="small muted">Здесь появятся проведённые занятия и их результаты.</p>}
      {/* Удаление только у тренера: журнал — это его записи о клиенте.
          Смахнуть влево — как в списках iPhone; вместо вопроса «навсегда?»
          — «Вернуть» внизу, пока удаление не ушло на сервер */}
      {history.filter(s => !erase.hidden(s.id)).map(s => <SwipeRow className="workout__history-row" key={s.id}
        disabled={!clientRow || clientView} label={'Удалить занятие ' + s.title}
        onDelete={() => erase.remove(s.id, s.id, 'Занятие удалено')}>
        <button className="workout__history" disabled={busy} onClick={() => open(s.id)}><strong>{s.title}</strong><span>{new Date(s.startedAt).toLocaleDateString('ru-RU')} · {labels[s.status]} · {s.done} подходов</span></button>
      </SwipeRow>)}
      {erase.bar}
    </>}
  </div>;
}

/**
 * Отдых на весь экран (03.10.2026, владелец): крупный таймер, касание по
 * экрану ничего не делает — выключить можно только кнопкой. Под таймером —
 * что дальше. В конце — «Отдых окончен», звук и вибрация каждые 2 с, пока
 * не нажмут «Закрыть» (не дольше двух минут). Свёрнутое приложение
 * сигналит уведомлением (native-rest.js) и плашкой (Live Activity).
 */
function RestScreen({ until, total, now, next, onMore, onStop }) {
  const left = until - now;
  const over = left <= 0;
  useEffect(() => {
    if (!over) return undefined;
    // iPhone с будильником (iOS 26+) звенит сам — второй звук не нужен
    if (alarmRings(until)) return undefined;
    let n = 0;
    ringOnce();
    const timer = setInterval(() => { n += 1; if (n >= 60) { clearInterval(timer); return; } ringOnce(); }, 2000);
    return () => { clearInterval(timer); stopVibration(); };
  }, [over, until]);
  const share = over ? 1 : Math.max(0, Math.min(1, left / Math.max(1, total)));
  const R = 120;
  const C = 2 * Math.PI * R;
  return (
    <div className={'rest-screen' + (over ? ' rest-screen--over' : '')} role="dialog" aria-modal="true" aria-label={over ? 'Отдых окончен' : 'Отдых'}>
      <div className="rest-screen__label">{over ? 'Отдых окончен' : 'Отдых'}</div>
      <div className="rest-screen__dial">
        <svg className="rest-screen__ring" viewBox="0 0 280 280" aria-hidden="true">
          <circle cx="140" cy="140" r={R} className="rest-screen__track" />
          <circle cx="140" cy="140" r={R} className="rest-screen__bar" strokeDasharray={`${C * share} ${C}`} transform="rotate(-90 140 140)" />
        </svg>
        <div className="rest-screen__time" role="timer" aria-live="off">{over ? '0:00' : clock(left)}</div>
      </div>
      {next && (
        <div className="rest-screen__next">
          {/* Название — заголовок карточки, подход — под ним: без надписи
              капслоком сверху (craft-floor). «Дальше» и так ясно из экрана */}
          <p className="rest-screen__next-name">{next.name}</p>
          <p className="rest-screen__next-part">{next.part.charAt(0).toUpperCase() + next.part.slice(1)}</p>
          {next.load && <p className="rest-screen__next-load">{next.load}</p>}
          {next.change && <div className={'rest-screen__next-change rest-screen__next-change--' + next.change.kind}>
            {(next.change.kind === 'up' || next.change.kind === 'down') && <IconDelta value={next.change.kind === 'up' ? 1 : -1} />}
            {next.change.text}
          </div>}
        </div>
      )}
      <div className="rest-screen__actions">
        {over
          ? <button type="button" className="button button--primary rest-screen__main" onClick={onStop}>Закрыть</button>
          : <>
            <button type="button" className="button rest-screen__more" onClick={onMore}>+30 с</button>
            <button type="button" className="button button--primary rest-screen__main" onClick={onStop}>Закончить отдых</button>
          </>}
      </div>
    </div>
  );
}

/** Ближайший подход занятия; в суперсете — следующее упражнение того же круга */
function focusOf(s) {
  const list = (s && s.exercises) || [];
  for (let i = 0; i < list.length; i += 1) {
    const si = list[i].sets.findIndex(x => x.state === 'pending');
    if (si === -1) continue;
    const group = list[i].supersetGroup;
    if (group) {
      const mates = list.filter(e => e.supersetGroup === group);
      const r = Math.min(...mates.map(e => { const j = e.sets.findIndex(x => x.state === 'pending'); return j === -1 ? Infinity : j; }));
      const who = mates.find(e => e.sets[r] && e.sets[r].state === 'pending');
      if (who) return { ex: who.id, set: r };
    }
    return { ex: list[i].id, set: si };
  }
  return { ex: '', set: -1 };
}

/** «Присед со штангой · подход 2 из 5 · 90 кг × 5» — для уведомлений */
function nextText(s) {
  const n = s ? nextInfo(s, focusOf(s)) : null;
  return n ? [n.name, n.part, n.load].filter(Boolean).join(' · ') : '';
}

/**
 * Что дальше — для экрана отдыха (владелец, 03.10.2026): куда идти и что
 * накинуть или снять. Тот же человек и то же упражнение — разница с
 * прошлым подходом; другое упражнение — «новое» и вес с прошлого раза
 */
function nextInfo(s, focus) {
  const ex = s.exercises.find(e => e.id === focus.ex);
  const set = ex && ex.sets[focus.set];
  if (!set) return null;
  const num = (v) => Number(String(v || '').replace(',', '.'));
  const kg = (v) => String(Math.round(v * 100) / 100).replace('.', ',');
  const own = ex.sets.filter(x => (x.who || '') === (set.who || ''));
  const part = (set.who ? set.who + ' · ' : '') + 'подход ' + (own.indexOf(set) + 1) + ' из ' + own.length;
  const load = [set.weight ? kg(num(set.weight)) + ' кг' : '', set.reps ? '× ' + set.reps : ''].filter(Boolean).join(' ');
  const prev = own.slice(0, own.indexOf(set)).filter(x => x.state === 'done').pop();
  let change = null;
  if (prev && set.weight && prev.weight) {
    const d = num(set.weight) - num(prev.weight);
    change = d > 0 ? { kind: 'up', text: 'накинуть ' + kg(d) + ' кг' }
      : d < 0 ? { kind: 'down', text: 'снять ' + kg(-d) + ' кг' }
        : { kind: 'same', text: 'вес тот же' };
  } else if (!prev) {
    change = { kind: 'new', text: 'новое упражнение' + (ex.prevWeight ? ' · в прошлый раз ' + String(ex.prevWeight).replace('.', ',') : '') };
  }
  return { name: ex.name, part, load, change };
}

/**
 * Название упражнения с подсказками из базы — как в редакторе программы
 * (ExercisePicker): набрал «жим» — выбрал из списка, и занятие получает
 * тип учёта и технику из базы. Только у тренера: база упражнений — его.
 */
function NameFromBase({ ex, onPick, autoFocus = false }) {
  const library = useData('library.exercises', {}, []);
  const exercises = library.data ? library.data.exercises : [];
  return <div className="workout__field">Название
    <ExercisePicker
      autoFocus={autoFocus}
      value={ex.name}
      exerciseId={ex.exerciseId}
      exercises={exercises}
      onPick={({ name, exerciseId }) => {
        const base = exerciseId && exercises.find((x) => x.id === exerciseId);
        onPick({ name, exerciseId: exerciseId || null, ...(base && base.track ? { track: base.track } : {}) });
      }}
      onAdded={() => library.reload()}
    />
  </div>;
}
