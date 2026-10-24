import { useReturnScroll } from '../scroll.js';
import React, { useState } from 'react';
import { Plan, Progress } from './screens.jsx';
import { Chips, Section, Empty } from '../ui.jsx';
import { IconUsers } from '../icons.jsx';
import { haptic } from '../telegram.js';
import { useBackGesture } from '../gestures.jsx';

/**
 * Семья — плательщик и те, за кого он платит.
 *
 * Тренировки и показатели родных — только посмотреть: начать тренировку или
 * записать замер за другого человека нельзя, и кнопок для этого здесь
 * нет вовсе. Деньги и питание не показываются — сервер их и не отдаёт.
 * Кто попадает в список, решает тренер: участие включается каждому
 * отдельно, и видят друг друга только включённые.
 */
// preview — тренер смотрит глазами клиента: данные берутся его правами по
// номеру строки, familyRow при этом оставляет экраны только для чтения.
//
// Открытый человек (open) живёт в ClientApp: «назад» с него — та же кнопка
// в шапке («← Семья» вместо «← Обзор»), а не вторая в теле под первой
// (аудит 24.10.2026)
export default function Family({ members, preview = false, open = null, onOpen }) {
  const setOpen = onOpen;
  const [tab, setTab] = useState('plan');

  // Жест «назад» с человека возвращает к списку семьи
  useBackGesture(() => setOpen(null), !!open, 'family-member');
  useReturnScroll(!!open);

  if (open) {
    return (
      <>
        <h2 className="family__name">{open.name}</h2>
        {/* Подразделы человека — дорожкой «где я», как в «Питании» */}
        <Chips
          variant="nav"
          label={'Разделы: ' + open.name}
          items={[{ value: 'plan', label: 'Тренировки' }, { value: 'progress', label: 'Прогресс' }]}
          value={tab}
          onChange={setTab}
        />
        {tab === 'plan'
          ? <Plan key={'p' + open.row} familyRow={open.row} {...(preview ? { clientRow: open.row, clientView: true } : {})} />
          : <Progress key={'g' + open.row} familyRow={open.row} {...(preview ? { clientRow: open.row } : {})} />}
      </>
    );
  }

  if (!members.length) {
    return (
      <Empty
        icon={IconUsers}
        title="Семья пока пуста"
        text="Когда тренер откроет семье доступ, здесь появятся тренировки и показатели ваших близких."
      />
    );
  }

  return (
    <Section note="Тренировки и показатели — посмотреть, без правок">
      {members.map((m) => (
        <button className="item" key={m.row} onClick={() => { setOpen(m); setTab('plan'); haptic(); }}>
          <div className="item__top">
            <span className="item__name">{m.name}{m.archived ? ' · в архиве' : ''}</span>
          </div>
          <div className="item__meta">
            <span>{m.payer ? 'оплачивает тренировки семьи' : 'тренировки и прогресс'}</span>
          </div>
        </button>
      ))}
    </Section>
  );
}
