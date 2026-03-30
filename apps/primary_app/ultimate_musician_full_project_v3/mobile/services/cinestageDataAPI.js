/**
 * cinestageDataAPI.js — Unified data client for CineStage backend.
 *
 * All data operations (songs, services, people, plans, proposals, etc.)
 * now go through CineStage Railway instead of Cloudflare KV.
 *
 * Usage:
 *   import api from '../services/cinestageDataAPI';
 *   const { songs } = await api.pull();
 *   await api.patchSong({ songId, field, value, instrument, senderRole });
 */

import { API_URL, WS_URL, syncHeaders } from "../screens/config";

// ── Core fetch helper ─────────────────────────────────────────────────────────

async function req(method, path, body) {
  const opts = {
    method,
    headers: syncHeaders(),
  };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${API_URL}/api${path}`, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`CineStage API ${res.status}: ${text}`);
  }
  return res.json();
}

const get = (path) => req("GET", path);
const post = (path, body) => req("POST", path, body);
const del = (path) => req("DELETE", path);

// ── Auth ──────────────────────────────────────────────────────────────────────

/**
 * Register a new organization.
 * Returns { orgId, secretKey, name }
 */
export async function register({ name, city = "", language = "", adminName, adminEmail }) {
  return post("/register", { name, city, language, adminName, adminEmail });
}

// ── Full Pull / Push ──────────────────────────────────────────────────────────

/**
 * Pull all data for the current org.
 * Returns { songs, people, services, plans, vocalAssignments, blockouts }
 */
export async function pull() {
  return get("/pull");
}

/**
 * Push (merge/upsert) all local data to the server.
 * body: { songs, people, services, plans, vocalAssignments, blockouts }
 */
export async function push(body) {
  return post("/push", body);
}

// ── Songs ─────────────────────────────────────────────────────────────────────

export async function getSongs() {
  const { songs } = await get("/songs");
  return songs;
}

export async function upsertSong(songData) {
  return post("/songs", songData);
}

/**
 * Patch a specific song field (chord chart, lyrics, instrumentNotes).
 * body: { songId, field, value, instrument?, senderRole?, keyboardRigs? }
 * Returns { ok, detected } where detected = { key?, bpm?, timeSig?, title?, artist? }
 */
export async function patchSong(body) {
  return post("/song/patch", body);
}

// ── People ────────────────────────────────────────────────────────────────────

export async function getPeople() {
  const { people } = await get("/people");
  return people;
}

export async function upsertPerson(personData) {
  return post("/people", personData);
}

// ── Services ──────────────────────────────────────────────────────────────────

export async function getServices() {
  const { services } = await get("/services");
  return services;
}

export async function upsertService(serviceData) {
  return post("/services", serviceData);
}

// ── Plans ─────────────────────────────────────────────────────────────────────

export async function getPlans() {
  const { plans } = await get("/plans");
  return plans;
}

export async function getPlan(serviceId) {
  const { plan } = await get(`/plans/${encodeURIComponent(serviceId)}`);
  return plan;
}

export async function upsertPlan(serviceId, planData) {
  return post("/plans", { serviceId, plan: planData });
}

// ── Vocal Assignments ─────────────────────────────────────────────────────────

export async function getVocalAssignments(serviceId) {
  const { vocalAssignments } = await get(`/vocal-assignments/${encodeURIComponent(serviceId)}`);
  return vocalAssignments;
}

export async function saveVocalAssignments(serviceId, assignments) {
  return post("/vocal-assignments", { serviceId, vocalAssignments: assignments });
}

// ── Blockouts ─────────────────────────────────────────────────────────────────

export async function getBlockouts() {
  const { blockouts } = await get("/blockouts");
  return blockouts;
}

export async function createBlockout(blockoutData) {
  return post("/blockouts", blockoutData);
}

export async function deleteBlockout(blockoutId) {
  return del(`/blockouts/${encodeURIComponent(blockoutId)}`);
}

// ── Proposals ─────────────────────────────────────────────────────────────────

/**
 * Submit a content proposal (for non-admin users).
 * body: { songId, field, value, instrument, submitterId, submitterName, senderRole, serviceId }
 */
export async function submitProposal(body) {
  return post("/proposals/submit", body);
}

/**
 * Approve a proposal (admin only).
 * body: { proposalId }
 */
export async function approveProposal(proposalId) {
  return post("/proposals/approve", { proposalId });
}

export async function getProposals() {
  const { proposals } = await get("/proposals");
  return proposals;
}

// ── Publish to Team ───────────────────────────────────────────────────────────

/**
 * Publish the current plan to all team members.
 * Triggers a WebSocket broadcast to all connected clients.
 */
export async function publishToTeam({ serviceId, plan, vocalAssignments }) {
  return post("/publish", { serviceId, plan, vocalAssignments });
}

// ── Debug ─────────────────────────────────────────────────────────────────────

export async function debugStatus() {
  return get("/debug");
}

// ── Service Brain ──────────────────────────────────────────────────────────────

/**
 * Record all team assignments after a service is published.
 * body: { serviceId, serviceDate, serviceTitle, team: [{personId, name, role}] }
 */
export async function recordAssignments(body) {
  return post("/brain/record-assignments", body);
}

/**
 * Get per-person assignment stats for the whole org.
 * Returns: { stats: { [personId]: { name, total, byRole, lastServed, lastServiceTitle } } }
 */
export async function getBrainStats() {
  return get("/brain/stats");
}

/**
 * Suggest who should serve for each needed role using rotation fairness.
 * body: { serviceDate, neededRoles: ["Vocals", "Keys", "Drums"] }
 * Returns: { suggestions: { [role]: [{personId, name, timesServed, lastServed, available}] } }
 */
export async function suggestAssignments(body) {
  return post("/brain/suggest", body);
}

/**
 * Get full assignment history for one person.
 */
export async function getPersonHistory(personId) {
  return get(`/brain/person/${personId}/history`);
}

// ── WebSocket Connections ─────────────────────────────────────────────────────

/**
 * Connect to the real-time team sync WebSocket.
 * Returns a WebSocket instance.
 *
 * Usage:
 *   const ws = connectSyncSocket({
 *     orgId, secretKey,
 *     onMessage: (msg) => { ... },
 *     onOpen: () => { ... },
 *     onClose: () => { ... },
 *   });
 *   // To disconnect: ws.close();
 */
export function connectSyncSocket({ orgId, secretKey, onMessage, onOpen, onClose }) {
  const url = `${WS_URL}/ws/sync?orgId=${encodeURIComponent(orgId)}&secretKey=${encodeURIComponent(secretKey)}`;
  const ws = new WebSocket(url);

  ws.onopen = () => {
    if (onOpen) onOpen();
  };

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (onMessage) onMessage(msg);
    } catch {
      // ignore malformed messages
    }
  };

  ws.onclose = () => {
    if (onClose) onClose();
  };

  ws.onerror = () => {
    // Connection errors handled via onclose
  };

  return ws;
}

/**
 * Connect to the MIDI bridge WebSocket.
 * Returns a WebSocket instance.
 *
 * Usage:
 *   const ws = connectMidiSocket({
 *     onCommand: ({ command, value, songIndex, sectionIndex }) => { ... },
 *   });
 */
export function connectMidiSocket({ onCommand, onOpen, onClose }) {
  const url = `${WS_URL}/ws/midi`;
  const ws = new WebSocket(url);

  ws.onopen = () => {
    if (onOpen) onOpen();
  };

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (onCommand) onCommand(msg);
    } catch {
      // ignore
    }
  };

  ws.onclose = () => {
    if (onClose) onClose();
  };

  return ws;
}

// ── Default export (convenience object) ──────────────────────────────────────

export default {
  register,
  pull,
  push,
  getSongs,
  upsertSong,
  patchSong,
  getPeople,
  upsertPerson,
  getServices,
  upsertService,
  getPlans,
  getPlan,
  upsertPlan,
  getVocalAssignments,
  saveVocalAssignments,
  getBlockouts,
  createBlockout,
  deleteBlockout,
  submitProposal,
  approveProposal,
  getProposals,
  publishToTeam,
  debugStatus,
  connectSyncSocket,
  connectMidiSocket,
};
