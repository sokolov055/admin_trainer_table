import React, { useState } from 'react';
import { Plan, Progress } from './screens.jsx';
import { Chips, Section, Empty } from '../ui.jsx';
import { IconBack, IconUsers } from '../icons.jsx';
import { haptic } from '../telegram.js';
import { useBackGesture } from '../gestures.jsx';

/**
 * Семья — плательщик и те, за кого он платит.
 *
 * Тренировки и показатели родных — только посмотреть: начать занятие или
 * записать замер за другого человека нельзя, и кнопок для этого здесь
 * нет вовсе. Деньги и питание не показываются — сервер их и не отдаёт.
 * Кто попадает в список, решает тренер: участие включается каждому
 * отдельно, и видят друг друга только включённые.
 */
// preview — тренер смотрит глазами клиента: данные берутся его правами по
// номеру строки, familyRow при этом оставляет экраны только для чтения.
export default function Family({ members, preview = false }) {
  const [open, setOpen] = useState(null);
  const [tab, setTab] = useState('plan');

  // Жест «назад» с человека возвращает к списку семьи
  useBackGesture(() => setOpen(null), !!open, 'family-member');

  if (open) {
    return (
      <>
        <button className="button button--ghost library__back" onClick={() => { setOpen(null); haptic(); }}>
          <IconBack size={16} />
          Семья
        </button>
        <h2 className="family__name">{open.name}</h2>
        <Chips
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
            <span className="item__name">{m.name}</span>
          </div>
          <div className="item__meta">
            <span>{m.payer ? 'оплачивает тренировки семьи' : 'тренировки и прогресс'}</span>
          </div>
        </button>
      ))}
    </Section>
  );
}
