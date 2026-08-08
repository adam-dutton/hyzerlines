import { test } from '@playwright/test';
import { openEditor, openLayers, setSwitch } from './fixtures';

test('layers panel', async ({ page }) => {
  await openEditor(page, { center: [-93.1, 44.9], zoom: 14 });
  await openLayers(page);
  await setSwitch(page, 'Hillshade', true);
  await setSwitch(page, 'Contours', true);
  await page.waitForTimeout(1500);
  const panel = page.getByRole('radiogroup', { name: 'Basemap' }).locator('../..');
  await panel.screenshot({ path: 'layers.png' });
});
