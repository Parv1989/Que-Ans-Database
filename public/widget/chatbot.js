const API_URL = window.location.origin + '/api/ask';
const messagesEl = document.getElementById('messages');
const form = document.getElementById('chatForm');
const input = document.getElementById('chatInput');
const robotEl = document.getElementById('robot');
const muteBtn = document.getElementById('muteBtn');
const muteIcon = document.getElementById('muteIcon');

let voiceEnabled = true;

// Escapes raw HTML characters so user/admin text can never inject real tags,
// then converts the safe ^..^ and ~..~ markers into real <sup>/<sub> tags.
// e.g. "7^2^" -> "7<sup>2</sup>" and "H~2~O" -> "H<sub>2</sub>O"
function formatText(raw) {
  const div = document.createElement('div');
  div.textContent = raw || '';
  const escaped = div.innerHTML;
  return escaped
    .replace(/\^([^\^]+)\^/g, '<sup>$1</sup>')
    .replace(/~([^~]+)~/g, '<sub>$1</sub>');
}

// Turns the same text into plain, speakable words for the voice-over
// (drops the ^..^ / ~..~ markers instead of turning them into tags).
function toSpeechText(raw) {
  return (raw || '')
    .replace(/\^([^\^]+)\^/g, '$1')
    .replace(/~([^~]+)~/g, '$1');
}

// ---------- Voice-over (browser's built-in text-to-speech, no API/cost) ----------
let cachedVoice = null;
function pickVoice() {
  if (cachedVoice) return cachedVoice;
  const voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
  cachedVoice =
    voices.find((v) => v.lang === 'en-IN') ||
    voices.find((v) => v.lang && v.lang.startsWith('hi')) ||
    voices.find((v) => v.lang && v.lang.startsWith('en')) ||
    voices[0] ||
    null;
  return cachedVoice;
}
if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = null;
  };
}

function setTalking(isTalking) {
  robotEl.classList.toggle('talking', isTalking);
}

function speak(rawText) {
  if (!voiceEnabled || !window.speechSynthesis) return;
  window.speechSynthesis.cancel(); // stop anything currently playing
  const utterance = new SpeechSynthesisUtterance(toSpeechText(rawText));
  const voice = pickVoice();
  if (voice) utterance.voice = voice;
  utterance.rate = 0.98;
  utterance.pitch = 1.05;
  utterance.onstart = () => setTalking(true);
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

// ---------- Chat messages ----------
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
  const div = document.createElement('div');
  div.className = 'typing-dots';
  div.id = 'typingIndicator';
  div.innerHTML = '<span></span><span></span><span></span>';
  messagesEl.appendChild(div);
  scrollToBottom();
}

function hideTyping() {
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
