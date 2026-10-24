import React, { useEffect, useRef, useState } from 'react';
import { Panel, Sheet } from '../ui.jsx';
import { apiPublic, apiMutate } from '../api.js';
import { useData } from '../useData.js';
import { isNativeApp } from '../native-bridge.js';
import {
  connectHealth, deviceHealthScope, healthAskNeeded, saveHealthAccess, markHealthFullAsked, healthDailyOn,
  disconnectHealth, openHealthSettings, healthHub, onIphone, onHuawei, reportDevice,
} from '../native-steps.js';
import { ensureBackgroundSync } from '../native-sync.js';
import { HEALTH_CONSENT_URL } from '../PrivacyLink.jsx';
import './onboarding.css';
import './first-steps.css';
import './settings.css';

/**
 * Экран «Здоровье» (FT-708, решение владельца 22.10.2026): что приложение
 * читает из «Здоровья» или Health Connect и зачем, галочка отдельного
 * согласия на данные о здоровье и одно системное окно на всё.
 *
 * Где показывается:
 *   - при входе, один раз — клиенту в приложении, которого ещё не
 *     спрашивали (пришёл по ссылке тренера), или кто дал только шаги и
 *     тренировки на старой сборке, а теперь обновился (HealthAsk);
 *   - листом — по «Подключить шаги»/«Подключить тренировки» в «Прогрессе»
 *     и в «Настройках» → «Здоровье» (HealthSheet);
 *   - в анкете (Permissions.jsx) — свой экран, тот же запрос.
 *
 * «Не сейчас» при входе — 'declined' на сервере, больше не спрашиваем;
 * шаги и тренировки, уже подключённые на телефоне, работают как раньше.
 * На iPhone кнопки «Не сейчас» нет: Apple отклоняет экран перед системным
 * окном, с которого можно его пропустить (5.1.1(iv)). Там одна кнопка —
 * она открывает окно «Здоровья», а отказать человек может в нём самом;
 * спрашиваем всё равно один раз.
 * Без галочки (или на старой сборке и Huawei) — только шаги и тренировки:
 * их покрывает общее согласие.
 */

/** Что берём — по пунктам. full — новые типы, только с согласием */
function items(scope, self) {
  const who = self ? 'Видите только вы.' : 'Видите вы и ваш тренер.';
  const base = [
    ['Шаги', 'Суммы по дням — сколько вы двигаетесь вне зала.'],
    ['Тренировки с часов', 'Вид, время, калории и дистанция' + (scope === 'full' ? ', средний и максимальный пульс' : '') + ' — рядом с тренировками из приложения.'],
  ];
  if (scope !== 'full') return { base, extra: [], who };
  return {
    base,
    extra: [
      ['Сон', 'Сколько спали и фазы: глубокий, быстрый, лёгкий. Плохо спали — нагрузку можно снизить.'],
      ['Пульс покоя и ВСР', 'Показывают восстановление и усталость за несколько дней.'],
      ['Вес и % жира', 'С умных весов — без ручного ввода, рядом с замерами.'],
      ['Калории за день', 'Активные и общий расход — сравнить с питанием.'],
      ['Рост и VO2max', 'Для нормы питания и оценки выносливости.'],
    ],
    who,
  };
}

const fromHub = () => (healthHub() === '«Здоровье»' ? '«Здоровья»' : healthHub());

/** Итог подключения — словами, по пунктам */
export function healthResultLines(r) {
  const out = [];
  if (!r || r.steps === 'off') {
    out.push(['Здоровье', onIphone() ? 'На этом устройстве нет приложения «Здоровье».' : 'На телефоне нет Health Connect — установите его из Google Play и попробуйте снова.']);
    return out;
  }
  if (r.steps === 'error') {
    out.push(['Здоровье', `Не получилось прочитать данные из ${fromHub()}. Попробуйте позже в «Настройках» → «Здоровье».`]);
    return out;
  }
  const line = (state, ok, empty) => (state === 'ok' ? ok : state === 'denied' ? 'Не разрешено в системном окне.' : state === 'error' ? 'Не получилось прочитать — попробуйте позже.' : empty);
  out.push(['Шаги', line(r.steps, 'Пришли — они в «Прогрессе».', onIphone() ? 'Пока пусто — или в «Здоровье» не включён доступ к шагам.' : 'Записей пока нет — появятся, как только телефон их посчитает.')]);
  if (r.workouts !== 'off') out.push(['Тренировки', line(r.workouts, 'Пришли — они в «Прогрессе».', 'За месяц тренировок нет — появятся после первой с часами.')]);
  if (r.scope === 'full') out.push(['Сон, пульс и вес', line(r.daily, 'Пришли — блок «Здоровье» в «Прогрессе».', 'Пока пусто: часы или весы ещё ничего не записали — или доступ не включён.')]);
  return out;
}

/** Галочка отдельного согласия: без неё — только шаги и тренировки */
function ConsentBox({ checked, disabled, onChange }) {
  return (
    <label className="ob-consent">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>Даю <a href={HEALTH_CONSENT_URL} target="_blank" rel="noopener noreferrer">отдельное согласие на обработку данных о здоровье</a>: сон, пульс, вес и % жира, калории, рост и VO2max. Без него подключим только шаги и тренировки.</span>
    </label>
  );
}

/** Список «что берём», общий для экрана и листа */
function WhatWeRead({ scope, self }) {
  const { base, extra, who } = items(scope, self);
  return <>
    <ul className="permissions__list">
      {base.concat(extra).map(([title, text]) => <li key={title}><strong>{title}</strong><span>{text}</span></li>)}
    </ul>
    <p className="small muted">
      {who} Только читаем — ничего не записываем в {healthHub()}.
      {scope === 'full' ? ' Давление, сахар, температуру, кислород и цикл не берём.' : ''}
      {' '}Отказаться от любого пункта можно в системном окне — приложение возьмёт то, что разрешено.
    </p>
  </>;
}

/** Ход подключения: окно системы, итог; общий для экрана и листа */
function useConnect(onConnected) {
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState(null);
  const run = async (consent) => {
    setBusy(true);
    let res = null;
    try { res = await connectHealth({ consent }); } catch (_) { res = { steps: 'error' }; }
    // Android: фоновая задача начинает слать шаги и тренировки сама
    if (res && res.ok) ensureBackgroundSync().catch(() => {});
    reportDevice(true);
    setLines(healthResultLines(res));
    setBusy(false);
    if (onConnected) onConnected(res);
  };
  return { busy, lines, run };
}

/**
 * Один раз при входе. scope — что умеет телефон ('full' | 'basic'),
 * onDone — экран закрыт (подключили или «Не сейчас»)
 */
export function HealthConnectScreen({ scope, self = false, onDone }) {
  const [consent, setConsent] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const { busy, lines, run } = useConnect();
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [lines]);
  const full = scope === 'full';

  const later = async () => {
    setLeaving(true);
    if (full) markHealthFullAsked();
    // Больше не спрашиваем; шаги и тренировки на телефоне не трогаем
    await saveHealthAccess('declined', scope);
    onDone();
  };

  return <main className="onboarding" aria-busy={busy}>
    <div className="onboarding__content">
      <h1 ref={heading} tabIndex={-1}>{lines ? 'Готово' : 'Здоровье'}</h1>
      {lines
        ? <ul className="permissions__result" role="status">
          {lines.map(([title, text]) => <li key={title}><strong>{title}</strong><span>{text}</span></li>)}
        </ul>
        : <>
          <p className="onboarding__intro">
            {full
              ? `Приложение может брать из ${fromHub()} то, что записали телефон, часы и умные весы, — чтобы тренер видел восстановление и подбирал нагрузку.`
              : `Приложение может брать из ${fromHub()} шаги и тренировки с часов — без ручного ввода.`}
          </p>
          <WhatWeRead scope={scope} self={self} />
          {full && <ConsentBox checked={consent} disabled={busy} onChange={setConsent} />}
        </>}
    </div>
    <footer className="onboarding__footer">
      {lines
        ? <button type="button" className="button button--primary button--block" onClick={onDone}>Продолжить</button>
        : <>
          <button type="button" className="button button--primary button--block" disabled={busy || leaving} onClick={() => run(full && consent)}>
            {busy ? 'Спрашиваем…' : full && !consent ? 'Подключить шаги и тренировки' : 'Подключить'}
          </button>
          {!onIphone() && <button type="button" className="button button--block" disabled={busy || leaving} onClick={later}>Не сейчас</button>}
        </>}
    </footer>
  </main>;
}

/**
 * Тот же экран листом — из «Прогресса» и «Настроек». «Не сейчас» здесь
 * только закрывает: человек сам открыл лист, решения он не принимал
 */
export function HealthSheet({ self = false, onClose, onConnected }) {
  const [scope, setScope] = useState(null);
  const [consent, setConsent] = useState(false);
  const { busy, lines, run } = useConnect(onConnected);
  useEffect(() => {
    let alive = true;
    deviceHealthScope().then((s) => { if (alive) setScope(s || 'basic'); }).catch(() => { if (alive) setScope('basic'); });
    return () => { alive = false; };
  }, []);
  const full = scope === 'full';
  return (
    <Sheet title={lines ? 'Готово' : 'Здоровье'} onClose={onClose} locked={busy}>
      {lines
        ? <ul className="permissions__result" role="status">
          {lines.map(([title, text]) => <li key={title}><strong>{title}</strong><span>{text}</span></li>)}
        </ul>
        : scope === null ? <p className="small muted">Проверяем телефон…</p> : <>
          <WhatWeRead scope={scope} self={self} />
          {full && <ConsentBox checked={consent} disabled={busy} onChange={setConsent} />}
        </>}
      <div className="survey__actions">
        {lines
          ? <button type="button" className="button button--primary" onClick={onClose}>Готово</button>
          : <>
            <button type="button" className="button button--primary" disabled={busy || scope === null} onClick={() => run(full && consent)}>
              {busy ? 'Спрашиваем…' : full && !consent ? 'Подключить шаги и тренировки' : 'Подключить'}
            </button>
            {!onIphone() && <button type="button" className="button" disabled={busy} onClick={onClose}>Не сейчас</button>}
          </>}
      </div>
    </Sheet>
  );
}

/** Демо (?mockHealthAsk=full|basic): экран входа виден и без телефона */
function demoAsk() {
  try {
    const env = import.meta.env || {};
    if (env.VITE_MOCK !== '1') return '';
    const v = new URLSearchParams(window.location.search).get('mockHealthAsk');
    return v === 'full' || v === 'basic' ? v : '';
  } catch (_) { return ''; }
}

/**
 * Показать ли экран при входе: '' — нет, 'full' | 'basic' — да, с таким
 * списком. Пока проверяем — ''. Нет ответа сервера (старый, нет связи)
 * — не спрашиваем: спросим при следующем входе
 */
export function useHealthAsk(enabled) {
  const [ask, setAsk] = useState('');
  useEffect(() => {
    if (!enabled) { setAsk(''); return undefined; }
    const demo = demoAsk();
    if (demo) { setAsk(demo); return undefined; }
    if (!isNativeApp()) return undefined;
    let alive = true;
    apiPublic('health.access.get')
      .then((access) => healthAskNeeded(access))
      .then((s) => { if (alive) setAsk(s || ''); })
      .catch(() => {});
    return () => { alive = false; };
  }, [enabled]);
  return [ask, () => setAsk('')];
}

/* ==========================================================================
 * «Настройки» → «Здоровье»: что читается, подключить, отключить, отозвать
 * ========================================================================== */

const READ_LIST = 'сон и его фазы, пульс покоя и ВСР, пульс на тренировках, вес и % жира, активные и общие ккал за день, рост и VO2max';

export function HealthSettings({ self = false }) {
  const { data, error, reload } = useData('health.access.get', {}, []);
  const native = isNativeApp();
  const [scope, setScope] = useState(null);
  const [on, setOn] = useState(healthDailyOn);
  const [sheet, setSheet] = useState(false);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  useEffect(() => {
    if (!native) return undefined;
    let alive = true;
    deviceHealthScope().then((s) => { if (alive) setScope(s); }).catch(() => {});
    return () => { alive = false; };
  }, [native]);

  // Старый сервер не знает раздела — его просто нет
  if (error || !data) return null;
  const consent = !!data.consent;
  const status = consent
    ? (native ? (on ? 'Подключено на этом телефоне' : 'Согласие дано, на этом телефоне не подключено') : 'Согласие дано')
    : data.decision === 'granted' ? 'Только шаги и тренировки'
      : data.decision === 'declined' ? 'Не подключено' : 'Ещё не подключали';

  const revoke = async () => {
    setBusy(true);
    setNote('');
    try {
      await apiMutate('health.access.revoke', {});
      disconnectHealth();
      setOn(false);
      setAsking(false);
      setNote('Согласие отозвано, данные о здоровье удалены. Шаги и тренировки остались.');
      reload();
    } catch (e) {
      setNote(e.message || 'Не получилось. Проверьте связь и попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  };
  const turnOff = () => {
    disconnectHealth();
    setOn(false);
    setNote('На этом телефоне больше не читаем сон, пульс и вес. Уже отправленное осталось — удалить его можно, отозвав согласие.');
  };
  const canConnect = native && scope === 'full' && !(consent && on);

  return (
    <>
      <Panel>
        <div className="conn-row">
          <div className="conn-row__main">
            <span className="conn-row__title">Данные о здоровье</span>
            <span className={'conn-row__note' + (consent && (on || !native) ? ' conn-row__note--good' : '')}>{status}</span>
          </div>
          {canConnect && <button type="button" className="button conn-row__action" onClick={() => setSheet(true)}>Подключить</button>}
          {native && consent && on && <button type="button" className="button conn-row__action" onClick={turnOff}>Отключить</button>}
        </div>
        <div className="conn-row conn-row--wide">
          <span className="conn-row__note">
            {consent ? 'Читаем: ' + READ_LIST + '. ' : 'С согласием приложение читает: ' + READ_LIST + '. '}
            {self ? 'Видите только вы.' : 'Видите вы и ваш тренер.'} Только чтение — в {native ? healthHub() : '«Здоровье» и Health Connect'} ничего не пишем.
          </span>
        </div>
        {consent && (
          asking ? (
            <div className="conn-row conn-row--wide"><div className="delete-account__confirm health-revoke" role="alert">
              <strong>Отозвать согласие?</strong>
              <span>Удалим с сервера сон, пульс покоя, ВСР, пульс на тренировках, вес и % жира с весов, калории за день и VO2max{self ? '' : ' — тренер их больше не увидит'}. Шаги и тренировки останутся: их отключают отдельно.</span>
              <div className="delete-account__actions">
                <button type="button" className="button button--critical" onClick={revoke} disabled={busy}>{busy ? 'Удаляем…' : 'Отозвать и удалить'}</button>
                <button type="button" className="button" onClick={() => setAsking(false)} disabled={busy}>Отмена</button>
              </div>
            </div></div>
          ) : (
            <div className="conn-row conn-row--wide">
              <button type="button" className="button danger" onClick={() => setAsking(true)}>Отозвать согласие</button>
            </div>
          )
        )}
        {native && scope && (
          <div className="conn-row conn-row--wide">
            <button type="button" className="button button--block" onClick={() => openHealthSettings().catch(() => {})}>
              {onIphone() ? 'Открыть «Здоровье»' : onHuawei() ? 'Открыть Huawei Health' : 'Открыть Health Connect'}
            </button>
          </div>
        )}
      </Panel>
      {note && <p className="conn-caption" role="status">{note}</p>}
      <p className="conn-caption">
        {!native ? 'Подключить можно в приложении для iPhone и Android.'
          : scope === 'basic' ? (onHuawei() ? 'Huawei Health отдаёт только шаги и тренировки.' : 'В этой версии приложения — только шаги и тренировки. Сон, пульс и вес появятся после обновления.')
            : onIphone() ? 'Если в окне «Здоровья» что-то запретили, второй раз iPhone его не покажет — включить можно в «Здоровье» → Профиль → Приложения → Fit Track.'
              : 'Выдать или забрать доступ по пунктам — Health Connect → Разрешения приложений → Fit Track.'}
        {' '}<a href={HEALTH_CONSENT_URL} target="_blank" rel="noopener noreferrer">Текст согласия</a>
      </p>
      {sheet && <HealthSheet self={self} onClose={() => { setSheet(false); setOn(healthDailyOn()); reload(); }} />}
    </>
  );
}
