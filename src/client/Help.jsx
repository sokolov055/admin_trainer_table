import React, { useState } from 'react';
import { Section, Panel } from '../ui.jsx';
import { IconHome, IconPlan, IconProgress, IconNutrition, IconGuide, IconChevron } from '../icons.jsx';
import { haptic } from '../telegram.js';
import { passedTours } from './tour-model.js';
import './help.css';

/**
 * «Как пользоваться» из меню (21.10.2026, пункт 5 плана трёх разборов;
 * образец — «Help» в SmartGym). Раньше пункт сразу открывал инструкцию
 * кадрами; теперь сверху короткие туры по разделам — пройти заново в
 * любой момент, — под ними та же инструкция, с нужного кадра.
 *
 * «Пройден» — отметка на этом устройстве (tour-model.js): тур дошли до
 * «Готово». Прервали — остаётся «новое».
 */

// Часы — своим значком на сетке 24×24, как в icons.jsx
const IconWatch = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <rect x="6" y="6" width="12" height="12" rx="3.5" />
    <path d="M9 6l.6-3h4.8l.6 3M9 18l.6 3h4.8l.6-3M12 9.5V12l1.5 1.5" />
  </svg>
);

const ICONS = { overview: IconHome, workout: IconPlan, progress: IconProgress, nutrition: IconNutrition, watch: IconWatch };

// tours — разделы (tourSections); frames — кадры инструкции; onTour(id) —
// запустить тур раздела; onGuide(i) — открыть инструкцию с кадра i
export default function Help({ tours = [], frames = [], onTour, onGuide }) {
  const [passed] = useState(passedTours);
  return (
    <>
      {tours.length > 0 && (
        <Section title="Короткие туры" note="Подсветим кнопки прямо на экране. 3–4 шага, можно прервать.">
          <Panel>
            <ul className="help-list">
              {tours.map((t) => {
                const Icon = ICONS[t.id] || IconGuide;
                const done = passed.includes(t.id);
                return (
                  <li key={t.id}>
                    <button type="button" className="help-row" onClick={() => { haptic(); onTour(t.id); }}>
                      <span className="help-row__icon"><Icon size={20} /></span>
                      <span className="help-row__text">
                        <strong>{t.title}</strong>
                        <span>{t.note}</span>
                      </span>
                      <span className={'help-row__status' + (done ? '' : ' is-new')}>{done ? 'пройден' : 'новое'}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Panel>
        </Section>
      )}

      {frames.length > 0 && (
        <Section title="Инструкция" note="Короткие экраны с картинками — по разделам">
          <Panel>
            <ul className="help-list">
              {frames.map((f, i) => (
                <li key={f.id || i}>
                  <button type="button" className="help-row help-row--plain" onClick={() => { haptic(); onGuide(i); }}>
                    <span className="help-row__text"><strong>{f.heading}</strong></span>
                    <IconChevron size={18} className="help-row__chevron" />
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        </Section>
      )}
    </>
  );
}
