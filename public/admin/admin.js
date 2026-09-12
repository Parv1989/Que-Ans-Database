const API_BASE = window.location.origin + '/api';
let token = localStorage.getItem('adminToken') || null;

// ---------- Auth ----------
const loginScreen = document.getElementById('loginScreen');
const dashboard = document.getElementById('dashboard');

function showDashboard() {
  loginScreen.classList.add('hidden');
  dashboard.classList.remove('hidden');
  loadQAList();
  loadSynList();
  renderEmbedSnippet();
}

function showLogin() {
  dashboard.classList.add('hidden');
  loginScreen.classList.remove('hidden');
}

if (token) showDashboard();

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value;
  const password = document.getElementById('loginPassword').value;
  const errorEl = document.getElementById('loginError');
  errorEl.textContent = '';

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    token = data.token;
    localStorage.setItem('adminToken', token);
    showDashboard();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  token = null;
  localStorage.removeItem('adminToken');
  showLogin();
});

async function authedFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`
    }
  });
  if (res.status === 401) {
    token = null;
    localStorage.removeItem('adminToken');
    showLogin();
    throw new Error('Session expired');
  }
  return res;
}

// ---------- Tabs ----------
document.querySelectorAll('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden');
  });
});

// ---------- QA list ----------
const qaList = document.getElementById('qaList');
const qaModal = document.getElementById('qaModal');
const qaForm = document.getElementById('qaForm');

async function loadQAList(search = '') {
  const url = new URL(`${API_BASE}/admin/qa`);
  if (search) url.searchParams.set('search', search);
  const res = await authedFetch(url);
  const items = await res.json();
  renderQAList(items);
}

function renderQAList(items) {
  if (items.length === 0) {
    qaList.innerHTML = '<p class="empty-state">No questions yet — add the first one.</p>';
    return;
  }
  qaList.innerHTML = items
    .map(
      (item) => `
    <div class="item-card" data-id="${item._id}">
      <div>
        <div class="q">${formatText(item.question)}</div>
        <div class="a">${formatText(item.answer)}</div>
        ${item.keywords.length ? `<div class="tags">${item.keywords.map((k) => `<span class="tag">${escapeHtml(k)}</span>`).join('')}</div>` : ''}
      </div>
      <div class="item-actions">
        <button class="icon-btn edit-qa">Edit</button>
        <button class="icon-btn danger delete-qa">Delete</button>
      </div>
    </div>`
    )
    .join('');

  qaList.querySelectorAll('.edit-qa').forEach((btn) =>
    btn.addEventListener('click', (e) => {
      const id = e.target.closest('.item-card').dataset.id;
      const item = items.find((i) => i._id === id);
      openQAModal(item);
    })
  );
  qaList.querySelectorAll('.delete-qa').forEach((btn) =>
    btn.addEventListener('click', async (e) => {
      const id = e.target.closest('.item-card').dataset.id;
      if (!confirm('Delete this question?')) return;
      try {
        const res = await authedFetch(`${API_BASE}/admin/qa/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) {
          alert(data.error || 'Could not delete this question');
          return;
        }
        loadQAList(document.getElementById('qaSearch').value);
      } catch (err) {
        alert('Delete failed: ' + err.message);
      }
    })
  );
}

function openQAModal(item = null) {
  document.getElementById('qaModalTitle').textContent = item ? 'Edit question' : 'Add a question';
  document.getElementById('qaId').value = item ? item._id : '';
  document.getElementById('qaQuestion').value = item ? item.question : '';
  document.getElementById('qaAnswer').value = item ? item.answer : '';
  document.getElementById('qaKeywords').value = item ? item.keywords.join(', ') : '';
  document.getElementById('qaCategory').value = item ? item.category : '';
  qaModal.classList.remove('hidden');
}

document.getElementById('newQABtn').addEventListener('click', () => openQAModal());
document.getElementById('qaCancelBtn').addEventListener('click', () => qaModal.classList.add('hidden'));

qaForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('qaId').value;
  const payload = {
    question: document.getElementById('qaQuestion').value,
    answer: document.getElementById('qaAnswer').value,
    keywords: document
      .getElementById('qaKeywords')
      .value.split(',')
      .map((k) => k.trim())
      .filter(Boolean),
    category: document.getElementById('qaCategory').value
  };

  const url = id ? `${API_BASE}/admin/qa/${id}` : `${API_BASE}/admin/qa`;
  const method = id ? 'PUT' : 'POST';

  await authedFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  qaModal.classList.add('hidden');
  loadQAList(document.getElementById('qaSearch').value);
});

let searchDebounce;
document.getElementById('qaSearch').addEventListener('input', (e) => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => loadQAList(e.target.value), 250);
});

// ---------- Bulk CSV upload ----------
const bulkModal = document.getElementById('bulkModal');
const bulkForm = document.getElementById('bulkForm');
const bulkResult = document.getElementById('bulkResult');

document.getElementById('bulkUploadBtn').addEventListener('click', () => {
  bulkResult.innerHTML = '';
  bulkForm.reset();
  bulkModal.classList.remove('hidden');
});
document.getElementById('bulkCancelBtn').addEventListener('click', () => bulkModal.classList.add('hidden'));

document.getElementById('downloadTemplateBtn').addEventListener('click', async () => {
  const res = await authedFetch(`${API_BASE}/admin/qa/sample-csv`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'qa-template.csv';
  a.click();
  URL.revokeObjectURL(url);
});

bulkForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fileInput = document.getElementById('bulkFileInput');
  const file = fileInput.files[0];
  if (!file) return;

  const submitBtn = document.getElementById('bulkSubmitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Uploading…';
  bulkResult.innerHTML = '';

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await authedFetch(`${API_BASE}/admin/qa/bulk-upload`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');

    let html = `<p class="success-line">${data.insertedCount} question(s) added successfully.</p>`;
    if (data.skippedCount > 0) {
      html += `<p class="skip-line">${data.skippedCount} row(s) skipped:</p><ul>`;
      html += data.skipped.map((s) => `<li>Row ${s.row}: ${escapeHtml(s.reason)}</li>`).join('');
      html += '</ul>';
    }
    bulkResult.innerHTML = html;
    loadQAList(document.getElementById('qaSearch').value);
  } catch (err) {
    bulkResult.innerHTML = `<p class="skip-line">${escapeHtml(err.message)}</p>`;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Upload';
  }
});

// ---------- Synonyms ----------
const synList = document.getElementById('synList');
const synModal = document.getElementById('synModal');
const synForm = document.getElementById('synForm');

async function loadSynList() {
  const res = await authedFetch(`${API_BASE}/admin/synonyms`);
  const items = await res.json();
  renderSynList(items);
}

function renderSynList(items) {
  if (items.length === 0) {
    synList.innerHTML = '<p class="empty-state">No synonym groups yet.</p>';
    return;
  }
  synList.innerHTML = items
    .map(
      (item) => `
    <div class="item-card" data-id="${item._id}">
      <div class="tags">${item.words.map((w) => `<span class="tag">${escapeHtml(w)}</span>`).join('')}</div>
      <div class="item-actions">
        <button class="icon-btn edit-syn">Edit</button>
        <button class="icon-btn danger delete-syn">Delete</button>
      </div>
    </div>`
    )
    .join('');

  synList.querySelectorAll('.edit-syn').forEach((btn) =>
    btn.addEventListener('click', (e) => {
      const id = e.target.closest('.item-card').dataset.id;
      const item = items.find((i) => i._id === id);
      openSynModal(item);
    })
  );
  synList.querySelectorAll('.delete-syn').forEach((btn) =>
    btn.addEventListener('click', async (e) => {
      const id = e.target.closest('.item-card').dataset.id;
      if (!confirm('Delete this synonym group?')) return;
      try {
        const res = await authedFetch(`${API_BASE}/admin/synonyms/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) {
          alert(data.error || 'Could not delete this group');
          return;
        }
        loadSynList();
      } catch (err) {
        alert('Delete failed: ' + err.message);
      }
    })
  );
}

function openSynModal(item = null) {
  document.getElementById('synModalTitle').textContent = item ? 'Edit synonym group' : 'Add synonym group';
  document.getElementById('synId').value = item ? item._id : '';
  document.getElementById('synWords').value = item ? item.words.join(', ') : '';
  synModal.classList.remove('hidden');
}

document.getElementById('newSynBtn').addEventListener('click', () => openSynModal());
document.getElementById('synCancelBtn').addEventListener('click', () => synModal.classList.add('hidden'));

synForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('synId').value;
  const words = document
    .getElementById('synWords')
    .value.split(',')
    .map((w) => w.trim())
    .filter(Boolean);

  const url = id ? `${API_BASE}/admin/synonyms/${id}` : `${API_BASE}/admin/synonyms`;
  const method = id ? 'PUT' : 'POST';

  await authedFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ words })
  });

  synModal.classList.add('hidden');
  loadSynList();
});

// ---------- Embed snippet ----------
function renderEmbedSnippet() {
  const origin = window.location.origin;
  document.getElementById('embedSnippet').textContent =
    `<script src="${origin}/widget/embed.js" data-bot-url="${origin}"></script>`;
}

document.getElementById('copyEmbedBtn').addEventListener('click', () => {
  const text = document.getElementById('embedSnippet').textContent;
  navigator.clipboard.writeText(text);
  const btn = document.getElementById('copyEmbedBtn');
  const original = btn.textContent;
  btn.textContent = 'Copied!';
  setTimeout(() => (btn.textContent = original), 1200);
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Converts safe ^..^ and ~..~ markers into real <sup>/<sub> tags, after
// escaping everything else — so admin/student text can never inject real
// HTML, only these two whitelisted formatting patterns.
// e.g. "7^2^" -> "7<sup>2</sup>" and "H~2~O" -> "H<sub>2</sub>O"
function formatText(raw) {
  const escaped = escapeHtml(raw || '');
  return escaped
    .replace(/\^([^\^]+)\^/g, '<sup>$1</sup>')
    .replace(/~([^~]+)~/g, '<sub>$1</sub>');
}
