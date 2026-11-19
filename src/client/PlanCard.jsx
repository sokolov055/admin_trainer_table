/**
 * Карточка тренировки в списке «Тренировки» (FT-791, 14.11.2026, макет
 * workout-card-mockup.html согласован владельцем): метка дня, три факта
 * (упражнения, ~время, подходы), мышцы фигурой и чипами, лента картинок
 * упражнений, «Начать» внутри карточки, «Упражнения и веса» — строки с
 * картинкой и весом прошлого раза, нажатие на строку — лист техники.
 * Тренеру — та же карточка и «Править / Перенести / Провести», прочее в «⋯».
 *
 * Здесь только вид. Что показать и что разрешено, решает экран программы
 * (screens.jsx, renderBlock): он передаёт готовые признаки и обработчики.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Sheet, plural } from '../ui.jsx';
import { IconCheck, IconChevron, IconMore, IconCopy, IconTrash } from '../icons.jsx';
import { haptic } from '../telegram.js';
import { machineTarget } from '../media.jsx';
import TechSheet from '../TechSheet.jsx';
import { techModel } from '../tech-sheet-model.js';
import { mediaUrl } from '../library.js';
import { MuscleFigure, namesOf, splitTally, tallyExercises } from '../muscles/MuscleMap.jsx';
import { supersets } from '../plan-model.js';
import { planScheme } from '../exercise-track.js';
import { planSets, planMinutes, lastWeightOf, doneShare } from '../plan-card-model.js';
import { muscleTone, muscleClass } from '../data-tones.js';
import './plan-card.css';

const ANIM_ID = /^[\w-]+$/;
const animSrc = (id, n) => `${(import.meta.env && import.meta.env.BASE_URL) || '/'}anim/${id}/${n}.jpg`;

function reducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; }
}

/* ---------- Вкладки ---------- */

/**
 * «На неделе ①», «Сделано ②», «Вся программа»: число — значком, ноль не
 * показываем. Подложка выбранной едет под кнопками (как в «Прогрессе»).
 * Роль — вкладки: под ними меняется список, а не настройка
 */
export function PlanTabs({ items, value, onChange }) {
  const index = Math.max(0, items.findIndex((item) => item.value === value));
  return (
    <div className="chips chips--flush chips--track chips--track-tight chips--glide pc-tabs" role="tablist" aria-label="Тренировки месяца"
      style={{ '--seg-n': items.length, '--seg-i': index }}>
      <span className="chips__thumb" aria-hidden="true" />
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={item.value === value}
          className={'chip' + (item.value === value ? ' chip--active' : '')}
          onClick={() => { if (item.value !== value) haptic(); onChange(item.value); }}
        >
          <span>{item.label}</span>
          {item.count > 0 && <span className={'pc-tabs__n' + (item.tone === 'good' ? ' pc-tabs__n--good' : '')}>{item.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ---------- Значки ---------- */

const Svg = ({ size = 14, children, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true" focusable="false" {...rest}>{children}</svg>
);
const IconList = () => <Svg><path d="M1.5 3h11M1.5 7h11M1.5 11h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></Svg>;
const IconClock = () => <Svg><circle cx="7" cy="7" r="5.8" stroke="currentColor" strokeWidth="1.5" /><path d="M7 4v3.2l2 1.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></Svg>;
const IconSets = () => (
  <Svg>
    <rect x="1" y="5" width="2.6" height="4" rx="1" fill="currentColor" /><rect x="10.4" y="5" width="2.6" height="4" rx="1" fill="currentColor" />
    <rect x="3" y="3" width="2.4" height="8" rx="1" fill="currentColor" /><rect x="8.6" y="3" width="2.4" height="8" rx="1" fill="currentColor" />
    <rect x="5" y="6.2" width="4" height="1.6" fill="currentColor" />
  </Svg>
);
const IconInfo = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
    <circle cx="10" cy="10" r="8.3" stroke="currentColor" strokeWidth="1.5" />
    <path d="M10 9v5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /><circle cx="10" cy="6.2" r="1.05" fill="currentColor" />
  </svg>
);
const IconPlayRound = () => (
  <span className="pc-start__play" aria-hidden="true">
    <svg width="11" height="11" viewBox="0 0 11 11"><path d="M2.5 1.2v8.6L9.6 5.5z" fill="currentColor" /></svg>
  </span>
);
const IconPencil = () => <Svg size={15}><path d="M9.6 2.2l2.2 2.2-7 7-2.8.6.6-2.8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></Svg>;
const IconSwap = () => <Svg size={15}><path d="M2 4.5h9.5L9 2M12 9.5H2.5L5 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></Svg>;
const IconPlaySmall = () => <Svg size={15}><path d="M4 2.3v9.4L11.6 7z" fill="currentColor" /></Svg>;

/** Гантель — у упражнения без картинки и в пустом «Сделано» */
export function IconDumbbell({ size = 30, className = '' }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false">
      <rect x="3" y="11" width="4" height="10" rx="1.6" fill="currentColor" />
      <rect x="25" y="11" width="4" height="10" rx="1.6" fill="currentColor" />
      <rect x="7" y="8" width="4" height="16" rx="1.6" fill="currentColor" />
      <rect x="21" y="8" width="4" height="16" rx="1.6" fill="currentColor" />
      <rect x="11" y="14.6" width="10" height="2.8" rx="1" fill="currentColor" />
    </svg>
  );
}

/* ---------- Шапка ---------- */

/** Метка дня, название, три факта; справа — «⋯» тренера */
export function CardHead({ day, title, exercises, onMenu, note, slot = null }) {
  const n = exercises.length;
  const sets = planSets(exercises);
  const minutes = n ? planMinutes(exercises) : 0;
  return (
    <div className="pc-head">
      <div className="pc-head__main">
        {/* Буква тренировки программы её цветом, как в «Назначить» (18.11.2026) */}
        {slot && slot.letter && <span className={'pc-slot ' + slot.cls} title={'Тренировка ' + slot.letter}>{slot.letter}</span>}
        {day && <span className={'pc-day' + (day.today ? ' pc-day--today' : '')}>{day.today && <i aria-hidden="true" />}{day.text}</span>}
        <h2 className="section__title pc-title">{title}</h2>
        <div className="pc-facts">
          <span><IconList />{n} упр.</span>
          {minutes > 0 && <span title="Примерно: подходы и отдых по программе"><IconClock />~{minutes} мин</span>}
          {sets > 0 && <span><IconSets />{sets} {plural(sets, 'подход', 'подхода', 'подходов')}</span>}
        </div>
        {note}
      </div>
      {onMenu && (
        <button type="button" className="pc-icon-btn" aria-label={'Ещё действия: ' + (typeof title === 'string' ? title : 'тренировка')} onClick={() => { haptic(); onMenu(); }}>
          <IconMore size={20} />
        </button>
      )}
    </div>
  );
}

/* ---------- Мышцы ---------- */

function lower(s) { return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }

/**
 * Фигура подсвечивается при появлении, рядом чипы: главные — заливкой,
 * помогающие — пунктиром «+ трапеция, трицепс». Слова «синергисты»
 * клиенту не показываем (макет, п. 3)
 */
export function CardMuscles({ exercises }) {
  const { primary, secondary } = splitTally(tallyExercises(exercises));
  if (!primary.length && !secondary.length) return null;
  const main = namesOf(primary);
  const shown = main.slice(0, 4);
  const help = [...main.slice(4).map(lower), ...namesOf(secondary).map(lower)];
  const helpText = help.slice(0, 3).join(', ') + (help.length > 3 ? ' и ещё ' + (help.length - 3) : '');
  return (
    <div className="muscles muscles--block pc-muscles">
      <MuscleFigure primary={primary} secondary={secondary} size="sm" />
      <div className="pc-chips" aria-label={'Мышцы: ' + [...main, ...namesOf(secondary)].join(', ')}>
        {shown.map((name, i) => <span key={name} className="pc-chip" style={{ '--i': i }}>{name}</span>)}
        {help.length > 0 && <span className="pc-chip pc-chip--help" style={{ '--i': shown.length }}>+ {helpText}</span>}
      </div>
    </div>
  );
}

/* ---------- Картинка упражнения ---------- */

/** Видна ли картинка на экране: кадры сменяются только у видимых */
function useInView(ref) {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setSeen(true); return undefined; }
    const io = new IntersectionObserver(([entry]) => setSeen(entry.isIntersecting), { rootMargin: '40px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return seen;
}

/**
 * Картинка упражнения (15.11.2026, владелец): в приоритете движение —
 * 3D-ролик техники, затем два кадра (public/anim/<id>/); фото тренажёра —
 * только если движения нет (тренажёр виден в листе техники); нет ничего —
 * гантель. Ролик и кадры идут, только пока картинка на экране; при
 * «Уменьшить движение» — первый кадр
 */
export function ExerciseThumb({ ex, className = '' }) {
  const ref = useRef(null);
  const video = useRef(null);
  const live = useInView(ref);
  const card = ex && ex.exercise;
  const media = card && card.media;
  const clip = media && media.kind === 'clip' && media.url ? mediaUrl(media.url) : '';
  const anim = !clip && media && media.kind === 'animation' && ANIM_ID.test(media.url || '') ? media.url : '';
  const machine = !clip && !anim && card && (card.machines || []).find((m) => (m.photos && m.photos.length) || m.photo);
  const photo = machine ? (machine.photos && machine.photos[0]) || machine.photo : '';
  const still = reducedMotion();
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (live && !still) v.play().catch(() => {}); else v.pause();
  }, [live, clip, still]);
  const kind = clip ? 'clip' : anim ? 'anim' : photo ? 'photo' : 'icon';
  // Без картинки — цветом группы мышц (макет цветов, шаг 2, 19.11.2026)
  const tone = kind === 'icon' ? muscleClass(muscleTone(ex)) : '';
  return (
    <span ref={ref} className={'pc-thumb pc-thumb--' + kind + (tone ? ' ' + tone : '') + (anim && live ? ' is-live' : '') + (className ? ' ' + className : '')} aria-hidden="true">
      {/* #t=0.1 — первый кадр виден и до запуска (Safari иначе рисует пусто) */}
      {clip && <video ref={video} src={clip + '#t=0.1'} muted loop playsInline preload="metadata" disablePictureInPicture tabIndex={-1} />}
      {anim && <img src={animSrc(anim, 0)} alt="" loading="lazy" draggable="false" />}
      {anim && live && <img src={animSrc(anim, 1)} alt="" loading="lazy" draggable="false" className="pc-thumb__b" />}
      {photo && <img src={mediaUrl(photo)} alt="" loading="lazy" draggable="false" />}
      {kind === 'icon' && <IconDumbbell size={24} />}
    </span>
  );
}

/* ---------- Лента ---------- */

/**
 * Лента картинок с номерами: видно всю тренировку, не раскрывая. Подпись
 * под картинкой — ключевое слово упражнения из базы («Коротко», FT-792, до
 * 20 знаков, до двух строк);
 * не задано — только номер. Из названия не угадывается (15.11.2026):
 * первое слово («Обратное») вводило в заблуждение
 */
export function ExerciseStrip({ exercises, onOpen }) {
  if (!exercises.length) return null;
  // Есть хоть одно слово — колонки 80 px под две строки подписи (до 20
  // знаков, макет exercise-keyword-20-mockup.html, вариант А); картинка та же
  const words = exercises.some((ex) => ex.exercise && ex.exercise.shortName);
  return (
    // data-scroll-x: пока ленте есть куда листаться, движение вбок — её, а
    // не смахивание карточки (удаление); жест «назад» решает так же
    <div className={'pc-strip' + (words ? ' pc-strip--words' : '')} role="list" aria-label="Упражнения по порядку" data-scroll-x="">
      {exercises.map((ex, i) => {
        const can = !!(ex.exercise && onOpen);
        const body = (
          <>
            <span className={'pc-tile__ph' + (muscleTone(ex) ? ' ' + muscleClass(muscleTone(ex)) : '')}>
              <ExerciseThumb ex={ex} />
              <span className="pc-tile__n">{i + 1}</span>
            </span>
            {ex.exercise && ex.exercise.shortName && <small className="pc-tile__word">{ex.exercise.shortName}</small>}
          </>
        );
        return (
          <div role="listitem" key={i} className="pc-tile-wrap">
            {can
              ? <button type="button" className="pc-tile" aria-label={(i + 1) + '. ' + ex.name + ' — техника'} onClick={() => { haptic(); onOpen(ex); }}>{body}</button>
              : <span className="pc-tile" title={ex.name}>{body}</span>}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Кнопки ---------- */

export function StartButton({ onStart, first }) {
  return (
    <button type="button" className="button button--primary button--block pc-start" data-first-action={first} onClick={onStart}>
      <IconPlayRound />Начать тренировку
    </button>
  );
}

/** «Упражнения и веса ▾» — раскрыть список под карточкой */
export function MoreToggle({ open, onToggle }) {
  return (
    <button type="button" className="plan__toggle pc-more" aria-expanded={open} onClick={() => { onToggle(); haptic(); }}>
      Упражнения и веса
      <IconChevron size={16} className={'plan__chevron' + (open ? ' plan__chevron--open' : '')} aria-hidden="true" />
    </button>
  );
}

/**
 * Тренер: «Править» (редактор только по кнопке, не при раскрытии — не
 * правит случайно), «Перенести» — в другую неделю или день, «Провести» —
 * занятие с клиентом
 */
export function TrainerTools({ editing, onEdit, move, onStart }) {
  if (!onEdit && !move && !onStart) return null;
  return (
    <div className="pc-tools">
      {onEdit && (
        <button type="button" className={'pc-tool' + (editing ? ' is-on' : '')} aria-pressed={editing} onClick={() => { haptic(); onEdit(); }}>
          <IconPencil />Править
        </button>
      )}
      {move}
      {onStart && (
        <button type="button" className="pc-tool pc-tool--go" onClick={onStart}>
          <IconPlaySmall />Провести
        </button>
      )}
    </div>
  );
}

/** «Перенести» кнопкой — открывает правку недели (день, FT-788) */
export function MoveButton({ onClick }) {
  return <button type="button" className="pc-tool" onClick={() => { haptic(); onClick(); }}><IconSwap />Перенести</button>;
}

/** «Перенести» выбором недели (FT-775): родной список поверх кнопки */
export function MoveWeekTool({ block, length, here, onMove, disabled = false }) {
  if (length < 2) return null;
  return (
    <label className="pc-tool pc-tool--select">
      <IconSwap />Перенести
      <select aria-label={`Перенести «${block.title}» в другую неделю`} value="" disabled={disabled}
        onChange={(e) => { if (e.target.value) { haptic(); onMove(Number(e.target.value)); } }}>
        <option value="">В неделю…</option>
        {Array.from({ length }, (_, i) => i + 1).filter((n) => n !== here).map((n) => <option key={n} value={n}>в неделю {n}</option>)}
      </select>
    </label>
  );
}

/* ---------- Проведена ---------- */

/** Проведённая — зелёной строкой с итогом вместо блока с кнопкой */
export function DoneLine({ when, sets, volume, times, onOpen }) {
  const meta = [
    when,
    sets ? sets + ' ' + plural(sets, 'подход', 'подхода', 'подходов') : '',
    volume ? volume + ' кг объёма' : '',
    times > 1 ? 'всего раз: ' + times : '',
  ].filter(Boolean).join(' · ');
  return (
    <div className="plan__done pc-done">
      <span className="pc-done__ck" aria-hidden="true"><IconCheck size={16} /></span>
      <div>
        <strong>Проведена</strong>
        <span>{meta}</span>
      </div>
      {onOpen && <button type="button" className="pc-done__go" aria-label="Посмотреть веса" onClick={onOpen}>Веса ›</button>}
    </div>
  );
}

/* ---------- Строки упражнений ---------- */

function SchemeLine({ ex, inSuperset }) {
  const scheme = planScheme(ex, inSuperset) || '';
  const [head, ...rest] = scheme.split(' · ');
  const w = lastWeightOf(ex);
  return (
    <div className="exercise__scheme pc-ex__sc">
      <strong className="exercise__main">{head || '—'}</strong>
      {rest.length > 0 && <span className="pc-ex__tech">{rest.join(' · ')}</span>}
      {w && <span className="pc-ex__last">прошлый раз {w.last}</span>}
      {w && w.up && <span className="pc-ex__up" aria-label={'план больше на ' + w.up + ' кг'}>↑ {w.up}</span>}
    </div>
  );
}

/**
 * Строка упражнения: картинка, название до двух строк, «3 × 15» крупно,
 * рядом серым — вес прошлого раза, ⓘ — техника листом снизу. У пары — кто
 * делает и вес каждого, как раньше
 */
function CardExerciseRow({ ex, inSuperset, members = [], me = '', index, onOpen }) {
  const card = ex.exercise;
  const split = members && members.length > 1;
  const doers = split ? (ex.performers && ex.performers.length ? ex.performers : members) : [];
  const mine = !!me && doers.includes(me);
  const ordered = me ? [...doers.filter((m) => m === me), ...doers.filter((m) => m !== me)] : doers;
  const weights = ordered
    .map((m) => (ex.splitWeights && ex.splitWeights[m] ? (m === me ? 'Вы' : m) + ' ' + ex.splitWeights[m] + ' кг' : ''))
    .filter(Boolean)
    .join('   ·   ');
  const can = !!(card && onOpen);
  const open = () => { if (can) { haptic(); onOpen(ex); } };
  return (
    <div
      className={'exercise pc-ex' + (can ? ' pc-ex--tap' : '') + (split && me && !mine ? ' exercise--other' : '')}
      style={{ '--i': index }}
      role={can ? 'button' : undefined}
      tabIndex={can ? 0 : undefined}
      aria-label={can ? ex.name + ' — техника и настройка' : undefined}
      onClick={can ? open : undefined}
      onKeyDown={can ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } } : undefined}
    >
      <ExerciseThumb ex={ex} className="pc-ex__ph" />
      <div className="pc-ex__tx">
        <div className="exercise__name pc-ex__nm">{ex.name}</div>
        <SchemeLine ex={ex} inSuperset={inSuperset} />
        {split && doers.length < members.length && (
          <div className="exercise__who">{me ? (mine ? 'только вы' : 'делает ' + doers.join(' и ')) : 'только ' + doers.join(' и ')}</div>
        )}
        {split && weights && <div className="exercise__scheme">{weights}</div>}
      </div>
      {can && <span className="pc-ex__info" aria-hidden="true"><IconInfo /></span>}
    </div>
  );
}

/** Список упражнений: линия порядка, суперсет — жёлтой скобкой */
export function CardExercises({ exercises, members, me, onOpen }) {
  let index = 0;
  return (
    <div className="pc-list">
      {supersets(exercises).map((group, j) => {
        if (!group.superset) {
          const i = index++;
          return <CardExerciseRow ex={group.items[0]} members={members} me={me} index={i} onOpen={onOpen} key={j} />;
        }
        const rounds = Number(group.sets) || 0;
        return (
          <div className="superset pc-ss" role="group" aria-label={'Суперсет' + (rounds ? ', ' + rounds + ' ' + plural(rounds, 'круг', 'круга', 'кругов') : '')} key={j}>
            <div className="pc-ss__head">
              <span className="pc-ss__tag">Суперсет</span> · подряд{rounds > 0 && <>, <span className="superset__count"><strong>{rounds}</strong> {plural(rounds, 'круг', 'круга', 'кругов')}</span></>}
            </div>
            {group.items.map((ex, k) => {
              const i = index++;
              return <CardExerciseRow ex={ex} inSuperset members={members} me={me} index={i} onOpen={onOpen} key={k} />;
            })}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Лист техники ---------- */

/**
 * Лист упражнения (15.11.2026, макет exercise-sheet-mockup.html): тот же,
 * что «Техника» в занятии — TechSheet. Закрывается смахиванием вниз,
 * касанием фона и крестиком
 */
export function ExerciseSheet({ ex, onClose }) {
  const card = ex.exercise || {};
  const w = lastWeightOf(ex);
  const m = techModel({ name: ex.name, card, muscles: ex.muscles, notes: ex.notes || {}, targetOf: (uid) => machineTarget(card, uid) });
  return <TechSheet m={m} plan={planScheme(ex) || ''} last={w ? w.last : ''} onClose={onClose} />;
}

/* ---------- «⋯» тренера ---------- */

/** Переименовать, копировать, удалить, «Выбрать несколько» */
export function BlockMenu({ title, onClose, onRename, onCopy, onRemove, onSelect }) {
  const run = (fn) => () => { haptic(); onClose(); setTimeout(fn, 0); };
  return (
    <Sheet title={title} onClose={onClose} className="pc-menu">
      <div className="pc-menu__list">
        {onRename && <button type="button" className="pc-menu__item" onClick={run(onRename)}><IconPencil />Переименовать</button>}
        {onCopy && <button type="button" className="pc-menu__item" onClick={run(onCopy)}><IconCopy size={16} />Копировать</button>}
        {onSelect && <button type="button" className="pc-menu__item" onClick={run(onSelect)}><IconCheck size={16} />Выбрать несколько</button>}
        {onRemove && <button type="button" className="pc-menu__item pc-menu__item--danger" onClick={run(onRemove)}><IconTrash size={16} />Удалить</button>}
      </div>
    </Sheet>
  );
}

/* ---------- «Сделано» ---------- */

function Ring({ share }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <span className="pc-ring" aria-hidden="true">
      <svg width="38" height="38" viewBox="0 0 38 38">
        <circle cx="19" cy="19" r={r} className="pc-ring__track" />
        <circle cx="19" cy="19" r={r} className="pc-ring__fill" strokeDasharray={c} strokeDashoffset={c * (1 - share)} />
      </svg>
      {share >= 1 && <IconCheck size={14} />}
    </span>
  );
}

/**
 * Строка-итог занятия: кольцо — доля сделанных подходов от плана,
 * название, дата, подходы, объём. Нажатие — веса занятия
 */
export function DoneRow({ title, when, done, planned, volume, sync, onOpen }) {
  const share = doneShare(done, planned);
  const meta = [
    when,
    done ? done + ' ' + plural(done, 'подход', 'подхода', 'подходов') : 'без отмеченных подходов',
    volume ? volume + ' кг' : '',
  ].filter(Boolean).join(' · ');
  return (
    <section className="section pc-sum" onClick={onOpen ? (e) => { if (!e.target.closest('button, input')) onOpen(); } : undefined}>
      <Ring share={share} />
      <div className="pc-sum__tx">
        <h2 className="section__title pc-sum__title">{title}</h2>
        <span className="pc-sum__meta">{meta}</span>
        {sync}
      </div>
      {onOpen && <button type="button" className="pc-sum__go" aria-label="Посмотреть веса" onClick={onOpen}>Веса ›</button>}
    </section>
  );
}

/** Пусто: гантель, «Пока ничего не сделано» и одна кнопка к ближайшей */
export function DoneEmpty({ next, week = false, onStart, onFree }) {
  return (
    <div className="state pc-empty">
      <div className="state__icon pc-empty__icon"><IconDumbbell size={34} /></div>
      <div className="state__title">Пока ничего не сделано</div>
      {next && <div className="state__text">{week ? 'Первая тренировка недели ждёт' : 'Следующая тренировка ждёт'}</div>}
      {next && onStart && (
        <div className="state__action"><button type="button" className="button button--primary pc-start pc-start--inline" onClick={onStart}><IconPlayRound />{next}</button></div>
      )}
      {!next && onFree && (
        <div className="state__action"><button type="button" className="button button--primary" onClick={onFree}>Начать свободную тренировку</button></div>
      )}
    </div>
  );
}

export { reducedMotion };
