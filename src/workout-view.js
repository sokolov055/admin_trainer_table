/**
 * Чистые правила экрана занятия (Workout.jsx), без React: куда смотреть,
 * что дальше, подписи. Вынесены 20.10.2026, чтобы проверять тестом
 * (scripts/test-workout-view.mjs) и не раздувать компонент.
 */

/** У тренажёра есть что раскрыть: фото или где регулировки */
export function machineHasDetails(m) {
  return !!(m && (m.setup || m.photo || (m.photos && m.photos.length)));
}

/** «1 подход», «3 подхода», «5 подходов» */
export const setsWord = (n) => n + ' ' + (n % 10 === 1 && n % 100 !== 11 ? 'подход' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'подхода' : 'подходов');

/**
 * План упражнения без RPE: его убрали из приложения 03.10.2026, но в
 * занятиях, начатых раньше, «RPE 8-9» осталось в снимке плана
 */
export const planText = (p) => String(p || '').split(' · ').filter((x) => x && !/^RPE\b/i.test(x)).join(' · ');

/**
 * Подпись про суперсет.
 *
 * Группа приезжает из плана, но упражнения в занятии можно менять
 * местами и удалять, поэтому считаем по текущему списку: осталось одно —
 * подписи нет, «суперсет из одного» только собьёт.
 */
export function supersetMark(exercises, index) {
  const group = exercises[index].supersetGroup;
  if (!group) return '';
  const same = exercises.filter((e) => e.supersetGroup === group);
  if (same.length < 2) return '';
  return `Суперсет · ${same.indexOf(exercises[index]) + 1} из ${same.length}, без отдыха между упражнениями`;
}

/**
 * Блоки занятия по порядку: отдельное упражнение или суперсет целиком
 * (02.10.2026). Один проход: группы считаются заранее, а не фильтром на
 * каждое упражнение
 */
export function unitsOf(list) {
  const count = new Map();
  list.forEach((e) => { if (e.supersetGroup) count.set(e.supersetGroup, (count.get(e.supersetGroup) || 0) + 1); });
  const out = [];
  const byKey = new Map();
  list.forEach((e) => {
    const key = e.supersetGroup && count.get(e.supersetGroup) > 1 ? 'g' + e.supersetGroup : e.id;
    const found = byKey.get(key);
    if (found) found.items.push(e);
    else { const unit = { key, items: [e] }; byKey.set(key, unit); out.push(unit); }
  });
  return out;
}

/**
 * Ближайший подход занятия; в суперсете — следующее упражнение того же круга.
 *
 * Порядок (QA 20.10.2026): сначала упражнение, где только что отметили
 * подход (hint — его id; у суперсета — весь круг), потом начатые — с
 * отмеченным и неотмеченным подходом, последнее по списку, — и только
 * потом первое по порядку. Раньше брали первое с неотмеченным: кардио
 * первым в списке, к которому не притрагивались, после каждого подхода
 * приседа «Дальше» звало на дорожку
 */
export function focusOf(s, hint = '') {
  const list = (s && s.exercises) || [];
  const pendingAt = (e) => e.sets.findIndex(x => x.state === 'pending');
  const pick = (e) => {
    const si = pendingAt(e);
    if (si === -1) return null;
    const group = e.supersetGroup;
    if (group) {
      const mates = list.filter(m => m.supersetGroup === group);
      const r = Math.min(...mates.map(m => { const j = pendingAt(m); return j === -1 ? Infinity : j; }));
      const who = mates.find(m => m.sets[r] && m.sets[r].state === 'pending');
      if (who) return { ex: who.id, set: r };
    }
    return { ex: e.id, set: si };
  };
  const hinted = hint ? list.find(e => e.id === hint) : null;
  const sameRound = (e) => e === hinted || (!!hinted && !!hinted.supersetGroup && e.supersetGroup === hinted.supersetGroup);
  const started = (e) => pendingAt(e) !== -1 && e.sets.some(x => x.state === 'done');
  const order = [...list.filter(sameRound), ...list.filter(started).reverse(), ...list];
  for (const e of order) {
    const found = pick(e);
    if (found) return found;
  }
  return { ex: '', set: -1 };
}

/** «Присед со штангой · подход 2 из 5 · 90 кг × 5» — для уведомлений */
export function nextText(s, hint = '') {
  const n = s ? nextInfo(s, focusOf(s, hint)) : null;
  if (n && n.items) return [n.part, n.items.map(it => [it.name, it.load].filter(Boolean).join(' ')).join(' + ')].join(' · ');
  return n ? [n.name, n.part, n.load].filter(Boolean).join(' · ') : '';
}

/**
 * Что дальше — для экрана отдыха (владелец, 03.10.2026): куда идти и что
 * накинуть или снять. Тот же человек и то же упражнение — разница с
 * прошлым подходом; другое упражнение — «новое» и вес с прошлого раза
 */
export function nextInfo(s, focus) {
  const ex = s.exercises.find(e => e.id === focus.ex);
  const set = ex && ex.sets[focus.set];
  if (!set) return null;
  const num = (v) => Number(String(v || '').replace(',', '.'));
  const kg = (v) => String(Math.round(v * 100) / 100).replace('.', ',');
  const own = ex.sets.filter(x => (x.who || '') === (set.who || ''));
  const part = (set.who ? set.who + ' · ' : '') + 'подход ' + (own.indexOf(set) + 1) + ' из ' + own.length;
  const load = [set.weight ? kg(num(set.weight)) + ' кг' : '', set.reps ? '× ' + set.reps : ''].filter(Boolean).join(' ');
  const loadOf = (x) => [x.weight ? kg(num(x.weight)) + ' кг' : '', x.reps ? '× ' + x.reps : ''].filter(Boolean).join(' ');
  const changeOf = (e, x, list) => {
    const before = list.slice(0, list.indexOf(x)).filter(y => y.state === 'done').pop();
    if (before && x.weight && before.weight) {
      const d = num(x.weight) - num(before.weight);
      // Было тяжело, а вес не сдвинулся (диапазон, свой вес) — сказать,
      // почему тот же, иначе кажется, что оценку не учли (QA 20.10.2026)
      return d > 0 ? { kind: 'up', text: 'накинуть ' + kg(d) + ' кг' }
        : d < 0 ? { kind: 'down', text: 'снять ' + kg(-d) + ' кг' }
          : { kind: 'same', text: before.effort === 'hard' ? 'вес тот же · было тяжело' : 'вес тот же' };
    }
    // Первый подход упражнения: что было в прошлый раз, нет — так и сказать
    if (!before) return { kind: 'new', text: e.prevWeight ? 'в прошлый раз ' + String(e.prevWeight).replace('.', ',') + ' кг' : 'первый подход' };
    return null;
  };
  // Дальше суперсет — весь круг, а не одно упражнение (03.10.2026)
  const mates = ex.supersetGroup && !set.who ? s.exercises.filter(e => e.supersetGroup === ex.supersetGroup) : [];
  if (mates.length > 1) {
    const r = focus.set;
    const rounds = Math.max(...mates.map(e => e.sets.length));
    const items = mates.filter(e => e.sets[r] && e.sets[r].state !== 'skipped')
      .map(e => ({ name: e.name, load: loadOf(e.sets[r]), change: changeOf(e, e.sets[r], e.sets), done: e.sets[r].state === 'done' }));
    return { name: 'Суперсет', part: 'круг ' + (r + 1) + ' из ' + rounds, items };
  }
  return { name: ex.name, part, load, change: changeOf(ex, set, own) };
}

