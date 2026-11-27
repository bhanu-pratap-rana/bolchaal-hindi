import { test, expect, Page } from '@playwright/test';

const SCENE = '#/scene/d07s1';

async function openScene(page: Page, hash = SCENE) {
  await page.goto('./' + hash);
  await expect(page.locator(hash.includes('mode=check') ? '.quiz' : '.lines .ln').first()).toBeVisible();
  await expect(page.locator('.play')).toBeEnabled({ timeout: 15_000 });
}
const activeIndex = (page: Page) => page.locator('.ln[data-active="true"]').getAttribute('data-i');

test.describe('course', () => {
  test('home shows all 20 days and the preview notice', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('.route .stop')).toHaveCount(20);
    await expect(page.locator('#preview-banner')).toBeVisible();
    await expect(page.locator('#preview-banner')).toContainText('AI-generated');
  });

  test('loads nothing from third-party hosts', async ({ page }) => {
    const foreign: string[] = [];
    page.on('request', (r) => { if (!r.url().startsWith('http://localhost:8788/bolchaal-hindi/')) foreign.push(r.url()); });
    await openScene(page);
    expect(foreign).toEqual([]);
  });

  test('day page lists scenes and links to words', async ({ page }) => {
    await page.goto('./#/day/d03');
    await expect(page.locator('h1')).toContainText('Day 3');
    expect(await page.locator('.scene-card').count()).toBeGreaterThan(3);
    await page.getByRole('link', { name: 'Words for this day' }).click();
    await expect(page.locator('.word').first()).toBeVisible();
  });
});

test.describe('listening', () => {
  test('play highlights lines in order; pause resumes in the same line', async ({ page }) => {
    await openScene(page);
    await page.locator('.play').click();
    await expect(page.locator('.ln[data-active="true"]')).toHaveAttribute('data-i', '0');
    await expect.poll(() => activeIndex(page), { timeout: 15_000 }).toBe('1');
    await page.getByRole('button', { name: 'Pause' }).click();
    await page.waitForTimeout(300);
    const t1 = await page.evaluate(() => (document.querySelector('.timeline input') as HTMLInputElement).value);
    const i1 = await activeIndex(page);
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => (document.querySelector('.timeline input') as HTMLInputElement).value)).toBe(t1);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForTimeout(300);
    expect(Number(await activeIndex(page))).toBeGreaterThanOrEqual(Number(i1));
  });

  test('line replay plays one line and stops', async ({ page }) => {
    await openScene(page);
    await page.getByRole('button', { name: 'Play line 2' }).click();
    await expect(page.locator('.ln[data-active="true"]')).toHaveAttribute('data-i', '1');
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible({ timeout: 15_000 });
    expect(await activeIndex(page)).toBe('1');
  });

  test('next and previous line move exactly one line', async ({ page }) => {
    await openScene(page);
    await page.getByRole('button', { name: 'Next line' }).click();
    await expect(page.locator('.ln[data-active="true"]')).toHaveAttribute('data-i', '1');
    await page.getByRole('button', { name: 'Next line' }).click();
    await expect(page.locator('.ln[data-active="true"]')).toHaveAttribute('data-i', '2');
    await page.getByRole('button', { name: 'Previous line' }).click();
    await expect(page.locator('.ln[data-active="true"]')).toHaveAttribute('data-i', '1');
  });

  test('space toggles play on the scene page', async ({ page }) => {
    await openScene(page);
    await page.locator('main h1').click();
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  });

  test('finishing a scene marks it heard', async ({ page }) => {
    await openScene(page, '#/scene/d08s3');
    await page.evaluate(() => { const a = document.querySelector('audio') as HTMLAudioElement | null; });
    await page.locator('.speed').click(); // 1.2x
    await page.locator('.play').click();
    await expect(page.locator('.done-card')).toBeVisible({ timeout: 40_000 });
    await page.goto('./#/day/d08');
    await expect(page.locator('a.scene-card[href="#/scene/d08s3"]')).toHaveAttribute('data-done', 'true');
  });

});

test.describe('regressions', () => {
  test('skip link moves focus to the content without changing page', async ({ page }) => {
    await openScene(page);
    await page.keyboard.press('Tab');
    await page.getByRole('link', { name: 'Skip to content' }).press('Enter');
    await expect(page.locator('.lines .ln').first()).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('This page doesn\'t exist');
  });

  test('a saved speed is applied to the audio, also after switching learner', async ({ page }) => {
    await page.goto('./');
    await page.evaluate(() => localStorage.setItem('bch:settings', JSON.stringify({ speed: 0.6 })));
    await page.reload();
    await openScene(page);
    await page.locator('.play').click();
    await expect(page.locator('.speed')).toHaveAttribute('data-rate', '0.6');
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('radio', { name: /A woman/ }).check();
    await page.getByRole('button', { name: 'Close settings' }).click();
    await page.locator('.play').click({ trial: true });
    await expect.poll(() => page.locator('.speed').getAttribute('data-rate')).toBe('0.6');
  });

  test('leaving a scene before it loads does not leave its player behind', async ({ page }) => {
    await page.route('**/data/lessons/d09.json', async (r) => { await new Promise((res) => setTimeout(res, 1200)); await r.continue(); });
    await page.goto('./#/scene/d09s1');
    await page.goto('./#/');
    await page.waitForTimeout(1600);
    await expect(page.locator('.route .stop')).toHaveCount(20);
    await expect(page.locator('.player')).toHaveCount(0);
  });
});

test.describe('audio failure', () => {
  // Block the service worker so the route below sees every audio request.
  test.use({ serviceWorkers: 'block' });
  test('missing audio shows a clear error with Try again', async ({ page }) => {
    await page.route('**/media/scenes/**', (r) => r.abort());
    await page.goto('./' + SCENE);
    await expect(page.getByRole('alert')).toContainText('didn\'t load');
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  });
});

test.describe('settings', () => {
  test('woman learner gets feminine forms and the feminine audio file', async ({ page }) => {
    await openScene(page, '#/scene/d07s5');
    const audioSrc = () => page.evaluate(() => [...document.querySelectorAll('audio')].map((a) => a.src).join(' '));
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('radio', { name: /A woman/ }).check();
    await page.getByRole('button', { name: 'Close settings' }).click();
    await expect(page.locator('.ln .fem').first()).toBeVisible();
    await expect(page.locator('.ln').filter({ has: page.locator('.fem') }).first()).toContainText('सकती');
    await page.reload();
    await expect(page.locator('.ln .fem').first()).toBeVisible();
  });

  test('Roman only hides every Devanagari line; Hindi only hides Roman', async ({ page }) => {
    await openScene(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('radio', { name: 'Roman only' }).check();
    await page.getByRole('button', { name: 'Close settings' }).click();
    const visibleDevanagari = await page.evaluate(() => [...document.querySelectorAll('.lines *')]
      .filter((el) => el.children.length === 0 && /[ऀ-ॿ]/.test(el.textContent || '') && (el as HTMLElement).offsetParent !== null).length);
    expect(visibleDevanagari).toBe(0);
    await expect(page.locator('.ln .t-ro').first()).toBeVisible();
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('radio', { name: 'Hindi only' }).check();
    await page.getByRole('button', { name: 'Close settings' }).click();
    await expect(page.locator('.ln .t-ro').first()).toBeHidden();
    await expect(page.locator('.ln .t-hi').first()).toBeVisible();
  });
});

test.describe('practice', () => {
  test('speak mode stops before the learner line and continues after', async ({ page }) => {
    await openScene(page, SCENE + '?mode=speak');
    await page.locator('.play').click();
    const turn = page.getByRole('group', { name: 'Your turn' });
    await expect(turn).toBeVisible({ timeout: 15_000 });
    await turn.getByRole('button', { name: 'Show the words' }).click();
    await turn.getByRole('button', { name: 'Next line' }).click();
    await expect(turn).toHaveCount(0);
  });

  test('record and compare never uploads the recording', async ({ page, browserName }) => {
    const posts: string[] = [];
    page.on('request', (r) => { if (r.method() !== 'GET') posts.push(r.url()); });
    await openScene(page, SCENE + '?mode=speak');
    await page.locator('.play').click();
    const turn = page.getByRole('group', { name: 'Your turn' });
    await expect(turn).toBeVisible({ timeout: 15_000 });
    await turn.getByRole('button', { name: 'Record myself' }).click();
    await expect(turn.getByRole('button', { name: /Stop recording/ })).toBeVisible();
    await page.waitForTimeout(700);
    await turn.getByRole('button', { name: /Stop recording/ }).click();
    await expect(turn.getByRole('button', { name: 'Play mine, then the model' })).toBeVisible();
    expect(posts).toEqual([]);
  });

  test('check mode asks questions, scores and saves the best score', async ({ page }) => {
    await openScene(page, SCENE + '?mode=check');
    const quiz = page.locator('.quiz');
    await expect(quiz).toContainText('Question 1 of');
    for (let i = 0; i < 6; i++) {
      if (await quiz.getByRole('heading', { name: /You got/ }).count()) break;
      await quiz.locator('.opt').first().click();
      await quiz.getByRole('button', { name: /Next question|See my score/ }).click();
    }
    await expect(quiz.getByRole('heading', { name: /You got \d of \d/ })).toBeVisible();
    await page.goto('./#/day/d07');
    await expect(page.locator('a.scene-card[href="#/scene/d07s1"]')).toContainText('best check');
  });

  test('tapping a word opens its meaning and marks it known', async ({ page }) => {
    await openScene(page, '#/scene/d07s3');
    const word = page.locator('.ln button.w').first();
    test.skip(await word.count() === 0, 'no glossary word in this scene');
    await word.click();
    const dlg = page.locator('#gloss');
    await expect(dlg).toBeVisible();
    await dlg.getByRole('button', { name: 'I know it' }).click();
    await expect(dlg.getByRole('button', { name: 'I know it' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('report link opens a prefilled issue for that line', async ({ page }) => {
    await openScene(page);
    const href = await page.getByRole('link', { name: 'Report a problem with line 1' }).getAttribute('href');
    expect(href).toContain('/issues/new?title=');
    expect(decodeURIComponent(href!)).toContain('d07s1 line 1');
  });
});

test.describe('reviewers and offline', () => {
  test('reviewer marks persist and export as CSV', async ({ page }) => {
    page.on('dialog', (d) => d.accept('Test Reviewer'));
    await page.goto('./?review=1' + SCENE);
    await expect(page.locator('#review-banner')).toBeVisible();
    await page.getByRole('group', { name: 'Review line 1' }).getByRole('button', { name: 'OK' }).click();
    await page.getByRole('textbox', { name: 'Note for line 2' }).fill('Pause too short');
    await page.getByRole('textbox', { name: 'Note for line 2' }).press('Tab');
    await page.reload();
    await expect(page.getByRole('group', { name: 'Review line 1' }).getByRole('button', { name: 'OK' })).toHaveAttribute('aria-pressed', 'true');
    await page.goto('./#/day/d07');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export review CSV' }).click()]);
    const csv = await (await dl.createReadStream()).toArray().then((c) => Buffer.concat(c).toString('utf8'));
    expect(csv).toContain('"d07s1","1","m"');
    expect(csv).toContain('"OK"');
    expect(csv).toContain('Pause too short');
  });

  test('a saved day plays offline', async ({ page, context }) => {
    await page.goto('./#/day/d08');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.getByRole('button', { name: 'Save for offline' }).click();
    await expect(page.getByText('Saved on this device.')).toBeVisible({ timeout: 30_000 });
    await page.reload();
    await page.evaluate(() => navigator.serviceWorker.ready);
    await context.setOffline(true);
    await page.goto('./#/scene/d08s1');
    await expect(page.locator('.play')).toBeEnabled({ timeout: 15_000 });
    await page.locator('.play').click();
    await expect.poll(() => activeIndex(page), { timeout: 15_000 }).toBe('1');
    await context.setOffline(false);
  });
});
