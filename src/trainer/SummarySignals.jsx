import React from 'react';
import { Empty, Panel, Rows, Sheet, Tag, formatDate, formatMoney, plural } from '../ui.jsx';
import { IconCheck, IconChevron } from '../icons.jsx';

const dayWord = (n) => n + ' ' + plural(n, 'день', 'дня', 'дней');

/**
 * Список людей, по которому можно нажать: имя и в чём дело. Пара сплита —
 * одной строкой с меткой: занятия, деньги и программа у неё общие.
 */
function People({ list, note, onOpen, at }) {
  if (!list.length) {
    return (
      <Panel>
        <Empty icon={IconCheck} title="Всё в порядке" text="Сейчас в этой группе никого нет." />
      </Panel>
    );
  }

  return (
    <Panel>
      <Rows>
        {list.map((c) => (
          <button type="button" key={c.row} className="rows__item rows__item--pick person" onClick={() => onOpen({ row: c.row, name: c.name }, at)}>
            <span className="rows__label person__name">{c.name}{c.split && <Tag>сплит</Tag>}</span>
            <span className="rows__value person__note">{note(c)}<IconChevron size={16} className="side__chevron" /></span>
          </button>
        ))}
      </Rows>
    </Panel>
  );
}

export const SIGNALS = [
  {
    id: 'packages', at: 'payments',
    label: 'Пакет и долг', sheetTitle: (n) => 'Пакет и долг · ' + n,
    note: 'осталось одно занятие или уже долг',
    // Деньги у плательщика (семья, пара) — так и пишем: звонить ему
    line: (c) => (c.payer ? 'платит ' + c.payer + ' · ' : '')
      + (c.balance < 0 ? 'долг ' + formatMoney(-c.balance) : c.left <= 0 ? 'занятий не осталось' : 'осталось 1 занятие'),
  },
  {
    id: 'silent', at: 'overview',
    label: 'Не приходят', sheetTitle: (n) => 'Не приходят · ' + n,
    note: 'месяц без занятий — пора позвонить',
    line: (c) => (c.days === null ? 'занятий не было' : dayWord(c.days) + ' без занятий') + (c.nextAt ? ' · записан на ' + formatDate(c.nextAt, false) : ''),
  },
  {
    id: 'measureDue', at: 'progress',
    label: 'Пора замер', sheetTitle: (n) => 'Пора снять замер · ' + n,
    note: 'ходят, а замера не было четыре недели',
    line: (c) => (c.days === null ? 'замера ещё не было' : 'замер ' + dayWord(c.days) + ' назад'),
  },
  {
    id: 'noPlan', at: 'plan',
    label: 'Без программы', sheetTitle: (n) => 'Без программы · ' + n,
    note: 'ходят, а программы нет ни на один месяц',
    line: () => 'программы нет',
  },
];

export function SummarySignalSheet({ id, signals, onOpenClient, onClose }) {
  const signal = SIGNALS.find((item) => item.id === id);
  const list = signals?.[id] || [];
  return (
    <Sheet title={signal.sheetTitle(list.length)} onClose={onClose}>
      <p className="small muted overview-signal-sheet__note">{signal.note}</p>
      <People list={list} note={signal.line} at={signal.at}
        onOpen={(client, at) => { onClose(); onOpenClient(client, at); }} />
    </Sheet>
  );
}
