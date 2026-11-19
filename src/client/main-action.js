import { useData } from '../useData.js';
import { blockSessions } from '../plan-model.js';
import { weekPlan, weekQueue } from '../plan-weeks.js';

/*
 * Главное действие клиента — общее для «+» (QuickAdd.jsx) и карточки
 * «Следующая тренировка» на «Обзоре» (HomeCards.jsx): обе говорят об одной
 * и той же тренировке. block — следующая тренировка программы (её
 * упражнения и тон), blocks — вся программа (тон по очереди, data-tones.js).
 */

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
export function useMainAction(clientRow, preview) {
  const plan = useData('client.plan', {
    ...(clientRow ? { clientRow } : {}),
    ...(preview ? { clientView: true } : {}),
  }, [clientRow, !!preview]);
  const journal = useData('workout.list', clientRow ? { clientRow: Number(clientRow) } : {}, [clientRow]);

  // Пока не знаем, что идёт и что следующее, — без названия: что начать,
  // решат сами «Тренировки», когда загрузятся. Клиенту везде «тренировка»,
  // не «занятие» (аудит 24.10.2026)
  if (!plan.data || !journal.data) return { title: 'Начать тренировку', note: '', payload: {}, loading: true };

  const sessions = Array.isArray(journal.data.sessions) ? journal.data.sessions : [];
  const live = sessions.find((s) => s.status === 'active' || s.status === 'paused');
  if (live) {
    return {
      title: 'Вернуться к тренировке',
      note: live.title + (live.status === 'paused' ? ' · на паузе' : ' · идёт'),
      payload: { session: live.id },
      live: true,
    };
  }

  // Ответ без программы (старый сервер, ошибка) — свободная, без расчёта недель
  if (!Array.isArray(plan.data.blocks)) return { title: 'Свободная тренировка', note: 'Без программы: что сделаете, то и запишется', payload: { free: true } };

  // Недели включены (IDEA-7) — следующая из очереди этой недели
  const wp = weekPlan({ blocks: plan.data.blocks, sessions, month: plan.data.month, cfg: plan.data.weeks, prev: plan.data.prev, latest: (plan.data.available || [])[0] === plan.data.month });
  const wk = wp && wp.currentIndex >= 0 ? wp.weeks[wp.currentIndex] : null;
  const next = wk
    ? (weekQueue(wk)[0] || {}).block
    : (plan.data.blocks || []).find((b) => !blockSessions(sessions, b, plan.data.month).length);
  if (next) return { title: 'Начать тренировку', note: next.title + ' · следующая по плану', payload: { title: next.title }, block: next, blocks: plan.data.blocks };

  return { title: 'Свободная тренировка', note: 'Без программы: что сделаете, то и запишется', payload: { free: true } };
}
