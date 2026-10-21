import React from 'react';
import { useData } from '../useData.js';
import { useRights, hasPlus } from '../rights.js';
import { formatNumber, Qty } from '../ui.jsx';
import { today } from '../nutrition/diary-model.js';
import './today-strip.css';

/**
 * «Сегодня» на «Обзоре» (FT-646, макет плана трёх разборов): три числа,
 * у каждого подпись словами, а не только значок. Касание открывает раздел,
 * где число живёт. Сна нет — его не читаем (отложено до юр. проверки).
 *
 * Показывается только у самого клиента: у тренера в карточке клиента те же
 * цифры уже есть в разделах, а лишние запросы на каждого клиента не нужны.
 */
const thousands = (v) => (v >= 1000 ? formatNumber(Math.round(v / 100) / 10) + ' тыс.' : formatNumber(v));
// То же для крупной цифры плитки: «тыс.» — серой единицей (Qty, FT-665)
const thousandsQty = (v) => (v >= 1000 ? <Qty value={formatNumber(Math.round(v / 100) / 10)} unit="тыс." /> : formatNumber(v));

export default function TodayStrip({ onOpen }) {
  const awards = useData('client.awards', {}, []);
  const rights = useRights();
  // Дневник — в «Плюсе»: без него запрос дневника не делаем вовсе
  return hasPlus(rights)
    ? <WithDiary awards={awards.data} onOpen={onOpen} />
    : <Strip awards={awards.data} day={null} onOpen={onOpen} />;
}

function WithDiary({ awards, onOpen }) {
  // День — при каждой отрисовке: приложение, не закрытое за полночь, не должно показывать вчерашние ккал
  const day = today();
  const diary = useData('diary.get', { day }, [day]);
  return <Strip awards={awards} day={diary.data} onOpen={onOpen} />;
}

function Strip({ awards, day, onOpen }) {
  const tiles = [];
  const week = awards?.rings?.find((r) => r.id === 'week');
  if (week) {
    tiles.push({
      id: 'plan', value: week.target ? week.done + '/' + week.target : String(week.done),
      label: week.target ? 'тренировки за неделю' : 'тренировок за неделю',
      done: !!week.target && week.done >= week.target,
    });
  }
  const steps = awards?.steps;
  if (steps) {
    tiles.push({
      id: 'progress', value: thousandsQty(steps.today || 0),
      label: steps.goal ? 'шагов из ' + thousands(steps.goal) : 'шагов сегодня',
      done: !!steps.goal && steps.today >= steps.goal,
    });
  }
  if (day) {
    const target = day.targets?.kcal;
    tiles.push({
      id: 'nutrition', value: formatNumber(Math.round(day.totals?.kcal || 0)),
      label: target ? 'ккал из ' + formatNumber(Math.round(target)) : 'ккал съедено',
      done: !!day.complete,
    });
  }
  if (tiles.length < 2) return null;

  return (
    <section className="today-strip" aria-label="Сегодня">
      <h2 className="today-strip__title">Сегодня</h2>
      <div className="today-strip__row">
        {tiles.map((t) => (
          <button key={t.id} type="button" className={'today-strip__tile' + (t.done ? ' is-done' : '')} onClick={() => onOpen(t.id)}>
            <strong>{t.value}</strong>
            <span>{t.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
