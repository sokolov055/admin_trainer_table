import { findMatches, legalMoves } from '../src/match-model.js';

// Сравнение только видимых комбинаций, без знания будущих фигур генератора.
function value(board, [a, b]) {
  if (board[a].power && board[b].power) return 100;
  if (board[a].power === 'color') return board.filter(t => t.type === board[b].type).length + 8;
  if (board[b].power === 'color') return board.filter(t => t.type === board[a].type).length + 8;
  const swapped = board.slice(); [swapped[a], swapped[b]] = [swapped[b], swapped[a]];
  return findMatches(swapped).reduce((n, g) => n + g.cells.length + (g.cells.length >= 4 ? 6 : 0) + g.cells.filter(i => swapped[i].power).length * 8, 0);
}
export function chooseMove(board, strategy, turn = 0, covers = []) {
  const options = legalMoves(board, covers);
  if (strategy === 'random') return options[(turn * 7919 + board[0].id * 13) % options.length];
  return options.sort((a, b) => (value(board, b) - value(board, a)) * (strategy === 'weak' ? -1 : 1))[0];
}
