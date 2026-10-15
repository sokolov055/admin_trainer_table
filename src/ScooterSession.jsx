import React, { createContext, useContext, useState } from 'react';
import { createScooterSession } from './scooter-session.js';

const Context = createContext(null);
export function ScooterSessionProvider({ children }) {
  const [session] = useState(createScooterSession);
  return <Context.Provider value={session}>{children}</Context.Provider>;
}
export function useScooterSession() {
  const shared = useContext(Context);
  const [local] = useState(createScooterSession);
  return shared || local;
}
