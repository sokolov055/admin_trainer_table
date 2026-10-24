import React, { useState, useEffect } from 'react';
import { api, apiMutate, apiPrimary } from '../api.js';
import { Field, Segmented, Note, Loading, ErrorState, Panel } from '../ui.jsx';
import { IconAlert, IconCheck } from '../icons.jsx';
import PhoneSetting from './PhoneSetting.jsx';
import DataExport from './DataExport.jsx';
import GoalChoice from './GoalChoice.jsx';
import './profile.css';

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
 * открывается переписка. Имя вписывается руками: бота, который подставлял
 * его сам, с 27.09.2026 нет.
 */

const EMPTY = { birthAt: '', sex: '', height: '', phone: '', email: '', telegram: '', telegramUrl: '' };

export default function Profile({ clientRow }) {
  const params = clientRow ? { clientRow } : {};

  const [state, setState] = useState({ loading: true, error: null, age: null });
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const [saved, setSaved] = useState(false);
  // Номер для входа (account.phone.get) — только у самого клиента
  const [phoneLogin, setPhoneLogin] = useState(null);
  const loadPhoneLogin = () => (clientRow ? Promise.resolve(null) : apiPrimary('account.phone.get', {}).catch(() => null));

  const load = () => {
    setState((s) => ({ ...s, loading: true, error: null }));

    // Через api(): без связи — последние сохранённые данные, а не ошибка.
    // Номер для входа читаем рядом и показываем вместе с анкетой: под полем
    // «Телефон» он, появившись позже, сдвигал бы форму (аудит 24.10.2026).
    // Но анкету не держим дольше 1,5 с: без связи запрос номера ждал бы
    // своего таймаута, а сохранённая анкета уже есть — номер догонит
    const phone = loadPhoneLogin();
    const phoneSoon = Promise.race([phone, new Promise((r) => setTimeout(() => r(undefined), 1500))]);
    Promise.all([api('profile.get', params, { fresh: true }), phoneSoon])
      .then(([r, ph]) => {
        setForm({ ...EMPTY, ...(r.profile || {}) });
        if (ph === undefined) phone.then(setPhoneLogin); else setPhoneLogin(ph);
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

  // Цель и график из анкеты — только у самого клиента (FT-582). Стоит до
  // проверки загрузки: свой запрос идёт рядом с анкетой, а не после неё, и
  // блок не перемонтируется (аудит 24.10.2026)
  const goal = !clientRow && <GoalChoice />;
  if (state.loading) return <>{goal}<Loading rows={3} /></>;
  if (state.error) return <>{goal}<ErrorState error={state.error} onRetry={load} /></>;

  return (
    <>
    {goal}
    <Panel pad>
      <div className="survey">
        <div className="survey__group">
          <div className="field-row profile__row">
            <label className="field">
              <span className="field__label">Дата рождения</span>
              <input
                className="field__input profile__date"
                type="date"
                value={form.birthAt}
                onChange={(e) => set('birthAt', e.target.value)}
                disabled={busy}
              />
            </label>
            <Field label="Рост, см" placeholder="175" inputMode="decimal" value={form.height} onChange={(v) => set('height', v)} disabled={busy} />
          </div>
          <span className="field__hint">
            {state.age ? `Сейчас ${state.age} — возраст считается сам` : 'По дате рождения считается возраст для нормы питания'}
          </span>
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
          <div>
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
          {/* Вход по этому номеру — под тем же полем, а не отдельным блоком
              со вторым полем «Телефон» ниже анкеты (аудит 24.10.2026). Только
              у самого клиента: тренер в карточке номер для входа не подключает,
              вход подтверждает звонком владелец номера */}
          {!clientRow && (
            <PhoneSetting state={phoneLogin} phone={form.phone} disabled={busy}
              onChange={() => loadPhoneLogin().then(setPhoneLogin)} />
          )}
        </div>

        <div className="survey__group">
          <Field label="Почта" placeholder="anna@example.com" inputMode="email" value={form.email} onChange={(v) => set('email', v)} disabled={busy} />
        </div>

        {/* Telegram убран с экрана (владелец, 15.10.2026): бота нет с
            27.09.2026, ник никто не вписывал. Сохранённый ник не стирается —
            форма отправляет его как был */}
      </div>

      {failure && <Note tone="critical" icon={IconAlert}>{failure.message || 'Не получилось сохранить'}</Note>}
      {saved && !failure && <Note tone="good" icon={IconCheck}>Сохранено.</Note>}

      <div className="survey__actions">
        <button className="button button--primary" onClick={save} disabled={busy}>
          {busy ? 'Сохраняю…' : 'Сохранить'}
        </button>
        <button className="button" onClick={load} disabled={busy}>Отменить правки</button>
      </div>
    </Panel>
    {/* Копия своих данных (ст. 14 152-ФЗ) — тоже только у самого клиента */}
    {!clientRow && <DataExport />}
    </>
  );
}
