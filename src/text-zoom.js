/**
 * Системный размер шрифта в приложениях iOS и Android (24.10.2026).
 *
 * Все размеры в styles.css — в px, и настройка телефона («Размер текста» /
 * Dynamic Type на iPhone, «Размер шрифта» на Android) на них не влияла.
 * Оболочка (mobile/) несёт официальный плагин @capacitor/text-zoom:
 *   - getPreferred() — что выбрано в системе, 1 = обычный (на iPhone —
 *     кегль Body / 17 pt, на Android — fontScale);
 *   - Android: set({ value }) — WebSettings.setTextZoom, масштаб текста
 *     всего WebView;
 *   - iPhone: у плагина нет нативного set — его JS-часть (dist/esm/ios.js
 *     пакета) пишет -webkit-text-size-adjust у body. Пакет из npm в
 *     webapp мы не берём (мост — native-bridge.js), поэтому та же строка
 *     здесь. Это своя логика в сборке, а не загрузка кода (правило 2.5.2).
 *
 * Масштабируется только текст: отступы, высоты кнопок и строк — в px и
 * остаются прежними. Поэтому крайние значения обрезаны:
 *   - сверху 1.3 — дальше плотные экраны (журнал тренировки, карточки
 *     сводки, нижняя панель вкладок, кнопки ±) переносят подписи и
 *     вылезают из своих коробок фиксированной высоты; на iPhone самый
 *     крупный обычный Dynamic Type (xxxL) — 23/17 ≈ 1.35, так что почти
 *     вся шкала без «Увеличенных размеров» доходит без потерь;
 *   - снизу 0.9 — мельче 12–13 px подписей (их у нас много) текст
 *     перестаёт читаться, а места это почти не освобождает.
 * Решение пересмотреть, когда вёрстка перейдёт на rem (DESIGN-APP.md).
 */
import { plugin, iosApp } from './native-bridge.js';

export const ZOOM_MIN = 0.9;
export const ZOOM_MAX = 1.3;

/** Значение системы → в наш диапазон; мусор и ноль — обычный размер */
export function clampZoom(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(n * 100) / 100));
}

/**
 * Применить системный размер. Звать при запуске и при возврате приложения
 * из фона (App → resume): настройку могли поменять, пока оно было свёрнуто.
 * Ошибки глотаются — в старой сборке без плагина вызов просто отклонится.
 */
export function applyTextZoom() {
  const zoom = plugin('TextZoom');
  if (!zoom) return Promise.resolve(null);
  return Promise.resolve()
    .then(() => zoom.getPreferred())
    .then((res) => {
      const value = clampZoom(res && res.value);
      if (iosApp()) {
        const body = typeof document !== 'undefined' && document.body;
        if (body) body.style.webkitTextSizeAdjust = Math.round(value * 100) + '%';
        return value;
      }
      return Promise.resolve(zoom.set({ value })).then(() => value);
    })
    .catch(() => null);
}
