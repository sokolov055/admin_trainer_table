/**
 * Живой сканер продуктов в приложении (FT-732, 24.10.2026): своя камера
 * оболочки вместо выбора файла. Код телефона — mobile/ios/App/App/
 * FoodScannerPlugin.swift и mobile/android-native/FoodScanner.kt.
 *
 * iPhone (VisionKit): штрихкод и текст этикетки на лету, по-русски и
 * по-английски; снимок читает Vision телефона. Android (CameraX + ZXing, без
 * сервисов Google): штрихкод на лету, этикетка — снимком, текст разбирает
 * Tesseract здесь. Сайт и старые сборки без модуля — прежний выбор файла.
 */
import { plugin } from './native-bridge.js';

let checked;

/**
 * { plugin, live, liveText, photoRead } — или null: сайт, старая сборка
 * без модуля, iOS 15 или телефон без камеры
 */
export function nativeScanner() {
  const scanner = plugin('FoodScanner');
  if (!scanner) return Promise.resolve(null);
  if (!checked) {
    checked = Promise.resolve()
      .then(() => scanner.available())
      .then((info) => (info && info.live ? { plugin: scanner, live: true, liveText: !!info.liveText, photoRead: !!info.photoRead } : null))
      .catch(() => null);
  }
  return checked;
}

/** Снимок с телефона (data URL) — файл для preparePhoto */
export async function photoFile(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], 'scan.jpg', { type: blob.type || 'image/jpeg' });
}
