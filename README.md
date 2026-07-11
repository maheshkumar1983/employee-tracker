# Employee Task Tracker Portal


A full-stack employee data portal deployed on **Cloudflare Pages** (frontend) + **Cloudflare Worker** (backend API), syncing all submissions to a **Google Spreadsheet** in real time.

---

## Architecture

```
Employee Browser
      │
      ▼
Cloudflare Pages  ──(API calls)──►  Cloudflare Worker
  (Static HTML/CSS/JS)                    │
                                          │ Google Sheets API v4
                                          ▼
                                  Google Spreadsheet
```

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 18+ | https://nodejs.org |
| Wrangler CLI | 3+ | `npm install -g wrangler` |
| Google Account | — | https://console.cloud.google.com |
| Cloudflare Account (free) | — | https://dash.cloudflare.com |

---

## Step 1 — Google Cloud Setup

### 1.1 Create project & enable Sheets API
1. Go to https://console.cloud.google.com
2. Create a new project (e.g. `employee-tracker`)
3. **APIs & Services → Library** → search "Google Sheets API" → Enable

### 1.2 Create Service Account
1. **APIs & Services → Credentials → Create Credentials → Service Account**
2. Name: `task-tracker-worker`, Role: `Viewer` (we set access via Sheet sharing)
3. Click the new service account → **Keys tab → Add Key → JSON**
4. Download the JSON file — keep it safe!

### 1.3 Create & share the Google Sheet
1. Create a new Google Sheet at https://sheets.google.com
2. Copy the **Spreadsheet ID** from the URL:
   ```
   https://docs.google.com/spreadsheets/d/  ← THIS PART →  /edit
   ```
3. Click **Share** → paste the service account email (from the JSON key file, `client_email` field) → give **Editor** access

### 1.4 Initialize headers with Apps Script
1. In the Sheet: **Extensions → Apps Script**
2. Paste the contents of `apps-script/sync.gs`
3. Save, then run `setupSheet` (approve permissions)
4. A "🗂️ Task Tracker" menu will appear in your Sheet

---

## Step 2 — Configure Employee Credentials

The Worker reads employees from the `EMPLOYEES_JSON` secret.

Format (JSON array):
```json
[
  { "id": "EMP001", "pin": "1234", "name": "Alice Chen",   "department": "Engineering" },
  { "id": "EMP002", "pin": "5678", "name": "Bob Smith",    "department": "Marketing" },
  { "id": "EMP003", "pin": "9012", "name": "Carol Jones",  "department": "Finance" }
]
```

Save this to a file (e.g. `employees.json`) — you'll upload it as a secret in Step 3.

---

## Step 3 — Deploy the Cloudflare Worker

```bash
# 1. Install dependencies
cd worker
npm install

# 2. Login to Cloudflare
npx wrangler login

# 3. Set secrets (paste value when prompted)
npx wrangler secret put JWT_SECRET
# → Enter a random 32+ character string, e.g.: openssl rand -base64 32

npx wrangler secret put ADMIN_PIN
# → Enter your admin PIN (e.g.: 999999)

npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_EMAIL
# → Enter the client_email from your JSON key file

npx wrangler secret put GOOGLE_PRIVATE_KEY
# → Paste the private_key field from your JSON key file (include -----BEGIN PRIVATE KEY----- lines)
# NOTE: Replace literal newlines with \n when pasting, OR paste exactly as-is if your terminal supports it

npx wrangler secret put SPREADSHEET_ID
# → Paste your Google Sheet ID

npx wrangler secret put EMPLOYEES_JSON
# → Paste your employees JSON array (minified, all on one line)

# 4. Deploy the Worker
npx wrangler deploy
```

After deploying, copy your **Worker URL** — it looks like:
```
https://employee-tracker-api.YOUR_SUBDOMAIN.workers.dev
```

---

## Step 4 — Configure Frontend API URL

Open `public/js/auth.js` and update line 6:

```js
const API_BASE_URL = 'https://employee-tracker-api.YOUR_SUBDOMAIN.workers.dev';
```

Replace `YOUR_SUBDOMAIN` with your actual Cloudflare subdomain.

---

## Step 5 — Deploy Frontend to Cloudflare Pages

### Option A: Direct upload (quickest)
```bash
# From project root
npx wrangler pages deploy ./public --project-name=employee-tracker
```

### Option B: GitHub integration (recommended for production)
1. Push this repo to GitHub
2. Go to https://dash.cloudflare.com → **Pages → Create a project**
3. Connect your GitHub repo
4. Build settings:
   - **Framework preset**: None
   - **Build command**: (leave empty)
   - **Build output directory**: `public`
5. Click **Save and Deploy**

Your portal will be live at:
```
https://employee-tracker.pages.dev
```

---

## Step 6 — Test End-to-End

1. Open your Pages URL
2. Login with an employee ID + PIN from your `EMPLOYEES_JSON`
3. Submit a task
4. Open your Google Sheet — the row should appear within seconds ✅
5. Login as Admin (use admin PIN) → view all submissions

---

## Project Structure

```
excel-task-tracker/
├── public/                    # Static frontend → Cloudflare Pages
│   ├── index.html             # Login page (employee + admin tabs)
│   ├── dashboard.html         # Employee: submit tasks, view history
│   ├── admin.html             # Admin: all submissions, filters, CSV export
│   ├── css/styles.css         # Design system (dark glassmorphism)
│   └── js/
│       ├── auth.js            # Login, token storage, auth guard
│       ├── dashboard.js       # Submit form + history
│       └── admin.js           # Admin table, filters, CSV export
├── worker/                    # Cloudflare Worker → backend API
│   ├── src/index.js           # Routes, Google Sheets integration, JWT auth
│   ├── wrangler.toml          # Worker configuration
│   └── package.json
└── apps-script/
    └── sync.gs                # Google Apps Script: sheet setup + formatting
```

---

## API Reference

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/login` | None | Employee login → JWT |
| POST | `/api/admin-login` | None | Admin login → JWT |
| POST | `/api/submit` | Employee JWT | Submit a task row |
| GET | `/api/submissions` | JWT (any) | Fetch rows (filtered by role) |
| GET | `/api/me` | JWT (any) | Get current user payload |

---

## Google Sheet Column Layout

| Col | Field | Example |
|-----|-------|---------|
| A | Submitted At | 2025-07-11T05:30:00Z |
| B | Employee ID | EMP001 |
| C | Employee Name | Alice Chen |
| D | Department | Engineering |
| E | Project Code | PROJ-42 |
| F | Task Title | Fix login bug |
| G | Description | Updated auth flow |
| H | Task Date | 2025-07-11 |
| I | Hours Worked | 3.5 |
| J | Status | Completed |
| K | Priority | High |
| L | Notes | Deployed to prod |
| M | Attachment URL | https://drive.google.com/… |

---

## Troubleshooting

### `Failed to get Google access token`
- Check `GOOGLE_PRIVATE_KEY` secret — ensure `\n` line breaks are correct
- Verify the service account email has Editor access to the Sheet
- Ensure the Sheets API is enabled in Google Cloud Console

### `401 Unauthorized` on submit
- JWT may have expired (8-hour session) — log out and log back in
- Check `JWT_SECRET` is set correctly in the Worker

### CORS errors in browser
- Ensure the Worker URL in `auth.js` matches exactly (no trailing slash)
- Check the Worker is deployed and returning `Access-Control-Allow-Origin: *`

### Employee can't login
- Verify `EMPLOYEES_JSON` secret is valid JSON (test at jsonlint.com)
- Employee ID and PIN are case-sensitive
