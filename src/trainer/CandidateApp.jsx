import React, { useEffect, useState } from 'react';

import { apiFresh, apiMutate, clearApiCache } from '../api.js';
import { ErrorState, Field, Loading, Note, Options, Panel, Section, SignOut } from '../ui.jsx';
import { IconCheck, IconPhone, IconRefresh } from '../icons.jsx';
import { haptic } from '../telegram.js';
import { EMPTY_PROFILE, ProfileFields, TextArea } from './ProfileParts.jsx';

/**
 * Кандидат в тренеры (FT-548): кабинета ещё нет, есть отбор.
 *
 * Анкета → тест → созвон, и каждый следующий этап открывает владелец
 * сервиса (решение 17.10.2026). Кандидат здесь видит, где он, и делает то,
 * что от него ждут сейчас. Одобрили — тот же вход открывает кабинет:
 * «Обновить» перечитывает «кто я», и App.jsx показывает панель тренера.
 *
 * Анкета — две части: профиль (его увидят клиенты, когда профиль пройдёт
 * проверку) и закрытая (телефон, образование — только владельцу).
 */

const STEPS = [
  { key: 'anketa', label: 'Анкета' },
  { key: 'test', label: 'Тест' },
  { key: 'call', label: 'Созвон' },
  { key: 'done', label: 'Решение' },
];
const STEP_OF = { anketa: 0, anketa_sent: 0, test: 1, test_sent: 1, call: 2 };

const EMPTY_PRIVATE = {
  phone: '', callTime: '', education: '', certificates: '', workplace: '', clientsNow: null, why: '', links: '',
};

export default function CandidateApp({ me, onApproved }) {
  const [state, setState] = useState({ loading: true, data: null, error: null });

  const load = () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    apiFresh('candidate.get', {})
      .then(({ data }) => setState({ loading: false, data, error: null }))
      .catch((error) => {
        // Решение уже принято — роль сменилась: перечитать «кто я»
        if (error && (error.code === 401 || error.code === 403)) { clearApiCache(); onApproved(); return; }
        setState({ loading: false, data: null, error });
      });
  };
  useEffect(load, []);

  const refresh = () => { clearApiCache(); onApproved(); load(); };

  return (
    <div className="app">
      <main className="app__body candidate">
        <header className="candidate__head">
          <h1 className="login__title">Отбор тренеров</h1>
          <p className="small muted">{me.email}</p>
        </header>

        {state.loading && !state.data && <Loading rows={3} />}
        {state.error && <ErrorState error={state.error} onRetry={load} />}
        {state.data && (
          <>
            <Progress stage={state.data.stage} />
            <Stage data={state.data} onChange={(data) => setState({ loading: false, data, error: null })} onRefresh={refresh} />
          </>
        )}

        <div className="candidate__foot">
          <SignOut />
        </div>
      </main>
    </div>
  );
}

function Progress({ stage }) {
  const current = STEP_OF[stage] ?? 0;
  return (
    <ol className="candidate__steps" aria-label="Этапы отбора">
      {STEPS.map((s, i) => (
        <li
          key={s.key}
          className={'candidate__step' + (i < current ? ' candidate__step--done' : i === current ? ' candidate__step--now' : '')}
          aria-current={i === current ? 'step' : undefined}
        >
          <span className="candidate__dot">{i < current ? <IconCheck size={12} /> : i + 1}</span>
          <span>{s.label}</span>
        </li>
      ))}
    </ol>
  );
}

function Stage({ data, onChange, onRefresh }) {
  if (data.stage === 'anketa') return <Anketa data={data} onChange={onChange} />;
  if (data.stage === 'test') return <Test data={data} onChange={onChange} />;

  const waiting = {
    anketa_sent: 'Анкета у нас. Когда посмотрим, пришлём письмо — дальше будет короткий тест.',
    test_sent: 'Тест у нас. Когда посмотрим ответы, пришлём письмо о следующем шаге.',
    call: `Следующий шаг — созвон. Позвоним по номеру ${data.private.phone || 'из анкеты'}${data.private.callTime ? ' — ' + data.private.callTime : ''}.`,
  }[data.stage] || 'Заявка у нас. Ответим письмом.';

  return (
    <Section title="Сейчас">
      <Panel pad>
        <p className="candidate__wait">
          {data.stage === 'call' && <IconPhone size={18} />} {waiting}
        </p>
        <p className="small muted">
          Кабинет тренера откроется после одобрения — письмо придёт на почту. Войти можно будет этим же адресом.
        </p>
        <button type="button" className="button button--ghost" onClick={onRefresh}>
          <IconRefresh size={16} /> Обновить
        </button>
      </Panel>
    </Section>
  );
}

/* ==========================================================================
 * Анкета
 * ========================================================================== */

function Anketa({ data, onChange }) {
  const [profile, setProfile] = useState({ ...EMPTY_PROFILE, ...data.profile });
  const [priv, setPriv] = useState({ ...EMPTY_PRIVATE, ...data.private });
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState('');
  const [saved, setSaved] = useState(false);
  const setP = (key) => (v) => { setPriv((p) => ({ ...p, [key]: v })); setSaved(false); };

  const run = async (action) => {
    setBusy(action);
    setProblem('');
    try {
      const next = await apiMutate(action, { profile, private: priv });
      haptic('success');
      if (action === 'candidate.anketa.save') setSaved(true);
      else { window.scrollTo(0, 0); onChange(next); }
    } catch (error) {
      setProblem(error.message || 'Не получилось сохранить. Попробуйте ещё раз.');
      haptic('error');
    } finally {
      setBusy('');
    }
  };

  return (
    <>
      <Section title="Профиль" note="Его увидят клиенты, когда вы станете тренером и профиль пройдёт проверку">
        <Panel pad>
          <ProfileFields value={profile} onChange={(p) => { setProfile(p); setSaved(false); }} dicts={data} disabled={!!busy} />
        </Panel>
      </Section>

      <Section title="Только для нас" note="Это видит только команда Fit Track — в профиль не попадёт">
        <Panel pad>
          <div className="profile-form">
            <Field label="Телефон для созвона" inputMode="tel" value={priv.phone} onChange={setP('phone')} disabled={!!busy} />
            <Field label="Когда удобно созвониться" hint="Например: будни после 18:00" inputMode="text" value={priv.callTime} onChange={setP('callTime')} disabled={!!busy} />
            <TextArea label="Образование" rows={2} maxLength={1000} value={priv.education} onChange={setP('education')} disabled={!!busy} />
            <TextArea label="Сертификаты и курсы" hint="Название, кто выдал, год" rows={3} maxLength={1000} value={priv.certificates} onChange={setP('certificates')} disabled={!!busy} />
            <Field label="Где работаете сейчас" inputMode="text" value={priv.workplace} onChange={setP('workplace')} disabled={!!busy} />
            <Field
              label="Сколько клиентов ведёте сейчас"
              value={priv.clientsNow === null || priv.clientsNow === undefined ? '' : String(priv.clientsNow)}
              onChange={(v) => setP('clientsNow')(v.replace(/\D/g, '') === '' ? null : Number(v.replace(/\D/g, '')))}
              disabled={!!busy}
            />
            <TextArea label="Почему хотите вести клиентов в Fit Track" rows={3} maxLength={1000} value={priv.why} onChange={setP('why')} disabled={!!busy} />
            <Field label="Ссылки на соцсети или сайт" hint="Необязательно" inputMode="url" value={priv.links} onChange={setP('links')} disabled={!!busy} />
          </div>
        </Panel>
      </Section>

      {problem && <Note tone="critical">{problem}</Note>}
      {saved && <Note tone="good">Черновик сохранён — можно вернуться позже.</Note>}
      <div className="survey__actions candidate__actions">
        <button type="button" className="button button--primary" disabled={!!busy} onClick={() => run('candidate.anketa.submit')}>
          {busy === 'candidate.anketa.submit' ? 'Отправляем…' : 'Отправить анкету'}
        </button>
        <button type="button" className="button button--ghost" disabled={!!busy} onClick={() => run('candidate.anketa.save')}>
          {busy === 'candidate.anketa.save' ? 'Сохраняем…' : 'Сохранить черновик'}
        </button>
      </div>
    </>
  );
}

/* ==========================================================================
 * Тест
 * ========================================================================== */

function Test({ data, onChange }) {
  const questions = (data.test && data.test.questions) || [];
  const [answers, setAnswers] = useState({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const set = (id) => (v) => setAnswers((a) => ({ ...a, [id]: v }));
  const done = questions.every((q) => (q.kind === 'open' ? String(answers[q.id] || '').trim().length >= 20 : answers[q.id] !== undefined));

  const submit = async () => {
    setBusy(true);
    setProblem('');
    try {
      const next = await apiMutate('candidate.test.submit', { answers });
      haptic('success');
      window.scrollTo(0, 0);
      onChange(next);
    } catch (error) {
      setProblem(error.message || 'Не получилось отправить. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Note>
        Вопросов: {questions.length}. Ответы отправляются один раз — проверьте их перед отправкой.
        На открытые вопросы отвечайте своими словами, как объяснили бы клиенту.
      </Note>
      {questions.map((q, i) => (
        <Section key={q.id} title={'Вопрос ' + (i + 1)}>
          <Panel pad>
            <p className="candidate__question">{q.text}</p>
            {q.kind === 'open'
              ? <TextArea label="Ваш ответ" rows={5} maxLength={3000} value={answers[q.id] || ''} onChange={set(q.id)} disabled={busy} />
              : <Options
                  items={q.options.map((label, value) => ({ value, label }))}
                  value={answers[q.id]}
                  onChange={set(q.id)}
                  label={'Вопрос ' + (i + 1)}
                  disabled={busy}
                />}
          </Panel>
        </Section>
      ))}
      {problem && <Note tone="critical">{problem}</Note>}
      <div className="survey__actions candidate__actions">
        <button type="button" className="button button--primary" disabled={busy || !done} onClick={submit}>
          {busy ? 'Отправляем…' : done ? 'Отправить ответы' : 'Ответьте на все вопросы'}
        </button>
      </div>
    </>
  );
}
