import React from 'react';
import { Section, Panel } from '../ui.jsx';
import { FRONT, BACK } from './figure.js';
import './muscles.css';

/**
 * Карта мышц (08.10.2026, FT-491) — фигура спереди и сзади: основные мышцы
 * ярко, синергисты бледнее (владелец, 08.10.2026), подписи «Основная
 * группа» и «Синергисты» — тем же цветом, что на фигуре, поэтому отдельная
 * легенда не нужна.
 *
 * Какие мышцы у упражнения, решает сервер (server/src/lib/muscle-map.js):
 * угадывает по группе и названию, тренер правит тапами по фигуре
 * (MuscleEdit). Здесь только рисунок и подписи.
 */

export const LABELS = {
  chest: 'Грудь',
  'front-deltoids': 'Передняя дельта',
  'back-deltoids': 'Задняя дельта',
  biceps: 'Бицепс',
  triceps: 'Трицепс',
  forearms: 'Предплечья',
  abs: 'Пресс',
  obliques: 'Косые мышцы живота',
  trapezius: 'Трапеция',
  lats: 'Широчайшие',
  'lower-back': 'Поясница',
  glutes: 'Ягодицы',
  quadriceps: 'Квадрицепс',
  hamstrings: 'Бицепс бедра',
  adductors: 'Приводящие бедра',
  abductors: 'Отводящие бедра',
  calves: 'Икры',
};
const INERT = new Set(['head', 'neck', 'knees']);

/** Крупные группы — для «где пробел»: проработана, если есть основная нагрузка */
const GROUPS = [
  ['грудь', ['chest']],
  ['спина', ['lats', 'trapezius', 'lower-back']],
  ['плечи', ['front-deltoids', 'back-deltoids']],
  ['руки', ['biceps', 'triceps']],
  ['пресс', ['abs', 'obliques']],
  ['ягодицы', ['glutes', 'abductors']],
  ['ноги', ['quadriceps', 'hamstrings', 'adductors', 'calves']],
];

/** Названия мышц по порядку; обе дельты — «плечи» */
export function namesOf(regions) {
  const list = [...regions];
  const both = list.includes('front-deltoids') && list.includes('back-deltoids');
  const out = [];
  list.forEach((r) => {
    if (both && (r === 'front-deltoids' || r === 'back-deltoids')) {
      if (!out.includes('Плечи')) out.push('Плечи');
      return;
    }
    if (LABELS[r]) out.push(LABELS[r]);
  });
  return out;
}

/** «Грудь, трицепс и ещё 2» — первое с заглавной */
export function nameLine(regions, max = 4) {
  const names = namesOf(regions);
  if (!names.length) return '';
  const shown = names.slice(0, max).map((n, i) => (i ? n.charAt(0).toLowerCase() + n.slice(1) : n));
  // «и ещё 2» не переносится по частям: одно «1» на строке читается как опечатка
  return shown.join(', ') + (names.length > max ? ' и\u00a0ещё\u00a0' + (names.length - max) : '');
}

/**
 * Мышцы набора упражнений (тренировки, всей программы): у каждой мышцы —
 * сколько подходов основной и сколько синергистом. Основная — если хоть в
 * одном упражнении она основная; порядок — по числу подходов.
 */
export function tallyExercises(exercises) {
  const tally = {};
  (exercises || []).forEach((ex) => {
    const m = ex && ex.muscles;
    if (!m) return;
    const sets = Math.max(1, parseInt(ex.sets, 10) || 1);
    (m.primary || []).forEach((r) => { (tally[r] = tally[r] || { primary: 0, secondary: 0 }).primary += sets; });
    (m.secondary || []).forEach((r) => { (tally[r] = tally[r] || { primary: 0, secondary: 0 }).secondary += sets; });
  });
  return tally;
}

/** Из подсчёта — основные и синергисты по убыванию подходов */
export function splitTally(tally) {
  const entries = Object.entries(tally || {});
  const primary = entries.filter(([, t]) => t.primary > 0)
    .sort((a, b) => b[1].primary - a[1].primary || b[1].secondary - a[1].secondary).map(([r]) => r);
  const secondary = entries.filter(([, t]) => !t.primary && t.secondary > 0)
    .sort((a, b) => b[1].secondary - a[1].secondary).map(([r]) => r);
  return { primary, secondary };
}

/** Крупные группы без основной нагрузки */
export function gapsOf(primary) {
  const set = new Set(primary);
  return GROUPS.filter(([, rs]) => !rs.some((r) => set.has(r))).map(([g]) => g);
}

function Side({ shapes, primary, secondary, onTap, label }) {
  return (
    <svg className="muscles__side" viewBox="0 0 100 200" role="img" aria-label={label}>
      {shapes.map(([m, polys]) => {
        const state = INERT.has(m) ? 'inert' : primary.has(m) ? 'primary' : secondary.has(m) ? 'secondary' : 'idle';
        const tap = onTap && !INERT.has(m);
        return polys.map((p, i) => (
          <polygon
            key={m + i}
            points={p}
            className={'muscles__part muscles__part--' + state + (tap ? ' muscles__part--tap' : '')}
            onClick={tap ? () => onTap(m) : undefined}
          >
            {tap && i === 0 ? <title>{LABELS[m]}</title> : null}
          </polygon>
        ));
      })}
    </svg>
  );
}

/** Фигура спереди и сзади. size: 'sm' — в карточке тренировки, 'md', 'lg' — правка */
export function MuscleFigure({ primary = [], secondary = [], size = 'md', onTap = null, captions = false }) {
  const p = new Set(primary);
  const s = new Set(secondary.filter((r) => !p.has(r)));
  return (
    <div className={'muscles__figure muscles__figure--' + size}>
      <figure className="muscles__view">
        <Side shapes={FRONT} primary={p} secondary={s} onTap={onTap} label="Спереди" />
        {captions && <figcaption>Спереди</figcaption>}
      </figure>
      <figure className="muscles__view">
        <Side shapes={BACK} primary={p} secondary={s} onTap={onTap} label="Сзади" />
        {captions && <figcaption>Сзади</figcaption>}
      </figure>
    </div>
  );
}

/** Подписи «Основная группа: …» и «Синергисты: …» с цветной меткой */
export function MuscleNames({ primary, secondary, max = 4, empty = null }) {
  const main = nameLine(primary, max);
  const help = nameLine(secondary, max);
  if (!main && !help) return empty;
  return (
    <dl className="muscles__names">
      {main && (
        <div className="muscles__line">
          <dt><span className="muscles__dot muscles__dot--primary" aria-hidden="true" />Основная группа</dt>
          <dd>{main}</dd>
        </div>
      )}
      {help && (
        <div className="muscles__line">
          <dt><span className="muscles__dot muscles__dot--secondary" aria-hidden="true" />Синергисты</dt>
          <dd>{help}</dd>
        </div>
      )}
    </dl>
  );
}

/** Карточка тренировки: маленькая фигура и подписи рядом */
export function BlockMuscles({ exercises }) {
  const { primary, secondary } = splitTally(tallyExercises(exercises));
  if (!primary.length && !secondary.length) return null;
  return (
    <div className="muscles muscles--block">
      <MuscleFigure primary={primary} secondary={secondary} size="sm" />
      <MuscleNames primary={primary} secondary={secondary} max={3} />
    </div>
  );
}

/** Большая карта: вся программа или период в итогах — с пробелами */
export function MuscleSummary({ tally, gapsText = 'Без основной нагрузки', section = '' }) {
  const { primary, secondary } = splitTally(tally);
  if (!primary.length && !secondary.length) return null;
  const gaps = gapsOf(primary);
  const body = (
    <div className="muscles muscles--summary">
      <MuscleFigure primary={primary} secondary={secondary} size="md" captions />
      <MuscleNames primary={primary} secondary={secondary} max={6} />
      {gaps.length > 0 && (
        <p className="muscles__gaps"><span>{gapsText}:</span> {gaps.join(', ')}</p>
      )}
    </div>
  );
  return section ? <Section title={section}><Panel pad>{body}</Panel></Section> : body;
}
