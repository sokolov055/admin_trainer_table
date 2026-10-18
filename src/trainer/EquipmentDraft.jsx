import React, { useState } from 'react';
import { useData } from '../useData.js';
import { MachineForm } from './MachinesEditor.jsx';
import { SetupText } from '../media.jsx';
import { primaryEquipment } from '../equipment-guidance.js';

/** Связи сохраняются вместе с упражнением, инструкция редактируется в общем каталоге. */
export default function EquipmentDraft({ items, primaryUid, onChange }) {
  const { data, loading, error, reload } = useData('library.machines', {}, []);
  const [editing, setEditing] = useState(null);
  const [query, setQuery] = useState('');
  const primary = primaryEquipment({ machines: items, primaryEquipmentUid: primaryUid });
  if (editing) return <div>
    <p className="small muted">Изменение общей карточки оборудования будет видно в других упражнениях, использующих эту карточку.</p>
    <MachineForm machine={editing === 'new' ? null : editing} canDelete={false} onDone={(saved) => {
      setEditing(null);
      if (saved) onChange(items.some((m) => m.uid === saved.uid) ? items.map((m) => m.uid === saved.uid ? saved : m) : [...items, saved], primaryUid || (items.length === 0 ? saved.uid : null));
      reload();
    }} />
  </div>;
  return <section>
    <h3 className="setup__title">Оборудование упражнения</h3>
    <label className="field"><span className="field__label">Основное оборудование</span>
      <select className="field__input" value={primary?.uid || ''} onChange={(e) => onChange(items, e.target.value || null)}>
        <option value="">{items.length > 1 ? 'Выберите основное' : 'Не выбрано'}</option>
        {items.map((m) => <option key={m.uid} value={m.uid}>{m.name}</option>)}
      </select>
    </label>
    {items.map((m) => <div className="library__machine" key={m.uid}><span>{m.name}</span>
      <button type="button" className="button button--ghost" onClick={() => setEditing(m)}>Изменить инструкцию</button>
      <button type="button" className="button button--ghost" onClick={() => onChange(items.filter((x) => x.uid !== m.uid), primaryUid === m.uid ? null : primaryUid)}>Отвязать</button>
    </div>)}
    {primary && <div><h4 className="setup__title">Инструкция основного оборудования</h4>
      {primary.setup ? <SetupText text={primary.setup} /> : <p className="small muted">Инструкции пока нет. Клиенту пустой блок не показывается.</p>}
    </div>}
    {items.length < 8 && <>
      <label className="field"><span className="field__label">Найти оборудование</span><input className="field__input" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
      <label className="field"><span className="field__label">Добавить из каталога</span>
        <select className="field__input" value="" disabled={loading} onChange={(e) => {
          const m = data?.machines?.find((x) => x.uid === e.target.value);
          if (m) onChange([...items, m], primaryUid || (items.length === 0 ? m.uid : null));
        }}><option value="">{loading ? 'Загрузка…' : 'Выберите карточку'}</option>
          {(data?.machines || []).filter((m) => !items.some((x) => x.uid === m.uid) && [m.name, m.originalName].join(' ').toLowerCase().includes(query.toLowerCase())).map((m) => <option key={m.uid} value={m.uid}>{m.name}</option>)}
        </select>
      </label>
      <button type="button" className="button button--ghost" onClick={() => setEditing('new')}>Создать оборудование</button>
    </>}
    {error && <p role="alert">Не удалось загрузить каталог: {error.message} <button type="button" onClick={reload}>Повторить</button></p>}
  </section>;
}
