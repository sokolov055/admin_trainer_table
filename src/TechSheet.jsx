/**
 * Лист упражнения (владелец 15.11.2026, макет exercise-sheet-mockup.html):
 * один и тот же в карточке тренировки (картинка в ленте, строка «Упражнения
 * и веса») и в «Технике» внутри занятия. Сверху — движение крупно, под ним
 * «Коротко» заголовком, плитки «План / Прошлый раз / Мышцы», вкладки
 * «Как делать» и «Тренажёр». Меньше текста: шаг — главное жирно, пояснение
 * мелко; ошибки — метками с ✕; настройка тренажёра свёрнута.
 *
 * Что показать, решает tech-sheet-model.js; здесь только вид и движение.
 * «Уменьшить движение» — ролик не запускается сам, появление без анимации.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Sheet } from './ui.jsx';
import { IconPlay, IconRefresh, IconChevron } from './icons.jsx';
import { haptic } from './telegram.js';
import { Media } from './media.jsx';
import { mediaUrl } from './library.js';
import { MuscleFigure, namesOf } from './muscles/MuscleMap.jsx';
import { instructionParts } from './equipment-guidance.js';
import { techModel, workoutPlan, workoutLast, workoutNow } from './tech-sheet-model.js';
import './tech-sheet.css';

const ANIM_ID = /^[\w-]+$/;
const animSrc = (id, n) => `${(import.meta.env && import.meta.env.BASE_URL) || '/'}anim/${id}/${n}.jpg`;

function still() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; }
}

function Dumbbell() {
  return <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
    <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" />
  </svg>;
}

/**
 * Движение крупно: 3D-ролик или два кадра. Касание — пауза/дальше,
 * «0,5×» — медленнее, «Ещё раз» — с начала. Нет движения — фото тренажёра
 */
function Hero({ media, photo }) {
  const calm = useRef(still()).current;
  const [playing, setPlaying] = useState(!calm);
  const [slow, setSlow] = useState(false);
  const [frame, setFrame] = useState(0);
  const [round, setRound] = useState(0);
  // Рамка — по пропорциям кадра, без полос сверху и снизу (от 1:1 до 16:9)
  const [ratio, setRatio] = useState(0);
  const fit = (w, h) => { if (w > 0 && h > 0) setRatio(Math.min(16 / 9, Math.max(1, w / h))); };
  const video = useRef(null);
  const kind = media && media.kind;
  const clip = kind === 'clip' && media.url ? mediaUrl(media.url) : '';
  const anim = kind === 'animation' && ANIM_ID.test(media.url || '') ? media.url : '';

  useEffect(() => {
    if (!anim || !playing) return undefined;
    const t = setInterval(() => setFrame((f) => 1 - f), slow ? 2200 : 1100);
    return () => clearInterval(t);
  }, [anim, playing, slow, round]);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    v.playbackRate = slow ? 0.5 : 1;
    if (playing) v.play().catch(() => setPlaying(false)); else v.pause();
  }, [playing, slow, round, clip]);

  // Ссылка и своё видео — как было: плеер со своими кнопками
  if (kind === 'file' || kind === 'link') return <div className="ts-hero ts-hero--plain ts-rise" style={{ '--i': 0 }}><Media media={media} /></div>;

  const moving = !!(clip || anim);
  const toggle = () => { if (!moving) return; haptic(); setPlaying((p) => !p); };
  const again = (e) => {
    e.stopPropagation();
    haptic();
    setFrame(0);
    setRound((r) => r + 1);
    if (video.current) video.current.currentTime = 0;
    setPlaying(true);
  };
  const speed = (e) => { e.stopPropagation(); haptic(); setSlow((s) => !s); };

  return (
    <div className={'ts-hero ts-rise' + (moving ? ' ts-hero--moving' : '')} style={{ '--i': 0 }}>
      <button type="button" className="ts-hero__stage" onClick={toggle} disabled={!moving} style={ratio ? { '--ratio': ratio } : undefined}
        aria-label={moving ? (playing ? 'Остановить движение' : 'Показать движение') : 'Фото тренажёра'}>
        {clip && <video ref={video} src={clip + '#t=0.1'} muted loop playsInline preload="auto" disablePictureInPicture tabIndex={-1}
          onLoadedMetadata={(e) => fit(e.currentTarget.videoWidth, e.currentTarget.videoHeight)} />}
        {anim && <>
          <img src={animSrc(anim, 0)} alt="" draggable="false" onLoad={(e) => fit(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)} />
          <img src={animSrc(anim, 1)} alt="" draggable="false" className={'ts-hero__b' + (frame ? ' is-on' : '')} />
        </>}
        {!moving && photo && <img src={mediaUrl(photo)} alt="" draggable="false" className="ts-hero__photo" />}
        {!moving && !photo && <span className="ts-hero__empty"><Dumbbell /></span>}
        {moving && !playing && <span className="ts-hero__play" aria-hidden="true"><IconPlay size={22} /></span>}
      </button>
      {moving && (
        <div className="ts-hero__ctl">
          <button type="button" className={'ts-pill' + (slow ? ' is-on' : '')} aria-pressed={slow} onClick={speed}>0,5×</button>
          <button type="button" className="ts-pill" onClick={again}><IconRefresh size={14} aria-hidden="true" />Ещё раз</button>
        </div>
      )}
    </div>
  );
}

/** «4 × 15» → крупные цифры, «×» и единицы — мельче */
function Big({ text }) {
  const parts = String(text).split(/(\s*×\s*|\s+кг)/);
  return <b className="ts-stat__v">{parts.map((p, i) => (/×|кг/.test(p) ? <small key={i}>{p.trim() === '×' ? ' × ' : ' кг'}</small> : p))}</b>;
}

// Мышцы задней стороны тела; остальные — спереди
const BACK = new Set(['back-deltoids', 'trapezius', 'lats', 'lower-back', 'glutes', 'hamstrings', 'calves', 'triceps']);
/** Какую сторону фигуры показать в плитке: где больше основных мышц */
function sideOf(primary) {
  const back = primary.filter((r) => BACK.has(r)).length;
  return back > primary.length - back ? 'back' : 'front';
}

function Stats({ plan, last, m }) {
  const main = m.muscles ? namesOf(m.muscles.primary || []) : [];
  const muscle = main[0] || m.muscleName || '';
  const more = main.length > 1 ? ' +' + (main.length - 1) : '';
  const tiles = [
    plan && <div key="plan" className="ts-stat"><i>План</i><Big text={plan} /></div>,
    last && <div key="last" className="ts-stat"><i>Прошлый раз</i><Big text={last} /></div>,
    (m.muscles || muscle) && <div key="mus" className={'ts-stat ts-stat--mus ts-stat--' + sideOf((m.muscles && m.muscles.primary) || [])}>
      {m.muscles && <MuscleFigure primary={m.muscles.primary || []} secondary={m.muscles.secondary || []} size="sm" />}
      <div><i>Мышцы</i><b>{muscle}{more && <small>{more}</small>}</b></div>
    </div>,
  ].filter(Boolean);
  if (!tiles.length) return null;
  return <div className="ts-stats">{tiles.map((t, i) => React.cloneElement(t, { className: t.props.className + ' ts-rise', style: { '--i': 2 + i } }))}</div>;
}

/** Две вкладки, подложка переезжает пружиной */
function Tabs({ items, value, onChange }) {
  const at = Math.max(0, items.indexOf(value));
  return (
    <div className="ts-seg ts-rise" role="tablist" style={{ '--i': 5, '--n': items.length }}>
      <span className="ts-seg__pill" aria-hidden="true" style={{ transform: `translateX(${at * 100}%)` }} />
      {items.map((t) => (
        <button key={t} type="button" role="tab" aria-selected={t === value} className={t === value ? 'is-on' : ''}
          onClick={() => { if (t !== value) { haptic(); onChange(t); } }}>{t}</button>
      ))}
    </div>
  );
}

function Avoid({ items, title = 'Не делайте' }) {
  if (!items.length) return null;
  return (
    <section className="ts-avoid">
      <h4>{title}</h4>
      <div className="ts-nos">{items.map((t, i) => <span key={t} className="ts-item" style={{ '--i': i }}>{t}</span>)}</div>
    </section>
  );
}

function Rows({ rows }) {
  return <ul className="ts-rows">{rows.map((r, i) => (
    <li key={i} className="ts-item" style={{ '--i': i }}>{r.label ? <><b>{r.label}</b><span>{r.text}</span></> : <span className="ts-rows__wide">{r.text}</span>}</li>
  ))}</ul>;
}

/** Раскрывашка: высота едет сеткой 0fr → 1fr, стрелка поворачивается */
function Fold({ title, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={'ts-fold' + (open ? ' is-open' : '')}>
      <button type="button" aria-expanded={open} onClick={() => { haptic(); setOpen(!open); }}>
        {title}<IconChevron size={16} aria-hidden="true" />
      </button>
      {/* Содержимое на месте и закрытым — иначе сворачивание было бы рывком */}
      <div className="ts-fold__body" inert={open ? undefined : ''}><div>{children}</div></div>
    </div>
  );
}

function Machine({ m, trainer }) {
  const [big, setBig] = useState(false);
  const photo = m.photos[0];
  return (
    <section className="ts-mach">
      <button type="button" className="ts-mach__row" disabled={!photo} aria-expanded={photo ? big : undefined}
        onClick={() => { haptic(); setBig(!big); }}>
        <span className="ts-mach__thumb">{photo ? <img src={mediaUrl(photo)} alt="" loading="lazy" draggable="false" /> : <Dumbbell />}</span>
        <span className="ts-mach__tx"><b>{m.name}</b>{photo && <span>{big ? 'Свернуть фото' : 'Фото — нажмите, чтобы увеличить'}</span>}</span>
      </button>
      {big && <div className="ts-mach__big">{m.photos.map((u) => <img key={u} src={mediaUrl(u)} alt={'Тренажёр «' + m.name + '»'} loading="lazy" draggable="false" />)}</div>}
      <Mine note={m.note} trainer={trainer} />
      {m.setup.length > 0 && <Fold title={m.kind === 'equipment' ? 'Как подготовить' : 'Как настроить'}><Rows rows={m.setup} /><Avoid items={m.avoid} title="Не делайте" /></Fold>}
      {!m.setup.length && m.avoid.length > 0 && <Avoid items={m.avoid} />}
    </section>
  );
}

function Mine({ note, trainer }) {
  if (!note) return null;
  return (
    <div className="ts-mine">
      <i>{trainer ? 'Настройка клиента' : 'Ваша настройка'}{note.by === 'trainer' && !trainer ? ' · записал тренер' : ''}</i>
      <b>{note.text}</b>
    </div>
  );
}

function HowPane({ m, trainer }) {
  if (!m.steps.length && !m.avoid.length) return <><Mine note={m.note} trainer={trainer} /><p className="ts-empty">Техника к этому упражнению пока не записана.</p></>;
  return <>
    <Mine note={m.note} trainer={trainer} />
    {m.steps.length > 0 && <ol className="ts-steps">{m.steps.map((s, i) => (
      <li key={i} className="ts-item" style={{ '--i': i }}>
        <span className="ts-steps__n">{i + 1}</span>
        <div><b>{s.main}</b>{s.rest && <span>{s.rest}</span>}</div>
      </li>
    ))}</ol>}
    <Avoid items={m.avoid} />
    {m.alternatives.length > 0 && <div className="ts-swap"><span>Занято?</span>{m.alternatives.map((a) => <em key={a}>{a}</em>)}</div>}
  </>;
}

/** Проверки компонента без страницы: лист на месте (тип постоянный — без перемонтирования) */
function Inline({ children }) {
  return <div className="tech-sheet">{children}</div>;
}

/**
 * «Техника» в шапке упражнения занятия (вариант А3 → лист 15.11.2026):
 * тот же лист, что в карточке тренировки, плюс «Сейчас · подход N из M».
 * Тренажёр — вкладкой листа (отдельной кнопки больше нет)
 */
export function TechButton({ ex, info, notes = {}, trainer = false, targetOf }) {
  const [open, setOpen] = useState(false);
  const m = open ? techModel({ name: ex.name, card: info, notes, targetOf }) : null;
  const steps = info ? instructionParts(info.notes || '', info.mistakes || '').steps.length : 0;
  const meta = [steps ? steps + ' ' + (steps % 10 === 1 && steps % 100 !== 11 ? 'шаг' : steps % 10 >= 2 && steps % 10 <= 4 && (steps % 100 < 12 || steps % 100 > 14) ? 'шага' : 'шагов') : '', info && info.media ? 'видео' : ''].filter(Boolean).join(' · ');
  return <>
    <button type="button" className="workout__chip workout__about" aria-haspopup="dialog" aria-expanded={open}
      aria-label={'Техника' + (meta ? ': ' + meta : '')} onClick={() => { haptic(); setOpen(true); }}>
      <IconPlay size={16} aria-hidden="true" />Техника
    </button>
    {open && <TechSheet m={m} plan={workoutPlan(ex.sets)} last={workoutLast(ex)} now={workoutNow(ex.sets)} trainer={trainer} onClose={() => setOpen(false)} />}
  </>;
}

/**
 * m — techModel; plan, last — строки плиток; now — { set, of, value }
 * внутри занятия; trainer — подписи для тренера
 */
export default function TechSheet({ m, plan = '', last = '', now = null, trainer = false, onClose }) {
  const tabs = m.tab ? ['Как делать', m.tab] : [];
  const [tab, setTab] = useState('Как делать');
  const [switched, setSwitched] = useState(false);
  const pick = (t) => { setSwitched(true); setTab(t); };
  // Без настоящей страницы (проверки компонента) — на месте, без портала
  const dom = typeof document !== 'undefined' && !!document.body && document.body.nodeType === 1;
  const Frame = dom ? Sheet : Inline;
  return (
    <Frame title={m.title} onClose={onClose} className="tech-sheet">
      <Hero media={m.media} photo={m.photo} />
      <div className="ts-name ts-rise" style={{ '--i': 1 }}>
        <h3>{m.title}</h3>
        {m.full && <p>{m.full}</p>}
      </div>
      {now && <div className="ts-now ts-rise" style={{ '--i': 2 }}><span>Сейчас · подход <b>{now.set}</b> из {now.of}</span>{now.value && <b>{now.value}</b>}</div>}
      <Stats plan={plan} last={last} m={m} />
      {tabs.length > 0 && <Tabs items={tabs} value={tab} onChange={pick} />}
      <div key={tab} className={'ts-pane' + (switched ? ' ts-pane--switched' : '')} role={tabs.length ? 'tabpanel' : undefined}>
        {tab === 'Как делать' && <HowPane m={m} trainer={trainer} />}
        {tab !== 'Как делать' && m.machines.map((x) => <Machine key={x.uid} m={x} trainer={trainer} />)}
        {tab !== 'Как делать' && !m.machines.length && <Rows rows={m.prep} />}
      </div>
    </Frame>
  );
}
