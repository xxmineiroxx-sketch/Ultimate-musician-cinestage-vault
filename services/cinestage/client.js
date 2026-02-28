import { CINESTAGE_API_BASE_URL } from './config';

async function http(path, init) {
  const res = await fetch(`${CINESTAGE_API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  });
  if (!res.ok) throw new Error(`CineStage API ${res.status}`);
  return await res.json();
}

export const createJob = (payload) =>
  http('/jobs', { method: 'POST', body: JSON.stringify(payload) });

export const getJob = (jobId) =>
  http(`/jobs/${encodeURIComponent(jobId)}`);

export async function pollJob(jobId, intervalMs = 750, timeoutMs = 60000) {
  const start = Date.now();
  while (true) {
    const job = await getJob(jobId);
    if (['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(job.status)) return job;
    if (Date.now() - start > timeoutMs) throw new Error('CineStage poll timed out');
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
