import React, { useState } from 'react';
import { apiPrimary } from '../api.js';
import { Note } from '../ui.jsx';
import { IconAlert, IconCheck } from '../icons.jsx';
import PhoneLogin from '../PhoneLogin.jsx';

/**
 * Вход по телефону — под полем «Телефон» в «Моих данных» (FT-489).
 *
 * Клиент, которого завёл тренер, входит по его ссылке. Номер из профиля
 * сам по себе вход не открывает: его мог вписать тренер, и ошибка в цифре
 * отдала бы чужому человеку замеры. Здесь клиент подтверждает свой номер
 * звонком — и дальше входит по нему с любого устройства.
 *
 * Своего поля для номера здесь нет (аудит 24.10.2026): раньше блок «Вход по
 * телефону» спрашивал номер второй раз, ниже поля «Телефон». Теперь номер —
 * один, в поле анкеты; здесь только его состояние и кнопки. На сервере это
 * по-прежнему два значения (контакт для тренера и номер для входа,
 * lib/phone-login.js), поэтому, если они разошлись, пишем это словами.
 *
 * state — ответ account.phone.get (его читает Profile вместе с анкетой,
 * чтобы блок не появлялся позже формы и не сдвигал её). Без ключа SMS.ru
 * (options.call) блока нет.
 */

const digits = (s) => {
  let d = String(s || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('8')) d = '7' + d.slice(1);
  return d;
};

export default function PhoneSetting({ state, phone, onChange, disabled }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  // Подтверждение отключения встаёт на место кнопки, без окна (DESIGN-APP.md)
  const [askOff, setAskOff] = useState(false);

  if (!state || !state.options || !state.options.call) return null;

  const typed = digits(phone);
  const login = digits(state.phone);
  const same = !!login && typed === login;
  const ready = typed.length === 11;

  const remove = async () => {
    setBusy(true);
    setNote(null);
    try {
      await apiPrimary('account.phone.remove', {});
      setAskOff(false);
      setNote({ tone: 'good', text: 'Вход по номеру отключён.' });
      onChange && onChange();
    } catch (error) {
      setNote({ tone: 'critical', text: error.message || 'Не получилось.' });
    } finally {
      setBusy(false);
    }
  };

  const off = disabled || busy;

  return (
    <div className="phone-setting">
      {same && (
        <p className="phone-setting__status phone-setting__status--good">
          <IconCheck size={15} /> Подтверждён — по нему можно входить без пароля
        </p>
      )}
      {login && !same && (
        <p className="phone-setting__status">Для входа подтверждён другой номер: {state.phone}</p>
      )}
      {!login && (
        <p className="phone-setting__status">
          {ready ? 'Подтвердите номер звонком — и входите по нему с любого устройства' : 'Впишите номер — его можно будет подтвердить звонком и входить по нему'}
        </p>
      )}

      {askOff ? (
        <div className="phone-setting__confirm" role="group" aria-label="Отключить вход по номеру">
          <p className="phone-setting__status">Входить по номеру будет нельзя — только по почте или ссылке тренера.</p>
          <div className="phone-setting__row">
            <button className="button button--critical button--small" onClick={remove} disabled={off}>
              {busy ? 'Отключаю…' : 'Отключить'}
            </button>
            <button className="button button--ghost button--small" onClick={() => setAskOff(false)} disabled={busy}>Отмена</button>
          </div>
        </div>
      ) : (
        <>
          {/* Номер из поля ещё не подтверждён — кнопка «Подтвердить звонком»
              и проверка звонком прямо здесь, без второго поля */}
          {ready && !same && (
            <PhoneLogin
              mode="attach"
              options={state.options}
              fixedPhone={phone}
              onAttached={(p) => { setNote({ tone: 'good', text: 'Номер ' + p + ' подключён для входа.' }); onChange && onChange(); }}
            />
          )}
          {login && (
            <div className="phone-setting__row">
              <button className="button button--ghost button--small" onClick={() => { setAskOff(true); setNote(null); }} disabled={off}>Отключить вход по номеру</button>
            </div>
          )}
        </>
      )}

      {note && <Note tone={note.tone} icon={note.tone === 'good' ? IconCheck : IconAlert}>{note.text}</Note>}
    </div>
  );
}
