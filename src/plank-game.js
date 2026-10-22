import { QUESTION_BANK, CATEGORIES as BUILT_IN_CATEGORIES } from './plank-questions.js';
import { onGamePacks } from './game-packs-store.js';
export { LEVELS } from './plank-questions.js';
// Вопросы и темы — встроенные и из наборов владельца («Управление → Игры»,
// remote-games.js, 22.10.2026). let — живая привязка: игра берёт свежий список
export let QUESTIONS = QUESTION_BANK;
export let CATEGORIES = BUILT_IN_CATEGORIES;

/** Наборы вопросов (ответ app.gamepacks, только plank) — к встроенному банку */
export function setQuestionPacks(packs = []) {
  const categories = [...BUILT_IN_CATEGORIES];
  const extra = [];
  for (const pack of packs) {
    for (const c of pack.categories || []) if (!categories.some((x) => x.id === c.id)) categories.push({ id: c.id, name: c.name });
    (pack.questions || []).forEach((q, i) => extra.push({
      id: `${pack.id}-${i + 1}`, category: q.category, level: q.level, text: q.text,
      answers: [q.right, ...q.wrong], correct: 0, why: q.why,
    }));
  }
  const known = new Set(categories.map((c) => c.id));
  QUESTIONS = [...QUESTION_BANK, ...extra.filter((q) => known.has(q.category))];
  CATEGORIES = categories;
}
onGamePacks('plank', setQuestionPacks);
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
