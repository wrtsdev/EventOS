// Browser client for the EventOS API. Same-origin cookies; the custom header
// is part of the server's CSRF defense.

export class ApiError extends Error {
  constructor(status, message, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: { 'X-Requested-With': 'eventos', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Can’t reach EventOS. Check your connection and try again.');
  }
  const type = res.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await res.json() : null;
  if (!res.ok) throw new ApiError(res.status, data?.error || `Request failed (${res.status})`, data);
  if (data === null) throw new ApiError(res.status, 'Unexpected response from server');
  return data;
}

/** Is a real EventOS server behind this page? (False on static hosting and in previews.) */
export async function detectServer() {
  try {
    const res = await fetch('/api/health', { credentials: 'same-origin' });
    const j = await res.json();
    // A server whose database is down still counts: show the sign-in screen, never the demo.
    return j && 'db' in j ? j : false;
  } catch {
    return false;
  }
}
