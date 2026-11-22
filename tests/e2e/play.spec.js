// Playwright end-to-end tests: a real Chromium browser clicks through the game like a player would.
// They prove the React client, the Express server and the database work together, not just each part alone.
const { test, expect } = require('@playwright/test');

// The main player journey: create an account, log out, log back in, start Quick Play and
// answer the Banana puzzle (the fake API's answer is 7) to reach the battle screen.
// It proves registration, login, session cookies and the puzzle gate all work in a real browser.
test('register, log in, start Quick Play and solve the deploy puzzle', async ({ page }) => {
  // A unique username each run, so the test never clashes with an earlier account.
  const name = `e2e_${Date.now().toString(36).slice(-6)}`;
  const password = 'E2e-banana-run-2026';

  // Mark every story clip as already seen, so no video pops up and blocks the clicks.
  await page.addInitScript(() => localStorage.setItem('brigade.clipsSeen', JSON.stringify(['logo', 'intro', 'deploy', 'respawn', 'crate', 'victory', 'daily', 'rankup', 'chapter-1', 'chapter-2', 'chapter-3'])));
  await page.goto('/');
  await expect(page.getByText('How the Banana puzzles work')).toBeVisible();
  await page.getByRole('button', { name: 'Play', exact: true }).click();

  // Create the account; the name tag in the menu shows we are logged in.
  await page.getByRole('tab', { name: 'Create account' }).click();
  await page.getByLabel('Username').fill(name);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).last().click();
  await expect(page.locator('.name-tag')).toContainText(name);

  // Log out, then log in again with the same password.
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: 'Account' }).click();
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page.getByText('How the Banana puzzles work')).toBeVisible();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByLabel('Username').fill(name);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in' }).last().click();
  await expect(page.locator('.name-tag')).toContainText(name);

  // Start a match: the puzzle dialog must show the Banana image; answering 7 unlocks the battle.
  await page.getByRole('button', { name: /Quick Play/i }).click();
  await page.getByRole('button', { name: /Medium/ }).click();
  const puzzle = page.getByRole('dialog');
  await expect(puzzle).toBeVisible();
  await expect(puzzle.locator('img')).toBeVisible();
  await puzzle.getByRole('button', { name: '7', exact: true }).click();

  // The battle screen, game canvas and HUD are now visible.
  await expect(page.locator('#screen-battle')).toBeVisible();
  await expect(page.locator('#battle-canvas')).toBeVisible();
  await expect(page.locator('#hud')).toBeVisible();
});

// Proves a wrong address returns a real HTTP 404 status and a friendly page, not a blank screen.
test('unknown pages show the 404 screen with status 404', async ({ page }) => {
  const res = await page.goto('/this-page-does-not-exist');
  expect(res.status()).toBe(404);
  await expect(page.getByText('That page does not exist.')).toBeVisible();
});

// Proves a shared preview link (/#difficulty) opens its screen only once: the hash is removed,
// so pressing Back and then refreshing keeps the player on the menu, still logged in.
test('a preview link opens once: Back then refresh stays on the menu', async ({ page }) => {
  const name = `e2e_${Date.now().toString(36).slice(-6)}`;
  const password = 'E2e-banana-run-2026';

  await page.addInitScript(() => localStorage.setItem('brigade.clipsSeen', JSON.stringify(['logo', 'intro', 'deploy', 'respawn', 'crate', 'victory', 'daily', 'rankup', 'chapter-1', 'chapter-2', 'chapter-3'])));
  await page.goto('/');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('tab', { name: 'Create account' }).click();
  await page.getByLabel('Username').fill(name);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).last().click();
  await expect(page.locator('.name-tag')).toContainText(name);

  await page.goto('/?v=1#difficulty');
  await expect(page.getByText('Choose Difficulty')).toBeVisible();
  // expect.poll keeps checking until the app has cleared the #difficulty hash from the URL.
  await expect.poll(() => new URL(page.url()).hash).toBe('');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.locator('.name-tag')).toContainText(name);
  await page.reload();
  await expect(page.locator('.name-tag')).toContainText(name);
  await expect(page.getByText('Choose Difficulty')).toBeHidden();
});

// Proves role-based access: a normal player cannot log in on the admin login page,
// and the page offers a way back to the normal player login.
test('the admin login page refuses a player account and links back to the player login', async ({ page, playwright }) => {
  const name = `pl_${Date.now().toString(36).slice(-6)}`;
  const password = 'E2e-banana-run-2026';
  // Create the player directly through the API (a separate request context, not the browser page).
  const other = await playwright.request.newContext({ baseURL: 'http://localhost:3199' });
  expect((await other.post('/api/auth/register', { data: { username: name, password } })).status()).toBe(201);
  await other.dispose();

  await page.goto('/#admin-login');
  await expect(page.getByRole('heading', { name: /Admin login/ })).toBeVisible();
  await page.getByLabel('Username').fill(name);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in as admin' }).click();
  await expect(page.getByRole('alert')).toContainText('admins only');
  await page.getByRole('button', { name: 'Player login' }).click();
  await expect(page.getByRole('tab', { name: 'Log in' })).toBeVisible();
});
