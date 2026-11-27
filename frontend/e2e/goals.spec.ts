import { startFixtureSuite } from './fixture';
import { expect, test, type Page } from '@playwright/test';

test.beforeAll(async ({ request }) => { await startFixtureSuite(request); });
test.beforeEach(async ({ context, baseURL }) => {
  const allowed = new URL(baseURL!).origin;
  await context.route('**/api/**', route => new URL(route.request().url()).origin === allowed ? route.continue() : route.abort());
});
async function signIn(page: Page) {
  await page.goto('/login'); await page.getByLabel('Email address', { exact: true }).fill('ui-student@example.test');
  await page.getByLabel('Password', { exact: true }).fill('Fictional browser test passphrase!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your next steps start here.' })).toBeVisible();
  await page.goto('/goals'); await expect(page.getByRole('heading', { name: 'Your goals', exact: true })).toBeVisible();
}

// One signed-in workflow keeps the full suite within the real login rate limit.
test('goals UI: create, read, isolation, uncertain saves and pagination', async ({ page }) => {
  await test.step('real create, detail, reload and isolation', async () => {
  await signIn(page);
  await expect(page.getByRole('link', { name: 'Plan my first portfolio project' })).toBeVisible();
  await expect(page.getByText('Peer private goal')).toHaveCount(0);
  await page.getByRole('link', { name: 'New goal', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('   ');
  await page.getByLabel('Category', { exact: true }).fill('Projects');
  await page.getByRole('button', { name: 'Create goal', exact: true }).click();
  await expect(page.getByText('Title is required', { exact: true })).toBeVisible();
  await page.getByLabel('Title', { exact: true }).fill('Build a fictional portfolio');
  await page.getByLabel('Description (optional)', { exact: true }).fill('First step: outline three pages.');
  await page.getByLabel('Target date (optional)', { exact: true }).fill('2030-06-15');
  await page.getByRole('button', { name: 'Create goal', exact: true }).click();
  await expect(page).toHaveURL(/\/goals\/\d+$/);
  await expect(page.getByRole('heading', { name: 'Build a fictional portfolio' })).toBeVisible();
  await expect(page.getByText('First step: outline three pages.', { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole('heading', { name: 'Build a fictional portfolio' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to goals', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Build a fictional portfolio' })).toBeVisible();
  await page.goto('/dashboard');
  await expect(page.getByRole('article', { name: 'Total goals', exact: true }).locator('.stat-value')).toHaveText('3');
  await page.getByRole('link', { name: 'Build a fictional portfolio', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Goal details', exact: true })).toBeVisible();
  await page.goto('/goals/3'); await expect(page.getByRole('heading', { name: 'Goal unavailable' })).toBeVisible();
  await expect(page.getByText('Peer private goal')).toHaveCount(0);
  await page.goto('/goals/invalid'); await expect(page.getByRole('heading', { name: 'Goal unavailable' })).toBeVisible();
});

  await test.step('uncertain save and guarded mobile navigation', async () => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/goals');
  await page.getByRole('link', { name: 'New goal', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Keep my draft'); await page.getByLabel('Category', { exact: true }).fill('Learning');
  let posts = 0;
  await page.route('**/api/goals', route => {
    if (route.request().method() !== 'POST') return route.continue();
    posts++; return route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"Internal server error"}' });
  });
  await page.getByRole('button', { name: 'Create goal', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Check your goals before creating it again');
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Keep my draft');
  await expect(page.getByRole('button', { name: 'Create goal', exact: true })).toBeDisabled(); expect(posts).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const cancel = new Promise<void>(resolve => page.once('dialog', async dialog => { await dialog.dismiss(); resolve(); }));
  await page.getByRole('link', { name: 'Back to goals', exact: true }).click(); await cancel;
  await expect(page).toHaveURL(/\/goals\/new$/);
  const discard = new Promise<void>(resolve => page.once('dialog', async dialog => { await dialog.accept(); resolve(); }));
  await page.getByRole('link', { name: 'Check saved goals', exact: true }).click(); await discard;
  await expect(page.getByRole('heading', { name: 'Your goals', exact: true })).toBeVisible();
});

  await test.step('cursor pagination, retry and empty results', async () => {
  await page.goto('/goals');
  let fail = true; const cursors: string[] = [];
  const row = (id: number) => ({ id, title: `Paged goal ${id}`, category: 'Fictional', status: 'ACTIVE', description: null, targetDate: null, createdAt: '2026-01-01T00:00:00Z' });
  await page.route('**/api/goals?*', route => {
    const after = new URL(route.request().url()).searchParams.get('afterId'); cursors.push(after ?? 'first');
    if (after && fail) return route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"Temporary failure"}' });
    return route.fulfill({ json: after ? { data: [row(21)], nextCursor: null } : { data: Array.from({ length: 20 }, (_, index) => row(index + 1)), nextCursor: 20 } });
  });
  await page.reload(); await expect(page.getByRole('link', { name: 'Paged goal 20', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Load more goals', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Your loaded goals are still shown');
  fail = false; await page.getByRole('button', { name: 'Load more goals', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Paged goal 21', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Load more goals', exact: true })).toHaveCount(0); expect(cursors).toContain('20');
  await page.unroute('**/api/goals?*'); await page.route('**/api/goals?*', route => route.fulfill({ json: { data: [], nextCursor: null } }));
  await page.reload(); await expect(page.getByRole('heading', { name: 'No goals saved yet.', exact: true })).toBeVisible();
});
});
