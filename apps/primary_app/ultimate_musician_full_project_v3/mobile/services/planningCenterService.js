/**
 * Planning Center Online (PCO) API service.
 * Uses Personal Access Token auth: Basic base64(appId:secret).
 * PCO developer portal: https://api.planningcenteronline.com/oauth/applications
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  cacheGet,
  cacheSet,
  TTL_PLAN,
  TTL_TEAM,
} from "./offlineCache";

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

async function pcoPost(path, body, creds) {
  const { appId, secret } = creds;
  const resp = await fetch(`${PCO_BASE}${path}`, {
    method: "POST",
    headers: makeAuthHeader(appId, secret),
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`PCO POST ${resp.status}: ${text.slice(0, 200)}`);
  }
  // 201 Created returns JSON, 204 No Content returns nothing
  const ct = resp.headers.get("content-type") || "";
  if (resp.status === 204 || !ct.includes("json")) return null;
  return resp.json();
}

async function pcoPatch(path, body, creds) {
  const { appId, secret } = creds;
  const resp = await fetch(`${PCO_BASE}${path}`, {
    method: "PATCH",
    headers: makeAuthHeader(appId, secret),
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`PCO PATCH ${resp.status}: ${text.slice(0, 200)}`);
  }
  const ct = resp.headers.get("content-type") || "";
  if (resp.status === 204 || !ct.includes("json")) return null;
  return resp.json();
}

async function pcoDelete(path, creds) {
  const { appId, secret } = creds;
  const resp = await fetch(`${PCO_BASE}${path}`, {
    method: "DELETE",
    headers: makeAuthHeader(appId, secret),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`PCO DELETE ${resp.status}: ${text.slice(0, 200)}`);
  }
  return true; // 204 No Content on success
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

// ── People ─────────────────────────────────────────────────────────────────────

/**
 * Returns people from the PCO Services people list.
 * Each: { id, name, email, photoUrl, status }
 */
export async function getPCOPeople(creds) {
  const data = await pcoGet(
    "/services/v2/people?per_page=100&order=last_name",
    creds
  );
  return (data.data || []).map((p) => ({
    id: p.id,
    name: p.attributes?.full_name || `${p.attributes?.first_name || ""} ${p.attributes?.last_name || ""}`.trim() || "Unknown",
    email: p.attributes?.emails?.[0]?.address || p.attributes?.primary_contact || "",
    photoUrl: p.attributes?.photo_url || null,
    status: p.attributes?.status || "active",
  }));
}

// ── Song Library ───────────────────────────────────────────────────────────────

/**
 * Returns songs from the PCO song library.
 * Each: { id, title, author, themes, lastPlanAt, copyrightYear }
 */
export async function getPCOSongLibrary(creds) {
  const data = await pcoGet(
    "/services/v2/songs?per_page=100&order=title",
    creds
  );
  return (data.data || []).map((s) => ({
    id: s.id,
    title: s.attributes?.title || "Untitled",
    author: s.attributes?.author || "",
    themes: s.attributes?.themes || "",
    copyrightYear: s.attributes?.copyright_year || null,
    lastPlanAt: s.attributes?.last_scheduled_at || null,
    ccliNumber: s.attributes?.ccli_number || null,
  }));
}

/**
 * Returns arrangements for a song (to get key + lyrics).
 * Each: { id, name, key, lyricsEnabled, notesEnabled }
 */
export async function getPCOSongArrangements(songId, creds) {
  try {
    const data = await pcoGet(
      `/services/v2/songs/${songId}/arrangements?per_page=10`,
      creds
    );
    return (data.data || []).map((a) => ({
      id: a.id,
      name: a.attributes?.name || "Default",
      key: a.attributes?.chord_chart_key || "",
      bpm: a.attributes?.bpm || null,
      lyricsEnabled: !!a.attributes?.lyrics_enabled,
    }));
  } catch {
    return [];
  }
}

// ── Service Plans (for import as UM services) ─────────────────────────────────

/**
 * Returns upcoming plans across all service types (flattened).
 * Each: { id, serviceTypeId, serviceTypeName, title, dates, sortDate, publicNotes, totalLength }
 */
export async function getAllUpcomingPlans(creds) {
  const serviceTypes = await getServiceTypes(creds);
  const results = [];

  await Promise.all(
    serviceTypes.map(async (st) => {
      try {
        const data = await pcoGet(
          `/services/v2/service_types/${st.id}/plans?filter=future&order=sort_date&per_page=5`,
          creds
        );
        for (const p of data.data || []) {
          results.push({
            id: p.id,
            serviceTypeId: st.id,
            serviceTypeName: st.name,
            title: p.attributes?.title || st.name,
            dates: p.attributes?.dates || "",
            sortDate: p.attributes?.sort_date || "",
            publicNotes: p.attributes?.public_notes || "",
            totalLength: p.attributes?.total_length || 0,
          });
        }
      } catch {
        /* skip failing service type */
      }
    })
  );

  // Sort by date ascending
  return results.sort((a, b) => {
    if (!a.sortDate) return 1;
    if (!b.sortDate) return -1;
    return a.sortDate.localeCompare(b.sortDate);
  });
}

// ── Team Scheduling (Step 3) ──────────────────────────────────────────────────

/**
 * Returns all teams for a service type, including their positions.
 * Each: { id, name, positions: [{ id, name, quantity }] }
 *
 * GET /services/v2/service_types/{id}/teams?include=team_positions
 */
export async function getTeams(serviceTypeId, creds) {
  try {
    const data = await pcoGet(
      `/services/v2/service_types/${serviceTypeId}/teams?include=team_positions&per_page=50`,
      creds
    );

    // Build position lookup from included resources
    const positionMap = {};
    for (const inc of data.included || []) {
      if (inc.type === "TeamPosition") {
        positionMap[inc.id] = {
          id: inc.id,
          name: inc.attributes?.name || "Position",
          quantity: inc.attributes?.quantity || 1,
        };
      }
    }

    return (data.data || []).map((team) => {
      // Positions are linked via relationships
      const positionRefs =
        team.relationships?.team_positions?.data || [];
      const positions = positionRefs
        .map((ref) => positionMap[ref.id])
        .filter(Boolean);

      return {
        id: team.id,
        name: team.attributes?.name || "Team",
        positions,
      };
    });
  } catch (err) {
    throw new Error(`getTeams failed: ${err.message}`);
  }
}

/**
 * Returns all team members scheduled on a plan, with person details.
 * Each: {
 *   id, teamPositionName, status, personId, personName,
 *   personEmail, personPhotoUrl, teamName
 * }
 * status: "Confirmed" | "Declined" | "Unconfirmed" | "Pending"
 *
 * GET /services/v2/service_types/{id}/plans/{planId}/team_members?include=person
 */
export async function getPlanTeamMembers(serviceTypeId, planId, creds) {
  try {
    const data = await pcoGet(
      `/services/v2/service_types/${serviceTypeId}/plans/${planId}/team_members?include=person&per_page=100`,
      creds
    );

    // Build person lookup from included
    const personMap = {};
    for (const inc of data.included || []) {
      if (inc.type === "Person") {
        const attrs = inc.attributes || {};
        personMap[inc.id] = {
          name:
            attrs.full_name ||
            `${attrs.first_name || ""} ${attrs.last_name || ""}`.trim() ||
            "Unknown",
          email:
            attrs.emails?.[0]?.address || attrs.primary_contact || "",
          photoUrl: attrs.photo_url || null,
        };
      }
    }

    return (data.data || []).map((tm) => {
      const attrs = tm.attributes || {};
      const personRef = tm.relationships?.person?.data;
      const person = personRef ? personMap[personRef.id] || {} : {};

      return {
        id: tm.id,
        teamPositionName: attrs.team_position_name || "",
        teamName: attrs.team_name || "",
        status: attrs.status || "Unconfirmed",
        personId: personRef?.id || null,
        personName: person.name || attrs.name || "Unknown",
        personEmail: person.email || "",
        personPhotoUrl: person.photoUrl || null,
      };
    });
  } catch (err) {
    throw new Error(`getPlanTeamMembers failed: ${err.message}`);
  }
}

/**
 * Schedule a person to a plan in a given team position.
 * Returns: { id, status }
 *
 * POST /services/v2/service_types/{id}/plans/{planId}/team_members
 */
export async function schedulePerson(
  serviceTypeId,
  planId,
  personId,
  teamPositionId,
  creds
) {
  try {
    const body = {
      data: {
        type: "PlanPerson",
        attributes: {
          status: "Unconfirmed",
        },
        relationships: {
          person: {
            data: { type: "Person", id: String(personId) },
          },
          team_position: {
            data: { type: "TeamPosition", id: String(teamPositionId) },
          },
        },
      },
    };

    const resp = await pcoPost(
      `/services/v2/service_types/${serviceTypeId}/plans/${planId}/team_members`,
      body,
      creds
    );

    const tm = resp?.data || {};
    return {
      id: tm.id || null,
      status: tm.attributes?.status || "Unconfirmed",
    };
  } catch (err) {
    throw new Error(`schedulePerson failed: ${err.message}`);
  }
}

/**
 * Update the status of a scheduled team member.
 * status: "Confirmed" | "Declined" | "Unconfirmed"
 *
 * PATCH /services/v2/service_types/{id}/plans/{planId}/team_members/{teamMemberId}
 */
export async function updateTeamMemberStatus(
  serviceTypeId,
  planId,
  teamMemberId,
  status,
  creds
) {
  try {
    const body = {
      data: {
        type: "PlanPerson",
        id: String(teamMemberId),
        attributes: { status },
      },
    };

    const resp = await pcoPatch(
      `/services/v2/service_types/${serviceTypeId}/plans/${planId}/team_members/${teamMemberId}`,
      body,
      creds
    );

    const tm = resp?.data || {};
    return {
      id: tm.id || teamMemberId,
      status: tm.attributes?.status || status,
    };
  } catch (err) {
    throw new Error(`updateTeamMemberStatus failed: ${err.message}`);
  }
}

/**
 * Remove a person from a plan.
 *
 * DELETE /services/v2/service_types/{id}/plans/{planId}/team_members/{teamMemberId}
 */
export async function unschedulePerson(
  serviceTypeId,
  planId,
  teamMemberId,
  creds
) {
  try {
    return await pcoDelete(
      `/services/v2/service_types/${serviceTypeId}/plans/${planId}/team_members/${teamMemberId}`,
      creds
    );
  } catch (err) {
    throw new Error(`unschedulePerson failed: ${err.message}`);
  }
}

// ── Availability / Blockout Dates (Step 4) ────────────────────────────────────

/**
 * Returns future blockout dates for a person.
 * Each: { id, startsAt, endsAt, reason, repeat }
 *
 * GET /services/v2/people/{personId}/blockouts?filter=future
 */
export async function getPersonBlockouts(personId, creds) {
  try {
    const data = await pcoGet(
      `/services/v2/people/${personId}/blockouts?filter=future&per_page=50`,
      creds
    );
    return (data.data || []).map((b) => ({
      id: b.id,
      startsAt: b.attributes?.starts_at || null,
      endsAt: b.attributes?.ends_at || null,
      reason: b.attributes?.reason || "",
      repeat: b.attributes?.repeat || "no_repeat",
    }));
  } catch (err) {
    throw new Error(`getPersonBlockouts failed: ${err.message}`);
  }
}

/**
 * Create a blockout date for a person.
 * Returns: { id }
 *
 * POST /services/v2/people/{personId}/blockouts
 */
export async function createBlockout(personId, startsAt, endsAt, reason, creds) {
  try {
    const body = {
      data: {
        type: "Blockout",
        attributes: {
          starts_at: startsAt,
          ends_at: endsAt,
          reason: reason || "",
          repeat: "no_repeat",
        },
      },
    };

    const resp = await pcoPost(
      `/services/v2/people/${personId}/blockouts`,
      body,
      creds
    );

    return { id: resp?.data?.id || null };
  } catch (err) {
    throw new Error(`createBlockout failed: ${err.message}`);
  }
}

/**
 * Delete a blockout date for a person.
 * Returns: true on success
 *
 * DELETE /services/v2/people/{personId}/blockouts/{blockoutId}
 */
export async function deleteBlockout(personId, blockoutId, creds) {
  try {
    return await pcoDelete(
      `/services/v2/people/${personId}/blockouts/${blockoutId}`,
      creds
    );
  } catch (err) {
    throw new Error(`deleteBlockout failed: ${err.message}`);
  }
}

/**
 * Check if a person is blocked out on a given date.
 * @param {Array} blockouts - from getPersonBlockouts()
 * @param {string} dateStr  - "YYYY-MM-DD"
 * @returns {boolean}
 */
export function isBlockedOut(blockouts, dateStr) {
  if (!blockouts || !blockouts.length || !dateStr) return false;

  const target = new Date(dateStr + "T00:00:00Z");

  for (const b of blockouts) {
    if (!b.startsAt || !b.endsAt) continue;

    const start = new Date(b.startsAt);
    const end = new Date(b.endsAt);

    // Normalize to date boundaries (ignore time for day-level comparison)
    const startDay = new Date(
      start.getUTCFullYear(),
      start.getUTCMonth(),
      start.getUTCDate()
    );
    const endDay = new Date(
      end.getUTCFullYear(),
      end.getUTCMonth(),
      end.getUTCDate()
    );
    const targetDay = new Date(
      target.getUTCFullYear(),
      target.getUTCMonth(),
      target.getUTCDate()
    );

    if (targetDay >= startDay && targetDay <= endDay) {
      return true;
    }
  }

  return false;
}

// ── Attachments & Chord Charts (Step 5) ──────────────────────────────────────

/**
 * Returns attachments on a plan item (chord charts, lyrics, etc.)
 * Each: { id, filename, contentType, downloadUrl, pcoUrl }
 *
 * GET /services/v2/service_types/{id}/plans/{planId}/items/{itemId}/attachments
 */
export async function getPlanItemAttachments(serviceTypeId, planId, itemId, creds) {
  try {
    const data = await pcoGet(
      `/services/v2/service_types/${serviceTypeId}/plans/${planId}/items/${itemId}/attachments?per_page=25`,
      creds
    );
    return (data.data || []).map((a) => ({
      id: a.id,
      filename: a.attributes?.filename || "",
      contentType: a.attributes?.content_type || "",
      downloadUrl: a.attributes?.url || a.attributes?.download_url || null,
      pcoUrl: a.attributes?.page_url || null,
    }));
  } catch (err) {
    throw new Error(`getPlanItemAttachments failed: ${err.message}`);
  }
}

/**
 * Returns attachments for a song arrangement.
 * Each: { id, filename, contentType, downloadUrl }
 *
 * GET /services/v2/songs/{songId}/arrangements/{arrangementId}/attachments
 */
export async function getArrangementAttachments(songId, arrangementId, creds) {
  try {
    const data = await pcoGet(
      `/services/v2/songs/${songId}/arrangements/${arrangementId}/attachments?per_page=25`,
      creds
    );
    return (data.data || []).map((a) => ({
      id: a.id,
      filename: a.attributes?.filename || "",
      contentType: a.attributes?.content_type || "",
      downloadUrl: a.attributes?.url || a.attributes?.download_url || null,
    }));
  } catch (err) {
    throw new Error(`getArrangementAttachments failed: ${err.message}`);
  }
}

// ── Live Service Mode (Step 6) ────────────────────────────────────────────────

/**
 * Returns the current live state of a service (which item is active, what's next).
 * Returns: { currentItemId, nextItemId, serviceTypeId, planId }
 *
 * GET /services/v2/service_types/{id}/plans/{planId}/live/current_item_time
 */
export async function getLiveServiceState(serviceTypeId, planId, creds) {
  try {
    const data = await pcoGet(
      `/services/v2/service_types/${serviceTypeId}/plans/${planId}/live/current_item_time`,
      creds
    );
    const attrs = data.data?.attributes || {};
    return {
      currentItemId: attrs.item_id || data.data?.relationships?.item?.data?.id || null,
      nextItemId: attrs.next_item_id || null,
      serviceTypeId,
      planId,
    };
  } catch (err) {
    throw new Error(`getLiveServiceState failed: ${err.message}`);
  }
}

/**
 * Advance or jump to an item in live service mode.
 * action: "go_to_next_item" | "go_to_previous_item" | "go_to_item"
 * itemId: required only when action === "go_to_item"
 *
 * POST /services/v2/service_types/{id}/plans/{planId}/live/controller
 */
export async function advanceLiveItem(serviceTypeId, planId, action, itemId, creds) {
  try {
    const attributes = { action };
    if (action === "go_to_item" && itemId) {
      attributes.item_id = String(itemId);
    }

    const body = {
      data: {
        type: "LiveController",
        attributes,
      },
    };

    const resp = await pcoPost(
      `/services/v2/service_types/${serviceTypeId}/plans/${planId}/live/controller`,
      body,
      creds
    );

    return resp?.data || { action };
  } catch (err) {
    throw new Error(`advanceLiveItem failed: ${err.message}`);
  }
}

// ── Song History & Analytics (Step 7) ────────────────────────────────────────

/**
 * Returns past schedule occurrences for a song.
 * Each: { id, planDates, serviceTypeName, planId }
 *
 * GET /services/v2/songs/{songId}/song_schedules?per_page=20&order=-created_at
 */
export async function getSongHistory(songId, creds) {
  try {
    const data = await pcoGet(
      `/services/v2/songs/${songId}/song_schedules?per_page=20&order=-created_at`,
      creds
    );
    return (data.data || []).map((ss) => ({
      id: ss.id,
      planDates: ss.attributes?.plan_dates || ss.attributes?.dates || "",
      serviceTypeName: ss.attributes?.service_type_name || "",
      planId: ss.relationships?.plan?.data?.id || null,
    }));
  } catch (err) {
    throw new Error(`getSongHistory failed: ${err.message}`);
  }
}

/**
 * Returns the last scheduled date for a song (from song attributes).
 * Returns: ISO date string or null
 *
 * GET /services/v2/songs/{songId}
 */
export async function getSongLastScheduled(songId, creds) {
  try {
    const data = await pcoGet(`/services/v2/songs/${songId}`, creds);
    return data.data?.attributes?.last_scheduled_at || null;
  } catch {
    return null;
  }
}

/**
 * Batch-fetch last-scheduled info for multiple songs in parallel.
 * Returns: Map<songId, { lastScheduledAt: string|null, timesUsed: number }>
 */
export async function batchGetSongHistory(songIds, creds) {
  const result = new Map();

  if (!songIds || !songIds.length) return result;

  // Fetch in parallel, capping concurrency at 5 to avoid rate limits
  const CHUNK = 5;
  for (let i = 0; i < songIds.length; i += CHUNK) {
    const chunk = songIds.slice(i, i + CHUNK);
    await Promise.all(
      chunk.map(async (songId) => {
        try {
          const [lastScheduledAt, history] = await Promise.all([
            getSongLastScheduled(songId, creds),
            getSongHistory(songId, creds),
          ]);
          result.set(String(songId), {
            lastScheduledAt,
            timesUsed: history.length,
          });
        } catch {
          result.set(String(songId), { lastScheduledAt: null, timesUsed: 0 });
        }
      })
    );
  }

  return result;
}

// ── Offline Cache helpers (Step 10) ──────────────────────────────────────────

/**
 * Cached wrapper for getPlanItems.
 * Tries AsyncStorage cache first; on miss, fetches from API and caches result.
 */
export async function getCachedPlanItems(serviceTypeId, planId, creds) {
  const cacheKey = `${serviceTypeId}_${planId}`;

  try {
    const cached = await cacheGet("plan_items", cacheKey);
    if (cached !== null) return cached;
  } catch {
    /* cache miss — fall through to API */
  }

  const data = await getPlanItems(serviceTypeId, planId, creds);

  try {
    await cacheSet("plan_items", cacheKey, data, TTL_PLAN);
  } catch {
    /* non-fatal: cache write failure */
  }

  return data;
}

/**
 * Cached wrapper for getPlanTeamMembers.
 * Uses a shorter TTL (1h) since team assignment status changes frequently.
 */
export async function getCachedPlanTeamMembers(serviceTypeId, planId, creds) {
  const cacheKey = `${serviceTypeId}_${planId}`;

  try {
    const cached = await cacheGet("plan_team_members", cacheKey);
    if (cached !== null) return cached;
  } catch {
    /* cache miss — fall through to API */
  }

  const data = await getPlanTeamMembers(serviceTypeId, planId, creds);

  try {
    await cacheSet("plan_team_members", cacheKey, data, TTL_TEAM);
  } catch {
    /* non-fatal: cache write failure */
  }

  return data;
}
