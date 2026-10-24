/**
 * Смахнуть нижний лист вниз (ui.jsx → Sheet): чистый расчёт без React и
 * DOM, чтобы его можно было проверить в node --test
 * (scripts/test-sheet-drag.mjs).
 *
 * Решение на отпускании — как у остальных жестов приложения
 * (gestures.jsx, apple-design): не только пройденный путь, но и скорость.
 * Быстрый короткий взмах вниз — тоже «закрыть», а взмах вверх на
 * отпускании — «передумал», даже если лист уже за порогом.
 */

/** Доля высоты листа, после которой отпускание закрывает без скорости */
export const SHEET_CLOSE_SHARE = 0.25;
/** px/мс — взмах вниз, который закрывает сам по себе (~500 px/с, как у iOS) */
export const SHEET_FLICK = 0.5;

/** Лист утянут за порог закрытия — в этот момент один лёгкий отклик */
export function sheetArmed(offset, height) {
  return height > 0 && offset > height * SHEET_CLOSE_SHARE;
}

/**
 * Закрыть или вернуть: 'close' | 'return'.
 * offset — на сколько px лист опущен (вверх — отрицательное),
 * velocity — px/мс на отпускании (вниз — положительная),
 * dirty — в листе набранная форма: смахиванием её не стираем, как и касанием мимо.
 */
export function sheetRelease({ offset, height, velocity = 0, dirty = false }) {
  if (dirty || !(height > 0) || !(offset > 0)) return 'return';
  // Вверх на отпускании — передумали
  if (velocity < -SHEET_FLICK / 2) return 'return';
  if (velocity > SHEET_FLICK) return 'close';
  return sheetArmed(offset, height) ? 'close' : 'return';
}

/**
 * Скорость по последним точкам пальца, px/мс: [{ y, t }], t — мс
 * (performance.now). Как velocity() в gestures.jsx, только в px/мс.
 */
export function releaseVelocity(history) {
  if (!history || history.length < 2) return 0;
  const a = history[0];
  const b = history[history.length - 1];
  const dt = b.t - a.t;
  return dt > 0 ? (b.y - a.y) / dt : 0;
}

/**
 * Можно ли тянуть лист за это касание: за ручку и заголовок — всегда
 * (кроме крестика: это кнопка), за тело — только когда всё, что прокручивается
 * под пальцем, стоит в самом верху. Барабан (role=spinbutton) и
 * [data-no-swipe] крутят своё. `panel` — .sheet__panel.
 */
export function canDragFrom(target, panel) {
  if (!target || !panel || !panel.contains(target)) return false;
  if (target.closest('.sheet__close, [role="spinbutton"], [data-no-swipe], input[type="range"]')) return false;
  if (target.closest('.sheet__grip, .sheet__head')) return true;
  for (let el = target; el && el !== panel; el = el.parentElement) {
    if (el.scrollTop > 0) return false;
  }
  return true;
}
