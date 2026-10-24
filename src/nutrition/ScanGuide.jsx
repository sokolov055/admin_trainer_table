import React from 'react';
import { IconCheck, IconClose } from '../icons.jsx';

/**
 * «Как снять» — до камеры, а не после неудачного снимка (план трёх
 * разборов, п. 2; у «Худеем вместе» такой кадр стоит перед каждым сканером).
 * Пример «так / не так» рисуем сами: таблица КБЖУ ровно и целиком против
 * снятой под углом, обрезанной и с бликом. Фото не нужно — схема читается
 * быстрее и одинаково в светлой и тёмной теме.
 */
const TIPS = {
  label: [
    'В кадре вся таблица «Пищевая ценность» и строка «на 100 г» или «на 100 мл»',
    'Телефон параллельно упаковке, свет сбоку — без бликов на плёнке',
    'После снимка сверьте цифры: распознавание может ошибиться',
  ],
  barcode: [
    'Штрихкод целиком, с цифрами под полосками, или квадратный код «Честного знака»',
    'Держите ровно, на расстоянии ладони — не вплотную',
    'Не читается — впишите цифры вручную ниже',
  ],
  // Еда по фото (FT-736): мерка — вилка рядом, как у «Худеем вместе»
  plate: [
    'Почти сверху: вся тарелка и всё, что съедите, целиком в кадре',
    'Положите рядом вилку или ложку — по ней считается размер порции',
    'После снимка проверьте блюда и граммы: вес — оценка',
  ],
};
const BAD = { label: 'Не так: под углом, обрезано, блик', barcode: 'Не так: под углом, обрезано, блик', plate: 'Не так: сбоку, обрезано, без вилки' };

// Блик и обрезка — только у примера «не так»; id у каждого рисунка свой
function BadDefs({ id }) {
  return (
    <defs>
      <clipPath id={id + '-crop'}><rect x="0" y="0" width="96" height="84" /></clipPath>
      <linearGradient id={id + '-glare'} x1="0" x2="1" y1="0" y2="1">
        <stop offset="0.35" stopColor="#fff" stopOpacity="0" />
        <stop offset="0.5" stopColor="#fff" stopOpacity="0.85" />
        <stop offset="0.65" stopColor="#fff" stopOpacity="0" />
      </linearGradient>
    </defs>
  );
}

function Label({ bad }) {
  return (
    <svg viewBox="0 0 120 84" aria-hidden="true" focusable="false">
      {bad && <BadDefs id="scan-label" />}
      <g clipPath={bad ? 'url(#scan-label-crop)' : undefined} transform={bad ? 'rotate(-11 60 42) translate(10 4)' : undefined}>
        <rect x="14" y="8" width="92" height="68" rx="4" className="scan-guide__paper" />
        <rect x="20" y="15" width="56" height="6" rx="2" className="scan-guide__ink" />
        {[30, 41, 52, 63].map((y) => (
          <g key={y}>
            <rect x="20" y={y} width="40" height="4" rx="2" className="scan-guide__line" />
            <rect x="80" y={y} width="20" height="4" rx="2" className="scan-guide__ink" />
          </g>
        ))}
        {bad && <rect x="14" y="8" width="92" height="68" fill="url(#scan-label-glare)" />}
      </g>
    </svg>
  );
}

function Barcode({ bad }) {
  const bars = [0, 4, 6, 11, 13, 16, 21, 23, 27, 30, 34, 36, 41, 44, 46, 51, 54, 57, 60, 64];
  return (
    <svg viewBox="0 0 120 84" aria-hidden="true" focusable="false">
      {bad && <BadDefs id="scan-code" />}
      <g transform={bad ? 'rotate(-14 60 42) translate(18 0)' : undefined}>
        <rect x="18" y="12" width="84" height="60" rx="4" className="scan-guide__paper" />
        {bars.map((x, i) => (
          <rect key={x} x={26 + x} y="20" width={i % 3 ? 2 : 3} height="36" className="scan-guide__ink" />
        ))}
        <rect x="30" y="61" width="60" height="4" rx="2" className="scan-guide__line" />
        {bad && <rect x="18" y="12" width="84" height="60" fill="url(#scan-code-glare)" />}
      </g>
    </svg>
  );
}

// Тарелка сверху с вилкой рядом против тарелки сбоку, обрезанной кадром
function Plate({ bad }) {
  return (
    <svg viewBox="0 0 120 84" aria-hidden="true" focusable="false">
      {bad && <BadDefs id="scan-plate" />}
      {bad ? (
        <g clipPath="url(#scan-plate-crop)">
          <ellipse cx="66" cy="54" rx="48" ry="15" className="scan-guide__paper" />
          <ellipse cx="66" cy="52" rx="34" ry="9" className="scan-guide__line" />
          <ellipse cx="56" cy="47" rx="14" ry="6" className="scan-guide__ink" />
          <ellipse cx="80" cy="48" rx="10" ry="5" className="scan-guide__line" />
        </g>
      ) : (
        <g>
          <circle cx="50" cy="42" r="32" className="scan-guide__paper" />
          <circle cx="50" cy="42" r="24" fill="none" className="scan-guide__paper" />
          <circle cx="42" cy="36" r="10" className="scan-guide__ink" />
          <circle cx="58" cy="48" r="9" className="scan-guide__line" />
          <circle cx="57" cy="31" r="5" className="scan-guide__line" />
          <rect x="98" y="34" width="4" height="40" rx="2" className="scan-guide__ink" />
          <rect x="93" y="26" width="14" height="10" rx="3" className="scan-guide__ink" />
          {[93, 97, 101, 105].map((x) => <rect key={x} x={x} y="12" width="2" height="16" rx="1" className="scan-guide__ink" />)}
        </g>
      )}
    </svg>
  );
}

export default function ScanGuide({ mode }) {
  const Art = mode === 'barcode' ? Barcode : mode === 'plate' ? Plate : Label;
  return (
    <div className="scan-guide">
      <div className="scan-guide__pair">
        <figure className="scan-guide__case scan-guide__case--good">
          <Art />
          <figcaption><IconCheck size={14} className="scan-guide__mark" /> Так</figcaption>
        </figure>
        <figure className="scan-guide__case scan-guide__case--bad">
          <Art bad />
          <figcaption><IconClose size={14} className="scan-guide__mark" /> {BAD[mode]}</figcaption>
        </figure>
      </div>
      <ol className="scan-guide__tips">
        {TIPS[mode].map((t) => <li key={t}>{t}</li>)}
      </ol>
    </div>
  );
}
