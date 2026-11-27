import assert from 'node:assert/strict';
import test from 'node:test';
import { createSubtaskSchema, updateSubtaskSchema, listSubtasksSchema } from '../src/schemas/subtask.schema.ts';
import { createGoalSchema, updateGoalSchema } from '../src/schemas/goal.schema.ts';
test('subtasks strictly validate bounded titles, explicit completion and bounded cursor queries', () => {
    assert.deepEqual(createSubtaskSchema.parse({ title: '  Step  ' }), { title: 'Step' });
    for (const body of [{}, { title: ' ' }, { title: 'x'.repeat(201) }, { title: 'Step', goalId: 2 }, { title: 'Step', isCompleted: true }]) assert.equal(createSubtaskSchema.safeParse(body).success, false);
    assert.deepEqual(updateSubtaskSchema.parse({ isCompleted: false }), { isCompleted: false });
    for (const body of [{}, { title: null }, { isCompleted: 'true' }, { isCompleted: null }, { userId: 1 }, { goalId: 2 }]) assert.equal(updateSubtaskSchema.safeParse(body).success, false);
    for (const query of [{ limit: '51' }, { afterId: '0' }, { limit: ['1','2'] }, { owner: '1' }]) assert.equal(listSubtasksSchema.safeParse(query).success, false);
});
test('priority accepts only supported levels on create and partial edits', () => {
    assert.equal(createGoalSchema.parse({ title: 'Goal', category: 'Learning', priority: 'HIGH' }).priority, 'HIGH');
    assert.deepEqual(updateGoalSchema.parse({ priority: 'LOW' }), { priority: 'LOW' });
    for (const priority of [null, '', 'urgent', 3]) assert.equal(updateGoalSchema.safeParse({ priority }).success, false);
});
