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

