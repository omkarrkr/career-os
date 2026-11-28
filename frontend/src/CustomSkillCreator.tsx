import { useEffect, useState, type KeyboardEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { auth } from './lib/auth';
import { useFormGuard } from './lib/form-guard';
type Skill = { id: number; name: string; category: string };
export function CustomSkillCreator({ userId, disabled, open, onClose, onCreated, onBusy, onDirty }: { userId: number; disabled: boolean; open: boolean; onClose: () => void; onCreated: (skill: Skill) => void; onBusy: (value: boolean) => void; onDirty?: (value: boolean) => void }) {
  const [name, setName] = useState(''), [category, setCategory] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const client = useQueryClient();
  useFormGuard(open && !!(name || category), busy);
  useEffect(() => { onDirty?.(open && !!(name || category)); }, [open, name, category, onDirty]);
  useEffect(() => () => onDirty?.(false), [onDirty]);
  useEffect(() => { if (!open) { setName(''); setCategory(''); setError(''); } }, [open]);
  const create = async () => {
    if (busy || disabled || !name.trim()) return;
    setBusy(true); onBusy(true); setError('');
    try {
      const result = await auth.api<{ data: Skill }>('/api/skills/custom', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, ...(category.trim() ? { category: category.trim() } : {}) }) });
      await Promise.all(['skill-catalog', 'project-catalog', 'record-catalog'].map(key => client.invalidateQueries({ queryKey: [key, userId] })));
      onCreated(result.data); setName(''); setCategory(''); onClose();
    } catch (cause) { setError(`${cause instanceof Error ? cause.message : 'Could not create the skill.'} Your input is kept. Retrying the same name reuses the existing choice.`); }
    finally { setBusy(false); onBusy(false); }
  };
  const enter = (event: KeyboardEvent<HTMLInputElement>) => { if (event.key === 'Enter') { event.preventDefault(); void create(); } };
  if (!open) return null;
  return <fieldset className="skill-editor" disabled={disabled || busy} aria-label="Custom skill"><h3>Add custom skill</h3><p className="field-hint">This choice is private to your account. A matching shared or existing personal name is reused. Creating a choice does not save the surrounding form.</p>
    {error && <p role="alert">{error}</p>}
    <div className="goal-field"><label htmlFor="custom-skill-name">Custom skill name</label><input id="custom-skill-name" maxLength={80} value={name} onChange={e => setName(e.target.value)} onKeyDown={enter} /></div>
    <div className="goal-field"><label htmlFor="custom-skill-category">Custom skill category (optional)</label><input id="custom-skill-category" maxLength={80} value={category} onChange={e => setCategory(e.target.value)} onKeyDown={enter} /></div>
    <button className="button secondary" type="button" disabled={!name.trim()} onClick={create}>{busy ? 'Creating choice…' : 'Create custom choice'}</button><button className="button text-button" type="button" onClick={() => { if (!(name || category) || window.confirm('Discard this custom-skill draft?')) { setName(''); setCategory(''); setError(''); onClose(); } }}>Cancel custom skill</button>
  </fieldset>;
}
