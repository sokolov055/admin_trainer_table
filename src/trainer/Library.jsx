import { useReturnScroll } from '../scroll.js';
import React, { useEffect, useState } from 'react';
import { useData } from '../useData.js';
import { apiMutate, apiPublic } from '../api.js';
import { haptic } from '../telegram.js';
import { useBackGesture } from '../gestures.jsx';
import PlanEditor from './PlanEditor.jsx';
import Dishes from './Dishes.jsx';
import { uploadVideo, mediaUrl, youtubeEmbed, monthName } from '../library.js';
import {
  Section, Panel, Loading, ErrorState, Empty, Badge, Chips, Search, Segmented, Field, Note, plural,
} from '../ui.jsx';
import { IconBack, IconPlan, IconSearch, IconAlert, IconCheck, IconTrash } from '../icons.jsx';

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
  // Блюда для рациона клиентов: черновики на проверку, публикация, правка
  { value: 'dishes', label: 'Блюда' },
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

  const remove = async (t) => {
    if (!window.confirm(`Удалить шаблон «${t.title}»? Программ клиентов это не коснётся.`)) return;
    setFailure(null);
    try {
      await apiMutate('library.template.delete', { id: t.id });
      haptic('success');
      list.reload();
    } catch (err) {
      setFailure(err);
    }
  };

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

      {shown.map((t) => (
        <Row
          key={t.id}
          pruning={pruning && t.mine}
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
    </>
  );
}

/**
 * Строка списка. В режиме правки она не открывается, а показывает кнопку
 * удаления: так удаляют сразу несколько, не заходя в каждое.
 */
function Row({ pruning, onOpen, onRemove, removeLabel, removeText = 'Удалить', children }) {
  if (!pruning) {
    return <button className="item" onClick={onOpen}>{children}</button>;
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
  const volume = [e.sets, e.reps].filter(Boolean).join('×');
  const extra = [volume, e.weight && e.weight + (/\d$/.test(e.weight) ? ' кг' : ''), e.rpe && 'RPE ' + e.rpe].filter(Boolean).join(', ');
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
  const [showHidden, setShowHidden] = useState(false);
  const [failure, setFailure] = useState(null);

  useBackGesture(() => setEditing(null), !!editing);
  useBackGesture(() => setShowHidden(false), !editing && showHidden);
  useBackGesture(() => setOpen(null), !editing && !showHidden && !!open);
  useReturnScroll(!!(editing || showHidden || open));

  if (loading) return <Loading lead={false} rows={5} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  if (showHidden) {
    return <HiddenExercises onBack={() => { setShowHidden(false); reload(); }} />;
  }

  const remove = async (e) => {
    const question = e.common
      ? `Убрать «${e.name}» из вашего списка? У других тренеров оно останется, а вернуть его можно в «Убранных».`
      : `Удалить «${e.name}»? В программах клиентов оно останется.`;
    if (!window.confirm(question)) return;
    setFailure(null);
    try {
      await apiMutate('library.exercise.delete', { id: e.id });
      haptic('success');
      reload();
    } catch (err) {
      setFailure(err);
    }
  };

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
        onBack={() => setOpen(null)}
        onEdit={() => setEditing(current)}
        onDeleted={() => { setOpen(null); reload(); }}
        onRemove={() => remove(current).then(() => setOpen(null))}
      />
    );
  }

  const muscles = [{ value: '', label: 'Все' }, ...data.muscles.map((m) => ({ value: m, label: m })), { value: '—', label: 'Без группы' }];
  const shown = all
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
        {data.hiddenCount > 0 && (
          <button className="button button--ghost" onClick={() => { setShowHidden(true); setPruning(false); }}>
            Убранные · {data.hiddenCount}
          </button>
        )}
      </div>
      {failure && <Note tone="critical" icon={IconAlert}>{failure.message}</Note>}

      {shown.slice(0, 200).map((e) => (
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
          </div>
        </Row>
      ))}
      {shown.length > 200 && <p className="small muted">Показаны первые 200 — уточните поиск.</p>}
    </>
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

const ANIM_ID = /^[\w-]+$/;

function prefersStill() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; }
}

/**
 * Анимация техники из двух кадров — начало и конец движения.
 *
 * Кадры — из free-exercise-db (общественное достояние), лежат в самом
 * приложении: public/anim/<id>/. Верхний кадр плавно проявляется поверх
 * нижнего, поэтому посередине смены не бывает пустоты. Нажатие ставит на
 * паузу; тем, кто просил систему меньше двигать, анимация сама не
 * запускается — только по нажатию.
 */
export function Animation({ id }) {
  const [frame, setFrame] = useState(0);
  const [loaded, setLoaded] = useState(0);
  const [playing, setPlaying] = useState(() => !prefersStill());

  useEffect(() => {
    if (!playing || loaded < 2) return undefined;
    const timer = setInterval(() => setFrame((f) => 1 - f), 1100);
    return () => clearInterval(timer);
  }, [playing, loaded]);

  if (!ANIM_ID.test(id || '')) return null;
  const src = (n) => `${(import.meta.env && import.meta.env.BASE_URL) || '/'}anim/${id}/${n}.jpg`;
  const onLoad = () => setLoaded((n) => n + 1);

  return (
    <button
      type="button"
      className="library__anim"
      aria-label={playing ? 'Остановить анимацию' : 'Показать движение'}
      onClick={() => { setPlaying(!playing); haptic(); }}
    >
      <img src={src(0)} alt="Начало движения" onLoad={onLoad} draggable="false" />
      <img src={src(1)} alt="Конец движения" onLoad={onLoad} draggable="false" data-off={frame === 0 ? '' : undefined} />
      {!playing && <span className="library__anim-note">Нажмите — покажу движение</span>}
    </button>
  );
}

export function Media({ media }) {
  if (!media) return null;
  if (media.kind === 'animation') return <Animation id={media.url} />;
  if (media.kind === 'file') {
    return <video className="library__video" src={mediaUrl(media.url)} controls playsInline preload="metadata" />;
  }
  const embed = youtubeEmbed(media.url);
  if (embed) {
    return (
      <iframe
        className="library__video"
        src={embed}
        title="Видео упражнения"
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    );
  }
  return <a className="button button--block" href={media.url} target="_blank" rel="noreferrer">Открыть видео</a>;
}

function ExerciseView({ exercise, onBack, onEdit, onDeleted, onRemove }) {
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

        {e.notes && <p className="small" style={{ whiteSpace: 'pre-wrap' }}>{e.notes}</p>}

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

function ExerciseEditor({ exercise, muscles, onSaved, onCancel }) {
  const [name, setName] = useState(exercise ? exercise.name : '');
  const [muscle, setMuscle] = useState(exercise ? exercise.muscle : '');
  const [equipment, setEquipment] = useState(exercise ? exercise.equipment : '');
  const [notes, setNotes] = useState(exercise ? exercise.notes : '');
  const [link, setLink] = useState(exercise && exercise.media && exercise.media.kind === 'link' ? exercise.media.url : '');
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
