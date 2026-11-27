import { expect, type APIRequestContext } from '@playwright/test';

export async function startFixtureSuite(request: APIRequestContext) {
  const key = process.env.E2E_FIXTURE_KEY;
  if (!key) throw Error('Isolated browser fixture is required');
  const marker = await request.get('/api/__local_fixture__');
  expect(marker.ok()).toBe(true); expect((await marker.json()).fixtureKey).toBe(key);
  const denied = await request.post('/api/__local_fixture__/new-suite');
  expect(denied.status()).toBe(403);
  const isolated = await request.post('/api/__local_fixture__/new-suite', { headers: { 'X-Fixture-Key': key } });
  expect(isolated.status()).toBe(204);
}
