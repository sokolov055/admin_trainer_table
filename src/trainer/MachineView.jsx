import React, { useState } from 'react';
import { BackButton, Sheet, Search, Note } from '../ui.jsx';
import { IconBench, IconDumbbell, IconMore, IconLink, IconPen, IconTrash, IconCopy, IconSliders, IconAlert } from '../icons.jsx';
import { MachinePhoto } from '../media.jsx';
import { PinnedPhoto } from '../SetupSteps.jsx';
import { mediaUrl } from '../library.js';
import { Sticker } from '../setup-stickers.jsx';
import { parseSetup } from './setup-text.js';
import { muscleClass, muscleTone } from '../data-tones.js';
import './machines-lib.css';

/** FT-819, этап 2: представление; все записи остаются у прежнего API. */
export default function MachineView({ machine: m, owner, exercises, onBack, onEdit, onDelete, onToggle, busy, failure }) {
  const [sheet, setSheet] = useState('');
  const [q, setQ] = useState('');
  const { steps, avoid } = parseSetup(m.setup, m.steps);
  const attached = new Set((m.uses || []).map((e) => e.id));
  const query = q.trim().toLocaleLowerCase('ru').replace(/ё/g,'е');
  const choices = exercises.filter((e) => !query || [e.name,e.muscle].some((s) => String(s || '').toLocaleLowerCase('ru').replace(/ё/g,'е').includes(query)))
    .sort((a,b) => Number(attached.has(b.id))-Number(attached.has(a.id)) || a.name.localeCompare(b.name,'ru'));
  const KindIcon = m.kind === 'equipment' ? IconDumbbell : IconBench;
  const tone = muscleClass(muscleTone({group:m.muscleGroups?.[0]}));
  const photos = m.photos?.length || (m.photo ? 1 : 0);
  return <div className={'mlib-view '+tone}>
    <BackButton onClick={onBack} label="Тренажёры"/>
    <div className="mlib-hero"><span className="mlib-hero__big" aria-hidden="true"><KindIcon size={130}/></span>
      <div className="mlib-hero__goal">{m.muscleGroups?.join(', ') || (m.kind === 'equipment' ? 'Оборудование' : 'Тренажёр')}</div>
      <h2 className="mlib-hero__title">{m.name}</h2>
      <div className="mlib-hero__pills"><span className="mlib-pill"><KindIcon size={13}/>{m.kind === 'equipment' ? 'Оборудование' : 'Тренажёр'}</span>{m.brand && <span className="mlib-pill">{m.brand}</span>}</div>
      <div className="mlib-hero__stats">{[[(m.uses || []).length,'упражнений'],[photos,'фото'],[steps.length,'шага'],[m.weightStep ? String(m.weightStep).replace('.',',') : '—','шаг, кг']].map(([n,label])=><div key={label}><b>{n}</b><span>{label}</span></div>)}</div>
    </div>
    {m.originalName && <p className="mlib-desc">{m.originalName}</p>}
    {photos > 0 && <div className="mlib-pinned">
      <PinnedPhoto src={mediaUrl(m.photos?.[0] || m.photo)} pins={steps.flatMap((s,k)=>s.pin ? [{k,p:s.pin}] : [])}
        onPin={(k)=>document.getElementById('mlib-step-'+k)?.scrollIntoView({block:'center',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'})}/>
    </div>}
    {m.photos?.length > 1 && <MachinePhoto machine={{...m,photos:m.photos.slice(1),photo:''}}/>}
    <section className="mlib-section"><div className="mlib-section__head"><span className="mlib-section__icon"><IconSliders size={18}/></span><div><h3>{m.kind === 'equipment' ? 'Как использовать' : 'Как настроить'}</h3><small>{m.setupOk === true ? 'Инструкция проверена' : 'Пошаговая инструкция'}</small></div></div>
      {steps.length ? steps.map((s,i)=><div className="mlib-step" id={'mlib-step-'+i} key={i}><span className="mlib-sticker">{s.sticker ? <Sticker id={s.sticker}/> : <IconSliders size={24}/>}</span><div className="mlib-grow">{s.label && <small>{s.label}</small>}<b>{s.main}</b>{s.rest && <p>{s.rest}</p>}</div><span className="mlib-step__num">{i+1}</span></div>) : <p className="mlib-section__empty">Инструкции пока нет. Добавьте её в редакторе карточки.</p>}
      {!!avoid.length && <div className="mlib-section__empty"><b>Частые ошибки</b><p>{avoid.join(', ')}</p></div>}
      {!!m.fields?.length && <div className="mlib-section__empty"><b>Регулировки</b><p>{m.fields.join(' · ')}</p></div>}
    </section>
    <section className="mlib-section"><div className="mlib-section__head"><span className="mlib-section__icon">{attached.size}</span><div><h3>Связанные упражнения</h3><small>{attached.size} упр.</small></div></div>
      {(m.uses || []).map((e)=><div className="mlib-step" key={e.id}><span className="mlib-section__icon"><IconDumbbell size={20}/></span><div className="mlib-grow"><b>{e.name}</b>{e.muscle && <small>{e.muscle}</small>}</div></div>)}
      {!attached.size && <p className="mlib-section__empty">Упражнения можно привязать сейчас или позже.</p>}
    </section>
    {failure && !sheet && <Note tone="critical" icon={IconAlert}>{failure.message}</Note>}
    <div className="mlib-dock"><button type="button" className="mlib-dock__main" onClick={()=>setSheet('attach')}><IconLink size={18}/>Привязать упражнения</button><button type="button" className="mlib-dock__ib" aria-label="Ещё" onClick={()=>setSheet('more')}><IconMore size={20}/></button></div>
    {sheet === 'more' && <Sheet title="Действия" onClose={()=>setSheet('')}><div className="mlib-menu">
      <button type="button" onClick={()=>{setSheet('');onEdit();}}>{m.mine || owner ? <IconPen size={20}/> : <IconCopy size={20}/>}<span>Изменить карточку{!m.mine && !owner && <small>Будет создана ваша личная версия</small>}</span></button>
      {(m.mine || owner) && <button type="button" className="mlib-menu__danger" onClick={()=>{setSheet('');onDelete();}}><IconTrash size={20}/>Удалить</button>}
    </div></Sheet>}
    {sheet === 'attach' && <Sheet title="Привязать упражнения" locked={!!busy} onClose={()=>setSheet('')}>
      {!m.mine && !owner && <p className="small muted">Изменения сохранятся в вашей личной версии карточки.</p>}
      <Search value={q} onChange={setQ} placeholder="Поиск упражнения"/>
      {choices.map((e)=><button type="button" className="mlib-attach" aria-pressed={attached.has(e.id)} disabled={!!busy} key={e.id} onClick={()=>onToggle(e)}><span><b>{e.name}</b>{e.muscle && <small>{e.muscle}</small>}</span><span>{busy === e.id ? 'Сохраняем…' : attached.has(e.id) ? 'Привязано' : 'Привязать'}</span></button>)}
      {!choices.length && <p className="small muted">Упражнения не найдены.</p>}
      {failure && <Note tone="critical" icon={IconAlert}>{failure.message}</Note>}
    </Sheet>}
  </div>;
}
