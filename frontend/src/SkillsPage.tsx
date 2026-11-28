import { CustomSkillCreator } from './CustomSkillCreator';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { auth } from './lib/auth';
import { ApiError } from './lib/auth-client';
import { useFormGuard } from './lib/form-guard';

type CatalogSkill = { id: number; slug: string; name: string; category: string };
type Level = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
type PersonalSkill = { skillId: number; level: Level; notes: string | null; createdAt: string; updatedAt: string; skill: CatalogSkill };
type Page<T> = { data: T[]; nextCursor: number | null };
const levels = { BEGINNER: 'Beginner', INTERMEDIATE: 'Intermediate', ADVANCED: 'Advanced' };
const LevelOptions = () => <>{Object.entries(levels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</>;
const blank = { skillId: '', level: 'BEGINNER' as Level, notes: '' };

export function SkillsPage({ userId }: { userId: number }) {
  const [customOpen, setCustomOpen] = useState(false); const [extraSkills, setExtraSkills] = useState<CatalogSkill[]>([]);
  const [form, setForm] = useState({ ...blank }); const [search, setSearch] = useState(''); const [q, setQ] = useState('');
  const [edit, setEdit] = useState<{ saved: PersonalSkill; level: Level; notes: string } | null>(null);
  const [busy, setBusy] = useState(false); const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const errorRef = useRef<HTMLDivElement>(null); const client = useQueryClient();
  const catalog = useInfiniteQuery({ queryKey: ['skill-catalog', userId, q], initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam, signal }) => auth.api<Page<CatalogSkill>>(`/api/skills/catalog?${new URLSearchParams({ limit: '20', q, ...(pageParam === undefined ? {} : { afterId: String(pageParam) }) })}`, { signal }),
    getNextPageParam: page => page.nextCursor ?? undefined, staleTime: 0 });
  const mine = useInfiniteQuery({ queryKey: ['my-skills', userId], initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam, signal }) => auth.api<Page<PersonalSkill>>(`/api/skills?limit=20${pageParam === undefined ? '' : `&afterId=${pageParam}`}`, { signal }),
    getNextPageParam: page => page.nextCursor ?? undefined, staleTime: 0 });
  const skills = mine.data?.pages.flatMap(page => page.data) ?? [], catalogSkills = [...new Map([...(catalog.data?.pages.flatMap(page => page.data) ?? []), ...extraSkills].map(skill => [skill.id, skill])).values()];
  const dirtyAdd = JSON.stringify(form) !== JSON.stringify(blank);
  const dirtyEdit = !!edit && (edit.level !== edit.saved.level || edit.notes !== (edit.saved.notes ?? ''));
  useFormGuard(dirtyAdd || dirtyEdit, busy);
  useEffect(() => { document.title = 'Skills · CareerOS'; }, []);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  const mutate = async (method: string, path: string, body?: object) => {
    if (busy || uncertain) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await auth.api(path, { method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
      setForm({ ...blank }); setEdit(null);
      await client.invalidateQueries({ queryKey: ['my-skills', userId] });
      setNotice(method === 'DELETE' ? 'Skill removed from your list. The shared catalog is unchanged.' : 'Your skill is saved.');
    } catch (cause) {
      const ambiguous = !(cause instanceof ApiError) || cause.status === 0 || cause.status >= 500;
      setUncertain(ambiguous);
      setError(ambiguous ? 'We couldn’t confirm the result. Reload saved skills before another change. Any draft is kept.' : cause.message);
    } finally { setBusy(false); }
  };
  const reload = async () => {
    if (busy) return; setBusy(true);
    try { const result = await mine.refetch(); if (result.error) throw result.error; setUncertain(false); setError(''); setNotice('Saved skills reloaded. Any draft has been kept.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not reload skills.'); }
    finally { setBusy(false); }
  };
  const add = (event: FormEvent) => { event.preventDefault(); if (!form.skillId) { setError('Choose a catalog skill.'); return; } void mutate('POST', '/api/skills', { skillId: Number(form.skillId), level: form.level, notes: form.notes || null }); };
  const changeSearch = (event: FormEvent) => { event.preventDefault(); const next = search.trim(); if (next !== q) { client.removeQueries({ queryKey: ['skill-catalog', userId, next], exact: true }); setQ(next); } };
  const saveEdit = (event: FormEvent) => { event.preventDefault(); if (!edit) return; const patch: { level?: Level; notes?: string | null } = {}; if (edit.level !== edit.saved.level) patch.level = edit.level; if (edit.notes !== (edit.saved.notes ?? '')) patch.notes = edit.notes || null; if (Object.keys(patch).length) void mutate('PATCH', `/api/skills/${edit.saved.skillId}`, patch); };
  const locked = busy || uncertain;
  return <main className="workspace-main" id="main-content" tabIndex={-1}>
    <div className="page-intro"><div><span className="eyebrow">WHAT YOU'RE BUILDING ON</span><h1>Your skills</h1><p className="muted">Keep a private record of what you’re learning and where you feel confident.</p></div><button className="button secondary" disabled={busy || mine.isFetching} onClick={reload}>Reload saved skills</button></div>
    <div className="notice">Levels are self-reported, not verified proficiency or a job-readiness score.</div>
    {error && <div ref={errorRef} tabIndex={-1} className="notice error" role="alert">{error}</div>}
    {notice && <p className="notice success" role="status">{notice}</p>}
    <div className="skills-layout">
      <section className="panel skills-panel" aria-labelledby="add-skill-heading"><h2 id="add-skill-heading">Add a skill</h2><p className="field-hint">Search the expanded catalog or add a private custom skill. These choices are not a list of everything you need to learn.</p>
        <form className="catalog-search" onSubmit={changeSearch}><label htmlFor="catalog-search">Search catalog</label><div className="goal-search-controls"><input id="catalog-search" type="search" maxLength={80} value={search} onChange={event => setSearch(event.target.value)} /><button className="button secondary" disabled={busy}>Search catalog</button></div></form>
        {catalog.isPending ? <p aria-live="polite">Loading catalog…</p> : !catalog.data ? <div role="alert"><p>Could not load the catalog. {catalog.error?.message}</p><button className="button secondary" onClick={() => catalog.refetch()}>Retry catalog</button></div> : <>
          {catalog.isError && <p role="alert">Could not refresh the catalog. Last loaded choices are shown.</p>}
          {catalogSkills.length === 0 && <p>No catalog matches. Clear the search and press Search catalog to try again.</p>}
          <form className="skill-form" onSubmit={add}><fieldset disabled={locked || !!edit} aria-label="Add personal skill">
            <div className="goal-field"><label htmlFor="new-skill">Catalog skill</label><select id="new-skill" required value={form.skillId} onChange={event => { if (event.target.value === "__custom__") setCustomOpen(true); else setForm(current => ({ ...current, skillId: event.target.value })); }}><option value="">Choose a skill</option><option value="__custom__">+ Add custom skill…</option>{form.skillId && !catalogSkills.some(skill => String(skill.id) === form.skillId) && <option value={form.skillId}>Previously selected skill</option>}{catalogSkills.map(skill => <option key={skill.id} value={skill.id} disabled={skills.some(saved => saved.skillId === skill.id)}>{skill.name} — {skill.category}{skills.some(saved => saved.skillId === skill.id) ? ' (already added)' : ''}</option>)}</select></div>
            <div className="goal-field"><label htmlFor="new-skill-level">Your level</label><select id="new-skill-level" value={form.level} onChange={event => setForm(current => ({ ...current, level: event.target.value as Level }))}><LevelOptions /></select></div>
            <div className="goal-field"><label htmlFor="new-skill-notes">Private notes (optional)</label><textarea id="new-skill-notes" maxLength={1000} rows={4} value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} /><span className="field-hint">Up to 1,000 characters. Add what you have practised or want to learn next.</span></div>
            <button className="button primary" disabled={!form.skillId || customOpen || skills.some(skill => String(skill.skillId) === form.skillId)}>Add to my skills</button>
            {skills.some(skill => String(skill.skillId) === form.skillId) && <p className="field-hint">This skill is already in your saved list. Discard this draft to edit the saved entry.</p>}
          </fieldset></form>
          {catalog.hasNextPage && <button className="button secondary" disabled={catalog.isFetching || busy} onClick={() => catalog.fetchNextPage()}>Load more catalog skills</button>}
          {dirtyAdd && <button className="button text-button" disabled={busy} onClick={() => { if (window.confirm('Discard this skill draft?')) setForm({ ...blank }); }}>Discard skill draft</button>}
        </>}
        <button type="button" className="button secondary" disabled={locked || !!edit} onClick={() => setCustomOpen(true)}>Add custom skill</button><CustomSkillCreator userId={userId} disabled={locked || !!edit} open={customOpen} onClose={() => setCustomOpen(false)} onBusy={setBusy} onCreated={skill => { setExtraSkills(current => [...current, { ...skill, slug: "" }]); setForm(current => ({ ...current, skillId: String(skill.id) })); setNotice("Skill choice selected. Choose your level and save it to your list."); }} />
        <p className="field-hint">Use levels as a rough personal assessment: Beginner for learning with guidance, Intermediate for small projects independently, Advanced for more complex design and debugging. These are not certifications.</p>
      </section>
      <section className="panel skills-panel" aria-labelledby="saved-skills-heading"><h2 id="saved-skills-heading">Your saved skills</h2>
        {mine.isPending ? <p aria-live="polite">Loading your skills…</p> : !mine.data ? <div role="alert"><p>Could not load your skills. {mine.error?.message}</p><button className="button secondary" onClick={reload} disabled={busy}>Retry saved skills</button></div> : <>
          {mine.isError && <p role="alert">Could not refresh. These are the last loaded skills.</p>}
          {skills.length === 0 && <p>No skills saved yet. Add one you are currently learning.</p>}
          {edit && !skills.some(skill => skill.skillId === edit.saved.skillId) && <div className="notice error" role="alert"><p>This entry is no longer in the loaded list. Your edit is kept below.</p></div>}
          {edit && <form className="skill-form skill-editor" onSubmit={saveEdit}><h3>Edit {edit.saved.skill.name}</h3><fieldset disabled={locked} aria-label="Edit personal skill"><div className="goal-field"><label htmlFor="edit-skill-level">Your level</label><select id="edit-skill-level" value={edit.level} onChange={event => setEdit({ ...edit, level: event.target.value as Level })}><LevelOptions /></select></div><div className="goal-field"><label htmlFor="edit-skill-notes">Private notes (optional)</label><textarea id="edit-skill-notes" maxLength={1000} rows={4} value={edit.notes} onChange={event => setEdit({ ...edit, notes: event.target.value })} /></div><button className="button primary" disabled={!dirtyEdit}>Save skill</button></fieldset><button type="button" className="button text-button" disabled={busy} onClick={() => { if (!dirtyEdit || window.confirm('Discard unsaved skill changes?')) setEdit(null); }}>Cancel skill edit</button></form>}
          <ul className="personal-skill-list">{skills.map(skill => <li key={skill.skillId}><div><h3>{skill.skill.name}</h3><p className="field-hint">{skill.skill.category} · {levels[skill.level]} (self-reported)</p><p className="skill-notes">{skill.notes || 'No private notes added.'}</p></div><div className="subtask-buttons"><button className="button text-button" disabled={locked || dirtyAdd || !!edit || customOpen} aria-label={`Edit skill: ${skill.skill.name}`} onClick={() => { setEdit({ saved: skill, level: skill.level, notes: skill.notes ?? '' }); setNotice(''); }}>Edit</button><button className="button text-button" disabled={locked || dirtyAdd || !!edit || customOpen} aria-label={`Remove skill: ${skill.skill.name}`} onClick={() => { if (window.confirm(`Remove ${skill.skill.name} and its private notes from your list? The shared catalog will remain. This cannot be undone.`)) void mutate('DELETE', `/api/skills/${skill.skillId}`); }}>Remove</button></div></li>)}</ul>
          {mine.hasNextPage && <button className="button secondary" disabled={mine.isFetching || busy} onClick={() => mine.fetchNextPage()}>Load more saved skills</button>}
          <p className="field-hint">{skills.length} saved skills loaded. Levels are your assessment, not verified progress.</p>
        </>}
      </section>
    </div><footer className="workspace-footer"><span>Made for the journey, not just the destination.</span><span>CareerOS</span></footer>
  </main>;
}
