import React, { useState } from 'react';
import { Search, Sheet, Segmented, Empty } from '../ui.jsx';
import { IconSearch, IconClose, IconPlus, IconSliders, IconBench, IconDumbbell, IconCamera, IconList } from '../icons.jsx';
import { muscleTone, muscleClass } from '../data-tones.js';
import { haptic } from '../telegram.js';
import { NO_MACHINE_FILTERS, machineFilterCount, shownMachines } from './machine-list-model.js';
import { mediaUrl } from '../library.js';
import './machines-lib.css';

/** Фото целиком; значок остаётся запасным вариантом без фото или при ошибке. */
function MachineCover({ photo, kind }) {
  const [failed, setFailed] = useState(false);
  const hasPhoto = !!photo && !failed;
  return <span className={'mlib-cover' + (hasPhoto ? ' mlib-cover--photo' : '')} aria-hidden="true">
    {hasPhoto ? <img src={mediaUrl(photo)} alt="" loading="lazy" draggable="false" onError={() => setFailed(true)} /> : kind === 'equipment' ? <IconDumbbell size={28} /> : <IconBench size={28} />}
  </span>;
}

const KINDS = [{ value: '', label: 'Все' }, { value: 'machine', label: 'Тренажёры' }, { value: 'equipment', label: 'Оборудование' }];
function Tiles({ label, values, value, onChange, cols = 3 }) {
  return <div className="mlib-tiles" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} role="radiogroup" aria-label={label}>{values.map(([key, title]) =>
    <button type="button" role="radio" aria-checked={value === key} className={'mlib-tile' + (value === key ? ' is-on' : '')} key={String(key)} onClick={() => { haptic(); onChange(key); }}>{title}</button>
  )}</div>;
}

/** Список отделён от просмотра и формы: их данные, UID и права не меняются. */
export default function MachineList({ list, onOpen, onCreate, state, setState }) {
  const { scope, q, search, kind, filters } = state;
  const setter = (key) => (value) => setState((s) => ({ ...s, [key]: typeof value === 'function' ? value(s[key]) : value }));
  const setScope = setter('scope'), setQ = setter('q'), setSearch = setter('search'), setKind = setter('kind'), setFilters = setter('filters');
  const [sheet, setSheet] = useState(false);
  const [create, setCreate] = useState(false);
  const count = machineFilterCount(filters);
  const scopeCount = list.filter((m) => !!m.mine === (scope === 'mine')).length;
  const narrowed = !!(q.trim() || kind || count);
  const shown = shownMachines(list, { scope, q, kind, filters });
  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));
  const reset = () => { setQ(''); setKind(''); setFilters({ ...NO_MACHINE_FILTERS }); };
  const brands = [...new Set(list.map((m) => m.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  const muscles = [...new Set(list.flatMap((m) => m.muscleGroups || []))].sort((a, b) => a.localeCompare(b, 'ru'));
  return <div className="mlib">
    <div className="mlib-bar">
      <div className="mlib-scope"><Segmented label="Чьи тренажёры" value={scope} onChange={setScope} items={[
          { value: 'mine', label: <span>Мои <em className="mlib-count">{list.filter((m) => m.mine).length}</em></span> },
          { value: 'public', label: <span>Общие <em className="mlib-count">{list.filter((m) => !m.mine).length}</em></span> },
        ]} /></div>
      <button type="button" className="mlib-ib" aria-label={search ? 'Закрыть поиск' : 'Поиск тренажёров'} aria-pressed={search} onClick={() => { setSearch(!search); if (search) setQ(''); haptic(); }}>{search ? <IconClose size={20} /> : <IconSearch size={20} />}</button>
      <button type="button" className="mlib-ib mlib-ib--add" aria-label="Новый тренажёр" onClick={() => { setCreate(true); haptic(); }}><IconPlus size={22} /></button>
    </div>
    {search && <div className="mlib-search"><Search value={q} onChange={setQ} placeholder="Название, бренд, упражнение" /></div>}
    <div className="chips mlib-chips" role="toolbar" aria-label="Тип и фильтры">
      <button type="button" className={'chip mlib-chip' + (count ? ' chip--active' : '')} onClick={() => { setSheet(true); haptic(); }}><IconSliders size={16} />Фильтры{count > 0 && <b className="mlib-badge">{count}</b>}</button>
      {KINDS.map((k) => <button type="button" key={k.value} aria-pressed={kind === k.value} className={'chip mlib-chip' + (kind === k.value ? ' chip--active' : '')} onClick={() => { setKind(k.value); haptic(); }}>{k.value && <span className={'mlib-dot' + (k.value === 'machine' ? ' mlib-dot--accent' : '')}>{k.value === 'machine' ? <IconBench size={13} /> : <IconDumbbell size={13} />}</span>}{k.label}</button>)}
    </div>
    {shown.map((m) => {
      const tone = muscleClass(muscleTone({ group: (m.muscleGroups || [])[0] }));
      return <button type="button" key={m.uid} className={'mlib-card ' + tone} onClick={() => { onOpen(m.uid); haptic(); }}>
        <MachineCover key={m.photos?.[0] || m.photo || ''} photo={m.photos?.[0] || m.photo || ''} kind={m.kind} />
        <span className="mlib-body"><span className="mlib-name">{m.name}</span>
          {!!m.muscleGroups?.length && <span className="mlib-muscle">{m.muscleGroups.join(', ')}</span>}
          <span className="mlib-facts"><span><IconDumbbell size={14} />{(m.uses || []).length} упр.</span>{m.weightStep > 0 && <span><IconSliders size={14} />{String(m.weightStep).replace('.', ',')} кг</span>}</span>
          {m.brand && <span className="mlib-author">{m.brand}</span>}
        </span>
        <span className="mlib-side"><span className="mlib-flags"><span className={m.photos?.length ? 'is-on' : ''} aria-label={m.photos?.length ? `${m.photos.length} фото` : 'Без фото'}><IconCamera size={15} /></span><span className={m.setup ? 'is-on' : ''} aria-label={m.setup ? 'Настройка добавлена' : 'Нет инструкции'}><IconList size={15} /></span></span><span className="mlib-free">{!m.mine ? 'общая' : !(m.uses || []).length ? 'без связей' : ''}</span></span>
      </button>;
    })}
    {!shown.length && <>
      <Empty icon={IconSearch}
        title={narrowed && scopeCount ? 'Ничего не нашлось' : scope === 'mine' ? 'Пока нет своих карточек' : 'Пока нет общих карточек'}
        text={narrowed && scopeCount ? `В разделе «${scope === 'mine' ? 'Мои' : 'Общие'}» нет карточек под этот поиск и фильтры.` : scope === 'mine' ? 'Создайте карточку тренажёра или оборудования либо посмотрите общие карточки.' : 'Общих тренажёров и оборудования пока нет. Можно создать свою карточку.'} />
      {narrowed && scopeCount ? <button type="button" className="button button--primary button--block" onClick={reset}>Сбросить</button> : <button type="button" className="button button--primary button--block" onClick={() => setCreate(true)}>Новая карточка</button>}
    </>}

    {sheet && <Sheet title="Фильтры" className="mlib-sheet" onClose={() => setSheet(false)} action={count ? <button type="button" className="button button--ghost" onClick={() => setFilters({ ...NO_MACHINE_FILTERS, sort: filters.sort })}>Сбросить</button> : null}>
      <div className="mlib-filter"><h4>Производитель</h4><Tiles label="Производитель" value={filters.brand} onChange={(brand) => set({ brand })} values={[[ '', 'Все' ], ...brands.map((b) => [b, b]), ['—', 'Без бренда']]} />
        <h4>Мышечная группа</h4><Tiles label="Мышечная группа" value={filters.muscle} onChange={(muscle) => set({ muscle })} values={[[ '', 'Все' ], ...muscles.map((m) => [m, m])]} />
        <h4>Связи с упражнениями</h4><Tiles cols={2} label="Связи с упражнениями" value={filters.missing} onChange={(missing) => set({ missing })} values={[[false, 'Все карточки'], [true, 'Без упражнений']]} />
        <h4>Порядок</h4><div className="mlib-order"><Segmented track label="Порядок" value={filters.sort} onChange={(sort) => set({ sort })} items={[{ value: 'recent', label: 'Недавние' }, { value: 'uses', label: 'Частые' }, { value: 'az', label: 'А–Я' }]} /></div>
        <button type="button" className="button button--primary button--block mlib-go" onClick={() => setSheet(false)}>{shown.length ? `Показать: ${shown.length}` : 'Ничего не нашлось'}</button>
      </div>
    </Sheet>}
    {create && <Sheet title="Новая карточка" className="mlib-sheet" onClose={() => setCreate(false)}><div className="mlib-tiles">{KINDS.filter((k) => k.value).map((k) => <button type="button" key={k.value} className="mlib-tile" onClick={() => { setCreate(false); onCreate(k.value); }}>{k.value === 'machine' ? <IconBench size={24} /> : <IconDumbbell size={24} />}<b>{k.value === 'machine' ? 'Тренажёр' : 'Оборудование'}</b></button>)}</div></Sheet>}
  </div>;
}
