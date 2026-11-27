import { expect, test } from '@playwright/test';
import { startFixtureSuite } from './fixture';

test.beforeAll(async ({ request }) => { await startFixtureSuite(request); });
test.beforeEach(async ({ context, baseURL }) => {
  const allowed = new URL(baseURL!).origin;
  await context.route('**/api/**', route => new URL(route.request().url()).origin === allowed ? route.continue() : route.abort());
});

test('goal search: real status/search/sort, no matches and first-page reset', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login'); await page.getByLabel('Email address', { exact: true }).fill('ui-student@example.test');
  await page.getByLabel('Password', { exact: true }).fill('Fictional browser test passphrase!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your next steps start here.' })).toBeVisible();
  await page.goto('/goals');
  const list = page.locator('.recent-goal-list');
  await expect(list.getByRole('link').first()).toHaveText('Plan my first portfolio project');
  await page.getByLabel('Sort goals', { exact: true }).selectOption('newest');
  await expect(list.getByRole('link').first()).toHaveText('Read the TypeScript handbook');
  await page.getByLabel('Status', { exact: true }).selectOption('ACTIVE');
  await expect(list.getByRole('link')).toHaveCount(1);
  await expect(list.getByRole('link')).toHaveText('Plan my first portfolio project');
  await page.getByLabel('Status', { exact: true }).selectOption('COMPLETED');
  await expect(list.getByRole('link')).toHaveText('Read the TypeScript handbook');
  await page.getByLabel('Search goals', { exact: true }).fill('PORTFOLIO');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No matching goals.', exact: true })).toBeVisible();
  await page.getByLabel('Status', { exact: true }).selectOption('ALL');
  await expect(list.getByRole('link')).toHaveText('Plan my first portfolio project');
  await page.getByLabel('Search goals', { exact: true }).fill('Peer private');
  await page.getByLabel('Search goals', { exact: true }).press('Enter');
  await expect(page.getByRole('heading', { name: 'No matching goals.', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await expect(list.getByRole('link')).toHaveCount(2);
  await page.getByLabel('Status', { exact: true }).selectOption('OTHER');
  await expect(page.getByRole('heading', { name: 'No matching goals.', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  const queries: URLSearchParams[] = [];
  await page.route('**/api/goals?*', route => {
    const params = new URL(route.request().url()).searchParams; queries.push(params);
    const active = params.get('status') === 'ACTIVE'; const more = params.has('afterId');
    const row = (id: number) => ({ id, title: `Search page ${id}`, category: 'Fictional', status: 'ACTIVE', targetDate: null, createdAt: '2026-01-01T00:00:00Z' });
    return route.fulfill({ json: { data: active ? [row(90)] : more ? [row(21)] : Array.from({ length: 20 }, (_, index) => row(index + 1)), nextCursor: active || more ? null : 20 } });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Load more goals', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Search page 21', exact: true })).toBeVisible();
  await page.getByLabel('Status', { exact: true }).selectOption('ACTIVE');
  await expect(page.getByRole('link', { name: 'Search page 90', exact: true })).toBeVisible();
  await page.getByLabel('Status', { exact: true }).selectOption('ALL');
  await expect(page.getByRole('link', { name: 'Search page 20', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Search page 21', exact: true })).toHaveCount(0);
  expect(queries.filter(params => params.get('status') === 'ACTIVE').every(params => !params.has('afterId'))).toBe(true);
});
