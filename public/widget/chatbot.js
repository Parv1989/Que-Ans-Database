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

// ---------- Google Natural Voice Selection Engine & Cloud TTS ----------
let cachedVoice = null;
let userHasChosenVoice = false;
let currentAudio = null;

const TTS_API_URL = window.location.origin + '/api/tts';

async function speakServerTTS(speechText) {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  stopLipSync();

  try {
    const res = await fetch(`${TTS_API_URL}?text=${encodeURIComponent(speechText)}`);
    const data = await res.json();

    if (!data.urls || data.urls.length === 0) {
      setTalking(false);
      return;
    }

    let urlIndex = 0;

    function playNextUrl() {
      if (urlIndex >= data.urls.length || !voiceEnabled) {
        setTalking(false);
        return;
      }

      const audio = new Audio(data.urls[urlIndex++]);
      currentAudio = audio;

      audio.onplay = () => {
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
        playNextUrl();
      };

      audio.onerror = () => {
        setTalking(false);
      };

      audio.play().catch(() => setTalking(false));
    }

    playNextUrl();
  } catch (err) {
    console.warn('Server TTS error:', err);
    setTalking(false);
  }
}

function populateVoiceList() {
  if (!window.speechSynthesis) return;
  const voices = window.speechSynthesis.getVoices();

  // Score available voices to strictly prioritize Google Hindi
  const scored = (voices || []).map((v) => {
    let score = 0;
    const lang = (v.lang || '').toLowerCase().replace('_', '-');
    const name = (v.name || '').toLowerCase();
    const uri = (v.voiceURI || '').toLowerCase();

    const isGoogle = name.includes('google') || uri.includes('google');
    const isHindi = name.includes('hindi') || name.includes('हिन्दी') || lang.startsWith('hi');
    const isIndianEnglish = name.includes('india') || name.includes('indian') || lang === 'en-in';
    const isMicrosoftLocal = name.includes('microsoft') || name.includes('heera') || name.includes('ravi') || name.includes('zira') || name.includes('david') || name.includes('mark');

    // ABSOLUTE TOP PRIORITY FOR GOOGLE HINDI ("Google हिन्दी")
    if (isGoogle && isHindi) {
      score += 10000;
    } else if (isGoogle && isIndianEnglish) {
      score += 4000;
    } else if (isGoogle) {
      score += 2000;
    } else if (isHindi) {
      score += 1000;
    }

    if (isMicrosoftLocal) score -= 800;

    return { voice: v, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const nativeGoogleHindi = (voices || []).find((v) => {
    const n = v.name.toLowerCase();
    const u = (v.voiceURI || '').toLowerCase();
    const l = (v.lang || '').toLowerCase();
    return (n.includes('google') || u.includes('google')) && (n.includes('hindi') || n.includes('हिन्दी') || l.startsWith('hi'));
  });

  if (voiceSelect) {
    voiceSelect.innerHTML = '';

    // Always offer Google Hindi (Server AI Voice) at top
    const serverOpt = document.createElement('option');
    serverOpt.value = 'google_hindi_server';
    serverOpt.textContent = '✨ Google Hindi (Server AI Voice)';
    voiceSelect.appendChild(serverOpt);

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
  if (!voiceEnabled) return;

  if (window.speechSynthesis) window.speechSynthesis.cancel();
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  stopLipSync();

  const speechText = toSpeechText(rawText);
  if (!speechText) return;

  // If google_hindi_server selected OR if no native Google voice is available in browser (e.g. Firefox)
  if (selectedVoiceName === 'google_hindi_server') {
    speakServerTTS(speechText);
    return;
  }

  const voice = pickVoice();
  const isGoogleVoice = voice && (voice.name.toLowerCase().includes('google') || (voice.voiceURI && voice.voiceURI.toLowerCase().includes('google')));

  if (!isGoogleVoice && !userHasChosenVoice) {
    // Automatically use Server Google Hindi TTS on Firefox/Edge instead of mechanical Microsoft Heera
    speakServerTTS(speechText);
    return;
  }

  if (!window.speechSynthesis) {
    speakServerTTS(speechText);
    return;
  }

  const utterance = new SpeechSynthesisUtterance(speechText);
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  } else {
    utterance.lang = 'hi-IN';
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
