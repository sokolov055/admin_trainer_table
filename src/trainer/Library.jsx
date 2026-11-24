import MachineView from './MachineView.jsx';
import MachineList from './MachineList.jsx';
import ExerciseList from './ExerciseList.jsx';
import { NO_EXERCISE_FILTERS } from './exercise-list-model.js';
import { MuscleFigure, MuscleNames, LABELS } from '../muscles/MuscleMap.jsx';
import { KIND_LABELS, MACHINE_LABELS, cardioLine, trackOf, planText } from '../exercise-track.js';
import { useReturnScroll } from '../scroll.js';
import React, { useEffect, useState } from 'react';
import { useData } from '../useData.js';
import { apiMutate, apiPublic } from '../api.js';
import { haptic } from '../telegram.js';
import { useBackGesture } from '../gestures.jsx';
import PlanEditor from './PlanEditor.jsx';
import ProgramList from './ProgramList.jsx';
import ProgramView from './ProgramView.jsx';
import ProgramEditor from './ProgramEditor.jsx';
import ProgramAssign from './ProgramAssign.jsx';
import ExerciseKind from '../ExerciseKind.jsx';
import Dishes from './Dishes.jsx';
import FoodCatalog from './FoodCatalog.jsx';
import { uploadVideo, monthName, shrinkPhoto, uploadMachinePhoto, mediaUrl } from '../library.js';
import {
  Section, Panel, Loading, ErrorState, Empty, Tag, Chips, Search, Segmented, Field, Note, plural,
  BackButton, useLeaveGuard,
} from '../ui.jsx';
import { IconPlan, IconSearch, IconAlert, IconCheck, IconTrash, IconClose } from '../icons.jsx';
import SwipeRow from '../SwipeRow.jsx';
import { Media, SetupText, MachinePhoto } from '../media.jsx';
import { usePendingDelete } from '../pendingDelete.jsx';
import { MachinesEditor, MachineForm, AlternativesEditor, extrasHint } from './MachinesEditor.jsx';
import { useSelfCard, selfPick } from './selfCard.js';
import { programLength, monthWeeks, parseMonth, monthLabelOf, defaultHow, assignPreview, workoutsOf } from '../plan-weeks.js';
import { dateKey, nextMonday, scheduledPlan, WEEKDAY_SHORT, sessionQueue } from '../program-timeline.js';
import { WeekPreview, ProgramDates, DayPicker, FirstWeekPicker, firstWeekDefault, weekdayOf, RhythmPicker, sessionRows } from '../client/PlanWeeks.jsx';
import { TEMPLATE_GOALS, PLACES, minutesText, timesText } from '../client/programs-model.js';

/**
 * Библиотека тренера: шаблоны программ и тренировок, упражнения.
 *
 * Ради скорости: тренер один раз придумывает программы под разные цели и
 * потом за минуту раскладывает их клиентам — «Назначить клиенту», — а не
 * пишет каждую программу с нуля. Назначенное правится под человека уже в
 * его программе, шаблон остаётся нетронутым.
 *
 * Свои шаблоны можно выложить в общий доступ («Поделиться»), и другие
 * тренеры увидят их с именем автора. Чужой общий шаблон не правится на
 * месте — его копируют к себе и правят копию.
 */

export const LIBRARY_PANES = [
  { value: 'program', label: 'Программы' },
  { value: 'workout', label: 'Тренировки' },
  { value: 'exercises', label: 'Упражнения' },
  // Тренажёры клуба (владелец, 09.10.2026): все записанные у упражнений —
  // одним списком, с фото и тем, где регулировки
  { value: 'machines', label: 'Тренажёры' },
  // Блюда для рациона клиентов: черновики на проверку, публикация, правка
  { value: 'dishes', label: 'Блюда' },
  { value: 'foods', label: 'Продукты' },
];

export { MACHINE_KIND_ITEMS } from './MachinesEditor.jsx';

const SCOPES = [
  { value: 'mine', label: 'Мои' },
  { value: 'public', label: 'Общие' },
];

// Тот же список задаёт порядок групп в «Программах тренера» у клиента
const GOALS = TEMPLATE_GOALS;
const OWN_GOAL = '__own';

/**
 * Цель — выбором из частых, а редкую можно вписать: «Своя» открывает поле.
 * Одинаковые цели у шаблонов важны для фильтра в списке — поэтому сначала
 * предлагаем готовые, а не пустое поле, где каждый напишет по-своему.
 */
function GoalPicker({ value, onChange }) {
  const custom = !!value && !GOALS.includes(value);
  const [own, setOwn] = useState(custom);
  const items = [{ value: '', label: 'Без цели' }, ...GOALS.map((g) => ({ value: g, label: g })), { value: OWN_GOAL, label: 'Своя' }];

  return (
    <div>
      <span className="field__label">Цель</span>
      <Segmented
        wrap
        label="Цель"
        items={items}
        value={own ? OWN_GOAL : value}
        onChange={(v) => {
          if (v === OWN_GOAL) { setOwn(true); onChange(custom ? value : ''); return; }
          setOwn(false);
          onChange(v);
        }}
      />
      {own && (
        <Field label="Своя цель" inputMode="text" placeholder="Например, подготовка к забегу" value={value} onChange={onChange} />
      )}
    </div>
  );
}
const LEVELS = [
  { value: '', label: 'Любой' },
  { value: 'Новичок', label: 'Новичок' },
  { value: 'Средний', label: 'Средний' },
  { value: 'Опытный', label: 'Опытный' },
];

// Карточка программы для клиентов (FT-497): где, сколько раз в неделю
const PLACE_ITEMS = [{ value: '', label: 'Не указано' }, ...Object.entries(PLACES).map(([value, label]) => ({ value, label }))];
const DAY_ITEMS = [{ value: '', label: '—' }, ...[1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n) }))];

/** «зал · 3 раза в неделю · ≈ 45 мин» — строкой в списке и в карточке шаблона */
function cardLine(t) {
  return [PLACES[t.place] && PLACES[t.place].toLowerCase(), t.days && timesText(t), minutesText(t)].filter(Boolean).join(' · ');
}

export default function Library({ pane, owner = false, onOpenClient = null }) {
  if (pane === 'foods') return owner ? <FoodCatalog /> : <Note>Общий справочник проверяет владелец сервиса.</Note>;
  if (pane === 'dishes') return <Dishes />;
  if (pane === 'machines') return <Machines />;
  return pane === 'exercises' ? <Exercises /> : <Templates key={pane} kind={pane} owner={owner} onOpenClient={onOpenClient} />;
}

/* ==========================================================================
 * Шаблоны
 * ========================================================================== */

function Templates({ kind, owner, onOpenClient }) {
  const [scope, setScope] = useState('mine');
  const [q, setQ] = useState('');
  const [goal, setGoal] = useState('');
  const [open, setOpen] = useState(null);       // id шаблона
  const [editing, setEditing] = useState(null); // шаблон или { new: true }
  const [assigning, setAssigning] = useState(null);
  const [pruning, setPruning] = useState(false); // режим «Править список»
  const [failure, setFailure] = useState(null);

  const list = useData('library.templates', { scope, kind }, [scope, kind]);

  // Смахнули или нажали «Удалить» в правке списка — пропадает сразу, на
  // сервер через несколько секунд, если не вернули (pendingDelete.jsx)
  const del = usePendingDelete((t) => apiMutate('library.template.delete', { id: t.id }), {
    onDone: () => { haptic('success'); list.reload(); },
    onError: setFailure,
  });
  const remove = (t) => { setFailure(null); del.remove(t.id, t, 'Шаблон удалён'); };

  // Правка шаблона с несохранённым: смахнуть от края нельзя, стрелка и
  // системный Back спрашивают «Выйти без сохранения?» — раньше правка
  // пропадала от случайного жеста (аудит 24.10.2026)
  const [editorDirty, setEditorDirty] = useState(false);
  const closeEditor = () => { setEditing(null); setEditorDirty(false); };
  const editorGuard = useLeaveGuard(editorDirty, closeEditor);

  // Вложенные экраны закрываются смахиванием вправо, как всё остальное
  useBackGesture(editorGuard.leave, !!editing, null, { swipe: !editorDirty });
  useBackGesture(() => setAssigning(null), !editing && !!assigning);
  useBackGesture(() => setOpen(null), !editing && !assigning && !!open);
  // Из карточки шаблона — обратно на то же место списка
  useReturnScroll(!!(editing || assigning || open));

  // Программа — новым редактором (этап 3 макета, 17.11.2026, ProgramEditor.jsx);
  // шаблон одной тренировки — прежним TemplateEditor
  if (editing && kind === 'program') {
    return (
      <ProgramEditor
        template={editing.new ? null : editing}
        onCancel={editorGuard.leave}
        confirm={editorGuard.confirm}
        onDirty={setEditorDirty}
        onSaved={(saved) => { closeEditor(); setOpen(saved.id); setScope('mine'); list.reload(); }}
      />
    );
  }

  if (editing) {
    return (
      <TemplateEditor
        kind={kind}
        template={editing.new ? null : editing}
        onCancel={editorGuard.leave}
        confirm={editorGuard.confirm}
        onDirty={setEditorDirty}
        onSaved={(saved) => { closeEditor(); setOpen(saved.id); setScope('mine'); list.reload(); }}
      />
    );
  }

  // Программа — новым «Назначить клиенту» (этап 4 макета, 17.11.2026, ProgramAssign.jsx);
  // шаблон одной тренировки — прежним AssignToClient
  if (assigning && kind === 'program') {
    return <ProgramAssign template={assigning} owner={owner} backText={open ? 'К программе' : 'Программы'} onBack={() => setAssigning(null)}
      onOpenClient={onOpenClient ? (c) => onOpenClient(c, 'plan') : null} />;
  }

  if (assigning) {
    return <AssignToClient template={assigning} owner={owner} backText={open ? (kind === 'program' ? 'К программе' : 'К шаблону') : 'Программы'} onDone={() => setAssigning(null)} onCancel={() => setAssigning(null)} />;
  }

  // Программа — новым экраном (этап 2 макета, 17.11.2026, ProgramView.jsx)
  if (open && kind === 'program') {
    return (
      <ProgramView
        id={open}
        onBack={() => setOpen(null)}
        onEdit={(t) => setEditing(t)}
        onAssign={(t) => setAssigning(t)}
        onCopied={(t) => { setScope('mine'); setOpen(t.id); list.reload(); }}
        onDeleted={(t) => { setOpen(null); remove(t); }}
        onSavedWorkout={() => list.reload()}
        onOpenClient={onOpenClient ? (c) => onOpenClient(c, 'plan') : null}
      />
    );
  }

  if (open) {
    return (
      <TemplateView
        id={open}
        onBack={() => setOpen(null)}
        onEdit={(t) => setEditing(t)}
        onAssign={(t) => setAssigning(t)}
        onCopied={(t) => { setScope('mine'); setOpen(t.id); list.reload(); }}
        onDeleted={(t) => { setOpen(null); remove(t); }}
        onSavedWorkout={() => list.reload()}
      />
    );
  }

  // Программы — новым списком (согласован 17.11.2026, ProgramList.jsx):
  // смахнуть — «Назначить» и «Удалить», «+» — лист «Новая программа»
  if (kind === 'program') {
    return (
      <ProgramList
        list={list}
        scope={scope}
        onScope={setScope}
        failure={failure}
        onOpen={(t) => setOpen(t.id)}
        onAssign={(t) => setAssigning(t)}
        onRemove={remove}
        hidden={del.hidden}
        bar={del.bar}
        onBlank={() => setEditing({ new: true })}
        onCreated={(t) => { setScope('mine'); list.reload(); setOpen(t.id); }}
      />
    );
  }

  const noun = kind === 'program' ? 'программы' : 'тренировки';
  const all = list.data ? list.data.templates : [];
  const shown = all
    .filter((t) => !goal || t.goal === goal)
    .filter((t) => !q || (t.title + ' ' + t.goal).toLowerCase().includes(q.toLowerCase()));
  const goals = list.data ? list.data.goals : [];

  // Один порядок во всех вкладках «Шаблонов»: действия → чьи → поиск →
  // фильтры → сколько найдено → список. Новый шаблон сохраняется в «Мои»,
  // поэтому кнопка есть и в «Общих» — ряд не прыгает при переключении.
  return (
    <>
      <div className="library__bar">
        <button className="button button--primary" disabled={pruning} onClick={() => setEditing({ new: true })}>
          {kind === 'program' ? 'Новый шаблон программы' : 'Новый шаблон тренировки'}
        </button>
        {scope === 'mine' && all.length > 0 && (
          <button className="button" aria-pressed={pruning} onClick={() => { setPruning(!pruning); haptic(); }}>
            {pruning ? 'Готово' : 'Править'}
          </button>
        )}
      </div>
      <Segmented items={SCOPES} value={scope} onChange={(v) => { setScope(v); setPruning(false); haptic(); }} label="Чьи шаблоны" track />
      {failure && <Note tone="critical" icon={IconAlert}>{failure.message}</Note>}

      <Search value={q} onChange={setQ} placeholder="Поиск по названию и цели" />
      {goals.length > 1 && (
        <Chips className="library__filters" items={[{ value: '', label: 'Все цели' }, ...goals.map((g) => ({ value: g, label: g }))]} value={goal} onChange={setGoal} />
      )}
      {!list.loading && !list.error && shown.length > 0 && (
        <div className="library__count">
          <p>{shown.length} {plural(shown.length, 'шаблон', 'шаблона', 'шаблонов')}</p>
        </div>
      )}

      {list.loading && <Loading lead={false} rows={3} />}
      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}

      {/* Поиск или фильтр без совпадений — не «шаблонов пока нет»: они
          есть, просто не под этот запрос (аудит 24.10.2026) */}
      {!list.loading && !list.error && shown.length === 0 && all.length > 0 && (
        <Empty
          icon={IconSearch}
          title="Ничего не нашлось"
          text={q ? 'По запросу «' + q + '»' + (goal ? ' с целью «' + goal + '»' : '') + ' шаблонов нет.' : 'С целью «' + goal + '» шаблонов нет.'}
          action={<button type="button" className="button" onClick={() => { setQ(''); setGoal(''); }}>Сбросить</button>}
        />
      )}
      {!list.loading && !list.error && all.length === 0 && (
        <Empty
          icon={scope === 'mine' ? IconPlan : IconSearch}
          title={scope === 'mine' ? `Своих шаблонов ${noun} пока нет` : 'Общих шаблонов пока нет'}
          text={scope === 'mine'
            ? 'Создайте шаблон здесь или сохраните программу клиента как шаблон — из его карточки, в разделе «Тренировки».'
            : 'Здесь появятся шаблоны, которыми поделились другие тренеры.'}
        />
      )}

      {shown.filter((t) => !del.hidden(t.id)).map((t) => (
        <Row
          key={t.id}
          pruning={pruning && t.mine}
          canRemove={t.mine}
          onOpen={() => { setOpen(t.id); haptic(); }}
          onRemove={() => remove(t)}
          removeLabel={`Удалить «${t.title}»`}
        >
          <div className="item__top">
            <span className="item__name">{t.title}</span>
            {t.goal && <Tag>{t.goal}</Tag>}
          </div>
          <div className="item__meta">
            <span>
              {[
                kind === 'program' && t.workouts + ' ' + plural(t.workouts, 'тренировка', 'тренировки', 'тренировок'),
                t.exercises + ' ' + plural(t.exercises, 'упражнение', 'упражнения', 'упражнений'),
                t.level,
                kind === 'program' && cardLine(t),
                !t.mine && 'автор: ' + t.author,
              ].filter(Boolean).join(' · ')}
            </span>
            {t.mine && t.forClients && <Tag tone="good">клиентам</Tag>}
            {t.mine && t.isPublic && <Tag tone="good">поделились</Tag>}
          </div>
        </Row>
      ))}
      {del.bar}
    </>
  );
}

/**
 * Строка списка. Своё смахивается влево — удалить, как в списках iPhone.
 * В режиме правки строка не открывается, а показывает кнопку удаления:
 * так удаляют сразу несколько, не заходя в каждое.
 */
function Row({ pruning, canRemove = true, onOpen, onRemove, removeLabel, removeText = 'Удалить', children }) {
  if (!pruning) {
    const item = <button className="item" onClick={onOpen}>{children}</button>;
    if (!canRemove || !onRemove) return item;
    return (
      <SwipeRow className="item-swipe" label={removeLabel} actionText={removeText} onDelete={onRemove}>
        {item}
      </SwipeRow>
    );
  }
  return (
    <div className="item library__row">
      <div className="library__row-body">{children}</div>
      <button className="button button--ghost danger library__remove" aria-label={removeLabel} onClick={onRemove}>
        <IconTrash size={16} />
        {removeText}
      </button>
    </div>
  );
}

// Тот же «назад», что у остальных экранов (ui.jsx, 17 px): 14-й кегль
// здесь выглядел сноской рядом с заголовком (аудит 24.10.2026)
function Back({ onClick, children = 'Назад' }) {
  return <BackButton label={children} onClick={onClick} />;
}

/** Упражнение одной строкой: «Жим гантелей лёжа — 3×12, 20 кг» */
function exerciseLine(e) {
  // Кардио — целями, режимом и интервалами, а не «подходы × повторы»
  if (e.cardio) return `${e.name} — ${cardioLine(e.cardio, trackOf(e))}`;
  const volume = [e.sets, planText(e.reps)].filter(Boolean).join('×');
  const w = planText(e.weight);
  const extra = [volume, w && w + (/\d$/.test(w) ? ' кг' : '')].filter(Boolean).join(', ');
  return extra ? `${e.name} — ${extra}` : e.name;
}

function BlocksPreview({ blocks, action }) {
  return blocks.map((b, i) => (
    <Section key={i} title={b.title} action={action ? action(b, i) : null}>
      <Panel pad>
        <ol className="library__exercises">
          {b.exercises.map((e, j) => (
            <li key={j} className={e.supersetGroup ? 'library__superset' : undefined}>{exerciseLine(e)}</li>
          ))}
        </ol>
      </Panel>
    </Section>
  ));
}

function TemplateView({ id, onBack, onEdit, onAssign, onCopied, onDeleted, onSavedWorkout }) {
  const { loading, data, error, reload } = useData('library.template.get', { id }, [id]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const [savedBlocks, setSavedBlocks] = useState({}); // номер тренировки → сохранена

  if (loading) return <><Back onClick={onBack} /><Loading rows={3} /></>;
  if (error) return <><Back onClick={onBack} /><ErrorState error={error} onRetry={reload} /></>;

  const t = data;

  const act = async (fn) => {
    setBusy(true);
    setFailure(null);
    try { await fn(); } catch (err) { setFailure(err); } finally { setBusy(false); }
  };

  return (
    <>
      <Back onClick={onBack} />

      <Panel pad>
        <h2 className="library__title">{t.title}</h2>
        <div className="item__meta library__meta">
          {t.goal && <Tag>{t.goal}</Tag>}
          <span>{[t.level, t.kind === 'program' && cardLine(t), t.mine ? (t.isPublic ? 'ваш · в общем доступе' : 'ваш') : 'автор: ' + t.author].filter(Boolean).join(' · ')}</span>
          {t.mine && t.forClients && <Tag tone="good">видят ваши клиенты</Tag>}
        </div>
        {t.description && <p className="small" style={{ marginTop: 0 }}>{t.description}</p>}

        <div className="library__actions">
          <button className="button button--primary" disabled={busy} onClick={() => onAssign(t)}>
            Назначить клиенту
          </button>
          {t.mine && <button className="button" disabled={busy} onClick={() => onEdit(t)}>Изменить</button>}
          {!t.mine && (
            <button className="button" disabled={busy} onClick={() => act(async () => {
              const copy = await apiMutate('library.template.copy', { id: t.id });
              haptic('success');
              onCopied(copy);
            })}>Скопировать к себе</button>
          )}
          {/* Как из списка: удаляется сразу, в списке — «Шаблон удалён ·
              Вернуть», без системного окна window.confirm (аудит 24.10.2026) */}
          {t.mine && (
            <button className="button button--ghost danger" disabled={busy} onClick={() => onDeleted(t)}>Удалить</button>
          )}
        </div>
        {failure && <Note tone="critical" icon={IconAlert}>{failure.message}</Note>}
      </Panel>

      {t.kind === 'program' && (
        <p className="small muted library__hint">
          Любую тренировку программы можно сохранить отдельным шаблоном — она появится в разделе «Тренировки».
        </p>
      )}

      <BlocksPreview
        blocks={t.blocks}
        action={t.kind === 'program' ? (block, i) => (
          savedBlocks[i]
            ? <span className="library__saved"><IconCheck size={14} />В «Тренировках»</span>
            : (
              <button className="button button--ghost library__save-block" disabled={busy} onClick={() => act(async () => {
                // Своя копия тренировки: из чужого общего шаблона тоже —
                // править её можно будет только так
                await apiMutate('library.template.save', {
                  kind: 'workout',
                  title: block.title || t.title,
                  goal: t.goal || '',
                  level: t.level || '',
                  description: 'Из программы «' + t.title + '»',
                  blocks: [block],
                });
                haptic('success');
                setSavedBlocks((s) => ({ ...s, [i]: true }));
                if (onSavedWorkout) onSavedWorkout();
              })}>В «Тренировки»</button>
            )
        ) : null}
      />
    </>
  );
}

function TemplateEditor({ kind, template, onSaved, onCancel, confirm = null, onDirty }) {
  const [title, setTitle] = useState(template ? template.title : '');
  const [goal, setGoal] = useState(template ? template.goal : '');
  const [level, setLevel] = useState(template ? template.level : '');
  const [description, setDescription] = useState(template ? template.description : '');
  const [isPublic, setPublic] = useState(template ? template.isPublic : false);
  // Карточка для клиентов (FT-497). Минуты: пусто — сервер посчитает по
  // упражнениям (minutesAuto), тогда в поле не подставляем посчитанное
  const [place, setPlace] = useState(template ? template.place || '' : '');
  const [days, setDays] = useState(template && template.days ? String(template.days) : '');
  const [minutes, setMinutes] = useState(template && template.minutes && !template.minutesAuto ? String(template.minutes) : '');
  const [forClients, setForClients] = useState(template ? !!template.forClients : false);

  const blocks = template
    ? template.blocks
    : [{ title: kind === 'workout' ? 'Тренировка' : 'Тренировка № 1', exercises: [] }];

  // Есть ли что терять при выходе: поля карточки против открытых значений
  // и тренировки (PlanEditor сообщает сам)
  const [blocksDirty, setBlocksDirty] = useState(false);
  const [initial] = useState(() => JSON.stringify([title, goal, level, description, isPublic, place, days, minutes, forClients]));
  const dirty = blocksDirty || JSON.stringify([title, goal, level, description, isPublic, place, days, minutes, forClients]) !== initial;
  useEffect(() => { if (onDirty) onDirty(dirty); }, [dirty]);

  // Программа собирается и из шаблонов тренировок — копиями со ссылкой
  const workouts = useData('library.templates', { kind: 'workout' }, []);
  const workoutList = kind === 'program' && workouts.data
    ? workouts.data.templates.map((t) => ({ id: t.id, title: t.title }))
    : null;

  // Правка шаблона тренировки, стоящего в программах: спросить, обновить ли
  // копии. Ответ ждёт сохранение — кнопка крутится, пока тренер решает.
  const [ask, setAsk] = useState(null); // { programs, resolve }

  const submit = async (clean, weekLength) => {
    let propagate = false;
    if (kind === 'workout' && template) {
      const usage = await apiPublic('library.template.usage', { id: template.id });
      if (usage.programs.length) {
        propagate = await new Promise((resolve) => setAsk({ programs: usage.programs, resolve }));
        setAsk(null);
      }
    }
    return apiMutate('library.template.save', {
      id: template ? template.id : undefined,
      kind,
      title: title.trim(),
      goal,
      level,
      description,
      isPublic,
      ...(kind === 'program' ? { place, days, minutes, forClients } : {}),
      blocks: clean,
      weekLength,
      propagate,
    });
  };

  return (
    <>
      {/* Сверху — куда ведёт стрелка, как у соседних экранов библиотеки
          («К шаблону», «Тренажёры»); «Отмена» была и здесь, и в плавающей
          панели редактора — дубль убран 20.10.2026 (QA C05b) */}
      <Back onClick={onCancel}>{template ? 'К шаблону' : 'К шаблонам'}</Back>
      {confirm}

      <Panel pad>
        <div className="library__form">
          <Field label="Название" inputMode="text" placeholder={kind === 'program' ? 'Похудение, 3 раза в неделю' : 'Верх тела'} value={title} onChange={setTitle} />
          <GoalPicker value={goal} onChange={setGoal} />

          {/* Уровень — у программы (владелец, 16.10.2026): у шаблона одной
              тренировки его нет; у уже заведённого значение сохраняется */}
          {kind === 'program' && <div>
            <span className="field__label">Уровень</span>
            <Segmented items={LEVELS} value={level} onChange={setLevel} label="Уровень" />
          </div>}

          {/* Метки карточки для клиентов (FT-497): «45 мин · зал · 2 раза в неделю» */}
          {kind === 'program' && <div>
            <span className="field__label">Где заниматься</span>
            <Segmented items={PLACE_ITEMS} value={place} onChange={setPlace} label="Где заниматься" />
          </div>}
          {kind === 'program' && <div>
            <span className="field__label">Раз в неделю</span>
            <Segmented wrap items={DAY_ITEMS} value={days} onChange={setDays} label="Раз в неделю" />
          </div>}
          {kind === 'program' && (
            <Field
              label="Минут на тренировку"
              inputMode="numeric"
              value={minutes}
              onChange={(v) => setMinutes(v.replace(/\D/g, '').slice(0, 3))}
              placeholder={template && template.minutesAuto ? '≈ ' + template.minutes + ' — по упражнениям' : 'Посчитаем по упражнениям'}
              hint="Пусто — посчитаем по подходам и отдыху; клиент увидит с «≈»"
            />
          )}

          <label className="field">
            <span className="field__label">Описание</span>
            <textarea
              className="field__input library__textarea"
              value={description}
              maxLength={1000}
              placeholder={kind === 'program' ? 'Для кого и как вести: частота, прогрессия, на что обратить внимание' : 'На что обратить внимание в этой тренировке'}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          {kind === 'program' && (
            <label className="library__check">
              <input type="checkbox" checked={forClients} onChange={(e) => setForClients(e.target.checked)} />
              <span>
                Показывать моим клиентам
                <span className="small muted"> — в «Тренировках» → «Программы тренера»: клиент увидит карточку и состав и сможет попросить эту программу, назначаете вы</span>
              </span>
            </label>
          )}

          <label className="library__check">
            <input type="checkbox" checked={isPublic} onChange={(e) => setPublic(e.target.checked)} />
            <span>
              Поделиться с другими тренерами
              <span className="small muted"> — увидят с вашим именем и смогут скопировать себе</span>
            </span>
          </label>
        </div>
      </Panel>

      <Section title={kind === 'program' ? 'Тренировки' : 'Упражнения'}>
        <PlanEditor
          blocks={blocks}
          weekLength={template && template.weekLength || 0}
          storeKey={template && template.id ? 'tpl' + template.id : ''}
          single={kind === 'workout'}
          submitLabel="Сохранить шаблон"
          workoutTemplates={workoutList}
          onSubmit={submit}
          onDirty={setBlocksDirty}
          onSaved={(saved) => { haptic('success'); onSaved(saved); }}
        />
        {ask && (
          <Panel pad>
            <div className="library__form">
              <strong>Эта тренировка стоит в программах</strong>
              <p className="small" style={{ margin: 0 }}>
                {ask.programs.map((p) => '«' + p.title + '»').join(', ')}. Обновить её там тоже?
                Программы, уже выданные клиентам, не изменятся в любом случае.
              </p>
              <div className="library__actions">
                <button className="button button--primary" onClick={() => ask.resolve(true)}>Обновить в программах</button>
                <button className="button" onClick={() => ask.resolve(false)}>Только этот шаблон</button>
              </div>
            </div>
          </Panel>
        )}
      </Section>
    </>
  );
}

/* ==========================================================================
 * Назначить клиенту
 * ========================================================================== */

/**
 * Шаблон — клиенту: в какой месяц и как клиент по нему пойдёт (FT-775,
 * решения владельца 28.10.2026).
 *
 * Шаблон без недель: «одна неделя по кругу» (все тренировки каждую неделю,
 * умолчание при 2–4 тренировках), «разложить на недели» (по порядку
 * поровну) или «просто списком» (как раньше; умолчание иначе) — с
 * предпросмотром по циклам месяца. Шаблон по неделям: тот же, что в прошлом
 * месяце, — «Продолжить» с недели, на которой тот кончился (подставляется
 * само), или «Заново»; новый — с первой. «Дописать в месяц» — когда в месяце
 * уже есть тренировки или назначается шаблон одной тренировки. В «было» у
 * упражнений сервер кладёт последний вес клиента.
 */
export function AssignForm({ template, clientRow, clientName = '', defaultMonth, onDone }) {
  // Из пожелания клиента (Wishes.jsx) шаблон приходит без тренировок — дочитать
  const [tpl, setTpl] = useState(template);
  useEffect(() => {
    if (template.blocks) { setTpl(template); return; }
    let alive = true;
    apiPublic('library.template.get', { id: template.id })
      .then((t) => { if (alive) setTpl(t && t.template ? t.template : t); })
      .catch(() => {});
    return () => { alive = false; };
  }, [template]);
  const blocks = (tpl && tpl.blocks) || [];

  const weeks = Math.max(programLength(blocks), Number(tpl && tpl.weekLength) || 0);

  const thisMonth = monthName();
  const nextMonth = nextMonthLabel(thisMonth);
  const [month, setMonth] = useState(defaultMonth || thisMonth);
  const [custom, setCustom] = useState(false);
  const monthChips = [...new Set([defaultMonth, thisMonth, nextMonth].filter(Boolean))];
  const [mode, setMode] = useState(template.kind === 'workout' ? 'append' : 'replace');
  const [how, setHow] = useState(''); // '' — умолчание по шаблону (defaultHow)
  const [length, setLength] = useState(2);
  const [startsInput, setStartsInput] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [days, setDays] = useState([]);
  const [firstPick, setFirstPick] = useState(''); // '' — по умолчанию: по дням, если они есть, иначе по порядку
  // Ритм (FT-788): занятий в неделю или чередование; one — номер занятия «всегда одно»
  const [beat, setBeat] = useState({ rhythm: [], rhythmDays: [], one: '' });
  const [loadAccepted, setLoadAccepted] = useState(false);
  const [startWeek, setStartWeek] = useState(''); // '' — само (сервер: продолжить или с первой)
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);

  const label = month.trim();
  const cycles = monthWeeks(label) || [];
  const startsOn = startsInput || (cycles[0] && cycles[0].start > dateKey() ? cycles[0].start : nextMonday());
  const info = useData('plan.assign.info', { clientRow, month: label || '—', templateId: template.id, startsOn }, [clientRow, label, template.id, startsOn]);
  const facts = info.data && info.data.month === label ? info.data : null;
  const who = clientName || 'клиент';
  // Родительный падеж месяца — по воскресенью первого цикла: оно всегда в этом месяце (правило четверга)
  const monthWord = label.split(' ')[0];

  const howNow = how || defaultHow(blocks);
  const prev = facts && facts.prev;
  const same = !!(prev && prev.same);
  const continueWeek = same ? prev.continueWeek : 1;
  const chosenStart = startWeek === '' ? continueWeek : Number(startWeek);
  const replacing = mode === 'replace';
  const legacyPreview = replacing
    ? assignPreview(weeks ? { blocks, month: label, startWeek: chosenStart } : { blocks, month: label, how: howNow, length })
    : [];
  const weekly = replacing && (weeks > 0 || howNow !== 'list');
  const laid = weekly ? (weeks ? blocks : blocks.map((b, i) => ({ ...b, week: howNow === 'cycle' ? 1 : Math.min(length, Math.ceil((i + 1) * length / blocks.length)) }))) : [];
  const size = weeks || (howNow === 'cycle' ? 1 : length);
  const alternate = beat.rhythm.length > 1;
  // У недель чередования свои дни; первая неделя считается по дням первой недели ритма
  const weekDays = alternate ? (beat.rhythmDays[0] || []) : days;
  const firstWeek = firstPick === 'days' && !weekDays.length ? firstWeekDefault(weekDays) : firstPick || firstWeekDefault(weekDays);
  const midWeek = weekly && startsOn && weekdayOf(startsOn) !== 1;
  // Тренировкам шаблона нет id — для предпросмотра ритма временные
  const laidIds = laid.map((b, i) => ({ ...b, id: b.id || 'p' + i }));
  const queue = weekly ? sessionQueue(laidIds) : [];
  const oneId = beat.one !== '' && queue[beat.one] ? queue[beat.one][0].id : '';
  const startWeekBlocks = !weekly ? [] : beat.rhythm.length
    ? Array.from({ length: Math.min(beat.rhythm[0], queue.length) }, (_, i) => queue[i]).flat()
    : laid.filter((b) => (Number(b.week) || 1) === (((chosenStart - 1) % size) + 1));
  const rhythmCfg = beat.rhythm.length ? { rhythm: beat.rhythm, ...(alternate ? { rhythmDays: beat.rhythmDays } : {}), ...(oneId ? { oneSession: oneId } : {}) } : {};
  const preview = weekly ? scheduledPlan({ blocks: laidIds, sessions: [], month: label, cfg: { schedule: 1, startsOn, endsOn, startWeek: chosenStart, length: size, days: alternate ? [] : days, firstWeek, ...rhythmCfg }, today: new Date(startsOn + 'T12:00:00') }).weeks.slice(0, 4)
    .map((w) => ({ ...w, titles: sessionRows(w.rows).map((g) => { const r = g[0]; return (r.day ? WEEKDAY_SHORT[r.day] + ' ' : '') + g.map((x) => x.block.title).join(' + ') + (r.shifted ? (r.required > 1 ? ' ×2 (одна — с прошлой недели)' : ' (с прошлой недели)') : ''); }) })) : legacyPreview;
  const heavy = weekly && preview.some((w) => w.need > 6);

  const apply = async () => {
    setBusy(true);
    setFailure(null);
    try {
      await apiMutate('plan.fromTemplate', {
        clientRow, month: label, templateId: template.id, mode,
        ...(weekly ? { effectiveOn: startsOn, weeks: { schedule: 1, startsOn, endsOn, effectiveOn: startsOn, length: size, days: alternate ? [] : days, firstWeek,
          rhythm: beat.rhythm, rhythmDays: alternate ? beat.rhythmDays.slice(0, beat.rhythm.length).map((d) => d || []) : [], ...(beat.one !== '' && oneId ? { oneSessionAt: beat.one } : {}) } } : {}),
        ...(replacing && !weeks ? { how: howNow, ...(howNow === 'split' ? { length } : {}) } : {}),
        ...(weekly ? { startWeek: chosenStart } : {}),
      });
      haptic('success');
      onDone(label);
    } catch (err) {
      setFailure(err);
    } finally {
      setBusy(false);
    }
  };

  // Линия недель: прошлый месяц и этот — какая неделя программы в каком цикле
  const timeline = same && weeks > 1 && cycles.length ? (
    <div className="wk-tl" aria-hidden="true">
      <em>{prev.month.split(' ')[0].slice(0, 3).toLowerCase()}</em>
      {Array.from({ length: prev.cycles }, (_, i) => ((prev.startWeek - 1 + i) % prev.length) + 1).map((w, i) => (
        <i key={'p' + i} className={i === prev.cycles - 1 ? 'is-on' : ''}>{w}</i>
      ))}
      <em>{monthWord.slice(0, 3).toLowerCase()}</em>
      {cycles.map((_, i) => <i key={'n' + i} className="is-next">{((chosenStart - 1 + i) % weeks) + 1}</i>)}
    </div>
  ) : null;

  return (
    <div className="library__form wk-rows">
      <div className="wk-rows__item">
        <strong>Раздел истории программы</strong>
        {custom
          ? <Field label="Как месяц называется у клиента" inputMode="text" value={month} onChange={setMonth} hint="Нет такого — появится" />
          : (
            <Chips
              items={[...monthChips.map((m) => ({ value: m, label: m })), { value: '__other', label: 'Другой…' }]}
              value={month}
              label="Месяц программы"
              onChange={(v) => { if (v === '__other') { setCustom(true); setMonth(''); } else setMonth(v); haptic(); }}
            />
          )}
        <span>
          {cycles.length ? 'Месяц группирует историю. Срок программы задаётся отдельно. ' : label ? 'Месяц не по календарю — без циклов и оценок. ' : ''}
          {facts ? (facts.count ? `${monthWord}: у клиента уже ${workoutsOf(facts.count)}.` : `${monthWord}: у клиента пока пусто.`) : ''}
        </span>
      </div>

      {(template.kind === 'workout' || (facts && facts.count > 0)) && (
        <div className="wk-rows__item">
          <strong>Как назначить</strong>
          <Segmented
            items={[{ value: 'replace', label: 'Новая программа' }, { value: 'append', label: 'Дописать в месяц' }]}
            value={mode}
            onChange={(v) => { haptic(); setMode(v); }}
            label="Как назначить"
          />
          <span>{replacing ? 'Начало действия задаётся ниже. Прежняя версия сохранится до этой даты.' : 'Тренировки шаблона добавятся в конец месяца, остальное останется.'}</span>
        </div>
      )}

      {replacing && !weeks && blocks.length > 0 && (
        <div className="wk-rows__item">
          <strong>Как {who} пойдёт по программе</strong>
          <div className="wk-opts" role="radiogroup" aria-label="Как клиент пойдёт по программе">
            {[
              { value: 'cycle', title: 'Одна неделя по кругу', text: `Все ${workoutsOf(blocks.length)} — каждую неделю. За неделю — оценка «выполнена».` },
              { value: 'split', title: 'Разложить на недели', text: 'Разные тренировки в разные недели — по порядку поровну. Потом можно перенести.' },
              { value: 'list', title: 'Просто списком на месяц', text: `Как раньше: очередь из ${blocks.length} ${blocks.length % 10 === 1 && blocks.length % 100 !== 11 ? 'тренировки' : 'тренировок'}, без циклов и оценок.` },
            ].map((o) => (
              <button type="button" role="radio" aria-checked={howNow === o.value} className="wk-opt" key={o.value} onClick={() => { haptic(); setHow(o.value); }}>
                <span className="wk-opt__mark" aria-hidden="true">{howNow === o.value && <IconCheck size={12} />}</span>
                <span className="wk-opt__body">
                  <strong>{o.title}</strong>
                  <span>{o.text}</span>
                  {o.value === 'split' && howNow === 'split' && (
                    <Segmented items={[2, 3, 4].map((n) => ({ value: n, label: String(n) }))} value={length} label="На сколько недель" track onChange={(n) => { haptic(); setLength(n); }} />
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {replacing && weeks > 1 && (
        <div className="wk-rows__item">
          <strong>С какой недели начнёт</strong>
          <span>
            {same
              ? `${prev.month.split(' ')[0]}: у клиента эта же программа, кончается на неделе ${((prev.startWeek - 1 + prev.cycles - 1) % prev.length) + 1} — ${monthWord.toLowerCase()} продолжит с недели ${continueWeek}.`
              : 'Новая для клиента программа — с первой недели.'}
          </span>
          {timeline}
          <Segmented
            items={same
              ? [{ value: '', label: `Продолжить · с ${continueWeek}-й` }, { value: 1, label: 'Заново · с 1-й' }]
              : Array.from({ length: weeks }, (_, i) => ({ value: i === 0 ? '' : i + 1, label: `С ${i + 1}-й` }))}
            value={startWeek}
            onChange={(v) => { haptic(); setStartWeek(v); }}
            label="С какой недели начнёт"
            track
          />
        </div>
      )}

      {weekly && (
        <div className="wk-rows__item">
          <strong>Начало</strong>
          <Chips
            items={[...new Set([dateKey(), nextMonday()])].map((d) => ({ value: d, label: (d === dateKey() ? 'Сегодня, ' : '') + WEEKDAY_SHORT[weekdayOf(d)].toLowerCase() + ' ' + Number(d.slice(8)) }))}
            value={startsOn}
            label="Начало программы"
            onChange={(v) => { haptic(); setStartsInput(v); }}
          />
        </div>
      )}
      {weekly && <ProgramDates startsOn={startsOn} endsOn={endsOn} onStart={setStartsInput} onEnd={setEndsOn} />}
      {weekly && queue.length > 0 && (
        <RhythmPicker value={beat} onChange={setBeat} seedDays={days} count={sessionQueue(laid.filter((b) => (Number(b.week) || 1) === 1)).length}
          sessions={queue.map((g, i) => ({ key: i, title: g.map((b) => b.title).join(' + ') }))} />
      )}
      {weekly && !alternate && (
        <div className="wk-rows__item">
          <strong>Дни занятий</strong>
          <DayPicker value={days} onChange={setDays} />
          <span>{days.length ? `Занятия недели встают на эти дни по порядку${(beat.rhythm[0] || sessionQueue(startWeekBlocks).length) > days.length ? '; лишние — в любой день' : ''}. День — подсказка клиенту: сделал в другой — засчитано.` : 'Можно не указывать: тогда клиент занимается в любые дни недели.'}</span>
        </div>
      )}
      {midWeek && startWeekBlocks.length > 0 && <FirstWeekPicker startsOn={startsOn} days={weekDays} blocks={startWeekBlocks} value={firstWeek} onChange={setFirstPick} />}
      {weekly && <p className="small">{beat.rhythm.length ? (alternate ? `Ритм ${beat.rhythm.join(' · ')} по кругу.` : `${beat.rhythm[0]} в неделю, по кругу.`) : `${size} ${size === 1 ? 'неделя' : 'недели'} по кругу.`} {endsOn ? `До ${endsOn.split('-').reverse().join('.')}.` : 'До замены тренером, без ежемесячного назначения.'} Неполная неделя начала — без оценки пропусков.</p>}
      {heavy && <label className="library__check"><input type="checkbox" checked={loadAccepted} onChange={(e) => setLoadAccepted(e.target.checked)} /><span>В одной неделе больше 6 тренировок. Я проверил распределение и подтверждаю его.</span></label>}
      {replacing && (weeks > 0 || howNow !== 'list') && preview.length > 0 && (
        <WeekPreview rows={preview.map((c) => ({ key: c.n, label: `${c.from}–${c.to} ${c.monthGen.slice(0, 3)}${c.n === 1 && midWeek ? ' · неполная' : ''}`, titles: c.titles }))} />
      )}
      {replacing && !weeks && howNow === 'list' && blocks.length > 0 && (
        <WeekPreview rows={[{ key: 'list', label: 'Очередь', titles: blocks.map((b) => b.title) }]} />
      )}

      {replacing && (weeks > 0 || howNow !== 'list') && (
        <div className="wk-rows__item">
          <strong>Пропущенные тренировки</strong>
          <span>
            {same ? `Как в прошлом месяце: ${RULE_WORD[prev.rule] || RULE_WORD.client}.` : `${RULE_WORD.client[0].toUpperCase() + RULE_WORD.client.slice(1)} — доделать или пропустить.`}
            {' '}Поменять — в карточке клиента, «Настроить».
          </span>
        </div>
      )}

      {failure && <Note tone="critical" icon={IconAlert}>{failure.message}</Note>}
      <button className="button button--primary button--block" disabled={busy || !label || (weekly && !startsOn) || (heavy && !loadAccepted)} onClick={apply}>
        {busy ? 'Назначаем…' : weekly ? 'Назначить программу' : cycles.length ? `Назначить на ${monthWord.toLowerCase()}` : 'Назначить'}
      </button>
      <p className="small muted" style={{ margin: 0, textAlign: 'center' }}>Прошлые веса клиента подставятся в «было»</p>
    </div>
  );
}

const RULE_WORD = { client: `решает клиент`, redo: 'доделывать', skip: 'пропускать' };

/** «Октябрь 2026» → «Ноябрь 2026» */
function nextMonthLabel(label) {
  const p = parseMonth(label);
  return p ? monthLabelOf(p.year, p.month + 1) : '';
}

function AssignToClient({ template, owner, onDone, onCancel, backText = 'К шаблону' }) {
  const clients = useData('trainer.clients', {}, []);
  // Себя («Мои тренировки») — первым, как в журнале: в trainer.clients
  // карточки тренера нет, и шаблон себе было не назначить
  const self = useSelfCard(owner);
  const [q, setQ] = useState('');
  const [client, setClient] = useState(null);
  const [done, setDone] = useState(null);

  if (done) {
    return (
      <>
        <Back onClick={onDone}>{backText}</Back>
        <Empty
          icon={IconCheck}
          title="Назначено"
          text={self.card && done.client.row === self.card.clientRow
            ? `«${template.title}» — в ваших тренировках, ${done.month}. Поправить можно в разделе «Мои тренировки» бокового меню.`
            : `«${template.title}» — в программе ${done.client.name}, ${done.month}. Поправить под человека можно в его карточке, в разделе «Тренировки».`}
        />
      </>
    );
  }

  return (
    <>
      <Back onClick={client ? () => setClient(null) : onCancel}>{client ? 'Другой клиент' : backText}</Back>
      <Section title={client ? client.name : 'Кому назначить'} note={`«${template.title}»`}>
        {client ? (
          <Panel pad>
            <AssignForm template={template} clientRow={client.row} clientName={client.name.split(' ')[0]} onDone={(month) => setDone({ client, month })} />
          </Panel>
        ) : (
          <>
            <Search value={q} onChange={setQ} placeholder="Поиск клиента" />
            {clients.loading && <Loading lead={false} rows={4} />}
            {clients.error && <ErrorState error={clients.error} onRetry={clients.reload} />}
            {clients.data && [...(selfPick(self.card) ? [selfPick(self.card)] : []), ...clients.data.clients]
              .filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()))
              .map((c) => (
                <button className="item" key={c.row} onClick={() => { setClient(c); haptic(); }}>
                  <div className="item__top"><span className="item__name">{c.name}</span></div>
                  {c.note && <span className="item__meta">{c.note}</span>}
                </button>
              ))}
          </>
        )}
      </Section>
    </>
  );
}

/**
 * Из программы клиента: взять шаблон (свой или общий) и назначить. Живёт
 * в разделе «Тренировки» карточки клиента, рядом с «Изменить программу».
 */
export function TemplateApply({ clientRow, month, onApplied, onCancel }) {
  const [scope, setScope] = useState('mine');
  const [kind, setKind] = useState('program');
  const [picked, setPicked] = useState(null);
  const list = useData('library.templates', { scope, kind }, [scope, kind]);

  if (picked) {
    return (
      <Panel pad>
        <Back onClick={() => setPicked(null)}>Другой шаблон</Back>
        <p className="library__title" style={{ margin: '0 0 var(--space-3)' }}>{picked.title}</p>
        <AssignForm template={picked} clientRow={clientRow} defaultMonth={month} onDone={onApplied} />
      </Panel>
    );
  }

  return (
    <Panel pad>
      <div className="library__form">
        <Segmented items={[{ value: 'program', label: 'Программы' }, { value: 'workout', label: 'Тренировки' }]} value={kind} onChange={setKind} label="Вид шаблона" />
        <Segmented items={SCOPES} value={scope} onChange={setScope} label="Чьи шаблоны" />
      </div>

      {list.loading && <Loading lead={false} rows={2} />}
      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
      {list.data && list.data.templates.length === 0 && (
        <p className="small muted">Шаблонов нет. Их заводят в разделе «Библиотека» нижнего меню или сохраняют из программы клиента.</p>
      )}
      {list.data && list.data.templates.map((t) => (
        <button className="item" key={t.id} onClick={() => { setPicked(t); haptic(); }}>
          <div className="item__top">
            <span className="item__name">{t.title}</span>
            {t.goal && <Tag>{t.goal}</Tag>}
          </div>
          <div className="item__meta">
            <span>{t.exercises} {plural(t.exercises, 'упражнение', 'упражнения', 'упражнений')}</span>
            {!t.mine && <span>автор: {t.author}</span>}
          </div>
        </button>
      ))}

      <button className="button button--ghost button--block" onClick={onCancel}>Отмена</button>
    </Panel>
  );
}

/** Сохранить программу месяца клиента как шаблон — самый быстрый путь к библиотеке */
export function SaveAsTemplate({ clientRow, month, onDone, onCancel }) {
  const [title, setTitle] = useState('');
  const [goal, setGoal] = useState('');
  const [isPublic, setPublic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);

  const save = async () => {
    setBusy(true);
    setFailure(null);
    try {
      await apiMutate('library.template.fromClient', { clientRow, month, title: title.trim() || month, goal, isPublic });
      haptic('success');
      onDone();
    } catch (err) {
      setFailure(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel pad>
      <div className="library__form">
        <p className="small muted" style={{ margin: 0 }}>
          Программа «{month}» станет шаблоном: упражнения, подходы и повторы. Веса этого клиента в шаблон не попадут.
        </p>
        <Field label="Название шаблона" inputMode="text" placeholder="Похудение, 3 раза в неделю" value={title} onChange={setTitle} />
        <GoalPicker value={goal} onChange={setGoal} />
        <label className="library__check">
          <input type="checkbox" checked={isPublic} onChange={(e) => setPublic(e.target.checked)} />
          <span>Поделиться с другими тренерами</span>
        </label>
        {failure && <Note tone="critical" icon={IconAlert}>{failure.message}</Note>}
        <div className="library__actions">
          <button className="button button--primary" disabled={busy} onClick={save}>{busy ? 'Сохраняем…' : 'Сохранить шаблон'}</button>
          <button className="button button--ghost" disabled={busy} onClick={onCancel}>Отмена</button>
        </div>
      </div>
    </Panel>
  );
}

/* ==========================================================================
 * Упражнения
 * ========================================================================== */

function Exercises() {
  const { loading, data, error, reload } = useData('library.exercises', {}, []);
  const [listState, setListState] = useState({ scope: 'public', q: '', search: false, muscle: '', filters: { ...NO_EXERCISE_FILTERS } });
  const [open, setOpen] = useState(null);
  // Переход на карточку замены — «Назад» возвращает к предыдущей карточке
  const [trail, setTrail] = useState([]);
  const [editing, setEditing] = useState(null);
  const [showHidden, setShowHidden] = useState(false);
  const [showSimilar, setShowSimilar] = useState(false);
  const [failure, setFailure] = useState(null);

  useBackGesture(() => setShowSimilar(false), !editing && showSimilar);
  useBackGesture(() => setEditing(null), !!editing);
  useBackGesture(() => setShowHidden(false), !editing && showHidden);
  const back = () => { if (trail.length) { setOpen(trail[trail.length - 1]); setTrail(trail.slice(0, -1)); } else setOpen(null); };
  useBackGesture(back, !editing && !showHidden && !!open);
  useReturnScroll(!!(editing || showHidden || open));

  // Смахнули или нажали в правке списка — пропадает сразу, на сервер через
  // несколько секунд, если не вернули (pendingDelete.jsx). Общее не
  // удаляется, а убирается у себя — вернуть его можно и позже, в «Убранных»
  const del = usePendingDelete((e) => apiMutate('library.exercise.delete', { id: e.id }), {
    onDone: () => { haptic('success'); reload(); },
    onError: setFailure,
  });
  const remove = (e) => { setFailure(null); del.remove(e.id, e, e.common ? 'Упражнение убрано' : 'Упражнение удалено'); };

  if (loading) return <Loading lead={false} rows={5} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  if (showHidden) {
    return <HiddenExercises onBack={() => { setShowHidden(false); reload(); }} />;
  }

  if (showSimilar) {
    return <SimilarExercises onBack={() => { setShowSimilar(false); reload(); }} />;
  }

  const all = data.exercises;
  const current = open ? all.find((e) => e.id === open) : null;

  if (editing) {
    return (
      <NewExercise
        muscles={data.muscles}
        onCancel={() => setEditing(null)}
        onSaved={(saved) => { setEditing(null); setOpen(saved.id); setListState((st) => ({ ...st, scope: 'mine' })); reload(); }}
      />
    );
  }

  if (current) {
    return (
      <ExerciseView
        exercise={current}
        owner={!!data.owner}
        all={all}
        onSetup={reload}
        onChanged={(saved) => { setOpen(saved.id); reload(); }}
        muscles={data.muscles}
        onBack={back}
        onOpen={(id) => { setTrail([...trail, open]); setOpen(id); window.scrollTo?.(0, 0); }}
        onRemove={() => { remove(current); setOpen(null); }}
      />
    );
  }

  const visible = all.filter((e) => !del.hidden(e.id));

  return (
    <>
      {failure && <Note tone="critical" icon={IconAlert}>{failure.message}</Note>}
      <ExerciseList
        list={visible}
        muscles={data.muscles}
        hiddenCount={data.hiddenCount}
        state={listState}
        setState={setListState}
        onOpen={(id) => setOpen(id)}
        onCreate={() => setEditing({ new: true })}
        onDelete={remove}
        onSimilar={() => setShowSimilar(true)}
        onHidden={() => setShowHidden(true)}
      />
      {del.bar}
    </>
  );
}

/** FT-569: отдельный каталог и явные связи с несколькими упражнениями. */
function Machines() {
  const [machineSheet, setMachineSheet] = useState('');
  const [listState, setListState] = useState({ scope: 'mine', q: '', search: false, kind: '', filters: { brand: '', muscle: '', missing: false, sort: 'recent' } });
  const { loading, data, error, reload } = useData('library.machines', {}, []);
  const [open, setOpen] = useState('');
  const [form, setForm] = useState(null);
  const [busyExercise, setBusyExercise] = useState(0);
  const [failure, setFailure] = useState(null);

  useBackGesture(() => { setOpen(''); setFailure(null); }, !form && !!open);
  useReturnScroll(!!(open || form));

  const del = usePendingDelete((m) => apiMutate('library.machine.delete', { uid: m.uid }), { onDone: reload, onError: setFailure });

  if (loading) return <Loading lead={false} rows={5} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const list = (data.machines || []).filter((m) => !del.hidden(m.uid));
  const exercises = data.exercises || [];
  const machine = open ? list.find((item) => item.uid === open) : null;

  if (form) {
    return (
      <>
        {del.bar}
        <MachineForm library
          machine={form.machine}
          kind={form.kind}
          canDelete={!form.machine || !!data.owner || !!form.machine.mine}
          onDone={(saved) => { setForm(null); if (saved) { setOpen(saved.uid || open); reload(); } }}
        />
      </>
    );
  }

  if (machine) {
    const attached = new Set(machine.uses.map((exercise) => exercise.id));
    const toggle = async (exercise) => {
      setBusyExercise(exercise.id);
      setFailure(null);
      try {
        await apiMutate(attached.has(exercise.id) ? 'library.exercise.machine.delete' : 'library.exercise.machine.attach', {
          exerciseId: exercise.id,
          uid: machine.uid,
        });
        haptic('success');
        reload();
      } catch (err) {
        setFailure(err);
      } finally {
        setBusyExercise(0);
      }
    };

    return <>{del.bar}<MachineView initialSheet={machineSheet} key={machine.uid} machine={machine} owner={!!data.owner} exercises={exercises}
      onBack={() => { setOpen(''); setFailure(null); }} onEdit={() => setForm({ machine })}
      onDelete={() => { del.remove(machine.uid, machine, 'Карточка удалена'); setOpen(''); }}
      onToggle={toggle} busy={busyExercise} failure={failure} /></>;
  }

  return <>{del.bar}{failure && <Note tone="critical" icon={IconAlert}>{failure.message}</Note>}<MachineList onExercises={(uid) => { setMachineSheet('attach'); setOpen(uid); }} onDelete={(m) => del.remove(m.uid, m, 'Карточка удалена')} state={listState} setState={setListState} list={list} onOpen={(uid) => { setMachineSheet(''); setOpen(uid); }} onCreate={(kind) => setForm({ machine: null, kind })} /></>;
}

/**
 * Похожие упражнения (решение владельца 28.09.2026): одно упражнение — один
 * id и одно название. Сервер предлагает группы вероятных копий — из базы,
 * программ клиентов и шаблонов; тренер выбирает, какое оставить и что влить.
 * После объединения программы и шаблоны называют упражнение одинаково, а
 * история весов собирается по одному id.
 */
function SimilarExercises({ onBack }) {
  const { loading, data, error, reload } = useData('library.exercises.similar', {}, []);
  const groups = data ? data.groups : [];

  return (
    <>
      <Back onClick={onBack} />
      <Section
        title="Похожие упражнения"
        note="Вероятные копии одного упражнения. Оставьте одно: программы клиентов, шаблоны и история весов перейдут на него."
      >
        {loading && <Loading lead={false} rows={3} />}
        {error && <ErrorState error={error} onRetry={reload} />}
        {!loading && !error && groups.length === 0 && <Empty icon={IconCheck} title="Копий не найдено" text="Каждое упражнение встречается под одним названием." />}
        {groups.map((g) => <SimilarGroup key={g.items.map((x) => x.id || x.key).join('|')} group={g} />)}
      </Section>
    </>
  );
}

/** Откуда упражнение и где встречается — одной строкой, с одним разделителем */
function similarMeta(x) {
  const origin = x.kind === 'name' ? 'вписано вручную' : x.mine ? 'своё' : 'общее';
  const where = [
    x.clients ? x.clients + ' ' + plural(x.clients, 'клиент', 'клиента', 'клиентов') : '',
    x.templates ? x.templates + ' ' + plural(x.templates, 'шаблон', 'шаблона', 'шаблонов') : '',
  ].filter(Boolean).join(', ') || 'не используется';
  return origin + ' · ' + where;
}

/**
 * Одна группа: сверху то, что остаётся, ниже то, что в него вливается.
 * Объединение не отменить (своя копия удаляется, программы переписываются),
 * поэтому второе нажатие подтверждает, а не запускает сразу.
 */
function SimilarGroup({ group }) {
  const idOf = (x) => (x.kind === 'library' ? 'id:' + x.id : 'key:' + x.key);
  const [keep, setKeep] = useState(group.keep);
  const [picked, setPicked] = useState(() => new Set(group.items.map(idOf)));
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const [done, setDone] = useState(null);

  const main = group.items.find((x) => x.kind === 'library' && x.id === keep);
  const others = group.items.filter((x) => x !== main);
  const chosen = others.filter((x) => picked.has(idOf(x)));

  const toggle = (x, on) => {
    setConfirming(false);
    setPicked((prev) => { const next = new Set(prev); if (on) next.add(idOf(x)); else next.delete(idOf(x)); return next; });
  };

  const merge = async () => {
    setBusy(true);
    setFailure(null);
    try {
      const r = await apiMutate('library.exercise.merge', {
        keepId: keep,
        ids: chosen.filter((x) => x.kind === 'library').map((x) => x.id),
        keys: chosen.filter((x) => x.kind === 'name').map((x) => x.key),
      });
      haptic('success');
      setDone(r);
    } catch (err) {
      setFailure(err);
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Panel pad className="library__similar library__similar--done">
        <p className="library__similar-done"><IconCheck size={18} /> Объединено в «{done.keep.name}»</p>
        <p className="small muted">
          Строк в программах: {done.plans}. Шаблонов: {done.templates}. Занятий в журнале: {done.sessions}.
        </p>
      </Panel>
    );
  }

  return (
    <Panel pad className="library__similar">
      <p className="library__similar-label">Остаётся</p>
      <p className="library__similar-main">{main.name}</p>
      <p className="small muted library__similar-meta">{similarMeta(main)}</p>

      <p className="library__similar-label">Влить в него</p>
      {others.map((x) => (
        <div className="library__similar-row" key={idOf(x)}>
          <label className="library__check">
            <input type="checkbox" disabled={busy} checked={picked.has(idOf(x))} onChange={(e) => toggle(x, e.target.checked)} />
            <span>
              <span className="item__name">{x.name}</span>
              <span className="small muted library__similar-meta">{similarMeta(x)}</span>
            </span>
          </label>
          {x.kind === 'library' && (
            <button className="button button--ghost library__similar-swap" disabled={busy} onClick={() => {
              setConfirming(false);
              setPicked((prev) => new Set([...prev, 'id:' + keep]));
              setKeep(x.id);
            }}>Оставить это</button>
          )}
        </div>
      ))}

      {failure && <Note tone="critical" icon={IconAlert}>{failure.message}</Note>}

      {confirming ? (
        <div className="library__similar-confirm" role="alert">
          <p className="small">
            Отменить нельзя. {chosen.length} {plural(chosen.length, 'вариант станет', 'варианта станут', 'вариантов станут')} «{main.name}»
            в программах клиентов и шаблонах; свои копии удалятся, общие скроются у вас.
          </p>
          <div className="library__similar-actions">
            {/* Необратимо — красная главная первой, «Отмена» без рамки за ней (аудит 24.10.2026) */}
            <button className="button button--critical" disabled={busy} onClick={merge}>{busy ? 'Объединяем…' : 'Объединить'}</button>
            <button className="button button--ghost" disabled={busy} onClick={() => setConfirming(false)}>Отмена</button>
          </div>
        </div>
      ) : (
        <button className="button button--primary button--block library__similar-go" disabled={!chosen.length} onClick={() => { setConfirming(true); haptic(); }}>
          {chosen.length ? 'Объединить в «' + main.name + '»' : 'Отметьте, что влить'}
        </button>
      )}
    </Panel>
  );
}

/** Убранные общие упражнения: вернуть по одному или все сразу */
function HiddenExercises({ onBack }) {
  const { loading, data, error, reload } = useData('library.exercises', { hidden: 1 }, []);
  const [failure, setFailure] = useState(null);

  const restore = async (ids) => {
    setFailure(null);
    try {
      await apiMutate('library.exercise.restore', { ids });
      haptic('success');
      reload();
    } catch (err) {
      setFailure(err);
    }
  };

  const list = data ? data.exercises : [];

  return (
    <>
      <Back onClick={onBack} />
      <Section
        title="Убранные упражнения"
        note="Общие упражнения, которые вы убрали из своего списка"
        action={list.length > 1 ? <button className="button button--ghost" onClick={() => restore(list.map((e) => e.id))}>Вернуть все</button> : null}
      >
        {loading && <Loading lead={false} rows={3} />}
        {error && <ErrorState error={error} onRetry={reload} />}
        {failure && <Note tone="critical" icon={IconAlert}>{failure.message}</Note>}
        {!loading && !error && list.length === 0 && <Empty icon={IconCheck} title="Все упражнения на месте" />}
        {list.map((e) => (
          <div className="item library__row" key={e.id}>
            <div className="library__row-body">
              <div className="item__top"><span className="item__name">{e.name}</span></div>
              {e.muscle && <div className="item__meta"><span>{e.muscle}</span></div>}
            </div>
            <button className="button button--ghost library__remove" onClick={() => restore([e.id])}>Вернуть</button>
          </div>
        ))}
      </Section>
    </>
  );
}

/**
 * Карточка упражнения правится касанием по полю (владелец, 18.10.2026):
 * отдельного экрана «Изменить» больше нет — все его поля здесь же.
 * Открыто одно поле за раз. Общее упражнение при сохранении становится
 * своей версией (сервер копирует тренажёры, замены, настройку и видео);
 * подготовку общего владелец правит прямо в базе.
 */
function ExerciseView({ exercise, owner, all, muscles, onSetup, onChanged, onBack, onRemove, onOpen }) {
  const e = exercise;
  const [edit, setEdit] = useState('');
  const [draft, setDraft] = useState({});
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  useEffect(() => { setEdit(''); }, [e.id]);

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const open = (key, values) => { setEdit(key); setDraft(values); setFile(null); setFailure(null); haptic(); };
  const close = () => { setEdit(''); setFailure(null); };
  const known = e.track;
  const directSetup = e.mine || (e.common && owner);
  const hasFile = e.mine && e.media?.kind === 'file';

  const save = async (patch, upload = null) => {
    setBusy(true);
    setFailure(null);
    try {
      const { setupOnly, ...rest } = patch;
      let saved = e;
      if (setupOnly && directSetup) {
        await apiMutate('library.exercise.setup', { id: e.id, setup: rest.setup, ok: rest.setupOk });
      } else {
        // Название и технику сервер переписывает всегда — шлём текущие, если правят другое поле
        saved = await apiMutate('library.exercise.save', { id: e.id, name: e.name, muscle: e.muscle || '', notes: e.notes || '', ...rest });
      }
      if (upload) {
        setProgress(0);
        await uploadVideo(saved.id, upload, setProgress);
      }
      haptic('success');
      setEdit('');
      if (saved === e) onSetup(); else onChanged(saved);
    } catch (err) {
      setFailure(err);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const actions = (patch, ok = true, upload = null) => (
    <>
      {failure && <Note tone="critical" icon={IconAlert}>{failure.message}</Note>}
      <div className="library__actions">
        <button className="button button--primary" disabled={busy || !ok} onClick={() => save(patch, upload)}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>
        <button className="button button--ghost" disabled={busy} onClick={close}>Отмена</button>
      </div>
    </>
  );

  // Поле карточки: касание открывает правку только его
  const row = (key, label, value, start, editor, empty = 'Не заполнено') => (
    <div className={'card-field' + (edit === key ? ' card-field--open' : '')} key={key}>
      {edit === key
        ? <div className="library__form"><span className="card-field__label">{label}</span>{editor()}</div>
        : (
          <button type="button" className="card-field__view" aria-label={'Изменить: ' + label} onClick={() => open(key, start())}>
            <span className="card-field__label">{label}</span>
            {value ? <span className="card-field__value">{value}</span> : <span className="card-field__value card-field__value--empty">{empty}</span>}
          </button>
        )}
    </div>
  );

  // Вид — тем же меню, что в программе и занятии (ExerciseKind): снимок
  // текущего, у «авто» — догадка сервера, чтобы чипы показывали её
  const kindOf = () => ({ track: known ? { ...known } : { kind: 'strength', auto: true } });
  const flip = (map, r) => {
    const v = map || { primary: [], secondary: [] };
    return { primary: v.primary.filter((x) => x !== r).concat(!v.primary.includes(r) && !v.secondary.includes(r) ? [r] : []), secondary: v.secondary.filter((x) => x !== r).concat(v.primary.includes(r) ? [r] : []) };
  };

  return (
    <>
      <Back onClick={onBack} />
      <Panel pad>
        {row('name', 'Название', <span className="library__title">{e.name}</span>, () => ({ name: e.name }), () => <>
          <Field label="Название" inputMode="text" value={draft.name} onChange={(v) => set({ name: v })} />
          {actions({ name: (draft.name || '').trim() }, (draft.name || '').trim().length >= 2)}
        </>)}
        {row('short', 'Коротко — в ленте программы', e.shortName, () => ({ shortName: e.shortName || '' }), () => <>
          <ShortNameField value={draft.shortName} onChange={(v) => set({ shortName: v })} />
          {actions({ shortName: (draft.shortName || '').trim() })}
        </>, 'Не задано — в ленте только номер')}
        <div className="item__meta library__meta"><span>{e.mine ? 'своё' : 'общее'}</span></div>
        {!e.mine && <p className="small muted">Общее упражнение: сохранение любого поля создаст вашу версию с теми же тренажёрами и заменами — общая не изменится.</p>}

        {/* Видео показывается само; правка — касанием по подписи */}
        {e.media && <Media media={e.media} />}
        {row('media', 'Видео', e.media ? (e.media.kind === 'link' ? e.media.url : e.media.kind === 'file' ? 'Своё видео' : e.media.kind === 'clip' ? 'Ролик с манекеном' : 'Анимация') : null,
          () => ({ link: e.media?.kind === 'link' ? e.media.url : '' }), () => <>
            <Field label="Ссылка" inputMode="url" value={draft.link} onChange={(v) => set({ link: v })} placeholder="https://…" hint="Клиент увидит кнопку «Открыть видео». Чтобы видео играло прямо в приложении, загрузите файл." />
            <label className="field">
              <span className="field__label">Или файлом с телефона</span>
              <input type="file" accept="video/mp4,video/quicktime,video/webm,video/x-m4v" onChange={(ev) => setFile(ev.target.files[0] || null)} />
              <span className="field__hint">{file ? `${file.name} · ${Math.round(file.size / 1024 / 1024)} МБ` : hasFile ? 'Загружено своё видео — новый файл заменит его' : 'До 500 МБ'}</span>
            </label>
            {progress !== null && (
              <div className="library__progress" role="progressbar" aria-valuenow={Math.round(progress * 100)}>
                <span style={{ transform: `scaleX(${progress})` }} />
                <em>Загружаем видео… {Math.round(progress * 100)}%</em>
              </div>
            )}
            {/* Пустая ссылка не стирает загруженный файл и анимацию */}
            {actions({ ...(draft.link || e.media?.kind === 'link' || !e.media ? { link: draft.link || '' } : {}), contentOk: false }, true, file)}
          </>, 'Нет — коснитесь, чтобы приложить')}

        {row('muscle', 'Группа мышц', e.muscle, () => ({ muscle: e.muscle || '' }), () => <>
          <Chips items={[{ value: '', label: 'Не указана' }, ...muscles.map((m) => ({ value: m, label: m }))]} value={draft.muscle} onChange={(v) => set({ muscle: v })} />
          {actions({ muscle: draft.muscle })}
        </>, 'Не указана')}

        {row('load', 'Как учитывать нагрузку', known ? trackLine(known) : 'Автоматически', kindOf, () => <>
          <ExerciseKind track={draft.track || { kind: 'strength', auto: true }} allowAuto className="exercise-kind--bare" onChange={(t) => set({ track: t })} />
          {/* Тренажёр у кардио не выбирают (09.10.2026): настройки — в программе */}
          {draft.track && draft.track.weightMode === 'assistance' && <p className="small muted">Прежние записи сохраняют свой способ учёта.</p>}
          {actions({ track: !draft.track || draft.track.auto ? { auto: true } : {
            kind: draft.track.kind, weightMode: draft.track.weightMode || undefined, machine: draft.track.machine || 'treadmill',
            unilateral: !!draft.track.unilateral, perSide: !!draft.track.perSide,
          } })}
        </>)}

        {e.equipment && row('equipment', 'Инвентарь', e.equipment, () => ({ equipment: e.equipment }), () => <>
          <Field label="Инвентарь" inputMode="text" value={draft.equipment} onChange={(v) => set({ equipment: v })} hint="По нему считается шаг веса в занятии: гантели и гири — 1–2 кг, остальное — 2,5 кг и больше." />
          {actions({ equipment: draft.equipment })}
        </>)}

        <MachinesEditor exercise={e} owner={owner} onChanged={onChanged} />

        {/* Подготовка — только без тренажёра: с ним клиент видит настройку тренажёра */}
        {!e.machines?.length && row('setup', 'Подготовка к упражнению',
          e.setup ? <>{!e.setupOk && <Tag tone="warn">черновик — клиенты не видят</Tag>}<SetupText text={e.setup} /></> : null,
          () => ({ setup: e.setup || '', setupOk: !!e.setupOk }), () => <>
            <textarea className="field__input library__textarea" aria-label="Подготовка к упражнению" value={draft.setup} maxLength={1500} rows={5}
              onChange={(ev) => set({ setup: ev.target.value, setupOk: false })}
              placeholder={'Сиденье — рукояти на уровне груди.\nСпинка — лопатки прижаты.\nОшибка: локти выше плеч.'} />
            <span className="field__hint">Каждый шаг — с новой строки. Клиент видит подготовку, пока к упражнению не привязан тренажёр.</span>
            <label className="library__check"><input type="checkbox" checked={draft.setupOk} disabled={!draft.setup.trim()} onChange={(ev) => set({ setupOk: ev.target.checked })} />Проверено — показывать клиентам</label>
            {actions({ setupOnly: true, setup: draft.setup, setupOk: draft.setupOk })}
          </>)}

        {row('notes', 'Техника выполнения', e.notes ? <span className="card-field__text">{e.notes}</span> : null, () => ({ notes: e.notes || '' }), () => <>
          <textarea className="field__input library__textarea" aria-label="Техника выполнения" value={draft.notes} maxLength={2000} rows={6} onChange={(ev) => set({ notes: ev.target.value })} placeholder="Каждый шаг — с новой строки: исходное положение, движение, дыхание" />
          {actions({ notes: draft.notes })}
        </>)}

        {row('mistakes', 'Частые ошибки', e.mistakes ? <span className="card-field__text">{e.mistakes}</span> : null, () => ({ mistakes: e.mistakes || '' }), () => <>
          <textarea className="field__input library__textarea" aria-label="Частые ошибки" value={draft.mistakes} maxLength={1500} rows={4} onChange={(ev) => set({ mistakes: ev.target.value })} placeholder="Ошибка — строка" />
          {actions({ mistakes: draft.mistakes })}
        </>)}

        <label className="library__check">
          <input type="checkbox" checked={!!e.contentOk} disabled={busy} onChange={(ev) => save({ contentOk: ev.target.checked })} />
          Техника и видео проверены
        </label>

        {row('muscles', 'Основные и дополнительные мышцы',
          e.musclesCustom ? <MuscleNames primary={e.muscles?.primary || []} secondary={e.muscles?.secondary || []} max={20} /> : null,
          () => ({ map: e.musclesCustom ? e.muscles : null }), () => <>
            <p className="small muted">Нажатие: основная, дополнительная, убрать. Без точной разметки используется группа мышц.</p>
            <MuscleFigure primary={draft.map?.primary || []} secondary={draft.map?.secondary || []} onTap={(r) => set({ map: flip(draft.map, r) })} />
            <MuscleNames primary={draft.map?.primary || []} secondary={draft.map?.secondary || []} max={20} />
            <div className="chips chips--wrap">{Object.entries(LABELS).map(([id, label]) => <button className="chip" type="button" key={id} aria-pressed={!!(draft.map?.primary.includes(id) || draft.map?.secondary.includes(id))} onClick={() => set({ map: flip(draft.map, id) })}>{label}{draft.map?.primary.includes(id) ? ' · основная' : draft.map?.secondary.includes(id) ? ' · дополнительная' : ''}</button>)}</div>
            <button className="button button--ghost" type="button" onClick={() => set({ map: null })}>Использовать группу</button>
            {actions({ muscles: draft.map })}
          </>, 'По группе мышц')}

        <AlternativesEditor exercise={e} owner={owner} all={all} onChanged={onChanged} onOpen={onOpen} />

        {!edit && failure && <Note tone="critical" icon={IconAlert}>{failure.message}</Note>}
        <div className="library__actions">
          {/* Как в правке списка: сразу, внизу «Упражнение удалено · Вернуть»,
              без системного окна window.confirm (аудит 24.10.2026) */}
          {e.mine && (
            <button className="button button--ghost danger" onClick={onRemove}>Удалить</button>
          )}
          {e.common && (
            <button className="button button--ghost danger" onClick={onRemove}>Убрать у себя</button>
          )}
        </div>
      </Panel>
    </>
  );
}

/** Ключевое слово упражнения (FT-792): до 20 знаков — две строки под картинкой в ленте (владелец 15.11.2026) */
const SHORT_MAX = 20;
function ShortNameField({ value = '', onChange }) {
  const count = Array.from(value).length;
  return (
    <label className="field">
      {/* Подпись поля — над ним в карточке; здесь только счётчик знаков */}
      <span className="field__label library__chars" aria-hidden="true">{count} / {SHORT_MAX}</span>
      <input className="field__input" type="text" autoComplete="off" aria-label="Коротко — в ленте программы" value={value} placeholder="Пек-дек"
        onChange={(ev) => onChange(Array.from(ev.target.value).slice(0, SHORT_MAX).join(''))} />
      <span className="field__hint">Видно под картинкой в карточке тренировки. Пусто — только номер.</span>
    </label>
  );
}

/** Новое своё упражнение: название и группа — остальное в карточке касанием */
function NewExercise({ muscles, onSaved, onCancel }) {
  const [name, setName] = useState('');
  const [muscle, setMuscle] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const create = async () => {
    setBusy(true);
    setFailure(null);
    try {
      const saved = await apiMutate('library.exercise.save', { name: name.trim(), muscle, notes: '', track: { auto: true } });
      haptic('success');
      onSaved(saved);
    } catch (err) {
      setFailure(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {/* Стрелка говорит, куда ведёт, а не «Отмена» (аудит 24.10.2026) */}
      <Back onClick={onCancel}>Упражнения</Back>
      <Panel pad>
        <div className="library__form">
          <Field label="Название" inputMode="text" value={name} onChange={setName} placeholder="Жим гантелей лёжа" />
          <div>
            <span className="field__label">Группа мышц</span>
            <Chips items={[{ value: '', label: 'Не указана' }, ...muscles.map((m) => ({ value: m, label: m }))]} value={muscle} onChange={setMuscle} />
          </div>
          <p className="small muted">Технику, видео, тренажёры и замены добавите в карточке — касанием по полю.</p>
          {failure && <Note tone="critical" icon={IconAlert}>{failure.message}</Note>}
          <button className="button button--primary" disabled={busy || name.trim().length < 2} onClick={create}>{busy ? 'Создаём…' : 'Создать'}</button>
        </div>
      </Panel>
    </>
  );
}

/** «Кардио · Беговая дорожка», «Силовое · вес с одной стороны» (+ «авто») */
function trackLine(t) {
  return [
    t.weightMode === 'assistance' ? 'Вес помощи и повторения' : KIND_LABELS[t.kind],
    t.kind === 'cardio' && MACHINE_LABELS[t.machine],
    t.unilateral && 'повторы на сторону',
    t.perSide && 'вес с одной стороны',
  ].filter(Boolean).join(' · ') + (t.auto ? ' (определено само)' : '');
}
