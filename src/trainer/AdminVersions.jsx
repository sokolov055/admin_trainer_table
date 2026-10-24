import React, { useEffect, useState } from 'react';

import { apiMutate } from '../api.js';
import { useData } from '../useData.js';
import { ErrorState, Field, Loading, Note, Panel, Row, Rows, Section, Tag, formatWhen } from '../ui.jsx';
import { haptic } from '../telegram.js';
import { versionsForm, versionsPayload } from './admin-model.js';

/**
 * «Управление → Версии» (22.10.2026): последние версии iPhone-приложения.
 * По ним старая версия показывает «Вышла новая версия» со ссылкой
 * (app-update.js): из App Store — на App Store, из TestFlight — на TestFlight.
 *
 * Обычно здесь ничего делать не нужно: App Store сервер спрашивает у Apple
 * сам раз в 3 часа, о сборке в TestFlight сообщает сама сборка (ios.yml).
 * Экран — посмотреть, что записано, и поправить руками, если не так.
 */

const SOURCE = {
  lookup: 'узнали у Apple',
  build: 'сообщила сборка',
  manual: 'вписано вручную',
};

export default function AdminVersions() {
  const { data, loading, error, reload } = useData('owner.versions', {}, []);
  const [state, setState] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => { if (data) { setState(data); setForm(versionsForm(data)); } }, [data]);

  if (loading || (data && !form)) return <Loading rows={4} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const set = (channel, field) => (value) => {
    setSaved(false);
    setForm((f) => ({ ...f, [channel]: { ...f[channel], [field]: value } }));
  };

  const run = async (action, params) => {
    setBusy(true); setProblem(null); setSaved(false);
    try {
      const next = await apiMutate(action, params);
      haptic('success');
      setState(next);
      setForm(versionsForm(next));
      setSaved(true);
    } catch (err) {
      setProblem(err);
    } finally {
      setBusy(false);
    }
  };

  const { appStore, testflight, lookup } = state;
  const meta = (r) => [SOURCE[r.source] || '', r.at ? formatWhen(r.at) : ''].filter(Boolean).join(' · ');

  return (
    <>
      <Note tone="info">
        Старая версия на iPhone показывает «Вышла новая версия» со ссылкой: кто ставил из App Store — на App Store, из TestFlight — на TestFlight. App Store сервер проверяет сам раз в 3 часа, новую сборку TestFlight — показывает через 45 минут после загрузки.
      </Note>
      {problem && <ErrorState error={problem} onRetry={() => setProblem(null)} />}

      <Section title="App Store" note={lookup ? (lookup.ok ? `Apple ответила: ${lookup.version} · ${formatWhen(lookup.at)}` : `Apple не ответила (${lookup.error}) · ${formatWhen(lookup.at)}`) : 'Apple ещё не спрашивали'}>
        <Panel pad className="admin-version">
          <div className="admin-flag__head">
            <div className="trainer-row__copy">
              <strong>{appStore.version} ({appStore.build})</strong>
              <span>{meta(appStore)}</span>
            </div>
          </div>
          <div className="admin-version__fields">
            <Field label="Версия" inputMode="decimal" value={form.appStore.version} onChange={set('appStore', 'version')} disabled={busy} />
            <Field label="Сборка" inputMode="numeric" value={form.appStore.build} onChange={set('appStore', 'build')} disabled={busy} />
            <Field label="Ссылка" inputMode="url" value={form.appStore.url} onChange={set('appStore', 'url')} disabled={busy} />
          </div>
        </Panel>
      </Section>

      <Section title="TestFlight">
        <Panel pad className="admin-version">
          <div className="admin-flag__head">
            <div className="trainer-row__copy">
              <strong>{testflight.version} ({testflight.build})</strong>
              <span>{meta(testflight)}</span>
            </div>
            {!testflight.visible && <Tag tone="warn">с {formatWhen(testflight.visibleAt)}</Tag>}
          </div>
          <div className="admin-version__fields">
            <Field label="Версия" inputMode="decimal" value={form.testflight.version} onChange={set('testflight', 'version')} disabled={busy} />
            <Field label="Сборка" inputMode="numeric" value={form.testflight.build} onChange={set('testflight', 'build')} disabled={busy} />
            <Field label="Ссылка" inputMode="url" value={form.testflight.url} onChange={set('testflight', 'url')} disabled={busy} />
          </div>
        </Panel>
      </Section>

      <div className="trainer-row__actions admin-version__actions">
        <button type="button" className="button" disabled={busy} onClick={() => run('owner.versions.check', {})}>Спросить App Store</button>
        <button type="button" className="button button--primary" disabled={busy} onClick={() => run('owner.versions.save', versionsPayload(form))}>
          {saved ? 'Сохранено' : 'Сохранить'}
        </button>
      </div>

      {state.builds.length > 0 && (
        <Section title="Загруженные сборки">
          <Rows>
            {state.builds.map((b) => (
              <Row key={b.build} label={`сборка ${b.build}`}>{b.version}</Row>
            ))}
          </Rows>
        </Section>
      )}

      {state.history.length > 0 && (
        <Section title="Последние изменения">
          <Rows>
            {state.history.map((h, i) => (
              <Row key={i} label={formatWhen(h.at)}>{h.text}</Row>
            ))}
          </Rows>
        </Section>
      )}
    </>
  );
}
