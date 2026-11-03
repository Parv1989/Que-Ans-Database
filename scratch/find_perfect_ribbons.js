const { chromium } = require('playwright');
const fs = require('fs');

async function testConfig(name, css) {
  const browser = await chromium.launch({ headless: true });

  const viewports = [
    { label: 'mobile', width: 390, height: 844 },
    { label: 'desktop', width: 1920, height: 1080 }
  ];

  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.addInitScript(() => {
      localStorage.setItem('bot_selected_class', 'Class 2');
      localStorage.setItem('bot_selected_book', 'Science');
    });
    await page.goto('http://localhost:5000/widget/chat.html', { waitUntil: 'networkidle' });

    // Inject our test CSS
    await page.addStyleTag({ content: css });

    // Open menu
    await page.click('#academicMenuTrigger');
    await page.waitForTimeout(1100);

    const shotName = `scratch/ribbon_${name}_${vp.label}.png`;
    await page.screenshot({ path: shotName });
    console.log(`Saved ${shotName}`);
    await page.close();
  }

  await browser.close();
}

(async () => {
  // Config 1: CSS with solid background on overlay AND seamless overlapping ribbons
  const css1 = `
    .academic-menu-overlay {
      position: absolute !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      z-index: 220 !important;
      overflow: hidden !important;
      background: #ffffff !important;
      pointer-events: auto !important;
    }
    body.dark-mode .academic-menu-overlay {
      background: #161228 !important;
    }
    
    .academic-menu-overlay .menu-container {
      position: absolute !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      z-index: 230 !important;
    }

    .menu-content-card {
      width: 100% !important;
      max-width: 360px !important;
      padding: 1.5rem 1.8rem !important;
      box-sizing: border-box !important;
      opacity: 1 !important;
      visibility: visible !important;
      background: #ffffff !important;
      border-radius: 20px !important;
      box-shadow: 0 10px 35px rgba(99, 102, 241, 0.12) !important;
      border: 1px solid rgba(99, 102, 241, 0.1) !important;
    }
    body.dark-mode .menu-content-card {
      background: #1e1933 !important;
      border-color: rgba(167, 139, 250, 0.2) !important;
      box-shadow: 0 10px 35px rgba(0, 0, 0, 0.4) !important;
    }
  `;

  await testConfig('solid_clean', css1);
})();

