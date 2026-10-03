import React, { useState } from 'react';
import { Panel, Segmented } from './ui.jsx';
import { getRestSignal, setRestSignal } from './rest-alarm.js';

/**
 * Конец отдыха: звук и вибрация или только вибрация (владелец, 03.10.2026).
 *
 * Будильник iPhone (iOS 26+) звенит и в беззвучном режиме, а узнать, включён
 * ли беззвучный, приложение не может — поэтому выбор за человеком: в зале
 * удобнее, когда телефон только вибрирует по кругу. Настройка — этого
 * устройства, как тема.
 */

const ITEMS = [
  { value: 'sound', label: 'Звук и вибрация' },
  { value: 'vibrate', label: 'Только вибрация' },
];

const HINTS = {
  sound: 'Телефон звенит, как таймер, пока не нажмёте «Закрыть» — даже в беззвучном режиме.',
  vibrate: 'Телефон только вибрирует, пока не нажмёте «Закрыть». Звука нет совсем.',
};

export default function RestSignalSetting() {
  const [mode, setMode] = useState(getRestSignal);

  return (
    <Panel pad>
      <div className="setting">
        <div className="setting__label">Конец отдыха</div>
        <Segmented
          items={ITEMS}
          value={mode}
          label="Сигнал конца отдыха"
          onChange={(next) => setMode(setRestSignal(next))}
        />
        <div className="setting__note">{HINTS[mode]}</div>
      </div>
    </Panel>
  );
}
