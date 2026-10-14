import { createContext, useContext } from 'react';
// Разрешение приходит из /me по clients.is_test, отсутствие флага закрывает игру.
export const PlankAccess = createContext(false);
export const usePlankAccess = () => useContext(PlankAccess) === true;
