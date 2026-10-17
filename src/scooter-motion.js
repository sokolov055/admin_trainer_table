// Индекс принадлежит миру, а не экрану: раскладка швов не меняется при прокрутке.
export function pavingRows(offset, height) {
  const rows = [];
  for (let index = Math.floor(-offset / 44) - 1; index * 44 + offset < height; index++) {
    rows.push({ index, y: index * 44 + offset, shift: ((index % 2 + 2) % 2) * 22 });
  }
  return rows;
}
export function walkingFrame(type, time, phase = 0) {
  const cadence = type === 'runner' ? 8 : type === 'grandma' ? 2.4 : 3.2;
  return Math.floor(time * cadence + phase) % 4;
}
