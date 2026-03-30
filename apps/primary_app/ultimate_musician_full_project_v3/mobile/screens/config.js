/**
 * screens/config.js — shared network config for all Musician screens.
 * Credentials are loaded dynamically from AsyncStorage to support multi-branch.
 * Falls back to the default (root) org credentials if no branch is configured.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

// Sync server: Cloudflare Pages (global, always-on, no local server needed)
export const SYNC_URL = "https://ultimatelabs.pages.dev";

// CineStage AI REST API — Cloudflare Container (deployed, Railway eliminated)
export const CINESTAGE_URL = "https://cinestage.studio-cinestage.workers.dev";

// CineStage Data API — use this for all data operations (songs/services/people/plans)
// Mirrors the /sync/* contract but runs on CineStage Container
export const API_URL = CINESTAGE_URL;

// CineStage WebSocket URL — real-time team sync + MIDI bridge
export const WS_URL = CINESTAGE_URL.replace("https://", "wss://").replace("http://", "ws://");

// ── Default (root org) credentials ───────────────────────────────────────────
export const SYNC_ORG_ID = "zpneef0a5ov732c0";
export const SYNC_SECRET_KEY = "erflpo0e4pg33h85v58v7cfvpd6eoycv";

// ── Runtime credentials (may be overridden by loadBranchConfig) ───────────────
let _orgId = SYNC_ORG_ID;
let _secKey = SYNC_SECRET_KEY;

/**
 * Call once at app startup (LandingScreen useEffect).
 * Loads branch credentials from AsyncStorage if a branch has been configured.
 */
export async function loadBranchConfig() {
  try {
    const [id, key] = await Promise.all([
      AsyncStorage.getItem("um_branch_orgId"),
      AsyncStorage.getItem("um_branch_secretKey"),
    ]);
    if (id && key) {
      _orgId = id;
      _secKey = key;
    }
  } catch {
    /* silently keep defaults */
  }
}

/**
 * Save branch credentials and immediately activate them.
 */
export async function saveBranchConfig(orgId, secretKey) {
  _orgId = orgId;
  _secKey = secretKey;
  await Promise.all([
    AsyncStorage.setItem("um_branch_orgId", orgId),
    AsyncStorage.setItem("um_branch_secretKey", secretKey),
  ]);
}

/**
 * Clear branch credentials and revert to default root org.
 */
export async function clearBranchConfig() {
  _orgId = SYNC_ORG_ID;
  _secKey = SYNC_SECRET_KEY;
  await Promise.all([
    AsyncStorage.removeItem("um_branch_orgId"),
    AsyncStorage.removeItem("um_branch_secretKey"),
  ]);
}

/** Returns true if a custom branch config is active (not the root org). */
export function hasBranchConfig() {
  return _orgId !== SYNC_ORG_ID;
}

/** Current active org ID (may be branch or root) */
export function getActiveOrgId() {
  return _orgId;
}

/** Current active secret key (may be branch or root) */
export function getActiveSecretKey() {
  return _secKey;
}

/**
 * Build a Cloudflare DO room WebSocket URL for the given roomId.
 * Uses query-param auth since WS connections can't set custom headers.
 */
export function syncRoomWsUrl(roomId) {
  const base = SYNC_URL.replace(/^https/, 'wss').replace(/^http/, 'ws');
  return `${base}/sync/room/${encodeURIComponent(roomId)}/ws?orgId=${_orgId}&sk=${_secKey}`;
}

/**
 * Broadcast a message to a CF DO sync room via REST.
 * Returns the fetch Promise (fire-and-forget safe — caller can .catch(() => {})).
 */
export function broadcastToRoom(roomId, payload) {
  return fetch(`${SYNC_URL}/sync/room/${encodeURIComponent(roomId)}/broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-org-id': _orgId,
      'x-secret-key': _secKey,
    },
    body: JSON.stringify(payload),
  });
}

// Auth headers helper — include on every fetch to sync server
export const syncHeaders = () => ({
  "Content-Type": "application/json",
  "x-org-id": _orgId,
  "x-secret-key": _secKey,
});
