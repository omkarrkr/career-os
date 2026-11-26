import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';

test('browser fixture refuses unsafe targets before startup without disclosing connection values', () => {
  for (const overrides of [
    { TEST_DATABASE_URL: '', E2E_FIXTURE_KEY: 'test-marker' },
    { TEST_DATABASE_URL: 'SYNTHETIC_PRIVATE', E2E_FIXTURE_KEY: 'test-marker' },
    { TEST_DATABASE_URL: 'postgresql://user:SYNTHETIC_PRIVATE@remote.example.test/careeros_test_browser_ui', E2E_FIXTURE_KEY: 'test-marker' },
    { TEST_DATABASE_URL: 'postgresql://user:SYNTHETIC_PRIVATE@127.0.0.1/postgres', E2E_FIXTURE_KEY: 'test-marker' },
    { TEST_DATABASE_URL: 'postgresql://user:SYNTHETIC_PRIVATE@127.0.0.1/careeros_test_browser_ui?host=remote.example.test', E2E_FIXTURE_KEY: 'test-marker' },
    { TEST_DATABASE_URL: 'postgresql://127.0.0.1/careeros_test_browser_ui', E2E_FIXTURE_KEY: '' },
  ]) {
    const result = spawnSync(process.execPath, ['--import', './tests/setup-env.mjs', '--import', 'tsx', 'tests/fixtures/browser-server.mjs'], {
      cwd: process.cwd(), env: { ...process.env, ...overrides }, encoding: 'utf8', windowsHide: true, timeout: 10000,
    });
    assert.equal(result.error, undefined); assert.equal(result.status, 1);
    assert.match(result.stderr, /Provide TEST_DATABASE_URL|Invalid test database URL|fresh loopback/);
    assert.doesNotMatch(result.stdout + result.stderr, /SYNTHETIC_PRIVATE|fixture ready/);
  }
});
