const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });

  const viewports = [
    { label: 'mobile_390x844', width: 390, height: 844, dsf: 3 },
    { label: 'desktop_1920x1080', width: 1920, height: 1080, dsf: 1 }
  ];

  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.dsf
    });
    const page = await context.newPage();
    const fileUrl = 'file:///' + path.resolve(__dirname, 'test_smoothness.html').replace(/\\/g, '/');
    await page.goto(fileUrl);
    await page.waitForTimeout(300);

    // Initial state
    await page.screenshot({ path: `scratch/smooth_${vp.label}_01_closed.png` });

    // Open
    await page.click('#openMenuBtn');
    await page.waitForTimeout(800); // Full open
    await page.screenshot({ path: `scratch/smooth_${vp.label}_02_open.png` });

    // Close
    await page.click('#academicCloseTrigger');
    await page.waitForTimeout(600); // Full close
    await page.screenshot({ path: `scratch/smooth_${vp.label}_03_closed.png` });

    await context.close();
  }

  await browser.close();
  console.log('Saved all smooth test screenshots!');
})();

