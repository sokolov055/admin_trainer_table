import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { initTelegramUi } from './telegram.js';
import { startInstallPromptCapture } from './install.js';
import { startOffline } from './offline.js';
import { startNative } from './native.js';
import { captureTrainerLink } from './trainer-link.js';
import './styles.css';

// Тему и размеры окна выставляем до первого рендера, иначе приложение
// моргает светлым фоном в тёмной теме Telegram.
initTelegramUi();
startInstallPromptCapture();
startOffline();
startNative();
// Ссылка тренера «привязаться» — запомнить до входа (trainer-link.js)
captureTrainerLink();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
