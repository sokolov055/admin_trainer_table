import React, { useEffect, useRef, useState } from 'react';
import { flushSync, createPortal } from 'react-dom';
import { apiPublic, apiMutate } from './api.js';
import { storageKey } from './workout-draft.js';
import { haptic } from './telegram.js';
import { blankSet, clock, fromPlan, summary, uid, setLabel, replacementPlan, replaceWorkoutExercise, withMachine, withMemberMachine } from './workout-model.js';
import { IconCheck, IconClose, IconLinkPair, IconSliders, IconPlus, IconDelta, IconChevron } from './icons.jsx';
import { useBackGesture, useTabLock } from './gestures.jsx';
import SwipeRow from './SwipeRow.jsx';
import { usePendingDelete } from './pendingDelete.jsx';
import { vanish } from './remove.js';
import { useFlip } from './flip.js';
import { METRICS, trackOf, rowFields as trackFields, missing, metricField, settingsFields, setOneSide, planScheme, planSet, cardioFrom, cardioGoal, intervalsTotals, isFunctional, setIntervals } from './exercise-track.js';

// Вес на одну сторону — у каждого подхода своя отметка (07.10.2026), поэтому
// в заголовке колонки просто «Вес, кг», а не «Кг / сторона» на всё упражнение
const rowFields = (track) => trackFields({ ...track, perSide: false });
import CardioPlan, { CardioKind, IntervalsRow } from './trainer/CardioPlan.jsx';
import ExerciseKind, { saveExerciseTrack } from './ExerciseKind.jsx';
import { localRestPlatform, scheduleRestEnd, cancelRestEnd, alarmMovedTo } from './native-rest.js';
import { showWorkoutActivity, endWorkoutActivity, takePendingRest, takeActions, applyActions, setWorkoutOpen, onWatchState, onLiveAction, isCoaching } from './native-activity.js';
import './workout.css';
import { usePinch } from './pinch.js';
import ExercisePicker from './trainer/ExercisePicker.jsx';
import { useData } from './useData.js';
import { SetupText, MachineInfo, MachineNote, Media } from './media.jsx';
import { MuscleFigure, MuscleNames } from './muscles/MuscleMap.jsx';
import { EFFORTS, EFFORT_WORD, EFFORT_HINT, restFor, roundRest, rateSet, unrate, suggestText, lastRunText, wasSet, scaleTo } from './effort.js';
import { unlockAlarm } from './rest-alarm.js';
import { RestScreen, RestPill } from './RestScreen.jsx';
import { restHere, setRestHere, workoutScreenOpen, restClosed } from './rest-here.js';

const labels = { active: 'Идёт', paused: 'На паузе', completed: 'Завершена', cancelled: 'Отменена' };

/**
 * План упражнения без RPE: его убрали из приложения 03.10.2026, но в
 * занятиях, начатых раньше, «RPE 8-9» осталось в снимке плана
 */
/** «1 подход», «3 подхода», «5 подходов» */
const setsWord = (n) => n + ' ' + (n % 10 === 1 && n % 100 !== 11 ? 'подход' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'подхода' : 'подходов');
const planText = (p) => String(p || '').split(' · ').filter(x => x && !/^RPE\b/i.test(x)).join(' · ');

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
  const [trackNote, setTrackNote] = useState(null); // { ei, text, error } — вид упражнения ушёл в базу или нет
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
  // Отдых, запущенный с этого телефона (rest-here.js): окно «Отдых
  // окончен» всплывает в любом разделе только у того, кто его запустил
  // «Свернуть таймер»: until свёрнутого отдыха — плашка вместо экрана
  const [collapsedUntil, setCollapsedUntil] = useState(0);
  // Пока экран отдыха развёрнут — страница под ним не листается
  const lockScroll = useRef(false);
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
  // Клиент (и тренер в режиме «смотрите как клиент») название и вид не меняет
  // (владелец, 09.10.2026): это решает тренер; подходы, вес, настройки — может
  const asClient = !clientRow || clientView;
  // Настройки касанием по единицам (FT-513): id упражнения, в круге — id:круг
  const [tuning, setTuning] = useState('');
  const [renamingTitle, setRenamingTitle] = useState(false);
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
    if (!restUntil || restStatus !== 'active') {
      cancelRestEnd();
      const here = restHere();
      if (here && here.sessionId === record?.session?.id) setRestHere(null);
    } else if (restClosed(restUntil)) {
      // Этот отдых уже закрыли в другом разделе — второй раз не звенит
      change(v => (v.restUntil === restUntil ? { ...v, restUntil: 0 } : v));
    }
  }, [restUntil, restStatus]);

  // Экран тренировки открыт — общий слой отдыха (RestLayer) молчит
  useEffect(() => workoutScreenOpen(), []);

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
  // «+30 с» / «Закрыть» на будильнике отдыха (iPhone, часы) — сразу в
  // занятие, а не при следующем открытии экрана
  useEffect(() => onLiveAction(({ kind, restUntil }) => {
    if (!ready) return;
    if (kind === 'extend') alarmMovedTo(restUntil);
    applyPendingRest();
  }), [ready]);

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
    const hide = () => (document.hidden ? save() : applyPendingRest());
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
    const length = seconds || restBase();
    if (!length) return;

    restAt(Date.now() + length * 1000);
  };

  /**
   * Длительность отдыха занятия. Не выбрана — 1:30, как на часах: с
   * оценками подхода (03.10.2026) отдых запускается всегда, а «Вручную»
   * (ноль) оставлял человека без таймера — так было на живой тренировке
   */
  const restBase = () => (state.current && state.current.session.restSeconds) || 90;

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
    setCollapsedUntil(0);
    change(v => ({ ...v, restUntil: until, restLocal: '' }));
    const cur = state.current && state.current.session;
    setRestHere({ until, total: Math.max(1000, until - Date.now()), next: cur ? nextInfo(cur, focusOf(cur)) : null, sessionId: cur ? cur.id : '' });
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
  /**
   * Функциональное кардио (FT-513): у отрезка свои круги и фазы — в каждом
   * круге суперсета свои. Пока не правили — из плана; при правке и отметке
   * они записываются в отрезок вместе с итогами (время, расстояние, калории
   * всех кругов) — по итогам считают историю и прогресс
   */
  const withIntervals = (set, iv, track) => {
    const t = intervalsTotals(iv, track);
    return { ...set, intervals: iv, time: t.time || '', distance: t.distance || '', kcal: t.kcal || '' };
  };
  const pinIntervals = (x, si) => (isFunctional(x) && !x.sets[si].intervals
    ? { ...x, sets: x.sets.map((set, i) => (i === si ? withIntervals(set, setIntervals(set, x), trackOf(x)) : set)) }
    : x);
  const lackOf = (ex, si) => missing(pinIntervals(ex, si).sets[si], trackOf(ex));
  const replaceExercise = async (ei, picked) => {
    const current = state.current && state.current.session.exercises[ei];
    if (!current) return;

    // Сразу убираем снимок прежнего упражнения. Даже если сеть пропадёт,
    // жим ногами не должен остаться весами у приседа.
    updateExercise(ei, (ex) => replaceWorkoutExercise(ex, picked));
    if (!picked.exerciseId) return;

    try {
      const plan = replacementPlan(current);
      const history = await apiPublic('workout.exercise.history', {
        ...params,
        name: picked.name,
        exerciseId: picked.exerciseId,
        sets: plan.sets,
        reps: plan.reps,
      });
      updateExercise(ei, (ex) => {
        // Ответ старого выбора не должен затереть следующий выбор.
        if (ex.name !== picked.name || Number(ex.exerciseId || 0) !== Number(picked.exerciseId || 0)) return ex;
        return replaceWorkoutExercise(ex, picked, history);
      });
    } catch (error) {
      setMessage('Историю нового упражнения не удалось загрузить: ' + error.message);
    }
  };
  // Другой тренажёр (FT-478): сразу отмечаем выбор, веса неотмеченных
  // подходов — с прошлого раза на нём (сервер, та же история весов)
  const chooseMachine = async (ei, machine) => {
    const current = state.current && state.current.session.exercises[ei];
    if (!current) return;
    haptic();
    const uidOf = (m) => (m ? m.uid : '');
    updateExercise(ei, (ex) => withMachine(ex, machine));
    try {
      const plan = replacementPlan(current);
      const history = await apiPublic('workout.exercise.history', {
        ...params,
        name: current.name,
        exerciseId: current.exerciseId || null,
        sets: plan.sets,
        reps: plan.reps,
        machineUid: uidOf(machine),
      });
      // Пока ждали ответ, выбрали другой — этот ответ уже не про него
      updateExercise(ei, (ex) => (ex.name === current.name && uidOf(ex.machine) === uidOf(machine) ? withMachine(ex, machine, history) : ex));
    } catch (error) {
      setMessage('Вес на этом тренажёре не удалось загрузить: ' + error.message);
    }
  };
  // Сплит-пара (FT-488): тренажёр выбирает каждый из пары — меняются только
  // его неотмеченные подходы, вес — его с прошлого раза на этом тренажёре
  const chooseMemberMachine = async (ei, who, machine) => {
    const current = state.current && state.current.session.exercises[ei];
    if (!current) return;
    haptic();
    const uidOf = (m) => (m ? m.uid : '');
    const mine = (ex) => uidOf(ex.machines && ex.machines[who]);
    updateExercise(ei, (ex) => withMemberMachine(ex, who, machine));
    try {
      const history = await apiPublic('workout.exercise.history', {
        ...params,
        name: current.name,
        exerciseId: current.exerciseId || null,
        member: who,
        machineUid: uidOf(machine),
      });
      updateExercise(ei, (ex) => (ex.name === current.name && mine(ex) === uidOf(machine) ? withMemberMachine(ex, who, machine, history) : ex));
    } catch (error) {
      setMessage('Вес на этом тренажёре не удалось загрузить: ' + error.message);
    }
  };
  const close = () => { if (state.current?.dirty) save(); onClose(); };

  // Смахнуть вправо — то же, что «Назад»: с сохранением незаписанного
  useBackGesture(close);
  // Идущая тренировка — не раздел: смахнуть влево в «Прогресс» посреди
  // подхода нельзя, выход только «назад» (смахнуть вправо)
  useTabLock(true);
  // Один постоянный слушатель с preventDefault: iPhone решает, можно ли
  // отменить прокрутку, в момент касания, и слушатель, добавленный уже
  // посреди удержания, страницу не останавливал — перестановка не
  // работала (03.10.2026). Им же страница стоит под экраном отдыха
  useEffect(() => {
    const stop = (ev) => { if (drag.current || lockScroll.current) ev.preventDefault(); };
    document.addEventListener('touchmove', stop, { passive: false });
    return () => document.removeEventListener('touchmove', stop);
  }, []);
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
    const edit = (key, value) => updateExercise(ei, x => {
      const sets = x.sets.map((s, k) => {
        if (k !== si) return s;
        const { suggest, ...rest } = s;
        const next = { ...rest, [key]: value, ...(key !== 'weight' && suggest ? { suggest } : {}), ...(key === 'weight' ? { own: true } : {}) };
        // Повторы поменяли — вес этого подхода пересчитать от прошлого раза
        // (тот же подход, его вес и повторы), если вес не вписан руками
        const was = key === 'reps' && !s.own && wasSet(x, si);
        if (was && Number(value) > 0 && Number(was.reps) > 0) {
          const w = scaleTo(x, Number(String(was.weight).replace(',', '.')), Number(was.reps), Number(value));
          if (w > 0) next.weight = String(Math.round(w * 100) / 100);
        }
        return next;
      });
      // Вписали вес — следующим подходам без прошлого раза тот же вес
      // (владелец, 03.10.2026): у них нет своей истории
      if (key === 'weight') {
        const old = x.sets[si].weight || '';
        for (let k = si + 1; k < sets.length; k += 1) {
          const s = sets[k];
          if ((s.who || '') !== (x.sets[si].who || '') || s.state !== 'pending' || s.own || wasSet(x, k)) continue;
          if (s.weight && s.weight !== old) break;
          sets[k] = { ...s, weight: value };
        }
      }
      return { ...x, sets };
    });
    const was = set.state === 'pending' && wasSet(ex, si);
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
            {/* Под строкой, под колонкой веса — одной строкой: вес на одну
                сторону (у каждого подхода; в первом — переносится на все,
                дальше любую можно снять, владелец 07.10.2026) и «было» */}
            {/* Тот же подход в прошлый раз — у каждого подхода свой
                (владелец, 03.10.2026: «было» на всё упражнение бесполезно) */}
            {(track.kind === 'strength' || was) && <div className="workout__set-meta">
              {track.kind === 'strength' && <label className="workout__side">
                <input type="checkbox" checked={setOneSide(set, track)} disabled={!editable} onChange={e => {
                  const side = e.target.checked ? 'one' : 'two';
                  const who = set.who || '';
                  updateExercise(ei, x => {
                    const first = x.sets.findIndex(s => (s.who || '') === who);
                    return { ...x, sets: x.sets.map((s, k) => (k === si || (si === first && (s.who || '') === who) ? { ...s, side } : s)) };
                  });
                }} />
                на сторону
              </label>}
              {was && <span className="workout__was">было {was.weight} кг{was.reps ? ' × ' + was.reps : ''}</span>}
            </div>}
            {/* Галочки нет (03.10.2026): под ближайшим подходом упражнения —
                «Легко / Норм / Тяжело», каждая отмечает подход и запускает
                отдых. Снять отметку — номер подхода → «Снять отметку» */}
            {!inRound && editable && set.state === 'pending' && nextOf(ex, si) && effortChooser((effort) => {
              const lack = missing(set, track);
              if (lack) { setMessage(lack); return; }
              updateExercise(ei, x => rateSet(x, si, effort).ex);
              // Последний подход занятия — без отдыха, сразу «Завершить?»
              if (allDone()) { afterLast(); return; }
              // Отдых начинается там, где человек нажал: подход отмечен —
              // время пошло. Длительность — по оценке и по тому, прибавили
              // ли вес (effort.js)
              if (restAfter) startRest(restFor(effort, restBase(), rateSet(ex, si, effort).raised));
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
    // Главная цель (первая в metrics) — первым полем, до режима тренажёра (FT-475)
    const [goal, ...rest] = track.metrics;
    const fields = [metricField(goal, track), ...settingsFields(track), ...rest.map(m => metricField(m, track))];
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
      {/* Функциональное — не время и скорость, а круги и каждый интервал со
          своими целями (владелец, 09.10.2026): в каждом круге суперсета свои */}
      {isFunctional(ex)
        ? <IntervalsRow intervals={setIntervals(set, ex)} track={track} label={`${ex.name}, отрезок ${si + 1}`} disabled={!editable}
          onChange={iv => updateSet(ei, si, x => withIntervals(x, iv, track))} />
        : <div className="workout__cardio-grid">
          {fields.map(f => (
            <label key={f.key}><span>{f.head}</span><input aria-label={`${ex.name}, отрезок ${si + 1}, ${f.head.toLowerCase()}`} inputMode={f.mode} placeholder={f.placeholder || ''} maxLength={f.max} value={set[f.key] || ''} onChange={e => edit(f.key, e.target.value)} /></label>
          ))}
        </div>}
      {/* Как у силовых: отрезок отмечается оценкой, она же запускает отдых */}
      {!inRound && editable && set.state === 'pending' && nextOf(ex, si) && effortChooser((effort) => {
        const lack = lackOf(ex, si);
        if (lack) { setMessage(lack); return; }
        updateExercise(ei, x => { const y = pinIntervals(x, si); return { ...y, sets: y.sets.map((s, i) => (i === si ? { ...s, state: 'done', effort } : s)) }; });
        if (allDone()) { afterLast(); return; }
        if (restAfter) startRest(restFor(effort, restBase()));
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

  /**
   * Все подходы отмечены — это был последний: отдых не нужен, тренировка
   * закончилась (владелец, 03.10.2026). Вверху сразу «Завершить?»
   */
  const allDone = () => !!state.current && !state.current.session.exercises.some(e => e.sets.some(x => x.state === 'pending'));
  const afterLast = () => {
    setConfirm('complete');
    haptic('medium');
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (_) { /* старый браузер */ }
  };
  const finishAs = (kind) => {
    change(v => ({ ...v, status: kind === 'complete' ? 'completed' : 'cancelled', restUntil: 0, exercises: v.exercises.map(e => ({ ...e, sets: e.sets.map(x => (x.state === 'pending' ? { ...x, state: 'skipped' } : x)) })) }));
    setConfirm('');
    save();
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
      const why = lackOf(ex, r);
      if (why) { setRoundLack({ key, text: ex.name + ': ' + why.replace(/ перед отметкой.*$/, '').toLowerCase() }); return; }
      setRoundLack(null);
      const rated = rateSet(ex, r, effort);
      updateExercise(ei, x => rateSet(pinIntervals(x, r), r, effort).ex);
      if (!last) return;
      if (allDone()) { afterLast(); return; }
      // Круг закончен — отдых по всем оценкам круга
      const others = live.filter(m => m.ex.id !== ex.id).map(m => m.ex.sets[r]);
      const efforts = [...others.map(x => x.effort || 'ok'), effort];
      const raised = rated.raised || others.some(x => x.raised);
      startRest(roundRest(efforts, restBase(), raised));
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
   * Вид упражнения — в снимке занятия сразу, а у тренера ещё и в базе
   * (07.10.2026): заметил ошибку в зале — исправленное видно и в программах,
   * и в шаблонах. Клиент правит только своё занятие.
   */
  const trackEditor = (ex, ei) => {
    const track = trackOf(ex);
    const persist = !!clientRow && !clientView;
    const set = next => {
      updateExercise(ei, x => {
        const out = { ...x, track: { ...trackOf(x), ...next } };
        if (out.track.kind !== 'cardio') delete out.cardio;
        else if (x.cardio && next.machine) out.cardio = { ...x.cardio, machine: next.machine };
        return out;
      });
      if (!persist) return;
      setTrackNote(null);
      saveExerciseTrack({ exerciseId: ex.exerciseId, name: ex.name, track: { ...track, ...next } })
        .then(saved => {
          if (saved && !ex.exerciseId) updateExercise(ei, x => (x.name === ex.name && !x.exerciseId ? { ...x, exerciseId: saved.id } : x));
        })
        .catch(e => setTrackNote({ ei, text: 'В базу не сохранилось: ' + (e.message || 'нет связи'), error: true }));
    };
    return <>
      <ExerciseKind track={track} onChange={set} className="workout__track" note={trackNote && trackNote.ei === ei ? trackNote : null} />
    </>;
  };

  /**
   * Кардио в занятии (FT-511, FT-513): аэробное или функциональное — у
   * названия, цели с настройками или интервалы — касанием по единицам. В зале
   * поменяли круги или скорость, после — записали, как было на деле
   * («Исправить результат» у выполненного). Только этого занятия: программа
   * не переписывается. Что записывать в отрезке — по плану (metrics, modes,
   * goal), строка плана над отрезками — по новому.
   */
  const cardioOf = ex => ex.cardio || cardioFrom(ex, trackOf(ex));
  // only — отрезок круга, из которого открыли настройки: в него числа идут и
  // после отметки (поправили цель уже сделанного круга)
  const editCardio = (ei, cardio, only = -1) => updateExercise(ei, x => {
    const track = { ...trackOf(x), metrics: cardio.metrics, goal: cardioGoal(cardio), speedUnit: cardio.speedUnit || '' };
    if (cardio.modes) track.modes = cardio.modes;
    const next = { ...x, cardio, track };
    // Неотмеченные отрезки — по новому плану: поменяли круги — время всех
    // кругов другое. Вписанное руками (не как было в плане) не трогаем
    const was = planSet(x, trackOf(x));
    const now = planSet(next, trackOf(next));
    const sets = x.sets.map((set, i) => {
      if (set.state !== 'pending' && i !== only) return set;
      const out = { ...set };
      Object.keys({ ...was, ...now }).forEach(k => {
        if (!out[k] || out[k] === was[k]) out[k] = now[k] || '';
      });
      return out;
    });
    return { ...next, sets, prescription: planScheme(next) };
  });

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
      {members.some(({ ex }) => planText(ex.prescription)) && (
        <p className="small muted">{members.map(({ ex }) => ex.name + (planText(ex.prescription) ? ': ' + planText(ex.prescription) : '')).join('; ')}</p>
      )}
      {members.filter(({ ex }) => lastRunText(ex.lastRun)).map(({ ex }) => (
        <p className="workout__last" key={'last' + ex.id}>{ex.name}: {lastRunText(ex.lastRun).replace(/^Последний раз/, 'последний раз')}</p>
      ))}
      {/* Таймера интервалов нет (владелец, 09.10.2026): их запускают на самом тренажёре */}
      {members.map(({ ex }) => ex.exerciseId && setups[ex.exerciseId]
        ? <React.Fragment key={'about' + ex.id}>{aboutView(setups[ex.exerciseId], null, ex.name)}</React.Fragment> : null)}
      {Array.from({ length: rounds }, (_, r) => (
        <div className="workout__round" key={r}>
          <h4 className="workout__round-title" data-flip-enter="" data-flip-delay={r * 90}>Круг {r + 1}</h4>
          {members.map(({ ex, ei }, k) => ex.sets[r] && (
            <div className="workout__round-item" key={ex.id} data-member={ex.id} data-anchor={ex.id + ':' + r}>
              {renaming === ex.id + ':' + r
                ? nameEditor(ex, ei, ex.id + ':' + r)
                : <div className="workout__round-name" data-flip={r === 0 && k > 0 ? 'name:' + ex.id : undefined}
                  onPointerDown={holdToMove(ex.id, (head) => ({ container: head.closest('.workout__round'), commit: reorderMembers(group) }))}>
                  {/* Название — касанием: из базы или новое прямо здесь */}
                  {asClient ? ex.name : <button type="button" className="workout__name-tap" onClick={() => startRename(ex.id + ':' + r)}>{ex.name}</button>}
                  {/* Единицы — касанием: вес, повторы, время, у кардио — интервалы (FT-513) */}
                  <button type="button" className="workout__round-units" aria-expanded={tuning === ex.id + ':' + r} aria-label={ex.name + ': настройки'} onClick={() => startTune(ex.id + ':' + r)}> · {isFunctional(ex) ? 'интервалы' : rowFields(trackOf(ex)).map(f => f.unit).join(' · ')}</button>
                  {/* Сделано — с оценкой, как у обычных подходов (03.10.2026) */}
                  {ex.sets[r].state === 'done' && ex.sets[r].effort && <span className={'workout__round-effort workout__round-effort--' + ex.sets[r].effort}>
                    <span className={'workout__effort-dot workout__effort-dot--' + ex.sets[r].effort} aria-hidden="true" />{EFFORT_WORD[ex.sets[r].effort]}
                  </span>}
                </div>}
              {tuning === ex.id + ':' + r && tuneEditor(ex, ei, ex.id + ':' + r, true)}
              {setRow(ex, ei, r, '', k === members.length - 1, true)}
              {memberEffort(members, k, r)}
            </div>
          ))}
          {roundCheck(members, r)}
          {roundOptions(members, r)}
        </div>
      ))}
      <button className="button button--block" disabled={members.some(({ ex }) => ex.sets.length >= 20)} onClick={addRound}>Добавить круг</button>
    </section>;
  };

  /**
   * Название упражнения — касанием (02.10.2026). Тренер выбирает из базы или
   * добавляет новое прямо здесь (ExercisePicker); у клиента базы нет —
   * просто поле. Там же вид упражнения, у кардио — аэробное или
   * функциональное (FT-513): отдельного меню «Изменить упражнение» нет.
   */
  /**
   * Закрыть панель и вернуть экран к строке, которая её открыла (владелец,
   * 09.10.2026): «Готово» — внизу высокой панели, и после её схлопывания на
   * том же месте прокрутки оказывался следующий круг. Строка ушла под шапку —
   * ставим её сразу под шапку; видна — экран не двигаем
   */
  const closePanel = (id) => {
    flushSync(() => { setRenaming(''); setTuning(''); });
    const row = document.querySelector && document.querySelector('[data-anchor="' + id + '"]');
    if (!row || !row.getBoundingClientRect) return;
    const head = document.querySelector('.workout__header');
    const top = head ? head.getBoundingClientRect().bottom : 0;
    const y = row.getBoundingClientRect().top;
    if (y < top + 8) window.scrollBy({ top: y - top - 12 });
  };
  const startRename = (id) => {
    if (swallowClick.current || !editable || asClient) return;
    setTuning('');
    setRenaming(renaming === id ? '' : id);
  };
  const nameEditor = (ex, ei, id) => (
    <div className="workout__panel" key={'rename-' + id}>
      {clientRow
        ? <NameFromBase ex={ex} autoFocus onPick={(patch) => replaceExercise(ei, patch)} />
        : <input className="field__input" aria-label="Название упражнения" autoFocus value={ex.name} maxLength={160}
          onChange={e => updateExercise(ei, ({ exerciseId, ...x }) => ({ ...x, name: e.target.value }))}
          onKeyDown={e => { if (e.key === 'Enter') closePanel(id); }} />}
      {trackEditor(ex, ei)}
      {trackOf(ex).kind === 'cardio' && <CardioKind value={cardioOf(ex)} onChange={c => editCardio(ei, c)} />}
      <p className="small muted">Порядок — подержите название упражнения и перетащите.</p>
      <div className="workout__panel-actions"><button type="button" className="button button--primary" onClick={() => closePanel(id)}>Готово</button></div>
    </div>
  );

  /**
   * Настройки упражнения — касанием по единицам или плану (FT-513): у кардио
   * цели и настройки или интервалы, у остальных — вес, повторы или время
   * сразу всем неотмеченным подходам и их число. В суперсете кругов общее
   * число («Добавить круг» под ним), а заметка — здесь же.
   */
  const startTune = (id) => {
    if (swallowClick.current || !editable) return;
    setRenaming('');
    setTuning(tuning === id ? '' : id);
  };
  const tuneEditor = (ex, ei, id, inRound = false) => {
    const track = trackOf(ex);
    const note = inRound && <label className="workout__field">Заметка<textarea value={ex.note} maxLength={500} rows={2} onChange={e => updateExercise(ei, x => ({ ...x, note: e.target.value }))} /></label>;
    const done = <div className="workout__panel-actions"><button type="button" className="button button--primary" onClick={() => closePanel(id)}>Готово</button></div>;
    if (track.kind === 'cardio') {
      const c = cardioOf(ex);
      return <div className="workout__panel" key={'tune-' + id}>
        <CardioPlan kind={false} value={c} track={trackOf({ ...ex, cardio: c })} onChange={next => editCardio(ei, next, inRound ? Number(String(id).split(':').pop()) : -1)} />
        {note}
        {done}
      </div>;
    }
    const open = ex.sets.filter(x => x.state === 'pending');
    const sample = open[0] || ex.sets[ex.sets.length - 1] || {};
    // Сразу всем неотмеченным: сделанное — это уже результат
    const editAll = (key, value) => updateExercise(ei, x => ({ ...x, sets: x.sets.map(set => {
      if (set.state !== 'pending') return set;
      if (key !== 'weight') return { ...set, [key]: value };
      const { suggest, ...rest } = set;
      return { ...rest, weight: value, own: true };
    }) }));
    const last = ex.sets[ex.sets.length - 1];
    const addSet = () => updateExercise(ei, x => {
      const { effort, suggest, ...prev } = x.sets[x.sets.length - 1];
      return { ...x, sets: [...x.sets, { ...prev, state: 'pending' }] };
    });
    const dropSet = () => { setUndo(s.exercises, 'Подход удалён'); updateExercise(ei, x => ({ ...x, sets: x.sets.slice(0, -1) })); };
    return <div className="workout__panel" key={'tune-' + id}>
      {!inRound && <div className="workout__tune-count">
        <span>Подходов</span>
        <button type="button" className="button" aria-label="Убрать подход" disabled={ex.sets.length <= 1 || last.state !== 'pending'} onClick={dropSet}>−</button>
        <strong>{ex.sets.length}</strong>
        <button type="button" className="button" aria-label="Добавить подход" disabled={ex.sets.length >= 20} onClick={addSet}>+</button>
      </div>}
      {open.length > 0 && <div className="workout__tune-fields">
        {rowFields(track).map(f => (
          <label key={f.key}><span>{f.head}</span><input className="field__input" aria-label={ex.name + ': ' + f.head.toLowerCase() + ', всем подходам'} inputMode={f.mode} placeholder={f.placeholder || ''} maxLength={f.max} value={sample[f.key] || ''} onChange={e => editAll(f.key, e.target.value)} /></label>
        ))}
      </div>}
      {open.length > 0 && <p className="small muted">{open.length === ex.sets.length ? 'Меняется во всех подходах.' : 'Меняется в неотмеченных подходах.'}</p>}
      {note}
      {done}
    </div>;
  };

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
    if (!editable || reorder || drag.current || (e.button !== undefined && e.button !== 0)) return;
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
    setTuning('');
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
    // Пока тащат — страница не листается (постоянный слушатель выше)
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

  // Суперсет выбирается целиком — всеми упражнениями (03.10.2026: кружка
  // у суперсета не было). Касание сразу после перетаскивания — не выбор
  const togglePick = (ids) => {
    if (swallowClick.current) return;
    const list = [].concat(ids);
    setPicked(prev => {
      const next = new Set(prev);
      const on = list.every(id => next.has(id));
      list.forEach(id => (on ? next.delete(id) : next.add(id)));
      return next;
    });
  };
  /** Сколько выбрано блоков: суперсет — один */
  const pickedUnits = () => units((record && record.session && record.session.exercises) || []).filter(u => u.items.every(e => picked.has(e.id))).length;
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
    const cards = units(snapshot).filter(u => u.items.every(e => ids.has(e.id)))
      .map(u => fieldsRef.current && fieldsRef.current.querySelector(`[data-unit="${u.key}"]`)).filter(Boolean);
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
  // Суперсет копируется целиком — новым суперсетом сразу за ним
  const pickCopy = () => {
    change(v => {
      const out = [];
      units(v.exercises).forEach(u => {
        out.push(...u.items);
        const chosen = u.items.filter(e => picked.has(e.id));
        if (!chosen.length) return;
        const group = u.items.length > 1 && chosen.length === u.items.length ? 'superset-' + uid() : '';
        out.push(...chosen.map(e => ({ ...e, id: uid(), supersetGroup: group, note: '', sets: e.sets.map(({ effort, raised, ...x }) => ({ ...x, state: 'pending' })) })));
      });
      return { ...v, exercises: out.slice(0, 30) };
    });
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
  // Личные настройки тренажёров этого клиента («спинка 3») — у каждого свои
  const [notes, setNotes] = useState({});
  // У сплит-пары (FT-488) — у каждого своя: { кто: { цель: настройка } }.
  // Участнику в его кабинете сервер отдаёт только его
  const [notesBy, setNotesBy] = useState({});
  useEffect(() => {
    if (!setupIds) return undefined;
    let alive = true;
    apiPublic('exercise.setup', { ...params, ids: setupIds })
      .then(r => { if (alive && r && r.setups) { setSetups(r.setups); setNotes(r.notes || {}); setNotesBy(r.notesBy || {}); } })
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

  /**
   * Под названием упражнения из базы (07.10.2026): на каком тренажёре
   * (FT-478) — вес у каждого свой, — как его настроить, и чем заменить, если
   * он занят (FT-479). Замена — пока подходы не отмечены: отмеченное при
   * замене не переносится, а терять его нельзя
   */
  /**
   * Сплит-пара (FT-488): у каждого свой тренажёр, своя настройка и свой
   * вес. Строкой на человека — в зале они рядом, и видно, кому что ставить
   */
  const splitView = (ex, ei, info) => {
    const machines = info.machines || [];
    const whos = [...new Set(ex.sets.map((x) => x.who).filter(Boolean))]
      // Участник в своём кабинете — только своя строка настройки
      .filter((w) => clientRow || w in notesBy || !Object.keys(notesBy).length);
    const chosenOf = (w) => (ex.machines && ex.machines[w] && machines.find((m) => m.uid === ex.machines[w].uid)) || null;
    const used = [...new Set(whos.map(chosenOf).filter(Boolean))];
    return <>
      {whos.map((w) => {
        const chosen = chosenOf(w);
        const target = chosen ? 'm:' + chosen.uid : (machines.length ? '' : info.noteKey || '');
        const own = notesBy[w] || {};
        const canNote = clientRow || w in notesBy;
        return (
          <div className="workout__member" key={w}>
            <span className="workout__member-name">{w}</span>
            {machines.length > 0 && (
              <div className="chips chips--flush chips--wrap" role="radiogroup" aria-label={'Тренажёр: ' + w}>
                {machines.map((m) => (
                  <button type="button" key={m.uid} role="radio" aria-checked={chosen === m}
                    className={'chip' + (chosen === m ? ' chip--active' : '')} disabled={!editable}
                    onClick={() => chooseMemberMachine(ei, w, chosen === m ? null : m)}>{m.name}</button>
                ))}
              </div>
            )}
            {target && canNote && (
              <MachineNote key={w + target} target={target} note={own[target]} trainer={!asClient} params={{ ...params, member: w }}
                onSaved={(n) => setNotesBy((v) => {
                  const next = { ...(v[w] || {}) };
                  if (n) next[target] = n; else delete next[target];
                  return { ...v, [w]: next };
                })} />
            )}
          </div>
        );
      })}
      {machines.length > 0 && editable && whos.some((w) => !chosenOf(w)) && <p className="small muted">На каком тренажёре? Вес у каждого свой.</p>}
      {(used.length ? used : [null]).map((m) => ((m ? m.setup || m.photo || info.setup : info.setup) && (
        <details className="workout__setup" key={m ? m.uid : 'all'}>
          <summary>{m ? 'Тренажёр «' + m.name + '»: фото, регулировки' : 'Как настроить тренажёр'}</summary>
          {m ? <MachineInfo machine={m} principle={info.setup} /> : <SetupText text={info.setup} />}
        </details>
      )))}
    </>;
  };

  /**
   * Тренажёр и техника (владелец, 09.10.2026): клиенту в зале одним касанием —
   * как выглядит тренажёр и как настраивается, техника, мышцы, анимация; под
   * ними уже подходы. То же, что в карточке упражнения программы
   */
  const aboutView = (info, chosen = null, title = '') => {
    const setup = chosen ? chosen.setup || chosen.photo || info.setup : info.setup;
    const muscles = info.muscles && ((info.muscles.primary || []).length || (info.muscles.secondary || []).length) ? info.muscles : null;
    if (!setup && !info.notes && !info.media && !muscles) return null;

    const word = chosen && chosen.kind === 'equipment' ? 'Оборудование' : 'Тренажёр';
    const label = setup ? (chosen ? word + ' «' + chosen.name + '» и техника' : 'Тренажёр и техника') : 'Техника';
    // Техника часто записана тем же текстом, что «Как настроить», — второй
    // раз не показываем (владелец, 09.10.2026: текст повторялся под шагами)
    const flat = (t) => String(t || '').toLowerCase().replace(/[^a-zа-яё0-9]+/g, ' ').trim();
    const notes = info.notes && !(info.setup && (flat(info.setup).includes(flat(info.notes)) || flat(info.notes).includes(flat(info.setup)))) ? info.notes : '';
    return <details className="workout__setup workout__about">
      <summary>{title ? title + ': ' + label.toLowerCase() : label}</summary>
      {setup && (chosen ? <MachineInfo machine={chosen} principle={info.setup} /> : <SetupText text={info.setup} />)}
      {notes && <p className="workout__technique">{notes}</p>}
      {muscles && <div className="muscles muscles--block">
        <MuscleFigure primary={muscles.primary || []} secondary={muscles.secondary || []} size="sm" />
        <MuscleNames primary={muscles.primary || []} secondary={muscles.secondary || []} max={4} />
      </div>}
      <Media media={info.media} />
    </details>;
  };

  const extrasView = (ex, ei, info) => {
    const machines = info.machines || [];
    const split = ex.sets.some((x) => x.who);
    const chosen = (ex.machine && machines.find((m) => m.uid === ex.machine.uid)) || null;
    const alts = (info.alternatives || []).filter((a) => a.id !== Number(ex.exerciseId));
    const started = ex.sets.some((x) => x.state === 'done');
    const noteTarget = chosen ? 'm:' + chosen.uid : (machines.length ? '' : info.noteKey || '');
    return <>
      {machines.length > 0 && !split && (
        <div className="workout__machines">
          <div className="chips chips--flush chips--wrap" role="radiogroup" aria-label="Тренажёр">
            {machines.map((m) => (
              <button type="button" key={m.uid} role="radio" aria-checked={chosen === m}
                className={'chip' + (chosen === m ? ' chip--active' : '')} disabled={!editable}
                onClick={() => chooseMachine(ei, chosen === m ? null : m)}>{m.name}</button>
            ))}
          </div>
          {!chosen && editable && <p className="small muted">На каком тренажёре? Вес у каждого свой.</p>}
          {chosen && editable && !ex.prevWeight && !ex.lastRun && trackOf(ex).kind === 'strength'
            && ex.sets.every((x) => x.state !== 'pending' || !String(x.weight || '').trim()) && (
            <p className="small muted">На тренажёре «{chosen.name}» ещё не делали — впишите вес, дальше он запомнится.</p>
          )}
        </div>
      )}
      {/* Своя настройка — у каждого клиента своя, на виду, а не в
          раскрывашке: ради неё в зале и смотрят. Тренажёров несколько —
          сначала выбрать, на каком */}
      {!split && noteTarget && (
        <MachineNote key={noteTarget} target={noteTarget} note={notes[noteTarget]} trainer={!asClient} params={params}
          onSaved={(n) => setNotes((v) => { const next = { ...v }; if (n) next[noteTarget] = n; else delete next[noteTarget]; return next; })} />
      )}
      {split && splitView(ex, ei, info)}
      {!split && aboutView(info, chosen)}
      {alts.length > 0 && editable && !started && (
        <div className="workout__alts">
          <span className="small muted">Занято? Заменить на:</span>
          <div className="chips chips--flush chips--wrap">
            {alts.map((a) => (
              <button type="button" key={a.id} className="chip" onClick={() => { haptic(); replaceExercise(ei, { name: a.name, exerciseId: a.id }); }}>{a.name}</button>
            ))}
          </div>
        </div>
      )}
    </>;
  };

  // Отдых — поверх всего приложения (портал), а не внутри экрана: так
  // «Свернуть» открывает нижнее меню и другие разделы, а «Отдых окончен»
  // всплывает в любом из них — у телефона, который отдых запустил. Экран
  // тренировки на виду — показываем и отдых, запущенный тренером или часами
  const restOn = !!s && !!s.restUntil && s.status === 'active';
  const restOver = restOn && s.restUntil - now <= 0;
  const here = restHere();
  const startedHere = restOn && !!here && here.until === s.restUntil;
  // Без настоящей страницы (проверки компонента) — рисуем на месте
  const dom = typeof document !== 'undefined' && !!document.body && document.body.nodeType === 1;
  const onScreen = !dom || !!(fieldsRef.current && fieldsRef.current.offsetParent);
  const restShown = restOn && (onScreen || startedHere);
  const restFolded = restShown && !restOver && collapsedUntil === s.restUntil;
  lockScroll.current = restShown && !restFolded;
  const stopRest = () => change(v => ({ ...v, restUntil: 0 }));
  const restLayer = restShown && (dom ? (node) => createPortal(node, document.body) : (node) => node)(restFolded
    ? <RestPill left={s.restUntil - now} onOpen={() => setCollapsedUntil(0)} />
    : <RestScreen
      until={s.restUntil}
      total={startedHere ? here.total : (s.restSeconds || 90) * 1000}
      now={now}
      next={nextInfo(s, focus)}
      onMore={extendRest}
      onStop={stopRest}
      onCollapse={() => setCollapsedUntil(s.restUntil)}
    />);

  const confirmText = confirm === 'complete'
    ? (stats && !stats.pending ? 'Все подходы сделаны. Завершить тренировку?' : `Выполнено ${setsWord(stats ? stats.done : 0)}. ${stats && stats.pending === 1 ? 'Оставшийся будет отмечен пропущенным' : 'Оставшиеся ' + (stats ? stats.pending : 0) + ' будут отмечены пропущенными'}.`)
    : 'Занятие останется в журнале с отметкой «Отменена».';
  return <div className="workout">
    {/* В занятии «назад» — смахнуть вправо (09.10.2026); в списке журнала кнопка остаётся */}
    {!s && <button className="button" onClick={close}>{backLabel}</button>}
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
        {/* Название — касанием: переименовывает только тренер (07.10.2026), сервер это же проверяет */}
        {renamingTitle && clientRow && !clientView
          ? <input className="workout__title-input" aria-label="Название занятия" autoFocus value={s.title} maxLength={160} onChange={e => change(v => ({ ...v, title: e.target.value }))} onBlur={() => setRenamingTitle(false)} onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setRenamingTitle(false); }} />
          : <h2>{editable && clientRow && !clientView ? <button type="button" className="workout__title-tap" onClick={() => setRenamingTitle(true)}>{s.title}</button> : s.title}</h2>}
        <p>{s.month || 'Свободная тренировка'} · {labels[s.status]}</p>
        <div className="workout__metrics"><span>Время <strong>{clock(elapsed)}</strong></span><span>Подходы <strong>{stats.done} / {stats.total}</strong></span>
          {/* Завершить и отменить — здесь, у времени, а не внизу под всеми
              упражнениями (владелец, 03.10.2026) */}
          {editable && !confirm && <span className="workout__head-actions">
            <button type="button" className="button button--primary" onClick={() => setConfirm('complete')}>Завершить</button>
            <button type="button" className="button button--ghost" onClick={() => setConfirm('cancel')}>Отменить</button>
          </span>}
        </div>
        {editable && confirm && <div className="workout__confirm" role="alertdialog" aria-label={confirm === 'complete' ? 'Завершить тренировку' : 'Отменить занятие'}>
          <p>{confirmText}</p>
          <div className="workout__confirm-actions">
            <button type="button" className={'button ' + (confirm === 'complete' ? 'button--primary' : 'button--critical')} disabled={busy || !!conflict || (confirm === 'complete' && !stats.done)} onClick={() => finishAs(confirm)}>{confirm === 'complete' ? 'Завершить' : 'Отменить'}</button>
            <button type="button" className="button button--ghost" onClick={() => setConfirm('')}>{confirm === 'complete' && !stats.pending ? 'Ещё не всё' : 'Продолжить'}</button>
          </div>
        </div>}
        {/* Пауза и отдых — в шапке, что едет за прокруткой (владелец, 09.10.2026).
            Назад — смахнуть вправо, кнопки «К программе» нет.
            Длительность не только запускает отдых, но и запоминается: дальше
            он стартует сам после каждого отмеченного подхода */}
        {editable && !confirm && <div className="workout__toolbar workout__toolbar--head">
          <button className="button" onClick={() => change(s => ({ ...s, status: s.status === 'active' ? 'paused' : 'active', restUntil: 0 }))}>{s.status === 'active' ? 'Пауза' : 'Продолжить'}</button>
          <button className={'button workout__pick-toggle' + (picking ? ' is-on' : '')} aria-pressed={picking} onClick={() => (picking ? endPick() : pickFromButton())}>{picking ? 'Готово' : 'Выбрать'}</button>
          <label>Отдых <select aria-label="Таймер отдыха" value={String(s.restSeconds || 90)} onChange={e => { const seconds = Number(e.target.value); change(v => ({ ...v, restSeconds: seconds })); startRest(seconds); }}><option value="60">1 мин</option><option value="90">1:30</option><option value="120">2 мин</option><option value="180">3 мин</option></select></label>
        </div>}
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
        {/* «Сохранено в облаке» убрано (владелец, 09.10.2026): строка
            менялась на каждую правку, и экран прыгал. Не сохранилось —
            сообщение об ошибке вверху */}
      </header>
      <fieldset disabled={!editable || !!conflict} className="workout__fields" ref={fieldsRef}>
        {/* Полоса отдыха прижата к низу экрана, а не стоит в шапке: между
            подходами человек листает список упражнений вниз, и таймер,
            оставшийся наверху, приходилось искать прокруткой. */}
        {restLayer}
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
              const ids = members.map(m => m.ex.id);
              const on = ids.every(id => picked.has(id));
              return <section className={'workout__exercise workout__exercise--compact' + (picking && on ? ' workout__exercise--picked' : '')} key={'g' + group} data-unit={'g' + group}>
                <div className={'workout__rounds-head' + (picking ? ' workout__ex-head--pick' : '')} onPointerDown={holdToMove('g' + group)}
                  {...(picking ? { role: 'checkbox', 'aria-checked': on, tabIndex: 0, onClick: () => togglePick(ids), onKeyDown: (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); togglePick(ids); } } } : {})}>
                  {picking && <span className={'workout__pick' + (on ? ' is-on' : '')} aria-hidden="true">{on && <IconCheck size={14} />}</span>}
                  <h3><span className="workout__ex-num">{ei + 1}</span> Суперсет: {members.map(m => m.ex.name).join(' + ')}</h3>
                </div>
              </section>;
            }
            return <React.Fragment key={'g' + group}>{joinBefore(ei)}{supersetBlock(members)}</React.Fragment>;
          }
          const doneSets = ex.sets.filter(x => x.state !== 'pending').length;
          const finished = doneSets === ex.sets.length;
          const compact = picking || !!reorder;
          return <React.Fragment key={ex.id}>{!compact && joinBefore(ei)}<section className={'workout__exercise' + (focus.ex === ex.id ? ' workout__exercise--current' : '') + (finished ? ' workout__exercise--done' : '') + (picking && picked.has(ex.id) ? ' workout__exercise--picked' : '') + (compact ? ' workout__exercise--compact' : '')} key={ex.id} data-unit={ex.id} data-anchor={ex.id} data-flip-enter="" data-flip-scope={'sec:' + ex.id}>
          <SwipeRow className="workout__ex-swipe" removeClosest=".workout__exercise" removeWith={(card) => leavingBars([card])} disabled={compact || s.exercises.length === 1 || !editable} label={`Удалить упражнение «${ex.name}»`}
            onDelete={() => { setUndo(s.exercises, 'Упражнение удалено'); change(v => ({ ...v, exercises: v.exercises.filter(e => e.id !== ex.id) })); }}>
          <div className={'workout__ex-head' + (picking ? ' workout__ex-head--pick' : '')} onPointerDown={holdToMove(ex.id)} {...(picking ? { role: 'checkbox', 'aria-checked': picked.has(ex.id), tabIndex: 0, onClick: () => togglePick(ex.id), onKeyDown: (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); togglePick(ex.id); } } } : {})}>
            {picking && <span className={'workout__pick' + (picked.has(ex.id) ? ' is-on' : '')} aria-hidden="true">{picked.has(ex.id) && <IconCheck size={14} />}</span>}
            <h3 data-flip={'name:' + ex.id}><span className="workout__ex-num">{ei + 1}</span> {compact
              ? (ex.name || 'Новое упражнение')
              // Название — касанием: из базы или новое прямо здесь
              : asClient ? (ex.name || 'Новое упражнение')
                : <button type="button" className="workout__name-tap" onClick={() => startRename(ex.id)}>{ex.name || 'Новое упражнение'}</button>}</h3>
            <span className="workout__ex-count" aria-label={`Сделано ${doneSets} из ${ex.sets.length}`}>{finished ? <IconCheck size={16} /> : null}{doneSets}/{ex.sets.length}</span>
          </div>
          </SwipeRow>
          {/* Режим выбора — свёрнутый: одна строка на упражнение, чтобы
              выделять, удалять и собирать суперсет, не листая подходы */}
          {!compact && renaming === ex.id && nameEditor(ex, ei, ex.id)}
          {!compact && <>
          {supersetMark(s.exercises, ei) && <p className="workout__superset">{supersetMark(s.exercises, ei)}</p>}
          {ex.exerciseId && setups[ex.exerciseId] && extrasView(ex, ei, setups[ex.exerciseId])}
          {/* «4 × 12» крупно убрано (владелец, 09.10.2026): подходы и повторы
              и так видны в строках. Единицы — касанием: подходы, вес, время,
              у кардио — цели и интервалы, как в круге суперсета */}
          {!ex.sets.some(x => x.who) && <button type="button" className="workout__units-tap" aria-expanded={tuning === ex.id} aria-label={ex.name + ': настройки'} onClick={() => startTune(ex.id)}>
            {isFunctional(ex) ? 'интервалы' : rowFields(trackOf(ex)).map(f => f.unit).join(' · ')}<IconSliders size={12} aria-hidden="true" />
          </button>}
          {tuning === ex.id && tuneEditor(ex, ei, ex.id)}
          {/* Последнее выполнение клиентом — с повторами и оценкой */}
          {lastRunText(ex.lastRun) && <p className="workout__last">{lastRunText(ex.lastRun)}</p>}
          {trackOf(ex).kind !== 'cardio' && <div className={'workout__set-head' + (ex.sets.some(x => x.who) ? ' workout__set-head--who' : '')} style={{ '--cols': rowFields(trackOf(ex)).length }} aria-hidden="true"><span>{trackOf(ex).kind === 'cardio' ? 'Отрезок' : 'Подход'}</span>{rowFields(trackOf(ex)).map(f => <span key={f.key}>{f.head}</span>)}</div>}
          {ex.sets.map((set, si) => setRow(ex, ei, si, setLabel(ex.sets, si)))}
          {trackOf(ex).kind === 'cardio' && !isFunctional(ex) && metricAdd(ex, ei)}
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
            <span className="workout__pick-count">{picked.size ? 'Выбрано ' + pickedUnits() : 'Отметьте упражнения'}</span>
            <button type="button" className="button" disabled={pickedUnits() < 2 || s.exercises.some(e => picked.has(e.id) && e.sets.some(x => x.who))} onClick={pickSuperset}>
              <IconLinkPair size={16} />Суперсет
            </button>
            <button type="button" className="button" disabled={!picked.size} onClick={pickCopy}>Дублировать</button>
            <button type="button" className="button button--critical" disabled={!picked.size || picked.size >= s.exercises.length} onClick={pickDelete}>Удалить</button>
          </div>
        )}
        <button className="button button--block" disabled={s.exercises.length >= 30} onClick={() => change(s => ({ ...s, exercises: [...s.exercises, { id: uid(), name: 'Новое упражнение', note: '', prescription: '', prevWeight: '', sets: [blankSet()] }] }))}>Добавить упражнение</button>
        <label className="workout__field">Как прошла тренировка<textarea value={s.note} maxLength={1000} rows={3} onChange={e => change(s => ({ ...s, note: e.target.value }))} /></label>
      </fieldset>
      {!editable && <div className="workout__finish"><h3>{labels[s.status]}</h3><p>{stats.done} подходов · {Math.round(stats.volume).toLocaleString('ru-RU')} кг рабочего объёма</p><p className="small muted">Оплаты и учёт занятий по календарю не изменены.</p><button className="button" disabled={busy || !!conflict} onClick={() => change(s => ({ ...s, status: 'paused' }))}>Исправить результат</button><button className="button" disabled={record.dirty || busy} onClick={() => { store(null); list().catch(e => setMessage(e.message)); }}>К журналу</button></div>}
      {/* «Сохранить сейчас» и «Скачать результат» убраны (03.10.2026):
          сохраняется само. Не сохранилось — «Повторить» в сообщении об
          ошибке вверху; конфликт версий — «Скачать мой черновик» там же */}
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
  if (n && n.items) return [n.part, n.items.map(it => [it.name, it.load].filter(Boolean).join(' ')).join(' + ')].join(' · ');
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
  const loadOf = (x) => [x.weight ? kg(num(x.weight)) + ' кг' : '', x.reps ? '× ' + x.reps : ''].filter(Boolean).join(' ');
  const changeOf = (e, x, list) => {
    const before = list.slice(0, list.indexOf(x)).filter(y => y.state === 'done').pop();
    if (before && x.weight && before.weight) {
      const d = num(x.weight) - num(before.weight);
      return d > 0 ? { kind: 'up', text: 'накинуть ' + kg(d) + ' кг' }
        : d < 0 ? { kind: 'down', text: 'снять ' + kg(-d) + ' кг' }
          : { kind: 'same', text: 'вес тот же' };
    }
    if (!before) return { kind: 'new', text: 'новое упражнение' + (e.prevWeight ? ' · в прошлый раз ' + String(e.prevWeight).replace('.', ',') : '') };
    return null;
  };
  // Дальше суперсет — весь круг, а не одно упражнение (03.10.2026)
  const mates = ex.supersetGroup && !set.who ? s.exercises.filter(e => e.supersetGroup === ex.supersetGroup) : [];
  if (mates.length > 1) {
    const r = focus.set;
    const rounds = Math.max(...mates.map(e => e.sets.length));
    const items = mates.filter(e => e.sets[r] && e.sets[r].state !== 'skipped')
      .map(e => ({ name: e.name, load: loadOf(e.sets[r]), change: changeOf(e, e.sets[r], e.sets), done: e.sets[r].state === 'done' }));
    return { name: 'Суперсет', part: 'круг ' + (r + 1) + ' из ' + rounds, items };
  }
  return { name: ex.name, part, load, change: changeOf(ex, set, own) };
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
        onPick({
          name,
          exerciseId: exerciseId || null,
          ...(base && base.track ? { track: base.track } : {}),
          exercise: base || null,
        });
      }}
      onAdded={() => library.reload()}
    />
  </div>;
}
