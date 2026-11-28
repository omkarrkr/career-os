import { useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { auth } from './lib/auth';
import type { ProfileResponse } from './lib/types';
import { RoleGuide } from './RoleGuide';

type Preview<T> = { data: T[]; nextCursor: number | null };
type Skill = { skillId: number; level: string; skill: { name: string } };
type RecordPreview = { id: number; title: string; issuer?: string; organization?: string; outcome?: string; _count?: { skills: number } };
const levels: Record<string, string> = { BEGINNER: 'Beginner', INTERMEDIATE: 'Intermediate', ADVANCED: 'Advanced' };

function PortfolioSection<T>({ userId, title, endpoint, destination, render }: {
  userId: number; title: string; endpoint: string; destination: string; render: (row: T) => ReactNode;
}) {
  const query = useQuery({
    queryKey: ['portfolio', userId, endpoint],
    queryFn: ({ signal }) => auth.api<Preview<T>>(`${endpoint}?limit=5`, { signal }),
    staleTime: 0,
  });
  return <section className="panel skills-panel">
    <h2>{title}</h2>
    {query.isPending && <p role="status">Loading {title.toLowerCase()}…</p>}
    {query.isError && <div role="alert"><p>Could not refresh {title.toLowerCase()}.</p><button className="button secondary" onClick={() => query.refetch()}>Retry {title.toLowerCase()}</button></div>}
    {query.data && (query.data.data.length ? <ul className="personal-skill-list">{query.data.data.map(render)}</ul> : <p>No saved {title.toLowerCase()} yet.</p>)}
    {query.data?.nextCursor != null && <p className="field-hint">Showing the first five saved entries.</p>}
    <Link className="button secondary" to={destination}>View all {title.toLowerCase()}</Link>
  </section>;
}

export function PortfolioPage({ userId, name }: { userId: number; name: string }) {
  const profile = useQuery({
    queryKey: ['career-profile', userId],
    queryFn: ({ signal }) => auth.api<ProfileResponse>('/api/users/career-profile', { signal }),
    staleTime: 0,
  });
  useEffect(() => { document.title = 'Portfolio · CareerOS'; }, []);
  const saved = profile.data?.data;
  return <main className="workspace-main" id="main-content" tabIndex={-1}>
    <div className="page-intro"><div><h1>Your portfolio</h1><p className="muted">A private overview of your career profile and saved work.</p></div></div>
    <section className="panel skills-panel">
      <h2>{name}</h2>
      {profile.isPending && <p role="status">Loading profile…</p>}
      {profile.isError && <div role="alert"><p>Could not refresh your profile.</p><button className="button secondary" onClick={() => profile.refetch()}>Retry profile</button></div>}
      {profile.data && !saved && <p>Add a career profile to show your background and target role here.</p>}
      {saved && <>
        <p className="skill-notes">{saved.targetRole || 'No target role added'}</p>
        {[saved.degree, saved.institution, saved.graduationYear].filter(Boolean).length > 0 && <p className="skill-notes">{[saved.degree, saved.institution, saved.graduationYear].filter(Boolean).join(' · ')}</p>}
        {saved.bio && <p className="skill-notes">{saved.bio}</p>}
      </>}
      <Link className="button secondary" to="/profile">Edit career profile</Link>
    </section>
    <div className="skills-layout" style={{ marginTop: '1.25rem' }}>
      <RoleGuide targetRole={saved?.targetRole} />
      <PortfolioSection<Skill> userId={userId} title="Skills" endpoint="/api/skills" destination="/skills"
        render={row => <li key={row.skillId}><div><h3>{row.skill.name}</h3><p className="field-hint">{levels[row.level] ?? row.level} · Self-reported</p></div></li>} />
      <PortfolioSection<RecordPreview> userId={userId} title="Projects" endpoint="/api/projects" destination="/projects"
        render={row => <li key={row.id}><div><h3><Link to={`/projects?projectId=${row.id}`}>{row.title}</Link></h3><p className="field-hint">{row._count?.skills ?? 0} linked skills</p>{row.outcome && <p className="skill-notes">{row.outcome}</p>}</div></li>} />
      <PortfolioSection<RecordPreview> userId={userId} title="Certifications" endpoint="/api/certifications" destination="/certifications"
        render={row => <li key={row.id}><div><h3>{row.title}</h3><p className="skill-notes">{row.issuer}</p></div></li>} />
      <PortfolioSection<RecordPreview> userId={userId} title="Experience" endpoint="/api/experiences" destination="/experience"
        render={row => <li key={row.id}><div><h3>{row.title}</h3><p className="skill-notes">{row.organization}</p></div></li>} />
    </div>
  </main>;
}
