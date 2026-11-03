const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });

  const viewports = [
    { label: 'desktop_1920x1080', width: 1920, height: 1080 },
    { label: 'mobile_390x844', width: 390, height: 844 }
  ];

  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    const fileUrl = 'file:///' + path.resolve(__dirname, 'test_perfect_slicing.html').replace(/\\/g, '/');
    await page.goto(fileUrl);
    await page.waitForTimeout(300);

    // Initial state (closed)
    await page.screenshot({ path: `scratch/perfect_${vp.label}_01_closed.png` });

    // Open
    await page.click('#openMenuBtn');
    await page.waitForTimeout(1000); // Wait for full animation
    await page.screenshot({ path: `scratch/perfect_${vp.label}_02_open.png` });

    // Close
    await page.click('#closeMenuBtn');
    await page.waitForTimeout(800); // Wait for close animation
    await page.screenshot({ path: `scratch/perfect_${vp.label}_03_closed_again.png` });

    await page.close();
  }

  await browser.close();
  console.log('Saved all perfect test screenshots!');
})();

