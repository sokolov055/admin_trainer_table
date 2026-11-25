import React, { useState } from 'react';
import { BackButton, Sheet } from '../ui.jsx';
import { IconBody, IconHeart, IconAlert, IconList, IconMore, IconTrash, IconEye } from '../icons.jsx';
import { Media } from '../media.jsx';
import { MuscleNames } from '../muscles/MuscleMap.jsx';
import { muscleTone, muscleClass } from '../data-tones.js';
import { haptic } from '../telegram.js';
import { MachinesEditor, AlternativesEditor } from './MachinesEditor.jsx';
import { linesOf, cardFacts, showSetup, commonNotice, removeLabel } from './exercise-view-model.js';
import './exercises-lib.css';

function Box({ icon, title, children, className = '' }) {
  return <section className={'elib-box ' + className}>
    {title && <h3 className="elib-box__h"><span className="elib-box__ic" aria-hidden="true">{icon}</span>{title}</h3>}
    {children}
  </section>;
}

function Steps({ items }) {
  return <ol className="elib-steps">{items.map((s, i) => <li key={i}>{s}</li>)}</ol>;
}

/** Подпись на медиа — как в макете: анимация и 3D-ролик с манекеном */
const MEDIA_CAPTION = { animation: 'Анимация', clip: 'Ролик с манекеном' };

/** Карточка упражнения: только просмотр, правка — кнопкой «Изменить» внизу */
export default function ExerciseCardView({ exercise: e, owner, all, onBack, onEdit, onOpen, onChanged, onRemove }) {
  const [menu, setMenu] = useState(false);
  const steps = linesOf(e.notes);
  const mistakes = linesOf(e.mistakes);
  const notice = commonNotice(e);
  const tone = muscleClass(muscleTone({ group: e.muscle }));

  return <div className="elib-view">
    <BackButton label="Упражнения" onClick={onBack} />
    {notice && <p className="elib-notice">{notice}</p>}

    <section className={'elib-hero ' + tone}>
      <span className="elib-hero__big" aria-hidden="true">{e.muscle === 'Кардио' ? <IconHeart size={120} /> : <IconBody size={120} />}</span>
      <p className="elib-hero__g">{e.muscle || 'Без группы'} · {e.mine ? 'своё' : 'общее'}</p>
      <h2 className="elib-hero__name">{e.name}</h2>
      <dl className="elib-stats">{cardFacts(e).map((f) => <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl>
    </section>

    {e.media
      ? <div className="elib-media"><Media media={e.media} />{MEDIA_CAPTION[e.media.kind] && <span className="elib-media__cap">{MEDIA_CAPTION[e.media.kind]}</span>}</div>
      : <div className="elib-drop"><b>Видео нет</b>Добавьте в «Изменить» — ссылку или файл</div>}

    <Box icon={<IconList size={18} />} title="Как делать">
      {steps.length
        ? <Steps items={steps} />
        : <p className="elib-hint">Техника пока не описана. «Изменить» → «Техника выполнения».</p>}
      {mistakes.length > 0 && <div className="elib-err">
        <h4><IconAlert size={16} />Частые ошибки</h4>
        <ul>{mistakes.map((s, i) => <li key={i}>{s}</li>)}</ul>
      </div>}
    </Box>

    {showSetup(e) && <Box icon={<IconList size={18} />} title="Подготовка"><Steps items={linesOf(e.setup)} /></Box>}

    <Box icon={<IconBody size={18} />} title="Нагрузка на мышцы">
      {e.musclesCustom
        ? <MuscleNames primary={e.muscles?.primary || []} secondary={e.muscles?.secondary || []} max={20} />
        : <p className="elib-hint">Нагрузка считается по группе: {e.muscle || 'не указана'}.</p>}
    </Box>

    <div className="elib-box elib-box--flush">
      <MachinesEditor exercise={e} owner={owner} onChanged={onChanged} />
    </div>

    <div className="elib-box elib-box--flush">
      <AlternativesEditor exercise={e} owner={owner} all={all} onChanged={onChanged} onOpen={onOpen} />
    </div>

    <div className="elib-dock">
      <button type="button" className="button button--primary elib-dock__main" onClick={() => { haptic(); onEdit(); }}>Изменить</button>
      <button type="button" className="elib-ib" aria-label="Ещё" onClick={() => { haptic(); setMenu(true); }}><IconMore size={20} /></button>
    </div>

    {menu && <Sheet title="Упражнение" className="elib-sheet" onClose={() => setMenu(false)}>
      <button type="button" className="elib-mi elib-mi--danger" onClick={() => { setMenu(false); onRemove(); }}>
        <span className="elib-mi__ic">{e.mine ? <IconTrash size={20} /> : <IconEye size={20} />}</span>
        <span className="elib-mi__txt"><b>{removeLabel(e)}</b><small>{e.mine ? 'Можно вернуть несколько секунд' : 'Можно вернуть несколько секунд и позже в «Убранных»'}</small></span>
      </button>
    </Sheet>}
  </div>;
}
