import { test, expect } from '@playwright/test';

import { clickMap, course, openEditor, place, waitForSave } from './fixtures';

/**
 * Holes, par and design checks, through the real UI.
 *
 * The measurement and par logic is unit-tested exhaustively in
 * @hyzerlines/core. What only a browser can answer is whether the panel is
 * wired to it: whether adding a hole claims the right features, whether a par
 * override survives, and whether findings appear and can be silenced.
 */

test.describe('holes', () => {
  test('shows an empty state until a hole exists', async ({ page }) => {
    await openEditor(page, { zoom: 16 });
    await expect(page.getByText(/Add a hole, then draw its tee and basket/)).toBeVisible();
  });

  test('adding a hole claims the drawn tee and basket, and measures between them', async ({
    page,
  }) => {
    await openEditor(page, { zoom: 16 });
    await place(page, 'Tee pad', 400, 500);
    await place(page, 'Target', 800, 300);

    await page.getByRole('button', { name: 'Add hole' }).click();

    await expect(page.getByText('Hole 1').first()).toBeVisible();
    // A measured distance, not a placeholder — proves it found both ends.
    await expect(
      page
        .getByRole('list')
        .getByText(/\d+ ft/)
        .first(),
    ).toBeVisible();
    await expect(page.getByText(/· Par \d/)).toBeVisible();
  });

  /*
   * The corridor is the biggest thing a hole draws and it was inert — clicking
   * the shape that *is* the hole did nothing, while the number floating in the
   * middle of it was the only target. It carries a `selectAs` pointing at the
   * hole, so a click on it lands where the eye already is.
   *
   * Browser-only: it is a question about hit-testing order, and the corridor is
   * the last interactive layer precisely so that a tee on top of it still wins.
   */
  test('clicking a fairway corridor selects its hole', async ({ page }) => {
    await openEditor(page, { zoom: 16 });
    await place(page, 'Tee pad', 400, 500);
    await place(page, 'Target', 800, 300);
    await page.getByRole('button', { name: 'Add hole' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('textbox', { name: 'Hole name' })).toBeHidden();

    // A third of the way along the shot, off the line itself.
    await clickMap(page, 545, 425);
    await expect(page.getByRole('textbox', { name: 'Hole name' })).toBeVisible();
  });

  test('par can be overridden, and the override persists across a reload', async ({ page }) => {
    await openEditor(page, { zoom: 16 });
    await place(page, 'Tee pad', 400, 500);
    await place(page, 'Target', 800, 300);
    await page.getByRole('button', { name: 'Add hole' }).click();

    const par = page.getByRole('combobox', { name: /Par for Hole 1/ });
    await par.selectOption('5');
    await expect(par).toHaveValue('5');

    await waitForSave(page);
    await page.reload();
    await page.locator('[data-hydrated="true"]').waitFor({ state: 'attached' });

    await expect(page.getByRole('combobox', { name: /Par for Hole 1/ })).toHaveValue('5');
  });

  test('reports a hole with nothing assigned, and can silence the check', async ({ page }) => {
    await openEditor(page, { zoom: 16 });

    // No features drawn, so the new hole has neither tee nor basket.
    await page.getByRole('button', { name: 'Add hole' }).click();

    const notes = page.getByRole('button', { name: /notes?$/ });
    await expect(notes).toBeVisible();
    await notes.click();

    await expect(page.getByText(/has no tee assigned/)).toBeVisible();

    // Advisory, never prescriptive: every check must be silenceable.
    await page
      .getByRole('listitem')
      .filter({ hasText: /has no tee assigned/ })
      .getByRole('button', { name: 'Ignore this check' })
      .click();

    await expect(page.getByText(/has no tee assigned/)).toBeHidden();
  });

  test('flags a tee that belongs to no hole', async ({ page }) => {
    await openEditor(page, { zoom: 16 });
    await place(page, 'Tee pad', 400, 500);

    const notes = page.getByRole('button', { name: /notes?$/ });
    await expect(notes).toBeVisible();
    await notes.click();
    await expect(page.getByText(/not assigned to a hole/)).toBeVisible();
  });

  test('a clean hole produces no findings', async ({ page }) => {
    await openEditor(page, { zoom: 16 });
    await place(page, 'Tee pad', 400, 500);
    await place(page, 'Target', 800, 300);
    await page.getByRole('button', { name: 'Add hole' }).click();

    await expect(page.getByRole('button', { name: /notes?$/ })).toBeHidden();
  });

  test('holes survive a reload', async ({ page }) => {
    await openEditor(page, { zoom: 16 });
    await place(page, 'Tee pad', 400, 500);
    await place(page, 'Target', 800, 300);
    await page.getByRole('button', { name: 'Add hole' }).click();
    await expect(page.getByText('Hole 1').first()).toBeVisible();

    await waitForSave(page);
    await page.reload();
    await page.locator('[data-hydrated="true"]').waitFor({ state: 'attached' });

    await expect(page.getByText('Hole 1').first()).toBeVisible();
  });

  /**
   * Par comes from the PDGA table for the TEE'S skill level, and a tee's colour
   * is that level — [ELEMENTS] p3. The course no longer carries one of its own,
   * so this is the wiring that replaced it: set the colour, the par re-bands.
   */
  test('the tee colour sets the skill level, and re-pars the hole', async ({ page }) => {
    await openEditor(page, { zoom: 16 });
    // ~570 ft at zoom 16: par 4 for White (431-765), par 3 for Gold (186-585).
    await place(page, 'Tee pad', 340, 500);
    await place(page, 'Target', 740, 200);
    await page.getByRole('button', { name: 'Add hole' }).click();

    const par = page.getByRole('combobox', { name: /Par for Hole 1/ });
    const asDefault = await par.inputValue();

    // Select the tee to reach its properties, then colour it Gold.
    await page.getByRole('button', { name: 'Select Tee pad' }).click();
    const colour = page.getByRole('combobox', { name: 'Skill color' });
    await colour.selectOption('gold');
    await expect(colour).toHaveValue('gold');

    await expect(par).not.toHaveValue(asDefault);
    const asGold = await par.inputValue();
    expect(Number(asGold)).toBeLessThan(Number(asDefault));

    await waitForSave(page);
    await page.reload();
    await page.locator('[data-hydrated="true"]').waitFor({ state: 'attached' });

    await expect(page.getByRole('combobox', { name: /Par for Hole 1/ })).toHaveValue(asGold);
    // And the course panel reports the level it derived, rather than storing one.
    await page.keyboard.press('Escape');
    await expect(page.getByText('Gold', { exact: true }).first()).toBeVisible();
  });

  /**
   * A PDGA check must say which document it came from. A designer quoting a
   * figure to a parks department needs to know it is a published standard and
   * which revision, not this app's opinion.
   */
  test('a PDGA finding cites its source document', async ({ page }) => {
    await openEditor(page, { zoom: 16 });
    await place(page, 'Tee pad', 400, 500);
    await place(page, 'Target', 410, 495);
    await page.getByRole('button', { name: 'Add hole' }).click();

    await page.getByRole('button', { name: /notes?$/ }).click();

    const item = page.getByRole('listitem').filter({ hasText: /under the 100 ft minimum/ });
    await expect(item).toBeVisible();
    await expect(item.getByRole('link', { name: /Course Design Elements/ })).toBeVisible();
  });

  /**
   * A course you cannot see is a course you cannot work on.
   *
   * The map opens on the geographic centre of the US, and restoring an autosave
   * used not to move it at all — so a reload showed a scorecard full of holes
   * over an empty continent. The camera now goes to the work.
   */
  test('a restored course is framed on screen, not left at the default view', async ({
    page,
  }) => {
    await openEditor(page, { zoom: 16 });
    await place(page, 'Tee pad', 400, 500);
    await place(page, 'Target', 800, 300);
    await page.getByRole('button', { name: 'Add hole' }).click();

    const before = await page.evaluate(() => ({
      center: window.hyzerlinesMap!.getCenter().toArray(),
      zoom: window.hyzerlinesMap!.getZoom(),
    }));

    await waitForSave(page);
    await page.reload();
    await page.locator('[data-hydrated="true"]').waitFor({ state: 'attached' });
    await expect(page.getByText('Hole 1').first()).toBeVisible();

    await expect
      .poll(() => page.evaluate(() => window.hyzerlinesMap!.getZoom()))
      .toBeGreaterThan(12);

    const after = await page.evaluate(() => ({
      center: window.hyzerlinesMap!.getCenter().toArray(),
      zoom: window.hyzerlinesMap!.getZoom(),
    }));

    // Near where the work is, at a working zoom — not the continent.
    expect(after.center[0]).toBeCloseTo(before.center[0]!, 1);
    expect(after.center[1]).toBeCloseTo(before.center[1]!, 1);
    expect(after.zoom).toBeGreaterThan(12);

    // Both features are inside the viewport, which is the actual promise.
    const visible = await page.evaluate(() => {
      const map = window.hyzerlinesMap!;
      const canvas = map.getCanvas();
      return map
        .querySourceFeatures('course-features')
        .filter((f) => f.geometry.type === 'Point')
        .map((f) => map.project((f.geometry as GeoJSON.Point).coordinates as [number, number]))
        .every(
          (p) =>
            p.x >= 0 && p.y >= 0 && p.x <= canvas.clientWidth && p.y <= canvas.clientHeight,
        );
    });
    expect(visible).toBe(true);
  });

  test('Zoom to fit frames the whole course', async ({ page }) => {
    await openEditor(page, { zoom: 16 });
    await place(page, 'Tee pad', 400, 500);
    await place(page, 'Target', 800, 300);

    // Wander off, then ask to come back.
    await page.evaluate(() => window.hyzerlinesMap!.jumpTo({ center: [-80, 40], zoom: 6 }));
    await page.waitForTimeout(200);

    await page.locator('canvas.maplibregl-canvas').click({ position: { x: 600, y: 550 } });
    await page.keyboard.press('Shift+1');

    await expect
      .poll(() => page.evaluate(() => window.hyzerlinesMap!.getZoom()))
      .toBeGreaterThan(12);
    await expect
      .poll(() => page.evaluate(() => window.hyzerlinesMap!.getCenter().lng))
      .toBeLessThan(-90);
  });

  test('adding a hole is undoable', async ({ page }) => {
    await openEditor(page, { zoom: 16 });
    await place(page, 'Tee pad', 400, 500);
    await place(page, 'Target', 800, 300);
    await page.getByRole('button', { name: 'Add hole' }).click();
    await expect(page.getByText('Hole 1').first()).toBeVisible();

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText(/Add a hole, then draw its tee and basket/)).toBeVisible();
  });
});

/**
 * The card, which is what a second tee turns the hole list into.
 *
 * The list resolved every hole through `representativePair`, so a hole with a
 * gold tee and a red tee showed one length and the other was in the file and on
 * screen nowhere. Browser-only because the question is whether the panel
 * switches — the columns and totals themselves are unit-tested in core.
 */
test.describe('the scorecard', () => {
  test('a second tee turns the hole list into a card with a column each', async ({ page }) => {
    await openEditor(page, { zoom: 16 });
    await place(page, 'Tee pad', 340, 500);
    await place(page, 'Target', 740, 300);
    await page.getByRole('button', { name: 'Add hole' }).click();

    // One tee: a list, because a table with one column says nothing extra.
    await expect(page.getByRole('table')).toHaveCount(0);

    // Adding a hole selects it, so the next tee joins rather than landing loose.
    await place(page, 'Tee pad', 460, 500);

    // Still one column — both tees are unclassified, so both are Unmarked.
    await expect(page.getByRole('table')).toHaveCount(0);

    // Colour one of them, and the hole now has two levels to compare. Twice,
    // because the first click on anything in a hole selects the hole.
    await clickMap(page, 460, 500);
    await clickMap(page, 460, 500);
    await page.getByRole('combobox', { name: 'Skill color' }).selectOption('gold');

    const card = page.getByRole('table');
    await expect(card.getByRole('columnheader', { name: 'Gold' })).toBeVisible();
    await expect(card.getByRole('columnheader', { name: 'Unmarked' })).toBeVisible();

    // Two lengths on the row, and the shorter one under Gold: it is the tee
    // that was placed further down the fairway.
    const cells = card.getByRole('row').filter({ hasText: 'Hole 1' }).getByRole('cell');
    const gold = Number((await cells.nth(2).innerText()).replace(/,/g, ''));
    const unmarked = Number((await cells.nth(3).innerText()).replace(/,/g, ''));
    expect(gold).toBeGreaterThan(0);
    expect(gold).toBeLessThan(unmarked);

    // The unit is stated once, on the total, rather than in every cell.
    await expect(page.getByText(/^Total (ft|m)$/)).toBeVisible();
  });

  /*
   * Par is a property of the shot, and the card is the only place a three-tee
   * hole's three pars can be set — the hole panel edits one shot at a time.
   * The failure this guards is the one the plan named: a control in the Red
   * column writing par onto the representative pair, which is the Gold tee's.
   */
  test('the par column edits its own column’s pair', async ({ page }) => {
    await openEditor(page, { zoom: 16 });
    await place(page, 'Tee pad', 340, 500);
    await place(page, 'Target', 740, 300);
    await page.getByRole('button', { name: 'Add hole' }).click();
    await place(page, 'Tee pad', 460, 500);

    await clickMap(page, 460, 500);
    await clickMap(page, 460, 500);
    await page.getByRole('combobox', { name: 'Skill color' }).selectOption('gold');

    // The gold tee is the one placed second, so the unmarked column is the
    // first tee — the one `representativePair` resolves to.
    const before = await course(page);
    const [firstTee, goldTee] = before.holes[0]!.teeIds;
    const target = before.holes[0]!.targetIds[0]!;

    await page.getByRole('radio', { name: 'Par' }).click();

    /*
     * Anything other than what the column already suggests. Choosing the
     * suggested value clears the override rather than pinning it, which is the
     * right behaviour and would make this assert nothing.
     */
    const disagree = async (column: string) => {
      const control = page.getByRole('combobox', { name: `Par for Hole 1, ${column}` });
      const value = (await control.inputValue()) === '6' ? '2' : '6';
      await control.selectOption(value);
      return Number(value);
    };

    const unmarkedPar = await disagree('Unmarked');
    await expect
      .poll(async () =>
        (await course(page)).pairs.map((p) => [p.teeId, p.targetId, p.parOverride]),
      )
      .toEqual([[firstTee, target, unmarkedPar]]);

    // And the gold column writes to the gold tee's pair, not to the same one.
    const goldPar = await disagree('Gold');
    await expect
      .poll(async () => {
        const pairs = (await course(page)).pairs;
        return [
          pairs.find((p) => p.teeId === goldTee)?.parOverride,
          pairs.find((p) => p.teeId === firstTee)?.parOverride,
        ];
      })
      .toEqual([goldPar, unmarkedPar]);
  });
});
