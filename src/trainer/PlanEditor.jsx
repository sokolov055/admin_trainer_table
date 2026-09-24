import React, { useState } from 'react';
import { apiMutate } from '../api.js';
import { useData } from '../useData.js';
import { Note } from '../ui.jsx';
import { IconAlert, IconArrowUp, IconArrowDown, IconLinkPair, IconTrash } from '../icons.jsx';
import BlockOrder from './BlockOrder.jsx';

/**
 * Редактор программы месяца.
 *
 * Последнее, ради чего тренер открывал таблицу на телефоне. Экран сделан
 * под эту ситуацию: он в зале, между клиентами, и ему нужно поменять вес
 * в двух строках или дописать упражнение — а не «составить программу».
 * Поэтому здесь нет конструктора: список, поля и кнопка «Сохранить».
 * Порядок тренировок меняют перетаскиванием в свёрнутом виде
 * (BlockOrder.jsx) — развёрнутая тренировка выше экрана.
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

/**
 * Тот же редактор правит и шаблоны из библиотеки: у шаблона те же блоки.
 * onSubmit(blocks) — куда сохранять вместо программы клиента; single —
 * шаблон одной тренировки, добавлять и убирать тренировки в нём нельзя;
 * submitLabel — подпись кнопки сохранения.
 */
export default function PlanEditor({
  clientRow, month, blocks, onSaved, onCancel, onSubmit, single = false, submitLabel = 'Сохранить программу',
}) {
  // Подсказки названий из библиотеки: общие и свои упражнения. Набрать
  // «жим» и выбрать из списка быстрее, чем печатать целиком, а названия
  // одинаковые во всех программах — по ним строится «было» у клиента.
  const library = useData('library.exercises', {}, []);
  const names = library.data ? library.data.exercises.map((e) => e.name) : [];
  const listId = 'exercise-names';
  const [draft, setDraft] = useState(() => (blocks.length
    ? blocks.map((b) => ({ title: b.title, exercises: b.exercises.map((e) => ({ ...blank(), ...e })) }))
    : [{ title: 'Тренировка № 1', exercises: [blank()] }]));

  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);

  const [ordering, setOrdering] = useState(false);

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
      const clean = draft.map((b) => ({
        title: b.title,
        exercises: b.exercises.filter((e) => String(e.name || '').trim()),
      }));

      const result = onSubmit
        ? await onSubmit(clean)
        : await apiMutate('plan.save', { clientRow, month, blocks: clean });

      onSaved(result);
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(false);
    }
  };

  // Без общей панели: карточка — у каждой тренировки, одна на уровень.
  // Карточка в карточке (панель → тренировка → упражнение) и была тем,
  // из-за чего тренировки сливались.
  return (
    <div className="plan-edit">
      <p className="small muted" style={{ marginTop: 0 }}>
        Пустые строки не сохраняются — упражнение без названия просто исчезнет.
      </p>

      <datalist id={listId}>
        {names.map((name) => <option key={name} value={name} />)}
      </datalist>

      {!single && draft.length > 1 && (
        <div className="plan-edit__order-bar">
          <button
            className={'button' + (ordering ? ' button--primary' : '')}
            disabled={busy}
            onClick={() => setOrdering(!ordering)}
          >
            {ordering ? 'Готово' : 'Порядок тренировок'}
          </button>
          {ordering && <span className="small muted">Перетащите тренировку на новое место</span>}
        </div>
      )}

      {ordering && (
        <BlockOrder
          blocks={draft}
          disabled={busy}
          onMove={(from, to) => change((next) => {
            const [moved] = next.splice(from, 1);
            next.splice(to, 0, moved);
            return next;
          })}
        />
      )}

      {!ordering && draft.map((block, bi) => (
        <div className="plan-edit__block" key={bi}>
          {/* Номер и название — одной строкой: по номеру тренировки видно
              издалека, когда листаешь длинную программу */}
          <div className="plan-edit__block-head">
            {!single && <span className="plan-edit__block-num" aria-hidden="true">{bi + 1}</span>}
            <input
              aria-label={'Название тренировки ' + (bi + 1)}
              className="field__input plan-edit__title"
              value={block.title}
              maxLength={160}
              disabled={busy}
              onChange={(e) => change((next) => { next[bi].title = e.target.value; return next; })}
            />
          </div>

          {block.exercises.map((exercise, ei) => {
            const paired = !!exercise.supersetGroup
              && block.exercises[ei + 1]
              && block.exercises[ei + 1].supersetGroup === exercise.supersetGroup;

            return (
              <div className={'plan-edit__row' + (exercise.supersetGroup ? ' plan-edit__row--superset' : '')} key={ei}>
                <input
                  className="field__input"
                  placeholder="Упражнение"
                  list={listId}
                  value={exercise.name}
                  maxLength={160}
                  disabled={busy}
                  onChange={(e) => setExercise(bi, ei, 'name', e.target.value)}
                />

                <div className="plan-edit__numbers plan-edit__labels" aria-hidden="true">
                  <span>Подходы</span><span>Повторы</span><span>Вес</span><span>RPE</span>
                </div>
                <div className="plan-edit__numbers">
                  <input className="field__input" placeholder="Подх." inputMode="numeric" value={exercise.sets} maxLength={12} disabled={busy} onChange={(e) => setExercise(bi, ei, 'sets', e.target.value)} />
                  <input className="field__input" placeholder="Повт." inputMode="text" value={exercise.reps} maxLength={24} disabled={busy} onChange={(e) => setExercise(bi, ei, 'reps', e.target.value)} />
                  <input className="field__input" placeholder="Вес" inputMode="decimal" value={exercise.weight} maxLength={24} disabled={busy} onChange={(e) => setExercise(bi, ei, 'weight', e.target.value)} />
                  <input className="field__input" placeholder="RPE" inputMode="decimal" value={exercise.rpe} maxLength={12} disabled={busy} onChange={(e) => setExercise(bi, ei, 'rpe', e.target.value)} />
                </div>

                {exercise.prevWeight && <span className="plan-edit__prev">было {exercise.prevWeight}</span>}

                <div className="plan-edit__actions">
                  <button className="icon-button plan-edit__icon" aria-label="Выше" title="Выше" disabled={busy || ei === 0} onClick={() => move(bi, ei, -1)}>
                    <IconArrowUp size={18} />
                  </button>
                  <button className="icon-button plan-edit__icon" aria-label="Ниже" title="Ниже" disabled={busy || ei === block.exercises.length - 1} onClick={() => move(bi, ei, 1)}>
                    <IconArrowDown size={18} />
                  </button>
                  <button
                    className={'button button--ghost plan-edit__pair' + (paired ? ' plan-edit__pair--on' : '')}
                    aria-pressed={paired}
                    disabled={busy || ei === block.exercises.length - 1}
                    onClick={() => toggleSuperset(bi, ei)}
                  >
                    <IconLinkPair size={16} />
                    {paired ? 'В суперсете' : 'Суперсет'}
                  </button>
                  <button className="icon-button plan-edit__icon plan-edit__remove" aria-label="Убрать упражнение" title="Убрать" disabled={busy} onClick={() => change((next) => {
                    next[bi].exercises.splice(ei, 1);
                    if (!next[bi].exercises.length) next[bi].exercises.push(blank());
                    return next;
                  })}>
                    <IconTrash size={18} />
                  </button>
                </div>
              </div>
            );
          })}

          <div className="plan-edit__block-actions">
            <button className="button" disabled={busy} onClick={() => change((next) => {
              next[bi].exercises.push(blank());
              return next;
            })}>Добавить упражнение</button>

            {!single && (
              <button className="button button--ghost" disabled={busy || draft.length === 1} onClick={() => change((next) => {
                next.splice(bi, 1);
                return next;
              })}>Убрать тренировку</button>
            )}
          </div>
        </div>
      ))}

      {!single && !ordering && (
        <button className="button button--block" disabled={busy} onClick={() => change((next) => {
          next.push({ title: `Тренировка № ${next.length + 1}`, exercises: [blank()] });
          return next;
        })}>Добавить тренировку</button>
      )}

      {failure && <Note tone="critical" icon={IconAlert}>{failure.message || 'Не получилось сохранить'}</Note>}

      <div className="plan-edit__footer">
        <button className="button button--primary" disabled={busy} onClick={save}>
          {busy ? 'Сохраняю…' : submitLabel}
        </button>
        <button className="button" disabled={busy} onClick={onCancel}>Отмена</button>
      </div>
    </div>
  );
}
