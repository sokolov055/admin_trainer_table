import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { initTelegramUi } from './telegram.js';
import './styles.css';

// Тему и размеры окна выставляем до первого рендера, иначе приложение
// моргает светлым фоном в тёмной теме Telegram.
initTelegramUi();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
