// Подготовка снимка этикетки к OCR — чистые функции над RGBA, без DOM (проверяются в node).
//
// Tesseract сам переводит фото в ч/б по яркости. На банке горчицы светлый текст
// на жёлтом: по яркости он почти сливается с фоном, а по синему каналу — нет.
// Поэтому считаем отклонение пикселя от среднего по окрестности сразу в двух
// каналах (яркость и минимальный из R, G, B) и берём большее: текст становится
// тёмным на белом, какого бы цвета ни были буквы и подложка, тени и изгиб банки
// не мешают — сравнение идёт с соседями, а не со всем кадром.
// Буквы светлее фона или темнее — решает перекос отклонений в окрестности:
// букв меньше, чем фона, их отклонения редкие и сильные. Берём только сторону
// букв, иначе фон вокруг строк серел бы ореолом.

// Среднее по квадрату (2r+1)² — два прохода «бегущей суммы», O(n) при любом r
function boxMean(src, width, height, r) {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0, count = 0;
    for (let x = 0; x < Math.min(r, width); x++) { sum += src[row + x]; count++; }
    for (let x = 0; x < width; x++) {
      const add = x + r, drop = x - r - 1;
      if (add < width) { sum += src[row + add]; count++; }
      if (drop >= 0) { sum -= src[row + drop]; count--; }
      tmp[row + x] = sum / count;
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0, count = 0;
    for (let y = 0; y < Math.min(r, height); y++) { sum += tmp[y * width + x]; count++; }
    for (let y = 0; y < height; y++) {
      const add = y + r, drop = y - r - 1;
      if (add < height) { sum += tmp[add * width + x]; count++; }
      if (drop >= 0) { sum -= tmp[drop * width + x]; count--; }
      out[y * width + x] = sum / count;
    }
  }
  return out;
}

// Отклонение канала в сторону букв: положительное — буквы, ноль — фон
function inkSide(channel, width, height, r, into) {
  const mean = boxMean(channel, width, height, r);
  for (let i = 0; i < channel.length; i++) mean[i] = channel[i] - mean[i];
  const signed = new Float32Array(channel.length);
  for (let i = 0; i < channel.length; i++) signed[i] = mean[i] * Math.abs(mean[i]);
  const skew = boxMean(signed, width, height, r * 2);
  for (let i = 0; i < channel.length; i++) {
    const d = skew[i] >= 0 ? mean[i] : -mean[i];
    if (d > into[i]) into[i] = d;
  }
}

// rgba — Uint8ClampedArray (ImageData.data). Возвращает новый RGBA: серый, текст тёмный.
export function localContrast(rgba, width, height, radius = Math.max(8, Math.round(Math.max(width, height) / 125))) {
  const n = width * height, channel = new Float32Array(n), ink = new Float32Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) channel[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
  inkSide(channel, width, height, radius, ink);
  for (let i = 0, p = 0; i < n; i++, p += 4) channel[i] = Math.min(rgba[p], rgba[p + 1], rgba[p + 2]);
  inkSide(channel, width, height, radius, ink);
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) hist[Math.min(255, Math.round(ink[i]))]++;
  // Растягиваем: 99,5% пикселей укладываются в шкалу, самые резкие края — в насыщение
  let edge = 255;
  for (let acc = 0, limit = n * 0.995, v = 0; v < 256; v++) { acc += hist[v]; if (acc >= limit) { edge = v; break; } }
  const k = 255 / Math.max(edge, 12), out = new Uint8ClampedArray(n * 4);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const v = 255 - Math.min(255, ink[i] * k);
    out[p] = out[p + 1] = out[p + 2] = v; out[p + 3] = 255;
  }
  return out;
}
