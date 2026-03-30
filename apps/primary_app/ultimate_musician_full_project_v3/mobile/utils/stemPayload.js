function stemUrlValue(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value !== "object") return null;
  return (
    value.url
    || value.uri
    || value.localUri
    || value.file_url
    || value.fileUrl
    || value.downloadUrl
    || value.streamUrl
    || null
  );
}

function prettifyStemKey(value) {
  const raw = String(value || "")
    .replace(/^harmony_/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return "Track";
  return raw.replace(/\b\w/g, (char) => char.toUpperCase());
}

function stemAudioKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      return `${parsed.origin}${parsed.pathname}`.toLowerCase();
    } catch {}
  }
  return raw.split("?")[0].trim().toLowerCase();
}

function entryPriority(entry) {
  const id = String(entry?.id || "").trim().toLowerCase();
  const label = String(entry?.label || "").trim().toLowerCase();
  let score = 0;

  if (id && !/^stem_\d+$/.test(id)) score += 1;
  if (/^(bass|drums|guitars?|keys?|vocals?|other|pads?|click|guide)$/.test(id)) score += 30;
  if (/^harmony_(soprano|alto|contralto|tenor|bass|baritone|lead)$/.test(id)) score += 40;
  if (/^(soprano|alto|contralto|tenor|bass|baritone|lead vocal)$/.test(label)) score += 20;
  if (/^harmony_bgv(?:_\d+)?$/.test(id)) score -= 20;
  if (/^voice\d+$/.test(id)) score -= 15;
  if (/\bbgv\b/.test(label)) score -= 10;
  if (/^full_mix$/.test(id) || label === "full mix") score -= 25;

  return score;
}

function pushEntry(entries, seenIds, seenAudioKeys, entry) {
  const id = String(entry?.id || "").trim();
  if (!id || seenIds.has(id)) return;

  const url = stemUrlValue(entry) || entry?.url || entry?.uri || null;
  const uri = url || entry?.uri || null;
  if (!url && !uri) return;

  const nextEntry = { ...entry, url, uri };
  const audioKey = stemAudioKey(url || uri);
  if (audioKey && seenAudioKeys.has(audioKey)) {
    const existingIndex = seenAudioKeys.get(audioKey);
    const existingEntry = entries[existingIndex];
    if (existingEntry && entryPriority(nextEntry) > entryPriority(existingEntry)) {
      const existingId = String(existingEntry?.id || "").trim();
      if (existingId) seenIds.delete(existingId);
      entries[existingIndex] = nextEntry;
      seenIds.add(id);
    }
    return;
  }

  entries.push(nextEntry);
  seenIds.add(id);
  if (audioKey) seenAudioKeys.set(audioKey, entries.length - 1);
}

export function normalizeBackendStemEntries(result = {}) {
  const entries = [];
  const seenIds = new Set();
  const seenAudioKeys = new Map();
  const rawStems = result?.stems;

  if (Array.isArray(rawStems)) {
    rawStems.forEach((item, index) => {
      const id = String(item?.id || item?.type || item?.label || `stem_${index}`);
      pushEntry(entries, seenIds, seenAudioKeys, {
        id,
        type: String(item?.type || id),
        label: String(item?.label || prettifyStemKey(item?.type || id)),
        url: stemUrlValue(item),
        uri: stemUrlValue(item),
      });
    });
  } else if (rawStems && typeof rawStems === "object") {
    Object.entries(rawStems).forEach(([key, value]) => {
      pushEntry(entries, seenIds, seenAudioKeys, {
        id: key,
        type: String(value?.type || key),
        label: String(value?.label || prettifyStemKey(key)),
        url: stemUrlValue(value),
        uri: stemUrlValue(value),
      });
    });
  }

  const rawHarmonies = result?.harmonies;
  if (rawHarmonies && typeof rawHarmonies === "object") {
    Object.entries(rawHarmonies).forEach(([part, value]) => {
      const id = String(
        value?.id
        || value?.key
        || `harmony_${part}`,
      );
      pushEntry(entries, seenIds, seenAudioKeys, {
        id,
        type: String(value?.type || `harmony_${part}`),
        label: String(value?.label || prettifyStemKey(part)),
        url: stemUrlValue(value),
        uri: stemUrlValue(value),
      });
    });
  }

  const fallbackFullMix = result?.full_mix || result?.fullMix || null;
  if (fallbackFullMix && !seenIds.has("full_mix")) {
    pushEntry(entries, seenIds, seenAudioKeys, {
      id: "full_mix",
      type: "full_mix",
      label: "Full Mix",
      url: stemUrlValue(fallbackFullMix),
      uri: stemUrlValue(fallbackFullMix),
    });
  }

  return entries.filter((entry) => Boolean(entry.url || entry.uri));
}

export function hasBackendStemEntries(result = {}) {
  return normalizeBackendStemEntries(result).length > 0;
}

export function getBackendStemKeys(result = {}) {
  return normalizeBackendStemEntries(result).map((entry) => entry.id);
}
