import React, { useState, useEffect } from 'react';
import { apiMutate, apiPublic } from '../api.js';
import { Panel, Note, Loading, ErrorState } from '../ui.jsx';
import FoodScan from '../nutrition/FoodScan.jsx';
import { FoodFields, FoodField as Field, foodTitle } from '../nutrition/FoodFields.jsx';

// Одна карточка с этикетки становится доступной всем. Редактирует общий
// справочник только владелец; дневники хранят прежние снимки значений.
export default function FoodCatalog() {
  const [q, setQ] = useState(''), [status, setStatus] = useState('unverified'), [editing, setEditing] = useState(null), [error, setError] = useState(null), [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0), [resource, setResource] = useState({ loading: true });
  const reload = () => setVersion(v => v + 1);
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      setResource({ loading: true });
      apiPublic('food.search', { q, reviewStatus: status, separateBrand: true }).then(data => { if (alive) setResource({ data }); })
        .catch(error => { if (alive) setResource({ error }); });
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [q, status, version]);
  const save = async event => {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      if (editing.id) await apiMutate('food.review', editing);
      else { const result = await apiMutate('food.add', editing); if (result.existed) { setEditing(result.food); setError(new Error('Такая карточка уже есть. Проверьте её значения перед сохранением.')); return; } }
      setEditing(null); reload();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };
  const hide = async () => {
    setBusy(true); setError(null);
    try { await apiMutate('food.hide', { id: editing.id }); setEditing(null); reload(); }
    catch (e) { setError(e); } finally { setBusy(false); }
  };
  if (editing) return <section aria-label="Карточка продукта"><h2>{editing.id ? 'Проверить продукт' : 'Новый продукт'}</h2><Panel pad><form onSubmit={save}>
    <p className="small muted">Все значения на 100 г. Сверьте этикетку и вид продукта. Правка справочника не меняет уже записанное питание.</p>
    <FoodScan disabled={busy} onDraft={patch => setEditing(f => ({ ...f, ...patch }))} onFound={setEditing} />
    <FoodFields value={editing} onChange={setEditing} />
    <Field label="Другие названия для поиска" value={editing.aliases || ''} onChange={aliases => setEditing(f => ({ ...f, aliases }))} maxLength={240} />
    {editing.id && <Field label="Источник: производитель или проверенная этикетка" value={editing.sourceRef || ''} onChange={sourceRef => setEditing(f => ({ ...f, sourceRef }))} maxLength={300} required />}
    {error && <Note tone="critical">{error.message}</Note>}
    <div className="diary-inline-actions food-catalog-actions"><button className="button button--primary" disabled={busy}>{editing.id ? 'Сохранить проверенную карточку' : 'Добавить с этикетки'}</button><button className="button" type="button" disabled={busy} onClick={() => setEditing(null)}>Отмена</button>{editing.id && <button className="button" type="button" disabled={busy} onClick={hide}>Скрыть из поиска</button>}</div>
  </form></Panel></section>;
  return <section aria-label="База продуктов"><h2>База продуктов</h2><p className="small muted">Справочные продукты USDA и карточки с этикеток. Пользовательские данные помечены как непроверенные до вашей проверки. Имена клиентов и сведения о здоровье сюда не добавляйте.</p>
    <label className="field"><span className="field__label">Карточки</span><select aria-label="Карточки" className="field__input" value={status} onChange={e => setStatus(e.target.value)}><option value="unverified">Непроверенные</option><option value="">Все продукты</option></select></label>
    <Field label="Найти продукт, бренд или штрихкод" value={q} onChange={setQ} />
    <button className="button" onClick={() => { setError(null); setEditing({ name: '', brand: '', barcode: '', preparation: 'as_sold', kcal: '', protein: '', fat: '', carbs: '' }); }}>Добавить продукт</button>
    {resource.loading ? <Loading rows={3} /> : resource.error ? <ErrorState error={resource.error} onRetry={reload} /> : <Panel>{(resource.data?.foods || []).map(f => <button type="button" className="diary-food-main food-catalog-row" key={f.id} onClick={() => { setError(null); setEditing(f); }}><strong>{foodTitle(f)}</strong><small>{f.kcal} ккал / 100 г · {f.source}</small></button>)}{!resource.data?.foods?.length && <p className="small muted">Ничего не найдено. Уточните название или добавьте продукт с этикетки.</p>}</Panel>}
  </section>;
}
