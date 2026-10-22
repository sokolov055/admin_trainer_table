import React, { useState } from 'react';

import { apiMutate } from '../api.js';
import { useData } from '../useData.js';
import { Empty, ErrorState, Loading, Note, Panel, Search, Section, Tag } from '../ui.jsx';
import { IconUsers } from '../icons.jsx';
import { haptic } from '../telegram.js';
import AdminGamePacks from './AdminGamePacks.jsx';

/**
 * Доступ к играм — вкладка «Управления» (17.10.2026). Владелец открывает
 * игры выбранным клиентам; тестовым они открыты всегда. Право читает сервер
 * («кто я» → plankGameEnabled), поэтому новая сборка приложения не нужна:
 * клиент увидит игры при следующем открытии приложения.
 */
export default function Games() {
  const { data, loading, error, reload } = useData('owner.games', {}, []);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(0);
  const [problem, setProblem] = useState(null);
  const [list, setList] = useState(null);

  if (loading && !data) return <Loading lead={false} rows={3} />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;

  const clients = list || data.clients || [];
  const q = query.trim().toLowerCase();
  const shown = q ? clients.filter((c) => (c.name + ' ' + c.trainer).toLowerCase().includes(q)) : clients;
  const open = clients.filter((c) => c.games).length;

  const toggle = async (client) => {
    setBusy(client.row);
    setProblem(null);
    try {
      const next = await apiMutate('owner.games.set', { row: client.row, on: !client.games });
      setList(next.clients);
      haptic('success');
    } catch (err) {
      setProblem(err);
    } finally {
      setBusy(0);
    }
  };

  return (
    <>
      <Note>
        Игры — «Тренер в планке», «На самокате до зала» (с рейтингом), «Три в ряд» и «Блины». Открытые здесь клиенты увидят их при
        следующем открытии приложения, обновлять приложение не нужно. Тестовым клиентам игры открыты всегда.
      </Note>
      {problem && <ErrorState error={problem} onRetry={() => setProblem(null)} />}
      <AdminGamePacks />
      <Section title="Клиенты" note={'Игры открыты: ' + open}>
        <Search value={query} onChange={setQuery} placeholder="Имя клиента или тренера" />
        {shown.length === 0
          ? <Empty icon={IconUsers} title="Никого не нашли" text="Проверьте имя или очистите поиск." />
          : (
            <div className="trainer-list">
              {shown.map((c) => (
                <Panel pad className="trainer-row" key={c.row}>
                  <div className="trainer-row__copy">
                    <strong>{c.name}</strong>
                    <span>{c.trainer ? 'Тренер: ' + c.trainer : 'Без тренера'}</span>
                    {c.test && <span className="trainer-row__tags"><Tag>тестовый</Tag></span>}
                  </div>
                  {!c.test && (
                    <div className="trainer-row__actions">
                      <button
                        type="button"
                        className={'button' + (c.games ? '' : ' button--primary')}
                        aria-pressed={c.games}
                        disabled={!!busy}
                        onClick={() => toggle(c)}
                      >
                        {busy === c.row ? 'Минуту…' : c.games ? 'Закрыть игры' : 'Открыть игры'}
                      </button>
                    </div>
                  )}
                </Panel>
              ))}
            </div>
          )}
      </Section>
    </>
  );
}
