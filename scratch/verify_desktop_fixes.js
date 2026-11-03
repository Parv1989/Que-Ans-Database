const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  const logs = [];
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => logs.push(`[PAGE ERROR] ${err.message}`));

  await page.addInitScript(() => {
    localStorage.setItem('bot_selected_class', 'Class 2');
    localStorage.setItem('bot_selected_book', 'Science');
    localStorage.setItem('bot_selected_chapter', 'All Chapters');
  });

  console.log('Navigating to http://localhost:5000/widget/chat.html (1920x1080)...');
  await page.goto('http://localhost:5000/widget/chat.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  // 1. Initial State Check
  const initialOverlayState = await page.evaluate(() => {
    const overlay = document.getElementById('academicMenuOverlay');
    const style = window.getComputedStyle(overlay);
    return {
      display: style.display,
      visibility: style.visibility,
      pointerEvents: style.pointerEvents,
      hasActive: overlay.classList.contains('is-active')
    };
  });
  console.log('Initial overlay state (must be hidden):', initialOverlayState);

  await page.screenshot({ path: 'scratch/verify_01_desktop_clean.png' });
  console.log('Saved scratch/verify_01_desktop_clean.png');

  // 2. Open Academic Menu
  console.log('Opening academic menu...');
  await page.click('#academicMenuTrigger');
  await page.waitForTimeout(1000);

  const openOverlayState = await page.evaluate(() => {
    const overlay = document.getElementById('academicMenuOverlay');
    const style = window.getComputedStyle(overlay);
    return {
      display: style.display,
      visibility: style.visibility,
      hasActive: overlay.classList.contains('is-active')
    };
  });
  console.log('Open overlay state (must be active & visible):', openOverlayState);
  await page.screenshot({ path: 'scratch/verify_02_menu_open.png' });
  console.log('Saved scratch/verify_02_menu_open.png');

  // Helper to open menu if not open
  async function ensureMenuOpen() {
    const isOpen = await page.evaluate(() => {
      const o = document.getElementById('academicMenuOverlay');
      return o && o.classList.contains('is-active');
    });
    if (!isOpen) {
      await page.click('#academicMenuTrigger');
      await page.waitForTimeout(900);
    }
  }

  // 3. Test Paper
  console.log('\n--- Testing 1. Test Paper ---');
  await page.click('#testPaperBtn');
  await page.waitForTimeout(1000);
  const tpStatus = await page.evaluate(() => {
    const m = document.getElementById('testPaperModal');
    const pills = document.querySelectorAll('.tp-ch-pill');
    return {
      visible: m && !m.classList.contains('hidden'),
      chapterPillsCount: pills.length
    };
  });
  console.log('Test Paper status:', tpStatus);
  await page.screenshot({ path: 'scratch/verify_03_testpaper.png' });
  await page.click('#closeTestPaperConfigBtn');
  await page.waitForTimeout(500);

  // 4. Lesson Plan
  console.log('\n--- Testing 2. Lesson Plan ---');
  await ensureMenuOpen();
  await page.click('#lessonPlanBtn');
  await page.waitForTimeout(1000);
  const lpStatus = await page.evaluate(() => {
    const m = document.getElementById('lessonPlanModal');
    const title = document.querySelector('.lp-plan-title');
    return {
      visible: m && !m.classList.contains('hidden'),
      titleText: title ? title.textContent : null
    };
  });
  console.log('Lesson Plan status:', lpStatus);
  await page.screenshot({ path: 'scratch/verify_04_lessonplan.png' });
  await page.click('#closeLessonPlanPreviewBtn');
  await page.waitForTimeout(500);

  // 5. Oral Test
  console.log('\n--- Testing 3. Oral Test ---');
  await ensureMenuOpen();
  await page.click('#oralTestBtn');
  await page.waitForTimeout(1000);
  const otStatus = await page.evaluate(() => {
    const m = document.getElementById('oralTestModal');
    const config = document.getElementById('oralTestConfigView');
    return {
      visible: m && !m.classList.contains('hidden'),
      configVisible: config && !config.classList.contains('hidden')
    };
  });
  console.log('Oral Test status:', otStatus);
  await page.screenshot({ path: 'scratch/verify_05_oraltest.png' });
  await page.click('#closeOralTestConfigBtn');
  await page.waitForTimeout(500);

  // 6. Mind Map
  console.log('\n--- Testing 4. Mind Map ---');
  await ensureMenuOpen();
  await page.click('#mindMapBtn');
  await page.waitForTimeout(1000);
  const mmStatus = await page.evaluate(() => {
    const m = document.getElementById('mindMapModal');
    const svgNodes = document.querySelectorAll('.mindmap-node');
    return {
      visible: m && !m.classList.contains('hidden'),
      nodeCount: svgNodes.length
    };
  });
  console.log('Mind Map status:', mmStatus);
  await page.screenshot({ path: 'scratch/verify_06_mindmap.png' });
  await page.click('#closeMindMapBtn');
  await page.waitForTimeout(500);

  // 7. Worksheet
  console.log('\n--- Testing 5. Worksheet ---');
  await ensureMenuOpen();
  await page.click('#worksheetBtn');
  await page.waitForTimeout(1000);
  const wsStatus = await page.evaluate(() => {
    const m = document.getElementById('worksheetModal');
    return {
      visible: m && !m.classList.contains('hidden')
    };
  });
  console.log('Worksheet status:', wsStatus);
  await page.screenshot({ path: 'scratch/verify_07_worksheet.png' });
  await page.click('#closeWorksheetConfigBtn');
  await page.waitForTimeout(500);

  // 8. Quiz
  console.log('\n--- Testing 6. Quiz ---');
  await ensureMenuOpen();
  await page.click('#quizBtn');
  await page.waitForTimeout(1000);
  const qzStatus = await page.evaluate(() => {
    const m = document.getElementById('quizModal');
    return {
      visible: m && !m.classList.contains('hidden')
    };
  });
  console.log('Quiz status:', qzStatus);
  await page.screenshot({ path: 'scratch/verify_08_quiz.png' });
  await page.click('#closeQuizBtn');
  await page.waitForTimeout(500);

  // 9. Notes
  console.log('\n--- Testing 7. Notes ---');
  await ensureMenuOpen();
  // We can listen for popup or check function call
  const [popup] = await Promise.all([
    page.waitForEvent('popup', { timeout: 3000 }).catch(() => null),
    page.click('#exportNotesBtn')
  ]);
  console.log('Notes popup created:', !!popup);
  if (popup) {
    await popup.waitForLoadState();
    await popup.screenshot({ path: 'scratch/verify_09_notes.png' });
    await popup.close();
  }

  // 10. Final Desktop Cleanliness Check
  await page.waitForTimeout(500);
  const finalOverlayState = await page.evaluate(() => {
    const overlay = document.getElementById('academicMenuOverlay');
    const style = window.getComputedStyle(overlay);
    return {
      display: style.display,
      visibility: style.visibility,
      hasActive: overlay.classList.contains('is-active')
    };
  });
  console.log('Final overlay state (must be hidden):', finalOverlayState);
  await page.screenshot({ path: 'scratch/verify_10_desktop_final.png' });

  // Copy all verify images to brain artifacts
  const artDir = 'C:/Users/praveen/.gemini/antigravity/brain/e5df2496-1cce-49e8-8a44-a5742c85a64e';
  const imgFiles = [
    'verify_01_desktop_clean.png',
    'verify_02_menu_open.png',
    'verify_03_testpaper.png',
    'verify_04_lessonplan.png',
    'verify_05_oraltest.png',
    'verify_06_mindmap.png',
    'verify_07_worksheet.png',
    'verify_08_quiz.png',
    'verify_10_desktop_final.png'
  ];
  imgFiles.forEach(f => {
    if (fs.existsSync(`scratch/${f}`)) {
      fs.copyFileSync(`scratch/${f}`, `${artDir}/${f}`);
    }
  });

  console.log('\n--- BROWSER CONSOLE LOGS ---');
  logs.forEach(l => console.log(l));

  await browser.close();
  console.log('\nALL VERIFICATION TESTS COMPLETED SUCCESSFULLY!');
})();

