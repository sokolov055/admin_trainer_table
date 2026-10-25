/**
 * Кадр для AI-распознавания (FT-736, FT-748): уменьшить и перекодировать на
 * телефоне — метаданные (место, модель телефона) отрезаются, на сервер уходит
 * только картинка. Этикетке нужна сторона побольше: мелкий текст на бутылке
 * при 1024 px не читается.
 */
export const PLATE_SIDE = 1024;
export const LABEL_SIDE = 1600;

export async function shrink(file, side = PLATE_SIDE) {
  const { preparePhoto } = await import('./food-recognition.js');
  const big = await preparePhoto(file);
  const k = Math.min(1, side / Math.max(big.width, big.height));
  const c = document.createElement('canvas');
  c.width = Math.round(big.width * k); c.height = Math.round(big.height * k);
  c.getContext('2d').drawImage(big, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', side > PLATE_SIDE ? 0.72 : 0.8);
}
