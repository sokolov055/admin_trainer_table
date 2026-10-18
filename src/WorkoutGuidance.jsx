import React, { useState } from 'react';
import { resolveGuidance, instructionParts } from './equipment-guidance.js';
import { MachinePhoto, Media, SetupMistakes } from './media.jsx';
import { MuscleFigure, MuscleNames } from './muscles/MuscleMap.jsx';

/** Состояние раскрытия изолировано от состояния занятия. Медиа монтируются по запросу. */
export default function WorkoutGuidance({ info, trainer = false }) {
  const [open, setOpen] = useState(false);
  const g = resolveGuidance(info);
  const setup = instructionParts(g.setup);
  const technique = instructionParts(g.notes, g.mistakes);
  const hasMuscles = !!(g.muscles?.primary?.length || g.muscles?.secondary?.length);
  return <details className="workout__setup workout__about" onToggle={(e) => setOpen(e.currentTarget.open)}>
    <summary>{info.machines?.length ? 'Тренажёр и техника' : 'Техника выполнения'}</summary>
    {open && <>
      {g.primary && <section className="workout__guide">
        <h4 className="workout__guide-title">{g.primary.name}</h4>
        <MachinePhoto machine={g.primary} />
        {!!g.setup && <h5 className="workout__guide-title">Настройка оборудования</h5>}
        {setup.steps.length > 0 && <ul className="setup__steps">{setup.steps.map((s, i) => <li key={i}>{s}</li>)}</ul>}
        <SetupMistakes mistakes={setup.mistakes} />
        {trainer && !g.setup && <p className="small muted">Инструкция не заполнена или не проверена. Добавьте её в карточке оборудования через редактор упражнения.</p>}
      </section>}
      {!g.primary && g.source === 'exercise' && g.setup && <section className="workout__guide">
        <h4 className="workout__guide-title">Подготовка к упражнению</h4>
        {setup.steps.length > 0 && <ul className="setup__steps">{setup.steps.map((s, i) => <li key={i}>{s}</li>)}</ul>}
        <SetupMistakes mistakes={setup.mistakes} />
      </section>}
      {g.additional.length > 0 && <p className="small muted">{g.primary ? 'Дополнительно: ' : 'Оборудование: '}{g.additional.map((m) => m.name).join(', ')}</p>}
      {trainer && g.source === 'unselected' && <p className="small muted">Укажите основное оборудование в редакторе упражнения, чтобы показывать его настройку.</p>}
      {(g.media || technique.steps.length > 0 || technique.mistakes.length > 0) && <section className="workout__guide">
        <h4 className="workout__guide-title">Техника выполнения</h4>
        <Media media={g.media} />
        {technique.steps.length > 0 && <p className="workout__technique">{technique.steps.join('\n')}</p>}
        <SetupMistakes mistakes={technique.mistakes} />
      </section>}
      {hasMuscles && <details className="workout__setup workout__extra">
        <summary>Мышцы</summary>
        <div className="muscles muscles--block">
          <MuscleFigure primary={g.muscles.primary} secondary={g.muscles.secondary} size="sm" />
          <MuscleNames primary={g.muscles.primary} secondary={g.muscles.secondary} max={20} />
        </div>
      </details>}
    </>}
  </details>;
}
