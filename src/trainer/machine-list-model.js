/** FT-819: представление каталога, без изменений объектов и личных версий. */
export const NO_MACHINE_FILTERS = { brand: '', muscle: '', missing: false, sort: 'recent' };
const norm = (s) => String(s || '').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
export const machineFilterCount = (f) => Number(!!f.brand) + Number(!!f.muscle) + Number(!!f.missing);
export function shownMachines(list, { scope = 'mine', q = '', kind = '', filters = NO_MACHINE_FILTERS } = {}) {
  const query = norm(q);
  const shown = list.filter((m) => !!m.mine === (scope === 'mine'))
    .filter((m) => !kind || m.kind === kind)
    .filter((m) => !filters.brand || (filters.brand === '—' ? !m.brand : m.brand === filters.brand))
    .filter((m) => !filters.muscle || (m.muscleGroups || []).includes(filters.muscle))
    .filter((m) => !filters.missing || !(m.uses || []).length)
    .filter((m) => !query || [m.name, m.brand, m.originalName, ...(m.uses || []).map((e) => e.name)].some((s) => norm(s).includes(query)));
  if (filters.sort === 'az') shown.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  if (filters.sort === 'uses') shown.sort((a, b) => (b.uses || []).length - (a.uses || []).length);
  return shown;
}
