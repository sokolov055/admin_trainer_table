import React, { useEffect, useState } from 'react';
import { useData } from '../useData.js';
import { Section, Panel, formatNumber, formatDate } from '../ui.jsx';
import { BarChart } from '../charts.jsx';
import { isNativeApp } from '../native-bridge.js';
import { connectSteps, stepsConnected, stepsOn, onIphone, syncSteps, reportDevice, STEPS_SENT } from '../native-steps.js';

/**
 * Шаги — в «Прогрессе» клиента и в карточке клиента у тренера.
 *
 * Считает их телефон (Health Connect, native-steps.js), сервер хранит
 * суммы по дням. Здесь — последние две недели столбиками, сегодня и
 * среднее. Клиенту в Android-приложении, пока не подключено, — кнопка
 * «Подключить шаги» и зачем это. В браузере без данных блока нет вовсе:
 * пустая рамка «шагов нет» ничего не объясняет.
 *
 * Тренер экрана клиента не видит. Если клиент заходил из приложения,
 * тренеру — откуда и почему шагов нет (что приложение сообщило о телефоне,
 * reportDevice): иначе «пусто» не отличить от «не нажал Подключить».
 */
const DAYS = 14;
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/** «Android-приложение 1.2 (3) · последний вход 26 сентября» */
function deviceLine(device) {
  const shell = (device.platform === 'ios' ? 'iPhone' : 'Android') + '-приложение'
    + (device.appVersion ? ' ' + device.appVersion : '');
  const seen = new Date(device.seenAt);
  return isNaN(seen.getTime()) ? shell : shell + ' · последний вход ' + seen.getDate() + ' ' + MONTHS[seen.getMonth()];
}

/** Почему у клиента нет шагов — и что ему сделать */
function deviceReason(device) {
  const ios = device.platform === 'ios';
  switch (device.steps) {
    case 'off':
      return 'Шаги не подключены. У клиента в «Прогрессе» кнопка «Подключить шаги» — попросите нажать её и разрешить доступ.';
    case 'empty':
      return ios
        ? 'Шаги подключены, но «Здоровье» пока ничего не отдало.'
        : 'Шаги подключены, но в Health Connect их нет — туда их никто не пишет. На Samsung: Samsung Health → Настройки → Health Connect → разрешить запись шагов.';
    case 'unavailable':
      return ios
        ? 'На телефоне клиента шаги недоступны.'
        : 'На телефоне клиента нет Health Connect или приложение устарело — шаги недоступны.';
    case 'on':
      return 'Шаги подключены, но за две недели телефон ничего не прислал.';
    default:
      return 'Что с шагами — телефон не сообщил.';
  }
}

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

  // Шаги ушли на сервер (при запуске, возврате, подключении) — перечитать
  useEffect(() => {
    const again = () => reload();
    window.addEventListener(STEPS_SENT, again);
    return () => window.removeEventListener(STEPS_SENT, again);
  }, []);

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
      reportDevice(true);
    }
  };

  if (!byDate.size) {
    if (!own && data.device) {
      return (
        <Section title="Шаги">
          <Panel pad>
            <p className="small muted">{deviceReason(data.device)}</p>
            <p className="small muted">{deviceLine(data.device)}</p>
          </Panel>
        </Section>
      );
    }
    if (!native) return null;
    return (
      <Section title="Шаги">
        <Panel pad>
          {connected ? (
            <>
              <p className="small muted">
                Шаги подключены, но телефон пока их не передал. {onIphone()
                  ? 'Шаги считает сам iPhone и Apple Watch — обычно они появляются через несколько минут.'
                  : 'Health Connect сам шаги не считает — их туда пишет приложение: Google Fit, Samsung Health, Mi Fitness или приложение браслета. Откройте его и включите передачу шагов в Health Connect.'}
              </p>
              <div className="survey__actions">
                <button className="button" onClick={() => syncSteps(true).catch(() => {})}>Проверить ещё раз</button>
              </div>
            </>
          ) : (
            <>
              <p className="steps__lead">Тренер увидит, сколько вы ходите, — без ручного ввода.</p>
              <p className="small muted">
                {onIphone()
                  ? 'Шаги берутся из приложения «Здоровье»: туда их пишут iPhone, Apple Watch и браслеты. Приложение только читает шаги — больше ничего.'
                  : 'Шаги берутся из Health Connect на телефоне: туда их пишут Google Fit, Samsung Health, Mi Fitness и браслеты. Приложение только читает шаги — больше ничего.'}
              </p>
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
        {!own && data.device && <p className="small muted">{deviceLine(data.device)}</p>}
        {problem && <p className="small muted">{problem}</p>}
      </Panel>
    </Section>
  );
}
