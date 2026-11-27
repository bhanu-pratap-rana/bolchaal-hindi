import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Automated accessibility checks (WCAG 2.1 A/AA rules). This catches a subset of problems; it doesn't replace testing with a screen reader.
for (const [name, path] of [['home', './'], ['day', './#/day/d07'], ['scene', './#/scene/d07s1'], ['words', './#/words/d07']]) {
  test(`${name} page has no serious accessibility violations`, async ({ page }) => {
    await page.goto(path);
    await page.locator('main h1').first().waitFor();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact || ''));
    expect(serious.map((v) => `${v.id}: ${v.nodes.length} (${v.nodes[0]?.target})`)).toEqual([]);
  });
}

test('dark theme scene has no contrast violations', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('./#/scene/d07s1');
  await page.locator('main h1').first().waitFor();
  const results = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`)).toEqual([]);
});
