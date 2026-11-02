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
        background: rgba(15, 23, 42, 0.95);
        color: #ffffff;
        backdrop-filter: blur(14px);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 14px;
        padding: 14px 24px;
        z-index: 999999;
        box-shadow: 0 14px 40px rgba(0,0,0,0.4);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        display: flex;
        align-items: center;
        gap: 14px;
        transition: all 0.3s ease;
        max-width: 620px;
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
      banner.innerHTML = `<span class="badge">Study Buddy</span><span class="text">AI Chatbot & Academic Suite Demonstration</span>`;
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

async function moveMouseSmooth(page, targetX, targetY, steps = 14) {
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
  let loc = null;

  if (typeof selectorOrPoint === 'string') {
    loc = page.locator(selectorOrPoint).first();
  } else if (selectorOrPoint && typeof selectorOrPoint.boundingBox === 'function') {
    loc = selectorOrPoint;
  }

  if (loc) {
    try {
      const box = await loc.boundingBox({ timeout: 2500 });
      if (box && typeof box.x === 'number' && typeof box.y === 'number') {
        x = box.x + box.width / 2;
        y = box.y + box.height / 2;
      }
    } catch (e) {}
  } else if (selectorOrPoint && typeof selectorOrPoint.x === 'number' && typeof selectorOrPoint.y === 'number') {
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

  if (loc) {
    try {
      await loc.click({ force: true, timeout: 3000 });
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

async function runChatDeepdive() {
  console.log('🚀 Starting Full Deep-Dive Video Recording of Chat & Academic Suite...');
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

  // Stub window.print so print dialogs do not block automated tests
  await page.addInitScript(() => {
    window.print = () => { console.log('Mock window.print called'); };
  });

  try {
    // ========================================================
    // ACT 1: LAUNCH & CONTEXT SELECTION (Class 3, Ripples, Ch 1)
    // ========================================================
    console.log('🎬 Act 1: Launch Chat & Configure Context');
    await page.goto('http://localhost:5000/widget/chat.html', { waitUntil: 'networkidle' });
    await setupPageOverlay(page);
    await updateBanner(page, 'Study Buddy', 'Interactive AI Mascot & Comprehensive Academic Suite');
    await moveMouseSmooth(page, 960, 500);
    await sleep(1600);

    // Context selection
    await updateBanner(page, 'Context Selector', 'Select Class, Book & Chapter for curriculum precision');
    if (await page.locator('#contextModal').isVisible()) {
      await page.selectOption('#selectClass', { label: 'Class 3' }).catch(() => {});
      await sleep(400);
      await page.selectOption('#selectBook', { label: 'Ripples' }).catch(() => {});
      await sleep(400);
      await page.selectOption('#selectChapter', { label: 'Chapter 1' }).catch(() => {});
      await sleep(400);
      await clickVisual(page, '#saveContextBtn');
      await sleep(1400);
    }

    // Showcase Mascot & Toolbar
    await updateBanner(page, 'Academic Suite', 'Smart Tools: Test Paper, Lesson Plan, Viva, Mind Map, Worksheet, Quiz');
    await moveMouseSmooth(page, 960, 180); // Mascot stage
    await sleep(1200);
    await moveMouseSmooth(page, 400, 95);  // Academic chips
    await sleep(800);
    await moveMouseSmooth(page, 800, 95);
    await sleep(1000);

    // ========================================================
    // ACT 2: INTERACTIVE CURRICULAR CHAT & MULTILINGUAL Q&A
    // ========================================================
    console.log('🎬 Act 2: Interactive Chat Q&A');
    await updateBanner(page, 'Curriculum Q&A', 'Ask direct questions from the textbook');

    // Question 1: Chapter 1 question
    await typeHuman(page, '#chatInput', 'How can I buy this book?', 45);
    await sleep(400);
    await clickVisual(page, '#chatForm button[type="submit"]');
    await sleep(2600);

    // Switch to Chapter 2 for visual diagram questions
    await updateBanner(page, 'Chapter Switch', 'Seamlessly switch chapters on the fly via Change ⚙️');
    await clickVisual(page, '#changeContextBtn');
    await sleep(800);
    await page.selectOption('#selectChapter', { label: 'Chapter 2' }).catch(() => {});
    await sleep(400);
    await clickVisual(page, '#saveContextBtn');
    await sleep(1200);

    // Question 2: Planet with diagram
    await updateBanner(page, 'Visual Learning', 'Answers enhanced with official diagrams & images');
    await typeHuman(page, '#chatInput', 'Which planet is called red planet ?', 45);
    await sleep(400);
    await clickVisual(page, '#chatForm button[type="submit"]');
    await sleep(2800);

    // Lightbox image preview click
    const imgMsg = page.locator('.chat-messages img, .msg img').first();
    if (await imgMsg.count() > 0) {
      await updateBanner(page, 'Image Lightbox', 'Click to zoom and inspect high-resolution concept diagrams');
      await clickVisual(page, '.chat-messages img, .msg img');
      await sleep(1600);
      if (await page.locator('#closeLightboxBtn').isVisible()) {
        await clickVisual(page, '#closeLightboxBtn');
        await sleep(800);
      }
    }

    // Question 3: Colours in a rainbow
    await updateBanner(page, 'NLP Matching', 'Instant recall of textbook facts & concepts');
    await typeHuman(page, '#chatInput', 'How many colours are there in a rainbow ?', 45);
    await sleep(400);
    await clickVisual(page, '#chatForm button[type="submit"]');
    await sleep(2600);

    // Question 4: Multilingual Hindi
    await updateBanner(page, 'Multilingual AI', 'Full Hindi support for bilingual students & schools');
    await typeHuman(page, '#chatInput', 'पेड़ हमें क्या देते हैं?', 55);
    await sleep(400);
    await clickVisual(page, '#chatForm button[type="submit"]');
    await sleep(2800);

    // Question 5: Indian History in Hindi
    await typeHuman(page, '#chatInput', 'शिवाजी कौन थे?', 55);
    await sleep(400);
    await clickVisual(page, '#chatForm button[type="submit"]');
    await sleep(2800);

    // Voice & Theme toggles
    await updateBanner(page, 'Accessibility', 'Voice speed, Hindi/Indian English voice, and Dark Mode');
    await moveMouseSmooth(page, 1550, 35);
    await sleep(800);
    await clickVisual(page, '#themeToggleBtn');
    await sleep(1400);
    await clickVisual(page, '#themeToggleBtn');
    await sleep(1000);

    // Switch context back to Chapter 1 for pedagogy demo
    await clickVisual(page, '#changeContextBtn');
    await sleep(700);
    await page.selectOption('#selectChapter', { label: 'Chapter 1' }).catch(() => {});
    await sleep(400);
    await clickVisual(page, '#saveContextBtn');
    await sleep(1200);

    // ========================================================
    // ACT 3: DEEP DIVE — 📋 SMART LESSON PLAN (CBSE & NEP 2020)
    // ========================================================
    console.log('🎬 Act 3: Feature 1 — Lesson Plan');
    await updateBanner(page, '📋 Lesson Plan', 'CBSE & NEP 2020 4-Period Structured Pedagogical Plan');
    await clickVisual(page, '#lessonPlanBtn');
    await sleep(2000);

    // Scroll through the lesson plan sheet
    const lpScroll = page.locator('.lessonplan-scroll-wrap').first();
    if (await lpScroll.count() > 0) {
      await updateBanner(page, 'Learning Outcomes', '5E Inquiry Model, Learning Objectives & Bloom\'s Taxonomy');
      await moveMouseSmooth(page, 960, 420);
      await sleep(1600);

      await updateBanner(page, 'Period Breakdown', 'Teacher Activity, Student Activity, Teaching Aids & Formative Check');
      await page.mouse.wheel(0, 500);
      await sleep(2400);
      await page.mouse.wheel(0, 500);
      await sleep(2400);
      await updateBanner(page, 'Classroom Activities', 'Hands-on Experiments, Role-Plays & Homework Assignments');
      await page.mouse.wheel(0, 400);
      await sleep(2200);
      await page.mouse.wheel(0, -1400);
      await sleep(1200);
    }
    // Close lesson plan modal
    await clickVisual(page, '#closeLessonPlanPreviewBtn');
    await sleep(1000);

    // ========================================================
    // ACT 4: DEEP DIVE — 🗺️ INTERACTIVE CONCEPT MIND MAP
    // ========================================================
    console.log('🎬 Act 4: Feature 2 — Mind Map');
    await updateBanner(page, '🗺️ Concept Mind Map', 'Visual Knowledge Graph with Colored Conceptual Branches');
    await clickVisual(page, '#mindMapBtn');
    await sleep(2200);

    // Zoom controls demonstration
    await updateBanner(page, 'Interactive Canvas', 'Zoom In, Zoom Out, Pan, and Inspect Concept Nodes');
    await clickVisual(page, '#mindMapZoomInBtn');
    await sleep(1000);
    await clickVisual(page, '#mindMapZoomInBtn');
    await sleep(1000);
    await clickVisual(page, '#mindMapZoomOutBtn');
    await sleep(1000);
    await clickVisual(page, '#mindMapResetZoomBtn');
    await sleep(1400);

    // Explore canvas
    await moveMouseSmooth(page, 960, 480);
    await sleep(1800);
    await clickVisual(page, '#closeMindMapBtn');
    await sleep(1000);

    // ========================================================
    // ACT 5: DEEP DIVE — 📑 FORMAL TEST PAPER GENERATOR
    // ========================================================
    console.log('🎬 Act 5: Feature 3 — Test Paper');
    await updateBanner(page, '📑 Test Paper Generator', 'Generate formal examination papers with Auto & Manual modes');
    await clickVisual(page, '#testPaperBtn');
    await sleep(1600);

    // Fill test paper configuration
    await updateBanner(page, 'Exam Configuration', 'Set School Name, Exam Title, Time Limit, and Marks Preset');
    await typeHuman(page, '#testPaperSchoolInput', 'Delhi Public School — Term Assessment', 35);
    await sleep(600);

    // Marks preset selection: 20 Marks
    await clickVisual(page, '#testPaperMarksChips button[data-marks="20"]');
    await sleep(800);

    // Toggle teacher marking scheme
    await clickVisual(page, 'label[for="testPaperIncludeAnswers"]');
    await sleep(1000);

    // Switch to Manual Mode tab to showcase granular question selection
    await updateBanner(page, 'Manual Picker', 'Teachers can pick specific questions, diagrams, and section types');
    await clickVisual(page, '#tpModeManualTab');
    await sleep(1800);
    // Switch back to Auto Mode
    await clickVisual(page, '#tpModeAutoTab');
    await sleep(1000);

    // Generate Exam Paper
    await updateBanner(page, 'Formal Exam Paper', 'Generating complete exam sheet with Sections A, B, C & Marks');
    await clickVisual(page, '#generateTestPaperBtn');
    await sleep(2200);

    // Scroll through the formal paper
    await moveMouseSmooth(page, 960, 350);
    await sleep(1400);
    await page.mouse.wheel(0, 450);
    await sleep(2000);
    await page.mouse.wheel(0, 450);
    await sleep(2000);

    // Toggle Teacher Answers
    await updateBanner(page, 'Model Answer Key', 'Toggle Teacher Answer Key & Scoring Rubric on/off');
    await clickVisual(page, '#testPaperToggleAnswersBtn');
    await sleep(1800);
    await clickVisual(page, '#testPaperToggleAnswersBtn');
    await sleep(1400);

    await page.mouse.wheel(0, -900);
    await sleep(1000);
    await clickVisual(page, '#closeTestPaperPreviewBtn');
    await sleep(1000);

    // ========================================================
    // ACT 6: DEEP DIVE — 📝 PRINTABLE PRACTICE WORKSHEET
    // ========================================================
    console.log('🎬 Act 6: Feature 4 — Worksheet Generator');
    await updateBanner(page, '📝 Practice Worksheet', 'A4 Ready-to-Print Practice Worksheet with ruled answer lines');
    await clickVisual(page, '#worksheetBtn');
    await sleep(1600);

    // Worksheet Config
    await typeHuman(page, '#worksheetSchoolInput', 'St. Xavier\'s International School', 35);
    await sleep(600);

    // Select 5 Questions preset
    await clickVisual(page, '#worksheetPresetChips button[data-count="5"]');
    await sleep(800);

    // Generate Worksheet
    await updateBanner(page, 'Printable Worksheet', 'Formatted with Student Details, Date, Marks & Signature line');
    await clickVisual(page, '#generateWorksheetBtn');
    await sleep(2200);

    // Scroll worksheet
    await moveMouseSmooth(page, 960, 360);
    await sleep(1400);
    await page.mouse.wheel(0, 450);
    await sleep(2000);

    // Shuffle questions demonstration
    await updateBanner(page, 'Shuffle Questions', 'Instantly reshuffle new random questions from the chapter pool');
    await clickVisual(page, '#worksheetShuffleAllBtn');
    await sleep(1600);

    // Toggle Answers
    await clickVisual(page, '#worksheetToggleAnswerKeyBtn');
    await sleep(1600);
    await clickVisual(page, '#worksheetToggleAnswerKeyBtn');
    await sleep(1200);

    await page.mouse.wheel(0, -450);
    await sleep(1000);
    await clickVisual(page, '#closeWorksheetPreviewBtn');
    await sleep(1000);

    // ========================================================
    // ACT 7: DEEP DIVE — 🎯 INTERACTIVE CHAPTER QUIZ (MCQ & Flashcards)
    // ========================================================
    console.log('🎬 Act 7: Feature 5 — Quiz');
    await updateBanner(page, '🎯 Chapter Quiz', 'Gamified Multiple-Choice Quiz & Flashcard Recall');
    await clickVisual(page, '#quizBtn');
    await sleep(1800);

    // Start Quiz
    await updateBanner(page, 'Play Quiz', 'Test textbook knowledge with 4-option MCQs and instant scoring');
    if (await page.locator('#startQuizRunBtn').isEnabled()) {
      await clickVisual(page, '#startQuizRunBtn');
      await sleep(1800);

      // Select an option button
      const optBtn = page.locator('#quizOptionsContainer .quiz-option-btn').first();
      if (await optBtn.count() > 0) {
        await updateBanner(page, 'Instant Feedback', 'Highlights correct answer with celebratory mascot animations');
        await clickVisual(page, '#quizOptionsContainer .quiz-option-btn');
        await sleep(2200);

        // Next Question
        if (await page.locator('#quizNextBtn').isVisible()) {
          await clickVisual(page, '#quizNextBtn');
          await sleep(1600);
        }
      }
    }
    // Close Quiz
    await clickVisual(page, '#closeQuizBtn');
    await sleep(1000);

    // ========================================================
    // ACT 8: DEEP DIVE — 🎙️ ORAL TEST (VOICE VIVA WITH ROBOT)
    // ========================================================
    console.log('🎬 Act 8: Feature 6 — Oral Test (Voice Viva)');
    await updateBanner(page, '🎙️ Oral Test / Viva', 'Spoken Viva session with AI Robot Mascot');
    await clickVisual(page, '#oralTestBtn');
    await sleep(1800);

    // Viva config
    await updateBanner(page, 'Viva Setup', 'Choose question count, voice language & review tips');
    await moveMouseSmooth(page, 960, 450);
    await sleep(1400);

    // Start Viva
    await clickVisual(page, '#startOralTestBtn');
    await sleep(2000);

    // Viva Active Stage
    await updateBanner(page, 'Spoken Practice', 'Robot reads question aloud; student speaks or types answer');
    await moveMouseSmooth(page, 960, 320); // Mascot speaking
    await sleep(1600);

    // Type spoken response in transcript
    if (await page.locator('#oralTranscriptInput').isVisible()) {
      await updateBanner(page, 'Evaluation', 'AI checks scientific keywords, concepts & marks the answer');
      await typeHuman(page, '#oralTranscriptInput', 'A nuclear family has parents and their children living together happily.', 35);
      await sleep(1000);
      if (await page.locator('#oralSubmitAnswerBtn').isVisible()) {
        await clickVisual(page, '#oralSubmitAnswerBtn');
        await sleep(2400);
      }
    }

    // Exit Viva
    if (await page.locator('#closeOralTestActiveBtn').isVisible()) {
      await clickVisual(page, '#closeOralTestActiveBtn');
      await sleep(1000);
    }

    // ========================================================
    // ACT 9: SUMMARY & OUTRO
    // ========================================================
    console.log('🎬 Act 9: Summary & Outro');
    await updateBanner(page, 'Enterprise EdTech Suite', 'Publisher Bot: Next-Generation AI Study Buddy & Academic Engine');
    await moveMouseSmooth(page, 960, 350);
    await sleep(1500);
    await moveMouseSmooth(page, 960, 650);
    await sleep(2800);

    console.log('🎉 Detailed Chat Deep-Dive Recording complete!');
  } catch (err) {
    console.error('Error in chat deepdive recording:', err);
  } finally {
    const video = page.video();
    await context.close();
    await browser.close();

    if (video) {
      const videoPath = await video.path();
      console.log('🎥 Raw WebM Video saved at:', videoPath);

      const targetWebm = path.join(outputDir, 'Chat_and_Academic_Features_Deepdive.webm');
      fs.copyFileSync(videoPath, targetWebm);
      console.log('🎬 Final Detailed Video ready at:', targetWebm);
    }
  }
}

runChatDeepdive();
