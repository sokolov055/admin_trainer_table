import React from 'react';
import { createRoot } from 'react-dom/client';
import PlankGame from './PlankGame.jsx';
import GameShell from './GameShell.jsx';
import './styles.css';

// Локальный просмотр: игра в той же полноэкранной оболочке, что и в приложении.
// ?rest=45 — как на отдыхе: плашка «До подхода» и кнопка «К отдыху».
const rest = Number(new URLSearchParams(location.search).get('rest')) || null;
createRoot(document.getElementById('root')).render(<GameShell kind="plank"><PlankGame allowPhoto onClose={() => {}} restLeft={rest ? rest * 1000 : undefined} /></GameShell>);
