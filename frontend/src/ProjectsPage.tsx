import { CustomSkillCreator } from './CustomSkillCreator';
import { SkillChoiceSearch } from './SkillChoiceSearch';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { auth } from './lib/auth';
import { ApiError } from './lib/auth-client';
import { useFormGuard } from './lib/form-guard';

type Skill = { id: number; name: string; category: string };
type Evidence = { skillId: number; evidence: string | null; skill: Skill };
type Project = { id: number; title: string; description: string | null; outcome: string | null; status: string; startDate: string | null; endDate: string | null; repositoryUrl: string | null; demoUrl: string | null; skills: Evidence[]; _count?: { skills: number } };
type Page<T> = { data: T[]; nextCursor: number | null };
type Draft = { title: string; description: string; outcome: string; status: string; startDate: string; endDate: string; repositoryUrl: string; demoUrl: string; skills: { skillId: number; evidence: string; name: string }[] };
const blank: Draft = { title: '', description: '', outcome: '', status: 'PLANNED', startDate: '', endDate: '', repositoryUrl: '', demoUrl: '', skills: [] };
const statuses: Record<string, string> = { PLANNED: 'Planned', IN_PROGRESS: 'In progress', COMPLETED: 'Completed' };
const draftOf = (project: Project): Draft => ({ title: project.title, description: project.description ?? '', outcome: project.outcome ?? '', status: project.status, startDate: project.startDate?.slice(0, 10) ?? '', endDate: project.endDate?.slice(0, 10) ?? '', repositoryUrl: project.repositoryUrl ?? '', demoUrl: project.demoUrl ?? '', skills: project.skills.map(item => ({ skillId: item.skillId, evidence: item.evidence ?? '', name: item.skill.name })) });
const payload = (draft: Draft) => ({ ...draft, description: draft.description || null, outcome: draft.outcome || null, startDate: draft.startDate || null, endDate: draft.endDate || null, repositoryUrl: draft.repositoryUrl || null, demoUrl: draft.demoUrl || null, skills: draft.skills.map(({ skillId, evidence }) => ({ skillId, evidence: evidence || null })) });
const safeLink = (value: string) => { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; } };

export function ProjectsPage({ userId }: { userId: number }) {
  const [customOpen, setCustomOpen] = useState(false), [customDirty, setCustomDirty] = useState(false), [catalogSearch, setCatalogSearch] = useState(''); const [extraSkills, setExtraSkills] = useState<Skill[]>([]);
  const client = useQueryClient(); const [selected, setSelected] = useState<number | null>(null);
  const [editor, setEditor] = useState<{ id: number | null; initial: Draft; draft: Draft } | null>(null);
  const [busy, setBusy] = useState(false); const [uncertain, setUncertain] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [choice, setChoice] = useState('');
  const errorRef = useRef<HTMLDivElement>(null);
  const list = useInfiniteQuery({ queryKey: ['projects', userId], initialPageParam: undefined as number | undefined, queryFn: ({ pageParam, signal }) => auth.api<Page<Project>>(`/api/projects?limit=20${pageParam === undefined ? '' : `&afterId=${pageParam}`}`, { signal }), getNextPageParam: page => page.nextCursor ?? undefined });
  const detail = useQuery({ queryKey: ['project', userId, selected], enabled: selected !== null, queryFn: ({ signal }) => auth.api<{ data: Project }>(`/api/projects/${selected}`, { signal }) });
  const catalog = useInfiniteQuery({ queryKey: ['project-catalog', userId, catalogSearch], enabled: editor !== null, initialPageParam: undefined as number | undefined, queryFn: ({ pageParam, signal }) => auth.api<Page<Skill>>(`/api/skills/catalog?limit=20&q=${encodeURIComponent(catalogSearch)}${pageParam === undefined ? '' : `&afterId=${pageParam}`}`, { signal }), getNextPageParam: page => page.nextCursor ?? undefined });
  const dirty = !!editor && JSON.stringify(editor.initial) !== JSON.stringify(editor.draft), locked = busy || uncertain;
  useFormGuard(dirty, busy);
  useEffect(() => { document.title = 'Projects · CareerOS'; }, []);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  const discard = () => !(dirty || customDirty) || window.confirm('Discard unsaved project and skill-evidence changes?');
  const refresh = async () => {
    if (busy) return; setBusy(true);
    try {
      const savedList = await list.refetch(); if (savedList.error) throw savedList.error;
      if (selected !== null) {
        const savedDetail = await detail.refetch();
        if (savedDetail.error instanceof ApiError && savedDetail.error.status === 404) setSelected(null);
        else if (savedDetail.error) throw savedDetail.error;
      }
      setUncertain(false); setError(''); setNotice('Projects reloaded. Any draft is kept; check the saved result before retrying a change.');
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not reload projects.'); } finally { setBusy(false); }
  };
  const mutate = async (method: string, path: string, body?: object) => {
    if (locked) return; setBusy(true); setError(''); setNotice('');
    try {
      const result = await auth.api<{ data: Project } | undefined>(path, { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
      setCustomOpen(false); setEditor(null); setChoice(''); setSelected(result?.data?.id ?? null);
      await client.invalidateQueries({ queryKey: ['projects', userId] });
      await client.invalidateQueries({ queryKey: ['project', userId] });
      setNotice(method === 'DELETE' ? 'Project and its evidence links deleted. Your skills and catalog are unchanged.' : 'Project and skill evidence saved.');
    } catch (cause) { const ambiguous = !(cause instanceof ApiError) || cause.status === 0 || cause.status >= 500; setUncertain(ambiguous); setError(ambiguous ? 'We couldn’t confirm the result. Reload projects before another change. Your draft is kept.' : cause.message); }
    finally { setBusy(false); }
  };
  const save = (event: FormEvent) => {
    event.preventDefault(); if (!editor) return;
    const data = payload(editor.draft), previous = payload(editor.initial);
    const changed = Object.fromEntries(Object.entries(data).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(previous[key as keyof typeof previous])));
    if (editor.id === null) void mutate('POST', '/api/projects', data);
    else if (Object.keys(changed).length) void mutate('PATCH', `/api/projects/${editor.id}`, changed);
  };
  const setField = (key: Exclude<keyof Draft, 'skills'>, value: string) => setEditor(current => current ? { ...current, draft: { ...current.draft, [key]: value } } : null);
  const projects = list.data?.pages.flatMap(page => page.data) ?? [], skills = [...new Map([...(catalog.data?.pages.flatMap(page => page.data) ?? []), ...extraSkills].map(skill => [skill.id, skill])).values()], project = detail.data?.data;
  return <main className="workspace-main" id="main-content" tabIndex={-1}>
    <div className="page-intro"><div><span className="eyebrow">SHOW WHAT YOU BUILT</span><h1>Your projects</h1><p className="muted">Record your work and explain how you used your skills. Everything here is private to your account.</p></div><div className="subtask-buttons"><button className="button secondary" disabled={busy || list.isFetching} onClick={refresh}>Reload projects</button><button className="button primary" disabled={locked} onClick={() => { if (discard()) { setCustomOpen(false); setEditor({ id: null, initial: { ...blank }, draft: { ...blank } }); setChoice(''); setError(''); setNotice(''); } }}>New project</button></div></div>
    <p className="notice">Evidence is your own description and links, not independently verified proficiency. A planned project is an intention, not completed work.</p>
    {error && <div className="notice error" role="alert" tabIndex={-1} ref={errorRef}>{error}</div>}{notice && <p className="notice success" role="status">{notice}</p>}
    <div className="skills-layout">
      <section className="panel skills-panel" aria-labelledby="projects-list-heading"><h2 id="projects-list-heading">Saved projects</h2>
        {list.isPending ? <p>Loading projects…</p> : !list.data ? <div role="alert"><p>Could not load projects.</p><button className="button secondary" onClick={refresh} disabled={busy}>Retry projects</button></div> : <>
          {list.isError && <p role="alert">Could not refresh. Last loaded projects are shown.</p>}{projects.length === 0 && <p>No projects yet. Start with something you are building or have already built.</p>}
          <ul className="personal-skill-list">{projects.map(item => <li key={item.id}><div><h3>{item.title}</h3><p className="field-hint">{statuses[item.status]} · {item._count?.skills ?? 0} linked skills</p></div><button className="button secondary" aria-label={`Open project: ${item.title}`} disabled={locked} onClick={() => { if (discard()) { setCustomOpen(false); setEditor(null); setSelected(item.id); setNotice(''); setError(''); } }}>Open</button></li>)}</ul>
          {list.hasNextPage && <button className="button secondary" disabled={busy || list.isFetching} onClick={() => list.fetchNextPage()}>Load more projects</button>}<p className="field-hint">{projects.length} projects loaded.</p>
        </>}
      </section>
      <section className="panel skills-panel" aria-labelledby="project-work-heading"><h2 id="project-work-heading">{editor ? editor.id === null ? 'Create project' : 'Edit project' : 'Project details'}</h2>
        {editor ? <form className="skill-form" onSubmit={save}><fieldset disabled={locked} aria-label="Project form">
          <div className="goal-field"><label htmlFor="project-title">Project title</label><input id="project-title" required maxLength={200} value={editor.draft.title} onChange={e => setField('title', e.target.value)} /></div>
          <div className="goal-field"><label htmlFor="project-description">Description (optional)</label><textarea id="project-description" maxLength={3000} rows={4} value={editor.draft.description} onChange={e => setField('description', e.target.value)} /></div>
          <div className="goal-field"><label htmlFor="project-status">Project status</label><select id="project-status" value={editor.draft.status} onChange={e => setField('status', e.target.value)}>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          <div className="goal-field"><label htmlFor="project-start">Start date (optional)</label><input id="project-start" type="date" value={editor.draft.startDate} onChange={e => setField('startDate', e.target.value)} /></div>
          <div className="goal-field"><label htmlFor="project-end">End date (optional)</label><input id="project-end" type="date" min={editor.draft.startDate || undefined} value={editor.draft.endDate} onChange={e => setField('endDate', e.target.value)} /></div>
          <div className="goal-field"><label htmlFor="project-outcome">Outcome (optional)</label><textarea id="project-outcome" maxLength={2000} rows={3} value={editor.draft.outcome} onChange={e => setField('outcome', e.target.value)} /><span className="field-hint">What works, what you learned, or what remains to be built.</span></div>
          {(['repositoryUrl', 'demoUrl'] as const).map((key, index) => <div className="goal-field" key={key}><label htmlFor={`project-${key}`}>{index ? 'Demo URL (optional)' : 'Repository URL (optional)'}</label><input id={`project-${key}`} type="url" maxLength={2048} value={editor.draft[key]} onChange={e => setField(key, e.target.value)} /><span className="field-hint">HTTP/HTTPS only. Do not paste tokens, passwords or secret links.</span></div>)}
          <h3>Skills used</h3><p className="field-hint">Link up to 20 catalog skills. Describe your own contribution; adding a link does not change your skill level.</p>
          <SkillChoiceSearch disabled={locked} onSearch={value => { if (value !== catalogSearch) { client.removeQueries({ queryKey: ['project-catalog', userId, value], exact: true }); setCatalogSearch(value); } }} /><button className="button secondary" type="button" disabled={locked} onClick={() => setCustomOpen(true)}>Add custom skill</button><CustomSkillCreator userId={userId} disabled={locked} open={customOpen} onClose={() => setCustomOpen(false)} onBusy={setBusy} onDirty={setCustomDirty} onCreated={skill => { setExtraSkills(current => [...current, skill]); setChoice(String(skill.id)); }} />{catalog.isPending ? <p>Loading skill choices…</p> : !catalog.data ? <div><p role="alert">Could not load skill choices.</p><button type="button" className="button secondary" onClick={() => catalog.refetch()}>Retry skill choices</button></div> : <>
            {catalog.isError && <p role="alert">Could not refresh skill choices. Last loaded choices are shown.</p>}
            <div className="goal-field"><label htmlFor="project-skill-choice">Catalog skill to link</label><select id="project-skill-choice" value={choice} onChange={e => { if (e.target.value === "__custom__") setCustomOpen(true); else setChoice(e.target.value); }}><option value="">Choose a skill</option><option value="__custom__">+ Add custom skill…</option>{skills.filter(item => !editor.draft.skills.some(link => link.skillId === item.id)).map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></div>
            <button className="button secondary" type="button" disabled={!choice || customOpen || editor.draft.skills.length >= 20} onClick={() => { const skill = skills.find(item => item.id === Number(choice)); if (skill && !editor.draft.skills.some(item => item.skillId === skill.id)) setEditor({ ...editor, draft: { ...editor.draft, skills: [...editor.draft.skills, { skillId: skill.id, name: skill.name, evidence: '' }] } }); setChoice(''); }}>Link skill</button>
            {catalog.hasNextPage && <button type="button" className="button secondary" disabled={catalog.isFetching} onClick={() => catalog.fetchNextPage()}>Load more skill choices</button>}
          </>}
          {editor.draft.skills.map(item => <div className="skill-editor" key={item.skillId}><div className="goal-field"><label htmlFor={`evidence-${item.skillId}`}>How you used {item.name} (optional)</label><textarea id={`evidence-${item.skillId}`} rows={3} maxLength={1000} value={item.evidence} onChange={e => setEditor({ ...editor, draft: { ...editor.draft, skills: editor.draft.skills.map(link => link.skillId === item.skillId ? { ...link, evidence: e.target.value } : link) } })} /></div><button type="button" className="button text-button" aria-label={`Unlink skill: ${item.name}`} onClick={() => setEditor({ ...editor, draft: { ...editor.draft, skills: editor.draft.skills.filter(link => link.skillId !== item.skillId) } })}>Unlink from draft</button></div>)}
          <button className="button primary" disabled={customOpen || !editor.draft.title.trim() || (editor.id !== null && !dirty)}>Save project</button>
        </fieldset><button className="button text-button" type="button" disabled={busy} onClick={() => { if (discard()) { setCustomOpen(false); setEditor(null); setChoice(''); } }}>Cancel project edit</button></form> : selected === null ? <p>Open a saved project or create one to describe your work.</p> : detail.isPending ? <p>Loading project…</p> : !project ? <div role="alert"><p>Could not load this project. It may no longer exist.</p><button className="button secondary" onClick={refresh} disabled={busy}>Retry project details</button></div> : <>
          {detail.isError && <p role="alert">Could not refresh. Last saved details are shown.</p>}
          <h3>{project.title}</h3><p className="field-hint">{statuses[project.status]}</p><p className="skill-notes">{project.description || 'No description added.'}</p><p className="field-hint">Start: {project.startDate?.slice(0, 10) || 'Not set'} · End: {project.endDate?.slice(0, 10) || 'Not set'}</p>
          <h3>Outcome</h3><p className="skill-notes">{project.outcome || 'No outcome recorded.'}</p>
          {([['Repository', project.repositoryUrl], ['Demo', project.demoUrl]] as const).map(([label, value]) => value && safeLink(value) ? <p key={label}><a href={value} target="_blank" rel="noopener noreferrer">{label} (opens a new tab)</a></p> : null)}
          <h3>Skill evidence</h3>{project.skills.length === 0 ? <p>No skills linked yet.</p> : <ul className="personal-skill-list">{project.skills.map(item => <li key={item.skillId}><div><h3>{item.skill.name}</h3><p className="skill-notes">{item.evidence || 'Skill linked; no explanation added.'}</p></div></li>)}</ul>}
          <div className="subtask-buttons"><button className="button secondary" disabled={locked} onClick={() => { const draft = draftOf(project); setEditor({ id: project.id, initial: draft, draft }); setChoice(''); setNotice(''); }}>Edit project</button><button className="button text-button" disabled={locked} onClick={() => { if (window.confirm(`Permanently delete “${project.title}” and all its skill-evidence links? Your personal skills and shared catalog will stay. This cannot be undone.`)) void mutate('DELETE', `/api/projects/${project.id}`); }}>Delete project</button></div>
        </>}
      </section>
    </div><footer className="workspace-footer"><span>Made for the journey, not just the destination.</span><span>CareerOS</span></footer>
  </main>;
}
