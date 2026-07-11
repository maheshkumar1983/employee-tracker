// =============================================================
// admin.js — Admin panel: fetch all, filter, export CSV
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

// Column indexes from the Sheet row:
// 0:Timestamp 1:EmpID 2:Name 3:Dept 4:ProjectCode 5:TaskTitle
// 6:Description 7:Date 8:Hours 9:Status 10:Priority 11:Notes 12:AttachmentURL

let allRows = [];
let filteredRows = [];

document.addEventListener('DOMContentLoaded', () => {
  if (!requireAuth('admin')) return;
  loadData();
});

async function loadData() {
  document.getElementById('table-content').innerHTML = `
    <div style="padding:3rem; text-align:center;">
      <div class="spinner" style="margin:0 auto;"></div>
      <p class="text-muted mt-2">Fetching data from Google Sheets…</p>
    </div>`;

  try {
    const res = await authFetch('/api/submissions');
    if (!res) return;
    const data = await res.json();
    allRows = (data.rows || []).filter(r => r.length > 0);
    filteredRows = allRows;
    populateDeptFilter();
    applyFilters();
    updateStats(allRows);
  } catch (err) {
    document.getElementById('table-content').innerHTML =
      `<div class="alert alert-error" style="margin:1.5rem;">⚠️ Failed to load data: ${err.message}</div>`;
  }
}

function populateDeptFilter() {
  const depts = [...new Set(allRows.map(r => r[3]).filter(Boolean))].sort();
  const sel = document.getElementById('filter-dept');
  sel.innerHTML = '<option value="">All Departments</option>' +
    depts.map(d => `<option>${esc(d)}</option>`).join('');
}

function applyFilters() {
  const search   = document.getElementById('filter-search').value.toLowerCase();
  const status   = document.getElementById('filter-status').value;
  const priority = document.getElementById('filter-priority').value;
  const dept     = document.getElementById('filter-dept').value;
  const dateFrom = document.getElementById('filter-date-from').value;
  const dateTo   = document.getElementById('filter-date-to').value;

  filteredRows = allRows.filter(r => {
    if (status   && r[9]  !== status)   return false;
    if (priority && r[10] !== priority) return false;
    if (dept     && r[3]  !== dept)     return false;
    if (dateFrom && r[7]  < dateFrom)   return false;
    if (dateTo   && r[7]  > dateTo)     return false;
    if (search) {
      const hay = [r[1],r[2],r[3],r[4],r[5],r[6],r[11]].join(' ').toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  document.getElementById('filter-info').textContent =
    `Showing ${filteredRows.length} of ${allRows.length} records`;

  renderTable(filteredRows);
}

function clearFilters() {
  ['filter-search','filter-date-from','filter-date-to'].forEach(id => document.getElementById(id).value = '');
  ['filter-status','filter-priority','filter-dept'].forEach(id => document.getElementById(id).value = '');
  applyFilters();
}

function renderTable(rows) {
  if (!rows || rows.length === 0) {
    document.getElementById('table-content').innerHTML = `
      <div class="empty-state" style="padding:3rem;">
        <div class="empty-icon">📭</div>
        <p>No matching submissions found.</p>
      </div>`;
    return;
  }

  const token  = getToken();
  const sorted = [...rows].reverse();

  const html = `
    <div class="table-wrapper" style="border:none; border-radius:0;">
      <table>
        <thead>
          <tr>
            <th>Submitted</th>
            <th>Employee</th>
            <th>Department</th>
            <th>Project</th>
            <th>Task</th>
            <th>Date</th>
            <th>Hrs</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Notes</th>
            <th>Attachment</th>
          </tr>
        </thead>
        <tbody>
          ${sorted.map(r => `
            <tr>
              <td class="text-xs text-muted" style="white-space:nowrap;">${formatDate(r[0])}</td>
              <td>
                <div class="fw-600" style="color:var(--text-primary);white-space:nowrap;">${esc(r[2]) || esc(r[1])}</div>
                <div class="text-xs text-muted">${esc(r[1])}</div>
              </td>
              <td class="text-sm">${r[3] ? `<span class="badge badge-muted">${esc(r[3])}</span>` : '—'}</td>
              <td class="text-sm">${esc(r[4]) || '—'}</td>
              <td>
                <div class="fw-600" style="color:var(--text-primary); max-width:180px;">${esc(r[5])}</div>
                ${r[6] ? `<div class="text-xs text-muted" style="max-width:180px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${esc(r[6])}">${esc(r[6])}</div>` : ''}
              </td>
              <td class="text-sm" style="white-space:nowrap;">${r[7] || '—'}</td>
              <td class="text-sm">${r[8] ? r[8]+'h' : '—'}</td>
              <td><span class="badge ${STATUS_BADGES[r[9]] || 'badge-muted'}">${esc(r[9]) || '—'}</span></td>
              <td><span class="badge ${PRIORITY_BADGES[r[10]] || 'badge-muted'}">${esc(r[10]) || '—'}</span></td>
              <td class="text-xs text-muted" style="max-width:140px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${esc(r[11])}">${esc(r[11]) || '—'}</td>
              <td>${r[12] ? imgThumb(r[12], token) : '—'}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  document.getElementById('table-content').innerHTML = html;
}

function updateStats(rows) {
  const empIds  = new Set(rows.map(r => r[1]));
  const done    = rows.filter(r => r[9] === 'Completed').length;
  const hours   = rows.reduce((s, r) => s + (parseFloat(r[8]) || 0), 0);
  document.getElementById('stat-employees').textContent = empIds.size;
  document.getElementById('stat-total').textContent     = rows.length;
  document.getElementById('stat-done').textContent      = done;
  document.getElementById('stat-hours').textContent     = hours % 1 === 0 ? hours : hours.toFixed(1);
}

// ── CSV Export ────────────────────────────────────────────────
function exportCSV() {
  if (!filteredRows.length) { alert('No data to export.'); return; }

  const headers = ['Submitted','EmpID','Name','Department','ProjectCode','TaskTitle','Description','Date','Hours','Status','Priority','Notes','AttachmentURL'];
  const csvRows = [headers, ...filteredRows];
  const csvString = csvRows.map(r =>
    r.map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(',')
  ).join('\r\n');

  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `task-tracker-export-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Image thumbnail strip — Drive URLs are public, no auth needed ──
// Column M stores newline-separated Google Drive/R2 view URLs
function imgThumb(driveUrlCsv, _token) {
  if (!driveUrlCsv) return '—';
  const urls = driveUrlCsv.split(/[\n,]+/).map(u => u.trim()).filter(Boolean);
  if (!urls.length) return '—';
  return urls.map(url => `
    <a href="${url}" target="_blank" rel="noopener" style="display:inline-block;">
      <img src="${url}" alt="attachment"
        style="width:44px;height:44px;object-fit:cover;border-radius:5px;border:1px solid var(--border);cursor:zoom-in;margin-right:3px;"
        onerror="this.style.display='none'" />
    </a>`).join('');
}




// ── Helpers ───────────────────────────────────────────────────
function formatDate(ts) {

  if (!ts) return '—';
  try {
    const d = new Date(ts);
    return d.toLocaleDateString('en-AU', { day:'2-digit', month:'short', year:'2-digit' }) +
           ' ' + d.toLocaleTimeString('en-AU', { hour:'2-digit', minute:'2-digit', hour12:false });
  } catch { return ts; }
}

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
