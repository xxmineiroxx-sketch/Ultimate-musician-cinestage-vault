/**
 * Planning Center Online (PCO) API service.
 * Uses Personal Access Token auth: Basic base64(appId:secret).
 * PCO developer portal: https://api.planningcenteronline.com/oauth/applications
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const PCO_BASE = "https://api.planningcenteronline.com";
const CREDS_KEY = "um.pco.credentials.v1";

// ── Credentials ───────────────────────────────────────────────────────────────

export async function getPCOCredentials() {
  try {
    const raw = await AsyncStorage.getItem(CREDS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function savePCOCredentials(appId, secret) {
  await AsyncStorage.setItem(CREDS_KEY, JSON.stringify({ appId, secret }));
}

export async function clearPCOCredentials() {
  await AsyncStorage.removeItem(CREDS_KEY);
}

function makeAuthHeader(appId, secret) {
  const token = `${appId}:${secret}`;
  const encoded = btoa(token);
  return { Authorization: `Basic ${encoded}`, "Content-Type": "application/json" };
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function pcoGet(path, creds) {
  const { appId, secret } = creds;
  const resp = await fetch(`${PCO_BASE}${path}`, {
    headers: makeAuthHeader(appId, secret),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`PCO ${resp.status}: ${text.slice(0, 200)}`);
  }
  return resp.json();
}

// ── Service Types ─────────────────────────────────────────────────────────────

/**
 * Returns list of service types.
 * Each: { id, name }
 */
export async function getServiceTypes(creds) {
  const data = await pcoGet("/services/v2/service_types?per_page=50&order=name", creds);
  return (data.data || []).map((st) => ({
    id: st.id,
    name: st.attributes?.name || st.id,
  }));
}

// ── Plans ─────────────────────────────────────────────────────────────────────

/**
 * Returns upcoming plans for a service type.
 * Each: { id, title, dates, sortDate, totalLength }
 */
export async function getUpcomingPlans(serviceTypeId, creds) {
  const data = await pcoGet(
    `/services/v2/service_types/${serviceTypeId}/plans?filter=future&order=sort_date&per_page=10`,
    creds
  );
  return (data.data || []).map((p) => ({
    id: p.id,
    title: p.attributes?.title || "Untitled Plan",
    dates: p.attributes?.dates || "",
    sortDate: p.attributes?.sort_date || "",
    totalLength: p.attributes?.total_length || 0,
  }));
}

// ── Plan Items (setlist) ──────────────────────────────────────────────────────

/**
 * Returns song items from a plan.
 * Each: { id, title, artist, key, notes, sequence, length, pcoSongId }
 */
export async function getPlanItems(serviceTypeId, planId, creds) {
  const data = await pcoGet(
    `/services/v2/service_types/${serviceTypeId}/plans/${planId}/items?include=song&per_page=50`,
    creds
  );

  // Build song lookup from included
  const songMap = {};
  for (const inc of data.included || []) {
    if (inc.type === "Song") {
      songMap[inc.id] = inc.attributes || {};
    }
  }

  const items = [];
  for (const item of data.data || []) {
    if (item.attributes?.item_type !== "song") continue;
    const songRef = item.relationships?.song?.data;
    const songAttrs = songRef ? songMap[songRef.id] || {} : {};

    items.push({
      id: item.id,
      sequence: item.attributes?.sequence ?? 0,
      title: item.attributes?.title || songAttrs.title || "Untitled",
      artist: songAttrs.author || "",
      key: item.attributes?.key_name || "",
      notes: item.attributes?.notes || "",
      length: item.attributes?.length || 0,
      pcoSongId: songRef?.id || null,
    });
  }

  return items.sort((a, b) => a.sequence - b.sequence);
}
