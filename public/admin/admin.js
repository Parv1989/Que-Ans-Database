const API_BASE = window.location.origin + '/api';
let token = localStorage.getItem('adminToken') || null;

// ---------- Auth ----------
const loginScreen = document.getElementById('loginScreen');
const dashboard = document.getElementById('dashboard');

function showDashboard() {
  loginScreen.classList.add('hidden');
  dashboard.classList.remove('hidden');
  loadQAList();
  loadAnalyticsData();
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
    const tabName = btn.dataset.tab;
    document.getElementById(`tab-${tabName}`).classList.remove('hidden');
    if (tabName === 'analytics') {
      loadAnalyticsData();
    } else if (tabName === 'qa') {
      loadQAList(document.getElementById('qaSearch').value);
    }
  });
});

// ---------- QA list & Bulk Actions ----------
const qaList = document.getElementById('qaList');
const qaModal = document.getElementById('qaModal');
const qaForm = document.getElementById('qaForm');
const selectAllQA = document.getElementById('selectAllQA');
const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
const bulkDeleteCount = document.getElementById('bulkDeleteCount');
const qaClassFilter = document.getElementById('qaClassFilter');
const qaBookFilter = document.getElementById('qaBookFilter');
const exportCsvBtn = document.getElementById('exportCsvBtn');

let selectedQAIds = new Set();
let currentQAItems = [];
let resolvingQueryText = null;

function populateFilterOptions(items) {
  if (!qaClassFilter || !qaBookFilter) return;
  const currentClassVal = qaClassFilter.value || 'All';
  const currentBookVal = qaBookFilter.value || 'All';

  const classes = new Set(['All']);
  const books = new Set(['All']);

  items.forEach((item) => {
    if (item.className) classes.add(item.className.trim());
    if (item.bookName) books.add(item.bookName.trim());
  });

  qaClassFilter.innerHTML = Array.from(classes)
    .map((c) => `<option value="${escapeHtml(c)}">${c === 'All' ? 'All Classes' : escapeHtml(c)}</option>`)
    .join('');
  qaBookFilter.innerHTML = Array.from(books)
    .map((b) => `<option value="${escapeHtml(b)}">${b === 'All' ? 'All Books' : escapeHtml(b)}</option>`)
    .join('');

  if (classes.has(currentClassVal)) qaClassFilter.value = currentClassVal;
  if (books.has(currentBookVal)) qaBookFilter.value = currentBookVal;
}

function updateBulkUI() {
  const count = selectedQAIds.size;
  if (bulkDeleteCount) bulkDeleteCount.textContent = count;
  if (bulkDeleteBtn) {
    bulkDeleteBtn.classList.toggle('hidden', count === 0);
  }
  if (selectAllQA) {
    if (currentQAItems.length === 0) {
      selectAllQA.checked = false;
      selectAllQA.indeterminate = false;
    } else if (count === currentQAItems.length) {
      selectAllQA.checked = true;
      selectAllQA.indeterminate = false;
    } else if (count > 0) {
      selectAllQA.checked = false;
      selectAllQA.indeterminate = true;
    } else {
      selectAllQA.checked = false;
      selectAllQA.indeterminate = false;
    }
  }
}

async function loadQAList(search = '') {
  const url = new URL(`${API_BASE}/admin/qa`);
  if (search) url.searchParams.set('search', search);

  const selectedClass = qaClassFilter ? qaClassFilter.value : 'All';
  const selectedBook = qaBookFilter ? qaBookFilter.value : 'All';

  if (selectedClass && selectedClass !== 'All') url.searchParams.set('className', selectedClass);
  if (selectedBook && selectedBook !== 'All') url.searchParams.set('bookName', selectedBook);

  const res = await authedFetch(url);
  const items = await res.json();
  currentQAItems = items;

  // Populate or refresh filter dropdowns on initial or full loads
  if (!search && (!selectedClass || selectedClass === 'All') && (!selectedBook || selectedBook === 'All')) {
    populateFilterOptions(items);
  }

  // Update total QA count in analytics card if rendered
  const statTotalQA = document.getElementById('statTotalQA');
  if (statTotalQA) statTotalQA.textContent = items.length;

  // Prune any selected IDs that are no longer in current items
  const validIds = new Set(items.map((i) => i._id));
  selectedQAIds = new Set([...selectedQAIds].filter((id) => validIds.has(id)));
  updateBulkUI();
  renderQAList(items);
}

if (qaClassFilter) {
  qaClassFilter.addEventListener('change', () => loadQAList(document.getElementById('qaSearch').value));
}
if (qaBookFilter) {
  qaBookFilter.addEventListener('change', () => loadQAList(document.getElementById('qaSearch').value));
}

if (exportCsvBtn) {
  exportCsvBtn.addEventListener('click', async () => {
    const selectedClass = qaClassFilter ? qaClassFilter.value : 'All';
    const selectedBook = qaBookFilter ? qaBookFilter.value : 'All';
    const url = new URL(`${API_BASE}/admin/qa/export-csv`);
    if (selectedClass && selectedClass !== 'All') url.searchParams.set('className', selectedClass);
    if (selectedBook && selectedBook !== 'All') url.searchParams.set('bookName', selectedBook);

    try {
      const res = await authedFetch(url);
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `qa-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      alert('CSV export error: ' + err.message);
    }
  });
}

function renderQAList(items) {
  if (items.length === 0) {
    qaList.innerHTML = '<p class="empty-state">No questions found matching your filter/search.</p>';
    updateBulkUI();
    return;
  }
  qaList.innerHTML = items
    .map((item) => {
      const isChecked = selectedQAIds.has(item._id);
      return `
    <div class="item-card ${isChecked ? 'selected' : ''}" data-id="${item._id}">
      <div class="item-select-wrap">
        <input type="checkbox" class="qa-checkbox" data-id="${item._id}" ${isChecked ? 'checked' : ''} aria-label="Select question" />
      </div>
      <div class="item-main">
        <div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-bottom:0.4rem;">
          <span class="tag" style="background:#eef2ff; color:#4338ca; font-weight:bold;">📚 ${escapeHtml(item.className || 'Class 3')}</span>
          <span class="tag" style="background:#f0fdf4; color:#15803d; font-weight:bold;">📖 ${escapeHtml(item.bookName || 'General')}</span>
          <span class="tag" style="background:#fef3c7; color:#b45309; font-weight:bold;">🔖 ${escapeHtml(item.chapterName || 'Chapter 1')}</span>
          ${item.hitCount > 0 ? `<span class="tag" style="background:#fce7f3; color:#be185d; font-weight:bold;">🔥 ${item.hitCount} Hits</span>` : ''}
        </div>
        <div class="q">${formatText(item.question)}</div>
        <div class="a">${formatText(item.answer)}</div>
        ${item.imageUrl ? `<div class="item-thumb"><img src="${escapeHtml(item.imageUrl)}" alt="Diagram" loading="lazy" /></div>` : ''}
        ${item.keywords && item.keywords.length ? `<div class="tags">${item.keywords.map((k) => `<span class="tag">${escapeHtml(k)}</span>`).join('')}</div>` : ''}
      </div>
      <div class="item-actions">
        <button class="icon-btn edit-qa">Edit</button>
        <button class="icon-btn danger delete-qa">Delete</button>
      </div>
    </div>`;
    })
    .join('');

  qaList.querySelectorAll('.qa-checkbox').forEach((chk) => {
    chk.addEventListener('change', (e) => {
      const id = e.target.dataset.id;
      const card = e.target.closest('.item-card');
      if (e.target.checked) {
        selectedQAIds.add(id);
        if (card) card.classList.add('selected');
      } else {
        selectedQAIds.delete(id);
        if (card) card.classList.remove('selected');
      }
      updateBulkUI();
    });
  });

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
        selectedQAIds.delete(id);
        loadQAList(document.getElementById('qaSearch').value);
      } catch (err) {
        alert('Delete failed: ' + err.message);
      }
    })
  );

  updateBulkUI();
}

if (selectAllQA) {
  selectAllQA.addEventListener('change', (e) => {
    if (e.target.checked) {
      currentQAItems.forEach((item) => selectedQAIds.add(item._id));
    } else {
      selectedQAIds.clear();
    }
    renderQAList(currentQAItems);
  });
}

if (bulkDeleteBtn) {
  bulkDeleteBtn.addEventListener('click', async () => {
    const ids = Array.from(selectedQAIds);
    if (ids.length === 0) return;

    const confirmMsg = `Are you sure you want to delete ${ids.length} selected question${ids.length > 1 ? 's' : ''}? This action cannot be undone.`;
    if (!confirm(confirmMsg)) return;

    bulkDeleteBtn.disabled = true;
    bulkDeleteBtn.textContent = 'Deleting...';

    try {
      const res = await authedFetch(`${API_BASE}/admin/qa/bulk-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to delete selected questions.');
        return;
      }
      selectedQAIds.clear();
      await loadQAList(document.getElementById('qaSearch').value);
      alert(`Successfully deleted ${data.deletedCount} question${data.deletedCount > 1 ? 's' : ''}.`);
    } catch (err) {
      alert('Bulk delete failed: ' + err.message);
    } finally {
      bulkDeleteBtn.disabled = false;
      updateBulkUI();
    }
  });
}

function updateFormulaPreview(inputId, previewBoxId) {
  const inputEl = document.getElementById(inputId);
  const previewBox = document.getElementById(previewBoxId);
  if (!inputEl || !previewBox) return;

  const val = inputEl.value;
  const contentSpan = previewBox.querySelector('.preview-content');
  if (val && (val.includes('^') || val.includes('~') || val.includes('*'))) {
    contentSpan.innerHTML = formatText(val);
    previewBox.classList.remove('hidden');
  } else {
    previewBox.classList.add('hidden');
  }
}

document.getElementById('qaQuestion').addEventListener('input', () => {
  updateFormulaPreview('qaQuestion', 'qaQuestionPreview');
});
document.getElementById('qaAnswer').addEventListener('input', () => {
  updateFormulaPreview('qaAnswer', 'qaAnswerPreview');
});

function openQAModal(item = null, prefill = null) {
  document.getElementById('qaModalTitle').textContent = item ? 'Edit question' : 'Add a question';
  document.getElementById('qaId').value = item ? item._id : '';
  document.getElementById('qaQuestion').value = item ? item.question : (prefill ? prefill.question : '');
  document.getElementById('qaAnswer').value = item ? item.answer : '';
  document.getElementById('qaClassName').value = item ? (item.className || 'Class 3') : (prefill ? prefill.className || 'Class 3' : 'Class 3');
  document.getElementById('qaBookName').value = item ? (item.bookName || 'Ripples') : (prefill ? prefill.bookName || 'General' : 'Ripples');
  document.getElementById('qaChapterName').value = item ? (item.chapterName || 'Chapter 1') : (prefill ? prefill.chapterName || 'Chapter 1' : 'Chapter 1');
  document.getElementById('qaKeywords').value = item && item.keywords ? item.keywords.join(', ') : '';
  document.getElementById('qaCategory').value = item ? item.category : '';
  document.getElementById('qaImageUrl').value = item ? (item.imageUrl || '') : '';

  updateFormulaPreview('qaQuestion', 'qaQuestionPreview');
  updateFormulaPreview('qaAnswer', 'qaAnswerPreview');
  qaModal.classList.remove('hidden');
}

document.getElementById('newQABtn').addEventListener('click', () => {
  resolvingQueryText = null;
  openQAModal();
});
document.getElementById('qaCancelBtn').addEventListener('click', () => {
  resolvingQueryText = null;
  qaModal.classList.add('hidden');
});

qaForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('qaId').value;
  const payload = {
    question: document.getElementById('qaQuestion').value,
    answer: document.getElementById('qaAnswer').value,
    className: document.getElementById('qaClassName').value,
    bookName: document.getElementById('qaBookName').value,
    chapterName: document.getElementById('qaChapterName').value,
    keywords: document
      .getElementById('qaKeywords')
      .value.split(',')
      .map((k) => k.trim())
      .filter(Boolean),
    category: document.getElementById('qaCategory').value,
    imageUrl: document.getElementById('qaImageUrl').value
  };

  const url = id ? `${API_BASE}/admin/qa/${id}` : `${API_BASE}/admin/qa`;
  const method = id ? 'PUT' : 'POST';

  await authedFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  // If this entry was created from an unanswered query log, resolve it
  if (resolvingQueryText) {
    try {
      await authedFetch(`${API_BASE}/admin/analytics/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queryText: resolvingQueryText })
      });
      resolvingQueryText = null;
      loadAnalyticsData();
    } catch (e) {
      console.warn('Auto resolve error:', e);
    }
  }

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

// ---------- Analytics & Student Query Logs ----------
async function loadAnalyticsData() {
  try {
    const [overviewRes, unansweredRes] = await Promise.all([
      authedFetch(`${API_BASE}/admin/analytics/overview`),
      authedFetch(`${API_BASE}/admin/analytics/unanswered`)
    ]);

    const overview = await overviewRes.json();
    const unanswered = await unansweredRes.json();

    const statTotalQueries = document.getElementById('statTotalQueries');
    const statResolutionRate = document.getElementById('statResolutionRate');
    const statPendingUnanswered = document.getElementById('statPendingUnanswered');

    if (statTotalQueries) statTotalQueries.textContent = overview.totalQueries || 0;
    if (statResolutionRate) statResolutionRate.textContent = `${overview.resolutionRate || 0}%`;
    if (statPendingUnanswered) statPendingUnanswered.textContent = overview.pendingUnansweredCount || 0;

    renderUnansweredList(unanswered || []);
    renderTopHitList(overview.topQuestions || []);
    renderRecentQueries(overview.recentQueries || []);
  } catch (err) {
    console.warn('Could not load analytics:', err);
  }
}

function renderUnansweredList(items) {
  const container = document.getElementById('unansweredList');
  if (!container) return;

  if (!items || items.length === 0) {
    container.innerHTML = '<div class="empty-state">🎉 Wonderful! No pending unanswered questions right now.</div>';
    return;
  }

  container.innerHTML = items
    .map((item) => {
      const timeStr = item.lastAsked
        ? new Date(item.lastAsked).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '';
      return `
      <div class="unanswered-card">
        <div class="unanswered-info">
          <div class="unanswered-query">"${escapeHtml(item.originalQuery || item._id)}"</div>
          <div class="unanswered-meta">
            <span class="unanswered-badge">Asked ${item.count} ${item.count === 1 ? 'time' : 'times'}</span>
            ${item.className ? `<span>📚 ${escapeHtml(item.className)}</span>` : ''}
            ${item.bookName ? `<span>📖 ${escapeHtml(item.bookName)}</span>` : ''}
            ${item.chapterName ? `<span>🔖 ${escapeHtml(item.chapterName)}</span>` : ''}
            ${timeStr ? `<span>🕒 ${timeStr}</span>` : ''}
          </div>
        </div>
        <div class="unanswered-actions">
          <button class="btn-add-qa" data-query="${escapeHtml(item.originalQuery || item._id)}" data-class="${escapeHtml(item.className || 'Class 3')}" data-book="${escapeHtml(item.bookName || 'General')}" data-chapter="${escapeHtml(item.chapterName || 'Chapter 1')}">+ Add to QA</button>
        </div>
      </div>
    `;
    })
    .join('');

  container.querySelectorAll('.btn-add-qa').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const q = e.target.dataset.query;
      const cls = e.target.dataset.class;
      const bk = e.target.dataset.book;
      const ch = e.target.dataset.chapter;
      resolvingQueryText = q;
      openQAModal(null, { question: q, className: cls, bookName: bk, chapterName: ch });
    });
  });
}

function renderTopHitList(items) {
  const container = document.getElementById('topHitList');
  if (!container) return;

  if (!items || items.length === 0) {
    container.innerHTML = '<div class="empty-state">No questions answered yet.</div>';
    return;
  }

  container.innerHTML = items
    .map(
      (item) => `
      <div class="top-hit-item">
        <div style="flex:1; min-width:0;">
          <div class="top-hit-text">${formatText(item.question)}</div>
          <div class="top-hit-sub">📚 ${escapeHtml(item.className || 'General')} • 📖 ${escapeHtml(item.bookName || 'General')}</div>
        </div>
        <div class="hit-count-badge">${item.hitCount} hits</div>
      </div>
    `
    )
    .join('');
}

function renderRecentQueries(items) {
  const container = document.getElementById('recentQueryList');
  if (!container) return;

  if (!items || items.length === 0) {
    container.innerHTML = '<div class="empty-state">No recent activity.</div>';
    return;
  }

  container.innerHTML = items
    .map((item) => {
      const timeStr = item.createdAt
        ? new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '';
      return `
      <div class="query-item">
        <div style="flex:1; min-width:0;">
          <div class="query-text">"${escapeHtml(item.query)}"</div>
          <div class="query-sub">${escapeHtml(item.className || 'All')} • ${timeStr}</div>
        </div>
        <span class="status-pill ${item.answered ? 'success' : 'miss'}">${item.answered ? 'Answered' : 'Unmatched'}</span>
      </div>
    `;
    })
    .join('');
}

const refreshAnalyticsBtn = document.getElementById('refreshAnalyticsBtn');
if (refreshAnalyticsBtn) {
  refreshAnalyticsBtn.addEventListener('click', () => loadAnalyticsData());
}

