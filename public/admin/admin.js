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
const pedagogyAiLoadingBanner = document.getElementById('pedagogyAiLoadingBanner');
const pedagogyRefreshBtn = document.getElementById('pedagogyRefreshBtn');
const pedagogyGenerateAIBtn = document.getElementById('pedagogyGenerateAIBtn');
const pedagogySaveBtn = document.getElementById('pedagogySaveBtn');
const mmBranchesContainer = document.getElementById('mmBranchesContainer');

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
        pedagogyStatusBadge.textContent = '⚪ Not in Database (Click "Auto-Generate with AI")';
      }
    }
  } catch (err) {
    console.error('Error fetching chapter pedagogy:', err);
  }
}

function updatePedagogyStatusBadge(doc) {
  if (!pedagogyStatusBadge || !doc) return;
  const isAI = doc.lessonPlan && doc.lessonPlan.isAIGenerated;
  const dateStr = doc.updatedAt ? new Date(doc.updatedAt).toLocaleDateString() : '';

  if (isAI) {
    pedagogyStatusBadge.className = 'pedagogy-status-badge status-ai';
    pedagogyStatusBadge.innerHTML = `🟣 AI Generated &amp; Saved in MongoDB (${dateStr})`;
  } else {
    pedagogyStatusBadge.className = 'pedagogy-status-badge status-saved';
    pedagogyStatusBadge.innerHTML = `🟢 Saved &amp; Customized in MongoDB (${dateStr})`;
  }
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

  const mmCentralTopic = document.getElementById('mmCentralTopic');
  if (mmCentralTopic) mmCentralTopic.value = ch.chapterName || 'Chapter Topic';

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

  const mmCentralTopic = document.getElementById('mmCentralTopic');
  if (mmCentralTopic) mmCentralTopic.value = mm.centralTopic || doc.chapterName || '';

  renderMindMapBranches(mm.branches || []);
}

function renderDefaultBranches(chapterName) {
  const defaultBranches = [
    {
      id: 'branch-1',
      title: 'Core Fundamentals & Definitions',
      color: '#6366f1',
      subtopics: [{ name: 'Key Concept', detail: 'Basic definition and role', keywords: ['concept'] }]
    },
    {
      id: 'branch-2',
      title: 'Processes & Mechanisms',
      color: '#059669',
      subtopics: [{ name: 'How It Works', detail: 'Step-by-step mechanism', keywords: ['process'] }]
    },
    {
      id: 'branch-3',
      title: 'Structures & Components',
      color: '#d97706',
      subtopics: [{ name: 'Main Parts', detail: 'Functions and roles', keywords: ['structure'] }]
    },
    {
      id: 'branch-4',
      title: 'Real-Life Applications & Significance',
      color: '#8b5cf6',
      subtopics: [{ name: 'Everyday Example', detail: 'Application in daily life', keywords: ['example'] }]
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
          <input type="text" class="subtopic-name-input" value="${escapeHtml(s.name || '')}" placeholder="Subtopic Name (e.g. Evaporation)" />
          <textarea class="subtopic-detail-input" rows="2" placeholder="Explanation or concept detail...">${escapeHtml(s.detail || '')}</textarea>
        </div>
      `
        )
        .join('');

      return `
      <div class="branch-card" data-branch-idx="${bIdx}">
        <div class="branch-card-head">
          <span class="branch-color-indicator" style="background: ${b.color || '#6366f1'};"></span>
          <input type="text" class="branch-title-input" value="${escapeHtml(b.title || '')}" placeholder="Branch Title" />
          <input type="color" class="branch-color-picker" value="${b.color || '#6366f1'}" style="width:28px;height:28px;padding:0;border:none;background:none;cursor:pointer;" />
        </div>
        <div class="branch-subtopics-list">
          ${subsHtml}
        </div>
      </div>
    `;
    })
    .join('');

  // Wire color pickers to indicators
  mmBranchesContainer.querySelectorAll('.branch-card').forEach((card) => {
    const picker = card.querySelector('.branch-color-picker');
    const indicator = card.querySelector('.branch-color-indicator');
    if (picker && indicator) {
      picker.addEventListener('input', () => {
        indicator.style.background = picker.value;
      });
    }
  });
}

// Auto-generate with AI button
if (pedagogyGenerateAIBtn) {
  pedagogyGenerateAIBtn.addEventListener('click', async () => {
    const ch = getSelectedChapterObj();
    if (!ch) {
      alert('Please select a Class & Chapter first!');
      return;
    }

    if (
      currentPedagogyData &&
      !confirm('This chapter already has saved pedagogy data. Do you want to re-generate it with AI? (Existing custom edits will be replaced)')
    ) {
      return;
    }

    if (pedagogyAiLoadingBanner) pedagogyAiLoadingBanner.classList.remove('hidden');
    pedagogyGenerateAIBtn.disabled = true;

    try {
      const res = await authedFetch(`${API_BASE}/pedagogy/admin/generate-ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ch)
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'AI generation failed');
      }

      currentPedagogyData = data.data;
      fillPedagogyForms(currentPedagogyData);
      updatePedagogyStatusBadge(currentPedagogyData);

      // Refresh option icon in dropdown
      loadPedagogyChaptersList();

      alert('✨ Authentic CBSE Lesson Plan & Mind Map generated with AI and permanently saved to MongoDB!');
    } catch (err) {
      console.error('AI generation error:', err);
      alert('Error during AI generation: ' + err.message);
    } finally {
      if (pedagogyAiLoadingBanner) pedagogyAiLoadingBanner.classList.add('hidden');
      pedagogyGenerateAIBtn.disabled = false;
    }
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
      homeworkAssignment: lpHomeworkAssignment
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
      branches
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
      alert('💾 Changes successfully saved to Database!');
    } catch (err) {
      console.error('Save error:', err);
      alert('Error saving pedagogy data: ' + err.message);
    }
  });
}


