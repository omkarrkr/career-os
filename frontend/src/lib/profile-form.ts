import type { Profile, ProfilePatch } from './types';
export type FormValues = { institution: string; degree: string; graduationYear: string; targetRole: string; weeklyLearningHours: string; interests: string; bio: string };
export const emptyForm: FormValues = { institution: '', degree: '', graduationYear: '', targetRole: '', weeklyLearningHours: '', interests: '', bio: '' };
export function toForm(profile: Profile | null): FormValues {
  if (!profile) return { ...emptyForm };
  return { institution: profile.institution ?? '', degree: profile.degree ?? '', graduationYear: String(profile.graduationYear ?? ''),
    targetRole: profile.targetRole ?? '', weeklyLearningHours: String(profile.weeklyLearningHours ?? ''), interests: profile.interests.join(', '), bio: profile.bio ?? '' };
}
export function buildPatch(values: FormValues, saved: FormValues): ProfilePatch {
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(values) as (keyof FormValues)[]) {
    if (values[key] === saved[key]) continue;
    const value = values[key].trim();
    if (key === 'interests') patch[key] = value ? value.split(',').map(item => item.trim()).filter(Boolean) : [];
    else if (key === 'graduationYear' || key === 'weeklyLearningHours') patch[key] = value ? Number(value) : null;
    else patch[key] = value || null;
  }
  return patch as ProfilePatch;
}
