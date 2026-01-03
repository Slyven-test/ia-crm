import { test, expect } from '@playwright/test';

const pagesToCheck: Array<{ link: string; heading: RegExp | string }> = [
  { link: 'Runs', heading: /Runs, gating et exports/i },
  { link: 'Audit', heading: /QC & Audit/i },
  { link: 'Exports', heading: /^Exports$/i },
  { link: 'Campagnes', heading: /Campagnes \(Brevo\)/i },
];

test('UI smoke: runs/QC/exports/campaigns load without errors', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Connexion/i })).toBeVisible();
  await page.locator('input[type=\"text\"]').first().fill('demo');
  await page.locator('input[type=\"password\"]').fill('demo');
  await page.getByRole('button', { name: /se connecter/i }).click();

  // Wait for nav bar to appear
  await expect(page.getByRole('link', { name: 'Runs' })).toBeVisible();

  for (const { link, heading } of pagesToCheck) {
    await page.getByRole('link', { name: link }).click();
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  }

  expect(consoleErrors, `Console errors encountered: ${consoleErrors.join('; ')}`).toHaveLength(0);
});
