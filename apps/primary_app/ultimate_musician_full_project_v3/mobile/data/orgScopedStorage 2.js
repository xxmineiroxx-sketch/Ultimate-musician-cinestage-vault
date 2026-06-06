import AsyncStorage from "@react-native-async-storage/async-storage";

import { getActiveOrgId, SYNC_ORG_ID } from "../screens/config";

const BRANCH_ORG_ID_KEY = "um_branch_orgId";
const LEGACY_OWNER_PREFIX = "um.storage.scope_owner.v1";
const SCOPE_DELIMITER = "::org::";
const RECORD_DELIMITER = "::item::";
const DEFAULT_SCOPE_ID = "root";

function normalizeScopeId(orgId) {
  const normalized = String(orgId || "").trim();
  if (normalized) return normalized;

  const fallback = String(SYNC_ORG_ID || "").trim();
  return fallback || DEFAULT_SCOPE_ID;
}

async function readStoredBranchOrgId() {
  try {
    return String((await AsyncStorage.getItem(BRANCH_ORG_ID_KEY)) || "").trim();
  } catch {
    return "";
  }
}

function getLegacyOwnerKey(baseKey) {
  return `${LEGACY_OWNER_PREFIX}${SCOPE_DELIMITER}${baseKey}`;
}

export async function getStorageScopeOrgId() {
  const storedBranchOrgId = await readStoredBranchOrgId();
  return normalizeScopeId(storedBranchOrgId || getActiveOrgId());
}

export function getScopedStorageKeyForOrg(baseKey, orgId) {
  return `${baseKey}${SCOPE_DELIMITER}${normalizeScopeId(orgId)}`;
}

export async function getScopedStorageKey(baseKey) {
  return getScopedStorageKeyForOrg(baseKey, await getStorageScopeOrgId());
}

export async function ensureScopedLegacyMigration(baseKey) {
  const [scopedOrgId, scopedKey] = await Promise.all([
    getStorageScopeOrgId(),
    getScopedStorageKey(baseKey),
  ]);

  const scopedValue = await AsyncStorage.getItem(scopedKey);
  if (scopedValue != null) {
    return scopedKey;
  }

  const legacyValue = await AsyncStorage.getItem(baseKey);
  if (legacyValue == null) {
    return scopedKey;
  }

  const ownerKey = getLegacyOwnerKey(baseKey);
  const legacyOwner = String((await AsyncStorage.getItem(ownerKey)) || "").trim();
  if (legacyOwner && legacyOwner !== scopedOrgId) {
    return scopedKey;
  }

  await AsyncStorage.setItem(scopedKey, legacyValue);
  if (!legacyOwner) {
    await AsyncStorage.setItem(ownerKey, scopedOrgId);
  }

  return scopedKey;
}

export async function getScopedItem(baseKey) {
  const scopedKey = await ensureScopedLegacyMigration(baseKey);
  return AsyncStorage.getItem(scopedKey);
}

export async function setScopedItem(baseKey, value) {
  const scopedKey = await getScopedStorageKey(baseKey);
  await AsyncStorage.setItem(scopedKey, value);
  return scopedKey;
}

export async function removeScopedItem(baseKey) {
  const scopedKey = await getScopedStorageKey(baseKey);
  await AsyncStorage.removeItem(scopedKey);
  return scopedKey;
}

export async function multiRemoveScopedItems(baseKeys) {
  const scopedKeys = await Promise.all(baseKeys.map((baseKey) => getScopedStorageKey(baseKey)));
  await AsyncStorage.multiRemove(scopedKeys);
  return scopedKeys;
}

function getScopedRecordOwnerKey(prefix) {
  return getLegacyOwnerKey(`${prefix}${RECORD_DELIMITER}collection`);
}

function getLegacyRecordKey(prefix, recordId, separator = "/") {
  return `${prefix}${separator}${String(recordId || "").trim()}`;
}

export function getScopedRecordPrefixForOrg(prefix, orgId) {
  return `${prefix}${SCOPE_DELIMITER}${normalizeScopeId(orgId)}${RECORD_DELIMITER}`;
}

export async function getScopedRecordPrefix(prefix) {
  return getScopedRecordPrefixForOrg(prefix, await getStorageScopeOrgId());
}

export function getScopedRecordKeyForOrg(prefix, recordId, orgId) {
  return `${getScopedRecordPrefixForOrg(prefix, orgId)}${String(recordId || "").trim()}`;
}

export async function getScopedRecordKey(prefix, recordId) {
  return getScopedRecordKeyForOrg(prefix, recordId, await getStorageScopeOrgId());
}

export async function getScopedRecordItem(prefix, recordId, options = {}) {
  const [scopedOrgId, scopedKey] = await Promise.all([
    getStorageScopeOrgId(),
    getScopedRecordKey(prefix, recordId),
  ]);
  const scopedValue = await AsyncStorage.getItem(scopedKey);
  if (scopedValue != null) {
    return scopedValue;
  }

  const ownerKey = getScopedRecordOwnerKey(prefix);
  const legacyOwner = String((await AsyncStorage.getItem(ownerKey)) || "").trim();
  if (legacyOwner && legacyOwner !== scopedOrgId) {
    return null;
  }

  const legacyKey = getLegacyRecordKey(
    prefix,
    recordId,
    options.legacySeparator || "/",
  );
  const legacyValue = await AsyncStorage.getItem(legacyKey);
  if (legacyValue == null) {
    return null;
  }

  await AsyncStorage.setItem(scopedKey, legacyValue);
  if (!legacyOwner) {
    await AsyncStorage.setItem(ownerKey, scopedOrgId);
  }

  return legacyValue;
}

export async function setScopedRecordItem(prefix, recordId, value) {
  const scopedKey = await getScopedRecordKey(prefix, recordId);
  await AsyncStorage.setItem(scopedKey, value);
  return scopedKey;
}

export async function listScopedRecordKeys(prefix, options = {}) {
  const scopedOrgId = await getStorageScopeOrgId();
  const scopedPrefix = getScopedRecordPrefixForOrg(prefix, scopedOrgId);
  const allKeys = await AsyncStorage.getAllKeys();
  const scopedKeys = allKeys.filter((key) => key.startsWith(scopedPrefix));
  if (scopedKeys.length > 0) {
    return scopedKeys;
  }

  const ownerKey = getScopedRecordOwnerKey(prefix);
  const legacyOwner = String((await AsyncStorage.getItem(ownerKey)) || "").trim();
  if (legacyOwner && legacyOwner !== scopedOrgId) {
    return [];
  }

  const legacyPrefix = `${prefix}${options.legacySeparator || "/"}`;
  const legacyKeys = allKeys.filter((key) => key.startsWith(legacyPrefix));
  if (legacyKeys.length === 0) {
    return [];
  }

  const migratedKeys = [];
  for (const legacyKey of legacyKeys) {
    const recordId = legacyKey.slice(legacyPrefix.length);
    if (!recordId) continue;
    const legacyValue = await AsyncStorage.getItem(legacyKey);
    if (legacyValue == null) continue;
    const nextScopedKey = getScopedRecordKeyForOrg(prefix, recordId, scopedOrgId);
    await AsyncStorage.setItem(nextScopedKey, legacyValue);
    migratedKeys.push(nextScopedKey);
  }

  if (!legacyOwner) {
    await AsyncStorage.setItem(ownerKey, scopedOrgId);
  }

  return migratedKeys;
}
