const { chromium } = require('playwright');
const fs = require('fs');

const artDir = 'C:/Users/praveen/.gemini/antigravity/brain/e5df2496-1cce-49e8-8a44-a5742c85a64e';

function saveArt(srcPath, artName) {
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, `${artDir}/${artName}`);
    console.log(`Copied artifact: ${artName}`);
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  // 1. MOBILE MODE (390x844) - iPhone 14
  console.log('\n========================================');
  console.log('Testing Mobile Mode (390x844)...');
  console.log('========================================');
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.addInitScript(() => {
      localStorage.setItem('bot_selected_class', 'Class 2');
      localStorage.setItem('bot_selected_book', 'Science');
    });
    await page.goto('http://localhost:5000/widget/chat.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    // Initial closed state
    await page.screenshot({ path: 'scratch/mobile_01_closed.png' });
    saveArt('scratch/mobile_01_closed.png', 'mobile_01_closed.png');

    // Open Menu
    await page.click('#academicMenuTrigger');
    await page.waitForTimeout(1100);
    await page.screenshot({ path: 'scratch/mobile_02_menu_open.png' });
    saveArt('scratch/mobile_02_menu_open.png', 'mobile_02_menu_open.png');

    // Click Test Paper
    console.log('Mobile: Clicking Test Paper...');
    await page.click('#testPaperBtn');
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'scratch/mobile_03_testpaper.png' });
    saveArt('scratch/mobile_03_testpaper.png', 'mobile_03_testpaper.png');
    await page.click('#closeTestPaperConfigBtn');
    await page.waitForTimeout(400);

    // Re-open and Click Lesson Plan
    console.log('Mobile: Clicking Lesson Plan...');
    await page.click('#academicMenuTrigger');
    await page.waitForTimeout(1000);
    await page.click('#lessonPlanBtn');
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'scratch/mobile_04_lessonplan.png' });
    saveArt('scratch/mobile_04_lessonplan.png', 'mobile_04_lessonplan.png');
    await page.click('#closeLessonPlanPreviewBtn');
    await page.waitForTimeout(400);

    // Re-open and Click Mind Map
    console.log('Mobile: Clicking Mind Map...');
    await page.click('#academicMenuTrigger');
    await page.waitForTimeout(1000);
    await page.click('#mindMapBtn');
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'scratch/mobile_05_mindmap.png' });
    saveArt('scratch/mobile_05_mindmap.png', 'mobile_05_mindmap.png');
    await page.click('#closeMindMapBtn');
    await page.waitForTimeout(400);

    // Final clean check on mobile
    await page.screenshot({ path: 'scratch/mobile_06_final.png' });
    saveArt('scratch/mobile_06_final.png', 'mobile_06_final.png');

    await page.close();
  }

  // 2. DESKTOP MODE (1920x1080)
  console.log('\n========================================');
  console.log('Testing Desktop Mode (1920x1080)...');
  console.log('========================================');
  {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.addInitScript(() => {
      localStorage.setItem('bot_selected_class', 'Class 2');
      localStorage.setItem('bot_selected_book', 'Science');
    });
    await page.goto('http://localhost:5000/widget/chat.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    // Initial closed state
    await page.screenshot({ path: 'scratch/desktop_01_closed.png' });
    saveArt('scratch/desktop_01_closed.png', 'desktop_01_closed.png');

    // Open Menu
    await page.click('#academicMenuTrigger');
    await page.waitForTimeout(1100);
    await page.screenshot({ path: 'scratch/desktop_02_menu_open.png' });
    saveArt('scratch/desktop_02_menu_open.png', 'desktop_02_menu_open.png');

    // Click Quiz
    console.log('Desktop: Clicking Quiz...');
    await page.click('#quizBtn');
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'scratch/desktop_03_quiz.png' });
    saveArt('scratch/desktop_03_quiz.png', 'desktop_03_quiz.png');
    await page.click('#closeQuizBtn');
    await page.waitForTimeout(400);

    // Re-open and Click Worksheet
    console.log('Desktop: Clicking Worksheet...');
    await page.click('#academicMenuTrigger');
    await page.waitForTimeout(1000);
    await page.click('#worksheetBtn');
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'scratch/desktop_04_worksheet.png' });
    saveArt('scratch/desktop_04_worksheet.png', 'desktop_04_worksheet.png');
    await page.click('#closeWorksheetConfigBtn');
    await page.waitForTimeout(400);

    // Re-open and Click Oral Test
    console.log('Desktop: Clicking Oral Test...');
    await page.click('#academicMenuTrigger');
    await page.waitForTimeout(1000);
    await page.click('#oralTestBtn');
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'scratch/desktop_05_oraltest.png' });
    saveArt('scratch/desktop_05_oraltest.png', 'desktop_05_oraltest.png');
    await page.click('#closeOralTestConfigBtn');
    await page.waitForTimeout(400);

    // Final clean check on desktop
    await page.screenshot({ path: 'scratch/desktop_06_final.png' });
    saveArt('scratch/desktop_06_final.png', 'desktop_06_final.png');

    await page.close();
  }

  // 3. DARK MODE (Mobile & Desktop)
  console.log('\n========================================');
  console.log('Testing Dark Mode...');
  console.log('========================================');
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.addInitScript(() => {
      localStorage.setItem('bot_selected_class', 'Class 2');
      localStorage.setItem('bot_selected_book', 'Science');
      localStorage.setItem('studybuddy_theme', 'dark');
    });
    await page.goto('http://localhost:5000/widget/chat.html', { waitUntil: 'networkidle' });
    await page.click('#academicMenuTrigger');
    await page.waitForTimeout(1100);
    await page.screenshot({ path: 'scratch/dark_01_mobile.png' });
    saveArt('scratch/dark_01_mobile.png', 'dark_01_mobile.png');
    await page.close();
  }
  {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.addInitScript(() => {
      localStorage.setItem('bot_selected_class', 'Class 2');
      localStorage.setItem('bot_selected_book', 'Science');
      localStorage.setItem('studybuddy_theme', 'dark');
    });
    await page.goto('http://localhost:5000/widget/chat.html', { waitUntil: 'networkidle' });
    await page.click('#academicMenuTrigger');
    await page.waitForTimeout(1100);
    await page.screenshot({ path: 'scratch/dark_02_desktop.png' });
    saveArt('scratch/dark_02_desktop.png', 'dark_02_desktop.png');
    await page.close();
  }

  await browser.close();
  console.log('\nALL BOTH-MODE TESTS EXECUTED AND ARTIFACTS SAVED!');
})();

