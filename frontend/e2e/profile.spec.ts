import { test, expect } from '@playwright/test';
const email = 'ui-student@example.test';
const password = 'Fictional browser test passphrase!';
// The harness must provide a disposable native PostgreSQL backend, never Supabase.
test.beforeAll(async ({ request }) => {
  const key = process.env.E2E_FIXTURE_KEY;
  if (!key) throw new Error('Refusing browser writes without E2E_FIXTURE_KEY and the isolated backend browser fixture.');
  const response = await request.get('/api/__local_fixture__');
  expect(response.ok()).toBe(true);
  expect((await response.json()).fixtureKey).toBe(key);
});
test.beforeEach(async ({ page, context, baseURL }) => {
  const allowed = new URL(baseURL!).origin;
  await context.route('**/api/**', route => new URL(route.request().url()).origin === allowed ? route.continue() : route.abort());
  await page.goto('/login');
});
async function login(page: import('@playwright/test').Page) {
  await page.getByLabel('Email address').fill(email); await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your next steps start here.' })).toBeVisible();
  await page.getByRole('link', { name: 'Edit profile', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your career, in context.' })).toBeVisible();
}
test('login, saved profile, clearing, reload and confirmed sign out', async ({ page }) => {
  await login(page); await expect(page.getByLabel('College or institution')).toBeVisible();
  await page.getByLabel('College or institution').fill('Fictional Engineering College');
  await page.getByLabel('Degree or programme').fill('BTech Computer Science');
  await page.getByLabel('Graduation year', { exact: true }).fill('2028');
  await page.getByLabel('Target role', { exact: true }).fill('Backend developer');
  await page.getByLabel('Weekly learning hours', { exact: true }).fill('8');
  await page.getByLabel('Interests', { exact: true }).fill('Web development, AI');
  await page.getByLabel('Short bio', { exact: true }).fill('Fictional student building useful projects.');
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Your profile is saved.');
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '5');
  await page.reload(); await expect(page.getByLabel('Degree or programme')).toHaveValue('BTech Computer Science');
  await page.getByLabel('Degree or programme').fill(''); await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '4');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Good to see you.' })).toBeVisible();
  await page.goto('/profile'); await expect(page.getByRole('heading', { name: 'Good to see you.' })).toBeVisible();
});
test('wrong password is safe, does not log in and clears the password input', async ({ page }) => {
  await page.getByLabel('Email address').fill(email); await page.getByLabel('Password', { exact: true }).fill('Wrong fictional passphrase!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Invalid email or password');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
});
test('mobile form fits without horizontal overflow and preserves unsaved edits on a failed save', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await login(page);
  await page.getByLabel('Target role', { exact: true }).fill('Frontend developer');
  await page.route('**/api/users/career-profile', async route => route.request().method() === 'PATCH'
    ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"Internal server error"}' }) : route.continue());
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Internal server error');
  await expect(page.getByLabel('Target role', { exact: true })).toHaveValue('Frontend developer');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close navigation', exact: true }).first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeFocused();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Close navigation', exact: true }).first().click();
});
test('simultaneous tab reloads do not replay refresh credentials', async ({ page, context }) => {
  await login(page); const second = await context.newPage(); await second.goto('/profile');
  await expect(second.getByRole('heading', { name: 'Your career, in context.' })).toBeVisible();
  await Promise.all([page.reload(), second.reload()]);
  await expect(page.getByRole('heading', { name: 'Your career, in context.' })).toBeVisible();
  await expect(second.getByRole('heading', { name: 'Your career, in context.' })).toBeVisible();
  await second.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Good to see you.' })).toBeVisible();
});
test('registration leads to explicit sign in and an empty private profile', async ({ page }) => {
  await page.getByRole('link', { name: 'Create an account' }).click();
  await page.getByLabel('Full name', { exact: true }).fill('Fictional New Student');
  await page.getByLabel('Email address', { exact: true }).fill('new-browser-student@example.test');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create your account', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Your account is ready.');
  await page.getByLabel('Email address', { exact: true }).fill('new-browser-student@example.test');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No goals saved yet.', exact: true })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Total goals', exact: true }).locator('.stat-value')).toHaveText('0');
  await page.getByRole('link', { name: 'Edit profile', exact: true }).click();
  await expect(page.getByLabel('College or institution', { exact: true })).toHaveValue('');
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
});
test('a denied profile read refreshes the session and retries successfully', async ({ page }) => {
  let denied = false, reads = 0;
  await page.route('**/api/users/career-profile', async route => {
    if (route.request().method() === 'GET') {
      reads++;
      if (!denied) { denied = true; await route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"Invalid or expired session"}' }); return; }
    }
    await route.continue();
  });
  await login(page); await expect(page.getByLabel('College or institution', { exact: true })).toBeVisible();
  expect(denied).toBe(true); expect(reads).toBe(2);
});
