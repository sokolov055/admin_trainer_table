// «Блины» (21.10.2026): трассы, по которым катится цепочка блинов.
// Поле — 360 × 560 условных единиц, вертикально, под телефон. Трасса строится
// из прямых и дуг, потом делится на точки через каждую единицу длины —
// положение блина задаётся расстоянием от начала пути, без геометрии на лету.
// Путь начинается за краем поля (цепочка въезжает) и кончается у помоста.

export const FIELD = Object.freeze({ width: 360, height: 560 });

function builder(x, y) {
  const points = [[x, y]];
  let cx = x, cy = y;
  const api = {
    line(tx, ty) {
      const steps = Math.max(1, Math.ceil(Math.hypot(tx - cx, ty - cy) * 4));
      for (let i = 1; i <= steps; i++) points.push([cx + (tx - cx) * i / steps, cy + (ty - cy) * i / steps]);
      cx = tx; cy = ty; return api;
    },
    // Дуга вокруг (ox, oy) от текущей точки на угол turn (радианы, + — по часовой на экране)
    arc(ox, oy, turn) {
      const r = Math.hypot(cx - ox, cy - oy), from = Math.atan2(cy - oy, cx - ox);
      const steps = Math.max(1, Math.ceil(Math.abs(turn) * r * 4));
      for (let i = 1; i <= steps; i++) { const a = from + turn * i / steps; points.push([ox + r * Math.cos(a), oy + r * Math.sin(a)]); }
      cx = points.at(-1)[0]; cy = points.at(-1)[1]; return api;
    },
    // Эллиптическая спираль: радиусы сужаются от (rx0, ry0) до (rx1, ry1) за turns оборотов
    spiral(ox, oy, rx0, ry0, rx1, ry1, from, turns) {
      const total = turns * Math.PI * 2, steps = Math.ceil(turns * 2400);
      for (let i = 1; i <= steps; i++) {
        const k = i / steps, a = from + total * k;
        points.push([ox + (rx0 + (rx1 - rx0) * k) * Math.cos(a), oy + (ry0 + (ry1 - ry0) * k) * Math.sin(a)]);
      }
      cx = points.at(-1)[0]; cy = points.at(-1)[1]; return api;
    },
    points: () => points,
  };
  return api;
}

/** Точки через каждую единицу длины пути. */
function resample(dense) {
  const xs = [dense[0][0]], ys = [dense[0][1]];
  let carry = 0;
  for (let i = 1; i < dense.length; i++) {
    const [ax, ay] = dense[i - 1], [bx, by] = dense[i];
    const seg = Math.hypot(bx - ax, by - ay);
    let at = 1 - carry;
    while (at <= seg) { const k = at / seg; xs.push(ax + (bx - ax) * k); ys.push(ay + (by - ay) * k); at += 1; }
    carry = seg - (at - 1);
  }
  return { xs: Float32Array.from(xs), ys: Float32Array.from(ys), length: xs.length - 1 };
}

const PI = Math.PI;
// Поле — одна или две трассы (у «Гантели» — по цепочке на каждый диск, как
// у «боссов» Zuma). Стрелок стоит там, где до всех витков не меньше 40 единиц.
const SOURCES = [
  {
    id: 'stadium', name: 'Стадион', shooter: [180, 280],
    note: 'Спираль сужается к центру — помост в самой середине.',
    paths: [() => builder(-30, 48).line(180, 48).spiral(180, 280, 170, 232, 64, 92, -PI / 2, 2.25).points()],
  },
  {
    id: 'snake', name: 'Змейка', shooter: [176, 280],
    note: 'Длинная змейка сверху и снизу, стрелок посередине.',
    paths: [() => builder(-30, 40).line(300, 40).arc(300, 80, PI).line(70, 120).arc(70, 160, -PI).line(300, 200)
      .arc(300, 240, PI / 2).line(340, 320).arc(300, 320, PI / 2).line(70, 360).arc(70, 400, -PI).line(300, 440)
      .arc(300, 480, PI).line(80, 520).points()],
  },
  {
    id: 'dumbbell', name: 'Гантель', shooter: [180, 280],
    note: 'Два диска гантели — две цепочки. Следи за обеими.',
    paths: [
      () => builder(-30, 16).line(180, 16).spiral(180, 128, 165, 112, 62, 44, -PI / 2, 1.4).points(),
      () => builder(390, 544).line(180, 544).spiral(180, 432, 165, 112, 62, 44, PI / 2, 1.4).points(),
    ],
  },
];

function build(source) {
  const paths = source.paths.map(make => Object.freeze(resample(make())));
  return Object.freeze({ id: source.id, name: source.name, note: source.note, shooter: Object.freeze({ x: source.shooter[0], y: source.shooter[1] }), paths: Object.freeze(paths) });
}

export const TRACKS = Object.freeze(Object.fromEntries(SOURCES.map(s => [s.id, build(s)])));

/** Точка пути на расстоянии s от начала. До начала — продолжение первого отрезка назад. */
export function pointAt(path, s) {
  const { xs, ys, length } = path;
  if (s <= 0) { const dx = xs[1] - xs[0], dy = ys[1] - ys[0]; return { x: xs[0] + dx * s, y: ys[0] + dy * s }; }
  if (s >= length) return { x: xs[length], y: ys[length] };
  const i = Math.floor(s), k = s - i;
  return { x: xs[i] + (xs[i + 1] - xs[i]) * k, y: ys[i] + (ys[i + 1] - ys[i]) * k };
}

/** Ближайшая к точке позиция на пути в окне [from, to]. */
export function nearestS(path, x, y, from, to) {
  let best = from, bestD = Infinity;
  for (let s = Math.max(0, Math.floor(from)); s <= Math.min(path.length, Math.ceil(to)); s++) {
    const d = (path.xs[s] - x) ** 2 + (path.ys[s] - y) ** 2;
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}
