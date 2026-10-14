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
export function makeDeck(category = 'all', level = 0, random = Math.random) {
  const pool = QUESTIONS.filter(q => (category === 'all' || q.category === category) && (!level || q.level === Number(level)));
  return shuffle(pool, random).slice(0, 10).sort((a, b) => a.level - b.level).map(q => {
    const variants = shuffle(q.answers.map((text, index) => ({ text, right: index === q.correct })), random);
    return { ...q, answers: variants.map(v => v.text), correct: variants.findIndex(v => v.right) };
  });
}
export function judgeAnswer(question, answer, deadline, now) {
  if (now >= deadline) return 'timeout';
  return answer === question.correct ? 'correct' : 'wrong';
}
