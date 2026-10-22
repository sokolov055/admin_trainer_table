import React, { useSyncExternalStore } from 'react';
import { getPaletteId, onPalette, paletteById } from './palettes.js';
import Pumpkin from './Pumpkin.jsx';

/**
 * Своя картинка темы вместо круга с «+» (FT-702): у «Хэллоуина» — тыква.
 * Новая тема с картинкой: компонент в MASCOTS под id палитры и
 * mascot: {…} у палитры (palettes.js) — тогда applyPalette ставит
 * data-mascot, и tabbar-action.css прячет круг и показывает картинку.
 * Рисуется только картинка выбранной темы, смена палитры — сразу.
 * Тема из файла (22.10.2026) приносит картинку с собой — mascot.src.
 */
const MASCOTS = {
  halloween: Pumpkin,
};

export default function ThemeMascot(props) {
  const id = useSyncExternalStore(onPalette, getPaletteId, getPaletteId);
  const Art = MASCOTS[id];
  if (Art) return <Art {...props} />;
  // Тема из файла (панель «Вид»): картинкой, а не разметкой — скрипты в
  // SVG внутри <img> не исполняются
  const mascot = paletteById(id).mascot;
  if (!mascot || !mascot.src) return null;
  const { size = 52, tall = 1, className } = props;
  return <img className={className} src={mascot.src} width={size} height={Math.round(size * tall)} alt="" aria-hidden="true" draggable="false" />;
}
