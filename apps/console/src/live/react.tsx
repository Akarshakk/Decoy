import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Engine } from '@swaroop/engine';
import { LiveStore } from './store';

const Ctx = createContext<LiveStore | null>(null);

export function LiveProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => {
    let storage: Storage | null = null;
    try { storage = window.sessionStorage; } catch { /* blocked: no reload persistence */ }
    return new LiveStore(storage);
  });
  useEffect(() => { store.boot(); }, [store]);
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useLive() {
  const store = useContext(Ctx);
  if (!store) throw new Error('useLive outside LiveProvider');
  const state = useSyncExternalStore(store.subscribe, store.getState);
  return { store, ...state, engine: state.run?.engine ?? null };
}

/** A view of the engine, recomputed when the sandbox changes or any of `deps` (the view's other inputs) does.
 *  Null until the sandbox has booted. */
export function useView<T>(fn: (e: Engine) => T, deps: unknown[] = []): T | null {
  const { engine, version } = useLive();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (engine ? fn(engine) : null), [engine, version, ...deps]);
}
