import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconCheck, IconClose } from './icons.jsx';

/**
 * Ввод кода и проверка — одной сценой (FT-489, FT-574; ролик владельца
 * 15.10.2026).
 *
 * Набрана цифра — по рамке её ячейки пробегает светлая дуга. Набран
 * последний знак — за рядом проступает тонкая окружность и точка в центре,
 * ячейки встают на неё, круг раскручивается с ускорением (около полусекунды),
 * кружит, пока идёт проверка, плавно тормозит и встаёт так, что цифры
 * стоят прямо. Верно — ячейки загораются зелёным, по спирали стягиваются в
 * центр, оттуда — галочка в кольце и искры. Неверно — то же красным и
 * крестик; потом снова пустой ряд (onSettled('error')).
 *
 * Движение здесь не украшение, а состояние: человек видит, что код ушёл и
 * его проверяют. Кручение ведётся покадрово (requestAnimationFrame): CSS не
 * умеет «разогнаться, а затем остановиться там, где цифры стоят прямо».
 * При «Уменьшить движение» остаются только смены состояний.
 *
 * phase (от родителя): 'input' — ряд и ввод; 'checking' — круг и кружение;
 * 'success' / 'error' — ответ пришёл: круг тормозит и показывает исход,
 * по окончании onSettled('success' | 'error').
 * Для проверки звонком кода нет: readOnly и сразу 'checking'.
 *
 * charset: 'digits' — код из СМС и из письма; 'alnum' — буквы и цифры
 * (постоянный код демо-входа App Review).
 */

const CELL = 40;
const GAP = 8;
/** Ряд → круг: столько длится перестроение (transition у ячеек) */
const RING_MS = 560;
/** Разгон до полной скорости */
const ACCEL_MS = 500;
/** Полная скорость: оборот за 0,7 с */
const SPIN_DEG_PER_MS = 360 / 700;
/** Торможение — не короче этого */
const BRAKE_MIN_MS = 700;
/** Исход (зелёный или красный) виден, потом ячейки уходят в центр */
const HOLD_MS = 700;
/** Спираль в точку */
const COLLAPSE_MS = 460;
/** Значок виден, потом onSettled */
const BADGE_MS = 1000;
/** Искры вокруг галочки */
const SPARKS = 8;

function rowPos(i, n) {
  return { x: (i - (n - 1) / 2) * (CELL + GAP), y: 0 };
}

const radius = (n) => (n <= 4 ? 46 : 56);

function ringPos(i, n) {
  const r = radius(n);
  const a = ((i * 360) / n - 90) * (Math.PI / 180);
  return { x: Math.round(r * Math.cos(a)), y: Math.round(r * Math.sin(a)) };
}

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function OtpStage({
  length = 6, value = '', onChange, onComplete, phase = 'input', onSettled,
  readOnly = false, disabled = false, label = 'Код', autoFocus = false,
  charset = 'digits', doneLabel = 'Номер подтверждён',
}) {
  const alnum = charset === 'alnum';
  const n = length;
  const input = useRef(null);
  const orbit = useRef(null);
  const stage = useRef(null);
  // input → checking → ok | fail → ok-collapse | fail-collapse → done | failed
  const [step, setStep] = useState(phase === 'checking' ? 'checking' : 'input');
  const spin = useRef({ angle: 0, speed: 0, frame: 0, started: 0, last: 0 });
  const settledRef = useRef(onSettled);
  settledRef.current = onSettled;

  // Дуга по рамке ячейки, в которую только что встала цифра
  const [spark, setSpark] = useState(null);
  const typed = useRef(value.length);
  useEffect(() => {
    if (value.length > typed.current && !reducedMotion()) setSpark({ i: value.length - 1, key: Date.now() });
    typed.current = value.length;
  }, [value]);

  const paint = (angle, transition = 'none') => {
    if (!orbit.current) return;
    orbit.current.style.transition = transition;
    orbit.current.style.transform = `rotate(${angle}deg)`;
  };

  useEffect(() => {
    const s = spin.current;
    const timers = [];
    if (phase === 'input') {
      cancelAnimationFrame(s.frame);
      Object.assign(s, { angle: 0, speed: 0, started: 0, last: 0 });
      paint(0);
      setStep('input');
      return undefined;
    }
    if (phase === 'checking') {
      setStep('checking');
      if (reducedMotion()) return undefined;
      // Кружение — после перестроения в круг; разгон с ускорением
      Object.assign(s, { angle: 0, speed: 0, started: performance.now() + RING_MS, last: 0 });
      const tick = (now) => {
        if (now >= s.started) {
          const dt = s.last ? now - s.last : 0;
          s.last = now;
          const t = Math.min(1, (now - s.started) / ACCEL_MS);
          s.speed = SPIN_DEG_PER_MS * t * t;
          s.angle += s.speed * dt;
          paint(s.angle);
        }
        s.frame = requestAnimationFrame(tick);
      };
      s.frame = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(s.frame);
    }

    // success / error: тормозим и показываем исход
    const ok = phase === 'success';
    const reveal = () => {
      setStep(ok ? 'ok' : 'fail');
      timers.push(setTimeout(() => {
        setStep(ok ? 'ok-collapse' : 'fail-collapse');
        // Спираль: круг докручивается, пока ячейки уходят в центр
        if (!reducedMotion()) paint(s.angle + 220, `transform ${COLLAPSE_MS}ms cubic-bezier(0.55, 0, 0.75, 0.2)`);
      }, HOLD_MS));
      timers.push(setTimeout(() => setStep(ok ? 'done' : 'failed'), HOLD_MS + COLLAPSE_MS));
      timers.push(setTimeout(() => settledRef.current && settledRef.current(ok ? 'success' : 'error'), HOLD_MS + COLLAPSE_MS + BADGE_MS));
    };
    cancelAnimationFrame(s.frame);
    if (reducedMotion() || s.speed <= 0) {
      paint(0);
      reveal();
      return () => timers.forEach(clearTimeout);
    }
    // Равнозамедленно до ближайшего положения, где цифры стоят прямо:
    // круг симметричен, поэтому годится любой шаг 360/n
    const from = s.angle;
    const v = s.speed;
    const unit = 360 / n;
    const target = Math.ceil((from + (v * BRAKE_MIN_MS) / 2) / unit) * unit;
    const T = (2 * (target - from)) / v;
    const t0 = performance.now();
    const brake = (now) => {
      const t = Math.min(T, now - t0);
      s.angle = from + v * t - (v / (2 * T)) * t * t;
      paint(s.angle);
      if (t < T) { s.frame = requestAnimationFrame(brake); return; }
      s.angle = target;
      s.speed = 0;
      reveal();
    };
    s.frame = requestAnimationFrame(brake);
    return () => { cancelAnimationFrame(s.frame); timers.forEach(clearTimeout); };
  }, [phase]);

  useEffect(() => () => cancelAnimationFrame(spin.current.frame), []);

  // Клавиатура iPhone закрывала ячейки (владелец, 15.10.2026). Прокрутка
  // страницы спорила с Safari: он сам прокручивает к полю под пальцем, и
  // страница прыгала вверх-вниз. Поэтому поле ввода стоит неподвижно вверху
  // экрана (CSS .otp__input) — Safari прокручивать незачем, — а экран над
  // клавиатурой поднимаем сами сдвигом (transform), без прокрутки: ячейки
  // по центру видимой части. Где клавиатура сжимает окно (Android), kb ≈ 0
  // и сдвиг не нужен.
  useEffect(() => {
    const vv = typeof window !== 'undefined' && window.visualViewport;
    const el = input.current;
    if (!vv || !el) return undefined;
    let on = false;
    let raf = 0;
    let shift = 0;
    const page = () => stage.current && stage.current.closest('main');
    const apply = (value) => {
      const main = page();
      if (!main) return;
      shift = value;
      main.style.transition = reducedMotion() ? '' : 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1)';
      main.style.transform = value ? `translateY(${-value}px)` : '';
    };
    const fit = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!on || !stage.current) return;
        const kb = Math.max(0, Math.round(window.innerHeight - vv.height));
        if (kb <= 80) { apply(0); return; }
        const r = stage.current.getBoundingClientRect();
        // Где ячейки стояли бы без сдвига — в координатах видимой части
        const top = r.top + shift - vv.offsetTop;
        const want = Math.max(12, (vv.height - r.height) / 2);
        const next = Math.max(0, Math.round(top - want));
        if (Math.abs(next - shift) > 2) apply(next);
      });
    };
    const focus = () => { on = true; fit(); setTimeout(fit, 400); };
    const blur = () => { on = false; cancelAnimationFrame(raf); apply(0); };
    el.addEventListener('focus', focus);
    el.addEventListener('blur', blur);
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
    if (document.activeElement === el) focus();
    return () => {
      el.removeEventListener('focus', focus);
      el.removeEventListener('blur', blur);
      vv.removeEventListener('resize', fit);
      vv.removeEventListener('scroll', fit);
      blur();
    };
  }, [readOnly]);

  // Касание ячеек — фокус в неподвижное поле. Если оно уже в фокусе без
  // клавиатуры (autoFocus без жеста пользователя), снимаем и ставим снова:
  // iOS открывает клавиатуру только на фокус внутри касания
  const focusInput = () => {
    const el = input.current;
    if (!el || el.disabled) return;
    if (document.activeElement === el) {
      // Клавиатура уже открыта — ничего не трогаем: переоткрытие дёргало экран
      const vv = window.visualViewport;
      if (vv && window.innerHeight - vv.height > 80) return;
      el.blur();
    }
    el.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (phase === 'input' && autoFocus && input.current && !readOnly) input.current.focus({ preventScroll: true });
  }, [phase, autoFocus, readOnly]);

  const chars = Array.from({ length: n }, (_, i) => value[i] || '');
  const ring = step !== 'input';
  // Круг повёрнут на угол остановки — каждая ячейка поворачивается обратно,
  // чтобы цифры стояли прямо, а не лёжа
  const upright = ring ? -spin.current.angle : 0;

  const type = (event) => {
    if (readOnly || disabled || phase !== 'input') return;
    const raw = event.target.value;
    const next = (alnum ? raw.toUpperCase().replace(/[^A-Z0-9]/g, '') : raw.replace(/\D/g, '')).slice(0, n);
    onChange && onChange(next);
    if (next.length === n && onComplete) onComplete(next);
  };

  return (
    <div ref={stage} className={'otp otp--' + step} style={{ '--otp-cell': CELL + 'px', '--otp-r': radius(n) + 'px' }}
      // Нажатие не уводит фокус с поля: иначе сдвиг сбрасывался под пальцем
      onMouseDown={(event) => event.preventDefault()}
      onClick={focusInput}>
      <div ref={orbit} className="otp__orbit">
        <span className="otp__track" aria-hidden="true" />
        {chars.map((c, i) => {
          const p = ring ? ringPos(i, n) : rowPos(i, n);
          const active = step === 'input' && !readOnly && i === Math.min(value.length, n - 1);
          return (
            <span
              key={i}
              className={'otp__cell' + (c ? ' otp__cell--filled' : '') + (active ? ' otp__cell--active' : '')}
              style={{ transform: `translate(${p.x}px, ${p.y}px)`, transitionDelay: (ring ? i * 35 : (n - 1 - i) * 25) + 'ms' }}
            >
              <span className="otp__glyph" style={step === 'ok' || step === 'fail' ? { transform: `rotate(${upright % 360}deg)` } : undefined}>
                {readOnly ? <span className="otp__dot" /> : c}
              </span>
              {spark && spark.i === i && step === 'input' && <span key={spark.key} className="otp__spark" aria-hidden="true" />}
            </span>
          );
        })}
      </div>
      <span className="otp__hub" aria-hidden="true" />
      <span className="otp__core" aria-hidden="true" />
      <span className="otp__done otp__done--ok" aria-hidden="true">
        {Array.from({ length: SPARKS }, (_, i) => (
          <span key={i} className="otp__burst" style={{ '--a': (i * 360) / SPARKS + 'deg', '--d': (i % 2 ? 46 : 58) + 'px' }} />
        ))}
        <svg className="otp__halo" viewBox="0 0 72 72" width="72" height="72">
          <circle cx="36" cy="36" r="33" />
        </svg>
        <span className="otp__badge"><IconCheck size={22} /></span>
      </span>
      <span className="otp__done otp__done--fail" aria-hidden="true">
        <svg className="otp__halo" viewBox="0 0 72 72" width="72" height="72">
          <circle cx="36" cy="36" r="33" />
        </svg>
        <span className="otp__badge"><IconClose size={22} /></span>
      </span>
      {/* Поле — в body: сдвиги и анимации страницы не двигают его (fixed) */}
      {!readOnly && createPortal(
        <input
          ref={input}
          className="otp__input"
          aria-label={label}
          inputMode={alnum ? 'text' : 'numeric'}
          autoCapitalize={alnum ? 'characters' : undefined}
          autoCorrect="off"
          spellCheck={false}
          autoComplete="one-time-code"
          maxLength={n}
          value={value}
          onChange={type}
          disabled={disabled || phase !== 'input'}
        />,
        document.body,
      )}
      <span className="sr-status" role="status">
        {step === 'checking' ? 'Проверяем' : step === 'done' ? doneLabel : step === 'failed' ? 'Код не подошёл' : ''}
      </span>
    </div>
  );
}
