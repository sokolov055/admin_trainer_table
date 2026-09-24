import React, { useState, useRef, useEffect, useMemo } from 'react';
import { formatDate, formatNumber } from './ui.jsx';

/**
 * Линейный график на голом SVG.
 *
 * Почему без библиотеки: нужен ровно один тип графика, зато с точным
 * контролем над попаданием пальцем и над тем, что происходит при одной
 * точке данных. Любая библиотека графиков тут весила бы больше всего
 * остального приложения вместе взятого.
 *
 * Правила оформления, которых держимся:
 *  - одна ось Y (двух шкал на одном графике не бывает);
 *  - линия 2px, точки от 8px — иначе в них не попасть пальцем;
 *  - сетка и подписи осей приглушены, данные — единственное яркое пятно;
 *  - подписи значений не на каждой точке, только на первой и последней;
 *  - при двух и более сериях легенда обязательна;
 *  - те же данные доступны таблицей — цвет никогда не единственный канал.
 */

const PADDING = { top: 14, right: 14, bottom: 26, left: 40 };
const HEIGHT = 190;

export function LineChart({ series, formatValue, unit = '' }) {
  const wrapRef = useRef(null);
  // id должен быть свой у каждого графика: одинаковые id градиентов на
  // странице склеиваются, и второй график забирает заливку первого.
  const gradientId = useRef('chart-' + Math.random().toString(36).slice(2, 9)).current;
  const [width, setWidth] = useState(320);
  const [hover, setHover] = useState(null);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const measure = () => setWidth(Math.max(el.clientWidth, 240));
    measure();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const visible = useMemo(
    () => (series || []).filter((s) => s.points && s.points.length > 0),
    [series]
  );

  const geom = useMemo(() => buildGeometry(visible, width), [visible, width]);

  if (visible.length === 0) {
    return <div className="muted small" style={{ padding: '18px 0' }}>Пока нет данных для графика.</div>;
  }

  const fmt = formatValue || ((v) => formatNumber(v));

  // Одна точка — это не график, а факт. Рисовать линию не из чего.
  const totalPoints = visible.reduce((s, x) => s + x.points.length, 0);
  if (totalPoints < 2) {
    const only = visible[0].points[0];
    return (
      <div style={{ padding: '10px 0' }}>
        <div style={{ fontSize: 26, fontWeight: 700 }}>{fmt(only.y)}{unit}</div>
        <div className="muted small">
          {formatDate(only.x)} · один замер, динамика появится со второго
        </div>
      </div>
    );
  }

  const handleMove = (evt) => {
    const rect = evt.currentTarget.getBoundingClientRect();
    const point = evt.touches && evt.touches[0] ? evt.touches[0] : evt;
    const x = point.clientX - rect.left;
    setHover(findNearest(geom, x));
  };

  return (
    <div className="chart__wrap" ref={wrapRef}>
      <svg
        className="chart"
        width={width}
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        role="img"
        aria-label={'График: ' + visible.map((s) => s.label || 'значение').join(', ')}
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
        onTouchStart={handleMove}
        onTouchMove={handleMove}
        onTouchEnd={() => setHover(null)}
      >
        {/* сетка и подписи оси Y — намеренно бледные */}
        {geom.yTicks.map((t) => (
          <g key={t.value}>
            <line
              x1={PADDING.left}
              x2={width - PADDING.right}
              y1={t.y}
              y2={t.y}
              stroke="var(--grid)"
              strokeWidth="1"
            />
            <text
              x={PADDING.left - 7}
              y={t.y + 3.5}
              textAnchor="end"
              fontSize="10"
              fill="var(--text-muted)"
            >
              {fmt(t.value)}
            </text>
          </g>
        ))}

        {/* ось X: только края — на телефоне больше не помещается читаемо */}
        <text x={PADDING.left} y={HEIGHT - 8} fontSize="10" fill="var(--text-muted)">
          {formatDate(geom.xMinLabel, false)}
        </text>
        <text
          x={width - PADDING.right}
          y={HEIGHT - 8}
          fontSize="10"
          textAnchor="end"
          fill="var(--text-muted)"
        >
          {formatDate(geom.xMaxLabel, false)}
        </text>

        {/* перекрестие под линиями, чтобы не перебивать данные */}
        {hover && (
          <line
            x1={hover.x}
            x2={hover.x}
            y1={PADDING.top}
            y2={HEIGHT - PADDING.bottom}
            stroke="var(--axis)"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        )}

        {/* Заливка под линией: даёт графику цвет и подсказывает, где низ,
            но гаснет к основанию, чтобы не спорить с самой линией. */}
        <defs>
          {geom.series.map((s, i) => (
            <linearGradient key={i} id={gradientId + '-' + i} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0.02" />
            </linearGradient>
          ))}
        </defs>

        {geom.series.map((s, i) => (
          <g key={i}>
            {s.area && <path d={s.area} fill={`url(#${gradientId}-${i})`} stroke="none" />}
            <path
              d={s.path}
              fill="none"
              stroke={s.color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {/* Точки рисуем, только когда их немного: на плотном ряду они
                сливаются в гусеницу и мешают читать саму линию. */}
            {s.coords.length <= 14 &&
              s.coords.map((c, ci) => (
                <circle key={ci} cx={c.x} cy={c.y} r="4" fill={s.color} stroke="var(--surface)" strokeWidth="2" />
              ))}
            {/* Подпись только у последнего значения — прямая маркировка
                без превращения графика в таблицу чисел. */}
            {s.coords.length > 0 && (
              <circle
                cx={s.coords[s.coords.length - 1].x}
                cy={s.coords[s.coords.length - 1].y}
                r="4.5"
                fill={s.color}
                stroke="var(--surface)"
                strokeWidth="2"
              />
            )}
          </g>
        ))}

        {/* точка под курсором поверх всего */}
        {hover &&
          hover.items.map((item, i) => (
            <circle
              key={i}
              cx={hover.x}
              cy={item.y}
              r="5"
              fill={item.color}
              stroke="var(--surface)"
              strokeWidth="2"
            />
          ))}
      </svg>

      {hover && (
        <div
          className="chart__tooltip"
          style={{
            left: Math.min(Math.max(hover.x - 52, 0), Math.max(width - 116, 0)),
            top: 2,
          }}
        >
          <div className="muted" style={{ fontSize: 11 }}>{formatDate(hover.date)}</div>
          {hover.items.map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="legend__swatch" style={{ background: item.color }} />
              <span>
                {item.label ? item.label + ': ' : ''}
                <strong>{fmt(item.value)}{unit}</strong>
              </span>
            </div>
          ))}
        </div>
      )}

      {visible.length > 1 && (
        <div className="legend">
          {visible.map((s, i) => (
            <span className="legend__item" key={i}>
              <span className="legend__swatch" style={{ background: seriesColor(i) }} />
              {s.label || 'Серия ' + (i + 1)}
            </span>
          ))}
        </div>
      )}

      {/* Тот же ряд цифрами: цвет линии не должен оставаться единственным
          способом прочитать данные. */}
      <button
        className="button button--ghost"
        style={{ marginTop: 10, marginLeft: -8 }}
        onClick={() => setShowTable((v) => !v)}
        aria-expanded={showTable}
      >
        {showTable ? 'Скрыть числа' : 'Показать числами'}
      </button>

      {showTable && (
        <div className="table-wrap" style={{ marginTop: 10 }}>
          <table className="data">
            <thead>
              <tr>
                <th>Дата</th>
                {visible.map((s, i) => (
                  <th key={i} className="num">{s.label || 'Значение'}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {geom.tableRows.map((row, ri) => (
                <tr key={ri}>
                  <td>{formatDate(row.date)}</td>
                  {row.values.map((v, ci) => (
                    <td key={ci} className="num">{v === null ? '—' : fmt(v) + unit}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Цвет серии по порядковому номеру — фиксированный, никогда не по рангу
 *  значения: иначе при смене фильтра линии перекрашиваются местами */
export function seriesColor(i) {
  const slots = ['var(--series-1)', 'var(--series-2)'];
  return slots[i % slots.length];
}

function buildGeometry(series, width) {
  const innerW = Math.max(width - PADDING.left - PADDING.right, 10);
  const innerH = HEIGHT - PADDING.top - PADDING.bottom;

  const allX = [];
  const allY = [];
  series.forEach((s) => {
    s.points.forEach((p) => {
      const t = new Date(p.x).getTime();
      if (Number.isFinite(t)) allX.push(t);
      if (Number.isFinite(p.y)) allY.push(p.y);
    });
  });

  const xMin = Math.min(...allX);
  const xMax = Math.max(...allX);
  const xSpan = xMax - xMin || 1;

  let yMin = Math.min(...allY);
  let yMax = Math.max(...allY);

  // Запас сверху и снизу, чтобы линия не липла к рамке. Ноль в шкалу не
  // тянем: для веса и обхватов важна разница в пару килограммов, а не
  // расстояние до нуля — от нуля график превратился бы в прямую.
  const pad = (yMax - yMin) * 0.15 || Math.abs(yMax * 0.05) || 1;
  yMin -= pad;
  yMax += pad;

  const sx = (t) => PADDING.left + ((t - xMin) / xSpan) * innerW;
  const sy = (v) => PADDING.top + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH;

  const built = series.map((s, i) => {
    const coords = s.points
      .map((p) => ({ t: new Date(p.x).getTime(), y: p.y }))
      .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.y))
      .sort((a, b) => a.t - b.t)
      .map((p) => ({ x: sx(p.t), y: sy(p.y), t: p.t, value: p.y }));

    const path = coords.map((c, ci) => (ci === 0 ? 'M' : 'L') + c.x + ',' + c.y).join(' ');

    // Заливка — тот же путь, замкнутый по нижней границе области
    const baseY = PADDING.top + innerH;
    const area = coords.length > 1
      ? path + ` L${coords[coords.length - 1].x},${baseY} L${coords[0].x},${baseY} Z`
      : null;

    return {
      label: s.label,
      color: seriesColor(i),
      coords,
      path,
      area,
    };
  });

  // Тики по Y: четыре штуки — больше на телефоне нечитаемо
  const yTicks = [];
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const value = yMin + ((yMax - yMin) / steps) * i;
    yTicks.push({ value: Math.round(value * 10) / 10, y: sy(value) });
  }

  // Строки для табличного представления — объединяем все даты всех серий
  const dateSet = new Set();
  built.forEach((s) => s.coords.forEach((c) => dateSet.add(c.t)));
  const tableRows = Array.from(dateSet)
    .sort((a, b) => a - b)
    .map((t) => ({
      date: new Date(t).toISOString(),
      values: built.map((s) => {
        const hit = s.coords.find((c) => c.t === t);
        return hit ? hit.value : null;
      }),
    }));

  return {
    series: built,
    yTicks,
    xMinLabel: new Date(xMin).toISOString(),
    xMaxLabel: new Date(xMax).toISOString(),
    tableRows,
  };
}

/** Ближайшая по горизонтали точка — палец попадает куда угодно, а
 *  подсказка обязана показать осмысленное значение */
function findNearest(geom, x) {
  let best = null;

  geom.series.forEach((s) => {
    s.coords.forEach((c) => {
      const dist = Math.abs(c.x - x);
      if (!best || dist < best.dist) best = { dist, t: c.t, x: c.x };
    });
  });

  if (!best) return null;

  const items = [];
  geom.series.forEach((s) => {
    const hit = s.coords.find((c) => c.t === best.t);
    if (hit) items.push({ label: s.label, color: s.color, value: hit.value, y: hit.y });
  });

  return { x: best.x, date: new Date(best.t).toISOString(), items };
}

/* ==========================================================================
 * Столбики по периодам — как на бирже
 * ========================================================================== */

/**
 * Один показатель по месяцам, кварталам или годам.
 *
 * Цвет — как на биржевом графике: зелёный столбик — стало лучше, чем в
 * прошлом периоде, красный — хуже. «Лучше» решает `aim`: у расходов рост
 * плохой, и красить его зелёным значило бы врать. Первый столбик сравнить
 * не с чем — он нейтральный.
 *
 * Красный с зелёным путают люди с дальтонизмом (проверка палитры даёт
 * ΔE 4 при норме 8), поэтому цвет не единственный признак. Ухудшение ещё
 * и рисуется иначе — «пустым» столбиком с контуром, как свеча падения;
 * подсказка над графиком пишет изменение стрелкой и словами, а весь ряд
 * можно открыть таблицей.
 *
 * Идущий период (`partial`) приглушён и подписан: без этого текущий
 * квартал выглядел бы провалом, хотя он просто не кончился.
 */

const BAR_PAD = { top: 16, right: 8, bottom: 24, left: 46 };
const BAR_HEIGHT = 180;

export function BarChart({ points, aim = 1, format, highlight, label }) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(320);
  const [active, setActive] = useState(null);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;

    const measure = () => setWidth(Math.max(el.clientWidth, 240));
    measure();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Смена показателя или разбивки сбрасывает выбранный столбик на
  // подсвеченный период: подсказка не должна висеть над чужим числом.
  useEffect(() => { setActive(null); }, [points, highlight]);

  const list = points || [];
  const known = list.filter((p) => p.value !== null && p.value !== undefined);

  if (known.length === 0) {
    return <div className="muted small bars__empty" ref={wrapRef}>Пока нет данных для графика.</div>;
  }

  const values = list.map((p) => (p.value === null || p.value === undefined ? 0 : p.value));
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;

  const plotW = width - BAR_PAD.left - BAR_PAD.right;
  const plotH = BAR_HEIGHT - BAR_PAD.top - BAR_PAD.bottom;
  const slot = plotW / list.length;
  const gap = 2;
  const barW = Math.max(2, Math.min(28, slot - gap));

  const y = (v) => BAR_PAD.top + ((max - v) / span) * plotH;
  const zero = y(0);

  const bars = list.map((p, i) => {
    const prev = i > 0 ? list[i - 1].value : null;
    const has = p.value !== null && p.value !== undefined;
    const delta = has && prev !== null && prev !== undefined ? p.value - prev : null;

    // Лучше или хуже: направление изменения, развёрнутое для «меньше — лучше».
    // Там, где сторона не определена (aim 0), — просто рост и падение.
    let trend = 'flat';
    if (delta) trend = (aim < 0 ? -delta : delta) > 0 ? 'up' : 'down';

    const x = BAR_PAD.left + slot * i + (slot - barW) / 2;
    const top = has ? Math.min(y(p.value), zero) : zero;
    const h = has ? Math.max(Math.abs(y(p.value) - zero), p.value ? 2 : 0) : 0;

    return { ...p, i, x, top, h, delta, trend, has, negative: has && p.value < 0 };
  });

  const current = active !== null && bars[active]
    ? bars[active]
    : bars.find((b) => b.key === highlight) || bars[bars.length - 1];

  const ticks = [max, (max + min) / 2, min].filter((v, i, all) => all.indexOf(v) === i);

  const pick = (i) => setActive((prev) => (prev === i ? null : i));

  return (
    <div className="bars" ref={wrapRef}>
      <div className="bars__readout" aria-live="polite">
        <span className="bars__period">{current.label}{current.partial ? ' · ещё идёт, данные неполные' : ''}</span>
        <span className="bars__value">{current.has ? format(current.value) : '—'}</span>
        {current.delta !== null && current.delta !== 0 && (
          <span className={'bars__delta bars__delta--' + current.trend}>
            {current.delta > 0 ? '↑ ' : '↓ '}{format(Math.abs(current.delta))} к прошлому периоду
          </span>
        )}
      </div>

      {showTable ? (
        <table className="bars__table">
          <thead>
            <tr><th>Период</th><th>{label}</th><th>Изменение</th></tr>
          </thead>
          <tbody>
            {bars.map((b) => (
              <tr key={b.key}>
                <td>{b.label}{b.partial ? ' (идёт)' : ''}</td>
                <td>{b.has ? format(b.value) : '—'}</td>
                <td>{b.delta ? (b.delta > 0 ? '↑ ' : '↓ ') + format(Math.abs(b.delta)) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <svg
          width={width}
          height={BAR_HEIGHT}
          className="bars__svg"
          role="img"
          aria-label={label + ' по периодам'}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={BAR_PAD.left} x2={width - BAR_PAD.right} y1={y(t)} y2={y(t)} className="bars__grid" />
              <text x={BAR_PAD.left - 6} y={y(t) + 4} textAnchor="end" className="bars__tick">{shortNumber(t)}</text>
            </g>
          ))}

          <line x1={BAR_PAD.left} x2={width - BAR_PAD.right} y1={zero} y2={zero} className="bars__zero" />

          {bars.map((b) => (
            <path
              key={b.key}
              d={barPath(b.x, b.top, barW, b.h, b.negative)}
              className={
                'bars__bar bars__bar--' + b.trend
                + (b.partial ? ' bars__bar--partial' : '')
                + (current.key === b.key ? ' bars__bar--current' : '')
              }
            />
          ))}

          {/* Подписи оси — первый, последний и выбранный период: подпись
              под каждым столбиком на телефоне слиплась бы в кашу */}
          {bars.filter((b, i) => i === 0 || i === bars.length - 1 || b.key === current.key).map((b) => (
            <text
              key={'l' + b.key}
              x={Math.min(Math.max(b.x + barW / 2, BAR_PAD.left + 16), width - BAR_PAD.right - 16)}
              y={BAR_HEIGHT - 6}
              textAnchor="middle"
              className={'bars__axis' + (b.key === current.key ? ' bars__axis--current' : '')}
            >
              {b.short || b.label}
            </text>
          ))}

          {/* Цель для пальца — вся колонка, а не столбик: тонкий столбик
              за три года пальцем не поймать */}
          {bars.map((b) => (
            <rect
              key={'hit' + b.key}
              x={BAR_PAD.left + slot * b.i}
              y={0}
              width={slot}
              height={BAR_HEIGHT}
              fill="transparent"
              onClick={() => pick(b.i)}
              style={{ cursor: 'pointer' }}
            />
          ))}
        </svg>
      )}

      <button className="bars__toggle" type="button" onClick={() => setShowTable((v) => !v)}>
        {showTable ? 'Показать графиком' : 'Показать таблицей'}
      </button>
    </div>
  );
}

/** Столбик со скруглённым концом данных и прямым основанием у нуля */
function barPath(x, top, w, h, negative) {
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  if (negative) {
    const bottom = top + h;
    return `M${x},${top} H${x + w} V${bottom - r} Q${x + w},${bottom} ${x + w - r},${bottom}`
      + ` H${x + r} Q${x},${bottom} ${x},${bottom - r} Z`;
  }
  const base = top + h;
  return `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top}`
    + ` H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${base} Z`;
}

/** Подпись оси коротко: 216 тыс, 1,2 млн */
function shortNumber(v) {
  const a = Math.abs(v);
  if (a >= 1e6) return formatNumber(v / 1e6, 1) + ' млн';
  if (a >= 1e3) return formatNumber(Math.round(v / 1e3), 0) + ' тыс';
  return formatNumber(v, a < 10 && a % 1 ? 1 : 0);
}
