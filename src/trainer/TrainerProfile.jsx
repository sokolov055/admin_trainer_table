import React, { useEffect, useState } from 'react';

import { apiMutate } from '../api.js';
import { useData } from '../useData.js';
import { ErrorState, Loading, Note, Panel, Section } from '../ui.jsx';
import { haptic } from '../telegram.js';
import { EMPTY_PROFILE, ProfileCard, ProfileFields, docLink } from './ProfileParts.jsx';

/**
 * Мой профиль — то, что клиенты увидят в каталоге (FT-548).
 *
 * Тренер правит черновик; в каталог профиль попадает после проверки
 * владельцем. Опубликованный профиль после правки снова уходит на
 * проверку, а клиенты до решения видят прежний (lib/trainer-profiles.js).
 * Отправка — с отдельным согласием на публикацию (ст. 10.1 152-ФЗ);
 * «Убрать из каталога» — его отзыв, профиль исчезает сразу.
 */

const REVIEW = {
  pending: { tone: 'info', text: 'Профиль на проверке. Ответ придёт письмом.' },
  rejected: { tone: 'warn', text: 'Профиль вернули на доработку.' },
};

export default function TrainerProfile() {
  const { data, loading, error, reload } = useData('trainer.profile.get', {}, []);
  const [draft, setDraft] = useState(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState('');
  const [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState(false);
  const [askWithdraw, setAskWithdraw] = useState(false);

  useEffect(() => { if (data && !draft) setDraft({ ...EMPTY_PROFILE, ...data.draft }); }, [data]);

  if (loading && !data) return <Loading rows={3} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!draft) return <Loading rows={3} />;

  const run = async (action, params = {}) => {
    setBusy(action);
    setProblem('');
    setSaved(false);
    try {
      const next = await apiMutate(action, params);
      setDraft({ ...EMPTY_PROFILE, ...next.draft });
      haptic('success');
      if (action === 'trainer.profile.save') setSaved(true);
      if (action === 'trainer.profile.submit') setConsent(false);
      setAskWithdraw(false);
      reload();
    } catch (err) {
      setProblem(err.message || 'Не получилось. Попробуйте ещё раз.');
      haptic('error');
    } finally {
      setBusy('');
    }
  };

  // Правки на экране, ещё не сохранённые
  const dirty = JSON.stringify(draft) !== JSON.stringify({ ...EMPTY_PROFILE, ...data.draft });

  const status = data.hidden
    ? { tone: 'critical', text: 'Профиль скрыт из каталога' + (data.hiddenReason ? ': ' + data.hiddenReason.toLowerCase() : '') + '. Напишите в поддержку, если это ошибка.' }
    : REVIEW[data.review]
      || (data.published
        ? { tone: 'good', text: data.changed ? 'Профиль в каталоге. Изменения увидят клиенты после проверки — отправьте их.' : 'Профиль в каталоге — клиенты видят его.' }
        : { tone: 'info', text: 'Профиля в каталоге пока нет. Заполните и отправьте на проверку.' });

  return (
    <>
      <Note tone={status.tone}>
        {status.text}
        {data.review === 'rejected' && data.reviewNote && <><br />Что поправить: {data.reviewNote}</>}
      </Note>

      <Section
        title="Профиль"
        note={preview ? 'Так его увидят клиенты' : 'Контактов здесь нет — клиенты напишут вам через приложение'}
        action={<button type="button" className="button button--ghost" onClick={() => setPreview((v) => !v)}>{preview ? 'Править' : 'Просмотр'}</button>}
      >
        <Panel pad>
          {preview
            ? <ProfileCard profile={{ ...draft, docsChecked: data.docsChecked }} formats={data.formats} />
            : <ProfileFields value={draft} onChange={(p) => { setDraft(p); setSaved(false); }} dicts={data} disabled={!!busy} />}
        </Panel>
      </Section>

      {problem && <Note tone="critical">{problem}</Note>}
      {saved && <Note tone="good">Сохранено. Клиенты увидят изменения после проверки.</Note>}

      <div className="survey__actions">
        <button type="button" className="button button--ghost" disabled={!!busy} onClick={() => run('trainer.profile.save', { profile: draft })}>
          {busy === 'trainer.profile.save' ? 'Сохраняем…' : 'Сохранить'}
        </button>
      </div>

      {/* Отправлять есть что: профиля в каталоге нет или он изменён */}
      {data.review !== 'pending' && !data.hidden && (!data.published || data.changed || dirty) && (
        <Section title="В каталог">
          <Panel pad>
            <label className="consent__line">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={!!busy} />
              <span>
                Даю {docLink('public-profile-consent.html', 'согласие на публикацию')} профиля — имени, фото,
                города, залов, опыта и описания — в каталоге Fit Track
              </span>
            </label>
            <p className="small muted">
              Согласие можно отозвать в любой момент кнопкой «Убрать из каталога» — профиль исчезнет сразу.
            </p>
            <button
              type="button"
              className="button button--primary button--block"
              disabled={!!busy || !consent}
              onClick={() => run('trainer.profile.submit', { profile: draft, consent: true })}
            >
              {busy === 'trainer.profile.submit' ? 'Отправляем…' : 'Отправить на проверку'}
            </button>
          </Panel>
        </Section>
      )}

      {(data.published || data.review === 'pending') && (
        <div className="survey__actions">
          <button
            type="button"
            className={'button' + (askWithdraw ? ' button--critical' : ' button--ghost')}
            disabled={!!busy}
            onClick={() => (askWithdraw ? run('trainer.profile.withdraw') : setAskWithdraw(true))}
          >
            {askWithdraw ? 'Точно убрать из каталога?' : 'Убрать из каталога'}
          </button>
        </div>
      )}
    </>
  );
}
