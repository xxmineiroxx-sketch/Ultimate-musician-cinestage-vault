/**
 * Tap Tempo v1
 * Keeps the last N tap timestamps and returns BPM.
 */

export function addTap(history = [], nowMs = Date.now(), max = 8) {
  const next = [...history, nowMs].slice(-max);
  return next;
}

export function bpmFromTaps(history = []) {
  if (history.length < 2) return null;
  const diffs = [];
  for (let i = 1; i < history.length; i++) diffs.push(history[i] - history[i - 1]);
  const avg = diffs.reduce((a,b)=>a+b,0)/diffs.length;
  const bpm = 60000 / avg;
  if (!isFinite(bpm)) return null;
  return Math.round(bpm);
}
