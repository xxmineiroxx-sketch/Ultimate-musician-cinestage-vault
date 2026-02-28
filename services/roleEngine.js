export const RoleTypes = [
  'LEAD_VOCAL', 'BACKING_VOCAL', 'CHOIR', 'RAP', 'SPOKEN',
  'KICK', 'SNARE', 'TOMS', 'OH', 'DRUMS_BUS',
  'BASS', 'GUITAR', 'ACOUSTIC_GTR', 'KEYS', 'SYNTH', 'PADS',
  'STRINGS', 'BRASS', 'PERCUSSION', 'FX', 'CLICK_GUIDE',
];

export function incrementRole(counters, role) {
  const now = new Date().toISOString();
  const i = counters.findIndex((c) => c.role === role);
  if (i === -1) return [...counters, { role, assignedCount: 1, lastAssignedAt: now }];
  const next = counters.slice();
  next[i] = { ...next[i], assignedCount: next[i].assignedCount + 1, lastAssignedAt: now };
  return next;
}
