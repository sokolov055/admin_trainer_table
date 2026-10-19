import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { QUESTIONS, ROUND_MS, CATEGORIES, LEVELS, activeRound } from './plank-game.js';
import { usePlankSession } from './PlankSession.jsx';
import { createPlankAudio } from './plank-audio.js';
import { useGameChrome, buzz, vibrationOn, setVibration } from './game-feel.js';
import coachAtlas from './assets/plank-coach-v2.png';
import './plank-game.css';

// Атлас 1254×1254: у каждой позы своя рамка (x, y, ширина, высота) и голова для фото.
// Рамки точные, а не четверти: голова стоящего тренера заходит в верхнюю половину атласа.
const POSES = {
  plank: { box: [18, 158, 612, 290], head: [106, 258, 58] },
  strain: { box: [640, 164, 612, 284], head: [722, 262, 58] },
  rest: { box: [150, 636, 366, 536], head: [338, 730, 66] },
  stand: { box: [756, 492, 356, 700], head: [908, 574, 56] },
};
const RING = 2 * Math.PI * 24;
const plural = (n, one, few, many) => n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many;
const rightWord = n => plural(n, 'верный', 'верных', 'верных');
const answersWord = n => plural(n, 'верный ответ', 'верных ответа', 'верных ответов');
const DROP = 'M8 0C12 7 16 12 16 17a8 8 0 0 1-16 0C0 12 4 7 8 0z';

const GRUMBLES = ['Опять правильно?! Я вообще-то устал!', 'Твои знания — мой день ног. Только для рук.', 'Ладно, засчитано. Но я всё запомнил.', 'Руки дрожат. Мой авторитет — пока нет.', 'Ты точно клиент? Может, поменяемся?', 'Ещё один верный ответ. Ещё одна вечность…', 'Я хотел лёгкую разминку. Не вот это всё!', 'Моя планка уже длиннее твоего плейлиста.'];
const Icon = ({ kind }) => <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{kind === 'pause' ? <><path d="M8 5v14M16 5v14" /></> : kind === 'back' ? <path d="m14 5-7 7 7 7" /> : kind === 'sound' ? <><path d="m11 4-6 5H2v6h3l6 5zM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14" /></> : kind === 'mute' ? <><path d="m11 4-6 5H2v6h3l6 5zM16 9l6 6M22 9l-6 6" /></> : kind === 'play' ? <path d="m8 4 12 8-12 8z" /> : kind === 'check' ? <path d="m5 12 4 4 10-10" /> : kind === 'cup' ? <><path d="M7 3h10v7a5 5 0 0 1-10 0zM12 15v6M8 21h8M7 5H3v3a4 4 0 0 0 4 4M17 5h4v3a4 4 0 0 1-4 4" /></> : kind === 'down' ? <path d="m6 9 6 6 6-6" /> : kind === 'menu' ? <path d="M5 7h14M5 12h14M5 17h14" /> : <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>}</svg>;

export default function PlankGame({ onClose, restLeft, restUntil = Infinity, allowPhoto = false }) {
  const [state, session] = usePlankSession();
  const { round, category, level, effects, music, best } = state;
  const [now, setNow] = useState(Date.now());
  const [hidden, setHidden] = useState(document.hidden);
  const [audioError, setAudioError] = useState('');
  const [listening, setListening] = useState(false);
  const [changing, setChanging] = useState(false);
  const [voice, setVoice] = useState(null);
  const [voiceOn, setVoiceOn] = useState(false);
  const [avatar, setAvatar] = useState('');
  const [photoError, setPhotoError] = useState('');
  const avatarRef = useRef('');
  const [menu, setMenu] = useState(false);
  const [vibrate, setVibrate] = useState(vibrationOn);
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const menuButton = useRef(null);
  const clipId = 'plank-clip' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const owner = useRef(Symbol('plank-screen'));
  const stopAtRef = useRef(restUntil); stopAtRef.current = restUntil;
  const audio = useRef(null); audio.current ||= createPlankAudio();
  const owned = state.owner === owner.current;
  const speech = window.speechSynthesis;
  const question = round?.deck[round.index];
  const status = round?.status;
  const seconds = status === 'playing' ? Math.max(0, Math.ceil((round.deadline - now) / 1000)) : status === 'paused' ? Math.ceil(round.remaining / 1000) : 10;
  const standing = ['lost', 'won'].includes(status);
  const paused = status === 'paused' || (!!round && !owned);
  const intense = !paused && (round?.score >= 5 || (status === 'playing' && seconds <= 3));
  const line = !round ? 'Ты отвечаешь. Я держусь. Проверим, кто сдастся первым?' : paused ? 'Теперь твой подход. Я подожду здесь!' : status === 'lost' ? 'Всё, хватит с меня. Иди качайся, сынок!' : status === 'won' ? 'Все ответы верные! Всё, теперь ты тренер.' : status === 'feedback' ? GRUMBLES[(round.score - 1) % GRUMBLES.length] : status === 'listening' ? 'Слушай внимательно. Я пока подержу планку.' : intense ? 'Руки уже дрожат… Давай, думай!' : 'Я в планке. Твои десять секунд пошли!';
  const failAudio = e => { console.warn('Звук мини-игры:', e); setAudioError(e.message); session.configure({ effects: false, music: false }); };
  const effect = kind => { const live = session.getSnapshot(); if (live.effects && live.owner === owner.current && live.round?.status !== 'paused' && !document.hidden) audio.current.effect(kind).catch(failAudio); };

  useLayoutEffect(() => {
    session.claim(owner.current);
    return () => { session.release(owner.current, Date.now(), stopAtRef.current); audio.current.stop(); speech?.cancel(); };
  }, [session, speech]);
  useEffect(() => () => { audio.current.close(); if (avatarRef.current) URL.revokeObjectURL(avatarRef.current); }, []);
  useEffect(() => {
    if (!speech) return;
    const load = () => setVoice(speech.getVoices().find(v => v.localService && /^ru/i.test(v.lang)) || null);
    load(); speech.addEventListener('voiceschanged', load);
    return () => speech.removeEventListener('voiceschanged', load);
  }, [speech]);
  useEffect(() => {
    const visibility = () => {
      setHidden(document.hidden);
      if (document.hidden && session.getSnapshot().owner === owner.current) {
        audio.current.stop(); setListening(false); speech?.cancel();
        session.pause('hidden', Date.now(), stopAtRef.current);
      }
    };
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, [session, speech]);
  useEffect(() => {
    if (!owned) { audio.current.stop(); setListening(false); return; }
    if (!['playing', 'listening', 'feedback'].includes(status)) return;
    const tick = () => { const time = Date.now(); setNow(time); session.tick(time, stopAtRef.current); };
    tick(); const timer = setInterval(tick, 100);
    return () => clearInterval(timer);
  }, [owned, status, session]);
  useEffect(() => {
    if (!owned || paused || hidden) { audio.current.stop(); setListening(false); speech?.cancel(); return; }
    if (status === 'feedback') { effect(round.score % 5 === 0 ? 'milestone' : 'correct'); buzz(round.score % 5 === 0 ? 'great' : 'good'); }
    if (status === 'lost') { audio.current.stop(); effect('wrong'); buzz('bad'); }
    if (status === 'won') effect('win');
  }, [status, owned, hidden]);
  useGameChrome(rootRef);
  // Меню: фокус внутрь при открытии и обратно на кнопку при закрытии, Esc закрывает
  useEffect(() => {
    if (!menu) return;
    const behind = [...(rootRef.current?.children || [])].filter(node => node !== menuRef.current);
    behind.forEach(node => { node.inert = true; });
    menuRef.current?.querySelector('input, button')?.focus({ preventScroll: true });
    const key = e => { if (e.key === 'Escape') closeMenu(); };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); behind.forEach(node => { node.inert = false; }); if (menuButton.current?.isConnected) menuButton.current.focus({ preventScroll: true }); };
  }, [menu]);
  useEffect(() => {
    if (owned && !hidden && status === 'playing' && seconds > 0 && seconds <= 3 && !question.audio && !listening) effect('tick');
  }, [seconds, owned, hidden, status]);
  useEffect(() => {
    if (!music || !owned || hidden || paused || listening || standing || question?.audio) { audio.current.stopBackground(); return; }
    audio.current.background().catch(failAudio);
    return () => audio.current.stopBackground();
  }, [music, owned, hidden, paused, listening, standing, status, question?.id]);
  useEffect(() => {
    if (!voiceOn || !voice || !owned || hidden || paused || listening || status === 'listening') return;
    speech.cancel();
    const words = new SpeechSynthesisUtterance(line); words.voice = voice; words.lang = 'ru-RU';
    speech.speak(words);
    return () => speech.cancel();
  }, [line, voiceOn, voice, owned, hidden, paused, listening, speech]);

  const choosePhoto = event => {
    const file = event.target.files?.[0]; if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { setPhotoError('Выберите JPG, PNG или WebP до 5 МБ.'); return; }
    if (avatarRef.current) URL.revokeObjectURL(avatarRef.current);
    avatarRef.current = URL.createObjectURL(file); setAvatar(avatarRef.current); setPhotoError('');
  };
  const listenQuestion = async () => {
    session.tick(Date.now(), restUntil);
    const r = session.getSnapshot().round;
    if (!owned || !r?.deck[r.index].audio || listening || !['playing', 'listening'].includes(r.status)) return;
    speech?.cancel(); setAudioError(''); setListening(true);
    try { if (await audio.current.play(r.deck[r.index].audio)) { session.tick(Date.now(), stopAtRef.current); session.listened(r); setNow(Date.now()); } }
    catch (e) { failAudio(e); }
    finally { setListening(false); }
  };
  const start = () => { if (Date.now() >= restUntil) return; session.claim(owner.current); audio.current.stop(); speech?.cancel(); setListening(false); setAudioError(''); setNow(Date.now()); session.start(); effect('start'); buzz('tap'); };
  const resume = () => { if (document.hidden || Date.now() >= restUntil) return; session.claim(owner.current); setNow(Date.now()); session.resume(); effect('resume'); };
  const answer = index => { audio.current.stop(); setListening(false); session.answer(index, Date.now(), restUntil); };
  const toggleSound = async () => {
    if (effects || music || voiceOn) { session.configure({ effects: false, music: false }); setVoiceOn(false); audio.current.stop(); speech?.cancel(); setListening(false); }
    else { try { await audio.current.unlock(); session.configure({ effects: true }); effect('resume'); } catch (e) { failAudio(e); } }
  };
  const chooseCategory = () => { audio.current.stop(); speech?.cancel(); if (activeRound(round)) { session.pause(); setChanging(true); } else session.home(); };
  const pool = QUESTIONS.filter(q => (category === 'all' || q.category === category) && (!level || q.level === level));
  const fresh = pool.filter(q => !state.seen.includes(q.id)).length;

  const inRest = typeof restLeft === 'number';
  const pose = POSES[standing ? 'stand' : paused ? 'rest' : intense || status === 'feedback' ? 'strain' : 'plank'];
  const [hx, hy, hr] = pose.head;
  const share = status === 'playing' ? Math.max(0, Math.min(1, (round.deadline - now) / ROUND_MS)) : 1;
  const urgent = status === 'playing' && seconds <= 3;
  const timed = ['playing', 'listening'].includes(status) && owned;
  const phase = !round ? 'start' : paused ? 'paused' : status === 'feedback' ? 'feedback' + round.index : standing ? status : 'q' + round.index;
  const openMenu = () => { setChanging(false); setMenu(true); };
  const closeMenu = () => { setMenu(false); setChanging(false); };
  // Незавершённую партию «Выбрать другую категорию» ставит на паузу и спрашивает; иначе сразу к выбору темы
  const pickCategory = () => { const active = activeRound(round); chooseCategory(); if (!active) setMenu(false); };
  const setEffects = async on => { if (!on) { session.configure({ effects: false }); audio.current.stop(); return; } try { await audio.current.unlock(); session.configure({ effects: true }); } catch (e) { failAudio(e); } };

  return <section ref={rootRef} className={'plank-game' + (round ? ' plank-game--question' : '') + (paused ? ' plank-game--paused' : '') + (question?.image || question?.picture ? ' plank-game--media' : '') + (standing ? ' plank-game--standing' : '') + (timed ? ' plank-game--timed' : '') + (menu ? ' plank-game--menu' : '')} aria-label="Тренер в планке">
    <div className={'plank-game__scene' + (intense ? ' plank-game__scene--intense' : '')}>
      <div className="plank-game__hud">
        {onClose && <button type="button" className="plank-game__icon-button" aria-label={inRest ? 'К отдыху' : 'Свернуть игру'} onClick={onClose}><Icon kind="down" /></button>}
        <div className="plank-game__score">
          <strong>{round ? round.points : best || 0}</strong>
          <span>{round ? `очков · ${round.score} ${rightWord(round.score)}` : best ? 'рекорд сессии' : 'очков'}</span>
        </div>
        <button type="button" className="plank-game__icon-button" aria-label={effects || music || voiceOn ? 'Выключить звук' : 'Включить звук'} aria-pressed={effects || music || voiceOn} onClick={toggleSound}><Icon kind={effects || music || voiceOn ? 'sound' : 'mute'} /></button>
        {activeRound(round) && !paused
          ? <button type="button" className="plank-game__icon-button" aria-label="Пауза" onClick={() => session.pause()}><Icon kind="pause" /></button>
          : <button type="button" ref={menuButton} className="plank-game__icon-button" aria-label="Меню игры" aria-haspopup="dialog" aria-expanded={menu} onClick={openMenu}><Icon kind="menu" /></button>}
      </div>
      <div className="plank-game__stage">
        {(inRest || timed) && <div className="plank-game__status">
          {inRest && <div className="plank-game__rest"><Icon kind="clock" /><span>До подхода<strong>{Math.max(0, Math.ceil(restLeft / 1000))} с</strong></span></div>}
          {timed && <div className={'plank-game__timer' + (urgent ? ' is-urgent' : '') + (status === 'listening' ? ' is-waiting' : '')}>
            <svg viewBox="0 0 56 56" aria-hidden="true"><circle cx="28" cy="28" r="24" /><circle cx="28" cy="28" r="24" style={{ strokeDashoffset: RING * (1 - share) }} /></svg>
            {status === 'playing' ? <strong role="timer" aria-live="off">{seconds}</strong> : <strong aria-hidden="true">10</strong>}
            {urgent && <i key={seconds} aria-hidden="true" />}
          </div>}
        </div>}
        <p className="plank-game__speech" role="status"><span key={line}>{line}</span></p>
        <div className={'plank-game__coach' + (standing ? ' plank-game__coach--standing' : paused ? ' plank-game__coach--resting' : intense || status === 'feedback' ? ' plank-game__coach--straining' : '') + (owned && ['playing', 'listening'].includes(status) ? ' plank-game__coach--holding' : '')} role="img" aria-label={standing ? 'Тренер встал с планки' : paused ? 'Тренер отдыхает на паузе' : 'Тренер держит планку'} style={{ aspectRatio: `${pose.box[2]} / ${pose.box[3]}` }}>
          <svg className="plank-game__coach-art" viewBox={pose.box.join(' ')} preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">
            <defs>
              <clipPath id={clipId + 'pose'}><rect x={pose.box[0]} y={pose.box[1]} width={pose.box[2]} height={pose.box[3]} /></clipPath>
              <clipPath id={clipId + 'head'}><circle cx={hx} cy={hy} r={hr} /></clipPath>
            </defs>
            <g clipPath={`url(#${clipId}pose)`}>
              <image href={coachAtlas} x="0" y="0" width="1254" height="1254" />
              {avatar && <image className="plank-game__avatar" href={avatar} x={hx - hr} y={hy - hr} width={hr * 2} height={hr * 2} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clipId}head)`} onError={() => { setAvatar(''); setPhotoError('Фото не открылось. Выберите другое.'); }} />}
              {intense && !standing && <g className="plank-game__sweat" transform={`translate(${hx - 70} ${hy - 50})`}><g><path d={DROP} /></g><g transform="translate(-26 22)"><path d={DROP} /></g><g transform="translate(-6 44)"><path d={DROP} /></g></g>}
            </g>
          </svg>
        </div>
      </div>
      {status === 'feedback' && <div key={round.index} className="plank-game__reward" aria-hidden="true">+{round.earned}<span>{round.score % 5 === 0 ? 'Отличная серия!' : 'Точно!'}</span></div>}
      {status === 'won' && <div className="plank-game__confetti" aria-hidden="true">{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ left: `${7 + i * 7}%`, animationDelay: `${(i % 4) * .1}s` }} />)}</div>}
    </div>
    <div className="plank-game__sheet">
      <div key={phase} className="plank-game__sheet-body">
        {!round ? <>
          <h2 className="plank-game__title">Тренер в планке</h2>
          <p className="plank-game__rules">10 секунд на ответ. Верно — тренер держится, ошибка — он сдаётся.</p>
          <div className="plank-game__choices"><label>Тема<select aria-label="Категория" value={category} onChange={e => session.configure({ category: e.target.value })}><option value="all">Всё вперемешку</option>{CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Сложность<select aria-label="Сложность" value={level} onChange={e => session.configure({ level: Number(e.target.value) })}>{LEVELS.map((name, i) => <option key={name} value={i}>{name}</option>)}</select></label></div>
          <button type="button" className="plank-game__primary" onClick={start}><Icon kind="play" />Поставить тренера в планку</button>
          <p className="plank-game__note">В подборке {pool.length} вопросов · новых {fresh}. {fresh === 0 ? 'Подборка пройдена — перемешаем её заново.' : 'Сначала идут ещё не показанные.'}</p>
        </> : <>
          {['playing', 'listening'].includes(status) && owned && <>
            <div className={'plank-game__time' + (seconds <= 3 ? ' is-urgent' : '')} aria-hidden="true"><span style={{ transform: `scaleX(${share})` }} /></div>
            <p className="plank-game__topic">Вопрос {round.index + 1} из {round.deck.length} · {CATEGORIES.find(c => c.id === question.category)?.name} · {LEVELS[question.level]}</p>
            <h3 className="plank-game__question-text">{question.text}</h3>
            {question.image && <img className="plank-game__question-image" src={`${import.meta.env?.BASE_URL || '/'}anim/${question.image}/0.jpg`} alt="Упражнение для вопроса" />}
            {question.picture && <div role="img" aria-label="Продукт для вопроса" className={'plank-game__food plank-game__food--' + question.picture} />}
            {question.audio && <div className="plank-game__listen"><button type="button" disabled={listening} onClick={listenQuestion}><Icon kind="sound" />{listening ? 'Слушаем…' : status === 'listening' ? 'Слушать задание' : 'Послушать ещё'}</button><span className={'plank-game__wave' + (listening ? ' is-playing' : '')} aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <i key={i} style={{ animationDelay: `${i * .06}s`, height: `${9 + (i % 4) * 5}px` }} />)}</span>{status === 'listening' && <small>10 секунд начнутся после фрагмента.</small>}</div>}
            <div className="plank-game__answers">{question.answers.map((text, i) => <button type="button" disabled={status === 'listening'} key={text} onClick={() => answer(i)}><span aria-hidden="true">{['А', 'Б', 'В'][i]}</span>{text}</button>)}</div>
          </>}
          {status === 'feedback' && owned && <div className="plank-game__result"><div className="plank-game__result-mark"><Icon kind="check" /></div><h3>{round.score % 5 === 0 ? `${round.score} подряд. Вот это серия!` : 'Верно! Продолжаем?'}</h3><p>{question.why}</p><button type="button" className="plank-game__primary" onClick={() => { const time = Date.now(); setNow(time); session.tick(time, restUntil); session.next(time); }}>{round.score === round.deck.length ? 'Забрать победу' : 'Следующий вопрос'}<Icon kind="play" /></button></div>}
          {paused && <div className="plank-game__result"><h3>Игра на паузе</h3><p>{round.pauseReason === 'rest' ? 'Отдых окончен. Сделай подход, а потом продолжим с этого места.' : 'Вопрос, счёт и оставшееся время сохранены. Продолжим, когда будешь готов.'}</p><p className="plank-game__note">{round.pausedFrom === 'playing' ? `На ответ осталось ${seconds} с.` : round.pausedFrom === 'feedback' ? 'Ответ уже засчитан.' : 'Звуковой фрагмент можно прослушать заново.'} Партия хранится до перезагрузки приложения.</p><button type="button" className="plank-game__primary" disabled={hidden || Date.now() >= restUntil} onClick={resume}><Icon kind="play" />Продолжить игру</button></div>}
          {standing && <div className="plank-game__result"><h3>{status === 'won' ? 'Ты победил!' : 'Игра окончена'}</h3><p className="plank-game__final-score">{round.points}<span>очков · {round.score} {answersWord(round.score)}</span></p>{status === 'lost' && <><p>{round.reason === 'timeout' ? 'Не успел ответить.' : 'Ответ неверный.'} Правильный ответ: <strong>{question.answers[question.correct]}</strong></p><p>{question.why}</p></>}<button type="button" className="plank-game__primary" onClick={start}>Сыграть ещё<Icon kind="play" /></button><button type="button" className="plank-game__text-button" onClick={pickCategory}>Другая тема</button></div>}
        </>}
        {audioError && <p className="plank-game__error" role="alert">{audioError}</p>}
      </div>
    </div>
    {menu && <div className="plank-game__menu" role="dialog" aria-modal="true" aria-label="Меню игры" ref={menuRef}>
      <div className="plank-game__menu-body">
        <h2 className="plank-game__title">Меню</h2>
        <div className="plank-game__menu-group" role="group" aria-label="Звук и музыка">
          <h3>Звук и музыка</h3>
          <label className="plank-game__check"><input type="checkbox" checked={effects} onChange={e => setEffects(e.target.checked)} />Звуковые эффекты</label>
          <label className="plank-game__check"><input type="checkbox" checked={music} onChange={async e => { if (!e.target.checked) { session.configure({ music: false }); return; } try { await audio.current.unlock(); session.configure({ music: true }); } catch (error) { failAudio(error); } }} />Фоновая музыка</label>
          {voice && <label className="plank-game__check"><input type="checkbox" checked={voiceOn} onChange={e => { speech?.cancel(); setVoiceOn(e.target.checked); }} />Голос тренера</label>}
          <label className="plank-game__check"><input type="checkbox" checked={vibrate} onChange={e => { setVibration(e.target.checked); setVibrate(e.target.checked); if (e.target.checked) buzz('tap'); }} />Вибрация</label>
          <p className="plank-game__note">Музыка затихает во время звуковых заданий. На паузе всё беззвучно. Вибрация работает на Android; на iPhone браузер её не поддерживает.</p>
        </div>
        {round && <button type="button" className="plank-game__secondary" onClick={pickCategory}>Выбрать другую категорию</button>}
        {changing && <div className="plank-game__confirm" role="group" aria-label="Начать новую партию"><p>Новая тема начнёт новую партию. Текущий счёт сбросится.</p><button type="button" onClick={() => { session.home(); setChanging(false); setMenu(false); }}>Сбросить партию</button><button type="button" onClick={() => setChanging(false)}>Оставить текущую</button></div>}
        {allowPhoto && <div className="plank-game__photo"><label>Примерить фото тренера<input type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} /></label>{avatar && <button type="button" className="plank-game__text-button" onClick={() => { URL.revokeObjectURL(avatarRef.current); avatarRef.current = ''; setAvatar(''); }}>Убрать фото</button>}<p className="plank-game__note">Фото только для примерки, на сервер не отправляется.</p>{photoError && <p role="alert">{photoError}</p>}</div>}
        <button type="button" className="plank-game__primary" onClick={closeMenu}>К игре</button>
      </div>
    </div>}
  </section>;
}
