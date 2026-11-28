import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { auth } from './lib/auth';
import { findRoleGuide, roleGuides } from './lib/role-guides';

type SavedSkill = { level: string; skill: { slug: string } };
const levels: Record<string, string> = { BEGINNER: 'Beginner', INTERMEDIATE: 'Intermediate', ADVANCED: 'Advanced' };

async function loadSavedLevels(signal: AbortSignal) {
  const saved = new Map<string, string>();
  let cursor: number | null = null;
  do {
    const params = new URLSearchParams({ limit: '50' });
    if (cursor !== null) params.set('afterId', String(cursor));
    const page: { data: SavedSkill[]; nextCursor: number | null } = await auth.api(`/api/skills?${params}`, { signal });
    for (const row of page.data) saved.set(row.skill.slug, row.level);
    cursor = page.nextCursor;
  } while (cursor !== null);
  return saved;
}

export function RoleGuide({ userId, targetRole }: { userId: number; targetRole?: string | null | undefined }) {
  const [selection, setSelection] = useState<string | null>(null);
  const selected = selection ?? findRoleGuide(targetRole);
  const guide = roleGuides[selected];
  const comparison = useQuery({
    queryKey: ['portfolio', userId, 'role-skill-comparison'],
    queryFn: ({ signal }) => loadSavedLevels(signal),
    enabled: !!guide,
    staleTime: 0,
  });
  const saved = comparison.isSuccess ? comparison.data : undefined;
  const coreRecorded = guide?.core.filter(([slug]) => saved?.has(slug)).length ?? 0;
  const renderSkill = ([slug, name]: readonly [string, string]) => {
    const level = saved?.get(slug);
    return <li key={slug}>{name}{saved && <span className="field-hint"> · {level ? `Recorded — ${levels[level] ?? level} (self-reported)` : 'Not yet recorded'}</span>}</li>;
  };
  return <section className="panel skills-panel">
    <h2>Target role skill guide</h2>
    <p>Explore a starter learning path. The web developer guides use the React and Node.js stack where relevant. Employers may ask for different skills.</p>
    <div className="goal-field">
      <label htmlFor="portfolio-role-guide">Explore a role</label>
      <select id="portfolio-role-guide" value={selected} onChange={event => setSelection(event.target.value)}>
        <option value="">Choose a role guide</option>
        {Object.entries(roleGuides).map(([id, role]) => <option key={id} value={id}>{role.title}</option>)}
      </select>
    </div>
    {guide && <>
      {comparison.isPending && <p role="status">Checking your saved skills…</p>}
      {comparison.isError && <div role="alert"><p>Could not compare your saved skills.</p><button className="button secondary" onClick={() => comparison.refetch()}>Retry comparison</button></div>}
      {saved && <p>{coreRecorded} of {guide.core.length} core skills recorded. Use the unrecorded core skills to choose what to explore next.</p>}
      <h3>Core skills to learn first</h3>
      <ul>{guide.core.map(renderSkill)}</ul>
      <h3>Useful extras</h3>
      <ul>{guide.extras.map(renderSkill)}</ul>
    </>}
  </section>;
}
