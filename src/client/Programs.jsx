import React, { useState } from 'react';
import { useData } from '../useData.js';
import { apiMutate } from '../api.js';
import { haptic } from '../telegram.js';
import { requestQuick } from '../quick-actions.js';
import { Section, Loading, ErrorState, Empty, Note, Sheet, plural } from '../ui.jsx';
import { IconBack, IconCheck, IconAlert, IconClose, IconSearch } from '../icons.jsx';
import { tidyTitle } from './Onboarding.jsx';
import { LevelTag } from './ProgramFacts.jsx';
import {
  filterChips, toggleFilter, applyFilters, groupByGoal, explainTitle, minutesText, timesText, placeText,
} from './programs-model.js';
import './programs.css';

/**
 * «Программы тренера» (FT-497, 21.10.2026; образец — каталог SmartGym,
 * фильтры — Shagulin). Клиент видит программы, которые его тренер
 * отметил «Показывать моим клиентам», и просит понравившуюся:
 * «Хочу эту программу» — заявка ложится тренеру в «Пожелания клиента», он
 * назначает её одной кнопкой. Сам клиент программу себе не ставит —
 * программу ведёт тренер (решение 24.09.2026: библиотека — только ему).
 *
 * В «Тренировках» — ряд карточек (ProgramsSection), целиком — с фильтрами
 * и группами по цели (ProgramsShowcase). Клиенту без тренера витрины нет:
 * у него подбор по анкете, с теми же метками на карточках (Onboarding.jsx).
 * Сервер: api/showcase-handlers.js.
 */

const paramsOf = (clientRow) => (clientRow ? { clientRow } : {});

/** «≈ 45 мин · зал» и «2 раза в неделю» — двумя строками, как в макете */
function factLines(p) {
  return [[minutesText(p), placeText(p)].filter(Boolean).join(' · '), timesText(p)].filter(Boolean);
}

function ProgramCard({ p, onOpen }) {
  const hint = explainTitle(p.title)[0];
  return (
    <button type="button" className="pcard" onClick={() => { onOpen(p); haptic(); }}>
      <LevelTag level={p.level} />
      <strong className="pcard__title">{tidyTitle(p.title)}</strong>
      {hint && <span className="pcard__hint">{hint}</span>}
      <span className="pcard__facts">
        {factLines(p).map((line) => <span key={line}>{line}</span>)}
        {p.requested && <span className="pcard__asked"><IconCheck size={13} />Заявка у тренера</span>}
      </span>
    </button>
  );
}

function ProgramRow({ items, onOpen }) {
  return (
    <div className="pcards">
      {items.map((p) => <ProgramCard key={p.id} p={p} onOpen={onOpen} />)}
    </div>
  );
}

/**
 * Программа в нижнем окне: метки, расшифровка сокращений, описание,
 * кнопка заявки — до списка тренировок: решают по карточке, а список
 * дочитывают те, кому интересно, что внутри.
 */
function ProgramSheet({ p, clientRow, clientView, onClose }) {
  const full = useData('showcase.get', { id: p.id, ...paramsOf(clientRow) }, [p.id, clientRow]);
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState(false);
  const [problem, setProblem] = useState('');
  const info = full.data || p;
  const requested = asked || !!info.requested;
  const hints = explainTitle(p.title);

  const ask = async () => {
    setBusy(true);
    setProblem('');
    try {
      await apiMutate('showcase.request', { id: p.id });
      setAsked(true);
      haptic('success');
    } catch (error) {
      setProblem(error.message || 'Не получилось отправить заявку.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title={tidyTitle(p.title)} onClose={onClose} locked={busy}>
      <div className="psheet__facts">
        <LevelTag level={info.level} />
        <span>{[minutesText(info), timesText(info), placeText(info)].filter(Boolean).join(' · ')}</span>
      </div>
      {hints.length > 0 && <ul className="psheet__hints">{hints.map((h) => <li key={h}>{h}</li>)}</ul>}
      {info.description && <p className="psheet__text">{info.description}</p>}

      <div className="psheet__action">
        {clientView ? (
          <Note>Так программу видит клиент. Попросить её может только он сам — заявка придёт вам в «Пожелания клиента».</Note>
        ) : requested ? (
          <Note tone="good" icon={IconCheck}>Заявка у тренера. Когда он назначит программу, она появится здесь, в «Тренировках».</Note>
        ) : (
          <>
            <button type="button" className="button button--primary button--block" disabled={busy} onClick={ask}>
              {busy ? 'Отправляю…' : 'Хочу эту программу'}
            </button>
            <p className="small muted">Тренер посмотрит заявку и поставит программу в ваши тренировки — или предложит другую.</p>
          </>
        )}
        {problem && <Note tone="critical" icon={IconAlert}>{problem}</Note>}
      </div>

      {full.loading && <Loading lead={false} rows={2} />}
      {full.error && <ErrorState error={full.error} onRetry={full.reload} />}
      {full.data && full.data.sessions.map((s, i) => (
        <section key={i} className="psheet__session">
          <h3><span className="psheet__num">{i + 1}</span>{s.title}</h3>
          <ol>
            {s.exercises.map((e, j) => (
              <li key={j} className={e.superset ? 'is-superset' : undefined}>
                <span>{e.name}</span>
                {e.volume && <span className="psheet__volume">{e.volume}</span>}
              </li>
            ))}
          </ol>
        </section>
      ))}
      {full.data && full.data.repeats && <p className="small muted">Эти тренировки идут по кругу весь месяц.</p>}
    </Sheet>
  );
}

/**
 * Ряд карточек в «Тренировках» клиента. Нет тренера, нет показанных
 * программ или сервер о витрине не знает — раздела нет вовсе.
 */
export function ProgramsSection({ clientRow = 0, clientView = false, onOpenAll }) {
  const list = useData('showcase.list', paramsOf(clientRow), [clientRow]);
  const [open, setOpen] = useState(null);
  const programs = (list.data && list.data.available && list.data.programs) || [];
  if (!programs.length) return null;
  const ordered = groupByGoal(programs).flatMap((g) => g.items);
  const n = programs.length;

  return (
    <Section
      title="Программы тренера"
      note={n + ' ' + plural(n, 'программа', 'программы', 'программ') + ' — выберите и попросите тренера'}
      action={<button type="button" className="button button--ghost plan-programs__all" onClick={onOpenAll}>Все</button>}
    >
      <ProgramRow items={ordered} onOpen={setOpen} />
      {open && <ProgramSheet p={open} clientRow={clientRow} clientView={clientView} onClose={() => setOpen(null)} />}
    </Section>
  );
}

/**
 * Витрина целиком: фильтры-пилюли сверху (раз в неделю, место, опыт;
 * выбранная подсвечена и снимается «×», список сужается сразу) и группы
 * по цели из шаблонов. Отступ под плавающим меню даёт main (96 px), так
 * что метки последней карточки меню не закрывает.
 */
export function ProgramsShowcase({ clientRow = 0, clientView = false, onClose }) {
  const list = useData('showcase.list', paramsOf(clientRow), [clientRow]);
  const [filters, setFilters] = useState({});
  const [open, setOpen] = useState(null);

  const programs = (list.data && list.data.programs) || [];
  const chips = filterChips(programs);
  const shown = applyFilters(programs, filters);
  const groups = groupByGoal(shown);
  const trainer = list.data && list.data.trainer;
  // Пожелание тренеру — кнопкой, а не словами «внизу „Тренировок“» (аудит
  // 24.10.2026): закрыть витрину и подвести экран к полю пожелания (тот же
  // запрос, что у «Написать тренеру» в «+»). Кадр ждём, чтобы поле уже было
  // на странице — иначе запрос снимется впустую. «Глазами клиента» поля нет
  const toWish = clientView ? null : () => {
    haptic();
    onClose();
    requestAnimationFrame(() => requestQuick('wish'));
  };
  const wishButton = (label) => (toWish
    ? <button type="button" className="button" onClick={toWish}>{label}</button>
    : null);

  return (
    <>
      <button type="button" className="button button--ghost library__back" onClick={onClose}>
        <IconBack size={16} />
        К тренировкам
      </button>
      <h2 className="programs__title">Программы тренера</h2>
      <p className="programs__lead">
        {clientView
          ? 'Так клиент видит программы, которые вы отметили «Показывать моим клиентам».'
          : `Программы, которые подготовил${trainer && trainer !== 'Тренер' ? ' ' + trainer : ' ваш тренер'}. Выберите подходящую — тренер посмотрит заявку и поставит программу в ваши тренировки.`}
      </p>

      {chips.length > 0 && (
        <div className="chips chips--wrap programs__filters" role="group" aria-label="Фильтры программ">
          {chips.map((c) => {
            const on = filters[c.key] === c.value;
            return (
              <button
                key={c.key + ':' + c.value}
                type="button"
                className={'chip' + (on ? ' chip--active' : '')}
                aria-pressed={on}
                onClick={() => { setFilters((f) => toggleFilter(f, c.key, c.value)); haptic(); }}
              >
                {c.label}
                {on && <IconClose size={12} />}
              </button>
            );
          })}
        </div>
      )}

      {list.loading && <Loading lead={false} rows={3} />}
      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
      {list.data && !programs.length && (
        <Empty title="Программ пока нет" text="Тренер ещё не показал клиентам ни одной программы — напишите ему, какая нужна."
          action={wishButton('Написать пожелание тренеру')} />
      )}
      {programs.length > 0 && !shown.length && (
        <Empty
          icon={IconSearch}
          title="Под эти условия программ нет"
          text="Снимите один из фильтров — или напишите тренеру, какая программа нужна."
          action={<div className="programs__empty-actions">
            <button type="button" className="button" onClick={() => setFilters({})}>Сбросить фильтры</button>
            {wishButton('Написать тренеру')}
          </div>}
        />
      )}

      {groups.map((g) => (
        <section key={g.goal || '—'} className="programs__group">
          <div className="programs__group-head">
            <h3>{g.title}</h3>
            <span>{g.items.length} {plural(g.items.length, 'программа', 'программы', 'программ')}</span>
          </div>
          <ProgramRow items={g.items} onOpen={setOpen} />
        </section>
      ))}

      {open && <ProgramSheet p={open} clientRow={clientRow} clientView={clientView} onClose={() => setOpen(null)} />}
    </>
  );
}
