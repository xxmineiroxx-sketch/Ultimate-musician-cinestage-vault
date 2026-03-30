import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "UM_LIVE_LATENCY_CALIBRATION_V1";

const DEFAULT_CALIBRATION = {
  outputLatencyMs: 0,
  inputLatencyMs: 0,
  manualOffsetMs: 0,
  updatedAt: null,
};

export async function getLatencyCalibration() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      ...DEFAULT_CALIBRATION,
      ...parsed,
    };
  } catch {
    return { ...DEFAULT_CALIBRATION };
  }
}

export async function saveLatencyCalibration(values) {
  const next = {
    ...DEFAULT_CALIBRATION,
    ...(values || {}),
    updatedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function getTotalLatencyMs(calibration) {
  const c = calibration || DEFAULT_CALIBRATION;
  return (
    Number(c.outputLatencyMs || 0) +
    Number(c.inputLatencyMs || 0) +
    Number(c.manualOffsetMs || 0)
  );
}

export function applyLatencyCompensationSeconds(targetSec, calibration) {
  const latencySec = getTotalLatencyMs(calibration) / 1000;
  return Math.max(0, Number(targetSec || 0) - latencySec);
}
