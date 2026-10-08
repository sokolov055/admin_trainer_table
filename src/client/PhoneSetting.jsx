import React, { useEffect, useState } from 'react';
import { apiPrimary } from '../api.js';
import { Panel, Note } from '../ui.jsx';
import { IconAlert, IconCheck } from '../icons.jsx';
import PhoneLogin from '../PhoneLogin.jsx';

/**
 * «Вход по телефону» в «Моих данных» (FT-489).
 *
 * Клиент, которого завёл тренер, входит по его ссылке. Номер из профиля
 * сам по себе вход не открывает: его мог вписать тренер, и ошибка в цифре
 * отдала бы чужому человеку замеры. Здесь клиент подтверждает свой номер
 * звонком — и дальше входит по нему с любого устройства.
 *
 * Блока нет, пока сервер не умеет входить по телефону (нет ключа SMS.ru).
 */
export default function PhoneSetting() {
  const [state, setState] = useState(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  const load = () => apiPrimary('account.phone.get', {}).then(setState).catch(() => setState(null));
  useEffect(() => { load(); }, []);

  if (!state || !state.options || !state.options.call) return null;

  const remove = async () => {
    setBusy(true);
    setNote(null);
    try {
      await apiPrimary('account.phone.remove', {});
      setNote({ tone: 'good', text: 'Вход по номеру отключён.' });
      load();
    } catch (error) {
      setNote({ tone: 'critical', text: error.message || 'Не получилось.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel pad className="phone-setting">
      <div className="survey__legend">
        Вход по телефону
        <span className="survey__legend-note">
          {state.phone ? 'входите по этому номеру с любого устройства' : 'подтвердите номер звонком — и входите по нему'}
        </span>
      </div>

      {state.phone && !adding && (
        <div className="phone-setting__row">
          <span className="phone-setting__number">{state.phone}</span>
          <button className="button button--ghost button--small" onClick={() => { setAdding(true); setNote(null); }} disabled={busy}>Сменить</button>
          <button className="button button--ghost button--small" onClick={remove} disabled={busy}>Отключить</button>
        </div>
      )}

      {(!state.phone || adding) && (
        <PhoneLogin
          mode="attach"
          options={state.options}
          onAttached={(phone) => { setAdding(false); setNote({ tone: 'good', text: 'Номер ' + phone + ' подключён.' }); load(); }}
        />
      )}

      {note && <Note tone={note.tone} icon={note.tone === 'good' ? IconCheck : IconAlert}>{note.text}</Note>}
    </Panel>
  );
}
