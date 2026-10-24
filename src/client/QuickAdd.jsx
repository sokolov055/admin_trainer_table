import React from 'react';
import { Sheet } from '../ui.jsx';
import { useData } from '../useData.js';
import { useRights, hasPlus } from '../rights.js';
import { blockSessions } from '../plan-model.js';
import { label as mealLabel, mealNow } from '../nutrition/diary-model.js';
import { IconPlay, IconScale, IconRuler, IconDrop, IconNutrition, IconSend } from '../icons.jsx';
import './quick-add.css';

/**
 * «Что записать» — лист под «+» нижнего меню клиента (пункт 13 плана,
 * 21.10.2026; из разбора «Худеем вместе», макет Plus).
 *
 * Сверху — главное действие. Обычно это занятие: «+» не спорит с
 * «Тренировками», а сокращает путь к их главной кнопке. На «Питании»
 * главное — еда: человек пришёл туда записывать приём, и лист не должен
 * предлагать ему тренировку. Занятие тогда встаёт на место плитки «Еда» —
 * меняются местами два пункта, остальные плитки стоят где стояли, и палец
 * находит их там же с любой вкладки.
 *
 * Только действия, которые в приложении уже есть. Плитка не открывает
 * свою форму, а переключает вкладку и просит её открыть свою
 * (quick-actions.js): форма одна, и правится в одном месте. Еда и вода —
 * с «Плюсом», «Тренеру» — когда тренер есть: пожелание тренеру внизу
 * «Тренировок» (Wishes.jsx) — единственный способ написать ему из
 * приложения.
 *
 * Тренер «глазами клиента» видит тот же набор, что клиент, но еда, вода и
 * «Тренеру» там не нажимаются: дневник в просмотре только для чтения, а
 * пожелание тренер написал бы сам себе. Раньше их просто не было, и лист
 * на «Питании» выглядел так, будто про еду в нём забыли.
 *
 * tab — вкладка, с которой открыли лист. onPick(tab, kind, payload) —
 * ClientApp закрывает лист, переключает вкладку и оставляет запрос.
 */
export default function QuickAdd({ me, clientRow, preview, tab, onClose, onPick, closeRef, onLeaving }) {
  const rights = useRights();
  // Свой кабинет — записывать можно всё. «Глазами клиента» нажимается то,
  // что тренер и так ведёт за клиента: занятие, вес, замеры. В карточке
  // клиента у тренера (не «глазами») дневника и пожелания нет вовсе
  const own = !clientRow;
  const workout = useMainAction(clientRow, preview);
  const food = hasPlus(rights) && (own || preview);
  const coach = own ? !!(me && !me.unlinked) : !!preview;

  const actions = {
    workout: { kind: 'workout', tab: 'plan', label: workout.payload.session ? 'К тренировке' : 'Тренировка', title: workout.title, note: workout.note, payload: workout.payload, Icon: IconPlay },
    food: { kind: 'food', tab: 'nutrition', label: 'Еда', title: 'Добавить еду', hint: mealLabel(mealNow()), note: mealLabel(mealNow()) + ' · по времени, можно сменить', Icon: IconNutrition, off: !own },
    weight: { kind: 'weight', tab: 'progress', label: 'Вес', title: 'Записать вес', note: 'Лучше утром, до завтрака — так честнее сравнивать', Icon: IconScale },
  };
  // Главное — по вкладке: еда на «Питании» (если её можно записать), вес
  // на «Прогрессе», иначе занятие (владелец, 21.10.2026)
  const mainKind = tab === 'nutrition' && food && own ? 'food' : tab === 'progress' ? 'weight' : 'workout';
  const main = actions[mainKind];

  // Плитки не прыгают: ушедшее наверх действие уступает своё место
  // занятию, остальные стоят там же, где на любой вкладке
  const tiles = [
    ...(food ? [actions.food] : []),
    ...(food ? [{ kind: 'water', tab: 'nutrition', label: 'Вода', hint: '+250 мл', name: 'Вода, плюс 250 мл', Icon: IconDrop, off: !own }] : []),
    actions.weight,
    { kind: 'measure', tab: 'progress', label: 'Замеры', Icon: IconRuler },
    ...(coach ? [{ kind: 'wish', tab: 'plan', label: 'Тренеру', name: 'Написать тренеру', Icon: IconSend, off: !own }] : []),
  ].map((t) => (t.kind === mainKind ? actions.workout : t));
  const locked = tiles.some((t) => t.off);
  // Занятию нужен payload (что начать), остальным — нет
  const pick = (a) => (a.payload ? onPick(a.tab, a.kind, a.payload) : onPick(a.tab, a.kind));

  return (
    <Sheet title="Что записать" onClose={onClose} className="sheet--quick" closeRef={closeRef} onLeaving={onLeaving}>
      <button type="button" className="quick-main" style={{ '--i': 0 }} onClick={() => pick(main)}>
        <span className="quick-main__icon"><main.Icon size={22} /></span>
        <span className="quick-main__text">
          <span className="quick-main__title">{main.title}</span>
          {main.note && <span className="quick-main__note">{main.note}</span>}
        </span>
      </button>

      <div className="quick-tiles">
        {tiles.map((t, i) => (
          <button key={t.kind} type="button" className="quick-tile" style={{ '--i': i + 1 }}
            aria-label={t.name} disabled={t.off} onClick={() => pick(t)}>
            <span className="quick-tile__icon"><t.Icon size={26} /></span>
            <span className="quick-tile__label">{t.label}</span>
            {t.hint && <span className="quick-tile__hint">{t.hint}</span>}
          </button>
        ))}
      </div>

      {locked && <p className="quick-note">Бледное клиент записывает сам — в просмотре не нажимается.</p>}
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
  // решат сами «Тренировки», когда загрузятся. Клиенту везде «тренировка»,
  // не «занятие» (аудит 24.10.2026)
  if (!plan.data || !journal.data) return { title: 'Начать тренировку', note: '', payload: {} };

  const sessions = journal.data.sessions || [];
  const live = sessions.find((s) => s.status === 'active' || s.status === 'paused');
  if (live) {
    return {
      title: 'Вернуться к тренировке',
      note: live.title + (live.status === 'paused' ? ' · на паузе' : ' · идёт'),
      payload: { session: live.id },
    };
  }

  const next = (plan.data.blocks || []).find((b) => !blockSessions(sessions, b, plan.data.month).length);
  if (next) return { title: 'Начать тренировку', note: next.title + ' · следующая по плану', payload: { title: next.title } };

  return { title: 'Свободная тренировка', note: 'Без программы: что сделаете, то и запишется', payload: { free: true } };
}
