import React, { createContext, useContext, useState, useSyncExternalStore } from 'react';
import { createBliniSession } from './blini-session.js';

const Context = createContext(null);
export function BliniSessionProvider({ children, seed }) {
  const [session] = useState(() => createBliniSession({ seed }));
  return <Context.Provider value={session}>{children}</Context.Provider>;
}
export function useBliniSession() {
  const shared = useContext(Context);
  const [local] = useState(createBliniSession);
  const session = shared || local;
  return [useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot), session];
}
