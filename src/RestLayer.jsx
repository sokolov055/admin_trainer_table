import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { RestScreen, RestPill } from './RestScreen.jsx';
import { restHere, onRestHere, workoutScreens, closeRestHere, setRestHere } from './rest-here.js';
import { cancelRestEnd, alarmMovedTo } from './native-rest.js';
import { onLiveAction } from './native-activity.js';

/**
 * Отдых поверх всего приложения, когда экрана тренировки нет (03.10.2026).
 *
 * Тренер ведёт клиента из его карточки: запустил отдых, свернул, ушёл в
 * «Расписание» — карточка закрылась вместе с тренировкой, и отдых не
 * звенел. Теперь до конца отдыха внизу плашка с отсчётом (на iPhone в
 * приложении — у «брови»), в конце — «Отдых окончен» со звуком. Только у
 * телефона, который запустил отдых (rest-here.js). Экран тренировки
 * открыт — отдых рисует он сам, а этот слой молчит.
 */
export default function RestLayer() {
  const [, redraw] = useState(0);
  useEffect(() => onRestHere(() => redraw((n) => n + 1)), []);
  // Кнопки будильника вне экрана тренировки: «+30 с» — отдых идёт дальше,
  // «Закрыть» — закончен. В занятие нажатое попадёт из журнала при открытии
  useEffect(() => onLiveAction(({ sessionId, kind, restUntil }) => {
    const r = restHere();
    if (!r || workoutScreens() > 0 || (r.sessionId && sessionId && String(r.sessionId) !== sessionId)) return;
    if (kind === 'extend' && restUntil > 0) { alarmMovedTo(restUntil); setRestHere({ ...r, until: restUntil }); }
    if (kind === 'stop') closeRestHere(r.until);
  }), []);
  const rest = restHere();
  const active = !!rest && workoutScreens() === 0;

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);

  // Развёрнут ли — по until: новый отдых начинается свёрнутым
  const [openUntil, setOpenUntil] = useState(0);
  if (!active || typeof document === 'undefined' || !document.body) return null;

  // Давно кончившийся отдых (телефон спал полчаса) — не звенеть
  if (now - rest.until > 30 * 60 * 1000) return null;

  const over = rest.until - now <= 0;
  const close = () => { closeRestHere(rest.until); cancelRestEnd(); };
  if (!over && openUntil !== rest.until) {
    return createPortal(<RestPill left={rest.until - now} onOpen={() => setOpenUntil(rest.until)} />, document.body);
  }
  return createPortal(
    <RestScreen
      until={rest.until}
      total={rest.total || 90000}
      now={now}
      next={rest.next || null}
      onStop={close}
      onCollapse={() => setOpenUntil(0)}
    />,
    document.body,
  );
}
