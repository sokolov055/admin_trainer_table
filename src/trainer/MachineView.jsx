import React, { useState } from 'react';
import { BackButton, Sheet, Search, Note } from '../ui.jsx';
import { IconDumbbell, IconMore, IconLink, IconPen, IconTrash, IconCopy, IconSliders, IconAlert } from '../icons.jsx';
import { MachinePhoto } from '../media.jsx';
import { PinnedPhoto } from '../SetupSteps.jsx';
import { mediaUrl } from '../library.js';
import { Sticker, stickerFor, useStickerPack } from '../setup-stickers.jsx';
import { parseSetup } from './setup-text.js';
import { muscleClass, muscleTone } from '../data-tones.js';
import './machines-lib.css';

/** FT-819, этап 2: представление; все записи остаются у прежнего API. */
export default function MachineView({ machine: m, owner, exercises, onBack, onEdit, onDelete, onToggle, busy, failure, initialSheet = '' }) {
  useStickerPack();
  const [sheet, setSheet] = useState(initialSheet);
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');
  const groups = [...new Set(exercises.map(e => e.muscle).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
  const { steps, avoid } = parseSetup(m.setup, m.steps);
  const attached = new Set((m.uses || []).map((e) => e.id));
  const query = q.trim().toLocaleLowerCase('ru').replace(/ё/g,'е');
  const choices = exercises.filter(e => !group || e.muscle === group).filter((e) => !query || [e.name,e.muscle].some((s) => String(s || '').toLocaleLowerCase('ru').replace(/ё/g,'е').includes(query)))
    .sort((a,b) => Number(attached.has(b.id))-Number(attached.has(a.id)) || a.name.localeCompare(b.name,'ru'));
  const tone = muscleClass(muscleTone({group:m.muscleGroups?.[0]}));
  const photos = m.photos?.length || (m.photo ? 1 : 0);
  return <div className={'mlib-view '+tone}>
    <BackButton onClick={onBack} label="Тренажёры"/>
    <h2 className="mlib-view-title">{m.name}</h2>
    {m.originalName && <p className="mlib-desc">{m.originalName}</p>}
    {photos > 0 && <div className="mlib-pinned">
      <PinnedPhoto src={mediaUrl(m.photos?.[0] || m.photo)} pins={steps.flatMap((s,k)=>s.pin ? [{k,p:s.pin}] : [])}
        onPin={(k)=>document.getElementById('mlib-step-'+k)?.scrollIntoView({block:'center',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'})}/>
    </div>}
    {m.photos?.length > 1 && <MachinePhoto machine={{...m,photos:m.photos.slice(1),photo:''}}/>}
    <section className="mlib-section"><div className="mlib-section__head"><span className="mlib-section__icon"><IconSliders size={18}/></span><div><h3>{m.kind === 'equipment' ? 'Как использовать' : 'Как настроить'}</h3></div></div>
      {steps.length ? steps.map((s,i)=><div className="mlib-step" id={'mlib-step-'+i} key={i}><span className="mlib-sticker">{(s.sticker || stickerFor(s.label,s.main)) ? <Sticker id={s.sticker || stickerFor(s.label,s.main)}/> : <span>{i+1}</span>}</span><div className="mlib-grow">{s.label && <b>{s.label}</b>}<span className="mlib-step__main">{s.main}</span>{s.rest && <p>{s.rest}</p>}</div><span className="mlib-step__num">{i+1}</span></div>) : <p className="mlib-section__empty">Инструкции пока нет. Добавьте её в редакторе карточки.</p>}
      {!!avoid.length && <section className="mlib-errors"><h4>Частые ошибки</h4><div className="mlib-error-chips">{avoid.map((a,i)=><span key={i}>{a}</span>)}</div></section>}
      {!!m.fields?.length && <div className="mlib-section__empty"><b>Регулировки</b><p>{m.fields.join(' · ')}</p></div>}
    </section>
    <section className="mlib-section"><div className="mlib-section__head"><span className="mlib-section__icon"><IconLink size={18}/></span><div><h3>Связанные упражнения</h3></div></div>
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
      <Search value={q} onChange={setQ} placeholder="Поиск упражнения"/><div className="mlib-groups" aria-label="Мышечные группы">{['',...groups].map(g=><button type="button" key={g} aria-pressed={group === g} onClick={()=>setGroup(g)}>{g || 'Все мышцы'}</button>)}</div>
      {choices.map((e)=><button type="button" className="mlib-attach" aria-pressed={attached.has(e.id)} disabled={!!busy} key={e.id} onClick={()=>onToggle(e)}><span><b>{e.name}</b>{e.muscle && <small>{e.muscle}</small>}</span><span>{busy === e.id ? 'Сохраняем…' : attached.has(e.id) ? 'Привязано' : 'Привязать'}</span></button>)}
      {!choices.length && <p className="small muted">Упражнения не найдены.</p>}
      {failure && <Note tone="critical" icon={IconAlert}>{failure.message}</Note>}
    </Sheet>}
  </div>;
}
