// =============================================================
// dashboard.js — Employee task submission & history
// =============================================================

const STATUS_BADGES = {
  'Completed':   'badge-success',
  'In Progress': 'badge-info',
  'Blocked':     'badge-danger',
  'Review':      'badge-warning',
  'On Hold':     'badge-muted',
};

const PRIORITY_BADGES = {
  'Critical': 'badge-danger',
  'High':     'badge-warning',
  'Medium':   'badge-purple',
  'Low':      'badge-muted',
};

let allRows = [];
let selectedFile = null;  // holds File object chosen by user
let uploadedKey  = null;  // holds R2 key after successful upload

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (!requireAuth('employee')) return;
  initNav();
  setDefaultDate();
  initDropZone();
  loadHistory();
});

function initNav() {
  const name = getDisplayName();
  document.getElementById('nav-name').textContent = name;
  document.getElementById('nav-avatar').textContent = name.charAt(0).toUpperCase();
  const dept = sessionStorage.getItem('auth_dept') || '';
  document.getElementById('dept-badge').textContent = dept || 'Employee';
}

function setDefaultDate() {
  document.getElementById('task-date').value = new Date().toISOString().split('T')[0];
}

// ── Tab switching ─────────────────────────────────────────────
function switchTab(name, btn) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`tab-${name}`).classList.add('active');
  btn.classList.add('active');
  if (name === 'history' && allRows.length === 0) loadHistory();
}

// ── Submit form (two-step: upload then submit) ────────────────
async function handleSubmit(e) {
  e.preventDefault();
  clearAlert();
  setSubmitLoading(true);

  // Step 1: upload image if selected
  let attachmentKey = null;
  if (selectedFile) {
    setUploadStatus('Uploading image…', 10);
    try {
      const fd = new FormData();
      fd.append('file', selectedFile);
      const upRes = await fetch(API_BASE_URL + '/api/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      });
      const upData = await upRes.json();
      if (!upRes.ok) {
        showAlert(upData.error || 'Image upload failed');
        setSubmitLoading(false);
        setUploadStatus('Upload failed', 0);
        return;
      }
      attachmentKey = upData.key;
      setUploadStatus('Image uploaded ✓', 100);
    } catch {
      showAlert('Image upload failed — check your connection.');
      setSubmitLoading(false);
      return;
    }
  }

  // Step 2: submit the task row
  const payload = {
    taskTitle:     document.getElementById('task-title').value.trim(),
    description:   document.getElementById('description').value.trim(),
    projectCode:   document.getElementById('project-code').value.trim(),
    date:          document.getElementById('task-date').value,
    hours:         document.getElementById('hours').value,
    status:        document.getElementById('status').value,
    priority:      document.getElementById('priority').value,
    notes:         document.getElementById('notes').value.trim(),
    attachmentKey,   // R2 key (null if no image)
  };

  try {
    const res = await authFetch('/api/submit', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!res) return;
    const data = await res.json();
    if (res.ok) {
      showToast('✅ Task submitted successfully!', 'success');
      resetForm();
      setDefaultDate();
      allRows = [];
    } else {
      showAlert(data.error || 'Submission failed. Please try again.');
    }
  } catch {
    showAlert('Network error. Check your connection and try again.');
  } finally {
    setSubmitLoading(false);
  }
}

function resetForm() {
  document.getElementById('submit-form').reset();
  setDefaultDate();
  clearAlert();
  clearFile();
}

function setSubmitLoading(loading) {
  document.getElementById('submit-btn').disabled = loading;
  document.getElementById('submit-btn-text').textContent = loading ? 'Submitting…' : 'Submit Task →';
  document.getElementById('submit-spinner').classList.toggle('hidden', !loading);
}

// ── History ───────────────────────────────────────────────────
async function loadHistory() {
  document.getElementById('history-content').innerHTML = `
    <div style="padding:2rem; text-align:center;">
      <div class="spinner" style="margin:0 auto;"></div>
      <p class="text-muted mt-2">Loading your submissions…</p>
    </div>`;

  try {
    const res = await authFetch('/api/submissions');
    if (!res) return;
    const data = await res.json();
    allRows = data.rows || [];
    renderHistory(allRows);
    updateStats(allRows);
  } catch {
    document.getElementById('history-content').innerHTML =
      '<div class="alert alert-error">Failed to load history. Please refresh.</div>';
  }
}

function renderHistory(rows) {
  if (!rows || rows.length === 0) {
    document.getElementById('history-content').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <p>No submissions yet. Submit your first task!</p>
      </div>`;
    return;
  }

  const token = getToken();
  const sorted = [...rows].reverse();

  const html = `
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Task</th>
            <th>Project</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Hours</th>
            <th>Attachment</th>
          </tr>
        </thead>
        <tbody>
          ${sorted.map(r => `
            <tr>
              <td class="text-sm">${r[7] || '—'}</td>
              <td>
                <div class="fw-600" style="color:var(--text-primary)">${esc(r[5]) || '—'}</div>
                ${r[6] ? `<div class="text-xs text-muted">${esc(r[6])}</div>` : ''}
              </td>
              <td class="text-sm">${r[4] ? `<span class="badge badge-muted">${esc(r[4])}</span>` : '—'}</td>
              <td><span class="badge ${STATUS_BADGES[r[9]] || 'badge-muted'}">${esc(r[9]) || '—'}</span></td>
              <td><span class="badge ${PRIORITY_BADGES[r[10]] || 'badge-muted'}">${esc(r[10]) || '—'}</span></td>
              <td class="text-sm">${r[8] ? r[8] + 'h' : '—'}</td>
              <td>${imgCell(r[12], token)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  document.getElementById('history-content').innerHTML = html;
}

// Build an image thumbnail cell for a stored /api/files/ path
function imgCell(path, token) {
  if (!path) return '—';
  const url = API_BASE_URL + path + '?token=' + encodeURIComponent(token);
  return `<a href="${url}" target="_blank" rel="noopener">
    <img src="${url}" alt="attachment"
      style="width:48px;height:48px;object-fit:cover;border-radius:6px;border:1px solid var(--border);"
      onerror="this.parentElement.innerHTML='<span class=text-muted>N/A</span>'" />
  </a>`;
}

function updateStats(rows) {
  const total   = rows.length;
  const done    = rows.filter(r => r[9] === 'Completed').length;
  const inProg  = rows.filter(r => r[9] === 'In Progress').length;
  const hours   = rows.reduce((sum, r) => sum + (parseFloat(r[8]) || 0), 0);

  document.getElementById('stat-total').textContent  = total;
  document.getElementById('stat-done').textContent   = done;
  document.getElementById('stat-inprog').textContent = inProg;
  document.getElementById('stat-hours').textContent  = hours % 1 === 0 ? hours : hours.toFixed(1);
}

// ── Alerts ────────────────────────────────────────────────────
function showAlert(msg, type = 'error') {
  document.getElementById('form-alert').innerHTML =
    `<div class="alert alert-${type}"><span>${type === 'error' ? '⚠️' : '✅'}</span>${msg}</div>`;
}
function clearAlert() {
  document.getElementById('form-alert').innerHTML = '';
}

// ── Toast ─────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${msg}</span>`;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(20px)'; t.style.transition = '0.3s'; setTimeout(() => t.remove(), 300); }, 3500);
}

// ── Escape HTML ───────────────────────────────────────────────
function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── File picker helpers ───────────────────────────────────────
function handleFileSelect(input) {
  const file = input.files[0];
  if (!file) return;
  setSelectedFile(file);
}

function setSelectedFile(file) {
  const MAX = 10 * 1024 * 1024;
  if (file.size > MAX) {
    showToast('File too large — max 10 MB', 'error');
    return;
  }
  if (!file.type.startsWith('image/')) {
    showToast('Only image files are allowed', 'error');
    return;
  }
  selectedFile = file;
  uploadedKey  = null;

  // Show preview
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('preview-img').src = e.target.result;
    document.getElementById('preview-name').textContent = file.name;
    document.getElementById('preview-size').textContent = formatBytes(file.size);
    document.getElementById('img-preview').classList.remove('hidden');
    document.getElementById('drop-zone-empty').classList.add('hidden');
    setUploadStatus('Ready to upload', 0);
  };
  reader.readAsDataURL(file);
}

function clearFile() {
  selectedFile = null;
  uploadedKey  = null;
  document.getElementById('attachment-file').value = '';
  document.getElementById('preview-img').src = '';
  document.getElementById('img-preview').classList.add('hidden');
  document.getElementById('drop-zone-empty').classList.remove('hidden');
}

function setUploadStatus(msg, progress) {
  const el = document.getElementById('upload-status');
  const bar = document.getElementById('upload-progress-bar');
  if (el) el.textContent = msg;
  if (bar) bar.style.width = progress + '%';
}

function formatBytes(bytes) {
  if (bytes < 1024)       return bytes + ' B';
  if (bytes < 1048576)    return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

// ── Drag-and-drop ─────────────────────────────────────────────
function initDropZone() {
  const zone = document.getElementById('drop-zone');
  if (!zone) return;
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) setSelectedFile(file);
  });
}
