import { primaryEquipment } from './equipment-guidance.js';
import WorkoutGuidance from './WorkoutGuidance.jsx';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync, createPortal } from 'react-dom';
import { apiStale, apiPublic, apiMutate, apiWait } from './api.js';
import { dropLocalWorkout, enqueueWorkout, journalGet, journalList, peekLocalWorkout, settleClosed } from './workout-outbox.js';
import { localWrites } from './offline-writes.js';
import { storageKey } from './workout-draft.js';
import { haptic } from './telegram.js';
import { clock, closeSets, serverTick, fromPlan, newExercise, reopenSession, summary, resultIssue, uid, setLabel, replacementPlan, replaceWorkoutExercise, withMachine, withMemberMachine, withWarmup, withSet, withoutSet, cloneSet, editSetField } from './workout-model.js';
import { IconCheck, IconClose, IconLinkPair, IconSliders, IconPlus, IconDelta, IconChevron, IconMore } from './icons.jsx';
import { useBackGesture, useTabLock } from './gestures.jsx';
import { BackButton } from './ui.jsx';
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
import { ExerciseMachines } from './trainer/MachinesEditor.jsx';
import { HistoryPick } from './trainer/HistoryMove.jsx';

import { useData } from './useData.js';
import { MachineNote } from './media.jsx';
import { EFFORT_WORD, restFor, roundRest, rateSet, rerate, unrateAt, suggestText, otherMachineText, wasSet, repsGoalText, repsLeftText, isAssisted, settleOrder } from './effort.js';
import { RestScreen, RestPill } from './RestScreen.jsx';
import { usePlankAccess } from './plank-access.js';
import { restHere, setRestHere, workoutScreenOpen, restClosed } from './rest-here.js';
import { maybeAskReview, noteWorkoutDone } from './native-review.js';
import { useReveal } from './reveal.js';
import { setsWord, planText, supersetMark, focusOf, nextText, nextInfo, unitsOf as units } from './workout-view.js';
import { EffortChooser, EffortFix } from './EffortButtons.jsx';
import RestChips from './RestChips.jsx';
import LastRunHint from './LastRunHint.jsx';

const labels = { active: 'Идёт', paused: 'На паузе', completed: 'Завершена', cancelled: 'Отменена' };

// backLabel — куда ведёт «назад»: из программы — к ней, из меню — к списку клиентов
export default function WorkoutJournal({ clientRow, clientView = false, launch, onClose, backLabel = 'К программе' }) {
  const plankEnabled = usePlankAccess();
  const [record, setRecord] = useState(null);
  const [history, setHistory] = useState([]);
  const [ready, setReady] = useState(false);
  const [trackNote, setTrackNote] = useState(null); // { ei, text, error } — вид упражнения ушёл в базу или нет
  const [busy, setBusy] = useState(false);
  // Ошибка связи или сохранения: { text, retry } — закреплённой плашкой у
  // низа экрана, а не строкой над шапкой (аудит 24.10.2026): та вставала в
  // поток, сдвигала всё занятие вниз и пропадала на следующем касании. held —
  // после сбоя автосохранение ждёт следующей правки; плашка при этом стоит,
  // пока не сохранится, не нажмут «Повторить» или крестик
  const [message, setMessageState] = useState(null);
  const [held, setHeld] = useState(false);
  const setMessage = (text, retry = true) => { setMessageState(text ? { text, retry } : null); setHeld(!!text); };
  // Чего не хватает, чтобы отметить подход: { key: 'упражнение:подход', text } —
  // под строкой подхода, как у круга суперсета (roundLack), а не плашкой
  // над шапкой (аудит 24.10.2026)
  const [lack, setLack] = useState(null);
  const [storageError, setStorageError] = useState(false);
  const [conflict, setConflict] = useState(null);
  const [confirm, setConfirm] = useState('');
  // Меню ⋯ в шапке: «Выбрать упражнения», «Отменить занятие» (QA 20.10.2026)
  const [moreOpen, setMoreOpen] = useState(false);

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
  // Отдых, запущенный с этого телефона (rest-here.js): окно «Отдых
  // окончен» всплывает в любом разделе только у того, кто его запустил
  // «Свернуть таймер»: until свёрнутого отдыха — плашка вместо экрана
  const [collapsedUntil, setCollapsedUntil] = useState(0);
  // Отдых, который шёл, пока экран был открыт (24.10.2026): только у него
  // показываем «Отдых окончен». Отдых с часов, закончившийся, пока телефон
  // лежал, при входе в занятие всплывал «Отдых окончен» от старого таймера
  const restSeen = useRef(0);
  // Пока экран отдыха развёрнут — страница под ним не листается
  const lockScroll = useRef(false);
  // Разъединили или соединили суперсет — подходы перелетают на новые места
  const fieldsRef = useRef(null);
  const flip = useFlip(fieldsRef);
  const [now, setNow] = useState(Date.now());
  const state = useRef(null), key = useRef(''), saving = useRef(false), mounted = useRef(true);
  // visibilitychange может прийти раньше, чем журнал загрузил занятие.
  // Очередь плашки одноразовая: до готовности экрана её нельзя забирать.
  const readyRef = useRef(false);
  readyRef.current = ready;
  const takingLiveActions = useRef(false);
  // Нажали на часах, пока журнал ещё забирается, — забрать ещё раз после
  const liveActionsAgain = useRef(false);
  // id занятия, которое человек только что завершил на этом экране (оценка)
  const finishedHere = useRef('');
  const conflictRef = useRef(null);
  // Просили сохранить, пока шло прежнее сохранение (см. save)
  const saveAgain = useRef(false);
  // Какой отдых уже отправлен вне очереди (rushRest): «занятие:до»
  const rushed = useRef('');
  // Чего не хватает, чтобы отметить круг суперсета: { key: 'группа:круг', text }
  const [roundLack, setRoundLack] = useState(null);
  // Переименование касанием по названию (02.10.2026): id упражнения
  const [renaming, setRenaming] = useState('');
  // Клиент (и тренер в режиме «смотрите как клиент») название и вид не меняет
  // (владелец, 09.10.2026): это решает тренер. С 10.10.2026 (FT-531) и состав
  // занятия тоже: нет «Выбрать», настроек под названием, перестановки
  // удержанием, удаления упражнения и «Разъединить». Подходы — отмечает,
  // вес и повторы в строках, «Добавить подход» — может
  const asClient = !clientRow || clientView;
  // Настройки касанием по единицам (FT-513): id упражнения, в круге — id:круг
  const [tuning, setTuning] = useState('');
  const [renamingTitle, setRenamingTitle] = useState(false);
  // Перестановка удержанием (02.10.2026): { key } — какой блок тащат.
  // Пока тащат, карточки свёрнуты в строки (как в «Выбрать»): развёрнутая
  // карточка выше экрана, цель за ней не видна
  const [reorder, setReorder] = useState(null);
  const drag = useRef(null);
  // Снять слушатели перетаскивания, если экран закрыли посреди удержания
  const dragOff = useRef(null);
  useEffect(() => () => { if (dragOff.current) dragOff.current(); }, []);
  const swallowClick = useRef(false);
  const params = clientRow ? { clientRow } : {};

  /**
   * Черновик на устройстве — синхронно на каждое изменение. Отложенную
   * запись (20.10.2026) откатили: при смене экземпляра экрана сброс старого
   * мог затереть черновик нового — тот самый сценарий из теста «ответ
   * старого экрана не затирает новый ввод». Сериализация занятия стоит
   * единицы миллисекунд, это дешевле риска потерять подход
   */
  const store = value => {
    state.current = value;
    if (mounted.current) setRecord(value);
    try {
      if (value) localStorage.setItem(key.current, JSON.stringify(value));
      else localStorage.removeItem(key.current);
      if (mounted.current) setStorageError(false);
    } catch (_) { if (mounted.current) setStorageError(true); }
  };
  // Список — с сервера, без связи — последний полученный и очередь
  // телефона (FT-566, workout-outbox.js)
  const list = async () => {
    const result = await journalList(clientRow);
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
      // Занятие из очереди телефона (ещё не на сервере) — обратно в
      // черновик: дальше его сохраняет журнал обычным путём, с проверкой
      // версии и выбором при конфликте (FT-566)
      const local = await peekLocalWorkout(clientRow, id);
      if (local) {
        store(local);
        let kept = null;
        try { kept = localStorage.getItem(key.current); } catch (_) {}
        if (kept) await dropLocalWorkout(clientRow, id);
        return;
      }
      const result = await journalGet(clientRow, id);
      // Чтение ушло раньше, чем сервер принял нажатие часов, а пришло
      // после него (23.10.2026): занятие старее того, что уже на экране, —
      // подход снова не отмечен, отдых прошлый. Не берём
      const cur = state.current;
      if (cur && cur.session && cur.session.id === id && (cur.revision || 0) > (result.session.revision || 0)) return;
      store({ session: result.session, revision: result.session.revision, serverTitle: result.session.title, dirty: false, tick: serverTick(result.session) });
    } catch (e) { setMessage(e.message); }
    finally { setBusy(false); }
  };
  /**
   * Закрытое, но не отправленное занятие — в очередь телефона, черновик —
   * свободен (FT-566). Раньше оно держало черновик, пока не уйдёт на сервер,
   * и без связи следующую тренировку было не начать. Не вышло записать в
   * очередь — false: черновик остаётся, человеку говорим, что не так.
   */
  const park = async record => {
    try {
      await enqueueWorkout(clientRow, record);
      return true;
    } catch (e) {
      setMessage('Не удалось сохранить занятие на телефоне: ' + e.message + ' Черновик остаётся — не закрывайте его, пока не появится связь.');
      return false;
    }
  };
  const freshRecord = session => ({ session, revision: 0, dirty: true, tick: Date.now(), edit: 1 });
  // Подходы к силовой с часов («Обзор», client/WatchSuggest.jsx): начало —
  // по часам, чтобы сервер совместил занятие с их тренировкой
  const planned = l => ({ ...fromPlan(l.block, l.month, l.members || []), ...(l.startedAt ? { startedAt: l.startedAt } : {}) });

  useEffect(() => {
    mounted.current = true;
    let alive = true;
    (async () => {
      key.current = await storageKey(clientRow);
      let draft = null;
      try { draft = JSON.parse(localStorage.getItem(key.current)); } catch (_) { setStorageError(true); }
      if (!alive) return;
      // Начинают новую тренировку, а в черновике — закрытое, но не
      // отправленное: оно уходит в очередь телефона и отправится само, а
      // экран свободен (FT-566). Сервер для этого не нужен — без связи
      // так же
      if (launch && launch.block && draft && draft.session && ['completed', 'cancelled'].includes(draft.session.status)
        && (draft.dirty || draft.pending) && await park(draft)) {
        if (!alive) return;
        draft = null;
        try { localStorage.removeItem(key.current); } catch (_) {}
      }
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
          else if (launch && launch.block) store(freshRecord(planned(launch)));
        }
      } catch (e) {
        if (alive) {
          setMessage(launch && launch.block
            ? 'Нет связи — тренировка идёт на телефоне и сохранится, когда связь появится.'
            : 'Нет связи с журналом. ' + e.message);
          if (!draft && launch && launch.block) store(freshRecord(planned(launch)));
        }
      } finally { if (alive) setReady(true); }
    })();
    return () => {
      alive = false; mounted.current = false;
      // Экран закрыли — закрытое неотправленное занятие уходит в очередь
      // телефона и отправляется, как только будет связь (FT-566)
      settleClosed(clientRow);
    };
  }, []);

  const change = transform => {
    const r = state.current;
    if (!r) return;
    const elapsed = r.session.status === 'active' ? Math.max(0, Date.now() - r.tick) : 0;
    const next = transform({ ...r.session, elapsedMs: Math.min(604800000, r.session.elapsedMs + elapsed) });
    // Порядок и усталость (22.10.2026): упражнение, начатое после другого на
    // те же мышцы (а в прошлый раз — нет), — на шаг легче (effort.js)
    const settled = next && Array.isArray(next.exercises) ? settleOrder(next.exercises) : null;
    const session = settled && settled !== next.exercises ? { ...next, exercises: settled } : next;
    store({ ...r, session, tick: Date.now(), dirty: true, edit: (r.edit || 0) + 1 });
    // Правка — повод снова попробовать сохранить. Плашку не снимаем: она
    // уйдёт, когда сохранение пройдёт (аудит 24.10.2026)
    setHeld(false);
    // Вписали недостающее — подсказка под подходом и под кругом больше не нужна
    setRoundLack(null);
    setLack(null);
  };

  const save = async () => {
    let r = state.current;
    // Идёт прежнее сохранение — не теряем просьбу, а повторяем сразу после
    // него. Иначе отдых, начатый вслед за отметкой подхода, ждал обычную
    // задержку, телефон тем временем уходил в карман, iPhone замораживал
    // страницу — и сервер не узнавал об отдыхе (уведомление не приходило).
    if (r && r.dirty && saving.current) { saveAgain.current = true; return; }
    if (!r || !r.dirty || saving.current || conflictRef.current || !key.current) return;
    if (!r.pending) {
      const issue = resultIssue(r.session);
      if (issue) {
        if (mounted.current) setMessage('Не сохранено: ' + issue + ' Исправьте результат подхода. Черновик остаётся на устройстве.', false);
        return;
      }
    }
    saving.current = true; if (mounted.current) setBusy(true);
    // Ушёл снимок старее черновика (повтор потерянного) — новое досылаем
    // сразу после ответа, а не обычной задержкой: телефон к тому времени уже
    // в кармане, и страница её не дождётся (24.10.2026)
    let resend = false;
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
      // Сервер влил это занятие в уже идущее той же тренировки (начали без
      // связи, а клиент вёл своё, 19.10.2026): дальше ведём идущее.
      // Отмеченное здесь, пока шёл запрос, досылаем тем же путём — сервер
      // вольёт и его, повтор безопасен
      if (result.absorbed && result.session.id !== r.session.id) {
        store({ session: result.session, revision: result.session.revision, serverTitle: result.session.title, dirty: false, tick: serverTick(result.session), pending: null });
        if (!unchanged) apiMutate('workout.save', { ...params, session: current.session, revision: 0, requestId: uid() }).catch(() => {});
        if (mounted.current) { setMessage(''); list().catch(() => {}); }
        return;
      }
      store({ ...current, session: unchanged ? result.session : {
        ...current.session, startedAt: result.session.startedAt, updatedAt: result.session.updatedAt,
        // Связь с программой и месяц ведёт сервер: переименование тренировки
        // или месяца меняет их, пока здесь дописывают занятие
        sourceBlock: result.session.sourceBlock, sourceBlockId: result.session.sourceBlockId, month: result.session.month,
      }, revision: result.session.revision, serverTitle: result.session.title, pending: null, dirty: !unchanged });
      resend = !unchanged && mounted.current;
      if (mounted.current) { setMessage(''); list().catch(() => {}); }
    } catch (e) {
      // Явный отказ валидации позволяет исправить снимок. При потере
      // связи сохраняем прежний requestId: запись могла уже состояться.
      if (mounted.current && e.code && state.current?.session.id === r.session.id) store({ ...state.current, pending: null });
      if (mounted.current) setMessage('Не сохранено в облаке: ' + e.message + ' Черновик остаётся на устройстве.');
    } finally {
      saving.current = false; if (mounted.current) setBusy(false);
      if (saveAgain.current || resend) { saveAgain.current = false; save(); }
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
    if (!readyRef.current) return;
    if (takingLiveActions.current) { liveActionsAgain.current = true; return; }
    const sessionId = state.current?.session?.id;
    if (!sessionId) return;
    takingLiveActions.current = true;
    try {
      // Сборка с очередью подходов: журнал нажатий — «Отдых» (подход сделан
      // + отдых) и вес — проигрываем по порядку. Забираем только для
      // открытого занятия: чужая очередь должна дождаться своего экрана.
      const actions = await takeActions(sessionId);
      const cur = state.current?.session;
      if (actions.length && cur?.id === sessionId && ['active', 'paused'].includes(cur.status)) {
        if (applyActions(cur, actions) !== cur) { change(v => applyActions(v, actions, localRestPlatform())); save(); }
      }
      const rest = await takePendingRest();
      const s = state.current?.session;
      if (!rest || !s || s.id !== rest.sessionId || s.status !== 'active' || rest.restUntil <= (s.restUntil || 0)) return;
      change(v => ({ ...v, restUntil: rest.restUntil, restLocal: localRestPlatform() }));
      save();
    } finally {
      takingLiveActions.current = false;
      if (liveActionsAgain.current) { liveActionsAgain.current = false; applyPendingRest(); }
    }
  };
  useEffect(() => { if (ready) applyPendingRest(); }, [ready]);
  // «+30 с» / «Закрыть» на будильнике отдыха (iPhone, часы) и любое нажатие
  // на часах или плашке («watch», 22.10.2026) — сразу в занятие, а не после
  // сворачивания приложения
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
    if (['active', 'paused'].includes(status)) {
      // Пересобирать плашку на каждое нажатие клавиши незачем: через
      // треть секунды тишины, по свежему снимку (20.10.2026, аудит)
      const t = setTimeout(() => showWorkoutActivity(state.current, clientRow, { coach: isCoaching(clientRow, clientView) }), 300);
      return () => clearTimeout(t);
    }
    if (['completed', 'cancelled'].includes(status)) endWorkoutActivity(record.session.id);
    return undefined;
  }, [record]);

  useEffect(() => {
    if (!ready || !record?.dirty || busy || held || conflict) return;
    const timer = setTimeout(save, 1800);
    return () => clearTimeout(timer);
  }, [record, ready, busy, held, conflict]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    const online = () => { setMessage(''); save(); };
    const unload = e => { if (state.current?.dirty) { e.preventDefault(); e.returnValue = ''; } };
    // Свернули приложение или заблокировали экран — несохранённое уходит
    // сразу: на iPhone у страницы после этого мгновения, не секунды. Ждёт
    // ответа прежнее сохранение — идущий отдых уходит вне очереди (rushRest)
    const leave = () => {
      if (saving.current || state.current?.pending) rushRest();
      save();
    };
    const hide = () => (document.hidden ? leave() : applyPendingRest());
    window.addEventListener('online', online);
    window.addEventListener('beforeunload', unload);
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', leave);
    return () => {
      clearInterval(interval); window.removeEventListener('online', online); window.removeEventListener('beforeunload', unload);
      document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', leave);
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
   * взять заново, а чужая доедет следующим чтением. Свои правки сервер
   * сводит с чужими сам (server/src/lib/workout-merge.js) и возвращает
   * общее — затирать их здесь не нужно.
   *
   * С 19.10.2026 экран не опрашивает раз в двадцать секунд, а ждёт:
   * workout.wait держит запрос, пока занятие не сохранят на другом
   * устройстве (часы, телефон клиента), и отвечает сразу — отметка
   * тренера у клиента появляется через секунду.
   */
  useEffect(() => {
    if (!ready) return;

    const take = (session, r) => {
      if (!mounted.current || !session || state.current?.dirty || state.current?.pending || saving.current
        || conflictRef.current || state.current?.session.id !== r.session.id) return false;
      if (session.revision !== r.revision) store({ session, revision: session.revision, serverTitle: session.title, dirty: false, tick: serverTick(session) });
      return true;
    };
    const refresh = async () => {
      const r = state.current;
      if (!r || r.dirty || saving.current || conflictRef.current || document.hidden) return;
      try {
        const result = await apiPublic('workout.get', { ...params, id: r.session.id });
        take(result.session, r);
      } catch (_) { /* Сбой чтения не должен мешать записи локального подхода. */ }
    };

    let alive = true;
    const pause = ms => new Promise(done => setTimeout(done, ms));
    (async () => {
      while (alive) {
        const r = state.current;
        // Ждать есть смысл у идущего занятия, уже бывшего на сервере, на
        // открытом экране
        if (!r || !['active', 'paused'].includes(r.session.status) || !r.revision || document.hidden || conflictRef.current) {
          await pause(1000);
          continue;
        }
        try {
          const result = await apiWait('workout.wait', { ...params, id: r.session.id, revision: r.revision });
          if (!alive) return;
          // Здесь несохранённое — его сохранение принесёт общее; не крутить
          // запросы, пока оно не ушло
          if (result.session && !take(result.session, r)) await pause(1500);
        } catch (_) {
          // Нет связи — пробуем реже; вернулась — refresh по «online»
          await pause(10000);
        }
      }
    })();
    const timer = setInterval(refresh, 60000);
    const listen = (target, event) => {
      if (target && target.addEventListener) target.addEventListener(event, refresh);
      return () => { if (target && target.removeEventListener) target.removeEventListener(event, refresh); };
    };

    const off = [
      listen(document, 'visibilitychange'),
      listen(window, 'focus'),
      listen(window, 'online'),
    ];

    return () => { alive = false; clearInterval(timer); off.forEach(fn => fn()); };
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
   * Длительность отдыха. У упражнения свой отдых из программы (ex.rest,
   * 20.10.2026: базовым 2–3 минуты, изолирующим — минута) — он; нет —
   * общий отдых занятия. Не выбран — 1:30, как на часах: с оценками подхода
   * (03.10.2026) отдых запускается всегда, а «Вручную» (ноль) оставлял
   * человека без таймера — так было на живой тренировке
   */
  const restBase = (ex = null) => (ex && ex.rest) || (state.current && state.current.session.restSeconds) || 90;

  /** +30 секунд к отдыху — и уведомление переставить */
  const extendRest = () => {
    const was = (state.current && state.current.session.restUntil) || 0;
    restAt(Math.max(Date.now(), was) + 30000, was > Date.now() ? restStartOf(was) : undefined);
  };

  /**
   * Когда начался идущий отдых: восстанавливаем по запомненному старту, а
   * если отдых пришёл с другого устройства (часы, второй телефон) —
   * отсчитываем назад от выбранной длительности
   */
  const restStart = useRef({ until: 0, start: 0 });
  // Где только что отметили подход: «Дальше» на экране отдыха и подсветка
  // держатся этого упражнения, пока в нём есть подходы (focusOf, QA 20.10.2026)
  const lastMarked = useRef('');
  const restStartOf = (until) => {
    if (restStart.current.until === until && restStart.current.start) return restStart.current.start;
    return until - ((state.current && state.current.session.restSeconds) || 90) * 1000;
  };

  /**
   * Сменили длительность отдыха (владелец, 16.10.2026). Отдых уже идёт — он
   * не начинается заново: идёт тот же, только с новой длиной от своего
   * начала. Поставили меньше, чем уже прошло, — отдых заканчивается сразу.
   * Отдых не идёт — как раньше, запускается новый
   */
  const changeRestLength = (seconds) => {
    const cur = state.current && state.current.session;
    const until = (cur && cur.restUntil) || 0;
    const running = !!cur && cur.status === 'active' && until > Date.now();
    const start = running ? restStartOf(until) : 0;
    change(v => ({ ...v, restSeconds: seconds }));
    if (!running) { startRest(seconds); return; }
    restAt(Math.max(Date.now(), start + seconds * 1000), start);
  };

  /**
   * Отдых до времени until. Сначала — на сервер (он пришлёт уведомление,
   * если телефон не сможет сам), потом телефон ставит своё
   * (native-rest.js) и, только если поставил, говорит серверу молчать:
   * restLocal — платформа этого телефона. Запрещены уведомления — отметки
   * нет, и уведомление придёт с сервера, как раньше.
   */
  const restAt = (until, start = Date.now()) => {
    restStart.current = { until, start };
    // Длина отдыха — для кольца на экране отдыха
    setCollapsedUntil(0);
    change(v => ({ ...v, restUntil: until, restLocal: '' }));
    const cur = state.current && state.current.session;
    setRestHere({ until, total: Math.max(1000, until - Date.now()), next: cur ? nextInfo(cur, focusOf(cur, lastMarked.current)) : null, sessionId: cur ? cur.id : '' });
    // До save: он сам ставит «идёт сохранение»
    const behind = saving.current || !!(state.current && state.current.pending);
    save();
    if (behind) rushRest();
    // Что дальше — в уведомление о конце отдыха и в шторку (Android)
    scheduleRestEnd(until, nextText(state.current && state.current.session, lastMarked.current)).then((ok) => {
      if (!ok || state.current?.session.restUntil !== until) return;
      change(v => (v.restUntil === until ? { ...v, restLocal: localRestPlatform() } : v));
      save();
    });
  };

  /**
   * Отдых — на сервер сразу, не дожидаясь ответа на прежнее сохранение
   * (24.10.2026). Подход отметили, отдых пошёл, телефон тут же в карман:
   * снимок с отдыхом ждал ответа на предыдущий, iPhone замораживал
   * страницу — и отдых дошёл до сервера через три минуты уже закончившимся
   * (часы показали «Отдых окончен» с первой секунды). Здесь — одно нажатие
   * «отдых до» тем же путём, что у часов (workout.watch): сервер кладёт
   * его в последнюю версию занятия, повтор безопасен — более ранний отдых
   * он не примет. Запрос уходит из страницы мгновенно; дальше его везёт
   * сетевой процесс телефона, даже если страницу заморозили. Полный
   * снимок следом уходит обычным сохранением, сервер сведёт его по
   * версиям (workout-merge.js)
   */
  const rushRest = () => {
    const r = state.current;
    const s = r && r.session;
    if (!s || !r.revision || s.status !== 'active' || !(s.restUntil > Date.now())) return;
    const mark = s.id + ':' + s.restUntil;
    if (rushed.current === mark) return;
    rushed.current = mark;
    apiMutate('workout.watch', { ...params, sessionId: s.id, actions: [{ kind: 'rest', sessionId: s.id, restUntil: s.restUntil }] })
      .catch(() => { if (rushed.current === mark) rushed.current = ''; });
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
  /**
   * Чего не хватает для отметки — под подходом, и курсор сразу в пустое
   * поле (аудит 24.10.2026): плашка над шапкой сдвигала занятие и была не
   * видна за клавиатурой. fields — поля строки, set — сам подход
   */
  const askFor = (key, text, fields, set) => {
    setLack({ key, text });
    const want = /вес/.test(text) ? ['weight', 'assist'] : /время/.test(text) ? ['time'] : /повтор/.test(text) ? ['reps'] : [];
    const field = fields.find(f => want.includes(f.key)) || fields.find(f => !String(set[f.key] || '').trim()) || fields[0];
    if (!field || typeof document === 'undefined' || typeof document.querySelector !== 'function') return;
    const input = document.querySelector('[data-field="' + String(key + ':' + field.key).replace(/["\\]/g, '\\$&') + '"]');
    if (input && input.focus) input.focus();
  };
  // Номер последней замены: ответ истории применяется только к ней (выбрали
  // A, потом B, потом снова A — ответ на первое A пришёл бы в уже новое A)
  const replaceSeq = useRef(0);
  const replaceExercise = async (ei, picked) => {
    const current = state.current && state.current.session.exercises[ei];
    if (!current) return;
    replaceSeq.current += 1;
    const seq = replaceSeq.current;

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
        if (seq !== replaceSeq.current || ex.name !== picked.name || Number(ex.exerciseId || 0) !== Number(picked.exerciseId || 0)) return ex;
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
    // Без вибрации (аудит 24.10.2026): тренажёр подставляет сам экран, когда
    // приехали настройки (autoMachine), — телефон дёргался без касания
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
    catch (_) { setMessage('Скачайте черновик перед загрузкой другой версии.', false); return; }
    const remote = conflict.session;
    conflictRef.current = null; setConflict(null);
    store({ session: remote, revision: remote.revision, serverTitle: remote.title, dirty: false, tick: serverTick(remote) });
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
    // Вписанный вес — свой; следующим рабочим без прошлого раза тот же, но
    // не из разминки (FT-620); повторы — пересчёт от прошлого раза
    // (workout-model.js, editSetField)
    const edit = (key, value) => updateExercise(ei, x => editSetField(x, si, key, value));
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
    // «На сторону» — у первого подхода человека (он переносится на все), у
    // остальных — только если отличается: 16 одинаковых флажков на экране
    // (QA 20.10.2026) читались как шум
    const firstOwn = ex.sets.findIndex(x => (x.who || '') === (set.who || ''));
    const sideHere = track.kind === 'strength' && (si === firstOwn || setOneSide(set, track) !== setOneSide(ex.sets[firstOwn], track));
    const removeSet = () => { setUndo(s.exercises, 'Подход удалён'); setOpenSet(''); updateExercise(ei, ex => withoutSet(ex, si)); };
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
                <input key={f.key} aria-label={`${ex.name}, подход ${si + 1}, ${f.key === 'weight' ? 'вес в кг' : f.key === 'reps' ? 'повторы' : f.head.toLowerCase()}`} data-field={key + ':' + f.key} inputMode={f.mode} placeholder={f.placeholder || ''} value={set[f.key] || ''} maxLength={f.max} onChange={e => edit(f.key, e.target.value)} />
              ))}
            </div>
            {/* Под строкой, под колонкой веса — одной строкой: вес на одну
                сторону (у каждого подхода; в первом — переносится на все,
                дальше любую можно снять, владелец 07.10.2026) и «было» */}
            {/* Тот же подход в прошлый раз — у каждого подхода свой
                (владелец, 03.10.2026: «было» на всё упражнение бесполезно) */}
            {(sideHere || was) && <div className="workout__set-meta">
              {sideHere && <label className="workout__side">
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
              {was && <span className="workout__was">было {was.assist !== undefined ? 'помощь ' + was.assist : was.weight} кг{was.reps ? ' × ' + was.reps : ''}</span>}
            </div>}
            {/* Диапазон «8–12»: сколько не хватило до верхней границы (19.10.2026) */}
            {repsLeftText(ex, set) && <p className="workout__goal-left">{repsLeftText(ex, set)}</p>}
            {/* Галочки нет (03.10.2026): под ближайшим подходом упражнения —
                «Легко / Норм / Тяжело», каждая отмечает подход и запускает
                отдых. Снять отметку — номер подхода → «Снять отметку» */}
            {!inRound && editable && set.state === 'pending' && nextOf(ex, si) && effortChooser((effort) => {
              // Разминку можно и без веса: свой вес, без нагрузки (FT-620)
              const why = missing(set, track, { requireWeight: set.kind !== 'warmup' });
              if (why) { askFor(key, why, fields, set); return; }
              // Один расчёт на свежем снимке — и в занятие, и для отдыха:
              // change зовёт transform сразу (20.10.2026, аудит)
              let rated = null;
              lastMarked.current = ex.id;
              updateExercise(ei, x => { rated = rateSet(x, si, effort); return rated.ex; });
              // Последний подход занятия — без отдыха, сразу «Завершить?»
              if (allDone()) { afterLast(); return; }
              // Отдых начинается там, где человек нажал: подход отмечен —
              // время пошло. Длительность — по оценке и по тому, было ли
              // куда прибавить (effort.js, capped)
              if (restAfter) startRest(restFor(effort, restBase(ex), !!(rated && rated.capped)));
            }, current, set.kind === 'warmup')}
            {/* Под кнопками оценки, а не над ними: нажатая кнопка не уезжает
                из-под пальца (аудит 24.10.2026) */}
            {!inRound && lack && lack.key === key && <p className="workout__round-lack" role="alert">{lack.text}</p>}
            {set.state === 'pending' && set.suggest && (() => {
              // Только у ближайшего: сразу за отмеченным подходом того же человека
              const prev = ex.sets.slice(0, si).filter(x => (x.who || '') === (set.who || '')).pop();
              if (!prev || prev.state !== 'done') return null;
              const t = suggestText(set, prev, ex);
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
              {/* Нажали не ту оценку — поменять: веса следующих подходов, которые сдвинула прежняя, возвращаются (19.10.2026) */}
              {editable && set.state === 'done' && set.kind !== 'warmup' && effortFix(set.effort, (effort) => {
                setOpenSet('');
                updateExercise(ei, x => rerate(x, si, effort).ex);
              })}
              {setExtras(ex, ei, si)}
              <div className="workout__toolbar">
                <label>Тип<select value={set.kind} onChange={e => updateSet(ei, si, s => ({ ...s, kind: e.target.value }))}><option value="work">Рабочий</option><option value="warmup">Разминка</option></select></label>
                {setTools(ex, ei, si)}
                {set.state === 'done'
                  ? <button className="button" onClick={() => { setOpenSet(''); updateExercise(ei, x => unrateAt(x, si)); }}>Снять отметку</button>
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
            <label key={f.key}><span>{f.head}</span><input aria-label={`${ex.name}, отрезок ${si + 1}, ${f.head.toLowerCase()}`} data-field={key + ':' + f.key} inputMode={f.mode} placeholder={f.placeholder || ''} maxLength={f.max} value={set[f.key] || ''} onChange={e => edit(f.key, e.target.value)} /></label>
          ))}
        </div>}
      {/* Как у силовых: отрезок отмечается оценкой, она же запускает отдых */}
      {!inRound && editable && set.state === 'pending' && nextOf(ex, si) && effortChooser((effort) => {
        const why = lackOf(ex, si);
        if (why) { askFor(key, why, isFunctional(ex) ? [] : fields, set); return; }
        lastMarked.current = ex.id;
        updateExercise(ei, x => { const y = pinIntervals(x, si); return { ...y, sets: y.sets.map((s, i) => (i === si ? { ...s, state: 'done', effort } : s)) }; });
        if (allDone()) { afterLast(); return; }
        if (restAfter) startRest(restFor(effort, restBase(ex)));
      }, current)}
      {!inRound && lack && lack.key === key && <p className="workout__round-lack" role="alert">{lack.text}</p>}
      {!inRound && openSet === key && <div className="workout__set-options">
        {editable && set.state === 'done' && effortFix(set.effort, (effort) => { setOpenSet(''); updateSet(ei, si, x => ({ ...x, effort })); })}
        <div className="workout__toolbar">
          <label>Тип<select value={set.kind} onChange={e => updateSet(ei, si, s => ({ ...s, kind: e.target.value }))}><option value="work">Рабочий</option><option value="warmup">Разминка</option></select></label>
          {set.state === 'done'
            ? <button className="button" onClick={() => { setOpenSet(''); updateExercise(ei, x => unrateAt(x, si)); }}>Снять отметку</button>
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
    if (kind === 'complete') {
      const issue = resultIssue(state.current.session);
      if (issue) {
        setConfirm('');
        setMessage('Не удалось завершить: ' + issue + ' Исправьте результат подхода и завершите тренировку снова.', false);
        return;
      }
    }
    // Своя тренировка клиента завершена здесь — успех для просьбы об оценке
    // (native-review.js). Окно — уже на экране итога, см. finishedHere
    if (kind === 'complete' && !clientRow) {
      finishedHere.current = state.current.session.id;
      noteWorkoutDone(state.current.session.id);
    }
    // finishedAt — когда завершили на самом деле: без сети занятие дойдёт
    // до сервера позже, и время отправки его бы сдвинуло (FT-566)
    change(v => ({ ...v, status: kind === 'complete' ? 'completed' : 'cancelled', restUntil: 0, finishedAt: new Date().toISOString(), exercises: closeSets(v.exercises) }));
    setConfirm('');
    save();
  };

  /**
   * «Продолжить» в завершённом или отменённом занятии (владелец, 09.10.2026:
   * «Завершить» нажимают по ошибке). Занятие снова идёт — и у тренера, и у
   * клиента; подходы, пропущенные при завершении, снова в работе, экран —
   * у первого из них. Другое занятие уже идёт — сервер ответит конфликтом,
   * его покажет обычная плашка
   */
  const resume = () => {
    change(reopenSession);
    save();
    haptic('medium');
    setTimeout(() => {
      const row = document.querySelector && (document.querySelector('.workout__set--current') || document.querySelector('.workout__exercise--current'));
      if (row && row.scrollIntoView) row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 80);
  };

  /**
   * Подсказку «легко — мог ещё 3 повтора…» показываем, пока человек не
   * оценил ни одного подхода — в этом занятии или раньше (отметка на
   * устройстве): тренеру после первого занятия это шум (QA 20.10.2026)
   */
  const HINT_KEY = 'effort_hint_seen_v1';
  const rated = () => {
    if (state.current && state.current.session.exercises.some(e => e.sets.some(x => x.effort))) {
      try { localStorage.setItem(HINT_KEY, '1'); } catch (_) { /* приватный режим */ }
      return true;
    }
    try { return localStorage.getItem(HINT_KEY) === '1'; } catch (_) { return false; }
  };

  /**
   * Выбор оценки подхода (круга): три кнопки, каждая отмечает и запускает
   * отдых — короче после «Легко», дольше после «Тяжело» (effort.js)
   */
  const effortChooser = (onPick, current = true, warmup = false) => (
    <EffortChooser onPick={onPick} current={current} warmup={warmup} hint={current && !warmup && !rated()} />
  );

  /**
   * «Как прошло?» у уже отмеченного подхода: поменять оценку, если нажали
   * не ту. Текущая — залита, остальные — контуром. Отдых не перезапускается
   */
  const effortFix = (current, onPick) => <EffortFix current={current} onPick={onPick} />;

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
      {((track.kind === 'bodyweight' && track.weightMode !== 'assistance') || track.kind === 'timed') && (
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
      return <button type="button" className="workout__member-done" onClick={() => updateExercise(ei, x => unrateAt(x, r))}>
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
      let rated = null;
      lastMarked.current = ex.id;
      updateExercise(ei, x => { rated = rateSet(pinIntervals(x, r), r, effort); return rated.ex; });
      if (!last) return;
      if (allDone()) { afterLast(); return; }
      // Круг закончен — отдых по всем оценкам круга; короче — если всем
      // прибавлять было некуда (capped)
      const others = live.filter(m => m.ex.id !== ex.id).map(m => m.ex.sets[r]);
      const efforts = [...others.map(x => x.effort || 'ok'), effort];
      const raised = !!(rated && rated.capped) && others.every(x => x.capped);
      // Отдых круга — самый долгий из своих отдыхов упражнений круга
      startRest(roundRest(efforts, Math.max(...live.map(m => m.ex.rest || 0)) || restBase(), raised));
    };
    // Оценки — только под ближайшим в круге: два ряда по три кнопки
    // читались как шесть равных (QA 20.10.2026). У следующих — подпись,
    // их ряд появится, когда очередь дойдёт
    if (!(waiting[0] && waiting[0].ex.id === ex.id)) {
      return <p className="workout__effort-next">Следом, без отдыха — после «{waiting[0].ex.name}»</p>;
    }
    return <>
      {effortChooser(pick, true)}
      {/* Подпись — по порядку круга: последнее упражнение запускает отдых */}
      <p className="workout__effort-next">{last || !after ? 'Последнее в круге — запустит отдых' : 'Без отдыха → ' + after.ex.name}</p>
    </>;
  };

  /**
   * Круг суперсета сделан — строка «Круг N выполнен». Статус, а не кнопка
   * (аудит 24.10.2026): большая зелёная кнопка снимала отметки всего круга
   * одним случайным касанием, без «Вернуть». Снять — в «Настройках круга».
   * Отмечают круг оценками у каждого упражнения (memberEffort); чего не
   * хватает — пишем под кругом с названием упражнения: подсказка вверху
   * экрана не видна за клавиатурой.
   */
  const roundCheck = (members, r) => {
    const group = members[0].ex.supersetGroup;
    const inRound = members.filter(({ ex }) => ex.sets[r] && ex.sets[r].state !== 'skipped');
    if (!inRound.length) return null;
    const done = inRound.every(({ ex }) => ex.sets[r].state === 'done');
    const key = group + ':' + r;
    return <>
      {done && <p className="workout__round-check workout__round-check--done" role="status">
        <IconCheck size={18} aria-hidden="true" />{`Круг ${r + 1} выполнен`}
      </p>}
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
    // Снять отметки круга — отсюда и с «Вернуть» (аудит 24.10.2026): раньше
    // это делало касание по зелёной строке «Круг N выполнен»
    const live = inRound.filter(({ ex }) => ex.sets[r].state !== 'skipped');
    const done = live.length > 0 && live.every(({ ex }) => ex.sets[r].state === 'done');
    const unmark = () => {
      setUndo(s.exercises, 'Отметка круга снята');
      all(e => (e.sets[r].state === 'done' ? unrateAt(e, r) : e));
    };
    return <details className="workout__set-options workout__round-options">
      <summary>{skipped ? 'Круг пропущен · изменить' : 'Настройки круга'}<IconChevron size={14} aria-hidden="true" /></summary>
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
        {editable && done
          ? <button className="button" onClick={unmark}>Снять отметку круга</button>
          : <button className="button" onClick={() => setAll({ state: skipped ? 'pending' : 'skipped' })}>{skipped ? 'Вернуть круг' : 'Пропустить круг'}</button>}
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
        ? { ...e, sets: [...e.sets, cloneSet(e.sets[e.sets.length - 1])] }
        : e)),
    }));
    const currentHere = members.some(({ ex }) => ex.id === focus.ex);
    return <section className={'workout__exercise workout__rounds' + (currentHere ? ' workout__exercise--current' : '')} key={'g' + group} data-unit={'g' + group} data-flip-enter="" data-flip-scope={'sec:g' + group}>
      <div className="workout__rounds-head" onPointerDown={holdToMove('g' + group)}>
        <h3 data-flip={'name:' + members[0].ex.id}>Суперсет · {rounds} {rounds % 10 === 1 && rounds % 100 !== 11 ? 'круг' : [2, 3, 4].includes(rounds % 10) && ![12, 13, 14].includes(rounds % 100) ? 'круга' : 'кругов'}</h3>
        {!asClient && <button className="button button--ghost" onClick={split}>Разъединить</button>}
      </div>
      <p className="small muted">Упражнения подряд, без отдыха; отдых — после круга.{editable && !asClient ? ' Порядок внутри — подержите название и перетащите.' : ''}</p>
      {members.some(({ ex }) => planText(ex.prescription)) && (
        <p className="small muted">{members.map(({ ex }) => ex.name + (planText(ex.prescription) ? ': ' + planText(ex.prescription) : '')).join('; ')}</p>
      )}
      {members.map(({ ex }) => <LastRunHint key={'last' + ex.id} last={ex.lastRun} name={ex.name} tired={ex.tired} sets={ex.sets} />)}
      {/* Таймера интервалов нет (владелец, 09.10.2026): их запускают на самом тренажёре */}
      {members.map(({ ex }) => ex.exerciseId && setups[ex.exerciseId]
        ? <WorkoutGuidance key={'about' + ex.id} info={setups[ex.exerciseId]} trainer={!asClient} title={ex.name} />
        : setupWait(ex) ? <div key={'about' + ex.id} className="workout__extras-wait workout__extras-wait--one" aria-hidden="true"><span className="skeleton" /></div> : null)}
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
                  {!asClient && <button type="button" className="workout__round-units" aria-expanded={tuning === ex.id + ':' + r} aria-label={ex.name + ': настройки'} onClick={() => startTune(ex.id + ':' + r)}> · {isFunctional(ex) ? 'интервалы' : rowFields(trackOf(ex)).map(f => f.unit).join(' · ')}</button>}
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
    flushSync(() => { setRenaming(''); setTuning(''); setHistoryPick(null); });
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
      {/* Тренажёры и оборудование (10.10.2026): тренер прикрепляет прямо в
          занятии — выбор под упражнением появится сразу */}
      {clientRow && ex.name && <ExerciseMachines exerciseId={ex.exerciseId} name={ex.name} onChanged={(saved) => { if (saved && !ex.exerciseId) updateExercise(ei, x => ({ ...x, exerciseId: saved.id })); setSetupsTick(t => t + 1); }} />}
      {/* Перенос истории из журнала клиента (владелец, 16.10.2026): в идущем
          занятии тоже, когда часть подходов уже сделана, а упражнение
          оказалось «тем же, но под старым названием»: сделанное остаётся
          как есть, веса и настройка — у неотмеченных подходов */}
      {!asClient && clientRow && editable && ex.exerciseId && (
        <HistoryPick clientRow={clientRow} to={{ id: Number(ex.exerciseId), name: ex.name }}
          onOpen={() => setHistoryPick(ex.id)} onClose={() => setHistoryPick(null)} onMoved={() => reloadHistory(ei)}
          after="Веса и настройка — уже в этом занятии." />
      )}
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
    if (swallowClick.current || !editable || asClient) return;
    setRenaming('');
    setTuning(tuning === id ? '' : id);
  };
  const tuneEditor = (ex, ei, id, inRound = false) => {
    const track = trackOf(ex);
    const note = inRound && <label className="workout__field">Заметка<textarea value={ex.note} maxLength={500} rows={2} onChange={e => updateExercise(ei, x => ({ ...x, note: e.target.value }))} /></label>;
    // Отдых после подхода этого упражнения (20.10.2026) — только в этом
    // занятии; «Общий» — отдых занятия из шапки. У круга — самый долгий из своих
    const rest = <RestChips value={ex.rest || 0} fallback={(state.current && state.current.session.restSeconds) || 90}
      onChange={(seconds) => updateExercise(ei, ({ rest: _r, ...x }) => (seconds ? { ...x, rest: seconds } : x))} hint={!inRound} />;
    const done = <div className="workout__panel-actions"><button type="button" className="button button--primary" onClick={() => closePanel(id)}>Готово</button></div>;
    if (track.kind === 'cardio') {
      const c = cardioOf(ex);
      return <div className="workout__panel" key={'tune-' + id}>
        <CardioPlan kind={false} value={c} track={trackOf({ ...ex, cardio: c })} onChange={next => editCardio(ei, next, inRound ? Number(String(id).split(':').pop()) : -1)} />
        {rest}
        {note}
        {done}
      </div>;
    }
    const open = ex.sets.filter(x => x.state === 'pending');
    const sample = open[0] || ex.sets[ex.sets.length - 1] || {};
    // Сразу всем неотмеченным: сделанное — это уже результат
    // Вес (у веса помощи — помощь) руками — свой (own): оценки его не двигают
    const editAll = (key, value) => updateExercise(ei, x => {
      const valueKey = isAssisted(x) ? 'assist' : 'weight';
      // Повторы всем — вес каждого пересчитать, как при правке одного
      // подхода (editSetField, 23.10.2026): раньше менялись только повторы
      if (key === 'reps') return x.sets.reduce((y, set, k) => (set.state === 'pending' ? editSetField(y, k, 'reps', value) : y), x);
      return { ...x, sets: x.sets.map(set => {
        if (set.state !== 'pending') return set;
        if (key !== valueKey) return { ...set, [key]: value };
        const { suggest, ...rest } = set;
        return { ...rest, [valueKey]: value, own: true };
      }) };
    });
    const last = ex.sets[ex.sets.length - 1];
    const addSet = () => updateExercise(ei, withSet);
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
      {rest}
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
    if (!editable || asClient || reorder || drag.current || (e.button !== undefined && e.button !== 0)) return;
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
    dragOff.current = () => finish({ pointerId, type: 'pointercancel' });
    dragOff.current = () => finish({ pointerId, type: 'pointercancel' });
    dragOff.current = () => finish({ pointerId, type: 'pointercancel' });
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
      dragOff.current = null;
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
  /**
   * Новое упражнение в ходе занятия (владелец, 16.10.2026): у клиента в
   * тренировке по программе (с месяцем) его нет — программу ведёт тренер,
   * менять состав можно только заменой. В свободной тренировке (месяца нет)
   * и у тренера — есть
   */
  const canAddExercise = (session) => !asClient || !(session && session.month);
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
      exercises.splice(at, 0, newExercise(v));
      return { ...v, exercises };
    }); };
    const join = () => {
      const group = a.supersetGroup || b.supersetGroup || 'superset-' + uid();
      const merged = [a.supersetGroup, b.supersetGroup].filter(Boolean);
      flip('name:' + ((a.supersetGroup ? list.find(e => e.supersetGroup === a.supersetGroup) : a).id));
      change(v => ({ ...v, exercises: v.exercises.map(e => (e.id === a.id || e.id === b.id || merged.includes(e.supersetGroup) ? { ...e, supersetGroup: group } : e)) }));
    };
    const canAdd = canAddExercise(record?.session);
    if (!canAdd && !canJoin) return null;
    return (
      <div className="workout__between">
        {canAdd && <button type="button" className="workout__join" disabled={list.length >= 30} onClick={add}><IconPlus aria-hidden="true" />Упражнение</button>}
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
        out.push(...chosen.map(e => ({ ...e, id: uid(), supersetGroup: group, note: '', sets: e.sets.map(cloneSet) })));
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
  const [setupsTick, setSetupsTick] = useState(0); // тренажёр прикреплён в занятии — перечитать
  // Личные настройки тренажёров этого клиента («спинка 3») — у каждого свои
  const [notes, setNotes] = useState({});
  // У сплит-пары (FT-488) — у каждого своя: { кто: { цель: настройка } }.
  // Участнику в его кабинете сервер отдаёт только его
  const [notesBy, setNotesBy] = useState({});
  // Для какого набора id настройки уже пришли (или не пришли совсем): пока
  // нет — у упражнений из базы держим место скелетоном, а не вставляем
  // «Тренажёр и технику» и «Свою настройку» под пальцем (аудит 24.10.2026)
  const [setupsFor, setSetupsFor] = useState('');
  // До первой отрисовки (layout): сохранённые настройки встают вместе с
  // занятием, а не кадром позже на месте скелетона
  useLayoutEffect(() => {
    if (!setupIds) return undefined;
    let alive = true;
    // Без связи — сохранённые (offline-prefetch.js запасает их по программе)
    // Поверх — настройки, записанные без связи и ещё не отправленные
    // (FT-566, этап 2): на экране они такие же, как принятые сервером
    const apply = ([r, pending]) => {
      if (!alive) return;
      setSetupsFor(setupIds);
      if (!r || !r.setups) return;
      const own = { ...(r.notes || {}) };
      const by = { ...(r.notesBy || {}) };
      pending.forEach(({ params: p }) => {
        const text = String(p.text || '').trim();
        const note = text ? { text, by: asClient ? 'client' : 'trainer', local: true } : null;
        if (p.member) {
          const next = { ...(by[p.member] || {}) };
          if (note) next[p.target] = note; else delete next[p.target];
          by[p.member] = next;
        } else if (note) own[p.target] = note;
        else delete own[p.target];
      });
      setSetups(r.setups); setNotes(own); setNotesBy(by);
    };
    // Сохранённые на телефоне (offline-prefetch.js или прошлое открытие) —
    // сразу: занятие встаёт целиком, свежие приходят поверх на то же место
    // (аудит 24.10.2026). Свежие — запросом мимо памяти страницы: без связи
    // api.js отдаёт сохранённое
    const { data: cached, promise } = apiStale('exercise.setup', { ...params, ids: setupIds });
    if (cached && cached.setups) apply([cached, []]);
    Promise.all([promise, localWrites(clientRow, 'note').catch(() => [])])
      .then(apply)
      .catch(() => { if (alive) setSetupsFor(setupIds); });
    return () => { alive = false; };
  }, [setupIds, setupsTick]);
  /** Упражнение из базы, а его настройки ещё в пути — держим им место */
  const setupWait = (ex) => !!ex.exerciseId && !setups[ex.exerciseId] && setupsFor !== setupIds;

  // Куда смотреть: первое упражнение с неотмеченным подходом и этот
  // подход. Оно обведено, подход подсвечен, его «готово» — залито; всё
  // остальное тише. Иначе в зале глаза разбегаются по одинаковым строкам.
  const focus = focusOf(s, lastMarked.current);
  const stats = s ? summary(s) : null;
  const editable = s && ['active', 'paused'].includes(s.status);
  const elapsed = s ? s.elapsedMs + (s.status === 'active' ? Math.max(0, now - record.tick) : 0) : 0;

  // Просьба об оценке (план трёх разборов, пункт 6): системное окно — когда
  // экран итога уже показан, никогда посреди тренировки. Только занятие,
  // завершённое на этом экране; открытое из истории не считается. Ушли с
  // экрана раньше — не просим
  const finishedId = s && s.status === 'completed' ? s.id : '';
  useEffect(() => {
    if (!finishedId || finishedHere.current !== finishedId) return undefined;
    finishedHere.current = '';
    const t = setTimeout(() => { maybeAskReview('workout').catch(() => {}); }, 1500);
    return () => clearTimeout(t);
  }, [finishedId]);

  // Тренажёр закрепляет тренер (16.10.2026): в занятии он один — первый из
  // привязанных, клиент не выбирает. Черновик, начатый до привязки, или
  // тренажёр, прикреплённый тренером прямо в занятии, — подставляем сами,
  // с весом с прошлого раза на нём (chooseMachine)
  const autoMachine = useRef(new Set());
  // Какое упражнение сейчас меняют на замену — список раскрыт у него
  const [swapping, setSwapping] = useState(null);
  // У какого упражнения тренер открыл «делал под другим названием?» — пока
  // открыто, блок не прячется, даже когда веса уже подтянулись («Отменить»)
  const [historyPick, setHistoryPick] = useState(null);
  // Раскрытый список замен — на экран (FT-595). Ошибки сохранения — нет
  // (data-reveal="off"): они бывают и фоновые, и рывок к шапке посреди
  // подходов мешал бы
  const altsRef = useReveal(swapping);
  // Историю перенесли (HistoryMove) — веса неотмеченных подходов и
  // настройка — заново, уже по этому упражнению
  const reloadHistory = async (ei) => {
    const current = state.current && state.current.session.exercises[ei];
    if (!current) return;
    try {
      const plan = replacementPlan(current);
      const history = await apiPublic('workout.exercise.history', {
        ...params, name: current.name, exerciseId: current.exerciseId || null, sets: plan.sets, reps: plan.reps,
        ...(current.machine ? { machineUid: current.machine.uid } : {}),
      });
      updateExercise(ei, (ex) => (ex.id !== current.id ? ex : withMachine(ex, history.machine || ex.machine || null, history)));
    } catch (error) {
      setMessage('Историю не удалось загрузить: ' + error.message);
    }
    setSetupsTick((t) => t + 1);
  };
  useEffect(() => {
    if (!editable) return;
    s.exercises.forEach((ex, ei) => {
      const machines = (setups[ex.exerciseId] && setups[ex.exerciseId].machines) || [];
      if (!machines.length || ex.sets.some((x) => x.who)) return;
      if (ex.machine && machines.some((m) => m.uid === ex.machine.uid)) return;
      const primary = primaryEquipment(setups[ex.exerciseId]);
      if (!primary) return;
      const mark = ex.id + '|' + primary.uid;
      if (autoMachine.current.has(mark)) return;
      autoMachine.current.add(mark);
      chooseMachine(ei, primary);
    });
    // Зависимость — состав и тренажёры, а не массив упражнений: тот новый на
    // каждое нажатие клавиши (20.10.2026, аудит)
  }, [setups, editable, s ? s.exercises.map((e) => e.id + '|' + (e.exerciseId || '') + '|' + ((e.machine && e.machine.uid) || '')).join() : '']);

  /**
   * Сколько от шапки до края экрана — --wk-above (24.10.2026): стекло шапки
   * продолжается вверх ровно на столько (workout.css). Слой «с запасом» за
   * край экрана Chrome не размывает
   */
  const hasSession = !!s;
  useEffect(() => {
    if (!hasSession || typeof window === 'undefined' || typeof window.addEventListener !== 'function'
      || typeof document === 'undefined' || !document.querySelector) return undefined;
    const head = document.querySelector('.workout__header');
    if (!head || !head.getBoundingClientRect || !head.style) return undefined;
    let last = -1;
    const check = () => {
      const above = Math.max(0, Math.round(head.getBoundingClientRect().top));
      if (above !== last) { last = above; head.style.setProperty('--wk-above', above + 'px'); }
    };
    check();
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => { window.removeEventListener('scroll', check); window.removeEventListener('resize', check); };
  }, [hasSession]);

  /**
   * Под названием упражнения из базы (07.10.2026): на каком тренажёре
   * (FT-478) — вес у каждого свой, — как его настроить, и чем заменить, если
   * он занят (FT-479). Замена — пока подходы не отмечены: отмеченное при
   * замене не переносится, а терять его нельзя
   */
  /**
   * Сплит-пара (FT-488): тренажёр у пары тот же, что закрепил тренер, а
   * настройка и вес у каждого свои. Строкой на человека — в зале они рядом,
   * и видно, кому что ставить
   */
  const splitView = (ex, ei, info) => {
    const machines = info.machines || [];
    const whos = [...new Set(ex.sets.map((x) => x.who).filter(Boolean))]
      // Участник в своём кабинете — только своя строка настройки
      .filter((w) => clientRow || w in notesBy || !Object.keys(notesBy).length);
    const targets = noteTargetsOf(info);
    return <>

      {whos.map((w) => {
        const own = notesBy[w] || {};
        const canNote = clientRow || w in notesBy;
        return (
          <div className="workout__member" key={w}>
            <span className="workout__member-name">{w}</span>
            {canNote && targets.map(({ target, label }) => (
              <MachineNote key={w + target} target={target} label={label} note={own[target]} trainer={!asClient} params={{ ...params, member: w }}
                onSaved={(n) => setNotesBy((v) => {
                  const next = { ...(v[w] || {}) };
                  if (n) next[target] = n; else delete next[target];
                  if (own[target] && own[target].from) delete next[own[target].from];
                  return { ...v, [w]: next };
                })} />
            ))}
          </div>
        );
      })}

    </>;
  };

  /** Куда писать настройку: каждый тренажёр упражнения, а без них — само упражнение */
  const noteTargetsOf = (info) => {
    const machines = info.machines || [];
    if (machines.length) return machines.map((m) => ({ target: 'm:' + m.uid, label: machines.length > 1 ? m.name : '' }));
    return info.noteKey ? [{ target: info.noteKey, label: '' }] : [];
  };

  /**
   * В занятии подробности конкретного тренажёра раскрываются отдельно, а
   * настройка и техника упражнения остаются на виду. Это два независимых
   * источника: один тренажёр используют в разных упражнениях, поэтому его
   * регулировки не должны повторять инструкцию упражнения (FT-570).
   */
  const extrasView = (ex, ei, info) => {
    const machines = info.machines || [];
    const split = ex.sets.some((x) => x.who);
    // Основное не отмечено, а занятие уже знает тренажёр (закрепил тренер или
    // взят по истории, exercise-history.js) — настройка этого тренажёра
    const pinned = ex.machine && ex.machine.uid && machines.some((m) => m.uid === ex.machine.uid);
    const guide = !info.primaryEquipmentUid && pinned ? { ...info, primaryEquipmentUid: ex.machine.uid } : info;
    const primary = primaryEquipment(guide);
    const alts = (info.alternatives || []).filter((a) => a.id !== Number(ex.exerciseId));
    const started = ex.sets.some((x) => x.state === 'done');
    return <>
      {/* Тренажёр закрепил тренер (16.10.2026) — клиент его не выбирает */}
      {machines.length > 0 && !split && (
        <div className="workout__machines">
          {/* Подсказка стоит до первой отметки, а не до первой цифры (аудит
              24.10.2026): пропадая на вводе веса, она утаскивала строки
              подходов из-под пальца. Вес, пришедший с программой, — не
              «впишите», поэтому без вписанного здесь (own) смотрим на поля */}
          {primary && editable && !ex.prevWeight && !ex.lastRun && trackOf(ex).kind === 'strength'
            && !ex.sets.some((x) => x.state === 'done')
            && (ex.sets.some((x) => x.own) || ex.sets.every((x) => x.state !== 'pending' || !String(x.weight || '').trim())) && (
            <p className="small muted">{otherMachineText(ex.otherRun) || 'Здесь ещё не делали — впишите вес, дальше он запомнится.'}</p>
          )}
        </div>
      )}
      <WorkoutGuidance info={guide} trainer={!asClient} />
      {/* Своя настройка — у каждого клиента своя, на виду, а не в
          раскрывашке: ради неё в зале и смотрят. У каждого тренажёра своя */}
      {!split && noteTargetsOf(info).map(({ target, label }) => (
        <MachineNote key={target} target={target} label={label} note={notes[target]} trainer={!asClient} params={params}
          onSaved={(n) => setNotes((v) => {
            const next = { ...v };
            if (n) next[target] = n; else delete next[target];
            if (v[target] && v[target].from) delete next[v[target].from];
            return next;
          })} />
      ))}
      {split && splitView(ex, ei, info)}
      {/* Замена (владелец, 16.10.2026: понятнее и удобнее): клиент меняет
          упражнение, а не тренажёр — одной кнопкой, со списком и пояснением.
          Связь в обе стороны (сервер), поэтому вернуться — тем же списком */}
      {/* Только тренеру (владелец, 16.10.2026): то же упражнение под старым
          названием — перенести веса и настройку из журнала клиента */}
      {!asClient && clientRow && editable && ex.exerciseId && !started && renaming !== ex.id
        && ((!ex.prevWeight && !ex.lastRun) || historyPick === ex.id) && (
        <HistoryPick clientRow={clientRow} to={{ id: Number(ex.exerciseId), name: ex.name }}
          onOpen={() => setHistoryPick(ex.id)} onClose={() => setHistoryPick(null)} onMoved={() => reloadHistory(ei)}
          after="Веса и настройка — уже в этом занятии." />
      )}
      {alts.length > 0 && editable && (started
        ? <p className="small muted workout__alts-later">Заменить упражнение можно до первого подхода.</p>
        : <div className="workout__alts">
          <button type="button" className="workout__alts-toggle" aria-expanded={swapping === ex.id}
            onClick={() => { haptic(); setSwapping(swapping === ex.id ? null : ex.id); }}>
            {swapping === ex.id ? 'Не заменять' : 'Заменить упражнение'}
          </button>
          {swapping === ex.id && <div className="workout__alts-list" ref={altsRef}>
            <p className="small muted">Тренажёр занят или упражнение не подходит — выберите, чем заменить. Вес подтянется с прошлого раза.</p>
            {alts.map((a) => (
              <button type="button" key={a.id} className="workout__alts-item"
                onClick={() => { haptic(); setSwapping(null); replaceExercise(ei, { name: a.name, exerciseId: a.id }); }}>{a.name}</button>
            ))}
          </div>}
        </div>)}
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
  if (restOn && !restOver && onScreen) restSeen.current = s.restUntil;
  const restShown = restOn && (startedHere || (onScreen && (!restOver || restSeen.current === s.restUntil)));
  const restFolded = restShown && !restOver && collapsedUntil === s.restUntil;
  lockScroll.current = restShown && !restFolded;
  const stopRest = () => change(v => ({ ...v, restUntil: 0 }));
  const restLayer = restShown && (dom ? (node) => createPortal(node, document.body) : (node) => node)(restFolded
    ? <RestPill left={s.restUntil - now} onOpen={() => setCollapsedUntil(0)} />
    : <RestScreen
      allowGame={asClient && plankEnabled}
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
  // Ошибки и конфликт версий — закреплённой плашкой у низа экрана, поверх
  // занятия, как «Удалено · Вернуть» (аудит 24.10.2026). В потоке над шапкой
  // они сдвигали всё занятие вниз, пропадали на следующем касании и отнимали
  // у шапки :first-child — стекло до края и спрятанную шапку приложения
  // (workout.css). Теперь шапка занятия на странице всегда первая.
  // «Повторить» — только у ошибок связи и сохранения
  const retry = () => { setMessage(''); if (record?.dirty) save(); else list().catch(e => setMessage(e.message)); };
  const alerts = (storageError || message || conflict) && (dom ? (node) => createPortal(node, document.body) : (node) => node)(
    // Всегда на виду — подводить к ним экран незачем (data-reveal="off"), а
    // их высоту reveal.js учитывает, как у панелей внизу (data-reveal-bottom)
    <div className={'workout__alerts' + (restFolded || undo || picking ? ' workout__alerts--lift' : '')} data-reveal="off" data-reveal-bottom="">
      {conflict && <div role="alert" className="workout__alert workout__alert--conflict">
        <h3>{conflict.activeConflict ? 'Уже есть текущее занятие' : 'Занятие изменено на другом устройстве'}</h3>
        <p>Ваш черновик сохранён отдельно. Скачайте его, затем откройте актуальную версию и перенесите нужные изменения.</p>
        <div className="workout__alert-actions">
          <button className="button" onClick={exportDraft}>Скачать мой черновик</button>
          <button className="button" onClick={useRemote}>Открыть актуальное занятие</button>
        </div>
      </div>}
      {storageError && <div role="alert" className="workout__alert"><p>Устройство не сохранило черновик. Не закрывайте экран до сохранения в облаке.</p></div>}
      {message && <div role="alert" className="workout__alert">
        <p>{message.text}</p>
        {message.retry && <button type="button" className="button" disabled={busy} onClick={retry}>Повторить</button>}
        <button type="button" className="icon-button workout__alert-close" aria-label="Скрыть сообщение" onClick={() => setMessageState(null)}><IconClose size={18} /></button>
      </div>}
    </div>);
  return <div className={'workout' + (s || launch ? ' workout--session' : '')}>
    {/* В списке журнала — кнопка, куда вернёт: к программе или к списку клиентов */}
    {!s && <BackButton label={backLabel} onClick={close} />}
    {/* Занятие уже на экране (снимок из черновика) — строки загрузки нет
        вовсе: она исчезала и двигала упражнения (аудит 24.10.2026) */}
    {!ready && !s && <p role="status">Открываем журнал тренировок…</p>}
    {s && <>
      <header className="workout__header">
        {/* Видимый выход из занятия (FT-567; 09.10 был только жест): занятие
            не завершается и не отменяется — сохраняется и идёт дальше, в
            программе его ждёт «Вернуться к занятию». То же, что смахнуть вправо */}
        {/* Шапка в три строки (QA 20.10.2026; было пять и 230 px — треть
            экрана в зале): «назад» и «Завершить» (в шапке, у времени, а не
            внизу под упражнениями — владелец, 03.10.2026); название;
            время · подходы · отдых · пауза · ⋯. Редкое — «Выбрать» и
            «Отменить занятие» — в меню ⋯ */}
        <div className="workout__head-row">
          <BackButton label={backLabel === 'К программе' ? 'Программа' : backLabel} onClick={close} />
          {editable && !confirm && <button type="button" className="button button--primary workout__finish-btn" onClick={() => setConfirm('complete')}>Завершить</button>}
          {!editable && <button type="button" className="button button--primary workout__finish-btn" disabled={busy || !!conflict} onClick={resume}>Продолжить</button>}
        </div>
        {/* Название — касанием: переименовывает только тренер (07.10.2026), сервер это же проверяет */}
        {renamingTitle && clientRow && !clientView
          ? <input className="workout__title-input" aria-label="Название занятия" autoFocus value={s.title} maxLength={160} onChange={e => change(v => ({ ...v, title: e.target.value }))} onBlur={() => setRenamingTitle(false)} onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setRenamingTitle(false); }} />
          : <div className="workout__title-row"><h2>{editable && clientRow && !clientView ? <button type="button" className="workout__title-tap" onClick={() => setRenamingTitle(true)}>{s.title}</button> : s.title}</h2>{/* Месяц и «Идёт» убраны (владелец, 24.10.2026): идёт занятие и так
              видно, пауза — по кнопке «Продолжить». Остаётся только итог
              закрытого занятия */}{(s.status === 'completed' || s.status === 'cancelled') && <p className="workout__title-meta">{labels[s.status]}</p>}</div>}
        {editable && confirm && <div className="workout__confirm" role="alertdialog" aria-label={confirm === 'complete' ? 'Завершить тренировку' : 'Отменить занятие'}>
          <p>{confirmText}</p>
          <div className="workout__confirm-actions">
            {/* Отмена меняет черновик сразу; save отправит её после текущего запроса. */}
            <button type="button" className={'button ' + (confirm === 'complete' ? 'button--primary' : 'button--critical')} disabled={!!conflict || (confirm === 'complete' && (busy || !stats.done))} onClick={() => finishAs(confirm)}>{confirm === 'complete' ? 'Завершить' : 'Отменить'}</button>
            <button type="button" className="button button--ghost" onClick={() => setConfirm('')}>{confirm === 'complete' && !stats.pending ? 'Ещё не всё' : 'Продолжить'}</button>
          </div>
        </div>}
        {/* Пауза и отдых — в шапке, что едет за прокруткой (владелец, 09.10.2026).
            Длительность не только запускает отдых, но и запоминается: дальше
            он стартует сам после каждого отмеченного подхода */}
        <div className="workout__line">
          <span className="workout__metrics" aria-label={`Время ${clock(elapsed)}, подходы ${stats.done} из ${stats.total}`}><strong>{clock(elapsed)}</strong><span aria-hidden="true"> · </span><b>{stats.done} / {stats.total}</b></span>
          {editable && !confirm && <>
            {/* Слово «Отдых» на узком экране уходит (workout.css), у списка
                остаётся подпись для чтения вслух (аудит 24.10.2026) */}
            <label className="workout__rest-pick"><span className="workout__rest-word">Отдых</span><select aria-label="Таймер отдыха" value={String(s.restSeconds || 90)} onChange={e => changeRestLength(Number(e.target.value))}><option value="60">1 мин</option><option value="90">1:30</option><option value="120">2 мин</option><option value="180">3 мин</option></select></label>
            {/* Ширина постоянная — под «Продолжить» (workout.css): «Пауза ↔
                Продолжить» больше не двигает соседей (аудит 24.10.2026).
                aria-label — чтобы скрытое «Продолжить» не читалось вслух */}
            <button type="button" className="button button--ghost workout__pause" aria-label={s.status === 'active' ? 'Пауза' : 'Продолжить'} onClick={() => change(s => ({ ...s, status: s.status === 'active' ? 'paused' : 'active', restUntil: 0 }))}><span>{s.status === 'active' ? 'Пауза' : 'Продолжить'}</span></button>
            {picking
              ? <button type="button" className="button workout__pick-toggle is-on" aria-pressed onClick={endPick}>Готово</button>
              : <div className="workout__more">
                <button type="button" className="icon-button workout__more-btn" aria-label="Ещё" aria-haspopup="menu" aria-expanded={moreOpen} onClick={() => { setMoreOpen(o => !o); haptic(); }}><IconMore size={22} /></button>
                {moreOpen && <>
                  <div className="workout__more-scrim" onClick={() => setMoreOpen(false)} aria-hidden="true" />
                  <div className="workout__menu" role="menu" aria-label="Ещё">
                    {!asClient && <button type="button" role="menuitem" className="workout__menu-item" onClick={() => { setMoreOpen(false); pickFromButton(); }}>Выбрать упражнения</button>}
                    <button type="button" role="menuitem" className="workout__menu-item workout__menu-item--critical" onClick={() => { setMoreOpen(false); setConfirm('cancel'); }}>Отменить занятие</button>
                  </div>
                </>}
              </div>}
          </>}
        </div>
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
      {/* «Открываем журнал…» под шапкой убрано (аудит 24.10.2026): занятие
          уже на экране из черновика, а строка исчезала через секунды и
          поднимала все упражнения. Журнал догружается молча */}
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
          <SwipeRow className="workout__ex-swipe" removeClosest=".workout__exercise" removeWith={(card) => leavingBars([card])} disabled={compact || s.exercises.length === 1 || !editable || asClient} label={`Удалить упражнение «${ex.name}»`}
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
          {ex.exerciseId && setups[ex.exerciseId] ? extrasView(ex, ei, setups[ex.exerciseId]) : setupWait(ex) && <div className="workout__extras-wait" aria-hidden="true"><span className="skeleton" /><span className="skeleton" /></div>}
          {/* «4 × 12» крупно убрано (владелец, 09.10.2026): подходы и повторы
              и так видны в строках. Единицы — касанием: подходы, вес, время,
              у кардио — цели и интервалы, как в круге суперсета */}
          {!ex.sets.some(x => x.who) && !asClient && <button type="button" className="workout__units-tap" aria-expanded={tuning === ex.id} aria-label={ex.name + ': настройки'} onClick={() => startTune(ex.id)}>
            {isFunctional(ex) ? 'Интервалы' : trackOf(ex).kind === 'cardio' ? 'Цели и настройки' : 'Подходы, вес и отдых'}<IconSliders size={12} aria-hidden="true" />
          </button>}
          {tuning === ex.id && tuneEditor(ex, ei, ex.id)}
          {/* Последнее выполнение клиентом — с повторами и оценкой */}
          {/* Цель диапазона — к ней клиент стремится (19.10.2026) */}
          {repsGoalText(ex) && <p className="workout__goal">{repsGoalText(ex)}</p>}
          <LastRunHint last={ex.lastRun} tired={ex.tired} sets={ex.sets} />
          {/* Разминка — сверху, над подходами (FT-532): встаёт перед рабочими */}
          {trackOf(ex).kind !== 'cardio' && !ex.sets.some(x => x.who) && (
            <button type="button" className="button button--ghost button--block workout__add workout__add--warmup" disabled={ex.sets.length >= 20} onClick={() => updateExercise(ei, withWarmup)}>
              Добавить разминочный подход
            </button>
          )}
          {trackOf(ex).kind !== 'cardio' && <div className={'workout__set-head' + (ex.sets.some(x => x.who) ? ' workout__set-head--who' : '')} style={{ '--cols': rowFields(trackOf(ex)).length }} aria-hidden="true"><span>{trackOf(ex).kind === 'cardio' ? 'Отрезок' : 'Подход'}</span>{rowFields(trackOf(ex)).map(f => <span key={f.key}>{f.head}</span>)}</div>}
          {ex.sets.map((set, si) => setRow(ex, ei, si, setLabel(ex.sets, si)))}
          {trackOf(ex).kind === 'cardio' && !isFunctional(ex) && metricAdd(ex, ei)}
          {/* У пары подход добавляется кругом — по одному каждому, кто
              делает упражнение, с его последним весом */}
          {(() => {
            const who = [...new Set(ex.sets.map(x => x.who).filter(Boolean))];
            const round = who.length
              ? who.map(w => cloneSet([...ex.sets].reverse().find(x => x.who === w)))
              : [cloneSet(ex.sets[ex.sets.length - 1])];
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
        {canAddExercise(s) && <button className="button button--block" disabled={s.exercises.length >= 30} onClick={() => change(s => ({ ...s, exercises: [...s.exercises, newExercise(s)] }))}>Добавить упражнение</button>}
        <label className="workout__field">Как прошла тренировка<textarea value={s.note} maxLength={1000} rows={3} onChange={e => change(s => ({ ...s, note: e.target.value }))} /></label>
      </fieldset>
      {/* Главная кнопка после завершения — уйти к программе: занятие закончено,
          «Продолжить» — на случай ошибки, а не следующий шаг (QA 20.10.2026) */}
      {!editable && <div className="workout__finish"><h3>{labels[s.status]}</h3><p>{setsWord(stats.done)} · {Math.round(stats.volume).toLocaleString('ru-RU')} кг рабочего объёма</p><p className="small muted">Оплаты и учёт занятий по календарю не изменены.</p><button className="button button--primary" disabled={busy} onClick={async () => { if ((record.dirty || record.pending) && !(await park(state.current))) return; store(null); list().catch(e => setMessage(e.message)); }}>{backLabel}</button><button className="button" disabled={busy || !!conflict} onClick={() => change(s => ({ ...s, status: 'paused' }))}>Исправить результат</button><button className="button" disabled={busy || !!conflict} onClick={resume}>Продолжить тренировку</button></div>}
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
    {/* Портал в body; без страницы (проверки) — в конце экрана, не над шапкой */}
    {alerts}
  </div>;
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
