export function buildAuthHeaders({ token, userId }) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  } else if (userId) {
    headers['X-User-Id'] = userId;
  }
  return headers;
}

export async function registerDevice(apiBase, auth, payload) {
  if (!apiBase) return null;
  const res = await fetch(`${apiBase}/devices/register`, {
    method: 'POST',
    headers: buildAuthHeaders(auth),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Device registration failed');
  }
  return res.json();
}

export async function recordTelemetry(apiBase, auth, eventType, payload) {
  if (!apiBase) return null;
  const res = await fetch(`${apiBase}/telemetry/events`, {
    method: 'POST',
    headers: buildAuthHeaders(auth),
    body: JSON.stringify({ event_type: eventType, payload }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Telemetry failed');
  }
  return res.json();
}
