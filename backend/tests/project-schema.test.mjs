import assert from 'node:assert/strict';
import test from 'node:test';
import { createProjectSchema, updateProjectSchema } from '../src/schemas/project.schema.ts';
test('projects strictly bound fields, links, dates and unique evidence links', () => {
  assert.equal(createProjectSchema.parse({ title: '  Tracker  ', skills: [{ skillId: 1, evidence: 'Made forms' }] }).title,'Tracker');
  for (const value of [
    { title: '' }, { title: 'x', userId: 2 }, { title: 'x', status: 'INVALID' }, { title: 'x', description: 'x'.repeat(3001) },
    { title: 'x', repositoryUrl: 'javascript:alert(1)' }, { title: 'x', demoUrl: 'https://token:secret@example.test' },
    { title: 'x', demoUrl: 'https://example.test/has space' }, { title: 'x', startDate: '2026-02-30' },
    { title: 'x', startDate: '2026-11-28', endDate: '2026-11-27' },
    { title: 'x', skills: [{ skillId: 1 }, { skillId: 1 }] }, { title: 'x', skills: [{ skillId: 1, userId: 2 }] },
    { title: 'x', skills: [{ skillId: 1, evidence: 'x'.repeat(1001) }] }, { title: 'x', skills: Array.from({ length: 21 }, (_, i) => ({ skillId: i + 1 })) },
  ]) assert.equal(createProjectSchema.safeParse(value).success,false,JSON.stringify(value).slice(0,100));
  assert.equal(createProjectSchema.safeParse({ title: 'Valid', demoUrl: 'https://example.test/demo?q=hello', endDate: null }).success,true);
});
test('project patches preserve omission and accept explicit clearing and empty evidence lists', () => {
  for (const value of [{}, { title: undefined }, { userId: 1 }]) assert.equal(updateProjectSchema.safeParse(value).success,false);
  assert.deepEqual(updateProjectSchema.parse({ description: null, startDate: null, skills: [] }), { description: null, startDate: null, skills: [] });
});
