import React, { useState } from 'react';

import { apiMutate } from '../api.js';
import { useData } from '../useData.js';
import { Empty, ErrorState, Loading, Panel, Section, Tag, relativeDays } from '../ui.jsx';
import { IconKey } from '../icons.jsx';
import { haptic } from '../telegram.js';
import { OwnerTrainer, Reports, STAGE, TestEditor } from './OwnerTrainer.jsx';

/**
 * Тренеры сервиса — экран владельца, вкладка панели «Управление» (Admin.jsx).
 *
 * Тренер регистрируется сам (почта, код, имя, согласие — LoginScreen.jsx) и
 * проходит отбор (FT-548): анкета → тест → созвон, каждый этап открывает
 * владелец в карточке кандидата (OwnerTrainer.jsx). Кабинет — только после
 * «Одобрить»; знакомого можно одобрить сразу. Здесь же — профили на
 * проверке перед каталогом и жалобы на профили.
 *
 * Отключённый теряет кабинет на следующем запросе, его клиенты остаются в
 * базе и никому не видны. Владельца (адрес из окружения сервера) здесь не
 * отключить — сервер откажет, поэтому и кнопок у него нет.
 */

const STATUS = {
  active: 'Работает',
  blocked: 'Отключён',
  rejected: 'Отказано',
};

/** Этапы, где ход за владельцем */
const WAITING = new Set(['anketa_sent', 'test_sent', 'call']);

/** Решения прямо из списка — у работающих и отключённых */
const ACTIONS = {
  active: [['block', 'Отключить', false]],
  blocked: [['unblock', 'Вернуть доступ', true]],
  rejected: [['approve', 'Всё-таки одобрить', false]],
};

/** Отключение — с подтверждением: тренер тут же теряет кабинет */
const CONFIRM = new Set(['block']);

export default function Trainers() {
  const { data, loading, error, reload } = useData('owner.trainers', {}, []);
  const reports = useData('owner.reports', {}, []);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [problem, setProblem] = useState(null);
  const [open, setOpen] = useState(null);

  const back = () => { setOpen(null); reload(); reports.reload(); window.scrollTo(0, 0); };
  if (open === 'test') return <TestEditor onBack={back} />;
  if (open) return <OwnerTrainer id={open} onBack={back} />;

  if (loading) return <Loading lead={false} rows={3} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const trainers = data.trainers || [];
  const candidates = trainers.filter((t) => t.status === 'pending');
  const waiting = candidates.filter((t) => WAITING.has(t.stage));
  const filling = candidates.filter((t) => !WAITING.has(t.stage));
  const profiles = trainers.filter((t) => t.status === 'active' && t.profileReview === 'pending');
  // Профиль на проверке — уже в своём разделе выше
  const others = trainers.filter((t) => t.status !== 'pending' && !(t.status === 'active' && t.profileReview === 'pending'));
  const openReports = (reports.data && reports.data.reports) || [];

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
          {trainer.owner ? 'Владелец сервиса' : trainer.status === 'pending' ? STAGE[trainer.stage] || 'Кандидат' : STATUS[trainer.status] || trainer.status}
          {trainer.tierTitle && !trainer.owner ? ` · «${trainer.tierTitle}»` : ''}
          {trainer.activeClients !== undefined
            ? ` · клиентов ${trainer.activeClients}${trainer.clientLimit ? ' из ' + trainer.clientLimit : ''}`
            : trainer.clients ? ` · клиентов: ${trainer.clients}` : ''}
          {trainer.status === 'pending' && trainer.appliedAt
            ? ` · заявка ${new Date(trainer.appliedAt).toLocaleDateString('ru-RU')}` : ''}
        </span>
        {/* Чем занят тренер — по нему решают, продлить ли ступень и не
            пора ли написать: входа давно не было и клиенты не тренируются */}
        {trainer.status === 'active' && trainer.workouts30 !== undefined && (
          <span>
            {trainer.lastSeenAt ? `Последний вход — ${relativeDays(trainer.lastSeenAt)}` : 'Входов ещё не было'}
            {` · за 30 дней тренировок у клиентов ${trainer.workouts30}, занятий ${trainer.sessions30 || 0}`}
          </span>
        )}
        <span className="trainer-row__tags">
          {trainer.overLimit && <Tag tone="warn">клиентов больше, чем позволяет ступень</Tag>}
          {trainer.profileReview === 'pending' && <Tag tone="warn">профиль ждёт проверки</Tag>}
          {trainer.profilePublished && !trainer.profileHidden && <Tag tone="good">в каталоге</Tag>}
          {trainer.profileHidden && <Tag tone="warn">профиль скрыт</Tag>}
          {trainer.openReports > 0 && <Tag tone="warn">жалоб: {trainer.openReports}</Tag>}
        </span>
      </div>
      <div className="trainer-row__actions">
        {!trainer.owner && (ACTIONS[trainer.status] || []).map(([decision, label, primary]) => {
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
        <button
          type="button"
          className={'button' + (trainer.status === 'pending' && WAITING.has(trainer.stage) ? ' button--primary' : '')}
          onClick={() => { setOpen(trainer.id); window.scrollTo(0, 0); }}
        >
          Открыть
        </button>
      </div>
    </Panel>
  );

  return (
    <>
      {problem && <ErrorState error={problem} onRetry={() => setProblem(null)} />}

      {openReports.length > 0 && (
        <Section title="Жалобы на профили" note="Три жалобы от разных людей скрывают профиль сами — до вашего решения">
          <Reports reports={openReports} withTrainer onOpen={(id) => setOpen(id)} onChanged={() => { reports.reload(); reload(); }} />
        </Section>
      )}

      <Section
        title="Ждут вашего решения"
        note="Анкета → тест → созвон: каждый шаг открываете вы. Знакомого можно одобрить сразу"
        action={<button type="button" className="button button--ghost" onClick={() => setOpen('test')}>Тест</button>}
      >
        {waiting.length === 0
          ? <Empty icon={IconKey} title="Никто не ждёт" text="Тренер регистрируется сам — на странице входа для тренеров (адрес …/trainer), — заполняет анкету, и она появится здесь." />
          : <div className="trainer-list">{waiting.map(row)}</div>}
      </Section>

      {profiles.length > 0 && (
        <Section title="Профили на проверке" note="В каталог — только после вашей проверки">
          <div className="trainer-list">{profiles.map(row)}</div>
        </Section>
      )}

      {filling.length > 0 && (
        <Section title="Проходят отбор" note="Заполняют анкету или проходят тест">
          <div className="trainer-list">{filling.map(row)}</div>
        </Section>
      )}

      {others.length > 0 && (
        <Section title="Все тренеры" note="Каждый видит только своих клиентов">
          <div className="trainer-list">{others.map(row)}</div>
        </Section>
      )}
    </>
  );
}
