import React, { createContext, useContext, useState, useSyncExternalStore } from 'react';
import { createMatchSession } from './match-session.js';

const Context = createContext(null);
export function MatchSessionProvider({ children, seed }) {
  const [session] = useState(() => createMatchSession({ seed }));
  return <Context.Provider value={session}>{children}</Context.Provider>;
}
export function useMatchSession() {
  const shared = useContext(Context);
  const [local] = useState(createMatchSession);
  const session = shared || local;
  return [useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot), session];
}
