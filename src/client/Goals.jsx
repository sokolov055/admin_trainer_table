import React, { useState } from 'react';
import { useData } from '../useData.js';
import { apiMutate } from '../api.js';
import { Section, Panel, Segmented, formatNumber, plural } from '../ui.jsx';
import { IconCheck, IconChevron } from '../icons.jsx';
import { haptic } from '../telegram.js';

/**
 * Цели, серии и награды — первым блоком «Прогресса» (07.10.2026, FT-490).
 *
 * Считает всё сервер (server/src/lib/awards.js) из того, что уже есть:
 * журнала, календаря тренера, часов, шагов и замеров. Здесь — только показ
 * и правка двух чисел цели.
 *
 * Кольца — неделя, месяц, год: ответ на «я сейчас иду по плану или нет»
 * виден до чтения цифр. Анимации заполнения при открытии нет намеренно:
 * «Прогресс» открывают каждый день, и кольцо, которое каждый раз
 * заполняется заново, через неделю раздражает. Плавно меняется только то,
 * что поменялось на глазах — после правки цели.
 *
 * Награды свёрнуты в одну строку «Награды · 4 из 14»: список из полутора
 * десятков вех на каждом заходе отодвигал бы замеры, ради которых экран
 * открывают. Раскрыть — одно нажатие, на месте, без отдельного окна.
 *
 * Цель ставят и клиент, и тренер: кто поставил последним, подписано под
 * заголовком — иначе клиент не поймёт, почему «его» цель вдруг стала 3.
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

/**
 * Кольцо цели. Центр — сколько сделано, под ним — из скольких: число
 * крупно, потому что его и ищут глазами. Выполненное кольцо — сплошное
 * насыщенное, чтобы три кольца читались одним взглядом.
 */
function Ring({ label, done, target }) {
  const r = 26;
  const length = 2 * Math.PI * r;
  const share = target > 0 ? Math.min(done / target, 1) : 0;
  const full = done >= target;
  return (
    <div className={'goal-ring' + (full ? ' goal-ring--done' : '')} role="img" aria-label={label + ': ' + done + ' из ' + target}>
      <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
        <circle className="goal-ring__track" cx="32" cy="32" r={r} />
        <circle
          className="goal-ring__fill"
          cx="32" cy="32" r={r}
          strokeDasharray={length}
          strokeDashoffset={length * (1 - share)}
          transform="rotate(-90 32 32)"
        />
      </svg>
      <div className="goal-ring__value" aria-hidden="true">
        <span className="goal-ring__done">{formatNumber(done)}</span>
        <span className="goal-ring__target">из {formatNumber(target)}</span>
      </div>
      <div className="goal-ring__label" aria-hidden="true">{label}</div>
    </div>
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

function whoSet(goal, viewer) {
  if (!goal.setBy) return viewer === 'trainer' ? 'цель по умолчанию' : 'цель по умолчанию — поменяйте под себя';
  if (goal.setBy === viewer) return 'цель поставили вы';
  return goal.setBy === 'trainer' ? 'цель поставил тренер' : 'цель поставил клиент';
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
        Цель месяца и года считается из недельной. Тренировка — день, когда было занятие с тренером,
        по программе в приложении или с часов от 20 минут.
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
  const rings = data.rings.map((r) => (r.id === 'month' ? { ...r, label: monthName } : r));
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
      action={!editing && !preview && (
        <button className="button button--ghost button--small" onClick={() => setEditing(true)}>Изменить</button>
      )}
    >
      <Panel pad className="goals">
        {editing ? (
          <GoalForm goal={data.goal} clientRow={clientRow} onDone={() => setEditing(false)} />
        ) : (
          <>
            <div className="goals__rings">
              {rings.map((r) => <Ring key={r.id} {...r} />)}
            </div>
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
          </>
        )}
      </Panel>
    </Section>
  );
}
