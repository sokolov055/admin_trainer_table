import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTabLock } from '../gestures.jsx';
import { apiMutate } from '../api.js';
import { planExerciseForSave } from '../plan-payload.js';
import { Note } from '../ui.jsx';
import { IconAlert } from '../icons.jsx';
import BlockOrder from './BlockOrder.jsx';
import { BlockEdit, AddBlock, blankExercise } from './PlanInline.jsx';
import { usePinch } from '../pinch.js';
import { copyPlanBlocks } from '../plan-block-actions.js';
import { shownLength, resized, withWeekLoad, movedToWeek, copiedWeek, weekOrder } from '../plan-weeks.js';
import { LengthPicker, WeekSections, MoveWeek } from '../client/PlanWeeks.jsx';

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
 *
 * Тренировка добавляется тем же «+»-меню, что в программе клиента
 * (AddBlock: новая или из шаблона тренировки) — до 20.10.2026 здесь были
 * своя кнопка и нативный список. Отмена — только стрелкой «Назад» над
 * формой: в плавающей панели она дублировала её (QA C05b).
 */
export default function PlanEditor({
  blocks, onSaved, onSubmit, single = false, submitLabel = 'Сохранить шаблон',
  workoutTemplates = null, onDirty = null,
}) {
  const [draft, setDraft] = useState(() => (blocks.length
    ? blocks.map((b) => ({
      id: b.id || '', title: b.title, sourceId: b.sourceId || null,
      // Неделя и нагрузка недели (plan-weeks.js) — иначе правка шаблона их теряла
      ...(b.week ? { week: b.week } : {}), ...(b.load ? { load: b.load } : {}),
      exercises: b.exercises.map((e) => ({ ...blankExercise(), ...e })),
    }))
    : [{ title: 'Тренировка № 1', exercises: [blankExercise()] }]));
  // Изменилось ли что-то против открытого — экрану шаблона, чтобы спросить
  // перед выходом (аудит 24.10.2026). Сравнение снимком: правка и откат
  // той же правки — снова «ничего не менялось»
  const [initialDraft] = useState(() => JSON.stringify(draft));
  const draftDirty = JSON.stringify(draft) !== initialDraft;
  useEffect(() => { if (onDirty) onDirty(draftDirty); }, [draftDirty]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const [ordering, setOrdering] = useState(false);
  const rootRef = useRef(null);
  // Недели — разделы (FT-775): выбранная длина может быть больше той, что у
  // тренировок, — новые недели пустые, пока тренер в них что-то не положит
  const [lengthPick, setLengthPick] = useState(0);
  const length = single ? 0 : shownLength(draft, lengthPick);
  const setLength = (n) => { setLengthPick(n); change((list) => resized(list, n)); };

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
  // бы бросить несохранённое. Выход — «Сохранить» или «Назад»
  useTabLock(true);

  // Из свёрнутого списка — к тренировке: развернуть и прокрутить к ней
  const openBlock = (i) => {
    setOrdering(false);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = document.querySelector('.plan-edit__block[data-index="' + i + '"]');
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
        // Неделя программы и пометка (plan-weeks.js) — иначе пересохранение их стёрло бы
        ...(b.week ? { week: b.week } : {}),
        ...(b.load ? { load: b.load } : {}),
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

  // Одна тренировка редактора: номер — по месту в шаблоне, под заголовком
  // у программы по неделям — «В неделю…» (перенос; поля «Неделя/Нагрузка»
  // у тренировки больше нет — нагрузка у недели в заголовке раздела)
  const renderBlock = (block, bi) => {
    // Номер — по месту на экране: в разделах недель тренировки идут по неделям
    const num = length ? weekOrder(draft, length).indexOf(block) + 1 : bi + 1;
    return (
    <div className="plan-edit__block" key={bi} data-index={bi}>
      {block.sourceId && workoutTemplates && (
        <span className="plan-edit__source">
          из шаблона «{(workoutTemplates.find((t) => t.id === block.sourceId) || {}).title || 'тренировки'}» · правка здесь — только в этом шаблоне
        </span>
      )}
      {/* Номер и название — одной строкой: по номеру тренировки видно
          издалека, когда листаешь длинную программу */}
      <div className="plan-edit__block-head">
        {!single && <span className="plan-edit__block-num" aria-hidden="true">{num}</span>}
        <input
          aria-label={'Название тренировки ' + num}
          className="field__input plan-edit__title"
          value={block.title}
          maxLength={160}
          disabled={busy}
          onChange={(e) => change((next) => { next[bi].title = e.target.value; return next; })}
        />
        {length > 1 && <MoveWeek block={block} length={length} disabled={busy} onMove={(week) => change((list) => movedToWeek(list, list[bi], week))} />}
      </div>
      {/* Упражнения — тем же редактором, что в программе клиента */}
      <BlockEdit
        block={block}
        canRemove={!single && draft.length > 1}
        onChange={(exercises) => change((next) => { next[bi].exercises = exercises; return next; })}
        onRemove={() => change((next) => next.filter((_, k) => k !== bi))}
      />
    </div>
    );
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

      {/* Программа по неделям (FT-775): «Одна / 2 / 3 / 4 / Список» и что
          получит клиент — одной фразой; тренировки — под заголовками недель */}
      {!single && !ordering && (
        <div className="panel panel--pad plan-edit__weeks">
          <LengthPicker value={length} onChange={setLength} count={draft.length} disabled={busy} />
        </div>
      )}
      {!ordering && length > 0 && (
        <WeekSections
          blocks={draft}
          length={length}
          canEdit
          disabled={busy}
          renderBlock={(block) => renderBlock(block, draft.indexOf(block))}
          onLoad={(week, load) => change((list) => withWeekLoad(list, week, load))}
          onCopyWeek={(from, to) => change((list) => copiedWeek(list, from, to))}
          addSlot={(week, label) => (
            <AddBlock
              key={'add' + week}
              busy={busy}
              label={label}
              primary={label === 'Новая тренировка'}
              onAdd={(made) => change((next) => {
                next.push({ ...(made || { title: `Тренировка № ${next.length + 1}`, exercises: [blankExercise()] }), week });
                return next;
              })}
            />
          )}
        />
      )}
      {!ordering && length === 0 && draft.map((block, bi) => renderBlock(block, bi))}

      {/* Программа-шаблон: «+» под последней тренировкой — новая или из
          шаблона тренировки, копией, которая помнит, откуда взята
          (sourceId). Поправят шаблон тренировки — приложение спросит,
          обновить ли её здесь. */}
      {!single && !ordering && length === 0 && (
        <AddBlock
          busy={busy}
          onAdd={(made) => change((next) => {
            next.push(made || { title: `Тренировка № ${next.length + 1}`, exercises: [blankExercise()] });
            return next;
          })}
        />
      )}

      {failure && <Note tone="critical" icon={IconAlert}>{failure.message || 'Не получилось сохранить'}</Note>}

      {/* Место под плавающей панелью: без него последнее упражнение
          пряталось бы под ней */}
      <div className="plan-edit__float-space" aria-hidden="true" />

      {/* «Сохранить» и «Свернуть» — всегда под рукой, с любого места.
          Панель — у края экрана, вне ленты, над нижним меню
          (--float-bottom): «липкое» позиционирование ломается внутри
          сдвигаемых слоёв */}
      {typeof document !== 'undefined' && onScreen && createPortal(
        <div className="plan-edit__float" role="toolbar" aria-label="Правка шаблона">
          <button className="button button--primary" disabled={busy} onClick={save}>
            {busy ? 'Сохраняем…' : submitLabel}
          </button>
          {!single && draft.length > 1 && (
            <button className="button" disabled={busy} onClick={toggleOrdering}>{ordering ? 'Развернуть' : 'Свернуть'}</button>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
