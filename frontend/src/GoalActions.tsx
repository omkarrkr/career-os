import { useContext, useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { auth } from './lib/auth';
import { ApiError } from './lib/auth-client';
import { DirtyContext, useFormGuard } from './lib/form-guard';
import { SubtasksPanel } from './SubtasksPanel';
import type { Goal, GoalResponse } from './lib/types';

const values = (goal: Goal) => ({ title: goal.title, category: goal.category, priority: goal.priority ?? 'MEDIUM', description: goal.description ?? '', targetDate: goal.targetDate?.slice(0, 10) ?? '' });
type Draft = ReturnType<typeof values>;

export function GoalActions({ goal, userId, reload }: { goal: Goal; userId: number; reload: () => Promise<GoalResponse> }) {
  const [editing, setEditing] = useState(false); const [form, setForm] = useState(() => values(goal));
  const [base, setBase] = useState(() => values(goal)); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const [success, setSuccess] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({}); const [uncertain, setUncertain] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const shared = useContext(DirtyContext);
  const client = useQueryClient(); const navigate = useNavigate();
  const errorRef = useRef<HTMLDivElement>(null); const editorRef = useRef<HTMLHeadingElement>(null);
  const dirty = editing && JSON.stringify(form) !== JSON.stringify(base);
  useFormGuard(dirty, busy);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  useEffect(() => { if (editing) editorRef.current?.focus(); }, [editing]);
  useEffect(() => { if (deleted) { navigate('/goals', { replace: true }); client.removeQueries({ queryKey: ['goal', userId, String(goal.id)], exact: true }); } }, [deleted, navigate, client, userId, goal.id]);
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: ['goals', userId] });
    void client.invalidateQueries({ queryKey: ['dashboard', userId] });
  };
  const failed = (cause: unknown) => {
    const unknownOutcome = !(cause instanceof ApiError) || cause.status === 0 || cause.status >= 500;
    setUncertain(unknownOutcome);
    setError(unknownOutcome ? 'We couldn’t confirm the result. Reload saved goal details before making another change. Your draft is still here.' : cause.message);
    if (cause instanceof ApiError) {
      setFields(cause.fields);
      if (cause.status === 404) void client.invalidateQueries({ queryKey: ['goal', userId, String(goal.id)] });
    }
  };
  const patch = async (body: object, message: string) => {
    if (busy || uncertain) return;
    setBusy(true); setError(''); setSuccess(''); setFields({});
    try {
      const response = await auth.api<GoalResponse>(`/api/goals/${goal.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      client.setQueryData(['goal', userId, String(goal.id)], response);
      setEditing(false); setSuccess(message); invalidate();
    } catch (cause) { failed(cause); } finally { setBusy(false); }
  };
  const save = (event: FormEvent) => {
    event.preventDefault();
    const body: Record<string, string | null> = {};
    for (const key of Object.keys(form) as (keyof Draft)[]) {
      if (form[key] !== base[key]) body[key] = key === 'title' || key === 'category' ? form[key].trim() : form[key] || null;
    }
    if (Object.keys(body).length) void patch(body, 'Goal updated.');
  };
  const remove = async () => {
    if (busy || uncertain || !window.confirm(`Permanently delete “${goal.title}” and its subtasks? This cannot be undone.`)) return;
    setBusy(true); setError(''); setSuccess('');
    try {
      await auth.api<void>(`/api/goals/${goal.id}`, { method: 'DELETE' });
      invalidate(); setDeleted(true);
    } catch (cause) { failed(cause); } finally { setBusy(false); }
  };
  const checkSaved = async () => {
    if (busy) return;
    setBusy(true); setSuccess('');
    try { await reload(); setUncertain(false); setError(''); setSuccess('Saved details reloaded. Review them before continuing; your draft has been kept.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not reload saved details.'); }
    finally { setBusy(false); }
  };
  return <section className="goal-actions" aria-label="Manage goal">
    {error && <div className="notice error" ref={errorRef} tabIndex={-1} role="alert">{error}</div>}
    {success && <p className="notice success" role="status">{success}</p>}
    {uncertain && <button className="button secondary" disabled={busy} onClick={checkSaved}>Reload saved goal</button>}
    {editing ? <form className="goal-form" onSubmit={save}>
      <h3 ref={editorRef} tabIndex={-1}>Edit goal</h3>
      <fieldset disabled={busy} aria-label="Edit goal information">
        {(Object.keys(form) as (keyof Draft)[]).map(key => <div className="goal-field" key={key}><label htmlFor={`edit-goal-${key}`}>{({ title: 'Title', category: 'Category', priority: 'Priority', description: 'Description (optional)', targetDate: 'Target date (optional)' })[key]}</label>
          {key === 'priority' ? <select id="edit-goal-priority" value={form.priority} onChange={event => setForm(current => ({ ...current, priority: event.target.value as Goal['priority'] }))}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option></select> : key === 'description' ? <textarea id={`edit-goal-${key}`} rows={5} maxLength={5000} value={form[key]} onChange={event => { setForm(current => ({ ...current, [key]: event.target.value })); setFields({}); }} aria-invalid={!!fields[key]} aria-describedby={fields[key] ? `edit-${key}-error` : undefined} /> : <input id={`edit-goal-${key}`} type={key === 'targetDate' ? 'date' : 'text'} maxLength={key === 'title' ? 200 : key === 'category' ? 100 : undefined} required={key === 'title' || key === 'category'} value={form[key]} onChange={event => { setForm(current => ({ ...current, [key]: event.target.value })); setFields({}); }} aria-invalid={!!fields[key]} aria-describedby={fields[key] ? `edit-${key}-error` : undefined} />}
          {fields[key] && <span className="field-error" id={`edit-${key}-error`}>{fields[key]}</span>}
        </div>)}
        <p className="field-hint">Clear an optional field to remove it. Goal dates use UTC calendar days.</p>
      </fieldset><div className="goal-form-actions"><button className="button primary" disabled={busy || uncertain || !dirty}>{busy ? 'Saving…' : 'Save goal'}</button><button className="button secondary" type="button" disabled={busy} onClick={() => { if (!dirty || window.confirm('Discard unsaved goal changes?')) { setEditing(false); setError(''); setFields({}); } }}>Cancel editing</button></div>
    </form> : <div className="goal-form-actions">
      <button className="button secondary" disabled={busy || uncertain || shared.dirty || shared.saving} onClick={() => { const initial = values(goal); setForm(initial); setBase(initial); setEditing(true); setSuccess(''); setError(''); }}>Edit goal</button>
      {goal.status !== 'COMPLETED' && <button className="button primary" disabled={busy || uncertain || shared.dirty || shared.saving} onClick={() => patch({ status: 'COMPLETED' }, 'Goal marked completed.')}>{busy ? 'Updating…' : 'Mark completed'}</button>}
      <button className="button danger" disabled={busy || uncertain || shared.dirty || shared.saving} onClick={remove}>Delete goal</button>
    </div>}
    {!editing && <SubtasksPanel userId={userId} goalId={goal.id} disabled={busy || uncertain} />}
  </section>;
}
