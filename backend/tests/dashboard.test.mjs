import assert from 'node:assert/strict';
import test from 'node:test';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/careeros_test';
const { utcDayStart, goalStatusCounts } = await import('../src/services/dashboard.service.ts');

test('dashboard status totals include unknown values without silently reclassifying them', () => {
    assert.deepEqual(goalStatusCounts([]), { total: 0, active: 0, completed: 0, other: 0 });
    assert.deepEqual(goalStatusCounts([
        { status: 'ACTIVE', _count: { _all: 3 } }, { status: 'COMPLETED', _count: { _all: 2 } },
        { status: 'ARCHIVED', _count: { _all: 4 } }, { status: 'completed', _count: { _all: 1 } },
    ]), { total: 10, active: 3, completed: 2, other: 5 });
});
test('overdue cutoff is the UTC calendar boundary, including timezone and year transitions', () => {
    assert.equal(utcDayStart(new Date('2026-11-27T01:00:00+05:30')).toISOString(), '2026-11-26T00:00:00.000Z');
    assert.equal(utcDayStart(new Date('2027-01-01T00:01:00Z')).toISOString(), '2027-01-01T00:00:00.000Z');
});
