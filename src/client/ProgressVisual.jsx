import React from 'react';
import { useData } from '../useData.js';
import { Delta, Qty, formatNumber, formatDate } from '../ui.jsx';
import { weightTrend, journeyHeadline, strengthPct, weeksSince, plural, signed, BODY_SPOTS } from './progress-model.js';

/*
 * «Прогресс» картинками (владелец, 12.11.2026): на вкладке одна большая
 * картинка и 2–3 понятные метрики словами. Таблицы — по кнопке «Все замеры»
 * и «Все упражнения» (screens.jsx, Progress). Данные — те же, что у экрана:
 * сервер не меняется.
 */

/**
 * «Мой путь» (этап 1 макета progress-skip-chat-2026-11-19, владелец
 * 20.11.2026): главное за всё время одной фразой и три цифры — тренировки,
 * сила за месяц, серия недель. Цифры бегут от нуля при открытии.
 */
export function JourneyCard({ journey, rows, lifts }) {
  if (!journey || !journey.since) return null;
  const headline = journeyHeadline(rows, journey.workouts);
  const weeks = weeksSince(journey.since);
  const pct = strengthPct(lifts);
  return (
    <section className="pv-journey" aria-label="Мой путь">
      <i className="pv-journey__deco" aria-hidden="true" />
      <div className="pv-journey__since">Мой путь · с {formatDate(journey.since, false)} · {weeks} {plural(weeks, 'неделя', 'недели', 'недель')}</div>
      {headline && <div className="pv-journey__head">{headline}</div>}
      <div className="pv-journey__stats">
        <div><b><CountUp value={journey.workouts} /></b><small>{plural(journey.workouts, 'тренировка', 'тренировки', 'тренировок')}</small></div>
        {pct !== null && <div><b>{pct > 0 ? '+' : pct < 0 ? '−' : ''}<CountUp value={Math.abs(pct)} />%</b><small>сила за месяц</small></div>}
        <div><b>{journey.streak > 0 ? '🔥 ' : ''}<CountUp value={journey.streak} /></b><small>{plural(journey.streak, 'неделя', 'недели', 'недель')} подряд</small></div>
      </div>
    </section>
  );
}

/** Число, которое бежит от нуля (без анимации — сразу итог) */
function CountUp({ value }) {
  const target = Math.max(0, Math.round(Number(value) || 0));
  const [shown, setShown] = React.useState(() => (reducedMotion() ? target : 0));
  React.useEffect(() => {
    if (reducedMotion() || target === 0 || typeof requestAnimationFrame !== 'function') { setShown(target); return undefined; }
    let raf = 0;
    const t0 = Date.now();
    const tick = () => {
      const k = Math.min(1, (Date.now() - t0) / 900);
      setShown(Math.round(target * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return <>{shown}</>;
}

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const dayMs = (x) => Date.parse(String(x).slice(0, 10) + 'T00:00:00Z');

/**
 * Вес: число крупно, график по датам, который рисуется линией, и пунктиром
 * — куда ведёт темп через месяц (этап 1, 20.11.2026). Против цели — фраза
 * вместо прогноза.
 */
export function WeightCard({ points, aim = 0, period = 'all' }) {
  if (!points.length) return null;
  const last = points[points.length - 1];
  const recent = period === 'last' && points.length > 1;
  const first = recent ? points[points.length - 2] : points[0];
  const change = points.length > 1 ? Math.round((last.y - first.y) * 10) / 10 : null;
  const trend = weightTrend(points, aim);
  const forecast = trend && !trend.against && !trend.flat;
  const x0 = dayMs(points[0].x);
  const xLast = dayMs(last.x);
  const xEnd = forecast ? xLast + trend.forecastDays * 86400000 : xLast;
  const ys = points.map((p) => p.y).concat(forecast ? [trend.inMonth] : []);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const span = max - min || 1;
  const W = 320;
  const H = 120;
  const top = 10;
  const bottom = 22;
  const sx = (t) => (xEnd > x0 ? ((t - x0) / (xEnd - x0)) * (W - 8) + 4 : W / 2);
  const sy = (v) => top + (1 - (v - min) / span) * (H - top - bottom);
  const xy = points.map((p) => [sx(dayMs(p.x)), sy(p.y)]);
  const line = xy.map(([x, y], i) => (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1)).join(' ');
  const [lx, ly] = xy[xy.length - 1];
  // Подписи месяцев — первое число каждого месяца в пределах графика
  const ticks = [];
  if (points.length > 1) {
    const d = new Date(x0);
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + 1);
    while (d.getTime() <= xEnd) { ticks.push({ x: sx(d.getTime()), label: MONTHS[d.getUTCMonth()] }); d.setUTCMonth(d.getUTCMonth() + 1); }
  }
  return (
    <section className="pv-card pv-weight" aria-label="Вес">
      <div className="pv-weight__top">
        <div>
          <div className="pv-card__label">Вес</div>
          <div className="pv-hero"><Qty value={formatNumber(last.y)} unit="кг" /></div>
        </div>
        {change !== null && <span className={'pv-pill ' + (aim && change ? (change * aim > 0 ? 'is-good' : 'is-off') : '')}>{signed(change, 'кг')}</span>}
      </div>
      <p className="pv-card__line">
        {change !== null
          ? <>{recent ? 'С прошлого замера, ' : 'С '}{formatDate(first.x, false)}</>
          : 'Замер от ' + formatDate(last.x)}
      </p>
      {points.length > 1 && (
        <svg className="pv-chart" viewBox={`0 0 ${W} ${H}`} role="img"
          aria-label={'График веса: с ' + formatNumber(first.y) + ' до ' + formatNumber(last.y) + ' кг'}>
          {ticks.map((t, i) => <text key={i} x={t.x} y={H - 6} className="pv-chart__tick">{t.label}</text>)}
          {!recent && <path d={line + ` L ${lx} ${H - bottom} L ${xy[0][0]} ${H - bottom} Z`} className="pv-chart__area" />}
          <path d={line} pathLength="1" className={'pv-chart__line' + (recent ? ' is-past' : '')} />
          {recent && <path d={`M ${xy[xy.length - 2][0]} ${xy[xy.length - 2][1]} L ${lx} ${ly}`} className="pv-chart__line pv-chart__line--recent" />}
          {forecast && <path d={`M ${lx} ${ly} L ${sx(xEnd)} ${sy(trend.inMonth)}`} className="pv-chart__forecast" />}
          {forecast && <circle cx={sx(xEnd)} cy={sy(trend.inMonth)} r="3.5" className="pv-chart__goal" />}
          <circle cx={lx} cy={ly} r="5" className="pv-chart__dot" />
        </svg>
      )}
      {trend && (
        <p className="pv-weight__trend">
          {trend.flat
            ? 'Вес держится — последние недели без заметных изменений'
            : trend.against
              ? <>Пока в другую сторону от цели · {signed(trend.perWeek, 'кг')} в неделю</>
              : <>В таком темпе через месяц — <b>около {formatNumber(trend.inMonth)} кг</b> · {signed(trend.perWeek, 'кг')} в неделю</>}
        </p>
      )}
    </section>
  );
}

/** Фигура с поясами замеров: цвет пояса — как точка у строки */
function BodyMap({ fields }) {
  const spots = fields.map((f) => ({ f, ...BODY_SPOTS[f] })).filter((s) => s.y);
  return (
    <svg className="pv-body" viewBox="0 0 100 190" aria-hidden="true">
      <g className="pv-body__shape">
        <circle cx="50" cy="17" r="12" />
        <path d="M30 34 Q50 28 70 34 L76 90 Q50 98 24 90 Z" />
        <path d="M26 92 Q50 100 74 92 L72 112 Q50 118 28 112 Z" />
        <path d="M30 113 L47 113 L45 184 L35 184 Z" />
        <path d="M53 113 L70 113 L65 184 L55 184 Z" />
        <path d="M29 36 L16 92 L22 94 L33 54 Z" />
        <path d="M71 36 L84 92 L78 94 L67 54 Z" />
      </g>
      {spots.map((s, i) => (
        <g key={s.f} className={'tone-' + s.tone} style={{ animationDelay: (0.15 + i * 0.08) + 's' }}>
          <path d={`M ${s.x1} ${s.y} Q ${(s.x1 + s.x2) / 2} ${s.y + 4} ${s.x2} ${s.y}`} className="pv-body__belt" />
          <circle cx={s.x2} cy={s.y} r="3.6" className="pv-body__dot" />
        </g>
      ))}
    </svg>
  );
}

/** Мини-график одного замера: линия за всё время, точка на последнем */
function Spark({ values, tone, recent = false }) {
  const W = 110;
  const H = 30;
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const pts = values.map((v, i) => [values.length > 1 ? (i / (values.length - 1)) * W : W / 2, 4 + (1 - (v - min) / span) * (H - 8)]);
  const line = pts.map(([x, y], i) => (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1)).join(' ');
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg className={'pv-mini pv-mini--' + tone} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      {!recent && <path d={line + ` L ${W} ${H} L 0 ${H} Z`} className="pv-mini__area" />}
      <path d={line} className={'pv-mini__line' + (recent ? ' is-past' : '')} />
      {recent && <path d={`M ${pts[pts.length - 2][0]} ${pts[pts.length - 2][1]} L ${lx} ${ly}`} className="pv-mini__line pv-mini__line--recent" />}
      {recent && <circle cx={pts[pts.length - 2][0]} cy={pts[pts.length - 2][1]} r="2.6" className="pv-mini__dot" />}
      <circle cx={lx} cy={ly} r="3" className="pv-mini__dot" />
    </svg>
  );
}

/**
 * Замеры строками (владелец, 12.11.2026, вариант А вместо силуэта): у каждого
 * обхвата — было → стало, свой маленький график за всё время и итог стрелкой.
 * Зелёный — в сторону цели клиента, оранжевый — от неё.
 */
export function MeasuresCard({ rows, fields, aimOf, onAll, open, period = 'all' }) {
  const list = fields
    .filter((f) => f !== 'Вес')
    .map((f) => ({ f, pts: rows.filter((r) => r[f] !== null && r[f] !== undefined).map((r) => ({ x: r.date, y: r[f] })) }))
    .filter((m) => m.pts.length > 0);
  if (!list.length) return null;
  const recent = period === 'last' && rows.length > 1;
  const since = !rows.length ? ''
    : recent ? formatDate(rows[rows.length - 2].date, false) + ' → ' + formatDate(rows[rows.length - 1].date, false)
      : 'с ' + formatDate(rows[0].date, false);
  return (
    <section className="pv-card" aria-label="Замеры">
      <div className="pv-card__label">Замеры{since ? ' · ' + since : ''}</div>
      <div className="pv-body-wrap">
      <BodyMap fields={list.map((m) => m.f)} />
      <div className="pv-measures">
        {list.map(({ f, pts }) => {
          const first = (recent && pts.length > 1 ? pts[pts.length - 2] : pts[0]).y;
          const last = pts[pts.length - 1].y;
          const change = Math.round((last - first) * 10) / 10;
          const aim = aimOf(f);
          const tone = !aim || !change ? 'flat' : change * aim > 0 ? 'good' : 'off';
          return (
            <div key={f} className="pv-measure">
              <div className="pv-measure__name">
                <strong>{BODY_SPOTS[f] && <i className={'pv-dot tone-' + BODY_SPOTS[f].tone} aria-hidden="true" />}{f}</strong>
                <small>{pts.length > 1 ? formatNumber(first) + ' → ' + formatNumber(last) + ' см' : formatNumber(last) + ' см'}</small>
              </div>
              {pts.length > 1 ? <Spark values={pts.map((p) => p.y)} tone={tone} recent={recent} /> : <span />}
              <span className="pv-measure__delta">{pts.length > 1 ? <Delta value={change} aim={aim} /> : ''}</span>
            </div>
          );
        })}
      </div>
      </div>
      <button type="button" className="pv-link" aria-expanded={open} onClick={onAll}>
        {open ? 'Свернуть замеры' : 'Все замеры и таблица ›'}
      </button>
    </section>
  );
}

/** Сила: «N из M упражнений тяжелее» и полоски «было → стало» по главным */
export function StrengthCard({ lifts, onAll, open }) {
  if (!lifts.length) return null;
  const grew = lifts.filter((l) => l.delta > 0).length;
  const top = [...lifts].sort((a, b) => (b.weight || 0) - (a.weight || 0)).slice(0, 5);
  const max = Math.max(...top.map((l) => Math.max(l.weight || 0, l.prevWeight || 0)), 1);
  return (
    <section className="pv-card" aria-label="Рабочие веса">
      <div className="pv-card__label">За месяц</div>
      <div className="pv-hero pv-hero--sm">{grew} из {lifts.length} <small>упражнений тяжелее</small></div>
      <div className="pv-lifts">
        {top.map((l, i) => (
          <div key={i} className="pv-lift">
            <span className="pv-lift__name">{l.name}</span>
            <span className="pv-lift__bar" aria-hidden="true">
              <i className="pv-lift__was" style={{ width: ((l.prevWeight || 0) / max) * 100 + '%' }} />
              <i className={'pv-lift__now' + (l.delta > 0 ? ' is-up' : l.delta < 0 ? ' is-down' : '')} style={{ width: ((l.weight || 0) / max) * 100 + '%' }} />
            </span>
            <span className="pv-lift__delta">{l.delta ? <Delta value={l.delta} suffix=" кг" /> : '='}</span>
          </div>
        ))}
      </div>
      <button type="button" className="pv-link" aria-expanded={open} onClick={onAll}>
        {open ? 'Свернуть упражнения' : 'Все упражнения'}
      </button>
    </section>
  );
}

function Ring({ share, color, value, label }) {
  const deg = Math.max(0, Math.min(1, share || 0)) * 360;
  return (
    <div className="pv-ring">
      <div className="pv-ring__disc" style={{ background: `conic-gradient(${color} 0 ${deg}deg, var(--surface-sunken) ${deg}deg 360deg)` }}>
        <span>{value}</span>
      </div>
      <small>{label}</small>
    </div>
  );
}

const avg = (list) => (list.length ? list.reduce((s, v) => s + v, 0) / list.length : 0);

/** Три кольца недели: тренировки к цели, шаги в среднем к норме, сон */
export function WeekRings({ clientRow }) {
  const params = clientRow ? { clientRow } : {};
  const awards = useData('client.awards', params, [clientRow]);
  const steps = useData('steps.list', clientRow ? { clientRow, days: 14 } : { days: 14 }, [clientRow]);
  const health = useData('health.daily.list', clientRow ? { clientRow, days: 30 } : { days: 30 }, [clientRow]);
  const week = awards.data && (awards.data.rings || []).find((g) => g.id === 'week');
  const stepGoal = (awards.data && awards.data.goal && awards.data.goal.steps) || 8000;
  const lastSteps = ((steps.data && steps.data.days) || []).slice(-7).map((d) => d.steps || 0);
  const stepAvg = avg(lastSteps);
  const nights = ((health.data && health.data.days) || []).map((d) => d.sleepMin).filter((m) => m > 0).slice(-7);
  const sleep = avg(nights);
  if (!week && !lastSteps.length && !nights.length) return null;
  return (
    <section className="pv-card" aria-label="Эта неделя">
      <div className="pv-card__label">Эта неделя</div>
      <div className="pv-rings">
        {week && <Ring share={week.target ? week.done / week.target : 0} color="var(--good, #2e7d32)" value={week.done + '/' + week.target} label="тренировки" />}
        {lastSteps.length > 0 && <Ring share={stepAvg / stepGoal} color="var(--accent)" value={(stepAvg / 1000).toFixed(1).replace('.', ',') + 'k'} label="шагов в день" />}
        {nights.length > 0 && <Ring share={sleep / 480} color="#7b3fe4" value={Math.floor(sleep / 60) + 'ч' + String(Math.round(sleep % 60)).padStart(2, '0')} label="сон" />}
      </div>
    </section>
  );
}
