import React, { useSyncExternalStore } from 'react';
import { getPaletteId, onPalette } from './palettes.js';
import Pumpkin from './Pumpkin.jsx';

/**
 * Своя картинка темы вместо круга с «+» (FT-702): у «Хэллоуина» — тыква.
 * Новая тема с картинкой: компонент в MASCOTS под id палитры и
 * mascot: {…} у палитры (palettes.js) — тогда applyPalette ставит
 * data-mascot, и tabbar-action.css прячет круг и показывает картинку.
 * Рисуется только картинка выбранной темы, смена палитры — сразу.
 */
const MASCOTS = {
  halloween: Pumpkin,
};

export default function ThemeMascot(props) {
  const id = useSyncExternalStore(onPalette, getPaletteId, getPaletteId);
  const Art = MASCOTS[id];
  return Art ? <Art {...props} /> : null;
}
