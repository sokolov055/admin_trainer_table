import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { apiMutate, apiPublic } from '../api.js';
import { haptic } from '../telegram.js';
import { useTabLock } from '../gestures.jsx';
import { Sheet, Note } from '../ui.jsx';
import { IconAlert, IconClock, IconCopy, IconPen, IconUsers } from '../icons.jsx';
import { BlockEdit, blankExercise } from './PlanInline.jsx';
import { Toggle, PassportSheet } from './ProgramEditor.jsx';
import { cleanBlocks, draftOf, draftSnapshot, autoMinutes } from './program-edit-model.js';
import { goalLook } from './program-list-model.js';
import { GoalIcon } from './ProgramList.jsx';
import './programs-lib.css';

/**
 * Редактор тренировки «Библиотеки» (этап 3 макета trainirovki-library-v2,
 * 25.11.2026): та же оболочка, что у программы (ProgramEditor.jsx) — «Отмена ·
 * Тренировка · Сохранить», название, паспорт чипами (цель, ≈ минут), описание,
 * «Общая». Без недель и без клиентов. Упражнения — тот же BlockEdit, что в
 * программе: по подходам, по кругам, разминка, дропсет, отдых — без сворачивания.
 *
 * Стоит в программах — перед сохранением спрашиваем листом, обновить ли копии.
 */

const SHORT_GOAL = { 'Набор массы': 'Масса', 'Здоровая спина': 'Спина', 'Реабилитация': 'Реабили­тация', 'Выносливость': 'Выносли­вость' };

const programsWord = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'программе' : 'программах');

export default function WorkoutEditor({ template, onSaved, onCancel, confirm = null, onDirty }) {
  const t = template || {};
  const [card, setCard] = useState(() => ({ title: t.title || '', goal: t.goal || '', description: t.description || '', isPublic: !!t.isPublic }));
  const set = (patch) => { setCard((c) => ({ ...c, ...patch })); setFailure(null); };
  const [draft, setDraft] = useState(() => draftOf(
    template ? template.blocks.slice(0, 1) : [{ title: 'Тренировка', exercises: [] }],
    blankExercise,
  ));
  const block = draft[0];
  const [sheet, setSheet] = useState(null); // 'card' | 'ask'
  const [descOpen, setDescOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const [ask, setAsk] = useState(null); // { programs, resolve }
  const nameRef = useRef(null);

  // Есть ли несохранённое: карточка и упражнения против открытого
  const snap = () => JSON.stringify([card, draftSnapshot(draft)]);
  const [initial] = useState(snap);
  const dirty = snap() !== initial;
  useEffect(() => { if (onDirty) onDirty(dirty); }, [dirty]);

  // Правка — не раздел: смахнуть в соседний раздел значило бы бросить несохранённое
  useTabLock(true);

  // Название крупно, в несколько строк — поле растёт под текст
  useLayoutEffect(() => {
    const el = nameRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [card.title]);

  const change = (fn) => {
    setDraft((prev) => fn(prev.map((b) => ({ ...b, exercises: b.exercises.map((e) => ({ ...e })) }))));
    setFailure(null);
  };

  const auto = { minutes: autoMinutes(draft) };

  // Стоит в программах: лист «Обновить в N программах» решает до сохранения.
  // Закрыли листом — null, сохранение отменяется
  const askPropagate = (programs) => new Promise((resolve) => setAsk({ programs, resolve }));
  const answer = (value) => { ask.resolve(value); setAsk(null); };

  const save = async () => {
    if (!card.title.trim()) {
      setFailure({ message: 'Назовите тренировку.' });
      if (nameRef.current) nameRef.current.focus();
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      let propagate = false;
      if (template) {
        const usage = await apiPublic('library.template.usage', { id: template.id });
        if (usage.programs.length) {
          propagate = await askPropagate(usage.programs);
          if (propagate === null) return;
        }
      }
      const saved = await apiMutate('library.template.save', {
        id: template ? template.id : undefined,
        kind: 'workout',
        title: card.title.trim(),
        goal: card.goal,
        description: card.description,
        isPublic: card.isPublic,
        blocks: cleanBlocks(draft),
        weekLength: 0,
        propagate,
      });
      haptic('success');
      onSaved(saved);
    } catch (err) {
      setFailure(err);
    } finally {
      setBusy(false);
    }
  };

  const goalChip = card.goal
    ? <><span className={'plib-dot plib-dot--sm plib-goal--' + goalLook(card.goal).key}><GoalIcon goal={card.goal} size={13} /></span>{card.goal}</>
    : <span className="plib-pass__empty">Цель</span>;

  return (
    <div className="plib plib-ed">
      <div className="plib-etop">
        <button type="button" className="plib-etop__c" onClick={onCancel}>Отмена</button>
        <b>Тренировка</b>
        <button type="button" className={'plib-etop__s' + (dirty ? ' is-dirty' : '')} disabled={busy} onClick={save}
          aria-label={dirty ? 'Сохранить — есть несохранённое' : 'Сохранить'}>
          {busy ? 'Сохраняем…' : 'Сохранить'}
        </button>
      </div>
      {confirm}
      {failure && <Note tone="critical" icon={IconAlert}>{failure.message || 'Не получилось сохранить'}</Note>}

      <textarea ref={nameRef} rows={1} className="plib-ename" aria-label="Название тренировки" placeholder="Название тренировки"
        value={card.title} maxLength={120}
        onChange={(e) => set({ title: e.target.value.replace(/\n/g, ' ') })}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />

      <div className="plib-pass">
        <button type="button" className="plib-pchip" onClick={() => { haptic(); setSheet('card'); }}>{goalChip}</button>
        <button type="button" className={'plib-pchip' + (auto.minutes ? ' is-auto' : '')} onClick={() => { haptic(); setSheet('card'); }}>
          <IconClock size={16} />{auto.minutes ? '≈ ' + auto.minutes + ' мин' : 'Минуты'}
        </button>
      </div>

      {descOpen ? (
        <label className="field plib-desc-field">
          <span className="field__label">Описание</span>
          <textarea className="field__input library__textarea" value={card.description} maxLength={1000} autoFocus
            placeholder="На что обратить внимание: темп, техника, отдых"
            onChange={(e) => set({ description: e.target.value })} />
        </label>
      ) : (
        card.description.trim()
          ? <button type="button" className="plib-desc-prev" aria-label="Описание — изменить" onClick={() => { haptic(); setDescOpen(true); }}>
            <span>{card.description}</span><IconPen size={15} />
          </button>
          : <button type="button" className="plib-addd" onClick={() => { haptic(); setDescOpen(true); }}>＋ Описание</button>
      )}

      <div className="plib-sect">
        <span>Упражнения</span>
        <span>{block.exercises.length} · {block.exercises.reduce((n, e) => n + (e.cardio ? 0 : Number(e.sets) || 0), 0)} подходов</span>
      </div>
      <BlockEdit
        block={block}
        canRemove={false}
        onChange={(exercises) => change((next) => { next[0].exercises = exercises; return next; })}
      />

      <div className="plib-vis">
        <Toggle on={card.isPublic} icon={<IconUsers size={18} />} title="Общая для тренеров" hint="скопируют с вашим именем" onChange={(v) => set({ isPublic: v })} />
      </div>

      {sheet === 'card' && <PassportSheet card={card} set={set} auto={auto} workout onClose={() => setSheet(null)} />}
      {ask && (
        <Sheet title={`Обновить в ${ask.programs.length} ${programsWord(ask.programs.length)}`} onClose={() => answer(null)}>
          <div className="plib-menu">
            <p className="plib-gaps">
              Тренировка стоит в: {ask.programs.map((p) => '«' + p.title + '»').join(', ')}. Обновить её там тоже?
              Программы, уже выданные клиентам, не изменятся в любом случае.
            </p>
            <button type="button" className="plib-menu__item" onClick={() => { haptic(); answer(true); }}>
              <span className="plib-menu__icon"><IconCopy size={20} /></span>
              <span><b>Обновить в программах</b><small>Копии в программах станут такими же</small></span>
            </button>
            <button type="button" className="plib-menu__item" onClick={() => { haptic(); answer(false); }}>
              <span className="plib-menu__icon"><IconPen size={20} /></span>
              <span><b>Только этот шаблон</b><small>Программы останутся как есть</small></span>
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
