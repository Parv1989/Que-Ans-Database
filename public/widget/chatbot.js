const API_URL = window.location.origin + '/api/ask';
const TTS_API_URL = window.location.origin + '/api/tts';
const HIERARCHY_API_URL = window.location.origin + '/api/ask/hierarchy';
const PEDAGOGY_API_URL = window.location.origin + '/api/pedagogy';

let currentBookFeatures = {
  lessonPlan: true,
  mindMap: true,
  testPaper: true,
  worksheet: true,
  oralTest: true,
  quiz: true,
  notes: true,
  explainSimply: true,
  voiceTts: true
};

async function fetchAndApplyBookFeatures(cls, bk) {
  try {
    const res = await fetch(`${PEDAGOGY_API_URL}/book-features?className=${encodeURIComponent(cls || 'Class 3')}&bookName=${encodeURIComponent(bk || 'Ripples')}`);
    const data = await res.json();
    if (data && data.features) {
      currentBookFeatures = { ...currentBookFeatures, ...data.features };
    }
  } catch (e) {
    console.warn('Could not fetch book features:', e);
  }

  // Toggle quick tool chips
  const lpB = document.getElementById('lessonPlanBtn');
  const mmB = document.getElementById('mindMapBtn');
  const tpB = document.getElementById('testPaperBtn');
  const wsB = document.getElementById('worksheetBtn');
  const otB = document.getElementById('oralTestBtn');
  const qzB = document.getElementById('quizBtn');
  const ntB = document.getElementById('exportNotesBtn');

  if (lpB) lpB.style.display = currentBookFeatures.lessonPlan !== false ? '' : 'none';
  if (mmB) mmB.style.display = currentBookFeatures.mindMap !== false ? '' : 'none';
  if (tpB) tpB.style.display = currentBookFeatures.testPaper !== false ? '' : 'none';
  if (wsB) wsB.style.display = currentBookFeatures.worksheet !== false ? '' : 'none';
  if (otB) otB.style.display = currentBookFeatures.oralTest !== false ? '' : 'none';
  if (qzB) qzB.style.display = currentBookFeatures.quiz !== false ? '' : 'none';
  if (ntB) ntB.style.display = currentBookFeatures.notes !== false ? '' : 'none';

  // Toggle voice controls
  const vSelect = document.getElementById('voiceSelect');
  const vSpeed = document.getElementById('voiceSpeedSelect');
  const vMute = document.getElementById('muteBtn');
  if (vSelect) vSelect.style.display = currentBookFeatures.voiceTts !== false ? '' : 'none';
  if (vSpeed) vSpeed.style.display = currentBookFeatures.voiceTts !== false ? '' : 'none';
  if (vMute) vMute.style.display = currentBookFeatures.voiceTts !== false ? '' : 'none';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const messagesEl = document.getElementById('messages');
const form = document.getElementById('chatForm');
const input = document.getElementById('chatInput');
const robotEl = document.getElementById('robot');
const muteBtn = document.getElementById('muteBtn');
const muteIcon = document.getElementById('muteIcon');
const voiceSelect = document.getElementById('voiceSelect');
const voiceSpeedSelect = document.getElementById('voiceSpeedSelect');
const themeToggleBtn = document.getElementById('themeToggleBtn');

// Dark Mode Theme State
let isDarkMode = localStorage.getItem('studybuddy_theme') === 'dark';
function applyTheme(dark) {
  if (dark) {
    document.body.classList.add('dark-mode');
    if (themeToggleBtn) {
      themeToggleBtn.textContent = '☀️';
      themeToggleBtn.title = 'Switch to Light Mode';
    }
  } else {
    document.body.classList.remove('dark-mode');
    if (themeToggleBtn) {
      themeToggleBtn.textContent = '🌙';
      themeToggleBtn.title = 'Switch to Dark Mode';
    }
  }
}
applyTheme(isDarkMode);

if (themeToggleBtn) {
  themeToggleBtn.addEventListener('click', () => {
    isDarkMode = !isDarkMode;
    localStorage.setItem('studybuddy_theme', isDarkMode ? 'dark' : 'light');
    applyTheme(isDarkMode);
  });
}

// Context elements
const currentSelectionBadge = document.getElementById('currentSelectionBadge');
const changeContextBtn = document.getElementById('changeContextBtn');
const contextModal = document.getElementById('contextModal');
const selectClass = document.getElementById('selectClass');
const selectBook = document.getElementById('selectBook');
const selectChapter = document.getElementById('selectChapter');
const saveContextBtn = document.getElementById('saveContextBtn');
const closeContextModalBtn = document.getElementById('closeContextModalBtn');
const exportNotesBtn = document.getElementById('exportNotesBtn');

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
let speechSpeed = parseFloat(localStorage.getItem('studybuddy_voice_speed')) || 1.0;
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
  preloadGreetingPromise = fetch(`${TTS_API_URL}?text=${encodeURIComponent(INITIAL_GREETING)}&lang=in`)
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
      audio.playbackRate = speechSpeed;
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
          let cycle = Math.floor(elapsed / (140 / speechSpeed)) % 4;
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
        if (lang === 'in' || lang === 'en-in' || lang === 'uk' || lang === 'en') {
          speakIndianEnglishFallback(speechText);
        } else {
          speakHindiFallback(speechText);
        }
      };

      audio.play().catch((err) => {
        console.warn('Audio play blocked/failed, falling back to speech synthesis:', err);
        setTalking(false);
        if (lang === 'in' || lang === 'en-in' || lang === 'uk' || lang === 'en') {
          speakIndianEnglishFallback(speechText);
        } else {
          speakHindiFallback(speechText);
        }
      });
    }

    playNextAudio();
  } catch (err) {
    console.warn('Server TTS unavailable, falling back to speech synthesis:', err);
    setTalking(false);
    if (lang === 'in' || lang === 'en-in' || lang === 'uk' || lang === 'en') {
      speakIndianEnglishFallback(speechText);
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

// Find the best available Indian English voice (Google en-IN, Edge Natural Indian, Apple Rishi/Veena/Sangeeta, etc.)
function getIndianEnglishVoice() {
  if (!window.speechSynthesis) return null;
  const allVoices = window.speechSynthesis.getVoices() || [];

  const nonLegacy = allVoices.filter((v) => {
    const n = (v.name || '').toLowerCase();
    const u = (v.voiceURI || '').toLowerCase();
    return !((n.includes('microsoft') || u.includes('microsoft')) &&
      !n.includes('natural') && !n.includes('online') &&
      (n.includes('david') || n.includes('zira') || n.includes('mark') || n.includes('ravi') || n.includes('heera')));
  });

  // 1. Google Indian English
  const googleIN = nonLegacy.find((v) => {
    const n = (v.name || '').toLowerCase();
    const l = (v.lang || '').toLowerCase().replace('_', '-');
    return n.includes('google') && (l === 'en-in' || n.includes('india'));
  });
  if (googleIN) return googleIN;

  // 2. Microsoft Natural / Online Indian English (Edge)
  const edgeNaturalIN = nonLegacy.find((v) => {
    const n = (v.name || '').toLowerCase();
    const l = (v.lang || '').toLowerCase().replace('_', '-');
    return (n.includes('natural') || n.includes('online')) && (l === 'en-in' || n.includes('india'));
  });
  if (edgeNaturalIN) return edgeNaturalIN;

  // 3. Apple Indian English (Rishi, Veena, Sangeeta, Isha, etc.)
  const appleIN = nonLegacy.find((v) => {
    const n = (v.name || '').toLowerCase();
    const l = (v.lang || '').toLowerCase().replace('_', '-');
    return l === 'en-in' || n.includes('india') || n.includes('rishi') || n.includes('veena') || n.includes('sangeeta') || n.includes('isha');
  });
  if (appleIN) return appleIN;

  // 4. Any en-IN voice
  const anyIN = allVoices.find((v) => {
    const l = (v.lang || '').toLowerCase().replace('_', '-');
    const n = (v.name || '').toLowerCase();
    return l === 'en-in' || n.includes('india');
  });
  if (anyIN) return anyIN;

  // 5. Fallback: Any clean English voice
  return nonLegacy.find((v) => (v.lang || '').toLowerCase().startsWith('en')) || null;
}

// Backwards compatibility alias
const getUKEnglishVoice = getIndianEnglishVoice;

function speakHindiFallback(speechText) {
  const hiVoice = getHindiVoice();
  speakWithUtterance(speechText, hiVoice, 'hi-IN');
}

function speakIndianEnglishFallback(speechText) {
  const inVoice = getIndianEnglishVoice();
  speakWithUtterance(speechText, inVoice, 'en-IN');
}

// Backwards compatibility alias
const speakUKEnglishFallback = speakIndianEnglishFallback;

// Strictly populates ONLY 2 language choices: Hindi and Indian English
function populateVoiceList() {
  if (!voiceSelect) return;
  voiceSelect.innerHTML = '';

  const optHindi = document.createElement('option');
  optHindi.value = 'hindi';
  optHindi.textContent = '✨ Hindi';

  const optIndian = document.createElement('option');
  optIndian.value = 'indian_english';
  optIndian.textContent = '✨ Indian English';

  voiceSelect.appendChild(optHindi);
  voiceSelect.appendChild(optIndian);

  const savedLang = localStorage.getItem('studybuddy_voice_lang');
  if (savedLang === 'indian_english' || savedLang === 'hindi') {
    selectedVoiceName = savedLang;
  } else if (savedLang === 'uk_english') {
    selectedVoiceName = 'indian_english';
    localStorage.setItem('studybuddy_voice_lang', 'indian_english');
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

if (voiceSpeedSelect) {
  voiceSpeedSelect.value = String(speechSpeed);
  voiceSpeedSelect.addEventListener('change', (e) => {
    speechSpeed = parseFloat(e.target.value) || 1.0;
    localStorage.setItem('studybuddy_voice_speed', speechSpeed);
    if (currentAudio) {
      currentAudio.playbackRate = speechSpeed;
    }
  });
}

function pickVoice() {
  if (selectedVoiceName === 'indian_english' || selectedVoiceName === 'uk_english') {
    return getIndianEnglishVoice();
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

function speakWithUtterance(speechText, chosenVoice = null, fallbackLang = 'en-IN') {
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

  utterance.rate = Math.max(0.6, Math.min(1.6, 0.94 * speechSpeed));
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
      }, Math.max(80, 130 / speechSpeed));
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
      let cycle = Math.floor(elapsed / (140 / speechSpeed)) % 4;
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
  if (!voiceEnabled || currentBookFeatures.voiceTts === false) return;

  if (window.speechSynthesis) window.speechSynthesis.cancel();
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  stopLipSync();

  const speechText = toSpeechText(rawText);
  if (!speechText) return;

  const isHindiText = /[\u0900-\u097F]/.test(speechText);

  // If user selected Indian English
  if (selectedVoiceName === 'indian_english' || selectedVoiceName === 'uk_english') {
    if (isHindiText) {
      speakServerTTS(speechText, 'hi');
    } else {
      speakServerTTS(speechText, 'in');
    }
    return;
  }

  // If user selected Hindi
  if (isHindiText) {
    speakServerTTS(speechText, 'hi');
  } else {
    // English text should ALWAYS be spoken with Indian English TTS, never with Hindi phonetics!
    speakServerTTS(speechText, 'in');
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

function addMessage(text, sender, imageUrl = '', shouldSpeak = true, isAi = false, relatedQuestion = '', detailedAnswer = '', isRealAnswer = false) {
  const div = document.createElement('div');
  div.className = `msg ${sender}`;

  if (isRealAnswer && sender === 'bot') {
    div.dataset.isAnswer = "true";
    div.dataset.question = relatedQuestion || lastUserQuestion || '';
    div.dataset.isAi = isAi ? "true" : "false";
  } else {
    div.dataset.isAnswer = "false";
  }

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
    img.onload = () => scrollToBottom(true);
    div.appendChild(img);
  }

  // Add "Explain simply" helper chip only on answered QA messages from database
  if (sender === 'bot' && !isAi && relatedQuestion && !text.startsWith('Connection issue') && !text.startsWith('Hi!') && currentBookFeatures.explainSimply !== false) {
    const explainWrap = document.createElement('div');
    explainWrap.className = 'explain-wrap';

    const explainBtn = document.createElement('button');
    explainBtn.type = 'button';
    explainBtn.className = 'explain-chip';
    explainBtn.innerHTML = '💡 Explain simply';
    explainBtn.title = 'View explained answer for this question';

    let explanationBox = null;

    const renderExplanation = (content) => {
      if (!explanationBox) {
        explanationBox = document.createElement('div');
        explanationBox.className = 'inline-explanation-box';

        const badge = document.createElement('div');
        badge.className = 'detailed-badge';
        badge.innerHTML = '💡 Explained Answer';
        explanationBox.appendChild(badge);

        const expP = document.createElement('p');
        expP.className = 'explained-text';
        expP.innerHTML = formatText(content);
        explanationBox.appendChild(expP);

        div.appendChild(explanationBox);
      } else {
        explanationBox.classList.remove('hidden');
      }

      explainBtn.classList.add('active');
      explainBtn.innerHTML = '💡 Hide explanation';
      div.dataset.detailedText = content;
      scrollToBottom();
      if (voiceEnabled) speak(content);
    };

    explainBtn.addEventListener('click', () => {
      unlockAudioContext();

      if (explanationBox && !explanationBox.classList.contains('hidden')) {
        explanationBox.classList.add('hidden');
        explainBtn.classList.remove('active');
        explainBtn.innerHTML = '💡 Explain simply';
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        if (currentAudio) currentAudio.pause();
        setTalking(false);
        return;
      }

      if (explanationBox && explanationBox.classList.contains('hidden')) {
        const content = (detailedAnswer && detailedAnswer.trim())
          ? detailedAnswer.trim()
          : (div.dataset.detailedText || text);
        renderExplanation(content);
        return;
      }

      // Check if detailedAnswer is present in database
      if (detailedAnswer && detailedAnswer.trim()) {
        renderExplanation(detailedAnswer.trim());
      } else {
        // Fallback to AI Tutor explanation if detailed answer not yet in DB
        explainBtn.disabled = true;
        explainBtn.innerHTML = '⏳ Explaining simply...';
        fetch(`${window.location.origin}/api/ask/ai-explain`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: relatedQuestion,
            answer: text,
            className: currentClass,
            bookName: currentBook,
            chapterName: currentChapter
          })
        })
          .then((res) => res.json())
          .then((data) => {
            explainBtn.disabled = false;
            const content = (data && data.explanation) ? data.explanation : text;
            renderExplanation(content);
          })
          .catch(() => {
            explainBtn.disabled = false;
            renderExplanation(text);
          });
      }
    });

    explainWrap.appendChild(explainBtn);
    div.appendChild(explainWrap);
  }

  messagesEl.appendChild(div);
  scrollToBottom();

  if (sender === 'bot' && shouldSpeak) speak(text);
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
      addMessage(data.explanation, 'bot', '', true, true, question, '', true);
    } else {
      addMessage(data.message || 'AI Tutor could not generate a response right now.', 'bot', '', true, true, '', '', false);
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

/**
 * Resilient multi-frame auto-scroll to keep newest messages and diagrams fully visible
 */
function scrollToBottom(forceInstant = false) {
  if (!messagesEl) return;
  if (forceInstant) {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  } else {
    messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });
  }
  requestAnimationFrame(() => {
    if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
  });
  setTimeout(() => { if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight; }, 60);
  setTimeout(() => { if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight; }, 180);
  setTimeout(() => { if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight; }, 360);
}

// Auto-scroll observer: automatically scrolls to bottom when child messages or images load
if (messagesEl) {
  const chatScrollObserver = new MutationObserver(() => {
    scrollToBottom();
  });
  chatScrollObserver.observe(messagesEl, { childList: true, subtree: true });
}

window.addEventListener('resize', () => scrollToBottom(true));

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
      addMessage(data.answer, 'bot', data.imageUrl, true, false, question, data.detailedAnswer, true);
    } else {
      addMessage(data.message || "I couldn't find an exact answer for that. Did you mean one of these?", 'bot', '', true, false, '', '', false);
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

// ---------- Export & Print Study Notes ----------
function exportStudyNotes() {
  if (!messagesEl) return;
  const answerElements = messagesEl.querySelectorAll('.msg.bot[data-is-answer="true"]');
  const qaMap = new Map();

  answerElements.forEach((el) => {
    const p = el.querySelector('p');
    const q = el.dataset.question ? el.dataset.question.trim() : '';
    if (p && q) {
      const ans = p.innerText.trim();
      // Ensure only real answers are included (no fallback/connection error strings)
      if (
        ans &&
        !ans.includes("couldn't find an exact answer") &&
        !ans.includes("could not find an exact answer") &&
        !ans.includes("I couldn't find an answer") &&
        !ans.startsWith('Hi!') &&
        !ans.startsWith('Connection issue') &&
        !ans.startsWith('Could not connect')
      ) {
        qaMap.set(q.toLowerCase(), {
          question: q,
          answer: ans,
          isAi: el.dataset.isAi === 'true',
          imageUrl: el.querySelector('img') ? el.querySelector('img').src : ''
        });
      }
    }
  });

  const qaPairs = Array.from(qaMap.values());

  if (qaPairs.length === 0) {
    alert('Abhi tak chat me koi verified answer nahi mila hai. Pehle sawaalo ke jawab prapt karein (database ya AI Tutor se), fir notes export karein!');
    return;
  }

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to print/save your study notes!');
    return;
  }

  const schoolName = localStorage.getItem('studybuddy_worksheet_school') || '';
  const now = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const chapLabel = (currentChapter && currentChapter !== 'All Chapters') ? ` • Chapter: ${currentChapter}` : '';

  let itemsHtml = '';
  qaPairs.forEach((item, idx) => {
    itemsHtml += `
      <div class="note-card">
        <div class="q-title"><span class="q-num">Q${idx + 1}.</span> ${formatText(item.question)}</div>
        <div class="a-body"><span class="a-tag">Answer:</span> ${formatText(item.answer)}</div>
        ${item.isAi ? `<div class="tag-ai">✨ Explained by Study Buddy AI Tutor</div>` : `<div class="tag-db">📚 Verified from Textbook</div>`}
        ${item.imageUrl ? `<div class="diag-wrap"><img src="${item.imageUrl}" alt="Diagram" /></div>` : ''}
      </div>
    `;
  });

  printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Study Notes - ${currentBook || 'Study Buddy'}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; padding: 2rem; color: #222; margin: 0; background: #fff; }
    .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 1rem; margin-bottom: 1.5rem; }
    .school-name { font-size: 1.3rem; font-weight: 800; text-transform: uppercase; color: #111; margin-bottom: 0.2rem; }
    .title { font-size: 1.5rem; font-weight: 800; text-transform: uppercase; margin: 0; color: #2b3a8c; }
    .sub { font-size: 0.95rem; color: #555; margin-top: 0.3rem; font-weight: 600; }
    .meta-bar { display: flex; justify-content: space-between; font-size: 0.85rem; color: #666; margin-top: 0.8rem; border-top: 1px dashed #ccc; padding-top: 0.5rem; }
    .note-card { margin-bottom: 1.2rem; padding: 0.9rem 1.1rem; border-left: 4px solid #4ea5f5; background: #f8faff; border-radius: 0 8px 8px 0; page-break-inside: avoid; }
    .q-title { font-size: 1rem; font-weight: 700; color: #1a2540; margin-bottom: 0.4rem; }
    .q-num { color: #2b82db; }
    .a-body { font-size: 0.92rem; color: #2b3040; line-height: 1.5; }
    .a-tag { font-weight: 700; color: #2e7d32; }
    .diag-wrap { margin-top: 0.6rem; text-align: center; }
    .diag-wrap img { max-width: 280px; max-height: 200px; border-radius: 6px; border: 1px solid #ddd; }
    .footer { text-align: center; margin-top: 2rem; font-size: 0.8rem; color: #888; border-top: 1px solid #eee; padding-top: 0.8rem; }
    @media print {
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="header">
    ${schoolName ? `<div class="school-name">${schoolName}</div>` : ''}
    <h1 class="title">My Study Revision Notes</h1>
    <div class="sub">${currentClass || 'Class 3'} • ${currentBook || 'Ripples'}${chapLabel}</div>
    <div class="meta-bar">
      <span>Date: ${now}</span>
      <span>Total Questions: ${qaPairs.length}</span>
    </div>
  </div>
  <div class="content">
    ${itemsHtml}
  </div>
  <div class="footer">
    Study Buddy Revision Notes • Generated for student self-study
  </div>
  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 250);
    };
  <\/script>
</body>
</html>`);
  printWindow.document.close();
}

if (exportNotesBtn) {
  exportNotesBtn.addEventListener('click', () => {
    unlockAudioContext();
    exportStudyNotes();
  });
}

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

function closeContextSettings() {
  if (contextModal) contextModal.classList.add('hidden');
  if (!greetingSpoken) {
    greetingSpoken = true;
    unlockAudioContext();
    speak(INITIAL_GREETING);
  }
}

if (closeContextModalBtn) {
  closeContextModalBtn.addEventListener('click', closeContextSettings);
}

if (contextModal) {
  contextModal.addEventListener('click', (e) => {
    if (e.target === contextModal) {
      closeContextSettings();
    }
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && contextModal && !contextModal.classList.contains('hidden')) {
    closeContextSettings();
  }
});

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
    fetchAndApplyBookFeatures(currentClass, currentBook);
    if (contextModal) contextModal.classList.add('hidden');

    const chapText = currentChapter !== 'All Chapters' ? ` (${currentChapter})` : '';
    addMessage(`📌 Active Context: **${currentClass} • ${currentBook}**${chapText}. Feel free to ask any question about this book!`, 'bot', '', false);

    // Start welcome message voice ONLY the first time
    if (!greetingSpoken) {
      greetingSpoken = true;
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
  fetchAndApplyBookFeatures(currentClass, currentBook);

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
const worksheetSchoolInput = document.getElementById('worksheetSchoolInput');
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
const printSchoolHeader = document.getElementById('printSchoolHeader');
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

  if (worksheetSchoolInput) {
    const savedSchool = localStorage.getItem('studybuddy_worksheet_school');
    if (savedSchool !== null) {
      worksheetSchoolInput.value = savedSchool;
    }
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

  const schoolName = (worksheetSchoolInput ? worksheetSchoolInput.value.trim() : '');
  if (schoolName) {
    localStorage.setItem('studybuddy_worksheet_school', schoolName);
    if (printSchoolHeader) {
      printSchoolHeader.textContent = schoolName;
      printSchoolHeader.classList.remove('hidden');
    }
  } else {
    localStorage.removeItem('studybuddy_worksheet_school');
    if (printSchoolHeader) {
      printSchoolHeader.textContent = '';
      printSchoolHeader.classList.add('hidden');
    }
  }

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
// Formal School Test Paper Generator & Examination Paper Engine
// ==========================================================================
const testPaperBtn = document.getElementById('testPaperBtn');
const testPaperModal = document.getElementById('testPaperModal');
const testPaperConfigView = document.getElementById('testPaperConfigView');
const testPaperPreviewView = document.getElementById('testPaperPreviewView');
const closeTestPaperConfigBtn = document.getElementById('closeTestPaperConfigBtn');
const closeTestPaperPreviewBtn = document.getElementById('closeTestPaperPreviewBtn');
const testPaperContextDisplay = document.getElementById('testPaperContextDisplay');
const testPaperLoadingSpinner = document.getElementById('testPaperLoadingSpinner');
const testPaperActiveOptions = document.getElementById('testPaperActiveOptions');
const testPaperEmptyNotice = document.getElementById('testPaperEmptyNotice');
const testPaperTotalCount = document.getElementById('testPaperTotalCount');
const testPaperTotalLabel = document.getElementById('testPaperTotalLabel');
const testPaperSchoolInput = document.getElementById('testPaperSchoolInput');
const testPaperExamTitleInput = document.getElementById('testPaperExamTitleInput');
const testPaperTimeSelect = document.getElementById('testPaperTimeSelect');
const testPaperMarksChips = document.getElementById('testPaperMarksChips');
const testPaperIncludeAnswers = document.getElementById('testPaperIncludeAnswers');
const generateTestPaperBtn = document.getElementById('generateTestPaperBtn');
const testPaperBackBtn = document.getElementById('testPaperBackBtn');
const testPaperShuffleBtn = document.getElementById('testPaperShuffleBtn');
const testPaperToggleKeyBtn = document.getElementById('testPaperToggleKeyBtn');
const testPaperPrintBtn = document.getElementById('testPaperPrintBtn');
const printableTestPaper = document.getElementById('printableTestPaper');

// Dual Mode & Advanced Test Paper Elements
const tpModeAutoTab = document.getElementById('tpModeAutoTab');
const tpModeManualTab = document.getElementById('tpModeManualTab');
const tpAutoViewContainer = document.getElementById('tpAutoViewContainer');
const tpManualViewContainer = document.getElementById('tpManualViewContainer');
const testPaperScopeSelect = document.getElementById('testPaperScopeSelect');
const tpAutoDistributionPreview = document.getElementById('tpAutoDistributionPreview');
const manualSelectedCount = document.getElementById('manualSelectedCount');
const manualTotalMarks = document.getElementById('manualTotalMarks');
const manualSelectAllBtn = document.getElementById('manualSelectAllBtn');
const manualDeselectAllBtn = document.getElementById('manualDeselectAllBtn');
const tpManualQuestionsList = document.getElementById('tpManualQuestionsList');
const generateManualTestPaperBtn = document.getElementById('generateManualTestPaperBtn');

// New Advanced Features: Multi-Chapter, Search, Custom Question, Layout, Sets, Word Export
const tpMultiChapterContainer = document.getElementById('tpMultiChapterContainer');
const tpChapterPillsList = document.getElementById('tpChapterPillsList');
const tpSelectAllChaptersBtn = document.getElementById('tpSelectAllChaptersBtn');
const testPaperLayoutSelect = document.getElementById('testPaperLayoutSelect');
const tpManualSearchInput = document.getElementById('tpManualSearchInput');
const tpManualClearSearch = document.getElementById('tpManualClearSearch');
const tpFilterTypeChips = document.getElementById('tpFilterTypeChips');
const tpOpenAddCustomBtn = document.getElementById('tpOpenAddCustomBtn');
const tpCustomQCard = document.getElementById('tpCustomQCard');
const tpCustomQInput = document.getElementById('tpCustomQInput');
const tpCustomSectionSelect = document.getElementById('tpCustomSectionSelect');
const tpCustomMarksInput = document.getElementById('tpCustomMarksInput');
const tpCustomAnsInput = document.getElementById('tpCustomAnsInput');
const tpSaveCustomQBtn = document.getElementById('tpSaveCustomQBtn');
const tpCancelCustomQBtn = document.getElementById('tpCancelCustomQBtn');
const tpSetABtn = document.getElementById('tpSetABtn');
const tpSetBBtn = document.getElementById('tpSetBBtn');
const tpSetCBtn = document.getElementById('tpSetCBtn');
const testPaperToggleLayoutBtn = document.getElementById('testPaperToggleLayoutBtn');
const testPaperExportWordBtn = document.getElementById('testPaperExportWordBtn');

let allTestPoolQuestions = [];
let testPaperSectionA = [];
let testPaperSectionB = [];
let testPaperSectionC = [];
let testPaperSectionD = [];
let targetMaxMarks = 20;
let testPaperAnswerKeyState = false;
let testPaperCurrentMode = 'auto'; // 'auto' | 'manual'
let testPaperLayoutMode = 'paper'; // 'paper' | 'booklet'
let testPaperCurrentSet = 'A'; // 'A' | 'B' | 'C'
let manualQuestionConfigs = new Map(); // qId -> { selected, section, marks, question }
let selectedMultiChapters = new Set();
let availableBookChapters = [];
let manualSearchKeyword = '';
let manualTypeFilter = 'all'; // 'all' | 'diagram' | 'text'

function closeTestPaperModal() {
  if (testPaperModal) testPaperModal.classList.add('hidden');
}

// Populate and manage multi-chapter selection checklist
async function loadMultiChaptersList() {
  if (!tpChapterPillsList) return;
  tpChapterPillsList.innerHTML = '<div style="font-size:0.8rem; color:#888;">Loading chapters...</div>';

  try {
    const url = `${API_URL}/chapters?className=${encodeURIComponent(currentClass || 'Class 3')}&bookName=${encodeURIComponent(currentBook || 'Ripples')}`;
    const res = await fetch(url);
    const data = await res.json();
    availableBookChapters = (data.chapters || []).filter(ch => ch && ch !== 'All Chapters');

    tpChapterPillsList.innerHTML = '';
    if (availableBookChapters.length === 0) {
      tpChapterPillsList.innerHTML = '<div style="font-size:0.8rem; color:#888;">No chapter list found.</div>';
      return;
    }

    selectedMultiChapters.clear();
    // Default select current chapter if available, else select all
    if (currentChapter && currentChapter !== 'All Chapters' && availableBookChapters.includes(currentChapter)) {
      selectedMultiChapters.add(currentChapter);
    } else {
      availableBookChapters.forEach(ch => selectedMultiChapters.add(ch));
    }

    availableBookChapters.forEach(ch => {
      const pill = document.createElement('label');
      pill.className = 'tp-ch-pill';
      const isChecked = selectedMultiChapters.has(ch);
      pill.innerHTML = `
        <input type="checkbox" value="${ch}" ${isChecked ? 'checked' : ''} />
        <span>${ch}</span>
      `;

      pill.querySelector('input').addEventListener('change', (e) => {
        if (e.target.checked) {
          selectedMultiChapters.add(ch);
        } else {
          selectedMultiChapters.delete(ch);
        }
        loadTestPaperQuestions();
      });

      tpChapterPillsList.appendChild(pill);
    });
  } catch (err) {
    console.warn('Error fetching chapters for multi-select:', err);
    tpChapterPillsList.innerHTML = '<div style="font-size:0.8rem; color:#888;">Could not load chapters.</div>';
  }
}

if (tpSelectAllChaptersBtn) {
  tpSelectAllChaptersBtn.addEventListener('click', () => {
    if (!tpChapterPillsList) return;
    const checkboxes = tpChapterPillsList.querySelectorAll('input[type="checkbox"]');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    checkboxes.forEach(cb => {
      cb.checked = !allChecked;
      if (!allChecked) {
        selectedMultiChapters.add(cb.value);
      } else {
        selectedMultiChapters.delete(cb.value);
      }
    });
    loadTestPaperQuestions();
  });
}

// Fetch test questions based on scope
async function loadTestPaperQuestions() {
  if (testPaperLoadingSpinner) testPaperLoadingSpinner.classList.remove('hidden');
  if (testPaperActiveOptions) testPaperActiveOptions.classList.add('hidden');
  if (testPaperEmptyNotice) testPaperEmptyNotice.classList.add('hidden');

  const scope = testPaperScopeSelect ? testPaperScopeSelect.value : 'chapter';

  if (testPaperContextDisplay) {
    let scopeText = '';
    if (scope === 'book') {
      scopeText = ' • Entire Book (All Chapters)';
    } else if (scope === 'custom') {
      scopeText = ` • ${selectedMultiChapters.size} Chapters Selected`;
    } else {
      scopeText = (currentChapter && currentChapter !== 'All Chapters') ? ` • Chapter: ${currentChapter}` : '';
    }
    testPaperContextDisplay.textContent = `${currentClass || 'Class 3'} • ${currentBook || 'Ripples'}${scopeText}`;
  }

  try {
    let questionsLoaded = [];

    if (scope === 'custom') {
      const chaptersToFetch = Array.from(selectedMultiChapters);
      if (chaptersToFetch.length === 0) {
        questionsLoaded = [];
      } else {
        const fetchPromises = chaptersToFetch.map(ch =>
          fetch(`${API_URL}/worksheet-questions?className=${encodeURIComponent(currentClass || 'Class 3')}&bookName=${encodeURIComponent(currentBook || 'Ripples')}&chapterName=${encodeURIComponent(ch)}`)
            .then(r => r.json())
            .then(d => d.questions || [])
            .catch(() => [])
        );
        const results = await Promise.all(fetchPromises);
        const seen = new Set();
        results.flat().forEach(q => {
          if (q && q.question && !seen.has(q._id || q.question)) {
            seen.add(q._id || q.question);
            questionsLoaded.push(q);
          }
        });
      }
    } else {
      const targetChapter = (scope === 'book') ? 'All Chapters' : (currentChapter || 'All Chapters');
      const url = `${API_URL}/worksheet-questions?className=${encodeURIComponent(currentClass || 'Class 3')}&bookName=${encodeURIComponent(currentBook || 'Ripples')}&chapterName=${encodeURIComponent(targetChapter)}`;
      const res = await fetch(url);
      const data = await res.json();
      questionsLoaded = data.questions || [];
    }

    if (testPaperLoadingSpinner) testPaperLoadingSpinner.classList.add('hidden');

    allTestPoolQuestions = questionsLoaded;
    const total = allTestPoolQuestions.length;
    if (testPaperTotalCount) testPaperTotalCount.textContent = total;
    if (testPaperTotalLabel) {
      if (scope === 'book') {
        testPaperTotalLabel.textContent = 'Questions available in entire book';
      } else if (scope === 'custom') {
        testPaperTotalLabel.textContent = `Questions available in ${selectedMultiChapters.size} selected chapters`;
      } else {
        testPaperTotalLabel.textContent = 'Questions available in this chapter';
      }
    }

    if (total === 0) {
      if (testPaperEmptyNotice) testPaperEmptyNotice.classList.remove('hidden');
      if (testPaperActiveOptions) testPaperActiveOptions.classList.add('hidden');
    } else {
      if (testPaperEmptyNotice) testPaperEmptyNotice.classList.add('hidden');
      if (testPaperActiveOptions) testPaperActiveOptions.classList.remove('hidden');

      // Initialize or preserve manual configs
      manualQuestionConfigs.clear();
      allTestPoolQuestions.forEach((q, idx) => {
        let sec = 'A';
        let mrk = 1;
        if (q.imageUrl && q.imageUrl.trim()) {
          sec = 'C';
          mrk = 5;
        } else if (idx % 3 === 1) {
          sec = 'B';
          mrk = 2;
        } else if (idx % 3 === 2) {
          sec = 'B';
          mrk = 3;
        }
        manualQuestionConfigs.set(q._id || String(idx), {
          selected: true,
          section: sec,
          marks: mrk,
          question: q
        });
      });

      updateAutoDistributionPreview();
      renderManualQuestionsList();
    }
  } catch (e) {
    console.warn('Failed to load questions for test paper:', e);
    if (testPaperLoadingSpinner) testPaperLoadingSpinner.classList.add('hidden');
    if (testPaperEmptyNotice) testPaperEmptyNotice.classList.remove('hidden');
  }
}

async function openTestPaperModal() {
  unlockAudioContext();
  if (!testPaperModal) return;

  testPaperModal.classList.remove('hidden');
  if (testPaperConfigView) testPaperConfigView.classList.remove('hidden');
  if (testPaperPreviewView) testPaperPreviewView.classList.add('hidden');

  if (testPaperSchoolInput) {
    const saved = localStorage.getItem('studybuddy_worksheet_school');
    if (saved) testPaperSchoolInput.value = saved;
  }

  // Reset to auto mode
  switchTestPaperMode('auto');

  // Load chapters for multi-select
  await loadMultiChaptersList();

  await loadTestPaperQuestions();
}

// Mode Switcher (Auto vs Manual)
function switchTestPaperMode(mode) {
  testPaperCurrentMode = mode;
  if (mode === 'auto') {
    if (tpModeAutoTab) tpModeAutoTab.classList.add('active');
    if (tpModeManualTab) tpModeManualTab.classList.remove('active');
    if (tpAutoViewContainer) tpAutoViewContainer.classList.remove('hidden');
    if (tpManualViewContainer) tpManualViewContainer.classList.add('hidden');
    updateAutoDistributionPreview();
  } else {
    if (tpModeAutoTab) tpModeAutoTab.classList.remove('active');
    if (tpModeManualTab) tpModeManualTab.classList.add('active');
    if (tpAutoViewContainer) tpAutoViewContainer.classList.add('hidden');
    if (tpManualViewContainer) tpManualViewContainer.classList.remove('hidden');
    renderManualQuestionsList();
  }
}

if (tpModeAutoTab) tpModeAutoTab.addEventListener('click', () => switchTestPaperMode('auto'));
if (tpModeManualTab) tpModeManualTab.addEventListener('click', () => switchTestPaperMode('manual'));

if (testPaperScopeSelect) {
  testPaperScopeSelect.addEventListener('change', () => {
    const scope = testPaperScopeSelect.value;
    if (scope === 'custom') {
      if (tpMultiChapterContainer) tpMultiChapterContainer.classList.remove('hidden');
    } else {
      if (tpMultiChapterContainer) tpMultiChapterContainer.classList.add('hidden');
    }
    loadTestPaperQuestions();
  });
}

if (testPaperMarksChips) {
  testPaperMarksChips.addEventListener('click', (e) => {
    const btn = e.target.closest('.preset-chip');
    if (!btn) return;
    testPaperMarksChips.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    targetMaxMarks = parseInt(btn.dataset.marks, 10) || 20;
    updateAutoDistributionPreview();
  });
}

// Search & Filter event listeners for Manual Mode
if (tpManualSearchInput) {
  tpManualSearchInput.addEventListener('input', (e) => {
    manualSearchKeyword = (e.target.value || '').toLowerCase().trim();
    if (tpManualClearSearch) {
      tpManualClearSearch.classList.toggle('hidden', !manualSearchKeyword);
    }
    renderManualQuestionsList();
  });
}

if (tpManualClearSearch) {
  tpManualClearSearch.addEventListener('click', () => {
    if (tpManualSearchInput) tpManualSearchInput.value = '';
    manualSearchKeyword = '';
    tpManualClearSearch.classList.add('hidden');
    renderManualQuestionsList();
  });
}

if (tpFilterTypeChips) {
  tpFilterTypeChips.addEventListener('click', (e) => {
    const chip = e.target.closest('.tp-filter-chip');
    if (!chip) return;
    tpFilterTypeChips.querySelectorAll('.tp-filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    manualTypeFilter = chip.dataset.type || 'all';
    renderManualQuestionsList();
  });
}

// Inline Custom Question Creator
if (tpOpenAddCustomBtn) {
  tpOpenAddCustomBtn.addEventListener('click', () => {
    if (tpCustomQCard) {
      tpCustomQCard.classList.toggle('hidden');
      if (!tpCustomQCard.classList.contains('hidden') && tpCustomQInput) {
        tpCustomQInput.focus();
      }
    }
  });
}

if (tpCancelCustomQBtn) {
  tpCancelCustomQBtn.addEventListener('click', () => {
    if (tpCustomQCard) tpCustomQCard.classList.add('hidden');
    if (tpCustomQInput) tpCustomQInput.value = '';
    if (tpCustomAnsInput) tpCustomAnsInput.value = '';
  });
}

if (tpSaveCustomQBtn) {
  tpSaveCustomQBtn.addEventListener('click', () => {
    const qText = tpCustomQInput ? tpCustomQInput.value.trim() : '';
    if (!qText) {
      alert('Please enter your question text.');
      return;
    }
    const sec = tpCustomSectionSelect ? tpCustomSectionSelect.value : 'A';
    const mrk = parseInt(tpCustomMarksInput ? tpCustomMarksInput.value : '2', 10) || 2;
    const ansText = tpCustomAnsInput ? tpCustomAnsInput.value.trim() : '';

    const customId = `custom_${Date.now()}`;
    const customQ = {
      _id: customId,
      question: qText,
      answer: ansText || 'Student own response / custom answer key.',
      chapterName: 'Custom Teacher Question',
      assignedMark: mrk,
      isCustom: true
    };

    allTestPoolQuestions.unshift(customQ);
    manualQuestionConfigs.set(customId, {
      selected: true,
      section: sec,
      marks: mrk,
      question: customQ
    });

    if (tpCustomQCard) tpCustomQCard.classList.add('hidden');
    if (tpCustomQInput) tpCustomQInput.value = '';
    if (tpCustomAnsInput) tpCustomAnsInput.value = '';

    renderManualQuestionsList();
  });
}

// Auto Distribution Preview Calculation
function updateAutoDistributionPreview() {
  if (!tpAutoDistributionPreview || allTestPoolQuestions.length === 0) return;

  const totalAvailable = allTestPoolQuestions.length;
  const diagrams = allTestPoolQuestions.filter(q => q.imageUrl && q.imageUrl.trim());

  let cCount = Math.min(diagrams.length, targetMaxMarks >= 50 ? 3 : (targetMaxMarks >= 30 ? 2 : 1));
  if (totalAvailable <= 2) cCount = Math.min(diagrams.length, 1);

  const remainingCount = totalAvailable - cCount;
  let bCount = Math.max(0, Math.floor(remainingCount / 2));
  if (totalAvailable <= 4 && remainingCount > 0) bCount = 1;
  let aCount = Math.max(0, remainingCount - bCount);

  const bMark = targetMaxMarks >= 30 ? 3 : 2;
  const estMarks = (aCount * 1) + (bCount * bMark) + (cCount * 5);

  let noteHtml = '';
  if (totalAvailable < 6 && targetMaxMarks >= 25) {
    noteHtml = `<div style="margin-top:0.35rem; color:#b45309; font-size:0.8rem;">💡 Tip: Current selection has ${totalAvailable} questions. To create a full ${targetMaxMarks}+ mark paper, select "Select Specific Chapters 📚" or "Entire Book" above.</div>`;
  }

  tpAutoDistributionPreview.innerHTML = `
    <strong>📋 Auto Distribution Plan (100% Unique Questions):</strong><br>
    Section A: <strong>${aCount} Qs (1M each)</strong> | Section B: <strong>${bCount} Qs (${bMark}M each)</strong> | Section C: <strong>${cCount} Qs (5M diagram)</strong><br>
    Estimated Marks: <strong>${estMarks} Marks</strong> (${totalAvailable} unique questions used, zero duplicates!)
    ${noteHtml}
  `;
}

// Auto Mode: Distribute Questions strictly without ANY duplicates
function distributeAutoTestPaperQuestions() {
  if (allTestPoolQuestions.length === 0) return;

  const pool = [...allTestPoolQuestions].sort(() => 0.5 - Math.random());
  const diagrams = pool.filter(q => q.imageUrl && q.imageUrl.trim());

  testPaperSectionA = [];
  testPaperSectionB = [];
  testPaperSectionC = [];
  testPaperSectionD = [];

  let cCount = Math.min(diagrams.length, targetMaxMarks >= 50 ? 3 : (targetMaxMarks >= 30 ? 2 : 1));
  if (pool.length <= 2) cCount = Math.min(diagrams.length, 1);

  const secC = diagrams.slice(0, cCount);
  const usedIds = new Set(secC.map(q => q._id || q.question));
  const remaining = pool.filter(q => !usedIds.has(q._id || q.question));

  const bMark = (targetMaxMarks >= 30) ? 3 : 2;
  let bCount = Math.floor(remaining.length / 2);
  if (pool.length <= 4 && remaining.length > 0) bCount = 1;

  const secB = remaining.slice(0, bCount);
  const usedBIds = new Set([...usedIds, ...secB.map(q => q._id || q.question)]);
  const secA = pool.filter(q => !usedBIds.has(q._id || q.question));

  testPaperSectionC = secC.map(q => ({ ...q, assignedMark: 5 }));
  testPaperSectionB = secB.map(q => ({ ...q, assignedMark: bMark }));
  testPaperSectionA = secA.map(q => ({ ...q, assignedMark: 1 }));
}

// Manual Mode: Render question cards with Search & Filter, Checkbox, Section & Custom Marks
function renderManualQuestionsList() {
  if (!tpManualQuestionsList) return;
  tpManualQuestionsList.innerHTML = '';

  if (allTestPoolQuestions.length === 0) {
    tpManualQuestionsList.innerHTML = '<div style="padding:1rem; text-align:center; color:#888;">No questions available.</div>';
    updateManualSummary();
    return;
  }

  // Filter based on search query and type chip
  const filtered = allTestPoolQuestions.filter(q => {
    const textMatch = !manualSearchKeyword || (q.question && q.question.toLowerCase().includes(manualSearchKeyword)) || (q.answer && q.answer.toLowerCase().includes(manualSearchKeyword));
    if (!textMatch) return false;

    const hasImg = Boolean(q.imageUrl && q.imageUrl.trim());
    if (manualTypeFilter === 'diagram' && !hasImg) return false;
    if (manualTypeFilter === 'text' && hasImg) return false;

    return true;
  });

  if (filtered.length === 0) {
    tpManualQuestionsList.innerHTML = '<div style="padding:1rem; text-align:center; color:#888;">No questions match your search or filter.</div>';
    updateManualSummary();
    return;
  }

  filtered.forEach((q, idx) => {
    const qId = q._id || String(idx);
    const conf = manualQuestionConfigs.get(qId) || { selected: true, section: 'A', marks: 1, question: q };

    const item = document.createElement('div');
    item.className = `tp-manual-item ${conf.selected ? 'selected' : ''}`;
    item.dataset.qid = qId;

    const hasImg = Boolean(q.imageUrl && q.imageUrl.trim());
    const isCustom = Boolean(q.isCustom);

    item.innerHTML = `
      <input type="checkbox" class="tp-manual-chk" ${conf.selected ? 'checked' : ''} />
      <div class="tp-manual-q-info">
        <div class="tp-manual-q-text">${idx + 1}. ${formatText(q.question)}</div>
        <div class="tp-manual-q-meta">
          ${hasImg ? '<span class="tp-manual-diagram-tag">🖼️ Diagram Question</span>' : ''}
          ${isCustom ? '<span class="tp-manual-diagram-tag" style="background:#fef3c7; color:#b45309;">⭐ Custom Question</span>' : ''}
          <span>Chapter: ${q.chapterName || currentChapter || 'Chapter 1'}</span>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:0.35rem; flex-shrink:0;">
        <select class="tp-manual-section-select" title="Assign Section">
          <option value="A" ${conf.section === 'A' ? 'selected' : ''}>Sec A</option>
          <option value="B" ${conf.section === 'B' ? 'selected' : ''}>Sec B</option>
          <option value="C" ${conf.section === 'C' ? 'selected' : ''}>Sec C</option>
          <option value="D" ${conf.section === 'D' ? 'selected' : ''}>Sec D</option>
        </select>
        <div style="display:flex; align-items:center; gap:2px;">
          <input type="number" class="testpaper-text-input tp-manual-mark-input" min="1" max="20" value="${conf.marks || 1}" style="width:48px; padding:0.25rem 0.35rem; font-weight:700; text-align:center;" title="Marks for this question" />
          <span style="font-size:0.75rem; font-weight:700; color:#ea580c;">M</span>
        </div>
      </div>
    `;

    const chk = item.querySelector('.tp-manual-chk');
    const secSelect = item.querySelector('.tp-manual-section-select');
    const markInput = item.querySelector('.tp-manual-mark-input');

    chk.addEventListener('change', () => {
      conf.selected = chk.checked;
      item.classList.toggle('selected', chk.checked);
      manualQuestionConfigs.set(qId, conf);
      updateManualSummary();
    });

    secSelect.addEventListener('change', () => {
      conf.section = secSelect.value;
      manualQuestionConfigs.set(qId, conf);
      updateManualSummary();
    });

    markInput.addEventListener('input', () => {
      conf.marks = Math.max(1, parseInt(markInput.value, 10) || 1);
      manualQuestionConfigs.set(qId, conf);
      updateManualSummary();
    });

    tpManualQuestionsList.appendChild(item);
  });

  updateManualSummary();
}

function updateManualSummary() {
  let selectedCount = 0;
  let totalMarks = 0;

  manualQuestionConfigs.forEach((conf) => {
    if (conf.selected) {
      selectedCount++;
      totalMarks += (conf.marks || 1);
    }
  });

  if (manualSelectedCount) manualSelectedCount.textContent = selectedCount;
  if (manualTotalMarks) manualTotalMarks.textContent = totalMarks;
}

if (manualSelectAllBtn) {
  manualSelectAllBtn.addEventListener('click', () => {
    manualQuestionConfigs.forEach(conf => { conf.selected = true; });
    renderManualQuestionsList();
  });
}

if (manualDeselectAllBtn) {
  manualDeselectAllBtn.addEventListener('click', () => {
    manualQuestionConfigs.forEach(conf => { conf.selected = false; });
    renderManualQuestionsList();
  });
}

// Build sections from Manual Selection
function buildManualSections() {
  testPaperSectionA = [];
  testPaperSectionB = [];
  testPaperSectionC = [];
  testPaperSectionD = [];

  manualQuestionConfigs.forEach((conf) => {
    if (conf.selected && conf.question) {
      const qObj = { ...conf.question, assignedMark: conf.marks || 1 };
      if (conf.section === 'A') {
        testPaperSectionA.push(qObj);
      } else if (conf.section === 'B') {
        testPaperSectionB.push(qObj);
      } else if (conf.section === 'C') {
        testPaperSectionC.push(qObj);
      } else {
        testPaperSectionD.push(qObj);
      }
    }
  });
}

// Render dynamic examination sheet with in-place editing, reordering, and layout format
function renderTestPaperSheet() {
  if (!printableTestPaper) return;

  const school = (testPaperSchoolInput ? testPaperSchoolInput.value.trim() : '') || 'ST. XAVIER\'S CONVENT SENIOR SECONDARY SCHOOL';
  const examTitle = (testPaperExamTitleInput ? testPaperExamTitleInput.value.trim() : '') || 'PERIODIC ASSESSMENT - I';
  const timeAllowed = testPaperTimeSelect ? testPaperTimeSelect.value : '1 Hour';
  const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const scope = testPaperScopeSelect ? testPaperScopeSelect.value : 'chapter';

  let chap = 'All Chapters';
  if (scope === 'book') {
    chap = 'Entire Book (Comprehensive)';
  } else if (scope === 'custom') {
    chap = Array.from(selectedMultiChapters).join(', ') || 'Selected Chapters';
  } else {
    chap = (currentChapter && currentChapter !== 'All Chapters') ? currentChapter : 'All Chapters';
  }

  // Set layout class on printable container
  printableTestPaper.className = `testpaper-sheet ${testPaperLayoutMode === 'paper' ? 'tp-layout-paper' : 'tp-layout-booklet'}`;

  let runningQIndex = 1;

  // Helper to build Section Block with Hover Tools (Move Up, Move Down, Delete)
  function buildSectionBlock(sectionLetter, sectionTitle, questionsList, defaultMark) {
    if (!questionsList || questionsList.length === 0) return '';

    const secTotal = questionsList.reduce((s, q) => s + (q.assignedMark || defaultMark), 0);
    let html = `
      <div class="tp-section-header">
        <span class="tp-editable" contenteditable="true" spellcheck="false">${sectionTitle}</span>
        <span class="tp-section-marks">[ ${secTotal} Marks ]</span>
      </div>
    `;

    questionsList.forEach((q, idx) => {
      const mark = q.assignedMark || defaultMark;
      
      // Calculate lines count based on mark
      const lineCount = mark <= 1 ? 2 : (mark <= 3 ? 4 : 6);
      let linesDotted = '';
      for (let i = 0; i < lineCount; i++) {
        linesDotted += (i === 0 ? 'Answer: ' : '') + '.......................................................................................................................................................<br>';
      }

      html += `
        <div class="tp-q-item" data-sec="${sectionLetter}" data-idx="${idx}">
          <div class="tp-q-hover-tools no-print">
            ${idx > 0 ? `<button type="button" class="tp-tool-mini-btn" onclick="window.reorderTestQuestion('${sectionLetter}', ${idx}, -1)" title="Move Up">⬆️</button>` : ''}
            ${idx < questionsList.length - 1 ? `<button type="button" class="tp-tool-mini-btn" onclick="window.reorderTestQuestion('${sectionLetter}', ${idx}, 1)" title="Move Down">⬇️</button>` : ''}
            <button type="button" class="tp-tool-mini-btn delete-btn" onclick="window.deleteTestQuestion('${sectionLetter}', ${idx})" title="Remove Question">🗑️</button>
          </div>
          <div class="tp-q-head">
            <div class="tp-q-text">
              <span class="tp-q-num">Q${runningQIndex++}.</span>
              <span class="tp-q-text-content tp-editable" contenteditable="true" spellcheck="false">${formatText(q.question)}</span>
            </div>
            <div class="tp-q-mark tp-editable" contenteditable="true" spellcheck="false">[${mark}]</div>
          </div>
          ${q.imageUrl ? `<div class="tp-q-diagram"><img src="${q.imageUrl}" alt="Diagram" /></div>` : ''}
          <div class="tp-answer-lines">${linesDotted}</div>
          ${testPaperAnswerKeyState ? `<div class="tp-answer-box"><strong>Model Answer:</strong> <span class="tp-editable" contenteditable="true" spellcheck="false">${formatText(q.answer)}</span></div>` : ''}
        </div>
      `;
    });

    return html;
  }

  const secAHtml = buildSectionBlock('A', 'SECTION A: VERY SHORT ANSWER QUESTIONS (1 Mark Each)', testPaperSectionA, 1);
  const secBHtml = buildSectionBlock('B', 'SECTION B: SHORT ANSWER & CONCEPTUAL QUESTIONS (2-3 Marks Each)', testPaperSectionB, 2);
  const secCHtml = buildSectionBlock('C', 'SECTION C: LONG ANSWER & DIAGRAM QUESTIONS (5 Marks Each)', testPaperSectionC, 5);
  const secDHtml = buildSectionBlock('D', 'SECTION D: CASE-BASED & APPLICATION QUESTIONS', testPaperSectionD, 4);

  // Dynamic Total Marks
  const calculatedTotalMarks = [...testPaperSectionA, ...testPaperSectionB, ...testPaperSectionC, ...testPaperSectionD]
    .reduce((sum, q) => sum + (q.assignedMark || 1), 0);

  // Marking Scheme Key Page
  let markingSchemeHtml = '';
  if (testPaperAnswerKeyState) {
    let keyIdx = 1;
    const allOrdered = [...testPaperSectionA, ...testPaperSectionB, ...testPaperSectionC, ...testPaperSectionD];
    let keyItemsHtml = '';
    allOrdered.forEach(q => {
      keyItemsHtml += `
        <div style="margin-bottom:0.75rem; border-bottom:1px dotted #ccc; padding-bottom:0.4rem;">
          <div style="font-weight:700; color:#111;">Q${keyIdx++}. ${formatText(q.question)} <span style="float:right; color:#ea580c;">[${q.assignedMark} Mark(s)]</span></div>
          <div style="font-size:0.9rem; color:#065f46; margin-top:0.2rem;"><strong>Answer:</strong> ${formatText(q.answer)}</div>
        </div>
      `;
    });

    markingSchemeHtml = `
      <div class="tp-marking-scheme">
        <div class="tp-marking-title">📋 Teacher's Marking Scheme & Answer Key (SET - ${testPaperCurrentSet})</div>
        <div style="text-align:center; font-size:0.85rem; color:#666; margin-bottom:1rem;">
          ${school} • ${examTitle} • Class ${currentClass || '3'} (${currentBook || 'Ripples'}) • Total Marks: ${calculatedTotalMarks}
        </div>
        ${keyItemsHtml}
      </div>
    `;
  }

  printableTestPaper.innerHTML = `
    <div class="tp-school-header">
      <h1 class="tp-school-name tp-editable" contenteditable="true" spellcheck="false">${school}</h1>
      <h2 class="tp-exam-title tp-editable" contenteditable="true" spellcheck="false">${examTitle} • SET - ${testPaperCurrentSet}</h2>
      <h3 class="tp-exam-sub">CLASS: ${currentClass || 'Class 3'} | SUBJECT: ${currentBook || 'Ripples'} | CHAPTER: ${chap}</h3>
    </div>

    <table class="tp-meta-table">
      <tr>
        <td><span class="tp-meta-label">Student Name:</span> _______________________________</td>
        <td><span class="tp-meta-label">Time Allowed:</span> ${timeAllowed}</td>
      </tr>
      <tr>
        <td><span class="tp-meta-label">Roll Number:</span> _________________ <span class="tp-meta-label" style="margin-left:1rem;">Section:</span> _____</td>
        <td><span class="tp-meta-label">Maximum Marks:</span> ${calculatedTotalMarks} Marks</td>
      </tr>
      <tr>
        <td><span class="tp-meta-label">Date:</span> ${today}</td>
        <td><span class="tp-meta-label">Marks Obtained:</span> _______ / ${calculatedTotalMarks}</td>
      </tr>
    </table>

    <div class="tp-instructions tp-editable" contenteditable="true" spellcheck="false">
      <strong>General Instructions:</strong>
      1. All questions are compulsory.<br>
      2. Write your answers neatly in clean handwriting.<br>
      3. Section marks and individual question marks are indicated on the right hand side.
    </div>

    ${secAHtml}
    ${secBHtml}
    ${secCHtml}
    ${secDHtml}

    <div style="text-align:center; margin-top:2rem; font-weight:700; font-size:0.85rem; color:#555;">
      *** ALL THE BEST ***
    </div>

    ${markingSchemeHtml}
  `;
}

// Global functions for inline question reordering and deletion
window.reorderTestQuestion = function(secLetter, idx, dir) {
  let targetArr = null;
  if (secLetter === 'A') targetArr = testPaperSectionA;
  else if (secLetter === 'B') targetArr = testPaperSectionB;
  else if (secLetter === 'C') targetArr = testPaperSectionC;
  else targetArr = testPaperSectionD;

  const targetIdx = idx + dir;
  if (targetIdx < 0 || targetIdx >= targetArr.length) return;

  const temp = targetArr[idx];
  targetArr[idx] = targetArr[targetIdx];
  targetArr[targetIdx] = temp;

  renderTestPaperSheet();
};

window.deleteTestQuestion = function(secLetter, idx) {
  let targetArr = null;
  if (secLetter === 'A') targetArr = testPaperSectionA;
  else if (secLetter === 'B') targetArr = testPaperSectionB;
  else if (secLetter === 'C') targetArr = testPaperSectionC;
  else targetArr = testPaperSectionD;

  if (confirm('Are you sure you want to remove this question from the exam paper?')) {
    targetArr.splice(idx, 1);
    renderTestPaperSheet();
  }
};

// Exam Sets Switcher (Set A, Set B, Set C)
function switchExamSet(newSet) {
  testPaperCurrentSet = newSet;
  [tpSetABtn, tpSetBBtn, tpSetCBtn].forEach(btn => {
    if (btn) btn.classList.toggle('active', btn.dataset.set === newSet);
  });

  // Shuffle order inside each section for Set B and Set C
  if (newSet !== 'A') {
    testPaperSectionA = [...testPaperSectionA].sort(() => 0.5 - Math.random());
    testPaperSectionB = [...testPaperSectionB].sort(() => 0.5 - Math.random());
    testPaperSectionC = [...testPaperSectionC].sort(() => 0.5 - Math.random());
    testPaperSectionD = [...testPaperSectionD].sort(() => 0.5 - Math.random());
  }

  renderTestPaperSheet();
}

if (tpSetABtn) tpSetABtn.addEventListener('click', () => switchExamSet('A'));
if (tpSetBBtn) tpSetBBtn.addEventListener('click', () => switchExamSet('B'));
if (tpSetCBtn) tpSetCBtn.addEventListener('click', () => switchExamSet('C'));

// Toggle layout format (Question Paper vs Ruled Answer Lines)
function toggleTestPaperLayout() {
  testPaperLayoutMode = (testPaperLayoutMode === 'paper') ? 'booklet' : 'paper';
  if (testPaperLayoutSelect) testPaperLayoutSelect.value = testPaperLayoutMode;
  if (testPaperToggleLayoutBtn) {
    testPaperToggleLayoutBtn.innerHTML = (testPaperLayoutMode === 'paper') ? '✍️ Toggle Lines' : '📄 Clean Paper';
  }
  renderTestPaperSheet();
}

if (testPaperToggleLayoutBtn) {
  testPaperToggleLayoutBtn.addEventListener('click', toggleTestPaperLayout);
}

// Export Exam Paper to Microsoft Word (.doc)
function exportTestPaperToWord() {
  if (!printableTestPaper) return;

  const school = (testPaperSchoolInput ? testPaperSchoolInput.value.trim() : '') || 'School_Exam';
  const examTitle = (testPaperExamTitleInput ? testPaperExamTitleInput.value.trim() : '') || 'Assessment';
  const filename = `${school.replace(/[^a-zA-Z0-9_-]/g, '_')}_${examTitle.replace(/[^a-zA-Z0-9_-]/g, '_')}_Set_${testPaperCurrentSet}.doc`;

  // Clone document and strip hover action buttons for clean export
  const clone = printableTestPaper.cloneNode(true);
  clone.querySelectorAll('.tp-q-hover-tools, .no-print').forEach(el => el.remove());

  const wordHtml = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset='utf-8'>
      <title>${examTitle}</title>
      <style>
        body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; color: #000; line-height: 1.4; padding: 2cm; }
        .tp-school-name { font-size: 16pt; font-weight: bold; text-align: center; text-transform: uppercase; margin-bottom: 2pt; }
        .tp-exam-title { font-size: 13pt; font-weight: bold; text-align: center; text-transform: uppercase; margin-bottom: 2pt; }
        .tp-exam-sub { font-size: 10pt; font-weight: bold; text-align: center; margin-bottom: 8pt; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 8pt; }
        td { border: 1pt solid #000; padding: 4pt 6pt; font-size: 10pt; }
        .tp-instructions { background: #f8fafc; border: 1pt solid #ccc; padding: 6pt; margin-bottom: 10pt; font-size: 9.5pt; font-family: Arial, sans-serif; }
        .tp-section-header { font-size: 11pt; font-weight: bold; text-transform: uppercase; background: #eee; padding: 4pt; border-left: 3pt solid #ea580c; margin-top: 10pt; margin-bottom: 6pt; }
        .tp-q-item { margin-bottom: 8pt; }
        .tp-q-head { font-size: 10.5pt; font-weight: bold; margin-bottom: 2pt; }
        .tp-answer-lines { color: #888; font-family: monospace; font-size: 9pt; }
        .tp-marking-scheme { page-break-before: always; border-top: 2pt dashed #000; padding-top: 12pt; margin-top: 14pt; }
        .tp-marking-title { font-size: 14pt; font-weight: bold; text-align: center; margin-bottom: 8pt; }
      </style>
    </head>
    <body>
      ${clone.innerHTML}
    </body>
    </html>
  `;

  const blob = new Blob(['\ufeff', wordHtml], { type: 'application/msword' });
  const downloadLink = document.createElement('a');
  downloadLink.href = URL.createObjectURL(blob);
  downloadLink.download = filename;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
}

if (testPaperExportWordBtn) {
  testPaperExportWordBtn.addEventListener('click', exportTestPaperToWord);
}

// Generate in Auto Mode
function generateAutoTestPaper() {
  if (testPaperSchoolInput) {
    localStorage.setItem('studybuddy_worksheet_school', testPaperSchoolInput.value.trim());
  }
  testPaperAnswerKeyState = testPaperIncludeAnswers ? testPaperIncludeAnswers.checked : false;
  testPaperLayoutMode = testPaperLayoutSelect ? testPaperLayoutSelect.value : 'paper';

  distributeAutoTestPaperQuestions();
  renderTestPaperSheet();

  if (testPaperConfigView) testPaperConfigView.classList.add('hidden');
  if (testPaperPreviewView) testPaperPreviewView.classList.remove('hidden');
}

// Generate in Manual Selection Mode
function generateManualTestPaper() {
  let selectedCount = 0;
  manualQuestionConfigs.forEach(conf => { if (conf.selected) selectedCount++; });

  if (selectedCount === 0) {
    alert('Please select at least one question for your exam paper!');
    return;
  }

  if (testPaperSchoolInput) {
    localStorage.setItem('studybuddy_worksheet_school', testPaperSchoolInput.value.trim());
  }
  testPaperAnswerKeyState = testPaperIncludeAnswers ? testPaperIncludeAnswers.checked : false;
  testPaperLayoutMode = testPaperLayoutSelect ? testPaperLayoutSelect.value : 'paper';

  buildManualSections();
  renderTestPaperSheet();

  if (testPaperConfigView) testPaperConfigView.classList.add('hidden');
  if (testPaperPreviewView) testPaperPreviewView.classList.remove('hidden');
}

if (testPaperBtn) testPaperBtn.addEventListener('click', openTestPaperModal);
if (closeTestPaperConfigBtn) closeTestPaperConfigBtn.addEventListener('click', closeTestPaperModal);
if (closeTestPaperPreviewBtn) closeTestPaperPreviewBtn.addEventListener('click', closeTestPaperModal);
if (generateTestPaperBtn) generateTestPaperBtn.addEventListener('click', generateAutoTestPaper);
if (generateManualTestPaperBtn) generateManualTestPaperBtn.addEventListener('click', generateManualTestPaper);

if (testPaperBackBtn) {
  testPaperBackBtn.addEventListener('click', () => {
    if (testPaperPreviewView) testPaperPreviewView.classList.add('hidden');
    if (testPaperConfigView) testPaperConfigView.classList.remove('hidden');
  });
}
if (testPaperShuffleBtn) {
  testPaperShuffleBtn.addEventListener('click', () => {
    if (testPaperCurrentMode === 'auto') {
      distributeAutoTestPaperQuestions();
    } else {
      testPaperSectionA = [...testPaperSectionA].sort(() => 0.5 - Math.random());
      testPaperSectionB = [...testPaperSectionB].sort(() => 0.5 - Math.random());
      testPaperSectionC = [...testPaperSectionC].sort(() => 0.5 - Math.random());
      testPaperSectionD = [...testPaperSectionD].sort(() => 0.5 - Math.random());
    }
    renderTestPaperSheet();
  });
}
if (testPaperToggleKeyBtn) {
  testPaperToggleKeyBtn.addEventListener('click', () => {
    testPaperAnswerKeyState = !testPaperAnswerKeyState;
    renderTestPaperSheet();
  });
}
if (testPaperPrintBtn) {
  testPaperPrintBtn.addEventListener('click', () => {
    window.print();
  });
}
if (testPaperModal) {
  testPaperModal.addEventListener('click', (e) => {
    if (e.target === testPaperModal) closeTestPaperModal();
  });
}
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && testPaperModal && !testPaperModal.classList.contains('hidden')) {
    closeTestPaperModal();
  }
});

// ==========================================================================
// Smart Pedagogical Lesson Plan Engine (Direct Curriculum Load)
// ==========================================================================
const lessonPlanBtn = document.getElementById('lessonPlanBtn');
const lessonPlanModal = document.getElementById('lessonPlanModal');
const lessonPlanPreviewView = document.getElementById('lessonPlanPreviewView');
const closeLessonPlanPreviewBtn = document.getElementById('closeLessonPlanPreviewBtn');
const closeLessonPlanEmptyBtn = document.getElementById('closeLessonPlanEmptyBtn');
const lessonPlanContextDisplay = document.getElementById('lessonPlanContextDisplay');
const lessonPlanLoadingSpinner = document.getElementById('lessonPlanLoadingSpinner');
const lessonPlanEmptyNotice = document.getElementById('lessonPlanEmptyNotice');
const lessonPlanPdfDownloadBtn = document.getElementById('lessonPlanPdfDownloadBtn');
const lessonPlanPrintBtn = document.getElementById('lessonPlanPrintBtn');
const printableLessonPlan = document.getElementById('printableLessonPlan');

let activeDbPedagogy = null;
let activeDbMindMap = null;

function closeLessonPlanModal() {
  if (lessonPlanModal) lessonPlanModal.classList.add('hidden');
}

async function openLessonPlanModal() {
  unlockAudioContext();
  if (!lessonPlanModal) return;

  lessonPlanModal.classList.remove('hidden');
  if (lessonPlanLoadingSpinner) lessonPlanLoadingSpinner.classList.remove('hidden');
  if (lessonPlanEmptyNotice) lessonPlanEmptyNotice.classList.add('hidden');
  if (printableLessonPlan) printableLessonPlan.innerHTML = '';
  if (lessonPlanPdfDownloadBtn) lessonPlanPdfDownloadBtn.classList.add('hidden');

  const chapLabel = (currentChapter && currentChapter !== 'All Chapters') ? ` • Chapter: ${currentChapter}` : '';
  if (lessonPlanContextDisplay) {
    lessonPlanContextDisplay.textContent = `${currentClass || 'Class 3'} • ${currentBook || 'Ripples'}${chapLabel}`;
  }

  try {
    const pedUrl = `${PEDAGOGY_API_URL}?className=${encodeURIComponent(currentClass || 'Class 3')}&bookName=${encodeURIComponent(currentBook || 'Ripples')}&chapterName=${encodeURIComponent(currentChapter || 'All Chapters')}`;
    const pedRes = await fetch(pedUrl);
    const pedData = await pedRes.json();
    activeDbPedagogy = (pedData.exists && pedData.data) ? pedData.data : null;

    if (lessonPlanLoadingSpinner) lessonPlanLoadingSpinner.classList.add('hidden');

    if (activeDbPedagogy && activeDbPedagogy.lessonPlan && (activeDbPedagogy.lessonPlan.unitTitle || activeDbPedagogy.lessonPlan.pdfUrl)) {
      renderLessonPlanDocument();
    } else {
      if (lessonPlanEmptyNotice) {
        lessonPlanEmptyNotice.classList.remove('hidden');
        const emptyTxt = document.getElementById('lessonPlanEmptyText');
        if (emptyTxt) {
          emptyTxt.textContent = `Lesson Plan has not been configured yet for ${currentClass || 'Class 3'} • ${currentBook || 'Ripples'}${chapLabel}.`;
        }
      }
    }
  } catch (e) {
    console.warn('Failed to load lesson plan data:', e);
    if (lessonPlanLoadingSpinner) lessonPlanLoadingSpinner.classList.add('hidden');
    if (lessonPlanEmptyNotice) lessonPlanEmptyNotice.classList.remove('hidden');
  }
}

function renderLessonPlanDocument() {
  if (!printableLessonPlan || !activeDbPedagogy || !activeDbPedagogy.lessonPlan) return;

  const lp = activeDbPedagogy.lessonPlan;
  const chap = (currentChapter && currentChapter !== 'All Chapters') ? currentChapter : (activeDbPedagogy.chapterName || 'All Chapters');

  if (lp.pdfUrl) {
    if (lessonPlanPdfDownloadBtn) {
      lessonPlanPdfDownloadBtn.href = lp.pdfUrl;
      lessonPlanPdfDownloadBtn.classList.remove('hidden');
    }
  } else {
    if (lessonPlanPdfDownloadBtn) {
      lessonPlanPdfDownloadBtn.classList.add('hidden');
    }
  }

  const pdfBanner = lp.pdfUrl ? `
    <div class="no-print" style="margin-bottom: 1.25rem; background: #ecfdf5; border: 1.5px solid #a7f3d0; border-radius: 12px; padding: 0.85rem 1.25rem; display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap;">
      <div>
        <strong style="color: #065f46; font-size: 0.95rem;">📎 Official Lesson Plan PDF Available</strong>
        <div style="font-size: 0.82rem; color: #047857; margin-top: 0.15rem;">An official curriculum document is attached to this chapter.</div>
      </div>
      <a href="${lp.pdfUrl}" target="_blank" download style="background: #059669; color: #ffffff; padding: 0.5rem 1.1rem; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 0.88rem; display: inline-flex; align-items: center; gap: 0.45rem; box-shadow: 0 2px 8px rgba(5, 150, 105, 0.3);">
        📥 Download / View PDF
      </a>
    </div>
  ` : '';

  printableLessonPlan.innerHTML = `
    ${pdfBanner}
    <div class="lp-school-header">
      <h1 class="lp-school-name">${escapeHtml(currentBook || 'Curriculum')} &bull; ${escapeHtml(currentClass || 'Class 3')}</h1>
      <h2 class="lp-plan-title">SMART PEDAGOGICAL LESSON PLAN (CBSE &amp; NEP 2020)</h2>
      <div style="margin-top:0.35rem;"><span style="background:#e0e7ff; color:#3730a3; font-size:0.78rem; font-weight:700; padding:0.25rem 0.75rem; border-radius:999px;">✔ Curated &amp; Database-Grounded Curriculum</span></div>
    </div>

    <div class="lp-meta-grid">
      <div class="lp-meta-item"><strong>Class:</strong> <span>${escapeHtml(currentClass || 'Class 3')}</span></div>
      <div class="lp-meta-item"><strong>Subject/Book:</strong> <span>${escapeHtml(currentBook || 'Ripples')}</span></div>
      <div class="lp-meta-item"><strong>Chapter:</strong> <span>${escapeHtml(chap)}</span></div>
      <div class="lp-meta-item"><strong>Unit Title:</strong> <span>${escapeHtml(lp.unitTitle || chap)}</span></div>
      <div class="lp-meta-item"><strong>Duration:</strong> <span>${lp.periodsCount || 4} Periods</span></div>
      <div class="lp-meta-item"><strong>Curriculum Alignment:</strong> <span>CBSE &amp; NEP 2020</span></div>
      <div class="lp-meta-item" style="grid-column: span 3;"><strong>Teaching Approach / Methodology:</strong> <span>${escapeHtml(lp.pedagogicalMethodology || '5E Inquiry Model, Visual Learning & Interactive Discussion')}</span></div>
    </div>

    <!-- 1. Learning Objectives -->
    <div class="lp-block">
      <div class="lp-block-header">1. Specific Learning Objectives (Bloom's Taxonomy)</div>
      <div class="lp-block-body">
        <ul class="lp-list">
          ${(lp.learningObjectives || []).map(obj => `<li>${escapeHtml(obj)}</li>`).join('')}
        </ul>
        <div style="margin-top:0.5rem; font-size:0.84rem; color:#4338ca;">
          <strong>Target Bloom's Levels:</strong> ${(lp.bloomTaxonomy || []).join(', ') || 'Remembering, Understanding, Applying'}
        </div>
      </div>
    </div>

    <!-- 2. Detailed Periods Breakdown -->
    <div class="lp-block">
      <div class="lp-block-header">2. Detailed Pedagogical Execution Plan (Period-by-Period)</div>
      <div class="lp-block-body" style="padding:0;">
        <table class="lp-phase-table">
          <thead>
            <tr>
              <th style="width:14%;">Period</th>
              <th style="width:23%;">Teacher Activity &amp; Inquiry</th>
              <th style="width:23%;">Student Learning Activity</th>
              <th style="width:20%;">Teaching Aids / TLM</th>
              <th style="width:20%;">Formative Check</th>
            </tr>
          </thead>
          <tbody>
            ${(lp.periods || []).map(p => `
              <tr>
                <td><strong>Period ${p.periodNumber}</strong><br><span style="font-size:0.8rem; color:#4f46e5; font-weight:700;">${escapeHtml(p.title)}</span></td>
                <td>${escapeHtml(p.teacherActivity || 'Interactive concept explanation.')}</td>
                <td>${escapeHtml(p.studentActivity || 'Active listening, peer discussion.')}</td>
                <td>${escapeHtml(p.teachingAids || 'Blackboard, textbook illustrations.')}</td>
                <td><em>${escapeHtml(p.assessmentQuestion || 'Formative oral check.')}</em></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- 3. Classroom Activity & Homework -->
    <div class="lp-block">
      <div class="lp-block-header">3. Experiential Classroom Activity &amp; Homework</div>
      <div class="lp-block-body">
        <p><strong>Classroom Group Activity / Demonstration:</strong> ${escapeHtml(lp.classroomActivity || 'Class discussion and visual concept exploration.')}</p>
        <p style="margin-top:0.5rem;"><strong>Homework &amp; Extension Task:</strong> ${escapeHtml(lp.homeworkAssignment || 'Solve exercise questions and draw concept diagram in notebook.')}</p>
      </div>
    </div>

    <!-- 4. Teacher Reflection -->
    <div class="lp-block">
      <div class="lp-block-header">4. Teacher's Self-Reflection &amp; Learning Outcome Status</div>
      <div class="lp-block-body">
        <div style="display:flex; gap:1.5rem; margin-bottom:0.5rem; flex-wrap:wrap;">
          <span>Learning Objectives Achieved: <strong>[ ] Yes  [ ] Partially  [ ] Needs Revision</strong></span>
          <span>Student Engagement Level: <strong>[ ] High  [ ] Average  [ ] Low</strong></span>
        </div>
        <div>Teacher's Notes / Observations: ..........................................................................................................................................................................</div>
      </div>
    </div>

    <div class="lp-signature-row">
      <div>Teacher's Signature: __________________________</div>
      <div>Principal / Academic Coordinator: __________________________</div>
    </div>
  `;
}

if (lessonPlanBtn) lessonPlanBtn.addEventListener('click', openLessonPlanModal);
if (closeLessonPlanPreviewBtn) closeLessonPlanPreviewBtn.addEventListener('click', closeLessonPlanModal);
if (closeLessonPlanEmptyBtn) closeLessonPlanEmptyBtn.addEventListener('click', closeLessonPlanModal);
if (lessonPlanPrintBtn) {
  lessonPlanPrintBtn.addEventListener('click', () => {
    window.print();
  });
}
if (lessonPlanModal) {
  lessonPlanModal.addEventListener('click', (e) => {
    if (e.target === lessonPlanModal) closeLessonPlanModal();
  });
}
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && lessonPlanModal && !lessonPlanModal.classList.contains('hidden')) {
    closeLessonPlanModal();
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
const quizPrintCertBtn = document.getElementById('quizPrintCertBtn');

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

function printQuizCertificate() {
  const studentName = prompt('Enter Student Name for Certificate:', 'Super Star Student') || 'Super Star Student';
  const total = quizQuestions.length;
  const pct = total > 0 ? Math.round((quizScore / total) * 100) : 0;
  const schoolName = localStorage.getItem('studybuddy_worksheet_school') || '';
  const now = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const chapLabel = (currentChapter && currentChapter !== 'All Chapters') ? currentChapter : 'All Chapters';

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to print/save your certificate!');
    return;
  }

  printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Certificate of Achievement - ${studentName}</title>
  <style>
    @page { size: landscape; margin: 1cm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Baloo 2", Arial, sans-serif; margin: 0; padding: 2rem; background: #fff; color: #222; }
    .cert-border { border: 10px double #2b3a8c; padding: 2.5rem; text-align: center; border-radius: 18px; position: relative; background: #fdfdff; }
    .cert-seal { font-size: 3.5rem; margin-bottom: 0.2rem; }
    .school-title { font-size: 1.3rem; font-weight: 800; text-transform: uppercase; color: #e65c92; letter-spacing: 1px; }
    .cert-title { font-size: 2.4rem; font-weight: 900; color: #1a237e; text-transform: uppercase; margin: 0.5rem 0; letter-spacing: 2px; }
    .cert-subtitle { font-size: 1.1rem; color: #555; margin-bottom: 1.5rem; }
    .awarded-to { font-size: 1rem; color: #777; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 0.4rem; }
    .student-name { font-size: 2.2rem; font-weight: 800; color: #0d47a1; border-bottom: 2px solid #ffb300; display: inline-block; padding: 0 2rem 0.3rem; margin-bottom: 1.5rem; }
    .cert-text { font-size: 1.05rem; line-height: 1.6; color: #333; max-width: 650px; margin: 0 auto 2rem; }
    .score-badge { display: inline-block; background: #e8f5e9; color: #2e7d32; font-weight: 800; padding: 0.4rem 1.2rem; border-radius: 20px; font-size: 1.1rem; border: 1px solid #c8e6c9; }
    .footer-row { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 3rem; padding: 0 2rem; }
    .sig-block { text-align: center; }
    .sig-line { width: 180px; border-bottom: 1.5px solid #444; margin-bottom: 0.4rem; }
    .sig-label { font-size: 0.85rem; color: #666; font-weight: 600; }
  </style>
</head>
<body>
  <div class="cert-border">
    <div class="cert-seal">🌟 🏆 🌟</div>
    ${schoolName ? `<div class="school-title">${schoolName}</div>` : ''}
    <div class="cert-title">Certificate of Achievement</div>
    <div class="cert-subtitle">This certificate is proudly awarded to</div>
    <div class="student-name">${studentName}</div>
    <div class="cert-text">
      For successfully completing the Chapter Practice Quiz in <strong>${currentBook || 'Study Buddy'}</strong> (${currentClass || 'Class 3'} • ${chapLabel}) with dedication and excellence!
      <br><br>
      <span class="score-badge">Scored: ${quizScore} / ${total} (${pct}%)</span>
    </div>
    <div class="footer-row">
      <div class="sig-block">
        <div class="sig-line"></div>
        <div class="sig-label">Date: ${now}</div>
      </div>
      <div class="sig-block">
        <div style="font-size: 1.4rem; font-weight: 700; color: #3949ab; margin-bottom: 0.2rem;">Study Buddy AI 🤖</div>
        <div class="sig-line"></div>
        <div class="sig-label">Verified Publisher Learning Platform</div>
      </div>
    </div>
  </div>
  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 250);
    };
  <\/script>
</body>
</html>`);
  printWindow.document.close();
}

if (quizPrintCertBtn) {
  quizPrintCertBtn.addEventListener('click', () => {
    unlockAudioContext();
    printQuizCertificate();
  });
}

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

// Auto-send query if passed in URL (e.g. ?q=... or ?question=...)
const urlParams = new URLSearchParams(window.location.search);
const initialQuestion = urlParams.get('q') || urlParams.get('question');
if (initialQuestion && initialQuestion.trim()) {
  setTimeout(() => {
    sendQuestion(initialQuestion.trim());
  }, 700);
}

/* ==========================================================================
   Main Chat Voice Microphone Recognition Handler
   ========================================================================== */
const mainChatMicBtn = document.getElementById('micBtn');
const mainChatInput = document.getElementById('chatInput');
let mainChatRecognition = null;
let isMainChatListening = false;

if (mainChatMicBtn && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  mainChatRecognition = new SpeechRec();
  mainChatRecognition.continuous = false;
  mainChatRecognition.interimResults = true;

  mainChatRecognition.onstart = () => {
    isMainChatListening = true;
    mainChatMicBtn.classList.add('listening');
    if (mainChatInput) mainChatInput.placeholder = 'Listening... बोलिए...';
  };

  mainChatRecognition.onresult = (event) => {
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      transcript += event.results[i][0].transcript;
    }
    if (mainChatInput && transcript) {
      mainChatInput.value = transcript;
    }
  };

  mainChatRecognition.onerror = (err) => {
    console.warn('Speech recognition error:', err);
    isMainChatListening = false;
    mainChatMicBtn.classList.remove('listening');
    if (mainChatInput) mainChatInput.placeholder = 'Type or click mic to speak...';
  };

  mainChatRecognition.onend = () => {
    isMainChatListening = false;
    mainChatMicBtn.classList.remove('listening');
    if (mainChatInput) mainChatInput.placeholder = 'Type or click mic to speak...';
  };

  mainChatMicBtn.addEventListener('click', () => {
    unlockAudioContext();
    if (isMainChatListening) {
      mainChatRecognition.stop();
    } else {
      const lang = (voiceSelect && voiceSelect.value === 'hindi') ? 'hi-IN' : 'en-IN';
      mainChatRecognition.lang = lang;
      try {
        mainChatRecognition.start();
      } catch (e) {
        console.warn('Recognition start error:', e);
      }
    }
  });
}

/* ==========================================================================
   Oral Test / Interactive Voice Viva Implementation
   ========================================================================== */
const oralTestBtn = document.getElementById('oralTestBtn');
const oralTestModal = document.getElementById('oralTestModal');
const oralTestConfigView = document.getElementById('oralTestConfigView');
const closeOralTestConfigBtn = document.getElementById('closeOralTestConfigBtn');
const oralTestContextDisplay = document.getElementById('oralTestContextDisplay');
const oralTestLoadingSpinner = document.getElementById('oralTestLoadingSpinner');
const oralTestActiveOptions = document.getElementById('oralTestActiveOptions');
const oralTestTotalCount = document.getElementById('oralTestTotalCount');
const oralTestCountSelect = document.getElementById('oralTestCountSelect');
const oralTestLangSelect = document.getElementById('oralTestLangSelect');
const startOralTestBtn = document.getElementById('startOralTestBtn');

const oralTestActiveView = document.getElementById('oralTestActiveView');
const oralTestQuestionCounter = document.getElementById('oralTestQuestionCounter');
const oralTestScoreBadge = document.getElementById('oralTestScoreBadge');
const closeOralTestActiveBtn = document.getElementById('closeOralTestActiveBtn');
const oralTestProgressBar = document.getElementById('oralTestProgressBar');
const oralMascotHead = document.getElementById('oralMascotHead');
const oralQuestionText = document.getElementById('oralQuestionText');
const oralReplayAudioBtn = document.getElementById('oralReplayAudioBtn');
const oralDiagramWrap = document.getElementById('oralDiagramWrap');
const oralDiagramImg = document.getElementById('oralDiagramImg');

const oralMicBtn = document.getElementById('oralMicBtn');
const oralMicStatus = document.getElementById('oralMicStatus');
const oralTranscriptInput = document.getElementById('oralTranscriptInput');
const oralClearTranscriptBtn = document.getElementById('oralClearTranscriptBtn');
const oralSkipQuestionBtn = document.getElementById('oralSkipQuestionBtn');
const oralSubmitAnswerBtn = document.getElementById('oralSubmitAnswerBtn');

const oralFeedbackCard = document.getElementById('oralFeedbackCard');
const oralFeedbackScoreBadge = document.getElementById('oralFeedbackScoreBadge');
const oralFeedbackVerdict = document.getElementById('oralFeedbackVerdict');
const oralFeedbackSpeechMsg = document.getElementById('oralFeedbackSpeechMsg');
const oralKeywordsMatchedList = document.getElementById('oralKeywordsMatchedList');
const oralModelAnswerText = document.getElementById('oralModelAnswerText');
const oralNextQuestionBtn = document.getElementById('oralNextQuestionBtn');

const oralTestResultView = document.getElementById('oralTestResultView');
const oralResultTitle = document.getElementById('oralResultTitle');
const oralResultSubtitle = document.getElementById('oralResultSubtitle');
const oralFinalScoreVal = document.getElementById('oralFinalScoreVal');
const oralAwardBadge = document.getElementById('oralAwardBadge');
const oralAwardDescription = document.getElementById('oralAwardDescription');
const oralMetricTotal = document.getElementById('oralMetricTotal');
const oralMetricPerfect = document.getElementById('oralMetricPerfect');
const oralMetricAccuracy = document.getElementById('oralMetricAccuracy');
const oralBreakdownList = document.getElementById('oralBreakdownList');
const oralPrintScorecardBtn = document.getElementById('oralPrintScorecardBtn');
const oralRetakeBtn = document.getElementById('oralRetakeBtn');
const oralCloseResultBtn = document.getElementById('oralCloseResultBtn');

let allOralPool = [];
let activeOralQuestions = [];
let currentOralIdx = 0;
let oralTotalScore = 0;
let oralMaxPossibleScore = 0;
let oralUserAnswersRecord = [];
let oralRecognition = null;
let isOralListening = false;

function closeOralTestModal() {
  if (oralRecognition && isOralListening) {
    try { oralRecognition.stop(); } catch(e){}
    isOralListening = false;
  }
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  if (oralMascotHead) oralMascotHead.classList.remove('speaking');
  if (oralTestModal) oralTestModal.classList.add('hidden');
}

async function openOralTestModal() {
  unlockAudioContext();
  if (!oralTestModal) return;

  oralTestModal.classList.remove('hidden');
  if (oralTestConfigView) oralTestConfigView.classList.remove('hidden');
  if (oralTestActiveView) oralTestActiveView.classList.add('hidden');
  if (oralTestResultView) oralTestResultView.classList.add('hidden');
  if (oralTestLoadingSpinner) oralTestLoadingSpinner.classList.remove('hidden');
  if (oralTestActiveOptions) oralTestActiveOptions.classList.add('hidden');

  const chapLabel = (currentChapter && currentChapter !== 'All Chapters') ? ` • Chapter: ${currentChapter}` : '';
  if (oralTestContextDisplay) {
    oralTestContextDisplay.textContent = `${currentClass || 'Class 3'} • ${currentBook || 'Ripples'}${chapLabel}`;
  }

  try {
    const url = `${API_URL}/worksheet-questions?className=${encodeURIComponent(currentClass || 'Class 3')}&bookName=${encodeURIComponent(currentBook || 'Ripples')}&chapterName=${encodeURIComponent(currentChapter || 'All Chapters')}`;
    const res = await fetch(url);
    const data = await res.json();

    if (oralTestLoadingSpinner) oralTestLoadingSpinner.classList.add('hidden');
    allOralPool = data.questions || [];
    const count = allOralPool.length;
    if (oralTestTotalCount) oralTestTotalCount.textContent = count;

    if (count > 0 && oralTestActiveOptions) {
      oralTestActiveOptions.classList.remove('hidden');
    }
  } catch (err) {
    console.warn('Failed to load questions for oral test:', err);
    if (oralTestLoadingSpinner) oralTestLoadingSpinner.classList.add('hidden');
    if (oralTestActiveOptions) oralTestActiveOptions.classList.remove('hidden');
  }
}

// Mascot TTS Speech Function
function speakMascotVoice(text, lang = 'indian_english', onDone = null) {
  if (!window.speechSynthesis) {
    if (onDone) onDone();
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.95;
  utterance.pitch = 1.05;

  if (lang === 'hindi') {
    utterance.lang = 'hi-IN';
  } else {
    utterance.lang = 'en-IN';
  }

  if (oralMascotHead) oralMascotHead.classList.add('speaking');

  utterance.onend = () => {
    if (oralMascotHead) oralMascotHead.classList.remove('speaking');
    if (onDone) onDone();
  };

  utterance.onerror = () => {
    if (oralMascotHead) oralMascotHead.classList.remove('speaking');
    if (onDone) onDone();
  };

  window.speechSynthesis.speak(utterance);
}

// Start Viva Run
function startOralTestSession() {
  if (!allOralPool || allOralPool.length === 0) {
    alert('No questions available in this chapter for Oral Test.');
    return;
  }

  const requestedCount = parseInt(oralTestCountSelect ? oralTestCountSelect.value : '5', 10) || 5;
  const shuffled = [...allOralPool].sort(() => 0.5 - Math.random());
  activeOralQuestions = shuffled.slice(0, Math.min(requestedCount, shuffled.length));

  currentOralIdx = 0;
  oralTotalScore = 0;
  oralMaxPossibleScore = activeOralQuestions.length * 2;
  oralUserAnswersRecord = [];

  if (oralTestConfigView) oralTestConfigView.classList.add('hidden');
  if (oralTestResultView) oralTestResultView.classList.add('hidden');
  if (oralTestActiveView) oralTestActiveView.classList.remove('hidden');

  renderCurrentOralQuestion();
}

function renderCurrentOralQuestion() {
  if (currentOralIdx >= activeOralQuestions.length) {
    showOralTestResults();
    return;
  }

  const q = activeOralQuestions[currentOralIdx];
  const qNum = currentOralIdx + 1;
  const total = activeOralQuestions.length;

  // Header & progress
  if (oralTestQuestionCounter) oralTestQuestionCounter.textContent = `Question ${qNum} of ${total}`;
  if (oralTestScoreBadge) oralTestScoreBadge.textContent = `Score: ${oralTotalScore} / ${oralMaxPossibleScore}`;
  if (oralTestProgressBar) {
    const pct = Math.round((qNum / total) * 100);
    oralTestProgressBar.style.width = `${pct}%`;
  }

  // Question stage
  if (oralQuestionText) oralQuestionText.textContent = q.question || 'Explain the concept.';

  // Diagram handling
  if (oralDiagramWrap && oralDiagramImg) {
    if (q.imageUrl && q.imageUrl.trim()) {
      oralDiagramImg.src = q.imageUrl.trim();
      oralDiagramWrap.classList.remove('hidden');
      oralDiagramImg.onclick = () => {
        if (typeof openLightbox === 'function') openLightbox(q.imageUrl.trim());
      };
    } else {
      oralDiagramWrap.classList.add('hidden');
      oralDiagramImg.src = '';
    }
  }

  // Reset student inputs
  if (oralTranscriptInput) oralTranscriptInput.value = '';
  if (oralMicStatus) {
    oralMicStatus.textContent = 'Tap microphone and speak your answer';
    oralMicStatus.classList.remove('active');
  }
  if (oralMicBtn) oralMicBtn.classList.remove('listening');
  if (oralFeedbackCard) oralFeedbackCard.classList.add('hidden');
  if (oralSubmitAnswerBtn) oralSubmitAnswerBtn.disabled = false;
  if (oralSkipQuestionBtn) oralSkipQuestionBtn.disabled = false;

  // Speak question
  const selectedLang = oralTestLangSelect ? oralTestLangSelect.value : 'indian_english';
  speakMascotVoice(`Question ${qNum}. ${q.question}`, selectedLang);
}

// Oral Speech Recognition Toggle
function setupOralSpeechRecognition() {
  if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
    if (oralMicStatus) oralMicStatus.textContent = 'Speech recognition not supported. You can type your answer below.';
    return;
  }

  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  oralRecognition = new SpeechRec();
  oralRecognition.continuous = false;
  oralRecognition.interimResults = true;

  oralRecognition.onstart = () => {
    isOralListening = true;
    if (oralMicBtn) oralMicBtn.classList.add('listening');
    if (oralMicStatus) {
      oralMicStatus.textContent = 'Listening to you... बोलिए 🎙️';
      oralMicStatus.classList.add('active');
    }
  };

  oralRecognition.onresult = (e) => {
    let transcript = '';
    for (let i = e.resultIndex; i < e.results.length; ++i) {
      transcript += e.results[i][0].transcript;
    }
    if (oralTranscriptInput && transcript) {
      oralTranscriptInput.value = transcript;
    }
  };

  oralRecognition.onerror = (e) => {
    console.warn('Oral recognition error:', e);
    isOralListening = false;
    if (oralMicBtn) oralMicBtn.classList.remove('listening');
    if (oralMicStatus) {
      oralMicStatus.textContent = 'Tap microphone to speak again';
      oralMicStatus.classList.remove('active');
    }
  };

  oralRecognition.onend = () => {
    isOralListening = false;
    if (oralMicBtn) oralMicBtn.classList.remove('listening');
    if (oralMicStatus) {
      oralMicStatus.textContent = 'Voice captured! Tap Submit or speak more.';
      oralMicStatus.classList.remove('active');
    }
  };
}

function toggleOralListening() {
  unlockAudioContext();
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  if (oralMascotHead) oralMascotHead.classList.remove('speaking');

  if (!oralRecognition) {
    setupOralSpeechRecognition();
  }

  if (!oralRecognition) {
    if (oralTranscriptInput) oralTranscriptInput.focus();
    return;
  }

  if (isOralListening) {
    try { oralRecognition.stop(); } catch(e){}
    isOralListening = false;
  } else {
    const selectedLang = oralTestLangSelect ? oralTestLangSelect.value : 'indian_english';
    oralRecognition.lang = (selectedLang === 'hindi') ? 'hi-IN' : 'en-IN';
    try {
      oralRecognition.start();
    } catch(err) {
      console.warn('Recognition start retry:', err);
    }
  }
}

// Stopwords set for keyword extraction
const STOP_WORDS = new Set([
  'the', 'is', 'are', 'was', 'were', 'and', 'that', 'this', 'with', 'from',
  'have', 'has', 'had', 'what', 'when', 'where', 'which', 'who', 'whom',
  'their', 'there', 'they', 'them', 'about', 'into', 'some', 'any', 'each',
  'more', 'most', 'very', 'been', 'being', 'also', 'because', 'does', 'did',
  'than', 'then', 'will', 'would', 'could', 'should', 'called', 'known'
]);

function extractKeywords(text) {
  if (!text) return [];
  const words = text.toLowerCase()
    .replace(/[^a-z0-9\u0900-\u097F\s]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOP_WORDS.has(w));
  return Array.from(new Set(words));
}

// Evaluate Student Spoken Answer
function evaluateOralAnswer(isSkip = false) {
  if (isOralListening && oralRecognition) {
    try { oralRecognition.stop(); } catch(e){}
  }

  const q = activeOralQuestions[currentOralIdx];
  const studentText = (oralTranscriptInput ? oralTranscriptInput.value : '').trim();
  const expectedAnswer = q.answer || '';
  const expectedKeywords = extractKeywords(expectedAnswer);

  let questionScore = 0;
  let verdict = 'Needs Revision';
  let speechMsg = '';
  let matchedKeywords = [];
  let missingKeywords = [];

  if (isSkip || !studentText) {
    questionScore = 0;
    verdict = isSkip ? 'Question Skipped' : 'No Answer Provided';
    speechMsg = "No worries! Let's examine the textbook answer so you can master it.";
    missingKeywords = expectedKeywords.slice(0, 4);
  } else {
    const studentWords = new Set(
      studentText.toLowerCase()
        .replace(/[^a-z0-9\u0900-\u097F\s]/gi, ' ')
        .split(/\s+/)
    );

    matchedKeywords = expectedKeywords.filter(kw => studentWords.has(kw));
    missingKeywords = expectedKeywords.filter(kw => !studentWords.has(kw));

    const matchRatio = expectedKeywords.length > 0 ? (matchedKeywords.length / expectedKeywords.length) : 0.5;

    if (matchRatio >= 0.4 || matchedKeywords.length >= 3) {
      questionScore = 2;
      verdict = '⭐⭐ Outstanding Answer!';
      speechMsg = 'Brilliant! You captured the fundamental concepts and explained them clearly.';
    } else if (matchRatio >= 0.15 || matchedKeywords.length >= 1 || studentText.split(/\s+/).length >= 5) {
      questionScore = 1;
      verdict = '⭐ Good Effort!';
      speechMsg = 'Good attempt! You mentioned key points. Review the textbook answer to get full marks next time.';
    } else {
      questionScore = 0;
      verdict = 'Needs Revision';
      speechMsg = "Keep practicing! Review the model answer below to strengthen your understanding.";
    }
  }

  oralTotalScore += questionScore;
  if (oralTestScoreBadge) oralTestScoreBadge.textContent = `Score: ${oralTotalScore} / ${oralMaxPossibleScore}`;

  // Save record
  oralUserAnswersRecord.push({
    question: q.question,
    expectedAnswer: expectedAnswer,
    studentAnswer: studentText || '(Skipped / No answer spoken)',
    score: questionScore,
    maxScore: 2,
    verdict: verdict,
    matchedKeywords: matchedKeywords,
    missingKeywords: missingKeywords.slice(0, 4)
  });

  // Display Feedback Card
  if (oralFeedbackCard) {
    oralFeedbackCard.classList.remove('hidden');
    if (oralFeedbackScoreBadge) oralFeedbackScoreBadge.textContent = `Score: ${questionScore} / 2 Marks`;
    if (oralFeedbackVerdict) oralFeedbackVerdict.textContent = verdict;
    if (oralFeedbackSpeechMsg) oralFeedbackSpeechMsg.textContent = speechMsg;

    if (oralKeywordsMatchedList) {
      oralKeywordsMatchedList.innerHTML = '';
      if (matchedKeywords.length > 0) {
        matchedKeywords.forEach(kw => {
          const tag = document.createElement('span');
          tag.className = 'kw-tag';
          tag.innerHTML = `✓ ${kw}`;
          oralKeywordsMatchedList.appendChild(tag);
        });
      }
      if (missingKeywords.length > 0) {
        missingKeywords.slice(0, 3).forEach(kw => {
          const tag = document.createElement('span');
          tag.className = 'kw-tag missing';
          tag.innerHTML = `✗ ${kw}`;
          oralKeywordsMatchedList.appendChild(tag);
        });
      }
      if (matchedKeywords.length === 0 && missingKeywords.length === 0) {
        oralKeywordsMatchedList.innerHTML = '<span style="font-size: 0.8rem; color: #888;">General conceptual response</span>';
      }
    }

    if (oralModelAnswerText) {
      oralModelAnswerText.textContent = expectedAnswer || 'Refer to chapter textbook notes.';
    }
  }

  if (oralSubmitAnswerBtn) oralSubmitAnswerBtn.disabled = true;
  if (oralSkipQuestionBtn) oralSkipQuestionBtn.disabled = true;

  // Speak short feedback
  const selectedLang = oralTestLangSelect ? oralTestLangSelect.value : 'indian_english';
  speakMascotVoice(speechMsg, selectedLang);
}

// Show Final Viva Results & Scorecard
function showOralTestResults() {
  if (oralTestActiveView) oralTestActiveView.classList.add('hidden');
  if (oralTestResultView) oralTestResultView.classList.remove('hidden');

  const totalPossible = oralMaxPossibleScore || (activeOralQuestions.length * 2);
  const percentage = totalPossible > 0 ? Math.round((oralTotalScore / totalPossible) * 100) : 0;
  const perfectCount = oralUserAnswersRecord.filter(r => r.score === 2).length;

  if (oralFinalScoreVal) oralFinalScoreVal.textContent = `${oralTotalScore} / ${totalPossible}`;
  if (oralMetricTotal) oralMetricTotal.textContent = activeOralQuestions.length;
  if (oralMetricPerfect) oralMetricPerfect.textContent = perfectCount;
  if (oralMetricAccuracy) oralMetricAccuracy.textContent = `${percentage}%`;

  let badgeTitle = '🌟 Concept Master (A+ Grade)';
  let badgeDesc = 'Exceptional conceptual clarity, vocabulary, and speaking confidence!';
  let cheerAudio = "Outstanding performance in your Viva! You know your chapter inside out.";

  if (percentage < 50) {
    badgeTitle = '🌱 Budding Scholar (Needs Revision)';
    badgeDesc = 'Good start! Revisit the key chapter definitions and practice speaking them aloud.';
    cheerAudio = "Good effort! Practice makes perfect. Review your notes and try again!";
  } else if (percentage < 75) {
    badgeTitle = '🎯 Rising Achiever (B Grade)';
    badgeDesc = 'Strong grasp of basic concepts. A little more revision will make you unbeatable!';
    cheerAudio = "Well done! You have a good grasp of the concepts.";
  }

  if (oralAwardBadge) oralAwardBadge.textContent = badgeTitle;
  if (oralAwardDescription) oralAwardDescription.textContent = badgeDesc;

  // Render question breakdown list
  if (oralBreakdownList) {
    oralBreakdownList.innerHTML = '';
    oralUserAnswersRecord.forEach((rec, idx) => {
      const row = document.createElement('div');
      row.className = 'breakdown-row';

      let markClass = 'zero';
      if (rec.score === 2) markClass = 'perfect';
      else if (rec.score === 1) markClass = 'partial';

      row.innerHTML = `
        <div class="breakdown-top">
          <span class="breakdown-q">${idx + 1}. ${rec.question}</span>
          <span class="breakdown-marks ${markClass}">${rec.score} / ${rec.maxScore} Marks</span>
        </div>
        <div class="breakdown-spoken"><strong>Your Response:</strong> "${rec.studentAnswer}"</div>
        <div class="breakdown-model"><strong>Reference:</strong> ${rec.expectedAnswer}</div>
      `;
      oralBreakdownList.appendChild(row);
    });
  }

  const selectedLang = oralTestLangSelect ? oralTestLangSelect.value : 'indian_english';
  speakMascotVoice(cheerAudio, selectedLang);
}

// Print Viva Report Sheet
function printOralScorecard() {
  const studentName = prompt('Enter Student Name for Viva Report:', 'Student Scholar') || 'Student Scholar';
  const schoolName = localStorage.getItem('studybuddy_worksheet_school') || '';
  const now = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const chapLabel = (currentChapter && currentChapter !== 'All Chapters') ? currentChapter : 'All Chapters';
  const totalPossible = oralMaxPossibleScore || (activeOralQuestions.length * 2);
  const percentage = totalPossible > 0 ? Math.round((oralTotalScore / totalPossible) * 100) : 0;

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to print/save your Viva report!');
    return;
  }

  let rowsHtml = '';
  oralUserAnswersRecord.forEach((rec, idx) => {
    rowsHtml += `
      <div style="margin-bottom: 1rem; padding-bottom: 0.8rem; border-bottom: 1px solid #ddd;">
        <div style="font-weight: 700; font-size: 1rem; color: #1e1938;">Q${idx + 1}: ${rec.question} <span style="float: right; color: ${rec.score === 2 ? '#15803d' : '#b45309'};">[Marks: ${rec.score}/${rec.maxScore}]</span></div>
        <div style="font-size: 0.9rem; color: #444; margin-top: 0.3rem;"><strong>Student's Spoken Answer:</strong> "${rec.studentAnswer}"</div>
        <div style="font-size: 0.85rem; color: #047857; margin-top: 0.2rem; background: #f0fdf4; padding: 0.3rem 0.5rem; border-radius: 4px;"><strong>Textbook Key Concept:</strong> ${rec.expectedAnswer}</div>
      </div>
    `;
  });

  printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Oral Assessment (Voice Viva) Report - ${studentName}</title>
  <style>
    @page { size: portrait; margin: 1.5cm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Baloo 2", Arial, sans-serif; margin: 0; padding: 1.5rem; color: #222; }
    .header { text-align: center; border-bottom: 2px solid #2b3a8c; padding-bottom: 1rem; margin-bottom: 1.5rem; }
    .school { font-size: 1.4rem; font-weight: 800; color: #1a237e; text-transform: uppercase; }
    .title { font-size: 1.2rem; font-weight: 700; color: #4f46e5; margin: 0.3rem 0; }
    .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 1.5rem; background: #f8fafc; border-radius: 8px; overflow: hidden; }
    .meta-table td { padding: 0.5rem 1rem; border: 1px solid #e2e8f0; font-size: 0.9rem; }
    .score-banner { background: #eef2ff; border: 1.5px solid #c7d2fe; border-radius: 10px; padding: 1rem 1.5rem; display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
    .score-val { font-size: 1.6rem; font-weight: 800; color: #4338ca; }
    .sign-row { display: flex; justify-content: space-between; margin-top: 3rem; }
    .sign-box { text-align: center; width: 180px; border-top: 1.5px solid #333; padding-top: 0.3rem; font-size: 0.85rem; font-weight: 600; }
  </style>
</head>
<body>
  <div class="header">
    ${schoolName ? `<div class="school">${schoolName}</div>` : ''}
    <div class="title">STUDENT ORAL ASSESSMENT / VOICE VIVA REPORT</div>
    <div style="font-size: 0.88rem; color: #64748b;">Conducted via Study Buddy AI Interactive Voice Suite</div>
  </div>

  <table class="meta-table">
    <tr>
      <td><strong>Student Name:</strong> ${studentName}</td>
      <td><strong>Date:</strong> ${now}</td>
    </tr>
    <tr>
      <td><strong>Class & Subject:</strong> ${currentClass || 'Class 3'} • ${currentBook || 'Ripples'}</td>
      <td><strong>Chapter:</strong> ${chapLabel}</td>
    </tr>
  </table>

  <div class="score-banner">
    <div>
      <div style="font-size: 0.8rem; text-transform: uppercase; color: #6366f1; font-weight: 700;">Overall Viva Performance</div>
      <div style="font-size: 1.1rem; font-weight: 700; color: #1e1b4b;">${oralAwardBadge ? oralAwardBadge.textContent : 'Concept Master'}</div>
    </div>
    <div class="score-val">${oralTotalScore} / ${totalPossible} (${percentage}%)</div>
  </div>

  <h3 style="color: #1e1b4b; border-bottom: 1px solid #cbd5e1; padding-bottom: 0.4rem; font-size: 1.05rem;">Detailed Question Evaluation</h3>
  <div>${rowsHtml}</div>

  <div class="sign-row">
    <div class="sign-box">Student Signature</div>
    <div class="sign-box">Examiner / Teacher Signature</div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 250);
    };
  <\/script>
</body>
</html>`);
  printWindow.document.close();
}

// Bind Oral Test Event Listeners
if (oralTestBtn) oralTestBtn.addEventListener('click', openOralTestModal);
if (closeOralTestConfigBtn) closeOralTestConfigBtn.addEventListener('click', closeOralTestModal);
if (closeOralTestActiveBtn) closeOralTestActiveBtn.addEventListener('click', closeOralTestModal);
if (oralCloseResultBtn) oralCloseResultBtn.addEventListener('click', closeOralTestModal);
if (startOralTestBtn) startOralTestBtn.addEventListener('click', startOralTestSession);
if (oralMicBtn) oralMicBtn.addEventListener('click', toggleOralListening);
if (oralClearTranscriptBtn) oralClearTranscriptBtn.addEventListener('click', () => {
  if (oralTranscriptInput) oralTranscriptInput.value = '';
});
if (oralSkipQuestionBtn) oralSkipQuestionBtn.addEventListener('click', () => evaluateOralAnswer(true));
if (oralSubmitAnswerBtn) oralSubmitAnswerBtn.addEventListener('click', () => evaluateOralAnswer(false));
if (oralReplayAudioBtn) oralReplayAudioBtn.addEventListener('click', () => {
  const q = activeOralQuestions[currentOralIdx];
  if (q) {
    const selectedLang = oralTestLangSelect ? oralTestLangSelect.value : 'indian_english';
    speakMascotVoice(`Question ${currentOralIdx + 1}. ${q.question}`, selectedLang);
  }
});
if (oralNextQuestionBtn) oralNextQuestionBtn.addEventListener('click', () => {
  currentOralIdx++;
  renderCurrentOralQuestion();
});
if (oralRetakeBtn) oralRetakeBtn.addEventListener('click', startOralTestSession);
if (oralPrintScorecardBtn) oralPrintScorecardBtn.addEventListener('click', printOralScorecard);

// Close on Escape or Backdrop click
if (oralTestModal) {
  oralTestModal.addEventListener('click', (e) => {
    if (e.target === oralTestModal) closeOralTestModal();
  });
}
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && oralTestModal && !oralTestModal.classList.contains('hidden')) {
    closeOralTestModal();
  }
});

/* ==========================================================================
   Interactive Concept Mind Map Engine Implementation
   ========================================================================== */
const mindMapBtn = document.getElementById('mindMapBtn');
const mindMapModal = document.getElementById('mindMapModal');
const closeMindMapBtn = document.getElementById('closeMindMapBtn');
const closeMindMapEmptyBtn = document.getElementById('closeMindMapEmptyBtn');
const mindMapSubtitle = document.getElementById('mindMapSubtitle');
const mindMapZoomInBtn = document.getElementById('mindMapZoomInBtn');
const mindMapZoomOutBtn = document.getElementById('mindMapZoomOutBtn');
const mindMapResetZoomBtn = document.getElementById('mindMapResetZoomBtn');
const mindMapPrintPosterBtn = document.getElementById('mindMapPrintPosterBtn');
const mindMapPdfBtn = document.getElementById('mindMapPdfBtn');
const mindMapEmptyNotice = document.getElementById('mindMapEmptyNotice');
const mindMapPosterWrap = document.getElementById('mindMapPosterWrap');
const mindMapPosterImg = document.getElementById('mindMapPosterImg');

const mindMapViewport = document.getElementById('mindMapViewport');
const mindMapLoading = document.getElementById('mindMapLoading');
const mindMapCanvasWrap = document.getElementById('mindMapCanvasWrap');
const mindMapSvg = document.getElementById('mindMapSvg');
const mindMapLinksGroup = document.getElementById('mindMapLinksGroup');
const mindMapNodesGroup = document.getElementById('mindMapNodesGroup');

const conceptSpotlightDrawer = document.getElementById('conceptSpotlightDrawer');
const spotlightCategory = document.getElementById('spotlightCategory');
const spotlightTitle = document.getElementById('spotlightTitle');
const spotlightContent = document.getElementById('spotlightContent');
const spotlightDiagramWrap = document.getElementById('spotlightDiagramWrap');
const spotlightImg = document.getElementById('spotlightImg');
const closeSpotlightBtn = document.getElementById('closeSpotlightBtn');

let mindMapCurrentZoom = 1;
let allMindMapQuestions = [];

function closeMindMapModal() {
  if (mindMapModal) mindMapModal.classList.add('hidden');
  if (conceptSpotlightDrawer) conceptSpotlightDrawer.classList.add('hidden');
}

if (closeMindMapEmptyBtn) closeMindMapEmptyBtn.addEventListener('click', closeMindMapModal);

function updateMindMapZoom(newZoom) {
  mindMapCurrentZoom = Math.min(Math.max(newZoom, 0.5), 2.2);
  if (mindMapCanvasWrap) {
    mindMapCanvasWrap.style.transform = `scale(${mindMapCurrentZoom})`;
  }
  if (mindMapPosterImg) {
    mindMapPosterImg.style.transform = `scale(${mindMapCurrentZoom})`;
  }
}

async function openMindMapModal() {
  unlockAudioContext();
  if (!mindMapModal) return;

  mindMapModal.classList.remove('hidden');
  if (conceptSpotlightDrawer) conceptSpotlightDrawer.classList.add('hidden');
  if (mindMapLoading) mindMapLoading.classList.remove('hidden');
  if (mindMapEmptyNotice) mindMapEmptyNotice.classList.add('hidden');
  if (mindMapPosterWrap) mindMapPosterWrap.classList.add('hidden');
  if (mindMapCanvasWrap) mindMapCanvasWrap.classList.add('hidden');
  if (mindMapPdfBtn) mindMapPdfBtn.classList.add('hidden');
  updateMindMapZoom(1);

  const chapLabel = (currentChapter && currentChapter !== 'All Chapters') ? ` • Chapter: ${currentChapter}` : '';
  if (mindMapSubtitle) {
    mindMapSubtitle.textContent = `${currentClass || 'Class 3'} • ${currentBook || 'Ripples'}${chapLabel}`;
  }

  try {
    const pedUrl = `${PEDAGOGY_API_URL}?className=${encodeURIComponent(currentClass || 'Class 3')}&bookName=${encodeURIComponent(currentBook || 'Ripples')}&chapterName=${encodeURIComponent(currentChapter || 'All Chapters')}`;
    const pedRes = await fetch(pedUrl);
    const pedData = await pedRes.json();
    activeDbMindMap = (pedData.exists && pedData.data && pedData.data.mindMap) ? pedData.data.mindMap : null;

    if (mindMapLoading) mindMapLoading.classList.add('hidden');

    if (activeDbMindMap) {
      if (activeDbMindMap.pdfUrl && mindMapPdfBtn) {
        mindMapPdfBtn.href = activeDbMindMap.pdfUrl;
        mindMapPdfBtn.classList.remove('hidden');
      }

      if (activeDbMindMap.imageUrl) {
        if (mindMapPosterWrap && mindMapPosterImg) {
          mindMapPosterImg.src = activeDbMindMap.imageUrl;
          mindMapPosterWrap.classList.remove('hidden');
        }
      } else if (activeDbMindMap.branches && activeDbMindMap.branches.length > 0) {
        if (mindMapCanvasWrap) mindMapCanvasWrap.classList.remove('hidden');
        renderConceptMindMap();
      } else {
        if (mindMapEmptyNotice) mindMapEmptyNotice.classList.remove('hidden');
      }
    } else {
      if (mindMapEmptyNotice) {
        mindMapEmptyNotice.classList.remove('hidden');
        const emptyTxt = document.getElementById('mindMapEmptyText');
        if (emptyTxt) {
          emptyTxt.textContent = `Mind Map is not configured yet for ${currentClass || 'Class 3'} • ${currentBook || 'Ripples'}${chapLabel}.`;
        }
      }
    }
  } catch (err) {
    console.warn('Failed to load mind map:', err);
    if (mindMapLoading) mindMapLoading.classList.add('hidden');
    if (mindMapEmptyNotice) mindMapEmptyNotice.classList.remove('hidden');
  }
}

function categorizeMindMapData(questions) {
  const categories = [
    {
      id: 'fundamentals',
      name: 'Core Definitions & Concepts',
      color: '#6366f1',
      items: []
    },
    {
      id: 'processes',
      name: 'Processes & Mechanisms',
      color: '#059669',
      items: []
    },
    {
      id: 'structures',
      name: 'Structures, Organs & Roles',
      color: '#d97706',
      items: []
    },
    {
      id: 'diagrams',
      name: 'Visual Models & Diagrams',
      color: '#0284c7',
      items: []
    },
    {
      id: 'facts',
      name: 'Key Facts & Applications',
      color: '#db2777',
      items: []
    }
  ];

  if (!questions || questions.length === 0) {
    // Fallback template
    categories[0].items.push({
      shortTitle: 'Water Cycle',
      question: 'What is the water cycle?',
      answer: "The continuous movement of water from the earth's surface to the atmosphere and back."
    });
    categories[1].items.push({
      shortTitle: 'Evaporation',
      question: 'What is evaporation?',
      answer: 'The process of turning liquid water into vapor through heat.'
    });
    categories[2].items.push({
      shortTitle: 'Heart Function',
      question: 'Which organ pumps blood throughout the body?',
      answer: 'The heart pumps blood through arteries and veins to all organs.'
    });
    return categories;
  }

  questions.forEach((q) => {
    const text = (q.question || '').toLowerCase();
    const ans = (q.answer || '').toLowerCase();
    const hasImg = Boolean(q.imageUrl && q.imageUrl.trim());

    // Clean title for leaf node (max 30 chars)
    let short = q.question.replace(/^(what is|explain|define|how does|which|name the|why do)\s+/i, '');
    short = short.replace(/[?.!:]+$/, '').trim();
    if (short.length > 24) short = short.substring(0, 24) + '...';
    if (!short) short = 'Concept Fact';

    const itemObj = {
      shortTitle: short,
      question: q.question,
      answer: q.answer,
      imageUrl: q.imageUrl
    };

    if (hasImg) {
      categories[3].items.push(itemObj);
    } else if (/how|process|cycle|movement|flow|steps|condensation|evaporation/i.test(text + ' ' + ans)) {
      categories[1].items.push(itemObj);
    } else if (/organ|pump|blood|body|function|muscle|structure|brain|heart|lungs/i.test(text + ' ' + ans)) {
      categories[2].items.push(itemObj);
    } else if (/define|definition|what is|meaning|called|term/i.test(text)) {
      categories[0].items.push(itemObj);
    } else {
      categories[4].items.push(itemObj);
    }
  });

  // Filter out completely empty branches and limit leaves to 4 per branch
  return categories.filter(c => c.items.length > 0).map(c => ({
    ...c,
    items: c.items.slice(0, 4)
  }));
}

function renderConceptMindMap() {
  if (!mindMapSvg || !mindMapLinksGroup || !mindMapNodesGroup) return;

  mindMapLinksGroup.innerHTML = '';
  mindMapNodesGroup.innerHTML = '';

  let categories = [];
  if (activeDbMindMap && activeDbMindMap.branches && activeDbMindMap.branches.length > 0) {
    categories = activeDbMindMap.branches.map(b => ({
      id: b.id || 'branch',
      name: b.title,
      color: b.color || '#6366f1',
      items: (b.subtopics || []).map(s => ({
        shortTitle: s.name,
        question: s.name,
        answer: s.detail || s.name,
        imageUrl: ''
      }))
    }));
  } else {
    categories = categorizeMindMapData(allMindMapQuestions);
  }

  // 1. Distribute Branches (Left & Right)
  const leftBranches = [];
  const rightBranches = [];

  categories.forEach((cat, idx) => {
    if (idx % 2 === 0) {
      rightBranches.push(cat);
    } else {
      leftBranches.push(cat);
    }
  });

  const maxSideBranches = Math.max(leftBranches.length, rightBranches.length, 1);
  const svgWidth = 1180;
  // Calculate dynamic height so 1 or 2 branches don't get squashed or lost in a huge empty box
  const svgHeight = maxSideBranches === 1 ? 400 : (maxSideBranches === 2 ? 540 : 700);
  const cx = svgWidth / 2;
  const cy = svgHeight / 2;

  // Set SVG viewbox
  mindMapSvg.setAttribute('viewBox', `0 0 ${svgWidth} ${svgHeight}`);

  // 2. Render Center Root Node
  const rootTitle = (activeDbMindMap && activeDbMindMap.centralTopic)
    ? activeDbMindMap.centralTopic
    : ((currentChapter && currentChapter !== 'All Chapters') ? currentChapter : (currentBook || 'Study Buddy'));
  const rootG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  rootG.setAttribute('class', 'node-root');
  rootG.setAttribute('transform', `translate(${cx}, ${cy})`);

  const rootRectW = Math.max(180, rootTitle.length * 9.5 + 40);
  const rootRectH = 50;

  const rootRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rootRect.setAttribute('x', -rootRectW / 2);
  rootRect.setAttribute('y', -rootRectH / 2);
  rootRect.setAttribute('width', rootRectW);
  rootRect.setAttribute('height', rootRectH);
  rootRect.setAttribute('fill', '#4338ca');
  rootRect.setAttribute('stroke', '#312e81');
  rootRect.setAttribute('stroke-width', '2');
  rootRect.setAttribute('rx', '18');
  rootRect.setAttribute('ry', '18');

  const rootText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  rootText.textContent = `📖 ${rootTitle}`;
  rootText.setAttribute('fill', '#ffffff');
  rootText.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Baloo 2", sans-serif');
  rootText.setAttribute('font-weight', '700');
  rootText.setAttribute('font-size', '15px');
  rootText.setAttribute('text-anchor', 'middle');
  rootText.setAttribute('dominant-baseline', 'central');

  rootG.appendChild(rootRect);
  rootG.appendChild(rootText);
  rootG.addEventListener('click', () => {
    openSpotlight({
      category: 'Chapter Overview',
      question: rootTitle,
      answer: `Central theme covering all concepts, definitions, diagrams, and processes in ${currentBook || 'this book'}.`
    });
  });

  // Helper to draw smooth bezier link
  function drawCurvedLink(x1, y1, x2, y2, color = '#cbd5e1') {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const dx = Math.abs(x2 - x1) * 0.55;
    const d = `M ${x1} ${y1} C ${x1 + (x2 > x1 ? dx : -dx)} ${y1}, ${x2 - (x2 > x1 ? dx : -dx)} ${y2}, ${x2} ${y2}`;
    path.setAttribute('d', d);
    path.setAttribute('class', 'mindmap-link');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', '2.5');
    path.setAttribute('stroke-linecap', 'round');
    mindMapLinksGroup.appendChild(path);
    return path;
  }

  // Helper to render branch side
  function renderSideBranches(branches, isRight) {
    const count = branches.length;
    if (count === 0) return;

    const startY = count === 1 ? cy : 120;
    const availableH = svgHeight - 240;
    const branchSpacing = count > 1 ? availableH / (count - 1) : 0;

    branches.forEach((branch, bIdx) => {
      const bx = isRight ? (cx + 250) : (cx - 250);
      const by = count === 1 ? cy : (startY + bIdx * branchSpacing);

      // Link Root -> Branch
      const rootEdgeX = isRight ? (cx + rootRectW / 2) : (cx - rootRectW / 2);
      drawCurvedLink(rootEdgeX, cy, isRight ? (bx - 90) : (bx + 90), by, branch.color);

      // Branch Group
      const branchG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      branchG.setAttribute('class', 'node-branch');
      branchG.setAttribute('transform', `translate(${bx}, ${by})`);

      const bRectW = 190;
      const bRectH = 40;
      const bRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bRect.setAttribute('x', -bRectW / 2);
      bRect.setAttribute('y', -bRectH / 2);
      bRect.setAttribute('width', bRectW);
      bRect.setAttribute('height', bRectH);
      bRect.setAttribute('fill', branch.color);
      bRect.setAttribute('rx', '12');
      bRect.setAttribute('ry', '12');

      const bText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      bText.textContent = branch.name.length > 22 ? (branch.name.substring(0, 20) + '..') : branch.name;
      bText.setAttribute('fill', '#ffffff');
      bText.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
      bText.setAttribute('font-weight', '700');
      bText.setAttribute('font-size', '13px');
      bText.setAttribute('text-anchor', 'middle');
      bText.setAttribute('dominant-baseline', 'central');

      branchG.appendChild(bRect);
      branchG.appendChild(bText);
      branchG.addEventListener('click', () => {
        openSpotlight({
          category: 'Topic Theme',
          question: branch.name,
          answer: `Contains ${branch.items.length} critical concepts and questions from this section.`
        });
      });
      mindMapNodesGroup.appendChild(branchG);

      // Render Leaves for this branch
      const leafCount = branch.items.length;
      if (leafCount > 0) {
        const leafSpread = Math.min(leafCount * 54, count === 1 ? 220 : 140);
        const leafStartY = by - (leafSpread / 2);
        const leafStep = leafCount > 1 ? leafSpread / (leafCount - 1) : 0;

        branch.items.forEach((item, lIdx) => {
          const lx = isRight ? (bx + 210) : (bx - 210);
          const ly = leafCount === 1 ? by : (leafStartY + lIdx * leafStep);

          // Link Branch -> Leaf
          const bEdgeX = isRight ? (bx + bRectW / 2) : (bx - bRectW / 2);
          drawCurvedLink(bEdgeX, by, isRight ? (lx - 85) : (lx + 85), ly, branch.color);

          // Leaf Group
          const leafG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          leafG.setAttribute('class', 'node-leaf');
          leafG.setAttribute('transform', `translate(${lx}, ${ly})`);

          const lRectW = Math.max(160, Math.min(220, item.shortTitle.length * 8.5 + 24));
          const lRectH = 32;
          const lRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          lRect.setAttribute('x', -lRectW / 2);
          lRect.setAttribute('y', -lRectH / 2);
          lRect.setAttribute('width', lRectW);
          lRect.setAttribute('height', lRectH);
          lRect.setAttribute('fill', '#ffffff');
          lRect.setAttribute('stroke', branch.color || '#6366f1');
          lRect.setAttribute('stroke-width', '1.8');
          lRect.setAttribute('rx', '8');
          lRect.setAttribute('ry', '8');

          const lText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          lText.textContent = item.shortTitle;
          lText.setAttribute('fill', '#0f172a');
          lText.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
          lText.setAttribute('font-weight', '600');
          lText.setAttribute('font-size', '12px');
          lText.setAttribute('text-anchor', 'middle');
          lText.setAttribute('dominant-baseline', 'central');

          leafG.appendChild(lRect);
          leafG.appendChild(lText);
          leafG.addEventListener('click', () => {
            openSpotlight({
              category: branch.name,
              question: item.question,
              answer: item.answer,
              imageUrl: item.imageUrl
            });
          });
          mindMapNodesGroup.appendChild(leafG);
        });
      }
    });
  }

  renderSideBranches(rightBranches, true);
  renderSideBranches(leftBranches, false);

  // Append central root at top z-index
  mindMapNodesGroup.appendChild(rootG);
}

// Concept Spotlight Drawer Popup
function openSpotlight(item) {
  if (!conceptSpotlightDrawer) return;

  if (spotlightCategory) spotlightCategory.textContent = item.category || 'Concept Spotlight';
  if (spotlightTitle) spotlightTitle.textContent = item.question || item.title || 'Core Idea';
  if (spotlightContent) spotlightContent.textContent = item.answer || 'Detailed chapter notes.';

  if (spotlightDiagramWrap && spotlightImg) {
    if (item.imageUrl && item.imageUrl.trim()) {
      spotlightImg.src = item.imageUrl.trim();
      spotlightDiagramWrap.classList.remove('hidden');
      spotlightImg.onclick = () => {
        if (typeof openLightbox === 'function') openLightbox(item.imageUrl.trim());
      };
    } else {
      spotlightDiagramWrap.classList.add('hidden');
      spotlightImg.src = '';
    }
  }

  conceptSpotlightDrawer.classList.remove('hidden');
}

if (closeSpotlightBtn) {
  closeSpotlightBtn.addEventListener('click', () => {
    if (conceptSpotlightDrawer) conceptSpotlightDrawer.classList.add('hidden');
  });
}

// Zoom and Pan Controls
if (mindMapZoomInBtn) mindMapZoomInBtn.addEventListener('click', () => updateMindMapZoom(mindMapCurrentZoom + 0.15));
if (mindMapZoomOutBtn) mindMapZoomOutBtn.addEventListener('click', () => updateMindMapZoom(mindMapCurrentZoom - 0.15));
if (mindMapResetZoomBtn) mindMapResetZoomBtn.addEventListener('click', () => updateMindMapZoom(1));

// Print Mind Map Landscape Poster
function printMindMapPoster() {
  const schoolName = localStorage.getItem('studybuddy_worksheet_school') || '';
  const chapLabel = (currentChapter && currentChapter !== 'All Chapters') ? currentChapter : 'All Chapters';
  const now = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  const svgContent = mindMapSvg ? mindMapSvg.outerHTML : '';

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to print/save your Mind Map poster!');
    return;
  }

  printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Chapter Concept Mind Map - ${chapLabel}</title>
  <style>
    @page { size: landscape; margin: 0.8cm; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Baloo 2", Arial, sans-serif;
      margin: 0;
      padding: 0.8rem;
      color: #1e293b;
      background: #ffffff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .poster-header {
      text-align: center;
      border-bottom: 2.5px solid #4338ca;
      padding-bottom: 0.5rem;
      margin-bottom: 0.8rem;
    }
    .school {
      font-size: 1.25rem;
      font-weight: 800;
      color: #1e1b4b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 2px;
    }
    .title {
      font-size: 1.45rem;
      font-weight: 900;
      color: #4338ca;
      margin: 0.15rem 0;
      letter-spacing: 0.5px;
    }
    .sub {
      font-size: 0.95rem;
      font-weight: 600;
      color: #475569;
    }
    .svg-container {
      width: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      background: #ffffff;
      border: 1.5px solid #e2e8f0;
      border-radius: 12px;
      padding: 16px;
    }
    svg {
      width: 100%;
      height: auto;
      max-height: 76vh;
    }
    /* Explicit Vector Print Styles - Guarantees zero black boxes */
    .node-root rect { fill: #4338ca !important; rx: 18px; }
    .node-root text { fill: #ffffff !important; font-weight: 700; font-size: 15px; }
    .node-branch rect { rx: 12px; }
    .node-branch text { fill: #ffffff !important; font-weight: 700; font-size: 13px; }
    .node-leaf rect { fill: #ffffff !important; stroke-width: 1.8px !important; rx: 8px; }
    .node-leaf text { fill: #0f172a !important; font-weight: 600; font-size: 12px; }
    .mindmap-link { fill: none !important; stroke-linecap: round; }
    .poster-footer {
      display: flex;
      justify-content: space-between;
      margin-top: 0.8rem;
      font-size: 0.8rem;
      font-weight: 600;
      color: #64748b;
      border-top: 1px dashed #cbd5e1;
      padding-top: 0.4rem;
    }
  </style>
</head>
<body>
  <div class="poster-header">
    ${schoolName ? `<div class="school">${schoolName}</div>` : ''}
    <div class="title">VISUAL CHAPTER CONCEPT MIND MAP</div>
    <div class="sub">${currentClass || 'Class 3'} • ${currentBook || 'Ripples'} • ${chapLabel}</div>
  </div>

  <div class="svg-container">
    ${svgContent}
  </div>

  <div class="poster-footer">
    <div>Generated via Study Buddy AI Concept Learning Suite</div>
    <div>Date: ${now}</div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 250);
    };
  <\/script>
</body>
</html>`);
  printWindow.document.close();
}

if (mindMapPrintPosterBtn) mindMapPrintPosterBtn.addEventListener('click', printMindMapPoster);

// Bind Open and Close Mind Map
if (mindMapBtn) mindMapBtn.addEventListener('click', openMindMapModal);
if (closeMindMapBtn) closeMindMapBtn.addEventListener('click', closeMindMapModal);

if (mindMapModal) {
  mindMapModal.addEventListener('click', (e) => {
    if (e.target === mindMapModal) closeMindMapModal();
  });
}
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && mindMapModal && !mindMapModal.classList.contains('hidden')) {
    closeMindMapModal();
  }
});




