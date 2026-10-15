import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/manrope';
import MatchGame from './MatchGame.jsx';
import './match-preview.css';

createRoot(document.getElementById('root')).render(<main className="match-preview"><MatchGame onClose={() => { window.location.href = '/'; }} /></main>);
