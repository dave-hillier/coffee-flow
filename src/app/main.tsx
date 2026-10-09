import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { game } from './game';
import { GameProvider } from './GameProvider';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GameProvider game={game}>
      <App />
    </GameProvider>
  </StrictMode>
);
