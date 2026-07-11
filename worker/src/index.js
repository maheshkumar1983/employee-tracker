// ============================================================
// Employee Task Tracker — Cloudflare Worker API
// Routes: POST /api/login, POST /api/submit, GET /api/submissions, POST /api/admin-login
// ============================================================

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ── Utility: base64url encode ────────────────────────────────
function base64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64(str) {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ── Google OAuth2 access token via service account JWT ───────
async function getGoogleAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64(JSON.stringify({
    iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }));

  const signingInput = `${header}.${payload}`;
  const pemKey = env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
  const pemBody = pemKey.replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '').replace(/\s/g, '');
  const binaryDer = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));

  const privateKey = await crypto.subtle.importKey(
    'pkcs8', binaryDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );

  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', privateKey,
    new TextEncoder().encode(signingInput)
  );

  const jwt = `${signingInput}.${base64url(sig)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Failed to get Google access token: ' + JSON.stringify(data));
  return data.access_token;
}

// ── Append a row to Google Sheets ────────────────────────────
async function appendRow(env, values) {
  const token = await getGoogleAccessToken(env);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}/values/Sheet1!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [values] }),
  });
  if (!res.ok) throw new Error('Sheets append failed: ' + await res.text());
  return res.json();
}

// ── Read all rows from Google Sheets ─────────────────────────
async function readRows(env) {
  const token = await getGoogleAccessToken(env);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}/values/Sheet1!A1:Z1000`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Sheets read failed: ' + await res.text());
  const data = await res.json();
  return data.values || [];
}

// ── Simple JWT (HS256 using Web Crypto HMAC) ─────────────────
async function signJWT(payload, secret) {
  const header = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64url(sig)}`;
}

async function verifyJWT(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const signingInput = `${parts[0]}.${parts[1]}`;
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const sigBytes = Uint8Array.from(atob(parts[2].replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(signingInput));
    if (!valid) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

// ── JSON response helper ──────────────────────────────────────
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// ── Extract Bearer token ──────────────────────────────────────
function bearerToken(req) {
  const auth = req.headers.get('Authorization') || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : null;
}

// ── Default employees (override via KV or env) ────────────────
// In production, store as JSON secret EMPLOYEES_JSON
// Format: [{"id":"EMP001","pin":"1234","name":"Alice","department":"Engineering"}]
function parseEmployees(env) {
  try {
    return JSON.parse(env.EMPLOYEES_JSON || '[]');
  } catch { return []; }
}

// ── Main router ───────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    try {
      // ── POST /api/login ──────────────────────────────────────
      if (path === '/api/login' && request.method === 'POST') {
        const { employeeId, pin } = await request.json();
        const employees = parseEmployees(env);
        const emp = employees.find(e => e.id === employeeId && e.pin === pin);
        if (!emp) return json({ error: 'Invalid Employee ID or PIN' }, 401);

        const token = await signJWT(
          { sub: emp.id, name: emp.name, dept: emp.department, role: 'employee', exp: Math.floor(Date.now() / 1000) + 28800 },
          env.JWT_SECRET
        );
        return json({ token, name: emp.name, department: emp.department, employeeId: emp.id });
      }

      // ── POST /api/admin-login ────────────────────────────────
      if (path === '/api/admin-login' && request.method === 'POST') {
        const { pin } = await request.json();
        if (pin !== env.ADMIN_PIN) return json({ error: 'Invalid admin PIN' }, 401);
        const token = await signJWT(
          { sub: 'admin', role: 'admin', exp: Math.floor(Date.now() / 1000) + 28800 },
          env.JWT_SECRET
        );
        return json({ token });
      }

      // ── POST /api/submit ─────────────────────────────────────
      if (path === '/api/submit' && request.method === 'POST') {
        const token = bearerToken(request);
        const payload = token ? await verifyJWT(token, env.JWT_SECRET) : null;
        if (!payload || payload.role !== 'employee') return json({ error: 'Unauthorized' }, 401);

        const body = await request.json();
        const { taskTitle, description, projectCode, date, hours, status, priority, notes, attachmentUrl } = body;

        if (!taskTitle || !date || !status) return json({ error: 'taskTitle, date and status are required' }, 400);

        const timestamp = new Date().toISOString();
        const row = [
          timestamp,
          payload.sub,
          payload.name,
          payload.dept,
          projectCode || '',
          taskTitle,
          description || '',
          date,
          hours || '',
          status,
          priority || 'Medium',
          notes || '',
          attachmentUrl || '',
        ];

        await appendRow(env, row);
        return json({ success: true, message: 'Task submitted successfully' });
      }

      // ── GET /api/submissions ─────────────────────────────────
      if (path === '/api/submissions' && request.method === 'GET') {
        const token = bearerToken(request);
        const payload = token ? await verifyJWT(token, env.JWT_SECRET) : null;
        if (!payload) return json({ error: 'Unauthorized' }, 401);

        const rows = await readRows(env);
        if (rows.length === 0) return json({ headers: [], rows: [] });

        const headers = rows[0];
        const data = rows.slice(1);

        // Employees only see their own rows
        const filtered = payload.role === 'admin'
          ? data
          : data.filter(r => r[1] === payload.sub);

        return json({ headers, rows: filtered, role: payload.role });
      }

      // ── GET /api/me ──────────────────────────────────────────
      if (path === '/api/me' && request.method === 'GET') {
        const token = bearerToken(request);
        const payload = token ? await verifyJWT(token, env.JWT_SECRET) : null;
        if (!payload) return json({ error: 'Unauthorized' }, 401);
        return json(payload);
      }

      return json({ error: 'Not found' }, 404);
    } catch (err) {
      console.error(err);
      return json({ error: 'Internal server error', detail: err.message }, 500);
    }
  },
};
