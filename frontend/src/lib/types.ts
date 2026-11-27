export type User = { id: number; name: string; email: string; createdAt: string };
export type Profile = {
  userId: number; institution: string | null; degree: string | null; graduationYear: number | null;
  targetRole: string | null; weeklyLearningHours: number | null; interests: string[]; bio: string | null;
  createdAt: string; updatedAt: string;
};
export type CoreField = 'institution' | 'degree' | 'graduationYear' | 'targetRole' | 'weeklyLearningHours';
export type ProfileResponse = {
  data: Profile | null;
  completeness: { completedFields: CoreField[]; missingFields: CoreField[]; totalFields: number; isComplete: boolean };
};
export type ProfilePatch = Partial<Pick<Profile, 'institution' | 'degree' | 'graduationYear' | 'targetRole' | 'weeklyLearningHours' | 'interests' | 'bio'>>;
export type DashboardResponse = { data: {
  asOf: string; overdueBefore: string;
  profile: Pick<Profile, 'institution' | 'degree' | 'graduationYear' | 'targetRole' | 'weeklyLearningHours'> | null;
  completeness: ProfileResponse['completeness'];
  goals: { total: number; active: number; completed: number; other: number; overdue: number };
  recentGoals: { id: number; title: string; category: string; status: string; targetDate: string | null; createdAt: string }[];
} };
