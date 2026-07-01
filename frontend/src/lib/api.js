const BASE = import.meta.env.VITE_API_BASE || '';

const url = (p) => `${BASE}${p}`;

/** All requests include the session cookie. */
const CREDS = { credentials: 'include' };

async function jsonOrThrow(res, fallbackMsg = 'Request failed') {
  let body = {};
  try { body = await res.json(); } catch { /* ignore */ }
  if (!res.ok || body?.success === false) {
    const err = new Error(body?.error || res.statusText || fallbackMsg);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

// ───── Auth ─────
export async function getMe() {
  const res = await fetch(url('/api/auth/me'), CREDS);
  if (res.status === 401) return null;
  if (!res.ok) throw new Error('Auth check failed');
  const body = await res.json();
  return body?.user || null;
}

export async function signupRequest(email, password) {
  const res = await fetch(url('/api/auth/signup-request'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    ...CREDS,
  });
  return jsonOrThrow(res, 'Could not start signup');
}

export async function signupVerify(email, otp) {
  const res = await fetch(url('/api/auth/signup-verify'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp }),
    ...CREDS,
  });
  return jsonOrThrow(res, 'Verification failed');
}

export async function login(email, password) {
  const res = await fetch(url('/api/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    ...CREDS,
  });
  return jsonOrThrow(res, 'Login failed');
}

export async function logout() {
  const res = await fetch(url('/api/auth/logout'), { method: 'POST', ...CREDS });
  return jsonOrThrow(res, 'Logout failed');
}

export async function forgotPassword(email) {
  const res = await fetch(url('/api/auth/forgot-password'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
    ...CREDS,
  });
  return jsonOrThrow(res, 'Request failed');
}

export async function resetPassword(email, otp, password) {
  const res = await fetch(url('/api/auth/reset-password'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp, password }),
    ...CREDS,
  });
  return jsonOrThrow(res, 'Reset failed');
}

// ───── Prospects / files ─────
export async function listProspects() {
  const res = await fetch(url('/api/prospects'), CREDS);
  if (!res.ok) throw new Error('Failed to load prospects');
  return res.json();
}

export async function listProspectFiles(name, folder, { detailed = false } = {}) {
  const qs = detailed ? '?detailed=1' : '';
  const res = await fetch(url(`/api/prospect-files/${encodeURIComponent(name)}/${encodeURIComponent(folder)}${qs}`), CREDS);
  if (!res.ok) return [];
  return res.json();
}

export async function saveProspect(prospect_name, description = '') {
  const res = await fetch(url('/save-prospect'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prospect_name, description }),
    ...CREDS,
  });
  return jsonOrThrow(res, 'Failed to save prospect');
}

export async function uploadFile(prospect_name, file) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('prospect_name', prospect_name);
  const res = await fetch(url('/upload'), { method: 'POST', body: fd, ...CREDS });
  let body = {};
  try { body = await res.json(); } catch { /* ignore */ }
  if (!res.ok || body?.success === false) {
    const err = new Error(body?.error || 'Upload failed');
    err.serverError = body?.error;
    throw err;
  }
  return body;
}

export async function startGenerate(prospect_name, internet_search = false, bullet_points = false, filenames = []) {
  const res = await fetch(url('/generate'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prospect_name, internet_search, bullet_points, filenames }),
    ...CREDS,
  });
  const body = await jsonOrThrow(res, 'Could not start the document-generation job. Please try again.');
  if (!body.job_id) throw new Error('The server did not return a job ID. Please try again.');
  return body.job_id;
}

export async function getJobStatus(jobId) {
  const res = await fetch(url(`/api/job-status/${encodeURIComponent(jobId)}`), CREDS);
  if (res.status === 404) return { status: 'not_found' };
  if (!res.ok) throw new Error('Failed to fetch job status');
  return res.json();
}

export async function deleteFile(name, folder, filename) {
  const res = await fetch(
    url(`/delete-file/${encodeURIComponent(name)}/${encodeURIComponent(folder)}/${encodeURIComponent(filename)}`),
    { method: 'POST', ...CREDS },
  );
  return jsonOrThrow(res, 'Failed to delete file');
}

export async function setProspectStage(name, stage) {
  const res = await fetch(url(`/api/prospect/${encodeURIComponent(name)}/set-stage`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage: stage || null }),
    ...CREDS,
  });
  return jsonOrThrow(res, 'Failed to set stage');
}

export async function setProspectIndustry(name, industry) {
  const res = await fetch(url(`/api/prospect/${encodeURIComponent(name)}/set-industry`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ industry }),
    ...CREDS,
  });
  return jsonOrThrow(res, 'Failed to set industry');
}

export async function deleteProspect(name) {
  const res = await fetch(url(`/delete-prospect/${encodeURIComponent(name)}`), { method: 'POST', ...CREDS });
  return jsonOrThrow(res, 'Failed to delete prospect');
}

export function previewUrl(name, folder, filename) {
  return url(`/preview/${encodeURIComponent(name)}/${encodeURIComponent(folder)}/${encodeURIComponent(filename)}`);
}

export function downloadUrl(name, folder, filename) {
  return url(`/download/${encodeURIComponent(name)}/${encodeURIComponent(folder)}/${encodeURIComponent(filename)}`);
}

// ───── Feedback (user-facing) ─────
/**
 * Submit feedback. message is required; rating, tag, screenshot are optional.
 *   rating: integer 1..5 or null
 *   tag:    'excellent'|'good'|'bad'|'confusing' or null
 *   screenshot: File or null
 */
export async function submitFeedback({ message, rating = null, tag = null, screenshot = null }) {
  const fd = new FormData();
  fd.append('message', message);
  if (rating != null) fd.append('rating', String(rating));
  if (tag) fd.append('tag', tag);
  if (screenshot) fd.append('screenshot', screenshot);
  const res = await fetch(url('/api/feedback'), {
    method: 'POST',
    body: fd,
    ...CREDS,
  });
  return jsonOrThrow(res, 'Could not send feedback');
}

// ───── Admin ─────
export const adminApi = {
  async listUsers({ q = '', page = 1, perPage = 25 } = {}) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    params.set('page', String(page));
    params.set('per_page', String(perPage));
    const res = await fetch(url(`/api/admin/users?${params.toString()}`), CREDS);
    return jsonOrThrow(res, 'Failed to load users');
  },

  async createUser({ email, isAdmin = false }) {
    const res = await fetch(url('/api/admin/users'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, is_admin: !!isAdmin }),
      ...CREDS,
    });
    return jsonOrThrow(res, 'Failed to create user');
  },

  async getUser(id) {
    const res = await fetch(url(`/api/admin/users/${encodeURIComponent(id)}`), CREDS);
    return jsonOrThrow(res, 'Failed to load user');
  },

  async setAdmin(id, isAdmin) {
    const res = await fetch(url(`/api/admin/users/${encodeURIComponent(id)}/admin`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_admin: !!isAdmin }),
      ...CREDS,
    });
    return jsonOrThrow(res, 'Failed to update admin flag');
  },

  async verifyUser(id) {
    const res = await fetch(url(`/api/admin/users/${encodeURIComponent(id)}/verify`), {
      method: 'POST',
      ...CREDS,
    });
    return jsonOrThrow(res, 'Failed to verify user');
  },

  async sendResetOtp(id) {
    const res = await fetch(url(`/api/admin/users/${encodeURIComponent(id)}/reset`), {
      method: 'POST',
      ...CREDS,
    });
    return jsonOrThrow(res, 'Failed to send reset email');
  },

  async deleteUser(id) {
    const res = await fetch(url(`/api/admin/users/${encodeURIComponent(id)}`), {
      method: 'DELETE',
      ...CREDS,
    });
    return jsonOrThrow(res, 'Failed to delete user');
  },

  // ─── Feedback inbox ───
  async listFeedback({ status = 'all', tag = '', page = 1, perPage = 25 } = {}) {
    const params = new URLSearchParams({ status, page: String(page), per_page: String(perPage) });
    if (tag) params.set('tag', tag);
    const res = await fetch(url(`/api/admin/feedback?${params.toString()}`), CREDS);
    return jsonOrThrow(res, 'Failed to load feedback');
  },

  feedbackScreenshotUrl(id) {
    return url(`/api/admin/feedback/${encodeURIComponent(id)}/screenshot`);
  },

  async feedbackUnreadCount() {
    const res = await fetch(url('/api/admin/feedback/unread-count'), CREDS);
    if (!res.ok) return { count: 0 };
    return res.json();
  },

  async setFeedbackRead(id, isRead) {
    const res = await fetch(url(`/api/admin/feedback/${encodeURIComponent(id)}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_read: !!isRead }),
      ...CREDS,
    });
    return jsonOrThrow(res, 'Failed to update feedback');
  },

  async deleteFeedback(id) {
    const res = await fetch(url(`/api/admin/feedback/${encodeURIComponent(id)}`), {
      method: 'DELETE',
      ...CREDS,
    });
    return jsonOrThrow(res, 'Failed to delete feedback');
  },

  async backfillIndustries() {
    const res = await fetch(url('/api/admin/backfill-industries'), {
      method: 'POST',
      ...CREDS,
    });
    return jsonOrThrow(res, 'Backfill failed');
  },
};
