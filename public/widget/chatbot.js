const API_URL = window.location.origin + '/api/ask';
const messagesEl = document.getElementById('messages');
const form = document.getElementById('chatForm');
const input = document.getElementById('chatInput');
const robotEl = document.getElementById('robot');
const muteBtn = document.getElementById('muteBtn');
const muteIcon = document.getElementById('muteIcon');
const voiceSelect = document.getElementById('voiceSelect');

let voiceEnabled = true;

// Escapes raw HTML characters so user/admin text can never inject real tags,
// then converts the safe ^..^ and ~..~ markers into real <sup>/<sub> tags.
function formatText(raw) {
  const div = document.createElement('div');
  div.textContent = raw || '';
  const escaped = div.innerHTML;
  return escaped
    .replace(/\^([^\^]+)\^/g, '<sup>$1</sup>')
    .replace(/~([^~]+)~/g, '<sub>$1</sub>');
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
let selectedVoiceIndex = -1;

function populateVoiceList() {
  if (!window.speechSynthesis) return;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return;

  // Score available voices to strictly prioritize Google natural human voices
  const scored = voices.map((v, index) => {
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

    return { voice: v, index, score };
  });

  scored.sort((a, b) => b.score - a.score);

  if (voiceSelect) {
    voiceSelect.innerHTML = '';
    scored.forEach((item) => {
      const option = document.createElement('option');
      option.value = item.index;
      let label = item.voice.name;
      if (item.voice.name.toLowerCase().includes('google')) {
        label = `✨ ${label}`;
      }
      option.textContent = label;
      voiceSelect.appendChild(option);
    });

    if (scored.length > 0) {
      if (selectedVoiceIndex === -1) {
        selectedVoiceIndex = scored[0].index;
      }
      voiceSelect.value = selectedVoiceIndex;
    }
  }

  cachedVoice = voices[selectedVoiceIndex] || (scored[0] ? scored[0].voice : voices[0]);
}

if (voiceSelect) {
  voiceSelect.addEventListener('change', (e) => {
    selectedVoiceIndex = parseInt(e.target.value, 10);
    const voices = window.speechSynthesis.getVoices();
    cachedVoice = voices[selectedVoiceIndex] || null;
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
  // Initial attempt in case voices are pre-loaded
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

  // Pure natural human conversational voice settings
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
      if (!window.speechSynthesis.speaking) {
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

muteBtn.addEventListener('click', () => {
  voiceEnabled = !voiceEnabled;
  muteIcon.textContent = voiceEnabled ? '\u{1F50A}' : '\u{1F507}';
  if (!voiceEnabled && window.speechSynthesis) {
    window.speechSynthesis.cancel();
    setTalking(false);
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
    btn.addEventListener('click', () => sendQuestion(s.question));
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
  messagesEl.scrollTop = messagesEl.scrollHeight;
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
  input.value = '';
  sendQuestion(question);
});
