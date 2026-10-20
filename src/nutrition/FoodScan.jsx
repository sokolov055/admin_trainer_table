import React, { useEffect, useRef, useState } from 'react';
import { apiPublic } from '../api.js';
import { Note } from '../ui.jsx';
import { foodTitle, foodPer } from './FoodFields.jsx';
import { parseLabel, validBarcode } from './label-model.js';
import './food-scan.css';

export default function FoodScan({ onDraft, onFound, disabled = false }) {
  const [mode, setMode] = useState(''), [image, setImage] = useState(null), [busy, setBusy] = useState(''), [error, setError] = useState('');
  const [code, setCode] = useState(''), [found, setFound] = useState(null), [searched, setSearched] = useState(false), [text, setText] = useState(''), [percent, setPercent] = useState(0);
  const camera = useRef(null), gallery = useRef(null), canvas = useRef(null), photo = useRef(null), rotation = useRef(0), sequence = useRef(0), job = useRef(null);
  const cancel = () => { ++sequence.current; job.current?.stop(); job.current = null; setBusy(''); };
  useEffect(() => () => { ++sequence.current; job.current?.stop(); }, []);
  const reset = next => { cancel(); setMode(next); setImage(null); setError(''); setText(''); setCode(''); setFound(null); setSearched(false); photo.current = null; canvas.current = null; rotation.current = 0; };
  const loadPhoto = async file => {
    if (!file) return;
    cancel(); const ticket = sequence.current;
    setBusy('Открываем фото…'); setError(''); setText(''); setFound(null); setSearched(false); setImage(null); canvas.current = null;
    try {
      const { preparePhoto } = await import('./food-recognition.js');
      const picture = await preparePhoto(file);
      if (ticket !== sequence.current) return;
      photo.current = file; rotation.current = 0; canvas.current = picture; setImage(picture.toDataURL('image/jpeg', 0.9));
    } catch (e) { if (ticket === sequence.current) setError(e.message); }
    finally { if (ticket === sequence.current) setBusy(''); }
  };
  const rotate = async () => {
    const ticket = ++sequence.current; setBusy('Поворачиваем фото…'); setText(''); setError('');
    try {
      const { preparePhoto } = await import('./food-recognition.js'); rotation.current += 90;
      const picture = await preparePhoto(photo.current, rotation.current);
      if (ticket !== sequence.current) return;
      canvas.current = picture; setImage(picture.toDataURL('image/jpeg', 0.9));
    } catch (e) { if (ticket === sequence.current) setError(e.message); }
    finally { if (ticket === sequence.current) setBusy(''); }
  };
  const recognize = async () => {
    const ticket = ++sequence.current; setBusy(mode === 'barcode' ? 'Читаем штрихкод…' : 'Загружаем распознавание…'); setPercent(0); setError(''); setText('');
    let timer;
    try {
      const recognition = await import('./food-recognition.js');
      if (ticket !== sequence.current) return;
      const timeout = new Promise((_, reject) => { timer = setTimeout(() => { job.current?.stop(); reject(new Error('Распознавание заняло слишком долго. Попробуйте фото крупнее или заполните поля вручную.')); }, 90000); });
      const action = mode === 'barcode' ? recognition.decodeBarcode(canvas.current) : (() => {
        job.current = recognition.createRecognition({ progress: event => { if (ticket === sequence.current && event.status === 'recognizing text') { setBusy('Читаем этикетку…'); setPercent(Math.round(event.progress * 100)); } } });
        return job.current.recognize(canvas.current);
      })();
      const result = await Promise.race([action, timeout]);
      if (ticket !== sequence.current) return;
      if (mode === 'barcode') { setCode(result); setFound(null); setSearched(false); }
      else setText(result || 'Текст не прочитан. Переснимите этикетку крупнее.');
    } catch (e) { if (ticket === sequence.current) { console.error('Не удалось распознать продукт', e); setError(e.message?.match(/[а-я]/i) ? e.message : 'Не удалось распознать фото. Повторите или заполните карточку вручную.'); } }
    finally { clearTimeout(timer); if (ticket === sequence.current) { job.current?.stop(); job.current = null; setBusy(''); } }
  };
  const lookup = async () => {
    if (!validBarcode(code)) { setError('Проверьте цифры штрихкода: контрольная цифра не совпадает или длина неверна.'); return; }
    const ticket = ++sequence.current; setBusy('Ищем в нашей базе…'); setError(''); setFound(null); setSearched(false);
    try {
      const data = await apiPublic('food.search', { q: code.trim(), separateBrand: true });
      if (ticket !== sequence.current) return;
      setFound((data.foods || []).find(f => f.barcode === code.trim()) || null); setSearched(true);
    } catch (e) { if (ticket === sequence.current) { console.error('Поиск по штрихкоду', e); setError('Не удалось проверить нашу базу. Подключитесь к интернету и повторите поиск.'); } }
    finally { if (ticket === sequence.current) setBusy(''); }
  };
  const parsed = parseLabel(text), locked = !!busy || disabled;
  return <section className="food-scan" aria-label="Сканер продукта">
    {!mode ? <div className="diary-inline-actions"><button type="button" className="button" disabled={disabled} onClick={() => reset('barcode')}>Сканировать штрихкод</button><button type="button" className="button" disabled={disabled} onClick={() => reset('label')}>Распознать этикетку</button></div> : <>
      <div className="food-scan-head"><h3>{mode === 'barcode' ? 'Штрихкод продукта' : 'Фото этикетки'}</h3><button type="button" className="button button--ghost" onClick={() => reset('')}>Закрыть сканер</button></div>
      <p className="small muted">{mode === 'barcode' ? 'Снимите товарный штрихкод целиком, без бликов.' : 'Снимите таблицу КБЖУ крупно, вместе с надписью «на 100 г» или «на 100 мл».'} Фото обрабатывается на устройстве и не загружается на сервер.</p>
      <div className="diary-inline-actions"><button type="button" className="button" disabled={locked} onClick={() => camera.current.click()}>Снять фото</button><button type="button" className="button" disabled={locked} onClick={() => gallery.current.click()}>Выбрать фото</button></div>
      <input ref={camera} className="food-scan-file" type="file" accept="image/*" capture="environment" aria-label="Снять фото продукта" onChange={e => { void loadPhoto(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={gallery} className="food-scan-file" type="file" accept="image/*" aria-label="Выбрать фото продукта" onChange={e => { void loadPhoto(e.target.files?.[0]); e.target.value = ''; }} />
      {image && <><img className="food-scan-preview" src={image} alt="Выбранная этикетка или штрихкод для проверки" /><div className="diary-inline-actions"><button className="button" type="button" disabled={locked} onClick={rotate}>Повернуть фото</button><button className="button button--primary" type="button" disabled={locked} onClick={recognize}>{mode === 'barcode' ? 'Прочитать штрихкод' : 'Прочитать этикетку'}</button></div></>}
      {busy && <div role="status" className="small"><p>{busy}{percent > 0 ? ' ' + percent + '%' : ''}</p><button type="button" className="button button--ghost" onClick={cancel}>Отменить распознавание</button></div>}
      {error && <div role="alert"><Note tone="critical">{error}</Note></div>}
      {mode === 'barcode' && <><label className="field"><span className="field__label">Цифры штрихкода</span><input className="field__input" inputMode="numeric" maxLength={14} value={code} disabled={locked} onChange={e => { setCode(e.target.value); setFound(null); setSearched(false); setError(''); }} /></label><button className="button" type="button" disabled={locked || !code} onClick={lookup}>Найти по штрихкоду</button>
        {searched && (found ? <div className="food-scan-result"><strong>{foodTitle(found)}</strong><p className="small">{found.kcal} ккал · Б {found.protein} · Ж {found.fat} · У {found.carbs} на {foodPer(found)}</p><p className="small muted">{found.source}. Сверьте с упаковкой.</p><button type="button" className="button button--primary" onClick={() => { onFound?.({ ...found, kind: 'food', unit: found.unit || 'g' }); reset(''); }}>Использовать продукт</button></div> : <div className="food-scan-result"><p className="small">В нашей базе такого штрихкода пока нет. Добавьте продукт по его этикетке.</p><button type="button" className="button" onClick={() => { onDraft({ barcode: code.trim() }); reset('label'); }}>Добавить с этикетки</button></div>)}</>}
      {mode === 'label' && text && <><details className="food-scan-text"><summary>Прочитанный текст</summary><pre>{text}</pre></details>{parsed.warnings.map(w => <p className="small" key={w}>{w}</p>)}{(Object.keys(parsed.fields).length > 0 || parsed.unit === 'ml') && <><dl className="food-scan-values"><div><dt>На</dt><dd>{parsed.unit === 'ml' ? '100 мл' : '100 г'}</dd></div>{[['kcal', 'Ккал'], ['protein', 'Белки'], ['fat', 'Жиры'], ['carbs', 'Углеводы']].map(([key, title]) => <div key={key}><dt>{title}</dt><dd>{parsed.fields[key] ?? '—'}</dd></div>)}</dl><button className="button button--primary" type="button" onClick={() => { onDraft({ ...parsed.fields, unit: parsed.unit || 'g' }); reset(''); }}>Заполнить черновик</button></>}</>}
    </>}
  </section>;
}
