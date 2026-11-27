import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { auth } from './lib/auth';
import { ApiError } from './lib/auth-client';
import { useFormGuard } from './lib/form-guard';
import type { SubtasksResponse } from './lib/types';

export function SubtasksPanel({ userId, goalId, disabled }: { userId: number; goalId: number; disabled: boolean }) {
  const [title, setTitle] = useState(''); const [edit, setEdit] = useState<{ id: number; title: string; original: string } | null>(null);
  const [busy, setBusy] = useState(false); const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const errorRef = useRef<HTMLDivElement>(null); const client = useQueryClient();
  const key = ['subtasks', userId, goalId];
  const query = useInfiniteQuery({ queryKey: key, initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam, signal }) => auth.api<SubtasksResponse>(`/api/goals/${goalId}/subtasks?limit=20${pageParam === undefined ? '' : `&afterId=${pageParam}`}`, { signal }),
    getNextPageParam: page => page.nextCursor ?? undefined, staleTime: 0 });
  const dirty = !!title || !!edit && edit.title !== edit.original;
  useFormGuard(dirty, busy);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  const tasks = query.data?.pages.flatMap(page => page.data) ?? [];
  const summary = query.data?.pages[0]?.summary;
  const locked = busy || uncertain || disabled;
  const mutate = async (method: string, suffix: string, body?: object) => {
    if (locked) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await auth.api(`/api/goals/${goalId}/subtasks${suffix}`, { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
      setTitle(''); setEdit(null);
      await client.invalidateQueries({ queryKey: key });
      setNotice(method === 'DELETE' ? 'Subtask deleted.' : 'Subtask saved.');
    } catch (cause) {
      const ambiguous = !(cause instanceof ApiError) || cause.status === 0 || cause.status >= 500;
      setUncertain(ambiguous);
      setError(ambiguous ? 'We couldn’t confirm the change. Reload saved subtasks before trying again. Your draft is kept.' : cause.message);
      if (cause instanceof ApiError && cause.status === 404) { void client.invalidateQueries({ queryKey: key }); void client.invalidateQueries({ queryKey: ['goal', userId, String(goalId)] }); }
    } finally { setBusy(false); }
  };
  const add = (event: FormEvent) => { event.preventDefault(); if (!title.trim()) { setError('Subtask title is required.'); return; } void mutate('POST', '', { title: title.trim() }); };
  const refresh = async () => {
    if (busy) return;
    setBusy(true);
    try { const result = await query.refetch(); if (result.error) throw result.error; setUncertain(false); setError(''); setNotice('Saved subtasks reloaded. Any draft has been kept.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not reload subtasks.'); }
    finally { setBusy(false); }
  };
  return <section className="subtasks-panel" aria-labelledby="subtasks-heading">
    <div className="dashboard-section-heading"><h3 id="subtasks-heading">Subtasks</h3><button type="button" className="button text-button" disabled={busy || query.isFetching || disabled} onClick={refresh}>Reload subtasks</button></div>
    <p className="field-hint">Small steps inside this goal. Checking every step does not automatically complete the goal.</p>
    {error && <div className="notice error" role="alert" ref={errorRef} tabIndex={-1}>{error}</div>}
    {notice && <p className="notice success" role="status">{notice}</p>}
    {query.isPending ? <p aria-live="polite">Loading subtasks…</p> : !query.data ? <div role="alert"><p>Could not load subtasks. {query.error?.message}</p><button className="button secondary" disabled={busy || disabled} onClick={refresh}>Try again</button></div> : <>
      {query.isError && <p className="notice error" role="alert">Could not refresh. Counts and subtasks below are the last loaded values.</p>}
      <p className="subtask-summary" aria-live="polite">{summary?.completed ?? 0} of {summary?.total ?? 0} subtasks completed</p>
      {tasks.length === 0 && <p>No subtasks yet. Add your first small step below.</p>}
      {edit && !tasks.some(task => task.id === edit.id) && <div className="notice error" role="alert"><p>This subtask is no longer in the loaded list. Your rename draft is kept below.</p><label htmlFor="missing-subtask-draft">Unmatched subtask draft</label><input id="missing-subtask-draft" readOnly value={edit.title} /><button className="button secondary" type="button" disabled={busy || disabled} onClick={() => { if (edit.title === edit.original || window.confirm('Discard this missing subtask draft?')) setEdit(null); }}>Discard missing subtask draft</button></div>}
      <ul className="subtask-list">{tasks.map(task => <li key={task.id}>
        {edit?.id === task.id ? <form onSubmit={event => { event.preventDefault(); if (!edit.title.trim()) { setError('Subtask title is required.'); return; } void mutate('PATCH', `/${task.id}`, { title: edit.title.trim() }); }} className="subtask-edit">
          <label htmlFor={`subtask-edit-${task.id}`}>Subtask title</label><input id={`subtask-edit-${task.id}`} autoFocus maxLength={200} required value={edit.title} disabled={locked} onChange={event => setEdit({ ...edit, title: event.target.value })} />
          <div className="subtask-buttons"><button className="button secondary" disabled={locked || edit.title === edit.original}>Save subtask</button><button type="button" className="button text-button" disabled={busy || disabled} onClick={() => { if (edit.title === edit.original || window.confirm('Discard unsaved subtask changes?')) setEdit(null); }}>Cancel rename</button></div>
        </form> : <>
          <label className="subtask-check"><input type="checkbox" checked={task.isCompleted} disabled={locked || !!edit || !!title} onChange={() => mutate('PATCH', `/${task.id}`, { isCompleted: !task.isCompleted })} /><span className={task.isCompleted ? 'subtask-done' : ''}>{task.title}</span></label>
          <div className="subtask-buttons"><button className="button text-button" disabled={locked || !!edit || !!title} aria-label={`Rename subtask: ${task.title}`} onClick={() => { setEdit({ id: task.id, title: task.title, original: task.title }); setNotice(''); }}>Rename</button><button className="button text-button" disabled={locked || !!edit || !!title} aria-label={`Delete subtask: ${task.title}`} onClick={() => { if (window.confirm(`Permanently delete subtask “${task.title}”? This cannot be undone.`)) void mutate('DELETE', `/${task.id}`); }}>Delete</button></div>
        </>}
      </li>)}</ul>
      {query.hasNextPage && <button className="button secondary" disabled={query.isFetching || locked} onClick={() => query.fetchNextPage()}>Load more subtasks</button>}
      <p className="field-hint">{tasks.length} subtasks loaded. Up to 100 per goal.</p>
      <form className="subtask-add" onSubmit={add}><label htmlFor="new-subtask-title">New subtask</label><input id="new-subtask-title" maxLength={200} required placeholder="For example: Write the About page" value={title} disabled={locked || !!edit || (summary?.total ?? 0) >= 100} onChange={event => setTitle(event.target.value)} />
        <div className="subtask-buttons"><button className="button secondary" disabled={locked || !!edit || (summary?.total ?? 0) >= 100}>{busy ? 'Saving…' : 'Add subtask'}</button>{title && <button type="button" className="button text-button" disabled={busy || disabled} onClick={() => { if (window.confirm('Discard the new subtask draft?')) setTitle(''); }}>Discard draft</button>}</div>
      </form>
      {(summary?.total ?? 0) >= 100 && <p className="field-hint">This goal has reached the 100-subtask limit.</p>}
      {dirty && <p className="field-hint">Save or discard your draft before making other changes.</p>}
    </>}
  </section>;
}
