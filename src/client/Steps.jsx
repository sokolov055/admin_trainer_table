import React, { useEffect, useState } from 'react';
import { useData } from '../useData.js';
import { Section, Panel, formatNumber, formatDate } from '../ui.jsx';
import { BarChart } from '../charts.jsx';
import { isNativeApp } from '../native-bridge.js';
import { connectSteps, stepsConnected, stepsOn } from '../native-steps.js';

/**
 * Шаги — в «Прогрессе» клиента и в карточке клиента у тренера.
 *
 * Считает их телефон (Health Connect, native-steps.js), сервер хранит
 * суммы по дням. Здесь — последние две недели столбиками, сегодня и
 * среднее. Клиенту в Android-приложении, пока не подключено, — кнопка
 * «Подключить шаги» и зачем это. В браузере и у тренера без данных блока
 * нет вовсе: пустая рамка «шагов нет» ничего не объясняет.
 */
const DAYS = 14;
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

function localDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function Steps({ clientRow }) {
  const own = !clientRow;
  const native = own && isNativeApp();
  const { loading, data, error, reload } = useData('steps.list', clientRow ? { clientRow, days: DAYS } : { days: DAYS }, [clientRow]);
  const [connected, setConnected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    if (!native) return undefined;
    let alive = true;
    stepsConnected().then((ok) => { if (alive) setConnected(ok && stepsOn()); });
    return () => { alive = false; };
  }, [native]);

  // Шаги — дополнение к прогрессу: не загрузились (старый сервер, нет
  // связи) — просто не показываем, экран замеров от этого не страдает
  if (loading || error || !data) return null;

  const rows = data.days || [];
  // У сплит-пары у каждого свои шаги; показываем первого, кто их прислал
  const member = rows.length ? rows[0].member : '';
  const byDate = new Map(rows.filter((r) => r.member === member).map((r) => [r.date, r.steps]));

  const connect = async () => {
    setBusy(true);
    setProblem('');
    try {
      const res = await connectSteps();
      if (!res.ok) setProblem(res.reason);
      else { setConnected(true); reload(); }
    } catch (e) {
      setProblem(e.message || 'Не получилось подключить шаги.');
    } finally {
      setBusy(false);
    }
  };

  if (!byDate.size) {
    if (!native) return null;
    return (
      <Section title="Шаги">
        <Panel pad>
          {connected ? (
            <p className="small muted">Шаги подключены. Как только телефон их посчитает, здесь появится график за две недели.</p>
          ) : (
            <>
              <p className="steps__lead">Тренер увидит, сколько вы ходите, — без ручного ввода.</p>
              <p className="small muted">Шаги берутся из Health Connect на телефоне: туда их пишут Google Fit, Samsung Health, Mi Fitness и браслеты. Приложение только читает шаги — больше ничего.</p>
              <div className="survey__actions">
                <button className="button button--primary" onClick={connect} disabled={busy}>
                  {busy ? 'Подключаю…' : 'Подключить шаги'}
                </button>
              </div>
            </>
          )}
          {problem && <p className="small muted">{problem}</p>}
        </Panel>
      </Section>
    );
  }

  const today = new Date();
  const points = [];
  for (let i = DAYS - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = localDate(d);
    points.push({
      key,
      label: i === 0 ? 'Сегодня' : d.getDate() + ' ' + MONTHS[d.getMonth()],
      short: String(d.getDate()),
      value: byDate.has(key) ? byDate.get(key) : null,
      partial: i === 0,
    });
  }
  const done = points.filter((p) => p.value !== null && !p.partial);
  const average = done.length ? Math.round(done.reduce((s, p) => s + p.value, 0) / done.length) : null;
  const todayValue = points[points.length - 1].value;

  return (
    <Section title="Шаги" note="за две недели, из телефона">
      <Panel pad>
        <BarChart
          points={points}
          plain
          format={(v) => formatNumber(v)}
          highlight={points[points.length - 1].key}
          label="Шаги"
        />
        <p className="small muted steps__facts">
          {todayValue !== null ? 'Сегодня ' + formatNumber(todayValue) : 'Сегодня пока нет данных'}
          {average !== null ? ' · в среднем ' + formatNumber(average) + ' в день' : ''}
          {data.syncedAt ? ' · обновлено ' + formatDate(data.syncedAt, false) : ''}
        </p>
        {problem && <p className="small muted">{problem}</p>}
      </Panel>
    </Section>
  );
}
