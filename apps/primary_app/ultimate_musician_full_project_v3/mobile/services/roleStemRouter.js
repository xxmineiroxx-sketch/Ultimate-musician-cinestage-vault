const VOCAL_ROLES = new Set([
  "vocals",
  "lead vocals",
  "soprano",
  "alto",
  "contralto",
  "tenor",
  "baritone",
  "choir",
  "bgv",
  "backing vocals",
]);

const STEM_HINTS = {
  vocals_full: ["vocals", "lead_vocal", "lead vocals", "vocal_main", "voice"],
  vocals_layers: [
    "soprano",
    "alto",
    "contralto",
    "tenor",
    "baritone",
    "bgv",
    "harmony",
  ],
  drums: ["drums", "drum"],
  bass: ["bass"],
  keys: ["keys", "piano", "synth"],
  guitars: ["guitar", "gtr"],
  click: ["click", "metronome"],
  guide: ["guide", "voice_guide", "cue", "countin"],
};

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function hasAnyHint(text, hints) {
  return hints.some((hint) => text.includes(hint));
}

function trackTypeText(track) {
  return `${normalize(track?.id)} ${normalize(track?.type)} ${normalize(track?.label)}`;
}

function matchStemBucket(track) {
  const text = trackTypeText(track);
  for (const [bucket, hints] of Object.entries(STEM_HINTS)) {
    if (hasAnyHint(text, hints)) return bucket;
  }
  return "other";
}

export function isVocalRole(role) {
  return VOCAL_ROLES.has(normalize(role));
}

export function getRoleStemPolicy(role) {
  if (isVocalRole(role)) {
    return {
      mode: "vocal",
      include: [
        "vocals_full",
        "vocals_layers",
        "drums",
        "bass",
        "keys",
        "guitars",
        "click",
        "guide",
        "other",
      ],
      ownPartBuckets: ["vocals_full", "vocals_layers"],
      singleVocalOnly: false,
    };
  }

  return {
    mode: "musician",
    include: [
      "vocals_full",
      "drums",
      "bass",
      "keys",
      "guitars",
      "click",
      "guide",
      "other",
    ],
    ownPartBuckets: ["drums", "bass", "keys", "guitars"],
    singleVocalOnly: true,
  };
}

export function resolveRoleFilteredTracks(tracks, role) {
  const policy = getRoleStemPolicy(role);
  const withBuckets = (tracks || []).map((track) => ({
    ...track,
    stemBucket: matchStemBucket(track),
  }));

  let filtered = withBuckets.filter((track) =>
    policy.include.includes(track.stemBucket),
  );

  if (policy.singleVocalOnly) {
    const fullVocal = filtered.find(
      (track) => track.stemBucket === "vocals_full",
    );
    filtered = filtered.filter((track) => track.stemBucket !== "vocals_layers");
    if (!fullVocal) {
      const anyVocalLayer = withBuckets.find(
        (track) => track.stemBucket === "vocals_layers",
      );
      if (anyVocalLayer) filtered.unshift(anyVocalLayer);
    }
  }

  const ownTrack = filtered.find((track) => {
    const text = trackTypeText(track);
    const normalizedRole = normalize(role);
    return normalizedRole && text.includes(normalizedRole);
  });

  return {
    policy,
    filteredTracks: filtered,
    ownTrackId: ownTrack?.id || null,
  };
}
