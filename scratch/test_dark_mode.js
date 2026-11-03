const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });

  for (const vp of [
    { label: 'mobile_dark', width: 390, height: 844 },
    { label: 'desktop_dark', width: 1920, height: 1080 }
  ]) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.addInitScript(() => {
      localStorage.setItem('bot_selected_class', 'Class 2');
      localStorage.setItem('bot_selected_book', 'Science');
      localStorage.setItem('studybuddy_theme', 'dark');
    });
    await page.goto('http://localhost:5000/widget/chat.html', { waitUntil: 'networkidle' });

    // Click theme toggle if not in dark mode
    const isDark = await page.evaluate(() => document.body.classList.contains('dark-mode'));
    if (!isDark) {
      await page.click('#themeToggleBtn');
      await page.waitForTimeout(300);
    }

    // Open menu
    await page.click('#academicMenuTrigger');
    await page.waitForTimeout(1100);

    const shot = `scratch/ribbon_${vp.label}.png`;
    await page.screenshot({ path: shot });
    console.log(`Saved ${shot}`);
    await page.close();
  }

  await browser.close();
})();

