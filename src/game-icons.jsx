import React from 'react';

function Frame({ children, tone, size = 48 }) {
  return <svg className="game-menu-icon" width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
    <rect width="48" height="48" rx="14" fill={tone} />
    {children}
  </svg>;
}

export const IconPlankGame = ({ size }) => <Frame size={size} tone="#DDEBDD">
  <path d="M9 30h30" stroke="#92AA99" strokeWidth="2" strokeLinecap="round" />
  <circle cx="14.5" cy="18" r="4" fill="#E0AD7D" />
  <path d="M13 22 27 24.5 35 31H14l-3-7Z" fill="#286749" />
  <path d="m26 25 8-5.5M34 19.5l5 1.5" stroke="#183F36" strokeWidth="3.2" strokeLinecap="round" />
  <path d="m15 30-4 6M34 30l3 6" stroke="#183F36" strokeWidth="3.4" strokeLinecap="round" />
</Frame>;

export const IconScooterGame = ({ size }) => <Frame size={size} tone="#D7E7E3">
  <path d="M12 4v40M36 4v40" stroke="#F8F3DF" strokeWidth="2" />
  <path d="M24 3v8M24 17v8M24 31v8" stroke="#819793" strokeWidth="2" strokeLinecap="round" />
  <circle cx="20" cy="34.5" r="3" fill="#183F36" />
  <circle cx="30" cy="34.5" r="3" fill="#183F36" />
  <path d="M20 34.5h8l-3-13h7M25 21.5l-4 7" stroke="#286749" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  <circle cx="24" cy="15.5" r="4" fill="#E0AD7D" />
  <path d="M20.5 17.5 25 20l5-1" stroke="#B96735" strokeWidth="4" strokeLinecap="round" />
</Frame>;

export const IconMatchGame = ({ size }) => <Frame size={size} tone="#F5E5B9">
  <rect x="8" y="8" width="14" height="14" rx="5" fill="#D36542" />
  <circle cx="32.5" cy="15.5" r="7.5" fill="#4E9B69" />
  <path d="m15 28 7 12H8Z" fill="#4C83A4" />
  <rect x="26" y="27" width="14" height="14" rx="4" fill="#E4A637" />
  <path d="m12 15 3 3 5-6M29 15.5l2.3 2.3 4.7-5" stroke="#FFF9E9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
</Frame>;
