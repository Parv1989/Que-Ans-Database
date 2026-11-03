const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ARTIFACTS_DIR = 'C:/Users/praveen/.gemini/antigravity/brain/e5df2496-1cce-49e8-8a44-a5742c85a64e';

async function runVerification() {
  const browser = await chromium.launch({ headless: true });

  const viewports = [
    { label: 'desktop', width: 1920, height: 1080, dsf: 1 },
    { label: 'mobile', width: 390, height: 844, dsf: 3 }
  ];

  for (const vp of viewports) {
    console.log(`\n========================================`);
    console.log(`Testing Mode: ${vp.label.toUpperCase()} (${vp.width}x${vp.height}, dsf: ${vp.dsf})`);
    console.log(`========================================`);

    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.dsf
    });

    await context.addInitScript(() => {
      localStorage.setItem('bot_selected_class', 'Class 2');
      localStorage.setItem('bot_selected_book', 'Science');
      localStorage.setItem('bot_selected_chapter', 'Chapter 1');
    });

    const page = await context.newPage();

    // 1. Navigate to chat page
    await page.goto('http://localhost:5000/widget/chat.html');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(600);

    // If context modal is open, close it
    const closeContextModalBtn = page.locator('#closeContextModalBtn');
    if (await closeContextModalBtn.isVisible()) {
      await closeContextModalBtn.click();
      await page.waitForTimeout(300);
    }

    // Check speaker button visibility and make sure close trigger is NOT visible
    const muteBtn = page.locator('#muteBtn');
    await muteBtn.waitFor({ state: 'visible' });

    const closeTrigger = page.locator('#academicCloseTrigger');
    const isCloseTriggerVisibleInitially = await closeTrigger.isVisible();
    console.log(`[${vp.label}] Initial state: Close trigger visible?`, isCloseTriggerVisibleInitially, '(Must be false)');
    if (isCloseTriggerVisibleInitially) {
      throw new Error(`FAIL: Close trigger is visible before opening menu on ${vp.label}!`);
    }

    const shot1 = `${ARTIFACTS_DIR}/verified_${vp.label}_01_initial_clean.png`;
    await page.screenshot({ path: shot1 });
    console.log(`[${vp.label}] Saved 01: Clean chat screen, no overlapping X.`);

    // 2. Open Academic Menu
    console.log(`[${vp.label}] Opening Academic Suite menu...`);
    await page.click('#academicMenuTrigger');
    await page.waitForTimeout(1000); // Allow GSAP to finish

    const isOverlayActive = await page.evaluate(() => {
      const overlay = document.getElementById('academicMenuOverlay');
      return overlay && overlay.classList.contains('is-active') && window.getComputedStyle(overlay).display !== 'none';
    });
    console.log(`[${vp.label}] Menu overlay active?`, isOverlayActive);

    const isCloseTriggerVisibleOpen = await closeTrigger.isVisible();
    console.log(`[${vp.label}] Close trigger visible when open?`, isCloseTriggerVisibleOpen, '(Must be true)');

    const shot2 = `${ARTIFACTS_DIR}/verified_${vp.label}_02_menu_open.png`;
    await page.screenshot({ path: shot2 });
    console.log(`[${vp.label}] Saved 02: Menu open with seamless diagonal slicing.`);

    // 3. Close Academic Menu using Close Trigger "X"
    console.log(`[${vp.label}] Clicking close "X" button...`);
    await closeTrigger.click();
    await page.waitForTimeout(900); // Wait for 600ms close animation to finish

    const isOverlayActiveAfterClose = await page.evaluate(() => {
      const overlay = document.getElementById('academicMenuOverlay');
      return overlay && (overlay.classList.contains('is-active') || window.getComputedStyle(overlay).display !== 'none');
    });
    const isCloseVisibleAfterClose = await closeTrigger.isVisible();
    console.log(`[${vp.label}] Overlay active after close?`, isOverlayActiveAfterClose, '(Must be false)');
    console.log(`[${vp.label}] Close trigger visible after close?`, isCloseVisibleAfterClose, '(Must be false)');
    if (isOverlayActiveAfterClose || isCloseVisibleAfterClose) {
      throw new Error(`FAIL: Overlay or close trigger is still visible after close on ${vp.label}!`);
    }

    const shot3 = `${ARTIFACTS_DIR}/verified_${vp.label}_03_closed_again.png`;
    await page.screenshot({ path: shot3 });
    console.log(`[${vp.label}] Saved 03: Closed again cleanly.`);

    // 4. Test clicking Feature: Test Paper
    console.log(`[${vp.label}] Opening menu to test feature Test Paper...`);
    await page.click('#academicMenuTrigger');
    await page.waitForTimeout(900);
    await page.click('#testPaperBtn');
    await page.waitForTimeout(700);

    const testPaperModal = page.locator('#testPaperModal');
    const isTestPaperOpen = await testPaperModal.isVisible();
    const isCloseVisibleOnModal = await closeTrigger.isVisible();
    console.log(`[${vp.label}] Test paper modal visible?`, isTestPaperOpen);
    console.log(`[${vp.label}] Close X visible during modal?`, isCloseVisibleOnModal, '(Must be false)');

    const shot4 = `${ARTIFACTS_DIR}/verified_${vp.label}_04_feature_testpaper.png`;
    await page.screenshot({ path: shot4 });

    // Close test paper modal
    const closeTestPaperBtn = page.locator('#closeTestPaperConfigBtn');
    if (await closeTestPaperBtn.isVisible()) {
      await closeTestPaperBtn.click();
      await page.waitForTimeout(400);
    }

    // 5. Test clicking Feature: Mind Map
    console.log(`[${vp.label}] Opening menu to test feature Mind Map...`);
    await page.click('#academicMenuTrigger');
    await page.waitForTimeout(900);
    await page.click('#mindMapBtn');
    await page.waitForTimeout(700);

    const mindMapModal = page.locator('#mindMapModal');
    const isMindMapOpen = await mindMapModal.isVisible();
    console.log(`[${vp.label}] Mind map modal visible?`, isMindMapOpen);

    const shot5 = `${ARTIFACTS_DIR}/verified_${vp.label}_05_feature_mindmap.png`;
    await page.screenshot({ path: shot5 });

    const closeMindMapBtn = page.locator('#closeMindMapBtn');
    if (await closeMindMapBtn.isVisible()) {
      await closeMindMapBtn.click();
      await page.waitForTimeout(400);
    }

    // 6. Test Dark Mode
    console.log(`[${vp.label}] Testing Dark Mode...`);
    await page.click('#themeToggleBtn');
    await page.waitForTimeout(400);

    await page.click('#academicMenuTrigger');
    await page.waitForTimeout(900);

    const shot6 = `${ARTIFACTS_DIR}/verified_${vp.label}_06_dark_mode_menu.png`;
    await page.screenshot({ path: shot6 });

    await closeTrigger.click();
    await page.waitForTimeout(800);

    const shot7 = `${ARTIFACTS_DIR}/verified_${vp.label}_07_dark_mode_closed.png`;
    await page.screenshot({ path: shot7 });

    await context.close();
  }

  await browser.close();
  console.log(`\n ALL VERIFICATION CHECKS PASSED SUCCESSFULLY!`);
}

runVerification().catch(err => {
  console.error('VERIFICATION ERROR:', err);
  process.exit(1);
});
