/** Недельная программа действует по датам; месяц остаётся группировкой истории. */
const DAY = 86400000;
export const dateKey = (date = new Date()) => {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const addDays = (key, n) => dateKey(new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)) + n, 12));
export const monday = (key) => addDays(key, -((new Date(key + 'T12:00:00').getDay() + 6) % 7));
export const nextMonday = (key = dateKey()) => addDays(monday(key), 7);
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / DAY);
const maxWeek = (blocks) => Math.max(0, ...(blocks || []).map((b) => Number(b.week) || 0));
export const programSize = (blocks, cfg) => Math.max(maxWeek(blocks), Number(cfg && cfg.length) || 0);
export const inPause = (day, cfg) => (cfg.pauses || []).some((p) => day >= p.from && (!p.to || day <= p.to));

export function versionAt(blocks, cfg, day) {
  const versions = [...(cfg.history || []), { from: cfg.effectiveOn || cfg.startsOn || '', blocks, settings: cfg }];
  return versions.filter((v) => v.from <= day).sort((a, b) => b.from.localeCompare(a.from))[0] || versions[0];
}

/** Все даты считаются календарными, без сдвига при переходе летнего времени. */
export function scheduledPlan({ blocks = [], sessions = [], month, cfg, today = new Date() }) {
  const now = dateKey(today);
  const first = cfg.startsOn;
  const start = monday(first);
  const last = addDays(monday(now > first ? now : first), 28);
  const weeks = [];
  let n = 0;
  for (let from = start; from <= last && n < 2600; from = addDays(from, 7)) {
    n += 1;
    const end = addDays(from, 6);
    const v = versionAt(blocks, cfg, now >= from && now <= end ? now : end);
    const settings = v.settings;
    const length = programSize(v.blocks, settings) || 1;
    const anchor = monday(v.from || first);
    let elapsed = Math.max(0, Math.floor(daysBetween(anchor, from) / 7));
    for (let p = anchor; p < from; p = addDays(p, 7)) {
      if (Array.from({ length: 7 }, (_, i) => addDays(p, i)).every((d) => inPause(d, settings))) elapsed -= 1;
    }
    const week = (((Number(settings.startWeek) || 1) - 1 + Math.max(0, elapsed)) % length) + 1;
    const endsOn = cfg.stopOn && (!settings.endsOn || cfg.stopOn < settings.endsOn) ? cfg.stopOn : settings.endsOn;
    const activeDays = Array.from({ length: 7 }, (_, i) => addDays(from, i)).filter((d) => d >= first && d >= (v.from || first) && (!endsOn || d <= endsOn) && !inPause(d, settings));
    const ended = now > end;
    const paused = activeDays.length === 0 && end >= first && (!endsOn || from <= endsOn);
    const expired = !!endsOn && (from > endsOn || (now >= from && now <= end && now > endsOn));
    const previous = [...weeks].reverse().find((w) => w.status !== 'paused' && w.status !== 'expired');
    const rule = settings.rule || 'client';
    const decide = (r) => previous.rule === 'client' ? (cfg.choices || {})[`${previous.n}:${r.block.id}`] : previous.rule;
    const debts = !paused && !expired && previous && previous.status !== 'paused'
      ? previous.rows.filter((r) => r.missed && decide(r) === 'redo') : [];
    const own = activeDays.length ? v.blocks.filter((b) => (Number(b.week) || 1) === week) : [];
    const rowBlocks = [...own, ...debts.map((r) => r.block).filter((b) => !own.some((x) => x.id === b.id))];
    const rows = rowBlocks.map((block) => {
      const debt = debts.find((r) => r.block.id === block.id);
      const carried = !!debt;
      const required = Number(own.some((b) => b.id === block.id)) + (debt ? debt.missed : 0);
      const here = sessions.filter((s) => s.status === 'completed' && s.month === month
        && (s.sourceBlockId ? s.sourceBlockId === block.id : s.sourceBlock === block.title)
        && (settings.legacyList ? dateKey(s.startedAt || s.updatedAt) <= end : activeDays.includes(dateKey(s.startedAt || s.updatedAt))));
      const done = here.length;
      return { block, sessions: here, carried, required, done, left: Math.max(0, required - done), missed: ended && activeDays.length === 7 && !settings.legacyList ? Math.max(0, required - done) : 0 };
    });
    const need = rows.reduce((sum, r) => sum + r.required, 0);
    const done = rows.reduce((sum, r) => sum + Math.min(r.done, r.required), 0);
    const full = activeDays.length === 7;
    const loads = new Set(own.map((b) => b.load || ''));
    weeks.push({ n, start: from, end, from: Number(from.slice(8)), to: Number(end.slice(8)),
      fromGen: new Date(from + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }).replace(/^\d+\s*/, ''),
      monthGen: new Date(end + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }).replace(/^\d+\s*/, ''),
      week, length, rule, ended, full, current: now >= from && now <= end, rows, need, done, extra: 0,
      load: loads.size === 1 ? [...loads][0] : '', missed: ended ? Math.max(0, need - done) : 0,
      status: now < first ? 'scheduled' : expired ? 'expired' : paused ? 'paused' : settings.legacyList ? 'legacy' : !need ? 'empty' : done >= need ? 'done' : ended && full ? 'missed' : ended ? 'partial' : 'open',
    });
  }
  const currentIndex = weeks.findIndex((w) => w.current);
  const current = weeks[currentIndex];
  const previous = weeks.slice(0, Math.max(0, currentIndex)).reverse().find((w) => w.status !== 'paused' && w.status !== 'expired');
  const rule = previous ? previous.rule : 'client';
  const pending = previous && current && !['paused', 'expired'].includes(current.status) && rule === 'client'
    ? previous.rows.filter((r) => r.missed && !(cfg.choices || {})[`${previous.n}:${r.block.id}`]) : [];
  const monthKey = now.slice(0, 7);
  const graded = weeks.filter((w) => w.start.slice(0, 7) === monthKey && ['done', 'missed'].includes(w.status));
  return { scheduled: true, weeks, length: programSize(blocks, cfg), own: weeks.length, currentIndex, cfg, pending, pendingWeek: previous,
    pendingMonth: month, score: { done: graded.filter((w) => w.status === 'done').length, graded: graded.length, total: graded.length, allDone: false } };
}
