import React, { useEffect, useState } from 'react';

import { apiMutate, apiOnce } from '../api.js';
import { useData } from '../useData.js';
import {
  DataTable, Empty, ErrorState, Field, Lead, Loading, Note, Panel, Row, Rows, Section, Segmented, Tag,
  formatDate, formatMoney, formatNumber, formatWhen, plural,
} from '../ui.jsx';
import { BarChart } from '../charts.jsx';
import { IconCheck } from '../icons.jsx';
import { haptic } from '../telegram.js';
import Trainers from './Trainers.jsx';
import Games from './Games.jsx';
import AdminStories from './AdminStories.jsx';
import AdminLook from './AdminLook.jsx';
import AdminVersions from './AdminVersions.jsx';
import { Logs } from './screens.jsx';
import {
  PLATFORM_NAMES, flagStatus, growthPoints, monthName, needsConfirm, percent, perClientNote, sourceTotals,
} from './admin-model.js';

/**
 * «Управление» — панель владельца сервиса (FT-562): аналитика по всему
 * приложению, тренеры, тарифы, флаги и логи в одном пункте меню.
 *
 * Видит её только владелец (me.owner === true, TrainerApp.jsx), и сервер
 * отвечает отказом всем остальным (owner: true в api/routes.js) — экран
 * без этой проверки ничего бы не открыл, только показал ошибку.
 *
 * «Вид» — темы оформления файлом, «Версии» — последние версии iPhone
 * для «Вышла новая версия» (22.10.2026).
 *
 * Аналитика — одни числа: имён и адресов в ней нет (docs/legal/
 * 2026-10-17-admin-panel.md в основном репозитории).
 */

export const ADMIN_PANES = [
  { value: 'stats', label: 'Аналитика' },
  { value: 'trainers', label: 'Тренеры' },
  { value: 'tariffs', label: 'Тарифы' },
  { value: 'games', label: 'Игры' },
  { value: 'flags', label: 'Флаги' },
  // «Что нового» и «Инструкция» у всех пользователей — без сборки (FT-615)
  { value: 'stories', label: 'Истории' },
  // Темы оформления файлом — загрузить, закрыть (22.10.2026)
  { value: 'look', label: 'Вид' },
  // Последние версии iPhone: «Вышла новая версия» в старых (22.10.2026)
  { value: 'versions', label: 'Версии' },
  // Журнал действий: платежи, пересчёты, переносы, переключения флагов
  { value: 'logs', label: 'Логи' },
  // Справочные разделы базы файлом — переслать разработчику (18.10.2026)
  { value: 'export', label: 'Выгрузка' },
];

export default function Admin({ pane }) {
  if (pane === 'trainers') return <Trainers />;
  if (pane === 'tariffs') return <Tariffs />;
  if (pane === 'games') return <Games />;
  if (pane === 'flags') return <Flags />;
  if (pane === 'stories') return <AdminStories />;
  if (pane === 'look') return <AdminLook />;
  if (pane === 'versions') return <AdminVersions />;
  if (pane === 'logs') return <Logs />;
  if (pane === 'export') return <Export />;
  return <Stats />;
}

/* ==========================================================================
 * Аналитика
 * ========================================================================== */

const n = (v) => formatNumber(v || 0);

function Stats() {
  const { data, loading, error, reload } = useData('owner.stats', {}, []);
  if (loading) return <Loading rows={4} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const { seen, training, people, retention, versions = [], errors = [], alerts = {} } = data;
  const sources = sourceTotals(data.growth);
  const newClients = (data.growth || []).reduce((s, w) => s + w.clients, 0);
  const newTrainers = (data.growth || []).reduce((s, w) => s + w.trainers, 0);

  return (
    <>
      <Lead
        label="Клиентов заходило за неделю"
        value={n(seen.clients.week)}
        hint={`Сегодня — ${n(seen.clients.day)}, за 30 дней — ${n(seen.clients.month)}. Тестовые не считаются.`}
        facts={[
          { label: 'Тренеров за неделю', value: n(seen.trainers.week) },
          { label: 'Клиентов у тренеров', value: n(people.clients.withTrainer) },
          { label: 'Сами по себе', value: n(people.clients.selfOnly) },
        ]}
      />

      <Section title="Рост" note="Новые клиенты по неделям — первый вход в приложение">
        <Panel pad>
          <BarChart points={growthPoints(data.growth)} plain label="Новые клиенты" format={(v) => n(v)} />
        </Panel>
        <Rows>
          <Row label="Новых клиентов за 8 недель">{n(newClients)}</Row>
          {sources.map((s) => <Row key={s.key} label={s.label}>{n(s.value)}</Row>)}
          <Row label="Новых тренеров за 8 недель">{n(newTrainers)}</Row>
          <Row label="Заявок ждут решения">{n(people.trainers.pending)}</Row>
        </Rows>
      </Section>

      <Section title="Активность" note="Тренировка — завершённая в приложении; занятие — прошедшее по расписанию">
        <DataTable
          headers={['', '7 дней', '30 дней']}
          numericFrom={1}
          rows={[
            ['Тренировок в приложении', n(training.week.workouts), n(training.month.workouts)],
            ['Выполненных подходов', n(training.week.sets), n(training.month.sets)],
            ['Клиентов тренировалось', n(training.week.clients), n(training.month.clients)],
            ['Занятий с тренером', n(training.week.withTrainer), n(training.month.withTrainer)],
            ['Тренеров заходило', n(seen.trainers.week), n(seen.trainers.month)],
          ]}
        />
      </Section>

      <Section
        title="Удержание"
        note={`По месяцу первого занятия: сколько из начавших занимались за последние 30 дней. Всего занимались ${n(retention.ever)}, сейчас — ${n(retention.active)} (${percent(retention.active, retention.ever)}).`}
      >
        <DataTable
          headers={['Начали', 'Человек', 'Занимаются', 'Доля']}
          numericFrom={1}
          rows={retention.cohorts.slice().reverse().map((c) => [
            monthName(c.month), n(c.started), n(c.active), percent(c.active, c.started),
          ])}
        />
      </Section>

      <Section title="Версии приложения" note="Телефоны клиентов, заходивших за 30 дней. Сайт в браузере всегда свежий — его здесь нет">
        {versions.every((v) => !v.devices)
          ? <Empty title="Нет данных" text="Приложение на телефоне ещё ни разу не сообщило о себе." />
          : versions.filter((v) => v.devices).map((v) => (
            <Panel pad key={v.platform} className="admin-block">
              <div className="admin-block__head">
                <strong>{PLATFORM_NAMES[v.platform] || v.platform}</strong>
                {v.outdated
                  ? <Tag tone="warn">{`на старой версии ${n(v.outdated)} из ${n(v.devices)}`}</Tag>
                  : <Tag tone="good">все на последней</Tag>}
              </div>
              <Rows>
                {v.versions.map((ver) => (
                  <Row key={ver.version || '—'} label={(ver.version || 'версия неизвестна') + (ver.latest ? ' · последняя' : '')}>
                    {n(ver.devices)}
                  </Row>
                ))}
              </Rows>
            </Panel>
          ))}
      </Section>

      <Section title="Ошибки сервера" note="С последнего перезапуска, без подробностей запросов. Каждая ещё и приходит письмом">
        {alerts.lastError && <Note tone="critical">Письмо об ошибке не ушло: {alerts.lastError}</Note>}
        {errors.length === 0
          ? <Empty icon={IconCheck} title="Ошибок не было" text="С последнего перезапуска сервер ни разу не записал ошибку." />
          : (
            <div className="admin-list">
              {errors.map((e, i) => (
                <Panel pad key={i} className="admin-error">
                  <strong>{e.message}</strong>
                  {e.error && <span>{e.error}</span>}
                  <span>
                    {e.where ? e.where + ' · ' : ''}
                    {e.count > 1 ? `${e.count} ${plural(e.count, 'раз', 'раза', 'раз')}, последняя ` : ''}
                    {formatWhen(e.lastAt)}
                    {e.fatal ? ' · процесс упал' : ''}
                  </span>
                </Panel>
              ))}
            </div>
          )}
      </Section>
    </>
  );
}

/* ==========================================================================
 * Тарифы
 * ========================================================================== */

const NUMBERS = [
  ['overPerClient', 'Сверх последней ступени, ₽ за клиента'],
  ['plusPrice', '«Плюс» клиента, ₽ в месяц'],
  ['plusTrialDays', 'Пробный «Плюс», дней'],
  ['programSwitchDays', 'Смена программы без «Плюса», раз в дней'],
  ['catalogFeePercent', 'Комиссия за клиентов каталога, %'],
  ['catalogFeeMonths', 'Срок комиссии, месяцев'],
];

/** Настройки → строки для полей ввода: поле работает со строкой */
function toForm(settings) {
  const form = { tiers: settings.tiers.map((t) => ({ key: t.key, title: t.title, upTo: String(t.upTo), price: String(t.price) })) };
  NUMBERS.forEach(([k]) => { form[k] = String(settings[k]); });
  return form;
}

function fromForm(form) {
  const num = (v) => (String(v).trim() === '' ? NaN : Number(String(v).replace(/\s/g, '')));
  const out = { tiers: form.tiers.map((t) => ({ key: t.key, upTo: num(t.upTo), price: num(t.price) })) };
  NUMBERS.forEach(([k]) => { out[k] = num(form[k]); });
  return out;
}

function Tariffs() {
  const { data, loading, error, reload } = useData('owner.tariffs', {}, []);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => { if (data && data.settings) setForm(toForm(data.settings)); }, [data]);

  if (loading || (data && !form)) return <Loading rows={4} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const tierTitles = Object.fromEntries(data.settings.tiers.map((t) => [t.key, t.title]));
  const setTier = (i, field, value) => {
    setSaved(false);
    setForm((f) => ({ ...f, tiers: f.tiers.map((t, j) => (j === i ? { ...t, [field]: value } : t)) }));
  };

  const save = async () => {
    setBusy(true); setProblem(null); setSaved(false);
    try {
      await apiMutate('owner.tariffs.save', { settings: fromForm(form) });
      haptic('success');
      setSaved(true);
      reload();
    } catch (err) {
      setProblem(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {!data.on && (
        <Note tone="info">
          Тарифы выключены: у всех открыто всё, ступени только считаются. Включить — на вкладке «Флаги».
        </Note>
      )}

      <Section title="Ступени тренера" note="Цена месяца по числу активных клиентов. Названия — в коде, здесь границы и цены">
        <div className="admin-list">
          {form.tiers.map((t, i) => {
            // Цена на клиента — по тому, что сейчас в полях: видно сразу, как
            // правка цены или границы меняет её. У последней ступени предела
            // нет, у бесплатной считать нечего
            const per = perClientNote(t, { unlimited: i === form.tiers.length - 1 });
            return (
              <Panel pad key={t.key} className="admin-tier">
                <strong>{t.title}</strong>
                <div className="admin-tier__fields">
                  <Field label="Клиентов до" inputMode="numeric" value={t.upTo} onChange={(v) => setTier(i, 'upTo', v)} disabled={busy} />
                  <Field label="Цена, ₽ в месяц" inputMode="decimal" value={t.price} onChange={(v) => setTier(i, 'price', v)} disabled={busy} />
                </div>
                {per && <p className="small muted" style={{ margin: 0 }}>{per}</p>}
              </Panel>
            );
          })}
        </div>
      </Section>

      <Section title="Остальное">
        <Panel pad className="admin-tier__fields">
          {NUMBERS.map(([k, label]) => (
            <Field key={k} label={label} inputMode={/₽|%/.test(label) ? 'decimal' : 'numeric'} value={form[k]} disabled={busy}
              onChange={(v) => { setSaved(false); setForm((f) => ({ ...f, [k]: v })); }} />
          ))}
        </Panel>
        {problem && <Note tone="critical">Не сохранилось: {problem.message || 'нет связи'}</Note>}
        {saved && <Note tone="good">Сохранено. Новые цены действуют сразу.</Note>}
        <button type="button" className="button button--primary admin-save" disabled={busy} onClick={save}>
          {busy ? 'Сохраняю…' : 'Сохранить цены'}
        </button>
      </Section>

      <Section title="Тренеры по ступеням" note="Ступень выдаёте вы, пока нет оплат. Понижение ничего не удаляет — только новых клиентов не взять">
        <div className="admin-list">
          {data.trainers.map((t) => (
            <TrainerTier key={t.id} trainer={t} tiers={data.settings.tiers} titles={tierTitles} onDone={reload} />
          ))}
        </div>
        {/* Владельцу ступень не выдаётся, отключённых здесь нет — без
            подсказки пустой список выглядел как сломанная кнопка */}
        {!data.trainers.some((t) => !t.owner) && (
          <Note tone="info">
            Других работающих тренеров нет. Ступень выдаётся работающему тренеру: отключённому — сначала
            «Вернуть доступ» на вкладке «Тренеры», новые появятся после одобрения заявки. У владельца ступени нет — у вас всё без предела.
          </Note>
        )}
      </Section>

      <Section title="«Плюс» клиенту" note="По ID, который клиент видит у себя в профиле, — например FT-7K2QM4">
        <PlusByID />
      </Section>
    </>
  );
}

function TrainerTier({ trainer, tiers, titles, onDone }) {
  const [open, setOpen] = useState(false);
  const [tier, setTier] = useState(trainer.tier === 'owner' ? 'start' : trainer.tier);
  const [until, setUntil] = useState(trainer.paidUntil || '');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);

  const limit = trainer.clientLimit === null ? 'без предела' : `из ${trainer.clientLimit}`;
  const give = async () => {
    setBusy(true); setProblem(null);
    try {
      await apiMutate('owner.trainer.tariff', { trainerId: trainer.id, tier, until: until || null });
      haptic('success');
      setOpen(false);
      onDone();
    } catch (err) {
      setProblem(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel pad className="admin-trainer">
      <div className="trainer-row__copy">
        <strong>{trainer.name || trainer.email}</strong>
        <span>
          {trainer.owner ? 'Владелец' : titles[trainer.tier] || trainer.title}
          {trainer.paidUntil ? ` до ${formatDate(trainer.paidUntil)}` : ''}
          {` · клиентов ${trainer.activeClients} ${limit}`}
        </span>
        {!trainer.owner && trainer.needed && trainer.needed.key !== trainer.tier && (
          <span>По числу клиентов подходит «{trainer.needed.title}» — {formatMoney(trainer.needed.price)} в месяц</span>
        )}
        {trainer.overLimit && <Tag tone="warn">клиентов больше, чем позволяет ступень</Tag>}
      </div>
      {!trainer.owner && !open && (
        <div className="trainer-row__actions">
          <button type="button" className="button" onClick={() => setOpen(true)}>Сменить</button>
        </div>
      )}
      {open && (
        <div className="admin-trainer__edit">
          <Segmented items={tiers.map((t) => ({ value: t.key, label: t.title }))} value={tier} onChange={setTier} label="Ступень" wrap disabled={busy} />
          {tier !== 'start' && (
            <Field label="По какой день" hint="Пусто — без срока" type="date" value={until} onChange={setUntil} disabled={busy} />
          )}
          {problem && <Note tone="critical">Не сохранилось: {problem.message || 'нет связи'}</Note>}
          <div className="trainer-row__actions">
            <button type="button" className="button" disabled={busy} onClick={() => setOpen(false)}>Отмена</button>
            <button type="button" className="button button--primary" disabled={busy} onClick={give}>
              {tier === 'start' ? 'Вернуть на «Старт»' : 'Выдать'}
            </button>
          </div>
        </div>
      )}
    </Panel>
  );
}

function PlusByID() {
  const [publicId, setPublicId] = useState('');
  const [until, setUntil] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const [done, setDone] = useState(null);

  const send = async (revoke) => {
    setBusy(true); setProblem(null); setDone(null);
    try {
      const r = await apiMutate('owner.client.plus', { publicId, until: until || null, revoke });
      haptic('success');
      setDone(r);
    } catch (err) {
      setProblem(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel pad className="admin-tier__fields">
      <Field label="ID клиента" inputMode="text" placeholder="FT-7K2QM4" value={publicId} onChange={setPublicId} disabled={busy} />
      <Field label="По какой день" hint="Пусто — без срока" type="date" value={until} onChange={setUntil} disabled={busy} />
      {problem && <Note tone="critical">Не сохранилось: {problem.message || 'нет связи'}</Note>}
      {done && (
        <Note tone="good">
          {done.name}: {done.plus ? `«Плюс» ${done.until ? 'до ' + formatDate(done.until) : 'без срока'}` : '«Плюс» снят'}
        </Note>
      )}
      <div className="trainer-row__actions">
        <button type="button" className="button" disabled={busy || !publicId.trim()} onClick={() => send(true)}>Снять</button>
        <button type="button" className="button button--primary" disabled={busy || !publicId.trim()} onClick={() => send(false)}>Выдать «Плюс»</button>
      </div>
    </Panel>
  );
}

/* ==========================================================================
 * Флаги
 * ========================================================================== */

function Flags() {
  const { data, loading, error, reload } = useData('owner.flags', {}, []);
  const [state, setState] = useState(null);
  const [asking, setAsking] = useState(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);

  useEffect(() => { if (data) setState(data); }, [data]);

  if (loading || (data && !state)) return <Loading rows={3} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const change = async (flag, next) => {
    const key = flag.key + ':' + String(next);
    if (needsConfirm(flag, next) && asking !== key) { setAsking(key); haptic(); return; }
    setBusy(true); setProblem(null);
    try {
      const r = await apiMutate('owner.flag.set', next === null ? { key: flag.key, reset: true } : { key: flag.key, value: next });
      haptic('success');
      setAsking(null);
      setState(r);
    } catch (err) {
      setProblem(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Note tone="info">
        Переключение действует сразу, без перезапуска сервера, и сохраняется. Основа — значение в .env; «Как в .env» возвращает его.
      </Note>
      {problem && <Note tone="critical">Не сохранилось: {problem.message || 'нет связи'}</Note>}

      <Section title="Флаги сервера">
        <div className="admin-list">
          {state.flags.map((f) => {
            const next = !f.value;
            const confirmKey = f.key + ':' + String(next);
            const resetKey = f.key + ':null';
            return (
              <Panel pad key={f.key} className="admin-flag">
                <div className="admin-flag__head">
                  <div className="trainer-row__copy">
                    <strong>{f.title}</strong>
                    <span>{f.env} · {flagStatus(f)}</span>
                  </div>
                  <Tag tone={f.value === f.riskyTo ? 'warn' : undefined}>{f.value ? 'вкл' : 'выкл'}</Tag>
                </div>
                <p className="admin-flag__text">{f.value ? f.on : f.off}</p>
                {(asking === confirmKey || asking === resetKey) && <Note tone="critical">{f.caution}</Note>}
                <div className="trainer-row__actions">
                  {f.overridden && (
                    <button type="button" className={'button' + (asking === resetKey ? ' button--critical' : '')} disabled={busy} onClick={() => change(f, null)}>
                      {asking === resetKey ? 'Точно вернуть?' : 'Как в .env'}
                    </button>
                  )}
                  <button
                    type="button"
                    className={'button' + (asking === confirmKey ? ' button--critical' : ' button--primary')}
                    disabled={busy}
                    onClick={() => change(f, next)}
                  >
                    {asking === confirmKey ? `Точно ${next ? 'включить' : 'выключить'}?` : (next ? 'Включить' : 'Выключить')}
                  </button>
                </div>
              </Panel>
            );
          })}
        </div>
      </Section>

      {state.history.length > 0 && (
        <Section title="Последние переключения">
          <Rows>
            {state.history.map((h, i) => (
              <Row key={i} label={formatWhen(h.at)}>
                {h.text}
              </Row>
            ))}
          </Rows>
        </Section>
      )}
    </>
  );
}

/* ==========================================================================
 * Выгрузка
 * ========================================================================== */

/**
 * Справочные разделы базы файлом JSON (владелец, 18.10.2026): «чтобы я мог
 * присылать их, если надо». Только содержание сервиса — данных клиентов
 * сервер не отдаёт (lib/owner-export.js). «Где используются упражнения»
 * (19.10.2026, перед чисткой дублей) — занятия и программы числами по
 * упражнению, без людей. На телефоне — «Поделиться»
 * (файл сразу в мессенджер или чат), где его нет — скачать или скопировать.
 */
function Export() {
  const { data, loading, error, reload } = useData('owner.export.sections', {}, []);
  const [picked, setPicked] = useState(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const [ready, setReady] = useState(null);
  const [copied, setCopied] = useState(false);
  // Какие упражнения: все, активные (что видно в библиотеке), убранные, свои
  const [filter, setFilter] = useState('all');

  if (loading) return <Loading lead={false} rows={4} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const sections = data.sections || [];
  const chosen = picked || sections.map((s) => s.key);
  const toggle = (key) => { setReady(null); setPicked(chosen.includes(key) ? chosen.filter((k) => k !== key) : [...chosen, key]); haptic(); };

  const build = async () => {
    setBusy(true);
    setFailure(null);
    setCopied(false);
    try {
      const result = await apiOnce('owner.export', { sections: chosen, exercises: filter });
      const text = JSON.stringify(result, null, 1);
      const day = new Date().toISOString().slice(0, 10);
      const tag = chosen.map((k) => (k === 'exercises' && filter !== 'all' ? k + '-' + filter : k)).join('-');
      setReady({ text, name: `fittrack-${tag}-${day}.json`, size: new Blob([text]).size });
      haptic('success');
    } catch (err) {
      setFailure(err);
    } finally {
      setBusy(false);
    }
  };

  const file = () => new File([ready.text], ready.name, { type: 'application/json' });
  let canShare = false;
  try { canShare = !!(ready && navigator.canShare && navigator.canShare({ files: [file()] })); } catch (_) {}
  const share = async () => { try { await navigator.share({ files: [file()], title: ready.name }); } catch (_) {} };
  const download = () => {
    const url = URL.createObjectURL(file());
    const a = document.createElement('a');
    a.href = url;
    a.download = ready.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ready.text);
      setCopied(true);
      haptic('success');
    } catch (_) {
      setFailure(new Error('Не удалось скопировать — скачайте файл.'));
    }
  };

  return (
    <Section title="Выгрузка базы">
      <Panel pad>
        <div className="library__form">
          <p className="small muted">Файл JSON с выбранными разделами — его можно переслать разработчику. Данных клиентов (занятия, замеры, питание, оплаты) в выгрузке нет: занятия попадают в неё только числами по упражнению.</p>
          {sections.map((s) => (
            <React.Fragment key={s.key}>
              <label className="library__check">
                <input type="checkbox" checked={chosen.includes(s.key)} onChange={() => toggle(s.key)} />
                <span><strong>{s.title}</strong> · {formatNumber(s.rows)} {plural(s.rows, 'строка', 'строки', 'строк')}<br /><span className="small muted">{s.hint}</span></span>
              </label>
              {s.filters && chosen.includes(s.key) && <>
                <Segmented items={s.filters.map((f) => ({ value: f.value, label: `${f.label} · ${formatNumber(f.count)}` }))}
                  value={filter} onChange={(v) => { setFilter(v); setReady(null); haptic(); }} label="Какие упражнения" wrap />
                <p className="small muted">У каждого упражнения в файле есть пометки: общее или своё, убрано ли у вас, заменено ли вашей версией.</p>
              </>}
            </React.Fragment>
          ))}
          {failure && <Note tone="critical">{failure.message}</Note>}
          <button type="button" className="button button--primary" disabled={busy || !chosen.length} onClick={build}>{busy ? 'Собираю…' : 'Выгрузить'}</button>
          {ready && <>
            <p className="small">{ready.name} · {formatNumber(Math.max(1, Math.round(ready.size / 1024)))} КБ</p>
            {canShare && <button type="button" className="button button--primary" onClick={share}>Поделиться файлом</button>}
            <button type="button" className="button" onClick={download}>Скачать файл</button>
            <button type="button" className="button" onClick={copy}>{copied ? 'Скопировано' : 'Скопировать текст'}</button>
          </>}
        </div>
      </Panel>
    </Section>
  );
}
