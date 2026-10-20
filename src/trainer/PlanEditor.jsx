import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTabLock } from '../gestures.jsx';
import { apiMutate } from '../api.js';
import { planExerciseForSave } from '../plan-payload.js';
import { Note } from '../ui.jsx';
import { IconAlert } from '../icons.jsx';
import BlockOrder from './BlockOrder.jsx';
import { BlockEdit, blankExercise } from './PlanInline.jsx';
import { usePinch } from '../pinch.js';
import { copyPlanBlocks } from '../plan-block-actions.js';

/**
 * Редактор шаблона (программы или одной тренировки) в «Библиотеке».
 *
 * До 20.10.2026 здесь был второй, свой редактор упражнений: колонки
 * «Подходы · Повторы · Вес», стрелки «Выше/Ниже», кнопки «Дропсет», «Вид»,
 * «Тренажёры». Он разошёлся с правкой программы клиента (PlanInline.jsx):
 * не умел разминку, перестановка рвала все суперсеты блока, подходы
 * суперсета синхронизировались не так. Теперь упражнения правятся тем же
 * BlockEdit, что и в программе клиента: тап по названию — из базы, тап по
 * схеме — повторы, вес, подходы, отдых, суперсет; подержать — перетащить;
 * смахнуть — удалить. Здесь остаётся только то, что у шаблона своё:
 * список тренировок, их порядок (BlockOrder: свернуть, перетащить,
 * скопировать, удалить), тренировка из шаблона тренировки и «Сохранить».
 *
 * Сохраняется шаблон целиком, одним снимком: так удаление становится
 * настоящим. onSubmit(blocks) — куда сохранять; single — шаблон одной
 * тренировки, добавлять и убирать тренировки в нём нельзя.
 */
export default function PlanEditor({
  blocks, onSaved, onCancel, onSubmit, single = false, submitLabel = 'Сохранить шаблон',
  workoutTemplates = null, loadWorkout = null,
}) {
  const [draft, setDraft] = useState(() => (blocks.length
    ? blocks.map((b) => ({ id: b.id || '', title: b.title, sourceId: b.sourceId || null, exercises: b.exercises.map((e) => ({ ...blankExercise(), ...e })) }))
    : [{ title: 'Тренировка № 1', exercises: [blankExercise()] }]));
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const [ordering, setOrdering] = useState(false);
  const rootRef = useRef(null);

  // Панель кнопок вынесена в body и не прячется вместе с вкладкой: раздел
  // «Шаблоны» остаётся смонтированным (hidden), и панель ездила по всем
  // разделам (09.10.2026). Видна, только пока редактор на экране
  const [onScreen, setOnScreen] = useState(true);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Правка шаблона — не раздел: смахнуть влево в соседний раздел значило
  // бы бросить несохранённое. Выход — «Сохранить» или «Отмена»
  useTabLock(true);

  // Из свёрнутого списка — к тренировке: развернуть и прокрутить к ней
  const openBlock = (i) => {
    setOrdering(false);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = document.querySelectorAll('.plan-edit__block')[i];
      if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }));
  };
  // Щипок: свели пальцы — свернуть тренировки, развели — развернуть
  usePinch({
    enabled: !single && draft.length > 1 && !busy,
    target: () => rootRef.current,
    collapsed: ordering,
    morph: {
      items: () => rootRef.current && rootRef.current.querySelectorAll('.plan-edit__block'),
      head: '.plan-edit__block-head',
      rows: '.block-order__row',
    },
    onIn: () => { if (!ordering) setOrdering(true); },
    onOut: () => { if (ordering) setOrdering(false); },
  });
  const toggleOrdering = () => {
    const next = !ordering;
    setOrdering(next);
    // Свернули — к началу списка, он короткий и должен быть виден целиком
    if (next) requestAnimationFrame(() => {
      const el = document.querySelector('.plan-edit__order-bar');
      if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  };
  // Удалённое из порядка тренировок можно вернуть: подтверждения нет —
  // нажатие на корзину уже осознанное, а ошибку чинит «Вернуть»
  const [undo, setUndo] = useState(null); // { draft, text }
  useEffect(() => {
    if (!undo) return undefined;
    const t = setTimeout(() => setUndo(null), 8000);
    return () => clearTimeout(t);
  }, [undo]);

  const change = (fn) => {
    setDraft((prev) => fn(prev.map((b) => ({ ...b, exercises: b.exercises.map((e) => ({ ...e })) }))));
    setFailure(null);
  };

  const save = async () => {
    setBusy(true);
    setFailure(null);
    try {
      const clean = draft.map((b) => ({
        title: b.title,
        ...(b.id ? { id: b.id } : {}),
        ...(b.sourceId ? { sourceId: b.sourceId } : {}),
        exercises: b.exercises.filter((e) => String(e.name || '').trim()),
      }));
      // В сервер — только то, что он хранит (plan-payload.js); шаблону — как было
      const forServer = clean.map((b) => ({ ...b, exercises: b.exercises.map(planExerciseForSave) }));
      const result = onSubmit ? await onSubmit(clean) : await apiMutate('plan.save', { blocks: forServer });
      onSaved(result);
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="plan-edit" ref={rootRef}>
      <p className="small muted" style={{ marginTop: 0 }}>
        Пустые строки не сохраняются — упражнение без названия просто исчезнет.
      </p>

      {!single && draft.length > 1 && (
        <div className="plan-edit__order-bar">
          <button className={'button' + (ordering ? ' button--primary' : '')} disabled={busy} onClick={toggleOrdering}>
            {ordering ? 'Развернуть' : 'Свернуть тренировки'}
          </button>
          {ordering && <span className="small muted">Нажмите тренировку — откроется она. Тащите за значок справа, смахните влево — удалить, держите — копировать</span>}
        </div>
      )}

      {ordering && (
        <BlockOrder
          blocks={draft}
          disabled={busy}
          onOpen={openBlock}
          onMove={(from, to) => change((next) => {
            const [moved] = next.splice(from, 1);
            next.splice(to, 0, moved);
            return next;
          })}
          onCopy={(indices) => change((next) => copyPlanBlocks(next, indices))}
          onRemove={(indices) => {
            if (draft.length - indices.length < 1) return;
            const names = indices.map((i) => '«' + (draft[i].title || 'Без названия') + '»');
            setUndo({ draft, text: names.length === 1 ? 'Удалена ' + names[0] : 'Удалено тренировок: ' + names.length });
            change((next) => next.filter((_, i) => !indices.includes(i)));
          }}
        />
      )}

      {ordering && undo && (
        <div className="block-order__undo" role="status">
          <span>{undo.text}</span>
          <button type="button" className="button button--ghost" onClick={() => { setDraft(undo.draft); setUndo(null); }}>Вернуть</button>
        </div>
      )}

      {!ordering && draft.map((block, bi) => (
        <div className="plan-edit__block" key={bi}>
          {block.sourceId && workoutTemplates && (
            <span className="plan-edit__source">
              из шаблона «{(workoutTemplates.find((t) => t.id === block.sourceId) || {}).title || 'тренировки'}» · правка здесь — только в этом шаблоне
            </span>
          )}
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
          {/* Упражнения — тем же редактором, что в программе клиента */}
          <BlockEdit
            block={block}
            canRemove={!single && draft.length > 1}
            onChange={(exercises) => change((next) => { next[bi].exercises = exercises; return next; })}
            onRemove={() => change((next) => next.filter((_, k) => k !== bi))}
          />
        </div>
      ))}

      {!single && !ordering && (
        <button className="button button--block" disabled={busy} onClick={() => change((next) => {
          next.push({ title: `Тренировка № ${next.length + 1}`, exercises: [blankExercise()] });
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
                next.push({ title: block.title, sourceId: id, exercises: block.exercises.map((x) => ({ ...blankExercise(), ...x })) });
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

      {/* Место под плавающей панелью: без него последнее упражнение
          пряталось бы под ней */}
      <div className="plan-edit__float-space" aria-hidden="true" />

      {/* «Сохранить», «Свернуть» и «Отмена» — всегда под рукой, с любого
          места. Панель — у края экрана, вне ленты: «липкое»
          позиционирование ломается внутри сдвигаемых слоёв */}
      {typeof document !== 'undefined' && onScreen && createPortal(
        <div className="plan-edit__float" role="toolbar" aria-label="Правка шаблона">
          <button className="button button--primary" disabled={busy} onClick={save}>
            {busy ? 'Сохраняю…' : submitLabel}
          </button>
          {!single && draft.length > 1 && (
            <button className="button" disabled={busy} onClick={toggleOrdering}>{ordering ? 'Развернуть' : 'Свернуть'}</button>
          )}
          <button className="button button--ghost" disabled={busy} onClick={onCancel}>Отмена</button>
        </div>,
        document.body,
      )}
    </div>
  );
}
