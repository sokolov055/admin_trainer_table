import React, { useState } from 'react';
import { apiMutate } from '../api.js';
import { Panel, Note } from '../ui.jsx';
import { IconAlert } from '../icons.jsx';

/**
 * Редактор программы месяца.
 *
 * Последнее, ради чего тренер открывал таблицу на телефоне. Экран сделан
 * под эту ситуацию: он в зале, между клиентами, и ему нужно поменять вес
 * в двух строках или дописать упражнение — а не «составить программу».
 * Поэтому здесь нет ни конструктора, ни шаблонов, ни перетаскивания:
 * список, поля и кнопка «Сохранить».
 *
 * Сохраняется месяц целиком, одним снимком. Так удаление становится
 * настоящим: дописывание поверх прежнего оставило бы убранное упражнение
 * жить под старым номером.
 *
 * Суперсет отмечается у ВЕРХНЕГО упражнения пары — «делается вместе со
 * следующим». Это то, как о нём думают: не «мы с ним в группе», а «после
 * этого сразу следующее, без отдыха».
 */

const blank = () => ({ name: '', weight: '', prevWeight: '', sets: '', reps: '', rpe: '', supersetGroup: '' });

export default function PlanEditor({ clientRow, month, blocks, onSaved, onCancel }) {
  const [draft, setDraft] = useState(() => (blocks.length
    ? blocks.map((b) => ({ title: b.title, exercises: b.exercises.map((e) => ({ ...blank(), ...e })) }))
    : [{ title: 'Тренировка № 1', exercises: [blank()] }]));

  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);

  const change = (fn) => {
    setDraft((prev) => fn(prev.map((b) => ({ ...b, exercises: b.exercises.map((e) => ({ ...e })) }))));
    setFailure(null);
  };

  const setExercise = (bi, ei, field, value) => change((next) => {
    next[bi].exercises[ei][field] = value;
    return next;
  });

  /**
   * Пометка «вместе со следующим» живёт на паре, а не на упражнении:
   * снимаем — и следующее перестаёт быть частью группы, а не остаётся
   * висеть в одиночной.
   */
  const toggleSuperset = (bi, ei) => change((next) => {
    const list = next[bi].exercises;
    const mine = list[ei].supersetGroup;

    if (mine && list[ei + 1] && list[ei + 1].supersetGroup === mine) {
      list[ei].supersetGroup = '';
      list[ei + 1].supersetGroup = '';
      return next;
    }

    if (!list[ei + 1]) return next;

    const group = 'g' + Date.now() + '-' + ei;
    list[ei].supersetGroup = group;
    list[ei + 1].supersetGroup = group;
    return next;
  });

  const move = (bi, ei, delta) => change((next) => {
    const list = next[bi].exercises;
    const to = ei + delta;
    if (to < 0 || to >= list.length) return next;

    [list[ei], list[to]] = [list[to], list[ei]];

    // Перестановка рвёт пару: соседство было её единственным признаком.
    list.forEach((e) => { e.supersetGroup = ''; });
    return next;
  });

  const save = async () => {
    setBusy(true);
    setFailure(null);
    try {
      const result = await apiMutate('plan.save', {
        clientRow,
        month,
        blocks: draft.map((b) => ({
          title: b.title,
          exercises: b.exercises.filter((e) => String(e.name || '').trim()),
        })),
      });

      onSaved(result);
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel pad>
      <p className="small muted" style={{ marginTop: 0 }}>
        Пустые строки не сохраняются — упражнение без названия просто исчезнет.
      </p>

      {draft.map((block, bi) => (
        <div className="plan-edit__block" key={bi}>
          <input
            className="field__input plan-edit__title"
            value={block.title}
            maxLength={160}
            disabled={busy}
            onChange={(e) => change((next) => { next[bi].title = e.target.value; return next; })}
          />

          {block.exercises.map((exercise, ei) => {
            const paired = !!exercise.supersetGroup
              && block.exercises[ei + 1]
              && block.exercises[ei + 1].supersetGroup === exercise.supersetGroup;

            return (
              <div className={'plan-edit__row' + (exercise.supersetGroup ? ' plan-edit__row--superset' : '')} key={ei}>
                <input
                  className="field__input"
                  placeholder="Упражнение"
                  value={exercise.name}
                  maxLength={160}
                  disabled={busy}
                  onChange={(e) => setExercise(bi, ei, 'name', e.target.value)}
                />

                <div className="plan-edit__numbers">
                  <input className="field__input" placeholder="Подх." inputMode="numeric" value={exercise.sets} maxLength={12} disabled={busy} onChange={(e) => setExercise(bi, ei, 'sets', e.target.value)} />
                  <input className="field__input" placeholder="Повт." inputMode="text" value={exercise.reps} maxLength={24} disabled={busy} onChange={(e) => setExercise(bi, ei, 'reps', e.target.value)} />
                  <input className="field__input" placeholder="Вес" inputMode="decimal" value={exercise.weight} maxLength={24} disabled={busy} onChange={(e) => setExercise(bi, ei, 'weight', e.target.value)} />
                  <input className="field__input" placeholder="RPE" inputMode="decimal" value={exercise.rpe} maxLength={12} disabled={busy} onChange={(e) => setExercise(bi, ei, 'rpe', e.target.value)} />
                </div>

                {exercise.prevWeight && <span className="plan-edit__prev">было {exercise.prevWeight}</span>}

                <div className="plan-edit__actions">
                  <button className="button button--ghost" disabled={busy || ei === 0} onClick={() => move(bi, ei, -1)}>Выше</button>
                  <button className="button button--ghost" disabled={busy || ei === block.exercises.length - 1} onClick={() => move(bi, ei, 1)}>Ниже</button>
                  <button
                    className={'button' + (paired ? ' button--primary' : ' button--ghost')}
                    disabled={busy || ei === block.exercises.length - 1}
                    onClick={() => toggleSuperset(bi, ei)}
                  >
                    {paired ? 'В суперсете' : 'Вместе со следующим'}
                  </button>
                  <button className="button button--ghost" disabled={busy} onClick={() => change((next) => {
                    next[bi].exercises.splice(ei, 1);
                    if (!next[bi].exercises.length) next[bi].exercises.push(blank());
                    return next;
                  })}>Убрать</button>
                </div>
              </div>
            );
          })}

          <div className="plan-edit__block-actions">
            <button className="button" disabled={busy} onClick={() => change((next) => {
              next[bi].exercises.push(blank());
              return next;
            })}>Добавить упражнение</button>

            <button className="button button--ghost" disabled={busy || draft.length === 1} onClick={() => change((next) => {
              next.splice(bi, 1);
              return next;
            })}>Убрать тренировку</button>
          </div>
        </div>
      ))}

      <button className="button button--block" disabled={busy} onClick={() => change((next) => {
        next.push({ title: `Тренировка № ${next.length + 1}`, exercises: [blank()] });
        return next;
      })}>Добавить тренировку</button>

      {failure && <Note tone="critical" icon={IconAlert}>{failure.message || 'Не получилось сохранить'}</Note>}

      <div className="plan-edit__footer">
        <button className="button button--primary" disabled={busy} onClick={save}>
          {busy ? 'Сохраняю…' : 'Сохранить программу'}
        </button>
        <button className="button" disabled={busy} onClick={onCancel}>Отмена</button>
      </div>
    </Panel>
  );
}
