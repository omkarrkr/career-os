import { useState } from 'react';
import { findRoleGuide, roleGuides } from './lib/role-guides';

export function RoleGuide({ targetRole }: { targetRole?: string | null | undefined }) {
  const [selection, setSelection] = useState<string | null>(null);
  const selected = selection ?? findRoleGuide(targetRole);
  const guide = roleGuides[selected];
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
      <h3>Core skills to learn first</h3>
      <ul>{guide.core.map(([slug, name]) => <li key={slug}>{name}</li>)}</ul>
      <h3>Useful extras</h3>
      <ul>{guide.extras.map(([slug, name]) => <li key={slug}>{name}</li>)}</ul>
    </>}
  </section>;
}
