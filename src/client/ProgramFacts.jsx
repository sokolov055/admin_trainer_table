import React from 'react';
import { levelTone } from './programs-model.js';
import './programs.css';

/**
 * Метка уровня программы (FT-497): цвет — подсказка, главное — слово.
 * Отдельным файлом: её показывают и «Программы тренера» (Programs.jsx), и
 * карточка подбора по анкете (Onboarding.jsx), а тяжёлые экраны друг другу
 * не нужны.
 */
export function LevelTag({ level }) {
  if (!level) return null;
  const tone = levelTone(level);
  return <span className={'level-tag' + (tone ? ' level-tag--' + tone : '')}>{level}</span>;
}
