import { instructionParts } from './equipment-guidance.js';
import React, { useEffect, useState } from 'react';
import { haptic } from './telegram.js';
import { apiMutate } from './api.js';
import { mediaUrl } from './library.js';
import { useVideoSrc } from './offline-media.js';
import { isOffline, queueWrite } from './offline-writes.js';
import { useReveal } from './reveal.js';

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
  if (media.kind === 'clip') return <Clip url={media.url} />;
  if (media.kind === 'file') return <FileVideo url={media.url} />;
  // Чужой плеер (YouTube и др.) не встраиваем (14.10.2026): он грузится сам
  // при открытии карточки и передаёт адрес клиента за рубеж без его действия.
  // Ссылка открывается только по нажатию — как переход на любой сайт.
  return <a className="button button--block" href={media.url} target="_blank" rel="noreferrer">Открыть видео</a>;
}


/**
 * Ролик техники с 3D-манекеном на тренажёре (18.10.2026): короткий, без
 * звука, крутится сам, как анимация. Касание — пауза. Тем, кто просил
 * систему меньше двигать, сам не запускается.
 */
function Clip({ url }) {
  const [still] = useState(prefersStill);
  const [paused, setPaused] = useState(still);
  const toggle = (e) => {
    const v = e.currentTarget.querySelector('video');
    if (!v) return;
    if (v.paused) { v.play().catch(() => {}); setPaused(false); } else { v.pause(); setPaused(true); }
    haptic();
  };
  return (
    <button type="button" className="library__clip" aria-label={paused ? 'Показать движение' : 'Остановить ролик'} onClick={toggle}>
      <video src={mediaUrl(url)} autoPlay={!still} muted loop playsInline preload="auto" disablePictureInPicture />
      {paused && <span className="library__anim-note">Нажмите — покажу движение</span>}
    </button>
  );
}

/** Видео-файл с сервера; скачанное заранее — с телефона, без сети тоже (FT-566) */
function FileVideo({ url }) {
  const src = useVideoSrc(url, mediaUrl(url));
  return <video className="library__video" src={src} controls playsInline preload="metadata" />;
}

/**
 * «Как настроить тренажёр» — короткая инструкция к упражнению (01.10.2026).
 *
 * Строки с «Ошибка:» — частые промахи, их выносим отдельным тоном, чтобы
 * глаз находил их сразу. Сама инструкция общая, без марок: залы разные,
 * а регулировки у тренажёров одни и те же — сиденье, спинка, валик, упор.
 */
export const setupParts = instructionParts;

export function SetupMistakes({ mistakes = [] }) {
  if (!mistakes.length) return null;
  return <div className="setup__mistakes">
    <strong>{mistakes.length > 1 ? 'Частые ошибки' : 'Частая ошибка'}</strong>
    <ul>{mistakes.map((l, i) => <li key={i}>{l}</li>)}</ul>
  </div>;
}

export function SetupText({ text, showMistakes = true }) {
  if (!text) return null;
  const { steps, mistakes } = setupParts(text);
  return (
    <div className="setup">
      <ul className="setup__steps">{steps.map((l, i) => <li key={i}>{l}</li>)}</ul>
      {showMistakes && <SetupMistakes mistakes={mistakes} />}
    </div>
  );
}

/**
 * Фото тренажёра: превью по ширине, касание — целиком (снимок вертикальный,
 * а настройка видна по деталям — сиденью, валику)
 */
export function MachinePhoto({ machine }) {
  const [full, setFull] = useState('');
  // Фото несколько (09.10.2026): лентой, листаются пальцем. Каждое — целиком,
  // без обрезки: вертикальный снимок тренажёра раньше срезало по высоте
  const photos = machine.photos && machine.photos.length ? machine.photos : machine.photo ? [machine.photo] : [];
  if (!photos.length) return null;
  const many = photos.length > 1;
  return (
    <div className={'machine__photos' + (many ? ' machine__photos--many' : '')}>
      {photos.map((u, i) => (
        <button key={u} type="button" className={'machine__photo' + (full === u ? ' machine__photo--full' : '')}
          aria-label={(full === u ? 'Уменьшить фото' : 'Фото целиком') + (many ? ' ' + (i + 1) + ' из ' + photos.length : '')}
          onClick={() => { setFull(full === u ? '' : u); haptic(); }}>
          <img src={mediaUrl(u)} alt={(machine.kind === 'equipment' ? 'Оборудование «' : 'Тренажёр «') + machine.name + '»'} loading="lazy" draggable="false" />
        </button>
      ))}
    </div>
  );
}

/**
 * Ключ настройки тренажёра uid в упражнении (FT-759, 26.10.2026):
 * m:<uid>|<name_key> — на одном тренажёре делают несколько упражнений, и
 * настройка у них своя. Без ключа упражнения — прежний m:<uid>
 */
export function machineTarget(info, uid) {
  const key = info && info.noteKey ? String(info.noteKey).slice(2) : '';
  return 'm:' + uid + (key ? '|' + key : '');
}

/**
 * Личная настройка клиента на тренажёре (07.10.2026): «спинка 3, сиденье
 * 5» — у каждого клиента своя, поэтому живёт не у тренажёра, а у клиента.
 * Видна первой: ради неё в зале и открывают. shared — старая, записанная на
 * тренажёр без упражнения, и чья она, не понять (FT-759): пометка, пока не
 * запишут свою для упражнения
 */
export function PersonalNote({ text, trainer = false, by = '', local = false, label = '', shared = false }) {
  if (!text) return null;
  return (
    <div className="machine__note">
      <strong>{trainer ? 'Настройка клиента' : 'Ваша настройка' + (by === 'trainer' ? ' · записал тренер' : '')}{label ? ' · ' + label : ''}{shared ? ' · для тренажёра' : ''}{local ? ' · на телефоне, отправится при связи' : ''}</strong>
      <span>{text}</span>
    </div>
  );
}

/**
 * Своя настройка тренажёра (07.10.2026): «спинка 3, сиденье 5». У каждого
 * клиента своя, поэтому живёт не у тренажёра, а у клиента; записывает он
 * сам или тренер в его занятии, и в следующий раз она здесь же — первой.
 * Пустой текст — стереть
 */
/**
 * label — название тренажёра, когда их у упражнения несколько (штанга,
 * скамья): у каждого своя настройка. note.from — настройка показана со
 * старого ключа упражнения (сервер, withLegacyNotes): сохранение переносит её
 */
// plaque — плашкой в шапке упражнения занятия (вариант А3, владелец,
// 24.10.2026): подпись сверху, цифры или «+ Записать» снизу, касание —
// правка; рядом стоит кнопка «Тренажёр» той же высоты
export function MachineNote({ target, label = '', note, trainer, params, onSaved, plaque = false }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note ? note.text : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (!editing) setText(note ? note.text : ''); }, [note, editing]);
  // Поле и «Сохранить» — на экран, не под нижнее меню (FT-595)
  const formRef = useReveal(editing && (error || 'open'));

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const request = { ...params, target, text, ...(note && note.from ? { legacy: note.from } : {}) };
      let saved;
      try {
        saved = (await apiMutate('client.machine.note.save', request)).note;
      } catch (e) {
        // Нет связи (FT-566, этап 2): настройку — на телефон, на сервер — при
        // связи. Отказ сервера — показать, как раньше
        if (!isOffline(e)) throw e;
        await queueWrite('note', request);
        const clean = String(text || '').trim();
        saved = clean ? { text: clean, by: trainer ? 'trainer' : 'client', local: true } : null;
      }
      haptic('success');
      onSaved(saved);
      setEditing(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!editing && plaque) {
    // Тренажёров несколько — подпись короче: их имя («Стойка у зеркала»),
    // чья настройка и кто записал — в листе «Тренажёр»
    const whose = trainer ? 'Настройка клиента' : 'Моя настройка';
    const head = (label || whose) + (note && note.shared ? ' · для тренажёра' : '') + (note && note.local ? ' · не отправлена' : '');
    return <button type="button" className={'workout__plaque' + (note ? '' : ' workout__plaque--empty')}
      aria-label={whose + (label ? ' · ' + label : '') + (note ? ': ' + note.text + '. Изменить' : ': не записана. Записать')}
      onClick={() => setEditing(true)}>
      <span className="workout__plaque-head">{head}</span>
      {/* «4-й» не рвётся на «4-» и «й»: дефис после цифры — неразрывный */}
      <span className="workout__plaque-value">{note ? note.text.replace(/(\d)-(?=[а-яё])/gi, '$1‑') : label ? '+ Записать настройку' : '+ Записать'}</span>
    </button>;
  }
  if (!editing) {
    return note
      ? <div className="workout__note">
        <PersonalNote text={note.text} trainer={trainer} by={note.by} local={!!note.local} label={label} shared={!!note.shared} />
        <button type="button" className="workout__note-edit" onClick={() => setEditing(true)}>Изменить</button>
      </div>
      // Пустая — плашкой на том же месте, что записанная (вариант А2,
      // владелец, 24.10.2026): видно сразу, что её нет, и искать не надо
      : <button type="button" className="workout__note-add" onClick={() => setEditing(true)}>
        <span className="workout__note-add-text">{(trainer ? 'Настройка клиента не записана' : 'Моя настройка не записана') + (label ? ' · ' + label : '')}</span>
        <span className="workout__note-add-act">Записать</span>
      </button>;
  }
  return <div className="workout__note-form" ref={formRef}>
    <textarea className="field__input" rows={2} maxLength={300} value={text} autoFocus
      aria-label={(trainer ? 'Настройка клиента' : 'Своя настройка') + (label ? ': ' + label : '')}
      placeholder="Спинка 3, сиденье 5, упор на 2-й" onChange={(e) => setText(e.target.value)} />
    {error && <p className="small danger">{error}</p>}
    <div className="workout__note-actions">
      <button type="button" className="button" disabled={busy} onClick={save}>{busy ? 'Сохраняю…' : 'Сохранить'}</button>
      <button type="button" className="button button--ghost" disabled={busy} onClick={() => setEditing(false)}>Отмена</button>
    </div>
  </div>;
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
      {machine.setup && <><h5 className="machine__h">{machine.kind === 'equipment' ? 'Настройка' : 'Где регулировки'}</h5><SetupText text={machine.setup} /></>}
      {principle && <><h5 className="machine__h">Как настроить</h5><SetupText text={principle} /></>}
    </div>
  );
}

/**
 * Тренажёры упражнения в карточке программы: каждый раскрывается фото,
 * личной настройкой и регулировками; общий принцип — под списком один раз.
 * notes — личные настройки клиента { machineTarget: текст }, noteKey —
 * упражнения, в котором тренажёры
 */
export function MachineList({ machines, notes = {}, noteKey = '' }) {
  if (!machines || !machines.length) return null;
  return (
    <div className="machines">
      <h4 className="setup__title">{machines.every((m) => m.kind === 'equipment') ? 'Оборудование' : machines.length > 1 ? 'Тренажёры' : 'Тренажёр'}</h4>
      {machines.map((m) => (
        <details key={m.uid} className="machines__item">
          <summary>
            {m.photo && <img className="machines__thumb" src={mediaUrl(m.photo)} alt="" loading="lazy" draggable="false" />}
            <span>{m.name}</span>
            {notes[machineTarget({ noteKey }, m.uid)] && <span className="machines__mine">ваша настройка</span>}
          </summary>
          <MachineInfo machine={m} note={notes[machineTarget({ noteKey }, m.uid)]} />
        </details>
      ))}
    </div>
  );
}
