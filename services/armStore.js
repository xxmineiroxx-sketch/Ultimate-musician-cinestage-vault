import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'ULTIMATE_ARM_SNAPSHOT_V1';

export async function saveArmSnapshot(snapshot) {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(snapshot)); } catch {}
}

export async function loadArmSnapshot() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function clearArmSnapshot() {
  try { await AsyncStorage.removeItem(KEY); } catch {}
}
