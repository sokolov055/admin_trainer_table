import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { STEPS, LAST, canAdvance, nextStep, resumeStep, stageOf, bmrOf, timesWeek, ageOf, hasBody, fmtBirth } from '../src/client/onboarding-model.js';
import { TOUR_SECTIONS, tourSteps, tourSections, passedTours, markTourPassed } from '../src/client/tour-model.js';

const body = { sex: 'm', age: 30, height: 180, weight: 80 };
const at = (id) => STEPS.indexOf(id);

test('шаги совпадают с сервером: тело, обмен, активность, цель, опыт, место, график, план, программы', () => {
  assert.deepEqual(STEPS, ['body', 'bmr', 'lifestyle', 'goal', 'experience', 'place', 'days', 'plan', 'programs']);
  assert.equal(LAST, 8);
});

test('каждый шаг требует свой ответ; данные о теле — все четыре', () => {
  assert.equal(canAdvance({ sex: 'm', age: 30, height: 180 }, at('body')), false);
  assert.equal(canAdvance(body, at('body')), true);
  assert.equal(canAdvance({}, at('goal')), false);
  assert.equal(canAdvance({ goal: 'lose' }, at('goal')), true);
  assert.equal(canAdvance({ goal: 'weird' }, at('goal')), false);
  assert.equal(canAdvance({ days: 7 }, at('days')), false);
  assert.equal(canAdvance({ days: 3 }, at('days')), true);
  assert.equal(canAdvance({ lifestyle: 'feet' }, at('lifestyle')), true);
});

test('без данных о теле обмен, активность и план пропускаются в обе стороны', () => {
  assert.equal(nextStep({}, at('body')), at('goal'));
  assert.equal(nextStep({}, at('days')), at('programs'));
  assert.equal(nextStep({}, at('goal'), -1), at('body'));
  assert.equal(nextStep(body, at('body')), at('bmr'));
  assert.equal(nextStep(body, at('days')), at('plan'));
  assert.equal(nextStep(body, at('programs'), -1), at('plan'));
});

test('возврат к анкете не уводит за неотвеченный обязательный вопрос (черновик прежнего порядка)', () => {
  assert.equal(resumeStep({ goal: 'fitness', experience: 'beginner' }, 4), at('experience'));
  assert.equal(resumeStep({ goal: 'fitness' }, 6), at('experience'));
  assert.equal(resumeStep({}, 6), at('goal'));
  assert.equal(resumeStep({}, 0), at('body'));
  assert.equal(resumeStep({ goal: 'fitness', experience: 'beginner', place: 'gym', days: 2 }, 8), at('programs'));
  assert.equal(resumeStep({ goal: 'fitness' }, 1), at('goal'), 'обмен без данных о теле не показывается');
});

test('разделы полосы, базовый обмен как на сервере, «раза/раз в неделю»', () => {
  assert.equal(stageOf(at('bmr')), 0);
  assert.equal(stageOf(at('days')), 3);
  assert.equal(stageOf(at('programs')), 4);
  assert.equal(bmrOf(body), 1780);
  assert.equal(bmrOf({ ...body, sex: 'f' }), 1614);
  assert.equal(bmrOf({ sex: 'm' }), null);
  assert.equal(timesWeek(3), '3 раза в неделю');
  assert.equal(timesWeek(5), '5 раз в неделю');
});

test('дата рождения: полных лет до и после дня рождения, хватает вместо возраста', () => {
  const now = new Date(2026, 9, 15);
  assert.equal(ageOf({ birth: '1996-10-15' }, now), 30);
  assert.equal(ageOf({ birth: '1996-10-16' }, now), 29);
  assert.equal(ageOf({ age: 41 }, now), 41, 'прежний черновик с возрастом');
  assert.equal(hasBody({ sex: 'f', birth: '1990-05-05', height: 165, weight: 60 }), true);
  assert.equal(fmtBirth('1997-05-05'), '5 мая 1997');
});

/* Тур (FT-577) и туры по разделам из «Как пользоваться» (21.10.2026) */

test('первый вход — прежний поток: нижнее меню, «Ещё», первое действие последним', () => {
  const steps = tourSteps({ action: 'workout' });
  assert.deepEqual(steps.map((s) => s.title),
    ['Обзор — главное на сегодня', 'Тренировки', 'Прогресс', 'Питание', 'Меню «Ещё»', 'Начните первую тренировку']);
  assert.deepEqual(steps.map((s) => s.tab), ['overview', 'plan', 'progress', 'nutrition', 'overview', 'plan']);
  assert.equal(steps[0].target, '.tabbar [data-tab="overview"]');
  assert.equal(steps[5].action, 'workout');
  assert.equal(steps[5].wait, true);
  assert.equal(tourSteps({ action: 'steps' }).at(-1).target, '.tabbar [data-tab="progress"]');
  assert.equal(tourSteps({}).at(-1).title, 'Готово!');
  // Текст под человека: без тренера и в приложении — свой
  assert.match(tourSteps({ unlinked: true })[0].text, /Когда появится тренер/);
  assert.match(tourSteps({ unlinked: false })[0].text, /следующая тренировка/);
  assert.match(tourSteps({ app: true })[2].text, /шаги с телефона/);
  assert.ok(steps.every((s) => typeof s.text === 'string' && !('id' in s) && !('onlyFirst' in s)));
});

test('тур раздела — только его шаги, 3–4, каждый со своей вкладкой и без действия', () => {
  for (const s of TOUR_SECTIONS) {
    const steps = tourSteps({ section: s.id });
    assert.ok(steps.length >= 3 && steps.length <= 4, s.id + ': ' + steps.length + ' шагов');
    assert.ok(steps.every((x) => x.tab && x.title && typeof x.text === 'string' && !x.action), s.id);
  }
  // Меню «Ещё» — только в первом входе: тур раздела запускают из меню
  assert.deepEqual(tourSteps({ section: 'overview' }).map((s) => s.title), ['Обзор — главное на сегодня', 'Сегодня', 'Истории']);
  assert.ok(Object.values(tourSteps({ section: 'nutrition' })[2].target).some((t) => /diary-addbar/.test(t)));
  const workout = tourSteps({ section: 'workout' });
  assert.deepEqual(workout.map((s) => s.title), ['Тренировки', 'Начать тренировку', '«Легко», «Норм» или «Тяжело»', 'Выполненные']);
  assert.ok(workout.every((s) => s.tab === 'plan'));
  // Запасные цели по порядку: своя кнопка, кнопка занятия, свободная тренировка
  assert.match(workout[1].target[0], /data-first-action="workout"/);
  assert.match(workout[1].target.at(-1), /plan__free/);
  // Объяснение без цели — карточка по центру
  assert.equal(workout[2].target, undefined);
  assert.equal(tourSteps({ section: 'nutrition' })[0].tab, 'nutrition');
  assert.match(tourSteps({ section: 'progress', app: true })[0].text, /шаги с телефона/);
  // Первый шаг раздела — тот же, что в первом входе
  assert.deepEqual(tourSteps({ section: 'progress' })[0], tourSteps({})[2]);
  assert.deepEqual(tourSteps({ section: 'nope' }), []);
});

test('«Как пользоваться»: часы — только в приложении на iPhone; пройденные — на устройстве', () => {
  assert.deepEqual(tourSections().map((s) => s.id), ['overview', 'workout', 'progress', 'nutrition']);
  assert.deepEqual(tourSections({ ios: true }).map((s) => s.id), ['overview', 'workout', 'progress', 'nutrition', 'watch']);
  assert.ok(TOUR_SECTIONS.every((s) => s.title && s.note));

  // Хранилище подменяем через дескриптор: в новых Node оно бывает своим геттером
  const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const put = (value) => Object.defineProperty(globalThis, 'localStorage', { value, configurable: true, writable: true });
  try {
    // Без хранилища (приватный режим) — всё «новое», отметка не падает
    put({ getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('SecurityError'); } });
    assert.deepEqual(passedTours(), []);
    markTourPassed('overview');
    const store = new Map();
    put({ getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) });
    assert.deepEqual(passedTours(), []);
    markTourPassed('workout');
    markTourPassed('workout');
    markTourPassed('watch');
    assert.deepEqual(passedTours(), ['workout', 'watch']);
    store.set('tours_passed_v1', '{"broken":');
    assert.deepEqual(passedTours(), []);
  } finally {
    if (had) Object.defineProperty(globalThis, 'localStorage', had); else delete globalThis.localStorage;
  }
});

/* Цель шага подсвечивается по селектору: класс или атрибут, которого нет на
   экранах, оставит карточку без подсветки, и тур молча укажет в пустоту.
   Проверка простая — по строке в исходниках src/ (jsx, js, css, html). */
test('цели туров: каждый класс и атрибут из селекторов есть в исходниках', () => {
  const files = [];
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p); else if (/\.(jsx|js|css|html)$/.test(e.name)) files.push(p);
  });
  walk('src');
  const source = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  const targets = TOUR_SECTIONS.flatMap((s) => s.steps.flatMap((st) => [st.target].flat().filter(Boolean)));
  targets.push(...tourSteps({ action: 'workout' }).map((s) => s.target).filter(Boolean), tourSteps({ action: 'steps' }).at(-1).target);
  assert.ok(targets.length >= 20, 'целей: ' + targets.length);
  const missing = [];
  for (const sel of new Set(targets)) {
    const parts = sel.replace(/:not\([^)]*\)/g, '').split(/\s*>\s*|\s+/).filter(Boolean);
    for (const part of parts) {
      for (const cls of part.match(/\.[\w-]+/g) || []) {
        const name = cls.slice(1);
        if (!new RegExp('(^|[^\\w-])' + name + '(?![\\w-])').test(source)) missing.push(sel + ' → ' + cls);
      }
      for (const [, attr, value] of part.matchAll(/\[([\w-]+)="([^"]*)"\]/g)) {
        if (!source.includes(attr)) missing.push(sel + ' → [' + attr + ']');
        else if (value && !source.includes(value)) missing.push(sel + ' → ' + attr + '="' + value + '"');
      }
    }
  }
  assert.deepEqual(missing, []);
});
