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

/**
 * Фото тренажёра: превью по ширине, касание — целиком (снимок вертикальный,
 * а настройка видна по деталям — сиденью, валику)
 */
export function MachinePhoto({ machine }) {
  const [full, setFull] = useState(false);
  if (!machine.photo) return null;
  return (
    <button type="button" className={'machine__photo' + (full ? ' machine__photo--full' : '')}
      aria-label={full ? 'Уменьшить фото' : 'Фото целиком'} onClick={() => { setFull(!full); haptic(); }}>
      <img src={mediaUrl(machine.photo)} alt={'Тренажёр «' + machine.name + '»'} loading="lazy" draggable="false" />
    </button>
  );
}

/**
 * Личная настройка клиента на тренажёре (07.10.2026): «спинка 3, сиденье
 * 5» — у каждого клиента своя, поэтому живёт не у тренажёра, а у клиента.
 * Видна первой: ради неё в зале и открывают
 */
export function PersonalNote({ text, trainer = false, by = '' }) {
  if (!text) return null;
  return (
    <div className="machine__note">
      <strong>{trainer ? 'Настройка клиента' : 'Ваша настройка' + (by === 'trainer' ? ' · записал тренер' : '')}</strong>
      <span>{text}</span>
    </div>
  );
}

/**
 * Тренажёр (07.10.2026, FT-478): фото, личная настройка клиента (цифры —
 * у каждого свои), где у этого тренажёра регулировки (без цифр) и общий
 * принцип упражнения (principle)
 */
export function MachineInfo({ machine, principle = '', note = '', trainer = false }) {
  return (
    <div className="machine">
      <MachinePhoto machine={machine} />
      <PersonalNote text={note} trainer={trainer} />
      {machine.setup && <><h5 className="machine__h">Где регулировки</h5><SetupText text={machine.setup} /></>}
      {principle && <><h5 className="machine__h">Как настроить</h5><SetupText text={principle} /></>}
    </div>
  );
}

/**
 * Тренажёры упражнения в карточке программы: каждый раскрывается фото,
 * личной настройкой и регулировками; общий принцип — под списком один раз.
 * notes — личные настройки клиента { 'm:<uid>': текст }
 */
export function MachineList({ machines, notes = {} }) {
  if (!machines || !machines.length) return null;
  return (
    <div className="machines">
      <h4 className="setup__title">{machines.length > 1 ? 'Тренажёры' : 'Тренажёр'}</h4>
      {machines.map((m) => (
        <details key={m.uid} className="machines__item">
          <summary>
            {m.photo && <img className="machines__thumb" src={mediaUrl(m.photo)} alt="" loading="lazy" draggable="false" />}
            <span>{m.name}</span>
            {notes['m:' + m.uid] && <span className="machines__mine">ваша настройка</span>}
          </summary>
          <MachineInfo machine={m} note={notes['m:' + m.uid]} />
        </details>
      ))}
    </div>
  );
}
