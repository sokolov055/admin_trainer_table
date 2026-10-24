import React, { useEffect, useRef, useState } from 'react';
import { apiPublic } from '../api.js';
import { Note } from '../ui.jsx';
import { foodTitle, foodPer } from './FoodFields.jsx';
import { parseLabel, gtinFromCode } from './label-model.js';
import { liveLabel, LABEL_HINT } from './live-label.js';
import { nativeScanner, photoFile } from '../native-scan.js';
import ScanGuide from './ScanGuide.jsx';
import './food-scan.css';

const BARCODE_HINT = 'Наведите рамку на штрихкод с цифрами или квадратный код «Честного знака»';

// start — способ, выбранный плиткой на экране «Добавить еду» (п. 9 плана):
// сканер сразу открывается в нём; compact — без своих кнопок запуска.
// В приложении (FT-732) вместо выбора файла — своя камера телефона
// (native-scan.js): открывается сразу, штрихкод находит сама, подсказка поверх
export default function FoodScan({ onDraft, onFound, disabled = false, start = '', compact = false, onClose }) {
  const [mode, setMode] = useState(''), [image, setImage] = useState(null), [busy, setBusy] = useState(''), [error, setError] = useState('');
  const [code, setCode] = useState(''), [found, setFound] = useState(null), [searched, setSearched] = useState(false), [reads, setReads] = useState([]), [percent, setPercent] = useState(0);
  // undefined — ещё узнаём, null — камеры приложения нет (сайт, старая сборка)
  const [native, setNative] = useState(undefined);
  const camera = useRef(null), gallery = useRef(null), canvas = useRef(null), photo = useRef(null), rotation = useRef(0), sequence = useRef(0), job = useRef(null), autoOpened = useRef('');
  const cancel = () => { ++sequence.current; job.current?.stop(); job.current = null; setBusy(''); };
  useEffect(() => () => { ++sequence.current; job.current?.stop(); }, []);
  useEffect(() => { let on = true; nativeScanner().then(s => { if (on) setNative(s); }); return () => { on = false; }; }, []);
  useEffect(() => { if (start) reset(start); }, [start]);
  // Плитка «Штрихкод» / «Этикетка» в приложении — сразу камера, без лишнего касания
  useEffect(() => {
    if (!start) { autoOpened.current = ''; return; }
    if (native && autoOpened.current !== start) { autoOpened.current = start; void openCamera(start); }
  }, [start, native]);
  const reset = next => { cancel(); setMode(next); setImage(null); setError(''); setReads([]); setCode(''); setFound(null); setSearched(false); photo.current = null; canvas.current = null; rotation.current = 0; };
  const begin = next => { reset(next); if (native) void openCamera(next); };
  const loadPhoto = async file => {
    if (!file) return false;
    cancel(); const ticket = sequence.current;
    setBusy('Открываем фото…'); setError(''); setReads([]); setFound(null); setSearched(false); setImage(null); canvas.current = null;
    try {
      const { preparePhoto } = await import('./food-recognition.js');
      const picture = await preparePhoto(file);
      if (ticket !== sequence.current) return false;
      photo.current = file; rotation.current = 0; canvas.current = picture; setImage(picture.toDataURL('image/jpeg', 0.9));
      return true;
    } catch (e) { if (ticket === sequence.current) setError(e.message); return false; }
    finally { if (ticket === sequence.current) setBusy(''); }
  };
  const rotate = async () => {
    const ticket = ++sequence.current; setBusy('Поворачиваем фото…'); setReads([]); setError('');
    try {
      const { preparePhoto } = await import('./food-recognition.js'); rotation.current += 90;
      const picture = await preparePhoto(photo.current, rotation.current);
      if (ticket !== sequence.current) return;
      canvas.current = picture; setImage(picture.toDataURL('image/jpeg', 0.9));
    } catch (e) { if (ticket === sequence.current) setError(e.message); }
    finally { if (ticket === sequence.current) setBusy(''); }
  };
  const recognize = async (m = mode) => {
    const ticket = ++sequence.current; setBusy(m === 'barcode' ? 'Читаем штрихкод…' : 'Загружаем распознавание…'); setPercent(0); setError(''); setReads([]);
    let timer;
    try {
      // iPhone читает снимок своим распознаванием (Vision) — точнее и быстрее Tesseract;
      // не прочитал — ниже прежний путь
      if (native?.photoRead && canvas.current) {
        const read = await native.plugin.readPhoto({ image: canvas.current.toDataURL('image/jpeg', 0.9), mode: m }).catch(() => null);
        if (ticket !== sequence.current) return;
        if (m === 'barcode' && read?.value) { setCode(read.value); void lookup(read.value); return; }
        if (m === 'label' && read?.text?.trim()) { setReads([read.text]); return; }
      }
      const recognition = await import('./food-recognition.js');
      if (ticket !== sequence.current) return;
      // Этикетку читаем до трёх раз разными способами и, если фото боком, ещё дважды повёрнутой — запас по времени больше
      const timeout = new Promise((_, reject) => { timer = setTimeout(() => { job.current?.stop(); reject(new Error('Распознавание заняло слишком долго. Попробуйте фото крупнее или заполните поля вручную.')); }, m === 'barcode' ? 90000 : 210000); });
      const action = m === 'barcode' ? recognition.decodeBarcode(canvas.current) : (() => {
        let pass = 1, total = 1, turn = 0;
        job.current = recognition.createRecognition({ progress: event => { if (ticket === sequence.current && event.status === 'recognizing text') { setBusy(turn ? 'Текст не читается — пробуем фото повёрнутым…' : pass === 1 ? 'Читаем этикетку…' : `Перечитываем другим способом, ${pass} из ${total}…`); setPercent(Math.round(event.progress * 100)); } } });
        // Фото оказалось боком — превью и «Повернуть фото» дальше идут от найденной стороны
        const turned = (angle, picture) => { if (ticket !== sequence.current) return; rotation.current += angle; canvas.current = picture; setImage(picture.toDataURL('image/jpeg', 0.9)); };
        return job.current.readLabel(canvas.current, (n, of, angle = 0) => { pass = n; total = of; turn = angle; }, turned);
      })();
      const result = await Promise.race([action, timeout]);
      if (ticket !== sequence.current) return;
      if (m === 'barcode') { setCode(result); void lookup(result); }
      else setReads(result.some(s => s.trim()) ? result : ['Текст не прочитан. Переснимите этикетку крупнее.']);
    } catch (e) { if (ticket === sequence.current) { console.error('Не удалось распознать продукт', e); setError(e.message?.match(/[а-я]/i) ? e.message : 'Не удалось распознать фото. Повторите или заполните карточку вручную.'); } }
    finally { clearTimeout(timer); if (ticket === sequence.current) { job.current?.stop(); job.current = null; setBusy(''); } }
  };
  const lookup = async (value = code) => {
    const gtin = gtinFromCode(value);
    if (!gtin) { setError('Проверьте цифры штрихкода: контрольная цифра не совпадает или длина неверна.'); return; }
    setCode(gtin);
    const ticket = ++sequence.current; setBusy('Ищем в нашей базе…'); setError(''); setFound(null); setSearched(false);
    try {
      const data = await apiPublic('food.search', { q: gtin, separateBrand: true });
      if (ticket !== sequence.current) return;
      setFound((data.foods || []).find(f => f.barcode === gtin) || null); setSearched(true);
    } catch (e) { if (ticket === sequence.current) { console.error('Поиск по штрихкоду', e); setError('Не удалось проверить нашу базу. Подключитесь к интернету и повторите поиск.'); } }
    finally { if (ticket === sequence.current) setBusy(''); }
  };
  // Ответ камеры или окна выбора фото (native-scan.js). live — разобранный живой текст этикетки
  const takeResult = async (result, m, live = {}) => {
    const reason = result?.reason;
    if (reason === 'code' && result.value) { setCode(result.value); setFound(null); setSearched(false); await lookup(result.value); return; }
    // Закрыли камеру, не дочитав, — показываем то, что успели прочитать
    if (reason === 'finished' || (reason === 'cancelled' && live.bestScore)) { const text = live.best || result.text || ''; if (text.trim()) setReads([text]); return; }
    if (reason === 'photo' && result.image) {
      if (!await loadPhoto(await photoFile(result.image))) return;
      if (m === 'label' && result.text?.trim()) setReads([result.text]);
      else if (m === 'barcode' && result.value) { setCode(result.value); await lookup(result.value); }
      else await recognize(m);
      return;
    }
    if (reason === 'gallery') { await pickPhoto(m); return; }
    if (reason === 'denied') setError('Нет доступа к камере. Разрешите его в настройках телефона, прикрепите фото или впишите цифры.');
    if (reason === 'unreadable') setError('Не удалось открыть фото. Выберите другое.');
  };
  const openCamera = async (m = mode) => {
    if (!native) return;
    cancel(); const ticket = sequence.current; setError('');
    const liveText = m === 'label' && native.liveText;
    let live = {}, handle = null;
    try {
      // iPhone присылает текст этикетки на лету: разбираем, подсказываем поверх камеры, закрываем, когда хватило
      if (liveText) handle = await native.plugin.addListener('found', event => {
        if (event?.kind !== 'text') return;
        live = liveLabel(event.value, live);
        native.plugin.hint({ text: live.hint, ready: live.ready }).catch(() => {});
        if (live.done) native.plugin.finish().catch(() => {});
      });
      const result = await native.plugin.scan({ mode: m, title: m === 'barcode' ? 'Штрихкод продукта' : 'Этикетка продукта', hint: m === 'barcode' ? BARCODE_HINT : liveText ? LABEL_HINT : LABEL_HINT + ' и нажмите на круглую кнопку' });
      if (ticket !== sequence.current) return;
      await takeResult(result, m, live);
    } catch (e) { console.error('Камера сканера', e); if (ticket === sequence.current) setError('Камера не открылась. Прикрепите фото или впишите цифры.'); }
    finally { handle?.remove?.(); }
  };
  const pickPhoto = async (m = mode) => {
    if (!native) return;
    cancel(); const ticket = sequence.current; setError('');
    try {
      const result = await native.plugin.pickPhoto({ mode: m });
      if (ticket !== sequence.current) return;
      await takeResult(result, m);
    } catch (e) { console.error('Фото для сканера', e); if (ticket === sequence.current) setError('Не удалось открыть фото. Выберите другое или впишите цифры.'); }
  };
  const parsed = parseLabel(reads.length ? reads : ''), locked = !!busy || disabled;
  return <section className="food-scan" aria-label="Сканер продукта">
    {!mode ? compact ? null : <div className="diary-inline-actions"><button type="button" className="button" disabled={disabled} onClick={() => begin('barcode')}>Сканировать штрихкод</button><button type="button" className="button" disabled={disabled} onClick={() => begin('label')}>Распознать этикетку</button></div> : <>
      <div className="food-scan-head"><h3>{mode === 'barcode' ? 'Штрихкод продукта' : 'Фото этикетки'}</h3><button type="button" className="button button--ghost" onClick={() => { reset(''); onClose?.(); }}>Закрыть сканер</button></div>
      {/* «Как снять» — до первого снимка; после снимка место занимает само фото. В приложении
          подсказка — поверх камеры */}
      {native === null && !image && !reads.length && <ScanGuide mode={mode} />}
      <p className="small muted">{native ? 'Камера и фото обрабатываются на телефоне и никуда не отправляются.' : 'Фото обрабатывается на телефоне и никуда не отправляется. Камера спросит разрешение при первом снимке.'}</p>
      {native
        ? <div className="diary-inline-actions"><button type="button" className="button button--primary" disabled={locked} onClick={() => void openCamera()}>Открыть камеру</button><button type="button" className="button" disabled={locked} onClick={() => void pickPhoto()}>Прикрепить фото</button></div>
        : <div className="diary-inline-actions"><button type="button" className="button" disabled={locked} onClick={() => camera.current.click()}>Сделать снимок</button><button type="button" className="button" disabled={locked} onClick={() => gallery.current.click()}>Прикрепить фото</button></div>}
      <input ref={camera} className="food-scan-file" type="file" accept="image/*" capture="environment" aria-label="Снять фото продукта" onChange={e => { void loadPhoto(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={gallery} className="food-scan-file" type="file" accept="image/*" aria-label="Выбрать фото продукта" onChange={e => { void loadPhoto(e.target.files?.[0]); e.target.value = ''; }} />
      {image && <><img className="food-scan-preview" src={image} alt="Выбранная этикетка или штрихкод для проверки" /><div className="diary-inline-actions"><button className="button" type="button" disabled={locked} onClick={rotate}>Повернуть фото</button><button className="button button--primary" type="button" disabled={locked} onClick={() => void recognize()}>{mode === 'barcode' ? 'Прочитать штрихкод' : 'Прочитать этикетку'}</button></div></>}
      {busy && <div role="status" className="small"><p>{busy}{percent > 0 ? ' ' + percent + '%' : ''}</p><button type="button" className="button button--ghost" onClick={cancel}>Отменить распознавание</button></div>}
      {error && <div role="alert"><Note tone="critical">{error}</Note></div>}
      {mode === 'barcode' && <><label className="field"><span className="field__label">Цифры штрихкода</span><input className="field__input" inputMode="numeric" maxLength={14} value={code} disabled={locked} onChange={e => { setCode(e.target.value); setFound(null); setSearched(false); setError(''); }} /></label><button className="button" type="button" disabled={locked || !code} onClick={() => void lookup()}>Найти по штрихкоду</button>
        {searched && (found ? <div className="food-scan-result"><strong>{foodTitle(found)}</strong><p className="small">{found.kcal} ккал · Б {found.protein} · Ж {found.fat} · У {found.carbs} на {foodPer(found)}</p><p className="small muted">{found.source}. Сверьте с упаковкой.</p><button type="button" className="button button--primary" onClick={() => { onFound?.({ ...found, kind: 'food', unit: found.unit || 'g' }); reset(''); onClose?.(); }}>Использовать продукт</button></div> : <div className="food-scan-result"><p className="small">В нашей базе такого штрихкода пока нет. Добавьте продукт по его этикетке.</p><button type="button" className="button" onClick={() => { onDraft({ barcode: code.trim() }); reset(''); onClose?.(); }}>Добавить с этикетки</button></div>)}</>}
      {mode === 'label' && reads.length > 0 && <><details className="food-scan-text"><summary>Прочитанный текст</summary><pre>{reads.join('\n\n')}</pre></details>{parsed.warnings.map(w => <p className="small" key={w}>{w}</p>)}{(Object.keys(parsed.fields).length > 0 || parsed.unit === 'ml') && <><dl className="food-scan-values"><div><dt>На</dt><dd>{parsed.unit === 'ml' ? '100 мл' : '100 г'}</dd></div>{[['kcal', 'Ккал'], ['protein', 'Белки'], ['fat', 'Жиры'], ['carbs', 'Углеводы']].map(([key, title]) => <div key={key}><dt>{title}</dt><dd>{parsed.fields[key] ?? '—'}</dd></div>)}</dl><button className="button button--primary" type="button" onClick={() => { onDraft({ ...parsed.fields, unit: parsed.unit || 'g' }); reset(''); onClose?.(); }}>Заполнить черновик</button></>}</>}
    </>}
  </section>;
}
