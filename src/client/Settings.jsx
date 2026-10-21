import React, { useEffect, useState } from 'react';
import { Panel, Segmented, Field, formatNumber, formatWhen } from '../ui.jsx';
import { IconCopy, IconCheck, IconExternal } from '../icons.jsx';
import { haptic } from '../telegram.js';
import { useData } from '../useData.js';
import { isNativeApp, plugin, screensNote } from '../native-bridge.js';
import { APP_VERSION } from '../version.js';
import { copyText } from '../access.js';
import { accountState } from '../trainer-link.js';
import {
  stepsAvailability, stepsConnected, stepsOn, connectSteps, openHealthSettings, healthHub, onIphone,
  workoutsAvailable, workoutsOn, connectWorkouts, reportDevice,
} from '../native-steps.js';
import { ensureBackgroundSync } from '../native-sync.js';
import { notifyPermission, askNotifyPermission } from '../native-rest.js';
import { openPhoneSettings, canRateInStore, openStorePage, deviceInfo } from '../native-review.js';
import { readReminders, saveReminders, syncReminders, remindersAvailable } from '../native-reminders.js';
import { WEEKDAYS_SHORT, reminderNote, validTime } from '../reminders-model.js';
import './settings.css';

/**
 * «Подключения», «Напоминания» и «Поддержка» в «Настройках» клиента (план
 * трёх разборов, пункт 14 и пункт 6, 21.10.2026; макет Settings.dc.html).
 *
 * Подключения — только состояние того, что уже есть на телефоне: откуда
 * шаги, приходят ли тренировки с часов, разрешены ли уведомления. Новых
 * разрешений не просим без объяснения: «Подключить» и «Разрешить» — по
 * нажатию, под строками сказано, что берём.
 *
 * Напоминания ставит сам телефон (native-reminders.js), расписание — только
 * на нём. В браузере раздел виден, переключатели неактивны.
 *
 * Режим «глазами клиента» сюда не заходит: телефон там тренерский, и его
 * состояние выдавалось бы за клиентское (ClientApp.jsx показывает описание).
 */

/* ==========================================================================
 * Подключения
 * ========================================================================== */

async function readConnections() {
  const avail = await stepsAvailability().catch(() => ({ available: false, reason: 'app' }));
  const connected = avail.available && stepsOn() && await stepsConnected().catch(() => false);
  const steps = !avail.available ? (avail.reason === 'app' ? 'app' : 'none') : connected ? 'on' : 'off';
  const workouts = !avail.available ? steps : !workoutsAvailable() ? 'app' : workoutsOn() ? 'on' : 'off';
  let watch = false;
  if (onIphone()) {
    try {
      const p = plugin('WorkoutActivity');
      const st = p && p.watchStatus ? await p.watchStatus() : null;
      watch = !!(st && st.paired && st.installed);
    } catch (_) { /* старая сборка — без часов */ }
  }
  return { steps, workouts, watch, notify: await notifyPermission(), hub: healthHub() };
}

/** Перечитать, когда вернулись из настроек телефона или «Здоровья» */
function useOnReturn(fn) {
  useEffect(() => {
    const back = () => { if (document.visibilityState === 'visible') fn(); };
    document.addEventListener('visibilitychange', back);
    return () => document.removeEventListener('visibilitychange', back);
  }, []);
}

function TodaySteps() {
  // Тот же запрос, что у блока «Шаги» в «Прогрессе» — один кэш на двоих
  const { data } = useData('steps.list', { days: 14 }, []);
  const rows = (data && data.days) || [];
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const member = rows.length ? rows[0].member : '';
  const row = rows.find((r) => r.date === today && r.member === member);
  return row && row.steps > 0 ? <>, сегодня {formatNumber(row.steps)}</> : null;
}

function ConnRow({ title, note, tone, children }) {
  return (
    <div className="conn-row">
      <div className="conn-row__main">
        <span className="conn-row__title">{title}</span>
        <span className={'conn-row__note' + (tone ? ' conn-row__note--' + tone : '')}>{note}</span>
      </div>
      {children}
    </div>
  );
}

export function Connections() {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState('');
  const load = () => readConnections().then(setState).catch(() => setState(null));
  useEffect(() => { if (isNativeApp()) load(); }, []);
  useOnReturn(() => { if (isNativeApp()) load(); });

  if (!isNativeApp()) {
    return (
      <>
        <Panel>
          <ConnRow title="Шаги и тренировки с часов" note="Только в приложении для iPhone и Android" />
        </Panel>
        <p className="conn-caption">Шаги считает телефон или часы, мы берём только суммы по дням.</p>
      </>
    );
  }
  if (!state) return <Panel><ConnRow title="Шаги" note="Проверяем…" /></Panel>;

  const run = async (what, action) => {
    setBusy(what);
    setProblem('');
    try {
      const res = await action();
      if (res && res.ok === false && res.reason) setProblem(res.reason);
    } catch (e) {
      setProblem(e.message || 'Не получилось.');
    } finally {
      setBusy('');
      load();
    }
  };
  const connect = () => run('steps', async () => {
    const res = await connectSteps();
    // Android: ключ фоновой задаче — дальше шаги уходят и без приложения
    if (res.ok) ensureBackgroundSync().catch(() => {});
    reportDevice(true);
    return res;
  });
  const missing = (s) => (s === 'app' ? 'Нет — обновите приложение' : onIphone() ? 'Нет — на этом устройстве нет «Здоровья»' : 'Нет — на телефоне нет Health Connect');
  const hub = state.hub;

  return (
    <>
      <Panel>
        <ConnRow title="Шаги" tone={state.steps === 'on' ? 'good' : ''}
          note={state.steps === 'on' ? <>{hub} · подключено<TodaySteps /></> : state.steps === 'off' ? 'Не подключено' : missing(state.steps)}>
          {state.steps === 'off' && <button type="button" className="button conn-row__action" disabled={!!busy} onClick={connect}>{busy === 'steps' ? 'Подключаю…' : 'Подключить'}</button>}
          {state.steps === 'on' && <button type="button" className="button conn-row__action" onClick={() => openHealthSettings().catch(() => {})}>Настроить</button>}
        </ConnRow>
        <ConnRow title="Тренировки с часов" tone={state.workouts === 'on' ? 'good' : ''}
          note={state.workouts === 'on' ? hub + ' · подключено' + (state.watch ? ' · Apple Watch' : '') : state.workouts === 'off' ? 'Не подключено' : missing(state.workouts)}>
          {state.workouts === 'off' && <button type="button" className="button conn-row__action" disabled={!!busy} onClick={() => run('workouts', connectWorkouts)}>{busy === 'workouts' ? 'Подключаю…' : 'Подключить'}</button>}
        </ConnRow>
        <ConnRow title="Уведомления в системе"
          tone={state.notify === 'granted' ? 'good' : state.notify === 'denied' ? 'bad' : ''}
          note={state.notify === 'granted' ? 'Разрешены' : state.notify === 'denied' ? 'Выключены в настройках телефона' : state.notify === 'prompt' ? 'Ещё не разрешены' : 'Нет — обновите приложение'}>
          {state.notify === 'prompt' && <button type="button" className="button conn-row__action" disabled={!!busy} onClick={() => run('notify', askNotifyPermission)}>Разрешить</button>}
        </ConnRow>
        {state.notify === 'denied' && (
          <div className="conn-row conn-row--wide">
            <button type="button" className="button button--block" onClick={() => openPhoneSettings('notifications')}>Открыть настройки телефона</button>
          </div>
        )}
      </Panel>
      {problem && <p className="conn-caption conn-caption--bad" role="status">{problem}</p>}
      <p className="conn-caption">
        Шаги считает телефон или часы, мы берём только суммы по дням. Уведомления нужны для напоминаний ниже и сигнала конца отдыха.
      </p>
    </>
  );
}

/* ==========================================================================
 * Напоминания
 * ========================================================================== */

/** Переключатель: чекбокс с ролью switch, цель касания — весь квадрат 44 px */
function Switch({ checked, onChange, label, disabled }) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} aria-label={label}
        onChange={(e) => onChange(e.target.checked)} />
      <span className="switch__track" aria-hidden="true" />
    </label>
  );
}

const WEEK = [1, 2, 3, 4, 5, 6, 0].map((d) => ({ value: d, label: WEEKDAYS_SHORT[d] }));

const KINDS = [
  { id: 'plan', title: 'Занятие по плану' },
  { id: 'weigh', title: 'Взвешивание' },
  { id: 'measure', title: 'Замеры' },
  { id: 'food', title: 'Еда' },
];

/** Ближайшее занятие под «Занятием по плану» — то же, что на «Обзоре» */
function PlanNext() {
  const { data } = useData('client.overview', {}, []);
  if (!data) return null;
  return <span className="conn-row__sub">{data.nextTrainingDate ? 'Ближайшее — ' + formatWhen(data.nextTrainingDate) : 'В расписании пока нет занятий'}</span>;
}

export function Reminders() {
  const can = remindersAvailable();
  const [s, setS] = useState(readReminders);
  const [open, setOpen] = useState('');
  const [busy, setBusy] = useState(false);
  // Уведомления телефона запрещены: напоминания не придут, пока их не включат
  const [denied, setDenied] = useState(false);
  const check = () => { if (can) notifyPermission().then((p) => setDenied(p === 'denied')).catch(() => {}); };
  useEffect(check, []);
  useOnReturn(check);

  const change = (kind, patch) => {
    const next = saveReminders({ ...s, [kind]: { ...s[kind], ...patch } });
    setS(next);
    syncReminders().catch(() => {});
  };

  const toggle = async (kind, on) => {
    haptic();
    if (!on) { change(kind, { on: false }); return; }
    // Включили — тогда и только тогда окно разрешения; подпись строки
    // и текст под разделом уже сказали, что это за уведомления
    setBusy(true);
    let p = await notifyPermission();
    if (p === 'prompt') p = await askNotifyPermission();
    setBusy(false);
    if (p !== 'granted') { setDenied(true); return; }
    setDenied(false);
    change(kind, { on: true });
  };

  const editor = (kind) => {
    if (kind === 'weigh' || kind === 'measure') {
      return <>
        <Segmented wrap label="День недели" items={WEEK} value={s[kind].day} onChange={(day) => change(kind, { day })} />
        <Field label="Время" type="time" value={s[kind].time} onChange={(time) => { if (validTime(time)) change(kind, { time }); }} />
      </>;
    }
    if (kind === 'food') {
      const set = (i, time) => {
        if (!validTime(time)) return;
        const times = [...s.food.times];
        times[i] = time;
        change('food', { times });
      };
      return <div className="field-row reminders__times">
        <Field label="Первое" type="time" value={s.food.times[0]} onChange={(t) => set(0, t)} />
        <Field label="Второе" type="time" value={s.food.times[1]} onChange={(t) => set(1, t)} />
      </div>;
    }
    return null;
  };

  return (
    <>
      <Panel>
        {KINDS.map(({ id, title }) => {
          const editable = can && id !== 'plan';
          const expanded = editable && open === id;
          const note = <>
            <span className="conn-row__title">{title}</span>
            <span className="conn-row__note">{reminderNote(id, s)}</span>
            {can && id === 'plan' && s.plan.on && <PlanNext />}
          </>;
          return <React.Fragment key={id}>
            <div className="conn-row">
              {editable
                ? <button type="button" className="conn-row__main conn-row__main--button" aria-expanded={expanded}
                  aria-controls={'reminder-' + id} onClick={() => { setOpen(expanded ? '' : id); haptic(); }}>{note}</button>
                : <div className="conn-row__main">{note}</div>}
              <Switch label={title} checked={s[id].on} disabled={!can || busy} onChange={(on) => toggle(id, on)} />
            </div>
            {expanded && <div className="conn-row__edit" id={'reminder-' + id}>{editor(id)}</div>}
          </React.Fragment>;
        })}
      </Panel>
      {denied && (
        <div className="reminders__denied" role="status">
          <p className="conn-caption conn-caption--bad">Уведомления выключены в настройках телефона — напоминания не придут.</p>
          <button type="button" className="button" onClick={() => openPhoneSettings('notifications')}>Открыть настройки телефона</button>
        </div>
      )}
      <p className="conn-caption">
        {can
          ? 'Напоминания ставит сам телефон, без нашего сервера: расписание хранится только на нём. Время можно менять касанием по строке.'
          : 'Напоминания работают в приложении для iPhone и Android.'}
      </p>
    </>
  );
}

/* ==========================================================================
 * Поддержка: оценить и скопировать данные
 * ========================================================================== */

/** Текст для письма в поддержку — только то, что человек сам решит отправить */
async function supportText() {
  const lines = ['Fit Track — данные для поддержки', 'Версия: ' + APP_VERSION + screensNote()];
  const d = await deviceInfo().catch(() => null);
  if (d && d.app) lines.push('Приложение: ' + d.app);
  if (d && d.device) lines.push('Устройство: ' + d.device);
  // ID «FT-…» — тот же, что в «Моём тренере»; нет связи — без него
  const id = await accountState().then((r) => (r && r.publicId) || '').catch(() => '');
  if (id) lines.push('ID: ' + id);
  return lines.join('\n');
}

export function Support({ disabled = false }) {
  const [rate, setRate] = useState(false);
  // Текст собираем заранее: Safari и WebView iPhone пишут в буфер только
  // прямо в нажатии, а ожидание модели и ID это нажатие «остужает»
  const [text, setText] = useState('');
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (disabled) return undefined;
    let alive = true;
    canRateInStore().then((ok) => { if (alive) setRate(ok); }).catch(() => {});
    supportText().then((t) => { if (alive) setText(t); }).catch(() => {});
    return () => { alive = false; };
  }, [disabled]);
  useEffect(() => {
    if (!copied) return undefined;
    const t = setTimeout(() => setCopied(false), 4000);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    setFailed(false);
    try {
      await copyText(text || await supportText());
      setCopied(true);
      haptic('success');
    } catch (_) { setFailed(true); }
  };

  return (
    <>
      <Panel>
        {rate && (
          <button type="button" className="conn-link" onClick={() => { haptic(); openStorePage().catch(() => {}); }}>
            <span>Оценить Fit Track</span>
            <IconExternal size={18} />
          </button>
        )}
        <button type="button" className="conn-link" onClick={copy} disabled={disabled}>
          <span>Скопировать данные для поддержки</span>
          {copied ? <IconCheck size={18} /> : <IconCopy size={18} />}
        </button>
      </Panel>
      <p className={'conn-caption' + (failed ? ' conn-caption--bad' : '')} role="status">
        {disabled
          ? 'Здесь клиент копирует версию приложения, модель телефона и свой ID для письма в поддержку. В режиме просмотра это не нажимается.'
          : failed ? 'Не получилось скопировать — телефон не дал доступ к буферу обмена.'
            : copied ? 'Скопировано: версия, устройство и ID — вставьте в письмо поддержке.'
              : 'Версия приложения, модель телефона и ваш ID — в буфер обмена, чтобы вставить в письмо.'}
      </p>
    </>
  );
}
