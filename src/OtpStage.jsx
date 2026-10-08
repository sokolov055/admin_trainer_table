import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { IconCheck } from './icons.jsx';

/**
 * Ввод кода и проверка номера — одной сценой (08.10.2026, FT-489).
 *
 * Образец — ролик, который прислал владелец: ячейки кода в ряд; набран
 * последний знак — ячейки разлетаются по кругу и кружат, пока идёт
 * проверка; подтвердилось — встают ровно и зеленеют, сжимаются в точку, из
 * точки — галочка в кольце. Не подтвердилось — возвращаются в ряд и
 * качаются, как «нет» головой.
 *
 * Движение здесь не украшение, а состояние: человек видит, что код ушёл и
 * его проверяют, без отдельного «Проверяем…». Сцена редкая — раз при входе,
 * поэтому ей можно быть заметной; при «Уменьшить движение» остаются только
 * смены состояний без полёта и кружения.
 *
 * phase: 'input' — ряд и ввод; 'checking' — круг и кружение; 'success' —
 * зелёные → точка → галочка, по окончании onSettled; 'error' — ряд, качание.
 * Для проверки звонком кода нет: readOnly и сразу 'checking'.
 */

const CELL = 40;
const GAP = 8;
const COLLAPSE_AFTER_MS = 520;
const CHECK_AFTER_MS = 380;
const SETTLE_AFTER_MS = 700;

function rowPos(i, n) {
  return { x: (i - (n - 1) / 2) * (CELL + GAP), y: 0 };
}

function ringPos(i, n) {
  const r = n <= 4 ? 46 : 56;
  const a = ((i * 360) / n - 90) * (Math.PI / 180);
  return { x: Math.round(r * Math.cos(a)), y: Math.round(r * Math.sin(a)) };
}

/** Текущий угол поворота кружащего круга — чтобы остановить его плавно */
function currentAngle(el) {
  const m = getComputedStyle(el).transform;
  if (!m || m === 'none') return 0;
  const [a, b] = m.slice(m.indexOf('(') + 1, -1).split(',').map(Number);
  return Math.round((Math.atan2(b, a) * 180) / Math.PI);
}

export default function OtpStage({
  length = 6, value = '', onChange, onComplete, phase = 'input', onSettled,
  readOnly = false, disabled = false, label = 'Код', autoFocus = false,
}) {
  const input = useRef(null);
  const orbit = useRef(null);
  const [step, setStep] = useState(phase); // success раскладывается на свои шаги
  const [stop, setStop] = useState(null);  // угол, где кружение остановили

  useEffect(() => {
    if (phase !== 'success') { setStep(phase); setStop(null); return undefined; }
    setStep('success');
    const t1 = setTimeout(() => setStep('collapse'), COLLAPSE_AFTER_MS);
    const t2 = setTimeout(() => setStep('done'), COLLAPSE_AFTER_MS + CHECK_AFTER_MS);
    const t3 = setTimeout(() => onSettled && onSettled(), COLLAPSE_AFTER_MS + CHECK_AFTER_MS + SETTLE_AFTER_MS);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [phase]);

  // Кружение останавливается не рывком: первый кадр — круг замирает там,
  // где был (кружение снято, угол тот же), следующий — плавно доходит до
  // ближайшего полного оборота, чтобы цифры встали ровно
  useLayoutEffect(() => {
    if (phase !== 'success' || !orbit.current || stop) return undefined;
    const from = currentAngle(orbit.current);
    setStop({ angle: from, moving: false });
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => {
      setStop({ angle: from > 0 ? 360 : 0, moving: true });
    }));
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  useEffect(() => {
    if (phase === 'input' && autoFocus && input.current && !readOnly) input.current.focus();
  }, [phase, autoFocus, readOnly]);

  const n = length;
  const chars = Array.from({ length: n }, (_, i) => value[i] || '');
  const ring = step !== 'input' && step !== 'error';
  const spinning = step === 'checking';
  const orbitStyle = stop
    ? { transform: `rotate(${stop.angle}deg)`, transition: stop.moving ? undefined : 'none' }
    : undefined;

  const type = (event) => {
    if (readOnly || disabled || phase !== 'input') return;
    const next = event.target.value.replace(/\D/g, '').slice(0, n);
    onChange && onChange(next);
    if (next.length === n && onComplete) onComplete(next);
  };

  return (
    <div className={'otp otp--' + step} style={{ '--otp-cell': CELL + 'px' }} onClick={() => input.current && input.current.focus()}>
      <div ref={orbit} className={'otp__orbit' + (spinning ? ' otp__orbit--spin' : '')} style={orbitStyle}>
        {chars.map((c, i) => {
          const p = ring ? ringPos(i, n) : rowPos(i, n);
          const active = step === 'input' && !readOnly && i === Math.min(value.length, n - 1);
          return (
            <span
              key={i}
              className={'otp__cell' + (c ? ' otp__cell--filled' : '') + (active ? ' otp__cell--active' : '')}
              style={{ transform: `translate(${p.x}px, ${p.y}px)`, transitionDelay: (ring ? i * 35 : (n - 1 - i) * 25) + 'ms' }}
            >
              {readOnly ? <span className="otp__dot" /> : c}
            </span>
          );
        })}
      </div>
      <span className="otp__core" aria-hidden="true" />
      <span className="otp__done" aria-hidden="true">
        <svg className="otp__halo" viewBox="0 0 72 72" width="72" height="72">
          <circle cx="36" cy="36" r="33" />
        </svg>
        <span className="otp__badge"><IconCheck size={22} /></span>
      </span>
      {!readOnly && (
        <input
          ref={input}
          className="otp__input"
          aria-label={label}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={n}
          value={value}
          onChange={type}
          disabled={disabled || phase !== 'input'}
        />
      )}
      <span className="sr-status" role="status">
        {step === 'checking' ? 'Проверяем' : step === 'done' ? 'Номер подтверждён' : step === 'error' ? 'Код не подошёл' : ''}
      </span>
    </div>
  );
}
