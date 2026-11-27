import { startFixtureSuite } from './fixture';
import { expect, test, type Page } from '@playwright/test';
test.beforeAll(async ({ request }) => { await startFixtureSuite(request); });
test.beforeEach(async ({ context, baseURL }) => {
  const allowed=new URL(baseURL!).origin;
  await context.route('**/api/**',route=>new URL(route.request().url()).origin===allowed?route.continue():route.abort());
});
async function signIn(page: Page) {
  await page.goto('/login');await page.getByLabel('Email address',{exact:true}).fill('ui-student@example.test');
  await page.getByLabel('Password',{exact:true}).fill('Fictional browser test passphrase!');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Your next steps start here.'})).toBeVisible();
}
test('dashboard shows owned real totals and recent records without exposing the peer',async({page})=>{
  await signIn(page);
  await expect(page.locator('#main-content')).toBeFocused();
  for(const [label,value] of [['Total goals','2'],['Active goals','1'],['Completed goals','1'],['Overdue goals','0']]) {
    await expect(page.getByRole('article',{name:label,exact:true}).locator('.stat-value')).toHaveText(value);
  }
  await expect(page.getByRole('heading',{name:'Plan my first portfolio project'})).toBeVisible();
  await expect(page.getByText('Peer private goal')).toHaveCount(0);
  await page.reload();await expect(page.getByRole('article',{name:'Total goals',exact:true}).locator('.stat-value')).toHaveText('2');
});
test('profile saves refresh dashboard data and unsaved navigation can be cancelled or discarded',async({page})=>{
  await signIn(page);await page.getByRole('link',{name:'Edit profile',exact:true}).click();
  await expect(page.locator('#main-content')).toBeFocused();
  await page.getByLabel('Target role',{exact:true}).fill('Cloud engineer');await page.getByRole('button',{name:'Save profile',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Your profile is saved.');
  await page.getByLabel('Target role',{exact:true}).fill('Unsaved direction');
  const dashboardLink=page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Dashboard',exact:true});
  const cancelled = new Promise<void>(resolve => page.once('dialog', async dialog => { expect(dialog.type()).toBe('confirm'); await dialog.dismiss(); resolve(); }));
  await dashboardLink.click();await cancelled;
  await expect(page).toHaveURL(/\/profile$/);await expect(page.getByLabel('Target role',{exact:true})).toHaveValue('Unsaved direction');
  const discarded = new Promise<void>(resolve => page.once('dialog', async dialog => { expect(dialog.type()).toBe('confirm'); await dialog.accept(); resolve(); }));
  await dashboardLink.click();await discarded;
  await expect(page.getByRole('heading',{name:'Cloud engineer',exact:true})).toBeVisible();
  await expect(page.getByText('Unsaved direction',{exact:true})).toHaveCount(0);
});
test('dashboard handles load failure, retry and a mobile viewport without overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});let fail=true;
  await page.route('**/api/users/dashboard',route=>{
    if(fail){return route.fulfill({status:500,contentType:'application/json',body:'{"message":"Internal server error"}'});}
    return route.continue();
  });
  await signIn(page);await expect(page.getByRole('alert')).toContainText('We couldn’t load your dashboard.');
  fail=false;await page.getByRole('button',{name:'Try again',exact:true}).click();
  await expect(page.getByRole('article',{name:'Total goals',exact:true}).locator('.stat-value')).toHaveText('2');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
