/**
 * Service File Parser v1
 *
 * Goal: allow importing a service plan and auto-matching setlist songs.
 * Since service files vary, we support:
 * - JSON service plan exports (Planning Center custom exports, or our own format)
 *
 * Returned structure:
 * { items: [{ title, type, notes, order }] }
 */

export function parseServicePlanText(text) {
  if (!text) return { items: [] };
  // Try JSON first
  try {
    const obj = JSON.parse(text);
    if (Array.isArray(obj.items)) return obj;
    if (Array.isArray(obj)) return { items: obj.map((t, i) => ({ title: String(t.title || t.name || t), order: i })) };
    // Planning Center-like exports
    if (Array.isArray(obj.planItems)) {
      return { items: obj.planItems.map((it, i) => ({ title: it.title || it.name || it.itemTitle || `Item ${i+1}`, type: it.type || it.itemType, order: i })) };
    }
  } catch {}

  // Fallback: line-based
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  return { items: lines.map((l, i) => ({ title: l, order: i })) };
}

export function bestMatchSong(title, songs=[]) {
  if (!title) return null;
  const t = title.toLowerCase();
  // exact
  let exact = songs.find(s => (s.title||'').toLowerCase() === t);
  if (exact) return exact;
  // contains
  let contains = songs.find(s => t.includes((s.title||'').toLowerCase()) || (s.title||'').toLowerCase().includes(t));
  if (contains) return contains;
  // fuzzy: remove punctuation
  const norm = (x) => (x||'').toLowerCase().replace(/[^a-z0-9 ]/g,'').trim();
  const nt = norm(title);
  let fuzzy = songs.find(s => norm(s.title) === nt);
  return fuzzy || null;
}
