import React from 'react';
import { Sheet } from '../ui.jsx';
import { useData } from '../useData.js';
import { useRights, hasPlus } from '../rights.js';
import { blockSessions } from '../plan-model.js';
import { IconPlay, IconScale, IconRuler, IconDrop, IconNutrition, IconSend } from '../icons.jsx';
import './quick-add.css';

/**
 * «Что записать» — лист под «+» нижнего меню клиента (пункт 13 плана,
 * 21.10.2026; из разбора «Худеем вместе», макет Plus).
 *
 * Сверху — главное действие дня, занятие: «+» не спорит с «Тренировками»,
 * а сокращает путь к их главной кнопке. Ниже — то, что записывают чаще
 * всего, в два касания с любой вкладки.
 *
 * Только действия, которые в приложении уже есть. Плитка не открывает
 * свою форму, а переключает вкладку и просит её открыть свою
 * (quick-actions.js): форма одна, и правится в одном месте. Еда и вода —
 * когда открыт дневник питания, «Тренеру» — когда тренер есть: пожелание
 * тренеру внизу «Тренировок» (Wishes.jsx) — единственный способ написать
 * ему из приложения.
 *
 * onPick(tab, kind, payload) — ClientApp закрывает лист, переключает
 * вкладку и оставляет запрос.
 */
export default function QuickAdd({ me, clientRow, preview, onClose, onPick }) {
  const rights = useRights();
  // Свой кабинет. «Глазами клиента» у тренера дневник только для чтения,
  // а пожелание написал бы тренер сам себе
  const own = !clientRow;
  const main = useMainAction(clientRow, preview);

  const tiles = [
    { kind: 'weight', tab: 'progress', label: 'Вес', Icon: IconScale },
    { kind: 'measure', tab: 'progress', label: 'Замеры', Icon: IconRuler },
    ...(own && hasPlus(rights) ? [
      { kind: 'water', tab: 'nutrition', label: 'Вода', Icon: IconDrop },
      { kind: 'food', tab: 'nutrition', label: 'Еда', Icon: IconNutrition },
    ] : []),
    ...(own && me && !me.unlinked ? [
      { kind: 'wish', tab: 'plan', label: 'Тренеру', name: 'Написать тренеру', Icon: IconSend },
    ] : []),
  ];

  return (
    <Sheet title="Что записать" onClose={onClose}>
      <button type="button" className="quick-main" onClick={() => onPick('plan', 'workout', main.payload)}>
        <span className="quick-main__icon"><IconPlay size={22} /></span>
        <span className="quick-main__text">
          <span className="quick-main__title">{main.title}</span>
          {main.note && <span className="quick-main__note">{main.note}</span>}
        </span>
      </button>

      <div className="quick-tiles">
        {tiles.map((t) => (
          <button key={t.kind} type="button" className="quick-tile" aria-label={t.name} onClick={() => onPick(t.tab, t.kind)}>
            <span className="quick-tile__icon"><t.Icon size={26} /></span>
            {t.label}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

/**
 * Что начнётся по главной кнопке — так же, как решают «Тренировки»: идёт
 * занятие — вернуться к нему (новое всё равно не начнётся, журнал откроет
 * идущее); иначе первая непроведённая тренировка программы; программы
 * нет или она пройдена — свободная. Данные — из того же кэша, что у
 * «Тренировок», поэтому лист открывается сразу, а свежие подтягиваются.
 *
 * «Сегодня по плану» не пишем: у программы нет дней, есть очередь, и в
 * день отдыха «сегодня» звучало бы как задание.
 */
function useMainAction(clientRow, preview) {
  const plan = useData('client.plan', {
    ...(clientRow ? { clientRow } : {}),
    ...(preview ? { clientView: true } : {}),
  }, [clientRow, !!preview]);
  const journal = useData('workout.list', clientRow ? { clientRow: Number(clientRow) } : {}, [clientRow]);

  // Пока не знаем, что идёт и что следующее, — без названия: что начать,
  // решат сами «Тренировки», когда загрузятся
  if (!plan.data || !journal.data) return { title: 'Начать занятие', note: '', payload: {} };

  const sessions = journal.data.sessions || [];
  const live = sessions.find((s) => s.status === 'active' || s.status === 'paused');
  if (live) {
    return {
      title: 'Вернуться к занятию',
      note: live.title + (live.status === 'paused' ? ' · на паузе' : ' · идёт'),
      payload: { session: live.id },
    };
  }

  const next = (plan.data.blocks || []).find((b) => !blockSessions(sessions, b, plan.data.month).length);
  if (next) return { title: 'Начать занятие', note: next.title + ' · следующая по плану', payload: { title: next.title } };

  return { title: 'Свободная тренировка', note: 'Без программы: что сделаете, то и запишется', payload: { free: true } };
}
