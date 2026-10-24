import React, { useEffect, useState } from 'react';

import { apiMutate } from '../api.js';
import { useData } from '../useData.js';
import { BackButton, ErrorState, Loading, Note, Options, Panel, Row, Rows, Section, Tag } from '../ui.jsx';
import { IconCheck, IconClose, IconPlus, IconTrash } from '../icons.jsx';
import { haptic } from '../telegram.js';
import { ProfileCard, TextArea } from './ProfileParts.jsx';

/**
 * Тренер глазами владельца (FT-548): анкета, тест, заметки по созвону,
 * решения по отбору, проверка профиля перед каталогом и жалобы на него.
 * Открывается из вкладки «Тренеры» панели «Управление» (Trainers.jsx).
 */

export const STAGE = {
  anketa: 'Заполняет анкету',
  anketa_sent: 'Анкета — ждёт вас',
  test: 'Проходит тест',
  test_sent: 'Тест — ждёт вас',
  call: 'Созвон',
};
const NEXT_LABEL = { anketa_sent: 'Пустить к тесту', test_sent: 'Пустить к созвону' };

export function OwnerTrainer({ id, onBack }) {
  const { data, loading, error, reload } = useData('owner.trainer.get', { id }, [id]);
  const [card, setCard] = useState(null);
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState(null);
  const [confirm, setConfirm] = useState('');
  const [rejectNote, setRejectNote] = useState('');
  const [note, setNote] = useState(null);
  const [reviewNote, setReviewNote] = useState('');
  const [docs, setDocs] = useState(false);
  const [hideReason, setHideReason] = useState('');

  useEffect(() => { if (data) { setCard(data); setNote((n) => (n === null ? data.application.ownerNote || '' : n)); setDocs(!!data.profile.docsChecked); } }, [data]);

  if (loading && !card) return <Loading rows={3} />;
  if (error && !card) return <ErrorState error={error} onRetry={reload} />;
  if (!card) return <Loading rows={3} />;

  const act = async (action, params, { ask } = {}) => {
    const key = action + ':' + (params.decision || '');
    if (ask && confirm !== key) { setConfirm(key); haptic(); return; }
    setBusy(key);
    setProblem(null);
    try {
      const next = await apiMutate(action, { id, ...params });
      if (next && next.application) setCard(next);
      else reload();
      setConfirm('');
      haptic('success');
    } catch (err) {
      setProblem(err);
    } finally {
      setBusy('');
    }
  };

  const app = card.application;
  const pending = card.status === 'pending';
  const p = card.profile;

  return (
    <>
      <BackButton label="Тренеры" onClick={onBack} />
      <Section title={card.name || card.email} note={card.email}>
        <Panel pad>
          <p className="small">
            {pending ? STAGE[app.stage] || 'Кандидат' : { active: 'Работает', blocked: 'Отключён', rejected: 'Отказано' }[card.status]}
            {card.status === 'rejected' && app.decisionNote ? ' — ' + app.decisionNote : ''}
          </p>
          {pending && (
            <>
              <div className="trainer-row__actions owner-trainer__actions">
                {NEXT_LABEL[app.stage] && (
                  <button type="button" className="button button--primary" disabled={!!busy} onClick={() => act('owner.trainer.advance', {})}>
                    {NEXT_LABEL[app.stage]}
                  </button>
                )}
                <button
                  type="button"
                  className={'button' + (app.stage === 'call' ? ' button--primary' : '') + (confirm === 'owner.trainer.decide:approve' ? ' button--critical' : '')}
                  disabled={!!busy}
                  onClick={() => act('owner.trainer.decide', { decision: 'approve' }, { ask: app.stage !== 'call' })}
                >
                  {confirm === 'owner.trainer.decide:approve' ? 'Точно открыть кабинет без этапов?' : app.stage === 'call' ? 'Одобрить' : 'Одобрить сразу'}
                </button>
              </div>
              <p className="small muted">
                «Одобрить сразу» — для тех, кого вы знаете лично: кабинет откроется без анкеты, теста и созвона.
              </p>
              <TextArea label="Причина отказа — уйдёт кандидату письмом" rows={2} maxLength={500} value={rejectNote} onChange={setRejectNote} disabled={!!busy} />
              <button
                type="button"
                className={'button' + (confirm === 'owner.trainer.decide:reject' ? ' button--critical' : ' button--ghost')}
                disabled={!!busy}
                onClick={() => act('owner.trainer.decide', { decision: 'reject', note: rejectNote.trim() }, { ask: true })}
              >
                {confirm === 'owner.trainer.decide:reject' ? 'Точно отказать?' : 'Отказать'}
              </button>
            </>
          )}
        </Panel>
      </Section>

      {problem && <Note tone="critical">Не получилось: {problem.message || 'нет связи'}</Note>}

      {(pending || app.anketaAt) && (
        <Section title="Анкета" note={app.anketaAt ? 'Прислана ' + new Date(app.anketaAt).toLocaleDateString('ru-RU') : 'Ещё не прислана — ниже черновик'}>
          <Panel pad>
            <ProfileCard profile={app.profile} formats={card.formats} />
          </Panel>
          <Panel pad>
            <Rows>
              <Row label="Телефон">{app.private.phone ? <a href={'tel:' + app.private.phone.replace(/[^\d+]/g, '')}>{app.private.phone}</a> : '—'}</Row>
              <Row label="Когда звонить">{app.private.callTime || '—'}</Row>
              <Row label="Образование">{app.private.education || '—'}</Row>
              <Row label="Сертификаты">{app.private.certificates || '—'}</Row>
              <Row label="Где работает">{app.private.workplace || '—'}</Row>
              <Row label="Клиентов сейчас">{app.private.clientsNow ?? '—'}</Row>
              <Row label="Почему к нам">{app.private.why || '—'}</Row>
              <Row label="Ссылки">{app.private.links || '—'}</Row>
            </Rows>
          </Panel>
        </Section>
      )}

      {app.test && <TestResult test={app.test} />}

      {pending && (
        <Section title="Заметки" note="Видите только вы: созвон, впечатление, договорённости">
          <Panel pad>
            <TextArea label="Заметка" rows={4} maxLength={3000} value={note || ''} onChange={setNote} disabled={!!busy} />
            <button type="button" className="button button--ghost" disabled={!!busy || note === (app.ownerNote || '')} onClick={() => act('owner.trainer.note', { note })}>
              Сохранить заметку
            </button>
          </Panel>
        </Section>
      )}

      {card.status === 'active' && (
        <Section title="Профиль в каталоге">
          <Panel pad>
            <p className="small">
              {p.hidden ? 'Скрыт' + (p.hiddenReason ? ': ' + p.hiddenReason.toLowerCase() : '')
                : p.review === 'pending' ? 'Ждёт проверки' + (p.published ? ' — в каталоге пока прежний' : '')
                  : p.published ? 'В каталоге' : p.review === 'rejected' ? 'Возвращён на доработку' : 'Не отправлен'}
            </p>
            {(p.review === 'pending' || p.published) && <ProfileCard profile={{ ...(p.review === 'pending' ? p.draft : p.published), docsChecked: docs }} formats={card.formats} />}
            {p.review === 'pending' && (
              <>
                <label className="consent__line">
                  <input type="checkbox" checked={docs} onChange={(e) => setDocs(e.target.checked)} disabled={!!busy} />
                  <span>Документы проверены — в профиле будет отметка</span>
                </label>
                <button type="button" className="button button--primary" disabled={!!busy} onClick={() => act('owner.profile.review', { decision: 'publish', docsChecked: docs })}>
                  Опубликовать
                </button>
                <TextArea label="Что поправить — тренер увидит у себя" rows={2} maxLength={500} value={reviewNote} onChange={setReviewNote} disabled={!!busy} />
                <button type="button" className="button button--ghost" disabled={!!busy || !reviewNote.trim()} onClick={() => act('owner.profile.review', { decision: 'reject', note: reviewNote.trim() })}>
                  Вернуть на доработку
                </button>
              </>
            )}
            {p.hidden
              ? <button type="button" className="button button--ghost" disabled={!!busy} onClick={() => act('owner.profile.hide', { hide: false })}>Вернуть в каталог</button>
              : p.published && (
                <>
                  <TextArea label="Причина, если скрыть" rows={2} maxLength={300} value={hideReason} onChange={setHideReason} disabled={!!busy} />
                  <button type="button" className="button button--ghost" disabled={!!busy || !hideReason.trim()} onClick={() => act('owner.profile.hide', { hide: true, reason: hideReason.trim() })}>
                    Скрыть из каталога
                  </button>
                </>
              )}
          </Panel>
        </Section>
      )}

      {card.reports.length > 0 && (
        <Section title="Жалобы на профиль">
          <Reports reports={card.reports} onChanged={reload} />
        </Section>
      )}
    </>
  );
}

function TestResult({ test }) {
  const percent = test.total ? Math.round((test.score / test.total) * 100) : 100;
  return (
    <Section title="Тест" note={'Пройден ' + new Date(test.at).toLocaleDateString('ru-RU')}>
      <Panel pad>
        <p>
          <strong>{test.score} из {test.total}</strong> верно · {percent}% {' '}
          <Tag tone={test.passed ? 'good' : 'warn'}>{test.passed ? 'порог ' + test.passPercent + '% пройден' : 'ниже порога ' + test.passPercent + '%'}</Tag>
        </p>
      </Panel>
      {test.items.map((q, i) => (
        <Panel pad key={q.id}>
          <p className="candidate__question">{i + 1}. {q.text}</p>
          {q.kind === 'choice' ? (
            <ul className="owner-test__options">
              {q.options.map((o, j) => (
                <li key={j} className={j === q.correct ? 'owner-test__right' : j === q.picked ? 'owner-test__wrong' : ''}>
                  {j === q.picked ? (q.right ? <IconCheck size={14} /> : <IconClose size={14} />) : <span className="owner-test__dot" />} {o}
                </li>
              ))}
            </ul>
          ) : <p className="owner-test__answer">{q.answer}</p>}
        </Panel>
      ))}
    </Section>
  );
}

/** Жалобы: отклонить или подтвердить (подтверждённая скрывает профиль) */
export function Reports({ reports, onChanged, withTrainer = false, onOpen }) {
  const [busy, setBusy] = useState(0);
  const [problem, setProblem] = useState(null);
  const resolve = async (report, decision) => {
    setBusy(report.id);
    setProblem(null);
    try {
      await apiMutate('owner.report.resolve', { id: report.id, decision });
      haptic('success');
      onChanged();
    } catch (err) {
      setProblem(err);
    } finally {
      setBusy(0);
    }
  };
  return (
    <div className="trainer-list">
      {problem && <Note tone="critical">Не получилось: {problem.message || 'нет связи'}</Note>}
      {reports.map((r) => (
        <Panel pad className="trainer-row" key={r.id}>
          <div className="trainer-row__copy">
            <strong>{r.reasonTitle}</strong>
            {withTrainer && <span>На: {onOpen ? <button type="button" className="link-button" onClick={() => onOpen(r.trainerId)}>{r.trainerName}</button> : r.trainerName}</span>}
            {r.text && <span>«{r.text}»</span>}
            <span>
              {r.from === 'client' ? 'От клиента' : 'От тренера'} · {new Date(r.createdAt).toLocaleDateString('ru-RU')}
              {r.status !== 'open' ? (r.status === 'upheld' ? ' · подтверждена' : ' · отклонена') : ''}
            </span>
          </div>
          {r.status === 'open' && (
            <div className="trainer-row__actions">
              <button type="button" className="button button--critical" disabled={!!busy} onClick={() => resolve(r, 'uphold')}>Скрыть профиль</button>
              <button type="button" className="button" disabled={!!busy} onClick={() => resolve(r, 'dismiss')}>Отклонить</button>
            </div>
          )}
        </Panel>
      ))}
    </div>
  );
}

/* ==========================================================================
 * Тест для кандидатов — правит владелец
 * ========================================================================== */

export function TestEditor({ onBack }) {
  const { data, loading, error, reload } = useData('owner.trainer.test', {}, []);
  const [test, setTest] = useState(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => { if (data && !test) setTest(data.test); }, [data]);

  if (loading && !test) return <Loading rows={3} />;
  if (error && !test) return <ErrorState error={error} onRetry={reload} />;
  if (!test) return <Loading rows={3} />;

  const edit = (i, patch) => { setTest((t) => ({ ...t, questions: t.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) })); setSaved(false); };
  const remove = (i) => { setTest((t) => ({ ...t, questions: t.questions.filter((_, j) => j !== i) })); setSaved(false); };
  const add = (kind) => {
    setTest((t) => ({
      ...t,
      questions: [...t.questions, kind === 'open'
        ? { id: 'n' + Date.now(), kind, text: '' }
        : { id: 'n' + Date.now(), kind, text: '', options: ['', ''], correct: 0 }],
    }));
    setSaved(false);
  };

  const save = async () => {
    setBusy(true);
    setProblem('');
    try {
      const next = await apiMutate('owner.trainer.test.save', { test });
      setTest(next.test);
      setSaved(true);
      haptic('success');
    } catch (err) {
      setProblem(err.message || 'Не получилось сохранить.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <BackButton label="Тренеры" onClick={onBack} />
      <Note>
        Кандидат видит вопросы без верных ответов. Счёт — только по вопросам с вариантами; открытые читаете вы.
        Правка теста не меняет того, что уже прошли.
      </Note>
      <Section title="Порог">
        <Panel pad>
          <label className="field">
            <span className="field__label">Верных ответов, %</span>
            <input
              className="field__input"
              inputMode="numeric"
              value={String(test.passPercent)}
              onChange={(e) => { setTest((t) => ({ ...t, passPercent: Number(e.target.value.replace(/\D/g, '') || 0) })); setSaved(false); }}
            />
            <span className="field__hint">Ниже порога — отметка у результата; решаете всё равно вы</span>
          </label>
        </Panel>
      </Section>

      {test.questions.map((q, i) => (
        <Section
          key={q.id}
          title={(i + 1) + '. ' + (q.kind === 'open' ? 'Открытый вопрос' : 'С вариантами')}
          action={<button type="button" className="icon-button" aria-label="Удалить вопрос" onClick={() => remove(i)}><IconTrash size={18} /></button>}
        >
          <Panel pad>
            <TextArea label="Вопрос" rows={2} maxLength={600} value={q.text} onChange={(v) => edit(i, { text: v })} disabled={busy} />
            {q.kind === 'choice' && (
              <>
                <TextArea
                  label="Варианты — каждый с новой строки"
                  rows={4}
                  value={(q.options || []).join('\n')}
                  onChange={(v) => edit(i, { options: v.split('\n').slice(0, 6) })}
                  disabled={busy}
                />
                <span className="field__label">Верный</span>
                <Options
                  items={(q.options || []).map((o, j) => ({ value: j, label: o || 'Вариант ' + (j + 1) }))}
                  value={q.correct}
                  onChange={(v) => edit(i, { correct: v })}
                  label="Верный вариант"
                  disabled={busy}
                />
              </>
            )}
          </Panel>
        </Section>
      ))}

      <div className="survey__actions">
        <button type="button" className="button button--ghost" onClick={() => add('choice')}><IconPlus size={16} /> С вариантами</button>
        <button type="button" className="button button--ghost" onClick={() => add('open')}><IconPlus size={16} /> Открытый</button>
      </div>
      {problem && <Note tone="critical">{problem}</Note>}
      {saved && <Note tone="good">Тест сохранён.</Note>}
      <div className="survey__actions">
        <button type="button" className="button button--primary" disabled={busy} onClick={save}>{busy ? 'Сохраняем…' : 'Сохранить тест'}</button>
        <button type="button" className="button button--ghost" disabled={busy} onClick={() => { setTest(data.defaults); setSaved(false); }}>
          Вопросы по умолчанию
        </button>
      </div>
    </>
  );
}
