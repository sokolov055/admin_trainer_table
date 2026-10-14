/**
 * Вход клиента и вход тренера — две страницы (FT-574).
 *
 * Клиент входит с корня (app.fitness100.ru/), тренер — с /trainer: этот
 * адрес можно дать тренеру ссылкой. Страница одна и та же (nginx отдаёт
 * index.html и на /trainer), какую форму показать — решает путь.
 *
 * Переключение между страницами меняет адрес через replaceState, а не
 * добавляет запись в историю: «назад» на экране входа идёт по общей стопке
 * (gestures.jsx, history-back.js) — так кнопка, жест Android и Back
 * браузера ведут в одно место.
 *
 * Устройство помнит, что последним входил тренер (только эту отметку, без
 * почты): после выхода тренер попадает сразу на свою страницу.
 */

const ROLE_KEY = 'login_role_v1';

export function isTrainerPath(pathname = window.location.pathname) {
  return /\/trainer\/?$/.test(pathname);
}

/** Корень приложения: без «trainer» и без index.html в конце */
export function appRoot(pathname = window.location.pathname) {
  return isTrainerPath(pathname) ? pathname.replace(/trainer\/?$/, '') : pathname.replace(/[^/]*$/, '');
}

/** Адрес под показанную страницу входа: 'trainer' или 'client' */
export function setLoginPath(page) {
  const { search, hash } = window.location;
  const path = appRoot() + (page === 'trainer' ? 'trainer' : '');
  if (path === window.location.pathname) return;
  try { window.history.replaceState(window.history.state, '', path + search + hash); } catch (_) { /* file:// и песочницы */ }
}

/**
 * Вошли — кабинет живёт на адресе приложения, а не /trainer. Экран входа
 * в этот момент снимает свой «назад», и history-back.js возвращается на
 * предыдущую запись — с прежним адресом; её поправляем тоже.
 */
export function leaveLoginPath() {
  setLoginPath('client');
  const again = () => setLoginPath('client');
  window.addEventListener('popstate', again, { once: true });
  window.setTimeout(() => window.removeEventListener('popstate', again), 2000);
}

/**
 * Только что зарегистрировался и анкета включена: регистрация — первые два
 * шага анкеты (имя, согласия), подбор программы продолжает счёт с третьего.
 * Живёт до конца вкладки; анкета закрыта или недоступна — снимается.
 */
const LEAD_KEY = 'signup_lead_v1';
export const SIGNUP_STEPS = 2;

export function markSignupLead() {
  try { window.sessionStorage.setItem(LEAD_KEY, '1'); } catch (_) { /* приватный режим */ }
}

export function signupLead() {
  try { return window.sessionStorage.getItem(LEAD_KEY) ? SIGNUP_STEPS : 0; } catch (_) { return 0; }
}

export function clearSignupLead() {
  try { window.sessionStorage.removeItem(LEAD_KEY); } catch (_) { /* приватный режим */ }
}

export function rememberRole(role) {
  try { window.localStorage.setItem(ROLE_KEY, role === 'trainer' ? 'trainer' : 'client'); } catch (_) { /* приватный режим */ }
}

export function rememberedRole() {
  try { return window.localStorage.getItem(ROLE_KEY) || ''; } catch (_) { return ''; }
}

/** Какую страницу входа показать при открытии */
export function initialLoginPage() {
  return isTrainerPath() || rememberedRole() === 'trainer' ? 'trainer' : 'client';
}
