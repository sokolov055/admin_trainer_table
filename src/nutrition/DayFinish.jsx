import React from 'react';
import { Section, Panel, Sheet, Qty, formatNumber } from '../ui.jsx';
import { dayLabel, dayVerdict } from './diary-model.js';
import { n, ErrorNote } from './diary-ui.jsx';

/**
 * Завершение дня (FT-646, план трёх разборов): карточка «Всё записали?» внизу
 * дневника и лист с итогом против нормы. Вынесено из Diary.jsx 21.10.2026.
 */
// Завершение дня (FT-646): не галочка между приёмами, а итог — сколько
// съедено против нормы, БЖУ, вода и слово тренера; после — вибрация.
// error — ошибка завершения (409, нет связи): лист модальный, плашка в теле дневника под ним не видна
export function FinishSheet({ data, totals, target, busy, error, onFinish, onClose }) {
  const verdict = dayVerdict(totals.kcal, Number(target.kcal || 0));
  return <Sheet title={'Итог дня · ' + dayLabel(data.day)} locked={busy} onClose={onClose}><div className="diary-finish">{/* Число-герой с серой единицей (Qty, FT-665): «1 473 ккал из 2 000» */}<p className="diary-finish__kcal"><Qty value={n(totals.kcal)} unit={'ккал' + (target.kcal ? ' из ' + n(target.kcal) : '')} /></p><p className={'diary-finish__verdict diary-finish__verdict--' + verdict.tone}>{verdict.text}</p><dl className="diary-finish__facts">{[['protein', 'Белки'], ['fat', 'Жиры'], ['carbs', 'Углеводы']].map(([k, text]) => <div key={k}><dt>{text}</dt><dd><Qty value={n(totals[k])} unit={(target[k] ? 'из ' + n(target[k]) + ' ' : '') + 'г'} /></dd></div>)}<div><dt>Вода</dt><dd><Qty value={formatNumber(data.waterMl / 1000, 2)} unit="л" /></dd></div><div><dt>Записей</dt><dd>{data.entries.length}</dd></div></dl>{data.comment ? <div className="diary-finish__coach"><small>От тренера</small><p>{data.comment}</p></div> : <p className="small muted">Завершённый день идёт в среднее за неделю, тренер видит итог.</p>}<div className="diary-form-footer"><ErrorNote error={error} /><button className="button button--primary" disabled={busy} onClick={onFinish}>{busy ? 'Сохраняю…' : 'Завершить день'}</button></div></div></Sheet>;
}
export function DayFinish({ data, totals, target, readOnly, busy, onOpen, onReopen }) {
  const verdict = dayVerdict(totals.kcal, Number(target.kcal || 0));
  if (data.complete) return <Section><Panel pad><div className="diary-day-done"><div><strong>День завершён</strong><p className="small muted">{n(totals.kcal)}{target.kcal ? ' из ' + n(target.kcal) : ''} ккал · {verdict.tone === 'good' ? 'в норме' : verdict.tone === 'under' ? 'меньше нормы' : verdict.tone === 'over' ? 'больше нормы' : 'без нормы'}</p></div>{!readOnly && <button className="button button--ghost" disabled={busy} onClick={onReopen}>Дописать</button>}</div></Panel></Section>;
  if (readOnly) return <p className="small muted diary-day-open">Клиент ещё не завершил этот день.</p>;
  const pending = data.entries.some(e => e.pending);
  return <Section><Panel pad><div className="diary-day-done"><div><strong>Всё записали?</strong><p className="small muted">{data.entries.length ? pending ? 'Дождёмся отправки записей с телефона.' : 'Завершите день — увидите итог против нормы.' : 'Запишите еду — потом завершите день.'}</p></div><button className="button button--primary" disabled={busy || pending || !data.entries.length} onClick={onOpen}>Завершить день</button></div></Panel></Section>;
}
