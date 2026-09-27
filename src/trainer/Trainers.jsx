import React, { useState } from 'react';

import { apiMutate } from '../api.js';
import { useData } from '../useData.js';
import { Empty, ErrorState, Loading, Panel, Section } from '../ui.jsx';
import { IconKey } from '../icons.jsx';
import { haptic } from '../telegram.js';

/**
 * Тренеры сервиса — экран владельца.
 *
 * Тренер подаёт заявку сам (почта, код, имя, согласие — LoginScreen.jsx),
 * кабинет открывается после «Одобрить». Решение действует сразу:
 * отключённый теряет кабинет на следующем запросе, его клиенты остаются в
 * базе и никому не видны. Владельца (адрес из окружения сервера) здесь не
 * отключить — сервер откажет, поэтому и кнопок у него нет.
 */

const STATUS = {
  pending: 'Ждёт решения',
  active: 'Работает',
  blocked: 'Отключён',
  rejected: 'Отказано',
};

/** Какие решения доступны в каждом статусе и как они подписаны */
const ACTIONS = {
  pending: [['approve', 'Одобрить', true], ['reject', 'Отклонить', false]],
  active: [['block', 'Отключить', false]],
  blocked: [['unblock', 'Вернуть доступ', true]],
  rejected: [['approve', 'Всё-таки одобрить', false]],
};

/** Отключение — с подтверждением: тренер тут же теряет кабинет */
const CONFIRM = new Set(['block', 'reject']);

export default function Trainers() {
  const { data, loading, error, reload } = useData('owner.trainers', {}, []);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [problem, setProblem] = useState(null);

  if (loading) return <Loading lead={false} rows={3} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const trainers = data.trainers || [];
  const pending = trainers.filter((t) => t.status === 'pending');
  const others = trainers.filter((t) => t.status !== 'pending');

  const decide = async (trainer, decision) => {
    const key = trainer.id + ':' + decision;
    if (CONFIRM.has(decision) && confirm !== key) { setConfirm(key); haptic(); return; }
    setBusy(true);
    setProblem(null);
    try {
      await apiMutate('owner.trainer.decide', { id: trainer.id, decision });
      haptic('success');
      setConfirm('');
      reload();
    } catch (err) {
      setProblem(err);
    } finally {
      setBusy(false);
    }
  };

  const row = (trainer) => (
    <Panel pad className="trainer-row" key={trainer.id}>
      <div className="trainer-row__copy">
        <strong>{trainer.name || trainer.email}</strong>
        <span>{trainer.email}</span>
        <span>
          {trainer.owner ? 'Владелец сервиса' : STATUS[trainer.status] || trainer.status}
          {trainer.clients ? ` · клиентов: ${trainer.clients}` : ''}
          {trainer.status === 'pending' && trainer.appliedAt
            ? ` · заявка ${new Date(trainer.appliedAt).toLocaleDateString('ru-RU')}` : ''}
        </span>
      </div>
      {!trainer.owner && (ACTIONS[trainer.status] || []).length > 0 && (
        <div className="trainer-row__actions">
          {ACTIONS[trainer.status].map(([decision, label, primary]) => {
            const asking = confirm === trainer.id + ':' + decision;
            return (
              <button
                key={decision}
                type="button"
                className={'button' + (primary ? ' button--primary' : '') + (asking ? ' button--critical' : '')}
                disabled={busy}
                onClick={() => decide(trainer, decision)}
              >
                {asking ? 'Точно ' + label.toLowerCase() + '?' : label}
              </button>
            );
          })}
        </div>
      )}
    </Panel>
  );

  return (
    <>
      {problem && <ErrorState error={problem} onRetry={() => setProblem(null)} />}

      <Section title="Заявки" note="Кабинет откроется, когда вы одобрите — тренеру придёт письмо">
        {pending.length === 0
          ? <Empty icon={IconKey} title="Новых заявок нет" text="Тренер подаёт заявку сам: «Вход для тренера» на экране входа." />
          : <div className="trainer-list">{pending.map(row)}</div>}
      </Section>

      {others.length > 0 && (
        <Section title="Все тренеры" note="Каждый видит только своих клиентов">
          <div className="trainer-list">{others.map(row)}</div>
        </Section>
      )}
    </>
  );
}
