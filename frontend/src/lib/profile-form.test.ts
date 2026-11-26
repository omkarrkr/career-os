import { describe, expect, it } from 'vitest';
import { buildPatch, emptyForm, toForm } from './profile-form';
describe('partial profile form', () => {
  it('does not submit unchanged fields', () => { expect(buildPatch(emptyForm, emptyForm)).toEqual({}); });
  it('preserves omission, clears fields explicitly and parses numbers', () => {
    const saved = { ...emptyForm, degree: 'BTech', interests: 'AI' };
    expect(buildPatch({ ...saved, degree: '', interests: '', graduationYear: '2028', weeklyLearningHours: '8' }, saved))
      .toEqual({ degree: null, interests: [], graduationYear: 2028, weeklyLearningHours: 8 });
  });
  it('represents an absent profile without inventing details', () => { expect(toForm(null)).toEqual(emptyForm); });
});
