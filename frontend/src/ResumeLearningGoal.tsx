import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { auth } from './lib/auth';
import { ApiError } from './lib/auth-client';
import { useFormGuard } from './lib/form-guard';
import type { GoalResponse } from './lib/types';

export function ResumeLearningGoal({ skill, userId, onCancel }: { skill: string; userId: number; onCancel: () => void }) {
  const [title, setTitle] = useState(`Practise ${skill}`);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  const [goalId, setGoalId] = useState<number | null>(null);
  const client = useQueryClient();
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || uncertain || goalId !== null || !title.trim()) return;
    setBusy(true);
    setError('');
    try {
      const result = await auth.api<GoalResponse>('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), category: 'Learning' }),
      });
      setGoalId(result.data.id);
      void client.invalidateQueries({ queryKey: ['goals', userId] });
      void client.invalidateQueries({ queryKey: ['dashboard', userId] });
    } catch (cause) {
      const unknown = !(cause instanceof ApiError) || cause.status === 0 || cause.status >= 500;
      setUncertain(unknown);
      setError(unknown ? 'The save result is unclear. Check Goals for this title before trying again.' : cause.message);
    } finally { setBusy(false); }
  };
  useFormGuard(goalId === null, busy);
  return <section className="skill-editor" aria-labelledby="resume-goal-heading">
    <h3 id="resume-goal-heading">Learning goal</h3>
    {goalId !== null ? <p role="status">Goal saved. <Link to={`/goals/${goalId}`}>Open saved goal</Link></p> :
      <form className="skill-form" onSubmit={submit}>
        {error && <p role="alert">{error} {uncertain && <Link to="/goals">Check Goals</Link>}</p>}
        <div className="goal-field">
          <label htmlFor="resume-goal-title">Goal title</label>
          <input id="resume-goal-title" value={title} onChange={event => setTitle(event.target.value)} maxLength={200} required disabled={busy || uncertain} />
        </div>
        <button className="button primary" disabled={busy || uncertain || !title.trim()}>{busy ? 'Saving…' : 'Save learning goal'}</button>
      </form>}
    <button className="button text-button" type="button" disabled={busy} onClick={onCancel}>{goalId === null ? 'Close goal form' : 'Close saved goal'}</button>
  </section>;
}
