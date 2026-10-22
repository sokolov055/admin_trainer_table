import React, { useEffect } from 'react';
import { useData } from '../useData.js';
import { Section, Panel, formatNumber } from '../ui.jsx';
import { HEALTH_SENT } from '../native-steps.js';
import { healthSummary, spentForDay, formatMinutes } from '../health-model.js';
import './health.css';

/**
 * Блок «Здоровье» в «Прогрессе» (FT-708): сон, пульс покоя и ВСР, калории
 * за сегодня, вес и % жира с весов, VO2max — то, что телефон прочитал из
 * «Здоровья» или Health Connect (native-steps.js, syncHealthDaily).
 *
 * Один и тот же блок у клиента, в карточке клиента у тренера (только
 * посмотреть) и в «Моих тренировках» тренера (self). Пустой показатель не
 * рисуем, нет ничего — нет и блока: «данных нет» здесь ничего не объясняет,
 * а подключают в «Моих данных» → «Здоровье» и кнопками шагов.
 * У сплит-пары у каждого свои строки — как у шагов, показываем первого.
 */
const DAYS = 30;
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

function dayWords(date) {
  const d = new Date(date + 'T12:00:00');
  return isNaN(d.getTime()) ? '' : d.getDate() + ' ' + MONTHS[d.getMonth()];
}

/** Одна строка у сплит-пары: строки первого, кто их прислал */
function ownRows(data) {
  const rows = (data && data.days) || [];
  if (!rows.some((r) => r.member !== undefined)) return data;
  const member = rows.length ? rows[0].member || '' : '';
  return { ...data, days: rows.filter((r) => (r.member || '') === member) };
}

/** «на 3 ниже обычного»: обычное — среднее прошлой недели */
function trendLine(t, unit) {
  if (!t || t.delta === null) return '';
  if (Math.abs(t.delta) < 1) return 'как обычно';
  return 'на ' + formatNumber(Math.abs(t.delta)) + ' ' + unit + (t.delta > 0 ? ' выше' : ' ниже') + ' обычного';
}

const PHASES = [['deep', 'Глубокий'], ['rem', 'Быстрый'], ['light', 'Лёгкий'], ['awake', 'Пробуждения']];

function SleepCard({ sleep }) {
  const parts = PHASES.filter(([k]) => sleep[k] > 0);
  const sum = parts.reduce((s, [k]) => s + sleep[k], 0);
  return (
    <div className="health__sleep">
      <div className="fact__label">{sleep.lastNight ? 'Сон прошлой ночью' : 'Сон, ночь на ' + dayWords(sleep.date)}</div>
      <div className="health__big">{formatMinutes(sleep.min)}</div>
      {sleep.avg7 !== null && <div className="small muted">в среднем за неделю {formatMinutes(sleep.avg7)}</div>}
      {parts.length > 0 && (
        <>
          <div className="health__phases" role="img" aria-label={'Фазы сна: ' + parts.map(([k, t]) => t.toLowerCase() + ' ' + formatMinutes(sleep[k])).join(', ')}>
            {parts.map(([k]) => <span key={k} className={'health__phase health__phase--' + k} style={{ flexGrow: sleep[k] / sum }} />)}
          </div>
          <ul className="health__legend" aria-hidden="true">
            {parts.map(([k, t]) => <li key={k}><i className={'health__dot health__phase--' + k} />{t} {formatMinutes(sleep[k])}</li>)}
          </ul>
        </>
      )}
    </div>
  );
}

function Fact({ label, value, unit, note }) {
  return (
    <div className="fact">
      <div className="fact__label">{label}</div>
      <div className="fact__value">{value}{unit ? <>&nbsp;<span className="qty__unit">{unit}</span></> : null}</div>
      {note && <div className="small muted">{note}</div>}
    </div>
  );
}

export default function HealthDaily({ clientRow }) {
  const { data, error, reload } = useData('health.daily.list', clientRow ? { clientRow, days: DAYS } : { days: DAYS }, [clientRow]);
  // Телефон отправил свежее (запуск, возврат, подключение) — перечитать
  useEffect(() => {
    const again = () => reload();
    window.addEventListener(HEALTH_SENT, again);
    return () => window.removeEventListener(HEALTH_SENT, again);
  }, []);
  // Старый сервер, нет связи, нет данных — блока нет
  if (error || !data) return null;
  const s = healthSummary(ownRows(data));
  if (!s) return null;

  const facts = [];
  if (s.restingHr) facts.push(<Fact key="rhr" label="Пульс покоя" value={formatNumber(s.restingHr.value)} unit="уд/мин" note={trendLine(s.restingHr, 'уд')} />);
  if (s.hrv) facts.push(<Fact key="hrv" label="ВСР" value={formatNumber(s.hrv.value)} unit="мс" note={trendLine(s.hrv, 'мс')} />);
  if (s.kcal) {
    facts.push(<Fact key="kcal" label="Сегодня потрачено"
      value={formatNumber(s.kcal.total !== null ? s.kcal.total : s.kcal.active)} unit="ккал"
      note={s.kcal.total !== null && s.kcal.active !== null ? 'из них активных ' + formatNumber(s.kcal.active) : s.kcal.total === null ? 'активные' : ''} />);
  }
  if (s.weight) facts.push(<Fact key="w" label="Вес с весов" value={formatNumber(s.weight.value, 1)} unit="кг" note={s.weight.date ? dayWords(s.weight.date) : ''} />);
  if (s.bodyFat) facts.push(<Fact key="fat" label="Жир" value={formatNumber(s.bodyFat.value, 1)} unit="%" note={s.bodyFat.date ? dayWords(s.bodyFat.date) : ''} />);
  if (s.vo2max) facts.push(<Fact key="vo2" label="VO2max" value={formatNumber(s.vo2max.value, 1)} unit="мл/кг/мин" note={s.vo2max.date ? dayWords(s.vo2max.date) : ''} />);

  return (
    <Section title="Здоровье" note="с часов и весов">
      <Panel pad>
        {s.sleep && <SleepCard sleep={s.sleep} />}
        {facts.length > 0 && <div className={'health__facts' + (s.sleep ? ' health__facts--below' : '')}>{facts}</div>}
      </Panel>
    </Section>
  );
}

/**
 * «Потрачено: N ккал (с часов)» за выбранный день в «Питании». Тот же
 * запрос, что у блока в «Прогрессе», — один кэш; нет данных — строки нет
 */
export function SpentKcal({ clientRow, day }) {
  const { data } = useData('health.daily.list', clientRow ? { clientRow, days: DAYS } : { days: DAYS }, [clientRow]);
  const spent = spentForDay(ownRows(data), day);
  if (!spent) return null;
  return (
    <p className="small muted health__spent">
      Потрачено: {formatNumber(spent.kcal)} ккал {spent.kind === 'total' ? '(с часов)' : '(активные, с часов)'}
    </p>
  );
}
