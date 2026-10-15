const API_URL = window.location.origin + '/api/ask';
const TTS_API_URL = window.location.origin + '/api/tts';
const HIERARCHY_API_URL = window.location.origin + '/api/ask/hierarchy';

const messagesEl = document.getElementById('messages');
const form = document.getElementById('chatForm');
const input = document.getElementById('chatInput');
const robotEl = document.getElementById('robot');
const muteBtn = document.getElementById('muteBtn');
const muteIcon = document.getElementById('muteIcon');
const voiceSelect = document.getElementById('voiceSelect');

// Context elements
const currentSelectionBadge = document.getElementById('currentSelectionBadge');
const changeContextBtn = document.getElementById('changeContextBtn');
const contextModal = document.getElementById('contextModal');
const selectClass = document.getElementById('selectClass');
const selectBook = document.getElementById('selectBook');
const selectChapter = document.getElementById('selectChapter');
const saveContextBtn = document.getElementById('saveContextBtn');

// Image lightbox elements
const imageLightbox = document.getElementById('imageLightbox');
const lightboxImg = document.getElementById('lightboxImg');
const closeLightboxBtn = document.getElementById('closeLightboxBtn');

// Context State
let hierarchyData = {};
let savedClass = localStorage.getItem('bot_selected_class') || '';
let savedBook = localStorage.getItem('bot_selected_book') || '';
let savedChapter = localStorage.getItem('bot_selected_chapter') || 'All Chapters';

let currentClass = savedClass;
let currentBook = savedBook;
let currentChapter = savedChapter;
let hasSavedContext = !!(savedClass && savedBook);

// Voice State & Greeting State
let voiceEnabled = true;
let selectedVoiceName = localStorage.getItem('studybuddy_voice_lang') || 'hindi';
let cachedVoice = null;
let userHasChosenVoice = false;
let currentAudio = null;
let lipSyncAnimationId = null;
let visemeTimer = null;

const INITIAL_GREETING = "Hi! You can ask me anything related to this book. I'll answer you instantly.";
let greetingSpoken = false;

// Escapes raw HTML characters to prevent XSS, then converts Markdown & formatting tags
function formatText(raw) {
  if (!raw) return '';
  const div = document.createElement('div');
  div.textContent = raw;
  let escaped = div.innerHTML;

  return escaped
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\^([^\^]+)\^/g, '<sup>$1</sup>')
    .replace(/~([^~]+)~/g, '<sub>$1</sub>')
    .replace(/\n/g, '<br>');
}

// Turns raw text into plain, speakable words for the voice engine
function toSpeechText(raw) {
  return (raw || '')
    .replace(/<[^>]*>/g, '') // strip any html tags
    .replace(/\^([^\^]+)\^/g, '$1') // strip superscript markers
    .replace(/~([^~]+)~/g, '$1') // strip subscript markers
    .replace(/[\*\_\`\#]/g, '') // strip markdown
    .replace(/\+/g, ' plus ')
    .replace(/\=/g, ' equals ')
    .replace(/\%/g, ' percent ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------- Preload Greeting Audio for Instant Playback ----------
let preloadedGreetingAudios = null;
let preloadGreetingPromise = null;

function preloadGreetingTTS() {
  preloadGreetingPromise = fetch(`${TTS_API_URL}?text=${encodeURIComponent(INITIAL_GREETING)}&lang=en`)
    .then((res) => res.json())
    .then((data) => {
      if (data.audios && data.audios.length > 0) {
        preloadedGreetingAudios = data.audios;
      }
      return preloadedGreetingAudios;
    })
    .catch((err) => {
      console.warn('Preload greeting error:', err);
      return null;
    });
}
preloadGreetingTTS();

async function speakServerTTS(speechText, lang = 'hi') {
  if (!voiceEnabled) return;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  stopLipSync();

  try {
    let audioList = null;
    if (speechText === INITIAL_GREETING) {
      if (preloadedGreetingAudios && preloadedGreetingAudios.length > 0) {
        audioList = preloadedGreetingAudios;
      } else if (preloadGreetingPromise) {
        audioList = await preloadGreetingPromise;
      }
    }

    if (!audioList || audioList.length === 0) {
      const res = await fetch(`${TTS_API_URL}?text=${encodeURIComponent(speechText)}&lang=${lang}`);
      if (!res.ok) throw new Error(`Server TTS HTTP error: ${res.status}`);
      const data = await res.json();
      audioList = data.audios;
    }

    if (!audioList || audioList.length === 0) {
      throw new Error('No audio returned by Server TTS');
    }

    let audioIndex = 0;

    function playNextAudio() {
      if (audioIndex >= audioList.length || !voiceEnabled) {
        setTalking(false);
        return;
      }

      const audio = new Audio(audioList[audioIndex++]);
      currentAudio = audio;

      audio.onplay = () => {
        greetingSpoken = true;
        setTalking(true);
        let startTime = performance.now();
        function syncLoop(now) {
          if (!currentAudio || currentAudio.paused || currentAudio.ended) {
            setTalking(false);
            return;
          }
          let elapsed = now - startTime;
          let cycle = Math.floor(elapsed / 140) % 4;
          let cycleVisemes = ['A_O', 'E_I', 'CONSONANT', 'U'];
          setViseme(cycleVisemes[cycle]);
          lipSyncAnimationId = requestAnimationFrame(syncLoop);
        }
        lipSyncAnimationId = requestAnimationFrame(syncLoop);
      };

      audio.onended = () => {
        playNextAudio();
      };

      audio.onerror = (err) => {
        console.warn('Base64 Audio play error, falling back to speech synthesis:', err);
        setTalking(false);
        if (lang === 'uk' || lang === 'en') {
          speakUKEnglishFallback(speechText);
        } else {
          speakHindiFallback(speechText);
        }
      };

      audio.play().catch((err) => {
        console.warn('Audio play blocked/failed, falling back to speech synthesis:', err);
        setTalking(false);
        if (lang === 'uk' || lang === 'en') {
          speakUKEnglishFallback(speechText);
        } else {
          speakHindiFallback(speechText);
        }
      });
    }

    playNextAudio();
  } catch (err) {
    console.warn('Server TTS unavailable, falling back to speech synthesis:', err);
    setTalking(false);
    if (lang === 'uk' || lang === 'en') {
      speakUKEnglishFallback(speechText);
    } else {
      speakHindiFallback(speechText);
    }
  }
}

// Find the best available Hindi voice
function getHindiVoice() {
  if (!window.speechSynthesis) return null;
  const allVoices = window.speechSynthesis.getVoices() || [];

  // 1. Google Hindi
  const googleHi = allVoices.find((v) => {
    const n = (v.name || '').toLowerCase();
    const l = (v.lang || '').toLowerCase().replace('_', '-');
    return n.includes('google') && (l.startsWith('hi') || n.includes('hindi') || n.includes('हिन्दी'));
  });
  if (googleHi) return googleHi;

  // 2. High-quality Apple / System Hindi (Lekha, Neel, etc.)
  const systemHi = allVoices.find((v) => {
    const n = (v.name || '').toLowerCase();
    const l = (v.lang || '').toLowerCase().replace('_', '-');
    return l.startsWith('hi') || n.includes('hindi') || n.includes('हिन्दी');
  });
  if (systemHi) return systemHi;

  return null;
}

// Find the best available UK English voice (Google UK, Apple Daniel/Serena/Oliver, en-GB)
function getUKEnglishVoice() {
  if (!window.speechSynthesis) return null;
  const allVoices = window.speechSynthesis.getVoices() || [];

  const nonLegacy = allVoices.filter((v) => {
    const n = (v.name || '').toLowerCase();
    const u = (v.voiceURI || '').toLowerCase();
    return !((n.includes('microsoft') || u.includes('microsoft')) &&
      (n.includes('david') || n.includes('zira') || n.includes('mark') || n.includes('ravi') || n.includes('heera')));
  });

  // 1. Google UK English Female / Male
  const googleUK = nonLegacy.find((v) => {
    const n = (v.name || '').toLowerCase();
    const l = (v.lang || '').toLowerCase().replace('_', '-');
    return n.includes('google') && (l === 'en-gb' || n.includes('uk english') || n.includes('united kingdom'));
  });
  if (googleUK) return googleUK;

  // 2. Apple / System UK English (Daniel, Serena, Oliver, Kate, Arthur, Martha, Stephanie)
  const appleUK = nonLegacy.find((v) => {
    const n = (v.name || '').toLowerCase();
    const l = (v.lang || '').toLowerCase().replace('_', '-');
    return l === 'en-gb' || n.includes('uk english') || n.includes('united kingdom') || n.includes('british');
  });
  if (appleUK) return appleUK;

  // 3. Any en-GB voice
  const anyGB = allVoices.find((v) => {
    const l = (v.lang || '').toLowerCase().replace('_', '-');
    const n = (v.name || '').toLowerCase();
    return l === 'en-gb' || n.includes('united kingdom') || n.includes('uk english');
  });
  if (anyGB) return anyGB;

  // 4. Fallback: Google English or any clean English voice
  return nonLegacy.find((v) => (v.lang || '').toLowerCase().startsWith('en')) || null;
}

function speakHindiFallback(speechText) {
  const hiVoice = getHindiVoice();
  speakWithUtterance(speechText, hiVoice, 'hi-IN');
}

function speakUKEnglishFallback(speechText) {
  const ukVoice = getUKEnglishVoice();
  speakWithUtterance(speechText, ukVoice, 'en-GB');
}

// Strictly populates ONLY 2 language choices: Hindi and UK English
function populateVoiceList() {
  if (!voiceSelect) return;
  voiceSelect.innerHTML = '';

  const optHindi = document.createElement('option');
  optHindi.value = 'hindi';
  optHindi.textContent = '✨ Hindi';

  const optUK = document.createElement('option');
  optUK.value = 'uk_english';
  optUK.textContent = '✨ UK English';

  voiceSelect.appendChild(optHindi);
  voiceSelect.appendChild(optUK);

  const savedLang = localStorage.getItem('studybuddy_voice_lang');
  if (savedLang === 'uk_english' || savedLang === 'hindi') {
    selectedVoiceName = savedLang;
  } else {
    selectedVoiceName = 'hindi';
  }
  voiceSelect.value = selectedVoiceName;
}

if (voiceSelect) {
  voiceSelect.addEventListener('change', (e) => {
    selectedVoiceName = e.target.value;
    localStorage.setItem('studybuddy_voice_lang', selectedVoiceName);
  });
}

function pickVoice() {
  if (selectedVoiceName === 'uk_english') {
    return getUKEnglishVoice();
  }
  return getHindiVoice();
}

if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    populateVoiceList();
  };
  populateVoiceList();
}

// ---------- Real-Time Lip-Sync & Robot Visual States ----------
const VISAME_SHAPES = {
  REST: { d: "M -16 0 Q 0 3 16 0 Q 0 1 -16 0 Z", bg: "M -16 0 Q 0 3 16 0 Q 0 1 -16 0 Z", tongue: 0 },
  A_O: { d: "M -12 -5 Q 0 -13 12 -5 Q 0 13 -12 -5 Z", bg: "M -13 -6 Q 0 -14 13 -6 Q 0 15 -13 -6 Z", tongue: 0.8 },
  E_I: { d: "M -18 -2 Q 0 -6 18 -2 Q 0 8 -18 -2 Z", bg: "M -19 -3 Q 0 -7 19 -3 Q 0 9 -19 -3 Z", tongue: 0.6 },
  U: { d: "M -8 -4 Q 0 -10 8 -4 Q 0 10 -8 -4 Z", bg: "M -9 -5 Q 0 -11 9 -5 Q 0 11 -9 -5 Z", tongue: 0.4 },
  CONSONANT: { d: "M -14 -1 Q 0 -4 14 -1 Q 0 4 -14 -1 Z", bg: "M -15 -2 Q 0 -5 15 -2 Q 0 5 -15 -2 Z", tongue: 0 }
};

function setViseme(shapeKey) {
  const mouthPath = document.getElementById('robotMouth');
  const mouthBg = document.getElementById('robotMouthBg');
  const tongue = document.getElementById('robotMouthTongue');
  if (!mouthPath) return;

  const target = VISAME_SHAPES[shapeKey] || VISAME_SHAPES.REST;
  mouthPath.setAttribute('d', target.d);
  if (mouthBg) mouthBg.setAttribute('d', target.bg);
  if (tongue) tongue.style.opacity = target.tongue;
}

function getVisemeForWord(word) {
  if (!word) return 'REST';
  const w = word.toLowerCase();
  if (/[ao]/i.test(w)) return 'A_O';
  if (/[ei]/i.test(w)) return 'E_I';
  if (/[uw]/i.test(w) || w.includes('oo')) return 'U';
  return 'CONSONANT';
}

function setTalking(isTalking) {
  if (robotEl) {
    robotEl.classList.toggle('talking', isTalking);
  }
  if (!isTalking) {
    stopLipSync();
  }
}

function setThinking(isThinking) {
  if (robotEl) {
    robotEl.classList.toggle('thinking', isThinking);
  }
}

function stopLipSync() {
  if (lipSyncAnimationId) {
    cancelAnimationFrame(lipSyncAnimationId);
    lipSyncAnimationId = null;
  }
  if (visemeTimer) {
    clearTimeout(visemeTimer);
    visemeTimer = null;
  }
  setViseme('REST');
}

function speakWithUtterance(speechText, chosenVoice = null, fallbackLang = 'en-GB') {
  if (!voiceEnabled || !window.speechSynthesis) return;

  if (window.speechSynthesis) window.speechSynthesis.cancel();
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  stopLipSync();

  const utterance = new SpeechSynthesisUtterance(speechText);
  if (chosenVoice) {
    utterance.voice = chosenVoice;
    utterance.lang = chosenVoice.lang || fallbackLang;
  } else {
    // If chosenVoice is null, prevent browser from using a random non-English system voice!
    const anyEnglish = (window.speechSynthesis.getVoices() || []).find((v) => (v.lang || '').toLowerCase().startsWith('en'));
    if (anyEnglish && fallbackLang.toLowerCase().startsWith('en')) {
      utterance.voice = anyEnglish;
      utterance.lang = anyEnglish.lang;
    } else {
      utterance.lang = fallbackLang;
    }
  }

  utterance.rate = 0.94;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;

  utterance.onboundary = (event) => {
    if (event.name === 'word') {
      const currentWord = speechText.substring(event.charIndex, event.charIndex + (event.charLength || 4));
      const viseme = getVisemeForWord(currentWord);
      setViseme(viseme);

      if (visemeTimer) clearTimeout(visemeTimer);
      visemeTimer = setTimeout(() => {
        if (window.speechSynthesis && window.speechSynthesis.speaking) {
          setViseme('CONSONANT');
        }
      }, 130);
    }
  };

  utterance.onstart = () => {
    greetingSpoken = true;
    setTalking(true);
    let startTime = performance.now();
    function syncLoop(now) {
      if (!window.speechSynthesis || !window.speechSynthesis.speaking) {
        setTalking(false);
        return;
      }
      let elapsed = now - startTime;
      let cycle = Math.floor(elapsed / 140) % 4;
      let cycleVisemes = ['A_O', 'E_I', 'CONSONANT', 'U'];
      if (!visemeTimer) {
        setViseme(cycleVisemes[cycle]);
      }
      lipSyncAnimationId = requestAnimationFrame(syncLoop);
    }
    lipSyncAnimationId = requestAnimationFrame(syncLoop);
  };

  utterance.onend = () => setTalking(false);
  utterance.onerror = (err) => {
    console.warn('SpeechSynthesis error:', err);
    setTalking(false);
  };

  try {
    window.speechSynthesis.resume();
  } catch (e) {}
  window.speechSynthesis.speak(utterance);
}

function speak(rawText) {
  if (!voiceEnabled) return;

  if (window.speechSynthesis) window.speechSynthesis.cancel();
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  stopLipSync();

  const speechText = toSpeechText(rawText);
  if (!speechText) return;

  const isHindiText = /[\u0900-\u097F]/.test(speechText);

  // If user selected UK English
  if (selectedVoiceName === 'uk_english') {
    if (isHindiText) {
      speakServerTTS(speechText, 'hi');
    } else {
      speakServerTTS(speechText, 'uk');
    }
    return;
  }

  // If user selected Hindi
  if (isHindiText) {
    speakServerTTS(speechText, 'hi');
  } else {
    // English text should ALWAYS be spoken with UK English TTS, never with Hindi phonetics!
    speakServerTTS(speechText, 'uk');
  }
}

// Warmup speech synthesis and audio context on user interaction to pass mobile browser autoplay restrictions
let audioContextUnlocked = false;
function unlockAudioContext() {
  if (audioContextUnlocked) return;
  audioContextUnlocked = true;

  if (window.speechSynthesis) {
    try {
      window.speechSynthesis.resume();
      if (!window.speechSynthesis.speaking) {
        const silent = new SpeechSynthesisUtterance('');
        silent.volume = 0;
        window.speechSynthesis.speak(silent);
      }
    } catch (e) {}
  }

  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      const dummyCtx = new AudioContextClass();
      dummyCtx.resume().then(() => {
        if (dummyCtx.state === 'running') dummyCtx.close();
      }).catch(() => {});
    }
  } catch (e) {}
}

// Proactively unlock audio on first touch/click anywhere on page
document.addEventListener('click', unlockAudioContext, { once: true, passive: true });
document.addEventListener('touchstart', unlockAudioContext, { once: true, passive: true });

muteBtn.addEventListener('click', () => {
  voiceEnabled = !voiceEnabled;
  muteIcon.textContent = voiceEnabled ? '\u{1F50A}' : '\u{1F507}';
  if (!voiceEnabled) {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
    setTalking(false);
  } else {
    unlockAudioContext();
  }
});

// ---------- Chat Messages ----------
let lastUserQuestion = '';

function addMessage(text, sender, imageUrl = '', shouldSpeak = true, isAi = false, relatedQuestion = '', detailedAnswer = '') {
  const div = document.createElement('div');
  div.className = `msg ${sender}`;

  if (isAi) {
    const badge = document.createElement('div');
    badge.className = 'ai-tutor-badge';
    badge.innerHTML = '✨ Study Buddy AI Tutor';
    div.appendChild(badge);
  }

  const p = document.createElement('p');
  p.innerHTML = formatText(text);
  div.appendChild(p);

  if (imageUrl && imageUrl.trim()) {
    const img = document.createElement('img');
    img.src = imageUrl.trim();
    img.alt = 'Question diagram';
    img.loading = 'lazy';
    div.appendChild(img);
  }

  // Add "Explain simply" helper chip only on answered QA messages from database
  if (sender === 'bot' && !isAi && relatedQuestion && !text.startsWith('Connection issue') && !text.startsWith('Hi!')) {
    const explainBtn = document.createElement('button');
    explainBtn.type = 'button';
    explainBtn.className = 'explain-chip';
    explainBtn.innerHTML = '💡 Explain simply';
    explainBtn.title = 'View detailed answer from database';
    explainBtn.addEventListener('click', () => {
      unlockAudioContext();
      explainBtn.disabled = true;
      showDetailedDatabaseAnswer(relatedQuestion, detailedAnswer, text);
    });
    div.appendChild(explainBtn);
  }

  messagesEl.appendChild(div);
  scrollToBottom();

  if (sender === 'bot' && shouldSpeak) speak(text);
}

function showDetailedDatabaseAnswer(question, detailedAnswer, basicAnswer) {
  const content = (detailedAnswer && detailedAnswer.trim())
    ? detailedAnswer.trim()
    : basicAnswer;

  const div = document.createElement('div');
  div.className = 'msg bot detailed-answer-msg';

  const badge = document.createElement('div');
  badge.className = 'detailed-badge';
  badge.innerHTML = '💡 Detailed Explanation';
  div.appendChild(badge);

  const p = document.createElement('p');
  p.innerHTML = formatText(content);
  div.appendChild(p);

  messagesEl.appendChild(div);
  scrollToBottom();

  if (voiceEnabled) speak(content);
}

function addSuggestions(suggestions) {
  if (!suggestions || suggestions.length === 0) return;
  const wrap = document.createElement('div');
  wrap.className = 'msg suggestions';
  suggestions.forEach((s) => {
    const btn = document.createElement('button');
    btn.className = 'suggestion-btn';
    btn.innerHTML = formatText(s.question);
    btn.addEventListener('click', () => {
      unlockAudioContext();
      sendQuestion(s.question);
    });
    wrap.appendChild(btn);
  });
  messagesEl.appendChild(wrap);
  scrollToBottom();
}

function addAiFallbackPrompt(question) {
  const wrap = document.createElement('div');
  wrap.className = 'msg suggestions';
  const aiBtn = document.createElement('button');
  aiBtn.type = 'button';
  aiBtn.className = 'ask-ai-btn';
  aiBtn.innerHTML = '🤖 Ask AI Tutor ✨';
  aiBtn.title = 'Ask Study Buddy AI to explain this question';
  aiBtn.addEventListener('click', () => {
    unlockAudioContext();
    aiBtn.disabled = true;
    requestAiExplanation({ question });
  });
  wrap.appendChild(aiBtn);
  messagesEl.appendChild(wrap);
  scrollToBottom();
}

async function requestAiExplanation({ question, answer }) {
  showTyping();
  try {
    const res = await fetch(`${window.location.origin}/api/ask/ai-explain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        answer,
        className: currentClass,
        bookName: currentBook,
        chapterName: currentChapter
      })
    });
    const data = await res.json();
    hideTyping();

    if (data.available && data.explanation) {
      addMessage(data.explanation, 'bot', '', true, true);
    } else {
      addMessage(data.message || 'AI Tutor could not generate a response right now.', 'bot', '', true, true);
    }
  } catch (err) {
    hideTyping();
    addMessage('Could not connect to AI Tutor right now. Please try again.', 'bot');
  }
}

function showTyping() {
  setThinking(true);
  const div = document.createElement('div');
  div.className = 'typing-dots';
  div.id = 'typingIndicator';
  div.innerHTML = '<span></span><span></span><span></span>';
  messagesEl.appendChild(div);
  scrollToBottom();
}

function hideTyping() {
  setThinking(false);
  const el = document.getElementById('typingIndicator');
  if (el) el.remove();
}

function scrollToBottom() {
  messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });
}

async function sendQuestion(question) {
  lastUserQuestion = question;
  addMessage(question, 'user');
  showTyping();

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        className: currentClass,
        bookName: currentBook,
        chapterName: currentChapter
      })
    });
    const data = await res.json();
    hideTyping();

    if (data.answered) {
      addMessage(data.answer, 'bot', data.imageUrl, true, false, question, data.detailedAnswer);
    } else {
      addMessage(data.message || "I couldn't find an exact answer for that. Did you mean one of these?", 'bot');
      addSuggestions(data.suggestions);
      addAiFallbackPrompt(question);
    }
  } catch (err) {
    hideTyping();
    addMessage('Connection issue, please try again.', 'bot');
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const question = input.value.trim();
  if (!question) return;
  unlockAudioContext();
  input.value = '';
  sendQuestion(question);
});

// ---------- Class / Book / Chapter Context Engine ----------
function populateClassDropdown() {
  if (!selectClass) return;
  selectClass.innerHTML = '';

  const classes = Object.keys(hierarchyData);
  if (classes.length === 0) {
    classes.push('Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5');
  }

  classes.forEach((cls) => {
    const opt = document.createElement('option');
    opt.value = cls;
    opt.textContent = cls;
    selectClass.appendChild(opt);
  });

  if (savedClass && classes.includes(savedClass)) {
    selectClass.value = savedClass;
  }
  currentClass = selectClass.value;

  populateBookDropdown();
}

function populateBookDropdown() {
  if (!selectBook) return;
  selectBook.innerHTML = '';

  const selectedCls = selectClass ? selectClass.value : '';
  const booksMap = (hierarchyData && hierarchyData[selectedCls]) || {};
  const books = Object.keys(booksMap);

  if (books.length === 0) {
    books.push('General');
  }

  books.forEach((bk) => {
    const opt = document.createElement('option');
    opt.value = bk;
    opt.textContent = bk;
    selectBook.appendChild(opt);
  });

  if (savedBook && books.includes(savedBook)) {
    selectBook.value = savedBook;
  }
  currentBook = selectBook.value;

  populateChapterDropdown();
}

function populateChapterDropdown() {
  if (!selectChapter) return;
  selectChapter.innerHTML = '';

  const allOpt = document.createElement('option');
  allOpt.value = 'All Chapters';
  allOpt.textContent = 'All Chapters';
  selectChapter.appendChild(allOpt);

  const selectedCls = selectClass ? selectClass.value : '';
  const selectedBk = selectBook ? selectBook.value : '';
  const chaptersList = (hierarchyData && hierarchyData[selectedCls] && hierarchyData[selectedCls][selectedBk]) || [];

  chaptersList.forEach((ch) => {
    if (ch.toLowerCase() !== 'all chapters' && ch.toLowerCase() !== 'general') {
      const opt = document.createElement('option');
      opt.value = ch;
      opt.textContent = ch;
      selectChapter.appendChild(opt);
    }
  });

  if (savedChapter && chaptersList.includes(savedChapter)) {
    selectChapter.value = savedChapter;
  } else {
    selectChapter.value = 'All Chapters';
  }
}

if (selectClass) selectClass.addEventListener('change', populateBookDropdown);
if (selectBook) selectBook.addEventListener('change', populateChapterDropdown);

function updateContextBadge() {
  if (!currentSelectionBadge) return;
  const chapLabel = (currentChapter && currentChapter !== 'All Chapters') ? ` (${currentChapter})` : '';
  currentSelectionBadge.textContent = `${currentClass || 'Class 3'} • ${currentBook || 'Ripples'}${chapLabel}`;
}

if (changeContextBtn) {
  changeContextBtn.addEventListener('click', () => {
    if (contextModal) contextModal.classList.remove('hidden');
  });
}

if (saveContextBtn) {
  saveContextBtn.addEventListener('click', () => {
    unlockAudioContext();
    currentClass = selectClass ? selectClass.value : 'Class 3';
    currentBook = selectBook ? selectBook.value : 'Ripples';
    currentChapter = selectChapter ? selectChapter.value : 'All Chapters';

    savedClass = currentClass;
    savedBook = currentBook;
    savedChapter = currentChapter;
    hasSavedContext = true;

    localStorage.setItem('bot_selected_class', currentClass);
    localStorage.setItem('bot_selected_book', currentBook);
    localStorage.setItem('bot_selected_chapter', currentChapter);

    updateContextBadge();
    if (contextModal) contextModal.classList.add('hidden');

    const chapText = currentChapter !== 'All Chapters' ? ` (${currentChapter})` : '';
    addMessage(`📌 Active Context: **${currentClass} • ${currentBook}**${chapText}. Feel free to ask any question about this book!`, 'bot', '', false);

    // Start welcome message voice immediately when user clicks Start Chatting
    if (!greetingSpoken) {
      speak(INITIAL_GREETING);
    }
  });
}

function playInitialGreeting() {
  if (!greetingSpoken) {
    speak(INITIAL_GREETING);
  }
}

async function initContextEngine() {
  // Populate dropdowns immediately with defaults so modal is NEVER blank
  populateClassDropdown();

  try {
    const res = await fetch(HIERARCHY_API_URL);
    if (res.ok) {
      hierarchyData = await res.json();
      populateClassDropdown();
    }
  } catch (err) {
    console.warn('Could not load hierarchy:', err);
  }

  // Pre-update badge with currently restored/selected values
  updateContextBadge();

  // STOP auto-dismiss: The "Select Class & Book" modal must stay visible
  // so the user can verify/choose and click "Start Chatting 🚀"
  if (contextModal) {
    contextModal.classList.remove('hidden');
  }
}

// Image lightbox handler
function openLightbox(src) {
  if (!imageLightbox || !lightboxImg) return;
  lightboxImg.src = src;
  imageLightbox.classList.remove('hidden');
}

function closeLightbox() {
  if (!imageLightbox) return;
  imageLightbox.classList.add('hidden');
  if (lightboxImg) lightboxImg.src = '';
}

if (closeLightboxBtn) closeLightboxBtn.addEventListener('click', closeLightbox);
if (imageLightbox) {
  imageLightbox.addEventListener('click', (e) => {
    if (e.target === imageLightbox) closeLightbox();
  });
}

if (messagesEl) {
  messagesEl.addEventListener('click', (e) => {
    if (e.target && e.target.tagName === 'IMG') {
      openLightbox(e.target.src);
    }
  });
}

// Start context engine immediately
initContextEngine();

// ==========================================================================
// Practice Worksheet Generator Logic
// ==========================================================================
const worksheetBtn = document.getElementById('worksheetBtn');
const worksheetModal = document.getElementById('worksheetModal');
const worksheetConfigView = document.getElementById('worksheetConfigView');
const worksheetPreviewView = document.getElementById('worksheetPreviewView');
const closeWorksheetConfigBtn = document.getElementById('closeWorksheetConfigBtn');
const closeWorksheetPreviewBtn = document.getElementById('closeWorksheetPreviewBtn');
const worksheetContextDisplay = document.getElementById('worksheetContextDisplay');
const worksheetLoadingSpinner = document.getElementById('worksheetLoadingSpinner');
const worksheetActiveOptions = document.getElementById('worksheetActiveOptions');
const worksheetEmptyNotice = document.getElementById('worksheetEmptyNotice');
const worksheetTotalCount = document.getElementById('worksheetTotalCount');
const worksheetCountInput = document.getElementById('worksheetCountInput');
const worksheetPresetChips = document.getElementById('worksheetPresetChips');
const worksheetIncludeAnswers = document.getElementById('worksheetIncludeAnswers');
const generateWorksheetBtn = document.getElementById('generateWorksheetBtn');
const worksheetBackBtn = document.getElementById('worksheetBackBtn');
const worksheetShuffleAllBtn = document.getElementById('worksheetShuffleAllBtn');
const worksheetToggleAnswerKeyBtn = document.getElementById('worksheetToggleAnswerKeyBtn');
const worksheetPrintBtn = document.getElementById('worksheetPrintBtn');
const worksheetToast = document.getElementById('worksheetToast');
const printableWorksheetPaper = document.getElementById('printableWorksheetPaper');
const printSubTitle = document.getElementById('printSubTitle');
const printChapter = document.getElementById('printChapter');
const printTotalQuestions = document.getElementById('printTotalQuestions');
const worksheetPaperQuestions = document.getElementById('worksheetPaperQuestions');

let allPoolQuestions = [];
let currentWorksheetQuestions = [];
let includeAnswersState = false;
let toastTimeout = null;

function showWorksheetToast(msg) {
  if (!worksheetToast) return;
  worksheetToast.textContent = msg;
  worksheetToast.classList.remove('hidden');
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    worksheetToast.classList.add('hidden');
  }, 2800);
}

function closeWorksheetModal() {
  if (worksheetModal) worksheetModal.classList.add('hidden');
  if (worksheetToast) worksheetToast.classList.add('hidden');
}

async function openWorksheetModal() {
  unlockAudioContext();
  if (!worksheetModal) return;

  worksheetModal.classList.remove('hidden');
  if (worksheetConfigView) worksheetConfigView.classList.remove('hidden');
  if (worksheetPreviewView) worksheetPreviewView.classList.add('hidden');
  if (worksheetLoadingSpinner) worksheetLoadingSpinner.classList.remove('hidden');
  if (worksheetActiveOptions) worksheetActiveOptions.classList.add('hidden');
  if (worksheetEmptyNotice) worksheetEmptyNotice.classList.add('hidden');

  const chapLabel = (currentChapter && currentChapter !== 'All Chapters') ? ` (${currentChapter})` : '';
  if (worksheetContextDisplay) {
    worksheetContextDisplay.textContent = `${currentClass || 'Class 3'} • ${currentBook || 'Ripples'}${chapLabel}`;
  }

  try {
    const url = `${API_URL}/worksheet-questions?className=${encodeURIComponent(currentClass || 'Class 3')}&bookName=${encodeURIComponent(currentBook || 'Ripples')}&chapterName=${encodeURIComponent(currentChapter || 'All Chapters')}`;
    const res = await fetch(url);
    const data = await res.json();

    if (worksheetLoadingSpinner) worksheetLoadingSpinner.classList.add('hidden');

    allPoolQuestions = data.questions || [];
    const total = allPoolQuestions.length;
    if (worksheetTotalCount) worksheetTotalCount.textContent = total;

    if (total === 0) {
      if (worksheetEmptyNotice) worksheetEmptyNotice.classList.remove('hidden');
      if (worksheetActiveOptions) worksheetActiveOptions.classList.add('hidden');
    } else {
      if (worksheetEmptyNotice) worksheetEmptyNotice.classList.add('hidden');
      if (worksheetActiveOptions) worksheetActiveOptions.classList.remove('hidden');
      if (worksheetCountInput) {
        worksheetCountInput.max = total;
        worksheetCountInput.value = Math.min(5, total);
      }
      if (worksheetPresetChips) {
        worksheetPresetChips.querySelectorAll('.preset-chip').forEach((chip) => {
          const count = chip.dataset.count;
          chip.classList.toggle('active', count === '5' || (total < 5 && count === 'all'));
        });
      }
    }
  } catch (err) {
    console.warn('Failed to fetch worksheet questions:', err);
    if (worksheetLoadingSpinner) worksheetLoadingSpinner.classList.add('hidden');
    if (worksheetEmptyNotice) worksheetEmptyNotice.classList.remove('hidden');
  }
}

function handlePresetClick(e) {
  const btn = e.target.closest('.preset-chip');
  if (!btn || !worksheetCountInput) return;
  const count = btn.dataset.count;
  const total = allPoolQuestions.length;

  if (count === 'all') {
    worksheetCountInput.value = total;
  } else {
    worksheetCountInput.value = Math.min(parseInt(count, 10), total);
  }

  worksheetPresetChips.querySelectorAll('.preset-chip').forEach((c) => c.classList.remove('active'));
  btn.classList.add('active');
}

function generateWorksheet() {
  if (!allPoolQuestions || allPoolQuestions.length === 0) return;
  const desiredCount = Math.max(1, Math.min(parseInt(worksheetCountInput.value, 10) || 5, allPoolQuestions.length));
  includeAnswersState = worksheetIncludeAnswers ? worksheetIncludeAnswers.checked : false;

  // Shuffle and pick requested count
  const shuffled = [...allPoolQuestions].sort(() => 0.5 - Math.random());
  currentWorksheetQuestions = shuffled.slice(0, desiredCount);

  renderWorksheetPaper();

  if (worksheetConfigView) worksheetConfigView.classList.add('hidden');
  if (worksheetPreviewView) worksheetPreviewView.classList.remove('hidden');
}

function extractQuestionImage(rawQuestion) {
  if (!rawQuestion) return { text: '', imageUrl: '' };

  // 1. Markdown image syntax ![alt](url)
  const mdMatch = rawQuestion.match(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+|\/[^\s)]+|[^\s)]+\.(?:png|jpg|jpeg|gif|webp|svg))\)/i);
  if (mdMatch) {
    return {
      text: rawQuestion.replace(mdMatch[0], '').trim(),
      imageUrl: mdMatch[2].trim()
    };
  }

  // 2. Full HTTP/HTTPS image URL in text
  const urlMatch = rawQuestion.match(/(https?:\/\/[^\s<>]+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?[^\s<>]*)?)/i);
  if (urlMatch) {
    return {
      text: rawQuestion.replace(urlMatch[0], '').trim(),
      imageUrl: urlMatch[1].trim()
    };
  }

  // 3. Image filename like Que1.png or diagram.jpg
  const fileMatch = rawQuestion.match(/\b([a-zA-Z0-9_\-\/]+\.(?:png|jpg|jpeg|gif|webp|svg))\b/i);
  if (fileMatch) {
    return {
      text: rawQuestion.replace(fileMatch[0], '').trim(),
      imageUrl: fileMatch[1].trim()
    };
  }

  return { text: rawQuestion, imageUrl: '' };
}

function renderWorksheetPaper() {
  if (!worksheetPaperQuestions) return;

  const chapLabel = (currentChapter && currentChapter !== 'All Chapters') ? currentChapter : 'All Chapters';
  if (printSubTitle) printSubTitle.textContent = `${currentClass || 'Class 3'} • ${currentBook || 'Ripples'}`;
  if (printChapter) printChapter.textContent = chapLabel;
  if (printTotalQuestions) printTotalQuestions.textContent = currentWorksheetQuestions.length;

  worksheetPaperQuestions.innerHTML = '';

  currentWorksheetQuestions.forEach((q, idx) => {
    const card = document.createElement('div');
    card.className = 'worksheet-q-item';
    card.dataset.id = q._id;

    // Question image: ONLY if the question itself contains an image link or explicit questionImageUrl
    let questionImgUrl = (q.questionImageUrl && q.questionImageUrl.trim()) ? q.questionImageUrl.trim() : '';
    let displayText = q.question;

    if (!questionImgUrl) {
      const parsed = extractQuestionImage(q.question);
      if (parsed.imageUrl) {
        questionImgUrl = parsed.imageUrl;
        displayText = parsed.text || q.question;
      }
    }

    const questionImgHtml = questionImgUrl ? `
      <div class="worksheet-q-img-wrap">
        <img src="${questionImgUrl}" alt="Question Diagram" class="worksheet-q-img" loading="lazy" />
      </div>
    ` : '';

    // Answer image: q.imageUrl belongs to the answer, so it ONLY renders when answer key is enabled
    const answerImgHtml = (q.imageUrl && q.imageUrl.trim()) ? `
      <div class="worksheet-ans-img-wrap">
        <img src="${q.imageUrl.trim()}" alt="Answer Diagram" class="worksheet-ans-img" loading="lazy" />
      </div>
    ` : '';

    const answerHtml = includeAnswersState ? `
      <div class="worksheet-ans-box">
        <div class="worksheet-ans-text">
          <strong>Ans:</strong> ${formatText(q.answer)}
        </div>
        ${answerImgHtml}
      </div>
    ` : `
      <div class="ruled-lines">
        <div class="ruled-line"><span class="ruled-prefix">Ans.</span></div>
        <div class="ruled-line"></div>
      </div>
    `;

    card.innerHTML = `
      <div class="q-header-row">
        <div class="q-num-text">
          <span class="q-number">Q${idx + 1}.</span>
          <span class="q-text">${formatText(displayText)}</span>
        </div>
        <div class="q-actions-row no-print">
          <button type="button" class="q-replace-btn" data-index="${idx}" title="Replace with another unused question from chapter">
            🔄 Replace
          </button>
        </div>
      </div>
      ${questionImgHtml}
      ${answerHtml}
    `;

    const replaceBtn = card.querySelector('.q-replace-btn');
    if (replaceBtn) {
      replaceBtn.addEventListener('click', () => {
        replaceQuestionAtIndex(idx);
      });
    }

    worksheetPaperQuestions.appendChild(card);
  });
}

function replaceQuestionAtIndex(index) {
  // Current question IDs in worksheet
  const currentIds = new Set(currentWorksheetQuestions.map((q) => q._id));
  // Available pool of questions NOT in current worksheet
  const unusedPool = allPoolQuestions.filter((q) => !currentIds.has(q._id));

  if (unusedPool.length === 0) {
    showWorksheetToast(`⚠️ No more unused questions in this chapter! All ${allPoolQuestions.length} are in use.`);
    return;
  }

  // Pick random unused question
  const replacement = unusedPool[Math.floor(Math.random() * unusedPool.length)];
  currentWorksheetQuestions[index] = replacement;

  renderWorksheetPaper();
  showWorksheetToast(`✅ Question #${index + 1} replaced! (${unusedPool.length - 1} unused remaining)`);
}

function shuffleAllQuestions() {
  if (allPoolQuestions.length === 0) return;
  const count = currentWorksheetQuestions.length;
  const shuffled = [...allPoolQuestions].sort(() => 0.5 - Math.random());
  currentWorksheetQuestions = shuffled.slice(0, count);
  renderWorksheetPaper();
  showWorksheetToast('🔀 All questions reshuffled!');
}

function toggleAnswerKey() {
  includeAnswersState = !includeAnswersState;
  renderWorksheetPaper();
  showWorksheetToast(includeAnswersState ? '💡 Answer key shown (Teacher Copy)' : '📝 Answer key hidden (Student Practice Copy)');
}

if (worksheetBtn) worksheetBtn.addEventListener('click', openWorksheetModal);
if (closeWorksheetConfigBtn) closeWorksheetConfigBtn.addEventListener('click', closeWorksheetModal);
if (closeWorksheetPreviewBtn) closeWorksheetPreviewBtn.addEventListener('click', closeWorksheetModal);
if (worksheetPresetChips) worksheetPresetChips.addEventListener('click', handlePresetClick);
if (generateWorksheetBtn) generateWorksheetBtn.addEventListener('click', generateWorksheet);
if (worksheetBackBtn) {
  worksheetBackBtn.addEventListener('click', () => {
    if (worksheetPreviewView) worksheetPreviewView.classList.add('hidden');
    if (worksheetConfigView) worksheetConfigView.classList.remove('hidden');
  });
}
if (worksheetShuffleAllBtn) worksheetShuffleAllBtn.addEventListener('click', shuffleAllQuestions);
if (worksheetToggleAnswerKeyBtn) worksheetToggleAnswerKeyBtn.addEventListener('click', toggleAnswerKey);
if (worksheetPrintBtn) {
  worksheetPrintBtn.addEventListener('click', () => {
    window.print();
  });
}

// Close worksheet modal when clicking outside card or pressing Escape
if (worksheetModal) {
  worksheetModal.addEventListener('click', (e) => {
    if (e.target === worksheetModal) closeWorksheetModal();
  });
}
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && worksheetModal && !worksheetModal.classList.contains('hidden')) {
    closeWorksheetModal();
  }
});

// ==========================================================================
// Speech-to-Text Voice Input (Mic) Engine
// ==========================================================================
const micBtn = document.getElementById('micBtn');
let isSpeechListening = false;
let speechRecognizer = null;

function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    if (micBtn) {
      micBtn.addEventListener('click', () => {
        alert('Voice speech recognition is not supported in this browser. Please try Google Chrome or Microsoft Edge.');
      });
    }
    return;
  }

  try {
    speechRecognizer = new SpeechRecognition();
    speechRecognizer.continuous = false;
    speechRecognizer.interimResults = false;

    speechRecognizer.onstart = () => {
      isSpeechListening = true;
      if (micBtn) micBtn.classList.add('is-recording');
      if (robotEl) robotEl.classList.add('listening');
      if (input) input.placeholder = 'Listening... speak your question 🎙️';
      // Stop any active TTS audio
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      if (currentAudio) currentAudio.pause();
      stopLipSync();
      setTalking(false);
    };

    speechRecognizer.onresult = (event) => {
      const transcript = event.results && event.results[0] && event.results[0][0] && event.results[0][0].transcript;
      if (transcript && transcript.trim()) {
        input.value = transcript.trim();
        unlockAudioContext();
        sendQuestion(transcript.trim());
        input.value = '';
      }
    };

    speechRecognizer.onerror = (event) => {
      console.warn('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        alert('Microphone permission was denied. Please allow microphone access in your browser to speak.');
      }
      stopSpeechRecognition();
    };

    speechRecognizer.onend = () => {
      stopSpeechRecognition();
    };

    if (micBtn) {
      micBtn.addEventListener('click', () => {
        unlockAudioContext();
        if (isSpeechListening) {
          speechRecognizer.stop();
          stopSpeechRecognition();
        } else {
          // If server Hindi voice or Indian English is selected, use Indian English / Hindi recognition
          speechRecognizer.lang = (selectedVoiceName.includes('hindi')) ? 'hi-IN' : 'en-IN';
          try {
            speechRecognizer.start();
          } catch (err) {
            console.warn('Speech start error:', err);
          }
        }
      });
    }
  } catch (e) {
    console.warn('Speech recognition initialization error:', e);
  }
}

function stopSpeechRecognition() {
  isSpeechListening = false;
  if (micBtn) micBtn.classList.remove('is-recording');
  if (robotEl) robotEl.classList.remove('listening');
  if (input) input.placeholder = 'Type your question or click mic...';
}

setupSpeechRecognition();

// ==========================================================================
// Interactive Practice Quiz Engine
// ==========================================================================
const quizBtn = document.getElementById('quizBtn');
const quizModal = document.getElementById('quizModal');
const closeQuizBtn = document.getElementById('closeQuizBtn');
const quizContextSubtitle = document.getElementById('quizContextSubtitle');

const quizStartView = document.getElementById('quizStartView');
const quizActiveView = document.getElementById('quizActiveView');
const quizResultView = document.getElementById('quizResultView');

const quizAvailInfo = document.getElementById('quizAvailInfo');
const startQuizRunBtn = document.getElementById('startQuizRunBtn');

const quizProgressBar = document.getElementById('quizProgressBar');
const quizQuestionNumber = document.getElementById('quizQuestionNumber');
const quizScoreBadge = document.getElementById('quizScoreBadge');
const quizQuestionText = document.getElementById('quizQuestionText');
const quizDiagramWrap = document.getElementById('quizDiagramWrap');
const quizDiagramImg = document.getElementById('quizDiagramImg');

const quizOptionsContainer = document.getElementById('quizOptionsContainer');
const quizFlashcardContainer = document.getElementById('quizFlashcardContainer');
const quizRevealBtn = document.getElementById('quizRevealBtn');
const quizRevealedAnswer = document.getElementById('quizRevealedAnswer');
const quizRevealedAnswerText = document.getElementById('quizRevealedAnswerText');
const quizGradeCorrectBtn = document.getElementById('quizGradeCorrectBtn');
const quizGradeReviewBtn = document.getElementById('quizGradeReviewBtn');

const quizFeedbackBox = document.getElementById('quizFeedbackBox');
const quizFeedbackMsg = document.getElementById('quizFeedbackMsg');
const quizNextBtn = document.getElementById('quizNextBtn');

const quizResultHeading = document.getElementById('quizResultHeading');
const quizStarsDisplay = document.getElementById('quizStarsDisplay');
const quizScoreText = document.getElementById('quizScoreText');
const quizEncourageMsg = document.getElementById('quizEncourageMsg');
const quizRestartBtn = document.getElementById('quizRestartBtn');
const quizFinishBtn = document.getElementById('quizFinishBtn');

let currentQuizPool = [];
let quizQuestions = [];
let quizCurrentIndex = 0;
let quizScore = 0;
let quizMode = 'mcq'; // 'mcq' or 'flashcard'

// Mode selection toggle
document.querySelectorAll('.mode-card').forEach((card) => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.mode-card').forEach((c) => c.classList.remove('active'));
    card.classList.add('active');
    quizMode = card.dataset.mode;
  });
});

async function openQuizModal() {
  if (!quizModal) return;
  quizModal.classList.remove('hidden');

  const contextStr = `${currentClass || 'All Classes'} • ${currentBook || 'General'}${currentChapter && currentChapter !== 'All Chapters' ? ` • ${currentChapter}` : ''}`;
  if (quizContextSubtitle) quizContextSubtitle.textContent = contextStr;

  // Show Start View
  if (quizStartView) quizStartView.classList.remove('hidden');
  if (quizActiveView) quizActiveView.classList.add('hidden');
  if (quizResultView) quizResultView.classList.add('hidden');

  if (quizAvailInfo) quizAvailInfo.textContent = 'Fetching questions for this chapter...';
  if (startQuizRunBtn) startQuizRunBtn.disabled = true;

  try {
    const url = new URL(`${window.location.origin}/api/ask/worksheet-questions`);
    if (currentClass) url.searchParams.set('className', currentClass);
    if (currentBook) url.searchParams.set('bookName', currentBook);
    if (currentChapter && currentChapter !== 'All Chapters') url.searchParams.set('chapterName', currentChapter);

    const res = await fetch(url);
    const data = await res.json();
    currentQuizPool = (data.questions || []).filter((q) => q.question && q.answer);

    if (currentQuizPool.length < 2) {
      if (quizAvailInfo) {
        quizAvailInfo.innerHTML = `⚠️ Only <strong>${currentQuizPool.length}</strong> question found for this selection.<br>Please select another Class / Book or add more questions in the admin panel to play the quiz!`;
      }
      if (startQuizRunBtn) startQuizRunBtn.disabled = true;
    } else {
      if (quizAvailInfo) {
        quizAvailInfo.innerHTML = `Found <strong>${currentQuizPool.length}</strong> questions in this chapter.<br>We'll pick up to 5 questions to test your knowledge!`;
      }
      if (startQuizRunBtn) startQuizRunBtn.disabled = false;
    }
  } catch (err) {
    if (quizAvailInfo) quizAvailInfo.textContent = 'Could not load chapter questions. Please try again.';
  }
}

function closeQuizModal() {
  if (quizModal) quizModal.classList.add('hidden');
}

function startQuizRun() {
  if (currentQuizPool.length < 2) return;

  // Shuffle and pick 5 (or pool length)
  const shuffled = [...currentQuizPool].sort(() => 0.5 - Math.random());
  quizQuestions = shuffled.slice(0, Math.min(5, shuffled.length));

  quizCurrentIndex = 0;
  quizScore = 0;

  if (quizStartView) quizStartView.classList.add('hidden');
  if (quizActiveView) quizActiveView.classList.remove('hidden');
  if (quizResultView) quizResultView.classList.add('hidden');

  renderQuizQuestion();
}

function renderQuizQuestion() {
  if (quizCurrentIndex >= quizQuestions.length) {
    finishQuizRun();
    return;
  }

  const q = quizQuestions[quizCurrentIndex];
  const total = quizQuestions.length;

  if (quizProgressBar) {
    quizProgressBar.style.width = `${((quizCurrentIndex + 1) / total) * 100}%`;
  }
  if (quizQuestionNumber) {
    quizQuestionNumber.textContent = `Question ${quizCurrentIndex + 1} of ${total}`;
  }
  if (quizScoreBadge) {
    quizScoreBadge.textContent = `Score: ${quizScore}`;
  }

  if (quizQuestionText) {
    quizQuestionText.innerHTML = formatText(q.question);
  }

  // Diagram check
  const imgUrl = (q.questionImageUrl || q.imageUrl || '').trim();
  if (imgUrl && quizDiagramWrap && quizDiagramImg) {
    quizDiagramImg.src = imgUrl;
    quizDiagramWrap.classList.remove('hidden');
  } else if (quizDiagramWrap) {
    quizDiagramWrap.classList.add('hidden');
  }

  // Hide feedback bar initially
  if (quizFeedbackBox) quizFeedbackBox.classList.add('hidden');

  if (quizMode === 'mcq') {
    if (quizOptionsContainer) quizOptionsContainer.classList.remove('hidden');
    if (quizFlashcardContainer) quizFlashcardContainer.classList.add('hidden');
    renderMcqOptions(q);
  } else {
    if (quizOptionsContainer) quizOptionsContainer.classList.add('hidden');
    if (quizFlashcardContainer) quizFlashcardContainer.classList.remove('hidden');
    renderFlashcardMode(q);
  }
}

function renderMcqOptions(currentQ) {
  if (!quizOptionsContainer) return;
  quizOptionsContainer.innerHTML = '';

  const correctAnswer = currentQ.answer;

  // Gather distractors from other questions in the pool
  const distractors = currentQuizPool
    .filter((q) => q._id !== currentQ._id && q.answer && q.answer !== correctAnswer)
    .map((q) => q.answer);

  // Pick up to 3 distractors
  const shuffledDistractors = [...distractors].sort(() => 0.5 - Math.random()).slice(0, 3);

  // Combine and shuffle choices
  const choices = [correctAnswer, ...shuffledDistractors].sort(() => 0.5 - Math.random());

  choices.forEach((choiceText) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'quiz-option-btn';
    btn.innerHTML = `<span class="choice-bullet">⚪</span> <span class="choice-text">${formatText(choiceText)}</span>`;

    btn.addEventListener('click', () => {
      // Disable all option buttons
      const allBtns = quizOptionsContainer.querySelectorAll('.quiz-option-btn');
      allBtns.forEach((b) => (b.disabled = true));

      const isCorrect = choiceText.trim() === correctAnswer.trim();

      if (isCorrect) {
        btn.classList.add('correct');
        btn.querySelector('.choice-bullet').textContent = '✅';
        quizScore += 1;
        if (quizScoreBadge) quizScoreBadge.textContent = `Score: ${quizScore}`;

        // Mascot happy reaction:
        if (robotEl) {
          const core = document.getElementById('robotCore');
          if (core) core.setAttribute('fill', '#00f5d4');
        }

        if (quizFeedbackMsg) {
          quizFeedbackMsg.className = 'feedback-msg correct';
          quizFeedbackMsg.textContent = '🎉 Brilliant! Correct Answer!';
        }
      } else {
        btn.classList.add('wrong');
        btn.querySelector('.choice-bullet').textContent = '❌';

        // Highlight correct button
        allBtns.forEach((b) => {
          if (b.innerText.includes(correctAnswer.trim())) {
            b.classList.add('correct');
            b.querySelector('.choice-bullet').textContent = '✅';
          }
        });

        if (quizFeedbackMsg) {
          quizFeedbackMsg.className = 'feedback-msg wrong';
          quizFeedbackMsg.textContent = '💡 Good try! The correct answer is highlighted.';
        }
      }

      if (quizFeedbackBox) quizFeedbackBox.classList.remove('hidden');
    });

    quizOptionsContainer.appendChild(btn);
  });
}

function renderFlashcardMode(currentQ) {
  if (quizRevealedAnswer) quizRevealedAnswer.classList.add('hidden');
  if (quizRevealBtn) {
    quizRevealBtn.classList.remove('hidden');
    quizRevealBtn.onclick = () => {
      quizRevealBtn.classList.add('hidden');
      if (quizRevealedAnswerText) quizRevealedAnswerText.innerHTML = formatText(currentQ.answer);
      if (quizRevealedAnswer) quizRevealedAnswer.classList.remove('hidden');
    };
  }

  if (quizGradeCorrectBtn) {
    quizGradeCorrectBtn.onclick = () => {
      quizScore += 1;
      if (quizScoreBadge) quizScoreBadge.textContent = `Score: ${quizScore}`;
      advanceQuiz();
    };
  }

  if (quizGradeReviewBtn) {
    quizGradeReviewBtn.onclick = () => {
      advanceQuiz();
    };
  }
}

function advanceQuiz() {
  quizCurrentIndex += 1;
  renderQuizQuestion();
}

if (quizNextBtn) {
  quizNextBtn.addEventListener('click', () => advanceQuiz());
}

function finishQuizRun() {
  if (quizActiveView) quizActiveView.classList.add('hidden');
  if (quizResultView) quizResultView.classList.remove('hidden');

  const total = quizQuestions.length;
  const pct = total > 0 ? (quizScore / total) * 100 : 0;

  if (quizScoreText) {
    quizScoreText.textContent = `You scored ${quizScore} out of ${total}!`;
  }

  if (pct === 100) {
    if (quizResultHeading) quizResultHeading.textContent = '🎉 Outstanding Performance!';
    if (quizStarsDisplay) quizStarsDisplay.textContent = '⭐⭐⭐';
    if (quizEncourageMsg) quizEncourageMsg.textContent = 'Incredible! You have completely mastered this chapter!';
  } else if (pct >= 60) {
    if (quizResultHeading) quizResultHeading.textContent = '👏 Great Effort!';
    if (quizStarsDisplay) quizStarsDisplay.textContent = '⭐⭐';
    if (quizEncourageMsg) quizEncourageMsg.textContent = 'Well done! A little more revision and you will score 100%!';
  } else {
    if (quizResultHeading) quizResultHeading.textContent = '💪 Good Practice!';
    if (quizStarsDisplay) quizStarsDisplay.textContent = '⭐';
    if (quizEncourageMsg) quizEncourageMsg.textContent = 'Keep practicing! Review the chapter questions and try again.';
  }
}

if (quizBtn) quizBtn.addEventListener('click', openQuizModal);
if (closeQuizBtn) closeQuizBtn.addEventListener('click', closeQuizModal);
if (startQuizRunBtn) startQuizRunBtn.addEventListener('click', startQuizRun);
if (quizRestartBtn) quizRestartBtn.addEventListener('click', startQuizRun);
if (quizFinishBtn) quizFinishBtn.addEventListener('click', closeQuizModal);

// Close on escape key or clicking backdrop
if (quizModal) {
  quizModal.addEventListener('click', (e) => {
    if (e.target === quizModal) closeQuizModal();
  });
}
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && quizModal && !quizModal.classList.contains('hidden')) {
    closeQuizModal();
  }
});

