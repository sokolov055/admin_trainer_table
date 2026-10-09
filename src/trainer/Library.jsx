import { KIND_LABELS, MACHINE_LABELS, cardioLine, trackOf } from '../exercise-track.js';
import { useReturnScroll } from '../scroll.js';
import React, { useEffect, useState } from 'react';
import { useData } from '../useData.js';
import { apiMutate, apiPublic } from '../api.js';
import { haptic } from '../telegram.js';
import { useBackGesture } from '../gestures.jsx';
import PlanEditor from './PlanEditor.jsx';
import Dishes from './Dishes.jsx';
import { uploadVideo, monthName, shrinkPhoto, uploadMachinePhoto, mediaUrl } from '../library.js';
import {
  Section, Panel, Loading, ErrorState, Empty, Badge, Chips, Search, Segmented, Field, Note, plural,
} from '../ui.jsx';
import { IconBack, IconPlan, IconSearch, IconAlert, IconCheck, IconTrash, IconClose } from '../icons.jsx';
import SwipeRow from '../SwipeRow.jsx';
import { Media, SetupText, MachinePhoto } from '../media.jsx';
import { usePendingDelete } from '../pendingDelete.jsx';

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
  { value: 'machines', label: 'Тренажёры и оборудование' },
  // Блюда для рациона клиентов: черновики на проверку, публикация, правка
  { value: 'dishes', label: 'Блюда' },
];

export const MACHINE_KIND_ITEMS = [
  { value: 'machine', label: 'Тренажёр' },
  { value: 'equipment', label: 'Оборудование' },
];

const SCOPES = [
  { value: 'mine', label: 'Мои' },
  { value: 'public', label: 'Общие' },
];

const GOALS = ['Похудение', 'Набор массы', 'Рельеф', 'Сила', 'Тонус', 'Выносливость', 'Здоровая спина', 'Реабилитация'];
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

export default function Library({ pane }) {
  if (pane === 'dishes') return <Dishes />;
  if (pane === 'machines') return <Machines />;
  return pane === 'exercises' ? <Exercises /> : <Templates key={pane} kind={pane} />;
}

/* ==========================================================================
 * Шаблоны
 * ========================================================================== */

function Templates({ kind }) {
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

  // Вложенные экраны закрываются смахиванием вправо, как всё остальное
  useBackGesture(() => setEditing(null), !!editing);
  useBackGesture(() => setAssigning(null), !editing && !!assigning);
  useBackGesture(() => setOpen(null), !editing && !assigning && !!open);
  // Из карточки шаблона — обратно на то же место списка
  useReturnScroll(!!(editing || assigning || open));

  if (editing) {
    return (
      <TemplateEditor
        kind={kind}
        template={editing.new ? null : editing}
        onCancel={() => setEditing(null)}
        onSaved={(saved) => { setEditing(null); setOpen(saved.id); setScope('mine'); list.reload(); }}
      />
    );
  }

  if (assigning) {
    return <AssignToClient template={assigning} onDone={() => setAssigning(null)} onCancel={() => setAssigning(null)} />;
  }

  if (open) {
    return (
      <TemplateView
        id={open}
        onBack={() => setOpen(null)}
        onEdit={(t) => setEditing(t)}
        onAssign={(t) => setAssigning(t)}
        onCopied={(t) => { setScope('mine'); setOpen(t.id); list.reload(); }}
        onDeleted={() => { setOpen(null); list.reload(); }}
        onSavedWorkout={() => list.reload()}
      />
    );
  }

  const noun = kind === 'program' ? 'программы' : 'тренировки';
  const all = list.data ? list.data.templates : [];
  const shown = all
    .filter((t) => !goal || t.goal === goal)
    .filter((t) => !q || (t.title + ' ' + t.goal).toLowerCase().includes(q.toLowerCase()));
  const goals = list.data ? list.data.goals : [];

  return (
    <>
      <Segmented items={SCOPES} value={scope} onChange={(v) => { setScope(v); setPruning(false); haptic(); }} label="Чьи шаблоны" />

      {scope === 'mine' && (
        <div className="library__bar">
          <button className="button button--primary" disabled={pruning} onClick={() => setEditing({ new: true })}>
            {kind === 'program' ? 'Новый шаблон программы' : 'Новый шаблон тренировки'}
          </button>
          {all.length > 0 && (
            <button className="button" aria-pressed={pruning} onClick={() => { setPruning(!pruning); haptic(); }}>
              {pruning ? 'Готово' : 'Править'}
            </button>
          )}
        </div>
      )}
      {failure && <Note tone="critical" icon={IconAlert}>{failure.message}</Note>}

      <Search value={q} onChange={setQ} placeholder="Поиск по названию и цели" />
      {goals.length > 1 && (
        <Chips items={[{ value: '', label: 'Все цели' }, ...goals.map((g) => ({ value: g, label: g }))]} value={goal} onChange={setGoal} />
      )}

      {list.loading && <Loading lead={false} rows={3} />}
      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}

      {!list.loading && !list.error && shown.length === 0 && (
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
            {t.goal && <Badge>{t.goal}</Badge>}
          </div>
          <div className="item__meta">
            <span>
              {kind === 'program' ? t.workouts + ' ' + plural(t.workouts, 'тренировка', 'тренировки', 'тренировок') + ' · ' : ''}
              {t.exercises + ' ' + plural(t.exercises, 'упражнение', 'упражнения', 'упражнений')}
            </span>
            {t.level && <span>{t.level}</span>}
            {!t.mine && <span>автор: {t.author}</span>}
            {t.mine && t.isPublic && <Badge kind="good">поделились</Badge>}
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

function Back({ onClick, children = 'Назад' }) {
  return (
    <button className="button button--ghost library__back" onClick={onClick}>
      <IconBack size={16} />
      {children}
    </button>
  );
}

/** Упражнение одной строкой: «Жим гантелей лёжа — 3×12, 20 кг» */
function exerciseLine(e) {
  // Кардио — целями, режимом и интервалами, а не «подходы × повторы»
  if (e.cardio) return `${e.name} — ${cardioLine(e.cardio, trackOf(e))}`;
  const volume = [e.sets, e.reps].filter(Boolean).join('×');
  const extra = [volume, e.weight && e.weight + (/\d$/.test(e.weight) ? ' кг' : '')].filter(Boolean).join(', ');
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
        <div className="item__meta" style={{ marginBottom: 'var(--space-3)' }}>
          {t.goal && <Badge>{t.goal}</Badge>}
          {t.level && <span>{t.level}</span>}
          <span>{t.mine ? (t.isPublic ? 'ваш · в общем доступе' : 'ваш') : 'автор: ' + t.author}</span>
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
          {t.mine && (
            <button className="button button--ghost danger" disabled={busy} onClick={() => act(async () => {
              if (!window.confirm(`Удалить шаблон «${t.title}»? Программ клиентов это не коснётся.`)) return;
              await apiMutate('library.template.delete', { id: t.id });
              onDeleted();
            })}>Удалить</button>
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

function TemplateEditor({ kind, template, onSaved, onCancel }) {
  const [title, setTitle] = useState(template ? template.title : '');
  const [goal, setGoal] = useState(template ? template.goal : '');
  const [level, setLevel] = useState(template ? template.level : '');
  const [description, setDescription] = useState(template ? template.description : '');
  const [isPublic, setPublic] = useState(template ? template.isPublic : false);

  const blocks = template
    ? template.blocks
    : [{ title: kind === 'workout' ? 'Тренировка' : 'Тренировка № 1', exercises: [] }];

  // Программа собирается и из шаблонов тренировок — копиями со ссылкой
  const workouts = useData('library.templates', { kind: 'workout' }, []);
  const workoutList = kind === 'program' && workouts.data
    ? workouts.data.templates.map((t) => ({ id: t.id, title: t.title }))
    : null;

  // Правка шаблона тренировки, стоящего в программах: спросить, обновить ли
  // копии. Ответ ждёт сохранение — кнопка крутится, пока тренер решает.
  const [ask, setAsk] = useState(null); // { programs, resolve }

  const submit = async (clean) => {
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
      blocks: clean,
      propagate,
    });
  };

  return (
    <>
      <Back onClick={onCancel}>Отмена</Back>

      <Panel pad>
        <div className="library__form">
          <Field label="Название" inputMode="text" placeholder={kind === 'program' ? 'Похудение, 3 раза в неделю' : 'Верх тела'} value={title} onChange={setTitle} />
          <GoalPicker value={goal} onChange={setGoal} />

          <div>
            <span className="field__label">Уровень</span>
            <Segmented items={LEVELS} value={level} onChange={setLevel} label="Уровень" />
          </div>

          <label className="field">
            <span className="field__label">Описание</span>
            <textarea
              className="field__input library__textarea"
              value={description}
              maxLength={1000}
              placeholder="Для кого и как вести: частота, прогрессия, на что обратить внимание"
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

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
          single={kind === 'workout'}
          submitLabel="Сохранить шаблон"
          workoutTemplates={workoutList}
          loadWorkout={async (id) => {
            const t = await apiPublic('library.template.get', { id });
            return t && t.blocks && t.blocks[0];
          }}
          onSubmit={submit}
          onSaved={(saved) => { haptic('success'); onSaved(saved); }}
          onCancel={onCancel}
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
 * Шаблон — клиенту: кому, в какой месяц и как.
 *
 * «Заменить» — месяц становится шаблоном целиком; «Дописать» — тренировки
 * шаблона добавляются в конец месяца (так из шаблонов тренировок
 * собирается программа). В «было» у упражнений сервер кладёт последний
 * вес клиента — по нему программу и правят под человека.
 */
export function AssignForm({ template, clientRow, defaultMonth, onDone }) {
  const [month, setMonth] = useState(defaultMonth || monthName());
  const [mode, setMode] = useState(template.kind === 'workout' ? 'append' : 'replace');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);

  const apply = async () => {
    setBusy(true);
    setFailure(null);
    try {
      await apiMutate('plan.fromTemplate', { clientRow, month: month.trim(), templateId: template.id, mode });
      haptic('success');
      onDone(month.trim());
    } catch (err) {
      setFailure(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="library__form">
      <Field label="Месяц программы" inputMode="text" value={month} onChange={setMonth} hint="Как месяц называется у клиента; если его нет — он появится" />
      <Segmented
        items={[
          { value: 'replace', label: 'Заменить месяц' },
          { value: 'append', label: 'Дописать в месяц' },
        ]}
        value={mode}
        onChange={setMode}
        label="Как назначить"
      />
      <p className="small muted" style={{ margin: 0 }}>
        {mode === 'replace'
          ? 'Программа месяца станет этим шаблоном целиком.'
          : 'Тренировки шаблона добавятся в конец месяца, остальное останется.'}
        {' '}Прошлые веса клиента подставятся в «было».
      </p>
      {failure && <Note tone="critical" icon={IconAlert}>{failure.message}</Note>}
      <button className="button button--primary button--block" disabled={busy || !month.trim()} onClick={apply}>
        {busy ? 'Назначаю…' : 'Назначить'}
      </button>
    </div>
  );
}

function AssignToClient({ template, onDone, onCancel }) {
  const clients = useData('trainer.clients', {}, []);
  const [q, setQ] = useState('');
  const [client, setClient] = useState(null);
  const [done, setDone] = useState(null);

  if (done) {
    return (
      <>
        <Back onClick={onDone}>К шаблону</Back>
        <Empty
          icon={IconCheck}
          title="Назначено"
          text={`«${template.title}» — в программе ${done.client.name}, ${done.month}. Поправить под человека можно в его карточке, в разделе «Тренировки».`}
        />
      </>
    );
  }

  return (
    <>
      <Back onClick={client ? () => setClient(null) : onCancel}>{client ? 'Другой клиент' : 'К шаблону'}</Back>
      <Section title={client ? client.name : 'Кому назначить'} note={`«${template.title}»`}>
        {client ? (
          <Panel pad>
            <AssignForm template={template} clientRow={client.row} onDone={(month) => setDone({ client, month })} />
          </Panel>
        ) : (
          <>
            <Search value={q} onChange={setQ} placeholder="Поиск клиента" />
            {clients.loading && <Loading lead={false} rows={4} />}
            {clients.error && <ErrorState error={clients.error} onRetry={clients.reload} />}
            {clients.data && clients.data.clients
              .filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()))
              .map((c) => (
                <button className="item" key={c.row} onClick={() => { setClient(c); haptic(); }}>
                  <div className="item__top"><span className="item__name">{c.name}</span></div>
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
        <p className="small muted">Шаблонов нет. Их заводят в разделе «Шаблоны» нижнего меню или сохраняют из программы клиента.</p>
      )}
      {list.data && list.data.templates.map((t) => (
        <button className="item" key={t.id} onClick={() => { setPicked(t); haptic(); }}>
          <div className="item__top">
            <span className="item__name">{t.title}</span>
            {t.goal && <Badge>{t.goal}</Badge>}
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
          <button className="button button--primary" disabled={busy} onClick={save}>{busy ? 'Сохраняю…' : 'Сохранить шаблон'}</button>
          <button className="button" disabled={busy} onClick={onCancel}>Отмена</button>
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
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState('');
  const [open, setOpen] = useState(null);
  const [editing, setEditing] = useState(null);
  const [pruning, setPruning] = useState(false);
  // Владелец: только упражнения с черновиком «Как настроить» — пройти и проверить
  const [reviewing, setReviewing] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [showSimilar, setShowSimilar] = useState(false);
  const [failure, setFailure] = useState(null);

  useBackGesture(() => setShowSimilar(false), !editing && showSimilar);
  useBackGesture(() => setEditing(null), !!editing);
  useBackGesture(() => setShowHidden(false), !editing && showHidden);
  useBackGesture(() => setOpen(null), !editing && !showHidden && !!open);
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
      <ExerciseEditor
        exercise={editing.new ? null : editing}
        muscles={data.muscles}
        onCancel={() => setEditing(null)}
        onSaved={(saved) => { setEditing(null); setOpen(saved.id); reload(); }}
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
        onBack={() => setOpen(null)}
        onEdit={() => setEditing(current)}
        onDeleted={() => { setOpen(null); reload(); }}
        onRemove={() => { remove(current); setOpen(null); }}
      />
    );
  }

  const muscles = [{ value: '', label: 'Все' }, ...data.muscles.map((m) => ({ value: m, label: m })), { value: '—', label: 'Без группы' }];
  const drafts = data.owner ? all.filter((e) => e.setup && !e.setupOk).length : 0;
  const shown = all
    .filter((e) => !reviewing || (e.setup && !e.setupOk))
    .filter((e) => !muscle || (muscle === '—' ? !e.muscle : e.muscle === muscle))
    .filter((e) => !q || e.name.toLowerCase().replace(/ё/g, 'е').includes(q.toLowerCase().replace(/ё/g, 'е')));

  return (
    <>
      <div className="library__bar">
        <button className="button button--primary" disabled={pruning} onClick={() => setEditing({ new: true })}>
          Своё упражнение
        </button>
        <button className="button" aria-pressed={pruning} onClick={() => { setPruning(!pruning); haptic(); }}>
          {pruning ? 'Готово' : 'Править'}
        </button>
      </div>
      <Search value={q} onChange={setQ} placeholder="Поиск упражнения" />
      <Chips items={muscles} value={muscle} onChange={setMuscle} />

      <div className="library__count">
        <p className="small muted">{shown.length} {plural(shown.length, 'упражнение', 'упражнения', 'упражнений')}</p>
        <button className="button button--ghost" onClick={() => { setShowSimilar(true); setPruning(false); }}>
          Похожие
        </button>
        {(drafts > 0 || reviewing) && (
          <button className="button button--ghost" aria-pressed={reviewing} onClick={() => { setReviewing(!reviewing); haptic(); }}>
            {reviewing ? 'Все упражнения' : 'Настройка на проверке · ' + drafts}
          </button>
        )}
        {data.hiddenCount > 0 && (
          <button className="button button--ghost" onClick={() => { setShowHidden(true); setPruning(false); }}>
            Убранные · {data.hiddenCount}
          </button>
        )}
      </div>
      {failure && <Note tone="critical" icon={IconAlert}>{failure.message}</Note>}

      {shown.filter((e) => !del.hidden(e.id)).slice(0, 200).map((e) => (
        <Row
          key={e.id}
          pruning={pruning}
          onOpen={() => { setOpen(e.id); haptic(); }}
          onRemove={() => remove(e)}
          removeLabel={(e.common ? 'Убрать «' : 'Удалить «') + e.name + '»'}
          removeText={e.common ? 'Убрать' : 'Удалить'}
        >
          <div className="item__top">
            <span className="item__name">{e.name}</span>
            {e.mine && <Badge kind="good">своё</Badge>}
          </div>
          <div className="item__meta">
            {[e.muscle, e.equipment].filter(Boolean).length > 0 && <span>{[e.muscle, e.equipment].filter(Boolean).join(' · ')}</span>}
            {e.media && <Badge>{e.media.kind === 'animation' ? 'анимация' : 'видео'}</Badge>}
            {e.setup && (e.setupOk ? <Badge>настройка</Badge> : data.owner && <Badge kind="warn">настройка на проверке</Badge>)}
            {e.machines && e.machines.length > 0 && <Badge>{e.machines.length + ' ' + plural(e.machines.length, 'тренажёр', 'тренажёра', 'тренажёров')}</Badge>}
          </div>
        </Row>
      ))}
      {shown.length > 200 && <p className="small muted">Показаны первые 200 — уточните поиск.</p>}
      {del.bar}
    </>
  );
}

/**
 * Тренажёры (владелец, 09.10.2026): все тренажёры, записанные у упражнений
 * (FT-478), одним списком. Один и тот же тренажёр бывает у нескольких
 * упражнений — он одной строкой, под ним упражнения. Сам тренажёр живёт у
 * упражнения: правка и новый — в карточке упражнения, сюда ведёт касание.
 */
function Machines() {
  const { loading, data, error, reload } = useData('library.exercises', {}, []);
  const [q, setQ] = useState('');
  const [kindOf, setKindOf] = useState('');    // '' — все, machine, equipment
  const [open, setOpen] = useState('');        // ключ тренажёра
  const [exercise, setExercise] = useState(null); // id упражнения из тренажёра
  const [editing, setEditing] = useState(null);

  useBackGesture(() => setEditing(null), !!editing);
  useBackGesture(() => setExercise(null), !editing && !!exercise);
  useBackGesture(() => setOpen(''), !editing && !exercise && !!open);
  useReturnScroll(!!(open || exercise || editing));

  if (loading) return <Loading lead={false} rows={5} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const all = data.exercises;
  const keyOf = (name) => String(name || '').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
  const groups = new Map();
  all.forEach((e) => (e.machines || []).forEach((m) => {
    const kind = m.kind === 'equipment' ? 'equipment' : 'machine';
    const k = kind + ':' + keyOf(m.name);
    if (!groups.has(k)) groups.set(k, { key: k, name: m.name, kind, photos: [], setup: '', uses: [] });
    const g = groups.get(k);
    const photos = m.photos && m.photos.length ? m.photos : m.photo ? [m.photo] : [];
    if (!g.photos.length && photos.length) g.photos = photos;
    if (!g.setup && m.setup) g.setup = m.setup;
    g.uses.push(e);
  }));
  const list = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));

  if (editing) {
    return (
      <ExerciseEditor
        exercise={editing}
        muscles={data.muscles}
        onCancel={() => setEditing(null)}
        onSaved={() => { setEditing(null); reload(); }}
      />
    );
  }
  const current = exercise ? all.find((e) => e.id === exercise) : null;
  if (current) {
    return (
      <ExerciseView
        exercise={current}
        owner={!!data.owner}
        all={all}
        onSetup={reload}
        onChanged={(saved) => { setExercise(saved.id); reload(); }}
        onBack={() => setExercise(null)}
        onEdit={() => setEditing(current)}
        onDeleted={() => { setExercise(null); reload(); }}
        onRemove={() => setExercise(null)}
      />
    );
  }
  const machine = open ? list.find((g) => g.key === open) : null;
  if (machine) {
    return (
      <>
        <Back onClick={() => setOpen('')}>Тренажёры и оборудование</Back>
        <h2 className="library__title">{machine.name}</h2>
        <p className="small muted">{machine.kind === 'equipment' ? 'Оборудование' : 'Тренажёр'}{machine.photos.length > 1 ? ' · ' + machine.photos.length + ' фото' : ''}</p>
        <MachinePhoto machine={machine} />
        {machine.setup
          ? <><h4 className="setup__title">{machine.kind === 'equipment' ? 'Настройка' : 'Где регулировки'}</h4><SetupText text={machine.setup} /></>
          : <p className="small muted">Настройка не записана. Добавьте в карточке упражнения ниже.</p>}
        <h4 className="setup__title">Упражнения</h4>
        {machine.uses.map((e) => (
          <button key={e.id} className="item" onClick={() => { setExercise(e.id); haptic(); }}>
            <div className="item__top"><span className="item__name">{e.name}</span>{e.mine && <Badge kind="good">своё</Badge>}</div>
            {e.muscle && <div className="item__meta"><span>{e.muscle}</span></div>}
          </button>
        ))}
      </>
    );
  }

  const nq = keyOf(q);
  const shown = list
    .filter((g) => !kindOf || g.kind === kindOf)
    .filter((g) => !nq || keyOf(g.name).includes(nq) || g.uses.some((e) => keyOf(e.name).includes(nq)));
  const kinds = [{ value: '', label: 'Все' }, { value: 'machine', label: 'Тренажёры' }, { value: 'equipment', label: 'Оборудование' }];
  return (
    <>
      <Search value={q} onChange={setQ} placeholder="Поиск тренажёра или оборудования" />
      <Chips items={kinds} value={kindOf} onChange={setKindOf} />
      <p className="small muted library__count">{shown.length} {plural(shown.length, 'объект', 'объекта', 'объектов')}</p>
      {!list.length && (
        <Empty title="Пока пусто" text="Тренажёр или оборудование добавляется в карточке упражнения: «Упражнения» → упражнение → «Тренажёры и оборудование»." />
      )}
      {shown.map((g) => (
        <button key={g.key} className="item" onClick={() => { setOpen(g.key); haptic(); }}>
          <div className="item__top"><span className="item__name">{g.name}</span><Badge>{g.kind === 'equipment' ? 'оборудование' : 'тренажёр'}</Badge></div>
          <div className="item__meta">
            <span>{g.uses.map((e) => e.name).join(', ')}</span>
            {g.photos.length > 0 && <Badge>{g.photos.length > 1 ? g.photos.length + ' фото' : 'фото'}</Badge>}
            {g.setup && <Badge>настройка</Badge>}
          </div>
        </button>
      ))}
    </>
  );
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
            <button className="button" disabled={busy} onClick={() => setConfirming(false)}>Отмена</button>
            <button className="button button--primary" disabled={busy} onClick={merge}>{busy ? 'Объединяем…' : 'Объединить'}</button>
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

function ExerciseView({ exercise, owner, all, onSetup, onChanged, onBack, onEdit, onDeleted, onRemove }) {
  const [failure, setFailure] = useState(null);
  const e = exercise;

  return (
    <>
      <Back onClick={onBack} />
      <Panel pad>
        <h2 className="library__title">{e.name}</h2>
        <div className="item__meta" style={{ marginBottom: 'var(--space-3)' }}>
          {e.muscle && <Badge>{e.muscle}</Badge>}
          {e.equipment && <span>{e.equipment}</span>}
          <span>{e.mine ? 'своё' : 'общее'}</span>
        </div>

        {e.media
          ? <Media media={e.media} />
          : (
            <div className="library__placeholder">
              {e.mine ? 'Видео нет — его можно приложить в «Изменить».' : 'Анимации для этого упражнения пока нет — приложите своё видео в своей версии.'}
            </div>
          )}

        {e.track && <p className="small muted">Записывается: {trackLine(e.track)}</p>}

        {e.notes && <p className="small" style={{ whiteSpace: 'pre-wrap' }}>{e.notes}</p>}

        <SetupEditor exercise={e} canEdit={e.mine || (e.common && owner)} onSaved={onSetup} />
        <MachinesEditor exercise={e} owner={owner} onChanged={onChanged} />
        <AlternativesEditor exercise={e} owner={owner} all={all} onChanged={onChanged} />

        <div className="library__actions">
          <button className="button" onClick={onEdit}>{e.mine ? 'Изменить' : 'Сделать свою версию'}</button>
          {e.mine && (
            <button className="button button--ghost danger" onClick={async () => {
              if (!window.confirm(`Удалить «${e.name}»? В программах клиентов оно останется.`)) return;
              try {
                await apiMutate('library.exercise.delete', { id: e.id });
                onDeleted();
              } catch (err) {
                setFailure(err);
              }
            }}>Удалить</button>
          )}
          {e.common && (
            <button className="button button--ghost danger" onClick={onRemove}>Убрать у себя</button>
          )}
        </div>
        {!e.mine && (
          <p className="small muted">
            Своя версия видна только вам: с вашей техникой, подсказками и видео. Общая при этом не меняется.
          </p>
        )}
        {failure && <Note tone="critical" icon={IconAlert}>{failure.message}</Note>}
      </Panel>
    </>
  );
}

/**
 * «Как настроить тренажёр» (01.10.2026) — инструкция клиенту без марок:
 * сиденье, спинка, валик, упор. Черновики к общей базе написаны заранее и
 * клиенту не видны, пока владелец не отметит «Проверено». Общую правит
 * только владелец, прямо в базе; тренер — в своей версии упражнения.
 * Сохраняется отдельно от «Изменить»: там правка общего создаёт свою версию.
 */
function SetupEditor({ exercise, canEdit, onSaved }) {
  const e = exercise;
  const [text, setText] = useState(e.setup || '');
  const [ok, setOk] = useState(!!e.setupOk);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  useEffect(() => { setText(e.setup || ''); setOk(!!e.setupOk); }, [e.id, e.setup, e.setupOk]);

  if (!canEdit) {
    return e.setup && e.setupOk
      ? <><h3 className="setup__title">Как настроить тренажёр</h3><SetupText text={e.setup} /></>
      : null;
  }

  const changed = text.trim() !== (e.setup || '') || ok !== !!e.setupOk;
  const save = async () => {
    setBusy(true);
    setFailure(null);
    try {
      await apiMutate('library.exercise.setup', { id: e.id, setup: text, ok });
      haptic('success');
      onSaved();
    } catch (err) {
      setFailure(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="library__form" style={{ marginTop: 'var(--space-3)' }}>
      <label className="field">
        <span className="field__label">
          Как настроить тренажёр {e.setup && !e.setupOk && <Badge kind="warn">черновик — клиенты не видят</Badge>}
        </span>
        <textarea className="field__input library__textarea" value={text} maxLength={1500} rows={5}
          onChange={(ev) => setText(ev.target.value)}
          placeholder={'Сиденье — рукояти на уровне груди.\nСпинка — лопатки прижаты.\nОшибка: локти выше плеч.'} />
        <span className="field__hint">Шаг — строка. «Ошибка: …» клиент увидит отдельно, жёлтым.</span>
      </label>
      <label className="library__check">
        <input type="checkbox" checked={ok} disabled={!text.trim()} onChange={(ev) => setOk(ev.target.checked)} />
        Проверено — показывать клиентам
      </label>
      {failure && <Note tone="critical" icon={IconAlert}>{failure.message}</Note>}
      {changed && (
        <button className="button" disabled={busy} onClick={save}>{busy ? 'Сохраняю…' : 'Сохранить инструкцию'}</button>
      )}
    </div>
  );
}

/** Кто увидит правку тренажёров и замен — и не станет ли она своей версией */
function extrasHint(e, owner) {
  if (e.mine) return 'Видите вы и ваши клиенты.';
  if (owner) return 'Общая база: видят все тренеры и их клиенты. Тренер может сделать свою версию под свой клуб.';
  return 'Первая правка создаст вашу версию упражнения — с этими тренажёрами и заменами. Общая не изменится.';
}

/**
 * Тренажёры упражнения (07.10.2026, FT-478): в разных залах жим ногами
 * стоит разный — у каждого название, фото и где регулировки (без цифр:
 * цифры у каждого клиента свои — сервер, lib/machine-notes.js). Клиент в
 * занятии выбирает, на каком делает, и вес у каждого тренажёра свой.
 * Общее упражнение правит владелец сервиса прямо в базе; другой тренер —
 * в своей версии (сервер создаёт её при первой правке).
 */
function MachinesEditor({ exercise, owner, onChanged }) {
  const e = exercise;
  const machines = e.machines || [];
  const [editing, setEditing] = useState(null);
  const [failure, setFailure] = useState(null);
  useEffect(() => { setEditing(null); setFailure(null); }, [e.id]);

  const done = (saved) => { setEditing(null); if (saved) onChanged(saved); };
  const first = async (m) => {
    setFailure(null);
    try {
      const r = await apiMutate('library.exercise.machine.move', { exerciseId: e.id, uids: [m.uid] });
      haptic('success');
      onChanged(r.exercise);
    } catch (err) {
      setFailure(err);
    }
  };

  return (
    <div className="library__extras">
      <h3 className="setup__title">Тренажёры и оборудование</h3>
      <p className="small muted">
        {machines.length ? extrasHint(e, owner) : 'Если в залах стоят разные тренажёры для этого упражнения — добавьте каждый: фото и где у него регулировки. Вес и настройка (спинка, сиденье) у каждого клиента на каждом тренажёре свои — их записывают в занятии.'}
      </p>
      {machines.map((m, i) => (editing === m.uid
        ? <MachineForm key={m.uid} exercise={e} machine={m} onDone={done} />
        : (
          <div key={m.uid} className="library__machine">
            {m.photo ? <img className="machines__thumb" src={mediaUrl(m.photo)} alt="" loading="lazy" /> : <span className="machines__thumb machines__thumb--empty" aria-hidden="true" />}
            <div className="library__machine-text">
              <strong>{m.name}</strong>
              <span className="small muted">{m.kind === 'equipment' ? 'Оборудование' : 'Тренажёр'}{(m.photos || []).length > 1 ? ' · ' + m.photos.length + ' фото' : ''}</span>
              <span className="small muted">{m.setup ? m.setup.split('\n')[0] : 'Регулировки не описаны — клиент увидит общий принцип.'}</span>
            </div>
            <div className="library__machine-actions">
              {i > 0 && <button type="button" className="button button--ghost" onClick={() => first(m)}>Первым</button>}
              <button type="button" className="button button--ghost" onClick={() => setEditing(m.uid)}>Изменить</button>
            </div>
          </div>
        )))}
      {editing === 'new'
        ? <MachineForm exercise={e} machine={null} onDone={done} />
        : machines.length < 8 && !editing && (
          <button type="button" className="button button--ghost" onClick={() => setEditing('new')}>+ Тренажёр или оборудование</button>
        )}
      {failure && <Note tone="critical" icon={IconAlert}>{failure.message}</Note>}
    </div>
  );
}

/**
 * Один тренажёр: название, фото, где регулировки. Тренажёр сохраняется
 * первым — сервер решает, своё это упражнение или новая своя версия, — и
 * фото кладётся уже к нему. Не загрузилось фото — тренажёр остаётся, форма
 * открыта: повторное «Сохранить» правит его, а не заводит второй.
 */
function MachineForm({ exercise, machine, onDone }) {
  const [name, setName] = useState(machine ? machine.name : '');
  const [setup, setSetup] = useState(machine ? machine.setup : '');
  // Тренажёр или оборудование (владелец, 09.10.2026)
  const [kind, setKind] = useState(machine && machine.kind === 'equipment' ? 'equipment' : 'machine');
  // Фото несколько (09.10.2026): уже сохранённые — убранные удаляются только
  // по «Сохранить» — и новые, ещё не загруженные
  const had = machine ? (machine.photos && machine.photos.length ? machine.photos : machine.photo ? [machine.photo] : []) : [];
  const [dropped, setDropped] = useState([]);
  const [added, setAdded] = useState([]); // [{ blob, url }]
  const [saved, setSaved] = useState({ exerciseId: exercise.id, uid: machine ? machine.uid : '' });
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);

  const kept = had.filter((u) => !dropped.includes(u));
  const total = kept.length + added.length;
  const pick = async (ev) => {
    const files = [...(ev.target.files || [])].slice(0, MAX_MACHINE_PHOTOS - total);
    ev.target.value = '';
    if (!files.length) return;
    setFailure(null);
    try {
      const next = [];
      for (const file of files) {
        const blob = await shrinkPhoto(file);
        next.push({ blob, url: URL.createObjectURL(blob) });
      }
      setAdded((v) => [...v, ...next]);
    } catch (err) {
      setFailure(err);
    }
  };

  const save = async () => {
    setBusy(true);
    setFailure(null);
    let result = null;
    try {
      const r = await apiMutate('library.exercise.machine.save', {
        exerciseId: saved.exerciseId, uid: saved.uid || undefined, name, setup, kind,
        ...(dropped.length ? { removePhotoUrls: dropped } : {}),
      });
      result = r.exercise;
      setSaved({ exerciseId: r.exercise.id, uid: r.uid });
      setDropped([]);
      // Новые — по одному, по порядку; загруженное уходит из очереди
      for (const a of added) {
        await uploadMachinePhoto(r.exercise.id, r.uid, a.blob);
        setAdded((v) => v.filter((x) => x !== a));
      }
      haptic('success');
      onDone(result);
    } catch (err) {
      setFailure(result ? new Error('Сохранено, а фото загрузилось не всё: ' + err.message) : err);
    } finally {
      setBusy(false);
    }
  };

  const word = kind === 'equipment' ? 'оборудование' : 'тренажёр';
  const remove = async () => {
    if (!saved.uid || !window.confirm(`Убрать «${name || machine.name}»?`)) return;
    setBusy(true);
    try {
      const r = await apiMutate('library.exercise.machine.delete', { exerciseId: saved.exerciseId, uid: saved.uid });
      haptic('success');
      onDone(r.exercise);
    } catch (err) {
      setFailure(err);
      setBusy(false);
    }
  };

  const touch = typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  return (
    <div className="library__form library__machine-form">
      <div className="field">
        <span className="field__label">Что это</span>
        <Segmented label="Что это" items={MACHINE_KIND_ITEMS} value={kind} onChange={setKind} />
      </div>
      <label className="field">
        <span className="field__label">Название</span>
        <input className="field__input" value={name} maxLength={80} autoFocus={!machine}
          onChange={(ev) => setName(ev.target.value)} placeholder={kind === 'equipment' ? 'Гантели, фитбол, степ-платформа…' : 'Hammer у окна, Technogym…'} />
      </label>
      <div className="field">
        <span className="field__label">Фото{total ? ' · ' + total + ' из ' + MAX_MACHINE_PHOTOS : ''}</span>
        {total > 0 && (
          <div className="library__photos">
            {kept.map((u) => (
              <div key={u} className="library__photo">
                <img src={mediaUrl(u)} alt="" loading="lazy" />
                <button type="button" className="library__photo-x" aria-label="Убрать фото" onClick={() => setDropped((v) => [...v, u])}><IconClose size={14} /></button>
              </div>
            ))}
            {added.map((a) => (
              <div key={a.url} className="library__photo">
                <img src={a.url} alt="" />
                <button type="button" className="library__photo-x" aria-label="Убрать фото" onClick={() => setAdded((v) => v.filter((x) => x !== a))}><IconClose size={14} /></button>
              </div>
            ))}
          </div>
        )}
        {total < MAX_MACHINE_PHOTOS && (
          <div className="library__machine-actions">
            {/* Камера — отдельной кнопкой (08.10.2026): без capture Android
                открывал только галерею, снять тренажёр было нечем */}
            {touch && (
              <label className="button button--ghost">
                Сфотографировать
                <input type="file" accept="image/*" capture="environment" hidden onChange={pick} />
              </label>
            )}
            <label className="button button--ghost">
              {touch ? 'Из галереи' : total ? 'Ещё фото' : 'Выбрать фото'}
              <input type="file" accept="image/*" multiple hidden onChange={pick} />
            </label>
          </div>
        )}
        <span className="field__hint">Первое фото — главное. Снимайте без людей в кадре — фото увидят клиенты.</span>
      </div>
      <label className="field">
        <span className="field__label">Настройка</span>
        <textarea className="field__input library__textarea" value={setup} maxLength={1500} rows={4}
          onChange={(ev) => setSetup(ev.target.value)}
          placeholder={kind === 'equipment' ? 'Где лежит, что взять для разминки…' : 'Спинка — рычаг справа под сиденьем.\nВалик — кнопка слева, тянуть на себя.'} />
        <span className="field__hint">Без цифр: настройка у каждого клиента своя — её записывают в занятии. Шаг — строка.</span>
      </label>
      {failure && <Note tone="critical" icon={IconAlert}>{failure.message}</Note>}
      <div className="library__actions">
        <button type="button" className="button" disabled={busy || name.trim().length < 2} onClick={save}>{busy ? 'Сохраняю…' : 'Сохранить'}</button>
        <button type="button" className="button button--ghost" disabled={busy} onClick={() => onDone(null)}>Отмена</button>
        {saved.uid && <button type="button" className="button button--ghost danger" disabled={busy} onClick={remove}>Убрать {word}</button>}
      </div>
    </div>
  );
}

const MAX_MACHINE_PHOTOS = 6;

/**
 * Замены упражнения (07.10.2026, FT-479): тренажёр занят — клиент в
 * занятии одним касанием меняет упражнение на одно из этих. У общего
 * упражнения в общей базе — замены тоже из общей базы
 */
function AlternativesEditor({ exercise, owner, all, onChanged }) {
  const e = exercise;
  const alts = e.alternatives || [];
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  useEffect(() => { setAdding(false); setQ(''); setFailure(null); }, [e.id]);

  const save = async (ids) => {
    setBusy(true);
    setFailure(null);
    try {
      const r = await apiMutate('library.exercise.alternatives', { exerciseId: e.id, ids });
      haptic('success');
      setQ('');
      onChanged(r.exercise);
    } catch (err) {
      setFailure(err);
    } finally {
      setBusy(false);
    }
  };

  const key = (t) => String(t || '').toLowerCase().replace(/ё/g, 'е');
  const commonOnly = e.common && owner;
  const found = q.trim().length < 2 ? [] : (all || [])
    .filter((x) => x.id !== e.id && !alts.some((a) => a.id === x.id) && (!commonOnly || x.common))
    .filter((x) => key(x.name).includes(key(q.trim())))
    .slice(0, 8);

  return (
    <div className="library__extras">
      <h3 className="setup__title">Замены</h3>
      <p className="small muted">
        {alts.length ? extrasHint(e, owner) : 'Чем заменить, если тренажёр занят: клиент поменяет упражнение в занятии одним касанием.'}
      </p>
      {alts.length > 0 && (
        <div className="chips chips--flush chips--wrap">
          {alts.map((a) => (
            <button key={a.id} type="button" className="chip" disabled={busy} aria-label={`Убрать замену «${a.name}»`}
              onClick={() => save(alts.filter((x) => x.id !== a.id).map((x) => x.id))}>
              {a.name} ×
            </button>
          ))}
        </div>
      )}
      {adding ? (
        <div className="library__form">
          <Search value={q} onChange={setQ} placeholder="Найти упражнение" />
          {found.map((x) => (
            <button key={x.id} type="button" className="button button--ghost library__alt-pick" disabled={busy}
              onClick={() => save([...alts.map((a) => a.id), x.id])}>{x.name}</button>
          ))}
          {q.trim().length >= 2 && !found.length && <p className="small muted">Не нашлось.{commonOnly ? ' В общей базе — только общие упражнения.' : ''}</p>}
          <button type="button" className="button button--ghost" onClick={() => { setAdding(false); setQ(''); }}>Готово</button>
        </div>
      ) : alts.length < 6 && (
        <button type="button" className="button button--ghost" onClick={() => setAdding(true)}>+ Замена</button>
      )}
      {failure && <Note tone="critical" icon={IconAlert}>{failure.message}</Note>}
    </div>
  );
}

/** «Кардио · Беговая дорожка», «Силовое · вес с одной стороны» (+ «авто») */
function trackLine(t) {
  return [
    KIND_LABELS[t.kind],
    t.kind === 'cardio' && MACHINE_LABELS[t.machine],
    t.unilateral && 'повторы на сторону',
    t.perSide && 'вес с одной стороны',
  ].filter(Boolean).join(' · ') + (t.auto ? ' (определено само)' : '');
}

function ExerciseEditor({ exercise, muscles, onSaved, onCancel }) {
  const [name, setName] = useState(exercise ? exercise.name : '');
  const [muscle, setMuscle] = useState(exercise ? exercise.muscle : '');
  const [equipment, setEquipment] = useState(exercise ? exercise.equipment : '');
  const [notes, setNotes] = useState(exercise ? exercise.notes : '');
  const [link, setLink] = useState(exercise && exercise.media && exercise.media.kind === 'link' ? exercise.media.url : '');
  // Тип учёта: «авто» — угадывается по названию и инвентарю; остальное —
  // выбор тренера, когда угадано не так
  const known = exercise && exercise.track;
  const [kind, setKind] = useState(known && !known.auto ? known.kind : 'auto');
  const [machine] = useState((known && known.machine) || 'treadmill');
  const [unilateral, setUnilateral] = useState(!!(known && known.unilateral));
  const [perSide, setPerSide] = useState(!!(known && known.perSide));
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);

  const hasFile = exercise && exercise.mine && exercise.media && exercise.media.kind === 'file';
  // Пустое поле ссылки не стирает загруженный файл и анимацию
  const keepsMedia = hasFile || (exercise && exercise.media && exercise.media.kind === 'animation');

  const save = async () => {
    setBusy(true);
    setFailure(null);
    try {
      const saved = await apiMutate('library.exercise.save', {
        // Общее не правится: с его id сервер создаст свою версию
        id: exercise ? exercise.id : undefined,
        name: name.trim(),
        muscle,
        equipment,
        notes,
        track: kind === 'auto' ? { auto: true } : { kind, machine, unilateral, perSide },
        // Ссылку не трогаем, если загружен файл и поле пустое
        ...(link || !keepsMedia ? { link } : {}),
      });

      if (file) {
        setProgress(0);
        await uploadVideo(saved.id, file, setProgress);
      }

      haptic('success');
      onSaved(saved);
    } catch (err) {
      setFailure(err);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <>
      <Back onClick={onCancel}>Отмена</Back>
      <Panel pad>
        <div className="library__form">
          <Field label="Название" inputMode="text" value={name} onChange={setName} placeholder="Жим гантелей лёжа" />

          <div>
            <span className="field__label">Группа мышц</span>
            <Chips items={[{ value: '', label: 'Не указана' }, ...muscles.map((m) => ({ value: m, label: m }))]} value={muscle} onChange={setMuscle} />
          </div>

          <Field label="Инвентарь" inputMode="text" value={equipment} onChange={setEquipment} placeholder="Гантели" />

          <div>
            <span className="field__label">Что записывать в подходе</span>
            <Chips
              items={[{ value: 'auto', label: known && known.auto ? 'Само: ' + KIND_LABELS[known.kind].toLowerCase() : 'Определить само' },
                ...Object.entries(KIND_LABELS).map(([value, label]) => ({ value, label }))]}
              value={kind}
              onChange={setKind}
            />
          </div>
          {/* Тренажёр у кардио не выбирают (09.10.2026): настройки — в программе */}
          {kind !== 'auto' && kind !== 'cardio' && (
            <label className="library__check"><input type="checkbox" checked={unilateral} onChange={(e) => setUnilateral(e.target.checked)} />Повторы на каждую сторону (выпады, тяга одной рукой)</label>
          )}
          {kind === 'strength' && (
            <label className="library__check"><input type="checkbox" checked={perSide} onChange={(e) => setPerSide(e.target.checked)} />Вес с одной стороны (гантели, Смит, рычажные)</label>
          )}

          <label className="field">
            <span className="field__label">Техника и подсказки</span>
            <textarea className="field__input library__textarea" value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} placeholder="На что обратить внимание" />
          </label>

          <Field label="Видео — ссылка" inputMode="url" value={link} onChange={setLink} placeholder="https://youtu.be/…" hint="YouTube, VK, Rutube — любая ссылка" />

          <label className="field">
            <span className="field__label">Или файлом с телефона</span>
            <input type="file" accept="video/mp4,video/quicktime,video/webm,video/x-m4v" onChange={(e) => setFile(e.target.files[0] || null)} />
            <span className="field__hint">
              {file
                ? `${file.name} · ${Math.round(file.size / 1024 / 1024)} МБ`
                : hasFile ? 'Загружено своё видео — новый файл заменит его' : 'До 500 МБ'}
            </span>
          </label>

          {progress !== null && (
            <div className="library__progress" role="progressbar" aria-valuenow={Math.round(progress * 100)}>
              <span style={{ transform: `scaleX(${progress})` }} />
              <em>Загружаю видео… {Math.round(progress * 100)}%</em>
            </div>
          )}

          {failure && <Note tone="critical" icon={IconAlert}>{failure.message}</Note>}

          <div className="library__actions">
            <button className="button button--primary" disabled={busy || name.trim().length < 2} onClick={save}>
              {busy ? 'Сохраняю…' : 'Сохранить'}
            </button>
            <button className="button" disabled={busy} onClick={onCancel}>Отмена</button>
          </div>
        </div>
      </Panel>
    </>
  );
}
