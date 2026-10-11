// Только демо-сборка: ответы переживают перезагрузку для проверки прерывания.
const KEY = 'fittrack_demo_onboarding';
const load = () => JSON.parse(localStorage.getItem(KEY) || '{"step":0,"answers":{},"revision":0,"consentNeeded":true}');
const store = (r) => localStorage.setItem(KEY, JSON.stringify(r));
const enabled = () => new URLSearchParams(location.search).get('mockOnboarding') === '1'
  && localStorage.getItem('fittrack_demo_onboarding_off') !== '1';
const programs = [1, 2, 3].map((id) => ({ id, title: `Демо-программа ${id}`, description: 'Пример для проверки интерфейса', days: 2,
  blocks: [{ title: 'Демо-занятие', exercises: [{ name: 'Пример упражнения', sets: '2', reps: '10' }] }] }));
export function onboardingMock(action, p) {
  const saved = load();
  if (action === 'owner.onboarding.get') return { enabled: enabled(), emergencyOff: false, catalog: [], templates: programs };
  if (action === 'owner.onboarding.save') {
    localStorage.setItem('fittrack_demo_onboarding_off', p.enabled ? '0' : '1');
    return { enabled: enabled(), emergencyOff: false, catalog: p.catalog || [], templates: programs };
  }
  if (!enabled()) {
    if (action === 'client.onboarding.get') return { enabled: false, eligible: false };
    throw new Error('Анкета отключена. Вернитесь в приложение.');
  }
  if (action === 'client.onboarding.consent') { saved.consentNeeded = false; store(saved); }
  if (action === 'client.onboarding.save') {
    if (p.revision !== saved.revision) throw new Error('Ответы изменились на другом устройстве.');
    Object.assign(saved, { answers: p.answers, step: p.step, revision: saved.revision + 1 }); store(saved);
  }
  if (action === 'client.onboarding.choose') {
    Object.assign(saved, { completed: true, selectedTitle: programs.find((r) => r.id === p.templateId).title }); store(saved);
    return { completed: true, selectedTitle: saved.selectedTitle, days: saved.answers.days };
  }
  return { enabled: true, eligible: !saved.completed, ...saved, programs: saved.step === 4 ? programs.map((r) => ({ ...r, days: saved.answers.days })) : [] };
}
