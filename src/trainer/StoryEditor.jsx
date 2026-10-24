import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import StoryCanvas, { bgImageStyle, placeStyle, textClass, textVars } from '../StoryCanvas.jsx';
import { StoryPreview } from '../stories.jsx';
import { ART } from '../storyArt.jsx';
import { useBackGesture } from '../gestures.jsx';
import { haptic } from '../telegram.js';
import { shrinkPhoto, uploadStoryImage } from '../library.js';
import {
  BADGES, BG_COLORS, CANVAS_LIMITS, EMOJI, GRADIENTS, SECTIONS, SIZE_MAX, SIZE_MIN, STICKER_COLORS,
  TEXT_COLORS, TEXT_STYLES, isLightBg, layerId, legacyFields, stickerLayer, textLayer,
} from '../story-canvas.js';
import { DEVICES, LIMITS, addFrame, duplicateFrame, moveFrame, removeFrame, updateTopic } from './stories-edit.js';
import './story-editor.css';

/**
 * Редактор историй как в Instagram (FT-615, шаг 2; прототип одобрен
 * владельцем 19.10.2026: «пока делай так»).
 *
 * Кадр 9:16 на весь экран, инструменты столбиком справа поверх кадра,
 * лента кадров снизу. Касание пустого места — новый текст; тащить —
 * одним пальцем, размер и поворот — двумя (мышью — колесо или кружок в
 * углу); на корзину внизу — удалить. Касание текста — правка, касание
 * наклейки — следующий вид.
 *
 * Пока палец на кадре, React не участвует: слой двигается напрямую через
 * style, а в данные изменение попадает одним commit на отпускании — так
 * жест не тормозит и «Отменить» откатывает его целиком. Черновик всех тем
 * живёт в AdminStories (onChange), «Сохранить» — его же сохранение.
 *
 * Редактор тёмный в любой теме: как все редакторы историй — содержание
 * ярче рамки.
 */

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const r3 = (n) => Math.round(n * 1000) / 1000;
const deg = (rad) => (rad * 180) / Math.PI;
const clone = (v) => JSON.parse(JSON.stringify(v));
const HOLD_MS = 320;

function buzz() {
  try { if (navigator.vibrate) navigator.vibrate(8); } catch (_) {}
  haptic();
}

function snapRot(r) {
  const v = ((((r + 180) % 360) + 360) % 360) - 180;
  for (const k of [-180, -90, 0, 90, 180]) if (Math.abs(v - k) < 4) return k === -180 ? 180 : k;
  return r3(v);
}

function replaceFrame(doc, ti, fi, frame) {
  return doc.map((t, i) => (i !== ti ? t : { ...t, frames: t.frames.map((f, j) => (j === fi ? frame : f)) }));
}

// Обводка — как у icons.jsx для 18–22 px (кнопки редактора), 1,75; аудит 24.10.2026
const Svg = ({ children, ...p }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>{children}</svg>
);
const I = {
  undo: <Svg><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></Svg>,
  redo: <Svg><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></Svg>,
  close: <Svg><path d="M6 6l12 12M18 6 6 18" /></Svg>,
  sticker: <Svg><path d="M15.5 3H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h7l8-8V6a3 3 0 0 0-3-3z" /><path d="M13 21v-5a3 3 0 0 1 3-3h5" /><path d="M8.5 13.5c1 1.2 2.6 1.6 4 1" /></Svg>,
  bg: <Svg><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none" /></Svg>,
  frame: <Svg><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></Svg>,
  help: <Svg><circle cx="12" cy="12" r="9" /><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.6" /><circle cx="12" cy="17" r=".7" fill="currentColor" /></Svg>,
  play: <Svg><path d="M7 4.5v15l12.5-7.5z" fill="currentColor" /></Svg>,
  plus: <Svg><path d="M12 5v14M5 12h14" /></Svg>,
  trash: <Svg><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" /></Svg>,
  photo: <Svg><rect x="5" y="2.5" width="14" height="19" rx="3" /><path d="M10 18.5h4" /></Svg>,
  link: <Svg strokeWidth="2.6"><path d="M7 17 17 7M9 7h8v8" /></Svg>,
  al: {
    left: <Svg><path d="M4 6h16M4 10h10M4 14h16M4 18h10" /></Svg>,
    center: <Svg><path d="M4 6h16M7 10h10M4 14h16M7 18h10" /></Svg>,
    right: <Svg><path d="M4 6h16M10 10h10M4 14h16M10 18h10" /></Svg>,
  },
};
const ARROW = 'M8 52 C 40 12, 82 8, 116 30';
const RING = 'M150 14 C 196 26, 202 88, 140 108 C 84 126, 14 114, 8 70 C 2 26, 60 6, 118 8 C 140 9, 160 14, 172 22';

export default function StoryEditor({ topics, topic: startTopic = 0, frame: startFrame = 0, onChange, onClose, onSave, saving = false, dirty = false }) {
  const [doc, setDoc] = useState(topics);
  const docRef = useRef(topics);
  const hist = useRef([]);
  const fut = useRef([]);
  const [, setTick] = useState(0); // перерисовать кнопки «Отменить/Вернуть»
  const [ti, setTi] = useState(startTopic);
  const [fi, setFi] = useState(startFrame);
  const [active, setActive] = useState(null);
  const [mode, setMode] = useState('idle'); // idle | text | sheet | preview
  const [sheet, setSheet] = useState(null);
  const [edit, setEdit] = useState(null); // { L, before, isNew, key }
  const [labels, setLabels] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [guides, setGuides] = useState({ v: false, h: false });
  const [hot, setHot] = useState(false);
  const [toast, setToast] = useState(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const wrapRef = useRef(null);
  const cvRef = useRef(null);
  const trashRef = useRef(null);
  const stripRef = useRef(null);
  const spanRef = useRef(null);
  const fileRef = useRef(null);
  const toastTimer = useRef(null);

  const topic = doc[ti];
  const frames = topic ? topic.frames : [];
  const fiSafe = clamp(fi, 0, Math.max(0, frames.length - 1));
  const cur = frames[fiSafe] || null;

  const say = useCallback((text) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  /* ---------- Данные: commit, отмена ---------- */

  const commit = (next) => {
    if (next === docRef.current) return;
    hist.current.push(docRef.current);
    if (hist.current.length > 80) hist.current.shift();
    fut.current = [];
    docRef.current = next;
    setDoc(next);
    onChange(next);
  };
  const commitFrame = (frame) => commit(replaceFrame(docRef.current, ti, fiSafe, frame));
  const jump = (from, to) => {
    if (!from.current.length) return;
    to.current.push(docRef.current);
    const next = from.current.pop();
    docRef.current = next;
    setDoc(next);
    onChange(next);
    setActive(null);
    setTick((n) => n + 1);
  };
  const undo = () => jump(hist, fut);
  const redo = () => jump(fut, hist);

  // Сохранили — черновик пришёл с сервера (цвета и числа приведены): берём его
  useEffect(() => {
    if (topics !== docRef.current) { docRef.current = topics; setDoc(topics); }
  }, [topics]);

  useEffect(() => { if (fi !== fiSafe) setFi(fiSafe); }, [fi, fiSafe]);

  /* ---------- Размер кадра ---------- */

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const fit = () => {
      const aw = stage.clientWidth;
      const ah = stage.clientHeight;
      let h = Math.max(200, ah);
      let w = (h * 9) / 16;
      if (w > aw) { w = aw; h = (w * 16) / 9; }
      setBox({ w: Math.round(w), h: Math.round(h) });
    };
    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    if (ro) ro.observe(stage); else window.addEventListener('resize', fit);
    return () => { if (ro) ro.disconnect(); else window.removeEventListener('resize', fit); };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setLabels(false), 3500);
    const body = document.body;
    const prev = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => { clearTimeout(t); body.style.overflow = prev; clearTimeout(toastTimer.current); };
  }, []);

  /* ---------- Жесты на кадре ---------- */

  const pts = useRef(new Map());
  const g = useRef(null);
  const elOf = (id) => cvRef.current && cvRef.current.querySelector(`.sc-ly[data-id="${id}"]:not(.se-ed)`);

  const place = (L) => {
    const el = elOf(L.id);
    if (!el) return;
    Object.assign(el.style, placeStyle(L));
    const h = el.querySelector('.sc-hdl');
    if (h) h.style.transform = `translate(50%,50%) scale(${1 / L.scale})`;
  };
  const placeBg = (img) => {
    const el = cvRef.current && cvRef.current.querySelector('.sc-bg img');
    if (el) Object.assign(el.style, bgImageStyle(img));
  };

  const snapPos = (t, rect) => {
    const sx = Math.abs(t.x - 0.5) * rect.width < 7;
    const sy = Math.abs(t.y - 0.5) * rect.height < 7;
    if (sx) t.x = 0.5;
    if (sy) t.y = 0.5;
    if ((sx && !g.current.sx) || (sy && !g.current.sy)) buzz();
    if (sx !== g.current.sx || sy !== g.current.sy) setGuides({ v: sx, h: sy });
    g.current.sx = sx;
    g.current.sy = sy;
  };

  const tgt = () => (g.current.kind === 'bg' ? g.current.F.canvas.image : g.current.L);

  const beginPinch = () => {
    const [a, b] = [...pts.current.values()];
    const t = tgt();
    g.current.pinch = {
      d0: Math.hypot(b.x - a.x, b.y - a.y) || 1,
      a0: Math.atan2(b.y - a.y, b.x - a.x),
      m0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      s: { x: t.x, y: t.y, scale: t.scale, rotate: t.rotate || 0 },
    };
    g.current.moved = true;
    if (g.current.kind === 'layer') setDragging(true);
  };

  const onCanvasDown = (e) => {
    if (mode !== 'idle' || !cur || (e.button && e.button !== 0)) return;
    e.preventDefault();
    try { cvRef.current.setPointerCapture(e.pointerId); } catch (_) {}
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setLabels(false);
    const rect = cvRef.current.getBoundingClientRect();
    if (pts.current.size === 1) {
      const F = clone(cur);
      const le = e.target.closest('.sc-ly');
      const base = { F, rect, p0: { x: e.clientX, y: e.clientY }, t0: performance.now(), moved: false };
      const L = le ? F.canvas.layers.find((l) => l.id === le.dataset.id) : null;
      if (L && e.target.closest('.sc-hdl')) {
        g.current = { ...base, kind: 'handle', L, s0: L.scale, r0: L.rotate, c: { x: rect.left + L.x * rect.width, y: rect.top + L.y * rect.height } };
      } else if (L) {
        le.style.zIndex = '50';
        setActive(L.id);
        g.current = { ...base, kind: 'layer', L, el: le, start: { x: L.x, y: L.y } };
      } else {
        const img = F.canvas.image;
        g.current = { ...base, kind: img ? 'bg' : 'empty', start: img ? { x: img.x, y: img.y } : null, py: (e.clientY - rect.top) / rect.height };
      }
    } else if (pts.current.size === 2 && g.current && (g.current.kind === 'layer' || g.current.kind === 'bg')) {
      beginPinch();
    }
  };

  const onMove = (e) => {
    if (!pts.current.has(e.pointerId)) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const G = g.current;
    if (!G) return;
    const P = [...pts.current.values()];
    const rect = G.rect;
    if (G.kind === 'handle') {
      const v0 = { x: G.p0.x - G.c.x, y: G.p0.y - G.c.y };
      const v = { x: e.clientX - G.c.x, y: e.clientY - G.c.y };
      G.L.scale = r3(clamp((G.s0 * Math.hypot(v.x, v.y)) / (Math.hypot(v0.x, v0.y) || 1), 0.25, 8));
      G.L.rotate = snapRot(G.r0 + deg(Math.atan2(v.y, v.x) - Math.atan2(v0.y, v0.x)));
      G.moved = true;
      place(G.L);
      return;
    }
    if (G.kind === 'empty') {
      if (Math.hypot(e.clientX - G.p0.x, e.clientY - G.p0.y) > 8) G.moved = true;
      return;
    }
    const t = tgt();
    if (G.pinch && P.length >= 2) {
      const [a, b] = P;
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      const an = Math.atan2(b.y - a.y, b.x - a.x);
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      t.scale = r3(clamp((G.pinch.s.scale * d) / G.pinch.d0, G.kind === 'bg' ? 0.6 : 0.25, 8));
      if (G.kind === 'layer') t.rotate = snapRot(G.pinch.s.rotate + deg(an - G.pinch.a0));
      t.x = r3(G.pinch.s.x + (m.x - G.pinch.m0.x) / rect.width);
      t.y = r3(G.pinch.s.y + (m.y - G.pinch.m0.y) / rect.height);
      if (G.kind === 'layer') snapPos(t, rect);
    } else if (!G.pinch && P.length === 1) {
      const dx = e.clientX - G.p0.x;
      const dy = e.clientY - G.p0.y;
      if (!G.moved) {
        if (Math.hypot(dx, dy) < 6) return;
        G.moved = true;
        if (G.kind === 'layer') setDragging(true);
      }
      t.x = r3(clamp(G.start.x + dx / rect.width, G.kind === 'bg' ? -1 : -0.5, G.kind === 'bg' ? 1 : 1.5));
      t.y = r3(clamp(G.start.y + dy / rect.height, G.kind === 'bg' ? -1 : -0.5, G.kind === 'bg' ? 1 : 1.5));
      if (G.kind === 'layer') {
        snapPos(t, rect);
        const tr = trashRef.current.getBoundingClientRect();
        const near = Math.hypot(e.clientX - (tr.left + tr.width / 2), e.clientY - (tr.top + tr.height / 2)) < 56;
        if (near !== !!G.hot) {
          G.hot = near;
          setHot(near);
          G.el.classList.toggle('is-doomed', near);
          if (near) buzz();
        }
      }
    } else return;
    if (G.kind === 'bg') placeBg(t); else place(t);
  };

  const toFront = (F, L) => {
    const i = F.canvas.layers.indexOf(L);
    if (i > -1 && i < F.canvas.layers.length - 1) { F.canvas.layers.splice(i, 1); F.canvas.layers.push(L); }
  };

  const cycle = (L) => {
    if (L.kind === 'step') L.value = (L.value % 9) + 1;
    else if (L.kind === 'badge') L.value = ((L.value || 0) + 1) % BADGES.length;
    else if (L.kind === 'emoji') return false;
    else if (L.kind === 'art') L.color = STICKER_COLORS[(STICKER_COLORS.indexOf(L.color) + 1) % STICKER_COLORS.length];
    else L.variant = ((L.variant || 0) + 1) % (L.kind === 'link' || L.kind === 'photo' ? 3 : STICKER_COLORS.length);
    buzz();
    return true;
  };

  const onUp = (e) => {
    if (!pts.current.has(e.pointerId)) return;
    pts.current.delete(e.pointerId);
    const G = g.current;
    if (!G) return;
    if (G.pinch && pts.current.size === 1) {
      const p = [...pts.current.values()][0];
      const t = tgt();
      G.pinch = null;
      G.start = { x: t.x, y: t.y };
      G.p0 = { ...p };
      return;
    }
    if (pts.current.size) return;
    g.current = null;
    setDragging(false);
    setGuides({ v: false, h: false });
    setHot(false);
    if (G.el) { G.el.style.zIndex = ''; G.el.classList.remove('is-doomed'); }
    const F = G.F;
    if (G.kind === 'layer') {
      if (G.hot && e.type !== 'pointercancel') {
        F.canvas.layers = F.canvas.layers.filter((l) => l !== G.L);
        setActive(null);
        commitFrame(F);
        return;
      }
      if (!G.moved && performance.now() - G.t0 < 400) {
        if (G.L.type === 'text') { openText(G.L, false); return; }
        if (cycle(G.L)) { toFront(F, G.L); commitFrame(F); }
        return;
      }
      if (G.moved) { toFront(F, G.L); commitFrame(F); }
      return;
    }
    if (G.kind === 'handle') { if (G.moved) commitFrame(F); return; }
    if (!G.moved) {
      if (e.type === 'pointercancel') return;
      if (active) setActive(null); else newText(G.py);
      return;
    }
    if (G.kind === 'bg') commitFrame(F);
  };

  // Обработчики на window вешаются один раз, а состояние — свежее, через ref
  const live = useRef({});
  live.current = { onMove, onUp };
  useEffect(() => {
    const move = (e) => live.current.onMove(e);
    const up = (e) => live.current.onUp(e);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);

  /* Мышь и тачпад: колесо — размер, с Shift — поворот; щипок тачпада — колесо с Ctrl */
  const wheel = useRef(null);
  const onWheel = (e) => {
    if (mode !== 'idle' || !cur) return;
    const le = e.target.closest('.sc-ly');
    const id = le ? le.dataset.id : active;
    if (!wheel.current) wheel.current = { F: clone(cur), t: null };
    const W = wheel.current;
    const L = id ? W.F.canvas.layers.find((l) => l.id === id) : null;
    const img = !L && W.F.canvas.image;
    if (!L && !img) { if (!W.t) wheel.current = null; return; }
    e.preventDefault();
    const delta = e.deltaY || e.deltaX;
    const k = Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.0015));
    if (L) {
      if (active !== L.id) setActive(L.id);
      if (e.shiftKey || e.altKey) L.rotate = snapRot(L.rotate + delta * 0.15);
      else L.scale = r3(clamp(L.scale * k, 0.25, 8));
      place(L);
    } else {
      img.scale = r3(clamp(img.scale * k, 0.6, 8));
      placeBg(img);
    }
    clearTimeout(W.t);
    W.t = setTimeout(() => { wheel.current = null; commitFrame(W.F); }, 350);
  };
  live.current.onWheel = onWheel;
  useEffect(() => {
    const el = cvRef.current;
    if (!el) return undefined;
    const fn = (e) => live.current.onWheel(e);
    el.addEventListener('wheel', fn, { passive: false });
    return () => el.removeEventListener('wheel', fn);
  }, [box.w > 0, !!cur]);

  /* ---------- Текст ---------- */

  const newText = (py) => {
    if (!cur) return;
    if (cur.canvas.layers.length >= CANVAS_LIMITS.layers) { say(`В кадре уже ${CANVAS_LIMITS.layers} слоёв — это предел. Уберите лишний.`); return; }
    const style = lastStyle.current;
    const L = textLayer('', {
      id: layerId(cur.canvas.layers.map((l) => l.id)),
      style,
      color: isLightBg(cur.canvas) ? '#1a1815' : '#ffffff',
      size: style === 'strong' ? 7 : 6,
      y: r3(clamp(py == null ? 0.45 : py, 0.16, 0.86)),
    });
    openText(L, true);
  };
  const lastStyle = useRef('classic');

  const openText = (L, isNew) => {
    setActive(null);
    setEdit({ L: clone(L), isNew, key: Date.now() });
    setMode('text');
  };

  const readSpan = () => (spanRef.current ? (spanRef.current.innerText || '').replace(/ /g, ' ').replace(/\n$/, '') : '');

  useLayoutEffect(() => {
    if (!edit) return;
    const sp = spanRef.current;
    if (!sp) return;
    if (sp.contentEditable !== 'plaintext-only') sp.contentEditable = 'true';
    sp.textContent = edit.L.text;
    sp.classList.toggle('is-empty', !edit.L.text);
    requestAnimationFrame(() => {
      try {
        sp.focus({ preventScroll: true });
        const r = document.createRange();
        r.selectNodeContents(sp);
        r.collapse(false);
        const s = window.getSelection();
        s.removeAllRanges();
        s.addRange(r);
      } catch (_) {}
    });
    kb();
  }, [edit && edit.key]);

  const onTextInput = () => {
    let v = readSpan();
    if (v.length > CANVAS_LIMITS.text) {
      v = v.slice(0, CANVAS_LIMITS.text);
      spanRef.current.textContent = v;
      say(`Не длиннее ${CANVAS_LIMITS.text} знаков — разбейте на два текста.`);
    }
    spanRef.current.classList.toggle('is-empty', !v);
  };

  const onTextPaste = (e) => {
    if (spanRef.current && spanRef.current.contentEditable === 'plaintext-only') return;
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text');
    document.execCommand('insertText', false, text);
  };

  const restyle = (patch) => setEdit((x) => (x ? { ...x, L: { ...x.L, ...patch } } : x));

  const closeText = () => {
    if (mode !== 'text' || !edit) return;
    const text = readSpan().replace(/^\s+|\s+$/g, '');
    const L = { ...edit.L, text };
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    setMode('idle');
    setEdit(null);
    const F = clone(cur);
    const at = F.canvas.layers.findIndex((l) => l.id === L.id);
    if (!text) {
      if (at > -1) { F.canvas.layers.splice(at, 1); commitFrame(F); }
      return;
    }
    if (at > -1) F.canvas.layers[at] = L; else F.canvas.layers.push(L);
    lastStyle.current = L.style;
    setActive(L.id);
    if (JSON.stringify(F) !== JSON.stringify(cur)) commitFrame(F);
  };

  /* Клавиатура телефона закрывает низ кадра — панель стилей поднимается над ней */
  const kb = () => {
    const vv = window.visualViewport;
    const wrap = wrapRef.current;
    if (!vv || !wrap) return;
    const over = Math.max(0, wrap.getBoundingClientRect().bottom - (vv.height + vv.offsetTop));
    wrap.style.setProperty('--kb', over ? over + 10 + 'px' : '0px');
  };
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    vv.addEventListener('resize', kb);
    vv.addEventListener('scroll', kb);
    return () => { vv.removeEventListener('resize', kb); vv.removeEventListener('scroll', kb); };
  }, []);

  /* Размер — клин слева: шире вверху — крупнее */
  const sizerRef = useRef(null);
  const sizing = useRef(false);
  const sizeFromY = (y) => {
    const r = sizerRef.current.getBoundingClientRect();
    const v = clamp(1 - (y - r.top) / r.height, 0, 1);
    restyle({ size: r3(SIZE_MIN + v * (SIZE_MAX - SIZE_MIN)) });
  };

  /* ---------- Картинки ---------- */

  const pickImage = (max, done) => {
    const input = fileRef.current;
    if (!input) return;
    input.value = '';
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      say('Загружаем картинку…');
      try {
        const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        const blob = await shrinkPhoto(file, max, type);
        const { url } = await uploadStoryImage(blob);
        setToast(null);
        done(url);
      } catch (err) {
        say(err.message || 'Не получилось загрузить картинку. Подойдёт JPG или PNG.');
      }
    };
    input.click();
  };

  /* ---------- Листы ---------- */

  const openSheet = (name) => { setLabels(false); setSheet(name); setMode('sheet'); };
  const closeSheet = () => { setMode('idle'); setSheet(null); };

  const addLayer = (L) => {
    if (!cur) return;
    if (cur.canvas.layers.length >= CANVAS_LIMITS.layers) { say(`В кадре уже ${CANVAS_LIMITS.layers} слоёв — это предел. Уберите лишний.`); return; }
    const F = clone(cur);
    L.id = layerId(F.canvas.layers.map((l) => l.id));
    F.canvas.layers.push(L);
    setActive(L.id);
    closeSheet();
    commitFrame(F);
  };

  const changeFrame = (fn) => { const F = clone(cur); fn(F); commitFrame(F); };
  const changeTopic = (patch) => commit(updateTopic(docRef.current, ti, patch));

  /* ---------- Лента кадров ---------- */

  const pickFrame = (i) => {
    if (i === fiSafe) { openSheet('frame'); return; }
    setFi(i);
    setActive(null);
  };

  const newFrame = () => {
    if (frames.length >= LIMITS.frames) { say(`В теме уже ${LIMITS.frames} кадра — это предел.`); return; }
    const at = frames.length ? fiSafe + 1 : 0;
    const r = addFrame(docRef.current, ti, Date.now(), at);
    commit(r.draft);
    setFi(r.frame);
    setActive(null);
  };

  const sg = useRef(null);
  const onStripDown = (e) => {
    if (e.button && e.button !== 0) return;
    const th = e.target.closest('.se-th');
    const strip = stripRef.current;
    sg.current = { id: e.pointerId, x0: e.clientX, sl: strip.scrollLeft, add: !!e.target.closest('.se-th-add'), i: th ? +th.dataset.i : -1, mode: 'pending', t: null };
    try { strip.setPointerCapture(e.pointerId); } catch (_) {}
    if (th) {
      sg.current.t = setTimeout(() => {
        const S = sg.current;
        if (!S || S.mode !== 'pending') return;
        S.mode = 'reorder';
        S.before = docRef.current;
        S.curId = cur && cur.id;
        setLifted(S.i);
        buzz();
      }, HOLD_MS);
    }
  };
  const [lifted, setLifted] = useState(-1);
  const onStripMove = (e) => {
    const S = sg.current;
    if (!S || e.pointerId !== S.id) return;
    const dx = e.clientX - S.x0;
    if (S.mode === 'pending' && Math.abs(dx) > 6) { clearTimeout(S.t); S.mode = 'scroll'; }
    if (S.mode === 'scroll') stripRef.current.scrollLeft = S.sl - dx;
    if (S.mode === 'reorder') {
      let to = S.i;
      stripRef.current.querySelectorAll('.se-th').forEach((t, k) => {
        const r = t.getBoundingClientRect();
        if (e.clientX > r.left && e.clientX < r.right) to = k;
      });
      if (to !== S.i) {
        const next = moveFrame(docRef.current, ti, S.i, to);
        docRef.current = next;
        setDoc(next);
        S.i = to;
        setLifted(to);
        setFi(next[ti].frames.findIndex((f) => f.id === S.curId));
      }
    }
  };
  const onStripUp = (e) => {
    const S = sg.current;
    if (!S || e.pointerId !== S.id) return;
    clearTimeout(S.t);
    sg.current = null;
    if (S.mode === 'reorder') {
      setLifted(-1);
      if (docRef.current !== S.before) {
        hist.current.push(S.before);
        fut.current = [];
        onChange(docRef.current);
        setTick((n) => n + 1);
      }
      return;
    }
    if (S.mode !== 'pending' || e.type === 'pointercancel') return;
    if (S.add) newFrame();
    else if (S.i > -1) pickFrame(S.i);
  };
  // Клавиатура: Enter и пробел по миниатюре — click без указателя
  const onStripClick = (e) => {
    if (e.detail !== 0) return;
    const th = e.target.closest('.se-th');
    if (e.target.closest('.se-th-add')) newFrame(); else if (th) pickFrame(+th.dataset.i);
  };

  useEffect(() => {
    const strip = stripRef.current;
    const c = strip && strip.querySelector('.se-th.is-cur');
    if (!c) return;
    const sr = strip.getBoundingClientRect();
    const cr = c.getBoundingClientRect();
    if (cr.left < sr.left) strip.scrollLeft -= sr.left - cr.left + 6;
    else if (cr.right > sr.right) strip.scrollLeft += cr.right - sr.right + 6;
  }, [fiSafe, ti, frames.length]);

  /* ---------- Просмотр и сохранение ---------- */

  const openPreview = () => {
    if (mode === 'text') closeText();
    if (!frames.some((f) => !f.hidden)) { say('Все кадры темы скрыты — показывать нечего.'); return; }
    setMode('preview');
  };

  const save = async () => {
    if (mode === 'text') closeText();
    const error = await onSave();
    if (error) say(error);
    else say('Сохранено. Люди увидят при следующем открытии приложения.');
  };

  /* ---------- «Назад» и клавиши ---------- */

  const back = () => {
    if (mode === 'text') closeText();
    else if (mode === 'sheet') closeSheet();
    else if (mode === 'preview') setMode('idle');
    else onClose();
  };
  useBackGesture(back, true, null, { swipe: false });

  live.current.onKey = (e) => {
    if (mode === 'preview') return; // у просмотра свои клавиши
    if (mode === 'text') { if (e.key === 'Escape') { e.preventDefault(); closeText(); } return; }
    if (mode === 'sheet') { if (e.key === 'Escape') closeSheet(); return; }
    if (e.target.closest && e.target.closest('input, textarea, [contenteditable]')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (e.key === 'Escape') { if (active) setActive(null); else onClose(); return; }
    const L = cur && active ? cur.canvas.layers.find((l) => l.id === active) : null;
    if (!L) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      changeFrame((F) => { F.canvas.layers = F.canvas.layers.filter((l) => l.id !== L.id); });
      setActive(null);
    } else if (e.key === 'Enter' && L.type === 'text') {
      e.preventDefault();
      openText(L, false);
    } else if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      const st = e.shiftKey ? 0.02 : 0.004;
      changeFrame((F) => {
        const x = F.canvas.layers.find((l) => l.id === L.id);
        if (e.key === 'ArrowLeft') x.x = r3(x.x - st);
        if (e.key === 'ArrowRight') x.x = r3(x.x + st);
        if (e.key === 'ArrowUp') x.y = r3(x.y - st);
        if (e.key === 'ArrowDown') x.y = r3(x.y + st);
      });
    }
  };
  useEffect(() => {
    const fn = (e) => live.current.onKey(e);
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, []);

  /* ---------- Отрисовка ---------- */

  const flag = !cur ? '' : cur.hidden ? 'Кадр скрыт — его никто не видит' : cur.only === 'ios' ? 'Только на iPhone' : cur.only === 'android' ? 'Кроме iPhone' : '';
  const E = edit && edit.L;
  const sizeV = E ? (E.size - SIZE_MIN) / (SIZE_MAX - SIZE_MIN) : 0;
  const keepFocus = (e) => e.preventDefault();

  return (
    <div className={'se' + (dragging ? ' is-dragging' : '') + (mode === 'sheet' ? ' is-sheet' : '')} ref={rootRef} role="dialog" aria-modal="true" aria-label="Редактор историй">
      <div className="se-stage" ref={stageRef}>
        <div
          className={'se-wrap' + (labels ? ' labels' : '') + (mode === 'text' ? ' mode-text' : '')}
          ref={wrapRef}
          style={{ width: box.w, height: box.h }}
        >
          {cur ? (
            <StoryCanvas
              canvas={cur.canvas}
              className="se-cv"
              active={mode === 'idle' ? active : null}
              editing={E ? E.id : null}
              handle
              innerRef={cvRef}
              onPointerDown={onCanvasDown}
            >
              {!cur.canvas.layers.length && mode !== 'text' && (
                <div className="se-hint" style={isLightBg(cur.canvas) ? { color: 'rgba(20,18,22,.5)' } : null}>Коснитесь, чтобы написать</div>
              )}
              {E && (
                <>
                  <div className="se-dim" onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); closeText(); }} />
                  <div className={textClass(E) + ' se-ed'} style={textVars(E)} onPointerDown={(e) => e.stopPropagation()}>
                    <span
                      ref={spanRef}
                      className="sc-tx"
                      contentEditable="plaintext-only"
                      suppressContentEditableWarning
                      role="textbox"
                      aria-multiline="true"
                      aria-label="Текст на кадре"
                      spellCheck
                      onInput={onTextInput}
                      onPaste={onTextPaste}
                    />
                  </div>
                </>
              )}
            </StoryCanvas>
          ) : (
            <div className="sc se-cv se-cv--empty" ref={cvRef}>
              <div className="se-hint">Кадров нет — нажмите «+» внизу</div>
            </div>
          )}

          {guides.v && <div className="se-guide se-guide--v" />}
          {guides.h && <div className="se-guide se-guide--h" />}
          <div className="se-safe">Тут полоски и подпись темы</div>
          <div className={'se-trash' + (hot ? ' hot' : '')} ref={trashRef} aria-hidden="true">{I.trash}</div>

          <div className="se-chrome">
            <div className="se-top">
              <button type="button" className="se-rb" onClick={onClose} aria-label="Закрыть редактор"><span className="ic">{I.close}</span></button>
              <div className="se-topics" role="group" aria-label="Тема">
                {doc.map((t, i) => (
                  <button key={t.id} type="button" aria-pressed={i === ti}
                    onClick={() => { if (i !== ti) { setTi(i); setFi(0); setActive(null); } }}>
                    {t.label}
                  </button>
                ))}
              </div>
              <span className="se-sp" />
              <button type="button" className="se-rb" onClick={undo} disabled={!hist.current.length} aria-label="Отменить" title="Отменить (Ctrl+Z)"><span className="ic">{I.undo}</span></button>
              <button type="button" className="se-rb" onClick={redo} disabled={!fut.current.length} aria-label="Вернуть" title="Вернуть (Ctrl+Shift+Z)"><span className="ic">{I.redo}</span></button>
            </div>
            <div className="se-tools">
              <Tool label="Текст" disabled={!cur} onClick={() => { setLabels(false); newText(0.45); }}><span className="aa">Aa</span></Tool>
              <Tool label="Наклейки" disabled={!cur} onClick={() => openSheet('stickers')}>{I.sticker}</Tool>
              <Tool label="Фон" disabled={!cur} onClick={() => openSheet('bg')}>{I.bg}</Tool>
              <Tool label="Кадр" disabled={!cur} onClick={() => openSheet('frame')}>{I.frame}</Tool>
              <Tool label="Подсказки" onClick={() => openSheet('help')}>{I.help}</Tool>
            </div>
            {flag && <div className="se-flag">{flag}</div>}
          </div>

          {E && (
            <div className="se-textbar">
              <div className="se-tb-top">
                <button type="button" className="se-rb" aria-label="Выравнивание" onPointerDown={keepFocus}
                  onClick={() => restyle({ align: { center: 'left', left: 'right', right: 'center' }[E.align] })}>
                  <span className="ic">{I.al[E.align]}</span>
                </button>
                <button type="button" className="se-rb" aria-label={['Плашка: нет', 'Плашка: цветная', 'Плашка: тёмная'][E.plate || 0]} onPointerDown={keepFocus}
                  onClick={() => restyle({ plate: ((E.plate || 0) + 1) % 3 })}>
                  <span className="ic"><span className="se-plate" data-p={E.plate || 0}>A</span></span>
                </button>
                <span className="se-sp" />
                <button type="button" className="se-done" onClick={closeText}>Готово</button>
              </div>
              <div
                className="se-sizer" ref={sizerRef} role="slider" tabIndex={0} aria-label="Размер текста"
                aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(sizeV * 100)}
                onPointerDown={(e) => { e.preventDefault(); sizerRef.current.setPointerCapture(e.pointerId); sizing.current = true; sizeFromY(e.clientY); }}
                onPointerMove={(e) => { if (sizing.current) sizeFromY(e.clientY); }}
                onPointerUp={() => { sizing.current = false; }}
                onPointerCancel={() => { sizing.current = false; }}
                onKeyDown={(e) => {
                  const step = e.key === 'ArrowUp' ? 0.5 : e.key === 'ArrowDown' ? -0.5 : 0;
                  if (!step) return;
                  e.preventDefault();
                  restyle({ size: clamp(E.size + step, SIZE_MIN, SIZE_MAX) });
                }}
              >
                <div className="wedge" /><div className="knob" style={{ top: (1 - sizeV) * 100 + '%' }} />
              </div>
              <div className="se-tb-bottom">
                <div className="se-chips">
                  {TEXT_STYLES.map((s) => (
                    <button key={s.id} type="button" className={'se-chip sc-st-' + s.id} aria-pressed={E.style === s.id}
                      onPointerDown={keepFocus} onClick={() => restyle({ style: s.id })}>{s.name}</button>
                  ))}
                </div>
                <div className="se-swatches">
                  {TEXT_COLORS.map((c) => (
                    <button key={c} type="button" className="se-sw" style={{ background: c }} aria-label={'Цвет ' + c} aria-pressed={E.color === c}
                      onPointerDown={keepFocus} onClick={() => restyle({ color: c })} />
                  ))}
                  <label className="se-sw se-sw-custom" title="Свой цвет">
                    <input type="color" aria-label="Свой цвет" value={E.color} onChange={(e) => restyle({ color: e.target.value })} />
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="se-bar">
        <div className="se-strip" ref={stripRef} aria-label="Кадры темы"
          onPointerDown={onStripDown} onPointerMove={onStripMove} onPointerUp={onStripUp} onPointerCancel={onStripUp} onClick={onStripClick}>
          {frames.map((f, i) => (
            <button key={f.id} type="button" data-i={i}
              className={'se-th' + (i === fiSafe ? ' is-cur' : '') + (f.hidden ? ' is-hidden' : '') + (i === lifted ? ' lift' : '')}
              aria-label={`Кадр ${i + 1}${f.hidden ? ', скрыт' : ''}${i === fiSafe ? ', открыт — нажмите для настроек' : ''}`}>
              <StoryCanvas canvas={f.canvas} />
              {(f.only || f.hidden) && <span className="mark">{f.hidden ? 'скрыт' : f.only === 'ios' ? 'iPhone' : 'не iPhone'}</span>}
            </button>
          ))}
          <button type="button" className="se-th-add" aria-label="Новый кадр">{I.plus}</button>
        </div>
        <button type="button" className="se-play" onClick={openPreview} aria-label="Посмотреть, как увидит клиент" title="Посмотреть">{I.play}</button>
        <button type="button" className="se-save" onClick={save} disabled={saving || !dirty}>
          {saving ? 'Сохраняем…' : dirty ? <>Сохранить<span className="dot" aria-label="есть несохранённое" /></> : 'Сохранено'}
        </button>
      </div>

      {mode === 'sheet' && (
        <Sheet onClose={closeSheet}>
          {sheet === 'stickers' && (
            <StickerSheet
              onLink={() => setSheet('link')}
              onAdd={addLayer}
              steps={cur ? cur.canvas.layers.filter((l) => l.kind === 'step').length : 0}
              onPhoto={() => pickImage(1600, (src) => addLayer(stickerLayer('photo', { src, variant: 1, y: 0.55 })))}
            />
          )}
          {sheet === 'link' && <LinkSheet onAdd={addLayer} onBack={() => setSheet('stickers')} />}
          {sheet === 'bg' && cur && <BgSheet canvas={cur.canvas} onChange={changeFrame} onPick={pickImage} placeBg={placeBg} />}
          {sheet === 'frame' && cur && (
            <FrameSheet
              topic={topic} frame={cur} index={fiSafe}
              onFrame={changeFrame} onTopic={changeTopic}
              onDuplicate={() => {
                if (frames.length >= LIMITS.frames) { say(`В теме уже ${LIMITS.frames} кадра — это предел.`); return; }
                commit(duplicateFrame(docRef.current, ti, fiSafe));
                setFi(fiSafe + 1);
                closeSheet();
                say('Копия кадра — сразу за ним');
              }}
              onRemove={() => {
                commit(removeFrame(docRef.current, ti, fiSafe));
                setFi(Math.max(0, fiSafe - 1));
                setActive(null);
                closeSheet();
              }}
            />
          )}
          {sheet === 'help' && <HelpSheet />}
        </Sheet>
      )}

      {mode === 'preview' && topic && (
        <StoryPreview
          topic={topic}
          frame={frames.slice(0, fiSafe).filter((f) => !f.hidden).length}
          onClose={() => setMode('idle')}
          onOpen={(section) => { setMode('idle'); say('В приложении откроется: ' + SECTIONS.find((s) => s.id === section).name); }}
        />
      )}

      <div className={'se-toast' + (toast ? ' on' : '')} role="status" aria-live="polite">{toast}</div>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden />
    </div>
  );
}

function Tool({ label, children, ...rest }) {
  return (
    <button type="button" className="se-rb" aria-label={label} {...rest}>
      <span className="lbl">{label}</span>
      <span className="ic">{children}</span>
    </button>
  );
}

function Sheet({ onClose, children }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setOn(true)));
    return () => cancelAnimationFrame(r);
  }, []);
  return (
    <div className={'se-sheet-host' + (on ? ' on' : '')}>
      <div className="se-sheet-back" onClick={onClose} />
      <div className="se-sheet" role="dialog" aria-modal="true">
        <div className="grab" />
        {children}
      </div>
    </div>
  );
}

function StickerSheet({ onLink, onAdd, onPhoto, steps }) {
  const Tile = ({ pv, name, onClick }) => (
    <button type="button" className="se-tile" onClick={onClick}>{pv}<span>{name}</span></button>
  );
  return (
    <>
      <h2>Наклейки</h2>
      <div className="se-grid">
        <Tile pv={<span className="pv pv-link">{I.link}Раздел</span>} name="Кнопка раздела" onClick={onLink} />
        <Tile pv={<svg className="pv" viewBox="0 0 130 70" fill="none" stroke="#f5c65c" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round"><path d={ARROW} /><path d="M96 14 L118 31 L95 45" /></svg>}
          name="Стрелка" onClick={() => onAdd(stickerLayer('arrow', { y: 0.45 }))} />
        <Tile pv={<svg className="pv" viewBox="0 0 200 124" fill="none" stroke="#f5c65c" strokeWidth="10" strokeLinecap="round"><path d={RING} /></svg>}
          name="Обвести" onClick={() => onAdd(stickerLayer('ring', { y: 0.45 }))} />
        <Tile pv={<span className="pv pv-step">1</span>} name="Шаг"
          onClick={() => onAdd(stickerLayer('step', { value: (steps % 9) + 1, x: 0.14, y: r3(clamp(0.3 + steps * 0.13, 0.2, 0.85)) }))} />
        <Tile pv={<span className="pv pv-badge">Новое</span>} name="Метка" onClick={() => onAdd(stickerLayer('badge', { value: 0, y: 0.2 }))} />
        <Tile pv={<span className="pv">{I.photo}</span>} name="Снимок экрана" onClick={onPhoto} />
      </div>
      <h3>Эмодзи</h3>
      <div className="se-emojis">
        {EMOJI.map((em) => (
          <button key={em} type="button" aria-label={em} onClick={() => onAdd(stickerLayer('emoji', { value: em, y: 0.4 }))}>{em}</button>
        ))}
      </div>
      <h3>Рисунки из приложения</h3>
      <div className="se-arts">
        {Object.keys(ART).map((name) => {
          const Picture = ART[name];
          return (
            <button key={name} type="button" aria-label={'Рисунок ' + name} style={{ '--tint': '#8ec0f5' }}
              onClick={() => onAdd(stickerLayer('art', { value: name, color: '#8ec0f5', y: 0.35 }))}>
              <Picture />
            </button>
          );
        })}
      </div>
      <p>Касание наклейки на кадре меняет её вид: цвет, номер шага, слово на метке, рамку снимка.</p>
    </>
  );
}

function LinkSheet({ onAdd, onBack }) {
  return (
    <>
      <h2>Куда ведёт кнопка</h2>
      <p>Человек нажмёт на кнопку в истории — откроется этот раздел приложения.</p>
      <div className="se-list">
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" onClick={() => onAdd(stickerLayer('link', { section: s.id, y: 0.75 }))}>
            {s.name}<span>{s.label}</span>
          </button>
        ))}
      </div>
      <div className="se-row" style={{ marginTop: 12 }}>
        <button type="button" className="se-btn" onClick={onBack}>← Все наклейки</button>
      </div>
    </>
  );
}

function BgSheet({ canvas, onChange, onPick, placeBg }) {
  const img = canvas.image;
  const [dim, setDim] = useState(img ? img.dim || 0 : 0);
  useEffect(() => { setDim(img ? img.dim || 0 : 0); }, [img && img.src]);
  const setBg = (bg) => onChange((F) => { F.canvas.bg = bg; });
  const put = () => onPick(1920, (src) => onChange((F) => { F.canvas.image = { src, x: 0, y: 0, scale: 1, dim: 0 }; }));
  return (
    <>
      <h2>Фон кадра</h2>
      <h3>Градиент</h3>
      <div className="se-dots">
        {GRADIENTS.map((gr) => (
          <button key={gr.id} type="button" style={{ background: gr.css }} aria-label={'Градиент ' + gr.id}
            aria-pressed={!img && canvas.bg.kind === 'gradient' && canvas.bg.value === gr.id}
            onClick={() => setBg({ kind: 'gradient', value: gr.id })} />
        ))}
      </div>
      <h3>Цвет</h3>
      <div className="se-dots">
        {BG_COLORS.map((c) => (
          <button key={c} type="button" style={{ background: c }} aria-label={'Цвет ' + c}
            aria-pressed={!img && canvas.bg.kind === 'color' && canvas.bg.value === c}
            onClick={() => setBg({ kind: 'color', value: c })} />
        ))}
      </div>
      <h3>Картинка на весь кадр</h3>
      <p>Картинки 1080 × 1920 готовит Claude — вам остаётся вставить. Двигать и увеличивать — пальцами прямо по кадру, мышью — колесом.</p>
      {!img ? (
        <div className="se-row"><button type="button" className="se-btn" onClick={put}>Вставить картинку</button></div>
      ) : (
        <>
          <div className="se-row">
            <button type="button" className="se-btn" onClick={put}>Заменить</button>
            <button type="button" className="se-btn" onClick={() => onChange((F) => { Object.assign(F.canvas.image, { x: 0, y: 0, scale: 1 }); })}>По размеру кадра</button>
            <button type="button" className="se-btn danger" onClick={() => onChange((F) => { delete F.canvas.image; })}>Убрать</button>
          </div>
          <label className="se-field" style={{ marginTop: 14 }}>
            <span>Затемнить, чтобы текст читался</span>
            <input type="range" className="se-range" min="0" max="0.7" step="0.05" value={dim}
              onChange={(e) => {
                const v = +e.target.value;
                setDim(v);
                const el = document.querySelector('.se-cv .sc-dim');
                if (el) el.style.opacity = v;
              }}
              onPointerUp={() => onChange((F) => { F.canvas.image.dim = dim; })}
              onKeyUp={() => onChange((F) => { F.canvas.image.dim = dim; })} />
          </label>
        </>
      )}
    </>
  );
}

function FrameSheet({ topic, frame, index, onFrame, onTopic, onDuplicate, onRemove }) {
  const [sure, setSure] = useState(false);
  const [date, setDate] = useState(frame.date || '');
  const [caption, setCaption] = useState(topic.caption);
  const old = legacyFields(frame.canvas, topic.caption);
  const seg = (items, val, on) => (
    <div className="se-seg" role="group">
      {items.map((it) => (
        <button key={it.value} type="button" aria-pressed={val === it.value} onClick={() => on(it.value)}>{it.label}</button>
      ))}
    </div>
  );
  return (
    <>
      <h2>Кадр {index + 1} из {topic.frames.length}</h2>
      <div className="se-field">
        <span>Где показывать</span>
        {seg(DEVICES, frame.only || '', (v) => onFrame((F) => { if (v) F.only = v; else delete F.only; }))}
      </div>
      <label className="se-field">
        <span>Дата рядом с подписью темы</span>
        <input type="text" value={date} placeholder="Например, 19 октября" maxLength={LIMITS.date}
          onChange={(e) => setDate(e.target.value)}
          onBlur={() => onFrame((F) => { const v = date.trim(); if (v) F.date = v; else delete F.date; })} />
      </label>
      <label className="se-switch">
        Скрыть кадр — никто его не увидит
        <input type="checkbox" checked={!!frame.hidden} onChange={(e) => onFrame((F) => { if (e.target.checked) F.hidden = true; else delete F.hidden; })} />
      </label>
      <div className="se-row" style={{ marginTop: 12 }}>
        <button type="button" className="se-btn" onClick={onDuplicate}>Дублировать</button>
        <button type="button" className={'se-btn danger' + (sure ? ' sure' : '')} onClick={() => { if (sure) onRemove(); else setSure(true); }}>
          {sure ? 'Точно удалить?' : 'Удалить кадр'}
        </button>
      </div>

      <h3>Тема «{topic.label}»</h3>
      <label className="se-field">
        <span>Подпись над кадрами</span>
        <input type="text" value={caption} maxLength={LIMITS.caption}
          onChange={(e) => setCaption(e.target.value)}
          onBlur={() => { const v = caption.trim(); if (v && v !== topic.caption) onTopic({ caption: v }); else setCaption(topic.caption); }} />
      </label>
      <div className="se-field">
        <span>Кому показывать</span>
        {seg([{ value: 'all', label: 'Всем' }, { value: 'clients', label: 'Клиентам' }, { value: 'trainers', label: 'Тренерам' }], topic.audience, (v) => onTopic({ audience: v }))}
      </div>
      {topic.id === 'release' && (
        <div className="se-rule">
          В «Что нового» — только то, чем пользуется клиент, и как инструкция: куда зайти и что нажать.
          Новый кадр зажжёт кружок у всех, правка старого — нет.
        </div>
      )}
      <div className="se-old">
        <span>На старых версиях приложения этот кадр — текстом:</span>
        <strong>{old.heading}</strong>
        {old.body && <span>{old.body}</span>}
      </div>
    </>
  );
}

function HelpSheet() {
  return (
    <>
      <h2>Как пользоваться</h2>
      <ol className="se-steps">
        <li><b>Коснитесь пустого места</b> на кадре — появится текст. Стиль, цвет, плашка «A», выравнивание и размер (клин слева) — на панели.</li>
        <li><b>Тащите пальцем</b> что угодно. У центра кадра слой прилипает к оси — жёлтая линия.</li>
        <li><b>Двумя пальцами</b> — размер и поворот. Мышью — колесо (с Shift — поворот) или белый кружок в углу.</li>
        <li><b>Утащите на корзину</b> внизу — слой удалится.</li>
        <li><b>«Наклейки»</b> — кнопка раздела, стрелка, обводка, шаги, метка, снимок экрана, эмодзи, рисунки. Касание наклейки меняет её вид.</li>
        <li><b>«Фон»</b> — градиент, цвет или своя картинка 9:16; её можно двигать и затемнить.</li>
        <li><b>Лента внизу</b>: «+» — новый кадр, касание текущего — его настройки, долгое нажатие и тащить — порядок.</li>
        <li><b>▶</b> — посмотреть, как увидит клиент. <b>«Сохранить»</b> — и истории меняются у всех.</li>
      </ol>
      <p className="se-keys">Ctrl+Z — отменить · Delete — убрать слой · Enter — править текст · Esc — выйти</p>
    </>
  );
}
