import AsyncStorage from '@react-native-async-storage/async-storage';
import { SYNC_URL, syncHeaders } from '../../config/syncConfig';
import { getUserProfile, saveUserProfile } from './storage';
import { syncProfileToTeamMembers } from './sharedStorage';
import { parseRoleAssignments } from '../models_v2/models';

const USER_KEY = 'auth_user';
const SESSION_KEY = 'user_session';
const PROFILE_EMAIL_KEY = '@profile_email';
const PROFILE_NAME_KEY = '@profile_name';
const DEVICE_ID_KEY = 'auth_device_id';
const PENDING_REGISTRATION_KEY = 'auth_pending_registration';

const DEFAULT_NOTIFICATION_PREFERENCES = {
  assignments: true,
  messages: true,
  reminders: true,
};

function normalizeIdentifier(identifier) {
  return String(identifier || '').trim().toLowerCase();
}

function normalizePhone(phone) {
  return String(phone || '').trim();
}

function normalizePhoneLookup(phone) {
  return normalizePhone(phone).replace(/\D+/g, '');
}

function isPhoneIdentifier(identifier) {
  const raw = String(identifier || '').trim();
  return !raw.includes('@') && normalizePhoneLookup(raw).length >= 7;
}

function normalizeAuthIdentifier(identifier) {
  const raw = String(identifier || '').trim();
  return isPhoneIdentifier(raw) ? raw : normalizeIdentifier(raw);
}

function normalizeDisplayName(name, fallback = '') {
  return String(name || fallback || '').trim();
}

function splitNameParts(fullName) {
  const parts = normalizeDisplayName(fullName).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts[parts.length - 1],
  };
}

function getResponseValue(data, key) {
  if (!data || typeof data !== 'object') return undefined;
  return (
    data[key] ??
    data.user?.[key] ??
    data.account?.[key] ??
    data.profile?.[key]
  );
}

function extractEmail(...candidates) {
  for (const candidate of candidates) {
    const normalized = normalizeIdentifier(candidate);
    if (normalized.includes('@')) return normalized;
  }
  return '';
}

function normalizeVerificationPurpose(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'signup' || normalized === 'register') return 'signup';
  if (normalized === 'login' || normalized === 'signin' || normalized === 'sign_in') return 'login';
  return '';
}

function createSyncError(data, fallbackMessage = 'Request failed') {
  const error = new Error(data?.error || fallbackMessage);
  if (data && typeof data === 'object') {
    Object.assign(error, data);
  }
  return error;
}

async function syncRequest(path, body) {
  const res = await fetch(`${SYNC_URL}/sync/${path}`, {
    method: 'POST',
    headers: syncHeaders(),
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = {};
  }
  if (!res.ok) throw createSyncError(data);
  return data;
}

async function getDeviceId() {
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;

  const nextId = `device_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  await AsyncStorage.setItem(DEVICE_ID_KEY, nextId);
  return nextId;
}

async function setPendingRegistrationProfile({
  email,
  phone,
  name,
  roleAssignments,
}) {
  const payload = {
    email: normalizeIdentifier(email),
    phone: normalizePhone(phone),
    name: normalizeDisplayName(name),
    roleAssignments: parseRoleAssignments(roleAssignments),
  };
  await AsyncStorage.setItem(
    PENDING_REGISTRATION_KEY,
    JSON.stringify(payload),
  );
}

async function getPendingRegistrationProfile(email = '') {
  const raw = await AsyncStorage.getItem(PENDING_REGISTRATION_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    const pendingEmail = normalizeIdentifier(parsed?.email);
    const expectedEmail = normalizeIdentifier(email);
    if (expectedEmail && pendingEmail && pendingEmail !== expectedEmail) {
      return null;
    }
    return parsed;
  } catch {
    await AsyncStorage.removeItem(PENDING_REGISTRATION_KEY);
    return null;
  }
}

async function clearPendingRegistrationProfile() {
  await AsyncStorage.removeItem(PENDING_REGISTRATION_KEY);
}

function resolveAuthRoles(data, fallback = {}) {
  const orgRole = getResponseValue(data, 'role') || fallback.orgRole || null;
  const grantedRole =
    getResponseValue(data, 'grantedRole') || fallback.grantedRole || null;

  return {
    sessionRole: grantedRole || orgRole || fallback.role || null,
    grantedRole,
    orgRole,
  };
}

async function persistSession({
  identifier,
  email,
  phone,
  name,
  role,
  grantedRole,
  orgRole,
  orgName,
}) {
  const normalizedIdentifier = normalizeAuthIdentifier(
    identifier || email || phone,
  );
  const normalizedEmail = extractEmail(email, normalizedIdentifier);
  const normalizedPhone = normalizePhone(phone);
  const resolvedName = normalizeDisplayName(
    name,
    normalizedEmail || normalizedPhone || normalizedIdentifier,
  );
  const user = {
    identifier: normalizedIdentifier,
    email: normalizedEmail,
    phone: normalizedPhone,
    name: resolvedName,
    role: role || grantedRole || orgRole || null,
    grantedRole: grantedRole || null,
    orgRole: orgRole || null,
    orgName: orgName || null,
  };

  await AsyncStorage.multiSet([
    [USER_KEY, JSON.stringify(user)],
    [
      SESSION_KEY,
      JSON.stringify({
        identifier: normalizedIdentifier,
        email: normalizedEmail,
        phone: normalizedPhone,
      }),
    ],
    [PROFILE_EMAIL_KEY, normalizedEmail],
    [PROFILE_NAME_KEY, resolvedName],
  ]);

  return user;
}

async function hydrateLocalProfile({
  identifier,
  email,
  phone,
  name,
  role,
  grantedRole,
  orgRole,
  roleAssignments,
}) {
  const normalizedIdentifier = normalizeAuthIdentifier(
    identifier || email || phone,
  );
  const normalizedEmail = extractEmail(email, normalizedIdentifier);
  const normalizedPhone = normalizePhone(phone);
  const normalizedPhoneLookup = normalizePhoneLookup(normalizedPhone);
  const resolvedName = normalizeDisplayName(
    name,
    normalizedEmail || normalizedPhone || normalizedIdentifier,
  );
  const existingProfile = await getUserProfile();
  const sameUser =
    (normalizedEmail &&
      normalizeIdentifier(existingProfile?.email) === normalizedEmail) ||
    (normalizedPhoneLookup &&
      normalizePhoneLookup(existingProfile?.phone) === normalizedPhoneLookup) ||
    (normalizedIdentifier &&
      normalizeAuthIdentifier(
        existingProfile?.authIdentifier ||
          existingProfile?.email ||
          existingProfile?.phone,
      ) === normalizedIdentifier);
  const baseProfile = sameUser ? existingProfile : null;
  const { firstName, lastName } = splitNameParts(resolvedName);
  const normalizedRoles = parseRoleAssignments(
    roleAssignments || baseProfile?.roleAssignments || baseProfile?.roles || [],
  );

  const nextProfile = {
    ...(baseProfile || {}),
    id: baseProfile?.id || `user_${Date.now()}`,
    authIdentifier:
      normalizedIdentifier ||
      baseProfile?.authIdentifier ||
      normalizedEmail ||
      normalizedPhone,
    email: normalizedEmail || baseProfile?.email || '',
    name: baseProfile?.name || firstName || resolvedName,
    lastName: baseProfile?.lastName || lastName || '',
    phone: normalizedPhone || baseProfile?.phone || '',
    dateOfBirth: baseProfile?.dateOfBirth || '',
    photo_url: baseProfile?.photo_url || '',
    roles:
      normalizedRoles.length > 0
        ? normalizedRoles
        : Array.isArray(baseProfile?.roles)
          ? baseProfile.roles
          : [],
    roleAssignments:
      normalizedRoles.length > 0
        ? normalizedRoles.join(', ')
        : baseProfile?.roleAssignments || '',
    blockout_dates: Array.isArray(baseProfile?.blockout_dates)
      ? baseProfile.blockout_dates
      : [],
    grantedRole: grantedRole || role || baseProfile?.grantedRole || null,
    orgRole: orgRole || baseProfile?.orgRole || null,
    notification_preferences:
      baseProfile?.notification_preferences ||
      DEFAULT_NOTIFICATION_PREFERENCES,
  };

  await saveUserProfile(nextProfile);
  return nextProfile;
}

async function migrateLegacySession() {
  const rawSession = await AsyncStorage.getItem(SESSION_KEY);
  if (!rawSession) return null;

  try {
    const session = JSON.parse(rawSession);
    if (session?.guest) {
      await AsyncStorage.removeItem(SESSION_KEY);
      return null;
    }

    const identifier = normalizeAuthIdentifier(
      session?.identifier || session?.email || session?.phone,
    );
    if (!identifier) {
      await AsyncStorage.removeItem(SESSION_KEY);
      return null;
    }

    const [storedProfile, storedName] = await Promise.all([
      getUserProfile(),
      AsyncStorage.getItem(PROFILE_NAME_KEY),
    ]);
    const storedEmail = extractEmail(
      session?.email,
      storedProfile?.email,
      identifier,
    );
    const resolvedName = normalizeDisplayName(
      storedProfile?.email &&
        normalizeIdentifier(storedProfile.email) === storedEmail
        ? [storedProfile.name, storedProfile.lastName].filter(Boolean).join(' ').trim()
        : storedName,
      storedEmail || identifier,
    );

    const user = await persistSession({
      identifier,
      email: storedEmail,
      phone: session?.phone || storedProfile?.phone || '',
      name: resolvedName,
      role: storedProfile?.grantedRole || null,
      orgName: null,
    });
    const profile = await hydrateLocalProfile({
      identifier: user.identifier,
      email: user.email,
      phone: user.phone,
      name: user.name,
      role: user.role,
    });
    await syncProfileToTeamMembers(profile).catch(() => {});
    return user;
  } catch {
    await AsyncStorage.removeItem(SESSION_KEY);
    return null;
  }
}

async function completeAuthFromResponse(data, fallback = {}) {
  const resolvedEmail = extractEmail(
    getResponseValue(data, 'email'),
    fallback.email,
    fallback.identifier,
  );
  const resolvedPhone = getResponseValue(data, 'phone') || fallback.phone || '';
  const sessionIdentifier =
    resolvedEmail ||
    normalizePhone(resolvedPhone) ||
    normalizeAuthIdentifier(
      fallback.identifier || fallback.email || fallback.phone,
    );
  const resolvedName = normalizeDisplayName(
    getResponseValue(data, 'name') || fallback.name,
    resolvedEmail || resolvedPhone || sessionIdentifier,
  );
  const roles = resolveAuthRoles(data, fallback);

  const user = await persistSession({
    identifier: sessionIdentifier,
    email: resolvedEmail,
    phone: resolvedPhone,
    name: resolvedName,
    role: roles.sessionRole,
    grantedRole: roles.grantedRole,
    orgRole: roles.orgRole,
    orgName: getResponseValue(data, 'orgName') || fallback.orgName || null,
  });
  const pendingProfile = fallback.usePendingRegistration && resolvedEmail
    ? await getPendingRegistrationProfile(resolvedEmail)
    : null;
  const normalizedRoles = parseRoleAssignments(
    fallback.roleAssignments ||
      pendingProfile?.roleAssignments ||
      [],
  );
  const profile = await hydrateLocalProfile({
    identifier: user.identifier,
    email: user.email,
    phone: user.phone || pendingProfile?.phone || fallback.phone || '',
    name: user.name,
    role: roles.sessionRole,
    grantedRole: roles.grantedRole,
    orgRole: roles.orgRole,
    roleAssignments: normalizedRoles,
  });
  await syncProfileToTeamMembers(profile).catch(() => {});
  if (pendingProfile) {
    await clearPendingRegistrationProfile();
  }
  return { data, user, profile };
}

export async function register({
  firstName,
  lastName,
  email,
  password,
  phone,
  roleAssignments,
}) {
  const normalizedEmail = normalizeIdentifier(email);
  const normalizedPhone = normalizePhone(phone);
  const name = `${firstName.trim()} ${lastName.trim()}`.trim();
  const normalizedRoles = parseRoleAssignments(roleAssignments);
  const deviceId = await getDeviceId();

  await setPendingRegistrationProfile({
    email: normalizedEmail,
    phone: normalizedPhone,
    name,
    roleAssignments: normalizedRoles,
  });

  const data = await syncRequest('auth/register', {
    identifier: normalizedEmail,
    password,
    name,
    deviceId,
  });

  if (data?.needsVerification) {
    return data;
  }

  await completeAuthFromResponse(data, {
    identifier: normalizedEmail,
    email: normalizedEmail,
    phone: normalizedPhone,
    name,
    roleAssignments: normalizedRoles,
    usePendingRegistration: true,
  });
  return data;
}

export async function login(identifier, password) {
  const normalizedIdentifier = normalizeAuthIdentifier(identifier);
  const deviceId = await getDeviceId();
  const data = await syncRequest('auth/login', {
    identifier: normalizedIdentifier,
    password,
    deviceId,
  });

  if (data?.needsVerification) {
    return data;
  }

  await completeAuthFromResponse(data, {
    identifier: normalizedIdentifier,
  });
  return data;
}

export async function verifyCode(identifier, code, options = {}) {
  const normalizedIdentifier = normalizeAuthIdentifier(identifier);
  const normalizedCode = String(code || '').trim();
  const purpose = normalizeVerificationPurpose(options?.purpose);

  if (!normalizedIdentifier || !normalizedCode) {
    throw new Error('Email or phone, plus the verification code, are required.');
  }

  const data = await syncRequest('auth/verify', {
    identifier: normalizedIdentifier,
    code: normalizedCode,
    purpose,
    deviceId: await getDeviceId(),
  });

  await completeAuthFromResponse(data, {
    identifier: normalizedIdentifier,
    email: extractEmail(options?.email, normalizedIdentifier),
    usePendingRegistration: purpose === 'signup',
  });

  return data;
}

export async function resendCode(identifier, options = {}) {
  const normalizedIdentifier = normalizeAuthIdentifier(identifier);
  const purpose = normalizeVerificationPurpose(options?.purpose);

  if (!normalizedIdentifier) {
    throw new Error('Email or phone is required.');
  }

  return syncRequest('auth/resend', {
    identifier: normalizedIdentifier,
    purpose,
    deviceId: await getDeviceId(),
  });
}

export async function requestPasswordReset(identifier) {
  const normalizedIdentifier = normalizeAuthIdentifier(identifier);
  if (!normalizedIdentifier) {
    throw new Error('Email or phone is required');
  }

  return syncRequest('auth/forgot-password', {
    identifier: normalizedIdentifier,
  });
}

export async function resetPasswordWithCode(identifier, code, newPassword) {
  const normalizedIdentifier = normalizeAuthIdentifier(identifier);
  const normalizedCode = String(code || '').trim();
  const normalizedNewPassword = String(newPassword || '');

  if (!normalizedIdentifier || !normalizedCode || !normalizedNewPassword) {
    throw new Error('Email or phone, reset code, and new password are required.');
  }

  return syncRequest('auth/reset-password', {
    identifier: normalizedIdentifier,
    code: normalizedCode,
    newPassword: normalizedNewPassword,
  });
}

export async function changePassword(identifier, currentPassword, newPassword) {
  const normalizedIdentifier = normalizeAuthIdentifier(identifier);
  const res = await fetch(`${SYNC_URL}/sync/auth/change-password`, {
    method: 'POST',
    headers: syncHeaders(),
    body: JSON.stringify({
      identifier: normalizedIdentifier,
      currentPassword,
      newPassword,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || 'Could not change password');
  }
  return data;
}

export async function logout() {
  await AsyncStorage.multiRemove([
    USER_KEY,
    SESSION_KEY,
    PROFILE_EMAIL_KEY,
    PROFILE_NAME_KEY,
    PENDING_REGISTRATION_KEY,
  ]);
}

export async function getStoredUser() {
  const raw = await AsyncStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    await AsyncStorage.removeItem(USER_KEY);
    return null;
  }
}

export async function isLoggedIn() {
  const storedUser = await getStoredUser();
  if (storedUser?.email || storedUser?.identifier) return true;

  const migratedUser = await migrateLegacySession();
  return !!(migratedUser?.email || migratedUser?.identifier);
}
