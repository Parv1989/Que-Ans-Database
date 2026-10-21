/**
 * greetingHandler.js
 * Comprehensive Greeting Detection & Dynamic Response Engine for Study Buddy
 * 
 * Handles multi-lingual greetings (English, Hindi Devanagari, Hinglish):
 * - Basic greetings: "Hi", "Hello", "Hey", "Namaste", "Pranam", etc.
 * - Inquiries: "How are you?", "How r u?", "Kaise ho?", "Kya haal hai?", etc.
 * - Time-based: "Good morning", "Good afternoon", "Good evening", "Good night"
 * - Bot identity: "Who are you?", "What is your name?", "Tum kaun ho?"
 * - Courtesies: "Thank you", "Thanks", "Bye", "Goodbye"
 * - Prefix stripping: Cleans "Hi, what is photosynthesis?" -> "what is photosynthesis?"
 */

const GREETING_WORDS = new Set([
  'hi', 'hii', 'hiii', 'hiiii', 'hey', 'heyy', 'heyyy', 'heya',
  'hello', 'helloo', 'hellooo', 'hellow', 'hlw', 'hlo', 'holla', 'hola', 'yo',
  'namaste', 'namaskar', 'namaskaram', 'pranam', 'pranaam',
  'radhe radhe', 'ram ram', 'jai shri ram', 'jai shree ram', 'jai shree krishna',
  'jai jinendra', 'salam', 'salaam', 'assalam walekum', 'assalamu alaikum', 'adaab',
  'sat sri akaal', 'sasriyakaal',
  'नमस्ते', 'नमस्कार', 'नमस्कारम', 'प्रणाम', 'राधे राधे', 'राम राम',
  'जय श्री राम', 'जय श्री कृष्णा', 'जय जिनेंद्र', 'सलाम', 'आदाब', 'सत श्री अकाल'
]);

function cleanQuery(str) {
  return (str || '')
    .toLowerCase()
    .trim()
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2300}-\u{23FF}]/gu, '')
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasHindiScript(str) {
  return /[\u0900-\u097F]/.test(str || '');
}

// Regex patterns for greeting categories
const HOW_ARE_YOU_EN = /^(?:(?:hi|hello|hey|heya|hola|yo|namaste|pranam)\s+)?(?:how\s+(?:are|r|re)\s+(?:you|u|ya)(?:\s+(?:doing|today|now))?|how\s+do\s+you\s+do|how\s+is\s+it\s+going|hows\s+it\s+going|what\s+is\s+up|whats\s+up|wassup|sup|wazzup)(?:\s+(?:buddy|bot|bro|sir|mam|madam|study\s+buddy|there|today))?$/i;
const HOW_ARE_YOU_HI = /^(?:(?:hi|hello|hey|namaste|pranam|नमस्ते|प्रणाम)\s+)?(?:(?:aap|tum|ap)\s+)?(?:kaise|kese|kaisa|kaisi)\s+(?:ho|hain|hai|h)(?:\s+(?:bhai|yaar|bot|buddy|ji|aap|tum))?$|^(?:(?:hi|hello|hey)\s+)?(?:kya\s+h[a]+l(?:\s+ch[a]+l)?(?:\s+(?:hai|h))?|sab\s+(?:kaisa|badhiya|theek|thik|theek\s+hai|thik\s+hai|badhiya\s+hai))(?:\s+(?:hai|h|bhai|yaar))?$|^((?:नमस्ते|प्रणाम)\s+)?((आप|तुम)\s+)?(कैसे|कैसी|कहा)\s+(हो|हैं|है)$|^(क्या\s+हाल\s+है|sab\s+(कैसा|ठीक|बढ़िया)\s+है)$/i;

const TIME_MORNING = /^(?:(?:hi|hello|hey|namaste|shubh|very)\s+)?(?:good\s+morning|gud\s+morning|gd\s+morning|morning|gm|suprabhat|shubh\s+prabhat|सुप्रभात|शुभ\s+प्रभात)(?:\s+(?:all|buddy|bot|sir|mam|madam|everyone|to\s+all|study\s+buddy))?$/i;
const TIME_AFTERNOON = /^(?:(?:hi|hello|hey|namaste|very)\s+)?(?:good\s+afternoon|gud\s+afternoon|afternoon|ga|shubh\s+dopahar|शुभ\s+दोपहर)(?:\s+(?:all|buddy|bot|sir|mam|madam|study\s+buddy))?$/i;
const TIME_EVENING = /^(?:(?:hi|hello|hey|namaste|very)\s+)?(?:good\s+evening|gud\s+evening|gd\s+evening|evening|ge|shubh\s+sandhya|शुभ\s+संध्या)(?:\s+(?:all|buddy|bot|sir|mam|madam|study\s+buddy))?$/i;
const TIME_NIGHT = /^(?:(?:hi|hello|hey|namaste)\s+)?(?:good\s+night|gud\s+night|gn|shubh\s+ratri|शुभ\s+रात्रि)(?:\s+(?:all|buddy|bot|sir|mam|madam|study\s+buddy))?$/i;
const TIME_DAY = /^(?:have\s+a\s+)?(?:good\s+day|great\s+day|nice\s+day)$/i;

const WHO_ARE_YOU = /^(?:who\s+(?:are|r)\s+(?:you|u)|what\s+is\s+your\s+name|whats\s+your\s+name|what\s+do\s+you\s+do|tum\s+kaun\s+ho|aap\s+kaun\s+ho|kaun\s+ho\s+tum|kaun\s+ho\s+aap|aapka\s+naam\s+kya\s+hai|apka\s+naam\s+kya\s+h|tumhara\s+naam\s+kya\s+hai|आप\s+कौन\s+(?:हैं|हो)|तुम\s+कौन\s+हो|आपका\s+नाम\s+क्या\s+है)$/i;
const THANK_YOU = /^(?:thank\s+you|thanks|thank\s+u|thx|thnx|thankyou|many\s+thanks|dhanyawad|dhanyavaad|shukriya|bohot\s+shukriya|bahut\s+shukriya|धन्यवाद|शुक्रिया|बहुत\s+धन्यवाद)(?:\s+(?:so\s+much|a\s+lot|buddy|bot|sir|mam|madam|study\s+buddy))?$/i;
const GOODBYE = /^(?:bye|goodbye|good\s+bye|bye\s+bye|byee|byeee|see\s+you|see\s+ya|cya|tata|alvida|अलविदा|बाय)(?:\s+(?:buddy|bot|sir|mam|madam|study\s+buddy))?$/i;
const PRAISE = /^(?:good\s+job|great\s+job|well\s+done|awesome|superb|nice|very\s+good|shabash|bahut\s+badhiya|bohot\s+badhiya|बहुत\s+बढ़िया|शाबाश)$/i;
const HELP = /^(?:help|help\s+me|can\s+you\s+help\s+me|can\s+u\s+help\s+me|what\s+can\s+you\s+do|what\s+can\s+u\s+do|kya\s+kar\s+sakte\s+ho|(?:meri\s+)?madad\s+karo|(?:मेरी\s+)?मदद\s+(?:करो|चाहिए))$/i;

// Academic tools & intents
const REVISION = /^(?:(?:ch|chapter|lesson|book)\s+)?(?:revision|revise)(?:\s+(?:chapter|lesson|karna\s+hai|karwa\s+do|karva\s+do|please|plz))?$|^(?:(?:mujhe|hume)\s+)?(?:revision|chapter\s+revision)(?:\s+karna\s+hai)?$|^(?:रिवीजन|रिवीज़न|अभ्यास|पाठ\s+का\s+रिवीजन)$/i;
const HOMEWORK = /^(?:(?:my|the|in|with)\s+)?home\s*work(?:\s+(?:help|please|plz|karna\s+hai|me\s+madad))?$|^(?:help\s+(?:me\s+)?(?:with|in)\s+home\s*work)$|^(?:होमवर्क)$/i;
const QUIZ = /^(?:(?:start|take|play|open)\s+)?quiz(?:\s+(?:test|please|plz|khelna\s+hai|dena\s+hai))?$/i;
const WORKSHEET = /^(?:(?:open|make|create|generate|print)\s+)?work\s*sheet(?:\s+(?:please|plz|chahiye|banao))?$/i;
const MIND_MAP = /^(?:(?:open|view|show)\s+)?mind\s*map(?:\s+(?:please|plz|chahiye|dikhao))?$/i;
const TEST_PAPER = /^(?:(?:open|make|create|generate)\s+)?(?:test\s*paper|exam\s*paper|question\s*paper)(?:\s+(?:please|plz|chahiye|banao))?$/i;
const LESSON_PLAN = /^(?:(?:open|view|show)\s+)?lesson\s*plan(?:\s+(?:please|plz|chahiye|dikhao))?$/i;
const NOTES = /^(?:(?:view|show|print|export)\s+)?(?:study\s+)?notes(?:\s+(?:please|plz|chahiye))?$/i;

function isGeneralGreeting(cleaned) {
  if (GREETING_WORDS.has(cleaned)) return true;
  const suffixRegex = /\s+(?:bot|buddy|study\s+buddy|there|sir|mam|madam|ji|dear|friend|bro|everyone|all)$/i;
  const stripped = cleaned.replace(suffixRegex, '').trim();
  if (GREETING_WORDS.has(stripped)) {
    return true;
  }
  return false;
}

// Response pools with natural variations
const RESPONSES = {
  HOW_ARE_YOU_EN: [
    "I'm doing great, thank you for asking! 😊 What question would you like to ask from your textbook today?",
    "I'm doing wonderful, thanks! 🌟 Feel free to ask me any question from your chapters or lessons.",
    "All good here, thank you! 😊 Which question from your book can I help you with today?"
  ],
  HOW_ARE_YOU_HI: [
    "मैं बिल्कुल ठीक हूँ, पूछने के लिए धन्यवाद! 😊 आप मुझसे अपनी किताब या पाठ से कोई भी सवाल पूछ सकते हैं।",
    "सब कुछ बहुत बढ़िया है, धन्यवाद! 🌟 अपनी किताब का कोई भी सवाल पूछें, मैं उत्तर दूँगा।"
  ],
  TIME_MORNING: [
    "Good morning! ☀️ Wishing you a wonderful day of learning. What question would you like to ask today?",
    "Good morning! 🌅 Ready to learn? Ask me any question from your lessons!"
  ],
  TIME_MORNING_HI: [
    "शुभ प्रभात! ☀️ आपका आज का दिन ज्ञान और खुशियों से भरा हो। आज आप किस पाठ या विषय का अभ्यास करना चाहते हैं?"
  ],
  TIME_AFTERNOON: [
    "Good afternoon! 🌤️ Which question from your book can I help you with today?"
  ],
  TIME_AFTERNOON_HI: [
    "शुभ दोपहर! 🌤️ आज मैं आपकी पढ़ाई में क्या सहायता कर सकता हूँ?"
  ],
  TIME_EVENING: [
    "Good evening! 🌙 What question would you like to ask from your lessons today?",
    "Good evening! 🌙 Ready to study? Ask me any question from your chapter!"
  ],
  TIME_EVENING_HI: [
    "शुभ संध्या! 🌙 आज आप किस विषय या पाठ का अभ्यास करना चाहते हैं? बेझिझक पूछें।"
  ],
  TIME_NIGHT: [
    "Good night! 🌙 Sleep well and rest up! If you have any last questions from your book before sleeping, I'm right here.",
    "Good night! 😴 Have sweet dreams and recharge for tomorrow's learning adventure!"
  ],
  TIME_NIGHT_HI: [
    "शुभ रात्रि! 🌙 अच्छी नींद लें और कल नई ऊर्जा के साथ सीखें। यदि कोई सवाल हो, तो मैं यहीं हूँ।"
  ],
  TIME_DAY: [
    "Thank you! Wishing you a wonderful and productive day too! 🌟 What question can I help you with today?"
  ],
  REVISION_EN: [
    "Sure! To revise this chapter, you can:\n• 💬 Ask me any question from this chapter to get instant answers and explanations.\n• 🎯 Click the **Quiz** button in the top bar to test your knowledge.\n• 📝 Click **Worksheet** or **Mind Map** for quick concept revision.\n\nWhich question or topic would you like to start with?"
  ],
  REVISION_HI: [
    "ज़रूर! इस पाठ का रिवीजन (Revision) करने के लिए आप:\n• 💬 मुझसे इस पाठ का कोई भी सवाल पूछ सकते हैं।\n• 🎯 ऊपर दिए गए **Quiz** बटन पर क्लिक करके टेस्ट दे सकते हैं।\n• 📝 **Worksheet** या **Mind Map** से मुख्य बिंदु दोहरा सकते हैं।\n\nआप कौन सा सवाल पूछना चाहते हैं?"
  ],
  HOMEWORK_EN: [
    "I'm ready to help with your homework! 📚 Please type the exact question or exercise from your book, and I'll explain the solution step-by-step."
  ],
  HOMEWORK_HI: [
    "मैं आपके होमवर्क में मदद करने के लिए तैयार हूँ! 📚 कृपया अपनी किताब का वह सवाल यहाँ टाइप करें, मैं आपको उसका सही उत्तर और व्याख्या समझाऊँगा।"
  ],
  QUIZ_EN: [
    "You can take an interactive chapter quiz right now! 🎯 Just click the **Quiz** button in the top bar to start your test, or type any question to practice."
  ],
  QUIZ_HI: [
    "आप अभी इंटरैक्टिव क्विज़ खेल सकते हैं! 🎯 ऊपर दिए गए **Quiz** बटन पर क्लिक करें और अपनी तैयारी टेस्ट करें।"
  ],
  WORKSHEET_EN: [
    "You can generate and print practice worksheets anytime! 📝 Just click the **Worksheet** button in the top bar."
  ],
  WORKSHEET_HI: [
    "आप अभ्यास वर्कशीट कभी भी तैयार कर सकते हैं! 📝 ऊपर दिए गए **Worksheet** बटन पर क्लिक करें।"
  ],
  MIND_MAP_EN: [
    "You can explore the visual concept mind map! 🗺️ Just click the **Mind Map** button in the top bar."
  ],
  MIND_MAP_HI: [
    "आप इस पाठ का विज़ुअल कॉन्सेप्ट मैप देख सकते हैं! 🗺️ ऊपर दिए गए **Mind Map** बटन पर क्लिक करें।"
  ],
  TEST_PAPER_EN: [
    "You can generate a formal school examination paper! 📑 Just click the **Test Paper** button in the top bar."
  ],
  LESSON_PLAN_EN: [
    "You can view the pedagogical lesson plan! 📋 Just click the **Lesson Plan** button in the top bar."
  ],
  NOTES_EN: [
    "You can print and export all answered textbook questions as study notes! 📄 Just click the **Notes** button in the top bar."
  ],
  GENERAL_GREETING_EN: [
    "Hello! 😊 How can I help you today? You can ask me any question from your chapters, lessons, or books.",
    "Hi there! 👋 What would you like to learn today? Feel free to ask any question from your syllabus.",
    "Hello! Welcome to Study Buddy. 🌟 Ask me any question from your textbook, and I'll be happy to help!"
  ],
  GENERAL_GREETING_HI: [
    "नमस्ते! 🙏 मैं आपकी पढ़ाई में कैसे सहायता कर सकता हूँ? आप मुझसे अपनी किताब या किसी भी पाठ से जुड़ा सवाल पूछ सकते हैं।",
    "नमस्कार! 😊 आज आप क्या पढ़ना चाहते हैं? अपनी पाठ्यपुस्तक का कोई भी प्रश्न पूछें।"
  ],
  WHO_ARE_YOU_EN: [
    "I am Study Buddy! 🤖 Your friendly learning assistant. You can ask me questions from your textbook, get simple explanations, practice quizzes, and generate revision worksheets. What would you like to ask?"
  ],
  WHO_ARE_YOU_HI: [
    "मैं स्टडी बडी (Study Buddy) हूँ! 🤖 आपका पढ़ाई साथी। आप मुझसे अपनी पाठ्यपुस्तक के सवाल पूछ सकते हैं, आसान व्याख्या समझ सकते हैं और रिवीजन वर्कशीट तैयार कर सकते हैं। आज आप क्या पढ़ना चाहते हैं?"
  ],
  THANK_YOU_EN: [
    "You're most welcome! 😊 Always happy to help you learn. Let me know if you have any other questions!",
    "Glad I could help! 🌟 Keep learning and feel free to ask more questions anytime."
  ],
  THANK_YOU_HI: [
    "आपका बहुत-बहुत स्वागत है! 😊 सीखने में आपकी मदद करके मुझे खुशी हुई। यदि कोई और सवाल हो, तो ज़रूर पूछें!"
  ],
  GOODBYE_EN: [
    "Goodbye! 👋 Keep learning and have a wonderful day ahead! Come back whenever you need help with your studies.",
    "Bye! 👋 Have fun and study well. I'm always here whenever you need me!"
  ],
  GOODBYE_HI: [
    "अलविदा! 👋 मन लगाकर पढ़ते रहें और आपका दिन शुभ हो! जब भी पढ़ाई में मदद चाहिए, स्टडी बडी हमेशा तैयार है।"
  ],
  PRAISE_EN: [
    "Thank you so much! 😊 I'm really glad I could help. Keep up the wonderful enthusiasm for learning!"
  ],
  PRAISE_HI: [
    "बहुत-बहुत धन्यवाद! 😊 मुझे खुशी है कि मैं आपके काम आ सका। ऐसे ही मन लगाकर सीखते रहिए!"
  ],
  HELP_EN: [
    "I'm here to help you study and learn! 📚 You can ask me any question from your textbook, get simple explanations, generate revision worksheets, or practice interactive quizzes. What would you like to ask today?"
  ],
  HELP_HI: [
    "मैं आपकी पढ़ाई में मदद करने के लिए यहाँ हूँ! 📚 आप मुझसे अपनी किताब से कोई भी सवाल पूछ सकते हैं, आसान व्याख्या समझ सकते हैं, या रिवीजन वर्कशीट बना सकते हैं। आज आप क्या पूछना चाहते हैं?"
  ]
};

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Checks if a user's query is a pure greeting.
 * Returns { isGreeting: true, reply: "...", category: "..." } or null.
 */
function checkGreeting(rawQuery) {
  if (!rawQuery) return null;
  const cleaned = cleanQuery(rawQuery);
  if (!cleaned) return null;

  const isHindi = hasHindiScript(rawQuery);

  // 1. "How are you?" type greetings
  if (HOW_ARE_YOU_EN.test(cleaned)) {
    return {
      isGreeting: true,
      category: 'HOW_ARE_YOU',
      reply: pickRandom(RESPONSES.HOW_ARE_YOU_EN)
    };
  }
  if (HOW_ARE_YOU_HI.test(cleaned)) {
    return {
      isGreeting: true,
      category: 'HOW_ARE_YOU',
      reply: pickRandom(RESPONSES.HOW_ARE_YOU_HI)
    };
  }

  // 2. Time-of-day greetings
  if (TIME_MORNING.test(cleaned)) {
    return {
      isGreeting: true,
      category: 'TIME_MORNING',
      reply: isHindi ? pickRandom(RESPONSES.TIME_MORNING_HI) : pickRandom(RESPONSES.TIME_MORNING)
    };
  }
  if (TIME_AFTERNOON.test(cleaned)) {
    return {
      isGreeting: true,
      category: 'TIME_AFTERNOON',
      reply: isHindi ? pickRandom(RESPONSES.TIME_AFTERNOON_HI) : pickRandom(RESPONSES.TIME_AFTERNOON)
    };
  }
  if (TIME_EVENING.test(cleaned)) {
    return {
      isGreeting: true,
      category: 'TIME_EVENING',
      reply: isHindi ? pickRandom(RESPONSES.TIME_EVENING_HI) : pickRandom(RESPONSES.TIME_EVENING)
    };
  }
  if (TIME_NIGHT.test(cleaned)) {
    return {
      isGreeting: true,
      category: 'TIME_NIGHT',
      reply: isHindi ? pickRandom(RESPONSES.TIME_NIGHT_HI) : pickRandom(RESPONSES.TIME_NIGHT)
    };
  }
  if (TIME_DAY.test(cleaned)) {
    return {
      isGreeting: true,
      category: 'TIME_DAY',
      reply: pickRandom(RESPONSES.TIME_DAY)
    };
  }

  // 3. Bot identity
  if (WHO_ARE_YOU.test(cleaned)) {
    return {
      isGreeting: true,
      category: 'WHO_ARE_YOU',
      reply: isHindi ? pickRandom(RESPONSES.WHO_ARE_YOU_HI) : pickRandom(RESPONSES.WHO_ARE_YOU_EN)
    };
  }

  // 4. Thank you
  if (THANK_YOU.test(cleaned)) {
    return {
      isGreeting: true,
      category: 'THANK_YOU',
      reply: isHindi ? pickRandom(RESPONSES.THANK_YOU_HI) : pickRandom(RESPONSES.THANK_YOU_EN)
    };
  }

  // 5. Goodbye
  if (GOODBYE.test(cleaned)) {
    return {
      isGreeting: true,
      category: 'GOODBYE',
      reply: isHindi ? pickRandom(RESPONSES.GOODBYE_HI) : pickRandom(RESPONSES.GOODBYE_EN)
    };
  }

  // 6. Praise
  if (PRAISE.test(cleaned)) {
    return {
      isGreeting: true,
      category: 'PRAISE',
      reply: isHindi ? pickRandom(RESPONSES.PRAISE_HI) : pickRandom(RESPONSES.PRAISE_EN)
    };
  }

  // 7. Help & capabilities
  if (HELP.test(cleaned)) {
    return {
      isGreeting: true,
      category: 'HELP',
      reply: isHindi ? pickRandom(RESPONSES.HELP_HI) : pickRandom(RESPONSES.HELP_EN)
    };
  }

  // 8. Academic requests (revision, homework, quiz, worksheet, mind map, etc.)
  if (REVISION.test(cleaned)) {
    return {
      isGreeting: true,
      category: 'REVISION',
      reply: isHindi ? pickRandom(RESPONSES.REVISION_HI) : pickRandom(RESPONSES.REVISION_EN)
    };
  }
  if (HOMEWORK.test(cleaned)) {
    return {
      isGreeting: true,
      category: 'HOMEWORK',
      reply: isHindi ? pickRandom(RESPONSES.HOMEWORK_HI) : pickRandom(RESPONSES.HOMEWORK_EN)
    };
  }
  if (QUIZ.test(cleaned)) {
    return {
      isGreeting: true,
      category: 'QUIZ',
      reply: isHindi ? pickRandom(RESPONSES.QUIZ_HI) : pickRandom(RESPONSES.QUIZ_EN)
    };
  }
  if (WORKSHEET.test(cleaned)) {
    return {
      isGreeting: true,
      category: 'WORKSHEET',
      reply: isHindi ? pickRandom(RESPONSES.WORKSHEET_HI) : pickRandom(RESPONSES.WORKSHEET_EN)
    };
  }
  if (MIND_MAP.test(cleaned)) {
    return {
      isGreeting: true,
      category: 'MIND_MAP',
      reply: isHindi ? pickRandom(RESPONSES.MIND_MAP_HI) : pickRandom(RESPONSES.MIND_MAP_EN)
    };
  }
  if (TEST_PAPER.test(cleaned)) {
    return {
      isGreeting: true,
      category: 'TEST_PAPER',
      reply: pickRandom(RESPONSES.TEST_PAPER_EN)
    };
  }
  if (LESSON_PLAN.test(cleaned)) {
    return {
      isGreeting: true,
      category: 'LESSON_PLAN',
      reply: pickRandom(RESPONSES.LESSON_PLAN_EN)
    };
  }
  if (NOTES.test(cleaned)) {
    return {
      isGreeting: true,
      category: 'NOTES',
      reply: pickRandom(RESPONSES.NOTES_EN)
    };
  }

  // 9. Basic greetings ("Hi", "Hello", "Hey", "Namaste", etc.)
  if (isGeneralGreeting(cleaned)) {
    const isHindiGreeting = isHindi || /^(?:namaste|namaskar|pranam|radhe\s+radhe|ram\s+ram|jai\s+shri\s+ram)/i.test(cleaned);
    return {
      isGreeting: true,
      category: 'GENERAL_GREETING',
      reply: isHindiGreeting ? pickRandom(RESPONSES.GENERAL_GREETING_HI) : pickRandom(RESPONSES.GENERAL_GREETING_EN)
    };
  }

  return null;
}

/**
 * Strips conversational greeting prefixes from questions like:
 * "Hi, what is photosynthesis?" -> "what is photosynthesis?"
 * "Hello, which planet is called red planet ?" -> "which planet is called red planet ?"
 * Preserves the original query if no actual question follows.
 */
function stripGreetingPrefix(rawQuery) {
  if (!rawQuery) return '';
  const trimmed = rawQuery.trim();
  const prefixRegex = /^(?:hi|hii|hiii|hey|heyy|hello|helloo|holla|hola|namaste|namaskar|pranam|सुप्रभात|नमस्ते|प्रणाम|good\s+(?:morning|afternoon|evening))\b(?:\s+(?:there|buddy|bot|study\s+buddy|sir|mam|madam))?[\s,!.:-]+/i;

  const match = trimmed.match(prefixRegex);
  if (match) {
    const stripped = trimmed.slice(match[0].length).trim();
    if (stripped.length >= 4 && stripped.split(/\s+/).length >= 2) {
      return stripped;
    }
  }
  return trimmed;
}

module.exports = {
  checkGreeting,
  stripGreetingPrefix,
  cleanQuery
};
