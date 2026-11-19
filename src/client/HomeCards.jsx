import React from 'react';
import { Qty, formatMoney, formatNumber, formatWhen, relativeDays, plural } from '../ui.jsx';
import { IconPlay, IconSend, IconAlert, IconSnow } from '../icons.jsx';
import { requestQuick } from '../quick-actions.js';
import { haptic } from '../telegram.js';
import { slotTones, slotClass, muscleTone, muscleClass } from '../data-tones.js';
import { useMainAction } from './main-action.js';
import { SCHEDULE_UNKNOWN } from './schedule-text.js';
import { ticketRow, enoughUntil, dayMonth, topGroups, isToday, WISH_PAY, WISH_TIME } from './home-model.js';
import './home-cards.css';

/*
 * Главная клиента, этап 1 (макет home-redesign-2026-11-19, согласован
 * владельцем 19.11.2026): «Следующая тренировка» — цветом своей тренировки,
 * и «Оплачено вперёд» — билетиками вместо строки цифр.
 *
 * mode: 'own' — сам клиент, кнопки работают; 'preview' — тренер «глазами
 * клиента», кнопки видны, но не нажимаются; 'trainer' — карточка клиента у
 * тренера, кнопок нет (действия клиентские). onGo(tab) — переключить вкладку.
 */

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function go(onGo, tab, kind, payload) {
  haptic();
  onGo(tab);
  if (kind) requestQuick(kind, payload || {});
}

/* ==================================================================
 * Следующая тренировка
 * ================================================================== */

export function NextCard({ data, clientRow, mode, onGo, onPause = null }) {
  const main = useMainAction(clientRow, mode === 'preview');
  const online = !!data.online;
  const when = data.nextTrainingDate;
  const unknown = !when && data.scheduleKnown !== true;
  const today = isToday(when) || !!main.live;
  const live = mode === 'own' && onGo;
  const buttons = mode !== 'trainer';

  // Занятий впереди нет (и мы это знаем) — пустая карточка с выходом
  if (!when && !unknown && !online && !main.live) {
    return (
      <section className="home-next home-next--empty enter" aria-label="Следующая тренировка">
        <div className="home-next__row">
          <span className="home-next__emoji" aria-hidden="true">🗓️</span>
          <div>
            <div className="home-next__empty-title">Следующая не назначена</div>
            <div className="small muted">
              {data.lastTrainingDate ? 'Последняя — ' + relativeDays(data.lastTrainingDate) : 'Тренировок ещё не было'}
            </div>
          </div>
        </div>
        {buttons && (
          <div className="home-next__actions">
            <button type="button" className="button button--small" disabled={!live}
              onClick={() => go(onGo, 'plan', 'wish', { text: WISH_TIME })}>
              <IconSend size={16} /> Попросить время
            </button>
            <button type="button" className="button button--small" disabled={!live}
              onClick={() => go(onGo, 'plan', 'workout', main.payload)}>
              {main.block ? 'Потренироваться самому' : 'Свободная тренировка'}
            </button>
          </div>
        )}
      </section>
    );
  }

  const block = main.block;
  const tones = block && Array.isArray(main.blocks) ? slotTones(main.blocks) : null;
  const tone = slotClass(tones ? tones.get(block.title) : 0) || 'tone-s0';
  const groups = block ? topGroups(block.exercises, muscleTone) : [];
  const count = block && Array.isArray(block.exercises) ? block.exercises.length : 0;
  const title = main.live ? main.note.replace(/ · (идёт|на паузе)$/, '') : block ? block.title : online ? 'Свободная тренировка' : 'Тренировка';
  const month = Number(data.trainingsThisMonth) || 0;

  return (
    <section className={'home-next enter ' + tone} aria-label="Следующая тренировка">
      <span className="home-next__deco" aria-hidden="true" />
      <div className="home-next__row">
        {main.live ? (
          <span className="home-next__when"><span className="home-next__pulse" aria-hidden="true" />Идёт сейчас</span>
        ) : when ? (
          <span className="home-next__when">{today && <span className="home-next__pulse" aria-hidden="true" />}{cap(formatWhen(when))}</span>
        ) : (
          <span className="home-next__when">{online ? 'Следующая по плану' : cap(SCHEDULE_UNKNOWN)}</span>
        )}
        {/* «тренер Елена», а не «с Елена»: имя по падежам не склоняем */}
        {data.trainerName && when && <span className="home-next__with">тренер {data.trainerName.split(' ')[0]}</span>}
      </div>
      <div className="home-next__title">{title}</div>
      {(groups.length > 0 || count > 0) && (
        <div className="home-next__chips">
          {groups.map((g) => <span key={g.tone} className={'home-next__chip ' + muscleClass(g.tone)}><i aria-hidden="true" />{g.label}</span>)}
          {count > 0 && <span className="home-next__chip">{count} упр.</span>}
        </div>
      )}
      <div className="home-next__row home-next__foot">
        {buttons && (
          today || online ? (
            <button type="button" className="home-next__go" disabled={!live}
              onClick={() => go(onGo, 'plan', 'workout', main.payload)}>
              <IconPlay size={16} /> {main.live ? 'Вернуться' : 'Начать'}
            </button>
          ) : (
            <button type="button" className="home-next__go" disabled={!live} onClick={() => go(onGo, 'plan')}>
              Посмотреть план
            </button>
          )
        )}
        {/* «❄️ Пауза» — больничный, отпуск (заморозка, src/pause/) */}
        {buttons && onPause && (
          <button type="button" className="home-next__pause" disabled={!live} onClick={() => { haptic(); onPause(); }}>
            <IconSnow size={16} /> Пауза
          </button>
        )}
        {/* Сколько в этом месяце — теперь плитка месяца (этап 2); здесь — только без неё */}
        {!online && !data.home && <span className="home-next__month">{month ? 'в этом месяце — ' + month : 'первая в этом месяце'}</span>}
      </div>
    </section>
  );
}

/* ==================================================================
 * Оплачено вперёд — билетиками
 * ================================================================== */

export function PackageCard({ data, mode, onGo }) {
  const payer = data.payer && data.balance >= 0 ? data.payer : null;
  const own = !payer;
  const money = payer ? payer.balance : data.balance;
  const left = payer ? payer.trainingsLeft : data.trainingsLeft;
  const byTrainings = left !== null && left !== undefined && money > 0;
  const state = data.packageEnding || {};
  const out = !!(state.known && state.out) || data.balance < 0;
  const soon = !!(state.known && state.soon) && !out;
  const trainer = mode === 'trainer';
  const tickets = ticketRow(out ? 0 : left, own ? data.packageCount : 0);
  // Пауза идёт (заморозка): оставшиеся не тратятся, «хватит до» — после неё
  const frozen = !!data.pause && data.pause.state === 'active';
  const resume = frozen && data.pause.to ? new Date(data.pause.to + 'T12:00:00') : null;
  if (resume) resume.setDate(resume.getDate() + 1);
  const until = !out && byTrainings && (!frozen || resume) ? enoughUntil(left, state.perWeek, resume || new Date()) : null;

  const hint = own
    ? byTrainings ? formatMoney(data.balance) + ' на балансе' : data.balance < 0 ? 'Нужно пополнить' : 'Баланс исчерпан'
    : 'Платит ' + payer.name + ' · ' + formatMoney(payer.balance) + ' на балансе';

  return (
    <section className={'home-pack enter' + (out ? ' home-pack--out' : soon ? ' home-pack--soon' : '')}>
      <div className="home-pack__head">
        <div>
          <div className="lead__label">{byTrainings ? 'Оплачено вперёд' : 'Баланс'}</div>
          <div className="home-pack__value">
            {byTrainings
              ? <Qty value={left} unit={tickets && tickets.total > left ? 'из ' + tickets.total : plural(left, 'тренировка', 'тренировки', 'тренировок')} />
              : <Qty value={formatNumber(Math.round(money))} unit="₽" />}
          </div>
        </div>
        <span className="home-pack__money">{hint}</span>
      </div>

      {tickets && (
        <div className="home-pack__tickets" role="img"
          aria-label={'Осталось ' + tickets.left + ' из ' + tickets.total}>
          {Array.from({ length: tickets.total }, (_, i) => {
            const used = i < tickets.used;
            const last = !used && soon;
            return <i key={i} className={'home-pack__ticket' + (used ? ' is-used' : frozen ? ' is-frozen' : last ? ' is-last' : '')} style={{ '--i': i }} />;
          })}
        </div>
      )}

      {out ? (
        <div className="home-pack__note home-pack__note--out">
          <IconAlert size={16} />
          <span>
            <strong>Оплаченные тренировки закончились.</strong>{' '}
            {data.balance < 0 && 'Долг ' + formatMoney(Math.abs(data.balance)) + '. '}
            {payer
              ? (trainer ? 'Напомните об оплате: платит ' + payer.name + '.' : 'Пора пополнить: платит ' + payer.name + '.')
              : trainer ? 'Следующая пройдёт в долг — напомните клиенту об оплате.' : 'Следующая пройдёт в долг.'}
          </span>
        </div>
      ) : soon ? (
        <div className="home-pack__note home-pack__note--soon">
          <strong>
            {left === 1 ? 'Осталась одна оплаченная тренировка.' : 'Осталось ' + left + ' ' + plural(left, 'тренировка', 'тренировки', 'тренировок') + '.'}
          </strong>{' '}
          {payer
            ? (trainer ? 'Напомните об оплате: платит ' + payer.name + '.' : 'Пора пополнить: платит ' + payer.name + '.')
            : trainer ? 'Это примерно на неделю — самое время напомнить о продлении.' : 'Это примерно на неделю — продлите пакет, чтобы не прерываться.'}
        </div>
      ) : frozen ? (
        <div className="home-pack__note home-pack__note--frozen">
          ❄️ не тратятся, пока пауза{until ? ' · потом хватит примерно до ' + dayMonth(until) : ''}
        </div>
      ) : until ? (
        <div className="home-pack__note">хватит примерно до {dayMonth(until)}</div>
      ) : null}

      {out && own && mode !== 'trainer' && (
        <button type="button" className="button home-pack__pay" disabled={!(mode === 'own' && onGo)}
          onClick={() => go(onGo, 'plan', 'wish', { text: WISH_PAY })}>
          <IconSend size={16} /> Написать тренеру об оплате
        </button>
      )}
    </section>
  );
}

/* ==================================================================
 * Плитки «как я иду» (этап 2): вес и месяц
 * ================================================================== */

const MONTH_IN = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];

/** Линия веса: точки по порядку, без осей — только направление */
function Spark({ points }) {
  if (!points || points.length < 2) return null;
  const w = 120;
  const h = 28;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const d = points.map((v, i) => `${i ? 'L' : 'M'}${Math.round((i / (points.length - 1)) * (w - 4)) + 2} ${Math.round(h - 3 - ((v - min) / span) * (h - 6))}`).join(' ');
  return (
    <svg className="home-tile__spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={d} pathLength="1" />
    </svg>
  );
}

/**
 * Вес со стрелкой за месяц и месяц квадратиками. Замер давно (больше 28
 * дней) или программы на месяц нет — плитка оранжевая и говорит, что
 * сделать. Касание — в «Прогресс» и «Тренировки» (onGo); у тренера
 * плитки только показывают.
 */
export function HomeTiles({ data, mode, onGo }) {
  const home = data.home;
  if (!home) return null;
  const live = mode === 'own' && onGo;
  const weight = home.weight;
  const measuredDays = home.measuredAt ? daysAgoOf(home.measuredAt) : null;
  const measureDue = measuredDays === null || measuredDays > 28;
  const m = home.month || {};
  const monthIdx = m.month ? Number(m.month.slice(5, 7)) - 1 : new Date().getMonth();
  const inDays = m.month ? new Date(Number(m.month.slice(0, 4)), monthIdx + 1, 0).getDate() : 30;
  const done = new Set(m.days || []);
  const noPlan = !!data.monthSheetStatus && !String(data.monthSheetStatus).startsWith('✅');
  const Tile = live ? 'button' : 'div';

  return (
    <div className="home-tiles">
      <Tile {...(live ? { type: 'button', onClick: () => go(onGo, 'progress') } : {})}
        className={'home-tile' + (measureDue ? ' home-tile--due' : '')}>
        <span className="home-tile__icon home-tile__icon--weight" aria-hidden="true">⚖️</span>
        {weight ? (
          <>
            <span className="home-tile__value">
              {String(weight.value).replace('.', ',')} кг
              {weight.delta !== null && weight.delta !== 0 && (
                <span className={'home-tile__delta' + (weight.delta < 0 ? ' is-down' : ' is-up')}>
                  {(weight.delta > 0 ? '+' : '−') + String(Math.abs(weight.delta)).replace('.', ',')}
                </span>
              )}
            </span>
            <span className="home-tile__note">
              {weight.delta !== null ? 'за месяц · ' : ''}{measureDue ? 'пора замер' : 'замер ' + (measuredDays === 0 ? 'сегодня' : measuredDays + ' ' + plural(measuredDays, 'день', 'дня', 'дней') + ' назад')}
            </span>
            <Spark points={weight.points} />
          </>
        ) : (
          <>
            <span className="home-tile__value">Вес</span>
            <span className="home-tile__note">ещё не записан — запишите в «Прогрессе»</span>
          </>
        )}
      </Tile>

      <Tile {...(live ? { type: 'button', onClick: () => go(onGo, 'plan') } : {})}
        className={'home-tile' + (noPlan ? ' home-tile--due' : '')}>
        <span className="home-tile__icon home-tile__icon--month" aria-hidden="true">📅</span>
        <span className="home-tile__value">{done.size} {plural(done.size, 'тренировка', 'тренировки', 'тренировок')}</span>
        <span className="home-tile__note">
          в {MONTH_IN[monthIdx]}{noPlan ? ' · программы нет' : m.streak > 1 ? ' · серия ' + m.streak + ' нед.' : ''}
        </span>
        <span className="home-tile__cal" aria-hidden="true">
          {Array.from({ length: inDays }, (_, i) => (
            <i key={i} className={done.has(i + 1) ? 'is-on' : i + 1 > (m.today || 0) ? 'is-ahead' : ''} style={{ '--i': i }} />
          ))}
        </span>
      </Tile>
    </div>
  );
}

function daysAgoOf(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const n = new Date();
  const b = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  return Math.max(0, Math.round((b - a) / 86400000));
}
