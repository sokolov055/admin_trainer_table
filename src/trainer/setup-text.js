/**
 * Текст настройки тренажёра ↔ шаги редактора (16.11.2026). Хранение прежнее:
 * строка на шаг «Подпись — главное; подробности», последняя — «Ошибка: а, б»;
 * стикер и цифра на фото — setupMeta по тем же строкам.
 */
import { instructionParts, stepLabel } from '../equipment-guidance.js';
import { splitStep, mistakeChips } from '../tech-sheet-model.js';

export const clean = (s) => String(s || '').replace(/\s*\n\s*/g, ' ');

/** Текст setup + meta → шаги редактора и метки ошибок */
export function parseSetup(setup, meta = []) {
  const parts = instructionParts(setup || '');
  const steps = parts.steps.map((line, k) => {
    const { label, text } = stepLabel(line);
    const { main, rest } = splitStep(text);
    const m = (Array.isArray(meta) && meta[k]) || {};
    return { label, main, rest, sticker: m.s || '', pin: Array.isArray(m.p) ? m.p : null };
  });
  return { steps, avoid: mistakeChips(parts.mistakes) };
}

/** Шаги и метки → текст setup и meta для сервера */
export function buildSetup(steps, avoid) {
  const lines = [];
  const meta = [];
  steps.forEach((s) => {
    const label = clean(s.label).replace(/[—–:]/g, ' ').replace(/\s+/g, ' ').trim();
    const main = clean(s.main).replace(/;/g, ',').trim();
    const rest = clean(s.rest).trim();
    if (!label && !main && !rest) return;
    const body = (main || rest) + (main && rest ? '; ' + rest : '');
    lines.push(label ? label + ' — ' + body : body);
    meta.push(s.pin ? { s: s.sticker || '', p: s.pin } : { s: s.sticker || '' });
  });
  const marks = avoid.map((a) => clean(a).replace(/,/g, ' ').trim()).filter(Boolean);
  if (marks.length) lines.push('Ошибка: ' + marks.join(', '));
  while (meta.length && !meta[meta.length - 1].s && !meta[meta.length - 1].p) meta.pop();
  return { setup: lines.join('\n'), meta };
}

