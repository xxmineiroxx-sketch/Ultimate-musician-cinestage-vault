import { Audio } from "expo-av";

function recordingOptions() {
  return Audio.RecordingOptionsPresets.HIGH_QUALITY;
}

export async function ensureRecordingReady() {
  const perm = await Audio.requestPermissionsAsync();
  if (!perm.granted) {
    throw new Error("Microphone permission denied.");
  }
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
  });
}

export async function listAvailableRecordingInputs() {
  await ensureRecordingReady();
  const recording = new Audio.Recording();
  await recording.prepareToRecordAsync(recordingOptions());
  let inputs = [];
  try {
    if (typeof recording.getAvailableInputs === "function") {
      inputs = await recording.getAvailableInputs();
    }
  } finally {
    await recording.stopAndUnloadAsync().catch(() => {});
  }
  return Array.isArray(inputs) ? inputs : [];
}

export async function startTrackRecording(trackId, inputUid = null) {
  await ensureRecordingReady();
  const recording = new Audio.Recording();
  await recording.prepareToRecordAsync(recordingOptions());
  if (inputUid && typeof recording.setInput === "function") {
    await recording.setInput(inputUid).catch(() => {});
  }
  await recording.startAsync();
  return {
    trackId,
    startedAt: new Date().toISOString(),
    recording,
  };
}

export async function stopTrackRecording(session) {
  if (!session?.recording) return null;
  await session.recording.stopAndUnloadAsync();
  const uri = session.recording.getURI();
  return {
    trackId: session.trackId,
    startedAt: session.startedAt,
    stoppedAt: new Date().toISOString(),
    uri,
  };
}
