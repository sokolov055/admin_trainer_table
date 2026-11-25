import React, { useMemo, useState } from 'react';
import { useData } from '../useData.js';
import { apiMutate } from '../api.js';
import { haptic } from '../telegram.js';
import { BackButton, Loading, ErrorState, Search, Segmented } from '../ui.jsx';
import { monthName } from '../library.js';
import { dateKey } from '../program-timeline.js';
import { useSelfCard } from './selfCard.js';
import { initials, avatarTone } from './program-list-model.js';
import { clientsView, clientStatus } from './program-assign-model.js';
import { weekDays } from './workout-assign-model.js';
import './programs-lib.css';

/**
 * «Назначить клиенту» тренировку в «Библиотеке» (этап 4 «Тренировок»,
 * 25.11.2026). Кому — тот же список, что у программ (статус и фильтры).
 * Как — «Внеплановая на этой неделе» (встанет в выбранный день, не входит в
 * круг программы) или «В программу месяца» (дописать в конец месяца, как
 * было). Что уходит серверу — plan.fromTemplate, mode «append».
 */
export default function WorkoutAssign({ template, owner, backText, onBack }) {
  const clients = useData('trainer.clients', {}, []);
  const self = useSelfCard(owner);
  const [client, setClient] = useState(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [how, setHow] = useState('week');
  const [day, setDay] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [done, setDone] = useState(null);

  const today = dateKey();
  const month = monthName();
  const days = useMemo(() => weekDays(today), [today]);

  const list = useMemo(() => [
    ...(self.card ? [{ row: self.card.clientRow, name: 'Мои тренировки', self: true }] : []),
    ...((clients.data && clients.data.clients) || []),
  ], [clients.data, self.card]);
  const view = clientsView(list, { templateId: template.id, filter, q, today });

  const chip = (value, label, count) => (
    <button type="button" role="radio" aria-checked={filter === value} className={'chip' + (filter === value ? ' chip--active' : '')}
      onClick={() => { haptic(); setFilter(value); }}>
      {label}{count !== undefined && <i className="plib-count">{count}</i>}
    </button>
  );

  const assign = async () => {
    if (busy || !client) return;
    setBusy(true);
    setFailure('');
    try {
      await apiMutate('plan.fromTemplate', {
        clientRow: client.row, month, templateId: template.id, mode: 'append',
        ...(how === 'week' ? { once: { day } } : {}),
      });
      haptic('success');
      setDone({ client, where: how === 'week' ? days[day - 1].label + ', ' + days[day - 1].date : month });
    } catch (err) {
      setFailure((err && err.message) || 'Не получилось назначить. Повторите.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <>
        <BackButton label={backText} onClick={onBack} />
        <h2 className="plib-h">Назначено</h2>
        <p className="small">«{template.title}» — {done.client.self ? 'в ваших тренировках' : done.client.name}, {done.where}. Поправить можно в карточке клиента.</p>
      </>
    );
  }

  if (!client) {
    return (
      <>
        <BackButton label={backText} onClick={onBack} />
        <h2 className="plib-h">Кому назначить</h2>
        <p className="small muted">«{template.title}»</p>
        <Search value={q} onChange={setQ} placeholder="Поиск клиента" />
        <div className="chips plib-asf" role="radiogroup" aria-label="Кого показать">
          {chip('all', 'Все')}
          {chip('free', 'Свободны', view.counts.free)}
          {chip('end', 'Скоро конец', view.counts.end)}
        </div>
        {clients.loading && <Loading lead={false} rows={4} />}
        {clients.error && <ErrorState error={clients.error} onRetry={clients.reload} />}
        {clients.data && !view.rows.length && <p className="plib-empty">{q ? 'Никого не нашли' : 'Никого нет в этом фильтре'}</p>}
        <div className="plib-cls">
          {view.rows.map((c, i) => (
            <button key={c.row} type="button" className="plib-cl" style={{ animationDelay: Math.min(i, 10) * 40 + 'ms' }}
              onClick={() => { haptic(); setClient(c); setDay(0); setFailure(''); }}>
              <span className={'plib-cl__ava plib-ava--' + avatarTone(c.name)} aria-hidden="true">{c.self ? 'Я' : initials(c.name)}</span>
              <span className="plib-grow"><b>{c.name}</b><small>{c.status.line}</small></span>
              {c.status.tag && <span className={'plib-tag plib-tag--' + c.status.kind}>{c.status.tag}</span>}
            </button>
          ))}
        </div>
      </>
    );
  }

  const status = clientStatus(client, template.id, today);
  const picked = how === 'month' || day > 0;
  return (
    <>
      <BackButton label="Клиенты" onClick={() => { setClient(null); setFailure(''); }} />
      <h2 className="plib-h">Назначить «{template.title}»</h2>
      <div className="plib-cl plib-cl--static">
        <span className={'plib-cl__ava plib-ava--' + avatarTone(client.name)} aria-hidden="true">{client.self ? 'Я' : initials(client.name)}</span>
        <span className="plib-grow"><b>{client.name}</b><small>{status.line}</small></span>
      </div>
      <Segmented
        label="Как добавить"
        value={how}
        onChange={(v) => { setHow(v); setFailure(''); }}
        disabled={busy}
        items={[{ value: 'week', label: 'На этой неделе' }, { value: 'month', label: 'В программу месяца' }]}
      />
      {how === 'week' && (
        <>
          <p className="small muted">Встанет в выбранный день и не войдёт в круг программы — как «Добавить из библиотеки».</p>
          <div className="plib-days" role="radiogroup" aria-label="День недели">
            {days.map((d) => (
              <button key={d.day} type="button" role="radio" aria-checked={day === d.day} disabled={d.past || busy}
                className={'chip' + (day === d.day ? ' chip--active' : '')} onClick={() => { haptic(); setDay(d.day); }}>
                {d.label} {d.date}
              </button>
            ))}
          </div>
        </>
      )}
      {how === 'month' && <p className="small muted">Дописать в конец месяца «{month}», как было.</p>}
      {failure && <p className="small form__error" role="alert">{failure}</p>}
      <button type="button" className="button button--primary button--block" disabled={busy || !picked} onClick={assign}>
        {busy ? 'Назначаю…' : how === 'month' ? 'Дописать в программу месяца' : day ? `Назначить на ${days[day - 1].label}` : 'Выберите день'}
      </button>
    </>
  );
}
