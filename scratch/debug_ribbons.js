const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });

  // Test Mobile: 390x844
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.addInitScript(() => {
      localStorage.setItem('bot_selected_class', 'Class 2');
      localStorage.setItem('bot_selected_book', 'Science');
    });
    await page.goto('http://localhost:5000/widget/chat.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    // Open menu
    await page.click('#academicMenuTrigger');
    await page.waitForTimeout(1200); // wait for GSAP animation to complete
    await page.screenshot({ path: 'scratch/debug_mobile_open.png' });

    const info = await page.evaluate(() => {
      const top = document.querySelector('.menu-bg.top').getBoundingClientRect();
      const mid = document.querySelector('.menu-bg.middle').getBoundingClientRect();
      const bot = document.querySelector('.menu-bg.bottom').getBoundingClientRect();
      return { top, mid, bot };
    });
    console.log('Mobile 390x844 Ribbons BBoxes:', JSON.stringify(info, null, 2));
    await page.close();
  }

  // Test Desktop: 1920x1080
  {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.addInitScript(() => {
      localStorage.setItem('bot_selected_class', 'Class 2');
      localStorage.setItem('bot_selected_book', 'Science');
    });
    await page.goto('http://localhost:5000/widget/chat.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    // Open menu
    await page.click('#academicMenuTrigger');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: 'scratch/debug_desktop_open.png' });

    const info = await page.evaluate(() => {
      const top = document.querySelector('.menu-bg.top').getBoundingClientRect();
      const mid = document.querySelector('.menu-bg.middle').getBoundingClientRect();
      const bot = document.querySelector('.menu-bg.bottom').getBoundingClientRect();
      return { top, mid, bot };
    });
    console.log('Desktop 1920x1080 Ribbons BBoxes:', JSON.stringify(info, null, 2));
    await page.close();
  }

  await browser.close();
})();

