/**
 * «Сегодня» в питании (макет nutrition-redesign-2026-11-20, этап 1,
 * владелец 20.11.2026: «делай всё как в макете»). Чистые функции без React —
 * их проверяет scripts/test-nutrition-today.mjs.
 */

import { shiftDay } from './diary-model.js';

/** Неделя дня: семь дат с понедельника по воскресенье */
export function weekOf(day) {
  const d = new Date(day + 'T12:00:00Z');
  const back = (d.getUTCDay() + 6) % 7; // пн = 0
  const monday = shiftDay(day, -back);
  return Array.from({ length: 7 }, (_, i) => shiftDay(monday, i));
}

export const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

/** Коридор нормы — ±12 %, как OFF_TARGET в рационе */
export const NORM_BAND = 0.12;

/**
 * Тон дня для колечка и столбика: 'empty' — ничего не записано, 'good' — в
 * коридоре нормы, 'over' — больше, 'under' — меньше; без нормы — 'neutral'
 */
export function dayTone(kcal, target) {
  if (!(kcal > 0)) return 'empty';
  if (!(target > 0)) return 'neutral';
  if (kcal > target * (1 + NORM_BAND)) return 'over';
  if (kcal < target * (1 - NORM_BAND)) return 'under';
  return 'good';
}

/** Доля нормы на приём, если человек не задал свою (только для полоски) */
export const DEFAULT_SHARES = { breakfast: 25, lunch: 35, dinner: 30, snack: 10 };

/** Норма приёма в ккал: своя доля из настроек или обычная раскладка */
export function mealTarget(meal, dayKcal, shares) {
  if (!(dayKcal > 0)) return 0;
  const share = shares && shares[meal] != null ? shares[meal] : DEFAULT_SHARES[meal] || 0;
  return Math.round(dayKcal * share / 100);
}

export const MEAL_ICONS = { breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍎' };

/*
 * Значок еды по названию: первое совпадение корня. Неизвестное — тарелка.
 * Порядок важен: «куриный суп» — суп, а не курица, поэтому блюда раньше
 * продуктов.
 */
const EMOJI = [
  [/суп|борщ|щи\b|солянк|уха\b/, '🍲'], [/салат/, '🥗'], [/пицц/, '🍕'], [/бургер|гамбургер/, '🍔'],
  [/шаурм|ролл|лаваш/, '🌯'], [/суш|ролл/, '🍣'], [/паст|макарон|спагет|лапш/, '🍝'], [/плов|рис\b|риса|рисов/, '🍚'],
  [/омлет|яичниц|яйц|яйко/, '🍳'], [/каш|овсян|гречк|пшен|манн|мюсли|гранол/, '🥣'], [/блин|олад|сырник/, '🥞'],
  [/творог/, '🥛'], [/йогурт|кефир|молок|ряженк|айран/, '🥛'], [/сыр\b|сыра|сыр /, '🧀'],
  [/кур|индей|цыпл/, '🍗'], [/говяд|свин|мяс|котлет|стейк|фарш|телят/, '🥩'], [/колбас|сосис|ветчин|бекон/, '🌭'],
  [/рыб|лосос|семг|сёмг|треск|тунец|тунц|форел|скумбр|минта|горбуш/, '🐟'], [/кревет|кальмар|мид/, '🦐'],
  [/хлеб|батон|булк|лепешк|лепёшк|тост|хлебц/, '🍞'], [/картоф|картош|пюре/, '🥔'],
  [/банан/, '🍌'], [/яблок/, '🍏'], [/апельсин|мандарин/, '🍊'], [/груш/, '🍐'], [/виноград/, '🍇'], [/клубник|ягод|малин|черник/, '🍓'],
  [/авокад/, '🥑'], [/брокк|капуст/, '🥦'], [/огур/, '🥒'], [/помидор|томат/, '🍅'], [/морков/, '🥕'], [/овощ/, '🥬'],
  [/орех|миндал|арахис|фисташ|кешью/, '🥜'], [/шоколад|конфет|печень|торт|пирожн|вафл|десерт|морожен/, '🍫'],
  [/кофе|капучин|латте|эспрессо|американо/, '☕'], [/чай/, '🍵'], [/сок|смузи|морс|компот/, '🧃'], [/вод/, '💧'],
  [/протеин|батончик/, '💪'], [/масл/, '🫒'],
];
export function foodEmoji(name) {
  const s = String(name || '').toLowerCase().replace(/ё/g, 'е');
  for (const [re, e] of EMOJI) if (re.test(s)) return e;
  return '🍽️';
}

/** Цель воды на день, мл (макет: «из 2 л») */
export const WATER_GOAL = 2000;
export const GLASS_ML = 250;

/** Сколько стаканов рисовать: норма, а сверх неё — на один больше выпитого */
export function glassCount(ml, goal = WATER_GOAL) {
  return Math.max(Math.ceil(goal / GLASS_ML), Math.floor((ml || 0) / GLASS_ML) + 1);
}

/**
 * Нажатие на стакан i (с нуля) при выпитом ml → изменение воды в мл.
 * Пустой стакан — налить до него включительно; последний полный — убрать его;
 * полный в середине — ничего (0), чтобы случайное касание не вылило воду.
 */
export function glassDelta(i, ml) {
  const full = Math.floor((ml || 0) / GLASS_ML);
  if (i >= full) return (i + 1 - full) * GLASS_ML;
  if (i === full - 1) return -GLASS_ML;
  return 0;
}

/** Итог завершённого дня: эмодзи и слово (макет: 🎯 «В норме!») */
export function finishFace(kcal, target) {
  const tone = dayTone(kcal, target);
  if (tone === 'good') return { emoji: '🎯', title: 'В норме!', tone };
  if (tone === 'over') return { emoji: '⬆️', title: 'Больше нормы', tone };
  if (tone === 'under') return { emoji: '⬇️', title: 'Меньше нормы', tone };
  return { emoji: '✅', title: 'День записан', tone };
}

/** Сколько полных дней подряд до дня включительно (по колечкам недели) */
export function fullStreak(days, day) {
  const upto = (days || []).filter((d) => d.day <= day).sort((a, b) => (a.day < b.day ? 1 : -1));
  let n = 0;
  for (const d of upto) { if (!d.complete) break; n++; }
  return n;
}
