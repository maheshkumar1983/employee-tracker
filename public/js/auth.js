// =============================================================
// auth.js — Login, session storage, token management
// =============================================================

// IMPORTANT: Replace this URL after deploying your Worker
const API_BASE_URL = (window.API_BASE_URL || 'https://employee-tracker-api.java-mahendran.workers.dev');

/**
 * Login function — calls Worker /api/login or /api/admin-login
 * @param {string|null} employeeId
 * @param {string} pin
 * @param {'employee'|'admin'} role
 */
async function login(employeeId, pin, role) {
  const endpoint = role === 'admin' ? '/api/admin-login' : '/api/login';
  const body = role === 'admin' ? { pin } : { employeeId, pin };

  const res = await fetch(API_BASE_URL + endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (res.ok && data.token) {
    sessionStorage.setItem('auth_token', data.token);
    sessionStorage.setItem('auth_role', role);
    if (data.name) sessionStorage.setItem('auth_name', data.name);
    if (data.department) sessionStorage.setItem('auth_dept', data.department);
    if (data.employeeId) sessionStorage.setItem('auth_empId', data.employeeId);
  }

  return data;
}

/** Get stored token */
function getToken() {
  return sessionStorage.getItem('auth_token');
}

/** Get stored role */
function getRole() {
  return sessionStorage.getItem('auth_role');
}

/** Get stored display name */
function getDisplayName() {
  return sessionStorage.getItem('auth_name') || sessionStorage.getItem('auth_empId') || 'User';
}

/** Logout — clear session */
function logout() {
  sessionStorage.clear();
  window.location.href = 'index.html';
}

/** Guard: redirect to login if not authenticated */
function requireAuth(requiredRole) {
  const token = getToken();
  const role = getRole();
  if (!token) { window.location.href = 'index.html'; return false; }
  if (requiredRole && role !== requiredRole) {
    window.location.href = role === 'admin' ? 'admin.html' : 'dashboard.html';
    return false;
  }
  return true;
}

/** Authenticated fetch helper */
async function authFetch(path, options = {}) {
  const token = getToken();
  const res = await fetch(API_BASE_URL + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) { logout(); return null; }
  return res;
}
