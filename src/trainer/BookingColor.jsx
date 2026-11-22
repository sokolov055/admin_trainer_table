import React from 'react';

const COLORS = [
  [null, 'По типу события'],
  ['teal', 'Бирюзовый'],
  ['purple', 'Фиолетовый'],
  ['orange', 'Оранжевый'],
  ['pink', 'Розовый'],
  ['green', 'Зелёный'],
];

export function BookingColor({ value, onChange, disabled, preview }) {
  return (
    <div className="cal-color">
      <span className="field__label">Цвет плашки</span>
      <div className="cal-color__options" role="group" aria-label="Цвет плашки">
        {COLORS.map(([color, label]) => (
          <button type="button" key={label} className="option" data-event-color={color}
            aria-label={label} aria-pressed={value === color} title={label} disabled={disabled} onClick={() => onChange(color)}>
            {color ? <i aria-hidden="true" /> : 'Авто'}
          </button>
        ))}
      </div>
      {preview && <div className="cal-color__preview" data-event-color={value}>{preview}</div>}
    </div>
  );
}
