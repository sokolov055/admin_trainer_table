import React, { useState } from 'react';
import { apiMutate } from '../api.js';
import { useData } from '../useData.js';
import {
  Lead, Section, Panel, Loading, ErrorState, Empty, Badge,
  formatMoney, formatNumber, formatDate, plural,
} from '../ui.jsx';
import { IconMoney, IconCheck, IconClose, IconAlert } from '../icons.jsx';
import { onlineDaysLeft, onlineDay, addOnlineMonths } from '../online.js';

/**
 * Оплаты в карточке клиента.
 *
 * Единственный экран, который что-то МЕНЯЕТ, — отсюда весь его характер:
 *
 * — сумма показывается крупно до нажатия, чтобы ошибку заметили заранее,
 *   а не в кассе за месяц;
 * — кнопка блокируется на время операции: Apps Script отвечает секунды,
 *   и без этого второе нажатие провело бы второй платёж;
 * — отмена спрашивает подтверждение прямо в строке платежа. Не окном:
 *   окно закрывают не глядя, а здесь видно, какой именно платёж уходит;
 * — после операции данные перечитываются с сервера, а не правятся на
 *   месте. Показать то, что мы думаем, вместо того, что записалось, —
 *   способ однажды не заметить расхождения.
 */
/**
 * Баланс и цена — здесь, а не над всеми разделами карточки (FT-613).
 * Сюда переехали и особые случаи из прежней шапки: у участника сплита
 * деньги общие у пары и своя цена — за занятие без пары; за клиента может
 * платить другой человек; онлайн-ведение оплачивается месяцем.
 */
function BalanceLead({ client }) {
  if (client.splitOf) {
    const money = client.splitBalance;
    const left = client.splitTrainingsLeft;
    return (
      <Lead
        label="Баланс пары"
        value={formatMoney(money)}
        tone={money < 0 ? 'critical' : money > 0 ? 'good' : undefined}
        hint={'платит ' + client.splitPayerName + (left !== null && left !== undefined ? ' · осталось ' + left + ' ' + plural(left, 'тренировка', 'тренировки', 'тренировок') : '')}
        facts={[
          { label: 'Цена одному', value: formatMoney(client.price) },
          { label: 'В пакете', value: formatNumber(client.count) },
        ]}
      />
    );
  }

  if (client.online) return <OnlineLead client={client} />;

  const per = 'за тренировку';
  let hint;
  if (client.payer) hint = 'платит ' + client.payer;
  else if (client.price > 0 && client.balance > 0) {
    const ahead = Math.floor(client.balance / client.price);
    hint = `≈ ${ahead} ${plural(ahead, 'тренировка', 'тренировки', 'тренировок')} вперёд`;
  } else hint = client.balance < 0 ? 'клиент должен' : 'оплат нет';

  return (
    <Lead
      label="Баланс клиента"
      value={formatMoney(client.balance)}
      tone={client.balance < 0 ? 'critical' : client.balance > 0 ? 'good' : undefined}
      hint={hint}
      facts={[
        { label: 'Цена ' + per, value: formatMoney(client.price) },
        { label: 'В пакете', value: formatNumber(client.count) },
      ]}
    />
  );
}

export function Payments({ client }) {
  const [price, setPrice] = useState(String(client.price || ''));
  const [count, setCount] = useState(String(client.count || ''));

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  const history = useData('payment.list', { clientRow: client.row }, [client.row]);

  const amount = Math.round((parseFloat(price) || 0) * (parseInt(count, 10) || 0));
  const canPay = amount > 0 && !busy;

  const pay = async () => {
    setBusy(true);
    setError(null);
    setDone(null);

    try {
      const res = await apiMutate('payment.create', {
        clientRow: client.row,
        price: parseFloat(price),
        count: parseInt(count, 10),
      });

      setDone({ kind: 'paid', amount: res.amount, id: res.paymentId });
      history.reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (paymentId) => {
    setBusy(true);
    setError(null);
    setDone(null);

    try {
      const res = await apiMutate('payment.cancel', { paymentId });
      setDone({ kind: 'cancelled', amount: res.amount, id: paymentId });
      history.reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <BalanceLead client={client} />

      {client.online && (
        <OnlinePay
          client={client}
          busy={busy}
          onStart={() => { setBusy(true); setError(null); setDone(null); }}
          onEnd={(res, err) => {
            setBusy(false);
            if (err) setError(err);
            if (res) { setDone({ kind: 'paid', amount: res.amount, id: res.paymentId, until: res.until }); history.reload(); }
          }}
        />
      )}

      {/* ---------- проведение оплаты ---------- */}
      {!client.online && (
      <Section title="Провести оплату" note="цена и количество подставлены из карточки">
        <Panel pad>
          <div className="pay-inputs">
            <label className="pay-field">
              <span className="pay-field__label">Цена за тренировку</span>
              <input
                className="pay-field__input"
                type="number"
                inputMode="numeric"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                disabled={busy}
              />
            </label>

            <span className="pay-times">×</span>

            <label className="pay-field pay-field--narrow">
              <span className="pay-field__label">Тренировок</span>
              <input
                className="pay-field__input"
                type="number"
                inputMode="numeric"
                value={count}
                onChange={(e) => setCount(e.target.value)}
                disabled={busy}
              />
            </label>
          </div>

          {/* Сумма крупно и до нажатия: ошибку в цене замечают здесь,
              а не через месяц при сверке кассы */}
          <div className="pay-total">
            <span className="pay-total__label">К оплате</span>
            <span className="pay-total__value">{amount > 0 ? formatMoney(amount) : '—'}</span>
          </div>

          <button
            className="button button--primary button--block"
            onClick={pay}
            disabled={!canPay}
          >
            {busy ? 'Проводим…' : 'Провести оплату'}
          </button>

          <p className="small muted" style={{ marginTop: 10, marginBottom: 0 }}>
            Изменится касса месяца, баланс клиента и журнал платежей — как при
            галочке «Оплата» в таблице.
          </p>
        </Panel>
      </Section>
      )}

      {/* ---------- результат ---------- */}
      {done && (
        <Section>
          <Panel pad>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--good-text)', display: 'flex', flexShrink: 0, marginTop: 1 }}>
                <IconCheck size={18} />
              </span>
              <div className="small">
                {done.kind === 'paid'
                  ? `Оплата ${formatMoney(done.amount)} проведена, платёж №${done.id}.`
                    + (done.until ? ` Ведение оплачено по ${onlineDay(done.until)}.` : '')
                  : `Платёж №${done.id} отменён, ${formatMoney(done.amount)} возвращены.`}
              </div>
            </div>
          </Panel>
        </Section>
      )}

      {error && (
        <Section>
          <Panel pad>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--critical-text)', display: 'flex', flexShrink: 0, marginTop: 1 }}>
                <IconAlert size={18} />
              </span>
              <div className="small">{error.message}</div>
            </div>
          </Panel>
        </Section>
      )}

      {/* ---------- история ---------- */}
      <Section title="История платежей">
        {history.loading && <Loading lead={false} rows={3} />}
        {history.error && <ErrorState error={history.error} onRetry={history.reload} />}

        {history.data && history.data.payments.length === 0 && (
          <Empty icon={IconMoney} title="Платежей пока нет" text="Первая оплата появится здесь." />
        )}

        {history.data && history.data.payments.map((p) => (
          <PaymentRow key={p.id || p.date + p.amount} payment={p} busy={busy} onCancel={cancel} />
        ))}
      </Section>
    </>
  );
}

/**
 * Строка платежа с отменой.
 *
 * Подтверждение раскрывается прямо здесь, а не в окне: окно закрывают не
 * глядя, а тут перед глазами остаётся сумма и дата того платежа, который
 * сейчас исчезнет.
 */
function PaymentRow({ payment, busy, onCancel }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="item item--static">
      <div className="item__top">
        <span className="item__name">{formatMoney(payment.amount)}</span>
        <span className="muted small nowrap">{formatDate(payment.date)}</span>
      </div>

      <div className="item__meta">
        {payment.product && <span>Онлайн-ведение «{payment.product}»</span>}
        {payment.id && <span>№{payment.id}</span>}
        {!payment.cancellable && <Badge>до нумерации</Badge>}
      </div>

      {payment.cancellable && !confirming && (
        <button
          className="button button--ghost"
          style={{ marginTop: 8, marginLeft: -8 }}
          onClick={() => setConfirming(true)}
          disabled={busy}
        >
          <IconClose size={15} />
          Отменить
        </button>
      )}

      {confirming && (
        <div className="pay-confirm">
          <div className="small">
            Отменить платёж на {formatMoney(payment.amount)}? {payment.product
              ? 'Срок ведения вернётся к прежнему, если его с тех пор не продлевали.'
              : 'Касса и баланс клиента вернутся к прежним значениям.'}
          </div>
          <div className="pay-confirm__actions">
            <button
              className="button"
              onClick={() => { setConfirming(false); onCancel(payment.id); }}
              disabled={busy}
            >
              {busy ? 'Отменяем…' : 'Да, отменить'}
            </button>
            <button className="button button--ghost" onClick={() => setConfirming(false)} disabled={busy}>
              Не надо
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==========================================================================
 * Онлайн-ведение (21.10.2026): клиент покупает не тренировки, а ведение на
 * месяц или несколько. Тренер выбирает свой продукт («3 месяца —
 * 15 000 ₽»), сумму можно поправить (скидка), срок продлевается на месяцы
 * продукта. В долг за тренировки оплата не идёт — поэтому вместо баланса
 * главная цифра — по какой день оплачено.
 * ========================================================================== */

function OnlineLead({ client }) {
  const left = onlineDaysLeft(client.onlineUntil);
  return (
    <Lead
      label="Онлайн-ведение"
      value={left === null ? 'Срок не указан' : left < 0 ? 'Срок истёк' : 'по ' + onlineDay(client.onlineUntil)}
      tone={left === null ? undefined : left < 0 ? 'critical' : left <= 3 ? undefined : 'good'}
      hint={left === null
        ? 'Проведите оплату продукта — срок поставится сам'
        : left < 0
          ? 'Закончилось ' + onlineDay(client.onlineUntil) + ' · напомните клиенту'
          : left === 0
            ? 'Сегодня последний оплаченный день'
            : 'Осталось ' + left + ' ' + plural(left, 'день', 'дня', 'дней')}
    />
  );
}

function OnlinePay({ client, busy, onStart, onEnd }) {
  const products = useData('online.products', {}, []);
  const list = (products.data && products.data.products) || [];
  const [picked, setPicked] = useState(null);
  const [amount, setAmount] = useState('');
  const product = list.find((p) => p.id === picked) || list[0] || null;
  const sum = amount !== '' ? Math.round(parseFloat(amount) || 0) : product ? product.price : 0;
  const until = product ? addOnlineMonths(client.onlineUntil, product.months) : null;

  const choose = (p) => { setPicked(p.id); setAmount(''); };

  const pay = async () => {
    if (!product) return;
    onStart();
    try {
      const res = await apiMutate('payment.create', {
        clientRow: client.row,
        productId: product.id,
        ...(sum !== product.price ? { amount: sum } : {}),
      });
      setAmount('');
      onEnd(res, null);
    } catch (err) {
      onEnd(null, err);
    }
  };

  return (
    <>
      <Section title="Продлить ведение" note="продукт продлевает срок на свои месяцы">
        <Panel pad>
          {products.loading && <Loading lead={false} rows={1} />}
          {products.error && <ErrorState error={products.error} onRetry={products.reload} />}
          {products.data && !list.length && (
            <p className="small muted" style={{ margin: 0 }}>
              Продуктов пока нет. Добавьте ниже, например «1 месяц — 6 000 ₽» и
              «3 месяца — 15 000 ₽».
            </p>
          )}
          {product && (
            <>
              <div className="chips chips--wrap" role="radiogroup" aria-label="Продукт">
                {list.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={p.id === product.id}
                    className={'chip' + (p.id === product.id ? ' chip--active' : '')}
                    disabled={busy}
                    onClick={() => choose(p)}
                  >
                    {p.name} · {formatMoney(p.price)}
                  </button>
                ))}
              </div>

              <label className="pay-field">
                <span className="pay-field__label">Сумма</span>
                <input
                  className="pay-field__input"
                  type="number"
                  inputMode="numeric"
                  value={amount !== '' ? amount : String(product.price)}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={busy}
                />
              </label>

              <div className="pay-total">
                <span className="pay-total__label">Оплачено будет по</span>
                <span className="pay-total__value">{onlineDay(until)}</span>
              </div>

              <button
                className="button button--primary button--block"
                onClick={pay}
                disabled={busy || !(sum > 0)}
              >
                {busy ? 'Проводим…' : 'Провести ' + (sum > 0 ? formatMoney(sum) : 'оплату')}
              </button>

              <p className="small muted" style={{ marginTop: 10, marginBottom: 0 }}>
                Оплата попадёт в кассу и журнал платежей, в долг за тренировки не
                идёт. Клиент увидит новый срок в «Обзоре».
              </p>
            </>
          )}
        </Panel>
      </Section>

      <OnlineProducts products={list} reload={products.reload} />
    </>
  );
}

/** Продукты тренера: свои у каждого, общие для всех его онлайн-клиентов */
function OnlineProducts({ products, reload }) {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', months: '1', price: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const months = parseInt(form.months, 10) || 0;

  const start = (p) => {
    setEditing(p ? p.id : 'new');
    setForm(p ? { name: p.name, months: String(p.months), price: String(p.price) } : { name: '', months: '1', price: '' });
    setError(null);
  };

  const run = async (action, params) => {
    setBusy(true);
    setError(null);
    try {
      await apiMutate(action, params);
      setEditing(null);
      reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const save = (e) => {
    e.preventDefault();
    run('online.product.save', {
      ...(editing !== 'new' ? { id: editing } : {}),
      name: form.name.trim(),
      months,
      price: parseFloat(form.price),
    });
  };

  return (
    <Section title="Продукты ведения" note="общие для всех ваших онлайн-клиентов">
      {products.map((p) => (editing === p.id ? null : (
        <div className="item item--static" key={p.id}>
          <div className="item__top">
            <span className="item__name">{p.name}</span>
            <span className="nowrap">{formatMoney(p.price)}</span>
          </div>
          {p.name !== p.months + ' ' + plural(p.months, 'месяц', 'месяца', 'месяцев') && (
            <div className="item__meta">
              <span>{p.months} {plural(p.months, 'месяц', 'месяца', 'месяцев')}</span>
            </div>
          )}
          <div style={{ display: 'flex', gap: 4, marginTop: 6, marginLeft: -8 }}>
            <button className="button button--ghost" disabled={busy} onClick={() => start(p)}>Изменить</button>
            <button className="button button--ghost" disabled={busy} onClick={() => run('online.product.archive', { id: p.id })}>Убрать</button>
          </div>
        </div>
      )))}

      {editing !== null ? (
        <Panel pad>
          <form onSubmit={save}>
            <label className="pay-field">
              <span className="pay-field__label">Название, если нужно</span>
              <input
                className="pay-field__input"
                value={form.name}
                maxLength={60}
                placeholder={(months || 1) + ' ' + plural(months || 1, 'месяц', 'месяца', 'месяцев')}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                disabled={busy}
              />
            </label>
            <div className="pay-inputs" style={{ marginTop: 10 }}>
              <label className="pay-field pay-field--narrow">
                <span className="pay-field__label">Месяцев</span>
                <input
                  className="pay-field__input"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="24"
                  value={form.months}
                  onChange={(e) => setForm({ ...form, months: e.target.value })}
                  disabled={busy}
                />
              </label>
              <label className="pay-field">
                <span className="pay-field__label">Цена, ₽</span>
                <input
                  className="pay-field__input"
                  type="number"
                  inputMode="numeric"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  disabled={busy}
                />
              </label>
            </div>
            {error && <p className="small" style={{ color: 'var(--critical-text)' }}>{error.message}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                className="button button--primary"
                type="submit"
                disabled={busy || !(months >= 1 && months <= 24) || !(parseFloat(form.price) > 0)}
              >
                {busy ? 'Сохраняем…' : 'Сохранить'}
              </button>
              <button className="button button--ghost" type="button" disabled={busy} onClick={() => setEditing(null)}>Не надо</button>
            </div>
          </form>
        </Panel>
      ) : (
        <button className="button button--block" onClick={() => start(null)}>Добавить продукт</button>
      )}
      {editing === null && error && <p className="small" style={{ color: 'var(--critical-text)' }}>{error.message}</p>}
    </Section>
  );
}
