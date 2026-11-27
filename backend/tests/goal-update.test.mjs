import assert from 'node:assert/strict';
import test from 'node:test';
import { updateGoalSchema } from '../src/schemas/goal.schema.ts';

test('goal PATCH distinguishes omission, null clearing and bounded editable fields', () => {
    assert.deepEqual(updateGoalSchema.parse({ title: '  A goal  ' }), { title: 'A goal' });
    assert.deepEqual(updateGoalSchema.parse({ description: null, targetDate: null }), { description: null, targetDate: null });
    assert.deepEqual(updateGoalSchema.parse({ status: 'COMPLETED' }), { status: 'COMPLETED' });
    for (const body of [{}, { title: undefined }, { title: ' ' }, { title: 'x'.repeat(201) }, { category: 'x'.repeat(101) }, { description: 'x'.repeat(5001) }, { targetDate: '2026-02-30' }, { status: 'done' }, { title: null }, { category: null }, { userId: 2 }, { id: 1 }, { createdAt: '2026-01-01' }]) {
        assert.equal(updateGoalSchema.safeParse(body).success, false);
    }
});
