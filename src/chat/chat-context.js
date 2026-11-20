import { createContext, useContext } from 'react';

/**
 * Общие данные чатов (FT-808): список, значок, открытая переписка, переход
 * из карточки в раздел. Отдельно от ChatList.jsx, чтобы экраны вроде
 * журнала тренировок брали их без сетевого кода и стилей чата.
 */
export const Inbox = createContext(null);

const NO_INBOX = {
  enabled: false, chats: [], unread: 0, prefs: null, setOpen: () => {}, reload: () => {}, act: () => {}, setPrefs: async () => null,
  setNavigator: () => {}, navigate: () => false, sendCard: async () => { throw new Error('Чат недоступен.'); },
};

export const useChatInbox = () => useContext(Inbox) || NO_INBOX;
