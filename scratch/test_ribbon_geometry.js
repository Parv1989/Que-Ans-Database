const { chromium } = require('playwright');
const fs = require('fs');

async function testWithCss(cssOverride, filenamePrefix) {
  const browser = await chromium.launch({ headless: true });

  const viewports = [
    { name: 'mobile_390x844', width: 390, height: 844 },
    { name: 'desktop_1920x1080', width: 1920, height: 1080 },
    { name: 'desktop_1366x768', width: 1366, height: 768 }
  ];

  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.addInitScript(() => {
      localStorage.setItem('bot_selected_class', 'Class 2');
      localStorage.setItem('bot_selected_book', 'Science');
    });
    await page.goto('http://localhost:5000/widget/chat.html', { waitUntil: 'networkidle' });

    if (cssOverride) {
      await page.addStyleTag({ content: cssOverride });
    }

    // Open menu
    await page.click('#academicMenuTrigger');
    await page.waitForTimeout(1100);

    const shotPath = `scratch/${filenamePrefix}_${vp.name}.png`;
    await page.screenshot({ path: shotPath });
    console.log(`Saved screenshot: ${shotPath}`);

    // Check if any pixels in the menu container area have non-white background
    const cardRect = await page.evaluate(() => {
      const card = document.querySelector('.menu-content-card');
      const r = card.getBoundingClientRect();
      return { top: r.top, left: r.left, width: r.width, height: r.height };
    });
    console.log(`${vp.name} card rect:`, cardRect);

    await page.close();
  }

  await browser.close();
}

(async () => {
  // Let's test generous overlapping ribbon geometry
  const testCss = `
    .academic-menu-overlay {
      background: transparent !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
    }

    /* Generous sizing and positioning so all 3 ribbons overlap heavily */
    .menu-bg {
      position: absolute !important;
      display: block !important;
      width: 400% !important;
      left: -150% !important;
      height: 65% !important;
      background-color: #ffffff !important;
      box-shadow: none !important;
      pointer-events: none !important;
    }

    .menu-bg.middle {
      top: 20% !important;
      left: -150% !important;
      transform: rotate(-45deg) scaleY(0) !important;
    }

    .menu-bg.top {
      left: -130% !important;
      top: -15% !important;
      transform: rotate(-45deg) translateY(-160%) !important;
    }

    .menu-bg.bottom {
      top: 80% !important;
      left: -110% !important;
      transform: rotate(-45deg) translateY(60%) !important;
    }

    @media (min-width: 900px) {
      .menu-bg {
        width: 500% !important;
        left: -200% !important;
        height: 75% !important;
      }
      .menu-bg.middle {
        top: 15% !important;
        left: -200% !important;
      }
      .menu-bg.top {
        left: -170% !important;
        top: -20% !important;
      }
      .menu-bg.bottom {
        top: 70% !important;
        left: -150% !important;
      }
    }
  `;

  console.log('Testing new geometry...');
  await testWithCss(testCss, 'geom_test');
})();

