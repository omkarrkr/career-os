import { GoalProjects } from './ProjectGoalLinks';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Plus, RefreshCw, Target } from 'lucide-react';
import { auth } from './lib/auth';
import { ApiError } from './lib/auth-client';
import { useFormGuard } from './lib/form-guard';
import type { GoalListResponse, GoalResponse } from './lib/types';
import { GoalActions } from './GoalActions';

const dateLabel = (value: string) => new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
const statusLabel = (value: string) => value === 'ACTIVE' ? 'Active' : value === 'COMPLETED' ? 'Completed' : value;
function Footer() { return <footer className="workspace-footer"><span>Made for the journey, not just the destination.</span><span>CareerOS</span></footer>; }

export function GoalsPage({ userId }: { userId: number }) {
  const [search, setSearch] = useState(''); const [q, setQ] = useState('');
  const [status, setStatus] = useState('ALL'); const [sort, setSort] = useState('oldest');
  const client = useQueryClient();
  const apply = (nextQ: string, nextStatus: string, nextSort: string) => {
    if (nextQ === q && nextStatus === status && nextSort === sort) return;
    client.removeQueries({ queryKey: ['goals', userId, { q: nextQ, status: nextStatus, sort: nextSort }], exact: true });
    setQ(nextQ); setStatus(nextStatus); setSort(nextSort);
  };
  const filtered = !!q || status !== 'ALL';
  const query = useInfiniteQuery({ queryKey: ['goals', userId, { q, status, sort }], initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ limit: '20', q, status, sort });
      if (pageParam !== undefined) params.set('afterId', String(pageParam));
      return auth.api<GoalListResponse>(`/api/goals?${params}`, { signal });
    },
    getNextPageParam: page => page.nextCursor ?? undefined, staleTime: 0 });
  useEffect(() => { document.title = 'Goals · CareerOS'; }, []);
  const goals = query.data?.pages.flatMap(page => page.data) ?? [];
  return <main className="workspace-main" id="main-content" tabIndex={-1}>
    <div className="page-intro"><div><span className="eyebrow">SMALL STEPS, REAL PROGRESS</span><h1>Your goals</h1><p className="muted">Turn your direction into something you can work towards.</p></div><Link className="button primary" to="/goals/new"><Plus size={17} />New goal</Link></div>
    <section className="panel goals-panel">
      <div className="dashboard-section-heading"><h2><Target size={20} />Your saved goals</h2><button className="button text-button" disabled={query.isFetching} onClick={() => query.refetch()}><RefreshCw size={15} />Refresh goals</button></div>
      <form className="goal-filters" onSubmit={event => { event.preventDefault(); apply(search.trim(), status, sort); }}>
        <div className="goal-search"><label htmlFor="goal-search">Search goals</label><div className="goal-search-controls"><input id="goal-search" type="search" maxLength={100} value={search} onChange={event => setSearch(event.target.value)} placeholder="Title, category or description" /><button className="button secondary" type="submit">Search</button></div></div>
        <div><label htmlFor="goal-status-filter">Status</label><select id="goal-status-filter" value={status} onChange={event => apply(q, event.target.value, sort)}><option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="COMPLETED">Completed</option><option value="OTHER">Other statuses</option></select></div>
        <div><label htmlFor="goal-sort">Sort goals</label><select id="goal-sort" value={sort} onChange={event => apply(q, status, event.target.value)}><option value="oldest">Oldest added first</option><option value="newest">Newest added first</option></select></div>
        <button className="button text-button" type="button" onClick={() => { setSearch(''); apply('', 'ALL', 'oldest'); }}>Reset filters</button>
      </form>
      <p className="field-hint">{sort === 'oldest' ? 'Oldest' : 'Newest'} added first. Search covers title, category and description.{q && <> Search applied: “{q}”.</>} Load more to see the next 20 matches.</p>
      {query.isPending ? <p role="status">Loading your goals…</p> : !query.data ? <div role="alert"><p>We couldn’t load your goals. {query.error?.message}</p><button className="button secondary" onClick={() => query.refetch()}>Try again</button></div> : <>
        {query.isError && <div className="notice error" role="alert">Could not load more or refresh. Your loaded goals are still shown. {query.error?.message}</div>}
        {goals.length === 0 ? <div className="goals-empty"><Target size={32} /><h2>{filtered ? 'No matching goals.' : 'No goals saved yet.'}</h2><p>{filtered ? 'Try another search or reset your filters.' : 'Start with one small, useful step.'}</p>{!filtered && <Link className="button secondary" to="/goals/new">Create your first goal</Link>}</div> : <ul className="recent-goal-list">{goals.map(goal => <li key={goal.id}><div className="goal-title-row"><h2 className="goal-list-title"><Link to={`/goals/${goal.id}`}>{goal.title}<ArrowRight size={16} /></Link></h2><span className="goal-status">{statusLabel(goal.status)}</span></div><p className="goal-category">{goal.category}</p><p className="goal-dates"><span>Created {dateLabel(goal.createdAt)}</span><span>{goal.targetDate ? `Due ${dateLabel(goal.targetDate)}` : 'No target date'}</span></p></li>)}</ul>}
        {query.hasNextPage && <button className="button secondary load-goals" disabled={query.isFetching} onClick={() => query.fetchNextPage()}>{query.isFetchingNextPage ? 'Loading…' : 'Load more goals'}</button>}
        <p className="field-hint" role="status">{goals.length} {filtered ? 'matching ' : ''}{goals.length === 1 ? 'goal' : 'goals'} loaded{query.hasNextPage ? '; more available.' : '.'}</p>
      </>}
    </section><p className="dashboard-footnote">Goal dates use UTC calendar days.</p><Footer />
  </main>;
}

export function GoalDetailPage({ userId }: { userId: number }) {
  const { goalId = '' } = useParams();
  const valid = /^[1-9]\d*$/.test(goalId) && Number(goalId) <= 2147483647;
  const query = useQuery({ queryKey: ['goal', userId, goalId], enabled: valid,
    queryFn: ({ signal }) => auth.api<GoalResponse>(`/api/goals/${goalId}`, { signal }), staleTime: 0 });
  useEffect(() => { document.title = 'Goal details · CareerOS'; }, []);
  const goal = query.data?.data;
  const unavailable = !valid || (query.error instanceof ApiError && [400, 404].includes(query.error.status));
  return <main className="workspace-main" id="main-content" tabIndex={-1}>
    <Link className="back-link" to="/goals"><ArrowLeft size={16} />Back to goals</Link>
    <div className="page-intro"><div><span className="eyebrow">ONE STEP AT A TIME</span><h1>Goal details</h1></div></div>
    {unavailable ? <section className="panel goals-panel" role="alert"><h2>Goal unavailable</h2><p>This goal could not be found in your account.</p></section> : query.isPending ? <p role="status">Loading goal…</p> : !goal ? <section className="panel goals-panel" role="alert"><p>We couldn’t load this goal. {query.error?.message}</p><button className="button secondary" onClick={() => query.refetch()}>Try again</button></section> : <section className="panel goals-panel goal-detail">
      {query.isError && <p role="alert">Could not refresh this goal. Showing the last loaded details.</p>}
      <span className="goal-status">{statusLabel(goal.status)}</span><h2>{goal.title}</h2><p className="goal-category">{goal.category}</p>
      <p className="priority-badge">Priority: {goal.priority === 'HIGH' ? 'High' : goal.priority === 'LOW' ? 'Low' : 'Medium'}</p>
      <dl className="education-summary"><div><dt>Created</dt><dd>{dateLabel(goal.createdAt)}</dd></div><div><dt>Target date</dt><dd>{goal.targetDate ? `${dateLabel(goal.targetDate)} (UTC)` : 'No target date'}</dd></div></dl>
      <h3>Description</h3><p className="goal-description">{goal.description?.trim() ? goal.description : 'No description added.'}</p>
      <GoalProjects key={'projects-' + goal.id} userId={userId} goalId={goal.id} />
      <GoalActions key={goal.id} goal={goal} userId={userId} reload={async () => { const result = await query.refetch(); if (result.error) throw result.error; return result.data!; }} />
    </section>}<Footer />
  </main>;
}

const blank = { title: '', category: '', priority: 'MEDIUM', description: '', targetDate: '' };
export function NewGoalPage({ userId }: { userId: number }) {
  const [form, setForm] = useState({ ...blank }); const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<number | null>(null); const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [uncertain, setUncertain] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null); const client = useQueryClient(); const navigate = useNavigate();
  const dirty = created === null && JSON.stringify(form) !== JSON.stringify(blank);
  useFormGuard(dirty, saving);
  useEffect(() => { document.title = 'New goal · CareerOS'; }, []);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  useEffect(() => { if (created !== null) navigate(`/goals/${created}`, { replace: true }); }, [created, navigate]);
  const change = (key: keyof typeof blank, value: string) => { setForm(current => ({ ...current, [key]: value })); setFields(current => ({ ...current, [key]: '' })); };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (saving || uncertain || created !== null) return;
    const invalid: Record<string, string> = {};
    if (!form.title.trim()) invalid.title = 'Title is required';
    if (!form.category.trim()) invalid.category = 'Category is required';
    setFields(invalid); setError('');
    if (Object.keys(invalid).length) { setError('Please check the highlighted details.'); return; }
    setSaving(true);
    try {
      const response = await auth.api<GoalResponse>('/api/goals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: form.title.trim(), category: form.category.trim(), priority: form.priority, ...(form.description ? { description: form.description } : {}), ...(form.targetDate ? { targetDate: form.targetDate } : {}) }) });
      client.setQueryData(['goal', userId, String(response.data.id)], response);
      void client.invalidateQueries({ queryKey: ['goals', userId] }); void client.invalidateQueries({ queryKey: ['dashboard', userId] });
      setCreated(response.data.id);
    } catch (cause) {
      const ambiguous = !(cause instanceof ApiError) || cause.status === 0 || cause.status >= 500;
      setUncertain(ambiguous);
      setError(ambiguous ? 'We couldn’t confirm whether your goal was saved. Check your goals before creating it again to avoid a duplicate.' : cause.message);
      if (cause instanceof ApiError) setFields(cause.fields);
    } finally { setSaving(false); }
  };
  return <main className="workspace-main" id="main-content" tabIndex={-1}>
    <Link className="back-link" to="/goals"><ArrowLeft size={16} />Back to goals</Link>
    <div className="page-intro"><div><span className="eyebrow">MAKE ROOM FOR PROGRESS</span><h1>Create a goal</h1><p className="muted">Choose one clear step. You can leave the date open.</p></div></div>
    <form className="panel goals-panel goal-form" onSubmit={submit}>
      {error && <div ref={errorRef} tabIndex={-1} className="notice error" role="alert">{error}{uncertain && <p><Link to="/goals">Check saved goals</Link></p>}</div>}
      <fieldset aria-label="Goal information" disabled={saving || created !== null}>
        {(['title', 'category', 'priority', 'targetDate', 'description'] as const).map(key => <div className="goal-field" key={key}><label htmlFor={`goal-${key}`}>{({ title: 'Title', category: 'Category', priority: 'Priority', targetDate: 'Target date (optional)', description: 'Description (optional)' })[key]}</label>
          {key === 'priority' ? <select id="goal-priority" value={form.priority} onChange={event => change('priority', event.target.value)} aria-describedby="goal-priority-hint"><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option></select> : key === 'description' ? <textarea id={`goal-${key}`} rows={5} maxLength={5000} value={form[key]} onChange={event => change(key, event.target.value)} aria-invalid={!!fields[key]} aria-describedby={`goal-${key}-hint${fields[key] ? ` goal-${key}-error` : ''}`} /> : <input id={`goal-${key}`} type={key === 'targetDate' ? 'date' : 'text'} maxLength={key === 'title' ? 200 : key === 'category' ? 100 : undefined} required={key === 'title' || key === 'category'} value={form[key]} onChange={event => change(key, event.target.value)} aria-invalid={!!fields[key]} aria-describedby={`goal-${key}-hint${fields[key] ? ` goal-${key}-error` : ''}`} />}
          <span className="field-hint" id={`goal-${key}-hint`}>{({ title: 'Up to 200 characters.', category: 'For example: Learning, Projects or Career. Up to 100 characters.', priority: 'Low, Medium or High. Priority does not change completion.', targetDate: 'Stored as a UTC calendar date. Leave blank if undecided.', description: 'Add context or a small first step. Up to 5,000 characters.' })[key]}</span>
          {fields[key] && <span className="field-error" id={`goal-${key}-error`}>{fields[key]}</span>}
        </div>)}
      </fieldset><div className="goal-form-actions"><button className="button primary" type="submit" disabled={saving || uncertain || created !== null}>{saving ? 'Creating…' : 'Create goal'}</button><span className="field-hint">New goals start as Active.</span></div>
    </form><Footer />
  </main>;
}
