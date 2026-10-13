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
let selectedVoiceName = '';
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

// ---------- Initial Greeting & Speech Engine ----------
function playInitialGreeting() {
  if (!voiceEnabled) return;
  speak(INITIAL_GREETING);
}

// Unlock audio context and play greeting on first user interaction if blocked by browser autoplay policy
function tryGreetingOnGesture() {
  unlockAudioContext();
  if (contextModal && !contextModal.classList.contains('hidden')) return;
  if (!greetingSpoken) {
    playInitialGreeting();
  }
}
document.addEventListener('pointerdown', tryGreetingOnGesture);
document.addEventListener('keydown', tryGreetingOnGesture);

async function speakServerTTS(speechText, lang = 'hi') {
  if (!voiceEnabled) return;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  stopLipSync();

  try {
    const res = await fetch(`${TTS_API_URL}?text=${encodeURIComponent(speechText)}&lang=${lang}`);
    const data = await res.json();

    if (!data.audios || data.audios.length === 0) {
      setTalking(false);
      return;
    }

    let audioIndex = 0;

    function playNextAudio() {
      if (audioIndex >= data.audios.length || !voiceEnabled) {
        setTalking(false);
        return;
      }

      const audio = new Audio(data.audios[audioIndex++]);
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
        console.warn('Base64 Audio play error:', err);
        playNextAudio();
      };

      audio.play().catch((err) => {
        console.warn('Audio play blocked by browser:', err);
        setTalking(false);
      });
    }

    playNextAudio();
  } catch (err) {
    console.warn('Server TTS error:', err);
    setTalking(false);
  }
}

function populateVoiceList() {
  if (!window.speechSynthesis) return;
  const voices = window.speechSynthesis.getVoices();

  // Keep ONLY Hindi and English voices, and EXCLUDE all Microsoft voices
  const allowedVoices = (voices || []).filter((v) => {
    const lang = (v.lang || '').toLowerCase().replace('_', '-');
    const name = (v.name || '').toLowerCase();
    const uri = (v.voiceURI || '').toLowerCase();

    // Strictly exclude all Microsoft voices
    const isMicrosoft = name.includes('microsoft') || uri.includes('microsoft') ||
      name.includes('heera') || name.includes('ravi') || name.includes('zira') ||
      name.includes('david') || name.includes('mark') || name.includes('kalpana') ||
      name.includes('hemant') || name.includes('hazel') || name.includes('george') ||
      name.includes('susan') || name.includes('richard');

    if (isMicrosoft) return false;

    const isHindi = name.includes('hindi') || name.includes('हिन्दी') || lang.startsWith('hi');
    const isEnglish = name.includes('english') || lang.startsWith('en');
    return isHindi || isEnglish;
  });

  // Sort: Google voices first, then others
  const scored = allowedVoices.map((v) => {
    let score = 0;
    const lang = (v.lang || '').toLowerCase().replace('_', '-');
    const name = (v.name || '').toLowerCase();
    const uri = (v.voiceURI || '').toLowerCase();

    const isGoogle = name.includes('google') || uri.includes('google');
    const isHindi = name.includes('hindi') || name.includes('हिन्दी') || lang.startsWith('hi');
    const isIndianEnglish = name.includes('india') || name.includes('indian') || lang === 'en-in';

    if (isGoogle && isHindi) score += 10000;
    else if (isGoogle && isIndianEnglish) score += 4000;
    else if (isGoogle) score += 2000;
    else if (isHindi) score += 1000;

    return { voice: v, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const nativeGoogleHindi = allowedVoices.find((v) => {
    const n = v.name.toLowerCase();
    const u = (v.voiceURI || '').toLowerCase();
    const l = (v.lang || '').toLowerCase();
    return (n.includes('google') || u.includes('google')) && (n.includes('hindi') || n.includes('हिन्दी') || l.startsWith('hi'));
  });

  if (voiceSelect) {
    voiceSelect.innerHTML = '';

    // Offer Hindi (Server AI Voice) at top with 'Google' removed
    const serverOpt = document.createElement('option');
    serverOpt.value = 'google_hindi_server';
    serverOpt.textContent = '✨ Hindi (Server AI Voice)';
    voiceSelect.appendChild(serverOpt);

    scored.forEach((item) => {
      const option = document.createElement('option');
      option.value = item.voice.name;

      // Remove the word 'Google' from display name (e.g. 'Google Hindi', 'Google English', 'Google UK English Female/Male')
      let label = item.voice.name
        .replace(/\bGoogle\b\s*/gi, '')
        .trim();

      // Clean up multiple spaces if any
      label = label.replace(/\s+/g, ' ');

      option.textContent = `✨ ${label}`;
      voiceSelect.appendChild(option);
    });

    if (!userHasChosenVoice) {
      if (nativeGoogleHindi) {
        selectedVoiceName = nativeGoogleHindi.name;
      } else {
        selectedVoiceName = 'google_hindi_server';
      }
    }

    voiceSelect.value = selectedVoiceName;
  }

  if (selectedVoiceName === 'google_hindi_server') {
    cachedVoice = null;
  } else {
    cachedVoice = (voices || []).find((v) => v.name === selectedVoiceName) || null;
  }

  if (hasSavedContext && !greetingSpoken) {
    setTimeout(() => {
      if (!greetingSpoken) playInitialGreeting();
    }, 300);
  }
}

if (voiceSelect) {
  voiceSelect.addEventListener('change', (e) => {
    userHasChosenVoice = true;
    selectedVoiceName = e.target.value;
    if (selectedVoiceName === 'google_hindi_server') {
      cachedVoice = null;
    } else {
      const voices = window.speechSynthesis.getVoices();
      cachedVoice = (voices || []).find((v) => v.name === selectedVoiceName) || null;
    }
  });
}

function pickVoice() {
  if (selectedVoiceName === 'google_hindi_server') return null;
  if (cachedVoice) return cachedVoice;
  populateVoiceList();
  return cachedVoice;
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
  const targetLang = isHindiText ? 'hi' : 'en';

  // If google_hindi_server selected OR if no native Google voice is available in browser
  if (selectedVoiceName === 'google_hindi_server') {
    speakServerTTS(speechText, targetLang);
    return;
  }

  const voice = pickVoice();
  const isGoogleVoice = voice && (voice.name.toLowerCase().includes('google') || (voice.voiceURI && voice.voiceURI.toLowerCase().includes('google')));

  if (!isGoogleVoice && !userHasChosenVoice) {
    // Automatically use Server TTS if native Google voice not present
    speakServerTTS(speechText, targetLang);
    return;
  }

  if (!window.speechSynthesis) {
    speakServerTTS(speechText, targetLang);
    return;
  }

  const utterance = new SpeechSynthesisUtterance(speechText);
  let utteranceVoice = voice;

  // If text is English, make sure we use a voice that can speak English
  if (!isHindiText) {
    const isVoiceHindi = utteranceVoice && (utteranceVoice.lang || '').toLowerCase().startsWith('hi');
    if (!utteranceVoice || isVoiceHindi) {
      const allVoices = (window.speechSynthesis.getVoices() || []);
      const engVoice = allVoices.find((v) => {
        const n = v.name.toLowerCase();
        const l = (v.lang || '').toLowerCase();
        return (n.includes('google') || l.startsWith('en')) && !n.includes('microsoft');
      });
      if (engVoice) utteranceVoice = engVoice;
    }
  }

  if (utteranceVoice) {
    utterance.voice = utteranceVoice;
    utterance.lang = utteranceVoice.lang;
  } else {
    utterance.lang = isHindiText ? 'hi-IN' : 'en-US';
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
    console.warn('SpeechSynthesis error, falling back to Server TTS:', err);
    setTalking(false);
    speakServerTTS(speechText, targetLang);
  };

  window.speechSynthesis.speak(utterance);
}

// Warmup speech synthesis on user interaction to pass mobile browser autoplay restrictions
function unlockAudioContext() {
  if (voiceEnabled && window.speechSynthesis && !window.speechSynthesis.speaking) {
    const silent = new SpeechSynthesisUtterance('');
    silent.volume = 0;
    window.speechSynthesis.speak(silent);
  }
}

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
function addMessage(text, sender, imageUrl = '', shouldSpeak = true) {
  const div = document.createElement('div');
  div.className = `msg ${sender}`;
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
      addMessage(data.answer, 'bot', data.imageUrl);
    } else {
      addMessage(data.message || "I couldn't find an answer for that.", 'bot');
      addSuggestions(data.suggestions);
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

    playInitialGreeting();
  });
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

  if (hasSavedContext) {
    updateContextBadge();
    if (contextModal) contextModal.classList.add('hidden');
    setTimeout(() => {
      if (!greetingSpoken) playInitialGreeting();
    }, 400);
  } else {
    if (contextModal) contextModal.classList.remove('hidden');
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

// Replay welcome message listener
const replayWelcomeBtn = document.getElementById('replayWelcomeBtn');
if (replayWelcomeBtn) {
  replayWelcomeBtn.addEventListener('click', () => {
    unlockAudioContext();
    speak(INITIAL_GREETING);
  });
}

// Start context engine immediately
initContextEngine();
