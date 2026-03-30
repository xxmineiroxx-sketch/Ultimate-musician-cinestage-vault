export function validateArmedPipeline(pipeline) {
  if (!pipeline) return { ok: false, reason: "No armed pipeline." };
  if (!Array.isArray(pipeline.markers) || pipeline.markers.length === 0) {
    return { ok: false, reason: "Pipeline has no markers." };
  }
  if (
    !pipeline.performancePolicy?.launchQuantization ||
    !pipeline.performancePolicy?.transitionMode
  ) {
    return { ok: false, reason: "Missing performance policy." };
  }
  if (
    !pipeline.restrictions ||
    !Array.isArray(pipeline.restrictions.visibleTrackIds)
  ) {
    return { ok: false, reason: "Missing live restrictions." };
  }
  return { ok: true };
}

export function isLiveLocked(pipeline) {
  return pipeline?.restrictions?.liveLock !== false;
}

export function canAccessTrack(pipeline, trackId) {
  const allowed = pipeline?.restrictions?.visibleTrackIds || [];
  return allowed.includes(trackId);
}

export function evaluateJumpSafety(pipeline, currentSec, targetSec) {
  const mode = pipeline?.safetyPolicy?.mode || "guided";
  const now = Math.max(0, Number(currentSec || 0));
  const target = Math.max(0, Number(targetSec || 0));
  const delta = Math.abs(target - now);

  if (mode === "tech")
    return {
      ok: true,
      correctedTargetSec: target,
      reason: "Tech mode bypass.",
    };
  if (mode === "strict" && delta > 120) {
    return {
      ok: false,
      correctedTargetSec: target,
      reason: "Strict mode blocked long-range jump.",
    };
  }
  if (target < 0.1 && now > 8 && mode !== "tech") {
    return {
      ok: false,
      correctedTargetSec: target,
      reason: "Jump to song start blocked while live.",
    };
  }

  return { ok: true, correctedTargetSec: target, reason: "Allowed." };
}
