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

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (!requireAuth('employee')) return;
  initNav();
  setDefaultDate();
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

// ── Submit form ───────────────────────────────────────────────
async function handleSubmit(e) {
  e.preventDefault();
  clearAlert();
  setSubmitLoading(true);

  const payload = {
    taskTitle:     document.getElementById('task-title').value.trim(),
    description:   document.getElementById('description').value.trim(),
    projectCode:   document.getElementById('project-code').value.trim(),
    date:          document.getElementById('task-date').value,
    hours:         document.getElementById('hours').value,
    status:        document.getElementById('status').value,
    priority:      document.getElementById('priority').value,
    notes:         document.getElementById('notes').value.trim(),
    attachmentUrl: document.getElementById('attachment-url').value.trim(),
  };

  try {
    const res = await authFetch('/api/submit', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (!res) return; // 401 redirect handled

    const data = await res.json();
    if (res.ok) {
      showToast('✅ Task submitted successfully!', 'success');
      resetForm();
      setDefaultDate();
      allRows = []; // force refresh on next history view
    } else {
      showAlert(data.error || 'Submission failed. Please try again.', 'error');
    }
  } catch {
    showAlert('Network error. Check your connection and try again.', 'error');
  } finally {
    setSubmitLoading(false);
  }
}

function resetForm() {
  document.getElementById('submit-form').reset();
  setDefaultDate();
  clearAlert();
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

  // Show newest first
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
            <th>Notes</th>
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
              <td class="text-sm text-muted" style="max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${esc(r[11])}">${esc(r[11]) || '—'}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  document.getElementById('history-content').innerHTML = html;
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
