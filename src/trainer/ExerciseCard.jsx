import React, { useEffect, useRef, useState } from 'react';
import { Sheet } from '../ui.jsx';
import { haptic } from '../telegram.js';
import { ExerciseThumb } from '../client/PlanCard.jsx';
import { namesOf } from '../muscles/MuscleMap.jsx';
import CardioPlan, { MACHINE_NAMES } from './CardioPlan.jsx';
import { trackOf, cardioFrom, techniqueOf, planOneSide, planText, REST_OPTIONS, restText } from '../exercise-track.js';
import {
  IconBack, IconChevron, IconCheck, IconLinkPair, IconMinus, IconPlus, IconSwap, IconTrash, IconUnlink,
  IconTreadmill, IconSkillmill, IconRower, IconElliptical, IconBike, IconStepper, IconWave,
} from '../icons.jsx';
import {
  stepWeight, stepReps, workOf, barsOf, barsText, withWarmup, withDrop, withSets, withRest, withSide,
  canWarmup, canDrop, navOf, restAdvice, MAX_SETS, MAX_WARMUP,
  groupMembers, groupLetter, groupVaries, roundFields, varies, flatField,
} from './exercise-card-model.js';
import RoundsTable from './RoundsTable.jsx';
import './exercise-card.css';

/**
 * Карточка упражнения (этап 5, 17.11.2026, FT-798) — один вход вместо двух
 * меню («название» и «схема»): нажали упражнение в редакторе тренировки —
 * снизу лист. Сверху «‹ 2 из 6 ›», картинка, «Заменить», мышцы; подходы
 * столбиками; счётчики «− / +» (нажать на число — клавиатура); отдых одной
 * строкой с рекомендацией точкой; редкое — в свёрнутом «Об упражнении».
 * Хранится то же, что раньше: sets / reps / weight / technique / cardio.
 *
 * Поиск для «Заменить», «Об упражнении» и перенос истории — от BlockEdit
 * (renderPicker / renderAbout / renderHistory): там их состояние.
 */

/** Тренажёры кардио картинками — тот же план кардио, сменился только тренажёр */
const MACHINES = [
  ['treadmill', 'Дорожка', IconTreadmill], ['skillmill', 'Механ. дорожка', IconSkillmill], ['rower', 'Гребля', IconRower],
  ['elliptical', 'Эллипс', IconElliptical], ['bike', 'Вело', IconBike], ['stepper', 'Степпер', IconStepper], ['other', 'Другое', IconWave],
];

/** Счётчик: подпись, крупное число (нажать — вписать своё), «− / +» */
function Stepper({ label, note, value, placeholder = '—', step, onText, mode = 'text' }) {
  const [edit, setEdit] = useState(false);
  const down = step(-1);
  const up = step(1);
  const shown = String(value || '');
  const press = (v) => { if (v === null) return; onText(v); haptic('light'); };
  return (
    <div className="exc-step">
      <span className="exc-step__label">{label}</span>
      {edit
        ? (
          <input
            className="exc-step__input"
            aria-label={label}
            autoFocus
            inputMode={mode}
            enterKeyHint="done"
            maxLength={80}
            placeholder={placeholder}
            value={shown}
            onChange={(e) => onText(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={() => setEdit(false)}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          />
        )
        : (
          <button type="button" className="exc-step__value" aria-label={`${label}: ${shown || 'не задано'}. Вписать своё`} onClick={() => setEdit(true)}>
            <span key={shown} className={'exc-step__num' + (shown.length > 4 ? ' exc-step__num--long' : '') + (shown ? '' : ' is-empty')}>{shown || placeholder}</span>
          </button>
        )}
      <div className="exc-step__row">
        <button type="button" aria-label={label + ': меньше'} disabled={down === null} onClick={() => press(down)}><IconMinus size={18} /></button>
        <button type="button" aria-label={label + ': больше'} disabled={up === null} onClick={() => press(up)}><IconPlus size={18} /></button>
      </div>
      {note}
    </div>
  );
}

/** Маленький счётчик в строку: «Разминка − 1 +», «Круги − 3 +» */
function Mini({ label, value, min = 0, max = 20, onValue }) {
  return (
    <span className="exc-mini">
      <span>{label}</span>
      <button type="button" aria-label={label + ': меньше'} disabled={value <= min} onClick={() => { onValue(value - 1); haptic('light'); }}><IconMinus size={14} /></button>
      <b key={value}>{value}</b>
      <button type="button" aria-label={label + ': больше'} disabled={value >= max} onClick={() => { onValue(value + 1); haptic('light'); }}><IconPlus size={14} /></button>
    </span>
  );
}

/** Отдых одной строкой; рекомендованное — зелёной точкой */
function RestRow({ label, value, advice, onChange }) {
  const current = Number(value) || 0;
  const ref = useRef(null);
  // Выбранный — в поле зрения (2:30 и дальше за краем строки)
  // Только по горизонтали: scrollIntoView прокрутил бы и сам лист
  useEffect(() => {
    const row = ref.current;
    const on = row && row.querySelector('[aria-checked="true"]');
    if (on && on.offsetLeft + on.offsetWidth > row.clientWidth) row.scrollLeft = on.offsetLeft - row.clientWidth / 2 + on.offsetWidth / 2;
  }, []);
  return (
    <div className="exc-rest">
      <div className="exc-lab"><span>{label}</span><b>{current ? restText(current) : 'общий'}</b></div>
      <div className="exc-rest__row" role="radiogroup" aria-label={label} ref={ref}>
        {[0, ...REST_OPTIONS].map((s) => (
          <button
            type="button"
            key={s}
            role="radio"
            aria-checked={current === s}
            className={'exc-rest__chip' + (current === s ? ' is-on' : '') + (advice.includes(s) ? ' is-advice' : '')}
            aria-label={(s ? restText(s) : 'Общий') + (advice.includes(s) ? ', рекомендуем' : '')}
            onClick={() => { if (current !== s) { onChange(s); haptic('light'); } }}
          >{s ? restText(s) : 'Общий'}</button>
        ))}
      </div>
    </div>
  );
}

export default function ExerciseCard({
  list, index, onIndex, split = false, members = [], base = [], picking = false, onPicking,
  onPatch, onPatchAll, onClose, onRemove, onJoin, onLeave, renderPicker, renderAbout, renderHistory,
}) {
  const ex = list[index];
  const [about, setAbout] = useState(false);
  // Суперсет «Одинаково · По кругам» и выбранный круг в таблице — общие для
  // вкладок А1/А2: переход к другому упражнению их не сбрасывает
  const [byRounds, setByRounds] = useState(null);
  const [col, setCol] = useState(0);
  const closeRef = useRef(null);
  const after = useRef(null);
  if (!ex) return null;

  const track = trackOf(ex);
  const tech = techniqueOf(ex.technique);
  const work = workOf(ex);
  const group = ex.supersetGroup;
  const members_ = group ? groupMembers(list, index) : [index];
  const inGroup = members_.length > 1;
  const letter = inGroup ? groupLetter(list, group) : '';
  const rounds = inGroup ? byRounds ?? groupVaries(list, members_) : false;
  /** «Одинаково»: у всего суперсета все круги как 1-й */
  const flatAll = () => {
    const changes = [];
    members_.forEach((k) => {
      let e = list[k];
      const out = {};
      roundFields(e).filter((f) => varies(e, f)).forEach((f) => { const p = flatField(e, f, work); Object.assign(out, p); e = { ...e, ...p }; });
      if (Object.keys(out).length) changes.push([k, out]);
    });
    if (changes.length) (onPatchAll ? onPatchAll(changes) : changes.forEach(([k, v]) => onPatch(k, v)));
  };
  const cardio = track.kind === 'cardio';
  const timed = track.kind === 'timed';
  const one = planOneSide(ex);
  const nav = navOf(index, list.length);
  const patch = (values) => onPatch(index, values);
  const next = list[index + 1];
  const canLink = !!next && !split && !(group && next.supersetGroup === group);
  const card = ex.exercise || (ex.exerciseId ? base.find((b) => b.id === ex.exerciseId) : null) || null;
  const muscles = ex.muscles || (card && card.muscles) || null;
  const primary = muscles ? namesOf(muscles.primary || []) : [];
  const secondary = muscles ? namesOf(muscles.secondary || []).filter((n) => !primary.includes(n)) : [];
  const prev = !split && (ex.lastWeight || ex.prevWeight);
  // Сменили тренажёр у кардио с названием по тренажёру — и название по нему
  const cardioChange = (c) => patch({
    cardio: c,
    ...(c.machine && c.machine !== track.machine && (!ex.name || Object.values(MACHINE_NAMES).includes(ex.name)) ? { name: MACHINE_NAMES[c.machine], exerciseId: null } : {}),
  });

  /** Закрыть лист с анимацией и потом сделать действие (удалить, в суперсет) */
  const closeThen = (fn) => {
    after.current = fn;
    if (closeRef.current) closeRef.current(); else { onClose(); fn(); }
  };
  const done = () => {
    const fn = after.current;
    after.current = null;
    onClose();
    if (fn) fn();
  };

  const title = (
    <span className="exc-nav">
      <button type="button" aria-label="Предыдущее упражнение" disabled={nav.prev < 0} onClick={() => { onIndex(nav.prev); haptic('light'); }}><IconBack size={18} /></button>
      <span>{nav.text}</span>
      <button type="button" aria-label="Следующее упражнение" disabled={nav.next < 0} onClick={() => { onIndex(nav.next); haptic('light'); }}><IconBack size={18} className="exc-nav__fwd" /></button>
    </span>
  );

  const repsLabel = timed ? 'Время, с' : 'Повторы';
  const weightLabel = track.kind === 'strength' ? (one ? 'Кг на сторону' : 'Вес, кг') : 'Доп. вес, кг';

  return (
    <Sheet title={title} className="exc-sheet" onClose={done} closeRef={closeRef}>
      <div className="exc" key={index}>
        {/* Вкладки суперсета: А1 · Выпады, А2 · Подъём… — та же карточка */}
        {inGroup && (
          <div className="exc-tabs" role="tablist" aria-label={'Суперсет ' + letter}>
            {members_.map((k, n) => (
              <button key={k} type="button" role="tab" aria-selected={k === index} className={k === index ? 'is-on' : ''}
                onClick={() => { if (k !== index) { onIndex(k); haptic('light'); } }}>
                <b>{letter}{n + 1}</b><span>{String(list[k].name || '').trim().split(/\s+/)[0] || 'Новое'}</span>
              </button>
            ))}
          </div>
        )}
        {picking || !String(ex.name || '').trim()
          ? <div className="exc-pick">{renderPicker(index)}</div>
          : (
            <div className="exc-hero">
              <ExerciseThumb ex={{ ...ex, exercise: card }} className="exc-hero__pic" />
              <div className="exc-hero__text">
                <b>{ex.name}</b>
                <button type="button" className="exc-hero__swap" onClick={() => onPicking(true)}><IconSwap size={16} />Заменить</button>
              </div>
            </div>
          )}
        {renderHistory(index)}
        {!picking && (primary.length > 0 || secondary.length > 0) && (
          <div className="exc-mus" aria-label="Мышцы">
            {primary.map((m) => <span key={'p' + m} className="exc-mus__p">{m}</span>)}
            {secondary.map((m) => <span key={'s' + m}>{m}</span>)}
          </div>
        )}

        {inGroup && (
          <div className="exc-ss">
            <div className="exc-ss__head"><IconLinkPair size={16} />Суперсет {letter} · общее для круга</div>
            <div className="exc-opts">
              <Mini label="Круги" value={work} min={1} max={MAX_SETS} onValue={(n) => patch(withSets(ex, n))} />
              {canWarmup(ex) && <Mini label="Разминка" value={tech.warmup} max={MAX_WARMUP} onValue={(n) => patch(withWarmup(ex, n))} />}
            </div>
            <RestRow label="Отдых после круга" value={tech.rest} advice={[90, 120]} onChange={(s) => patch(withRest(ex, s))} />
            {/* Разные круги (17.11.2026): повторы и вес, цель и нагрузка кардио — свои на каждом круге */}
            <div className="exc-seg" role="radiogroup" aria-label="Круги суперсета">
              {[[false, 'Одинаково'], [true, 'По кругам']].map(([v, label]) => (
                <button key={label} type="button" role="radio" aria-checked={rounds === v} className={rounds === v ? 'is-on' : ''}
                  onClick={() => { if (rounds === v) return; if (!v) flatAll(); setByRounds(v); haptic('light'); }}>{label}</button>
              ))}
            </div>
            {rounds
              ? <RoundsTable list={list} idx={members_} index={index} n={work} col={col} onCol={setCol} onIndex={onIndex} onPatch={onPatch} />
              : <p className="exc-ss__hint">Все круги одинаковые: повторы, вес и кардио — у каждого упражнения ниже.</p>}
          </div>
        )}

        {cardio
          ? (
            <div className="exc-cardio">
              <div className="exc-mach" role="radiogroup" aria-label="Тренажёр">
                {MACHINES.map(([m, label, Ic]) => (
                  <button type="button" key={m} role="radio" aria-checked={track.machine === m} className={'exc-mach__i' + (track.machine === m ? ' is-on' : '')}
                    onClick={() => { if (track.machine !== m) { cardioChange({ ...cardioFrom(ex, track), machine: m }); haptic('light'); } }}>
                    <Ic size={24} /><span>{label}</span>
                  </button>
                ))}
              </div>
              <CardioPlan value={cardioFrom(ex, track)} track={track} onChange={cardioChange} />
              {!inGroup && <RestRow label="Отдых после отрезка" value={tech.rest} advice={[]} onChange={(s) => patch(withRest(ex, s))} />}
            </div>
          )
          : (
            <>
              {!inGroup && (
                <>
                  <div className="exc-bars" aria-label={'Подходы: ' + barsText(ex)}>
                    {barsOf(ex).map((b, k) => (
                      <span key={k} className={'exc-bar exc-bar--' + b} style={{ '--i': k }}>{b === 'warmup' ? 'Р' : b === 'drop' ? 'Д' : k - tech.warmup + 1}</span>
                    ))}
                  </div>
                  <div className="exc-opts">
                    {canWarmup(ex) && <Mini label="Разминка" value={tech.warmup} max={MAX_WARMUP} onValue={(n) => patch(withWarmup(ex, n))} />}
                    {canDrop(ex) && (
                      <button type="button" className={'exc-tog' + (tech.dropset ? ' is-on' : '')} aria-pressed={tech.dropset} onClick={() => { patch(withDrop(ex, !tech.dropset)); haptic('light'); }}>
                        {tech.dropset && <IconCheck size={14} />}Дропсет в конце
                      </button>
                    )}
                  </div>
                </>
              )}
              <div className={'exc-steps' + (inGroup || split ? ' exc-steps--two' : '')}>
                {!inGroup && (
                  <Stepper label="Подходы" value={String(work)} step={(d) => (work + d >= 1 && work + d <= MAX_SETS ? String(work + d) : null)}
                    onText={(v) => { const n = parseInt(v, 10); if (n > 0) patch(withSets(ex, n)); }} mode="numeric" />
                )}
                <Stepper label={track.unilateral && !timed ? 'Повт. на сторону' : repsLabel} value={planText(ex.reps)} placeholder={timed ? '60' : '12'} step={(d) => stepReps(planText(ex.reps), d, timed)}
                  onText={(v) => patch({ reps: v })} />
                {!split && (
                  <Stepper label={weightLabel} value={planText(ex.weight)} step={(d) => stepWeight(planText(ex.weight), d)} onText={(v) => patch({ weight: v })} mode="decimal" />
                )}
              </div>
              <div className="exc-under">
                <p className="exc-prev">{prev ? 'было ' + String(prev).replace('.', ',') + (/^\d/.test(String(prev)) ? ' кг' : '') : 'Нажмите на число — вписать своё'}</p>
                {!split && track.kind === 'strength' && (
                  <button type="button" className={'exc-step__side' + (one ? ' is-on' : '')} aria-pressed={one} onClick={() => { patch(withSide(ex, !one)); haptic('light'); }}>
                    {one && <IconCheck size={12} />}Вес на сторону
                  </button>
                )}
              </div>
              {!inGroup && <RestRow label="Отдых после подхода" value={tech.rest} advice={restAdvice(ex)} onChange={(s) => patch(withRest(ex, s))} />}
            </>
          )}

        {split && (
          <div className="exc-split">
            <div className="exc-lab"><span>Кто делает и с каким весом</span></div>
            {members.map((m) => {
              const doing = !ex.performers || !ex.performers.length || ex.performers.includes(m);
              return (
                <div className="exc-person" key={m}>
                  <button type="button" className={'chip' + (doing ? ' chip--active' : '')} aria-pressed={doing} onClick={() => {
                    const active = ex.performers && ex.performers.length ? ex.performers : members;
                    const on = active.includes(m) ? active.filter((n) => n !== m) : members.filter((x) => x === m || active.includes(x));
                    if (on.length) patch({ performers: on.length === members.length ? [] : on });
                  }}>{m}</button>
                  {!cardio && (
                    <input className="field__input" aria-label={'Вес: ' + m} placeholder={doing ? 'Вес, кг' : 'не делает'} inputMode="decimal" maxLength={80} disabled={!doing}
                      value={(ex.splitWeights && ex.splitWeights[m]) || ''} onChange={(e) => patch({ splitWeights: { ...(ex.splitWeights || {}), [m]: e.target.value } })} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {String(ex.name || '').trim() && (
          <div className={'exc-acc' + (about ? ' is-open' : '')}>
            <button type="button" className="exc-acc__head" aria-expanded={about} onClick={() => setAbout(!about)}>
              Об упражнении
              <span className="exc-acc__sub">что записывать, мышцы, тренажёры</span>
              <IconChevron size={18} />
            </button>
            {about && <div className="exc-acc__body">{renderAbout(index)}</div>}
          </div>
        )}
      </div>

      <div className="exc-foot">
        {inGroup
          ? <button type="button" className="exc-foot__ic" aria-label="Выйти из суперсета" onClick={() => { onLeave(index); haptic(); }}><IconUnlink size={20} /></button>
          : canLink && <button type="button" className="exc-foot__ic" aria-label="В суперсет со следующим" onClick={() => closeThen(() => { onJoin(index); haptic(); })}><IconLinkPair size={20} /></button>}
        <button type="button" className="exc-foot__ic exc-foot__ic--bad" aria-label="Удалить упражнение" onClick={() => closeThen(() => onRemove(index))}><IconTrash size={20} /></button>
        <button type="button" className="button button--primary exc-foot__ok" onClick={() => closeThen(null)}>Готово</button>
      </div>
    </Sheet>
  );
}
