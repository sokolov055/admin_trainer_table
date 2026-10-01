import React from 'react';
import { onIphone } from '../native-steps.js';

/**
 * «Как подключить часы» — по маркам (02.10.2026). Приложение читает шаги и
 * тренировки из Health Connect (Android) или «Здоровья» (iPhone), а пишут
 * туда приложения часов, и не все сами: Huawei Health в Health Connect не
 * пишет вовсе, Samsung Health — только с разрешением. Человек этого не
 * знает и думает, что сломалось приложение.
 *
 * Сторонний посредник (Health Sync) человек ставит сам, у себя на телефоне:
 * нам он ничего не передаёт, мы получаем данные только из Health Connect.
 */
const ANDROID = [
  ['Samsung Galaxy Watch', 'Samsung Health → «Меню» → «Настройки» → Health Connect: разрешите Samsung Health записывать «Шаги» и «Упражнения».'],
  ['Xiaomi, Redmi, Amazfit', 'В Mi Fitness или Zepp включите передачу данных в Health Connect (настройки профиля → Health Connect).'],
  ['Huawei, Honor (телефон с Google Play)', 'Huawei Health сам в Health Connect не пишет. Поставьте из Google Play приложение Health Sync: источник — Huawei Health, цель — Health Connect, отметьте шаги и тренировки. В Huawei Health разрешите ему доступ, когда он попросит.'],
  ['Телефон Huawei без сервисов Google', 'На нём нет Health Connect — шаги и тренировки с часов приложение прочитать не может. Подходы и веса записывайте в приложении, как обычно.'],
  ['Google Pixel Watch, Fitbit', 'Fitbit пишет в Health Connect сам: в приложении Fitbit включите синхронизацию с Health Connect.'],
];
const IOS = [
  ['Apple Watch', 'Работает сразу: в «Здоровье» разрешите Fit Track читать шаги и тренировки.'],
  ['Huawei, Honor', 'Huawei Health → «Я» → «Настройки» → обмен данными: включите «Здоровье» (Apple Health). Дальше — как с Apple Watch.'],
  ['Xiaomi, Amazfit', 'В Mi Fitness или Zepp включите синхронизацию со «Здоровьем».'],
];

export default function WatchHelp() {
  const list = onIphone() ? IOS : ANDROID;
  return (
    <details className="watch-help">
      <summary className="small">Как подключить часы: Samsung, Huawei, Xiaomi…</summary>
      <ul className="watch-help__list small">
        {list.map(([brand, text]) => (
          <li key={brand}><strong>{brand}.</strong> {text}</li>
        ))}
      </ul>
    </details>
  );
}
