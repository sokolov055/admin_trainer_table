import React, { useState } from 'react';
import { apiMutate } from '../api.js';
import { useData } from '../useData.js';
import {
  Lead, Section, Panel, Loading, ErrorState, Empty, Badge,
  formatMoney, formatNumber, formatDate, plural,
} from '../ui.jsx';
import { IconMoney, IconCheck, IconClose, IconAlert } from '../icons.jsx';

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
      <Lead
        label="Баланс клиента"
        value={formatMoney(client.balance)}
        tone={client.balance < 0 ? 'critical' : client.balance > 0 ? 'good' : undefined}
        hint={
          client.price > 0 && client.balance > 0
            ? `≈ ${Math.floor(client.balance / client.price)} ${plural(Math.floor(client.balance / client.price), 'тренировка', 'тренировки', 'тренировок')} вперёд`
            : client.balance < 0 ? 'клиент должен' : 'оплат нет'
        }
        facts={[
          { label: 'Цена за тренировку', value: formatMoney(client.price) },
          { label: 'В пакете', value: formatNumber(client.count) },
        ]}
      />

      {/* ---------- проведение оплаты ---------- */}
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
            Отменить платёж на {formatMoney(payment.amount)}? Касса и баланс
            клиента вернутся к прежним значениям.
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
