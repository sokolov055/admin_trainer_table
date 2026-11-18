import React, { useState } from 'react';
import { useData } from '../useData.js';
import { apiMutate } from '../api.js';
import { haptic } from '../telegram.js';
import { BackButton, Sheet, Loading, ErrorState, Note, plural } from '../ui.jsx';
import {
  IconSend, IconPen, IconMore, IconCopy, IconList, IconTrash, IconEye, IconUsers, IconChevron, IconHome, IconBench,
  IconAlert, IconCheck,
} from '../icons.jsx';
import { MuscleFigure, splitTally } from '../muscles/MuscleMap.jsx';
import { ExerciseThumb } from '../client/PlanCard.jsx';
import { planMinutes } from '../plan-card-model.js';
import { cardioLine, trackOf } from '../exercise-track.js';
import { PLACES } from '../client/programs-model.js';
import { goalLook, daysOf, initials, avatarTone } from './program-list-model.js';
import { weeksOf, muscleLoad, gapsLine, schemeOf, clientsLine, LOAD_WORD } from './program-view-model.js';
import { slotTones, slotClass, LOAD_GROUP_TONE } from '../data-tones.js';
import { GoalIcon, LevelBars } from './ProgramList.jsx';
import './programs-lib.css';

/**
 * Экран программы «Библиотеки» (этап 2 макета templates-programs-2026-11-17,
 * согласован владельцем 17.11.2026). Обложка цели с четырьмя плитками,
 * «Видят клиенты» и «Общая» переключателями, кто идёт по программе сейчас,
 * нагрузка на мышцы за всю программу, недели вкладками, тренировки
 * свёрнуты — картинки упражнений, раскрыть — схема плашками. Внизу
 * закреплено «Назначить клиенту», ✎ и «⋯».
 *
 * Шаблон тренировки (не программы) — прежним видом, TemplateView в Library.jsx.
 */

function Avatar({ name, big = false }) {
  return <i className={'plib-ava plib-ava--' + avatarTone(name) + (big ? ' plib-ava--big' : '')}>{initials(name)}</i>;
}

function Hero({ t }) {
  const look = goalLook(t.goal);
  const days = daysOf(t);
  const weeks = weeksOf(t).filter((w) => w.n > 0).length;
  const stat = (value, label, hint) => <div title={hint}><b>{value}</b><span>{label}</span></div>;
  return (
    <div className={'plib-hero plib-goal--' + look.key}>
      <span className="plib-hero__big" aria-hidden="true"><GoalIcon goal={t.goal} size={130} /></span>
      {t.goal && <div className="plib-hero__goal">{t.goal}</div>}
      <h2 className="plib-hero__title">{t.title}</h2>
      {(t.level || PLACES[t.place]) && (
        <div className="plib-hero__pills">
          {t.level && <span className="plib-pill"><LevelBars level={t.level} />{t.level}</span>}
          {PLACES[t.place] && <span className="plib-pill">{t.place === 'home' ? <IconHome size={13} /> : <IconBench size={13} />}{PLACES[t.place]}</span>}
        </div>
      )}
      <div className="plib-hero__stats">
        {stat(days.n ? days.n + '×' : '—', 'в неделю', days.auto ? 'По составу недели 1' : undefined)}
        {stat(t.minutes ? (t.minutesAuto ? '≈' : '') + t.minutes : '—', 'минут', t.minutesAuto ? 'По упражнениям' : undefined)}
        {stat(weeks || '—', weeks ? plural(weeks, 'неделя', 'недели', 'недель') : 'без недель')}
        {stat(t.workouts, plural(t.workouts, 'тренировка', 'тренировки', 'тренировок'))}
      </div>
      {!t.mine && <div className="plib-hero__author">автор: {t.author}</div>}
    </div>
  );
}

function Toggle({ on, icon, children, onChange, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled}
      className={'plib-tog' + (on ? ' is-on' : '')} onClick={() => { haptic(); onChange(!on); }}>
      {icon}<span>{children}</span><span className="plib-tog__sw" aria-hidden="true" />
    </button>
  );
}

/** Кто идёт сейчас: нажать — лист со всеми, оттуда в карточку клиента */
function ClientsSheet({ clients, onClose, onOpenClient }) {
  const all = useData('trainer.clients', {}, []);
  const open = (c) => {
    const full = all.data && all.data.clients.find((x) => x.row === c.row);
    if (!full) return;
    haptic();
    onClose();
    onOpenClient(full);
  };
  return (
    <Sheet title="Сейчас у клиентов" onClose={onClose}>
      <div className="plib-menu">
        {all.error && <ErrorState error={all.error} onRetry={all.reload} />}
        {clients.map((c) => (
          <button key={c.row} type="button" className="plib-menu__item" disabled={!onOpenClient || all.loading} onClick={() => open(c)}>
            <Avatar name={c.name} big />
            <span className="plib-grow"><b>{c.name}</b><small>{c.week ? c.week + '-я неделя' : 'идёт сейчас'}{c.endsOn ? ' · до ' + new Date(c.endsOn + 'T12:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : ''}</small></span>
            {onOpenClient && <IconChevron size={18} className="plib-go" />}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function Muscles({ blocks }) {
  const { tally, bars, gaps } = muscleLoad(blocks);
  if (!bars.length) return null;
  const { primary, secondary } = splitTally(tally);
  return (
    <section className="plib-box" aria-label="Нагрузка на мышцы">
      <div className="plib-box__head">Нагрузка на мышцы<span>вся программа</span></div>
      <div className="plib-mus">
        <MuscleFigure primary={primary} secondary={secondary} size="sm" />
        <div className="plib-bars">
          {bars.map((b, i) => (
            <div key={b.label} className={'plib-bar-row' + (LOAD_GROUP_TONE[b.label] ? ' tone-' + LOAD_GROUP_TONE[b.label] : '')}>
              {b.label}
              <div><i style={{ width: Math.round(b.share * 100) + '%', animationDelay: i * 100 + 'ms' }} /></div>
            </div>
          ))}
        </div>
      </div>
      {gaps.length > 0 && <p className="plib-gaps">Без основной нагрузки: {gapsLine(gaps).toLowerCase()}</p>}
    </section>
  );
}

function ExerciseRow({ e }) {
  const chips = e.cardio ? [cardioLine(e.cardio, trackOf(e))].filter(Boolean) : schemeOf(e);
  return (
    <li className={'plib-ex' + (e.supersetGroup ? ' plib-ex--ss' : '')}>
      <ExerciseThumb ex={e} className="plib-ex__pic" />
      <b>{e.name}</b>
      {chips.length > 0 && <span className="plib-ex__sch">{chips.map((c, i) => <span key={i}>{c}</span>)}</span>}
    </li>
  );
}

function Workout({ block, num, tone = '', open, onToggle, delay }) {
  const n = block.exercises.length;
  const minutes = planMinutes(block.exercises);
  const sub = [n + ' упр', minutes && minutes + ' мин', block.with && 'вместе с прошлой'].filter(Boolean).join(' · ');
  return (
    <div className={'plib-wk' + (open ? ' is-open' : '')} style={{ animationDelay: delay + 'ms' }}>
      <button type="button" className="plib-wk__head" aria-expanded={open} onClick={() => { haptic(); onToggle(); }}>
        <span className={'plib-wk__num' + (tone ? ' ' + tone : '')}>{num}</span>
        <span className="plib-grow"><b>{block.title || 'Тренировка ' + num}</b><small>{sub}</small></span>
        {!open && (
          <span className="plib-thumbs" aria-hidden="true">
            {block.exercises.slice(0, 3).map((e, i) => <ExerciseThumb key={i} ex={e} className="plib-thumbs__i" />)}
          </span>
        )}
        <IconChevron size={18} className="plib-wk__chev" />
      </button>
      <div className="plib-wk__body"><div>
        {open && <ol className="plib-exs">{block.exercises.map((e, j) => <ExerciseRow key={j} e={e} />)}</ol>}
      </div></div>
    </div>
  );
}

function Weeks({ t }) {
  const weeks = weeksOf(t);
  // Номер тренировки — её цветом, как буква в «Назначить» (18.11.2026)
  const tones = slotTones(t.blocks);
  const tabs = weeks[0].n > 0 && weeks.length > 1;
  const [week, setWeek] = useState(0);
  const [open, setOpen] = useState(() => new Set(weeks[0].items.length ? [weeks[0].items[0].index] : []));
  const shown = weeks[Math.min(week, weeks.length - 1)];
  const toggle = (index) => setOpen((s) => { const next = new Set(s); if (next.has(index)) next.delete(index); else next.add(index); return next; });
  return (
    <>
      {tabs && (
        <div className="plib-wtabs" role="tablist" aria-label="Недели программы">
          {weeks.map((w, i) => (
            <button key={w.n} type="button" role="tab" aria-selected={i === week} className={i === week ? 'is-on' : ''}
              onClick={() => {
                haptic();
                setWeek(i);
                // Первая тренировка недели — раскрыта, как в макете
                if (w.items.length) setOpen((s) => new Set([...s, w.items[0].index]));
              }}>
              {i === 0 ? 'Неделя ' + w.n : w.n}<small>{LOAD_WORD[w.load] || 'база'}</small>
            </button>
          ))}
        </div>
      )}
      <div key={week}>
        {shown.items.length === 0 && <p className="plib-gaps">В этой неделе тренировок нет.</p>}
        {shown.items.map(({ block, index }, i) => (
          <Workout key={index} block={block} num={i + 1} tone={slotClass(tones.get(block.title))} open={open.has(index)} onToggle={() => toggle(index)} delay={i * 50} />
        ))}
      </div>
    </>
  );
}

/** «⋯»: дублировать, тренировку — в «Тренировки» (выбрать какую), удалить */
function MoreSheet({ t, busy, saved, onClose, onDuplicate, onSaveWorkout, onDelete }) {
  const [pick, setPick] = useState(false);
  return (
    <Sheet title={pick ? 'Какую тренировку' : 'Программа'} onClose={onClose} locked={busy}>
      <div className="plib-menu">
        {!pick && <>
          {t.mine && (
            <button type="button" className="plib-menu__item" disabled={busy} onClick={onDuplicate}>
              <span className="plib-menu__icon"><IconCopy size={20} /></span>
              <span><b>Дублировать</b><small>Копия рядом — для похожей программы</small></span>
            </button>
          )}
          <button type="button" className="plib-menu__item" disabled={busy} onClick={() => { haptic(); setPick(true); }}>
            <span className="plib-menu__icon"><IconList size={20} /></span>
            <span><b>Тренировку — в «Тренировки»</b><small>Выбрать, какую сохранить отдельно</small></span>
          </button>
          {t.mine && (
            <button type="button" className="plib-menu__item plib-menu__item--danger" disabled={busy} onClick={onDelete}>
              <span className="plib-menu__icon"><IconTrash size={20} /></span>
              <span><b>Удалить</b><small>Можно будет вернуть несколько секунд</small></span>
            </button>
          )}
        </>}
        {pick && t.blocks.map((b, i) => (
          <button key={i} type="button" className="plib-menu__item" disabled={busy || saved[i]} onClick={() => onSaveWorkout(b, i)}>
            <span className={'plib-wk__num ' + slotClass(slotTones(t.blocks).get(b.title))}>{i + 1}</span>
            <span className="plib-grow"><b>{b.title || 'Тренировка ' + (i + 1)}</b><small>{saved[i] ? 'Уже в «Тренировках»' : b.exercises.length + ' упр' + (b.week ? ' · неделя ' + b.week : '')}</small></span>
            {saved[i] && <IconCheck size={18} />}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

export default function ProgramView({ id, onBack, onEdit, onAssign, onCopied, onDeleted, onSavedWorkout, onOpenClient }) {
  const { loading, data, error, reload } = useData('library.template.get', { id }, [id]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const [flags, setFlags] = useState(null); // переключили на экране — до ответа сервера
  const [sheet, setSheet] = useState(null); // 'more' | 'clients'
  const [saved, setSaved] = useState({});
  const [done, setDone] = useState('');

  if (loading) return <><BackButton label="Программы" onClick={onBack} /><Loading rows={3} /></>;
  if (error) return <><BackButton label="Программы" onClick={onBack} /><ErrorState error={error} onRetry={reload} /></>;

  const t = { ...data, ...(flags || {}) };
  const clients = t.clients || [];

  const act = async (fn) => {
    setBusy(true);
    setFailure(null);
    try { await fn(); } catch (err) { setFailure(err); } finally { setBusy(false); }
  };

  const setFlag = (patch) => {
    const before = { forClients: t.forClients, isPublic: t.isPublic };
    setFlags({ ...before, ...patch });
    setFailure(null);
    apiMutate('library.template.flags', { id: t.id, ...patch })
      .then((r) => setFlags({ forClients: r.forClients, isPublic: r.isPublic }))
      .catch((err) => { setFlags(before); setFailure(err); });
  };

  const copy = () => act(async () => {
    const made = await apiMutate('library.template.copy', { id: t.id });
    haptic('success');
    setSheet(null);
    onCopied(made);
  });

  const saveWorkout = (block, i) => act(async () => {
    // Своя копия тренировки: из чужого общего шаблона тоже
    await apiMutate('library.template.save', {
      kind: 'workout',
      title: block.title || t.title,
      goal: t.goal || '',
      level: t.level || '',
      description: 'Из программы «' + t.title + '»',
      blocks: [block],
    });
    haptic('success');
    setSaved((s) => ({ ...s, [i]: true }));
    setSheet(null);
    setDone('«' + (block.title || 'Тренировка') + '» — в «Тренировках»');
    if (onSavedWorkout) onSavedWorkout();
  });

  return (
    <div className="plib plib-view">
      <BackButton label="Программы" onClick={onBack} />
      <Hero t={t} />

      {t.mine && (
        <div className="plib-togs">
          <Toggle on={!!t.forClients} icon={<IconEye size={18} />} onChange={(v) => setFlag({ forClients: v })}>Видят клиенты</Toggle>
          <Toggle on={!!t.isPublic} icon={<IconUsers size={18} />} onChange={(v) => setFlag({ isPublic: v })}>Общая</Toggle>
        </div>
      )}
      {failure && <Note tone="critical" icon={IconAlert}>{failure.message}</Note>}
      {done && <Note tone="good" icon={IconCheck}>{done}</Note>}
      {t.description && <p className="plib-desc">{t.description}</p>}

      {clients.length > 0 && (
        <button type="button" className="plib-box plib-box--tap" onClick={() => { haptic(); setSheet('clients'); }}>
          <span className="plib-box__head">Сейчас у клиентов<span>{clients.length} ›</span></span>
          <span className="plib-clients">
            <span className="plib-who">{clients.slice(0, 4).map((c) => <Avatar key={c.row} name={c.name} />)}</span>
            <small>{clientsLine(clients)}</small>
          </span>
        </button>
      )}

      <Muscles blocks={t.blocks} />
      <Weeks t={t} />

      <div className="plib-dock">
        <button type="button" className="plib-dock__main" disabled={busy} onClick={() => { haptic(); onAssign(t); }}>
          <IconSend size={18} />Назначить клиенту
        </button>
        {t.mine
          ? <button type="button" className="plib-dock__ib" aria-label="Изменить" disabled={busy} onClick={() => { haptic(); onEdit(t); }}><IconPen size={20} /></button>
          : <button type="button" className="plib-dock__alt" aria-label="Скопировать к себе" disabled={busy} onClick={copy}><IconCopy size={18} />К себе</button>}
        <button type="button" className="plib-dock__ib" aria-label="Ещё" disabled={busy} onClick={() => { haptic(); setSheet('more'); }}><IconMore size={20} /></button>
      </div>

      {sheet === 'clients' && <ClientsSheet clients={clients} onClose={() => setSheet(null)} onOpenClient={onOpenClient} />}
      {sheet === 'more' && (
        <MoreSheet t={t} busy={busy} saved={saved} onClose={() => setSheet(null)} onDuplicate={copy}
          onSaveWorkout={saveWorkout} onDelete={() => { setSheet(null); onDeleted(t); }} />
      )}
    </div>
  );
}
