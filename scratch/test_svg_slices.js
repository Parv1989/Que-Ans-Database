const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { margin: 0; padding: 0; background: #e0e7ff; overflow: hidden; font-family: sans-serif; }
    .viewport { position: relative; width: 100vw; height: 100vh; overflow: hidden; }
    
    /* Fullscreen SVG containing 3 slicing layers */
    .slicing-svg {
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
      pointer-events: none;
    }
    
    .slice {
      fill: #ffffff;
      transition: transform 0.8s cubic-bezier(0.16, 1, 0.3, 1);
    }
    
    .slice-top {
      /* Polygon from (0,0) to (120%, 0) to (0, 70%) */
    }
    .slice-middle {
      /* Polygon band */
    }
    .slice-bottom {
      /* Polygon from (100%, 100%) to (100%, 30%) to (0, 100%) */
    }
  </style>
</head>
<body>
  <div class="viewport">
    <h1>Background Chat App</h1>
    <svg class="slicing-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
      <!-- Top slice -->
      <polygon id="sliceTop" class="slice slice-top" points="0,0 80,0 0,60" fill="#ffffff" />
      <!-- Middle slice -->
      <polygon id="sliceMid" class="slice slice-middle" points="80,0 100,0 100,40 20,100 0,100 0,60" fill="#ffffff" />
      <!-- Bottom slice -->
      <polygon id="sliceBot" class="slice slice-bottom" points="100,40 100,100 20,100" fill="#ffffff" />
    </svg>
  </div>
</body>
</html>
  `;

  // Test mobile
  const p1 = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await p1.setContent(html);
  await p1.screenshot({ path: 'scratch/test_svg_mobile.png' });
  await p1.close();

  // Test desktop
  const p2 = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await p2.setContent(html);
  await p2.screenshot({ path: 'scratch/test_svg_desktop.png' });
  await p2.close();

  await browser.close();
  console.log('Saved test_svg_mobile.png and test_svg_desktop.png');
})();

