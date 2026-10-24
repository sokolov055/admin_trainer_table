import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { initTelegramUi } from './telegram.js';
import { applyPalette } from './palettes.js';
import { startInstallPromptCapture } from './install.js';
import { startOffline } from './offline.js';
import { startNative } from './native.js';
import { captureTrainerLink } from './trainer-link.js';
import { installActionReveal } from './reveal.js';
import './styles.css';

// Тему и размеры окна выставляем до первого рендера, иначе приложение
// моргает светлым фоном в тёмной теме Telegram.
initTelegramUi();
// Персональные цвета (palettes.js) — там же, до первого кадра: иначе
// кнопки на мгновение мелькали бы стандартным синим
applyPalette();
startInstallPromptCapture();
startOffline();
startNative();
// Ссылка тренера «привязаться» — запомнить до входа (trainer-link.js)
captureTrainerLink();
// Ответ на действие — ошибка, итог — на экран, а не за его краем (FT-595)
installActionReveal();

// Приложение запустилось — повтор при несработавшей загрузке (index.html) снова разрешён
try { sessionStorage.removeItem('boot-retry'); } catch (_) { /* приватный режим */ }
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
