// «Блины» (21.10.2026): трассы, по которым катится цепочка блинов.
// Поле — 360 × 640 условных единиц, вертикально, под вытянутый экран телефона;
// экран растягивает его на всю ширину, а фон карты рисуется и за краями поля.
// Трасса строится из прямых и дуг, потом делится на точки через каждую единицу
// длины — положение блина задаётся расстоянием от начала пути.
// Путь начинается за краем поля (цепочка въезжает) и кончается у помоста.

export const FIELD = Object.freeze({ width: 360, height: 640 });

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
    // Ломаная со скруглёнными углами радиуса r
    corners(list, r) {
      for (let i = 0; i < list.length; i++) {
        const [vx, vy] = list[i], next = list[i + 1];
        if (!next) { api.line(vx, vy); break; }
        const inLen = Math.hypot(vx - cx, vy - cy), outLen = Math.hypot(next[0] - vx, next[1] - vy);
        const k = Math.min(r, inLen / 2, outLen / 2);
        const ax = vx + (cx - vx) / inLen * k, ay = vy + (cy - vy) / inLen * k;
        const bx = vx + (next[0] - vx) / outLen * k, by = vy + (next[1] - vy) / outLen * k;
        api.line(ax, ay);
        for (let s = 1; s <= 24; s++) {
          const t = s / 24, u = 1 - t;
          points.push([u * u * ax + 2 * u * t * vx + t * t * bx, u * u * ay + 2 * u * t * vy + t * t * by]);
        }
        cx = bx; cy = by;
      }
      return api;
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
    if (!seg) continue;
    let at = 1 - carry;
    while (at <= seg) { const k = at / seg; xs.push(ax + (bx - ax) * k); ys.push(ay + (by - ay) * k); at += 1; }
    carry = seg - (at - 1);
  }
  return { xs: Float32Array.from(xs), ys: Float32Array.from(ys), length: xs.length - 1 };
}

const PI = Math.PI;
// Карта — трасса и тема фона (blini-draw.js). У «Гантели» две цепочки, как у
// «боссов» Zuma. Стрелок стоит там, где до всех витков не меньше 45 единиц.
// rail — скамья, по которой Михалыч ходит на уровнях с rail: true (по мотивам
// подвижной лягушки Zuma's Revenge): от x0 до x1 на высоте стрелка.
// boss — где стоит Диван на уровнях-боссах: цепочка обходит его петлёй, Михалыч внизу.
const SOURCES = [
  {
    id: 'stadium', name: 'Стадион', theme: 'stadium', shooter: [180, 320],
    note: 'Беговая дорожка закручена спиралью — помост в самом центре стадиона.',
    paths: [() => builder(-30, 40).line(180, 40).spiral(180, 320, 170, 280, 64, 100, -PI / 2, 2.25).points()],
  },
  {
    id: 'kitchen', name: 'Кухня', theme: 'kitchen', shooter: [153, 330],
    note: 'Квадратная спираль по кухонному столу. Не отвлекайся на брокколи.',
    paths: [() => builder(-30, 30).corners([[340, 30], [340, 610], [20, 610], [20, 84], [286, 84], [286, 556], [74, 556], [74, 138], [232, 138], [232, 420]], 24).points()],
  },
  {
    id: 'snake', name: 'Зал', theme: 'gym', shooter: [176, 320], rail: [40, 280],
    note: 'Змейка между гантелями и скамьями — длинная, сверху и снизу.',
    paths: [() => builder(-30, 40).line(300, 40).arc(300, 80, PI).line(70, 120).arc(70, 160, -PI).line(300, 200)
      .arc(300, 240, PI / 2).line(340, 400).arc(300, 400, PI / 2).line(70, 440).arc(70, 480, -PI).line(300, 520)
      .arc(300, 560, PI).line(80, 600).points()],
  },
  {
    id: 'dumbbell', name: 'Гантель', theme: 'platform', shooter: [180, 320],
    note: 'Два диска гантели — две цепочки на помосте. Следи за обеими.',
    paths: [
      () => builder(-30, 30).line(180, 30).spiral(180, 150, 165, 120, 62, 46, -PI / 2, 1.4).points(),
      () => builder(390, 610).line(180, 610).spiral(180, 490, 165, 120, 62, 46, PI / 2, 1.4).points(),
    ],
  },
  {
    id: 'couch', name: 'Гостиная', theme: 'living', shooter: [180, 560], rail: [50, 310], boss: [180, 285],
    note: 'Босс круга — Диван. Бей его блинами в просветы цепочки и уворачивайся от пончиков.',
    paths: [() => builder(-30, 40).corners([[330, 40], [330, 440], [30, 440], [30, 130], [250, 130]], 40).points()],
  },
];

function build(source) {
  const paths = source.paths.map(make => Object.freeze(resample(make())));
  const rail = source.rail ? Object.freeze({ x0: source.rail[0], x1: source.rail[1], y: source.shooter[1] }) : null;
  const boss = source.boss ? Object.freeze({ x: source.boss[0], y: source.boss[1] }) : null;
  return Object.freeze({ id: source.id, name: source.name, theme: source.theme, note: source.note, shooter: Object.freeze({ x: source.shooter[0], y: source.shooter[1] }), rail, boss, paths: Object.freeze(paths) });
}

export const TRACKS = Object.freeze(Object.fromEntries(SOURCES.map(s => [s.id, build(s)])));

/**
 * Точка пути на расстоянии s от начала — в готовый объект out, без выделения памяти:
 * в кадре и на каждом шаге правил это вызывается сотни раз. До начала пути —
 * продолжение первого отрезка назад.
 */
export function pointInto(path, s, out) {
  const { xs, ys, length } = path;
  if (s <= 0) { out.x = xs[0] + (xs[1] - xs[0]) * s; out.y = ys[0] + (ys[1] - ys[0]) * s; return out; }
  if (s >= length) { out.x = xs[length]; out.y = ys[length]; return out; }
  const i = Math.floor(s), k = s - i;
  out.x = xs[i] + (xs[i + 1] - xs[i]) * k; out.y = ys[i] + (ys[i + 1] - ys[i]) * k;
  return out;
}
export const pointAt = (path, s) => pointInto(path, s, { x: 0, y: 0 });

/** Ближайшая к точке позиция на пути в окне [from, to]. */
export function nearestS(path, x, y, from, to) {
  let best = from, bestD = Infinity;
  for (let s = Math.max(0, Math.floor(from)); s <= Math.min(path.length, Math.ceil(to)); s++) {
    const d = (path.xs[s] - x) ** 2 + (path.ys[s] - y) ** 2;
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}
