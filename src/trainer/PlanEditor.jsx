import ExercisePicker from './ExercisePicker.jsx';
import React, { useState } from 'react';
import { apiMutate } from '../api.js';
import { trackOf } from '../exercise-track.js';
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

const blank = () => ({
  name: '', weight: '', prevWeight: '', sets: '', reps: '', rpe: '', supersetGroup: '',
  // Сплит: кто делает (пусто — все) и вес каждого
  performers: [], splitWeights: {}, splitPrev: {},
  // Ссылка на упражнение из базы: выбрано в подсказках или связано по названию
  exerciseId: null,
  // Приём: 'dropset' — последний подход со сбросами веса
  technique: '',
});

/**
 * Подписи колонок по типу упражнения. Колонки те же четыре — меняется
 * смысл: у кардио «повторы» — время, «вес» — режим тренажёра («8 км/ч,
 * 3%», «уровень 6»); у статики «повторы» — секунды.
 */
function columns(exercise) {
  const t = trackOf(exercise);
  const sets = exercise.supersetGroup ? 'Круги' : 'Подходы';
  if (t.kind === 'cardio') {
    const mode = t.machine === 'treadmill' ? 'км/ч, %' : t.machine === 'other' ? 'режим' : 'уровень';
    return { heads: ['Отрезки', 'Время', 'Режим', 'RPE'], ph: ['Отр.', 'мин', mode, 'RPE'] };
  }
  if (t.kind === 'timed') return { heads: [sets, 'Время, с', 'Доп. вес', 'RPE'], ph: ['Подх.', 'сек', 'свой', 'RPE'] };
  const reps = t.unilateral ? 'Повт./стор.' : 'Повторы';
  if (t.kind === 'bodyweight') return { heads: [sets, reps, 'Доп. вес', 'RPE'], ph: ['Подх.', 'Повт.', 'свой', 'RPE'] };
  return { heads: [sets, reps, t.perSide ? 'Кг/стор.' : 'Вес', 'RPE'], ph: ['Подх.', 'Повт.', 'Вес', 'RPE'] };
}

/**
 * Тот же редактор правит и шаблоны из библиотеки: у шаблона те же блоки.
 * onSubmit(blocks) — куда сохранять вместо программы клиента; single —
 * шаблон одной тренировки, добавлять и убирать тренировки в нём нельзя;
 * submitLabel — подпись кнопки сохранения.
 */
// members — участники сплита: у упражнения появляются исполнители и вес
// каждого вместо одного общего веса
export default function PlanEditor({
  clientRow, month, blocks, onSaved, onCancel, onSubmit, single = false, submitLabel = 'Сохранить программу',
  members = [], workoutTemplates = null, loadWorkout = null,
}) {
  const split = members.length > 1;
  // Подсказки названий из библиотеки: общие и свои упражнения. Набрать
  // «жим» и выбрать из списка быстрее, чем печатать целиком, а названия
  // одинаковые во всех программах — по ним строится «было» у клиента.
  const library = useData('library.exercises', {}, []);
  const [extra, setExtra] = useState([]);
  const exercises = (library.data ? library.data.exercises : []).concat(extra);
  const [draft, setDraft] = useState(() => (blocks.length
    ? blocks.map((b) => ({ title: b.title, sourceId: b.sourceId || null, exercises: b.exercises.map((e) => ({ ...blank(), ...e })) }))
    : [{ title: 'Тренировка № 1', exercises: [blank()] }]));

  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);

  const [ordering, setOrdering] = useState(false);

  const change = (fn) => {
    setDraft((prev) => fn(prev.map((b) => ({ ...b, exercises: b.exercises.map((e) => ({ ...e })) }))));
    setFailure(null);
  };

  const setExercise = (bi, ei, field, value) => change((next) => {
    const list = next[bi].exercises;
    list[ei][field] = value;
    // Суперсет делают кругами: число подходов у всех упражнений группы
    // одно. Вписал у любого — встало у всех.
    const group = list[ei].supersetGroup;
    if (field === 'sets' && group) {
      list.forEach((e) => { if (e.supersetGroup === group) e.sets = value; });
    }
    return next;
  });

  /**
   * Кто делает упражнение. Пустой список значит «все»: так и хранится,
   * чтобы новое упражнение не требовало отмечать каждого. Снять можно
   * всех, кроме последнего: упражнение без исполнителя — это удаление.
   */
  const togglePerformer = (bi, ei, name) => change((next) => {
    const ex = next[bi].exercises[ei];
    const active = ex.performers && ex.performers.length ? ex.performers : members;
    const on = active.includes(name) ? active.filter((n) => n !== name) : members.filter((m) => m === name || active.includes(m));
    if (!on.length) return next;
    ex.performers = on.length === members.length ? [] : on;
    return next;
  });

  const setSplitWeight = (bi, ei, name, value) => change((next) => {
    const ex = next[bi].exercises[ei];
    ex.splitWeights = { ...(ex.splitWeights || {}), [name]: value };
    return next;
  });

  /** Подходы группы — одним числом: первое заполненное в ней */
  const syncSets = (list, group) => {
    if (!group) return;
    const members = list.filter((e) => e.supersetGroup === group);
    const sets = (members.find((e) => String(e.sets || '').trim()) || {}).sets || '';
    members.forEach((e) => { e.sets = sets; });
  };

  /**
   * Пометка «вместе со следующим» живёт на паре, а не на упражнении:
   * снимаем — и следующее перестаёт быть частью группы, а не остаётся
   * висеть в одиночной.
   */
  const toggleSuperset = (bi, ei) => change((next) => {
    const list = next[bi].exercises;
    const mine = list[ei].supersetGroup;

    if (mine && list[ei + 1] && list[ei + 1].supersetGroup === mine) {
      // Разрезаем группу по этой границе: у каждой половины из двух и
      // больше упражнений своя группа, одиночка — без группы
      const left = [];
      const right = [];
      list.forEach((e, k) => { if (e.supersetGroup === mine) (k <= ei ? left : right).push(e); });
      if (left.length < 2) left.forEach((e) => { e.supersetGroup = ''; });
      const fresh = 'g' + Date.now() + '-' + ei;
      right.forEach((e) => { e.supersetGroup = right.length < 2 ? '' : fresh; });
      return next;
    }

    if (!list[ei + 1]) return next;

    // Третье к паре — в ту же группу, а не новой парой поверх старой
    const group = mine || 'g' + Date.now() + '-' + ei;
    const joined = list[ei + 1].supersetGroup;
    list[ei].supersetGroup = group;
    list.forEach((e, k) => { if (k === ei + 1 || (joined && e.supersetGroup === joined)) e.supersetGroup = group; });
    syncSets(list, group);
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
        ...(b.sourceId ? { sourceId: b.sourceId } : {}),
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

      {!single && draft.length > 1 && (
        <div className="plan-edit__order-bar">
          <button
            className={'button' + (ordering ? ' button--primary' : '')}
            disabled={busy}
            onClick={() => setOrdering(!ordering)}
          >
            {ordering ? 'Готово' : 'Порядок тренировок'}
          </button>
          {ordering && <span className="small muted">Перетащите на новое место. Долгое нажатие — копировать или удалить</span>}
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
          onCopy={(i) => change((next) => {
            const copy = {
              ...next[i],
              title: next[i].title + ' (копия)',
              // Суперсеты копии — свои группы, чтобы не склеиться с оригиналом
              exercises: next[i].exercises.map((e) => ({
                ...e, supersetGroup: e.supersetGroup ? e.supersetGroup + '-c' + Date.now() : '',
              })),
            };
            next.splice(i + 1, 0, copy);
            return next;
          })}
          onRemove={(i) => change((next) => {
            if (next.length > 1) next.splice(i, 1);
            return next;
          })}
        />
      )}

      {!ordering && draft.map((block, bi) => (
        <div className="plan-edit__block" key={bi}>
          {/* Номер и название — одной строкой: по номеру тренировки видно
              издалека, когда листаешь длинную программу */}
          {block.sourceId && workoutTemplates && (
            <span className="plan-edit__source">
              из шаблона «{(workoutTemplates.find((t) => t.id === block.sourceId) || {}).title || 'тренировки'}» · правка здесь — только в этой программе
            </span>
          )}
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
                <ExercisePicker
                  value={exercise.name}
                  exerciseId={exercise.exerciseId}
                  exercises={exercises}
                  disabled={busy}
                  onPick={({ name, exerciseId }) => change((next) => {
                    next[bi].exercises[ei].name = name;
                    next[bi].exercises[ei].exerciseId = exerciseId;
                    const base = exerciseId && exercises.find((x) => x.id === exerciseId);
                    if (base && base.track) next[bi].exercises[ei].track = base.track;
                    return next;
                  })}
                  onAdded={(saved) => setExtra((prev) => [...prev, saved])}
                />

                <div className={'plan-edit__numbers plan-edit__labels' + (split ? ' plan-edit__numbers--split' : '')} aria-hidden="true">
                  <span>{columns(exercise).heads[0]}</span><span>{columns(exercise).heads[1]}</span>{!split && <span>{columns(exercise).heads[2]}</span>}<span>RPE</span>
                </div>
                <div className={'plan-edit__numbers' + (split ? ' plan-edit__numbers--split' : '')}>
                  <input className="field__input" aria-label={columns(exercise).heads[0]} placeholder={columns(exercise).ph[0]} inputMode="numeric" value={exercise.sets} maxLength={12} disabled={busy} onChange={(e) => setExercise(bi, ei, 'sets', e.target.value)} />
                  <input className="field__input" aria-label={columns(exercise).heads[1]} placeholder={columns(exercise).ph[1]} inputMode="text" value={exercise.reps} maxLength={24} disabled={busy} onChange={(e) => setExercise(bi, ei, 'reps', e.target.value)} />
                  {!split && <input className="field__input" aria-label={columns(exercise).heads[2]} placeholder={columns(exercise).ph[2]} inputMode={trackOf(exercise).kind === 'cardio' ? 'text' : 'decimal'} value={exercise.weight} maxLength={24} disabled={busy} onChange={(e) => setExercise(bi, ei, 'weight', e.target.value)} />}
                  <input className="field__input" aria-label="RPE" placeholder="RPE" inputMode="decimal" value={exercise.rpe} maxLength={12} disabled={busy} onChange={(e) => setExercise(bi, ei, 'rpe', e.target.value)} />
                </div>

                {!split && exercise.prevWeight && <span className="plan-edit__prev">было {exercise.prevWeight}</span>}

                {/* Сплит: кто делает и с каким весом — строкой на человека.
                    Кнопка с именем — «делает»; снятому вес не нужен. */}
                {split && (
                  <div className="plan-edit__split">
                    {members.map((m) => {
                      const doing = !exercise.performers || !exercise.performers.length || exercise.performers.includes(m);
                      const prev = exercise.splitPrev && exercise.splitPrev[m];
                      return (
                        <div className="plan-edit__person" key={m}>
                          <button
                            type="button"
                            className={'chip' + (doing ? ' chip--active' : '')}
                            aria-pressed={doing}
                            disabled={busy}
                            onClick={() => togglePerformer(bi, ei, m)}
                          >{m}</button>
                          <input
                            className="field__input"
                            aria-label={'Вес: ' + m}
                            placeholder={doing ? 'Вес' : 'не делает'}
                            inputMode="decimal"
                            value={(exercise.splitWeights && exercise.splitWeights[m]) || ''}
                            maxLength={24}
                            disabled={busy || !doing}
                            onChange={(e) => setSplitWeight(bi, ei, m, e.target.value)}
                          />
                          {prev && doing && <span className="plan-edit__prev">было {prev}</span>}
                        </div>
                      );
                    })}
                  </div>
                )}

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
                  {/* Дропсет — в последнем подходе: в зале там уже будет
                      строка первого сброса */}
                  {(trackOf(exercise).kind === 'strength' || trackOf(exercise).kind === 'bodyweight') && (
                    <button
                      type="button"
                      className={'button button--ghost plan-edit__pair' + (exercise.technique === 'dropset' ? ' plan-edit__pair--on' : '')}
                      aria-pressed={exercise.technique === 'dropset'}
                      disabled={busy}
                      onClick={() => setExercise(bi, ei, 'technique', exercise.technique === 'dropset' ? '' : 'dropset')}
                    >Дропсет</button>
                  )}
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

      {/* Программа-шаблон: тренировка из шаблона тренировки — копией, которая
          помнит, откуда взята (sourceId). Поправят шаблон тренировки —
          приложение спросит, обновить ли её здесь. */}
      {!single && !ordering && workoutTemplates && workoutTemplates.length > 0 && (
        <div className="plan-edit__from-template">
          <select
            className="field__input"
            aria-label="Тренировка из шаблона"
            value=""
            disabled={busy}
            onChange={async (e) => {
              const id = Number(e.target.value);
              if (!id) return;
              const block = await loadWorkout(id);
              if (!block) return;
              change((next) => {
                next.push({ title: block.title, sourceId: id, exercises: block.exercises.map((x) => ({ ...blank(), ...x })) });
                return next;
              });
            }}
          >
            <option value="">+ Тренировка из шаблона…</option>
            {workoutTemplates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </div>
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
