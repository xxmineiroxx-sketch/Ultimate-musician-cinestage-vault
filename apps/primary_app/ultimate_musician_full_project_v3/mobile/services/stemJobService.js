import * as FileSystem from "expo-file-system/legacy";

import {
  CINESTAGE_URL,
  SYNC_URL,
  getActiveOrgId,
  syncHeaders,
} from "../screens/config";

const HTTP_URL_RE = /^https?:\/\/\S+$/i;
const LOCAL_FILE_RE = /^(file|content|ph):\/\//i;
const STEM_JOB_PENDING_INTERVAL_MS = 2000;
const STEM_JOB_PROCESSING_INTERVAL_MS = 6000;
const STEM_JOB_MAX_POLLS = 450;

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
  separateHarmonies = true,
  voiceCount = 4,
  enhanceInstrumentStems = true,
  uploadId,
}) {
  const resolved = await resolveStemSourceUrl(sourceUrl, {
    uploadId: uploadId || songId || `upload_${Date.now().toString(36)}`,
    title,
  });

  const response = await fetch(`${SYNC_URL}/sync/stems/submit`, {
    method: "POST",
    headers: syncHeaders(),
    body: JSON.stringify({
      fileUrl: resolved.fileUrl,
      title,
      songId,
      separateHarmonies,
      voiceCount,
      enhanceInstrumentStems,
    }),
  });
  const job = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(job.error || JSON.stringify(job));
  }

  return {
    job,
    fileUrl: resolved.fileUrl,
    uploadedLocalFile: resolved.uploadedLocalFile,
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
  const response = await fetch(`${SYNC_URL}/sync/stems/job/${jobId}`, {
    headers: syncHeaders(),
  });
  const job = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(job.error || JSON.stringify(job));
  }
  return job;
}

function getStemResultCount(job) {
  const stems = job?.result?.stems;
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
    status === "COMPLETED"
    || status === "SUCCEEDED"
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

  while (current?.status === "PENDING" || current?.status === "PROCESSING") {
    const previousStatus = current.status;
    const delayMs =
      previousStatus === "PROCESSING"
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
