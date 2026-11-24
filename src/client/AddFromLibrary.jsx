import React, { useState } from 'react';
import { useData } from '../useData.js';
import { apiPublic } from '../api.js';
import { Sheet, Loading, ErrorState, Segmented } from '../ui.jsx';
import { IconCheck } from '../icons.jsx';
import { blankExercise } from '../trainer/PlanInline.jsx';
import { haptic } from '../telegram.js';

/**
 * «Добавить из библиотеки» (внеплановая тренировка): лист с шаблонами
 * тренировок тренера. Выбранный шаблон уходит наверх готовой тренировкой;
 * закрыть лист или показать ошибку сохранения — дело вызывающего.
 */
export default function AddFromLibrary({ onClose, onPick, days = [], error = '' }) {
  const templates = useData('library.templates', { kind: 'workout' }, []);
  const [loading, setLoading] = useState('');
  const [failure, setFailure] = useState('');
  const [chosen, setChosen] = useState(null);
  const [day, setDay] = useState(0);
  const list = templates.data ? templates.data.templates : [];
  const busy = !!loading;

  // Шаблон выбран — спрашиваем день; 0 — следующей по порядку (первый свободный)
  const pick = async (t) => {
    if (busy) return;
    setLoading(t.id);
    setFailure('');
    haptic();
    try {
      const full = await apiPublic('library.template.get', { id: t.id });
      const block = full && full.blocks && full.blocks[0];
      if (!block) throw new Error('В шаблоне нет упражнений.');
      setChosen({ title: block.title || t.title, sourceId: t.id, exercises: block.exercises.map((x) => ({ ...blankExercise(), ...x })) });
    } catch (e) {
      setFailure((e && e.message) || 'Не получилось открыть шаблон. Повторите.');
    } finally {
      setLoading('');
    }
  };
  const add = async () => {
    if (busy) return;
    setLoading('add');
    setFailure('');
    try {
      await onPick(chosen, day || null);
    } catch (e) {
      setFailure((e && e.message) || 'Не получилось добавить. Повторите.');
    } finally {
      setLoading('');
    }
  };

  if (chosen) {
    return (
      <Sheet title={chosen.title} onClose={onClose} locked={busy}>
        <p className="small muted">Когда провести?</p>
        <Segmented
          label="День недели"
          wrap
          value={String(day)}
          onChange={(v) => setDay(Number(v))}
          items={[{ value: '0', label: 'Следующей по порядку' }, ...days.map((d) => ({ value: String(d.day), label: d.label }))]}
          disabled={busy}
        />
        {(failure || error) && <p className="small form__error" role="alert">{failure || error}</p>}
        <button type="button" className="button button--primary button--block" disabled={busy} onClick={add}>{busy ? 'Добавляю…' : 'Добавить'}</button>
      </Sheet>
    );
  }

  return (
    <Sheet title="Добавить из библиотеки" onClose={onClose} locked={busy} done="Закрыть" onDone={onClose}>
      <p className="small muted">Тренировка встанет на этой неделе и не войдёт в круг программы.</p>
      {templates.loading && <Loading lead={false} rows={3} />}
      {templates.error && !templates.loading && <ErrorState error={templates.error} onRetry={templates.reload} />}
      {!templates.loading && !templates.error && !list.length && <p className="small muted">Шаблонов тренировок нет — их заводят в разделе «Библиотека».</p>}
      {list.map((t) => (
        <button type="button" key={t.id} className="item" disabled={busy} onClick={() => pick(t)}>
          <div className="item__top"><span className="item__name">{t.title}</span>{loading === t.id && <IconCheck size={16} />}</div>
          <div className="item__meta"><span>{t.exercises} упр.</span></div>
        </button>
      ))}
      {(failure || error) && <p className="small form__error" role="alert">{failure || error}</p>}
    </Sheet>
  );
}
