const API_URL = window.location.origin + '/api/ask';
const messagesEl = document.getElementById('messages');
const form = document.getElementById('chatForm');
const input = document.getElementById('chatInput');
const robotEl = document.getElementById('robot');
const muteBtn = document.getElementById('muteBtn');
const muteIcon = document.getElementById('muteIcon');
const voiceSelect = document.getElementById('voiceSelect');

let voiceEnabled = true;
let selectedVoiceName = '';

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

// Turns raw text into plain, speakable words for the Google voice engine
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

// ---------- Google Natural Voice Selection Engine ----------
let cachedVoice = null;

function populateVoiceList() {
  if (!window.speechSynthesis) return;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return;

  // Score available voices to strictly prioritize Google natural human voices
  const scored = voices.map((v) => {
    let score = 0;
    const lang = (v.lang || '').toLowerCase().replace('_', '-');
    const name = (v.name || '').toLowerCase();

    const isGoogle = name.includes('google');
    const isNatural = name.includes('natural') || name.includes('online') || name.includes('neural') || name.includes('premium');
    const isRoboticLocal = name.includes('desktop') || name.includes('espeak') || name.includes('david') || name.includes('mark') || name.includes('zira') || name.includes('hemant');

    // Huge boost for Google Neural / Natural web voices
    if (isGoogle) score += 600;
    if (isNatural) score += 300;
    if (isRoboticLocal) score -= 400; // Heavily penalize mechanical local desktop voices

    // Language scores (Hindi & Indian English first, then English)
    if (lang === 'hi-in' || lang.startsWith('hi')) {
      score += 250;
    } else if (lang === 'en-in') {
      score += 200;
    } else if (lang.startsWith('en')) {
      score += 100;
    }

    // Google specific language combos
    if (isGoogle && (name.includes('hindi') || name.includes('हिन्दी') || lang.startsWith('hi'))) {
      score += 500; // Highest priority: Google Hindi
    }
    if (isGoogle && (name.includes('india') || name.includes('indian') || lang === 'en-in')) {
      score += 450; // Second highest priority: Google Indian English
    }
    if (isGoogle && name.includes('uk english female')) {
      score += 350; // High priority: Google UK Female
    }

    return { voice: v, score };
  });

  scored.sort((a, b) => b.score - a.score);

  if (voiceSelect) {
    voiceSelect.innerHTML = '';
    scored.forEach((item) => {
      const option = document.createElement('option');
      option.value = item.voice.name;
      let label = item.voice.name;
      if (item.voice.name.toLowerCase().includes('google')) {
        label = `✨ ${label}`;
      }
      option.textContent = label;
      voiceSelect.appendChild(option);
    });

    if (!selectedVoiceName && scored.length > 0) {
      selectedVoiceName = scored[0].voice.name;
    }
    if (selectedVoiceName) {
      voiceSelect.value = selectedVoiceName;
    }
  }

  cachedVoice = voices.find((v) => v.name === selectedVoiceName) || (scored[0] ? scored[0].voice : voices[0]);
}

if (voiceSelect) {
  voiceSelect.addEventListener('change', (e) => {
    selectedVoiceName = e.target.value;
    const voices = window.speechSynthesis.getVoices();
    cachedVoice = voices.find((v) => v.name === selectedVoiceName) || null;
  });
}

function pickVoice() {
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
let lipSyncAnimationId = null;
let visemeTimer = null;

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
  if (!voiceEnabled || !window.speechSynthesis) return;

  window.speechSynthesis.cancel();
  stopLipSync();

  const speechText = toSpeechText(rawText);
  if (!speechText) return;

  const utterance = new SpeechSynthesisUtterance(speechText);
  const voice = pickVoice();

  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  } else {
    utterance.lang = 'hi-IN';
  }

  // Natural human conversational voice settings
  utterance.rate = 0.94;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;

  // Real-time Event Driven Lip-Sync via SpeechSynthesisUtterance boundary events
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
  utterance.onerror = () => setTalking(false);

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
  if (!voiceEnabled && window.speechSynthesis) {
    window.speechSynthesis.cancel();
    setTalking(false);
  } else if (voiceEnabled) {
    unlockAudioContext();
  }
});

// ---------- Chat Messages ----------
function addMessage(text, sender) {
  const div = document.createElement('div');
  div.className = `msg ${sender}`;
  const p = document.createElement('p');
  p.innerHTML = formatText(text);
  div.appendChild(p);
  messagesEl.appendChild(div);
  scrollToBottom();

  if (sender === 'bot') speak(text);
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
      body: JSON.stringify({ question })
    });
    const data = await res.json();
    hideTyping();

    if (data.answered) {
      addMessage(data.answer, 'bot');
    } else {
      addMessage(data.message || "Mujhe iska answer nahi mila.", 'bot');
      addSuggestions(data.suggestions);
    }
  } catch (err) {
    hideTyping();
    addMessage('Connection me dikkat aa rahi hai, thodi der baad try karein.', 'bot');
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
