import assert from 'node:assert/strict';
import test from 'node:test';
import { listGoalsSchema } from '../src/schemas/goal.schema.ts';

test('goal search query defaults retain existing cursor behavior and validate bounded controls', () => {
    assert.deepEqual(listGoalsSchema.parse({}), { limit: 20, q: '', status: 'ALL', sort: 'oldest' });
    assert.equal(listGoalsSchema.parse({ q: '  TypeScript  ', status: 'OTHER', sort: 'newest', afterId: '12' }).q, 'TypeScript');
    for (const query of [{ q: 'x'.repeat(101) }, { q: ['a', 'b'] }, { status: 'done' }, { status: ['ACTIVE', 'COMPLETED'] }, { sort: 'title' }, { sort: ['oldest', 'newest'] }, { afterId: '-1' }]) {
        assert.equal(listGoalsSchema.safeParse(query).success, false);
    }
});
