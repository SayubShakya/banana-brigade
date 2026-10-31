// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const { test, expect } = require('@playwright/test');

test('register, log in, start Quick Play and solve the deploy puzzle', async ({ page }) => {
  const name = `e2e_${Date.now().toString(36).slice(-6)}`;
  const password = 'E2e-banana-run-2026';

  await page.addInitScript(() => localStorage.setItem('brigade.clipsSeen', JSON.stringify(['logo', 'intro', 'deploy', 'respawn', 'crate', 'victory', 'daily', 'rankup', 'chapter-1', 'chapter-2', 'chapter-3'])));
  await page.goto('/');
  await expect(page.getByText('How the Banana puzzles work')).toBeVisible();
  await page.getByRole('button', { name: 'Play', exact: true }).click();

  await page.getByRole('tab', { name: 'Create account' }).click();
  await page.getByLabel('Username').fill(name);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).last().click();
  await expect(page.locator('.name-tag')).toContainText(name);

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: 'Account' }).click();
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page.getByText('How the Banana puzzles work')).toBeVisible();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByLabel('Username').fill(name);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in' }).last().click();
  await expect(page.locator('.name-tag')).toContainText(name);

  await page.getByRole('button', { name: /Quick Play/i }).click();
  await page.getByRole('button', { name: /Medium/ }).click();
  const puzzle = page.getByRole('dialog');
  await expect(puzzle).toBeVisible();
  await expect(puzzle.locator('img')).toBeVisible();
  await puzzle.getByRole('button', { name: '7', exact: true }).click();

  await expect(page.locator('#screen-battle')).toBeVisible();
  await expect(page.locator('#battle-canvas')).toBeVisible();
  await expect(page.locator('#hud')).toBeVisible();
});

test('unknown pages show the 404 screen with status 404', async ({ page }) => {
  const res = await page.goto('/this-page-does-not-exist');
  expect(res.status()).toBe(404);
  await expect(page.getByText('That page does not exist.')).toBeVisible();
});
