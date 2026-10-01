import React, { useEffect, useState } from 'react';
import { useData } from '../useData.js';
import { Section, Panel, formatNumber, formatDate } from '../ui.jsx';
import { BarChart } from '../charts.jsx';
import { isNativeApp } from '../native-bridge.js';
import WatchHelp from './WatchHelp.jsx';
import { connectSteps, stepsConnected, stepsOn, onIphone, syncSteps, reportDevice, openHealthSettings, STEPS_SENT } from '../native-steps.js';
import { backgroundSyncAvailable, backgroundSyncStatus, ensureBackgroundSync, requestBackgroundAccess } from '../native-sync.js';

/**
 * Строка под графиком на Android (APK 5+): шлёт ли телефон шаги сам, в
 * фоне, или только когда открыто приложение, — и кнопка включить.
 * Health Connect даёт читать в фоне по отдельному разрешению.
 */
function BackgroundLine() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    let alive = true;
    backgroundSyncStatus().then((s) => { if (alive) setStatus(s); });
    return () => { alive = false; };
  }, []);

  if (!status || !status.supported) return null;
  if (status.background && status.enabled) {
    return <p className="small muted">Телефон отправляет шаги сам, в фоне — примерно раз в 30 минут.</p>;
  }

  const turnOn = async () => {
    setBusy(true);
    setNote('');
    try {
      const res = await requestBackgroundAccess();
      if (!res.granted) setNote('Доступ в фоне не выдан. Его можно включить в Health Connect: Разрешения приложений → Fit Track → «Доступ к данным в фоновом режиме».');
      setStatus(await backgroundSyncStatus());
    } catch (e) {
      setNote('Не получилось: ' + (e.message || 'ошибка') + '.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="steps__bg">
      <p className="small muted">Сейчас шаги уходят тренеру, только когда вы открываете приложение. Разрешите отправлять их в фоне — раз в 30 минут, без открытого приложения.</p>
      <button className="button" onClick={turnOn} disabled={busy}>{busy ? 'Открываю…' : 'Отправлять в фоне'}</button>
      {note && <p className="small muted" role="status">{note}</p>}
    </div>
  );
}

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

// self — «Мои тренировки» тренера: карточка чужая по номеру, но шаги свои
export default function Steps({ clientRow, self = false }) {
  const own = !clientRow || self;
  const native = own && isNativeApp();
  const { loading, data, error, reload } = useData('steps.list', clientRow ? { clientRow, days: DAYS } : { days: DAYS }, [clientRow]);
  const [connected, setConnected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  // Итог «Проверить ещё раз» — словами: раньше кнопка молчала при любом исходе
  const [checked, setChecked] = useState('');

  const recheck = async () => {
    setBusy(true);
    setChecked('');
    try {
      // iPhone: окно разрешения могло не завершиться — спрашиваем снова
      // (если доступ уже решён, iOS окна не покажет, только прочитает)
      const res = onIphone() ? await connectSteps() : await syncSteps(true);
      if (res.reason && res.ok === false) setChecked(res.reason);
      else if (res.sent) { setChecked('Готово: телефон передал шаги за ' + res.sent + ' дн.'); reload(); }
      else if (res.reason === 'empty') {
        setChecked(onIphone()
          ? 'Шагов по-прежнему нет: доступ в «Здоровье» не включён.'
          : 'Шагов по-прежнему нет: Health Connect их не получает.');
      } else if (res.reason === 'denied') setChecked('Доступ к шагам не выдан — нажмите «Подключить шаги» ещё раз.');
      else setChecked('Телефону пока нечего передать.');
    } catch (e) {
      setChecked('Не получилось: ' + (e.message || 'ошибка связи') + '.');
    } finally {
      setBusy(false);
      reportDevice(true);
    }
  };

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
      else {
        setConnected(true);
        reload();
        // Android: ключ фоновой задаче — дальше шаги уходят и без приложения
        ensureBackgroundSync().catch(() => {});
      }
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
              {/* iOS не говорит приложению, что чтение запрещено: запрет
                  выглядит как «шагов нет». И окно разрешения iPhone
                  показывает один раз — дальше доступ включают только в
                  «Здоровье», поэтому главная кнопка ведёт туда */}
              <p className="steps__lead">
                {onIphone()
                  ? 'Шаги не приходят: похоже, в «Здоровье» не включён доступ для Fit Track.'
                  : 'Шаги не приходят: похоже, Health Connect их не получает.'}
              </p>
              <p className="small muted">
                {onIphone()
                  ? 'В «Здоровье»: ваш профиль (вверху справа), затем «Приложения», Fit Track и включите «Шаги». Вернитесь сюда, шаги подтянутся сами.'
                  : 'Шаги в Health Connect пишет приложение: Google Fit, Samsung Health, Mi Fitness или браслет. Включите в нём передачу шагов и разрешите Fit Track их читать.'}
              </p>
              <WatchHelp />
              <div className="survey__actions">
                <button className="button button--primary" onClick={() => openHealthSettings().catch(() => setChecked('Не получилось открыть настройки — откройте их вручную.'))} disabled={busy}>
                  {onIphone() ? 'Открыть «Здоровье»' : 'Открыть Health Connect'}
                </button>
                <button className="button" onClick={recheck} disabled={busy}>{busy ? 'Проверяем…' : 'Проверить ещё раз'}</button>
              </div>
              {checked && <p className="small" role="status" style={{ marginBottom: 0 }}>{checked}</p>}
            </>
          ) : (
            <>
              <p className="steps__lead">{self ? 'Шаги с этого телефона появятся в вашем прогрессе, без ручного ввода.' : 'Тренер увидит, сколько вы ходите, — без ручного ввода.'}</p>
              <p className="small muted">
                {onIphone()
                  ? 'Шаги берутся из приложения «Здоровье»: туда их пишут iPhone, Apple Watch и браслеты. Приложение только читает шаги — больше ничего.'
                  : 'Шаги берутся из Health Connect на телефоне: туда их пишут Google Fit, Samsung Health, Mi Fitness и браслеты. Приложение только читает шаги — больше ничего.'}
              </p>
              <WatchHelp />
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
        {native && !onIphone() && backgroundSyncAvailable() && <BackgroundLine />}
        {problem && <p className="small muted">{problem}</p>}
      </Panel>
    </Section>
  );
}
