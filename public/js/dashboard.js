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

// selectedFiles: Map<localId, { file, previewUrl }>
// driveUrls:     Map<localId, string>  (Drive viewUrl after upload)
let selectedFiles = new Map();
let driveUrls     = new Map();
let nextFileId    = 0;

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

// ── Submit form (parallel upload + submit) ─────────────────
async function handleSubmit(e) {
  e.preventDefault();
  clearAlert();
  setSubmitLoading(true);

  // Step 1: upload all images to Google Drive in parallel
  let attachmentUrls = [];
  if (selectedFiles.size > 0) {
    setSummary(`Uploading ${selectedFiles.size} image(s) to Google Drive…`);
    try {
      const uploads = [...selectedFiles.entries()].map(([id, { file }]) =>
        uploadOneFile(file, id)
      );
      const results = await Promise.all(uploads);
      const failed  = results.filter(r => !r.viewUrl);
      if (failed.length) {
        showAlert(`${failed.length} image(s) failed to upload. Please try again.`);
        setSubmitLoading(false);
        return;
      }
      attachmentUrls = results.map(r => r.viewUrl);
      setSummary(`✓ ${attachmentUrls.length} image(s) saved to Google Drive`);
    } catch {
      showAlert('Image upload failed — check your connection.');
      setSubmitLoading(false);
      return;
    }
  }

  // Step 2: submit task row
  const payload = {
    taskTitle:     document.getElementById('task-title').value.trim(),
    description:   document.getElementById('description').value.trim(),
    projectCode:   document.getElementById('project-code').value.trim(),
    date:          document.getElementById('task-date').value,
    hours:         document.getElementById('hours').value,
    status:        document.getElementById('status').value,
    priority:      document.getElementById('priority').value,
    notes:         document.getElementById('notes').value.trim(),
    attachmentUrls, // string[] of public Google Drive view URLs
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

// Upload a single file to Cloudflare R2; update its card overlay
async function uploadOneFile(file, localId) {
  setCardOverlay(localId, 'Uploading…', 30);
  try {
    const fd = new FormData();
    fd.append('file', file);
    const rrlNumber = document.getElementById('project-code')?.value.trim() || '';
    if (rrlNumber) {
      fd.append('projectCode', rrlNumber);
    }
    const res = await fetch(API_BASE_URL + '/api/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
      body: fd,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    setCardOverlay(localId, '✓', 100);
    const card = document.getElementById(`card-${localId}`);
    if (card) setTimeout(() => card.classList.add('done'), 400);
    return { viewUrl: data.viewUrl }; // public Google Drive URL
  } catch (err) {
    setCardOverlay(localId, '❌ Error', 0);
    return { viewUrl: null, error: err.message };
  }
}

function resetForm() {
  document.getElementById('submit-form').reset();
  setDefaultDate();
  clearAlert();
  clearAllFiles();
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

// Build inline image cell — Drive viewUrls are public, no token needed
function imgCell(driveUrlCsv, _token) {
  if (!driveUrlCsv) return '—';
  const urls = driveUrlCsv.split(/[\n,]+/).map(u => u.trim()).filter(Boolean);
  if (!urls.length) return '—';
  return urls.map(url => `
    <a href="${url}" target="_blank" rel="noopener" style="display:inline-block;">
      <img src="${url}" alt="attachment"
        style="width:48px;height:48px;object-fit:cover;border-radius:6px;border:1px solid var(--border);margin-right:3px;"
        onerror="this.style.display='none'" />
    </a>`).join('');
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

// ── File picker helpers (multi-image with client-side compression) ──
async function handleFileSelect(input) {
  await addFiles([...input.files]);
  input.value = ''; // reset so same file can be re-added after removal
}

async function addFiles(files) {
  const MAX = 10 * 1024 * 1024;
  let rejected = 0;
  for (const file of files) {
    if (!file.type.startsWith('image/')) { rejected++; continue; }
    if (file.size > MAX)                 { rejected++; continue; }
    
    // Optimise and compress client-side before upload (target ~1200px max width/height, 80% quality)
    const id = nextFileId++;
    addCardToGrid(id, file, URL.createObjectURL(file)); // show immediate preview of original first
    setCardOverlay(id, 'Compressing…', 15);
    
    try {
      const optimizedFile = await compressImage(file);
      // Replace with optimized file info
      const url = URL.createObjectURL(optimizedFile);
      selectedFiles.set(id, { file: optimizedFile, previewUrl: url });
      
      // Update the card image to the optimized one and reset overlay to ready
      const imgEl = document.querySelector(`#card-${id} img`);
      if (imgEl) imgEl.src = url;
      
      const infoEl = document.querySelector(`#card-${id} .img-card-info`);
      if (infoEl) infoEl.textContent = `${esc(optimizedFile.name)} (${formatBytes(optimizedFile.size)})`;
      
      setCardOverlay(id, 'Ready', 0);
    } catch (err) {
      console.error('Compression failed, using original file:', err);
      const url = URL.createObjectURL(file);
      selectedFiles.set(id, { file, previewUrl: url });
      setCardOverlay(id, 'Ready', 0);
    }
  }
  if (rejected) showToast(`${rejected} file(s) skipped (not an image or > 10 MB)`, 'error');
  updateSummary();
}

// Clientside image compression using canvas
function compressImage(file, maxWidth = 1200, maxHeight = 1200, quality = 0.8) {
  return new Promise((resolve) => {
    // Only compress compressible formats
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      resolve(file);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }
            const compressedFile = new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => resolve(file);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

function addCardToGrid(id, file, previewUrl) {
  const grid = document.getElementById('img-grid');
  const card = document.createElement('div');
  card.className = 'img-card';
  card.id = `card-${id}`;
  card.innerHTML = `
    <img src="${previewUrl}" alt="${esc(file.name)}" />
    <div class="img-card-info" title="${esc(file.name)}">${esc(file.name)}</div>
    <button class="img-card-remove" type="button" onclick="removeFile(${id})" title="Remove">✕</button>
    <div class="img-card-overlay" id="overlay-${id}">
      <span id="overlay-label-${id}">Ready</span>
      <div class="mini-progress"><div class="mini-bar" id="mini-bar-${id}" style="width:0%"></div></div>
    </div>`;
  grid.appendChild(card);
}

function removeFile(id) {
  const entry = selectedFiles.get(id);
  if (entry) URL.revokeObjectURL(entry.previewUrl);
  selectedFiles.delete(id);
  const card = document.getElementById(`card-${id}`);
  if (card) card.remove();
  updateSummary();
}

function clearAllFiles() {
  selectedFiles.forEach(({ previewUrl }) => URL.revokeObjectURL(previewUrl));
  selectedFiles.clear();
  driveUrls.clear();
  document.getElementById('img-grid').innerHTML = '';
  document.getElementById('attachment-file').value = '';
  updateSummary();
}

function updateSummary() {
  const el = document.getElementById('img-summary');
  if (selectedFiles.size === 0) {
    el.classList.add('hidden');
    return;
  }
  const totalBytes = [...selectedFiles.values()].reduce((s, { file }) => s + file.size, 0);
  el.textContent = `${selectedFiles.size} image(s) selected · ${formatBytes(totalBytes)} total`;
  el.classList.remove('hidden');
}

function setCardOverlay(id, label, pct) {
  const lbl = document.getElementById(`overlay-label-${id}`);
  const bar = document.getElementById(`mini-bar-${id}`);
  if (lbl) lbl.textContent = label;
  if (bar) bar.style.width = pct + '%';
}

function setSummary(msg) {
  const el = document.getElementById('img-summary');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function formatBytes(bytes) {
  if (bytes < 1024)    return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
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
    addFiles([...e.dataTransfer.files]);
  });
}
