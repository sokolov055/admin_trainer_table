import React, { useState } from 'react';
import { resolveGuidance, guideSteps, stepLabel } from './equipment-guidance.js';
import { MachinePhoto, Media } from './media.jsx';
import { MuscleFigure, MuscleNames } from './muscles/MuscleMap.jsx';

/** Шаги одной нумерацией: start — сколько шагов уже было выше */
function Steps({ lines, start = 0 }) {
  return <ol className="guide__steps" style={{ counterReset: `guide ${start}` }}>
    {lines.map((line, i) => {
      const { label, text } = stepLabel(line);
      return <li key={i}><span>{label ? <><b>{label}</b> — {text}</> : text}</span></li>;
    })}
  </ol>;
}

function stepsWord(n) {
  const d = n % 10, h = n % 100;
  if (d === 1 && h !== 11) return 'шаг';
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return 'шага';
  return 'шагов';
}

/**
 * Вариант А (18.10.2026): тренажёр, видео (если есть — сразу развёрнуто),
 * «Подготовка» и «Движение» одной нумерацией, одно «Чего избегать», мышцы.
 * Состояние раскрытия изолировано от состояния занятия.
 */
export default function WorkoutGuidance({ info, trainer = false }) {
  const [open, setOpen] = useState(false);
  const [figure, setFigure] = useState(false);
  const g = resolveGuidance(info);
  const { prep, move, mistakes } = guideSteps(g);
  const total = prep.length + move.length;
  const both = prep.length > 0 && move.length > 0;
  const hasMuscles = !!(g.muscles?.primary?.length || g.muscles?.secondary?.length);
  const meta = [g.primary?.name, total ? total + ' ' + stepsWord(total) : '', g.media ? 'видео' : ''].filter(Boolean).join(' · ');
  return <details className="workout__setup workout__about" onToggle={(e) => setOpen(e.currentTarget.open)}>
    <summary>
      <span>{info.machines?.length ? 'Тренажёр и техника' : 'Техника выполнения'}</span>
      {!open && meta && <span className="guide__meta">{meta}</span>}
    </summary>
    {open && <div className="guide">
      {g.primary && <div className="guide__machine">
        <p className="guide__machine-name">{g.primary.name}</p>
        <MachinePhoto machine={g.primary} />
      </div>}
      {g.additional.length > 0 && <p className="small muted">{g.primary ? 'Дополнительно: ' : 'Оборудование: '}{g.additional.map((m) => m.name).join(', ')}</p>}
      <Media media={g.media} />
      {prep.length > 0 && <section className="guide__group">
        {both && <h4 className="guide__h">Подготовка</h4>}
        <Steps lines={prep} />
      </section>}
      {move.length > 0 && <section className="guide__group">
        {both && <h4 className="guide__h">Движение</h4>}
        <Steps lines={move} start={prep.length} />
      </section>}
      {mistakes.length > 0 && <section className="guide__avoid">
        <h4 className="guide__h">Чего избегать</h4>
        <ul>{mistakes.map((m, i) => <li key={i}>{m}</li>)}</ul>
      </section>}
      {trainer && g.primary && !g.setup && <p className="small muted">Настройка тренажёра не заполнена или не проверена. Добавьте её в карточке оборудования через редактор упражнения.</p>}
      {trainer && g.source === 'unselected' && <p className="small muted">Укажите основное оборудование в редакторе упражнения, чтобы показывать его настройку.</p>}
      {hasMuscles && <section className="guide__muscles">
        <div className="guide__muscles-head">
          <h4 className="guide__h">Мышцы</h4>
          <button type="button" className="guide__link" aria-expanded={figure} onClick={() => setFigure(!figure)}>{figure ? 'Скрыть схему' : 'Схема'}</button>
        </div>
        {figure
          ? <div className="muscles muscles--block">
            <MuscleFigure primary={g.muscles.primary} secondary={g.muscles.secondary} size="sm" />
            <MuscleNames primary={g.muscles.primary} secondary={g.muscles.secondary} max={20} />
          </div>
          : <MuscleNames primary={g.muscles.primary} secondary={g.muscles.secondary} max={20} />}
      </section>}
    </div>}
  </details>;
}
