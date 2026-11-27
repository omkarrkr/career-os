import { createContext, useContext, useEffect, useRef } from 'react';
import { useBlocker } from 'react-router';

export const DirtyContext = createContext({ dirty: false, setDirty: (_value: boolean) => {}, saving: false, setSaving: (_value: boolean) => {} });

export function useFormGuard(dirty: boolean, saving: boolean) {
  const { setDirty, setSaving } = useContext(DirtyContext);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => (dirty || saving) && currentLocation.pathname !== nextLocation.pathname);
  const prompted = useRef<object | null>(null);
  useEffect(() => {
    if (blocker.state !== 'blocked') { prompted.current = null; return; }
    if (prompted.current === blocker) return;
    prompted.current = blocker;
    if (saving) { blocker.reset(); return; }
    if (window.confirm('Discard unsaved goal changes and leave this page?')) blocker.proceed(); else blocker.reset();
  }, [blocker, saving]);
  useEffect(() => { setDirty(dirty); return () => setDirty(false); }, [dirty, setDirty]);
  useEffect(() => { setSaving(saving); return () => setSaving(false); }, [saving, setSaving]);
  useEffect(() => {
    if (!dirty && !saving) return;
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty, saving]);
}
