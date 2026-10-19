import { createGame, begin, advance, steer, setLane, pause, resume, activateNitro, laneFromTilt, tiltAxis, DIFFICULTIES } from './scooter-model.js';
import { StreetRenderer } from './scooter-render.js';
import { createScooterVoice } from './scooter-voice.js';
import { buzz, enterFullscreen } from './game-feel.js';

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
const elements = Object.fromEntries(['time', 'distance', 'distance-unit', 'speed', 'combo', 'pause', 'nitro', 'nitro-count',
  'overlay', 'overlay-title', 'overlay-copy', 'start', 'restart', 'result-stats', 'countdown', 'toast', 'difficulty-picker',
  'buttons-mode', 'tilt-mode', 'sensor-status', 'crossing-warning', 'tutorial', 'tutorial-copy', 'tutorial-start', 'tutorial-left', 'tutorial-right'].map(id => [id, $(id)]));
const renderer = new StreetRenderer($('scene'));
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const game = session.game;
const voice = createScooterVoice();
const tried = new Set();
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
function buttonsMode(message = 'Нажми на левую или правую половину экрана — самокат сместится на одну полосу.') {
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
    if (!window.isSecureContext) { buttonsMode('Для наклона нужен HTTPS. Пока нажимай на половины экрана.'); return; }
    if (typeof window.DeviceOrientationEvent === 'undefined') { buttonsMode('Датчик наклона недоступен. Нажимай на половины экрана.'); return; }
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

async function reset() {
  if (session.loading) return;
  try {
    await session.start(game.difficulty);
    if (!alive || !owns() || blocked()) return;
    previousTime = null; previousEvent = -1; previousPhase = '';
    begin(game);
  } catch (error) {
    console.warn('Не удалось начать заезд:', error);
    session.rankStatus = error.message + ' Попробуй ещё раз или выйди из рейтинга для игры без сети.';
    session.notify();
  }
  renderUI();
}

function primaryAction() {
  if (session.voice) voice.unlock();
  if (game.phase === 'ready' && !session.tutorialSeen) {
    session.training = true; game.route = []; renderUI(); elements['tutorial-left'].focus({ preventScroll: true }); return;
  }
  if (game.phase === 'ready') enterFullscreen(root);
  if (game.phase === 'ready') reset();
  else if (game.phase === 'paused') { resume(game); previousTime = null; }
  else if (game.phase === 'lost') reset();
  renderUI();
}

on(elements.start, 'click', primaryAction);
on(elements['tutorial-start'], 'click', () => { session.completeTutorial(); primaryAction(); });
for (const [name, direction] of [['tutorial-left', -1], ['tutorial-right', 1]]) on(elements[name], 'click', () => {
  tried.add(direction); game.lane = Math.max(0, Math.min(2, game.lane + direction));
  elements[name].classList.add('tried');
  elements['tutorial-copy'].textContent = tried.size === 2 ? 'Получилось! В заезде каждое касание меняет одну полосу.' : direction < 0 ? 'Отлично. Теперь нажми на правую половину.' : 'Отлично. Теперь нажми на левую половину.';
});
on(elements.restart, 'click', reset);
for (const button of root.querySelectorAll('[data-difficulty]')) on(button, 'click', () => {
  if (session.loading) return;
  Object.assign(game, createGame(game.seed, button.dataset.difficulty));
  previousPhase = ''; renderUI(); session.notify();
});
on(elements.pause, 'click', () => { pause(game); renderUI(); });
on(elements.nitro, 'click', () => { activateNitro(game); buzz('good'); renderUI(); });
on(elements['buttons-mode'], 'click', () => buttonsMode());
on(elements['tilt-mode'], 'click', enableTilt);

on(window, 'keydown', event => {
  if (session.training) return;
  if (event.altKey || event.metaKey || event.ctrlKey) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault(); if (!event.repeat) steer(game, event.key === 'ArrowLeft' ? -1 : 1);
  }
  if (event.code === 'Space' && !event.repeat) {
    if (event.target instanceof HTMLElement && event.target.closest('button')) return;
    event.preventDefault(); activateNitro(game); renderUI();
  }
  if (event.key === 'Escape' && !event.repeat) {
    if (game.phase === 'paused') { resume(game); previousTime = null; }
    else pause(game);
    renderUI();
  }
});

on($('scene'), 'pointerdown', event => {
  if (!event.isPrimary || event.button > 0) return;
  if (session.voice) voice.unlock();
  gestureStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
  $('scene').setPointerCapture(event.pointerId);
});
on($('scene'), 'pointerup', event => {
  if (!gestureStart || gestureStart.id !== event.pointerId) return;
  const dx = event.clientX - gestureStart.x, dy = event.clientY - gestureStart.y;
  if (Math.abs(dx) > 22 && Math.abs(dx) > Math.abs(dy)) { steer(game, Math.sign(dx)); if (game.phase === 'playing') buzz('tap'); }
  else if (Math.hypot(dx, dy) < 14 && !sensorMode) {
    const bounds = $('scene').getBoundingClientRect(); steer(game, event.clientX < bounds.left + bounds.width / 2 ? -1 : 1); if (game.phase === 'playing') buzz('tap');
  }
  gestureStart = null;
});
on($('scene'), 'pointercancel', () => { gestureStart = null; });

function suspend() { pause(game); previousTime = null; gestureStart = null; renderUI(); }
on(document, 'visibilitychange', () => { if (document.hidden) suspend(); });
on(window, 'blur', suspend);
on(window, 'pagehide', suspend);
on(window, 'pageshow', () => { previousTime = null; });

function renderUI() {
  const active = game.phase === 'playing' || game.phase === 'countdown';
  const elapsed = Math.floor(game.elapsed);
  elements.time.textContent = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
  elements.distance.textContent = game.distance >= 10000 ? (game.distance / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) : Math.floor(game.distance).toLocaleString('ru-RU');
  elements['distance-unit'].textContent = game.distance >= 10000 ? 'километров' : 'метров';
  elements.speed.textContent = active ? String(Math.round(game.speed * 3.6)) : '0';
  elements.combo.hidden = !active || game.combo < 2;
  elements.combo.textContent = `Серия ${game.combo}`;
  elements.pause.disabled = !active;
  elements.start.disabled = session.loading;
  elements.nitro.disabled = game.phase !== 'playing' || game.nitroCharges < 1 || game.nitro > 0;
  elements.nitro.classList.toggle('active', game.nitro > 0);
  elements.nitro.setAttribute('aria-label', game.nitro > 0 ? `Нитро включено, ${game.nitro.toFixed(1)} секунды` : `Включить нитро, зарядов ${game.nitroCharges}`);
  elements['nitro-count'].textContent = game.nitro > 0 ? game.nitro.toFixed(1) : String(game.nitroCharges);
  elements.countdown.hidden = game.phase !== 'countdown';
  elements.countdown.textContent = Math.max(1, Math.ceil(game.countdown));
  elements.tutorial.hidden = !session.training;
  elements.overlay.inert = session.training;
  elements.overlay.hidden = active || session.training;
  elements.nitro.hidden = !active;
  const crossingAt = 450 + Math.max(0, Math.ceil((game.distance - 450) / 500)) * 500;
  elements['crossing-warning'].hidden = game.phase !== 'playing' || crossingAt - game.distance > 140;
  if (game.event && game.event.until > game.elapsed && game.phase === 'playing') {
    if (game.event.serial !== previousEvent) {
      elements.toast.replaceChildren(Object.assign(document.createElement('span'), { textContent: game.event.text }));
      elements.toast.dataset.kind = game.event.kind;
      if (game.event.kind === 'bark' && session.voice && !voice.speak(game.event)) setStatus('Русский голос не установлен. Реплики пока видны текстом.');
      previousEvent = game.event.serial;
    }
    elements.toast.classList.add('visible');
  } else elements.toast.classList.remove('visible');

  if (game.phase !== previousPhase) {
    if (game.phase !== 'playing' && owns()) voice.cancel();
    elements.overlay.hidden = active;
    elements.restart.hidden = game.phase !== 'paused';
    elements['result-stats'].hidden = game.phase !== 'lost';
    elements['difficulty-picker'].hidden = game.phase === 'paused';
    for (const button of root.querySelectorAll('[data-difficulty]')) button.setAttribute('aria-pressed', String(button.dataset.difficulty === game.difficulty));
    if (game.phase === 'ready') {
      elements['overlay-title'].textContent = 'На самокате до зала';
      elements['overlay-copy'].textContent = 'Город не заканчивается. Проедь дальше всех. Одно столкновение — конец заезда.';
      elements.start.textContent = 'В путь';
    } else if (game.phase === 'paused') {
      elements['overlay-title'].textContent = 'Переведём дух';
      elements['overlay-copy'].textContent = 'Самокат припаркован. Время не идёт, можно спокойно продолжить.';
      elements.start.textContent = 'Продолжить поездку';
    } else if (game.phase === 'lost') {
      elements['overlay-title'].textContent = 'Заезд окончен';
      elements['overlay-copy'].textContent = DIFFICULTIES[game.difficulty].name + '. Одна ошибка — новый старт. Побьёшь свой рекорд?';
      elements.start.textContent = 'Ещё заезд';
      if (previousPhase === 'playing' && owns()) buzz('crash');
      elements['result-stats'].innerHTML = `<div><strong>${Math.floor(game.distance)}</strong><span>метров</span></div><div><strong>${elapsed}</strong><span>секунд</span></div><div><strong>${game.bestCombo}</strong><span>лучшая серия</span></div>`;
      session.finish();
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
  if (session.training && owns()) game.x += (game.lane - game.x) * .15;
  renderUI(); renderer.draw(game, reducedMotion.matches, session.training);
  raf = requestAnimationFrame(frame);
}

const resize = new ResizeObserver(() => { renderer.resize(); renderer.draw(game, reducedMotion.matches, session.training); });
resize.observe($('viewport'));
renderer.resize(); renderUI(); renderer.draw(game, reducedMotion.matches, session.training);
raf = requestAnimationFrame(frame);

return () => { alive = false; sensorAttempt++; if (owns()) voice.cancel(); clearTimeout(sensorTimeout); controller.abort(); window.removeEventListener('deviceorientation', onOrientation); cancelAnimationFrame(raf); resize.disconnect(); release(); };
}
