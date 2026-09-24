import React, { useState } from 'react';
import { Panel, Segmented } from './ui.jsx';
import { getThemeMode, setThemeMode } from './telegram.js';

/**
 * Тема оформления.
 *
 * Общая для тренера и клиента: приложение открывают и в зале при верхнем
 * свете, и вечером дома, и выбор темы к роли отношения не имеет. Раньше
 * настройка жила только в панели тренера, и клиент оставался с той темой,
 * которую решила за него система.
 */

const ITEMS = [
  { value: 'auto', label: 'Авто' },
  { value: 'light', label: 'Светлая' },
  { value: 'dark', label: 'Тёмная' },
];

const HINTS = {
  auto: 'Как в Telegram: приложение переключается вместе с мессенджером, а вне его — вместе с системой.',
  light: 'Всегда светлая, даже если Telegram в тёмной теме.',
  dark: 'Всегда тёмная, даже если Telegram в светлой теме.',
};

export default function ThemeSetting() {
  // Читаем один раз при первом рендере: значение уже применено к странице
  // в telegram.js, и спрашивать хранилище на каждый рендер незачем.
  const [mode, setMode] = useState(getThemeMode);

  return (
    <Panel pad>
      <div className="setting">
        <div className="setting__label">Тема</div>
        <Segmented
          items={ITEMS}
          value={mode}
          label="Тема оформления"
          onChange={(next) => setMode(setThemeMode(next))}
        />
        <div className="setting__note">{HINTS[mode]}</div>
      </div>
    </Panel>
  );
}
