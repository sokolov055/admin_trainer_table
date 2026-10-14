import React, { useEffect, useRef, useState } from 'react';
import { QUESTIONS, ROUND_MS, CATEGORIES, LEVELS, makeDeck, judgeAnswer } from './plank-game.js';
import { createPlankAudio } from './plank-audio.js';
import './plank-game.css';

const GRUMBLES = ['Верно. А мне ещё стоять?!', 'Опять угадал! Руки уже дрожат…', 'Ты отвечаешь, а я страдаю. Честно?', 'Правильно! Кто придумал эту игру?!'];

export default function PlankGame({ onClose, restLeft, allowPhoto = false }) {
  const [round, setRound] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [sound, setSound] = useState(false);
  const [voice, setVoice] = useState(null);
  const [hidden, setHidden] = useState(false);
  const [category, setCategory] = useState('all');
  const [level, setLevel] = useState(0);
  const [background, setBackground] = useState(false);
  const [audioError, setAudioError] = useState('');
  const [listening, setListening] = useState(false);
  const audioRef = useRef(null);
  audioRef.current ||= createPlankAudio();
  useEffect(() => () => audioRef.current.close(), []);
  const [avatar, setAvatar] = useState('');
  const [photoError, setPhotoError] = useState('');
  const avatarRef = useRef('');
  useEffect(() => () => { if (avatarRef.current) URL.revokeObjectURL(avatarRef.current); }, []);
  const choosePhoto = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { setPhotoError('Выберите JPG, PNG или WebP размером до 5 МБ.'); return; }
    if (avatarRef.current) URL.revokeObjectURL(avatarRef.current);
    avatarRef.current = URL.createObjectURL(file); setAvatar(avatarRef.current); setPhotoError('');
  };
  const roundRef = useRef(round);
  roundRef.current = round;
  const speech = typeof window === 'undefined' ? null : window.speechSynthesis;
  useEffect(() => {
    if (!speech) return undefined;
    const load = () => setVoice(speech.getVoices().find(v => v.localService && /^ru/i.test(v.lang)) || null);
    load(); speech.addEventListener('voiceschanged', load);
    return () => { speech.removeEventListener('voiceschanged', load); speech.cancel(); };
  }, [speech]);
  useEffect(() => {
    const visibility = () => {
      setHidden(document.hidden);
      if (document.hidden) {
        audioRef.current.stop(); setListening(false);
        speech?.cancel();
        setRound(r => ['playing', 'listening'].includes(r?.status) ? { ...r, status: 'paused', pausedFrom: r.status, remaining: Math.max(0, r.deadline - Date.now()) } : r);
      }
    };
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, [speech]);
  useEffect(() => {
    if (round?.status !== 'playing') return undefined;
    const tick = () => {
      const time = Date.now(); setNow(time);
      setRound(r => r?.status === 'playing' && time >= r.deadline ? { ...r, status: 'lost', reason: 'timeout', line: 'Время вышло. Иди качайся, сынок!' } : r);
    };
    const timer = setInterval(tick, 100);
    return () => clearInterval(timer);
  }, [round?.status]);
  useEffect(() => {
    if (!sound || !voice || !round?.line || hidden) return;
    speech.cancel();
    const words = new SpeechSynthesisUtterance(round.line); words.voice = voice; words.lang = 'ru-RU';
    speech.speak(words);
  }, [round?.line, sound, voice, hidden, speech]);

  useEffect(() => {
    if (!background || hidden || listening || round?.status === 'listening' || round?.status === 'paused' || (round?.status === 'playing' && round.deck[round.index].audio)) { audioRef.current.stopBackground(); return; }
    audioRef.current.background().catch(e => { setAudioError(e.message); setBackground(false); });
  }, [background, hidden, listening, round?.status, round?.index]);

  const listenQuestion = async () => {
    const r = roundRef.current;
    if (!r || !r.deck[r.index].audio || listening) return;
    speech?.cancel(); setAudioError(''); setListening(true);
    try {
      const played = await audioRef.current.play(r.deck[r.index].audio);
      if (played) {
        const time = Date.now(); setNow(time);
        setRound(current => current === r && current.status === 'listening' ? { ...current, status: 'playing', deadline: time + ROUND_MS } : current);
      }
    } catch (e) { setAudioError(e.message); }
    finally { setListening(false); }
  };

  const start = () => { speech?.cancel(); audioRef.current.stop(); setAudioError(''); const time = Date.now(); const deck = makeDeck(category, level); setNow(time); setRound({ deck, index: 0, score: 0, deadline: time + ROUND_MS, status: deck[0].audio ? 'listening' : 'playing', line: deck[0].audio ? 'Сначала слушай. Я пока подержу планку.' : 'Я в планке. Твои десять секунд пошли!' }); };
  const answer = (index) => {
    const r = roundRef.current;
    if (!r || r.status !== 'playing') return;
    const time = Date.now(); const question = r.deck[r.index];
    const result = judgeAnswer(question, index, r.deadline, time);
    audioRef.current.stop();
    if (result !== 'correct') {
      setRound({ ...r, status: 'lost', reason: result, line: result === 'timeout' ? 'Время вышло. Иди качайся, сынок!' : 'Всё, хватит с меня. Иди качайся, сынок!' });
    } else {
      const score = r.score + 1;
      setNow(time);
      setRound({ ...r, score, status: 'feedback', line: GRUMBLES[(score - 1) % GRUMBLES.length] });
    }
    // До следующего рендера повторный тап уже не должен засчитать ответ.
    roundRef.current = { ...r, status: 'feedback' };
  };
  const next = () => {
    const time = Date.now(); setNow(time);
    setRound(r => r.score === r.deck.length ? { ...r, status: 'won', line: 'Все ответы верные. Ладно, ты победил. Теперь твой подход!' } : { ...r, index: r.index + 1, deadline: time + ROUND_MS, status: r.deck[r.index + 1].audio ? 'listening' : 'playing', line: 'Следующий вопрос. Я всё ещё стою!' });
  };
  const question = round?.deck[round.index];
  const seconds = round?.status === 'playing' ? Math.max(0, Math.ceil((round.deadline - now) / 1000)) : 10;
  const standing = ['lost', 'won'].includes(round?.status);
  return <section className={'plank-game' + (round ? ' plank-game--question' : '')} aria-label="Тренер в планке">
    <div className="plank-game__toolbar">
      {onClose && <button type="button" className="button button--ghost" onClick={() => { speech?.cancel(); onClose(); }}>Назад</button>}
      {typeof restLeft === 'number' && <span className="plank-game__rest">Отдых: {Math.max(0, Math.ceil(restLeft / 1000))} с</span>}
      {voice && <button type="button" className="button button--ghost" aria-pressed={sound} onClick={() => { speech?.cancel(); setSound(s => !s); }}>{sound ? 'Выключить голос' : 'Включить голос'}</button>}
      <button type="button" className="button button--ghost" aria-pressed={background} onClick={() => { if (background) { audioRef.current.stopBackground(); setBackground(false); } else audioRef.current.unlock().then(() => setBackground(true)).catch(e => setAudioError(e.message)); }}>{background ? 'Выключить фон' : 'Включить фон'}</button>
    </div>
    <h2>Тренер в планке</h2>
    <div className="plank-game__scene">
      <div className={'plank-game__coach' + (standing ? ' plank-game__coach--standing' : '') + (round?.status === 'playing' ? ' plank-game__coach--holding' : '')} role="img" aria-label={standing ? 'Тренер встал с планки' : 'Тренер держит планку'}>
        {avatar && <img className="plank-game__avatar" src={avatar} alt="" onError={() => { setAvatar(''); setPhotoError('Фото не открылось. Выберите другое изображение.'); }} />}
      </div>
      <p className="plank-game__speech" role="status">{round?.line || 'Проверим, кто сдастся первым: ты или мои руки?'}</p>
    </div>
    {!round ? <div className="plank-game__intro">
      <p>Ты отвечаешь — тренер стоит. На каждый вопрос 10 секунд. Ошибёшься или не успеешь — он уйдёт качаться.</p>
      <div className="plank-game__choices"><label>Категория<select aria-label="Категория" value={category} onChange={e => setCategory(e.target.value)}><option value="all">Всё вперемешку</option>{CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Сложность<select aria-label="Сложность" value={level} onChange={e => setLevel(Number(e.target.value))}>{LEVELS.map((name, i) => <option key={name} value={i}>{name}</option>)}</select></label></div>
      <button type="button" className="button button--primary" onClick={start}>Поставить тренера в планку</button>
      <p className="small muted">{QUESTIONS.length} вопросов · 6 категорий · 4 уровня. В партии до 10 вопросов. Звук — по желанию.</p>
      {allowPhoto && <label className="plank-game__photo">Примерить фото тренера<input type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} /></label>}
      {avatar && <button type="button" className="button button--ghost" onClick={() => { URL.revokeObjectURL(avatarRef.current); avatarRef.current = ''; setAvatar(''); }}>Убрать фото</button>}
      {allowPhoto && <p className="small muted">Фото используется только в этой игре, не загружается на сервер и исчезает после выхода.</p>}
      {photoError && <p role="alert">{photoError}</p>}
    </div> : <>
      <div className="plank-game__stats"><span>Верных ответов <strong>{round.score}</strong></span><span>{round.status === 'playing' ? <><strong role="timer" aria-live="off">{seconds}</strong> с на ответ</> : `Вопрос ${round.index + 1} из ${round.deck.length}`}</span></div>
      {['playing', 'listening'].includes(round.status) && <>
        <p className="small muted">{CATEGORIES.find(c => c.id === question.category).name} · {LEVELS[question.level]}</p>
        {round.status === 'playing' && <div className="plank-game__time" aria-hidden="true"><span style={{ transform: `scaleX(${Math.max(0, (round.deadline - now) / ROUND_MS)})` }} /></div>}
        <h3>{question.text}</h3>
        {question.image && <img className="plank-game__question-image" src={`${import.meta.env?.BASE_URL || '/'}anim/${question.image}/0.jpg`} alt="Упражнение для вопроса" />}
        {question.picture && <div role="img" aria-label="Продукт для вопроса" className={'plank-game__food plank-game__food--' + question.picture} />}
        {question.audio && <><button type="button" className="button" disabled={listening} onClick={listenQuestion}>{listening ? 'Слушаем…' : round.status === 'listening' ? 'Слушать задание' : 'Послушать ещё'}</button>{round.status === 'listening' && <p className="small muted">10 секунд начнутся после фрагмента.</p>}</>}
        <div className="plank-game__answers">{question.answers.map((text, i) => <button type="button" disabled={round.status === 'listening'} key={text} onClick={() => answer(i)}>{text}</button>)}</div>
      </>}
      {round.status === 'feedback' && <div className="plank-game__result"><h3>Верно! Продолжаем?</h3><p>{question.why}</p><button type="button" className="button button--primary" onClick={next}>{round.score === round.deck.length ? 'Забрать победу' : 'Следующий вопрос'}</button></div>}
      {round.status === 'paused' && <div className="plank-game__result"><h3>Игра на паузе</h3><p>Тренер передохнул, пока ты был в другой вкладке.</p><button type="button" className="button button--primary" disabled={hidden} onClick={() => { const time = Date.now(); setNow(time); setRound(r => ({ ...r, status: r.pausedFrom || 'playing', deadline: time + r.remaining })); }}>Продолжить игру</button></div>}
      {standing && <div className="plank-game__result"><h3>{round.status === 'won' ? 'Ты победил!' : 'Игра окончена'}</h3>{round.status === 'lost' && <p>{round.reason === 'timeout' ? 'Не успел ответить.' : 'Ответ неверный.'} Правильный ответ: <strong>{question.answers[question.correct]}</strong></p>}<p>{round.status === 'lost' ? question.why : 'Тренер выдержал все вопросы. Теперь пора к железу.'}</p><button type="button" className="button button--primary" onClick={start}>Сыграть ещё</button></div>}
    </>}
    {round && <button type="button" className="button button--ghost" onClick={() => { speech?.cancel(); audioRef.current.stop(); setListening(false); setRound(null); }}>Выбрать другую категорию</button>}
    {audioError && <p role="alert">{audioError}</p>}
  </section>;
}
