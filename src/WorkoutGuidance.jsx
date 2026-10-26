import React, { useState } from 'react';
import { resolveGuidance, guideSteps, stepLabel, instructionParts } from './equipment-guidance.js';
import { MachinePhoto, Media, PersonalNote, machineTarget } from './media.jsx';
import { MuscleFigure, MuscleNames } from './muscles/MuscleMap.jsx';
import { Sheet } from './ui.jsx';
import { IconPlay } from './icons.jsx';

/** Шаги одной нумерацией: start — сколько шагов уже было выше */
function Steps({ lines, start = 0 }) {
  return <ol className="guide__steps" style={{ counterReset: `guide ${start}` }}>
    {lines.map((line, i) => {
      const { label, text } = stepLabel(line);
      return <li key={i}><span>{label ? <><b>{label}</b> — {text}</> : text}</span></li>;
    })}
  </ol>;
}

function Avoid({ mistakes }) {
  if (!mistakes.length) return null;
  return <section className="guide__avoid">
    <h4 className="guide__h">Чего избегать</h4>
    <ul>{mistakes.map((m, i) => <li key={i}>{m}</li>)}</ul>
  </section>;
}

function stepsWord(n) {
  const d = n % 10, h = n % 100;
  if (d === 1 && h !== 11) return 'шаг';
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return 'шага';
  return 'шагов';
}

const capital = (m) => m.charAt(0).toLocaleUpperCase('ru') + m.slice(1);

/** Лист снизу; без настоящей страницы (проверки компонента) — на месте */
function GuideSheet({ title, onClose, children }) {
  const dom = typeof document !== 'undefined' && !!document.body && document.body.nodeType === 1;
  return dom
    ? <Sheet title={title} onClose={onClose} className="guide-sheet">{children}</Sheet>
    : <div className="guide-sheet">{children}</div>;
}

/**
 * Вариант А (18.10.2026): тренажёр, видео (если есть — сразу развёрнуто),
 * «Подготовка» и «Движение» одной нумерацией, одно «Чего избегать», мышцы.
 * Состояние раскрытия изолировано от состояния занятия.
 */
// title — чьё это упражнение: в круге суперсета разделы идут подряд
// chip — кнопка «Техника» в шапке упражнения (вариант А3, владелец,
// 24.10.2026): листом снизу — анимация, схема мышц и короткая техника.
// Тренажёр и его настройка — отдельной кнопкой (MachineGuide)
export default function WorkoutGuidance({ info, trainer = false, title = '', chip = false }) {
  const [open, setOpen] = useState(false);
  const [figure, setFigure] = useState(false);
  const g = resolveGuidance(info);
  const hasMuscles = !!(g.muscles?.primary?.length || g.muscles?.secondary?.length);
  if (chip) {
    // Подготовка у тренажёра — в его листе; без тренажёра она здесь, но
    // только пока у упражнения нет своей техники (тексты — три пункта,
    // главное из подготовки уже в них)
    const tech = instructionParts(g.notes, g.mistakes);
    const fromSetup = !tech.steps.length && !info.machines?.length;
    const own = fromSetup ? instructionParts(g.setup) : tech;
    const lines = own.steps;
    const mistakes = own.mistakes.map(capital);
    const meta = [lines.length ? lines.length + ' ' + stepsWord(lines.length) : '', g.media ? 'видео' : ''].filter(Boolean).join(' · ');
    return <>
      <button type="button" className="workout__chip workout__about" aria-haspopup="dialog" aria-expanded={open}
        aria-label={'Техника' + (meta ? ': ' + meta : '')} onClick={() => setOpen(true)}>
        <IconPlay size={16} aria-hidden="true" />Техника
      </button>
      {open && <GuideSheet title="Техника" onClose={() => setOpen(false)}>
        <div className="guide">
          <Media media={g.media} />
          {hasMuscles && <section className="guide__muscles guide__muscles--top">
            <div className="guide__figure"><MuscleFigure primary={g.muscles.primary} secondary={g.muscles.secondary} size="lg" captions /></div>
            <MuscleNames primary={g.muscles.primary} secondary={g.muscles.secondary} max={20} />
          </section>}
          {lines.length > 0 && <Steps lines={lines} />}
          <Avoid mistakes={mistakes} />
          {trainer && g.source === 'unselected' && <p className="small muted">Укажите основное оборудование в редакторе упражнения, чтобы показывать его настройку.</p>}
        </div>
      </GuideSheet>}
    </>;
  }
  const { prep, move, mistakes } = guideSteps(g);
  const total = prep.length + move.length;
  const both = prep.length > 0 && move.length > 0;
  const meta = [g.primary?.name, total ? total + ' ' + stepsWord(total) : '', g.media ? 'видео' : ''].filter(Boolean).join(' · ');
  return <details className="workout__setup workout__about" onToggle={(e) => setOpen(e.currentTarget.open)}>
    <summary>
      <span>{title ? title + ': ' : ''}{info.machines?.length ? (title ? 'тренажёр и техника' : 'Тренажёр и техника') : (title ? 'техника выполнения' : 'Техника выполнения')}</span>
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
      <Avoid mistakes={mistakes} />
      {trainer && g.primary && !g.setup && <p className="small muted">Настройка тренажёра не заполнена или не проверена. Добавьте её в карточке оборудования через редактор упражнения.</p>}
      {trainer && g.source === 'unselected' && <p className="small muted">Укажите основное оборудование в редакторе упражнения, чтобы показывать его настройку.</p>}
      {hasMuscles && <section className="guide__muscles">
        <div className="guide__muscles-head">
          <h4 className="guide__h">Мышцы</h4>
          <button type="button" className="guide__link" aria-expanded={figure} onClick={() => setFigure(!figure)}>{figure ? 'Скрыть схему' : 'Схема'}</button>
        </div>
        {/* Схема крупно, по центру (владелец: «мелковата») — подписи под ней */}
        {figure && <div className="guide__figure"><MuscleFigure primary={g.muscles.primary} secondary={g.muscles.secondary} size="lg" captions /></div>}
        <MuscleNames primary={g.muscles.primary} secondary={g.muscles.secondary} max={20} />
      </section>}
    </div>}
  </details>;
}

/**
 * «Тренажёр» рядом с настройкой клиента (вариант А3, владелец, 24.10.2026):
 * листом — фото, настройка клиента и как выставить тренажёр. Основной —
 * первым, дополнительное оборудование (скамья к штанге) — под ним.
 * notes — настройки клиента { 'm:<uid>': { text, by } }
 */
export function MachineGuide({ info, notes = {}, trainer = false }) {
  const [open, setOpen] = useState(false);
  const g = resolveGuidance(info);
  const list = [g.primary, ...g.additional].filter(Boolean);
  if (!list.length) return null;
  const name = list.map((m) => m.name).join(', ');
  return <>
    <button type="button" className="workout__chip workout__machine-btn" aria-haspopup="dialog" aria-expanded={open}
      aria-label={'Тренажёр: ' + name} onClick={() => setOpen(true)}>
      <IconBench />Тренажёр
    </button>
    {open && <GuideSheet title="Тренажёр" onClose={() => setOpen(false)}>
      <div className="guide">
        {list.map((m) => {
          const setup = m.setupOk === false ? { steps: [], mistakes: [] } : instructionParts(m.setup);
          const note = notes[machineTarget(info, m.uid)];
          return <section key={m.uid} className="guide__machine">
            <p className="guide__machine-name">{m.name}</p>
            {/* Настройка клиента — до фото: в зале смотрят ради неё */}
            {note && <PersonalNote text={note.text} trainer={trainer} by={note.by} local={!!note.local} shared={!!note.shared} />}
            <MachinePhoto machine={m} />
            {setup.steps.length > 0 && <section className="guide__group">
              <h4 className="guide__h">Как настроить</h4>
              <Steps lines={setup.steps} />
            </section>}
            <Avoid mistakes={setup.mistakes.map(capital)} />
            {trainer && !setup.steps.length && <p className="small muted">Настройка тренажёра не заполнена или не проверена. Добавьте её в карточке оборудования через редактор упражнения.</p>}
          </section>;
        })}
      </div>
    </GuideSheet>}
  </>;
}

/** Скамья — значок кнопки «Тренажёр» */
function IconBench() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 14h12l5-7" /><path d="M6 14v5M14 14v5M2 9h4M4 7v4" />
  </svg>;
}
