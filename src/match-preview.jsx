import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/manrope';
import MatchGame from './MatchGame.jsx';
import './game-shell.css';
import './match-preview.css';

createRoot(document.getElementById('root')).render(<main className="game-shell game-shell--match"><MatchGame onClose={() => { window.location.href = '/'; }} /></main>);
