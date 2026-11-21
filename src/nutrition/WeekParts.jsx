import React, { useEffect, useState } from 'react';
import { Section, Panel, formatNumber } from '../ui.jsx';
import { haptic } from '../telegram.js';
import { today } from './diary-model.js';
import { n } from './diary-ui.jsx';
import { weekView, sparkPath } from './week-model.js';
import './week.css';

/*
 * «Неделя» в питании — этап 3 макета nutrition-redesign-2026-11-20
 * (владелец 20.11.2026: «делай всё как в макете»). Плитки итогов, цветные
 * столбики с коридором нормы ±12 %, «из чего калории» одной полоской, вес
 * линией и вода каплями. Нажать на столбик — открыть день в «Сегодня».
 * Данные — прежний diary.week: сервер не меняется.
 */

const reduced = () => typeof window !== 'undefined' && !!window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** true после первого кадра — высоты и ширины вырастают от нуля */
function useGrown() {
  const [on, setOn] = useState(reduced);
  useEffect(() => {
    if (on || typeof requestAnimationFrame !== 'function') { setOn(true); return undefined; }
    const raf = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  return on;
}

const TONE = { good: 'var(--nt-good)', over: 'var(--nt-over)', under: 'var(--nt-under)', neutral: 'var(--nt-kcal)', empty: 'var(--surface-sunken)' };
const TONE_WORD = { good: 'в норме', over: 'больше нормы', under: 'меньше нормы', neutral: '', empty: 'пусто' };
const date = (d) => Number(d.slice(8)) + '.' + d.slice(5, 7);

function Kpi({ color, value, label }) {
  return <div className="nt-kpi" style={{ '--kc': color }}><b>{value}</b><span>{label}</span></div>;
}

export function WeekBars({ view, day, onOpen }) {
  const grown = useGrown(), now = today();
  return (
    <div className={'nt-wk' + (view.empty ? ' is-empty' : '')} role="group" aria-label="Калории по дням">
      {view.band && !view.empty && (
        <div className="nt-wk__band" style={{ bottom: view.band.lo * 100 + '%', height: (view.band.hi - view.band.lo) * 100 + '%' }} aria-hidden="true" />
      )}
      {view.empty && <p className="nt-wk__empty"><span aria-hidden="true">🍽️</span>За эту неделю еды ещё нет — столбики вырастут, когда появятся записи</p>}
      {view.bars.map((b) => {
        // Сегодня, пока день идёт, «меньше» — оранжевым «ещё набираем»
        const color = b.day === now && b.tone === 'under' && !b.complete ? 'var(--nt-kcal)' : TONE[b.tone];
        const words = [date(b.day), b.kcal ? n(b.kcal) + ' ккал' : 'ничего не записано', b.kcal ? TONE_WORD[b.tone] : '', b.part ? 'записано не всё' : ''].filter(Boolean).join(', ');
        return (
          <button key={b.day} type="button" className={'nt-wb' + (b.day === day ? ' is-on' : '')} style={{ '--bc': color }}
            aria-label={'Открыть день: ' + words} onClick={() => { haptic(); onOpen(b.day); }}>
            {b.kcal > 0 && <em>{n(b.kcal)}</em>}
            <i className={b.part ? 'is-part' : b.tone === 'empty' ? 'is-empty' : ''} style={{ height: grown ? Math.max(b.tone === 'empty' ? 0 : 3, b.h * 100) + '%' : 0 }} />
            <small>{b.wd}</small>
          </button>
        );
      })}
    </div>
  );
}

function Spark({ points, color }) {
  const d = sparkPath(points);
  return d ? <svg className="nt-spark" width="100%" height="46" viewBox="0 0 300 46" preserveAspectRatio="none" aria-hidden="true"><path d={d} pathLength="1" stroke={color} /></svg> : null;
}

export function WeekScreen({ data, day, waterGoalMl, onOpenDay }) {
  const view = weekView(data, waterGoalMl), grown = useGrown();
  const { avg, shares, weight } = view;
  const wColor = !weight || weight.delta === 0 ? 'var(--text-muted)' : weight.delta < 0 ? 'var(--nt-good)' : 'var(--nt-over)';
  return (
    <div className="nt-week">
      <div className="nt-kpis">
        {view.inNorm
          ? <Kpi color="var(--nt-good)" value={view.inNorm.n + ' из ' + view.inNorm.of} label="дней в норме" />
          : <Kpi color="var(--nt-good)" value={view.fullDays + ' из 7'} label="полных дней" />}
        <Kpi color="var(--nt-kcal)" value={(view.streak ? '🔥 ' : '') + view.streak} label="полных подряд" />
        <Kpi color="var(--nt-p)" value={avg ? n(avg.protein) + ' г' : '—'} label="белка в день" />
      </div>
      <Section><Panel pad>
        <div className="nt-week__row"><b>Калории</b><span className="nt-sp" /><span className="nt-week__s">{avg ? 'Среднее за полные дни: ' + n(avg.kcal) + ' ккал' : 'нет полных дней'}</span></div>
        <WeekBars view={view} day={day} onOpen={onOpenDay} />
        <div className="nt-leg">
          {view.band && !view.empty && <span className="nt-leg__band"><i />норма {n(view.band.from)}–{n(view.band.to)} ккал</span>}
          {view.band && <><span><i style={{ background: 'var(--nt-good)' }} />в норме</span><span><i style={{ background: 'var(--nt-over)' }} />больше</span><span><i style={{ background: 'var(--nt-under)' }} />меньше</span></>}
          <span><i className="is-part" />не всё записано</span>
        </div>
        {!avg && <p className="small muted">Завершите день кнопкой внизу «Сегодня» — полные дни попадут в среднее.</p>}
      </Panel></Section>
      {shares && (
        <Section><Panel pad>
          <div className="nt-week__row"><b>Из чего калории</b><span className="nt-sp" /><span className="nt-week__s">в среднем</span></div>
          <div className="nt-stack" role="img" aria-label={`Белки ${shares.protein} %, жиры ${shares.fat} %, углеводы ${shares.carbs} %`}>
            {[['protein', 'var(--nt-p)'], ['fat', 'var(--nt-f)'], ['carbs', 'var(--nt-c)']].map(([k, c]) => <i key={k} style={{ background: c, width: grown ? shares[k] + '%' : 0 }} />)}
          </div>
          <div className="nt-leg"><span><i style={{ background: 'var(--nt-p)' }} />белки {shares.protein} %</span><span><i style={{ background: 'var(--nt-f)' }} />жиры {shares.fat} %</span><span><i style={{ background: 'var(--nt-c)' }} />углеводы {shares.carbs} %</span></div>
        </Panel></Section>
      )}
      <Section><Panel pad>
        <div className="nt-week__row"><b>Вес</b><span className="nt-sp" />{weight && weight.points.length > 1 && <b style={{ color: wColor }}>{(weight.delta > 0 ? '+' : weight.delta < 0 ? '−' : '') + formatNumber(Math.abs(weight.delta))} кг</b>}</div>
        {weight ? <>
          <Spark points={weight.points} color={wColor} />
          <div className="nt-week__row nt-week__s"><span>{formatNumber(weight.first)}</span><span className="nt-sp" /><span>{formatNumber(weight.last)} кг</span></div>
        </> : <p className="small muted">За эти дни вес не записан — замер в разделе «Прогресс».</p>}
      </Panel></Section>
      <Section><Panel pad>
        <b>💧 Вода</b>
        <div className="nt-drops">
          {view.water.map((w) => (
            <span key={w.day} title={formatNumber(w.ml / 1000) + ' л'}>
              <i className="nt-drop" style={{ '--h': (grown ? w.share * 100 : 0) + '%' }} aria-hidden="true" />{w.wd}
            </span>
          ))}
        </div>
      </Panel></Section>
    </div>
  );
}
