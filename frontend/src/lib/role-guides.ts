type Skill = readonly [slug: string, name: string];
type Guide = { title: string; core: readonly Skill[]; extras: readonly Skill[] };

export const roleGuides: Record<string, Guide> = {
  frontend: {
    title: 'Frontend developer',
    core: [['html', 'HTML'], ['css', 'CSS'], ['javascript', 'JavaScript'], ['react', 'React'], ['accessibility', 'Accessibility'], ['git', 'Git']],
    extras: [['typescript', 'TypeScript'], ['playwright', 'Playwright']],
  },
  backend: {
    title: 'Backend developer',
    core: [['javascript', 'JavaScript'], ['nodejs', 'Node.js'], ['rest-apis', 'REST APIs'], ['sql', 'SQL'], ['git', 'Git'], ['unit-testing', 'Unit testing']],
    extras: [['typescript', 'TypeScript'], ['docker', 'Docker']],
  },
  fullstack: {
    title: 'Full-stack developer',
    core: [['html', 'HTML'], ['css', 'CSS'], ['javascript', 'JavaScript'], ['react', 'React'], ['nodejs', 'Node.js'], ['rest-apis', 'REST APIs'], ['sql', 'SQL'], ['git', 'Git']],
    extras: [['typescript', 'TypeScript'], ['accessibility', 'Accessibility'], ['playwright', 'Playwright'], ['docker', 'Docker']],
  },
  data: {
    title: 'Data analyst',
    core: [['sql', 'SQL'], ['microsoft-excel', 'Microsoft Excel'], ['data-analysis', 'Data analysis'], ['communication', 'Communication']],
    extras: [['python', 'Python'], ['pandas', 'Pandas'], ['power-bi', 'Power BI']],
  },
};

const roleKey = (value: string) => value.toLowerCase().replace(/[\s-]+/g, '');
export function findRoleGuide(targetRole?: string | null) {
  return Object.entries(roleGuides).find(([, guide]) => roleKey(guide.title) === roleKey(targetRole ?? ''))?.[0] ?? '';
}
