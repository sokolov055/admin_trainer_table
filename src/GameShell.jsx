import React, { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { enterFullscreen } from './game-feel.js';
import './game-shell.css';

/**
 * Полноэкранная сцена для игр, открытых из меню приложения. Все три игры —
 * порталом в body поверх приложения, как самокат (19.10.2026): шапка,
 * нижнее меню и прокрутка страницы под игрой не видны и не мешают.
 */
export default function GameShell({ kind, children }) {
  const root = useRef(null);
  const anchor = useRef(null);
  useLayoutEffect(() => {
    const active = document.activeElement;
    const app = anchor.current?.closest('.app');
    const background = app ? [...app.children].filter(node => !node.contains(anchor.current)) : [];
    const before = background.map(node => ({ node, inert: node.inert, hidden: node.getAttribute('aria-hidden') }));
    document.documentElement.classList.add('game-is-open');
    background.forEach(node => { node.inert = true; node.setAttribute('aria-hidden', 'true'); });
    root.current?.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
    // Открыли касанием из меню — жест ещё действует, браузер уберёт адресную строку
    if (window.matchMedia?.('(pointer: coarse)').matches) enterFullscreen(root.current);
    return () => {
      if (document.fullscreenElement === root.current) document.exitFullscreen?.().catch(() => {});
      document.documentElement.classList.remove('game-is-open');
      before.forEach(({ node, inert, hidden }) => {
        node.inert = inert;
        if (hidden === null) node.removeAttribute('aria-hidden'); else node.setAttribute('aria-hidden', hidden);
      });
      if (active?.isConnected) active.focus({ preventScroll: true });
    };
  }, []);

  return <><span ref={anchor} hidden />{createPortal(<div className={`game-shell game-shell--${kind}`} ref={root}>{children}</div>, document.body)}</>;
}
