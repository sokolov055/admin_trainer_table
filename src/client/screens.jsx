import { useReturnScroll } from '../scroll.js';
import React, { useState, useEffect, useRef } from 'react';
import { useData } from '../useData.js';
import RationSummary from '../nutrition/RationSummary.jsx';
import { apiBatch, apiMutate, apiPublic } from '../api.js';
import { LineChart } from '../charts.jsx';
import Steps from './Steps.jsx';
import HealthWorkouts from './HealthWorkouts.jsx';
import {
  Lead, Section, Panel, Rows, Row, Loading, ErrorState, Empty, Badge, StatusBadge,
  Chips, Segmented, Options, Field, Note, Delta,
  formatNumber, formatMoney, formatDate, formatTime, formatWhen, relativeDays, daysSince, plural,
} from '../ui.jsx';
import { IconRuler, IconPlan, IconProgress, IconNutrition, IconAlert, IconCheck, IconChevron, IconPlus, IconCopy, IconTrash } from '../icons.jsx';
import { haptic } from '../telegram.js';
import { useBackGesture, captureScreen } from '../gestures.jsx';
import { supersets, blockSessions, doneLine, roundLine } from '../plan-model.js';
import { planScheme } from '../exercise-track.js';
import { holdToReorder } from '../hold-reorder.js';
import { recentDeltas, savedPeriod, savePeriod } from './deltas.js';
import { Media, SetupText } from '../media.jsx';
import { lazyPage, Deferred } from '../lazy.js';
import SwipeRow from '../SwipeRow.jsx';
import { copyPlanBlocks, workoutRenameParams } from '../plan-block-actions.js';
import { uid } from '../workout-model.js';

// По требованию (lazy.js): тренировка и рацион — когда их открыли,
// редактор программы и шаблоны — только тренеру
export const WorkoutJournal = lazyPage(() => import('../Workout.jsx'));
export const Ration = lazyPage(() => import('../nutrition/Ration.jsx'));
export const PlanEditor = lazyPage(() => import('../trainer/PlanEditor.jsx'));
const TemplateApply = lazyPage(() => import('../trainer/Library.jsx'), 'TemplateApply');
const SaveAsTemplate = lazyPage(() => import('../trainer/Library.jsx'), 'SaveAsTemplate');
// Правка программы прямо на экране (03.10.2026) — только у тренера
const BlockEdit = lazyPage(() => import('../trainer/PlanInline.jsx'), 'BlockEdit');
const AddBlock = lazyPage(() => import('../trainer/PlanInline.jsx'), 'AddBlock');
const waiting = <Loading lead={false} rows={3} />;

/* ==================================================================
 * Обзор
 * ================================================================== */

/**
 * Пакет заканчивается.
 *
 * Плашка, а не строчка в фактах: факты читают глазами по диагонали, а это
 * то, ради чего экран и открыли. Числом, а не «скоро»: человек решает,
 * платить сегодня или после выходных, и «скоро» ему в этом не помогает.
 *
 * Молчим, пока занятий больше чем на неделю: предупреждение, висящее
 * всегда, перестаёт быть предупреждением.
 */
function PackageEnding({ state, payer, trainer }) {
  // Платит другой человек. Сколько у него лежит и на сколько тренировок
  // хватит, говорит главный блок наверху; здесь — только когда пора
  // пополнять. Постоянная жёлтая плашка при полном кошельке читалась как
  // тревога там, где всё в порядке.
  if (payer) {
    if (!state || !state.known || (!state.soon && !state.out)) return null;
    const left = payer.trainingsLeft;
    return (
      <Section>
        <Panel pad>
          <div className="warn">
            <span className={'warn__icon' + (state.out ? ' warn__icon--critical' : '')}>
              <IconAlert size={18} />
            </span>
            <div className="small">
              <strong>
                {state.out || !left
                  ? 'Оплаченные тренировки закончились.'
                  : 'Осталось ' + left + ' ' + plural(left, 'тренировка', 'тренировки', 'тренировок') + '.'}
              </strong>{' '}
              {trainer ? 'Напомните об оплате: платит ' + payer.name + '.' : 'Пора пополнить: платит ' + payer.name + '.'}
            </div>
          </div>
        </Panel>
      </Section>
    );
  }

  if (!state || !state.known || (!state.soon && !state.out)) return null;

  return (
    <Section>
      <Panel pad>
        <div className="warn">
          <span className={'warn__icon' + (state.out ? ' warn__icon--critical' : '')}>
            <IconAlert size={18} />
          </span>
          <div className="small">
            {state.out ? (
              <>
                <strong>Оплаченные занятия закончились.</strong>{' '}
                {trainer
                  ? 'Следующее пройдёт в долг — напомните клиенту об оплате.'
                  : 'Следующее пройдёт в долг — напишите тренеру об оплате.'}
              </>
            ) : (
              <>
                <strong>
                  {state.left === 1
                    ? 'Осталось одно оплаченное занятие.'
                    : 'Осталось ' + state.left + ' ' + plural(state.left, 'занятие', 'занятия', 'занятий') + '.'}
                </strong>{' '}
                {trainer
                  ? 'Это примерно на неделю — самое время напомнить о продлении.'
                  : 'Это примерно на неделю — продлите пакет, чтобы не прерываться.'}
              </>
            )}
          </div>
        </div>
      </Panel>
    </Section>
  );
}

export function Overview({ clientRow, clientView = false }) {
  const { loading, data, error, reload } = useData(
    'client.overview', clientRow ? { clientRow } : {}, [clientRow]
  );

  if (loading) return <Loading rows={2} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  // Тренера пока нет: ни оплат, ни занятий, ни программы. Пустые нули
  // «Баланс 0 ₽ · исчерпан» читались бы как долг, поэтому вместо них —
  // что можно делать уже сейчас и как появится остальное.
  if (data.unlinked) {
    return (
      <Section title="Тренера пока нет">
        <Panel pad>
          <p className="small">
            Уже сейчас можно считать норму и собирать рацион в «Питании», записывать
            замеры и смотреть шаги в «Прогрессе».
          </p>
          <p className="small muted">
            Когда тренер привяжет вас — по ID из меню «Мой тренер» или своей ссылкой, —
            здесь появятся занятия, программа и оплата.
          </p>
        </Panel>
      </Section>
    );
  }

  const sinceTraining = daysSince(data.lastTrainingDate);

  // Главный вопрос клиента — «сколько у меня оплачено вперёд». Отвечаем
  // тренировками, а не рублями: в тренировках человек и думает.
  //
  // Если платит другой человек, свой баланс у клиента нулевой, и крупное
  // «0 ₽ · Баланс исчерпан» было неправдой: тренировки оплачены, просто
  // деньгами плательщика. Тогда и отвечаем его деньгами. Свой долг
  // клиента важнее — его показываем как раньше.
  const payer = data.payer && data.balance >= 0 ? data.payer : null;
  const own = !payer;
  const leadMoney = payer ? payer.balance : data.balance;
  const leadLeft = payer ? payer.trainingsLeft : data.trainingsLeft;
  const leadIsTrainings = leadLeft !== null && leadLeft !== undefined && leadMoney > 0;

  return (
    <>
      <Lead
        label={leadIsTrainings ? 'Оплачено вперёд' : 'Баланс'}
        value={
          leadIsTrainings
            ? leadLeft + ' ' + plural(leadLeft, 'тренировка', 'тренировки', 'тренировок')
            : formatMoney(leadMoney)
        }
        tone={leadMoney < 0 ? 'critical' : leadMoney > 0 ? 'good' : undefined}
        hint={
          own
            ? leadIsTrainings
              ? formatMoney(data.balance) + ' на балансе'
              : data.balance < 0
                ? 'Нужно пополнить'
                : 'Баланс исчерпан'
            : 'Платит ' + payer.name + ' · ' + formatMoney(payer.balance) + ' на балансе'
        }
        facts={[
          // Ближайшее занятие стоит первым фактом намеренно: чаще всего
          // приложение открывают именно с этим вопросом, и ответ не должен
          // требовать прокрутки.
          {
            label: 'Следующая тренировка',
            // «Не назначена» и «расписание недоступно» — разные новости.
            // Первая значит «занятий впереди нет, напишите тренеру»,
            // вторая — «мы просто не знаем»; путать их нельзя.
            //
            // Сравниваем с true, а не с false: поля может не быть вовсе —
            // например, API отвечает кодом, который про расписание ещё не
            // знает. Отсутствие ответа — это «не знаем», а не «занятий нет».
            value: data.nextTrainingDate
              ? formatWhen(data.nextTrainingDate)
              : data.scheduleKnown !== true ? 'нет данных' : 'не назначена',
          },
          { label: 'Тренировок в этом месяце', value: formatNumber(data.trainingsThisMonth) },
        ]}
      />

      {/* Конец пакета. Стоит сразу под главной цифрой, потому что это
          единственная новость, требующая действия СЕГОДНЯ: «осталось 2»
          человек читает как «ещё есть» и узнаёт о конце в тот день, когда
          пришёл заниматься. */}
      <PackageEnding state={data.packageEnding} payer={data.payer} trainer={!!clientRow && !clientView} />

      {sinceTraining !== null && sinceTraining > 14 && (
        <Section>
          <Panel pad>
            <div className="warn">
              <span className="warn__icon">
                <IconAlert size={18} />
              </span>
              <div className="small">
                Больше двух недель без тренировок — {relativeDays(data.lastTrainingDate)}.
                Напишите тренеру, чтобы вернуться в график.
              </div>
            </div>
          </Panel>
        </Section>
      )}

      <Section title="Занятия">
        <Panel>
          <Rows>
            <Row label="Программа месяца">
              <StatusBadge value={data.monthSheetStatus} fallback="не создана" />
            </Row>
            <Row label="Последний замер">
              <StatusBadge value={data.lastMeasureStatus} fallback="не было" />
            </Row>
            <Row label="Следующая тренировка">
              {data.nextTrainingDate
                ? formatDate(data.nextTrainingDate) + ', ' + formatTime(data.nextTrainingDate)
                : data.scheduleKnown !== true
                  ? 'расписание временно недоступно'
                  : 'не назначена'}
            </Row>
            {data.lastTrainingDate && (
              <Row label="Дата последней тренировки">{formatDate(data.lastTrainingDate)}</Row>
            )}
            {clientRow && !clientView && data.startDate && <Row label="Занимается с">{formatDate(data.startDate)}</Row>}
            {clientRow && !clientView && data.scheduleChanges && (
              <>
                <Row label="Отмены">{changeLine(data.scheduleChanges, 'cancel')}</Row>
                <Row label="Переносы">{changeLine(data.scheduleChanges, 'move')}</Row>
              </>
            )}
          </Rows>
        </Panel>
      </Section>

      {data.balance < 0 && (
        <Section title="Оплата">
          <Panel pad>
            <div className="small">
              По балансу числится долг {formatMoney(Math.abs(data.balance))}.
              Если оплата уже прошла — напишите тренеру, он отметит её в таблице.
            </div>
          </Panel>
        </Section>
      )}

      {/* Выход переехал в боковое меню, к «Моим данным»: он про себя, а
          не про тренировки, и на обзоре стоял только потому, что меню не
          было. */}
    </>
  );
}

/* ==================================================================
 * Тренировочный план
 * ================================================================== */

// familyRow — программа члена семьи: только чтение, без журнала и без
// «Начать тренировку». Записывать подходы за другого человека нельзя.
/**
 * Отмены или переносы клиента строкой: «2 в этом месяце · 5 всего (клиент 4,
 * тренер 1; поздних 2, списано 1)». Нет ни одной — «не было».
 */
function changeLine(counts, kind) {
  const part = (c) => (kind === 'cancel' ? c.cancelClient + c.cancelTrainer : c.moveClient + c.moveTrainer);
  const all = part(counts.total);
  if (!all) return 'не было';
  const t = counts.total;
  const detail = kind === 'cancel'
    ? ['клиент ' + t.cancelClient, 'тренер ' + t.cancelTrainer, t.cancelLate ? 'поздних ' + t.cancelLate : '', t.cancelCharged ? 'списано ' + t.cancelCharged : '']
    : ['клиент ' + t.moveClient, 'тренер ' + t.moveTrainer];
  // Число этого месяца — главное; разбивка за всё время — мелко под ним
  return (
    <span className="changes">
      <strong>{part(counts.month)} в этом месяце</strong>
      <span className="changes__detail">всего {all}: {detail.filter(Boolean).join(', ')}</span>
    </span>
  );
}

export function Plan({ clientRow, clientView = false, familyRow = null }) {
  const [workout, setWorkout] = useState(null);
  // Из журнала тренировки — обратно к тому же месту программы
  useReturnScroll(!!workout);

  // Переход вперёд снимает экран — его покажет жест «назад» под журналом
  const openWorkout = (value) => { captureScreen(); setWorkout(value); };
  const [month, setMonth] = useState('');
  const params = {
    ...(clientRow ? { clientRow } : {}),
    ...(clientView ? { clientView: true } : {}),
    ...(month ? { month } : {}),
    ...(familyRow ? { familyRow } : {}),
  };
  const { loading, data, error, reload } = useData('client.plan', params, [clientRow, clientView, month, familyRow]);

  // Незакрытое занятие. Раньше о нём не было видно ничего: «К программе»
  // выглядит как выход, а занятие продолжает идти, и человек узнавал об
  // этом, только когда не мог начать следующее — оно молча открывало
  // старое.
  // Журнал занятий: из него берутся и незакрытое занятие, и отметка
  // «тренировка проведена» у блоков программы.
  const [sessions, setSessions] = useState([]);
  // Переименование тренировки или месяца меняет и журнал (на сервере) —
  // перечитать его, иначе проведённые на миг окажутся в «Очереди»
  const [journalTick, setJournalTick] = useState(0);

  // Правка программы доступна только тренеру и только из карточки
  // клиента: в режиме «смотрю как клиент» кнопок быть не должно.
  const [creating, setCreating] = useState(false);
  // Переименование месяца — тапом по выбранному месяцу
  const [renamingMonth, setRenamingMonth] = useState(null); // null | строка
  const [monthFailure, setMonthFailure] = useState('');

  // Правка программы прямо в тренировках (03.10.2026): пока правки уходят
  // на сервер, экран показывает свой снимок месяца; сервер ответил и новых
  // правок не было — снова его данные (с id новых тренировок)
  const [draft, setDraft] = useState(null); // { month, blocks }
  const [saveState, setSaveState] = useState(''); // '' | 'saving' | 'error'
  const editSeq = useRef(0);
  const saveTimer = useRef(null);
  const blocksRef = useRef(null);

  // Шаблоны: взять готовую программу из библиотеки или сохранить эту как
  // шаблон. Только тренер, как и правка.
  const [templateTool, setTemplateTool] = useState(null); // 'apply' | 'save'
  const [savedTemplate, setSavedTemplate] = useState(false);

  // Очередь и выполненные. Наверху всегда та тренировка, которую делать
  // следующей: проведённые уезжают во вторую вкладку и не отодвигают её
  // вниз — к середине месяца их больше, чем оставшихся.
  const [planTab, setPlanTab] = useState('queue');
  // Тренировки свёрнуты: список из шести тренировок по шесть упражнений —
  // это лента в несколько экранов, где нужная теряется. Свёрнутая
  // показывает, что в ней, и сразу даёт начать; развернуть — по нажатию.
  const [openBlocks, setOpenBlocks] = useState({});
  const [selectingBlocks, setSelectingBlocks] = useState(false);
  const [selectedBlocks, setSelectedBlocks] = useState(() => new Set());
  const [blockUndo, setBlockUndo] = useState(null);
  useEffect(() => {
    setSelectingBlocks(false);
    setSelectedBlocks(new Set());
    setBlockUndo(null);
    setOpenBlocks({});
  }, [planTab, month]);

  // Журнал может ответить не сразу, поэтому экран его не
  // ждёт: программа рисуется сразу, строка про занятие появляется, когда
  // придёт ответ. Перечитываем после выхода из журнала — там занятие
  // могли завершить или отменить.
  useEffect(() => {
    let alive = true;
    apiPublic('workout.list', { ...(clientRow ? { clientRow } : {}), ...(familyRow ? { familyRow } : {}) })
      .then((r) => {
        if (!alive) return;
        setSessions((r && r.sessions) || []);
      })
      .catch(() => { if (alive) setSessions([]); });
    return () => { alive = false; };
  }, [clientRow, workout, familyRow, journalTick]);

  // Выход из журнала — перечитать и программу: тренер мог переименовать
  // занятие, и тренировка в программе переименовалась вместе с ним
  // (сервер, renameBlockFromJournal). Старые данные остаются на экране до ответа.
  if (workout) return <Deferred fallback={waiting}><WorkoutJournal key={clientRow || 'self'} clientRow={clientRow} clientView={clientView} launch={workout.block || workout.sessionId ? workout : null} onClose={() => { setWorkout(null); reload(); }} /></Deferred>;

  if (loading || error) return <>
    {loading ? <Loading lead={false} rows={4} /> : <ErrorState error={error} onRetry={reload} />}
  </>;

  const months = data.available || [];
  const blocks = data.blocks || [];
  const shownBlocks = draft && draft.month === data.month ? draft.blocks : blocks;
  const running = sessions.find((x) => x.status === 'active' || x.status === 'paused') || null;

  // Пока занятие не закрыто, новое начать нельзя: журнал всё равно откроет
  // текущее. Поэтому вместо «Начать тренировку» у блоков показывается одна
  // строка про идущее занятие — обещать кнопкой то, чего она не сделает,
  // хуже, чем её не показывать.
  const runningLine = running && !familyRow && (
    <Section>
      <Panel pad>
        <p className="small muted" style={{ marginTop: 0, marginBottom: 12 }}>
          {running.status === 'active' ? 'Идёт занятие' : 'Занятие на паузе'}
          {' «' + running.title + '»'}
          {running.done ? ' · ' + running.done + ' ' + plural(running.done, 'подход', 'подхода', 'подходов') : ''}.
          {' '}Новое можно начать, когда это завершено или отменено.
        </p>
        {/* Номер идущего — не «какое-нибудь»: иначе открывался черновик
            последнего завершённого (02.10.2026) */}
        <button className="button button--primary button--block" onClick={() => openWorkout({ sessionId: running.id })}>
          Вернуться к занятию
        </button>
      </Panel>
    </Section>
  );

  // Скрытые месяцы приезжают только тренеру: клиент про них не знает и
  // знать не должен, иначе появится вопрос «а что там».
  const hiddenMonths = data.hidden || [];
  const isHidden = hiddenMonths.indexOf(data.month) !== -1;

  const totalExercises = shownBlocks.reduce((s, b) => s + b.exercises.length, 0);

  // Проведённой считается тренировка, у которой есть завершённое занятие
  // этого месяца. Порядок в «Очереди» — тот же, что в программе.
  const queueBlocks = shownBlocks.filter((b) => !blockSessions(sessions, b, data.month).length);
  const visibleBlocks = planTab === 'all' ? shownBlocks : queueBlocks;
  // «Выполненные» (01.10.2026) — все завершённые занятия месяца по дате
  // занятия, свежие сверху: тренировки программы (и повторы), свободные.
  // Какого месяца: открыли лист программы сами — того месяца; иначе —
  // текущего календарного, даже если программа ещё прошлого (решение
  // владельца: в октябре сентябрьские занятия по умолчанию не показываем)
  const doneLabel = month ? data.month : currentMonthLabel();
  // Листа текущего месяца ещё нет (в октябре программа сентябрьская) — в
  // переключателе всё равно есть «Октябрь 2026»: по умолчанию выбран он
  // («Выполненные» за октябрь), а «Сентябрь 2026» открывает сентябрьские.
  // Иначе с одним листом переключателя не было, и прошлый месяц не открыть
  const nowLabel = currentMonthLabel();
  const monthChips = [
    ...(months.indexOf(nowLabel) === -1 ? [{ value: '', label: nowLabel }] : []),
    ...months.map((m) => ({
      value: m,
      // Пометка прямо в подписи, а не значком: тренер листает месяцы
      // глазами, и «скрыт» должно читаться, не требуя расшифровки.
      label: hiddenMonths.indexOf(m) !== -1 ? m + ' · скрыт' : m,
    })),
  ];
  const chipValue = !month && months.indexOf(nowLabel) === -1 ? '' : data.month;
  const doneSessions = sessions
    .filter((s) => s.status === 'completed' && inMonthLabel(s.startedAt || s.updatedAt, doneLabel))
    .sort((a, b) => String(b.startedAt || b.updatedAt).localeCompare(String(a.startedAt || a.updatedAt)));
  const freeWorkout = () => openWorkout({ block: FREE_BLOCK, month: '' });

  // Переименовать тренировку — тапом по названию (02.10.2026), без
  // редактора программы. Сохраняется тем же снимком месяца, что и редактор:
  // по id тренировки сервер переименует её и в журнале занятий
  const canRename = !!(data.canHide && data.month && !familyRow);
  const canEdit = canRename && !clientView;

  const unnamed = (list) => list.some((b) => !b.exercises.length || b.exercises.some((e) => !String(e.name || '').trim()));
  const push = async (list, seq) => {
    setSaveState('saving');
    try {
      const saved = await apiMutate('plan.save', {
        clientRow,
        month: data.month,
        blocks: list
          .map((b) => ({
            title: b.title,
            ...(b.id ? { id: b.id } : {}),
            ...(b.sourceId ? { sourceId: b.sourceId } : {}),
            exercises: b.exercises.filter((e) => String(e.name || '').trim()),
          }))
          .filter((b) => b.exercises.length),
      });
      if (editSeq.current !== seq) return;
      setSaveState('');
      // plan.save возвращает тот же снимок истории, что client.plan.
      // Показываем его до фонового перечитывания, чтобы новое упражнение
      // сразу получило свои lastWeight/startSets, а не старые из draft.
      if (!unnamed(list) && saved && Array.isArray(saved.blocks)) {
        setDraft({ month: saved.month || data.month, blocks: saved.blocks });
      }
      await reload();
      // Пока есть упражнение без названия, держим свой снимок: сервер его
      // не хранит, и строка пропала бы из-под пальца
      if (editSeq.current === seq && !unnamed(list)) setDraft(null);
      setJournalTick((t) => t + 1);
    } catch (error) {
      if (editSeq.current === seq) setSaveState('error:' + (error.message || 'не сохранилось'));
    }
  };
  /** Новый снимок месяца: сразу на экран, на сервер — через ~0,7 с тишины */
  const commit = (list, { keepUndo = false } = {}) => {
    if (!keepUndo) setBlockUndo(null);
    editSeq.current += 1;
    const seq = editSeq.current;
    setDraft({ month: data.month, blocks: list });
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => push(list, seq), 700);
  };
  const renameBlock = async (block, title) => {
    commit(shownBlocks.map((b) => (b === block ? { ...b, title } : b)));
  };
  const newBlock = (made) => {
    const list = [...shownBlocks, made || {
      title: 'Тренировка № ' + (shownBlocks.length + 1),
      exercises: [{ name: '', sets: '3', reps: '', weight: '', prevWeight: '', rpe: '', supersetGroup: '', performers: [], splitWeights: {}, splitPrev: {}, exerciseId: null, technique: '', cardio: null }],
    }];
    commit(list);
    const tab = planTab === 'done' ? 'queue' : planTab;
    if (tab !== planTab) setPlanTab(tab);
    setOpenBlocks((prev) => ({ ...prev, [tab + ':' + (list.length - 1)]: true }));
  };
  const copyBlocks = (indices) => {
    commit(copyPlanBlocks(shownBlocks, indices));
    setSelectedBlocks(new Set());
    setSelectingBlocks(false);
    haptic('success');
  };
  const removeBlocks = (indices) => {
    if (!indices.length || shownBlocks.length - indices.length < 1) return;
    setBlockUndo({ blocks: shownBlocks, count: indices.length });
    commit(shownBlocks.filter((_, index) => !indices.includes(index)), { keepUndo: true });
    setSelectedBlocks(new Set());
    setSelectingBlocks(false);
    haptic('success');
  };
  const renameSession = async (session, title) => {
    const current = await apiPublic('workout.get', {
      ...(clientRow ? { clientRow } : {}),
      id: session.id,
    });
    const result = await apiMutate('workout.save', {
      ...(clientRow ? { clientRow } : {}),
      ...workoutRenameParams(current.session, title, uid()),
    });
    setSessions((current) => current.map((item) => (item.id === session.id ? result.session : item)));
    await reload();
    return result.session;
  };

  // Новый месяц — следующий за самым поздним, пустой: «Из шаблона» или
  // копия прошлого — в нём самом (решение владельца 03.10.2026)
  const addMonth = async () => {
    const name = monthAfter(months[0]) || nextMonthLabel();
    setCreating(true);
    setMonthFailure('');
    try {
      await apiMutate('plan.month.create', { clientRow, month: name });
      setMonth(name);
      reload();
    } catch (error) {
      setMonthFailure(error.message);
    } finally {
      setCreating(false);
    }
  };
  const renameMonth = async () => {
    const to = String(renamingMonth || '').trim();
    if (!to || to === data.month) { setRenamingMonth(null); return; }
    setCreating(true);
    setMonthFailure('');
    try {
      await apiMutate('plan.month.rename', { clientRow, from: data.month, to });
      setRenamingMonth(null);
      setMonth(to);
      reload();
      setJournalTick((t) => t + 1);
    } catch (error) {
      setMonthFailure(error.message);
    } finally {
      setCreating(false);
    }
  };
  // Пустой месяц — скопировать программу другого: веса становятся «было»
  const copyMonth = async (from) => {
    setCreating(true);
    setMonthFailure('');
    try {
      const src = await apiPublic('client.plan', { clientRow, month: from });
      await apiMutate('plan.save', {
        clientRow,
        month: data.month,
        blocks: (src.blocks || []).map((b) => ({
          title: b.title,
          ...(b.sourceId ? { sourceId: b.sourceId } : {}),
          exercises: b.exercises.map((e) => ({
            name: e.name, sets: e.sets, reps: e.reps, rpe: e.rpe, supersetGroup: e.supersetGroup,
            performers: e.performers || [], exerciseId: e.exerciseId || null, technique: e.technique || '', cardio: e.cardio || null,
            weight: '', prevWeight: e.weight || e.prevWeight || '', splitWeights: {}, splitPrev: e.splitWeights || {},
          })),
        })),
      });
      reload();
    } catch (error) {
      setMonthFailure(error.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      {/* Журнал тренировок — в боковом меню (решение владельца 28.09.2026:
          один журнал, а не два). Здесь — только незакрытое занятие: это
          первое, что человек должен узнать на этом экране. */}
      {runningLine}

      {/* Месяцы: «+» слева — новый месяц; тап по выбранному — переименовать
          (владелец, 03.10.2026: вместо меню «Изменить программу») */}
      {(monthChips.length > 1 || canEdit) && renamingMonth === null && (
        <div className="plan__months">
          {canEdit && (
            <button type="button" className="plan__month-add" aria-label="Новый месяц" disabled={creating} onClick={addMonth}>
              <IconPlus size={18} />
            </button>
          )}
          <Chips
            items={monthChips}
            value={chipValue}
            onChange={(v) => {
              if (canEdit && v === chipValue && data.month && v === data.month) { setRenamingMonth(data.month); return; }
              setMonth(v);
            }}
          />
        </div>
      )}
      {renamingMonth !== null && (
        <form className="plan__month-rename" onSubmit={(e) => { e.preventDefault(); renameMonth(); }}>
          <input className="field__input" aria-label="Название месяца" autoFocus value={renamingMonth} maxLength={40} onChange={(e) => setRenamingMonth(e.target.value)} />
          <button type="submit" className="button button--primary" disabled={creating}>Готово</button>
          <button type="button" className="button button--ghost" onClick={() => { setRenamingMonth(null); setMonthFailure(''); }}>Отмена</button>
        </form>
      )}
      {monthFailure && <p className="small plan__failure" role="alert">{monthFailure}</p>}

      {/* Своя программа тренера («Мои тренировки») — прятать не от кого */}
      {data.canHide && !data.self && data.month && (
        <MonthVisibility
          month={data.month}
          hidden={isHidden}
          clientRow={clientRow}
          onChanged={reload}
        />
      )}

      {/* Сначала — какой месяц и видит ли его клиент, потом — что с этим
          месяцем делать: кнопки правки относятся к выбранному месяцу и
          стоят под ним, а не над переключателем месяцев. */}
      {data.canHide && templateTool === 'apply' && (
        <Section title="Программа из шаблона">
          <Deferred fallback={waiting}>
            <TemplateApply
              clientRow={clientRow}
              month={data.month}
              onApplied={(m) => { setTemplateTool(null); setMonth(m); reload(); }}
              onCancel={() => setTemplateTool(null)}
            />
          </Deferred>
        </Section>
      )}

      {data.canHide && templateTool === 'save' && (
        <Section title="Сохранить как шаблон">
          <Deferred fallback={waiting}>
            <SaveAsTemplate
              clientRow={clientRow}
              month={data.month}
              onDone={() => { setTemplateTool(null); setSavedTemplate(true); }}
              onCancel={() => setTemplateTool(null)}
            />
          </Deferred>
        </Section>
      )}

      {savedTemplate && (
        <p className="small muted">Шаблон сохранён — он в разделе «Шаблоны» нижнего меню.</p>
      )}
      {saveState.startsWith('error:') && (
        <p className="small plan__failure" role="alert">
          Не сохранилось: {saveState.slice(6)}{' '}
          <button type="button" className="button button--ghost" onClick={() => draft && push(draft.blocks, editSeq.current)}>Повторить</button>
        </p>
      )}


      {/* Пока программа правится, текущие тренировки под редактором не
          показываем: они мешали и путали, что правится, а что нет */}
      <>
      {shownBlocks.length === 0 && canEdit && !templateTool && (
        <Section title={'Месяц «' + data.month + '» пуст'}>
          <Panel pad>
            <div className="plan__tools">
              <button className="button" onClick={() => { setTemplateTool('apply'); setSavedTemplate(false); }}>Из шаблона</button>
              {months.filter((m) => m !== data.month).slice(0, 1).map((m) => (
                <button className="button" key={m} disabled={creating} onClick={() => copyMonth(m)}>Скопировать «{m}»</button>
              ))}
              <button className="button button--primary" onClick={() => newBlock(null)}>Новая тренировка</button>
            </div>
          </Panel>
        </Section>
      )}
      {shownBlocks.length === 0 && !canEdit && (
        <Empty
          icon={IconPlan}
          title="Программы пока нет"
          text={data.note || (data.month
            ? `Лист «${data.month}» ещё не заполнен. Тренер создаёт программу в начале месяца.`
            : 'Тренер ещё не создал ни одного листа с программой.')}
        />
      )}

      {(shownBlocks.length > 0 || doneSessions.length > 0) && (
        <Chips
          items={[
            { value: 'queue', label: 'Очередь · ' + queueBlocks.length },
            { value: 'done', label: 'Выполненные · ' + doneSessions.length },
            // Вся программа месяца: проведённые отмечены зелёным
            ...(shownBlocks.length ? [{ value: 'all', label: 'Вся программа · ' + shownBlocks.length }] : []),
          ]}
          value={planTab}
          onChange={setPlanTab}
        />
      )}

      {/* Свободная тренировка — без программы: что делал, то и записал.
          Появится во «Выполненных» этого месяца */}
      {!running && !familyRow && planTab === 'queue' && (
        <button className="button button--block plan__free" onClick={freeWorkout}>Свободная тренировка</button>
      )}

      {planTab === 'done' && doneSessions.length === 0 && (
        <Empty
          icon={IconPlan}
          title="Пока ничего не выполнено"
          text={'В ' + monthIn(doneLabel) + ' ещё нет проведённых тренировок.'}
        />
      )}

      {planTab === 'done' && doneSessions.map((s) => (
        <DoneSession
          key={s.id}
          session={s}
          canOpen={!familyRow}
          onRename={canEdit ? (title) => renameSession(s, title) : null}
          onOpen={() => openWorkout({ sessionId: s.id })}
        />
      ))}

      {planTab === 'queue' && queueBlocks.length === 0 && shownBlocks.length > 0 && (
        <Empty
          icon={IconPlan}
          title="Все тренировки месяца проведены"
          text="Программа пройдена целиком. Выполненные — на соседней вкладке."
        />
      )}

      {canEdit && (planTab === 'queue' || planTab === 'all') && visibleBlocks.length > 0 && (
        <div className="plan__manage-bar">
          {selectingBlocks ? (
            <>
              <button
                type="button"
                className="button button--ghost"
                onClick={() => setSelectedBlocks(selectedBlocks.size === visibleBlocks.length
                  ? new Set()
                  : new Set(visibleBlocks.map((block) => shownBlocks.indexOf(block))))}
              >
                {selectedBlocks.size === visibleBlocks.length ? 'Снять все' : 'Выбрать все'}
              </button>
              <button type="button" className="button" onClick={() => { setSelectingBlocks(false); setSelectedBlocks(new Set()); }}>Отмена</button>
            </>
          ) : (
            <button type="button" className="button" onClick={() => { setSelectingBlocks(true); setOpenBlocks({}); }}>
              <IconCheck size={16} />Выбрать
            </button>
          )}
        </div>
      )}

      {blockUndo && (
        <div className="plan__block-undo" role="status">
          <span>{blockUndo.count === 1 ? 'Тренировка удалена' : 'Тренировки удалены'}</span>
          <button type="button" className="button button--ghost" onClick={() => { commit(blockUndo.blocks); setBlockUndo(null); }}>Вернуть</button>
        </div>
      )}

      {(planTab === 'queue' || planTab === 'all') && <div className={'plan__blocks' + (selectingBlocks ? ' plan__blocks--selecting' : '')} ref={blocksRef}>{visibleBlocks.map((block, i, shownList) => {
        const past = blockSessions(sessions, block, data.month);
        const bi = shownBlocks.indexOf(block);
        const editHere = canEdit && !made0(planTab);

        // Во «Выполненных» — то, что сделано на последнем занятии, а не
        // план: в зале упражнение могли заменить или добавить, а программа
        // месяца от занятия не меняется. Старый ответ сервера (или Apps
        // Script) состава не присылает — тогда, как раньше, план.
        const made = planTab === 'done' && past[0] && Array.isArray(past[0].exercises) && past[0].exercises.length
          ? past[0].exercises
          : null;
        const shownExercises = made || block.exercises;
        // Ключ — по месту в месяце: переименование не сворачивает тренировку
        const blockKey = planTab + ':' + bi;
        const open = !!openBlocks[blockKey];
        const picked = selectedBlocks.has(bi);
        const names = shownExercises.map((ex) => ex.name).filter(Boolean);
        const preview = names.slice(0, 2).join(', ') + (names.length > 2 ? ' и ещё ' + (names.length - 2) : '');

        return (
        // Тренировку — удержанием вверх или вниз (владелец, 03.10.2026).
        // Не из правки упражнений внутри: там своё перетаскивание
        <PlanBlockSwipe
          key={block.id || 'new' + bi}
          enabled={canEdit && !selectingBlocks && shownBlocks.length > 1}
          block={block}
          index={bi}
          done={past.length > 0}
          onDelete={() => removeBlocks([bi])}
        >
        <div
          className="plan__block"
          data-picked={picked ? '' : undefined}
          role={selectingBlocks ? 'checkbox' : undefined}
          aria-checked={selectingBlocks ? picked : undefined}
          tabIndex={selectingBlocks ? 0 : undefined}
          onClick={selectingBlocks ? () => setSelectedBlocks((current) => {
            const next = new Set(current);
            if (next.has(bi)) next.delete(bi); else next.add(bi);
            return next;
          }) : undefined}
          onKeyDown={selectingBlocks ? (event) => {
            if (event.key !== ' ' && event.key !== 'Enter') return;
            event.preventDefault();
            event.currentTarget.click();
          } : undefined}
          // Проведённые стоят на месте: их не тащат и между ними не ставят —
          // переставляются только оставшиеся, на свои же места
          data-done={past.length ? '' : undefined}
          onPointerDown={canEdit && !selectingBlocks && !past.length ? (e) => {
            if (e.target.closest && e.target.closest('.plan-inline, input, textarea, select')) return;
            const movable = shownList.filter((b) => !blockSessions(sessions, b, data.month).length);
            holdToReorder(e, {
              row: e.currentTarget.closest('.plan__block-swipe') || e.currentTarget,
              rows: () => (blocksRef.current ? [...blocksRef.current.querySelectorAll(':scope > [data-block]:not([data-done])')] : []),
              onDrop: (from, to) => {
                // Переставили среди оставшихся — в месяце они занимают те же места
                const order = [...movable];
                const [moved] = order.splice(from, 1);
                order.splice(to, 0, moved);
                const slots = shownBlocks.map((b, k) => (movable.includes(b) ? k : -1)).filter((k) => k >= 0);
                const next = [...shownBlocks];
                slots.forEach((at, k) => { next[at] = order[k]; });
                commit(next);
                setOpenBlocks({});
              },
            });
          } : undefined}
        >
        {selectingBlocks && <span className={'plan__block-pick' + (picked ? ' is-on' : '')} aria-hidden="true">{picked && <IconCheck size={17} />}</span>}
        <Section
          title={(() => {
            const t = canRename ? <BlockTitle title={block.title} onRename={(v) => renameBlock(block, v)} /> : block.title;
            // Во «Всей программе» проведённая — зелёной галочкой
            return planTab === 'all' && past.length
              ? <span className="plan__title-done"><IconCheck size={18} aria-label="Проведена" />{t}</span>
              : t;
          })()}
          note={shownExercises.length + ' ' + plural(shownExercises.length, 'упражнение', 'упражнения', 'упражнений')}
        >
          <Panel>
            {/* Веса живут в журнале, а не в программе: лист месяца — это
                план, и занятие его не переписывает. Поэтому здесь не
                «сколько ты поднял», а «эту тренировку ты уже провёл» и
                прямая дорога к тому, с чем провёл. */}
            {past.length > 0 && (
              <div className="plan__done">
                <div>
                  <strong>Тренировка проведена</strong>
                  <span>
                    {formatDate(past[0].updatedAt)}
                    {past[0].done ? ' · ' + past[0].done + ' ' + plural(past[0].done, 'подход', 'подхода', 'подходов') : ''}
                    {past.length > 1 ? ' · всего занятий: ' + past.length : ''}
                  </span>
                </div>
                {!familyRow && <button className="button" onClick={() => openWorkout({ sessionId: past[0].id })}>Посмотреть веса</button>}
              </div>
            )}
            {!running && !familyRow && <button className="button button--primary button--block" onClick={() => openWorkout({ block, month: data.month, members: data.members || [] })}>Начать тренировку</button>}
            <button
              type="button"
              className="plan__toggle"
              aria-expanded={open}
              onClick={() => { setOpenBlocks((prev) => ({ ...prev, [blockKey]: !open })); haptic(); }}
            >
              <span className="plan__toggle-text">
                <strong>{open ? 'Свернуть' : planTab === 'done' ? 'Что сделано' : 'Упражнения'}</strong>
                {!open && preview && <span>{preview}</span>}
              </span>
              <IconChevron size={18} className={'plan__chevron' + (open ? ' plan__chevron--open' : '')} aria-hidden="true" />
            </button>
            {open && made && supersets(made).map((group, j) => {
              // У пары — строкой на человека: «Евгений: 3 × 12 · 25 кг». В
              // суперсете круги стоят у скобки, у упражнения — без них.
              const line = group.superset ? roundLine : doneLine;
              const rows = group.items.map((ex, k) => {
                const who = [...new Set(ex.sets.map((x) => x.who).filter(Boolean))];
                return (
                  <div className="exercise" style={{ minWidth: 0 }} key={k}>
                    <div style={{ minWidth: 0 }}>
                      <div className="exercise__name">{ex.name}</div>
                      {who.length
                        ? who.map((w) => (
                          <div className="exercise__scheme" key={w}>{w}: {line(ex.sets.filter((x) => x.who === w), ex.track)}</div>
                        ))
                        : <div className="exercise__scheme">{line(ex.sets, ex.track)}</div>}
                    </div>
                  </div>
                );
              });
              if (!group.superset) return <React.Fragment key={'m' + j}>{rows}</React.Fragment>;
              // Круги — подходы упражнения; у пары их вдвое больше, делим на людей
              const people = (ex) => new Set(ex.sets.map((x) => x.who || '')).size || 1;
              const rounds = Math.max(...group.items.map((ex) => Math.round(ex.sets.length / people(ex))));
              return <Superset rounds={rounds} key={'m' + j}>{rows}</Superset>;
            })}
            {open && editHere && (
              <Deferred fallback={<p className="small muted">Открываю правку…</p>}>
                <BlockEdit
                  block={block}
                  members={data.members || []}
                  canRemove={shownBlocks.length > 1}
                  onChange={(exercises) => commit(shownBlocks.map((b, k) => (k === bi ? { ...b, exercises } : b)))}
                  onRemove={() => commit(shownBlocks.filter((_, k) => k !== bi))}
                />
              </Deferred>
            )}
            {open && !editHere && !made && supersets(block.exercises).map((group, j) => (
              group.superset
                ? (
                  <Superset rounds={Number(group.sets) || 0} key={j}>
                    {group.items.map((ex, k) => <ExerciseRow ex={ex} inSuperset members={data.members} me={data.me} key={k} />)}
                  </Superset>
                )
                : <ExerciseRow ex={group.items[0]} members={data.members} me={data.me} key={j} />
            ))}
          </Panel>
        </Section>
        </div>
        </PlanBlockSwipe>
        );
      })}</div>}

      {selectingBlocks && selectedBlocks.size > 0 && (
        <div className="plan__block-actions" role="toolbar" aria-label="Действия с выбранными тренировками">
          <span>Выбрано: {selectedBlocks.size}</span>
          <button type="button" className="button" onClick={() => copyBlocks([...selectedBlocks])}><IconCopy size={16} />Копировать</button>
          <button type="button" className="button button--danger" disabled={shownBlocks.length - selectedBlocks.size < 1} onClick={() => removeBlocks([...selectedBlocks])}><IconTrash size={16} />Удалить</button>
        </div>
      )}

      {/* «+» под последней тренировкой: из шаблонов тренировок или новая */}
      {canEdit && (planTab === 'queue' || planTab === 'all') && shownBlocks.length > 0 && (
        <Deferred fallback={null}>
          <AddBlock onAdd={newBlock} busy={saveState === 'saving'} />
        </Deferred>
      )}
      {canEdit && planTab === 'all' && shownBlocks.length > 0 && !templateTool && (
        <button className="button button--block plan__as-template" onClick={() => { setTemplateTool('save'); setSavedTemplate(false); try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (_) { /* старый браузер */ } }}>
          Сохранить как шаблон
        </button>
      )}

      {totalExercises > 0 && !familyRow && (
        <p className="small muted" style={{ marginTop: 22, textAlign: 'center' }}>
          Откройте тренировку, чтобы записывать подходы и рабочие веса
        </p>
      )}
      </>
    </>
  );
}

/** Правка в развёрнутой тренировке — во «Очереди» и во «Всей программе» */
function made0(tab) { return tab === 'done'; }

/** «Октябрь 2026» → «Ноябрь 2026»; не разобрали — '' */
function monthAfter(label) {
  const names = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const m = String(label || '').match(/^(\S+)\s+(\d{4})$/);
  const k = m ? names.indexOf(m[1]) : -1;
  if (k < 0) return '';
  return k === 11 ? names[0] + ' ' + (Number(m[2]) + 1) : names[k + 1] + ' ' + m[2];
}

/**
 * Название тренировки, которое переименовывают тапом: кнопка → поле.
 * Enter или уход из поля — сохранить, Escape — оставить как было. Пока
 * сервер отвечает, видно уже новое название
 */
function BlockTitle({ title, onRename }) {
  const [value, setValue] = useState(null); // null — не правится
  const [saving, setSaving] = useState('');
  const [failure, setFailure] = useState('');
  const done = useRef(false);
  const finish = async (save) => {
    if (done.current) return;
    done.current = true;
    const next = String(value || '').trim();
    setValue(null);
    if (!save || !next || next === title) return;
    setSaving(next);
    setFailure('');
    try { await onRename(next); } catch (error) { setFailure(error.message || 'Не сохранилось'); }
    setSaving('');
  };
  if (value !== null) {
    return (
      <input
        className="field__input plan__title-input"
        autoFocus
        value={value}
        maxLength={160}
        aria-label="Название тренировки"
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); finish(true); }
          if (e.key === 'Escape') finish(false);
        }}
      />
    );
  }
  return (
    <>
      <button
        type="button"
        className="plan__title-tap"
        disabled={!!saving}
        aria-label={'Переименовать: ' + title}
        onClick={() => { done.current = false; setValue(title); haptic(); }}
      >
        {saving || title}
      </button>
      {failure && <span className="small plan__title-error">{failure}</span>}
    </>
  );
}

/** Заготовка свободной тренировки — как в журнале (Workout.jsx) */
const FREE_BLOCK = { title: 'Свободная тренировка', exercises: [{ name: 'Первое упражнение', sets: 3 }] };

const MONTH_NAMES = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

/** «Октябрь 2026» — текущий месяц, как называются листы программы */
function currentMonthLabel(now = new Date()) {
  const name = MONTH_NAMES[now.getMonth()];
  return name[0].toUpperCase() + name.slice(1) + ' ' + now.getFullYear();
}

/** «Октябрь 2026» → «октябре»: «в октябре ещё нет…» */
function monthIn(label) {
  const IN = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];
  const m = /^(\S+)/.exec(String(label || ''));
  const i = m ? MONTH_NAMES.indexOf(m[1].toLowerCase()) : -1;
  return i >= 0 ? IN[i] : 'этом месяце';
}

/** Дата занятия в месяце «Сентябрь 2026»; непонятное название — да (не терять) */
function inMonthLabel(iso, label) {
  const m = /^(\S+)\s+(\d{4})$/.exec(String(label || '').trim());
  const d = new Date(iso);
  if (!m || isNaN(d.getTime())) return !label;
  const idx = MONTH_NAMES.indexOf(m[1].toLowerCase());
  return idx === d.getMonth() && Number(m[2]) === d.getFullYear();
}

/** Свайп живёт вокруг карточки, а удержание переставляет эту же обёртку. */
function PlanBlockSwipe({ enabled, block, index, done, onDelete, children }) {
  if (!enabled) return children;
  return (
    <SwipeRow
      className="plan__block-swipe"
      data-block={index}
      data-done={done ? '' : undefined}
      label={'Удалить тренировку «' + block.title + '»'}
      onDelete={onDelete}
    >
      {children}
    </SwipeRow>
  );
}

/**
 * Проведённое занятие во «Выполненных»: название, когда, сколько подходов,
 * «Посмотреть веса» и по нажатию — что сделано. Свободная тренировка и
 * повтор той же тренировки программы — такие же строки.
 */
function DoneSession({ session: s, canOpen, onRename, onOpen }) {
  const [open, setOpen] = useState(false);
  const exercises = Array.isArray(s.exercises) ? s.exercises : [];
  const names = exercises.map((ex) => ex.name).filter(Boolean);
  const preview = names.slice(0, 2).join(', ') + (names.length > 2 ? ' и ещё ' + (names.length - 2) : '');
  return (
    <Section title={onRename ? <BlockTitle title={s.title} onRename={onRename} /> : s.title} note={formatDate(s.startedAt || s.updatedAt)}>
      <Panel>
        <div className="plan__done">
          <div>
            <strong>{s.month ? 'Тренировка проведена' : 'Свободная тренировка'}</strong>
            <span>{s.done ? s.done + ' ' + plural(s.done, 'подход', 'подхода', 'подходов') : 'без отмеченных подходов'}</span>
          </div>
          {canOpen && <button className="button" onClick={onOpen}>Посмотреть веса</button>}
        </div>
        {exercises.length > 0 && (
          <button type="button" className="plan__toggle" aria-expanded={open} onClick={() => { setOpen(!open); haptic(); }}>
            <span className="plan__toggle-text">
              <strong>{open ? 'Свернуть' : 'Что сделано'}</strong>
              {!open && preview && <span>{preview}</span>}
            </span>
            <IconChevron size={18} className={'plan__chevron' + (open ? ' plan__chevron--open' : '')} aria-hidden="true" />
          </button>
        )}
        {open && supersets(exercises).map((group, j) => {
          const line = group.superset ? roundLine : doneLine;
          const rows = group.items.map((ex, k) => {
            const who = [...new Set(ex.sets.map((x) => x.who).filter(Boolean))];
            return (
              <div className="exercise" style={{ minWidth: 0 }} key={k}>
                <div style={{ minWidth: 0 }}>
                  <div className="exercise__name">{ex.name}</div>
                  {who.length
                    ? who.map((w) => <div className="exercise__scheme" key={w}>{w}: {line(ex.sets.filter((x) => x.who === w), ex.track)}</div>)
                    : <div className="exercise__scheme">{line(ex.sets, ex.track)}</div>}
                </div>
              </div>
            );
          });
          if (!group.superset) return <React.Fragment key={'m' + j}>{rows}</React.Fragment>;
          const people = (ex) => new Set(ex.sets.map((x) => x.who || '')).size || 1;
          const rounds = Math.max(...group.items.map((ex) => Math.round(ex.sets.length / people(ex))));
          return <Superset rounds={rounds} key={'m' + j}>{rows}</Superset>;
        })}
      </Panel>
    </Section>
  );
}

/** «Октябрь 2026» — название следующего месяца */
function nextMonthLabel() {
  const names = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return names[next.getMonth()] + ' ' + next.getFullYear();
}

/**
 * Строка упражнения: название, подходы и повторы. Веса здесь нет
 * намеренно.
 *
 * В листе месяца «Вес» — это план тренера, и занятие его не переписывает:
 * лист остаётся шаблоном. Показанное рядом с упражнением число выглядело
 * как «твой рабочий вес» и жило своей жизнью — человек поднял больше, а в
 * программе всё то же самое. Настоящие веса лежат в журнале, и путь к ним
 * один: отметка «тренировка проведена» над списком.
 *
 * Внутри суперсета число подходов не повторяем у каждого: оно общее и
 * стоит в заголовке группы, а дважды написанное рядом читается как
 * «у каждого свои».
 */
/**
 * Суперсет — скобкой справа, у скобки крупно число кругов: так тренер
 * рисует его от руки на листе, и так же читается с одного взгляда —
 * «эти упражнения — подряд, столько-то раз».
 */
function Superset({ rounds, children }) {
  const label = rounds ? rounds + ' ' + plural(rounds, 'круг', 'круга', 'кругов') : '';
  return (
    <div className="superset" role="group" aria-label={'Суперсет' + (label ? ', ' + label : '')}>
      <div className="superset__head">
        Суперсет
        <span className="superset__hint">подряд, без отдыха между упражнениями</span>
      </div>
      <div className="superset__body">
        <div className="superset__items">{children}</div>
        {rounds > 0 && (
          <div className="superset__bracket" aria-hidden="true">
            <span className="superset__line" />
            <span className="superset__count">
              <strong>{rounds}</strong>
              <span>{plural(rounds, 'круг', 'круга', 'кругов')}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// me — участник пары, который смотрит: его вес первым и подписан «Вы»,
// чужое упражнение приглушено
function ExerciseRow({ ex, inSuperset, members = [], me = '' }) {
  // Упражнение из базы открывается карточкой: видео, техника, мышцы
  const [open, setOpen] = useState(false);
  const card = ex.exercise;
  const scheme = [
    // По типу: «3 × 12 на сторону», «20 мин · 8 км/ч», «4 × 60 с»
    planScheme(ex, inSuperset),
  ].filter(Boolean).join('   ·   ');

  // Сплит: кто делает и с каким весом. Упражнение не для всех — помечено
  // именем, чтобы в зале не пришлось вспоминать, чьё оно.
  const split = members && members.length > 1;
  const doers = split ? (ex.performers && ex.performers.length ? ex.performers : members) : [];
  const mine = !!me && doers.includes(me);
  const ordered = me ? [...doers.filter((m) => m === me), ...doers.filter((m) => m !== me)] : doers;
  const weights = ordered
    .map((m) => (ex.splitWeights && ex.splitWeights[m] ? (m === me ? 'Вы' : m) + ' ' + ex.splitWeights[m] + ' кг' : ''))
    .filter(Boolean)
    .join('   ·   ');

  return (
    <div className={'exercise' + (split && me && !mine ? ' exercise--other' : '')} style={{ minWidth: 0 }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        {card
          ? (
            <button type="button" className="exercise__name exercise__open" aria-expanded={open} onClick={() => { setOpen(!open); haptic(); }}>
              {ex.name}
              <span className="exercise__hint">{open ? 'свернуть' : card.setup ? 'техника и настройка' : 'техника'}</span>
            </button>
          )
          : <div className="exercise__name">{ex.name}</div>}
        {/* План — цифрами, которые ищут глазами: «4 × 8» заметно, RPE и
            приёмы рядом тише */}
        <div className="exercise__scheme">
          {scheme ? scheme.split('   ·   ').map((part, i) => (i === 0
            ? <span key={i}>{part.split(' · ').map((p, j) => (j === 0 ? <strong key={j} className="exercise__main">{p}</strong> : <span key={j}> · {p}</span>))}</span>
            : <span key={i}>   ·   {part}</span>)) : '—'}
        </div>
        {split && doers.length < members.length && (
          <div className="exercise__who">
            {me ? (mine ? 'только вы' : 'делает ' + doers.join(' и ')) : 'только ' + doers.join(' и ')}
          </div>
        )}
        {split && weights && <div className="exercise__scheme">{weights}</div>}
        {card && open && (
          <div className="exercise__card">
            {(card.muscle || card.equipment) && (
              <div className="exercise__scheme">{[card.muscle, card.equipment].filter(Boolean).join(' · ')}</div>
            )}
            <Media media={card.media} />
            {card.notes
              ? <p className="small" style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>{card.notes}</p>
              : !card.media && !card.setup && <p className="small muted" style={{ marginBottom: 0 }}>Техника к этому упражнению пока не записана.</p>}
            {card.setup && (
              <>
                <h4 className="setup__title">Как настроить тренажёр</h4>
                <SetupText text={card.setup} />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Скрыть месяц от клиента или вернуть его.
 *
 * Листы копятся годами: старые программы, месяцы без занятий, программа на
 * отпуск. Удалять их жалко — в них история, — а клиенту показывать незачем.
 * Раньше выбор был только такой: либо всё это у него в приложении, либо
 * лист удалён насовсем.
 *
 * Скрытие — отметка на сервере: программы с 25 сентября в таблицах не
 * живут, и вкладки там больше не прячутся.
 *
 * Только у тренера: сервер не пустит клиента в это действие по роли, но и
 * кнопки у него нет — решение, какие месяцы показывать, принимает не он.
 */
function MonthVisibility({ month, hidden, clientRow, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);

  const toggle = async () => {
    setBusy(true);
    setFailure(null);
    haptic();

    try {
      await apiMutate('plan.month.visibility', { clientRow, month, hidden: !hidden });
      onChanged();
    } catch (err) {
      setFailure(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section>
      <Panel pad>
        <p className="small muted" style={{ marginTop: 0, marginBottom: 12 }}>
          {hidden
            ? `Месяц «${month}» скрыт — клиент его не видит.`
            : `Месяц «${month}» виден клиенту. Скрытый останется у вас со всем содержимым.`}
        </p>

        <button className="button button--block" onClick={toggle} disabled={busy}>
          {busy ? 'Меняю…' : hidden ? 'Показать клиенту' : 'Скрыть от клиента'}
        </button>

        {failure && (
          <Note tone="critical" icon={IconAlert}>
            {failure.message || 'Не получилось изменить видимость листа'}
          </Note>
        )}
      </Panel>
    </Section>
  );
}

/* ==================================================================
 * Прогресс и замеры
 * ================================================================== */

/**
 * Прогресс и замеры — один экран и один поход на сервер.
 *
 * Данные лежат в трёх действиях: client.progress считает дельты и рост
 * рабочих весов, client.measurements отдаёт сами замеры и канонический
 * список показателей, client.nutrition — анкету, из которой нужна одна
 * цель: без неё изменение веса нечем оценить. Спрашивать их по очереди
 * нельзя: у Apps Script платит время сам факт обращения, и три запроса —
 * это три паузы подряд, а не втрое больше данных. Поэтому все действия
 * уезжают одним пакетом.
 *
 * Отказ одного действия не роняет экран: пакет отвечает по каждому
 * отдельно, и того, что доехало, хватает на большую часть страницы.
 * Незаполненная анкета — не отказ, а обычное состояние: экран тогда
 * показывает изменения без окраски.
 */
function useProgressBundle(clientRow, familyRow = null) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    const params = { ...(clientRow ? { clientRow } : {}), ...(familyRow ? { familyRow } : {}) };

    setState({ loading: true, data: null, error: null });

    // Питание члена семьи не показываем — и не спрашиваем: сервер его
    // всё равно не отдаст, а цель без анкеты просто не окрасит изменения.
    apiBatch([
      { action: 'client.progress', params },
      { action: 'client.measurements', params },
      ...(familyRow ? [] : [{ action: 'client.nutrition', params }]),
    ])
      .then((res) => {
        if (!alive) return;

        const progress = res['client.progress'];
        const measurements = res['client.measurements'];
        const nutrition = res['client.nutrition'];
        const okProgress = progress && progress.ok;
        const okMeasurements = measurements && measurements.ok;

        // Показывать нечего только когда не удалось ничего
        if (!okProgress && !okMeasurements) {
          setState({
            loading: false,
            data: null,
            error: (progress && progress.error)
              || (measurements && measurements.error)
              || new Error('Сервер не ответил.'),
          });
          return;
        }

        setState({
          loading: false,
          error: null,
          data: {
            progress: okProgress ? progress.data : null,
            measurements: okMeasurements ? measurements.data : null,
            goal: (nutrition && nutrition.ok && nutrition.data
              && nutrition.data.survey && nutrition.data.survey.goal) || null,
          },
        });
      })
      .catch((error) => {
        if (alive) setState({ loading: false, data: null, error });
      });

    return () => { alive = false; };
  }, [clientRow, familyRow, attempt]);

  return { ...state, reload: () => setAttempt((n) => n + 1) };
}

// familyRow — показатели члена семьи: смотреть можно, записывать замер — нет
// self — «Мои тренировки» тренера: шаги подключаются с его телефона, как у клиента
export function Progress({ clientRow, clientView = false, familyRow = null, self = false }) {
  const { loading, data, error, reload } = useProgressBundle(clientRow, familyRow);
  const [field, setField] = useState('Вес');
  // Изменение за всё время или с прошлого замера: первое отвечает «куда я
  // пришёл», второе — «что дала последняя неделя-две»
  const [period, setPeriodState] = useState(savedPeriod);
  const setPeriod = (value) => { setPeriodState(value); savePeriod(value); };

  // Форма нового замера. Открыта или нет — состояние экрана, а не данных:
  // после записи закрывается сама и просит перечитать замеры.
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(null);

  if (loading) return <Loading rows={3} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const progress = data.progress;
  const measurements = data.measurements;
  const goal = data.goal;

  // Оба действия читают одни и те же листы «Показатели» и в одном
  // порядке, поэтому дельты ложатся на замеры по позиции серии.
  const measureSeries = (measurements && measurements.series) || [];
  const progressSeries = (progress && progress.series) || [];
  const base = measureSeries.length ? measureSeries : progressSeries;

  const series = base.map((s, i) => {
    const total = (progressSeries[i] && progressSeries[i].deltas) || s.deltas || {};
    return {
      label: s.label || '',
      rows: s.rows || [],
      // С прошлого замера — по тем же показателям, что и итог
      deltas: period === 'last' ? recentDeltas(s.rows || [], Object.keys(total)) : total,
    };
  });

  const lifts = (progress && progress.lifts) || [];
  const grew = lifts.filter((l) => l.delta > 0);
  const hasRows = series.some((s) => s.rows.length > 0);

  // Замер вносят с телефона сразу после весов, поэтому вход в форму стоит
  // первым на экране, а не под таблицами: до низа в этот момент не листают.
  const addMeasure = familyRow ? null : adding
    ? (
      <Section title="Новый замер">
        <MeasureForm
          fields={measureFields(measurements, series)}
          series={series.map((x, i) => ({
            label: x.label,
            sheetName: (measurements && measurements.series && measurements.series[i]
              && measurements.series[i].sheetName) || '',
          }))}
          clientRow={clientRow}
          onSaved={(result) => { setAdding(false); setAdded(result); reload(); }}
          onCancel={() => setAdding(false)}
        />
      </Section>
    )
    : (
      // Кнопка без карточки вокруг: карточка ради одной кнопки — рамка без
      // содержания, и она слипалась с итогом ниже
      <div className="progress__add">
        {added && (
          <Note tone="good" icon={IconRuler}>
            {added.replaced
              ? 'Замер за ' + formatDate(added.date) + ' обновлён.'
              : 'Замер за ' + formatDate(added.date) + ' записан.'}
          </Note>
        )}
        <button className="button button--primary button--block" onClick={() => { setAdded(null); setAdding(true); }}>
          Записать замер
        </button>
      </div>
    );

  if (!hasRows && lifts.length === 0) {
    return (
      <>
        {addMeasure}
        <Empty
          icon={IconProgress}
          title="Прогресс пока не из чего собрать"
          text={
            familyRow
              ? 'Замеров и рабочих весов пока нет.'
              : (measurements && measurements.note)
            || 'Запишите первый замер — и здесь появятся динамика, изменения и таблица замеров. '
               + 'Рабочие веса подтянутся из программы месяца.'
          }
        />
        {!familyRow && <Steps clientRow={clientRow} self={self} preview={clientView} />}
      {!familyRow && <HealthWorkouts clientRow={clientRow} self={self} preview={clientView} />}
      </>
    );
  }

  // Одна метрика за раз. Вес и обхваты живут в разных диапазонах: на общей
  // оси линия веса прижмётся к низу, а двух шкал на графике быть не должно.
  const fields = measureFields(measurements, series);
  const available = fields.filter((f) =>
    series.some((s) => s.rows.some((r) => r[f] !== null && r[f] !== undefined))
  );

  const activeField = available.indexOf(field) !== -1 ? field : available[0];
  const unit = activeField === 'Вес' ? ' кг' : ' см';

  const chartSeries = series.map((s) => ({
    label: s.label || 'Замеры',
    points: s.rows
      .filter((r) => r[activeField] !== null && r[activeField] !== undefined)
      .map((r) => ({ x: r.date, y: r[activeField] })),
  }));

  // Ведущая серия — первая: у сольного клиента она единственная, у
  // сплит-пары крупная цифра всё равно может быть только чья-то одна.
  const points = (chartSeries[0] && chartSeries[0].points) || [];
  const last = points.length ? points[points.length - 1] : null;
  const first = points.length > 1 ? (period === 'last' ? points[points.length - 2] : points[0]) : (points[0] || null);
  const change = points.length > 1 ? Math.round((last.y - first.y) * 10) / 10 : null;

  const facts = [
    change !== null
      ? {
          label: 'Изменение',
          value: <Delta value={change} suffix={unit} aim={measureAim(activeField, goal)} />,
        }
      : null,
    lifts.length
      ? { label: 'Веса выросли', value: grew.length + ' из ' + lifts.length }
      : (points.length ? { label: 'Всего замеров', value: formatNumber(points.length) } : null),
  ].filter(Boolean);

  const hasDeltas = series.some((s) => Object.keys(s.deltas).length > 0);

  return (
    <>
      {addMeasure}

      {/* Период изменений — над итогом, который он меняет, и над таблицей */}
      {hasRows && series.some((s) => s.rows.length > 1) && (
        <div className="progress__period">
          <Chips
            items={[{ value: 'all', label: 'За всё время' }, { value: 'last', label: 'С прошлого замера' }]}
            value={period}
            onChange={setPeriod}
          />
        </div>
      )}

      {hasRows ? (
        <Lead
          label={activeField}
          value={last ? formatNumber(last.y) + unit : '—'}
          hint={
            change !== null
              ? 'было ' + formatNumber(first.y) + unit + (period === 'last' ? ' на прошлом замере, ' : ' с ') + formatDate(first.x, false)
              : last ? 'замер от ' + formatDate(last.x) : undefined
          }
          facts={facts.length ? facts : undefined}
        />
      ) : (
        // Замеров нет, но программа месяца заполнена — вести экран нечем,
        // кроме роста весов, и это честный ответ на «что изменилось».
        <Lead
          label="Рабочие веса"
          value={grew.length + ' из ' + lifts.length}
          hint="упражнений прибавили с прошлого месяца"
          facts={progress && progress.currentMonth
            ? [{ label: 'Месяц', value: progress.currentMonth }]
            : undefined}
        />
      )}

      {/* Выбор показателя — прямо над графиком, который он переключает:
          сверху, над итогом, он читался как отдельный фильтр экрана */}
      {available.length > 1 && (
        <div className="progress__fields">
          <Chips items={available} value={activeField} onChange={setField} />
        </div>
      )}

      {hasRows && (
        <Section title="Динамика" note={'по датам замеров,' + unit}>
          <Panel pad>
            <LineChart series={chartSeries} unit={unit} />
          </Panel>
        </Section>
      )}

      {hasDeltas && (
        <Section title="Изменения по замерам" note={period === 'last' ? 'от прошлого замера к последнему' : 'от первого к последнему'}>
          <Panel pad>
            {series.map((s, i) => (
              <div key={i} style={{ marginBottom: series.length > 1 && i < series.length - 1 ? 20 : 0 }}>
                {s.label && (
                  <div className="small muted" style={{ marginBottom: 8 }}>{s.label}</div>
                )}
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Показатель</th>
                        <th className="num">Было</th>
                        <th className="num">Стало</th>
                        <th className="num">Изменение</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.keys(s.deltas).map((f) => {
                        const d = s.deltas[f];
                        return (
                          <tr key={f}>
                            <td>{f}</td>
                            <td className="num">{formatNumber(d.first)}</td>
                            <td className="num">{formatNumber(d.last)}</td>
                            <td className="num"><Delta value={d.delta} aim={measureAim(f, goal)} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </Panel>
        </Section>
      )}

      {lifts.length > 0 && (
        <Section
          title="Рабочие веса"
          note={(progress && progress.currentMonth ? progress.currentMonth : 'этот месяц') + ' против прошлого месяца'}
        >
          <Panel pad>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th className="sticky">Упражнение</th>
                    <th className="num">Было</th>
                    <th className="num">Стало</th>
                    <th className="num">Изменение</th>
                  </tr>
                </thead>
                <tbody>
                  {lifts.map((l, i) => (
                    <tr key={i}>
                      <td className="sticky">{l.name}</td>
                      <td className="num">{formatNumber(l.prevWeight)}</td>
                      <td className="num">{formatNumber(l.weight)}</td>
                      <td className="num"><Delta value={l.delta} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </Section>
      )}

      {/* Сырые замеры — в самом низу: до них доходят, когда нужна не
          картина, а конкретная цифра за конкретную дату */}
      {hasRows
        ? series.map((s, i) => (
            <Section key={i} title={s.label ? 'Замеры: ' + s.label : 'Замеры'}>
              <Panel pad>
                <MeasureTable rows={s.rows} fields={fields} onMove={familyRow ? null : async (from) => {
                  // Ошиблись датой (годом) — перенести замер целиком
                  const typed = window.prompt('Правильная дата замера (ДД.ММ.ГГГГ):', formatDate(from));
                  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(String(typed || '').trim());
                  if (!typed) return;
                  if (!m) { window.alert('Дата — в виде ДД.ММ.ГГГГ, например 09.10.2026.'); return; }
                  const to = m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
                  try {
                    await apiMutate('measure.move', { ...(clientRow ? { clientRow } : {}), sheetName: measureSeries[i] && measureSeries[i].sheetName, from: String(from).slice(0, 10), to });
                    reload();
                  } catch (error) {
                    window.alert(error.message);
                  }
                }} />
              </Panel>
            </Section>
          ))
        : (
          <Section title="Замеры">
            <Panel pad>
              <Empty
                icon={IconRuler}
                text={(measurements && measurements.note)
                  || 'Замеров пока нет. Появятся, как только тренер внесёт первый.'}
              />
            </Panel>
          </Section>
        )}

      {!familyRow && <Steps clientRow={clientRow} self={self} preview={clientView} />}
      {!familyRow && <HealthWorkouts clientRow={clientRow} self={self} preview={clientView} />}
    </>
  );
}

/**
 * Форма замера.
 *
 * Раньше лист «Показатели» заполнял только тренер, а приложение его
 * показывало: человек вставал на весы дома, запоминал число и ждал
 * встречи. Половина замеров так и не доезжала.
 *
 * Пустое поле здесь значит «не мерил», а не ноль, и таких полей будет
 * большинство: обхваты снимают раз в месяц, а на весы встают чаще.
 * Поэтому ничего не обязательно, кроме одного любого значения.
 *
 * Пределы вменяемости («вес 7 кг» — это 70) проверяет сервер: они уже
 * живут в двух местах, и третья копия здесь однажды разошлась бы с
 * обеими. Отказ приходит текстом, который можно показать как есть.
 */
function MeasureForm({ fields, series, clientRow, onSaved, onCancel }) {
  // Локальный день, а не UTC: в Москве после трёх ночи toISOString отдал
  // бы вчерашнее число, и замер лёг бы не в тот день.
  const today = (() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  })();

  const [date, setDate] = useState(today);

  // Лист выбирается только у сплит-пары: там серий две, а строка клиента
  // на двоих одна, и понять, кто сейчас на весах, может только человек.
  const named = series.filter((x) => x.sheetName);
  const [sheetName, setSheetName] = useState(named.length === 1 ? named[0].sheetName : '');

  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);

  const list = (fields && fields.length ? fields : ['Вес']);
  const filled = list.filter((f) => String(values[f] || '').trim());

  const set = (name, value) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setFailure(null);
  };

  const submit = async () => {
    if (!filled.length) {
      setFailure(new Error('Введите хотя бы один показатель.'));
      return;
    }

    if (named.length > 1 && !sheetName) {
      setFailure(new Error('Выберите, чей это замер.'));
      return;
    }

    setBusy(true);
    setFailure(null);
    try {
      const payload = {};
      filled.forEach((f) => { payload[f] = String(values[f]).trim(); });

      const result = await apiMutate('measure.create', {
        ...(clientRow ? { clientRow } : {}),
        ...(sheetName ? { sheetName } : {}),
        date,
        values: payload,
      });

      onSaved(result);
    } catch (err) {
      setFailure(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel pad>
      <div className="survey">
        {named.length > 1 && (
          <div className="survey__group">
            <div className="survey__legend">Чей замер</div>
            <Segmented
              items={named.map((x) => ({ value: x.sheetName, label: x.label || x.sheetName }))}
              value={sheetName}
              onChange={setSheetName}
              label="Чей замер"
              disabled={busy}
            />
          </div>
        )}

        <div className="survey__group">
          <label className="field">
            <span className="field__label">Дата замера</span>
            <input
              className="field__input"
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
              disabled={busy}
            />
            <span className="field__hint">
              {date === today
                ? 'Сегодня. Если взвешивались раньше — поставьте тот день.'
                : 'Замер за прошедший день. Запишется этой датой.'}
            </span>
          </label>
        </div>

        <div className="survey__group">
          <div className="survey__legend">
            Показатели
            <span className="survey__legend-note">
              достаточно одного — например, только веса. Пустые поля не записываются
              и прежние значения в этой строке не трогают
            </span>
          </div>
          <div className="field-row">
            {list.map((f) => (
              <Field
                key={f}
                label={f + (f === 'Вес' ? ', кг' : ', см')}
                inputMode="decimal"
                value={values[f] || ''}
                onChange={(v) => set(f, v)}
                disabled={busy}
              />
            ))}
          </div>
        </div>
      </div>

      {failure && (
        <Note tone="critical" icon={IconAlert}>
          {failure.message || 'Не получилось записать замер'}
        </Note>
      )}

      <div className="survey__actions">
        {/* Кнопка не гаснет на незаполненной форме: погасшая кнопка не
            объясняет, чего от человека ждут, а отказ объясняет. */}
        <button className="button button--primary" onClick={submit} disabled={busy}>
          {busy ? 'Записываю…' : 'Записать'}
        </button>
        <button className="button" onClick={onCancel} disabled={busy}>Отмена</button>
      </div>
    </Panel>
  );
}

/**
 * Куда показателю полагается двигаться при выбранной цели.
 *
 * 1 — вверх, -1 — вниз, 0 — оценивать нечем. Ноль здесь не отговорка, а
 * честный ответ: выросшая рука у человека на похудении — не провал, а
 * подросшая талия на наборе массы — не то, за что стоит хвалить, и в обоих
 * случаях приложению лучше промолчать, чем назначить цвет наугад.
 *
 * «Поддержание формы» не оценивается вовсе: там любое движение в пределах
 * пары килограммов — колебание воды, а не результат.
 */
const MEASURE_AIM = {
  lose: { 'Вес': -1, 'Талия': -1 },
  gain: { 'Вес': 1, 'Грудь': 1, 'Рука': 1, 'Плечи': 1, 'Ягодицы': 1, 'Бедро': 1 },
};

function measureAim(field, goal) {
  const table = goal ? MEASURE_AIM[goal] : null;
  return (table && table[field]) || 0;
}

/**
 * Список показателей. Обычно приходит с сервера готовым — в нём и порядок,
 * и метрики, которых у клиента ещё нет. Если ответ с замерами не доехал,
 * собираем список из самих строк: ключи там в том же порядке.
 */
function measureFields(measurements, series) {
  if (measurements && measurements.fields && measurements.fields.length) return measurements.fields;

  const out = [];
  series.forEach((s) => s.rows.forEach((r) => {
    Object.keys(r).forEach((k) => {
      if (k !== 'date' && out.indexOf(k) === -1) out.push(k);
    });
  }));

  return out;
}

function MeasureTable({ rows, fields, onMove = null }) {
  if (!rows || rows.length === 0) return <Empty text="Нет записей" />;

  const used = fields.filter((f) => rows.some((r) => r[f] !== null && r[f] !== undefined));
  const recent = rows.slice().reverse();

  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th className="sticky">Дата</th>
            {used.map((f) => <th key={f} className="num">{f}</th>)}
          </tr>
        </thead>
        <tbody>
          {recent.map((r, i) => (
            <tr key={i}>
              <td className="sticky nowrap">
                {onMove
                  ? <button type="button" className="link-button" title="Исправить дату" onClick={() => onMove(r.date)}>{formatDate(r.date)}</button>
                  : formatDate(r.date)}
              </td>
              {used.map((f) => (
                <td key={f} className="num">
                  {r[f] === null || r[f] === undefined ? '—' : formatNumber(r[f])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* Карточка клиента у тренера пока разводит «Прогресс» и «Замеры» по
   разным пунктам. Псевдоним держит её сборку живой до тех пор, пока
   пункты там не сведены в один; после этого его надо убрать. */

/* ==================================================================
 * Питание
 * ================================================================== */


/**
 * Анкета питания и посчитанная по ней норма.
 *
 * Раздел до сих пор был витриной без данных, и дело не в вёрстке: норму
 * некому было посчитать. Тренер не станет считать её вручную восемнадцати
 * клиентам, а клиент не полезет в таблицу. Поэтому здесь клиент отвечает
 * на шесть вопросов о себе, а считает и записывает таблица.
 *
 * Два состояния, и оба полноценные:
 *
 * — анкеты нет: сначала короткое объяснение, зачем это, и сразу форма.
 *   Пустое состояние с одной кнопкой «заполнить» добавило бы лишнее
 *   нажатие ровно там, где человек уже готов отвечать;
 * — анкета есть: крупно норма (ради неё и приходят), под ней ответы, по
 *   которым она получена, и дата. Без ответов рядом число нечем
 *   проверить, а вес меняется каждый месяц.
 *
 * СЧИТАЕМ НЕ ЗДЕСЬ. Формула живёт в Apps Script (src/150_OpsApi.js) — там
 * же, где строка клиента. Вторая её копия во фронте однажды разошлась бы
 * с первой, причём молча. Отсюда же правило про справочники: уровни
 * активности и цели приезжают ответом сервера, а не лежат в этом файле,
 * потому что это часть той же шкалы, по которой идёт расчёт.
 *
 * Этот же экран тренер открывает в карточке клиента — тогда приезжает
 * clientRow, и анкету можно заполнить за того, кто приложением не
 * пользуется.
 */
export function Nutrition({ clientRow, clientView = false }) {
  const { loading, data, error, reload } = useData(
    'client.nutrition', clientRow ? { clientRow } : {}, [clientRow]
  );

  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(null);
  const [ration, setRation] = useState(false);
  // Проба тренера: тот же раздел, но на своём устройстве (см. Ration trial)
  const [trial, setTrial] = useState(false);

  // Рацион — экран поверх питания: смахнуть вправо возвращает к норме
  useBackGesture(() => setRation(false), ration);
  useBackGesture(() => setTrial(false), trial);

  // Тренер переключается между клиентами в одной и той же карточке, и
  // экран при этом не размонтируется. Без сброса «норма записана» осталось
  // бы висеть над анкетой следующего клиента — сообщение о чужом действии
  // на чужих цифрах.
  useEffect(() => {
    setSaved(null);
    setEditing(false);
    setRation(false);
    setTrial(false);
  }, [clientRow]);

  if (loading) return <Loading rows={3} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  // clientRow выбирает данные, но не должен сам по себе менять интерфейс:
  // в предпросмотре тренер работает с выбранным клиентом именно как клиент.
  const byTrainer = !!clientRow && !clientView;
  const configured = !!data.configured;
  const options = data.options;
  const survey = data.survey || null;
  const targets = data.targets || {};

  // Варианты нормы считает таблица и присылает готовыми. Пусто — значит
  // анкету заполнили до того, как появился выбор темпа: показываем норму
  // без переключателя, ровно как раньше, и ничего не выдумываем.
  const plans = Array.isArray(data.plans) ? data.plans : [];

  // Ответ без справочников — это либо очень старый кэш, либо развёртывание
  // Apps Script, отставшее от кода. Рисовать форму нечем: список уровней
  // активности придумывать здесь нельзя, он часть расчёта.
  if (!options || !options.activity || !options.goal) {
    return (
      <Empty
        icon={IconNutrition}
        title="Анкета недоступна"
        text={'Сервер не прислал варианты для формы.\n\nОбновите приложение или проверьте развёртывание Apps Script.'}
      />
    );
  }

  const showForm = editing || !configured;

  // Экран рациона занимает всё место: это отдельная работа в три шага, и
  // норма над ней превратилась бы в шапку, которую человек прокручивает
  // мимо. Возврат — кнопкой «К норме» внутри самого экрана.
  //
  // В режиме просмотра он не открывается совсем (см. ниже про clientView):
  // открытый, он показал бы тренеру его собственный холодильник под именем
  // клиента.
  if (ration && configured && !clientView && !byTrainer) {
    return <Deferred fallback={waiting}><Ration targets={targets} onClose={() => setRation(false)} /></Deferred>;
  }
  if (trial && configured) {
    return <Deferred fallback={waiting}><Ration targets={targets} trial onClose={() => setTrial(false)} /></Deferred>;
  }

  const onSaved = (result) => {
    setSaved(result);
    setEditing(false);
    // Перечитываем с сервера, а не правим показанное на месте: тренер
    // вправе поправить норму в таблице руками, и экран обязан показывать
    // её, а не то, что следует из формулы.
    reload();
  };

  return (
    <>
      {configured && (
        <Lead
          label="Суточная норма"
          value={formatNumber(targets.kcal) + ' ккал'}
          hint={survey && survey.goalLabel ? survey.goalLabel : undefined}
          facts={[
            { label: 'Белки', value: grams(targets.protein) },
            { label: 'Жиры', value: grams(targets.fat) },
            { label: 'Углеводы', value: grams(targets.carbs) },
          ]}
        />
      )}

      {saved && !editing && (
        <Section>
          <Note tone="good">
            Норма посчитана и сохранена
            {saved.clientName ? ' — ' + saved.clientName : ''}.
            {byTrainer ? '' : ' Тренер получил уведомление.'}
          </Note>
        </Section>
      )}

      {/* Поправки расчёта приезжают только в ответе на запись: по ним видно,
          почему получилось не ровно то, что следует из цели. Промолчать о
          них значило бы оставить человека с необъяснимым числом. */}
      {saved && !editing && saved.notes && saved.notes.length > 0 && (
        <Section>
          <Note tone="info">
            {saved.notes.map((text, i) => <div key={i}>{text}</div>)}
          </Note>
        </Section>
      )}

      {/* Выбор темпа — сразу под нормой: именно он её и определяет.
          Одного варианта не показываем: у поддержания формы темпа нет, и
          одинокая карточка притворялась бы выбором. */}
      {configured && !editing && plans.length > 1 && (
        <PaceChooser
          plans={plans}
          pace={data.pace}
          clientRow={clientRow}
          onChanged={onSaved}
        />
      )}

      {/* Рацион открывает только сам клиент. Продукты и «нравится» лежат в
          хранилище УСТРОЙСТВА, а не в таблице: это черновик, который человек
          меняет каждый день.

          Отсюда два разных случая, и путать их нельзя.

          В карточке клиента у тренера (byTrainer) раздела нет вовсе: там
          тренер работает с чужими данными, и кнопка обещала бы то, чего
          сделать не может.

          В режиме просмотра (clientView) блок показывается — тренер должен
          видеть, что у клиента здесь есть раздел, в этом и смысл режима, —
          но не открывается. Открытый, он брал бы продукты и выбор блюд с
          устройства ТРЕНЕРА и показывал их как рацион клиента: экран из
          чужой еды, посчитанный под чужую норму. */}
      {!editing && byTrainer && <RationSummary clientRow={clientRow} />}

      {configured && !editing && byTrainer && (
        <Section title="Как это видит клиент">
          <Panel pad>
            <p className="small muted" style={{ marginTop: 0 }}>
              Пройти подбор рациона самому — с нормой этого клиента. Ваши
              отметки в пробе останутся только у вас.
            </p>
            <button className="button button--block" onClick={() => { captureScreen(); setTrial(true); }}>
              Попробовать — пробный режим
            </button>
          </Panel>
        </Section>
      )}

      {configured && !editing && !byTrainer && (
        <Section>
          <Panel pad>
            <h3 style={{ margin: '0 0 6px', fontSize: 'var(--text-md)', fontWeight: 640 }}>
              Что приготовить из того, что дома
            </h3>
            <p className="small muted" style={{ marginTop: 0, marginBottom: 12 }}>
              Отметьте продукты, которые есть, — приложение подберёт блюда,
              соберёт из них день под вашу норму и покажет, что докупить.
            </p>
            {clientView ? (
              <>
                <Note tone="info">
                  Отмеченное клиентом видно в его карточке, во вкладке «Питание».
                  Пройти раздел, как клиент, можно в пробе — с его нормой и своими
                  отметками.
                </Note>
                <button className="button button--block" onClick={() => { captureScreen(); setTrial(true); }}>
                  Попробовать — пробный режим
                </button>
              </>
            ) : (
              <button className="button button--block button--primary" onClick={() => { captureScreen(); setRation(true); }}>
                Собрать рацион
              </button>
            )}
          </Panel>
        </Section>
      )}

      {configured && !editing && survey && (
        <Section title="Анкета" note="по этим ответам посчитана норма">
          <Panel>
            <Rows>
              <Row label="Возраст">
                {survey.age} {plural(survey.age, 'год', 'года', 'лет')}
              </Row>
              <Row label="Вес">{formatNumber(survey.weight)} кг</Row>
              <Row label="Рост">{formatNumber(survey.height)} см</Row>
              <Row label="Пол">{survey.sex === 'm' ? 'мужской' : 'женский'}</Row>
              {survey.lifestyle
                ? <>
                  <Row label="Образ жизни">{((survey.lifestyleLabel || '').split(':')[0] || survey.lifestyle).toLowerCase()}</Row>
                  <Row label="Тренировки">{survey.trainings} в неделю</Row>
                </>
                : <Row label="Активность">{survey.activityLabel || survey.activity}</Row>}
              <Row label="Цель">{survey.goalLabel || survey.goal}</Row>
              {survey.paceLabel && <Row label="Темп">{survey.paceLabel}</Row>}
              {data.filledAt && (
                <Row label="Заполнено">
                  {formatDate(data.filledAt)} · {relativeDays(data.filledAt)}
                </Row>
              )}
            </Rows>
          </Panel>
        </Section>
      )}

      {configured && !editing && (
        <Section>
          <Panel pad>
            <p className="small muted" style={{ marginTop: 0, marginBottom: 12 }}>
              Изменился вес или цель — заполните анкету заново, норма пересчитается.
            </p>
            <button className="button button--block" onClick={() => setEditing(true)}>
              Заполнить заново
            </button>
          </Panel>
        </Section>
      )}

      {!configured && !editing && (
        <Section>
          <Note tone="info" icon={IconNutrition}>
            {byTrainer
              ? 'Клиент ещё не заполнил анкету. Её можно заполнить за него — норма посчитается и ляжет в таблицу так же, как если бы он сделал это сам.'
              : 'Семь ответов о себе — и вы увидите суточную норму калорий и БЖУ. Тренер получит результат сразу.'}
          </Note>
        </Section>
      )}

      {showForm && (
        <Section title={configured ? 'Заполнить заново' : 'Анкета'}>
          <NutritionForm
            options={options}
            survey={survey}
            prefill={data.prefill}
            clientRow={clientRow}
            onSaved={onSaved}
            onCancel={configured ? () => setEditing(false) : null}
          />
        </Section>
      )}
    </>
  );
}

/**
 * Выбор темпа: три варианта нормы.
 *
 * До этого цель сразу означала край шкалы — «Похудение» выдавало минус
 * пятую часть расхода, самый жёсткий вариант из возможных. Человек видел
 * одно число и не догадывался, что у него есть выбор; не выдержав, он
 * бросал не темп, а питание целиком.
 *
 * Числа не считаем: они приезжают готовыми из таблицы, посчитанные тем же
 * кодом, что и сама норма. Здесь только показ и отправка выбора.
 *
 * Выбор уходит сразу по нажатию, без кнопки «Сохранить»: вариантов три,
 * выбор один, и подтверждать тут нечего. Пока запрос в пути, список
 * заблокирован целиком — иначе нетерпеливый палец отправит два выбора
 * подряд, и в таблицу ляжет тот, что ответил последним.
 */
function PaceChooser({ plans, pace, clientRow, onChanged }) {
  const [busy, setBusy] = useState(null);
  const [failure, setFailure] = useState(null);

  const choose = async (id) => {
    if (busy || id === pace) return;

    setBusy(id);
    setFailure(null);
    haptic();

    try {
      const result = await apiMutate('nutrition.pace', {
        ...(clientRow ? { clientRow } : {}),
        pace: id,
      });
      onChanged(result);
    } catch (err) {
      setFailure(err);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Section title="Темп" note="насколько быстро идём к цели">
      <div className="options" role="radiogroup" aria-label="Темп">
        {plans.map((plan) => {
          const active = plan.id === pace;

          return (
            <button
              key={plan.id}
              type="button"
              role="radio"
              aria-checked={active}
              className={'option option--pace' + (active ? ' option--active' : '')}
              onClick={() => choose(plan.id)}
              disabled={!!busy}
            >
              <span className="option__mark">{active && <IconCheck size={12} />}</span>
              <span className="option__body">
                <span className="option__top">
                  <span>{plan.label}{plan.note ? ' · ' + plan.note : ''}</span>
                  <span className="option__kcal">
                    {busy === plan.id ? '…' : formatNumber(plan.kcal) + ' ккал'}
                  </span>
                </span>
                {plan.hint && <span className="option__hint">{plan.hint}</span>}
                <span className="option__macros">Б {plan.protein} · Ж {plan.fat} · У {plan.carbs} г</span>
              </span>
            </button>
          );
        })}
      </div>

      {failure && (
        <Note tone="critical" icon={IconAlert}>
          {failure.message || 'Не получилось сменить темп'}
        </Note>
      )}
    </Section>
  );
}

/** Прежний ответ, иначе подсказка, иначе пусто — всё строкой для поля */
function pick(saved, hint) {
  if (saved !== null && saved !== undefined && saved !== '') return String(saved);
  if (hint !== null && hint !== undefined && hint !== '') return String(hint);
  return '';
}

/** «169 г» — единица прижата к числу: иначе ряд фактов читается как
 *  список голых чисел, и белки от углеводов отличает только подпись */
function grams(value) {
  return value === null || value === undefined ? '—' : formatNumber(value) + ' г';
}

/**
 * Форма анкеты.
 *
 * Проверка здесь — вежливость, а не защита: сервер и Apps Script проверяют
 * то же самое у себя, и окончательный отказ всегда их. Смысл местной
 * проверки в том, чтобы про «рост 1,75» человек узнал сразу, а не через
 * несколько секунд ожидания Apps Script, и чтобы мусор не уезжал в таблицу
 * вовсе.
 *
 * Границы полей берём из ответа сервера (options.limits), а не пишем
 * числами здесь: разойдись они — форма начнёт обещать то, чего сервер не
 * примет. Границ в ответе нет — местная проверка их просто не делает, и
 * последнее слово остаётся за сервером.
 */
/** Запасной список, если сервер старый и не прислал его */
const LIFESTYLES = [
  { value: 'desk', label: 'Сидячий: работа за столом, на машине', factor: 1.2 },
  { value: 'feet', label: 'Подвижный: работа стоя, много хожу пешком', factor: 1.35 },
  { value: 'labor', label: 'Физический труд: стройка, склад, доставка', factor: 1.5 },
];

/**
 * Ключ прежней шкалы активности, ближайший по множителю. Нужен запасному
 * адресу: Apps Script проверяет анкету по старой шкале. Сервер считает
 * сам и этот ключ не использует.
 */
function legacyActivity(options, form) {
  const base = ((options.lifestyles || LIFESTYLES).find((l) => l.value === form.lifestyle) || LIFESTYLES[0]).factor;
  const factor = base + Number(form.trainings || 0) * (options.trainingStep || 0.05);
  const levels = options.activity || [];
  let best = levels[0];
  levels.forEach((l) => { if (Math.abs(l.factor - factor) < Math.abs(best.factor - factor)) best = l; });
  return best ? best.value : 'light';
}

function NutritionForm({ options, survey, prefill, clientRow, onSaved, onCancel }) {
  // Прежние ответы важнее подсказок: если анкету уже заполняли, форма
  // открывается ровно тем, что человек вписал сам. Подсказки — из
  // профиля и последнего замера — подставляются только в пустые поля,
  // чтобы не переспрашивать то, что приложение и так знает.
  const [form, setForm] = useState(() => ({
    age: pick(survey && survey.age, prefill && prefill.age),
    weight: pick(survey && survey.weight, prefill && prefill.weight),
    height: pick(survey && survey.height, prefill && prefill.height),
    sex: (survey && survey.sex) || (prefill && prefill.sex) || '',
    // Активность — двумя вопросами: чем занят день и сколько тренировок
    lifestyle: (survey && survey.lifestyle) || '',
    trainings: survey && survey.trainings !== undefined && survey.trainings !== null ? String(survey.trainings) : '',
    goal: (survey && survey.goal) || '',
  }));

  // Чего нет ни там, ни там, остаётся пустым: выдумать возраст или вес
  // нельзя, а подставленное наугад человек не перепроверит.
  // Что подставлено из профиля и замера — при открытии, а не «что сейчас
  // заполнено»: иначе пол, выбранный самим человеком, тоже объявлялся
  // «заполненным за вас», а пустые поля рядом выглядели готовыми
  const [filled] = useState(() => ['age', 'weight', 'height', 'sex']
    .filter((field) => !(survey && survey[field]) && pick(null, prefill && prefill[field]) !== ''));

  const [errors, setErrors] = useState({});
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);

  const inputs = useRef({});
  const limits = options.limits || {};

  // До первой попытки отправить молчим: подчёркивать красным поле, в
  // которое человек ещё не дописал, — значит ругаться на него за то, что
  // он печатает. После неё, наоборот, пересчитываем на каждый знак: он
  // уже знает про ошибку и сейчас её чинит.
  const set = (field, value) => {
    const next = { ...form, [field]: value };
    setForm(next);
    if (attempted) setErrors(validateSurvey(next, limits));
    setFailure(null);
  };

  const submit = async () => {
    const found = validateSurvey(form, limits);

    setAttempted(true);
    setErrors(found);
    setFailure(null);

    const bad = Object.keys(found);
    if (bad.length) {
      // Ошибка может оказаться выше края экрана — уводим к ней сами,
      // иначе нажатие выглядит как «кнопка не работает»
      const node = inputs.current[bad[0]];
      if (node && node.focus) node.focus();
      return;
    }

    setBusy(true);
    try {
      const result = await apiMutate('nutrition.save', {
        ...(clientRow ? { clientRow } : {}),
        age: form.age,
        weight: form.weight,
        height: form.height,
        sex: form.sex,
        lifestyle: form.lifestyle,
        trainings: Number(form.trainings),
        // Ключ прежней шкалы — для запасного адреса (Apps Script) и листа
        activity: legacyActivity(options, form),
        goal: form.goal,
      });
      onSaved(result);
    } catch (err) {
      setFailure(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel pad>
      <div className="survey">
        {/* Откуда взялись числа — человек должен понимать сразу. Молча
            подставленный вес выглядит как чужой, и первое, что с ним
            делают, — стирают и вписывают заново. */}
        {filled.length > 0 && (
          <p className="small muted survey__prefill">
            {filled.includes('weight')
              ? 'Заполнили за вас: из профиля и последнего замера. Проверьте и поправьте, если что-то изменилось.'
              : 'Заполнили за вас из профиля. Проверьте и поправьте, если что-то изменилось.'}
          </p>
        )}

        <div className="survey__group">
          <div className="field-row">
            <Field
              label="Возраст, лет"
              placeholder="лет"
              value={form.age}
              onChange={(v) => set('age', v)}
              error={errors.age}
              disabled={busy}
              inputRef={(el) => { inputs.current.age = el; }}
            />
            <Field
              label="Вес, кг"
              placeholder="кг"
              inputMode="decimal"
              value={form.weight}
              onChange={(v) => set('weight', v)}
              error={errors.weight}
              disabled={busy}
              inputRef={(el) => { inputs.current.weight = el; }}
            />
            <Field
              label="Рост, см"
              placeholder="см"
              value={form.height}
              onChange={(v) => set('height', v)}
              error={errors.height}
              disabled={busy}
              inputRef={(el) => { inputs.current.height = el; }}
            />
          </div>
        </div>

        <div className="survey__group">
          <div className="survey__legend">
            Пол
            <span className="survey__legend-note">
              без него основной обмен не считается
            </span>
          </div>
          <Segmented
            items={options.sexes || []}
            value={form.sex}
            onChange={(v) => set('sex', v)}
            label="Пол"
            disabled={busy}
          />
          {errors.sex && <span className="field__error">{errors.sex}</span>}
        </div>

        <div className="survey__group">
          <div className="survey__legend">
            Образ жизни
            <span className="survey__legend-note">без тренировок: работа, дорога, быт</span>
          </div>
          <Options
            items={options.lifestyles || LIFESTYLES}
            value={form.lifestyle}
            onChange={(v) => set('lifestyle', v)}
            label="Образ жизни"
            disabled={busy}
          />
          {errors.lifestyle && <span className="field__error">{errors.lifestyle}</span>}
        </div>

        <div className="survey__group">
          <div className="survey__legend">
            Тренировок в неделю
            <span className="survey__legend-note">все: с тренером, сами, бассейн, бег</span>
          </div>
          <div className="chips survey__trainings" role="radiogroup" aria-label="Тренировок в неделю">
            {['0', '1', '2', '3', '4', '5', '6', '7'].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={form.trainings === n} className={'chip' + (form.trainings === n ? ' chip--active' : '')} disabled={busy} onClick={() => set('trainings', n)}>{n}</button>
            ))}
          </div>
          {errors.trainings && <span className="field__error">{errors.trainings}</span>}
        </div>

        <div className="survey__group">
          <div className="survey__legend">Цель</div>
          <Options
            items={options.goal}
            value={form.goal}
            onChange={(v) => set('goal', v)}
            label="Цель"
            disabled={busy}
          />
          {errors.goal && <span className="field__error">{errors.goal}</span>}
        </div>

        {/* Отказ сервера показываем его же словами: он называет и поле, и
            что с ним не так. Переписывать это здесь значило бы завести
            второй словарь ошибок, который однажды отстанет от первого. */}
        {failure && <Note tone="critical">{failure.message}</Note>}

        <div className="survey__actions">
          <button
            className="button button--primary button--block"
            onClick={submit}
            disabled={busy}
          >
            {busy ? 'Считаем…' : 'Посчитать норму'}
          </button>

          {onCancel && (
            <button className="button button--block" onClick={onCancel} disabled={busy}>
              Отмена
            </button>
          )}
        </div>
      </div>
    </Panel>
  );
}

/**
 * Проверка анкеты до отправки.
 *
 * Повторяет серверную (server/src/lib/nutrition.js) по существу, но не
 * дословно: под полем на телефоне помещается строка, а не предложение.
 * Совпадать обязано то, ЧТО отклоняется, а не какими словами.
 */
function validateSurvey(form, limits) {
  const found = {};

  const age = parseField(form.age);
  if (age === null) found.age = 'Укажите возраст';
  else if (Number.isNaN(age) || age <= 0) found.age = 'Нужно число';
  else if (outOfRange(age, limits.age)) found.age = range(limits.age, 'лет');

  const weight = parseField(form.weight);
  if (weight === null) found.weight = 'Укажите вес';
  else if (Number.isNaN(weight) || weight <= 0) found.weight = 'Нужно число';
  else if (outOfRange(weight, limits.weight)) found.weight = range(limits.weight, 'кг');

  const height = parseField(form.height);
  if (height === null) found.height = 'Укажите рост';
  else if (Number.isNaN(height) || height <= 0) found.height = 'Нужно число';
  // Самая частая опечатка формы: в телефоне привычнее «1,75». Молча
  // умножать на сто нельзя — подмена однажды угадает неправильно, а
  // перепроверять посчитанную норму никто не станет.
  else if (height > 1.2 && height < 2.3) found.height = 'В сантиметрах: 175, а не 1,75';
  else if (outOfRange(height, limits.height)) found.height = range(limits.height, 'см');

  if (!form.sex) found.sex = 'Выберите пол';
  if (!form.lifestyle) found.lifestyle = 'Выберите образ жизни';
  if (form.trainings === '') found.trainings = 'Выберите, сколько тренировок в неделю';
  if (!form.goal) found.goal = 'Выберите цель';

  return found;
}

/** null — пусто, NaN — не число, иначе само число. Запятая как у сервера */
function parseField(raw) {
  const s = String(raw === undefined || raw === null ? '' : raw).replace(',', '.').trim();
  if (!s) return null;
  return Number(s);
}

function outOfRange(value, limit) {
  if (!limit || limit.min === undefined || limit.max === undefined) return false;
  return value < limit.min || value > limit.max;
}

function range(limit, unit) {
  return 'От ' + limit.min + ' до ' + limit.max + ' ' + unit;
}
