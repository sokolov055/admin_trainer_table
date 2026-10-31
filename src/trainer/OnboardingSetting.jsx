import React, { useEffect, useState } from 'react';
import { apiPublic, apiMutate } from '../api.js';
import { Section, Panel } from '../ui.jsx';
import { GOALS, QUESTIONS } from '../client/onboarding-model.js';
import '../client/onboarding.css';

// В анкете цель — отдельный шаг, остальные вопросы хранятся по ключам.
const CONDITIONS = [
  { key: 'goal', label: 'Цель', options: GOALS.map(g => [g.id, g.title]) },
  ...Object.values(QUESTIONS).map(q => ({ ...q, label: q.eyebrow })),
];

export default function OnboardingSetting() {
  const [data, setData] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    apiPublic('owner.onboarding.get').then((r) => { if (alive) { setData(r); setCatalog(r.catalog); } })
      .catch((e) => { if (alive) setFailure(e.message || 'Не удалось загрузить настройки.'); });
    return () => { alive = false; };
  }, []);
  const save = async (enabled, off = false) => {
    if (busy) return;
    setBusy(true); setFailure('');
    try {
      const r = await apiMutate('owner.onboarding.save', { enabled, ...(off ? {} : { catalog }) });
      setData(r); setCatalog(r.catalog);
    } catch (e) { setFailure(e.message || 'Не удалось сохранить. Попробуйте ещё раз.'); }
    finally { setBusy(false); }
  };
  const change = (id, key, value) => setCatalog((rows) => rows.map((r) => r.id === id ? { ...r, [key]: value } : r));
  return <Section title="Анкета перед выбором программы"><Panel pad>
    <p className="small">Только для самостоятельных клиентов без программы. Выключение сразу закрывает запись ответов; открытый экран исчезнет при возврате в приложение или в течение 30 секунд. Выбранные программы и ответы сохранятся.</p>
    {data && <>
      <p role="status"><strong>{data.enabled ? 'Анкета включена' : 'Анкета выключена'}</strong>{data.emergencyOff && ' · аварийное отключение на сервере'}</p>
      <button className="button button--block" disabled={busy} onClick={() => save(false, true)}>Выключить анкету для всех</button>
      <details className="onboarding-admin__row"><summary>Стартовые программы и включение</summary>
        <p className="small muted">Выберите проверенные программы из своей библиотеки и укажите, кому они подходят. Для каждого сочетания показываются до трёх вариантов. Несовпадающие условия не подменяются.</p>
        {data.templates.map((t) => {
          const row = catalog.find((r) => r.id === t.id);
          return <div className="onboarding-admin__row" key={t.id}>
            <label><input type="checkbox" disabled={busy} checked={!!row} onChange={(e) => setCatalog((rows) => e.target.checked
              ? [...rows, { id: t.id, goal: 'any', experience: 'beginner', place: 'gym', days: 2 }]
              : rows.filter((r) => r.id !== t.id))} /> {t.title}</label>
            {row && <div className="onboarding-admin__fields">{CONDITIONS.map((q) => <label key={q.key}>{q.label}
              <select disabled={busy} value={row[q.key]} onChange={(e) => change(t.id, q.key, q.key === 'days' ? Number(e.target.value) : e.target.value)}>
                {['goal', 'experience'].includes(q.key) && <option value="any">Любой вариант</option>}
                {q.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select></label>)}</div>}
          </div>;
        })}
        {!data.templates.length && <p>Сначала создайте программы в разделе «Библиотека».</p>}
        <button className="button button--block" disabled={busy} onClick={() => save(data.enabled)}>Сохранить стартовые программы</button>
        <button className="button button--primary button--block" disabled={busy || data.emergencyOff || catalog.length < 3} onClick={() => save(true)}>Сохранить и включить анкету</button>
        {catalog.length < 3 && <p className="small muted">Для включения выберите хотя бы три программы.</p>}
      </details>
    </>}
    {failure && <p role="alert">{failure}</p>}
  </Panel></Section>;
}
