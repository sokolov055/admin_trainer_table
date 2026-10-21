import React, { useState } from 'react';
import { Panel, Segmented } from './ui.jsx';
import { getThemeMode, setThemeMode } from './telegram.js';
import { withColorShift } from './palettes.js';

/**
 * Тема оформления.
 *
 * Общая для тренера и клиента: приложение открывают и в зале при верхнем
 * свете, и вечером дома, и выбор темы к роли отношения не имеет. Раньше
 * настройка жила только в панели тренера, и клиент оставался с той темой,
 * которую решила за него система.
 *
 * С 21.10.2026 живёт в «Оформлении» (Appearance.jsx) под заголовком
 * раздела — bare убирает свою подпись «Тема», чтобы не повторять его.
 * Смена — с мягким переходом цвета (palettes.js, withColorShift).
 */

const ITEMS = [
  { value: 'auto', label: 'Авто' },
  { value: 'light', label: 'Светлая' },
  { value: 'dark', label: 'Тёмная' },
];

const HINTS = {
  auto: 'Как в системе: приложение переключается вместе с телефоном.',
  light: 'Всегда светлая, даже если телефон в тёмной теме.',
  dark: 'Всегда тёмная, даже если телефон в светлой теме.',
};

export default function ThemeSetting({ bare = false }) {
  // Читаем один раз при первом рендере: значение уже применено к странице
  // в telegram.js, и спрашивать хранилище на каждый рендер незачем.
  const [mode, setMode] = useState(getThemeMode);

  return (
    <Panel pad>
      <div className="setting">
        {!bare && <div className="setting__label">Тема</div>}
        <Segmented
          items={ITEMS}
          value={mode}
          label="Тема оформления"
          onChange={(next) => withColorShift(() => setMode(setThemeMode(next)))}
        />
        <div className="setting__note">{HINTS[mode]}</div>
      </div>
    </Panel>
  );
}
