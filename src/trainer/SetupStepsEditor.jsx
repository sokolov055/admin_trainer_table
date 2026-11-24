/**
 * Шаги настройки тренажёра в редакторе тренера (владелец 16.11.2026, макет
 * trainer-final-mockup.html): у шага стикер из пака (поиск), подпись,
 * главное одной строкой, подробности и цифра на фото. «Не делайте» — метки.
 *
 * Хранение прежнее — текст setup построчно («Подпись — главное; подробности»,
 * последняя строка «Ошибка: а, б»), его читают и старые сборки. Стикер и
 * цифра — setupMeta по тем же строкам.
 */
import React, { useMemo, useRef, useState, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Sheet } from '../ui.jsx';
import { IconClose, IconSearch, IconTrash, IconArrowUp, IconArrowDown, IconPlus } from '../icons.jsx';
import { haptic } from '../telegram.js';
import { parseSetup, buildSetup, clean } from './setup-text.js';
import { Sticker, stickerFor, searchStickers, normQuery, STICKERS, STICKER_GROUPS, stickerById, useStickerPack } from '../setup-stickers.jsx';
import SetupSteps from '../SetupSteps.jsx';
import '../tech-sheet.css';
import './setup-editor.css';

/** Поле растёт по тексту (field-sizing в Safari нет) */
const grow = (el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 2 + 'px'; } };

const pct = (e, el) => {
  const r = el.getBoundingClientRect();
  const v = (n) => Math.round(Math.min(96, Math.max(4, n)) * 10) / 10;
  return [v(((e.clientX - r.left) / r.width) * 100), v(((e.clientY - r.top) / r.height) * 100)];
};

/** Лист выбора стикера: поиск, группы, сверху — подходящие к подписи */
function StickerSheet({ step, index, onPick, onClose }) {
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');
  useStickerPack();
  const found = searchStickers(q);
  const inGroup = (s) => !group || s.group === group;
  const suggest = useMemo(() => (searchStickers(step.label || '') || []).slice(0, 6), [step.label]);
  const tile = (s) => (
    <button key={s.id} type="button" className={'sed-st' + (step.sticker === s.id ? ' is-on' : '')} onClick={() => onPick(s.id)}>
      <Sticker id={s.id} />
      <span>{highlight(s.name, q)}</span>
    </button>
  );
  const list = found === null ? STICKERS.filter(inGroup) : found.filter(inGroup);
  return (
    <Sheet title={'Стикер для шага ' + (index + 1)} onClose={onClose} className="sed-sheet">
      <div className="sed-search">
        <IconSearch size={17} aria-hidden="true" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти: платформа, спинка, фиксатор…" aria-label="Найти стикер" autoComplete="off" enterKeyHint="search" />
        {q && <button type="button" aria-label="Очистить" onClick={() => setQ('')}><IconClose size={16} /></button>}
      </div>
      <div className="sed-chips" role="tablist">
        {STICKER_GROUPS.map((g) => <button key={g.id || 'all'} type="button" role="tab" aria-selected={group === g.id} className={group === g.id ? 'is-on' : ''} onClick={() => setGroup(g.id)}>{g.name}</button>)}
      </div>
      {found === null && !group && suggest.length > 0 && <>
        <div className="sed-lab">Подходят к «{step.label}»</div>
        <div className="sed-grid">{suggest.map(tile)}</div>
      </>}
      <div className="sed-lab">{found === null ? (group ? STICKER_GROUPS.find((g) => g.id === group).name : 'Все стикеры') : 'Найдено: ' + list.length}</div>
      {list.length ? <div className="sed-grid">{list.map(tile)}</div>
        : <p className="sed-empty">Ничего не нашлось по «{q}». Попробуйте начало слова: «плат», «спин», «сиден».</p>}
      <button type="button" className="button button--ghost sed-none" onClick={() => onPick('')}>Без стикера — номер шага</button>
    </Sheet>
  );
}

function highlight(name, q) {
  const toks = normQuery(q).split(' ').filter(Boolean);
  if (!toks.length) return name;
  return name.split(' ').map((w, i) => {
    const t = toks.find((x) => normQuery(w).startsWith(x));
    return <React.Fragment key={i}>{i ? ' ' : ''}{t ? <><mark>{w.slice(0, t.length)}</mark>{w.slice(t.length)}</> : w}</React.Fragment>;
  });
}

/**
 * value — текст setup, meta — setupMeta, photo — адрес первого фото (для
 * цифр), kind — тренажёр или оборудование; onChange(setup, meta)
 */
export default function SetupStepsEditor({ value, meta, photo, kind = 'machine', name = '', library = false, onChange }) {
  const first = useRef(null);
  if (first.current === null) first.current = parseSetup(value, meta);
  const [steps, setSteps] = useState(first.current.steps.length ? first.current.steps : [{ label: '', main: '', rest: '', sticker: '', pin: null }]);
  const [avoid, setAvoid] = useState(first.current.avoid);
  const [draft, setDraft] = useState('');
  const [placing, setPlacing] = useState(-1);
  const [picking, setPicking] = useState(-1);
  const [preview, setPreview] = useState(false);
  const photoRef = useRef(null);

  const commit = (nextSteps, nextAvoid = avoid) => {
    setSteps(nextSteps);
    setAvoid(nextAvoid);
    const b = buildSetup(nextSteps, nextAvoid);
    onChange(b.setup, b.meta);
  };
  const edit = (k, patch) => commit(steps.map((s, i) => (i === k ? { ...s, ...patch } : s)));
  const move = (k, d) => { const n = [...steps]; [n[k], n[k + d]] = [n[k + d], n[k]]; haptic(); commit(n); };
  const addMark = () => { const v = draft.trim(); if (!v) return; setDraft(''); commit(steps, [...avoid, v]); };

  const onPhoto = (e) => {
    if (placing < 0 || !photoRef.current) return;
    edit(placing, { pin: pct(e, photoRef.current) });
    haptic('success');
    setPlacing(-1);
  };
  const drag = (k) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    try { el.setPointerCapture(e.pointerId); } catch (_) { /* без захвата */ }
    let last = null;
    el.onpointermove = (ev) => { last = pct(ev, photoRef.current); el.style.left = last[0] + '%'; el.style.top = last[1] + '%'; };
    el.onpointerup = () => { el.onpointermove = null; el.onpointerup = null; if (last) edit(k, { pin: last }); };
  };

  const [photoTarget, setPhotoTarget] = useState(null);
  const [previewTarget, setPreviewTarget] = useState(null);
  useLayoutEffect(() => { setPhotoTarget(library ? document.getElementById('mlib-primary-photo') : null); setPreviewTarget(library ? document.getElementById('mlib-preview-action') : null); });
  const renderPreview = node => previewTarget ? createPortal(node, previewTarget) : node;
  const renderPhoto = node => photoTarget ? createPortal(node, photoTarget) : node;
  const built = buildSetup(steps, avoid);
  const tooLong = built.setup.length > 1500;
  return (
    <div className="sed">
      {photo ? renderPhoto(
        <div className={'sed-photo' + (placing >= 0 ? ' is-placing' : '')} ref={photoRef} onClick={onPhoto}>
          <img src={photo} alt="" draggable="false" />
          {steps.map((s, k) => s.pin && (
            <button key={k} type="button" className={'ss-pin' + (placing === k ? ' is-on' : '')} style={{ left: s.pin[0] + '%', top: s.pin[1] + '%', cursor: 'grab', touchAction: 'none' }}
              aria-label={'Цифра ' + (k + 1) + ': перетащите'} onPointerDown={drag(k)} onClick={(e) => e.stopPropagation()}>{k + 1}</button>
          ))}
          {placing >= 0
            ? <div className="sed-hint">Нажмите на фото, где «{steps[placing].label || 'шаг ' + (placing + 1)}» — здесь встанет цифра {placing + 1}</div>
            : !steps.some((s) => s.pin) && <div className="sed-hint">Отметьте детали: «Цифра на фото» у шага</div>}
        </div>
      ) : <p className="field__hint">Добавьте фото — на нём можно будет отметить цифрами, где каждая регулировка.</p>}

      {steps.map((s, k) => {
        const own = s.sticker && stickerById(s.sticker) ? s.sticker : '';
        const auto = own ? '' : stickerFor(s.label, s.main + ' ' + s.rest);
        const words = s.label.trim() ? s.label.trim().split(/\s+/).length : 0;
        return (
          <div key={k} className={'sed-row' + (placing === k ? ' is-on' : '')}>
            <div className="sed-top">
              <button type="button" className={'sed-stk' + (own ? ' has' : '')} onClick={() => setPicking(k)} aria-label={'Стикер шага ' + (k + 1) + (own ? ': ' + stickerById(own).name : '')}>
                <span className="ss-n">{k + 1}</span>
                {own ? <Sticker id={own} /> : auto ? <span className="sed-auto"><Sticker id={auto} /></span> : <em>+<br />стикер</em>}
              </button>
              <div className="sed-fields">
                {library && <span className="mlib-field-label">Подпись</span>}
                <input className="field__input" value={s.label} maxLength={30} placeholder="Подпись: Сиденье, Платформа…" aria-label={'Подпись шага ' + (k + 1)}
                  onChange={(e) => edit(k, { label: e.target.value })} />
                {library && <span className="mlib-field-label">Главное</span>}
                <textarea ref={grow} className="field__input sed-ta" rows={1} value={s.main} maxLength={120} placeholder="Главное одной строкой" aria-label={'Главное шага ' + (k + 1)}
                  onChange={(e) => edit(k, { main: e.target.value.replace(/\n/g, ' ') })} />
                {library && <span className="mlib-field-label">Подробности — необязательно</span>}
                <textarea ref={grow} className="field__input sed-ta sed-ta--sm" rows={1} value={s.rest} maxLength={400} placeholder="Подробности — по нажатию" aria-label={'Подробности шага ' + (k + 1)}
                  onChange={(e) => edit(k, { rest: e.target.value.replace(/\n/g, ' ') })} />
                {words > 2 && <span className="field__hint">Подпись — 1–2 слова, иначе клиент увидит её частью текста.</span>}
              </div>
            </div>
            <div className="sed-bot">
              {photo && <button type="button" className={'sed-btn sed-pin' + (s.pin ? ' is-set' : '')} onClick={() => setPlacing(placing === k ? -1 : k)}>
                {s.pin ? <><span className="sed-dot">{k + 1}</span>На фото</> : '◎ Цифра на фото'}
              </button>}
              {photo && s.pin && <button type="button" className="sed-btn sed-ic" aria-label={'Убрать цифру ' + (k + 1)} onClick={() => edit(k, { pin: null })}><IconClose size={14} /></button>}
              <span className="sed-gap" />
              <button type="button" className="sed-btn sed-ic" disabled={!k} aria-label="Выше" onClick={() => move(k, -1)}><IconArrowUp size={15} /></button>
              <button type="button" className="sed-btn sed-ic" disabled={k === steps.length - 1} aria-label="Ниже" onClick={() => move(k, 1)}><IconArrowDown size={15} /></button>
              <button type="button" className="sed-btn sed-ic" disabled={steps.length < 2} aria-label={'Удалить шаг ' + (k + 1)} onClick={() => { setPlacing(-1); commit(steps.filter((_, i) => i !== k)); }}><IconTrash size={15} /></button>
            </div>
          </div>
        );
      })}
      <button type="button" className="button button--ghost sed-add" disabled={steps.length >= 20}
        onClick={() => commit([...steps, { label: '', main: '', rest: '', sticker: '', pin: null }])}><IconPlus size={16} aria-hidden="true" /> Шаг</button>

      <div className="field__label sed-avoid-lab">{library ? 'Частые ошибки' : 'Не делайте'}</div>
      <div className="sed-chipin">
        {avoid.map((a, i) => <button key={i} type="button" onClick={() => commit(steps, avoid.filter((_, j) => j !== i))} aria-label={'Убрать: ' + a}>{a} <IconClose size={12} aria-hidden="true" /></button>)}
        <input value={draft} onChange={(e) => setDraft(e.target.value.replace(/,/g, ' '))} placeholder="Ошибка и Enter" aria-label="Добавить ошибку"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addMark(); } }} onBlur={addMark} enterKeyHint="done" />
      </div>
      {tooLong && <span className="field__hint sed-warn">Текст длиннее 1500 знаков — сократите подробности, иначе конец обрежется.</span>}
      {renderPreview(<button type="button" className="button button--ghost sed-preview" onClick={() => setPreview(true)}>{library ? 'Предпросмотр инструкции' : 'Как увидит клиент'}</button>)}

      {picking >= 0 && <StickerSheet step={steps[picking]} index={picking} onClose={() => setPicking(-1)}
        onPick={(id) => { haptic(); edit(picking, { sticker: id }); setPicking(-1); }} />}
      {preview && (
        <Sheet title="Как увидит клиент" onClose={() => setPreview(false)} className={library ? "sed-sheet mlib-preview" : "sed-sheet"}>
          <SetupSteps photos={[]} rows={steps.filter((s) => s.label || s.main || s.rest).map((s) => ({ label: clean(s.label).trim(), text: clean(s.main) + (s.rest ? '; ' + clean(s.rest) : '') }))}
            meta={built.meta} kind={kind}>
            {photo && <div className="ss-photos"><PreviewPhoto src={photo} steps={steps} /></div>}
            {name && <h4 className="ts-mach__name">{name}</h4>}
          </SetupSteps>
          {avoid.length > 0 && <section className="ts-avoid"><h4>{library ? 'Частые ошибки' : 'Не делайте'}</h4><div className="ts-nos">{avoid.map((a) => <span key={a}>{a}</span>)}</div></section>}
        </Sheet>
      )}
    </div>
  );
}

/** Фото предпросмотра: цифры шагов без перетаскивания */
function PreviewPhoto({ src, steps }) {
  return (
    <div className="ss-photo">
      <img src={src} alt="" draggable="false" />
      {steps.map((s, k) => s.pin && <span key={k} className="ss-pin" style={{ left: s.pin[0] + '%', top: s.pin[1] + '%' }}>{k + 1}</span>)}
    </div>
  );
}
