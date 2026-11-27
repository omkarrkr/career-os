import { createContext, useContext, useEffect, useId } from 'react';

export type FormState = { dirty: boolean; saving: boolean };
export const DirtyContext = createContext({ dirty: false, setDirty: (_value: boolean) => {}, saving: false, setSaving: (_value: boolean) => {}, registerForm: (_id: string, _state: FormState | null) => {} });

export function useFormGuard(dirty: boolean, saving: boolean) {
  const { registerForm } = useContext(DirtyContext); const id = useId();
  useEffect(() => {
    registerForm(id, { dirty, saving });
    return () => registerForm(id, null);
  }, [id, dirty, saving, registerForm]);
}
