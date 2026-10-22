/**
 * Фон палитры «Хэллоуин» (FT-702, образцы владельца 22.10.2026): тыквы со
 * злыми горящими лицами, паутина по углам, летучие мыши и светящиеся
 * привидения на тёмно-бордовой ночи. Рисунок свой — картинки с Pinterest
 * не берём (права авторов, проверка App Store); образцы задают мотивы и
 * манеру: зубчатые крылья с пальцами, привидение-простыня с когтями и
 * рваным хвостом, мятное свечение.
 *
 * Один цельный рисунок на экран (владелец: «отрисуй цельный фон и положи
 * сзади»): рамка 390×844, обрезка по краям на других экранах. Предметы не
 * налезают друг на друга — SCENE хранит их рамки, тест проверяет. Середина
 * под текстом пустая.
 */

const svg = (w, h, body, extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"${extra}>${body}</svg>`;
const r1 = (n) => Math.round(n * 10) / 10;

/*
 * Лицо тыквы — как у фонаря со снимка владельца: злые глаза с наклоном к
 * носу, треугольный нос, широкий рот с зубами сверху и снизу. Рамка 52×52,
 * центр тыквы — (26, 31). Общее для фона и для кнопки (Pumpkin.jsx).
 */
export const FACE = {
  eyes: ['M11.5 23.5 23.5 28.4Q22 32.2 17.4 31.8Q12.2 31 11.5 23.5Z', 'M40.5 23.5 28.5 28.4Q30 32.2 34.6 31.8Q39.8 31 40.5 23.5Z'],
  nose: 'M26 30.6 28.6 35H23.4Z',
  mouth: 'M8.5 33.2 12 34.9 14 37.4 16.5 35.6 19 38.6 21.5 36.7 24 39.2 26 37.4 28 39.2 30.5 36.7 33 38.6 35.5 35.6 38 37.4 40 34.9 43.5 33.2Q42.6 40 38.4 42.8L36.6 40.2 34.6 43.8 32 41.4 29.6 45 27.4 42.4 26 45.6 24.6 42.4 22.4 45 20 41.4 17.4 43.8 15.4 40.2 13.6 42.8Q9.4 40 8.5 33.2Z',
};
export const LOBES = [[14, 31, 11, 14], [38, 31, 11, 14], [20, 31, 10, 15.5], [32, 31, 10, 15.5], [26, 31, 8, 16]];
export const STEM = 'M24.5 16c.2-4 1-7 3.6-9.4l2 1.6c-2 2-2.6 4.6-2.4 8z';

/* Тыква фона: тёмные бока, лицо горит изнутри, вокруг — ореол. Рамка 52×52 */
const PUMPKIN = '<g id="pk"><circle cx="26" cy="32" r="26" fill="url(#pkh)"/>'
  + '<g fill="url(#pkb)" stroke="#1e0703" stroke-opacity=".6" stroke-width="1">' + LOBES.map(([cx, cy, rx, ry]) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`).join('') + '</g>'
  + `<path d="${STEM}" fill="#2c4418"/><g fill="url(#pkf)">` + [...FACE.eyes, FACE.nose, FACE.mouth].map((d) => `<path d="${d}"/>`).join('') + '</g></g>';
const PUMPKIN_DEFS = '<radialGradient id="pkb" cx=".42" cy=".36" r=".75"><stop offset="0" stop-color="#8a380d"/><stop offset=".6" stop-color="#521b07"/><stop offset="1" stop-color="#250a04"/></radialGradient>'
  + '<radialGradient id="pkh"><stop offset="0" stop-color="#ff8a1e" stop-opacity=".3"/><stop offset="1" stop-color="#ff8a1e" stop-opacity="0"/></radialGradient>'
  + '<radialGradient id="pkf" cx=".5" cy=".55" r=".6"><stop offset="0" stop-color="#ffe7a0"/><stop offset=".55" stop-color="#ffb23c"/><stop offset="1" stop-color="#f0780f"/></radialGradient>';

/*
 * Летучая мышь, рамка 100×44: уши, голова, тело; крыло — запястье вверху,
 * три пальца веером и перепонка, провисающая между ними зубцами. Левая
 * половина считается, правая — зеркало.
 */
function batPath() {
  const shoulder = [44, 20], wrist = [29, 8], tip = [1, 13], fingers = [[11, 28], [23, 34], [35, 37]], hip = [46, 30];
  const q = (c, p) => `Q${r1(c[0])} ${r1(c[1])} ${p[0]} ${p[1]}`;
  const half = (m) => {
    const P = (p) => (m ? [100 - p[0], p[1]] : p);
    let d = `M${P(shoulder).join(' ')}${q(P([37, 5]), P(wrist))}${q(P([15, 2]), P(tip))}`;
    let prev = tip;
    for (const f of [...fingers, hip]) {
      // Перепонка провисает к крылу — зубец между концами пальцев
      d += q(P([(prev[0] + f[0]) / 2 + 1, (prev[1] + f[1]) / 2 - 7]), P(f));
      prev = f;
    }
    return d + 'Z';
  };
  const bones = (m) => fingers.map((f) => `M${m ? 100 - wrist[0] : wrist[0]} ${wrist[1]}L${m ? 100 - f[0] : f[0]} ${f[1]}`).join('');
  return { wings: half(false) + half(true), bones: bones(false) + bones(true) };
}
const BW = batPath();
const BAT_HEAD = 'M45 13 46 3 49.4 9.6 50.6 9.6 54 3 55 13Q56 23 50 32Q44 23 45 13Z';
const BAT = `<g id="bat"><path d="${BW.wings}${BAT_HEAD}" fill="#0a0408"/>`
  + `<path d="${BW.bones}" stroke="#3a2a40" stroke-width=".8" fill="none"/>`
  + `<path d="${BW.wings}${BAT_HEAD}" fill="none" stroke="#c9b6ef" stroke-opacity=".3" stroke-width=".8" stroke-linejoin="round"/>`
  + '<circle cx="48.2" cy="13.6" r="1.1" fill="#ffc94d"/><circle cx="51.8" cy="13.6" r="1.1" fill="#ffc94d"/></g>';

/*
 * Привидение, рамка 120×170: голова-овал, руки в стороны с когтями,
 * простыня сужается в рваный хвост и тает книзу. Мятное, с ореолом.
 */
const GHOST_PATH = 'M60 8C80 8 92 24 92 44C92 52 94 56 100 60L110 58 106 64 114 66 106 69 111 74 101 72C96 72 92 74 90 80C88 100 92 118 86 134C82 146 76 156 72 168C70 158 66 152 62 156C60 146 54 150 52 142C50 134 44 138 42 128C38 116 32 104 30 82C28 76 24 73 19 72L9 74 14 69 6 66 14 64 10 58 20 60C26 56 28 52 28 44C28 24 40 8 60 8Z';
const GHOST = `<g id="gh"><path d="${GHOST_PATH}" fill="#6dffc8" opacity=".5" filter="url(#ghb)"/><path d="${GHOST_PATH}" fill="url(#ghg)"/>`
  + '<ellipse cx="49" cy="38" rx="5" ry="8.5" transform="rotate(-8 49 38)" fill="#0d2a1f"/><ellipse cx="71" cy="38" rx="5" ry="8.5" transform="rotate(8 71 38)" fill="#0d2a1f"/><ellipse cx="60" cy="59" rx="6.5" ry="10.5" fill="#0d2a1f"/></g>';
const GHOST_DEFS = '<linearGradient id="ghg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2fff3"/><stop offset=".45" stop-color="#8ff6cb"/><stop offset=".8" stop-color="#4fe3a6" stop-opacity=".55"/><stop offset="1" stop-color="#4fe3a6" stop-opacity="0"/></linearGradient>'
  + '<filter id="ghb" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6"/></filter>';

/* Паутина в углу: нити веером из угла и кольца, провисающие к центру */
function web(x0, y0, size, corner) {
  const at = (a, r) => {
    const dx = r * Math.sin(a), dy = r * Math.cos(a);
    return corner === 'tr' ? [r1(x0 + size - dx), r1(y0 + dy)] : [r1(x0 + dx), r1(y0 + size - dy)];
  };
  const n = 8, angles = Array.from({ length: n }, (_, i) => (Math.PI / 2) * (i / (n - 1)));
  const rings = [0.12, 0.23, 0.35, 0.48, 0.62, 0.77, 0.92].map((k) => k * size);
  const lines = angles.map((a) => { const [ax, ay] = at(a, 0), [bx, by] = at(a, size); return `M${ax} ${ay}L${bx} ${by}`; }).join('');
  const loops = rings.map((r) => angles.slice(0, -1).map((a, i) => {
    const [ax, ay] = at(a, r), [bx, by] = at(angles[i + 1], r), [cx, cy] = at((a + angles[i + 1]) / 2, r * 0.86);
    return `${i ? '' : `M${ax} ${ay}`}Q${cx} ${cy} ${bx} ${by}`;
  }).join('')).join('');
  return `<g fill="none" stroke="#dcd3f2" stroke-linecap="round" opacity=".4"><path stroke-width="1.2" d="${lines}"/><path stroke-width=".9" d="${loops}"/></g>`;
}

const use = (id, x, y, k, extra = '') => `<use href="#${id}" xlink:href="#${id}" transform="translate(${x} ${y}) scale(${k})"${extra}/>`;

/*
 * Расстановка на рамке 390×844. box — занятое место [x, y, ширина, высота]
 * с ореолом; тест проверяет, что рамки не пересекаются. Сверху слева пусто
 * — там имя и раздел.
 */
export const SCENE = [
  { kind: 'web', box: [196, 0, 194, 194], draw: () => web(196, 0, 194, 'tr') },
  { kind: 'web', box: [0, 704, 140, 140], draw: () => web(0, 704, 140, 'bl') },
  { kind: 'bat', box: [24, 200, 84, 37], draw: () => use('bat', 24, 200, 0.84) },
  { kind: 'bat', box: [262, 236, 64, 28], draw: () => use('bat', 262, 236, 0.64) },
  { kind: 'bat', box: [160, 480, 56, 25], draw: () => use('bat', 160, 480, 0.56) },
  { kind: 'ghost', box: [300, 330, 84, 119], draw: () => use('gh', 300, 330, 0.7, ' opacity=".85"') },
  { kind: 'ghost', box: [8, 540, 66, 94], draw: () => `<g opacity=".75" transform="translate(74 540) scale(-.55 .55)"><use href="#gh" xlink:href="#gh"/></g>` },
  { kind: 'pumpkin', box: [44, 330, 58, 58], draw: () => use('pk', 44, 330, 1.12) },
  { kind: 'pumpkin', box: [210, 610, 66, 66], draw: () => use('pk', 210, 610, 1.27) },
  { kind: 'pumpkin', box: [296, 720, 78, 78], draw: () => use('pk', 296, 720, 1.5) },
];

/** Весь рисунок: туман сверху, тёплый свет снизу и предметы */
export const sceneSvg = () => svg(390, 844,
  `<defs>${PUMPKIN_DEFS}${PUMPKIN}${BAT}${GHOST_DEFS}${GHOST}`
  + '<radialGradient id="fog" cx=".3" cy="0" r=".7"><stop offset="0" stop-color="#9a6ed2" stop-opacity=".2"/><stop offset="1" stop-color="#9a6ed2" stop-opacity="0"/></radialGradient>'
  + '<radialGradient id="warm" cx=".5" cy="1" r=".7"><stop offset="0" stop-color="#ff7a1e" stop-opacity=".18"/><stop offset="1" stop-color="#ff7a1e" stop-opacity="0"/></radialGradient></defs>'
  + '<rect width="390" height="844" fill="url(#fog)"/><rect width="390" height="844" fill="url(#warm)"/>'
  + SCENE.map((s) => s.draw()).join(''),
  ' preserveAspectRatio="xMidYMid slice"');

/** Рисунок для CSS: одна картинка во весь экран (styles.css кладёт её на 100vw × 100vh) */
export function halloweenArt() {
  return `url("data:image/svg+xml,${encodeURIComponent(sceneSvg())}")`;
}
