import React, { useState } from 'react';
import { useData } from '../useData.js';
import { apiMutate } from '../api.js';
import {
  Lead, Section, Panel, Loading, ErrorState, Empty, Field, Note, Chips,
  formatMoney, formatDate, plural,
} from '../ui.jsx';
import { haptic } from '../telegram.js';
import { IconMoney, IconTrash, IconAlert, IconCheck } from '../icons.jsx';
import { monthLabel, thisMonth } from './Metrics.jsx';

/**
 * Расходы.
 *
 * Заведены ради одной цифры — прибыли. Выручку приложение считало само, а
 * вычитать было нечего: расходов не было ни в базе, ни в таблице, и в
 * месячных архивах прибыль проставлялась руками.
 *
 * Экран устроен как быстрая запись, а не как бухгалтерия: трату вписывают
 * стоя у кассы, поэтому форма открыта сразу, дата подставлена сегодняшняя,
 * а статья выбирается из того, что уже вводили. Справочника статей нет
 * намеренно: их пять-шесть, и список, который надо заводить и
 * поддерживать, стоил бы дороже пользы.
 */

export function Expenses() {
  const [month, setMonth] = useState(thisMonth);
  const [revision, setRevision] = useState(0);
  const { loading, data, error, reload } = useData('expense.list', { month }, [month, revision]);

  if (loading) return <Loading rows={3} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const again = () => setRevision((value) => value + 1);
  const list = data.expenses || [];

  return (
    <>
      <Lead
        label={'Расходы · ' + monthLabel(data.month)}
        value={formatMoney(data.total)}
        hint={
          list.length
            ? list.length + ' ' + plural(list.length, 'запись', 'записи', 'записей')
            : 'в этом месяце ничего не вписано'
        }
      />

      <AddExpense month={data.month} categories={data.categories || []} onAdded={again} />

      <Section title="Что потрачено" note={monthLabel(data.month).toLowerCase()}>
        {list.length === 0 ? (
          <Empty
            icon={IconMoney}
            title="Расходов нет"
            text="Впишите аренду, рекламу, оборудование — всё, что уменьшает прибыль."
          />
        ) : (
          <Panel>
            <div className="rows">
              {list.map((item) => (
                <ExpenseRow key={item.id} item={item} onDeleted={again} />
              ))}
            </div>
          </Panel>
        )}
      </Section>

      <MonthSwitch month={data.month} onChange={setMonth} />
    </>
  );
}

/* ==================================================================
 * Запись
 * ================================================================== */

/**
 * Форма новой траты.
 *
 * Поля ровно три: статья, сумма, дата. Заметка спрятана, пока не нужна, —
 * она пригождается редко, а видимое поле просят заполнить.
 *
 * Дата по умолчанию сегодняшняя и остаётся такой после сохранения:
 * несколько трат подряд вписывают одним днём.
 */
function AddExpense({ month, categories, onAdded }) {
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [spentAt, setSpentAt] = useState(today);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const [saved, setSaved] = useState(false);

  const save = () => {
    setBusy(true);
    setFailure(null);
    setSaved(false);

    apiMutate('expense.create', { category, amount, spentAt, note })
      .then(() => {
        // Статью оставляем: вторая трата чаще всего по той же статье
        // («зал», «зал», «зал»), а сумма у неё своя.
        setAmount('');
        setNote('');
        setSaved(true);
        haptic();
        onAdded();
      })
      .catch(setFailure)
      .finally(() => setBusy(false));
  };

  const ready = category.trim() && String(amount).trim();

  return (
    <Section title="Вписать расход">
      <Panel pad>
        <div className="expense-form">
          <Field
            label="Статья"
            placeholder="Аренда зала"
            // Поле по умолчанию цифровое (Field), а статья — слова
            inputMode="text"
            value={category}
            onChange={(value) => { setCategory(value); setSaved(false); }}
            disabled={busy}
            list="expense-categories"
          />

          {/* Подсказки браузера, а не свой список: так они работают и
              клавиатурой, и на телефоне, и ничего не занимают на экране */}
          <datalist id="expense-categories">
            {categories.map((name) => <option key={name} value={name} />)}
          </datalist>

          <Field
            label="Сумма, ₽"
            placeholder="12 000"
            inputMode="decimal"
            value={amount}
            onChange={(value) => { setAmount(value); setSaved(false); }}
            disabled={busy}
          />

          <Field
            label="Когда"
            type="date"
            value={spentAt}
            onChange={setSpentAt}
            disabled={busy}
          />

          <Field
            label="Заметка"
            placeholder="не обязательно"
            inputMode="text"
            value={note}
            onChange={setNote}
            disabled={busy}
          />
        </div>

        {failure && <Note tone="critical" icon={IconAlert}>{failure.message || 'Не получилось сохранить'}</Note>}
        {saved && !failure && <Note tone="good" icon={IconCheck}>Записано.</Note>}

        {spentAt.slice(0, 7) !== month && (
          <Note tone="info">
            Дата не из открытого месяца — расход попадёт в {monthLabel(spentAt.slice(0, 7))}.
          </Note>
        )}

        <div className="survey__actions">
          <button className="button button--primary" onClick={save} disabled={busy || !ready}>
            {busy ? 'Сохраняю…' : 'Записать'}
          </button>
        </div>
      </Panel>
    </Section>
  );
}

function ExpenseRow({ item, onDeleted }) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const [asking, setAsking] = useState(false);

  const remove = () => {
    setBusy(true);
    setFailure(null);

    apiMutate('expense.delete', { id: item.id })
      .then(() => { haptic(); onDeleted(); })
      .catch((error) => { setFailure(error); setBusy(false); setAsking(false); });
  };

  return (
    <div className="rows__item expense">
      <span className="expense__body">
        <span className="expense__category">{item.category}</span>
        <span className="expense__meta small muted">
          {formatDate(item.spent_at, false)}
          {item.note ? ' · ' + item.note : ''}
        </span>
        {failure && <span className="small danger">{failure.message || 'Не удалось удалить'}</span>}
      </span>

      <span className="expense__right">
        <span className="expense__amount">{formatMoney(item.amount)}</span>

        {/* Спрашиваем на месте, а не окном браузера: диалог браузера в
            приложении, добавленном на домашний экран, выглядит чужим, а
            в отдельных случаях и вовсе подвешивает страницу. */}
        {asking ? (
          <span className="expense__confirm">
            <button className="button button--small danger" onClick={remove} disabled={busy}>
              {busy ? '…' : 'Удалить'}
            </button>
            <button className="button button--small button--ghost" onClick={() => setAsking(false)} disabled={busy}>
              Отмена
            </button>
          </span>
        ) : (
          <button
            className="icon-button"
            onClick={() => { setAsking(true); haptic(); }}
            aria-label={'Удалить расход «' + item.category + '»'}
          >
            <IconTrash size={17} />
          </button>
        )}
      </span>
    </div>
  );
}

/* ==================================================================
 * Мелочи
 * ================================================================== */

/**
 * Прошлые месяцы.
 *
 * Внизу, а не в шапке: расходы почти всегда вписывают за текущий месяц, а
 * листают назад редко — когда сверяют прибыль.
 */
function MonthSwitch({ month, onChange }) {
  const limit = thisMonth();
  const months = [];

  for (let step = 0; step < 6; step += 1) {
    const [year, m] = limit.split('-').map(Number);
    const date = new Date(Date.UTC(year, m - 1 - step, 1));
    months.push(date.getUTCFullYear() + '-' + String(date.getUTCMonth() + 1).padStart(2, '0'));
  }

  return (
    <Section title="Другой месяц">
      <Chips
        items={months.map((value) => ({ value, label: monthLabel(value) }))}
        value={month}
        onChange={(value) => { onChange(value); haptic(); }}
      />
    </Section>
  );
}

function today() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
