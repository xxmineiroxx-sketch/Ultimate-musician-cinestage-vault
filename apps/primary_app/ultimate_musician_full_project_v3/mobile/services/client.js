import { CINESTAGE_API_BASE_URL } from "./config";

async function http(path, init) {
  const res = await fetch(`${CINESTAGE_API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  if (!res.ok) throw new Error(`CineStage API ${res.status}`);
  return await res.json();
}

export const createJob = (payload) =>
  http("/jobs", { method: "POST", body: JSON.stringify(payload) });

export const getJob = (jobId) => http(`/jobs/${encodeURIComponent(jobId)}`);

const TERMINAL_STATUSES = new Set(["COMPLETED", "SUCCEEDED", "FAILED", "CANCELLED", "ERROR"]);

export async function pollJob(jobId, { intervalMs = 5000, timeoutMs = 1200000, onPoll } = {}) {
  const start = Date.now();
  while (true) {
    const job = await getJob(jobId);
    if (typeof onPoll === 'function') onPoll(job);
    if (TERMINAL_STATUSES.has(job.status)) return job;
    if (Date.now() - start > timeoutMs)
      throw new Error("CineStage stem separation timed out after 20 min — check job status later");
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
