import React, { useState } from 'react';
import { useData } from '../useData.js';
import { apiMutate } from '../api.js';
import { Section, Panel, Segmented, formatNumber, plural } from '../ui.jsx';
import { IconCheck, IconChevron } from '../icons.jsx';
import { haptic } from '../telegram.js';
import { goalDots, dotsLabel, daysLeft } from './goal-dots.js';
import './goals.css';

/**
 * Цели, серии и награды — первым блоком «Прогресса» (07.10.2026, FT-490).
 *
 * Считает всё сервер (server/src/lib/awards.js) из того, что уже есть:
 * журнала, календаря тренера, часов, шагов и замеров. Здесь — только показ
 * и правка двух чисел цели.
 *
 * Неделя, месяц, год — точками (план трёх разборов, пункт 4, 21.10.2026;
 * до этого кольцами): каждая тренировка — точка, и «иду ли я по плану»
 * видно до чтения цифр — сколько сделано, сколько пропущено, сколько
 * впереди. Пропущено — сколько по плану должно было набраться к сегодня
 * (due с сервера) минус сделанное. Анимации заполнения при открытии нет
 * намеренно: «Прогресс» открывают каждый день.
 *
 * Награды свёрнуты в одну строку «Награды · 4 из 14»: список из полутора
 * десятков вех на каждом заходе отодвигал бы замеры, ради которых экран
 * открывают. Раскрыть — одно нажатие, на месте, без отдельного окна.
 *
 * Цель — и тренировок в неделю, и шагов в день — ставит только тренер
 * (владелец, 08.10.2026); у клиента «Изменить» нет. Новая цель действует с
 * недели, в которую поставлена: прошлые недели сервер меряет прежней
 * (client_goal_history), выполненные не проваливаются задним числом.
 */

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const MONTHS_OF = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const STEP_CHOICES = [5000, 6000, 7000, 8000, 10000, 12000, 15000];

function parts(day) {
  const [y, m, d] = String(day).split('-').map(Number);
  return { y, m, d };
}

/** «5 октября» */
function dayMonth(day) {
  const { m, d } = parts(day);
  return d + ' ' + MONTHS_OF[m - 1];
}

/** «21–27 сентября» или «29 сентября – 5 октября» */
function weekRange(monday) {
  const end = new Date(monday + 'T00:00:00Z');
  end.setUTCDate(end.getUTCDate() + 6);
  const sunday = end.toISOString().slice(0, 10);
  const a = parts(monday);
  const b = parts(sunday);
  return a.m === b.m ? a.d + '–' + dayMonth(sunday) : dayMonth(monday) + ' – ' + dayMonth(sunday);
}

const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const trainings = (n) => n + ' ' + plural(n, 'тренировка', 'тренировки', 'тренировок');

const weeksOf = (n) => n + ' ' + plural(n, 'неделя', 'недели', 'недель');

/** «Осталось 3 тренировки за 11 дней»; дней не осталось — без срока */
function leftText(left, days) {
  return plural(left, 'Осталась', 'Осталось', 'Осталось') + ' ' + trainings(left)
    + (days > 0 ? ' за ' + days + ' ' + plural(days, 'день', 'дня', 'дней') : '');
}

/** Серия под целью месяца: «серия 4 недели, лучшая 7» */
function seriesText(streak) {
  if (streak.weeks > 0) return 'серия ' + weeksOf(streak.weeks) + (streak.best > streak.weeks ? ', лучшая ' + streak.best : '');
  return streak.best > 0 ? 'лучшая серия — ' + weeksOf(streak.best) : '';
}

/**
 * Карточка периода: название, «6 из 9» и точки. Ряд точек читается с
 * экрана одной фразой (role="img"), поэтому число в шапке для него скрыто.
 * Пропуски, кроме цвета, названы словами под точками: по одному цвету
 * сделанное от пропущенного отличают не все. Цели нет — только число.
 */
function GoalCard({ title, layout, grid = false, children }) {
  const has = layout.target > 0;
  const full = has && layout.done >= layout.target;
  return (
    <Panel pad className="goal-card">
      <div className="goal-card__head">
        <h3 className="goal-card__title">{title}</h3>
        <span className={'goal-card__count' + (full ? ' goal-card__count--done' : '')} aria-hidden={has || undefined}>
          {has ? formatNumber(layout.done) + ' из ' + formatNumber(layout.target) : trainings(layout.done)}
        </span>
      </div>
      {has && (
        <div
          className={'goal-dots' + (grid ? ' goal-dots--grid' + (layout.columns > 13 ? ' goal-dots--dense' : '') : '')}
          style={grid ? { '--goal-cols': layout.columns } : undefined}
          role="img"
          aria-label={dotsLabel(layout)}
        >
          {layout.dots.map((kind, i) => <span key={i} className={'goal-dot goal-dot--' + kind} />)}
        </div>
      )}
      {has ? children : <p className="goal-card__foot">Цели на этот период нет</p>}
    </Panel>
  );
}

function streakLine(streak, goal) {
  if (streak.weeks > 0) {
    const left = goal.week - streak.thisWeek;
    return {
      main: streak.weeks + ' ' + plural(streak.weeks, 'неделя', 'недели', 'недель') + ' подряд с выполненной целью',
      hint: left > 0
        ? 'На этой неделе ещё ' + trainings(left) + ', чтобы серия продолжилась'
        : streak.best > streak.weeks ? 'Лучшая серия — ' + streak.best + ' ' + plural(streak.best, 'неделя', 'недели', 'недель') : 'Цель этой недели выполнена',
    };
  }
  if (streak.broke) {
    return {
      main: 'Серия прервалась',
      hint: weekRange(streak.broke.week) + ': ' + streak.broke.done + ' из ' + goal.week
        + ' — после ' + streak.broke.after + ' ' + plural(streak.broke.after, 'недели', 'недель', 'недель') + ' подряд',
      warn: true,
    };
  }
  return { main: 'Серии пока нет', hint: 'Выполните цель недели — начнётся серия' };
}

function stepsLine(steps) {
  if (!steps) return null;
  const norm = formatNumber(steps.goal) + ' шагов';
  if (steps.days > 0) {
    return {
      main: steps.days + ' ' + plural(steps.days, 'день', 'дня', 'дней') + ' подряд с нормой ' + norm,
      hint: steps.frozen ? 'Один пропуск на этой неделе прощён — следующий прервёт серию' : 'Сегодня ' + formatNumber(steps.today),
    };
  }
  return { main: 'Норма — ' + norm + ' в день', hint: 'Сегодня ' + formatNumber(steps.today) };
}

// Цели ставит только тренер (владелец, 08.10.2026)
function whoSet(goal, viewer) {
  // self — график из анкеты подбора программы у клиента без тренера (FT-577)
  if (viewer === 'trainer') return goal.setBy === 'trainer' ? 'цель поставили вы' : goal.setBy === 'self' ? 'цель из анкеты клиента — можно поменять' : 'цель по умолчанию — поставьте клиенту';
  return goal.setBy === 'trainer' ? 'цель поставил тренер' : goal.setBy === 'self' ? 'по вашему графику из анкеты' : 'цель по умолчанию — её поставит тренер';
}

function GoalForm({ goal, clientRow, onDone }) {
  const [week, setWeek] = useState(goal.week);
  const [steps, setSteps] = useState(goal.steps);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const choices = STEP_CHOICES.includes(goal.steps) ? STEP_CHOICES : [...STEP_CHOICES, goal.steps].sort((a, b) => a - b);

  const save = async () => {
    setBusy(true);
    setProblem('');
    try {
      await apiMutate('client.goals.save', { ...(clientRow ? { clientRow } : {}), week, steps });
      haptic();
      onDone();
    } catch (e) {
      setProblem(e.message || 'Не получилось сохранить.');
      setBusy(false);
    }
  };

  return (
    <div className="goal-form">
      <div className="goal-form__field">
        <div className="goal-form__label">Тренировок в неделю</div>
        <Segmented
          label="Тренировок в неделю"
          items={[1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: n, label: String(n) }))}
          value={week}
          onChange={setWeek}
          disabled={busy}
        />
      </div>
      <div className="goal-form__field">
        <div className="goal-form__label">Шагов в день</div>
        <Segmented
          label="Шагов в день"
          items={choices.map((n) => ({ value: n, label: formatNumber(n) }))}
          value={steps}
          onChange={setSteps}
          disabled={busy}
          wrap
        />
      </div>
      <p className="small muted">
        Новая цель действует с этой недели, прошлые недели считаются по прежней — выполненные
        остаются выполненными. Цель месяца и года считается из недельной. Тренировка — день, когда
        было занятие с тренером, по программе в приложении или с часов от 20 минут.
      </p>
      {problem && <p className="small goal-form__problem" role="alert">{problem}</p>}
      <div className="goal-form__actions">
        <button className="button button--primary" onClick={save} disabled={busy}>{busy ? 'Сохраняю…' : 'Сохранить'}</button>
        <button className="button" onClick={onDone} disabled={busy}>Отмена</button>
      </div>
    </div>
  );
}

function AwardList({ awards }) {
  return (
    <ul className="awards">
      {awards.map((a) => (
        <li key={a.id} className={'award' + (a.got ? ' award--got' : '')}>
          <span className="award__mark" aria-hidden="true">{a.got && <IconCheck size={14} />}</span>
          <span className="award__body">
            <span className="award__title">{a.title}</span>
            <span className="award__note">{a.note}</span>
          </span>
          <span className="award__state">
            {a.got ? dayMonth(a.got) : formatNumber(a.done) + ' из ' + formatNumber(a.need)}
          </span>
        </li>
      ))}
    </ul>
  );
}

// preview — тренер смотрит «глазами клиента»: всё видно, править нельзя
export default function Goals({ clientRow, preview = false }) {
  const { data } = useData('client.awards', clientRow ? { clientRow } : {}, [clientRow]);
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);

  // Блок не главный на экране: пока едет или не доехал — его просто нет,
  // замеры и шаги ниже от него не зависят
  if (!data) return null;

  // Кто смотрит: тренер в карточке клиента или в «Моих тренировках» — тренер;
  // клиент и «глазами клиента» — клиент
  const viewer = clientRow && !preview ? 'trainer' : 'client';
  const monthName = capital(MONTHS[parts(data.today).m - 1]);
  const ring = (id) => data.rings.find((r) => r.id === id) || { done: 0, target: 0 };
  // Неделя — без пропусков: она ещё идёт, а что на ней недобрано, говорит
  // строка серии ниже
  const week = goalDots(ring('week'), { withMissed: false });
  const month = goalDots(ring('month'));
  const year = goalDots(ring('year'));
  const trainedToday = !!data.trainings && data.trainings.last === data.today;
  const series = seriesText(data.streak);
  const streak = streakLine(data.streak, data.goal);
  const steps = stepsLine(data.steps);
  const lines = [streak, steps].filter(Boolean);
  // Полученные — первыми, свежие сверху: открывают список, чтобы
  // посмотреть, что уже есть; до чего дальше всего — в конце
  const sorted = [...data.awards].sort((a, b) => {
    if (a.got && b.got) return b.got.localeCompare(a.got);
    if (a.got || b.got) return a.got ? -1 : 1;
    return (b.done / b.need) - (a.done / a.need);
  });

  return (
    <Section
      title="Цели"
      note={whoSet(data.goal, viewer)}
      action={!editing && viewer === 'trainer' && (
        <button className="button button--ghost button--small" onClick={() => setEditing(true)}>Изменить</button>
      )}
    >
      <div className="goals">
        {editing ? (
          <Panel pad>
            <GoalForm goal={data.goal} clientRow={clientRow} onDone={() => setEditing(false)} />
          </Panel>
        ) : (
          <>
            <GoalCard title="Неделя" layout={week}>
              <p className="goal-card__foot">
                {week.done >= week.target
                  ? <span className="goal-card__ok">Цель недели выполнена</span>
                  : leftText(week.target - week.done, daysLeft(data.today, 'week', trainedToday))}
              </p>
            </GoalCard>
            <GoalCard title={monthName} layout={month}>
              <p className="goal-card__foot">
                {month.done >= month.target
                  ? <span className="goal-card__ok">Цель месяца выполнена</span>
                  : leftText(month.target - month.done, daysLeft(data.today, 'month', trainedToday))}
                {month.missed > 0 && <> · <span className="goal-card__missed">пропущено {month.missed}</span></>}
                {series && ' · ' + series}
              </p>
            </GoalCard>
            <GoalCard title={(ring('year').label || parts(data.today).y) + ' год'} layout={year} grid>
              <ul className="goal-legend">
                <li><span className="goal-dot goal-dot--done" aria-hidden="true" />сделано {formatNumber(year.done)}</li>
                <li><span className="goal-dot goal-dot--missed" aria-hidden="true" />пропущено {formatNumber(year.missed)}</li>
                <li><span className="goal-dot goal-dot--ahead" aria-hidden="true" />впереди {formatNumber(year.ahead)}</li>
              </ul>
              {year.per > 1 && <p className="goal-card__foot">Одна точка — {trainings(year.per)}</p>}
            </GoalCard>
            <Panel pad>
              <div className="goals__lines">
                {lines.map((l, i) => (
                  <div key={i} className={'goals__line' + (l.warn ? ' goals__line--warn' : '')}>
                    <div className="goals__main">{l.main}</div>
                    <div className="goals__hint">{l.hint}</div>
                  </div>
                ))}
              </div>
              <button
                className="goals__toggle"
                aria-expanded={open}
                onClick={() => { setOpen(!open); haptic(); }}
              >
                <span>Награды</span>
                <span className="goals__count">{data.got} из {data.awards.length}</span>
                <IconChevron size={18} className={'goals__chevron' + (open ? ' goals__chevron--open' : '')} />
              </button>
              {open && <AwardList awards={sorted} />}
            </Panel>
          </>
        )}
      </div>
    </Section>
  );
}
