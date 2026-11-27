import { useEffect } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Check, CheckCircle2, Clock3, Compass, ListChecks, RefreshCw, Target } from 'lucide-react';
import { auth } from './lib/auth';
import type { DashboardResponse, User } from './lib/types';

const fieldLabels = { institution: 'Institution', degree: 'Degree or programme', graduationYear: 'Graduation year', targetRole: 'Target role', weeklyLearningHours: 'Weekly learning hours' };
const dateLabel = (value: string) => new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));

export function DashboardPage({ user }: { user: User }) {
  const query = useQuery({ queryKey: ['dashboard', user.id], queryFn: ({ signal }) => auth.api<DashboardResponse>('/api/users/dashboard', { signal }), staleTime: 0 });
  useEffect(() => { document.title = 'Dashboard · CareerOS'; }, []);
  const data = query.data?.data;
  const count = data?.completeness.completedFields.length ?? 0;
  return <main className="workspace-main dashboard-main" id="main-content" tabIndex={-1}>
    <div className="page-intro"><div><span className="eyebrow">YOUR DIRECTION, AT A GLANCE</span><h1>Your next steps start here.</h1><p className="muted">Welcome back, {user.name}. Here’s what you’ve saved so far.</p></div>
      <button className="button secondary dashboard-refresh" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw size={16} className={query.isFetching ? 'spin' : ''} />{query.isFetching ? 'Refreshing…' : 'Refresh dashboard'}</button>
    </div>
    {query.isPending ? <div className="loading-screen" role="status"><RefreshCw className="spin" /><p>Loading your dashboard…</p></div>
      : !data ? <section className="panel error-panel" role="alert"><h2>We couldn’t load your dashboard.</h2><p>{query.error?.message || 'Please try again.'}</p><button className="button secondary" onClick={() => query.refetch()}>Try again</button></section>
      : <>
        {query.isError && <div className="notice error" role="alert">Could not refresh. These are the last successfully loaded values.</div>}
        <section className="dashboard-stats" aria-label="Your goal counts">
          {[
            { label: 'Total goals', value: data.goals.total, hint: 'All goals in your account', icon: ListChecks },
            { label: 'Active goals', value: data.goals.active, hint: 'Currently in progress', icon: Target },
            { label: 'Completed goals', value: data.goals.completed, hint: 'Marked as completed', icon: CheckCircle2 },
            { label: 'Overdue goals', value: data.goals.overdue, hint: 'Active, due before today (UTC)', icon: Clock3 },
          ].map(item => <article key={item.label} className="panel stat-card" aria-label={item.label}><div className="stat-label"><span>{item.label}</span><item.icon size={20} strokeWidth={1.5} /></div><strong className="stat-value">{item.value}</strong><p>{item.hint}</p></article>)}
        </section>
        {data.goals.other > 0 && <p className="other-status-note">{data.goals.other} goal{data.goals.other === 1 ? ' has' : 's have'} another status. These are included in the total.</p>}
        <div className="dashboard-grid">
          <section className="panel direction-panel"><div className="dashboard-section-heading"><h2><Compass size={20} />Your direction</h2><Link to="/profile">Edit profile</Link></div>
            <div className="target-role-summary"><span className="eyebrow">TARGET ROLE</span><h3>{data.profile?.targetRole || 'Where would you like to go?'}</h3><p>{data.profile?.weeklyLearningHours ? `${data.profile.weeklyLearningHours} hours per week planned for learning` : 'Add a realistic weekly learning budget to your profile.'}</p></div>
            <dl className="education-summary"><div><dt>Institution</dt><dd>{data.profile?.institution || 'Not added yet'}</dd></div><div><dt>Degree</dt><dd>{data.profile?.degree || 'Not added yet'}</dd></div><div><dt>Graduation year</dt><dd>{data.profile?.graduationYear ?? 'Not added yet'}</dd></div></dl>
            <div className="dashboard-completion"><div><span>Saved profile details</span><strong>{count}/5</strong></div><div className="progress-track" role="progressbar" aria-label="Saved profile details" aria-valuemin={0} aria-valuemax={5} aria-valuenow={count}><span style={{ width: `${count * 20}%` }} /></div>
              <p>{data.completeness.isComplete ? <><Check size={15} /> Your five core details are saved.</> : `Still to add: ${data.completeness.missingFields.map(field => fieldLabels[field]).join(', ')}.`}</p><small>A profile checklist, not a measure of job readiness.</small>
            </div>
          </section>
          <section className="panel recent-goals-panel"><div className="dashboard-section-heading"><h2><BookOpen size={20} />Recent goals</h2><Link to="/goals">View all goals</Link></div>
            {data.recentGoals.length === 0 ? <div className="goals-empty"><span className="empty-icon"><Target size={30} strokeWidth={1.3} /></span><h3>No goals saved yet.</h3><p>Start with one small, useful step.</p><Link className="button secondary" to="/goals/new">Create your first goal</Link></div>
              : <ul className="recent-goal-list">{data.recentGoals.map(goal => <li key={goal.id}><div className="goal-title-row"><h3><Link className="goal-title-link" to={`/goals/${goal.id}`}>{goal.title}</Link></h3><span className={`goal-status ${goal.status === 'COMPLETED' ? 'status-completed' : goal.status === 'ACTIVE' ? 'status-active' : 'status-other'}`}>{goal.status === 'ACTIVE' ? 'Active' : goal.status === 'COMPLETED' ? 'Completed' : goal.status}</span></div><p className="goal-category">{goal.category}</p><p className="goal-dates">Created {dateLabel(goal.createdAt)}<span>{goal.targetDate ? `Due ${dateLabel(goal.targetDate)}` : 'No target date'}</span></p></li>)}</ul>}
          </section>
        </div>
        <p className="dashboard-footnote">Loaded {new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(data.asOf))}. Goal dates use UTC calendar days; today’s deadlines are not overdue. Refresh to check for changes.</p>
      </>}
    <footer className="workspace-footer"><span>Made for the journey, not just the destination.</span><span>CareerOS</span></footer>
  </main>;
}
