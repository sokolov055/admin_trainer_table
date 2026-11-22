import React, { useState } from 'react';
import { Wheel, range } from '../client/Wheel.jsx';
import { Options } from '../ui.jsx';
import { clampDuration, MAX_BOOKING_MINUTES, MIN_BOOKING_MINUTES } from './quick-booking.js';
import '../client/onboarding.css';

const MAX_HOURS = MAX_BOOKING_MINUTES / 60;
const HOURS = range(0, MAX_HOURS);
const MINUTES = range(0, 59);
const FIRST_HOUR_MINUTES = range(MIN_BOOKING_MINUTES, 59);
const LAST_HOUR_MINUTES = [0];
const padded = (value) => String(value).padStart(2, '0');

export function BookingDuration({ value, onChange, presets, disabled }) {
  const [custom, setCustom] = useState(false);
  const hours = Math.floor(value / 60);
  const mins = value % 60;
  const minuteValues = hours === 0 ? FIRST_HOUR_MINUTES : hours === MAX_HOURS ? LAST_HOUR_MINUTES : MINUTES;

  return (
    <div className="cal-quick__chips cal-duration">
      <div className="field__label">Длительность · {hours}:{padded(mins)}</div>
      <div className="cal-duration__actions">
        <Options items={presets.map((m) => ({ value: m, label: m + ' мин' }))}
          value={value} onChange={(m) => { setCustom(false); onChange(m); }} label="Длительность" disabled={disabled} />
        <button type="button" className="button" aria-expanded={custom} disabled={disabled}
          onClick={() => setCustom((open) => !open)}>Своя…</button>
      </div>
      {custom && !disabled && (
        <div className="cal-duration__wheels" data-no-gestures="">
          <Wheel values={HOURS} value={hours} label="Часы" format={padded}
            onChange={(next) => onChange(clampDuration(next * 60 + mins))} />
          <span aria-hidden="true">:</span>
          <Wheel key={minuteValues[0] + ':' + minuteValues.length} values={minuteValues} value={mins}
            label="Минуты" format={padded} onChange={(next) => onChange(hours * 60 + next)} />
        </div>
      )}
    </div>
  );
}
