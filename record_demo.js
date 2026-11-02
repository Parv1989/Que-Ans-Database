const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function setupPageOverlay(page) {
  await page.addStyleTag({
    content: `
      #demo-cursor {
        position: fixed;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: rgba(99, 102, 241, 0.75);
        border: 2.5px solid #ffffff;
        box-shadow: 0 0 16px rgba(99, 102, 241, 0.95), 0 0 35px rgba(99, 102, 241, 0.45);
        pointer-events: none !important;
        z-index: 9999999;
        transform: translate(-50%, -50%);
        transition: transform 0.08s ease, background 0.15s ease;
      }
      #demo-cursor.clicking {
        transform: translate(-50%, -50%) scale(0.65);
        background: rgba(239, 68, 68, 0.95);
        box-shadow: 0 0 25px rgba(239, 68, 68, 1);
      }
      .click-ripple {
        position: fixed;
        border-radius: 50%;
        border: 2.5px solid rgba(99, 102, 241, 0.9);
        background: rgba(99, 102, 241, 0.25);
        pointer-events: none !important;
        z-index: 9999998;
        transform: translate(-50%, -50%);
        animation: rippleAnim 0.55s ease-out forwards;
      }
      @keyframes rippleAnim {
        0% { width: 8px; height: 8px; opacity: 1; }
        100% { width: 70px; height: 70px; opacity: 0; }
      }
      #demo-banner, #demo-banner * {
        pointer-events: none !important;
      }
      #demo-banner {
        position: fixed;
        bottom: 24px;
        right: 28px;
        background: rgba(15, 23, 42, 0.94);
        color: #ffffff;
        backdrop-filter: blur(14px);
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 14px;
        padding: 14px 24px;
        z-index: 999999;
        box-shadow: 0 14px 40px rgba(0,0,0,0.35);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        display: flex;
        align-items: center;
        gap: 14px;
        transition: all 0.3s ease;
        max-width: 580px;
        animation: bannerSlideIn 0.35s ease;
      }
      @keyframes bannerSlideIn {
        from { transform: translateY(20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      #demo-banner .badge {
        background: linear-gradient(135deg, #6366f1, #8b5cf6);
        color: #ffffff;
        font-weight: 800;
        font-size: 11.5px;
        padding: 5px 13px;
        border-radius: 20px;
        text-transform: uppercase;
        letter-spacing: 0.6px;
        white-space: nowrap;
        box-shadow: 0 2px 8px rgba(99, 102, 241, 0.4);
      }
      #demo-banner .text {
        font-size: 14.5px;
        font-weight: 600;
        color: #f8fafc;
        line-height: 1.35;
      }
    `
  });

  await page.evaluate(() => {
    let cur = document.getElementById('demo-cursor');
    if (!cur) {
      cur = document.createElement('div');
      cur.id = 'demo-cursor';
      cur.style.left = '960px';
      cur.style.top = '540px';
      document.body.appendChild(cur);
    }

    let banner = document.getElementById('demo-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'demo-banner';
      banner.innerHTML = `<span class="badge">Publisher Bot</span><span class="text">Platform Demonstration</span>`;
      document.body.appendChild(banner);
    }
  });
}

async function updateBanner(page, badge, text) {
  await page.evaluate(({ badge, text }) => {
    const banner = document.getElementById('demo-banner');
    if (banner) {
      banner.innerHTML = `<span class="badge">${badge}</span><span class="text">${text}</span>`;
    }
  }, { badge, text });
}

async function moveMouseSmooth(page, targetX, targetY, steps = 15) {
  const currentPos = await page.evaluate(() => {
    const cur = document.getElementById('demo-cursor');
    return {
      x: cur ? parseFloat(cur.style.left) : 960,
      y: cur ? parseFloat(cur.style.top) : 540
    };
  });

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    const curX = currentPos.x + (targetX - currentPos.x) * ease;
    const curY = currentPos.y + (targetY - currentPos.y) * ease;

    await page.evaluate(({ x, y }) => {
      const cur = document.getElementById('demo-cursor');
      if (cur) {
        cur.style.left = `${x}px`;
        cur.style.top = `${y}px`;
      }
    }, { x: curX, y: curY });
    await sleep(14);
  }
}

async function clickVisual(page, selectorOrPoint) {
  let x = 960, y = 540;
  if (typeof selectorOrPoint === 'string') {
    const loc = page.locator(selectorOrPoint).first();
    try {
      const box = await loc.boundingBox({ timeout: 2500 });
      if (box) {
        x = box.x + box.width / 2;
        y = box.y + box.height / 2;
      }
    } catch (e) {}
  } else {
    x = selectorOrPoint.x;
    y = selectorOrPoint.y;
  }

  await moveMouseSmooth(page, x, y);
  await sleep(80);

  await page.evaluate(({ x, y }) => {
    const cur = document.getElementById('demo-cursor');
    if (cur) cur.classList.add('clicking');

    const ripple = document.createElement('div');
    ripple.className = 'click-ripple';
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    document.body.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  }, { x, y });

  if (typeof selectorOrPoint === 'string') {
    try {
      await page.locator(selectorOrPoint).first().click({ force: true, timeout: 3000 });
    } catch (e) {
      await page.mouse.click(x, y);
    }
  } else {
    await page.mouse.click(x, y);
  }

  await sleep(100);
  await page.evaluate(() => {
    const cur = document.getElementById('demo-cursor');
    if (cur) cur.classList.remove('clicking');
  });
  await sleep(120);
}

async function typeHuman(page, selector, text, delay = 40) {
  const loc = page.locator(selector).first();
  try {
    const box = await loc.boundingBox({ timeout: 2500 });
    if (box) {
      await moveMouseSmooth(page, box.x + 25, box.y + box.height / 2);
    }
    await loc.click({ force: true, timeout: 2500 }).catch(() => {});
  } catch (e) {}

  await loc.fill('');
  for (const char of text) {
    await loc.pressSequentially(char, { delay: Math.floor(delay * (0.8 + Math.random() * 0.4)) });
  }
}

async function runDemo() {
  console.log('🚀 Starting Full Demo Video Recording...');
  const outputDir = path.join(__dirname, 'recordings');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ['--window-size=1920,1080', '--no-sandbox', '--disable-dev-shm-usage']
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: {
      dir: outputDir,
      size: { width: 1920, height: 1080 }
    }
  });

  const page = await context.newPage();

  try {
    // ==========================================
    // SCENE 1: ADMIN LOGIN SCREEN
    // ==========================================
    console.log('🎬 Scene 1: Admin Login Screen');
    await page.goto('http://localhost:5000/admin/index.html', { waitUntil: 'networkidle' });
    await setupPageOverlay(page);
    await updateBanner(page, 'Authentication', 'Publisher Bot — Secure Admin Dashboard Portal');
    await moveMouseSmooth(page, 960, 480);
    await sleep(1400);

    // Enter username & password
    await updateBanner(page, 'Credentials', 'Signing in with Publisher Admin credentials');
    await typeHuman(page, '#loginUsername', 'admin', 60);
    await sleep(350);
    await typeHuman(page, '#loginPassword', 'change_this_password', 50);
    await sleep(500);

    // Click Sign in
    await clickVisual(page, '#loginForm button[type="submit"]');
    await sleep(1600);

    // Re-setup overlay
    await setupPageOverlay(page);

    // ==========================================
    // SCENE 2: Q&A MANAGEMENT & FILTERING
    // ==========================================
    console.log('🎬 Scene 2: Q&A Knowledge Base');
    await updateBanner(page, 'Knowledge Base', 'Hierarchical Q&A Management: Classes, Books & Chapters');
    await sleep(1400);

    // Stat pills highlight
    await moveMouseSmooth(page, 320, 155);
    await sleep(800);
    await moveMouseSmooth(page, 520, 155);
    await sleep(800);

    // 1-Click Book Chip
    await updateBanner(page, 'Quick Filter', 'One-click filter by book (e.g. Ripples / Science)');
    const chips = page.locator('#bookQuickChips .book-chip');
    if (await chips.count() > 0) {
      await clickVisual(page, '#bookQuickChips .book-chip');
      await sleep(1200);
    }

    // Live search
    await updateBanner(page, 'Instant Fuzzy Search', 'Real-time NLP search across questions, answers & keywords');
    await typeHuman(page, '#qaSearch', 'planet', 70);
    await sleep(1500);
    await typeHuman(page, '#qaSearch', 'rainbow', 70);
    await sleep(1500);
    await page.locator('#qaSearch').fill('');
    await sleep(800);

    // Toggle View modes
    await updateBanner(page, 'View Modes', 'Toggle between Book Hierarchy View and Flat List View');
    await clickVisual(page, '#viewFlatBtn');
    await sleep(1200);
    await clickVisual(page, '#viewGroupedBtn');
    await sleep(1200);

    // Add Question Modal
    await updateBanner(page, 'Authoring Tool', 'Create questions with LaTeX formula & diagram attachment');
    await clickVisual(page, '#newQABtn');
    await sleep(1000);

    await typeHuman(page, '#qaQuestion', 'What is the speed of light in vacuum?', 40);
    await sleep(300);
    await typeHuman(page, '#qaAnswer', 'Speed of light in vacuum is approx 3 × 10^8^ m/s.', 35);
    await sleep(500);
    await moveMouseSmooth(page, 960, 680);
    await sleep(1000);

    // Close modal
    await clickVisual(page, '#qaCancelBtn');
    await sleep(800);

    // ==========================================
    // SCENE 3: ANALYTICS & QUERY LOGS
    // ==========================================
    console.log('🎬 Scene 3: Analytics & Logs');
    await updateBanner(page, 'Analytics & Logs', 'Student queries, resolution rate & unanswered questions tracker');
    await clickVisual(page, 'button[data-tab="analytics"]');
    await sleep(1600);

    await moveMouseSmooth(page, 380, 210);
    await sleep(800);
    await moveMouseSmooth(page, 720, 210);
    await sleep(800);
    await moveMouseSmooth(page, 1060, 210);
    await sleep(1000);

    // Scroll query logs
    await page.mouse.wheel(0, 300);
    await sleep(1200);
    await page.mouse.wheel(0, -300);
    await sleep(800);

    // ==========================================
    // SCENE 4: SYNONYMS ENGINE
    // ==========================================
    console.log('🎬 Scene 4: Synonyms Engine');
    await updateBanner(page, 'Synonyms Engine', 'Enrich NLP matching dictionary for slang and variations');
    await clickVisual(page, 'button[data-tab="synonyms"]');
    await sleep(1600);
    await moveMouseSmooth(page, 600, 250);
    await sleep(1000);

    // ==========================================
    // SCENE 5: PEDAGOGY: LESSON PLANS & MIND MAPS
    // ==========================================
    console.log('🎬 Scene 5: Pedagogy & Mind Maps');
    await updateBanner(page, 'Pedagogy Suite', 'AI Chapter PDF Reader, CBSE/NEP Lesson Plans & Mind Maps');
    await clickVisual(page, 'button[data-tab="pedagogy"]');
    await sleep(1600);

    await moveMouseSmooth(page, 580, 360);
    await sleep(1200);

    await page.mouse.wheel(0, 400);
    await sleep(1400);
    await page.mouse.wheel(0, -400);
    await sleep(800);

    // ==========================================
    // SCENE 6: BOOK FEATURES & EMBED CODE
    // ==========================================
    console.log('🎬 Scene 6: Book Features & Embed Code');
    await updateBanner(page, 'Book Features', 'Per-textbook feature toggles (Voice, Quiz, Lesson Plan)');
    await clickVisual(page, 'button[data-tab="features"]');
    await sleep(1600);

    await updateBanner(page, 'Embed Snippet', 'Easy 1-line script embed for publisher websites & portals');
    await clickVisual(page, 'button[data-tab="embed"]');
    await sleep(1600);
    await clickVisual(page, '#copyEmbedBtn');
    await sleep(1000);

    // ==========================================
    // SCENE 7: ENTERPRISE PRESENTATION DECK
    // ==========================================
    console.log('🎬 Scene 7: Product Presentation Deck');
    await page.goto('http://localhost:5000/presentation.html', { waitUntil: 'networkidle' });
    await setupPageOverlay(page);
    await updateBanner(page, 'Product Deck', 'PublisherBot & Pedagogy Ecosystem — Keynote Presentation');
    await sleep(2200);

    // Slide 2
    await page.keyboard.press('ArrowRight');
    await updateBanner(page, 'Architecture', 'Fuzzy Match + NLP Synonym Clustering + Instant Retrieval');
    await sleep(2000);

    // Slide 3
    await page.keyboard.press('ArrowRight');
    await updateBanner(page, 'Pedagogy & NEP', 'Curriculum-Aligned Lesson Plans & Concept Mind Maps');
    await sleep(2000);

    // Slide 4
    await page.keyboard.press('ArrowRight');
    await updateBanner(page, 'Scalability', 'Built for Publishers: Multi-book, Offline Support & Mobile Ready');
    await sleep(2000);

    // ==========================================
    // SCENE 8: STUDENT CHATBOT WIDGET
    // ==========================================
    console.log('🎬 Scene 8: Student Chatbot Widget');
    await page.goto('http://localhost:5000/widget/chat.html', { waitUntil: 'networkidle' });
    await setupPageOverlay(page);
    await updateBanner(page, 'Study Buddy', 'Interactive Student Chatbot with Mascot Robot');
    await sleep(1600);

    // Select Class 3, Ripples, Chapter 2
    await updateBanner(page, 'Select Context', 'Pinpoint Class & Book for accurate curricular answers');
    if (await page.locator('#contextModal').isVisible()) {
      await page.selectOption('#selectClass', { label: 'Class 3' }).catch(() => {});
      await sleep(400);
      await page.selectOption('#selectBook', { label: 'Ripples' }).catch(() => {});
      await sleep(400);
      await page.selectOption('#selectChapter', { label: 'Chapter 2' }).catch(() => {});
      await sleep(400);
      await clickVisual(page, '#saveContextBtn');
      await sleep(1400);
    }

    // Question 1: Mars with diagram
    await updateBanner(page, 'Visual Learning', 'Instant answers with embedded diagram & image support');
    await typeHuman(page, '#chatInput', 'Which planet is called red planet ?', 45);
    await sleep(400);
    await clickVisual(page, '#chatForm button[type="submit"]');
    await sleep(2500);

    // Question 2: Rainbow
    await updateBanner(page, 'Curriculum Q&A', 'Natural language student query matching');
    await typeHuman(page, '#chatInput', 'How many colours are there in a rainbow ?', 45);
    await sleep(400);
    await clickVisual(page, '#chatForm button[type="submit"]');
    await sleep(2500);

    // Question 3: Hindi
    await updateBanner(page, 'Multilingual AI', 'Full Hindi & regional language question understanding');
    await typeHuman(page, '#chatInput', 'पेड़ हमें क्या देते हैं?', 55);
    await sleep(400);
    await clickVisual(page, '#chatForm button[type="submit"]');
    await sleep(2500);

    // Academic Tool: Worksheet Generator
    await updateBanner(page, 'Academic Tools', 'Printable Practice Worksheet Generator');
    await clickVisual(page, '#worksheetBtn');
    await sleep(1600);

    if (await page.locator('#worksheetSchoolInput').isVisible()) {
      await typeHuman(page, '#worksheetSchoolInput', 'Delhi Public School — Term Assessment', 35);
      await sleep(800);
    }
    if (await page.locator('#closeWorksheetConfigBtn').isVisible()) {
      await clickVisual(page, '#closeWorksheetConfigBtn');
      await sleep(800);
    }

    // Toggle Dark Mode
    await updateBanner(page, 'Theme Switcher', 'Smooth Dark Mode for night study & smartboards');
    await clickVisual(page, '#themeToggleBtn');
    await sleep(1400);
    await clickVisual(page, '#themeToggleBtn');
    await sleep(1200);

    // Concluding Banner
    await updateBanner(page, 'Enterprise Ecosystem', 'Publisher Bot: Next-Gen EdTech & Publisher Support System');
    await moveMouseSmooth(page, 960, 540);
    await sleep(2500);

    console.log('🎉 Recording complete!');
  } catch (err) {
    console.error('Error in demo recording:', err);
  } finally {
    const video = page.video();
    await context.close();
    await browser.close();

    if (video) {
      const videoPath = await video.path();
      console.log('🎥 Raw WebM Video saved at:', videoPath);

      const targetWebm = path.join(outputDir, 'PublisherBot_Full_Demo.webm');
      fs.copyFileSync(videoPath, targetWebm);
      console.log('🎬 Final Demo Video ready at:', targetWebm);
    }
  }
}

runDemo();
