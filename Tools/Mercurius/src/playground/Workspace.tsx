import { useEffect, useState } from 'react';
import { App } from './App';
import { Writer } from './writer/Writer';
import { Clips } from './clips/Clips';
import { ProductionDesk } from './production/Production';

export const Workspace = () => {
  const [route, setRoute] = useState(() => window.location.hash);
  useEffect(() => {
    document.title =
      route === '#production' || route.startsWith('#episode/') || !route
        ? 'Mercurius — Production desk'
        : route === '#clips'
          ? 'Mercurius — Clips'
          : route === '#writer'
            ? 'Mercurius — Script writer'
            : 'Mercurius — Design playground';
  }, [route]);
  useEffect(() => {
    const update = () => {
      if (
        !window.dispatchEvent(
          new Event('mercurius-navigate', { cancelable: true }),
        )
      ) {
        window.history.replaceState(
          null,
          '',
          `${window.location.pathname}${window.location.search}${route}`,
        );
        return;
      }
      setRoute(window.location.hash);
    };
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, [route]);
  return route === '#production' || route.startsWith('#episode/') || !route ? (
    <ProductionDesk
      key={route}
      writerId={route.startsWith('#episode/') ? route.slice(9) : undefined}
    />
  ) : route === '#clips' ? (
    <Clips />
  ) : route === '#writer' ? (
    <Writer />
  ) : (
    <App />
  );
};
