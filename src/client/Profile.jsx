import React, { useState, useEffect } from 'react';
import { apiPublic, apiMutate } from '../api.js';
import { enablePush, disablePush, pushState, pushSupported, installedAsApp } from '../push.js';
import { Field, Segmented, Note, Loading, ErrorState, Panel } from '../ui.jsx';
import { IconAlert, IconCheck } from '../icons.jsx';

/**
 * Мои данные.
 *
 * Это первый экран, где клиент заполняет что-то про себя не ради
 * сегодняшнего действия — не анкету для расчёта нормы и не замер, — а
 * просто чтобы тренер мог связаться и чтобы приложение перестало
 * переспрашивать одно и то же. Поэтому обязательных полей нет ни одного:
 * заполняют такое между делом, по одному полю за раз.
 *
 * Telegram здесь — контакт, а не вход: тренеру нужна ссылка, по которой
 * открывается переписка. Вписать имя можно руками, но набирать «@» с
 * телефона и ошибаться в букве незачем, поэтому есть кнопка: она ведёт в
 * бота, а имя приходит от самого Telegram.
 */

const EMPTY = { birthAt: '', sex: '', height: '', phone: '', email: '', telegram: '', telegramUrl: '' };

export default function Profile({ clientRow }) {
  const params = clientRow ? { clientRow } : {};

  const [state, setState] = useState({ loading: true, error: null, age: null });
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const [saved, setSaved] = useState(false);

  const load = () => {
    setState((s) => ({ ...s, loading: true, error: null }));

    apiPublic('profile.get', params)
      .then((r) => {
        setForm({ ...EMPTY, ...(r.profile || {}) });
        setState({ loading: false, error: null, age: r.age });
      })
      .catch((error) => setState({ loading: false, error, age: null }));
  };

  useEffect(load, [clientRow]);

  const set = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
    setFailure(null);
    setSaved(false);
  };

  const save = async () => {
    setBusy(true);
    setFailure(null);
    try {
      // Оставленный «+7» — это пустое поле, а не номер: человек коснулся
      // и передумал. Отправлять его значит получить отказ на ровном месте.
      const phone = /^\+?7?$/.test(String(form.phone).trim()) ? '' : form.phone;

      const result = await apiMutate('profile.save', { ...params, ...form, phone });
      setForm({ ...EMPTY, ...(result.profile || {}) });
      setState((s) => ({ ...s, age: result.age }));
      setSaved(true);
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(false);
    }
  };

  /**
   * Уводим человека в бота и возвращаем обратно. Ответ придёт не сюда, а
   * на сервер — поэтому по возвращении просто перечитываем профиль:
   * гадать, успел он нажать «Старт» или передумал, бессмысленно.
   */
  const fillFromTelegram = async () => {
    setBusy(true);
    setFailure(null);
    try {
      const { url } = await apiMutate('profile.telegram.link', params);
      window.open(url, '_blank', 'noopener');
      setSaved(false);
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(false);
    }
  };

  if (state.loading) return <Loading rows={3} />;
  if (state.error) return <ErrorState error={state.error} onRetry={load} />;

  return (
    <Panel pad>
      <div className="survey">
        <div className="survey__group">
          <label className="field">
            <span className="field__label">Дата рождения</span>
            <input
              className="field__input"
              type="date"
              value={form.birthAt}
              onChange={(e) => set('birthAt', e.target.value)}
              disabled={busy}
            />
            <span className="field__hint">
              {state.age ? `Сейчас ${state.age} — возраст считается сам` : 'По ней считается возраст для нормы питания'}
            </span>
          </label>
        </div>

        <div className="survey__group">
          <div className="survey__legend">Пол</div>
          <Segmented
            items={[{ value: 'm', label: 'Мужской' }, { value: 'f', label: 'Женский' }]}
            value={form.sex}
            onChange={(v) => set('sex', v)}
            label="Пол"
            disabled={busy}
          />
        </div>

        <div className="survey__group">
          <div className="field-row">
            <Field label="Рост, см" placeholder="175" inputMode="decimal" value={form.height} onChange={(v) => set('height', v)} disabled={busy} />

            {/* «+7» подставляется при первом касании поля, а не заранее:
                заранее поставленный плюс означал бы, что профиль без
                телефона не сохранить — сервер ждёт десять цифр. */}
            <Field
              label="Телефон"
              placeholder="+7 900 000-00-00"
              inputMode="tel"
              value={form.phone}
              onFocus={() => { if (!form.phone) set('phone', '+7'); }}
              onChange={(v) => set('phone', v)}
              disabled={busy}
            />
          </div>
        </div>

        <div className="survey__group">
          <Field label="Почта для связи" placeholder="anna@example.com" inputMode="email" value={form.email} onChange={(v) => set('email', v)} disabled={busy} />
        </div>

        <div className="survey__group">
          <div className="survey__legend">
            Telegram
            <span className="survey__legend-note">чтобы тренер мог написать вам одним нажатием</span>
          </div>

          <Field label="Имя пользователя" placeholder="@anna_fit" inputMode="text" value={form.telegram} onChange={(v) => set('telegram', v)} disabled={busy} />

          <div className="survey__actions">
            <button className="button" onClick={fillFromTelegram} disabled={busy}>Заполнить из Telegram</button>
            {form.telegramUrl && (
              <a className="button button--ghost" href={form.telegramUrl} target="_blank" rel="noreferrer">Открыть переписку</a>
            )}
          </div>

          <p className="small muted">
            Нажмите «Заполнить из Telegram», затем в открывшемся чате — «Старт»,
            и возвращайтесь: имя подставится само.
          </p>
        </div>
      </div>

      <PushSetting clientRow={clientRow} />

      {failure && <Note tone="critical" icon={IconAlert}>{failure.message || 'Не получилось сохранить'}</Note>}
      {saved && !failure && <Note tone="good" icon={IconCheck}>Сохранено.</Note>}

      <div className="survey__actions">
        <button className="button button--primary" onClick={save} disabled={busy}>
          {busy ? 'Сохраняю…' : 'Сохранить'}
        </button>
        <button className="button" onClick={load} disabled={busy}>Обновить</button>
      </div>
    </Panel>
  );
}

/**
 * Уведомления на этом устройстве.
 *
 * Спрашиваем разрешение только по нажатию: браузеры наказывают за
 * непрошеный запрос, а человек, которого спросили сразу, жмёт «запретить»
 * не глядя — и вернуть это можно только через настройки браузера.
 *
 * Отдельно предупреждаем про iPhone: там уведомления работают только у
 * приложения, добавленного на домашний экран. Умолчать об этом значит
 * оставить человека с кнопкой, которая у него молча не работает.
 */
function PushSetting({ clientRow }) {
  const [state, setState] = useState(() => pushState());
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  if (!pushSupported()) return null;

  const iphone = /iPhone|iPad/.test(navigator.userAgent) && !installedAsApp();

  const turnOn = async () => {
    setBusy(true);
    setProblem('');
    try {
      const result = await enablePush(clientRow);
      if (!result.ok) setProblem(result.reason);
      setState(pushState());
    } catch (error) {
      setProblem(error.message || 'Не получилось включить уведомления.');
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      await disablePush();
      setState(pushState());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="survey__group">
      <div className="survey__legend">
        Напоминания
        <span className="survey__legend-note">
          взвешивание раз в неделю, замеры раз в месяц и конец отдыха на тренировке
        </span>
      </div>

      {iphone ? (
        <p className="small muted">
          На iPhone уведомления приходят только приложению, добавленному на экран «Домой».
          Откройте меню «Поделиться» и выберите «На экран „Домой“» — потом включите здесь.
        </p>
      ) : (
        <div className="survey__actions">
          {state === 'granted'
            ? <button className="button" onClick={turnOff} disabled={busy}>Выключить на этом устройстве</button>
            : <button className="button button--primary" onClick={turnOn} disabled={busy}>
                {busy ? 'Включаю…' : 'Включить уведомления'}
              </button>}
        </div>
      )}

      {problem && <p className="small muted">{problem}</p>}
    </div>
  );
}
