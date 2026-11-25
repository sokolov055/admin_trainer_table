import React, { Fragment, useState } from 'react';
import { useData } from '../useData.js';
import { apiMutate } from '../api.js';
import { haptic } from '../telegram.js';
import { BackButton, Sheet, Loading, ErrorState, Note } from '../ui.jsx';
import { IconSend, IconPen, IconMore, IconCopy, IconTrash, IconUsers, IconChevron, IconHome, IconBench, IconAlert } from '../icons.jsx';
import { muscleLoad } from './program-view-model.js';
import { PLACES } from '../client/programs-model.js';
import { goalLook } from './program-list-model.js';
import { GoalIcon } from './ProgramList.jsx';
import { Muscles, ExerciseRow, Toggle } from './ProgramView.jsx';
import { exercisesOf, setsOf, startsSuperset } from './workout-view-model.js';
import './programs-lib.css';

/**
 * Экран тренировки «Библиотеки» (этап 2 макета trainirovki-library-v2,
 * 25.11.2026): герой цвета цели с цифрами, «Общая для тренеров», «Стоит в
 * программах», нагрузка на мышцы, упражнения с суперсетом. Внизу —
 * «Назначить клиенту», ✎ (у чужих — «К себе») и «⋯».
 */

function Hero({ t, exercises, sets, minutes, programs }) {
  const look = goalLook(t.goal);
  const stat = (value, label) => <div><b>{value}</b><span>{label}</span></div>;
  return (
    <div className={'plib-hero plib-goal--' + look.key}>
      <span className="plib-hero__big" aria-hidden="true"><GoalIcon goal={t.goal} size={130} /></span>
      {t.goal && <div className="plib-hero__goal">{t.goal}</div>}
      <h2 className="plib-hero__title">{t.title}</h2>
      {(PLACES[t.place] || t.mine) && (
        <div className="plib-hero__pills">
          {PLACES[t.place] && <span className="plib-pill">{t.place === 'home' ? <IconHome size={13} /> : <IconBench size={13} />}{PLACES[t.place]}</span>}
          {t.mine && <span className="plib-pill"><IconUsers size={13} />{t.isPublic ? 'общая' : 'только моя'}</span>}
        </div>
      )}
      <div className="plib-hero__stats">
        {stat(exercises.length || '—', 'упражнений')}
        {stat(sets || '—', 'подходов')}
        {stat(minutes ? (t.minutesAuto ? '≈' : '') + minutes : '—', 'минут')}
        {stat(programs.length, 'в програм.')}
      </div>
      {!t.mine && <div className="plib-hero__author">автор: {t.author}</div>}
    </div>
  );
}

/** «⋯»: копия и удаление — как у программы; удаление — с «Вернуть» в списке */
function MoreSheet({ busy, onClose, onCopy, onDelete }) {
  return (
    <Sheet title="Тренировка" onClose={onClose} locked={busy}>
      <div className="plib-menu">
        <button type="button" className="plib-menu__item" disabled={busy} onClick={onCopy}>
          <span className="plib-menu__icon"><IconCopy size={20} /></span>
          <span><b>Сделать копию</b><small>Копия рядом — для похожей тренировки</small></span>
        </button>
        <button type="button" className="plib-menu__item plib-menu__item--danger" disabled={busy} onClick={onDelete}>
          <span className="plib-menu__icon"><IconTrash size={20} /></span>
          <span><b>Удалить</b><small>Можно будет вернуть несколько секунд</small></span>
        </button>
      </div>
    </Sheet>
  );
}

export default function WorkoutView({ id, onBack, onEdit, onAssign, onCopied, onDeleted, onOpenProgram }) {
  const { loading, data, error, reload } = useData('library.template.get', { id }, [id]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const [flags, setFlags] = useState(null); // переключили на экране — до ответа сервера
  const [sheet, setSheet] = useState(null); // 'more'

  if (loading) return <><BackButton label="Тренировки" onClick={onBack} /><Loading rows={3} /></>;
  if (error) return <><BackButton label="Тренировки" onClick={onBack} /><ErrorState error={error} onRetry={reload} /></>;

  const t = { ...data, ...(flags || {}) };
  const blocks = t.blocks || [];
  const exercises = exercisesOf(blocks);
  const sets = setsOf(exercises);
  const programs = t.inPrograms || [];
  const minutes = t.minutes;

  const act = async (fn) => {
    setBusy(true);
    setFailure(null);
    try { await fn(); } catch (err) { setFailure(err); } finally { setBusy(false); }
  };

  const setFlag = (patch) => {
    const before = { isPublic: t.isPublic };
    setFlags({ ...before, ...patch });
    setFailure(null);
    apiMutate('library.template.flags', { id: t.id, ...patch })
      .then((r) => setFlags({ isPublic: r.isPublic }))
      .catch((err) => { setFlags(before); setFailure(err); });
  };

  const copy = () => act(async () => {
    const made = await apiMutate('library.template.copy', { id: t.id });
    haptic('success');
    setSheet(null);
    onCopied(made);
  });

  return (
    <div className="plib plib-view">
      <BackButton label="Тренировки" onClick={onBack} />
      <Hero t={t} exercises={exercises} sets={sets} minutes={minutes} programs={programs} />

      {t.mine && (
        <div className="plib-togs">
          <Toggle on={!!t.isPublic} icon={<IconUsers size={18} />} hint="скопируют с вашим именем" onChange={(v) => setFlag({ isPublic: v })}>Общая для тренеров</Toggle>
        </div>
      )}
      {failure && <Note tone="critical" icon={IconAlert}>{failure.message}</Note>}
      {t.description && <p className="plib-desc">{t.description}</p>}

      {programs.length > 0 && (
        <section className="plib-box" aria-label="Стоит в программах">
          <div className="plib-box__head">Стоит в программах<span>{programs.length} ›</span></div>
          <div className="plib-menu">
            {programs.map((p) => (
              <button key={p.id} type="button" className="plib-menu__item" disabled={!onOpenProgram} onClick={() => { haptic(); onOpenProgram(p); }}>
                <span className={'plib-cover plib-cover--sm plib-goal--' + goalLook(p.goal).key}><GoalIcon goal={p.goal} size={18} /></span>
                <span className="plib-grow"><b>{p.title}</b></span>
                <IconChevron size={18} className="plib-go" />
              </button>
            ))}
          </div>
          <p className="plib-gaps">Правка этой тренировки спросит, обновить ли её и там.</p>
        </section>
      )}

      <Muscles blocks={[{ exercises }]} caption={null} />

      {exercises.length > 0 && (
        <section className="plib-box" aria-label="Упражнения">
          <div className="plib-box__head">Упражнения<span>{[exercises.length, minutes ? (t.minutesAuto ? '≈ ' : '') + minutes + ' мин' : ''].filter(Boolean).join(' · ')}</span></div>
          <ol className="plib-exs">
            {exercises.map((e, i) => (
              <Fragment key={i}>
                {startsSuperset(exercises, i) && <li className="plib-sslabel">Суперсет</li>}
                <ExerciseRow e={e} />
              </Fragment>
            ))}
          </ol>
        </section>
      )}

      <div className="plib-dock">
        <button type="button" className="plib-dock__main" disabled={busy} onClick={() => { haptic(); onAssign(t); }}>
          <IconSend size={18} />Назначить клиенту
        </button>
        {t.mine
          ? <button type="button" className="plib-dock__ib" aria-label="Изменить" disabled={busy} onClick={() => { haptic(); onEdit(t); }}><IconPen size={20} /></button>
          : <button type="button" className="plib-dock__alt" aria-label="Скопировать к себе" disabled={busy} onClick={copy}><IconCopy size={18} />К себе</button>}
        {t.mine && <button type="button" className="plib-dock__ib" aria-label="Ещё" disabled={busy} onClick={() => { haptic(); setSheet('more'); }}><IconMore size={20} /></button>}
      </div>

      {sheet === 'more' && (
        <MoreSheet busy={busy} onClose={() => setSheet(null)} onCopy={copy}
          onDelete={() => { setSheet(null); onDeleted(t); }} />
      )}
    </div>
  );
}
