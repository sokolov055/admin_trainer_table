/**
 * Номер, почта и ссылка тренера на экране входа (FT-769, PhoneSignup.jsx).
 * Без React — проверяется scripts/test-phone-format.mjs.
 */

export const digits = (s) => String(s || '').replace(/\D/g, '');

/** +7 925 507-06-02 по мере ввода; лишнее отбрасывается */
export function formatPhone(raw) {
  let d = digits(raw);
  if (d.startsWith('8')) d = '7' + d.slice(1);
  if (d && !d.startsWith('7')) d = '7' + d;
  d = d.slice(0, 11);
  const p = d.slice(1);
  let out = '+7';
  if (p.length) out += ' ' + p.slice(0, 3);
  if (p.length > 3) out += ' ' + p.slice(3, 6);
  if (p.length > 6) out += '-' + p.slice(6, 8);
  if (p.length > 8) out += '-' + p.slice(8, 10);
  return out;
}

/** Похоже на почту — вкладка «Вход» отдаёт её входу по почте */
export const looksLikeEmail = (s) => /\S+@\S+\.\S+/.test(String(s || '').trim());

/**
 * Ссылка тренера или код из неё: ?trainer=… или сам токен. Персональная
 * ссылка (?access=…) открывает уже заведённую тренером карточку — её не
 * разбираем, а открываем (access.js), как вставленную ссылку
 */
export function parseTrainerLink(text) {
  const raw = String(text || '').trim();
  const m = /[?&]trainer=([A-Za-z0-9_-]+)/.exec(raw);
  if (m) return { token: m[1] };
  if (/[?&#](access|loginTicket)=/.test(raw)) return { open: raw };
  if (/^[A-Za-z0-9_-]{6,40}$/.test(raw)) return { token: raw };
  return null;
}
