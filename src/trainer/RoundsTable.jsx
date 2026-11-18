import React, { useEffect, useRef, useState } from 'react';
import { haptic } from '../telegram.js';
import { IconMinus, IconPlus, IconCheck } from '../icons.jsx';
import { perRoundOf } from '../round-plan.js';
import {
  roundFields, varies, roundValues, withCell, withLadder, ladderStep, stepCell, toggleField, flatField,
  withCardioKey, fieldMeta, CARDIO_GOALS, CARDIO_LOADS,
  pickedFields, pickedValue, setPicked, stepPicked, toggleCells,
} from './exercise-card-model.js';

/**
 * «По кругам» в карточке суперсета (этап 5, шаг 2, 17.11.2026, FT-798;
 * макет exercise-editor-2026-11-17, вкладка «5 · Круги»): строки —
 * упражнения круга, столбцы — круги. Нажать клетку — снизу «− / +» этого
 * круга и «шаг» лесенкой; второе нажатие (или нажать на число) — клавиатура.
 * У каждого упражнения своё «что меняется»: у силовых — повторы и/или вес,
 * у кардио — цель (ускорения, ккал, время, дистанция) и/или нагрузка
 * (скорость, уровень). Хранение — round-plan.js.
 *
 * Несколько клеток сразу (владелец, 18.11.2026, макет
 * rounds-multiselect-2026-11-18): «Выбрать» или подержать клетку →
 * отметить клетки, «Круг N» (весь круг), название (всё упражнение) →
 * панель снизу: вписать число во все, «− / +» — каждая на шаг от своего.
 */

const short = (name) => String(name || '').trim().split(/\s+/)[0] || 'Упражнение';
/** Одно значение круга: разделители списка в нём не нужны (у повторов и запятая) */
const shown = (v) => String(v || '').trim() || '—';

/** Второе число клетки: «8 кг», «ск 38», «ур 9» */
const second = (p) => (!String(p.v || '').trim() ? '—' : p.f === 'load' ? p.meta.short + ' ' + p.v : p.v + ' ' + p.meta.short);

/** Клетка: главное число крупно, второе — мелко под ним */
function cellParts(ex, n, col) {
  const fields = roundFields(ex);
  const on = fields.filter((f) => varies(ex, f));
  const list = on.length ? on : [fields[0]];
  return list.map((f) => ({ f, v: roundValues(ex, f, n)[col], meta: fieldMeta(ex, f), on: on.includes(f) }));
}

/** «Круг 2 · Повторы  − 15 +   шаг − +3 +» — одна строка на то, что меняется */
function StepRow({ ex, field, n, col, edit, onEdit, onPatch }) {
  // Что набрано в поле: «7,» по пути к «7,5» — в данные уходит «7»
  // (oneValue), а в поле остаётся набранное
  const [typed, setTyped] = useState(null);
  const meta = fieldMeta(ex, field);
  const values = roundValues(ex, field, n);
  const value = values[col];
  const step = ladderStep(values);
  const down = stepCell(ex, field, value, -1);
  const up = stepCell(ex, field, value, 1);
  const set = (v) => { if (v === null) return; onPatch(withCell(ex, field, n, col, v)); haptic('light'); };
  const ladder = (dir) => { const p = withLadder(ex, field, n, dir); if (p) { onPatch(p); haptic('light'); } };
  const stepText = (step > 0 ? '+' : '') + String(step).replace('.', ',');
  return (
    <div className="rt-step">
      <span className="rt-step__lab">Круг {col + 1} · <b>{meta.label}</b></span>
      <span className="rt-step__ctl">
        <button type="button" aria-label={`${meta.label}, круг ${col + 1}: меньше`} disabled={down === null} onClick={() => set(down)}><IconMinus size={16} /></button>
        {edit
          ? (
            <input
              className="rt-step__input"
              aria-label={`${meta.label}, круг ${col + 1}`}
              autoFocus
              inputMode={field === 'reps' ? 'text' : 'decimal'}
              enterKeyHint="done"
              maxLength={12}
              value={typed ?? value}
              onChange={(e) => { setTyped(e.target.value); onPatch(withCell(ex, field, n, col, e.target.value)); }}
              // Открыли — значение выделено: набранное заменяет его, а не дописывается
              onFocus={(e) => e.currentTarget.select()}
              onBlur={() => { setTyped(null); onEdit(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            />
          )
          : (
            <button type="button" className="rt-step__val" aria-label={`${meta.label}, круг ${col + 1}: ${shown(value)}. Вписать своё`} onClick={() => onEdit(field)}>
              <b key={value}>{shown(value)}</b><small>{meta.unit}</small>
            </button>
          )}
        <button type="button" aria-label={`${meta.label}, круг ${col + 1}: больше`} disabled={up === null} onClick={() => set(up)}><IconPlus size={16} /></button>
      </span>
      <span className="rt-step__ctl rt-step__ctl--ladder">
        <span className="rt-step__word">шаг</span>
        <button type="button" aria-label={meta.label + ': шаг меньше'} onClick={() => ladder(-1)}><IconMinus size={14} /></button>
        <b className="rt-step__ladder" key={stepText}>{stepText}</b>
        <button type="button" aria-label={meta.label + ': шаг больше'} onClick={() => ladder(1)}><IconPlus size={14} /></button>
      </span>
    </div>
  );
}

const ROW_LABEL = { reps: 'Повторы', weight: 'Вес', goal: 'Цель', load: 'Нагрузка' };

/** Панель выбранных клеток: «Выбрано 8 · Снять», строка на каждое поле */
function PickedBar({ list, cells, n, onPatchAll, onClear }) {
  const [edit, setEdit] = useState(null);
  const [typed, setTyped] = useState(null);
  const rows = pickedFields(list, cells);
  return (
    <div className="rt-bar" role="group" aria-label={'Выбрано клеток: ' + cells.length}>
      <div className="rt-bar__top">
        <span>Выбрано {cells.length}</span>
        <button type="button" onClick={onClear}>Снять</button>
      </div>
      {rows.map(({ field, count }) => {
        const { same, value } = pickedValue(list, cells, field, n);
        const label = ROW_LABEL[field];
        const step = (dir) => { const ch = stepPicked(list, cells, field, n, dir); if (ch.length) { onPatchAll(ch); haptic('light'); } };
        return (
          <div className="rt-bar__row" key={field}>
            <span className="rt-bar__k"><b>{label}</b> · {count} кл.</span>
            <button type="button" aria-label={label + ': каждой меньше'} onClick={() => step(-1)}><IconMinus size={16} /></button>
            {edit === field
              ? (
                <input
                  className="rt-step__input"
                  aria-label={label + ': во все выбранные'}
                  autoFocus
                  inputMode={field === 'reps' ? 'text' : 'decimal'}
                  enterKeyHint="done"
                  maxLength={12}
                  value={typed ?? (same ? value : '')}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => { setTyped(e.target.value); onPatchAll(setPicked(list, cells, field, n, e.target.value)); }}
                  onBlur={() => { setTyped(null); setEdit(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                />
              )
              : (
                <button type="button" className={'rt-bar__v' + (same ? '' : ' is-mix')} aria-label={label + ': ' + (same ? shown(value) : 'разное') + '. Вписать во все'} onClick={() => setEdit(field)}>
                  {same ? shown(value) : 'разное'}
                </button>
              )}
            <button type="button" aria-label={label + ': каждой больше'} onClick={() => step(1)}><IconPlus size={16} /></button>
          </div>
        );
      })}
    </div>
  );
}

export default function RoundsTable({ list, idx, index, n, col, onCol, onIndex, onPatch, onPatchAll }) {
  const [edit, setEdit] = useState(null);
  // Выбор нескольких клеток: режим и отмеченные «i:k»
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState(() => new Set());
  const press = useRef(null);
  // До какого времени глотать «нажатие» (после удержания)
  const swallow = useRef(0);
  // Кругов стало меньше — убранные круги из выбора долой
  useEffect(() => { setPicked((p) => new Set([...p].filter((key) => Number(key.split(':')[1]) < n))); }, [n]);
  const ex = list[index];
  const c = Math.min(col, n - 1);
  useEffect(() => { setEdit(null); }, [index, c]);
  if (!ex) return null;
  const fields = roundFields(ex);
  const on = fields.filter((f) => varies(ex, f));
  const cardio = fields[0] === 'goal';
  const pr = cardio ? perRoundOf(ex.cardio) : null;
  const patch = (values) => onPatch(index, values);

  const startPick = (keys = []) => { setPicking(true); setPicked(new Set(keys)); setEdit(null); haptic('medium'); };
  const stopPick = () => { setPicking(false); setPicked(new Set()); haptic('light'); };
  const pickAll = (keys) => { setPicked((p) => toggleCells(p, keys)); haptic('light'); };
  const cells = [...picked];
  const rowAll = (i) => picking && Array.from({ length: n }, (_, k) => i + ':' + k).every((key) => picked.has(key));
  const patchAll = (changes) => (onPatchAll ? onPatchAll(changes) : changes.forEach(([i, v]) => onPatch(i, v)));

  /** Подержать клетку — режим выбора с ней (как выбор фото на iPhone) */
  const hold = (key) => (e) => {
    if (picking || (e.button !== undefined && e.button !== 0)) return;
    const x0 = e.clientX; const y0 = e.clientY;
    const off = () => { clearTimeout(press.current); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', off); window.removeEventListener('pointercancel', off); };
    const move = (ev) => { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 8) off(); };
    // Отпустили палец после удержания: мышь сразу присылает ещё «нажатие» —
    // его глотаем (80 мс), а касание на телефоне его не присылает — и
    // следующее касание клетки не должно потеряться
    const release = () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      swallow.current = Date.now() + 80;
    };
    press.current = setTimeout(() => {
      off();
      swallow.current = Infinity;
      window.addEventListener('pointerup', release);
      window.addEventListener('pointercancel', release);
      startPick([key]);
    }, 450);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', off);
    window.addEventListener('pointercancel', off);
  };

  const tap = (i, k) => {
    // Отпустили после удержания — это не нажатие
    if (Date.now() < swallow.current) { swallow.current = 0; return; }
    if (picking) { pickAll([i + ':' + k]); return; }
    if (i === index && k === c) { setEdit(on[0] || fields[0]); return; }
    if (k !== c) onCol(k);
    if (i !== index) onIndex(i);
    haptic('light');
  };

  return (
    <div className={'rt' + (picking ? ' is-picking' : '')}>
      <div className="rt-head">
        <span>{picking ? (cells.length ? 'Нажмите клетку, «Круг» или название' : 'Отметьте клетки, круг или упражнение') : 'Подержите клетку — выбрать несколько'}</span>
        <button type="button" className={'rt-pick' + (picking ? ' is-on' : '')} aria-pressed={picking} onClick={() => (picking ? stopPick() : startPick())}>{picking ? 'Готово' : 'Выбрать'}</button>
      </div>
      <div className="rt-scroll">
        <table className="rt-tab" style={{ '--n': n }}>
          <thead>
            <tr><th aria-label="Упражнение" />{Array.from({ length: n }, (_, k) => {
              const keys = idx.map((i) => i + ':' + k);
              const all = picking && keys.every((key) => picked.has(key));
              return (
                <th key={k} className={(!picking && k === c ? 'is-col' : '') + (all ? ' is-picked' : '')}>
                  {picking
                    ? <button type="button" className="rt-colpick" aria-pressed={all} aria-label={'Круг ' + (k + 1) + ': ' + (all ? 'снять' : 'выбрать весь')} onClick={() => pickAll(keys)}>Круг {k + 1}</button>
                    : 'Круг ' + (k + 1)}
                </th>
              );
            })}</tr>
          </thead>
          <tbody>
            {idx.map((i) => {
              const e = list[i];
              const isCardio = roundFields(e)[0] === 'goal';
              return (
                <tr key={i} className={(!picking && i === index ? 'is-row' : '') + (isCardio ? ' is-cardio' : '')}>
                  <th scope="row" className={rowAll(i) ? 'is-picked' : ''}>
                    <button type="button" className="rt-name" aria-pressed={picking ? rowAll(i) : undefined}
                      onClick={() => {
                        if (picking) { pickAll(Array.from({ length: n }, (_, k) => i + ':' + k)); return; }
                        if (i !== index) { onIndex(i); haptic('light'); }
                      }}>{e.name || 'Без названия'}</button>
                    {isCardio && <small>{fieldMeta(e, 'goal').label.toLowerCase()} · {fieldMeta(e, 'load').label.toLowerCase()}</small>}
                  </th>
                  {Array.from({ length: n }, (_, k) => {
                    const parts = cellParts(e, n, k);
                    const key = i + ':' + k;
                    const sel = picking ? picked.has(key) : i === index && k === c;
                    const label = `${e.name || 'Упражнение'}, круг ${k + 1}: ` + parts.map((p) => shown(p.v) + ' ' + p.meta.unit).join(', ');
                    return (
                      <td key={k}>
                        <button type="button" className={'rt-cell' + (sel ? (picking ? ' is-picked' : ' is-on') : '') + (parts.some((p) => p.on) ? '' : ' is-flat')} aria-label={label} aria-pressed={sel} onPointerDown={hold(key)} onClick={() => tap(i, k)}
                          onContextMenu={(ev) => ev.preventDefault()}>
                          <b key={parts[0].v}>{shown(parts[0].v)}</b>
                          <small>{parts[1] ? second(parts[1]) : parts[0].meta.short}</small>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {picking && cells.length > 0 && <PickedBar list={list} cells={cells} n={n} onPatchAll={patchAll} onClear={() => setPicked(new Set())} />}
      {!picking && (<>
      <div className="rt-kinds" role="group" aria-label={short(ex.name) + ': по кругам меняется'}>
        <span className="rt-kinds__lab">{short(ex.name)} · по кругам меняется:</span>
        {fields.map((f) => {
          const is = on.includes(f);
          const meta = fieldMeta(ex, f);
          return (
            <button key={f} type="button" className={'exc-tog' + (is ? ' is-on' : '')} aria-pressed={is}
              onClick={() => { patch(toggleField(ex, f, n, !is)); haptic('light'); }}>
              {is && <IconCheck size={14} />}{f === 'goal' ? 'Цель' : f === 'load' ? 'Нагрузка' : meta.label}
            </button>
          );
        })}
      </div>
      {cardio && (
        <div className="rt-kinds">
          <span className="rt-kinds__lab">цель:</span>
          {CARDIO_GOALS.map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={pr.goal === k} className={'rt-chip' + (pr.goal === k ? ' is-on' : '')}
              onClick={() => { if (pr.goal !== k) { patch(withCardioKey(ex, 'goal', k, n)); haptic('light'); } }}>{label}</button>
          ))}
          <span className="rt-kinds__lab">нагрузка:</span>
          {CARDIO_LOADS.map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={pr.load === k} className={'rt-chip' + (pr.load === k ? ' is-on' : '')}
              onClick={() => { if (pr.load !== k) { patch(withCardioKey(ex, 'load', k, n)); haptic('light'); } }}>{label}</button>
          ))}
        </div>
      )}

      {on.map((f) => (
        <StepRow key={f + c} ex={ex} field={f} n={n} col={c} edit={edit === f} onEdit={setEdit} onPatch={patch} />
      ))}
      {on.length > 0
        ? (
          <button type="button" className="exc-tog rt-flat" onClick={() => {
            let next = { ...ex };
            const out = {};
            on.forEach((f) => { const p = flatField(next, f, n); Object.assign(out, p); next = { ...next, ...p }; });
            patch(out);
            haptic('light');
          }}>Все круги как 1-й</button>
        )
        : <p className="rt-hint">Отметьте, что у «{short(ex.name)}» меняется от круга к кругу.</p>}
      <p className="rt-hint">Нажмите клетку ещё раз — клавиатура (свой вес, «8–12»). «+» у «Круги» дописывает круг с тем же шагом.</p>
      </>)}
    </div>
  );
}
