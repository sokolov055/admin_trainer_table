import SwipeRow from '../SwipeRow.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { Search, Sheet, Segmented, Empty, plural } from '../ui.jsx';
import {
  IconSearch, IconClose, IconPlus, IconSliders, IconBench, IconDumbbell, IconBody, IconHeart,
  IconBolt, IconPlay, IconList, IconCopy, IconEye, IconChevron, IconUsers,
} from '../icons.jsx';
import { muscleTone, muscleClass } from '../data-tones.js';
import { haptic } from '../telegram.js';
import { NO_EXERCISE_FILTERS, LOAD_TILES, exerciseFilterCount, shownExercises, loadLabel, coverOf } from './exercise-list-model.js';
import { mediaUrl } from '../library.js';
import './exercises-lib.css';

const LIMIT = 200;

/** Кадр 3D-ролика: тихое видео, первый кадр; грузится, только когда обложка в экране */
function ClipCover({ src }) {
  const ref = useRef(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setOn(true); return undefined; }
    const io = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setOn(true); io.disconnect(); } }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <span ref={ref} className="elib-cover__clip">{on && <video className="elib-cover__img" src={src + '#t=0.1'} muted playsInline preload="metadata" disablePictureInPicture />}</span>;
}
const SCOPE_ITEMS = [{ value: 'mine', mine: true }, { value: 'public', mine: false }];

function Tiles({ label, items, onToggle }) {
  return <div className="elib-tiles" role="group" aria-label={label}>{items.map(({ key, title, icon, on }) =>
    <button type="button" key={key} aria-pressed={on} className={'elib-tile' + (on ? ' is-on' : '')} onClick={() => { haptic(); onToggle(key); }}>{icon}<span>{title}</span></button>
  )}</div>;
}

function MenuRow({ icon, title, text, onClick }) {
  return <button type="button" className="elib-mi" onClick={onClick}>
    <span className="elib-mi__ic">{icon}</span><span className="elib-mi__txt"><b>{title}</b>{text && <small>{text}</small>}</span><IconChevron size={18} className="elib-mi__go" />
  </button>;
}

/** Список отделён от карточки и формы: данные, права и личные версии не меняются */
export default function ExerciseList({ list, muscles, hiddenCount = 0, onOpen, onCreate, onDelete, onSimilar, onHidden, state, setState }) {
  const { scope, q, search, muscle, filters } = state;
  const setter = (key) => (value) => setState((s) => ({ ...s, [key]: typeof value === 'function' ? value(s[key]) : value }));
  const setScope = setter('scope'), setQ = setter('q'), setSearch = setter('search'), setMuscle = setter('muscle'), setFilters = setter('filters');
  const [sheet, setSheet] = useState(false);
  const [create, setCreate] = useState(false);
  const count = exerciseFilterCount(filters);
  const scopeCount = list.filter((e) => !!e.mine === (scope === 'mine')).length;
  const narrowed = !!(q.trim() || muscle || count);
  const all = shownExercises(list, { scope, q, muscle, filters });
  const shown = all.slice(0, LIMIT);
  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));
  const toggle = (key) => (value) => set({ [key]: filters[key] === value ? '' : value });
  const reset = () => { setQ(''); setMuscle(''); setFilters({ ...NO_EXERCISE_FILTERS, sort: filters.sort }); };
  const chips = [...muscles.map((m) => [m, m]), ['—', 'Без группы']];
  const toneOf = (e) => muscleClass(muscleTone({ group: e.muscle }));
  const fromPublic = () => { setCreate(false); setScope('public'); setSearch(true); };

  return <div className="elib">
    <div className="elib-bar">
      <div className="elib-scope"><Segmented label="Чьи упражнения" value={scope} onChange={setScope} items={SCOPE_ITEMS.map(({ value, mine }) => (
        { value, label: <span>{mine ? 'Мои' : 'Общие'} <em className="elib-count">{list.filter((e) => !!e.mine === mine).length}</em></span> }
      ))} /></div>
      <button type="button" className="elib-ib" aria-label={search ? 'Закрыть поиск' : 'Поиск упражнений'} aria-pressed={search} onClick={() => { setSearch(!search); if (search) setQ(''); haptic(); }}>{search ? <IconClose size={20} /> : <IconSearch size={20} />}</button>
      <button type="button" className="elib-ib elib-ib--add" aria-label="Новое упражнение" onClick={() => { setCreate(true); haptic(); }}><IconPlus size={22} /></button>
    </div>
    {search && <div className="elib-search"><Search value={q} onChange={setQ} placeholder="Название или мышца" /></div>}
    <div className="chips elib-chips" role="toolbar" aria-label="Фильтры и группы мышц">
      <button type="button" className={'chip elib-chip elib-chip--filter' + (count ? ' chip--active' : '')} onClick={() => { setSheet(true); haptic(); }}><IconSliders size={16} />Фильтры{count > 0 && <b className="elib-badge">{count}</b>}</button>
      <button type="button" aria-pressed={!muscle} className={'chip elib-chip' + (!muscle ? ' chip--active' : '')} onClick={() => { setMuscle(''); haptic(); }}>Все</button>
      {chips.map(([value, title]) => <button type="button" key={value} aria-pressed={muscle === value} className={'chip elib-chip ' + (value === '—' ? '' : toneOf({ muscle: value })) + (muscle === value ? ' chip--active' : '')} onClick={() => { setMuscle(muscle === value ? '' : value); haptic(); }}>
        <span className="elib-dot" aria-hidden="true">{value === 'Кардио' ? <IconHeart size={13} /> : <IconBody size={13} />}</span>{title}
      </button>)}
    </div>
    {shown.map((e) => {
      const machines = (e.machines || []).length;
      const cover = coverOf(e.media, (import.meta.env && import.meta.env.BASE_URL) || '/', mediaUrl);
      const card = <button type="button" className={'elib-card ' + toneOf(e)} onClick={() => { onOpen(e.id); haptic(); }}>
        <span className={'elib-cover' + (cover ? ' elib-cover--photo' : '')} aria-hidden="true">
          {cover?.type === 'clip' ? <ClipCover src={cover.src} /> : cover ? <img className="elib-cover__img" src={cover.src} alt="" loading="lazy" draggable="false" /> : (e.muscle === 'Кардио' ? <IconHeart size={28} /> : <IconBody size={28} />)}
          {e.media && <span className="elib-cover__play"><IconPlay size={10} /></span>}
        </span>
        <span className="elib-body"><span className="elib-name">{e.name}</span>
          {e.muscle && <span className="elib-muscle">{e.muscle}</span>}
          <span className="elib-facts"><span><IconBolt size={14} />{loadLabel(e)}</span>
            {machines > 0 ? <span><IconBench size={14} />{machines} {plural(machines, 'тренажёр', 'тренажёра', 'тренажёров')}</span> : e.equipment ? <span><IconDumbbell size={14} />{e.equipment}</span> : null}</span>
        </span>
        <span className="elib-side"><span className="elib-flags">
          <span className={e.media ? 'is-on' : ''} role="img" aria-label={e.media ? 'Есть видео' : 'Нет видео'}><IconPlay size={15} /></span>
          <span className={String(e.setup || '').trim() ? 'is-on' : ''} role="img" aria-label={String(e.setup || '').trim() ? 'Есть техника' : 'Нет техники'}><IconList size={15} /></span>
        </span><span className="elib-free">{e.common ? 'общее' : ''}</span></span>
      </button>;
      return onDelete ? <SwipeRow key={e.id} className="elib-swipe" label={(e.common ? 'Убрать «' : 'Удалить «') + e.name + '»'} actionText={e.common ? 'Убрать' : 'Удалить'} onDelete={() => onDelete(e)}>{card}</SwipeRow> : <React.Fragment key={e.id}>{card}</React.Fragment>;
    })}
    {all.length > LIMIT && <p className="small muted">Показаны первые {LIMIT} — уточните поиск.</p>}
    {!shown.length && <>
      <Empty icon={IconSearch}
        title={narrowed && scopeCount ? 'Ничего не нашлось' : scope === 'mine' ? 'Своих упражнений пока нет' : 'Общих упражнений пока нет'}
        text={narrowed && scopeCount ? `В разделе «${scope === 'mine' ? 'Мои' : 'Общие'}» нет упражнений под этот поиск и фильтры.` : 'Нажмите «+»: создайте с нуля или найдите в общих.'} />
      {narrowed && scopeCount ? <button type="button" className="button button--primary button--block" onClick={reset}>Сбросить</button>
        : scope === 'mine' ? <button type="button" className="button button--primary button--block" onClick={fromPublic}>Из общих</button> : null}
    </>}

    {sheet && <Sheet title="Фильтры" className="elib-sheet" onClose={() => setSheet(false)} action={count ? <button type="button" className="button button--ghost" onClick={() => setFilters({ ...NO_EXERCISE_FILTERS, sort: filters.sort })}>Сбросить</button> : null}>
      <div className="elib-filter">
        <h4>Как учитывается нагрузка</h4>
        <Tiles label="Как учитывается нагрузка" onToggle={toggle('load')} items={LOAD_TILES.map(([key, title]) => ({ key, title, on: filters.load === key }))} />
        <h4>Оборудование</h4>
        <Tiles label="Оборудование" onToggle={toggle('gear')} items={[
          { key: 'machine', title: 'Тренажёр', icon: <IconBench size={18} />, on: filters.gear === 'machine' },
          { key: 'equipment', title: 'Инвентарь', icon: <IconDumbbell size={18} />, on: filters.gear === 'equipment' },
          { key: 'none', title: 'Без привязки', on: filters.gear === 'none' },
        ]} />
        <h4>Показать</h4>
        <Tiles label="Показать" onToggle={(key) => set({ [key]: !filters[key] })} items={[
          { key: 'media', title: 'С видео', icon: <IconPlay size={16} />, on: filters.media },
          { key: 'noSetup', title: 'Без техники', icon: <IconList size={16} />, on: filters.noSetup },
        ]} />
        <h4>Порядок</h4>
        <div className="elib-order"><Segmented track label="Порядок" value={filters.sort} onChange={(sort) => set({ sort })} items={[{ value: 'recent', label: 'Недавние' }, { value: 'az', label: 'А–Я' }]} /></div>
        <h4>Служебное</h4>
        <MenuRow icon={<IconCopy size={20} />} title="Похожие упражнения" text="Найти дубли и объединить" onClick={() => { setSheet(false); onSimilar(); }} />
        {hiddenCount > 0 && <MenuRow icon={<IconEye size={20} />} title="Убранные" text={hiddenCount + ' ' + plural(hiddenCount, 'упражнение', 'упражнения', 'упражнений') + ' — можно вернуть'} onClick={() => { setSheet(false); onHidden(); }} />}
        <button type="button" className="button button--primary button--block elib-go" onClick={() => setSheet(false)}>{all.length ? `Показать: ${all.length}` : 'Ничего не нашлось'}</button>
      </div>
    </Sheet>}
    {create && <Sheet title="Новое упражнение" className="elib-sheet" onClose={() => setCreate(false)}>
      <MenuRow icon={<IconPlus size={20} />} title="С нуля" text="Название и группа мышц — остальное в карточке" onClick={() => { setCreate(false); onCreate(); }} />
      <MenuRow icon={<IconUsers size={20} />} title="Из общих" text="Найти в общей базе — любая правка создаст вашу версию" onClick={fromPublic} />
    </Sheet>}
  </div>;
}
