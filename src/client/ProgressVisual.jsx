import React from 'react';
import { useData } from '../useData.js';
import { Delta, Qty, formatNumber, formatDate } from '../ui.jsx';

/*
 * «Прогресс» картинками (владелец, 12.11.2026): на вкладке одна большая
 * картинка и 2–3 понятные метрики словами. Таблицы — по кнопке «Все замеры»
 * и «Все упражнения» (screens.jsx, Progress). Данные — те же, что у экрана:
 * сервер не меняется.
 */

/** Вес линией: число крупно, изменение словами, под ним площадь графика */
export function WeightCard({ points, aim = 0 }) {
  if (!points.length) return null;
  const last = points[points.length - 1];
  const first = points[0];
  const change = points.length > 1 ? Math.round((last.y - first.y) * 10) / 10 : null;
  const ys = points.map((p) => p.y);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const span = max - min || 1;
  const W = 300;
  const H = 84;
  const xy = points.map((p, i) => [
    points.length > 1 ? (i / (points.length - 1)) * W : W / 2,
    8 + (1 - (p.y - min) / span) * (H - 16),
  ]);
  const line = xy.map(([x, y], i) => (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1)).join(' ');
  return (
    <section className="pv-card" aria-label="Вес">
      <div className="pv-card__label">Вес</div>
      <div className="pv-hero"><Qty value={formatNumber(last.y)} unit="кг" /></div>
      <p className="pv-card__line">
        {change !== null
          ? <><Delta value={change} suffix=" кг" aim={aim} /> с {formatDate(first.x, false)}</>
          : 'замер от ' + formatDate(last.x)}
      </p>
      {points.length > 1 && (
        <svg className="pv-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
          aria-label={'График веса: с ' + formatNumber(first.y) + ' до ' + formatNumber(last.y) + ' кг'}>
          <path d={line + ` L ${W} ${H} L 0 ${H} Z`} className="pv-spark__area" />
          <path d={line} className="pv-spark__line" />
          <circle cx={xy[xy.length - 1][0]} cy={xy[xy.length - 1][1]} r="4.5" className="pv-spark__dot" />
        </svg>
      )}
    </section>
  );
}

/** Мини-график одного замера: линия за всё время, точка на последнем */
function Spark({ values, tone }) {
  const W = 110;
  const H = 30;
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const pts = values.map((v, i) => [values.length > 1 ? (i / (values.length - 1)) * W : W / 2, 4 + (1 - (v - min) / span) * (H - 8)]);
  const line = pts.map(([x, y], i) => (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1)).join(' ');
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg className={'pv-mini pv-mini--' + tone} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <path d={line + ` L ${W} ${H} L 0 ${H} Z`} className="pv-mini__area" />
      <path d={line} className="pv-mini__line" />
      <circle cx={lx} cy={ly} r="3" className="pv-mini__dot" />
    </svg>
  );
}

/**
 * Замеры строками (владелец, 12.11.2026, вариант А вместо силуэта): у каждого
 * обхвата — было → стало, свой маленький график за всё время и итог стрелкой.
 * Зелёный — в сторону цели клиента, оранжевый — от неё.
 */
export function MeasuresCard({ rows, fields, aimOf, onAll, open }) {
  const list = fields
    .filter((f) => f !== 'Вес')
    .map((f) => ({ f, pts: rows.filter((r) => r[f] !== null && r[f] !== undefined).map((r) => ({ x: r.date, y: r[f] })) }))
    .filter((m) => m.pts.length > 0);
  if (!list.length) return null;
  const since = rows.length ? formatDate(rows[0].date, false) : '';
  return (
    <section className="pv-card" aria-label="Замеры">
      <div className="pv-card__label">Замеры{since ? ' · с ' + since : ''}</div>
      <div className="pv-measures">
        {list.map(({ f, pts }) => {
          const first = pts[0].y;
          const last = pts[pts.length - 1].y;
          const change = Math.round((last - first) * 10) / 10;
          const aim = aimOf(f);
          const tone = !aim || !change ? 'flat' : change * aim > 0 ? 'good' : 'off';
          return (
            <div key={f} className="pv-measure">
              <div className="pv-measure__name">
                <strong>{f}</strong>
                <small>{pts.length > 1 ? formatNumber(first) + ' → ' + formatNumber(last) + ' см' : formatNumber(last) + ' см'}</small>
              </div>
              {pts.length > 1 ? <Spark values={pts.map((p) => p.y)} tone={tone} /> : <span />}
              <span className="pv-measure__delta">{pts.length > 1 ? <Delta value={change} aim={aim} /> : ''}</span>
            </div>
          );
        })}
      </div>
      <button type="button" className="pv-link" aria-expanded={open} onClick={onAll}>
        {open ? 'Свернуть замеры' : 'Все замеры и таблица'}
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
