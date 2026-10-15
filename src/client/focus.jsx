import React, { useEffect, useState } from 'react';
import { apiFresh, onMutated } from '../api.js';
import { formatNumber } from '../ui.jsx';
import Art from './OnboardingArt.jsx';
import { timesWeek } from './onboarding-model.js';
import './focus.css';

/**
 * Цель во всех разделах (FT-577). Анкета спрашивает цель один раз —
 * дальше она видна в «Обзоре», «Тренировках», «Прогрессе» и «Питании»:
 * что в фокусе и одна подсказка под цель. Подсказки сверены с расчётом
 * нормы (lib/nutrition.js): белок 2,2 / 1,8 / 2,0 г на кг — у похудения,
 * поддержания и набора.
 *
 * Цель отдаёт сервер (client.focus): из анкеты, а если позже человек
 * заполнил «Питание» с другой целью — из питания. Старый сервер этого не
 * знает — блок просто не показывается.
 */

export const FOCUS = {
  lose: {
    art: 'lose',
    overview: 'Дефицит калорий, шаги каждый день и тренировки по графику — так уходит жир, а мышцы остаются.',
    plan: 'Держите отдых между подходами коротким, 60–90 секунд, — тренировка потратит больше энергии.',
    progress: 'Главное здесь — вес и талия. Взвешивайтесь раз в неделю утром натощак: важен тренд, а не один день.',
    nutrition: 'Норма с дефицитом и белка побольше — он сохраняет мышцы, пока уходит жир.',
    empty: 'Заполните анкету ниже — норма посчитается с дефицитом под вашу цель.',
  },
  fitness: {
    art: 'fitness',
    overview: 'Регулярность важнее рекордов: тренировки по графику и норма шагов каждый день.',
    plan: 'Не пропускайте два занятия подряд — короткая тренировка лучше, чем никакой.',
    progress: 'Смотрите на серии тренировок и шагов — они показывают, держится ли режим.',
    nutrition: 'Норма на поддержание: столько, сколько тратите, — энергии хватает и на день, и на тренировки.',
    empty: 'Заполните анкету ниже — посчитаем норму на поддержание формы.',
  },
  strength: {
    art: 'strength',
    overview: 'Растущие рабочие веса в основных движениях и полноценное восстановление между занятиями.',
    plan: 'Отдыхайте 2–3 минуты между тяжёлыми подходами и прибавляйте вес, когда все повторы даются уверенно.',
    progress: 'Главное здесь — рабочие веса: они подтягиваются из выполненных тренировок.',
    nutrition: 'Белка — около 1,8 г на килограмм веса: без него сила растёт медленнее.',
    empty: 'Заполните анкету ниже — посчитаем норму и белок под силовые.',
  },
  muscle: {
    art: 'muscle',
    overview: 'Небольшой профицит калорий, белок и рост нагрузки — мышцы растут из этих трёх вещей.',
    plan: 'Работайте в 8–12 повторах и оставляйте в запасе 1–2 повтора — так мышцы получают нужную нагрузку.',
    progress: 'Главное здесь — вес и обхваты: прибавка 0,5–1 кг в месяц — хороший темп без лишнего жира.',
    nutrition: 'Норма с профицитом и белок около 2 г на килограмм — строительный материал для мышц.',
    empty: 'Заполните анкету ниже — посчитаем норму с профицитом под набор.',
  },
};

// Один запрос на всех: блок стоит в четырёх разделах сразу
const cache = new Map();
function load(key, clientRow, force = false) {
  if (!force && cache.has(key)) return cache.get(key);
  // apiFresh, не apiPublic: ответ остаётся на телефоне, и без сети (FT-588)
  // карточка цели показывается тем, что видели в последний раз
  const p = apiFresh('client.focus', clientRow ? { clientRow } : {}).then((r) => r.data).catch(() => null);
  cache.set(key, p);
  return p;
}

export function useFocus(clientRow) {
  const key = clientRow ? 'c' + clientRow : 'self';
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    load(key, clientRow).then((r) => { if (alive) setData(r); });
    // Записали анкету питания или замер — цель и норма могли поменяться
    const off = onMutated(() => load(key, clientRow, true).then((r) => { if (alive) setData(r); }));
    return () => { alive = false; off(); };
  }, [key]);
  return data;
}

/** Сбросить после анкеты: цель только что появилась */
export function forgetFocus() { cache.clear(); }

/**
 * Блок цели. section — раздел: overview, plan, progress, nutrition.
 * На «Обзоре» под текстом — факты: график, норма, программа.
 */
export function GoalBanner({ clientRow, clientView = false, section }) {
  const f = useFocus(clientRow);
  if (!f || !f.goal || !FOCUS[f.goal]) return null;
  const meta = FOCUS[f.goal];
  const trainer = !!clientRow && !clientView;
  const text = section === 'nutrition' && !f.norm ? meta.empty : meta[section];
  const facts = section === 'overview' ? [
    f.week ? timesWeek(f.week) : '',
    f.norm ? formatNumber(f.norm.kcal) + ' ккал в день' : '',
    f.program ? 'Программа «' + f.program + '»' : '',
  ].filter(Boolean) : [];
  return (
    <section className={'goal-banner goal-banner--' + section} aria-label={trainer ? 'Цель клиента' : 'Ваша цель'}>
      <span className="goal-banner__art" aria-hidden="true"><Art name={meta.art} size={40} /></span>
      <div className="goal-banner__body">
        <p className="goal-banner__eyebrow">{trainer ? 'Цель клиента' : 'Ваша цель'}</p>
        <p className="goal-banner__title">{f.goalLabel}</p>
        <p className="goal-banner__text">{text}</p>
        {facts.length > 0 && <ul className="goal-banner__facts">{facts.map((x) => <li key={x}>{x}</li>)}</ul>}
      </div>
    </section>
  );
}
