const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  console.log('Navigating to http://localhost:5000/widget/chat.html at 1920x1080...');
  await page.goto('http://localhost:5000/widget/chat.html', { waitUntil: 'networkidle' });

  // Take screenshot of desktop before opening menu
  await page.screenshot({ path: 'scratch/desktop_before_menu.png' });
  console.log('Screenshot saved: scratch/desktop_before_menu.png');

  // Check visibility and geometry of .menu-bg elements and .academic-menu-overlay
  const overlayInfo = await page.evaluate(() => {
    const overlay = document.getElementById('academicMenuOverlay');
    const bottomBg = overlay ? overlay.querySelector('.menu-bg.bottom') : null;
    const topBg = overlay ? overlay.querySelector('.menu-bg.top') : null;
    const middleBg = overlay ? overlay.querySelector('.menu-bg.middle') : null;
    
    function getBox(el) {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return {
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        pointerEvents: style.pointerEvents,
        top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom, right: r.right
      };
    }
    return {
      overlay: getBox(overlay),
      top: getBox(topBg),
      middle: getBox(middleBg),
      bottom: getBox(bottomBg)
    };
  });
  console.log('Overlay Elements before opening:', JSON.stringify(overlayInfo, null, 2));

  // Open menu
  console.log('Clicking academic menu trigger...');
  await page.click('#academicMenuTrigger');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'scratch/desktop_menu_open.png' });
  console.log('Screenshot saved: scratch/desktop_menu_open.png');

  // Now test clicking Test Paper
  console.log('Clicking #testPaperBtn...');
  await page.click('#testPaperBtn');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'scratch/desktop_after_testpaper_click.png' });

  const modalVisible = await page.evaluate(() => {
    const modal = document.getElementById('testPaperModal');
    return modal ? !modal.classList.contains('hidden') : false;
  });
  console.log('Is testPaperModal visible?', modalVisible);

  await browser.close();
})();

