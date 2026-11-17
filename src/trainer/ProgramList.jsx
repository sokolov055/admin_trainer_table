import React, { useState } from 'react';
import { useData } from '../useData.js';
import { apiMutate } from '../api.js';
import { haptic } from '../telegram.js';
import { Segmented, Search, Sheet, Loading, ErrorState, Empty, Note } from '../ui.jsx';
import {
  IconSearch, IconPlus, IconSliders, IconCalendar, IconClock, IconEye, IconUsers, IconSend, IconPlan,
  IconFlame, IconDumbbell, IconGem, IconBolt, IconWave, IconHeart, IconSpine, IconBandage, IconBench,
  IconHome, IconUser, IconCopy, IconAlert, IconClose,
} from '../icons.jsx';
import SwipeRow from '../SwipeRow.jsx';
import { PLACES } from '../client/programs-model.js';
import {
  goalLook, daysOf, LEVEL_TONE, NO_FILTERS, filterCount, shownPrograms, filterValues, initials, avatarTone,
} from './program-list-model.js';
import './programs-lib.css';

/**
 * Список программ «Библиотеки» (макет templates-programs-mockup, согласован
 * владельцем 17.11.2026). Шапка в две строки: «Мои · Общие» со счётчиками,
 * поиск значком, «+» кругом — лист «Новая программа». Цели — чипами со
 * значком, остальное — в листе «Фильтры». Карточка — обложка цели, факты
 * значками, полоска недель, кто идёт по программе сейчас. Смахнуть влево —
 * «Назначить» и «Удалить» (вместо режима «Править»).
 *
 * Открытие, правка и назначение — у Templates (Library.jsx), сюда приходят
 * колбэками.
 */

const GOAL_ICONS = {
  flame: IconFlame, dumbbell: IconDumbbell, gem: IconGem, bolt: IconBolt, wave: IconWave,
  heart: IconHeart, spine: IconSpine, bandage: IconBandage, plan: IconPlan,
};

export function GoalIcon({ goal, size = 20 }) {
  const Icon = GOAL_ICONS[goalLook(goal).icon] || IconPlan;
  return <Icon size={size} />;
}

/** Уровень — три столбика, как сигнал сети: заполнено по уровню, цвет — как у клиента */
export function LevelBars({ level }) {
  const tone = LEVEL_TONE[level];
  if (!tone) return null;
  return <span className={'plib-lvl plib-lvl--' + tone} role="img" aria-label={'Уровень: ' + level}><i /><i /><i /></span>;
}

function Avatars({ people, max = 3 }) {
  if (!people.length) return null;
  const shown = people.slice(0, people.length > max ? max - 1 : max);
  const more = people.length - shown.length;
  return (
    <span className="plib-who" aria-label={'Сейчас у: ' + people.map((p) => p.name).join(', ')}>
      {shown.map((p) => <i key={p.row} className={'plib-ava plib-ava--' + avatarTone(p.name)}>{initials(p.name)}</i>)}
      {more > 0 && <i className="plib-ava plib-ava--more">+{more}</i>}
    </span>
  );
}

/** Полоска недель: отрезок на занятие, недели — через промежуток */
function WeekStrip({ weeks }) {
  if (!weeks || !weeks.length) return null;
  return (
    <span className="plib-weeks" aria-hidden="true">
      {weeks.map((n, w) => (
        <span className="plib-weeks__wk" key={w}>
          {Array.from({ length: Math.max(1, Math.min(n, 7)) }, (_, i) => <i key={i} className={n ? '' : 'is-empty'} />)}
        </span>
      ))}
    </span>
  );
}

function ProgramCard({ t }) {
  const look = goalLook(t.goal);
  const days = daysOf(t);
  const place = PLACES[t.place];
  return (
    <>
      <span className={'plib-cover plib-goal--' + look.key} aria-hidden="true"><GoalIcon goal={t.goal} size={28} /></span>
      <span className="plib-body">
        <span className="plib-name">{t.title}</span>
        {t.goal && <span className={'plib-goalname plib-goaltext--' + look.key}>{t.goal}</span>}
        <span className="plib-facts">
          {days.n > 0 && <span title={days.auto ? 'По составу недели 1' : undefined}><IconCalendar size={14} />{days.n}×</span>}
          {t.minutes > 0 && <span><IconClock size={14} />{t.minutesAuto ? '≈ ' : ''}{t.minutes}</span>}
          {place && <span>{t.place === 'home' ? <IconHome size={14} /> : <IconBench size={14} />}{place}</span>}
          {t.level && <span><LevelBars level={t.level} /></span>}
        </span>
        <WeekStrip weeks={t.weekSessions} />
        {!t.mine && <span className="plib-author">{t.author}</span>}
      </span>
      {t.mine && (
        <span className="plib-side">
          <span className="plib-flags">
            <span className={t.forClients ? 'is-on' : ''} title={t.forClients ? 'Видят ваши клиенты' : 'Клиенты не видят'}><IconEye size={15} /></span>
            <span className={t.isPublic ? 'is-on' : ''} title={t.isPublic ? 'Общая для тренеров' : 'Только у вас'}><IconUsers size={15} /></span>
          </span>
          {(t.clients || []).length ? <Avatars people={t.clients} /> : <span className="plib-free">свободна</span>}
        </span>
      )}
    </>
  );
}

/* --------------------------------------------------------------------------
 * Лист «Фильтры»
 * -------------------------------------------------------------------------- */

function Tiles({ items, value, onChange, label, cols = 3 }) {
  return (
    <div className={'plib-tiles plib-tiles--' + cols} role="radiogroup" aria-label={label}>
      {items.map((it) => (
        <button key={String(it.value)} type="button" role="radio" aria-checked={value === it.value}
          className={'plib-tile' + (value === it.value ? ' is-on' : '')}
          onClick={() => { haptic(); onChange(value === it.value ? (typeof it.value === 'number' ? 0 : '') : it.value); }}>
          {it.icon}
          <span>{it.label}</span>
        </button>
      ))}
    </div>
  );
}

function FilterSheet({ list, filters, onChange, onClose, count }) {
  const values = filterValues(list);
  const [f, setF] = useState(filters);
  const set = (patch) => { const next = { ...f, ...patch }; setF(next); onChange(next); };
  return (
    <Sheet title="Фильтры" onClose={onClose} action={filterCount(f) ? <button type="button" className="button button--ghost" onClick={() => { haptic(); set({ ...NO_FILTERS, sort: f.sort }); }}>Сбросить</button> : null}>
      <div className="plib-filter">
        {values.days.length > 1 && <>
          <h4>Раз в неделю</h4>
          <Tiles cols={6} label="Раз в неделю" value={f.days} onChange={(v) => set({ days: v })}
            items={values.days.map((n) => ({ value: n, label: <b>{n}×</b> }))} />
        </>}
        {values.place.length > 1 && <>
          <h4>Где</h4>
          <Tiles label="Где" value={f.place} onChange={(v) => set({ place: v })}
            items={values.place.map((p) => ({ value: p, label: PLACES[p], icon: <span className="plib-dot">{p === 'home' ? <IconHome size={18} /> : <IconBench size={18} />}</span> }))} />
        </>}
        {values.level.length > 1 && <>
          <h4>Уровень</h4>
          <Tiles label="Уровень" value={f.level} onChange={(v) => set({ level: v })}
            items={values.level.map((l) => ({ value: l, label: l, icon: <LevelBars level={l} /> }))} />
        </>}
        <h4>Показать</h4>
        <Tiles label="Показать" value={f.show} onChange={(v) => set({ show: v })} items={[
          { value: 'clients', label: 'Видят клиенты', icon: <span className="plib-dot plib-dot--good"><IconEye size={18} /></span> },
          { value: 'assigned', label: 'Назначены', icon: <span className="plib-dot plib-dot--accent"><IconUser size={18} /></span> },
          { value: 'shared', label: 'Общие', icon: <span className="plib-dot"><IconUsers size={18} /></span> },
        ]} />
        <h4>Порядок</h4>
        <Segmented track label="Порядок" value={f.sort} onChange={(v) => { haptic(); set({ sort: v }); }}
          items={[{ value: 'recent', label: 'Недавние' }, { value: 'uses', label: 'Частые' }, { value: 'az', label: 'А–Я' }]} />
        <button type="button" className="button button--primary button--block plib-filter__go" onClick={onClose}>
          {count ? `Показать: ${count}` : 'Ничего не нашлось'}
        </button>
      </div>
    </Sheet>
  );
}

/* --------------------------------------------------------------------------
 * Лист «Новая программа»
 * -------------------------------------------------------------------------- */

/** Клиенты — только когда тренер выбрал «из программы клиента» */
function ClientPick({ match, busy, onPick }) {
  const clients = useData('trainer.clients', {}, []);
  if (clients.loading) return <Loading lead={false} rows={3} />;
  if (clients.error) return <ErrorState error={clients.error} onRetry={clients.reload} />;
  return (clients.data ? clients.data.clients : [])
    .filter((c) => !c.test && !c.pairHidden && match(c.name))
    .map((c) => (
      <button key={c.row} type="button" className="plib-menu__item" disabled={busy} onClick={() => onPick(c)}>
        <i className={'plib-ava plib-ava--big plib-ava--' + avatarTone(c.name)}>{initials(c.name)}</i>
        <span><b>{c.name}</b>{c.program && <small>{c.program.text}</small>}</span>
      </button>
    ));
}

function NewSheet({ mineList, onClose, onBlank, onCreated, onPublic }) {
  const [step, setStep] = useState('menu');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);

  const run = async (fn) => {
    setBusy(true);
    setFailure(null);
    try { const made = await fn(); haptic('success'); onCreated(made); } catch (err) { setFailure(err); } finally { setBusy(false); }
  };
  const match = (text) => !q || text.toLowerCase().includes(q.toLowerCase());

  const items = [
    { key: 'blank', icon: <IconPlus size={22} />, title: 'С нуля', text: 'Пустая, сразу — первая тренировка', go: onBlank },
    { key: 'client', icon: <IconUser size={22} />, title: 'Из программы клиента', text: 'Его нынешняя программа станет шаблоном, без его весов', go: () => setStep('client') },
    ...(mineList.length ? [{ key: 'copy', icon: <IconCopy size={22} />, title: 'Копия своей', text: 'Взять похожую и поправить', go: () => setStep('copy') }] : []),
    { key: 'public', icon: <IconUsers size={22} />, title: 'Из общих', text: 'Программы других тренеров', go: onPublic },
  ];

  return (
    <Sheet title={step === 'client' ? 'Чья программа' : step === 'copy' ? 'Копия какой' : 'Новая программа'} onClose={onClose} locked={busy}>
      {step === 'menu' && (
        <div className="plib-menu">
          {items.map((it) => (
            <button key={it.key} type="button" className="plib-menu__item" onClick={() => { haptic(); it.go(); }}>
              <span className="plib-menu__icon">{it.icon}</span>
              <span><b>{it.title}</b><small>{it.text}</small></span>
            </button>
          ))}
        </div>
      )}
      {step !== 'menu' && (
        <div className="plib-pick">
          <Search value={q} onChange={setQ} placeholder={step === 'client' ? 'Поиск клиента' : 'Поиск программы'} />
          {failure && <Note tone="critical" icon={IconAlert}>{failure.message}</Note>}
          {step === 'client' && (
            <ClientPick match={match} busy={busy}
              onPick={(c) => run(() => apiMutate('library.template.fromClient', { clientRow: c.row, title: 'Программа: ' + c.name }))} />
          )}
          {step === 'copy' && mineList.filter((t) => match(t.title)).map((t) => (
            <button key={t.id} type="button" className="plib-menu__item" disabled={busy}
              onClick={() => run(() => apiMutate('library.template.copy', { id: t.id }))}>
              <span className={'plib-cover plib-cover--sm plib-goal--' + goalLook(t.goal).key}><GoalIcon goal={t.goal} size={18} /></span>
              <span><b>{t.title}</b>{t.goal && <small>{t.goal}</small>}</span>
            </button>
          ))}
          <button type="button" className="button button--ghost button--block" disabled={busy} onClick={() => { setStep('menu'); setQ(''); setFailure(null); }}>Назад</button>
        </div>
      )}
    </Sheet>
  );
}

/* --------------------------------------------------------------------------
 * Список
 * -------------------------------------------------------------------------- */

export default function ProgramList({ list, scope, onScope, failure, onOpen, onAssign, onRemove, hidden, bar, onBlank, onCreated }) {
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [goal, setGoal] = useState('');
  const [filters, setFilters] = useState(NO_FILTERS);
  const [sheet, setSheet] = useState(null); // 'filter' | 'new'

  const all = list.data ? list.data.templates : [];
  const counts = list.data && list.data.counts;
  const goals = list.data ? list.data.goals : [];
  const opts = { q, goal, filters };
  const shown = shownPrograms(all, opts).filter((t) => !hidden(t.id));
  const active = filterCount(filters);
  const reset = () => { setQ(''); setGoal(''); setFilters(NO_FILTERS); };

  const scopeLabel = (text, n) => <>{text}{typeof n === 'number' && <em className="plib-count">{n}</em>}</>;

  return (
    <div className="plib">
      <div className="plib-bar">
        {searching
          ? <div className="plib-search"><Search value={q} onChange={setQ} placeholder="Название или цель" /></div>
          : (
            <Segmented track label="Чьи программы" value={scope} onChange={(v) => { haptic(); onScope(v); }}
              items={[{ value: 'mine', label: scopeLabel('Мои', counts && counts.mine) }, { value: 'public', label: scopeLabel('Общие', counts && counts.public) }]} />
          )}
        <button type="button" className="plib-ib" aria-label={searching ? 'Закрыть поиск' : 'Поиск'} aria-pressed={searching}
          onClick={() => { haptic(); if (searching) setQ(''); setSearching(!searching); }}>
          {searching ? <IconClose size={20} /> : <IconSearch size={20} />}
        </button>
        <button type="button" className="plib-ib plib-ib--add" aria-label="Новая программа" onClick={() => { haptic(); setSheet('new'); }}>
          <IconPlus size={22} />
        </button>
      </div>

      <div className="chips plib-chips" role="toolbar" aria-label="Цель и фильтры">
        <button type="button" className={'chip plib-chip' + (active ? ' chip--active' : '')} onClick={() => { haptic(); setSheet('filter'); }}>
          <IconSliders size={16} />Фильтры{active > 0 && <b className="plib-badge">{active}</b>}
        </button>
        {goals.length > 1 && <>
          <button type="button" className={'chip plib-chip' + (!goal ? ' chip--active' : '')} aria-pressed={!goal} onClick={() => { haptic(); setGoal(''); }}>Все</button>
          {goals.map((g) => (
            <button key={g} type="button" aria-pressed={goal === g} className={'chip plib-chip' + (goal === g ? ' chip--active' : '')} onClick={() => { haptic(); setGoal(goal === g ? '' : g); }}>
              <span className={'plib-dot plib-dot--sm plib-goal--' + goalLook(g).key}><GoalIcon goal={g} size={13} /></span>{g}
            </button>
          ))}
        </>}
      </div>

      {failure && <Note tone="critical" icon={IconAlert}>{failure.message}</Note>}
      {list.loading && <Loading lead={false} rows={3} />}
      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}

      {!list.loading && !list.error && all.length > 0 && shown.length === 0 && (
        <Empty icon={IconSearch} title="Ничего не нашлось" text="Под этот поиск и фильтры программ нет."
          action={<button type="button" className="button" onClick={reset}>Сбросить</button>} />
      )}
      {!list.loading && !list.error && all.length === 0 && (
        <Empty
          icon={scope === 'mine' ? IconPlan : IconSearch}
          title={scope === 'mine' ? 'Своих программ пока нет' : 'Общих программ пока нет'}
          text={scope === 'mine' ? 'Нажмите «+»: с нуля, из программы клиента или из общих.' : 'Здесь появятся программы, которыми поделились другие тренеры.'}
        />
      )}

      {shown.map((t, i) => {
        const card = (
          <button type="button" className="plib-card" style={{ '--i': Math.min(i, 8) }} onClick={() => { haptic(); onOpen(t); }}>
            <ProgramCard t={t} />
          </button>
        );
        if (!t.mine) return <div key={t.id} className="plib-row">{card}</div>;
        return (
          <SwipeRow key={t.id} className="plib-row plib-swipe" label={`Удалить «${t.title}»`} onDelete={() => onRemove(t)}
            extra={{ text: 'Назначить', label: `Назначить «${t.title}» клиенту`, icon: <IconSend size={20} />, onClick: () => { haptic(); onAssign(t); } }}>
            {card}
          </SwipeRow>
        );
      })}
      {bar}

      {sheet === 'filter' && <FilterSheet list={all} filters={filters} onChange={setFilters} onClose={() => setSheet(null)} count={shownPrograms(all, { q, goal, filters }).length} />}
      {sheet === 'new' && (
        <NewSheet
          mineList={scope === 'mine' ? all : []}
          onClose={() => setSheet(null)}
          onBlank={() => { setSheet(null); onBlank(); }}
          onPublic={() => { setSheet(null); onScope('public'); }}
          onCreated={(made) => { setSheet(null); onCreated(made); }}
        />
      )}
    </div>
  );
}
