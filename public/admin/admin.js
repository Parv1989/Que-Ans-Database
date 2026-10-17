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
    } else if (tabName === 'pedagogy') {
      loadPedagogyChaptersList();
    } else if (tabName === 'features') {
      loadBookFeaturesList();
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
        ${item.detailedAnswer ? `<div class="detailed-a" style="font-size:0.8rem; color:#4b5563; background:#f9fafb; border-left:3px solid #10b981; padding:0.3rem 0.55rem; margin-top:0.35rem; border-radius:4px;"><strong>💡 Detailed Answer (Explain simply):</strong> ${formatText(item.detailedAnswer)}</div>` : ''}
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
const qaDetailedAnswerEl = document.getElementById('qaDetailedAnswer');
if (qaDetailedAnswerEl) {
  qaDetailedAnswerEl.addEventListener('input', () => {
    updateFormulaPreview('qaDetailedAnswer', 'qaDetailedAnswerPreview');
  });
}

function openQAModal(item = null, prefill = null) {
  document.getElementById('qaModalTitle').textContent = item ? 'Edit question' : 'Add a question';
  document.getElementById('qaId').value = item ? item._id : '';
  document.getElementById('qaQuestion').value = item ? item.question : (prefill ? prefill.question : '');
  document.getElementById('qaAnswer').value = item ? item.answer : '';
  if (qaDetailedAnswerEl) {
    qaDetailedAnswerEl.value = item ? (item.detailedAnswer || '') : '';
  }
  document.getElementById('qaClassName').value = item ? (item.className || 'Class 3') : (prefill ? prefill.className || 'Class 3' : 'Class 3');
  document.getElementById('qaBookName').value = item ? (item.bookName || 'Ripples') : (prefill ? prefill.bookName || 'General' : 'Ripples');
  document.getElementById('qaChapterName').value = item ? (item.chapterName || 'Chapter 1') : (prefill ? prefill.chapterName || 'Chapter 1' : 'Chapter 1');
  document.getElementById('qaKeywords').value = item && item.keywords ? item.keywords.join(', ') : '';
  document.getElementById('qaCategory').value = item ? item.category : '';
  document.getElementById('qaImageUrl').value = item ? (item.imageUrl || '') : '';

  updateFormulaPreview('qaQuestion', 'qaQuestionPreview');
  updateFormulaPreview('qaAnswer', 'qaAnswerPreview');
  if (qaDetailedAnswerEl) {
    updateFormulaPreview('qaDetailedAnswer', 'qaDetailedAnswerPreview');
  }
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
    detailedAnswer: qaDetailedAnswerEl ? qaDetailedAnswerEl.value.trim() : '',
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

// =========================================================================
// ---------- SMART PEDAGOGY: LESSON PLANS & MIND MAPS ADMIN ----------
// =========================================================================

let currentPedagogyData = null;
let currentPedagogyChapters = [];

const pedagogyChapterSelect = document.getElementById('pedagogyChapterSelect');
const pedagogyStatusBadge = document.getElementById('pedagogyStatusBadge');
const pedagogyRefreshBtn = document.getElementById('pedagogyRefreshBtn');
const pedagogySaveBtn = document.getElementById('pedagogySaveBtn');
const mmBranchesContainer = document.getElementById('mmBranchesContainer');
const mmAddBranchBtn = document.getElementById('mmAddBranchBtn');

// AI Chapter PDF Reader & Generator elements
const chapterPdfInput = document.getElementById('chapterPdfInput');
const generateFromPdfBtn = document.getElementById('generateFromPdfBtn');
const justUploadPdfBtn = document.getElementById('justUploadPdfBtn');
const pdfGenStatusText = document.getElementById('pdfGenStatusText');
const pdfGenLoadingRow = document.getElementById('pdfGenLoadingRow');
const pdfGenLoadingTitle = document.getElementById('pdfGenLoadingTitle');
const pdfGenLoadingSub = document.getElementById('pdfGenLoadingSub');
const lpPdfPreviewRow = document.getElementById('lpPdfPreviewRow');
const lpPdfLink = document.getElementById('lpPdfLink');
const lpPdfOpenBtn = document.getElementById('lpPdfOpenBtn');
const lpRemovePdfBtn = document.getElementById('lpRemovePdfBtn');
const lpPdfUrl = document.getElementById('lpPdfUrl');

// Mind map image/PDF upload elements
const mmFileInput = document.getElementById('mmFileInput');
const mmUploadFileBtn = document.getElementById('mmUploadFileBtn');
const mmUploadStatus = document.getElementById('mmUploadStatus');
const mmPreviewRow = document.getElementById('mmPreviewRow');
const mmFileLink = document.getElementById('mmFileLink');
const mmRemoveFileBtn = document.getElementById('mmRemoveFileBtn');
const mmImageUrl = document.getElementById('mmImageUrl');
const mmPdfUrl = document.getElementById('mmPdfUrl');

// Sub-tabs switching
document.querySelectorAll('.pedagogy-subtab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.pedagogy-subtab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.pedagogy-subpanel').forEach((p) => p.classList.add('hidden'));
    tab.classList.add('active');
    const sub = tab.dataset.sub;
    const targetPanel = document.getElementById(`subpanel-${sub}`);
    if (targetPanel) targetPanel.classList.remove('hidden');
  });
});

async function loadPedagogyChaptersList() {
  if (!pedagogyChapterSelect) return;
  pedagogyChapterSelect.innerHTML = '<option value="">Loading chapters...</option>';

  try {
    const res = await authedFetch(`${API_BASE}/pedagogy/admin/chapters`);
    const data = await res.json();
    currentPedagogyChapters = data.chapters || [];

    if (currentPedagogyChapters.length === 0) {
      pedagogyChapterSelect.innerHTML = '<option value="">No chapters found in questions database</option>';
      return;
    }

    pedagogyChapterSelect.innerHTML = currentPedagogyChapters
      .map((ch) => {
        const key = `${ch.className}:::${ch.bookName}:::${ch.chapterName}`;
        const statusIcon = ch.hasLessonPlan ? '🟢' : '⚪';
        return `<option value="${key}">${statusIcon} ${ch.className} • ${ch.bookName} • ${ch.chapterName} (${ch.questionCount} Qs)</option>`;
      })
      .join('');

    onPedagogyChapterChange();
  } catch (err) {
    console.error('Failed to load pedagogy chapters:', err);
    pedagogyChapterSelect.innerHTML = '<option value="">Error loading chapters</option>';
  }
}

if (pedagogyRefreshBtn) {
  pedagogyRefreshBtn.addEventListener('click', loadPedagogyChaptersList);
}

if (pedagogyChapterSelect) {
  pedagogyChapterSelect.addEventListener('change', onPedagogyChapterChange);
}

function getSelectedChapterObj() {
  if (!pedagogyChapterSelect || !pedagogyChapterSelect.value) return null;
  const [className, bookName, chapterName] = pedagogyChapterSelect.value.split(':::');
  return { className, bookName, chapterName };
}

async function onPedagogyChapterChange() {
  const ch = getSelectedChapterObj();
  if (!ch) return;

  if (pedagogyStatusBadge) {
    pedagogyStatusBadge.className = 'pedagogy-status-badge';
    pedagogyStatusBadge.textContent = 'Checking database...';
  }

  try {
    const res = await fetch(`${API_BASE}/pedagogy?className=${encodeURIComponent(ch.className)}&bookName=${encodeURIComponent(ch.bookName)}&chapterName=${encodeURIComponent(ch.chapterName)}`);
    const result = await res.json();

    if (result.exists && result.data) {
      currentPedagogyData = result.data;
      fillPedagogyForms(currentPedagogyData);
      updatePedagogyStatusBadge(currentPedagogyData);
    } else {
      currentPedagogyData = null;
      clearPedagogyForms(ch);
      if (pedagogyStatusBadge) {
        pedagogyStatusBadge.className = 'pedagogy-status-badge status-empty';
        pedagogyStatusBadge.textContent = '⚪ Not in Database (Fill details and click "Save Changes")';
      }
    }
  } catch (err) {
    console.error('Error fetching chapter pedagogy:', err);
  }
}

function updatePedagogyStatusBadge(doc) {
  if (!pedagogyStatusBadge || !doc) return;
  const dateStr = doc.updatedAt ? new Date(doc.updatedAt).toLocaleDateString() : '';
  const hasPdf = doc.lessonPlan && doc.lessonPlan.pdfUrl;

  pedagogyStatusBadge.className = 'pedagogy-status-badge status-saved';
  pedagogyStatusBadge.innerHTML = `🟢 Saved in MongoDB ${hasPdf ? '• Attached PDF 📄' : ''} (${dateStr})`;
}

function clearPedagogyForms(ch) {
  const lpUnitTitle = document.getElementById('lpUnitTitle');
  const lpMethodology = document.getElementById('lpMethodology');
  const lpLearningObjectives = document.getElementById('lpLearningObjectives');
  const lpBloomTaxonomy = document.getElementById('lpBloomTaxonomy');
  const lpClassroomActivity = document.getElementById('lpClassroomActivity');
  const lpHomeworkAssignment = document.getElementById('lpHomeworkAssignment');

  if (lpUnitTitle) lpUnitTitle.value = `${ch.chapterName || 'Chapter'} Core Study`;
  if (lpMethodology) lpMethodology.value = '5E Inquiry Model, Visual Learning & Interactive Discussion';
  if (lpLearningObjectives) lpLearningObjectives.value = '';
  if (lpBloomTaxonomy) lpBloomTaxonomy.value = 'Remembering, Understanding, Applying';
  if (lpClassroomActivity) lpClassroomActivity.value = '';
  if (lpHomeworkAssignment) lpHomeworkAssignment.value = '';

  // Clear PDF
  if (lpPdfUrl) lpPdfUrl.value = '';
  if (chapterPdfInput) chapterPdfInput.value = '';
  if (pdfGenStatusText) pdfGenStatusText.textContent = '';
  if (lpPdfPreviewRow) lpPdfPreviewRow.classList.add('hidden');

  for (let i = 1; i <= 4; i++) {
    const t = document.getElementById(`p${i}Title`);
    const te = document.getElementById(`p${i}Teacher`);
    const st = document.getElementById(`p${i}Student`);
    const ai = document.getElementById(`p${i}Aids`);
    const as = document.getElementById(`p${i}Assessment`);
    if (t) t.value = `Period ${i}`;
    if (te) te.value = '';
    if (st) st.value = '';
    if (ai) ai.value = 'Blackboard, Textbook';
    if (as) as.value = '';
  }

  // Clear Mind Map
  const mmCentralTopic = document.getElementById('mmCentralTopic');
  if (mmCentralTopic) mmCentralTopic.value = ch.chapterName || 'Chapter Topic';
  if (mmImageUrl) mmImageUrl.value = '';
  if (mmPdfUrl) mmPdfUrl.value = '';
  if (mmFileInput) mmFileInput.value = '';
  if (mmUploadStatus) mmUploadStatus.textContent = '';
  if (mmPreviewRow) mmPreviewRow.classList.add('hidden');

  renderDefaultBranches(ch.chapterName);
}

function fillPedagogyForms(doc) {
  const lp = doc.lessonPlan || {};
  const mm = doc.mindMap || {};

  const lpUnitTitle = document.getElementById('lpUnitTitle');
  const lpMethodology = document.getElementById('lpMethodology');
  const lpLearningObjectives = document.getElementById('lpLearningObjectives');
  const lpBloomTaxonomy = document.getElementById('lpBloomTaxonomy');
  const lpClassroomActivity = document.getElementById('lpClassroomActivity');
  const lpHomeworkAssignment = document.getElementById('lpHomeworkAssignment');

  if (lpUnitTitle) lpUnitTitle.value = lp.unitTitle || '';
  if (lpMethodology) lpMethodology.value = lp.pedagogicalMethodology || '';
  if (lpLearningObjectives) lpLearningObjectives.value = (lp.learningObjectives || []).join('\n');
  if (lpBloomTaxonomy) lpBloomTaxonomy.value = (lp.bloomTaxonomy || []).join(', ');
  if (lpClassroomActivity) lpClassroomActivity.value = lp.classroomActivity || '';
  if (lpHomeworkAssignment) lpHomeworkAssignment.value = lp.homeworkAssignment || '';

  // PDF Preview
  if (lpPdfUrl) lpPdfUrl.value = lp.pdfUrl || '';
  if (lp.pdfUrl && lpPdfPreviewRow && lpPdfLink) {
    lpPdfLink.href = lp.pdfUrl;
    lpPdfLink.textContent = `Attached Chapter PDF: ${lp.pdfUrl.split('/').pop()}`;
    if (lpPdfOpenBtn) lpPdfOpenBtn.href = lp.pdfUrl;
    lpPdfPreviewRow.classList.remove('hidden');
  } else if (lpPdfPreviewRow) {
    lpPdfPreviewRow.classList.add('hidden');
  }

  const periods = lp.periods || [];
  for (let i = 1; i <= 4; i++) {
    const p = periods.find((x) => x.periodNumber === i) || periods[i - 1] || {};
    const t = document.getElementById(`p${i}Title`);
    const te = document.getElementById(`p${i}Teacher`);
    const st = document.getElementById(`p${i}Student`);
    const ai = document.getElementById(`p${i}Aids`);
    const as = document.getElementById(`p${i}Assessment`);
    if (t) t.value = p.title || `Period ${i}`;
    if (te) te.value = p.teacherActivity || '';
    if (st) st.value = p.studentActivity || '';
    if (ai) ai.value = p.teachingAids || '';
    if (as) as.value = p.assessmentQuestion || '';
  }

  // Mind map
  const mmCentralTopic = document.getElementById('mmCentralTopic');
  if (mmCentralTopic) mmCentralTopic.value = mm.centralTopic || doc.chapterName || '';

  if (mmImageUrl) mmImageUrl.value = mm.imageUrl || '';
  if (mmPdfUrl) mmPdfUrl.value = mm.pdfUrl || '';
  const mmVisualUrl = mm.imageUrl || mm.pdfUrl;
  if (mmVisualUrl && mmPreviewRow && mmFileLink) {
    mmFileLink.href = mmVisualUrl;
    mmFileLink.textContent = `Attached Diagram: ${mmVisualUrl.split('/').pop()}`;
    mmPreviewRow.classList.remove('hidden');
  } else if (mmPreviewRow) {
    mmPreviewRow.classList.add('hidden');
  }

  renderMindMapBranches(mm.branches || []);
}

// AI Chapter PDF Reader & Auto-Generator
if (generateFromPdfBtn) {
  generateFromPdfBtn.addEventListener('click', async () => {
    const ch = getSelectedChapterObj();
    if (!ch) {
      alert('Please select a Class & Chapter from the dropdown first!');
      return;
    }

    const file = chapterPdfInput?.files[0];
    const existingUrl = lpPdfUrl?.value;

    if (!file && !existingUrl) {
      alert('Please choose a Chapter PDF file (.pdf) to read and auto-generate!');
      return;
    }

    const formData = new FormData();
    formData.append('className', ch.className);
    formData.append('bookName', ch.bookName);
    formData.append('chapterName', ch.chapterName);
    if (file) {
      formData.append('file', file);
    } else if (existingUrl) {
      formData.append('existingPdfUrl', existingUrl);
    }

    generateFromPdfBtn.disabled = true;
    if (justUploadPdfBtn) justUploadPdfBtn.disabled = true;
    if (pdfGenLoadingRow) pdfGenLoadingRow.classList.remove('hidden');
    if (pdfGenStatusText) pdfGenStatusText.textContent = '';

    try {
      const res = await fetch(`${API_BASE}/pedagogy/admin/generate-from-pdf`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');

      // Populate form with newly generated data
      if (data.data) {
        fillPedagogyForms(data.data);
        updatePedagogyStatusBadge(data.data);
      }

      if (pdfGenStatusText) {
        pdfGenStatusText.textContent = '✔ Auto-generated & Saved to Database!';
      }
      alert('✨ Detailed Lesson Plan & Concept Mind Map successfully generated from Chapter PDF!');
    } catch (err) {
      console.error('generate-from-pdf error:', err);
      alert('Error generating from Chapter PDF: ' + err.message);
      if (pdfGenStatusText) {
        pdfGenStatusText.textContent = '❌ Generation failed: ' + err.message;
      }
    } finally {
      generateFromPdfBtn.disabled = false;
      if (justUploadPdfBtn) justUploadPdfBtn.disabled = false;
      if (pdfGenLoadingRow) pdfGenLoadingRow.classList.add('hidden');
    }
  });
}

// Just Attach PDF without AI generation
if (justUploadPdfBtn) {
  justUploadPdfBtn.addEventListener('click', async () => {
    const ch = getSelectedChapterObj();
    if (!ch) {
      alert('Please select a Class & Chapter first!');
      return;
    }

    const file = chapterPdfInput?.files[0];
    if (!file) {
      alert('Please choose a PDF file first!');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    justUploadPdfBtn.disabled = true;
    if (pdfGenStatusText) pdfGenStatusText.textContent = 'Uploading PDF...';

    try {
      const res = await fetch(`${API_BASE}/pedagogy/admin/upload-file`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      if (lpPdfUrl) lpPdfUrl.value = data.fileUrl;
      if (lpPdfLink) {
        lpPdfLink.href = data.fileUrl;
        lpPdfLink.textContent = `Attached Chapter PDF: ${data.fileName}`;
      }
      if (lpPdfOpenBtn) lpPdfOpenBtn.href = data.fileUrl;
      if (lpPdfPreviewRow) lpPdfPreviewRow.classList.remove('hidden');

      // Auto-save attachment
      if (pedagogySaveBtn) {
        await pedagogySaveBtn.click();
        if (pdfGenStatusText) pdfGenStatusText.textContent = '✔ PDF Attached & Saved to Database!';
      }
    } catch (err) {
      console.error('PDF upload error:', err);
      alert('Upload failed: ' + err.message);
      if (pdfGenStatusText) pdfGenStatusText.textContent = '❌ Upload failed';
    } finally {
      justUploadPdfBtn.disabled = false;
    }
  });
}

// Remove attached PDF
if (lpRemovePdfBtn) {
  lpRemovePdfBtn.addEventListener('click', async () => {
    if (lpPdfUrl) lpPdfUrl.value = '';
    if (chapterPdfInput) chapterPdfInput.value = '';
    if (lpPdfPreviewRow) lpPdfPreviewRow.classList.add('hidden');
    if (pdfGenStatusText) pdfGenStatusText.textContent = 'Removing PDF...';
    if (pedagogySaveBtn) {
      await pedagogySaveBtn.click();
      if (pdfGenStatusText) pdfGenStatusText.textContent = '✔ PDF removed & Saved to Database!';
    }
  });
}

// Mind Map Poster / Image Upload Handler
if (mmUploadFileBtn && mmFileInput) {
  mmUploadFileBtn.addEventListener('click', async () => {
    const file = mmFileInput.files[0];
    if (!file) {
      alert('Please choose an image or PDF poster first!');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    if (mmUploadStatus) mmUploadStatus.textContent = 'Uploading poster...';
    mmUploadFileBtn.disabled = true;

    try {
      const res = await fetch(`${API_BASE}/pedagogy/admin/upload-file`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      if (file.name.toLowerCase().endsWith('.pdf')) {
        if (mmPdfUrl) mmPdfUrl.value = data.fileUrl;
        if (mmImageUrl) mmImageUrl.value = '';
      } else {
        if (mmImageUrl) mmImageUrl.value = data.fileUrl;
        if (mmPdfUrl) mmPdfUrl.value = '';
      }

      if (mmFileLink) {
        mmFileLink.href = data.fileUrl;
        mmFileLink.textContent = `Attached Diagram: ${data.fileName}`;
      }
      if (mmPreviewRow) mmPreviewRow.classList.remove('hidden');
      if (mmUploadStatus) mmUploadStatus.textContent = '✔ Uploaded & Saving...';

      if (pedagogySaveBtn) {
        await pedagogySaveBtn.click();
        if (mmUploadStatus) mmUploadStatus.textContent = '✔ Poster Uploaded & Saved to Database! (डेटाबेस में सुरक्षित)';
      }
    } catch (err) {
      console.error('Poster upload error:', err);
      if (mmUploadStatus) mmUploadStatus.textContent = '❌ Upload failed';
      alert('Error uploading poster: ' + err.message);
    } finally {
      mmUploadFileBtn.disabled = false;
    }
  });
}

if (mmRemoveFileBtn) {
  mmRemoveFileBtn.addEventListener('click', async () => {
    if (mmImageUrl) mmImageUrl.value = '';
    if (mmPdfUrl) mmPdfUrl.value = '';
    if (mmFileInput) mmFileInput.value = '';
    if (mmPreviewRow) mmPreviewRow.classList.add('hidden');
    if (mmUploadStatus) mmUploadStatus.textContent = 'Removing poster...';
    if (pedagogySaveBtn) {
      await pedagogySaveBtn.click();
      if (mmUploadStatus) mmUploadStatus.textContent = '✔ Poster removed & Saved to Database!';
    }
  });
}

function renderDefaultBranches(chapterName) {
  const defaultBranches = [
    {
      id: 'branch-1',
      title: 'Core Fundamentals & Definitions',
      color: '#6366f1',
      subtopics: [{ name: 'Key Concept', detail: 'Basic definition and role' }]
    },
    {
      id: 'branch-2',
      title: 'Processes & Mechanisms',
      color: '#059669',
      subtopics: [{ name: 'How It Works', detail: 'Step-by-step mechanism' }]
    },
    {
      id: 'branch-3',
      title: 'Structures & Components',
      color: '#d97706',
      subtopics: [{ name: 'Main Parts', detail: 'Functions and roles' }]
    },
    {
      id: 'branch-4',
      title: 'Real-Life Applications & Significance',
      color: '#8b5cf6',
      subtopics: [{ name: 'Everyday Example', detail: 'Application in daily life' }]
    }
  ];
  renderMindMapBranches(defaultBranches);
}

function renderMindMapBranches(branches) {
  if (!mmBranchesContainer) return;
  if (!branches || branches.length === 0) {
    renderDefaultBranches('');
    return;
  }

  mmBranchesContainer.innerHTML = branches
    .map((b, bIdx) => {
      const subsHtml = (b.subtopics || [])
        .map(
          (s, sIdx) => `
        <div class="subtopic-item-row" data-sub-idx="${sIdx}">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
            <input type="text" class="subtopic-name-input" value="${escapeHtml(s.name || '')}" placeholder="Subtopic Title (e.g. Evaporation)" style="flex:1;" />
            <button type="button" class="danger-btn-sm remove-subtopic-btn" title="Remove subtopic" style="padding:0.2rem 0.4rem; font-size:0.75rem; background:none; border:none; color:#dc2626; cursor:pointer;">✕</button>
          </div>
          <textarea class="subtopic-detail-input" rows="2" placeholder="Explanation or concept detail...">${escapeHtml(s.detail || '')}</textarea>
        </div>
      `
        )
        .join('');

      return `
      <div class="branch-card" data-branch-idx="${bIdx}">
        <div class="branch-card-head" style="display:flex; align-items:center; gap:0.5rem;">
          <span class="branch-color-indicator" style="background: ${b.color || '#6366f1'}; width:14px; height:14px; border-radius:50%; flex-shrink:0;"></span>
          <input type="text" class="branch-title-input" value="${escapeHtml(b.title || '')}" placeholder="Branch Title" style="flex:1; font-weight:700;" />
          <input type="color" class="branch-color-picker" value="${b.color || '#6366f1'}" style="width:28px;height:28px;padding:0;border:none;background:none;cursor:pointer;" />
          <button type="button" class="remove-branch-btn" title="Remove branch" style="background:none; border:none; color:#dc2626; font-size:0.9rem; cursor:pointer;">✕</button>
        </div>
        <div class="branch-subtopics-list" style="margin-top:0.5rem; display:flex; flex-direction:column; gap:0.5rem;">
          ${subsHtml}
        </div>
        <button type="button" class="ghost-btn add-subtopic-btn" style="margin-top:0.5rem; font-size:0.8rem; padding:0.25rem 0.5rem; align-self:flex-start;">+ Add Subtopic</button>
      </div>
    `;
    })
    .join('');

  // Wire events: color pickers, remove branch, add subtopic, remove subtopic
  mmBranchesContainer.querySelectorAll('.branch-card').forEach((card) => {
    const picker = card.querySelector('.branch-color-picker');
    const indicator = card.querySelector('.branch-color-indicator');
    if (picker && indicator) {
      picker.addEventListener('input', () => {
        indicator.style.background = picker.value;
      });
    }

    const removeBranchBtn = card.querySelector('.remove-branch-btn');
    if (removeBranchBtn) {
      removeBranchBtn.addEventListener('click', () => {
        card.remove();
      });
    }

    const addSubtopicBtn = card.querySelector('.add-subtopic-btn');
    const subList = card.querySelector('.branch-subtopics-list');
    if (addSubtopicBtn && subList) {
      addSubtopicBtn.addEventListener('click', () => {
        const row = document.createElement('div');
        row.className = 'subtopic-item-row';
        row.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
            <input type="text" class="subtopic-name-input" value="" placeholder="Subtopic Title" style="flex:1;" />
            <button type="button" class="danger-btn-sm remove-subtopic-btn" title="Remove subtopic" style="padding:0.2rem 0.4rem; font-size:0.75rem; background:none; border:none; color:#dc2626; cursor:pointer;">✕</button>
          </div>
          <textarea class="subtopic-detail-input" rows="2" placeholder="Explanation or concept detail..."></textarea>
        `;
        row.querySelector('.remove-subtopic-btn').addEventListener('click', () => row.remove());
        subList.appendChild(row);
      });
    }

    card.querySelectorAll('.remove-subtopic-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.target.closest('.subtopic-item-row')?.remove();
      });
    });
  });
}

// Add Branch Button
if (mmAddBranchBtn && mmBranchesContainer) {
  mmAddBranchBtn.addEventListener('click', () => {
    const colors = ['#6366f1', '#059669', '#d97706', '#8b5cf6', '#ec4899', '#0284c7'];
    const currentCount = mmBranchesContainer.querySelectorAll('.branch-card').length;
    const randomColor = colors[currentCount % colors.length];

    const card = document.createElement('div');
    card.className = 'branch-card';
    card.innerHTML = `
      <div class="branch-card-head" style="display:flex; align-items:center; gap:0.5rem;">
        <span class="branch-color-indicator" style="background: ${randomColor}; width:14px; height:14px; border-radius:50%; flex-shrink:0;"></span>
        <input type="text" class="branch-title-input" value="New Concept Branch ${currentCount + 1}" placeholder="Branch Title" style="flex:1; font-weight:700;" />
        <input type="color" class="branch-color-picker" value="${randomColor}" style="width:28px;height:28px;padding:0;border:none;background:none;cursor:pointer;" />
        <button type="button" class="remove-branch-btn" title="Remove branch" style="background:none; border:none; color:#dc2626; font-size:0.9rem; cursor:pointer;">✕</button>
      </div>
      <div class="branch-subtopics-list" style="margin-top:0.5rem; display:flex; flex-direction:column; gap:0.5rem;">
        <div class="subtopic-item-row">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
            <input type="text" class="subtopic-name-input" value="Key Concept" placeholder="Subtopic Title" style="flex:1;" />
            <button type="button" class="danger-btn-sm remove-subtopic-btn" title="Remove subtopic" style="padding:0.2rem 0.4rem; font-size:0.75rem; background:none; border:none; color:#dc2626; cursor:pointer;">✕</button>
          </div>
          <textarea class="subtopic-detail-input" rows="2" placeholder="Explanation or concept detail..."></textarea>
        </div>
      </div>
      <button type="button" class="ghost-btn add-subtopic-btn" style="margin-top:0.5rem; font-size:0.8rem; padding:0.25rem 0.5rem; align-self:flex-start;">+ Add Subtopic</button>
    `;

    const picker = card.querySelector('.branch-color-picker');
    const indicator = card.querySelector('.branch-color-indicator');
    if (picker && indicator) {
      picker.addEventListener('input', () => { indicator.style.background = picker.value; });
    }
    card.querySelector('.remove-branch-btn')?.addEventListener('click', () => card.remove());
    card.querySelector('.remove-subtopic-btn')?.addEventListener('click', (e) => e.target.closest('.subtopic-item-row')?.remove());

    const addSub = card.querySelector('.add-subtopic-btn');
    const subList = card.querySelector('.branch-subtopics-list');
    addSub?.addEventListener('click', () => {
      const row = document.createElement('div');
      row.className = 'subtopic-item-row';
      row.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
          <input type="text" class="subtopic-name-input" value="" placeholder="Subtopic Title" style="flex:1;" />
          <button type="button" class="danger-btn-sm remove-subtopic-btn" title="Remove subtopic" style="padding:0.2rem 0.4rem; font-size:0.75rem; background:none; border:none; color:#dc2626; cursor:pointer;">✕</button>
        </div>
        <textarea class="subtopic-detail-input" rows="2" placeholder="Explanation or concept detail..."></textarea>
      `;
      row.querySelector('.remove-subtopic-btn').addEventListener('click', () => row.remove());
      subList.appendChild(row);
    });

    mmBranchesContainer.appendChild(card);
  });
}

// Save Changes button
if (pedagogySaveBtn) {
  pedagogySaveBtn.addEventListener('click', async () => {
    const ch = getSelectedChapterObj();
    if (!ch) {
      alert('Please select a Class & Chapter first!');
      return;
    }

    const lpUnitTitle = (document.getElementById('lpUnitTitle')?.value || '').trim();
    const lpMethodology = (document.getElementById('lpMethodology')?.value || '').trim();
    const lpLearningObjectives = (document.getElementById('lpLearningObjectives')?.value || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const lpBloomTaxonomy = (document.getElementById('lpBloomTaxonomy')?.value || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const lpClassroomActivity = (document.getElementById('lpClassroomActivity')?.value || '').trim();
    const lpHomeworkAssignment = (document.getElementById('lpHomeworkAssignment')?.value || '').trim();
    const attachedPdf = (lpPdfUrl?.value || '').trim();

    const periods = [];
    for (let i = 1; i <= 4; i++) {
      periods.push({
        periodNumber: i,
        title: (document.getElementById(`p${i}Title`)?.value || `Period ${i}`).trim(),
        teacherActivity: (document.getElementById(`p${i}Teacher`)?.value || '').trim(),
        studentActivity: (document.getElementById(`p${i}Student`)?.value || '').trim(),
        teachingAids: (document.getElementById(`p${i}Aids`)?.value || '').trim(),
        assessmentQuestion: (document.getElementById(`p${i}Assessment`)?.value || '').trim()
      });
    }

    const lessonPlan = {
      unitTitle: lpUnitTitle || `${ch.chapterName} Comprehensive Study`,
      pedagogicalMethodology: lpMethodology,
      learningObjectives: lpLearningObjectives,
      bloomTaxonomy: lpBloomTaxonomy,
      periodsCount: 4,
      periods,
      classroomActivity: lpClassroomActivity,
      homeworkAssignment: lpHomeworkAssignment,
      pdfUrl: attachedPdf
    };

    const mmCentralTopic = (document.getElementById('mmCentralTopic')?.value || ch.chapterName || '').trim();
    const branches = [];
    if (mmBranchesContainer) {
      mmBranchesContainer.querySelectorAll('.branch-card').forEach((card, bIdx) => {
        const title = (card.querySelector('.branch-title-input')?.value || `Branch ${bIdx + 1}`).trim();
        const color = card.querySelector('.branch-color-picker')?.value || '#6366f1';
        const subtopics = [];
        card.querySelectorAll('.subtopic-item-row').forEach((row) => {
          const name = (row.querySelector('.subtopic-name-input')?.value || '').trim();
          const detail = (row.querySelector('.subtopic-detail-input')?.value || '').trim();
          if (name) {
            subtopics.push({ name, detail, keywords: [name.toLowerCase()] });
          }
        });
        branches.push({ id: `branch-${bIdx + 1}`, title, color, subtopics });
      });
    }

    const mindMap = {
      centralTopic: mmCentralTopic,
      branches,
      imageUrl: (mmImageUrl?.value || '').trim(),
      pdfUrl: (mmPdfUrl?.value || '').trim()
    };

    try {
      const res = await authedFetch(`${API_BASE}/pedagogy/admin/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          className: ch.className,
          bookName: ch.bookName,
          chapterName: ch.chapterName,
          lessonPlan,
          mindMap
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');

      currentPedagogyData = data.data;
      updatePedagogyStatusBadge(currentPedagogyData);
      loadPedagogyChaptersList();
      alert('💾 Changes successfully saved to Database!');
    } catch (err) {
      console.error('Save error:', err);
      alert('Error saving pedagogy data: ' + err.message);
    }
  });
}

// =========================================================================
// ---------- BOOK FEATURES MANAGEMENT ADMIN ----------
// =========================================================================

const bookFeaturesContainer = document.getElementById('bookFeaturesContainer');
const refreshFeaturesBtn = document.getElementById('refreshFeaturesBtn');

const ALL_FEATURES_META = [
  { key: 'lessonPlan', label: '📋 Smart Lesson Plans', desc: 'Direct lesson plan sheet & PDF view' },
  { key: 'mindMap', label: '🗺️ Concept Mind Maps', desc: 'Interactive concept map & visual diagrams' },
  { key: 'testPaper', label: '📑 Examination Papers', desc: 'School examination generator & live editor' },
  { key: 'worksheet', label: '📝 Practice Worksheets', desc: 'Printable chapter question worksheets' },
  { key: 'oralTest', label: '🎙️ Robot Voice Viva', desc: 'Oral test & speaking dialogue with robot' },
  { key: 'quiz', label: '🎯 Interactive Quiz', desc: 'MCQ & memory flashcards module' },
  { key: 'notes', label: '📄 Study Revision Notes', desc: 'Chapter notes export & print' },
  { key: 'explainSimply', label: '💡 Explain Simply', desc: 'Step-by-step breakdown chip on answers' },
  { key: 'voiceTts', label: '🔊 Robot Voice / TTS', desc: 'Speech audio synthesis & voice speed controls' }
];

async function loadBookFeaturesList() {
  if (!bookFeaturesContainer) return;
  bookFeaturesContainer.innerHTML = '<div class="muted" style="padding: 2rem; text-align: center;">Loading books and feature settings...</div>';

  try {
    const res = await authedFetch(`${API_BASE}/pedagogy/admin/book-features`);
    const data = await res.json();
    const books = data.books || [];

    if (books.length === 0) {
      bookFeaturesContainer.innerHTML = '<div class="muted" style="padding: 2rem; text-align: center;">No textbooks found in the database.</div>';
      return;
    }

    renderBookFeaturesGrid(books);
  } catch (err) {
    console.error('Failed to load book features:', err);
    bookFeaturesContainer.innerHTML = `<div class="muted" style="padding: 2rem; text-align: center; color:#dc2626;">Error loading book features: ${escapeHtml(err.message)}</div>`;
  }
}

if (refreshFeaturesBtn) {
  refreshFeaturesBtn.addEventListener('click', loadBookFeaturesList);
}

function renderBookFeaturesGrid(books) {
  if (!bookFeaturesContainer) return;

  bookFeaturesContainer.innerHTML = books
    .map((book, bIdx) => {
      const featTogglesHtml = ALL_FEATURES_META.map((feat) => {
        const isChecked = book.features && book.features[feat.key] !== false;
        return `
          <div class="feature-toggle-item">
            <label>
              <div class="feature-label-text">
                <span>${feat.label}</span>
                <span style="font-size: 0.75rem; font-weight: normal; color: var(--ink-soft);">(${feat.desc})</span>
              </div>
              <input type="checkbox" class="feature-checkbox" data-feat="${feat.key}" ${isChecked ? 'checked' : ''} />
            </label>
          </div>
        `;
      }).join('');

      return `
        <div class="book-feature-card" data-idx="${bIdx}" data-class="${escapeHtml(book.className)}" data-book="${escapeHtml(book.bookName)}">
          <div class="book-card-header">
            <div>
              <h3 class="book-card-title">${escapeHtml(book.className)} • ${escapeHtml(book.bookName)}</h3>
              <div class="book-card-meta">📚 ${book.chaptersCount || 0} Chapters &bull; ❓ ${book.questionCount || 0} Questions</div>
            </div>
            <div class="book-card-bulk-actions">
              <button type="button" class="ghost-btn select-all-feat-btn" style="font-size:0.75rem; padding:0.2rem 0.5rem;">All ON</button>
              <button type="button" class="ghost-btn clear-all-feat-btn" style="font-size:0.75rem; padding:0.2rem 0.5rem;">All OFF</button>
            </div>
          </div>

          <div class="feature-toggles-list">
            ${featTogglesHtml}
          </div>

          <div class="book-card-actions">
            <span class="book-save-status"></span>
            <button type="button" class="primary-btn save-book-feat-btn" style="padding:0.45rem 1rem; font-size:0.85rem;">Save Book Settings</button>
          </div>
        </div>
      `;
    })
    .join('');

  // Attach card event listeners
  bookFeaturesContainer.querySelectorAll('.book-feature-card').forEach((card) => {
    const className = card.dataset.class;
    const bookName = card.dataset.book;
    const checkboxes = card.querySelectorAll('.feature-checkbox');
    const saveBtn = card.querySelector('.save-book-feat-btn');
    const statusSpan = card.querySelector('.book-save-status');
    const selectAllBtn = card.querySelector('.select-all-feat-btn');
    const clearAllBtn = card.querySelector('.clear-all-feat-btn');

    if (selectAllBtn) {
      selectAllBtn.addEventListener('click', () => {
        checkboxes.forEach((cb) => (cb.checked = true));
      });
    }

    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', () => {
        checkboxes.forEach((cb) => (cb.checked = false));
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const features = {};
        checkboxes.forEach((cb) => {
          features[cb.dataset.feat] = cb.checked;
        });

        saveBtn.disabled = true;
        statusSpan.textContent = 'Saving...';
        statusSpan.style.color = 'var(--ink-soft)';

        try {
          const res = await authedFetch(`${API_BASE}/pedagogy/admin/book-features`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ className, bookName, features })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to save');

          statusSpan.textContent = '✔ Saved!';
          statusSpan.style.color = '#059669';
          setTimeout(() => { statusSpan.textContent = ''; }, 3000);
        } catch (err) {
          console.error('Error saving book features:', err);
          statusSpan.textContent = '❌ Error';
          statusSpan.style.color = '#dc2626';
          alert('Could not save feature settings: ' + err.message);
        } finally {
          saveBtn.disabled = false;
        }
      });
    }
  });
}



