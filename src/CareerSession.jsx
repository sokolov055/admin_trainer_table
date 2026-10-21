import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createCareer, restoreCareer, recordResult, promote, buy, useItem } from './career-model.js';
import { useGameProgress, saveProgress } from './game-progress.js';

// Карьера живёт на устройстве (localStorage) по кабинету: на сервер не уходит,
// рейтинга по карьере пока нет — он потребует юридической проверки (FT-563).
const Context = createContext(null);
const storageKey = id => 'ft.career.v1:' + id;

function load(id) {
  try { return restoreCareer(localStorage.getItem(storageKey(id))); } catch (_) { return createCareer(); }
}

export function CareerProvider({ id, sync = false, children }) {
  const [state, setState] = useState(() => load(id));
  // Карьера в аккаунте (FT-700): по согласию на сохранение игр — на любом устройстве
  const progress = useGameProgress(sync);
  const enabled = sync && progress.enabled, remote = enabled ? progress.states.career : null;
  useEffect(() => {
    if (!enabled) return;
    const local = state.savedAt || 0;
    if (remote && remote.savedAt > local) {
      const next = { ...restoreCareer(remote.state), savedAt: remote.savedAt };
      try { localStorage.setItem(storageKey(id), JSON.stringify(next)); } catch (_) {}
      setState(next);
    } else if (!remote || remote.savedAt < local) saveProgress('career', state, { now: true });
  }, [enabled, remote, id]);
  // Задание, запущенное из карьеры: какая игра, цель и взятый бонус
  const [mission, setMission] = useState(null);
  const api = useMemo(() => {
    const save = next => {
      next = { ...next, savedAt: Date.now() };
      try { localStorage.setItem(storageKey(id), JSON.stringify(next)); } catch (_) {}
      if (sync) saveProgress('career', next);
      return next;
    };
    let current = state;
    const apply = fn => { const out = fn(current); current = out.state; setState(save(out.state)); return out; };
    return {
      record: (game, result) => apply(s => recordResult(s, game, result)),
      promote: () => apply(promote),
      buy: item => apply(s => buy(s, item)),
      // Бонус списывается при запуске задания и действует до возврата в карьеру
      launch: (game, goal, item) => {
        const used = item ? apply(s => useItem(s, item)).ok : false;
        setMission({ game, goal, boost: used });
      },
      leave: () => setMission(null),
      restart: () => { current = createCareer(); setState(save(current)); },
    };
  }, [id, state, sync]);
  return <Context.Provider value={{ state, mission, ...api }}>{children}</Context.Provider>;
}

export const useCareer = () => useContext(Context);
