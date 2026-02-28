import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'UM_CONTROLLER_MAP_V1';

export async function loadControllerMap() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('loadControllerMap failed', e);
    return [];
  }
}

export async function saveControllerMap(mappings) {
  try {
    const payload = Array.isArray(mappings) ? mappings : [];
    await AsyncStorage.setItem(KEY, JSON.stringify(payload));
    return true;
  } catch (e) {
    console.warn('saveControllerMap failed', e);
    return false;
  }
}

