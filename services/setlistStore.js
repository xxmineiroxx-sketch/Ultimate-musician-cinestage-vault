import AsyncStorage from '@react-native-async-storage/async-storage';
import { defaultSetlist } from '../setlist/model';

const KEY = "UM_SETLIST_V1";

export async function loadSetlist() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return defaultSetlist();
    return { ...defaultSetlist(), ...JSON.parse(raw) };
  } catch (e) {
    console.warn("loadSetlist failed", e);
    return defaultSetlist();
  }
}

export async function saveSetlist(setlist) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(setlist));
    return true;
  } catch (e) {
    console.warn("saveSetlist failed", e);
    return false;
  }
}
