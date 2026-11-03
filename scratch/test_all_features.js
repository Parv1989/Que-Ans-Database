const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 }
  });
  const page = await context.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  console.log('Navigating to http://localhost:5000/widget/chat.html...');
  await page.goto('http://localhost:5000/widget/chat.html', { waitUntil: 'networkidle' });

  // Dismiss context modal if open
  const contextModal = await page.$('#contextModal');
  if (contextModal) {
    const isVisible = await page.evaluate(el => !el.classList.contains('hidden') && window.getComputedStyle(el).display !== 'none', contextModal);
    if (isVisible) {
      console.log('Dismissing contextModal by clicking saveContextBtn...');
      await page.click('#saveContextBtn');
      await page.waitForTimeout(500);
    }
  }

  await page.screenshot({ path: 'scratch/desktop_clean_chat.png' });
  console.log('Screenshot saved: scratch/desktop_clean_chat.png');

  // Open academic menu
  console.log('Clicking #academicMenuTrigger...');
  await page.click('#academicMenuTrigger');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'scratch/desktop_menu_open.png' });

  // Now test each tool button:
  const tools = [
    { id: '#testPaperBtn', modalId: 'testPaperModal', name: 'Test Paper' },
    { id: '#lessonPlanBtn', modalId: 'lessonPlanModal', name: 'Lesson Plan' },
    { id: '#oralTestBtn', modalId: 'oralTestModal', name: 'Oral Test' },
    { id: '#mindMapBtn', modalId: 'mindMapModal', name: 'Mind Map' },
    { id: '#worksheetBtn', modalId: 'worksheetModal', name: 'Worksheet' },
    { id: '#quizBtn', modalId: 'quizModal', name: 'Quiz' },
    { id: '#exportNotesBtn', modalId: null, name: 'Notes' }
  ];

  for (const tool of tools) {
    console.log(`\n=== Testing ${tool.name} ===`);
    // Ensure menu is open
    const isMenuOpen = await page.evaluate(() => {
      const overlay = document.getElementById('academicMenuOverlay');
      return overlay.classList.contains('is-active');
    });
    if (!isMenuOpen) {
      console.log('Re-opening academic menu...');
      await page.click('#academicMenuTrigger');
      await page.waitForTimeout(800);
    }

    console.log(`Clicking ${tool.id}...`);
    try {
      await page.click(tool.id, { timeout: 4000 });
      await page.waitForTimeout(1200);

      if (tool.modalId) {
        const isVisible = await page.evaluate((mId) => {
          const el = document.getElementById(mId);
          if (!el) return false;
          return !el.classList.contains('hidden') && window.getComputedStyle(el).display !== 'none';
        }, tool.modalId);
        console.log(`Result: ${tool.name} (${tool.modalId}) visible: ${isVisible}`);
        await page.screenshot({ path: `scratch/feature_${tool.modalId}.png` });

        // Close modal using close button or escape
        await page.evaluate((mId) => {
          const el = document.getElementById(mId);
          if (el) el.classList.add('hidden');
        }, tool.modalId);
        await page.waitForTimeout(500);
      } else {
        console.log(`Result: ${tool.name} clicked successfully`);
      }
    } catch (err) {
      console.error(`FAILED to click ${tool.name}:`, err.message);
    }
  }

  await browser.close();
  console.log('Finished testing all features.');
})();
