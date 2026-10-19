// Чистые правила: случайность входит в состояние, а каждый ход воспроизводим.
import { chapterFor, chapterComplete } from './match-story.js';

export const MATCH_TUNING = Object.freeze({ size: 9, types: 6, moves: 20, points: 20, target: 2000, maxCascades: 40 });
export const PIECES = Object.freeze([
  { name: 'Гантель', color: '#28d5dd' }, { name: 'Гиря', color: '#b47bff' },
  { name: 'Диск', color: '#479aff' }, { name: 'Яблоко', color: '#ff6572' },
  { name: 'Бананы', color: '#ffce47' }, { name: 'Брокколи', color: '#99df50' },
]);
export const POWER_NAMES = { row: 'заряд строки', col: 'заряд столбца', burst: 'взрыв 3 на 3', color: 'цветной заряд' };
const N = MATCH_TUNING.size;
export const rowOf = i => Math.floor(i / N);
export const colOf = i => i % N;
export const adjacent = (a, b) => Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b >= 0 && a < N * N && b < N * N && Math.abs(rowOf(a) - rowOf(b)) + Math.abs(colOf(a) - colOf(b)) === 1;
function random(state) {
  state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0;
  return state.seed / 4294967296;
}
function tile(state, type = Math.floor(random(state) * MATCH_TUNING.types)) {
  return { id: ++state.nextId, type, power: null };
}
function swap(board, a, b) { const next = board.slice(); [next[a], next[b]] = [next[b], next[a]]; return next; }

export function findMatches(board) {
  const runs = [];
  for (const direction of ['row', 'col']) {
    for (let line = 0; line < N; line++) {
      let start = 0;
      while (start < N) {
        const index = offset => direction === 'row' ? line * N + offset : offset * N + line;
        const type = board[index(start)]?.type;
        let end = start + 1;
        while (end < N && type != null && board[index(end)]?.type === type) end++;
        if (type != null && end - start >= 3) runs.push({ direction, cells: Array.from({ length: end - start }, (_, k) => index(start + k)) });
        start = end;
      }
    }
  }
  // Пересекающиеся линии одного совпадения образуют Т/Г; клетки считаются один раз.
  const groups = [];
  for (const run of runs) {
    const joined = groups.filter(g => run.cells.some(i => g.cells.includes(i)));
    const cells = [...new Set([...run.cells, ...joined.flatMap(g => g.cells)])];
    const group = { cells, runs: [run, ...joined.flatMap(g => g.runs)] };
    for (const old of joined) groups.splice(groups.indexOf(old), 1);
    groups.push(group);
  }
  return groups;
}

export function isLegalSwap(board, a, b) {
  if (!adjacent(a, b) || !board[a] || !board[b]) return false;
  if (board[a].power === 'color' || board[b].power === 'color' || (board[a].power && board[b].power)) return true;
  return findMatches(swap(board, a, b)).some(g => g.cells.includes(a) || g.cells.includes(b));
}
export function legalMoves(board, covers = []) {
  const moves = [];
  const closed = new Set(covers);
  for (let i = 0; i < N * N; i++) {
    for (const j of [i + 1, i + N]) if (!closed.has(i) && !closed.has(j) && adjacent(i, j) && isLegalSwap(board, i, j)) moves.push([i, j]);
  }
  return moves;
}

function freshBoard(state) {
  const board = [];
  for (let i = 0; i < N * N; i++) {
    const blocked = new Set();
    if (colOf(i) >= 2 && board[i - 1].type === board[i - 2].type) blocked.add(board[i - 1].type);
    if (rowOf(i) >= 2 && board[i - N].type === board[i - 2 * N].type) blocked.add(board[i - N].type);
    const allowed = Array.from({ length: MATCH_TUNING.types }, (_, x) => x).filter(x => !blocked.has(x));
    board.push(tile(state, allowed[Math.floor(random(state) * allowed.length)]));
  }
  // Гарантированный ход без стартового совпадения, если генератор дал тупик.
  if (!legalMoves(board).length) {
    const pattern = [[0, 0], [1, 1], [2, 0], [N + 1, 0]];
    for (const [i, type] of pattern) board[i] = { ...board[i], type };
    if (findMatches(board).length) return freshBoard(state);
  }
  return board;
}

// rules — задание карьеры (career-model.js): свои ходы, очки и число сюжетных фигур.
export function createMatchGame(seed = Date.now(), level = 1, rules = null) {
  const game = { seed: seed >>> 0, nextId: 0, level: Math.max(1, Math.min(3, level)), moves: rules?.moves || MATCH_TUNING.moves, score: 0, collected: 0, uncovered: 0, bestCombo: 0, turns: 0, board: [], covers: [] };
  game.target = rules?.target || MATCH_TUNING.target + (game.level - 1) * 250;
  if (rules?.count) game.storyGoal = rules.count;
  game.board = freshBoard(game);
  const patterns = [
    [19, 20, 28, 29, 51, 52, 60, 61],
    [22, 23, 31, 32, 48, 49, 57, 58],
    [29, 30, 38, 39, 41, 42, 50, 51],
  ];
  game.covers = patterns[game.level - 1].slice();
  while (!legalMoves(game.board, game.covers).length) game.board = freshBoard(game);
  return game;
}

export function reshuffle(game) {
  const state = { ...game, board: game.board.slice() };
  // Сохраняем специальные фигуры и состав поля при обычном перемешивании.
  for (let attempt = 0; attempt < 150; attempt++) {
    for (let i = state.board.length - 1; i > 0; i--) {
      const j = Math.floor(random(state) * (i + 1));
      [state.board[i], state.board[j]] = [state.board[j], state.board[i]];
    }
    if (!findMatches(state.board).length && legalMoves(state.board, state.covers).length) return state;
  }
  // Защитный выход для патологического состава; ход и счёт не списываются.
  const powers = state.board.filter(t => t.power).map(t => t.power);
  state.board = freshBoard(state);
  powers.forEach((power, i) => { state.board[i] = { ...state.board[i], power }; });
  return state;
}

function expandClears(board, initial, protectedCells, colorTargets = {}) {
  const clear = new Set(initial);
  const effects = [];
  for (const i of clear) {
    if (protectedCells.has(i)) continue;
    const t = board[i];
    if (!t?.power) continue;
    effects.push({ at: i, power: t.power });
    for (let j = 0; j < board.length; j++) {
      const hit = t.power === 'row' ? rowOf(j) === rowOf(i)
        : t.power === 'col' ? colOf(j) === colOf(i)
        : t.power === 'burst' ? Math.abs(rowOf(i) - rowOf(j)) <= 1 && Math.abs(colOf(i) - colOf(j)) <= 1
        : colorTargets[i] === 'all' || board[j]?.type === (colorTargets[i] ?? t.type);
      if (hit) clear.add(j);
    }
  }
  protectedCells.forEach(i => clear.delete(i));
  return { cells: [...clear], effects };
}

function collapse(state, removed) {
  const old = state.board;
  const board = Array(N * N).fill(null);
  const from = {};
  for (let col = 0; col < N; col++) {
    let destRow = N - 1;
    for (let row = N - 1; row >= 0; row--) {
      const i = row * N + col;
      if (removed.has(i)) continue;
      const t = old[i];
      board[destRow * N + col] = t;
      from[t.id] = row;
      destRow--;
    }
    const count = destRow + 1;
    for (let row = destRow; row >= 0; row--) {
      const t = tile(state);
      board[row * N + col] = t;
      from[t.id] = row - count;
    }
  }
  state.board = board;
  return from;
}

// Кадры содержат только данные. Представление управляет длительностью, а не правилами.
export function resolveMove(game, a, b) {
  if (game.moves <= 0 || !adjacent(a, b) || game.covers?.includes(a) || game.covers?.includes(b)) return { valid: false, frames: [], game };
  let state = { ...game, board: swap(game.board, a, b), covers: (game.covers || []).slice() };
  const frames = [];
  const frame = (kind, duration, extra = {}) => frames.push({ kind, duration, game: { ...state, board: state.board.slice(), covers: state.covers.slice() }, ...extra });
  if (!isLegalSwap(game.board, a, b)) {
    frame('swap', 220, { a, b });
    state.board = game.board;
    frame('reject', 240, { a, b });
    return { valid: false, frames, game };
  }
  state.moves--; state.turns++;
  frame('swap', 230, { a, b });
  let combo = 0;
  let groups = findMatches(state.board);
  let forced = [];
  const colorTargets = {};
  for (const [i, other] of [[a, b], [b, a]]) {
    if (state.board[i].power === 'color') {
      forced.push(i, other);
      colorTargets[i] = state.board[other].power === 'color' ? 'all' : state.board[other].type;
    }
  }
  if (state.board[a].power && state.board[b].power) forced.push(a, b);
  while (groups.length || forced.length) {
    combo++;
    if (combo > MATCH_TUNING.maxCascades) {
      state = reshuffle(state); frame('shuffle', 320); break;
    }
    const creations = [];
    for (const group of groups) {
      const long = group.runs.find(r => r.cells.length >= 5);
      const power = long ? 'color' : group.runs.length > 1 ? 'burst' : group.cells.length >= 4 ? group.runs[0].direction : null;
      if (!power) continue;
      const candidates = combo === 1 ? [b, a, ...group.cells] : group.cells;
      const at = candidates.find(i => group.cells.includes(i) && !state.board[i].power);
      if (at != null) creations.push({ at, power });
    }
    const protectedCells = new Set(creations.map(c => c.at));
    const { cells, effects } = expandClears(state.board, [...new Set([...groups.flatMap(g => g.cells), ...forced])], protectedCells, combo === 1 ? colorTargets : {});
    const points = cells.length * MATCH_TUNING.points * Math.min(combo, 4);
    const reveals = state.covers.filter(covered => cells.some(i => Math.abs(rowOf(i) - rowOf(covered)) + Math.abs(colOf(i) - colOf(covered)) <= 1));
    const storyGain = cells.filter(i => state.board[i]?.type === chapterFor(state.level).type).length;
    state.score += points;
    state.collected += storyGain;
    state.uncovered += reveals.length;
    state.covers = state.covers.filter(i => !reveals.includes(i));
    state.bestCombo = Math.max(state.bestCombo, combo);
    // Старая фигура видна в кадре исчезновения, новая появляется после него.
    frame('clear', 390, { cells, effects, creations, combo, points, storyGain, reveals });
    state.board = state.board.map((t, i) => {
      const made = creations.find(c => c.at === i);
      return made ? { ...t, power: made.power } : t;
    });
    const from = collapse(state, new Set(cells));
    frame('drop-start', 36, { from, combo });
    frame('fall', 380, { from, combo });
    forced = [];
    groups = findMatches(state.board);
  }
  if (state.moves > 0 && !legalMoves(state.board, state.covers).length) {
    state = reshuffle(state); frame('shuffle', 340);
  }
  return { valid: true, frames, game: state };
}

export const earnedStars = game => !chapterComplete(game) ? 0 : game.score >= game.target * 1.8 ? 3 : game.score >= game.target * 1.35 ? 2 : game.score >= game.target ? 1 : 0;
