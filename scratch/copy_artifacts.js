const fs = require('fs');
// Let's copy the screenshots to artifacts directory so we can inspect them
const dir = 'C:/Users/praveen/.gemini/antigravity/brain/e5df2496-1cce-49e8-8a44-a5742c85a64e';

function copyFile(src, dest) {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, `${dir}/${dest}`);
    console.log(`Copied ${src} -> ${dest}`);
  } else {
    console.log(`File not found: ${src}`);
  }
}

copyFile('scratch/desktop_clean_chat.png', 'desktop_clean_chat.png');
copyFile('scratch/desktop_menu_open.png', 'desktop_menu_open.png');
copyFile('scratch/feature_testPaperModal.png', 'feature_testPaperModal.png');
copyFile('scratch/feature_lessonPlanModal.png', 'feature_lessonPlanModal.png');
copyFile('scratch/feature_quizModal.png', 'feature_quizModal.png');

