import React from 'react';

/**
 * Политика конфиденциальности и поддержка — ссылками в «Настройках».
 *
 * App Store требует, чтобы она открывалась не только со страницы в
 * магазине, но и изнутри приложения (5.1.1(i)). Адрес — абсолютный: у
 * приложения для iPhone экраны вшиты, и относительная ссылка вела бы в
 * никуда; внешняя ссылка открывается в браузере телефона.
 */
export const PRIVACY_URL = 'https://sokolov055.github.io/admin_trainer_table/privacy.html';
/** Поддержка — почта разработчика (App Store 1.5: способ связаться) */
export const SUPPORT_URL = 'https://sokolov055.github.io/admin_trainer_table/support.html';

export default function PrivacyLink() {
  return (
    <p className="privacy-link">
      <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">Политика конфиденциальности</a>
      {' · '}
      <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer">Поддержка</a>
    </p>
  );
}
