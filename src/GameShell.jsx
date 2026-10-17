import React, { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './game-shell.css';

/** Полноэкранная сцена для игр, открытых из меню приложения. */
export default function GameShell({ kind, children }) {
  const root = useRef(null);
  const anchor = useRef(null);
  useLayoutEffect(() => {
    const active = document.activeElement;
    const app = (anchor.current || root.current)?.closest('.app');
    const background = app ? [...app.children].filter(node => !node.contains(anchor.current || root.current)) : [];
    const before = background.map(node => ({ node, inert: node.inert, hidden: node.getAttribute('aria-hidden') }));
    document.documentElement.classList.add('game-is-open');
    background.forEach(node => { node.inert = true; node.setAttribute('aria-hidden', 'true'); });
    root.current?.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
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

  const scene = <div className={`game-shell game-shell--${kind}`} ref={root}>{children}</div>;
  return kind === 'scooter' ? <><span ref={anchor} hidden />{createPortal(scene, document.body)}</> : scene;
}
