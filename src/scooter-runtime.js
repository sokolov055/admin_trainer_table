import { createGame, begin, advance, steer, setLane, pause, resume, laneFromTilt, tiltAxis, DISTANCE } from './scooter-model.js';
import { StreetRenderer } from './scooter-render.js';

export function mountScooter(root, session, blocked = () => false) {
const controller = new AbortController();
const owner = Symbol('scooter');
const release = session.claim(owner);
const owns = () => session.owner() === owner;
let alive = true, raf;
const on = (target, type, handler) => target.addEventListener(type, event => {
  if (!owns()) return;
  if ((type === 'click' || type === 'keydown' || type.startsWith('pointer')) && blocked()) return;
  handler(event);
}, { signal: controller.signal });
const $ = id => root.querySelector('[data-scooter="' + id + '"]');
const elements = Object.fromEntries(['time', 'distance', 'speed', 'score', 'combo', 'progress', 'progress-label', 'pause', 'left', 'right',
  'overlay', 'overlay-title', 'overlay-copy', 'overlay-hint', 'start', 'restart', 'result-stats', 'countdown', 'toast',
  'buttons-mode', 'tilt-mode', 'sensor-status', 'steering-hint'].map(id => [id, $(id)]));
const renderer = new StreetRenderer($('scene'));
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const game = session.game;
let previousTime = null;
let previousPhase = '';
let previousEvent = -1;
let sensorMode = false;
let calibration = null;
let lastAngle = null;
let sensorTimeout;
let sensorAttempt = 0;
let gestureStart = null;

function setStatus(message) { elements['sensor-status'].textContent = message; }
function buttonsMode(message = 'Свайпай или нажимай стрелки ← →') {
  sensorAttempt++;
  sensorMode = false;
  calibration = null;
  clearTimeout(sensorTimeout);
  window.removeEventListener('deviceorientation', onOrientation);
  elements['buttons-mode'].setAttribute('aria-pressed', 'true');
  elements['tilt-mode'].setAttribute('aria-pressed', 'false');
  elements['tilt-mode'].textContent = 'Наклон телефона';
  setStatus(message);
}

function onOrientation(event) {
  if (!sensorMode || !owns() || blocked()) return;
  const angle = screen.orientation?.angle ?? window.orientation ?? 0;
  const axis = tiltAxis(event.gamma, event.beta, angle);
  if (axis === null) return;
  clearTimeout(sensorTimeout);
  if (calibration === null || angle !== lastAngle) {
    calibration = axis; lastAngle = angle;
    setStatus('Наклоняй влево и вправо. Ровно — средняя полоса.');
    elements['tilt-mode'].textContent = 'Калибровать';
  }
  setLane(game, laneFromTilt(axis - calibration, game.lane));
}

async function enableTilt() {
  pause(game); renderUI();
  const attempt = ++sensorAttempt;
  try {
    if (!window.isSecureContext) { buttonsMode('Для наклона нужен HTTPS. Пока используй кнопки.'); return; }
    if (typeof window.DeviceOrientationEvent === 'undefined') { buttonsMode('Датчик наклона недоступен. Используй кнопки.'); return; }
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      const permission = await DeviceOrientationEvent.requestPermission();
      if (!alive || attempt !== sensorAttempt) return;
      if (permission !== 'granted') { buttonsMode('Доступ к наклону не разрешён. Кнопки работают.'); return; }
    }
    if (!alive || attempt !== sensorAttempt) return;
    sensorMode = true; calibration = null;
    elements['buttons-mode'].setAttribute('aria-pressed', 'false');
    elements['tilt-mode'].setAttribute('aria-pressed', 'true');
    setStatus('Держи телефон удобно: запоминаю положение…');
    window.addEventListener('deviceorientation', onOrientation, { signal: controller.signal });
    clearTimeout(sensorTimeout);
    sensorTimeout = setTimeout(() => buttonsMode('Нет данных датчика. Попробуй на телефоне или играй кнопками.'), 3500);
  } catch (error) {
    console.warn('Не удалось включить управление наклоном:', error);
    buttonsMode('Не удалось включить наклон. Используй кнопки.');
  }
}

function reset() {
  Object.assign(game, createGame(game.seed + 1)); previousTime = null; previousEvent = -1;
  begin(game); renderUI();
}

function primaryAction() {
  if (game.phase === 'ready') begin(game);
  else if (game.phase === 'paused') { resume(game); previousTime = null; }
  else if (game.phase === 'won' || game.phase === 'lost') reset();
  renderUI();
}

on(elements.start, 'click', primaryAction);
on(elements.restart, 'click', reset);
on(elements.pause, 'click', () => { pause(game); renderUI(); });
on(elements.left, 'click', () => steer(game, -1));
on(elements.right, 'click', () => steer(game, 1));
on(elements['buttons-mode'], 'click', () => buttonsMode());
on(elements['tilt-mode'], 'click', enableTilt);

on(window, 'keydown', event => {
  if (event.altKey || event.metaKey || event.ctrlKey) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault(); if (!event.repeat) steer(game, event.key === 'ArrowLeft' ? -1 : 1);
  }
  if (event.key === 'Escape' && !event.repeat) {
    if (game.phase === 'paused') { resume(game); previousTime = null; }
    else pause(game);
    renderUI();
  }
});

on($('scene'), 'pointerdown', event => {
  gestureStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
  $('scene').setPointerCapture(event.pointerId);
});
on($('scene'), 'pointerup', event => {
  if (!gestureStart || gestureStart.id !== event.pointerId) return;
  const dx = event.clientX - gestureStart.x, dy = event.clientY - gestureStart.y;
  if (Math.abs(dx) > 22 && Math.abs(dx) > Math.abs(dy)) steer(game, Math.sign(dx));
  gestureStart = null;
});
on($('scene'), 'pointercancel', () => { gestureStart = null; });

function suspend() { pause(game); previousTime = null; gestureStart = null; renderUI(); }
on(document, 'visibilitychange', () => { if (document.hidden) suspend(); });
on(window, 'blur', suspend);
on(window, 'pagehide', suspend);
on(window, 'pageshow', () => { previousTime = null; });

function renderUI() {
  const remaining = Math.ceil(game.remaining);
  const active = game.phase === 'playing' || game.phase === 'countdown';
  elements.time.textContent = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
  elements.time.parentElement.classList.toggle('urgent', remaining <= 10);
  elements.distance.textContent = `Зал через ${Math.ceil(DISTANCE - game.distance)} м`;
  elements.speed.textContent = active ? String(Math.round(game.speed * 3.6)) : '0';
  elements.score.textContent = String(game.score);
  elements.progress.value = game.distance;
  elements['progress-label'].textContent = `${Math.floor(game.distance / DISTANCE * 100)}%`;
  elements.combo.hidden = !active || game.combo < 2;
  elements.combo.textContent = `Серия ${game.combo}`;
  elements.pause.disabled = !active;
  elements.left.disabled = !active;
  elements.right.disabled = !active;
  elements.countdown.hidden = game.phase !== 'countdown';
  elements.countdown.textContent = Math.max(1, Math.ceil(game.countdown));
  elements['steering-hint'].textContent = game.phase === 'playing' ? 'Найди свободную полосу' : 'Выбери свободную полосу';
  if (game.event && game.event.until > game.elapsed && game.phase === 'playing') {
    if (game.event.serial !== previousEvent) {
      elements.toast.replaceChildren(Object.assign(document.createElement('span'), { textContent: game.event.text }));
      elements.toast.dataset.kind = game.event.kind;
      previousEvent = game.event.serial;
    }
    elements.toast.classList.add('visible');
  } else elements.toast.classList.remove('visible');

  if (game.phase !== previousPhase) {
    elements.overlay.hidden = active;
    elements.restart.hidden = game.phase !== 'paused';
    elements['result-stats'].hidden = game.phase !== 'won' && game.phase !== 'lost';
    elements['overlay-hint'].hidden = game.phase === 'won' || game.phase === 'lost';
    if (game.phase === 'paused') {
      elements['overlay-title'].textContent = 'Переведём дух';
      elements['overlay-copy'].textContent = 'Самокат припаркован. Время не идёт, можно спокойно продолжить.';
      elements.start.textContent = 'Продолжить поездку';
      elements['overlay-hint'].textContent = 'Вернёшься к игре с того же места';
    } else if (game.phase === 'won' || game.phase === 'lost') {
      const won = game.phase === 'won';
      elements['overlay-title'].textContent = won ? 'Успел. Зал открыт!' : 'Тренировка началась';
      elements['overlay-copy'].textContent = won ? `Ты у входа за ${Math.ceil(game.remaining)} сек до старта. Маршрут пройден чисто и быстро.` : `До зала осталось ${Math.ceil(DISTANCE - game.distance)} м. Ещё попытка? Смотри дальше по дороге и держись свободной полосы.`;
      elements.start.textContent = 'Ещё заезд';
      elements['result-stats'].innerHTML = `<div><strong>${game.score}</strong><span>очков</span></div><div><strong>${game.bestCombo}</strong><span>лучшая серия</span></div><div><strong>${game.hits}</strong><span>столкновений</span></div>`;
    }
    if (game.phase !== 'ready') {
      if (!active && owns() && !blocked()) elements.start.focus({ preventScroll: true });
      else if (elements.overlay.contains(document.activeElement)) document.activeElement.blur();
    }
    previousPhase = game.phase;
  }
  // Только чтение: состояние кадра для браузерной проверки.
  $('viewport').dataset.phase = game.phase;
  $('viewport').dataset.lane = game.lane;
}

function frame(now) {
  if (!alive) return;
  if (owns() && (blocked() || document.hidden)) suspend();
  if (!owns()) previousTime = null;
  if (owns() && previousTime !== null) {
    const delta = (now - previousTime) / 1000;
    // После блокировки вкладки игра ждёт продолжения, а не проигрывает в фоне.
    if (delta > .75) suspend();
    else advance(game, Math.min(delta, .1));
  }
  previousTime = now;
  renderUI(); renderer.draw(game, reducedMotion.matches);
  raf = requestAnimationFrame(frame);
}

const resize = new ResizeObserver(() => { renderer.resize(); renderer.draw(game, reducedMotion.matches); });
resize.observe($('viewport'));
renderer.resize(); renderUI(); renderer.draw(game, reducedMotion.matches);
raf = requestAnimationFrame(frame);

return () => { alive = false; sensorAttempt++; clearTimeout(sensorTimeout); controller.abort(); window.removeEventListener('deviceorientation', onOrientation); cancelAnimationFrame(raf); resize.disconnect(); release(); };
}
