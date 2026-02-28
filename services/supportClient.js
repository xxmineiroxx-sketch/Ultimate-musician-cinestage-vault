import { buildAuthHeaders } from './telemetryClient';

export async function createSupportSession(apiBase, auth, payload) {
  if (!apiBase) return null;
  const res = await fetch(`${apiBase}/support/sessions`, {
    method: 'POST',
    headers: buildAuthHeaders(auth),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Support session failed');
  }
  return res.json();
}
