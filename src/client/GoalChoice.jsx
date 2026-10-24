import React, { useEffect, useState } from 'react';
import { apiPublic, apiMutate } from '../api.js';
import { Panel, Segmented, Options, Note } from '../ui.jsx';
import { IconAlert, IconCheck } from '../icons.jsx';
import { GOALS, QUESTIONS } from './onboarding-model.js';
import { Program, tidyTitle } from './Onboarding.jsx';

/**
 * Цель и график после анкеты — в «Моих данных» (FT-582).
 *
 * Анкета обещает «поменять можно потом» — здесь это и делается. Только у
 * клиента без тренера: клиенту тренера цель и график ставит тренер (решение
 * 08.10.2026), ему блок только говорит об этом. Без пройденной анкеты блока
 * нет — подбор начинается с самой анкеты.
 *
 * Программа сама не меняется. Если прежняя под новые ответы не подходит,
 * ниже появляются программы под них, и заменяется она только по нажатию.
 */

const KEYS = ['goal', 'experience', 'place', 'days'];
const same = (a, b) => KEYS.every((k) => a[k] === b[k]);
const items = (key) => QUESTIONS[key].options.map(([value, label]) => ({ value, label }));

export default function GoalChoice() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({});
  const [agreed, setAgreed] = useState(false);
  const [picked, setPicked] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  // Ответа ещё нет — заглушка: блок стоит над анкетой «Моих данных» и,
  // вставленный позже, толкал её вниз (аудит 24.10.2026)
  const [failed, setFailed] = useState(false);

  const take = (r) => { setData(r); if (r.answers) setForm(r.answers); setPicked(null); };
  useEffect(() => {
    let alive = true;
    // Старый сервер этого не знает — блок просто не показывается
    apiPublic('client.onboarding.choice').then((r) => { if (alive) take(r); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  if (!data) return failed ? null : <div className="skeleton goal-choice__wait" aria-busy="true" />;
  if (!data.editable) {
    if (data.reason !== 'trainer') return null;
    return (
      <Panel pad className="goal-choice">
        <div className="survey__legend">Цель и тренировки</div>
        <p className="small muted">Цель и сколько раз в неделю заниматься, ставит ваш тренер.</p>
      </Panel>
    );
  }

  const set = (key, value) => { setForm((f) => ({ ...f, [key]: value })); setNote(null); };
  const dirty = !same(form, data.answers);

  const run = async (action, params, done) => {
    setBusy(true);
    setNote(null);
    try {
      const r = await apiMutate(action, { ...params, revision: data.revision });
      take(r);
      setNote({ tone: 'good', text: done(r) });
    } catch (error) {
      setNote({ tone: 'critical', text: error.message || 'Не получилось сохранить' });
    } finally {
      setBusy(false);
    }
  };

  const save = () => run('client.onboarding.edit', { ...form, ...(data.consentNeeded ? { consent: agreed } : {}) },
    (r) => (r.fits ? 'Сохранено.' : 'Сохранено. Программа подобрана под прежние ответы — ниже варианты под новые.'));
  const replace = () => run('client.onboarding.replace', { templateId: picked },
    (r) => 'Программа «' + tidyTitle(r.replaced) + '» — в разделе «Тренировки».');

  return (
    <Panel pad className="goal-choice">
      <div className="survey__legend">
        Цель и тренировки
        <span className="survey__legend-note">по ним подобрана программа и посчитана норма</span>
      </div>

      <div className="survey">
        <div className="survey__group">
          <div className="survey__legend">Цель</div>
          <Options label="Цель" items={GOALS.map((g) => ({ value: g.id, label: g.title }))}
            value={form.goal} onChange={(v) => set('goal', v)} disabled={busy} />
        </div>
        {['days', 'place', 'experience'].map((key) => (
          <div className="survey__group" key={key}>
            <div className="survey__legend">{QUESTIONS[key].eyebrow}</div>
            <Segmented label={QUESTIONS[key].title} items={items(key)} wrap
              value={form[key]} onChange={(v) => set(key, v)} disabled={busy} />
          </div>
        ))}
      </div>

      {data.consentNeeded && dirty && (
        <label className="ob-consent">
          <input type="checkbox" checked={agreed} disabled={busy} onChange={(e) => setAgreed(e.target.checked)} />
          <span>Даю <a href="https://app.fitness100.ru/onboarding-consent.html" target="_blank" rel="noopener noreferrer">отдельное согласие</a> на сохранение ответов для подбора программы.</span>
        </label>
      )}

      {dirty && (
        <div className="survey__actions">
          <button className="button button--primary" onClick={save} disabled={busy || (data.consentNeeded && !agreed)}>
            {busy ? 'Сохраняю…' : 'Сохранить'}
          </button>
          <button className="button" onClick={() => { setForm(data.answers); setNote(null); }} disabled={busy}>Отменить</button>
        </div>
      )}

      {note && <Note tone={note.tone} icon={note.tone === 'good' ? IconCheck : IconAlert}>{note.text}</Note>}

      {!dirty && !data.fits && (data.programs.length ? (
        <div className="goal-choice__programs">
          <p className="small">
            {data.program ? <>Сейчас у вас «{tidyTitle(data.program)}» — она подобрана под прежние ответы. </> : null}
            Под новые подходят:
          </p>
          <div className="ob-programs" role="radiogroup" aria-label="Программы под новые ответы">
            {data.programs.map((p, i) => <Program key={p.id} p={p} i={i} best={i === 0} on={picked === p.id} onPick={() => setPicked(p.id)} />)}
          </div>
          {picked && <p className="small muted">Программа этого месяца заменится на новую. Прошлые тренировки и веса останутся в журнале.</p>}
          <button className="button button--primary button--block" onClick={replace} disabled={busy || !picked}>
            {busy ? 'Минуту…' : picked ? 'Заменить программу' : 'Выберите программу'}
          </button>
        </div>
      ) : (
        <p className="small muted">Под эти ответы готовой программы пока нет — занимайтесь по прежней.</p>
      ))}
    </Panel>
  );
}
