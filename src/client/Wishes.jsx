import React, { useState } from 'react';
import { useData } from '../useData.js';
import { apiMutate } from '../api.js';
import { Section, Panel, Note, formatDate } from '../ui.jsx';
import { IconAlert, IconCheck, IconTrash } from '../icons.jsx';

/**
 * Пожелание к программе своими словами (08.10.2026, FT-498).
 *
 * Клиент — внизу «Тренировок»: пишет тренеру обычным текстом, видит, что
 * тренер прочитал и учёл, и его ответ. Тренер — вверху программы клиента:
 * новое пожелание должно попасться на глаза раньше, чем он начнёт править
 * программу, ради которой его и написали. Сервер — server/src/lib/wishes.js.
 *
 * В тексте бывает о здоровье — это сказано прямо под полем: человек должен
 * знать, кто это увидит, до того как напишет.
 */

const MAX = 1000;
const STATUS = { new: 'Отправлено', read: 'Тренер прочитал', done: 'Учтено' };

function ClientWishes() {
  const { data, reload } = useData('wish.list', {}, []);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [sent, setSent] = useState(false);

  const send = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem('');
    try {
      await apiMutate('wish.create', { text });
      setText('');
      setSent(true);
      reload();
    } catch (error) {
      setProblem(error.message || 'Не получилось отправить.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    try { await apiMutate('wish.delete', { id }); reload(); } catch (error) { setProblem(error.message || 'Не получилось удалить.'); }
  };

  const wishes = (data && data.wishes) || [];
  return (
    <Section title="Пожелание тренеру" note="своими словами — тренер поправит программу">
      <Panel pad className="wishes">
        <form className="wishes__form" onSubmit={send}>
          <textarea
            className="field__input wishes__input"
            aria-label="Пожелание к программе"
            placeholder="Например: «больше на ягодицы», «колено болит при выпадах — заменить», «тренировки короче, до часа»"
            rows={3}
            maxLength={MAX}
            value={text}
            onChange={(e) => { setText(e.target.value); setSent(false); }}
            disabled={busy}
          />
          <p className="small muted">
            Видите только вы и тренер. Можно написать о самочувствии и ограничениях — это сведения о
            здоровье, они хранятся у нас на сервере в России, удалить пожелание можно в любой момент.
          </p>
          {problem && <Note tone="critical" icon={IconAlert}>{problem}</Note>}
          {sent && !problem && <Note tone="good" icon={IconCheck}>Отправлено — тренер увидит его в вашей программе.</Note>}
          <button className="button button--primary" disabled={busy || text.trim().length < 3}>
            {busy ? 'Отправляю…' : 'Отправить тренеру'}
          </button>
        </form>

        {wishes.length > 0 && (
          <ul className="wishes__list">
            {wishes.map((w) => (
              <li key={w.id} className={'wish wish--' + w.status}>
                <div className="wish__head">
                  <span className="wish__status">{STATUS[w.status] || ''}</span>
                  <span className="wish__date">{formatDate(w.createdAt, false)}</span>
                  <button className="icon-button wish__delete" aria-label="Удалить пожелание" onClick={() => remove(w.id)}>
                    <IconTrash size={16} />
                  </button>
                </div>
                <p className="wish__text">{w.text}</p>
                {w.reply && <p className="wish__reply"><b>Тренер:</b> {w.reply}</p>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </Section>
  );
}

function TrainerWish({ wish, clientRow }) {
  const [reply, setReply] = useState(wish.reply || '');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  const answer = async (fields) => {
    setBusy(true);
    setProblem('');
    try {
      await apiMutate('wish.answer', { clientRow, id: wish.id, ...fields });
      setOpen(false);
    } catch (error) {
      setProblem(error.message || 'Не получилось.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={'wish wish--' + wish.status}>
      <div className="wish__head">
        <span className="wish__status">{wish.who ? wish.who + ' · ' : ''}{wish.status === 'done' ? 'Учтено' : 'Ждёт'}</span>
        <span className="wish__date">{formatDate(wish.createdAt, false)}</span>
      </div>
      <p className="wish__text">{wish.text}</p>
      {wish.reply && !open && <p className="wish__reply"><b>Ваш ответ:</b> {wish.reply}</p>}
      {open && (
        <textarea
          className="field__input wishes__input"
          aria-label="Ответ клиенту"
          rows={2}
          maxLength={500}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          disabled={busy}
          autoFocus
        />
      )}
      {problem && <Note tone="critical" icon={IconAlert}>{problem}</Note>}
      <div className="wish__actions">
        {open ? (
          <>
            <button className="button button--primary button--small" disabled={busy} onClick={() => answer({ reply, done: true })}>Ответить и учесть</button>
            <button className="button button--small" disabled={busy} onClick={() => answer({ reply })}>Только ответить</button>
          </>
        ) : (
          <>
            {wish.status !== 'done'
              ? <button className="button button--primary button--small" disabled={busy} onClick={() => answer({ done: true })}>Учтено</button>
              : <button className="button button--small" disabled={busy} onClick={() => answer({ done: false })}>Вернуть в работу</button>}
            <button className="button button--ghost button--small" disabled={busy} onClick={() => setOpen(true)}>{wish.reply ? 'Изменить ответ' : 'Ответить'}</button>
          </>
        )}
      </div>
    </li>
  );
}

function TrainerWishes({ clientRow }) {
  const { data } = useData('wish.list', { clientRow }, [clientRow]);
  const wishes = (data && data.wishes) || [];
  if (!wishes.length) return null;
  const waiting = wishes.filter((w) => w.status !== 'done').length;
  return (
    <Section title="Пожелания клиента" note={waiting ? 'ждут: ' + waiting : 'все учтены'}>
      <Panel pad className="wishes">
        <ul className="wishes__list">
          {wishes.map((w) => <TrainerWish key={w.id} wish={w} clientRow={clientRow} />)}
        </ul>
      </Panel>
    </Section>
  );
}

// trainer — тренер в карточке клиента; иначе — сам клиент
export default function Wishes({ clientRow = 0, trainer = false }) {
  return trainer ? <TrainerWishes clientRow={clientRow} /> : <ClientWishes />;
}
