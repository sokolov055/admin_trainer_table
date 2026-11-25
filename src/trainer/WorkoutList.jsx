import React, { useState } from 'react';
import { useData } from '../useData.js';
import { apiMutate } from '../api.js';
import { haptic } from '../telegram.js';
import { Sheet, Loading, ErrorState, Empty, Note, Search, plural } from '../ui.jsx';
import { IconSearch, IconPlus, IconClock, IconList, IconPlan, IconUsers, IconSend, IconCopy, IconAlert, IconHome, IconBench, IconBack } from '../icons.jsx';
import SwipeRow from '../SwipeRow.jsx';
import { ExerciseThumb } from '../client/PlanCard.jsx';
import { PLACES } from '../client/programs-model.js';
import { goalLook } from './program-list-model.js';
import { shownWorkouts, workoutFilterCount, WORKOUT_NO_FILTERS } from './workout-list-model.js';
import { GoalIcon, GoalChips, ListBar, Tiles } from './ProgramList.jsx';
import './programs-lib.css';

/**
 * Список тренировок «Библиотеки» (этап 1 макета «Библиотека → Тренировки»,
 * 25.11.2026): тот же каркас, что у программ — «Мои · Общие», поиск, цели,
 * «Фильтры», «+». Карточка — обложка цели, упражнения, ≈ минуты, лента
 * картинок первых упражнений и где стоит. Смахнуть — «Назначить» и «Удалить»
 * у своей, «К себе» у общей.
 *
 * Открытие, назначение и удаление — у Templates (Library.jsx), сюда приходят
 * колбэками.
 */

function WorkoutCard({ t }) {
  const look = goalLook(t.goal);
  const place = PLACES[t.place];
  const programs = t.inPrograms || [];
  const thumbs = t.thumbs || [];
  return (
    <>
      <span className={'plib-cover plib-goal--' + look.key} aria-hidden="true"><GoalIcon goal={t.goal} size={28} /></span>
      <span className="plib-body">
        <span className="plib-name">{t.title}</span>
        {t.goal && <span className={'plib-goalname plib-goaltext--' + look.key}>{t.goal}</span>}
        <span className="plib-facts">
          <span><IconList size={14} />{t.exercises} упр</span>
          {t.minutes > 0 && <span><IconClock size={14} />{t.minutesAuto ? '≈ ' : ''}{t.minutes} мин</span>}
          {place && <span>{t.place === 'home' ? <IconHome size={14} /> : <IconBench size={14} />}{place}</span>}
        </span>
        <span className="plib-wfoot">
          {thumbs.length > 0 && (
            <span className="plib-thumbs plib-thumbs--card" aria-hidden="true">
              {thumbs.map((th, i) => <ExerciseThumb key={i} ex={{ exercise: th, muscles: th.muscles }} className="plib-thumbs__i" />)}
              {t.exercises > thumbs.length && <i className="plib-thumbs__more">+{t.exercises - thumbs.length}</i>}
            </span>
          )}
          {!t.mine && <span className="plib-author">{t.author}</span>}
          {t.mine && (programs.length
            ? <span className="plib-tag">в {programs.length} {plural(programs.length, 'программе', 'программах', 'программах')}</span>
            : <span className="plib-free">не в программах</span>)}
        </span>
      </span>
      {t.mine && (
        <span className="plib-side">
          <span className="plib-flags">
            <span className={t.isPublic ? 'is-on' : ''} title={t.isPublic ? 'Общая для тренеров' : 'Только у вас'}><IconUsers size={15} /></span>
          </span>
        </span>
      )}
    </>
  );
}

/* --------------------------------------------------------------------------
 * Лист «Фильтры»
 * -------------------------------------------------------------------------- */

const SHOW_ITEMS = [
  { value: '', label: 'Все' },
  { value: 'inprog', label: 'В программах' },
  { value: 'shared', label: 'Общие' },
];
const SORT_ITEMS = [
  { value: 'recent', label: 'Недавние' },
  { value: 'uses', label: 'Чаще назначаю' },
  { value: 'az', label: 'По алфавиту' },
];

function FilterSheet({ filters, onChange, onClose, count }) {
  const [f, setF] = useState(filters);
  const set = (patch) => { const next = { ...f, ...patch }; setF(next); onChange(next); };
  return (
    <Sheet title="Фильтры" onClose={onClose} action={workoutFilterCount(f) ? <button type="button" className="button button--ghost" onClick={() => { haptic(); set({ ...WORKOUT_NO_FILTERS, sort: f.sort }); }}>Сбросить</button> : null}>
      <div className="plib-filter">
        <h4>Показать</h4>
        <Tiles label="Показать" value={f.show} onChange={(v) => set({ show: v })} items={SHOW_ITEMS} />
        <h4>Порядок</h4>
        <Tiles label="Порядок" value={f.sort} onChange={(v) => set({ sort: v || 'recent' })} items={SORT_ITEMS} />
        <button type="button" className="button button--primary button--block plib-filter__go" onClick={onClose}>
          {count ? `Показать: ${count}` : 'Ничего не нашлось'}
        </button>
      </div>
    </Sheet>
  );
}

/* --------------------------------------------------------------------------
 * Лист «Новая тренировка»
 * -------------------------------------------------------------------------- */

/** Своя тренировка — копия: выбор из своих */
function CopyPick({ match, busy, onPick }) {
  const mine = useData('library.templates', { scope: 'mine', kind: 'workout' }, []);
  if (mine.loading) return <Loading lead={false} rows={3} />;
  if (mine.error) return <ErrorState error={mine.error} onRetry={mine.reload} />;
  const items = (mine.data ? mine.data.templates : []).filter((t) => match(t.title));
  if (!items.length) return <Note>Своих тренировок пока нет.</Note>;
  return items.map((t) => (
    <button key={t.id} type="button" className="plib-menu__item" disabled={busy} onClick={() => onPick(t)}>
      <span className={'plib-cover plib-cover--sm plib-goal--' + goalLook(t.goal).key}><GoalIcon goal={t.goal} size={18} /></span>
      <span><b>{t.title}</b>{t.goal && <small>{t.goal}</small>}</span>
    </button>
  ));
}

/** Тренировки одной своей программы — каждая становится шаблоном тренировки */
function ProgramWorkouts({ program, match, busy, onPick }) {
  const { loading, data, error, reload } = useData('library.template.get', { id: program.id }, [program.id]);
  if (loading) return <Loading lead={false} rows={3} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const blocks = (data ? data.blocks : []).filter((b) => match(b.title || program.title));
  return blocks.map((b, i) => (
    <button key={i} type="button" className="plib-menu__item" disabled={busy} onClick={() => onPick(b)}>
      <span className="plib-menu__icon"><IconPlan size={20} /></span>
      <span><b>{b.title || 'Тренировка ' + (i + 1)}</b><small>{b.exercises.length} {plural(b.exercises.length, 'упражнение', 'упражнения', 'упражнений')}</small></span>
    </button>
  ));
}

/** Из программы: сначала программа, потом её тренировка; поиск — на каждом шаге свой */
function ProgramPick({ match, busy, onPick, onProgram }) {
  const [program, setProgram] = useState(null);
  const programs = useData('library.templates', { scope: 'mine', kind: 'program' }, []);
  if (program) {
    return (
      <>
        <button type="button" className="plib-back" onClick={() => { onProgram(); setProgram(null); }}><IconBack size={18} />{program.title}</button>
        <ProgramWorkouts program={program} match={match} busy={busy} onPick={(b) => onPick(program, b)} />
      </>
    );
  }
  if (programs.loading) return <Loading lead={false} rows={3} />;
  if (programs.error) return <ErrorState error={programs.error} onRetry={programs.reload} />;
  const items = (programs.data ? programs.data.templates : []).filter((t) => match(t.title));
  if (!items.length) return <Note>Своих программ пока нет.</Note>;
  return items.map((t) => (
    <button key={t.id} type="button" className="plib-menu__item" disabled={busy} onClick={() => { onProgram(); setProgram(t); }}>
      <span className={'plib-cover plib-cover--sm plib-goal--' + goalLook(t.goal).key}><GoalIcon goal={t.goal} size={18} /></span>
      <span><b>{t.title}</b>{t.goal && <small>{t.goal}</small>}</span>
    </button>
  ));
}

function NewSheet({ onClose, onBlank, onCreated }) {
  const [step, setStep] = useState('menu');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);

  const run = async (fn) => {
    setBusy(true);
    setFailure(null);
    try { const made = await fn(); haptic('success'); onCreated(made); } catch (err) { setFailure(err); } finally { setBusy(false); }
  };
  const match = (text) => !q || (text || '').toLowerCase().includes(q.toLowerCase());
  const back = () => { setStep('menu'); setQ(''); setFailure(null); };

  const items = [
    { key: 'blank', icon: <IconPlus size={22} />, title: 'Пустая', text: 'Сразу выбор упражнений', go: onBlank },
    { key: 'copy', icon: <IconCopy size={22} />, title: 'Копия моей тренировки', text: 'Например, «Ноги» полегче', go: () => setStep('copy') },
    { key: 'prog', icon: <IconPlan size={22} />, title: 'Из тренировки программы', text: 'Выбрать программу, затем тренировку', go: () => setStep('prog') },
  ];

  const saveFromProgram = (program, block) => run(() => apiMutate('library.template.save', {
    kind: 'workout',
    title: block.title || program.title,
    goal: program.goal || '',
    level: program.level || '',
    description: 'Из программы «' + program.title + '»',
    blocks: [block],
  }));

  const title = step === 'copy' ? 'Копия какой' : step === 'prog' ? 'Чья программа' : 'Новая тренировка';

  return (
    <Sheet title={title} onClose={onClose} locked={busy}>
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
          <Search value={q} onChange={setQ} placeholder={step === 'copy' ? 'Поиск тренировки' : 'Поиск программы'} />
          {failure && <Note tone="critical" icon={IconAlert}>{failure.message}</Note>}
          {step === 'copy' && (
            <CopyPick match={match} busy={busy}
              onPick={(t) => run(() => apiMutate('library.template.copy', { id: t.id }))} />
          )}
          {step === 'prog' && (
            <ProgramPick match={match} busy={busy}
              onProgram={() => setQ('')}
              onPick={(program, block) => saveFromProgram(program, block)} />
          )}
          <button type="button" className="button button--ghost button--block" disabled={busy} onClick={back}>Назад</button>
        </div>
      )}
    </Sheet>
  );
}

/* --------------------------------------------------------------------------
 * Список
 * -------------------------------------------------------------------------- */

export default function WorkoutList({ list, scope, onScope, failure, onOpen, onAssign, onCopy, onRemove, hidden, bar, onBlank, onCreated }) {
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [goal, setGoal] = useState('');
  const [filters, setFilters] = useState(WORKOUT_NO_FILTERS);
  const [sheet, setSheet] = useState(null); // 'filter' | 'new'

  const all = list.data ? list.data.templates : [];
  const counts = list.data && list.data.counts;
  const goals = list.data ? list.data.goals : [];
  const shown = shownWorkouts(all, { q, goal, filters }).filter((t) => !hidden(t.id));
  const active = workoutFilterCount(filters);
  const reset = () => { setQ(''); setGoal(''); setFilters(WORKOUT_NO_FILTERS); };

  return (
    <div className="plib">
      <ListBar label="Чьи тренировки" scope={scope} onScope={onScope} counts={counts} q={q} setQ={setQ} searching={searching} setSearching={setSearching}
        searchPlaceholder="Название тренировки" addLabel="Новая тренировка" onAdd={() => setSheet('new')} />
      <GoalChips active={active} onFilters={() => setSheet('filter')} goals={goals} goal={goal} onGoal={setGoal} />

      {failure && <Note tone="critical" icon={IconAlert}>{failure.message}</Note>}
      {list.loading && <Loading lead={false} rows={3} />}
      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}

      {!list.loading && !list.error && all.length > 0 && shown.length === 0 && (
        <Empty icon={IconSearch} title="Ничего не нашлось" text="Под этот поиск и фильтры тренировок нет."
          action={<button type="button" className="button" onClick={reset}>Сбросить</button>} />
      )}
      {!list.loading && !list.error && all.length === 0 && (
        <Empty
          icon={scope === 'mine' ? IconPlan : IconSearch}
          title={scope === 'mine' ? 'Своих тренировок пока нет' : 'Общих тренировок пока нет'}
          text={scope === 'mine' ? 'Нажмите «+»: пустая, копия своей или тренировка из программы.' : 'Здесь появятся тренировки, которыми поделились другие тренеры.'}
        />
      )}

      {shown.map((t, i) => {
        const card = (
          <button type="button" className="plib-card" style={{ '--i': Math.min(i, 8) }} onClick={() => { haptic(); onOpen(t); }}>
            <WorkoutCard t={t} />
          </button>
        );
        if (!t.mine) {
          return (
            <SwipeRow key={t.id} className="plib-row plib-swipe" extra={{ text: 'К себе', label: `Скопировать «${t.title}» к себе`, icon: <IconCopy size={20} />, onClick: () => { haptic(); onCopy(t); } }}>
              {card}
            </SwipeRow>
          );
        }
        return (
          <SwipeRow key={t.id} className="plib-row plib-swipe" label={`Удалить «${t.title}»`} onDelete={() => onRemove(t)}
            extra={{ text: 'Назначить', label: `Назначить «${t.title}» клиенту`, icon: <IconSend size={20} />, onClick: () => { haptic(); onAssign(t); } }}>
            {card}
          </SwipeRow>
        );
      })}
      {bar}

      {sheet === 'filter' && <FilterSheet filters={filters} onChange={setFilters} onClose={() => setSheet(null)} count={shownWorkouts(all, { q, goal, filters }).length} />}
      {sheet === 'new' && (
        <NewSheet
          onClose={() => setSheet(null)}
          onBlank={() => { setSheet(null); onBlank(); }}
          onCreated={(made) => { setSheet(null); onCreated(made); }}
        />
      )}
    </div>
  );
}
