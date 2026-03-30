const DEFAULT_BOOST = 0.001;

function pairKey(fromId, toId) {
  return `${String(fromId || "START")}->${String(toId || "")}`;
}

export function createPredictiveState(markers) {
  return {
    markers: Array.isArray(markers) ? markers : [],
    transitions: {},
    lastMarkerId: null,
    lastUpdatedAt: null,
  };
}

export function registerJumpIntent(state, targetMarkerId) {
  const current = state || createPredictiveState([]);
  const toId = String(targetMarkerId || "");
  const fromId = String(current.lastMarkerId || "START");
  const key = pairKey(fromId, toId);
  const transitions = {
    ...(current.transitions || {}),
    [key]: Number(current.transitions?.[key] || 0) + 1,
  };
  return {
    ...current,
    transitions,
    lastMarkerId: toId || current.lastMarkerId,
    lastUpdatedAt: new Date().toISOString(),
  };
}

export function suggestNextMarkers(state, fromMarkerId, topN = 3) {
  const current = state || createPredictiveState([]);
  const baseId = String(fromMarkerId || current.lastMarkerId || "START");
  const markerMap = new Map(
    (current.markers || []).map((m) => [String(m.id), m]),
  );

  const scored = (current.markers || []).map((marker) => {
    const key = pairKey(baseId, marker.id);
    const prior = Number(current.transitions?.[key] || 0);
    const structuralBoost = marker.label?.toLowerCase().includes("chorus")
      ? DEFAULT_BOOST * 4
      : DEFAULT_BOOST;
    const score = prior + structuralBoost;
    return {
      markerId: marker.id,
      label: marker.label || "Marker",
      start: Number(marker.start || 0),
      score,
      marker: markerMap.get(String(marker.id)),
    };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Number(topN || 3)));
}
