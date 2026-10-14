import { QUESTION_BANK } from './plank-questions.js';
export { CATEGORIES, LEVELS } from './plank-questions.js';
export const QUESTIONS = QUESTION_BANK;
export const ROUND_MS = 10000;
export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
export function shuffledQuestions(random = Math.random) { return shuffle(QUESTIONS, random); }
export function makeDeck(category = 'all', level = 0, random = Math.random, seen = []) {
  const pool = QUESTIONS.filter(q => (category === 'all' || q.category === category) && (!level || q.level === Number(level)));
  const visited = new Set(seen);
  // Сначала все ещё не показанные вопросы. Учитываем именно показ, а не
  // резервирование колоды: проигрыш на первом вопросе не расходует остальные.
  const fresh = shuffle(pool.filter(q => !visited.has(q.id)), random).sort((a, b) => a.level - b.level);
  const repeats = shuffle(pool.filter(q => visited.has(q.id)), random).sort((a, b) => a.level - b.level);
  return (fresh.length ? fresh : repeats).map(q => {
    const variants = shuffle(q.answers.map((text, index) => ({ text, right: index === q.correct })), random);
    return { ...q, answers: variants.map(v => v.text), correct: variants.findIndex(v => v.right) };
  });
}

export const activeRound = r => !!r && !['lost', 'won'].includes(r.status);
export function pauseRound(round, now, reason = 'manual', stopAt = Infinity) {
  if (!activeRound(round) || round.status === 'paused') return round;
  const time = Math.min(now, stopAt);
  if (round.status === 'playing' && round.deadline <= time && round.deadline < stopAt) return { ...round, status: 'lost', reason: 'timeout' };
  return { ...round, status: 'paused', pausedFrom: round.status, pauseReason: reason, remaining: round.status === 'playing' ? Math.max(0, round.deadline - time) : ROUND_MS };
}
export function resumeRound(round, now) {
  return round?.status === 'paused' ? { ...round, status: round.pausedFrom, deadline: now + round.remaining } : round;
}
export function judgeAnswer(question, answer, deadline, now) {
  if (now >= deadline) return 'timeout';
  return answer === question.correct ? 'correct' : 'wrong';
}
