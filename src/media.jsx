import React, { useEffect, useState } from 'react';
import { haptic } from './telegram.js';
import { mediaUrl, youtubeEmbed } from './library.js';

/**
 * Видео и анимация техники упражнения.
 *
 * Отдельным файлом, а не в библиотеке тренера: их показывает и клиент в
 * программе, и тянуть ради этого к клиенту всю библиотеку (с редактором
 * программ и блюдами) незачем — экраны грузятся по требованию (lazy.js).
 */

const ANIM_ID = /^[\w-]+$/;

function prefersStill() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; }
}

/**
 * Анимация техники из двух кадров — начало и конец движения.
 *
 * Кадры — из free-exercise-db (общественное достояние), лежат в самом
 * приложении: public/anim/<id>/. Верхний кадр плавно проявляется поверх
 * нижнего, поэтому посередине смены не бывает пустоты. Нажатие ставит на
 * паузу; тем, кто просил систему меньше двигать, анимация сама не
 * запускается — только по нажатию.
 */
export function Animation({ id }) {
  const [frame, setFrame] = useState(0);
  const [loaded, setLoaded] = useState(0);
  const [playing, setPlaying] = useState(() => !prefersStill());

  useEffect(() => {
    if (!playing || loaded < 2) return undefined;
    const timer = setInterval(() => setFrame((f) => 1 - f), 1100);
    return () => clearInterval(timer);
  }, [playing, loaded]);

  if (!ANIM_ID.test(id || '')) return null;
  const src = (n) => `${(import.meta.env && import.meta.env.BASE_URL) || '/'}anim/${id}/${n}.jpg`;
  const onLoad = () => setLoaded((n) => n + 1);

  return (
    <button
      type="button"
      className="library__anim"
      aria-label={playing ? 'Остановить анимацию' : 'Показать движение'}
      onClick={() => { setPlaying(!playing); haptic(); }}
    >
      <img src={src(0)} alt="Начало движения" onLoad={onLoad} draggable="false" />
      <img src={src(1)} alt="Конец движения" onLoad={onLoad} draggable="false" data-off={frame === 0 ? '' : undefined} />
      {!playing && <span className="library__anim-note">Нажмите — покажу движение</span>}
    </button>
  );
}

export function Media({ media }) {
  if (!media) return null;
  if (media.kind === 'animation') return <Animation id={media.url} />;
  if (media.kind === 'file') {
    return <video className="library__video" src={mediaUrl(media.url)} controls playsInline preload="metadata" />;
  }
  const embed = youtubeEmbed(media.url);
  if (embed) {
    return (
      <iframe
        className="library__video"
        src={embed}
        title="Видео упражнения"
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    );
  }
  return <a className="button button--block" href={media.url} target="_blank" rel="noreferrer">Открыть видео</a>;
}


/**
 * «Как настроить тренажёр» — короткая инструкция к упражнению (01.10.2026).
 *
 * Строки с «Ошибка:» — частые промахи, их выносим отдельным тоном, чтобы
 * глаз находил их сразу. Сама инструкция общая, без марок: залы разные,
 * а регулировки у тренажёров одни и те же — сиденье, спинка, валик, упор.
 */
export function SetupText({ text }) {
  if (!text) return null;
  const lines = String(text).split('\n').map((l) => l.trim()).filter(Boolean);
  const steps = lines.filter((l) => !/^ошибка:/i.test(l));
  const cap = (l) => l.charAt(0).toUpperCase() + l.slice(1);
  const mistakes = lines.filter((l) => /^ошибка:/i.test(l)).map((l) => cap(l.replace(/^ошибка:\s*/i, '')));
  return (
    <div className="setup">
      <ul className="setup__steps">{steps.map((l, i) => <li key={i}>{l}</li>)}</ul>
      {mistakes.length > 0 && (
        <div className="setup__mistakes">
          <strong>{mistakes.length > 1 ? 'Частые ошибки' : 'Частая ошибка'}</strong>
          <ul>{mistakes.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
