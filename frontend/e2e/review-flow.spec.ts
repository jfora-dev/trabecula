import { Page, expect, test } from '@playwright/test';

const AWAITING = 'TR-2026-0142';
const NEW_CASE = 'TR-2026-0149';

test.beforeEach(async ({ request }) => {
  // Every test starts from the seeded demo cases.
  expect((await request.post('/api/demo/reset')).ok()).toBeTruthy();
});

async function openCase(page: Page, reference: string) {
  await page.goto('/');
  await page.getByTestId(`case-${reference}`).click();
  await expect(page.getByTestId('case-reference')).toHaveText(reference);
  // The viewport reports how many layers it draws once every model has been downloaded and parsed.
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByTestId('viewport')).not.toHaveAttribute('data-layer-count', '0', {
    timeout: 30_000,
  });
}

/** Clicks a point of the 3D canvas given as fractions of its width and height. */
async function clickViewport(page: Page, fx: number, fy: number) {
  const box = (await page.getByTestId('viewport').boundingBox())!;
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}

test('lists the seeded cases', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await expect(page.getByRole('row', { name: new RegExp(AWAITING) })).toContainText(
    'Awaiting approval',
  );

  await page.getByRole('button', { name: 'Approved', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(1);
});

test('a surgeon reviews the plan in 3D, measures, checks the scan and approves', async ({
  page,
}) => {
  await openCase(page, AWAITING);
  await expect(page.getByTestId('case-status')).toHaveText('Awaiting approval');

  // The planned result is shown first, with the implant.
  await expect(page.getByTestId('stage-planned')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('model-PLATE')).toContainText('Volar plate');

  // Before surgery: the guide instead of the plate.
  await page.getByTestId('stage-preop').click();
  await expect(page.getByTestId('model-GUIDE')).toBeVisible();
  await expect(page.getByTestId('model-PLATE')).toHaveCount(0);

  // Measure along the radius, seen from the radial side where the bone fills the middle of the view.
  await page.getByRole('button', { name: 'Radial' }).click();
  await page.waitForTimeout(500); // camera move
  await page.getByTestId('measure-toggle').click();
  await expect(page.getByTestId('viewer-status')).toHaveText(
    'Click the first point on a solid model',
  );
  await clickViewport(page, 0.5, 0.62);
  await expect(page.getByTestId('viewer-status')).toHaveText('Click the second point');
  await clickViewport(page, 0.5, 0.82);
  const measured = page.getByTestId('measurements').locator('li');
  await expect(measured).toHaveCount(1);
  const millimetres = Number((await measured.locator('strong').innerText()).replace(' mm', ''));
  expect(millimetres).toBeGreaterThan(5);
  expect(millimetres).toBeLessThan(60);
  await expect(page.locator('.measure-label text')).toHaveText(`${millimetres.toFixed(1)} mm`);

  // CT workspace: the bone surface is rebuilt from the voxels when the threshold moves.
  await page.getByTestId('mode-ct').click();
  const triangles = page.getByTestId('surface-triangles');
  await expect(triangles).toBeVisible({ timeout: 30_000 });
  const before = await triangles.innerText();
  await page.getByTestId('threshold').fill('900');
  await expect(page.getByTestId('threshold-value')).toHaveText('900 HU');
  await expect(triangles).not.toHaveText(before);

  // Approve: the decision is recorded and no further action is offered.
  await page.getByTestId('approve').click();
  await expect(page.getByTestId('case-status')).toHaveText('Approved');
  await expect(page.getByTestId('decision')).toContainText('The order is binding');
  await expect(page.getByTestId('approve')).toHaveCount(0);
  await expect(page.locator('.history li').first()).toContainText('Plan approved');

  // The list reflects it.
  await page.getByRole('link', { name: 'All cases' }).click();
  await expect(page.getByRole('row', { name: new RegExp(AWAITING) })).toContainText('Approved');
});

test('requesting changes needs a comment and sends the case back to design', async ({ page }) => {
  await openCase(page, AWAITING);

  await page.getByTestId('request-changes').click();
  await expect(page.getByTestId('send-change-request')).toBeDisabled();
  await page.getByTestId('change-comment').fill('Please use a longer plate, four shaft holes.');
  await page.getByTestId('send-change-request').click();

  await expect(page.getByTestId('case-status')).toHaveText('In design');
  const latest = page.locator('.history li').first();
  await expect(latest).toContainText('Changes requested');
  await expect(latest).toContainText('Please use a longer plate, four shaft holes.');

  // The designer hands it back.
  await page.getByTestId('submit').click();
  await expect(page.getByTestId('case-status')).toHaveText('Awaiting approval');
});

test('a case without a plan shows the scan models only and cannot be submitted', async ({
  page,
}) => {
  await openCase(page, NEW_CASE);
  await expect(page.getByTestId('case-status')).toHaveText('In design');
  await expect(page.getByTestId('stage-planned')).toBeDisabled();
  await expect(page.getByTestId('submit')).toBeDisabled();
  await expect(page.getByTestId('model-BONE')).toHaveCount(2);
});
