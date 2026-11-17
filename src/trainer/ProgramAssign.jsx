import React, { useEffect, useMemo, useState } from 'react';
import { useData } from '../useData.js';
import { apiMutate, apiPublic } from '../api.js';
import { haptic } from '../telegram.js';
import { BackButton, Loading, ErrorState, Note, Search, plural } from '../ui.jsx';
import { IconAlert, IconSend, IconCalendar, IconClock, IconDumbbell } from '../icons.jsx';
import { WeekBlock, RuleBlock } from '../client/PlanWeeks.jsx';
import { dateKey } from '../program-timeline.js';
import { monthLabelOf, parseMonth } from '../plan-weeks.js';
import { monthName } from '../library.js';
import { useSelfCard } from './selfCard.js';
import { GoalIcon } from './ProgramList.jsx';
import { goalLook, daysOf, initials, avatarTone } from './program-list-model.js';
import { weeksOf, LOAD_WORD } from './program-view-model.js';
import {
  clientsView, clientStatus, dativeName, startTiles, defaultStart, endOf, monthOfStart, startText, shortDate, dayDate,
  assignPlan, assignCalendar,
} from './program-assign-model.js';
import './programs-lib.css';

/**
 * «Назначить клиенту» в «Библиотеке» (этап 4 макета templates-programs-2026-11-17,
 * согласован владельцем 17.11.2026). Кому — аватарки и статус программы
 * цветом, фильтры «Свободны» и «Скоро конец», себя первым. Как — сверху
 * календарь «что получит клиент», ниже блоки листа «Программа» у клиента:
 * «Когда», «Неделя», «Пропуск»; месяц истории и прошлые веса — в «Ещё».
 * После — «Назначено» со сводкой.
 *
 * Что получает клиент, не поменялось: те же поля plan.fromTemplate, что у
 * прежней формы (program-assign-model.js assignPlan). Шаблон тренировки и
 * «Шаблон» из карточки клиента (TemplateApply) — прежней AssignForm.
 */

const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function Avatar({ name, status }) {
  return (
    <span className={'plib-cl__ava plib-ava--' + avatarTone(name)} aria-hidden="true">
      {status === 'self' ? 'Я' : initials(name)}
      {status && status !== 'self' && <i className={'plib-cl__dot plib-st--' + status} />}
    </span>
  );
}

function ProgramMini({ t }) {
  const look = goalLook(t.goal);
  const days = daysOf(t);
  const weeks = weeksOf(t).filter((w) => w.n > 0).length;
  const sub = [days.n && days.n + '×', t.minutes && t.minutes + ' мин', weeks && weeks + ' ' + plural(weeks, 'неделя', 'недели', 'недель')].filter(Boolean).join(' · ');
  return (
    <div className="plib-pmini">
      <span className={'plib-pmini__cover plib-goal--' + look.key}><GoalIcon goal={t.goal} size={18} /></span>
      <span className="plib-grow"><b>{t.title}</b>{sub && <small>{sub}</small>}</span>
    </div>
  );
}

/** Кому: поиск, фильтры, клиенты со статусом */
function Who({ template, clients, self, onPick, backText, onBack }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const list = useMemo(() => [
    ...(self.card ? [{ row: self.card.clientRow, name: 'Мои тренировки', self: true }] : []),
    ...((clients.data && clients.data.clients) || []),
  ], [clients.data, self.card]);
  const view = clientsView(list, { templateId: template.id, filter, q });
  const chip = (value, label, count) => (
    <button type="button" role="radio" aria-checked={filter === value} className={'chip' + (filter === value ? ' chip--active' : '')}
      onClick={() => { haptic(); setFilter(value); }}>
      {label}{count !== undefined && <i className="plib-count">{count}</i>}
    </button>
  );
  return (
    <>
      <BackButton label={backText} onClick={onBack} />
      <h2 className="plib-h">Кому назначить</h2>
      <ProgramMini t={template} />
      <Search value={q} onChange={setQ} placeholder="Поиск клиента" />
      <div className="chips plib-asf" role="radiogroup" aria-label="Кого показать">
        {chip('all', 'Все')}
        {chip('free', 'Свободны', view.counts.free)}
        {chip('end', 'Скоро конец', view.counts.end)}
      </div>
      {clients.loading && <Loading lead={false} rows={4} />}
      {clients.error && <ErrorState error={clients.error} onRetry={clients.reload} />}
      {clients.data && !view.rows.length && <p className="plib-empty">{q ? 'Никого не нашли' : filter === 'free' ? 'Свободных нет' : 'Ни у кого программа не кончается на этой неделе'}</p>}
      <div className="plib-cls">
        {view.rows.map((c, i) => (
          <button key={c.row} type="button" className="plib-cl" style={{ animationDelay: Math.min(i, 10) * 40 + 'ms' }} onClick={() => { haptic(); onPick(c); }}>
            <Avatar name={c.name} status={c.status.kind} />
            <span className="plib-grow"><b>{c.name}</b><small>{c.status.line}</small></span>
            {c.status.tag && <span className={'plib-tag plib-tag--' + c.status.kind}>{c.status.tag}</span>}
          </button>
        ))}
      </div>
    </>
  );
}

/** Календарь «что получит клиент»: 4 недели × 7 дней, «в любой день» справа */
function Calendar({ cal, size, rhythmShown }) {
  const anyBefore = cal.weeks.some((w) => w.cells.some((c) => c.before));
  return (
    <>
      <div className="plib-cal__grid" role="group" aria-label="Что получит клиент по неделям">
        <span />
        {WD.map((d) => <span key={d} className="plib-cal__dh">{d}</span>)}
        <span className="plib-cal__dh">люб.</span>
        {cal.weeks.map((w, wi) => (
          <React.Fragment key={w.start}>
            <span className="plib-cal__wl">{w.from}–{w.to}{size > 1 && !rhythmShown && <em>Н{w.week} {LOAD_WORD[w.load] || 'база'}</em>}</span>
            {w.cells.map((c, i) => {
              const s = c.s[0];
              return (
                <span key={c.date} className={'plib-cal__cell' + (c.before ? ' is-before' : '') + (c.after ? ' is-after' : '') + (s ? ' is-s plib-cal--' + s.tone : '')}
                  style={s ? { animationDelay: (wi * 7 + i) * 12 + 'ms' } : undefined} title={c.s.map((x) => x.title).join(', ') || undefined}>
                  {s ? s.letter + (c.s.length > 1 ? '+' : '') : ''}
                </span>
              );
            })}
            <span className="plib-cal__free">
              {w.free.slice(0, 3).map((s, k) => <i key={k} className={'plib-cal--' + s.tone}>{s.letter}</i>)}
              {w.free.length > 3 && <i className="plib-cal--more">+{w.free.length - 3}</i>}
            </span>
            {w.over && <span className="plib-cal__over">⚠ {w.need} {plural(w.need, 'занятие', 'занятия', 'занятий')} за неделю — проверьте</span>}
          </React.Fragment>
        ))}
      </div>
      <Legend items={cal.legend} />
      {anyBefore && <p className="plib-cal__foot">▨ до начала — не считается пропуском</p>}
    </>
  );
}

function Legend({ items }) {
  return (
    <div className="plib-lgd">
      {items.map((l) => <span key={l.title}><i className={'plib-cal--' + l.tone}>{l.letter}</i>{l.title}</span>)}
    </div>
  );
}

/** Плитка «другая»: нажатие — календарь телефона */
function OtherDate({ value, on, onChange }) {
  return (
    <label className={'plib-dt' + (on ? ' is-on' : '')}>
      другая<b>{on ? dayDate(value).replace(/ \S+$/, '') : '📅'}</b>
      <input type="date" aria-label="Другая дата начала" min={dateKey()} value={on ? value : ''} onChange={(e) => e.target.value && onChange(e.target.value)} />
    </label>
  );
}

/** Как: календарь, «Когда», «Неделя», «Пропуск», «Ещё» */
function How({ template, client, onBack, onDone }) {
  const today = dateKey();
  const status = clientStatus(client, template.id, today);
  const now = client.programNow || null;
  const [startsOn, setStartsOn] = useState(defaultStart(today));
  const [len, setLen] = useState(0);
  const [days, setDays] = useState([]);
  const [beat, setBeat] = useState({ rhythm: [], rhythmDays: [], one: '' });
  const [firstPick, setFirstPick] = useState('');
  const [rule, setRule] = useState('');
  const [mode, setMode] = useState('replace');
  const [startWeek, setStartWeek] = useState('');
  const [how, setHow] = useState('');
  const [length, setLength] = useState(2);
  const [monthPick, setMonthPick] = useState('');
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);

  const adding = mode === 'append';
  const endsOn = endOf(startsOn, len);
  const autoMonth = monthOfStart(startsOn);
  // «Добавить к ней» — в месяц, где живёт программа клиента сейчас
  const month = adding && now ? now.month : monthPick || autoMonth;
  const info = useData('plan.assign.info', { clientRow: client.row, month, templateId: template.id, startsOn }, [client.row, month, template.id, startsOn]);
  const prev = info.data && info.data.month === month ? info.data.prev : null;
  const plan = assignPlan({ template, clientRow: client.row, month, mode, startsOn, endsOn, days, beat, firstPick, startWeek, how, length, rule, prev });
  const cal = assignCalendar(plan, { startsOn, endsOn });
  const who = client.self ? 'себе' : dativeName(client.name);
  const shownRule = rule || (prev && prev.rule) || 'client';
  const count = beat.rhythm.length ? beat.rhythm.join(' · ') : plan.weekCount;
  const tiles = startTiles(today);
  const custom = !tiles.some((t) => t.value === startsOn);
  const startTxt = startText(startsOn, today);
  const endTxt = endsOn ? 'до ' + shortDate(endsOn) : 'по кругу, до замены';
  const sessions = plan.queue.map((g, i) => ({ key: i, title: g.map((b) => b.title).join(' + ') }));
  const workouts = (template.blocks || []).length;
  const thisMonth = monthName();
  const nextMonth = (() => { const p = parseMonth(thisMonth); return p ? monthLabelOf(p.year, p.month + 1) : ''; })();
  const months = [...new Set([autoMonth, thisMonth, nextMonth].filter(Boolean))];

  const apply = async () => {
    setBusy(true);
    setFailure(null);
    try {
      await apiMutate('plan.fromTemplate', plan.payload);
      haptic('success');
      onDone({
        client, month, adding,
        lines: adding
          ? [workouts + ' ' + plural(workouts, 'тренировка', 'тренировки', 'тренировок') + ' — в конец программы']
          : plan.weekly
            ? [startTxt + ' · ' + count + '× в неделю', endTxt]
            : ['очередь из ' + workouts + ' ' + plural(workouts, 'тренировки', 'тренировок', 'тренировок'), month],
      });
    } catch (err) {
      setFailure(err);
    } finally {
      setBusy(false);
    }
  };

  const seg = (items, value, onChange, label) => (
    <div className="plib-sseg" role="radiogroup" aria-label={label}>
      {items.map((it) => (
        <button key={String(it.value)} type="button" role="radio" aria-checked={value === it.value} className={value === it.value ? 'is-on' : ''}
          onClick={() => { haptic(); onChange(it.value); }}>{it.label}</button>
      ))}
    </div>
  );

  let conf = null;
  if (status.kind === 'same' && plan.weeks > 1) {
    const cont = plan.same;
    conf = (
      <div className="plib-conf">
        <p>Сейчас у клиента <b>эта же программа</b>{now && now.week ? `, идёт ${now.week}-я неделя` : ''}.{cont ? '' : ' Начнётся с недели 1.'}</p>
        {cont && (
          <>
            <div className="plib-cont" aria-hidden="true">
              <em>дальше</em>
              {[0, 1, 2, 3].map((k) => <i key={k}>{((plan.chosenStart - 1 + k) % plan.size) + 1}</i>)}
            </div>
            {seg([{ value: '', label: `Продолжить · ${plan.continueWeek}-я` }, { value: 1, label: 'Заново · 1-я' }], startWeek, setStartWeek, 'С какой недели')}
          </>
        )}
      </div>
    );
  } else if (status.kind === 'end' || status.kind === 'busy' || (status.kind === 'same' && now)) {
    conf = (
      <div className="plib-conf">
        <p>
          Сейчас — <b>{now.title ? `«${now.title}»` : 'своя программа'}</b>{now.endsOn ? ' до ' + dayDate(now.endsOn) : ', без конца'}.
          {' '}{adding ? 'Тренировки этой программы встанут в конец её списка.' : `Заменить — новая начнётся ${startTxt}, прежняя останется в истории.`}
        </p>
        {seg([{ value: 'replace', label: 'Заменить' }, { value: 'append', label: 'Добавить к ней' }], mode, setMode, 'Как назначить')}
      </div>
    );
  }

  return (
    <>
      <BackButton label="Клиенты" onClick={onBack} />
      <div className="plib-aswho">
        <Avatar name={client.name} status={client.self ? 'self' : ''} />
        <span className="plib-grow"><b>{client.self ? 'Себе' : client.name}</b><small>{template.title}</small></span>
      </div>
      {conf}

      <section className="plib-box plib-cal">
        <div className="plib-box__head">Что получит {client.self ? 'клиент' : /[+&]|\sи\s/.test(client.name) ? client.name : client.name.split(' ')[0]}{!adding && plan.weekly && <span>{len ? len + ' нед' : '∞'}</span>}</div>
        {adding ? (
          <p className="plib-cal__sum">{workouts} {plural(workouts, 'тренировка', 'тренировки', 'тренировок')} программы встанут в конец списка. Недели, дни и пропуски — как у программы клиента.</p>
        ) : plan.weekly ? (
          <>
            <p className="plib-cal__sum">{count}× в неделю · {startTxt} · {endTxt}</p>
            <Calendar cal={cal} size={plan.size} rhythmShown={beat.rhythm.length > 0} />
          </>
        ) : (
          <>
            <p className="plib-cal__sum">Списком: очередь из {workouts} {plural(workouts, 'тренировки', 'тренировок', 'тренировок')}, без недель и оценок · {month}</p>
            <Legend items={(template.blocks || []).map((b, i) => ({ title: (i + 1) + '. ' + b.title, letter: String(i + 1), tone: i % 6 }))} />
          </>
        )}
      </section>

      {!adding && (
        <div className="ws plib-asws">
          {!plan.weeks && workouts > 0 && (
            <section className="ws-blk">
              <h3 className="ws-blk__h">Без недель <span>как пойдёт</span></h3>
              <div className="ws-tiles" role="radiogroup" aria-label="Как клиент пойдёт по программе">
                {[{ value: 'cycle', label: 'Неделя по кругу' }, { value: 'split', label: 'По неделям' }, { value: 'list', label: 'Списком' }].map((t) => (
                  <button key={t.value} type="button" role="radio" aria-checked={plan.howNow === t.value} className={'ws-tile' + (plan.howNow === t.value ? ' is-on' : '')}
                    onClick={() => { haptic(); setHow(t.value); }}>{t.label}</button>
                ))}
              </div>
              {plan.howNow === 'split' && (
                <div className="ws-len" role="group" aria-label="На сколько недель">
                  {[2, 3, 4].map((n) => <button key={n} type="button" aria-pressed={length === n} className={length === n ? 'is-on' : ''} onClick={() => { haptic(); setLength(n); }}>{n} нед</button>)}
                </div>
              )}
              <p className="ws-hint">{{ cycle: `Все ${workouts} — каждую неделю`, split: 'Разные тренировки в разные недели — по порядку поровну', list: 'Очередь на месяц, без циклов и оценок' }[plan.howNow]}</p>
            </section>
          )}

          {plan.weekly && (
            <section className="ws-blk">
              <h3 className="ws-blk__h">Когда</h3>
              <div className="plib-dates">
                {tiles.map((t) => (
                  <button key={t.value} type="button" aria-pressed={startsOn === t.value} className={'plib-dt' + (startsOn === t.value ? ' is-on' : '')}
                    onClick={() => { haptic(); setStartsOn(t.value); }}>
                    {t.title}<b>{dayDate(t.value).replace(/ \S+$/, '')}</b>
                  </button>
                ))}
                <OtherDate value={startsOn} on={custom} onChange={(v) => { haptic(); setStartsOn(v); }} />
              </div>
              <div className="ws-len" role="group" aria-label="Длительность программы">
                {[4, 8, 12].map((w) => <button key={w} type="button" aria-pressed={len === w} className={len === w ? 'is-on' : ''} onClick={() => { haptic(); setLen(w); }}>{w} нед</button>)}
                <button type="button" aria-pressed={!len} aria-label="Без конца" className={'ws-len__inf' + (!len ? ' is-on' : '')} onClick={() => { haptic(); setLen(0); }}>∞</button>
              </div>
              <p className="ws-hint">{len ? 'Последний день — ' + dayDate(endsOn) : 'Без конца — до замены тренером'}</p>
              {plan.midWeek && plan.queue.length > 0 && (
                <div className="plib-first">
                  <h4>Неполная первая неделя</h4>
                  <div className="ws-tiles" role="radiogroup" aria-label="Неполная первая неделя">
                    {[{ value: 'days', label: 'По дням', off: !(plan.alternate ? beat.rhythmDays[0] || [] : days).length }, { value: 'order', label: 'По порядку' }, { value: 'all', label: 'Успеть всё' }].map((t) => (
                      <button key={t.value} type="button" role="radio" aria-checked={plan.firstWeek === t.value} disabled={t.off} className={'ws-tile' + (plan.firstWeek === t.value ? ' is-on' : '')}
                        onClick={() => { haptic(); setFirstPick(t.value); }}>{t.label}</button>
                    ))}
                  </div>
                  <p className="ws-hint">{{ days: 'Прошедшие дни пропускаются, долгом не считаются', order: 'Сначала по порядку; что не влезло — в начало следующей недели', all: 'Все занятия недели — за оставшиеся дни' }[plan.firstWeek]}</p>
                </div>
              )}
            </section>
          )}

          {plan.weekly && plan.queue.length > 0 && (
            <WeekBlock beat={beat} setBeat={setBeat} days={days} setDays={setDays} count={plan.weekCount} sessions={sessions} />
          )}

          {plan.weekly && <RuleBlock value={shownRule} onChange={setRule} />}
        </div>
      )}

      <button type="button" className="plib-more" aria-expanded={more} onClick={() => { haptic(); setMore(!more); }}>Ещё {more ? '▴' : '▾'}</button>
      {more && (
        <div className="plib-morep">
          {!adding && (
            <div className="plib-morep__row">
              <span>Месяц в истории</span>
              <div className="chips" role="radiogroup" aria-label="Месяц в истории">
                {months.map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={month === m} className={'chip' + (month === m ? ' chip--active' : '')}
                    onClick={() => { haptic(); setMonthPick(m === autoMonth ? '' : m); }}>{m}</button>
                ))}
              </div>
            </div>
          )}
          {adding && <div className="plib-morep__row"><span>Месяц в истории</span><b>{month}</b></div>}
          <div className="plib-morep__row"><span>Прошлые веса клиента — в «было»</span><b className="plib-ok">✓</b></div>
        </div>
      )}

      {failure && <Note tone="critical" icon={IconAlert}>{failure.message}</Note>}
      {info.error && <Note tone="critical" icon={IconAlert}>{info.error.message}</Note>}
      <div className="plib-dock">
        <button type="button" className="plib-dock__main" disabled={busy || !month || (plan.weekly && !startsOn) || !workouts} onClick={apply}>
          <IconSend size={18} />
          {busy ? 'Назначаем…' : adding ? `Добавить ${client.self ? 'себе' : who}` : `Назначить ${who} · ${plan.weekly ? startTxt : month}`}
        </button>
      </div>
    </>
  );
}

function Done({ template, done, onOpen, onAgain, onBack, backText }) {
  const { client } = done;
  return (
    <>
      <BackButton label={backText} onClick={onBack} />
      <div className="plib-done">
        <svg className="plib-done__ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="45" /><path d="M30 52l13 13 27-29" /></svg>
        <h3>Назначено</h3>
        <p>{client.self ? 'Программа — в «Мои тренировки»' : `Программа — у клиента ${client.name}`}</p>
        <div className="plib-sum">
          <span><GoalIcon goal={template.goal} size={16} />{template.title}</span>
          {done.lines.map((l, i) => <span key={i}>{i === 0 ? <IconCalendar size={16} /> : <IconClock size={16} />}{l}</span>)}
          <span><IconDumbbell size={16} />прошлые веса — в «было»</span>
        </div>
        {onOpen && <button type="button" className="button button--primary button--block" onClick={onOpen}>Открыть карточку</button>}
        <button type="button" className="plib-ghost" onClick={onAgain}>Назначить ещё кому-то</button>
      </div>
    </>
  );
}

export default function ProgramAssign({ template, owner, backText = 'К программе', onBack, onOpenClient = null }) {
  // Из списка (смахнуть «Назначить») шаблон приходит без тренировок — дочитать
  const [tpl, setTpl] = useState(template.blocks ? template : null);
  const [tplError, setTplError] = useState(null);
  useEffect(() => {
    if (template.blocks) { setTpl(template); return undefined; }
    let alive = true;
    apiPublic('library.template.get', { id: template.id })
      .then((t) => { if (alive) setTpl(t && t.template ? t.template : t); })
      .catch((err) => { if (alive) setTplError(err); });
    return () => { alive = false; };
  }, [template]);
  const clients = useData('trainer.clients', {}, []);
  const self = useSelfCard(owner);
  const [client, setClient] = useState(null);
  const [done, setDone] = useState(null);

  if (tplError) return <><BackButton label={backText} onClick={onBack} /><ErrorState error={tplError} /></>;
  if (!tpl) return <><BackButton label={backText} onClick={onBack} /><Loading rows={3} /></>;

  if (done) {
    const full = !done.client.self && clients.data && clients.data.clients.find((c) => c.row === done.client.row);
    return (
      <Done template={tpl} done={done} backText={backText} onBack={onBack}
        onOpen={onOpenClient && full ? () => { haptic(); onOpenClient(full); } : null}
        onAgain={() => { haptic(); setDone(null); setClient(null); }} />
    );
  }
  if (client) {
    return <How key={client.row} template={tpl} client={client} onBack={() => setClient(null)} onDone={(d) => { setDone(d); clients.reload(); }} />;
  }
  return <Who template={tpl} clients={clients} self={self} onPick={setClient} backText={backText} onBack={onBack} />;
}
