import React, { useState } from 'react';
import { Panel, Section } from './ui.jsx';
import ThemeSetting from './ThemeSetting.jsx';
import ThemeMascot from './ThemeMascot.jsx';
import { PALETTES, getPaletteId, setPaletteId, forcedScheme } from './palettes.js';
import { haptic, refreshTheme } from './telegram.js';
import { IconCheck, IconHome, IconPlan, IconProgress, IconNutrition, IconPlus } from './icons.jsx';
import './appearance.css';

/**
 * «Оформление» (21.10.2026): тема и персональные цвета — пункт бокового
 * меню у клиента и у тренера. Раньше тема жила в «Настройках» между
 * напоминаниями и поддержкой; вкус к цвету — не настройка поведения.
 *
 * Как в Telegram: сверху живой образец, под ним тема и сетка палитр.
 * Образец собран из тех же токенов, что и приложение, поэтому показывает
 * ровно то, что будет на экранах, — и в светлой, и в тёмной теме.
 */

export default function Appearance() {
  // Палитра — здесь, а не в сетке: «Хэллоуин» сам ставит тёмную тему, и
  // переключатель темы должен об этом знать (FT-702)
  const [palette, setPalette] = useState(getPaletteId);
  const pick = (id) => {
    setPalette(setPaletteId(id));
    refreshTheme();
  };
  return (
    <>
      <LookPreview />
      <Section title="Тема">
        <ThemeSetting bare forced={forcedScheme(palette)} />
      </Section>
      <Section title="Персональные цвета" note="Кнопки, вкладки, выделение и фон. Запоминается на этом устройстве.">
        <PalettePicker current={palette} onPick={pick} />
      </Section>
    </>
  );
}

/** Мини-экран: карточка с кольцом и чипом, кнопка, «+» и нижнее меню */
function LookPreview() {
  // Кольцо 3 из 4: длина окружности r=20 — 125,7
  const C = 125.7;
  return (
    <div className="look-preview" aria-hidden="true">
      <div className="look-preview__card">
        <svg className="look-preview__ring" width="52" height="52" viewBox="0 0 52 52">
          <circle cx="26" cy="26" r="20" />
          <circle cx="26" cy="26" r="20" className="look-preview__arc" strokeDasharray={C} strokeDashoffset={C * 0.25} />
          <text x="26" y="30.5" textAnchor="middle">3/4</text>
        </svg>
        <div className="look-preview__body">
          <span className="look-preview__eyebrow">Сегодня</span>
          <strong className="look-preview__title">Тренировка 2 — ноги</strong>
          <span className="look-preview__chips">
            <span className="look-preview__chip look-preview__chip--on">Силовая</span>
            <span className="look-preview__chip">45 мин</span>
          </span>
        </div>
      </div>
      <div className="look-preview__row">
        <span className="look-preview__button">Начать тренировку</span>
        <span className="look-preview__link">Вся программа</span>
      </div>
      <div className="look-preview__tabbar">
        <span className="is-on"><IconHome size={20} /></span>
        <span><IconPlan size={20} /></span>
        <span className="look-preview__plus"><IconPlus size={20} /><ThemeMascot className="look-preview__mascot" size={46} /></span>
        <span><IconProgress size={20} /></span>
        <span><IconNutrition size={20} /></span>
      </div>
    </div>
  );
}

function PalettePicker({ current, onPick }) {
  const pick = (id) => {
    if (id === current) return;
    haptic('light');
    onPick(id);
  };

  return (
    <Panel pad>
      <div className="palettes" role="radiogroup" aria-label="Персональные цвета">
        {PALETTES.map((p) => {
          const on = p.id === current;
          const [a, b, c] = p.swatch;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={on}
              className={'palette' + (on ? ' is-on' : '')}
              onClick={() => pick(p.id)}
            >
              <span
                className="palette__disc"
                style={{ background: `conic-gradient(from 225deg, ${a} 0deg 180deg, ${b} 180deg 270deg, ${c} 270deg 360deg)` }}
              >
                {on && <span className="palette__check"><IconCheck size={14} strokeWidth={2.5} /></span>}
              </span>
              <span className="palette__name">{p.name}</span>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}
