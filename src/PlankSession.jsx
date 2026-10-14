import React, { createContext, useContext, useState, useSyncExternalStore } from 'react';
import { createPlankSession } from './plank-session.js';

const Context = createContext(null);
export function PlankSessionProvider({ children }) {
  const [session] = useState(createPlankSession);
  return <Context.Provider value={session}>{children}</Context.Provider>;
}
export function usePlankSession() {
  const shared = useContext(Context);
  const [local] = useState(createPlankSession);
  const session = shared || local;
  return [useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot), session];
}
