// Индекс принадлежит миру, а не экрану: раскладка швов не меняется при прокрутке.
export function pavingRows(offset, height) {
  const rows = [];
  for (let index = Math.floor(-offset / 44) - 1; index * 44 + offset < height; index++) {
    rows.push({ index, y: index * 44 + offset, shift: ((index % 2 + 2) % 2) * 22 });
  }
  return rows;
}
// Кадров в секунду: бабушка семенит медленно, качок после дня ног — скованно, бегун — часто.
const CADENCE = { runner: 8, grandma: 2.4, athlete: 3.2 };
// Походка поверх кадров (19.10.2026): тело переносит вес на опорную ногу,
// плечи разворачиваются против шага, на каждом шаге — лёгкий подъём.
// sway — смещение вбок, twist — поворот (рад), bob — изменение масштаба.
const GAIT = {
  grandma: { sway: 1.4, twist: .05, bob: .012 },
  athlete: { sway: 2, twist: .035, bob: .01 },
  runner: { sway: .8, twist: .06, bob: .022 },
};
export function walkingFrame(type, time, phase = 0) {
  return Math.floor(time * (CADENCE[type] || 3.2) + phase) % 4;
}
/** Кадр и поза из одной непрерывной фазы: смена кадра совпадает со сменой опорной ноги. */
export function walkingGait(type, time, phase = 0) {
  const steps = time * (CADENCE[type] || 3.2) + phase;
  const angle = steps / 4 * Math.PI * 2, gait = GAIT[type] || GAIT.athlete;
  return {
    frame: Math.floor(steps) % 4,
    dx: Math.sin(angle) * gait.sway,
    twist: Math.sin(angle) * gait.twist,
    scale: 1 + Math.cos(angle * 2) * gait.bob,
  };
}
