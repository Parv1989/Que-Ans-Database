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
let selectedVoiceName = 'google_hindi_server';
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
        console.warn('Base64 Audio play error, falling back to US English:', err);
        setTalking(false);
        speakUSEnglishFallback(speechText);
      };

      audio.play().catch((err) => {
        console.warn('Audio play blocked/failed, falling back to US English:', err);
        setTalking(false);
        speakUSEnglishFallback(speechText);
      });
    }

    playNextAudio();
  } catch (err) {
    console.warn('Server TTS unavailable, falling back to US English:', err);
    setTalking(false);
    speakUSEnglishFallback(speechText);
  }
}

// Secondary fallback helper: Find the best available US English voice (Google preferred, Microsoft excluded)
function getUSEnglishVoice() {
  if (!window.speechSynthesis) return null;
  const allVoices = window.speechSynthesis.getVoices() || [];
  const nonMicrosoft = allVoices.filter((v) => {
    const n = v.name.toLowerCase();
    const u = (v.voiceURI || '').toLowerCase();
    return !n.includes('microsoft') && !u.includes('microsoft');
  });

  // 1. Google US English
  const googleUS = nonMicrosoft.find((v) => {
    const n = v.name.toLowerCase();
    const l = (v.lang || '').toLowerCase().replace('_', '-');
    return n.includes('google') && (l === 'en-us' || n.includes('us english') || n.includes('united states'));
  });
  if (googleUS) return googleUS;

  // 2. Any other US English
  const anyUS = nonMicrosoft.find((v) => {
    const n = v.name.toLowerCase();
    const l = (v.lang || '').toLowerCase().replace('_', '-');
    return l === 'en-us' || n.includes('us english') || n.includes('united states');
  });
  if (anyUS) return anyUS;

  // 3. Any Google English
  const googleEng = nonMicrosoft.find((v) => {
    const n = v.name.toLowerCase();
    const l = (v.lang || '').toLowerCase();
    return n.includes('google') && l.startsWith('en');
  });
  if (googleEng) return googleEng;

  // 4. Any English voice
  return nonMicrosoft.find((v) => (v.lang || '').toLowerCase().startsWith('en')) || null;
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

  // Sort: US English ranked highest as secondary after Hindi Server AI Voice
  const scored = allowedVoices.map((v) => {
    let score = 0;
    const lang = (v.lang || '').toLowerCase().replace('_', '-');
    const name = (v.name || '').toLowerCase();

    const isGoogle = name.includes('google');
    const isUSEnglish = lang === 'en-us' || name.includes('us english') || name.includes('united states');
    const isIndianEnglish = name.includes('india') || name.includes('indian') || lang === 'en-in';
    const isHindi = name.includes('hindi') || name.includes('हिन्दी') || lang.startsWith('hi');

    // Priority: US English is secondary after Server AI Voice
    if (isGoogle && isUSEnglish) score += 10000;
    else if (isUSEnglish) score += 7000;
    else if (isGoogle && isIndianEnglish) score += 5000;
    else if (isGoogle && isHindi) score += 4000;
    else if (isGoogle) score += 3000;
    else if (isHindi) score += 2000;
    else if (isIndianEnglish) score += 1000;

    return { voice: v, score };
  });

  scored.sort((a, b) => b.score - a.score);

  if (voiceSelect) {
    voiceSelect.innerHTML = '';

    // Hindi (Server AI Voice) is ALWAYS Default at the top
    const serverOpt = document.createElement('option');
    serverOpt.value = 'google_hindi_server';
    serverOpt.textContent = '✨ Hindi (Server AI Voice) [Default]';
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
      selectedVoiceName = 'google_hindi_server';
    }

    voiceSelect.value = selectedVoiceName;
  }

  if (selectedVoiceName === 'google_hindi_server') {
    cachedVoice = null;
  } else {
    cachedVoice = (voices || []).find((v) => v.name === selectedVoiceName) || getUSEnglishVoice();
  }
}

if (voiceSelect) {
  voiceSelect.addEventListener('change', (e) => {
    userHasChosenVoice = true;
    selectedVoiceName = e.target.value;
    if (selectedVoiceName === 'google_hindi_server') {
      cachedVoice = null;
    } else {
      const voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
      cachedVoice = (voices || []).find((v) => v.name === selectedVoiceName) || getUSEnglishVoice();
    }
  });
}

function pickVoice() {
  if (selectedVoiceName === 'google_hindi_server') return null;
  if (cachedVoice) return cachedVoice;
  populateVoiceList();
  if (cachedVoice) return cachedVoice;
  return getUSEnglishVoice();
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

function speakWithUtterance(speechText, chosenVoice = null, fallbackLang = 'en-US') {
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
    utterance.lang = fallbackLang;
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

function speakUSEnglishFallback(speechText) {
  const usVoice = getUSEnglishVoice();
  speakWithUtterance(speechText, usVoice, 'en-US');
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

  // Hindi (Server AI Voice) is ALWAYS the Default
  if (selectedVoiceName === 'google_hindi_server') {
    speakServerTTS(speechText, targetLang);
    return;
  }

  // If user explicitly chose another voice or fallback
  const voice = pickVoice();
  let utteranceVoice = voice || getUSEnglishVoice();

  // If text is English, ensure an English-capable voice (preferring US English)
  if (!isHindiText) {
    const isVoiceHindi = utteranceVoice && (utteranceVoice.lang || '').toLowerCase().startsWith('hi');
    if (!utteranceVoice || isVoiceHindi) {
      utteranceVoice = getUSEnglishVoice();
    }
  }

  const langCode = utteranceVoice ? (utteranceVoice.lang || 'en-US') : (isHindiText ? 'hi-IN' : 'en-US');
  speakWithUtterance(speechText, utteranceVoice, langCode);
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
