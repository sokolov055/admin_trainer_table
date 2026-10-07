import React, { useEffect, useState } from 'react';
import { apiPublic } from '../api.js';
import { MachineNote } from '../media.jsx';
import '../workout.css';

/**
 * Настройка тренажёра клиента в редакторе программы (FT-487): тренер
 * заранее вписывает «спинка 3, сиденье 5» — у каждого тренажёра упражнения
 * или у самого упражнения, если тренажёров нет. Пишется сразу, не дожидаясь
 * «Сохранить программу»: это данные клиента, а не строки плана
 */
export default function ClientSetup({ exerciseId, clientRow }) {
  const [info, setInfo] = useState(null);
  const [notes, setNotes] = useState({});

  useEffect(() => {
    setInfo(null);
    setNotes({});
    if (!exerciseId || !clientRow) return undefined;
    let alive = true;
    apiPublic('exercise.setup', { clientRow, ids: String(exerciseId) })
      .then((r) => {
        if (!alive || !r || !r.setups) return;
        setInfo(r.setups[exerciseId] || null);
        setNotes(r.notes || {});
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [exerciseId, clientRow]);

  if (!info) return null;
  const machines = info.machines || [];
  const targets = machines.length
    ? machines.map((m) => ({ target: 'm:' + m.uid, label: m.name }))
    : (info.noteKey ? [{ target: info.noteKey, label: '' }] : []);

  return (
    <div className="plan-edit__setups">
      {targets.map(({ target, label }) => (
        <div key={target}>
          {label && <span className="small muted">{label}</span>}
          <MachineNote
            target={target}
            note={notes[target]}
            trainer
            params={{ clientRow }}
            onSaved={(n) => setNotes((v) => {
              const next = { ...v };
              if (n) next[target] = n; else delete next[target];
              return next;
            })}
          />
        </div>
      ))}
    </div>
  );
}
