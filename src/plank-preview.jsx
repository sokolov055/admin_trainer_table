import React from 'react';
import { createRoot } from 'react-dom/client';
import PlankGame from './PlankGame.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(<main style={{ padding: '20px 18px', minHeight: '100dvh' }}><PlankGame allowPhoto /></main>);
