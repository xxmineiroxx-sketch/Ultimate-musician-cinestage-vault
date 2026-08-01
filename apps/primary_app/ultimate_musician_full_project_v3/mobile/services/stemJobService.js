import * as FileSystem from "expo-file-system/legacy";

import {
  CINESTAGE_URL,
  SYNC_URL,
  getActiveOrgId,
  syncHeaders,
} from "../screens/config";

const HTTP_URL_RE = /^https?:\/\/\S+$/i;
const LOCAL_FILE_RE = /^(file|content|ph):\/\//i;
const STEM_JOB_PENDING_INTERVAL_MS   = 4000;   // 4s between PENDING polls
const STEM_JOB_PROCESSING_INTERVAL_MS = 8000;   // 8s between PROCESSING polls
const STEM_JOB_MAX_POLLS = 225;                  // 225 × ~8s ≈ 30 min max
const DESKTOP_PENDING_STATUSES = new Set([
  "PENDING",
  "QUEUED_FOR_DESKTOP",
  "WAITING_FOR_DESKTOP",
  "WAITING_FOR_SOURCE",
  "CLOUDFLARE_FALLBACK",
]);
const DESKTOP_PROCESSING_STATUSES = new Set(["PROCESSING"]);
const DESKTOP_READY_STATUSES = new Set([
  "READY_FOR_REVIEW",
  "COMPLETED",
  "SUCCEEDED",
  "APPROVED",
  "PUBLISHED",
]);

function sanitizeName(value, fallback = "audio") {
  const cleaned = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || fallback;
}

function getExtension(value, fallback = "mp3") {
  const trimmed = String(value || "").split("?")[0].split("#")[0];
  const match = trimmed.match(/\.([a-z0-9]{2,8})$/i);
  return (match?.[1] || fallback).toLowerCase();
}

function guessContentType(value) {
  switch (getExtension(value)) {
    case "wav":
      return "audio/wav";
    case "mp3":
      return "audio/mpeg";
    case "m4a":
    case "mp4":
      return "audio/mp4";
    case "aac":
      return "audio/aac";
    case "flac":
      return "audio/flac";
    case "ogg":
    case "opus":
      return "audio/ogg";
    case "aif":
    case "aiff":
      return "audio/aiff";
    case "caf":
      return "audio/x-caf";
    default:
      return "application/octet-stream";
  }
}

export function isRemoteSourceUrl(value) {
  return HTTP_URL_RE.test(String(value || "").trim());
}

export function isLocalSourceUrl(value) {
  const trimmed = String(value || "").trim();
  return LOCAL_FILE_RE.test(trimmed) || (!!trimmed && !isRemoteSourceUrl(trimmed));
}

export async function uploadLocalStemSource(localUri, { uploadId, title = "audio" }) {
  const trimmed = String(localUri || "").trim();
  if (!trimmed) throw new Error("Local audio file is missing.");

  const info = await FileSystem.getInfoAsync(trimmed, { size: true }).catch(() => null);
  if (!info?.exists) {
    throw new Error("Selected local audio file could not be found on this device.");
  }

  const ext = getExtension(trimmed, "mp3");
  const safeName = `${sanitizeName(title, "audio")}.${ext}`;
  const uploadUrl =
    `${SYNC_URL}/sync/stems/upload`
    + `?uploadId=${encodeURIComponent(sanitizeName(uploadId, "upload"))}`
    + `&filename=${encodeURIComponent(safeName)}`;

  const response = await FileSystem.uploadAsync(uploadUrl, trimmed, {
    httpMethod: "POST",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      ...syncHeaders(),
      "Content-Type": guessContentType(trimmed),
    },
  });

  let body = {};
  try {
    body = JSON.parse(response?.body || "{}");
  } catch {
    body = {};
  }
  if (!response || response.status < 200 || response.status >= 300) {
    throw new Error(
      body?.error
        || `Source audio upload failed${response?.status ? ` (${response.status})` : ""}.`,
    );
  }

  if (!body?.fileUrl) {
    throw new Error("Source audio upload completed without a file URL.");
  }

  return body.fileUrl;
}

export async function resolveStemSourceUrl(sourceUrl, { uploadId, title = "audio" }) {
  const trimmed = String(sourceUrl || "").trim();
  if (!trimmed) {
    throw new Error("Enter a YouTube/audio URL or pick a local audio file.");
  }
  if (isRemoteSourceUrl(trimmed)) {
    return { fileUrl: trimmed, uploadedLocalFile: false };
  }
  return {
    fileUrl: await uploadLocalStemSource(trimmed, { uploadId, title }),
    uploadedLocalFile: true,
  };
}

export async function submitStemJob({
  sourceUrl,
  title = "Imported Stems",
  songId,
  serviceId,
  serviceName,
  serviceDate,
  serviceTime,
  serviceEndTime,
  artist = "",
  ownerEmail = "",
  accountEmail = "",
  accountId = "",
  requestedBy,
  separateHarmonies = true,
  voiceCount = 4,
  enhanceInstrumentStems = true,
  targetStems = ["lead_vocal", "bgv", "acoustic_guitar", "electric_guitar", "piano", "synth", "bass", "drums"],
  separationMethod = "generative_infilling",
  preserveSpatial = true,
  uploadId,
}) {
  const resolved = await resolveStemSourceUrl(sourceUrl, {
    uploadId: uploadId || songId || `upload_${Date.now().toString(36)}`,
    title,
  });

  const response = await fetch(`${SYNC_URL}/sync/stem-jobs`, {
    method: "POST",
    headers: syncHeaders(),
    body: JSON.stringify({
      sourceUrl: resolved.fileUrl,
      title,
      artist,
      songId,
      serviceId,
      serviceName,
      serviceDate,
      serviceTime,
      serviceEndTime,
      ownerEmail: ownerEmail || accountEmail || requestedBy?.email || "",
      accountEmail: accountEmail || ownerEmail || requestedBy?.email || "",
      accountId,
      requestedBy,
      processingMode: "desktop_primary",
      fallbackEligible: true,
      separateHarmonies,
      voiceCount,
      enhanceInstrumentStems,
      targetStems,
      separationMethod,
      preserveSpatial,
    }),
  });
  const job = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(job.error || JSON.stringify(job));
  }

  return {
    job: normalizeDesktopStemJob(job?.job || job),
    fileUrl: resolved.fileUrl,
    uploadedLocalFile: resolved.uploadedLocalFile,
  };
}

function normalizeDesktopStemJob(job = {}) {
  const result = {
    ...(job.result || {}),
    stems: job.result?.stems || job.stems || {},
    harmonies: job.result?.harmonies || job.harmonies || {},
    sections: job.result?.sections || job.sections || job.analysis?.sections || [],
    cueMarkers: job.result?.cueMarkers || job.cueMarkers || job.analysis?.cueMarkers || [],
    waveformPeaks: job.result?.waveformPeaks || job.waveformPeaks || job.analysis?.waveformPeaks || null,
    sourceUrl: job.result?.sourceUrl || job.sourceUrl || "",
    title: job.result?.title || job.title || "",
    artist: job.result?.artist || job.artist || "",
    bpm: job.result?.bpm || job.analysis?.bpm || job.bpm || null,
    key: job.result?.key || job.analysis?.key || job.key || "",
  };

  return {
    ...job,
    result,
    status: String(job.status || "PENDING").toUpperCase(),
    readyForReview: Boolean(job.readyForReview),
    readyForPlayback: Boolean(job.readyForPlayback),
    stemRetention: job.retention || job.stemRetention || {},
  };
}

export async function kickStemJob({
  jobId,
  songId,
  fileUrl,
  title = "Imported Stems",
  separateHarmonies = true,
  voiceCount = 4,
  enhanceInstrumentStems = true,
  targetStems = ["lead_vocal", "bgv", "acoustic_guitar", "electric_guitar", "piano", "synth", "bass", "drums"],
  separationMethod = "generative_infilling",
  preserveSpatial = true,
}) {
  const payload = {
    jobId,
    orgId: getActiveOrgId(),
    job: {
      id: jobId,
      jobType: "STEM_SEPARATION",
      orgId: getActiveOrgId(),
      songId,
      input: {
        fileUrl,
        sourceUrl: fileUrl,
        title,
        separateHarmonies,
        voiceCount,
        enhanceInstrumentStems,
        targetStems,
        method: separationMethod,
        preserveSpatial,
      },
    },
  };

  const response = await fetch(`${CINESTAGE_URL}/jobs/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.detail || body.error || `Dispatch failed (${response.status})`);
  }

  return body;
}

export async function getStemJob(jobId) {
  try {
    const response = await fetch(`${SYNC_URL}/sync/stem-job?id=${encodeURIComponent(jobId)}`, {
      headers: syncHeaders(),
    });
    const job = await response.json().catch(() => null);
    if (response.ok && job?.id) return normalizeDesktopStemJob(job);
  } catch {
    // New desktop-primary queue unreachable — fall through to legacy routes.
  }

  // 1. Try CF KV (authoritative for queue-submitted jobs)
  try {
    const response = await fetch(`${SYNC_URL}/sync/stems/job/${jobId}`, {
      headers: syncHeaders(),
    });
    const job = await response.json().catch(() => null);
    // If KV has a meaningful status (not just a default PENDING), use it
    if (response.ok && job && job.status && job.status !== 'PENDING') {
      return job;
    }
  } catch {
    // CF KV unreachable — fall through to Container
  }

  // 2. Fallback: query Container directly (DB-backed, works for legacy /jobs jobs)
  try {
    const r = await fetch(`${CINESTAGE_URL}/jobs/${encodeURIComponent(jobId)}`);
    const job = await r.json().catch(() => ({}));
    if (r.ok && job) return job;
  } catch {
    // Container unreachable
  }

  return { id: jobId, status: 'PENDING', result: null };
}

function getStemResultCount(job) {
  const stems = job?.result?.stems || job?.stems;
  if (Array.isArray(stems)) return stems.length;
  if (stems && typeof stems === "object") return Object.keys(stems).length;
  return 0;
}

function isModalQuotaError(error) {
  const lowered = String(error || "").toLowerCase();
  return (
    lowered.includes("workspace billing cycle spend limit reached")
    || (lowered.includes("429") && lowered.includes("too many requests"))
  );
}

function extractCpuFallbackFailure(error) {
  const text = String(error || "").trim();
  const lowered = text.toLowerCase();
  const marker = "local cpu fallback failed:";
  const idx = lowered.indexOf(marker);
  if (idx === -1) return "";
  return text.slice(idx + marker.length).trim();
}

export function hasStemJobResult(job) {
  const status = String(job?.status || "").toUpperCase();
  return (
    DESKTOP_READY_STATUSES.has(status)
    || getStemResultCount(job) > 0
  );
}

export async function pollStemJob(jobId, {
  initialJob = null,
  onUpdate,
  maxPolls = STEM_JOB_MAX_POLLS,
  pendingIntervalMs = STEM_JOB_PENDING_INTERVAL_MS,
  processingIntervalMs = STEM_JOB_PROCESSING_INTERVAL_MS,
} = {}) {
  let current = initialJob || await getStemJob(jobId);
  let polls = 0;

  while (
    DESKTOP_PENDING_STATUSES.has(String(current?.status || "").toUpperCase())
    || DESKTOP_PROCESSING_STATUSES.has(String(current?.status || "").toUpperCase())
  ) {
    const previousStatus = current.status;
    const delayMs =
      String(previousStatus || "").toUpperCase() === "PROCESSING"
        ? processingIntervalMs
        : pendingIntervalMs;

    await new Promise((resolve) => setTimeout(resolve, delayMs));
    polls += 1;
    current = await getStemJob(jobId);

    if (typeof onUpdate === "function") {
      onUpdate(current, { polls, previousStatus });
    }
    if (polls >= maxPolls) break;
  }

  return current;
}

export function getStemJobError(job) {
  return (
    job?.error ||
    job?.result?.error ||
    job?.detail ||
    ""
  );
}

export function formatStemJobFailure(job) {
  const status = String(job?.status || "UNKNOWN").toUpperCase();
  const error = String(getStemJobError(job) || "").trim();
  const fallbackFailure = extractCpuFallbackFailure(error);

  if (status === "PROCESSING") {
    return [
      "CineStage is still processing this song.",
      "",
      "Cloudflare CPU fallback can take longer than older GPU-only jobs.",
      "",
      "Leave the job running a bit longer, then reopen the song and check again.",
    ].join("\n");
  }

  if (status === "PENDING") {
    return [
      "This job is still queued.",
      "",
      "Give CineStage another moment to pick it up, then try again.",
    ].join("\n");
  }
  if (status === "CLOUDFLARE_FALLBACK") {
    return [
      "No account desktop is online for this stem job.",
      "",
      "CineStage moved it to the fallback lane so it can continue without the desktop worker.",
    ].join("\n");
  }
  if (status === "QUEUED_FOR_DESKTOP" || status === "WAITING_FOR_DESKTOP") {
    return [
      "This song is queued for the account desktop.",
      "",
      "Open Ultimate Musician Desktop on the account holder machine and keep it online so CineStage can do the heavy stem processing.",
    ].join("\n");
  }

  if (status === "WAITING_FOR_SOURCE") {
    return [
      "CineStage needs source audio before this song can be processed.",
      "",
      "Use a licensed local audio file or configure a compliant YouTube source-prep step on the desktop worker.",
    ].join("\n");
  }

  if (isModalQuotaError(error)) {
    return [
      "CineStage GPU capacity is currently unavailable.",
      "",
      "Single-track URL / local-audio separation is not globally blocked, but this specific job did not finish.",
      "",
      fallbackFailure
        ? `Cloudflare CPU fallback also failed for this job: ${fallbackFailure}`
        : "Cloudflare CPU fallback is enabled, but this job still failed before completion.",
      "",
      "What still works right now:",
      "• Multitrack / ZIP import",
      "",
      "What to try next:",
      "• Retry the song from Song Details",
      "• Leave the app open longer on retries because CPU fallback can take longer than GPU",
      "• Use Multitrack / ZIP import if you already have stems",
    ].join("\n");
  }
  if (error) return `Job ended with status: ${status}\n\n${error}`;
  return `Job ended with status: ${status}`;
}
