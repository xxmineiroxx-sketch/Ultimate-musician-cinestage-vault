import {
  CINESTAGE_URL,
  getActiveOrgId,
  getActiveSecretKey,
} from "../screens/config";
import { fetchWithRetry } from "../utils/fetchRetry";

async function postJson(path, body) {
  const res = await fetchWithRetry(`${CINESTAGE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Worship Flow ${res.status}`);
  }

  return res.json();
}

export async function analyzeWorshipSong(payload) {
  return postJson("/worship-flow/analyze", payload);
}

export async function analyzeWorshipSession(payload) {
  return postJson("/worship-flow/session", payload);
}

export async function broadcastWorshipFreelyEvent({
  songTitle = "",
  triggeredBy = "Worship Leader",
  mode = "enter",
} = {}) {
  return postJson("/worship-flow/freely-event", {
    orgId: getActiveOrgId(),
    secretKey: getActiveSecretKey(),
    songTitle,
    triggeredBy,
    mode,
  });
}

export function connectWorshipFlowSocket({ onEvent, onOpen, onClose } = {}) {
  const orgId = getActiveOrgId();
  const secretKey = getActiveSecretKey();
  if (!orgId || !secretKey) return null;

  const wsBase = CINESTAGE_URL.replace(/^https:/, "wss:").replace(
    /^http:/,
    "ws:",
  );
  const url = `${wsBase}/ws/sync?orgId=${encodeURIComponent(orgId)}&secretKey=${encodeURIComponent(secretKey)}`;
  const ws = new WebSocket(url);

  ws.onopen = () => onOpen?.();
  ws.onclose = () => onClose?.();
  ws.onerror = () => {};
  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      const payload = message?.data || message;
      if (payload?.type === "worship_freely") {
        onEvent?.(payload);
      }
    } catch {
      // Ignore malformed socket events.
    }
  };

  return ws;
}
