import { expect, test, type Page } from '@playwright/test';
import { startFixtureSuite } from './fixture';

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
}

test('goal changes: edit, clear, complete and confirmed deletion update real records and counts', async ({ page }) => {
  await signIn(page); await page.goto('/goals/new');
  await page.getByLabel('Title', { exact: true }).fill('Fictional editable goal');
  await page.getByLabel('Category', { exact: true }).fill('Learning');
  await page.getByRole('button', { name: 'Create goal', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Fictional editable goal', exact: true })).toBeVisible();
  const detail = page.url(); let patchBody: unknown;
  page.on('request', request => { if (request.method() === 'PATCH') patchBody = request.postDataJSON(); });
  await page.getByRole('button', { name: 'Edit goal', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Fictional edited goal');
  await page.getByLabel('Description (optional)', { exact: true }).fill('A saved first step.');
  await page.getByLabel('Target date (optional)', { exact: true }).fill('2030-01-02');
  await page.getByRole('button', { name: 'Save goal', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Goal updated.');
  expect(patchBody).toEqual({ title: 'Fictional edited goal', description: 'A saved first step.', targetDate: '2030-01-02' });
  await page.reload(); await expect(page.getByRole('heading', { name: 'Fictional edited goal', exact: true })).toBeVisible();
  await expect(page.getByText('A saved first step.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit goal', exact: true }).click();
  await page.getByLabel('Description (optional)', { exact: true }).fill('');
  await page.getByLabel('Target date (optional)', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Save goal', exact: true }).click();
  await expect(page.getByText('No description added.', { exact: true })).toBeVisible();
  await expect(page.getByText('No target date', { exact: true })).toBeVisible();
  expect(patchBody).toEqual({ description: null, targetDate: null });
  await page.getByRole('button', { name: 'Mark completed', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Goal marked completed.');
  await expect(page.locator('.goal-detail > .goal-status')).toHaveText('Completed');
  await page.goto('/dashboard');
  await expect(page.getByRole('article', { name: 'Completed goals', exact: true }).locator('.stat-value')).toHaveText('2');
  await page.goto(detail); let deletes = 0;
  page.on('request', request => { if (request.method() === 'DELETE') deletes++; });
  const cancelled = new Promise<void>(resolve => page.once('dialog', async dialog => { expect(dialog.message()).toContain('cannot be undone'); await dialog.dismiss(); resolve(); }));
  await page.getByRole('button', { name: 'Delete goal', exact: true }).click(); await cancelled;
  expect(deletes).toBe(0); await expect(page).toHaveURL(detail);
  const confirmed = new Promise<void>(resolve => page.once('dialog', async dialog => { await dialog.accept(); resolve(); }));
  await page.getByRole('button', { name: 'Delete goal', exact: true }).click(); await confirmed;
  await expect(page).toHaveURL(/\/goals$/); expect(deletes).toBe(1);
  await expect(page.getByRole('link', { name: 'Fictional edited goal', exact: true })).toHaveCount(0);
  await page.goto(detail); await expect(page.getByRole('heading', { name: 'Goal unavailable' })).toBeVisible();
  await page.goto('/dashboard');
  await expect(page.getByRole('article', { name: 'Total goals', exact: true }).locator('.stat-value')).toHaveText('2');
});

test('goal changes: failed edits preserve drafts and failed deletes do not claim success', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await signIn(page); await page.goto('/goals/1');
  await page.getByRole('button', { name: 'Edit goal', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Unsaved edit');
  await page.route('**/api/goals/1', route => ['PATCH', 'DELETE'].includes(route.request().method()) ? route.fulfill({ status: 500, json: { message: 'Temporary failure' } }) : route.continue());
  await page.getByRole('button', { name: 'Save goal', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Reload saved goal details');
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Unsaved edit');
  await expect(page.getByRole('button', { name: 'Save goal', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Reload saved goal', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Saved details reloaded');
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Unsaved edit');
  const discard = new Promise<void>(resolve => page.once('dialog', async dialog => { await dialog.accept(); resolve(); }));
  await page.getByRole('button', { name: 'Cancel editing', exact: true }).click(); await discard;
  const confirmed = new Promise<void>(resolve => page.once('dialog', async dialog => { await dialog.accept(); resolve(); }));
  await page.getByRole('button', { name: 'Delete goal', exact: true }).click(); await confirmed;
  await expect(page.getByRole('alert')).toContainText('We couldn’t confirm the result');
  await expect(page).toHaveURL(/\/goals\/1$/);
  await expect(page.getByRole('heading', { name: 'Plan my first portfolio project', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete goal', exact: true })).toBeDisabled();
});
