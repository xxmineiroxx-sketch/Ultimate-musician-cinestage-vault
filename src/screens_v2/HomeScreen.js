/**
 * Home Screen - Ultimate Playback
 * Dashboard for team members
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
  AppState,
  Modal,
  Pressable,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getUserProfile, getAssignments, saveAssignments, saveUserProfile } from '../services/storage';
import { playNotificationSound } from '../services/notificationSounds';
import { ROLE_LABELS } from '../models_v2/models';

import { SYNC_URL, syncHeaders } from '../../config/syncConfig';
const SETLIST_HIDE_AFTER_SERVICE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MONTHLY_POPUP_SEEN_KEY = '@up_monthly_assignment_popup_seen_v1';
const LAST_VERSE_DAY_KEY = '@up_last_verse_day_v1';

const THEMED_VERSES = {
  easter: [
    { text: 'He is not here; he has risen, just as he said.', ref: 'Matthew 28:6' },
    { text: 'By his wounds you have been healed.', ref: '1 Peter 2:24' },
    { text: 'Christ died for our sins... he was raised on the third day.', ref: '1 Corinthians 15:3-4' },
  ],
  spring: [
    { text: 'See, I am doing a new thing! Now it springs up.', ref: 'Isaiah 43:19' },
    { text: 'Those who hope in the Lord will renew their strength.', ref: 'Isaiah 40:31' },
    { text: 'To everything there is a season, and a time for every purpose.', ref: 'Ecclesiastes 3:1' },
  ],
  summer: [
    { text: 'Let us not grow weary in doing good.', ref: 'Galatians 6:9' },
    { text: 'The one who remains in me bears much fruit.', ref: 'John 15:5' },
    { text: 'Whatever you do, work at it with all your heart, as for the Lord.', ref: 'Colossians 3:23' },
  ],
  fall: [
    { text: 'Give thanks to the Lord, for he is good.', ref: 'Psalm 107:1' },
    { text: 'In everything give thanks.', ref: '1 Thessalonians 5:18' },
    { text: 'He has made everything beautiful in its time.', ref: 'Ecclesiastes 3:11' },
  ],
  winter: [
    { text: 'The Lord will watch over your coming and going.', ref: 'Psalm 121:8' },
    { text: 'God is our refuge and strength, an ever-present help in trouble.', ref: 'Psalm 46:1' },
    { text: 'My grace is sufficient for you.', ref: '2 Corinthians 12:9' },
  ],
  christmas: [
    { text: 'For to us a child is born, to us a son is given.', ref: 'Isaiah 9:6' },
    { text: 'Glory to God in the highest heaven, and on earth peace.', ref: 'Luke 2:14' },
    { text: 'The Word became flesh and made his dwelling among us.', ref: 'John 1:14' },
  ],
};

// ── Role picker: icon + hint per role ────────────────────────────────────────
const ROLE_PICKER_ICONS = {
  worship_leader: '🎤', lead_vocal: '🎤', bgv_1: '🎙', bgv_2: '🎙', bgv_3: '🎙',
  music_director: '🎶', md: '🎶', admin: '⚙️',
  keyboard: '🎹', piano: '🎹', keys: '🎹',
  electric_guitar: '🎸', acoustic_guitar: '🎸', rhythm_guitar: '🎸', bass: '🎸',
  drums: '🥁', percussion: '🥁', synth: '🎛', tracks: '🎛',
  'Vocal Lead': '🎤', 'Vocal BGV': '🎙', 'Music Director': '🎶',
  'Keys': '🎹', 'Synth/Pad': '🎛', 'Bass': '🎸', 'Drums': '🥁',
  'Electric Guitar': '🎸', 'Acoustic Guitar': '🎸', 'Tracks': '🎛',
  'BGV 1': '🎙', 'BGV 2': '🎙', 'BGV 3': '🎙',
  'Leader': '🎤', 'Worship Leader': '🎤',
};
const ROLE_PICKER_HINTS = {
  worship_leader: 'View lyrics & lead sheet', lead_vocal: 'View & edit lyrics',
  bgv_1: 'View lyrics & harmony', bgv_2: 'View lyrics & harmony', bgv_3: 'View lyrics & harmony',
  music_director: 'Admin view — all charts', md: 'Admin view — all charts', admin: 'Admin view — all charts',
  keyboard: 'View & edit Keys chart', piano: 'View & edit Keys chart',
  electric_guitar: 'View & edit Guitar chart', acoustic_guitar: 'View & edit Guitar chart',
  bass: 'View & edit Bass chart', drums: 'View & edit Drums chart',
  synth: 'View & edit Synth/Pad chart', tracks: 'View & edit Tracks chart',
  'Vocal Lead': 'View & edit lyrics', 'Vocal BGV': 'View lyrics & harmony',
  'Music Director': 'Admin view — all charts', 'Leader': 'View lyrics & lead sheet',
  'Keys': 'View & edit Keys chart', 'Synth/Pad': 'View & edit Synth/Pad chart',
  'Bass': 'View & edit Bass chart', 'Drums': 'View & edit Drums chart',
  'Electric Guitar': 'View & edit Guitar chart', 'Acoustic Guitar': 'View & edit Guitar chart',
  'BGV 1': 'View lyrics & harmony', 'BGV 2': 'View lyrics & harmony', 'BGV 3': 'View lyrics & harmony',
};

/**
 * Conflict detection: same date + same time = only first-assigned service keeps the slot.
 * Same day but different times (10am, 12pm, 3pm, 7pm) are all allowed.
 * If no time info exists for an assignment, no conflict is flagged (keep it).
 * Assignments for the same service_id are always kept together (multi-role).
 */
function resolveTimeConflicts(assignments) {
  // Sort by assigned_at / created_at ascending — first assigned wins
  const sorted = [...assignments].sort((a, b) => {
    const ta = new Date(a.assigned_at || a.created_at || 0).getTime();
    const tb = new Date(b.assigned_at || b.created_at || 0).getTime();
    return ta - tb;
  });

  // slotKey → winning service_id
  const occupied = new Map();

  return sorted.filter(a => {
    const dateStr = a.service_date ? String(a.service_date) : null;
    if (!dateStr) return true; // no date — always show

    const dateKey = dateStr.split('T')[0]; // "2026-03-15"

    // Extract time: explicit field first, then from ISO string, else null
    const timeKey =
      a.service_time ||
      (dateStr.includes('T') ? dateStr.split('T')[1]?.slice(0, 5) : null);

    // Without a time we can't detect a conflict — keep it
    if (!timeKey) return true;

    const slotKey = `${dateKey}_${timeKey}`;
    const winner = occupied.get(slotKey);

    if (!winner) {
      occupied.set(slotKey, a.service_id || a.id);
      return true;
    }
    // Same service_id = same event with multiple roles — always keep
    return winner === (a.service_id || a.id);
  });
}

// Group assignments by service_id — same service = one logical slot
function groupByService(list) {
  const map = new Map();
  for (const a of list) {
    const key = a.service_id || a.id;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(a);
  }
  return Array.from(map.values());
}
function pickPreferredAssignmentStatus(currentValue, nextValue) {
  const normalize = (value) => String(value || '').trim().toLowerCase();
  const rank = { '': 0, pending: 1, accepted: 2, declined: 2 };
  const current = normalize(currentValue);
  const next = normalize(nextValue);
  const currentRank = rank[current] ?? 0;
  const nextRank = rank[next] ?? 0;

  if (nextRank > currentRank) return next;
  if (currentRank > nextRank) return current;
  if (next && next !== current && next !== 'pending') return next;
  return current || next || 'pending';
}
function groupStatus(group) {
  if (group.some(a => a.status === 'pending')) return 'pending';
  if (group.some(a => a.status === 'accepted')) return 'accepted';
  return 'declined';
}
function dedupAssignments(list) {
  const seen = new Set();
  return list.filter(a => {
    const key = `${a.service_id || ''}_${a.role || ''}_${a.id || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const OT_BOOKS = [
  ['Genesis', 50], ['Exodus', 40], ['Leviticus', 27], ['Numbers', 36], ['Deuteronomy', 34],
  ['Joshua', 24], ['Judges', 21], ['Ruth', 4], ['1 Samuel', 31], ['2 Samuel', 24],
  ['1 Kings', 22], ['2 Kings', 25], ['1 Chronicles', 29], ['2 Chronicles', 36], ['Ezra', 10],
  ['Nehemiah', 13], ['Esther', 10], ['Job', 42], ['Psalms', 150], ['Proverbs', 31],
  ['Ecclesiastes', 12], ['Song of Solomon', 8], ['Isaiah', 66], ['Jeremiah', 52], ['Lamentations', 5],
  ['Ezekiel', 48], ['Daniel', 12], ['Hosea', 14], ['Joel', 3], ['Amos', 9], ['Obadiah', 1],
  ['Jonah', 4], ['Micah', 7], ['Nahum', 3], ['Habakkuk', 3], ['Zephaniah', 3], ['Haggai', 2],
  ['Zechariah', 14], ['Malachi', 4],
];

const NT_BOOKS = [
  ['Matthew', 28], ['Mark', 16], ['Luke', 24], ['John', 21], ['Acts', 28], ['Romans', 16],
  ['1 Corinthians', 16], ['2 Corinthians', 13], ['Galatians', 6], ['Ephesians', 6], ['Philippians', 4],
  ['Colossians', 4], ['1 Thessalonians', 5], ['2 Thessalonians', 3], ['1 Timothy', 6], ['2 Timothy', 4],
  ['Titus', 3], ['Philemon', 1], ['Hebrews', 13], ['James', 5], ['1 Peter', 5], ['2 Peter', 3],
  ['1 John', 5], ['2 John', 1], ['3 John', 1], ['Jude', 1], ['Revelation', 22],
];

const OT_TOTAL = OT_BOOKS.reduce((sum, [, chapters]) => sum + chapters, 0);
const NT_TOTAL = NT_BOOKS.reduce((sum, [, chapters]) => sum + chapters, 0);

function getThemeByDate(date = new Date()) {
  const month = date.getMonth() + 1;
  if (month === 4) return { key: 'easter', label: 'Easter Season' };
  if (month >= 3 && month <= 5) return { key: 'spring', label: 'Spring Renewal' };
  if (month >= 6 && month <= 8) return { key: 'summer', label: 'Summer Growth' };
  if (month >= 9 && month <= 11) return { key: 'fall', label: 'Fall Gratitude' };
  if (month === 12) return { key: 'christmas', label: 'Advent & Christmas' };
  return { key: 'winter', label: 'Winter Faithfulness' };
}

function dayOfYear(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date - start;
  return Math.floor(diff / 86400000);
}

function chapterAtIndex(books, index1Based) {
  let remaining = index1Based;
  for (const [book, chapters] of books) {
    if (remaining <= chapters) {
      return { book, chapter: remaining };
    }
    remaining -= chapters;
  }
  const [lastBook, lastChapters] = books[books.length - 1];
  return { book: lastBook, chapter: lastChapters };
}

function chapterRangeForDay(books, totalChapters, day) {
  const safeDay = Math.max(1, Math.min(365, day));
  const startIdx = Math.floor(((safeDay - 1) * totalChapters) / 365) + 1;
  let endIdx = Math.floor((safeDay * totalChapters) / 365);
  if (endIdx < startIdx) endIdx = startIdx;

  const startRef = chapterAtIndex(books, startIdx);
  const endRef = chapterAtIndex(books, endIdx);

  if (startRef.book === endRef.book) {
    if (startRef.chapter === endRef.chapter) return `${startRef.book} ${startRef.chapter}`;
    return `${startRef.book} ${startRef.chapter}-${endRef.chapter}`;
  }
  return `${startRef.book} ${startRef.chapter} - ${endRef.book} ${endRef.chapter}`;
}

function getDailyReadingPlan(date = new Date()) {
  const day = dayOfYear(date);
  const clampedDay = Math.max(1, Math.min(365, day));
  const psalm = ((clampedDay - 1) % 150) + 1;
  const proverb = ((clampedDay - 1) % 31) + 1;
  return {
    day: clampedDay,
    ot: chapterRangeForDay(OT_BOOKS, OT_TOTAL, clampedDay),
    nt: chapterRangeForDay(NT_BOOKS, NT_TOTAL, clampedDay),
    wisdom: `Psalm ${psalm} + Proverbs ${proverb}`,
  };
}

function parseServiceEndMs(assignment) {
  const explicitEnd = assignment?.service_end_at || assignment?.end_at || assignment?.completed_at || assignment?.serviceDateTime;
  if (explicitEnd) {
    const endMs = new Date(explicitEnd).getTime();
    if (Number.isFinite(endMs)) return endMs;
  }

  const serviceDate = assignment?.service_date || assignment?.date;
  if (!serviceDate) return null;

  if (String(serviceDate).includes('T')) {
    const withTimeMs = new Date(serviceDate).getTime();
    if (Number.isFinite(withTimeMs)) return withTimeMs;
  }

  const timeRaw = assignment?.service_time || assignment?.time || '';
  const m = String(timeRaw).match(/(\d{1,2}):(\d{2})/);
  if (m) {
    const hh = Math.max(0, Math.min(23, Number(m[1] || 0)));
    const mm = Math.max(0, Math.min(59, Number(m[2] || 0)));
    const dt = new Date(serviceDate);
    if (Number.isFinite(dt.getTime())) {
      dt.setHours(hh, mm, 0, 0);
      return dt.getTime();
    }
  }

  const dt = new Date(serviceDate);
  if (!Number.isFinite(dt.getTime())) return null;
  dt.setHours(23, 59, 59, 999);
  return dt.getTime();
}

function isSetlistExpired(assignment, nowMs = Date.now()) {
  const endMs = parseServiceEndMs(assignment);
  if (!endMs) return false;
  return nowMs > endMs + SETLIST_HIDE_AFTER_SERVICE_MS;
}

function parseAssignmentMonthSourceMs(assignment) {
  const candidates = [
    assignment?.assigned_at,
    assignment?.created_at,
    assignment?.serviceDateTime,
    assignment?.service_date,
    assignment?.date,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const ms = new Date(candidate).getTime();
    if (Number.isFinite(ms)) return ms;
  }
  return null;
}

function getOrgLabel(assignment) {
  return (
    assignment?.organization_name ||
    assignment?.organization ||
    assignment?.org_name ||
    assignment?.church_name ||
    assignment?.church ||
    assignment?.ministry ||
    ''
  );
}

function getMonthKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function isLastDayOfMonth(date = new Date()) {
  const tomorrow = new Date(date);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.getMonth() !== date.getMonth();
}

function isPastService(dateStr) {
  if (!dateStr) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const svc = new Date(String(dateStr).includes('T') ? dateStr : dateStr + 'T00:00:00');
  svc.setHours(0, 0, 0, 0);
  return svc < today;
}

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [upcomingServices, setUpcomingServices] = useState([]); // array of service groups
  const [rolePickerVisible, setRolePickerVisible] = useState(false);
  const [rolePickerGroup, setRolePickerGroup]     = useState(null); // array of assignments
  const [serviceDetailGroup, setServiceDetailGroup] = useState(null); // upcoming service detail modal
  const [mdRole, setMdRole] = useState(null); // 'md' | 'admin' | null
  const [refreshing, setRefreshing] = useState(false);
  const [monthlyStats, setMonthlyStats] = useState({
    assignmentCount: 0,
    uniqueOrgCount: 0,
    roleLabels: [],
  });
  const [showMonthlyModal, setShowMonthlyModal] = useState(false);
  const _initDate = new Date();
  const _initTheme = getThemeByDate(_initDate);
  const _initVerses = THEMED_VERSES[_initTheme.key];
  const _initPlan = getDailyReadingPlan(_initDate);
  const _initDayN = _initDate.getFullYear() * 10000 + (_initDate.getMonth() + 1) * 100 + _initDate.getDate();
  const [verseOfDay, setVerseOfDay] = useState(_initVerses[Math.abs(_initDayN) % _initVerses.length]);
  const [seasonTheme, setSeasonTheme] = useState(_initTheme);
  const [readingPlan, setReadingPlan] = useState(_initPlan);
  const appStateRef = useRef(AppState.currentState);
  const lastTriggerTsRef = useRef(null);

  const getVerseByDay = useCallback((date = new Date()) => {
    const theme = getThemeByDate(date);
    const verses = THEMED_VERSES[theme.key];
    const dayToken = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    let hash = 0;
    for (let i = 0; i < dayToken.length; i += 1) {
      hash = ((hash << 5) - hash) + dayToken.charCodeAt(i);
      hash |= 0;
    }
    return { verse: verses[Math.abs(hash) % verses.length], theme };
  }, []);

  const maybeShowVersePopup = useCallback(async () => {
    const now = new Date();
    const dayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const { verse, theme } = getVerseByDay(now);
    const plan = getDailyReadingPlan(now);
    setVerseOfDay(verse);
    setSeasonTheme(theme);
    setReadingPlan(plan);

    let lastShownDay = null;
    try {
      lastShownDay = await AsyncStorage.getItem(LAST_VERSE_DAY_KEY);
    } catch (_) {}

    if (lastShownDay === dayKey) return;

    void playNotificationSound('verse');

    Alert.alert(
      `📖 ${theme.label} — Day ${plan.day}`,
      `"${verse.text}"\n${verse.ref}\n\n📚 Today's Reading\nOT: ${plan.ot}\nNT: ${plan.nt}\n${plan.wisdom}`,
      [{ text: 'Amen 🙏' }]
    );

    try {
      await AsyncStorage.setItem(LAST_VERSE_DAY_KEY, dayKey);
    } catch (_) {}
  }, [getVerseByDay]);

  const maybeShowMonthlyPopup = useCallback(async (stats) => {
    // Hidden feature: only appears on the last day of the month
    if (!isLastDayOfMonth()) return;

    const currentMonth = getMonthKey(new Date());
    let shownMonth = null;
    try {
      shownMonth = await AsyncStorage.getItem(MONTHLY_POPUP_SEEN_KEY);
    } catch (_) {}

    // Only show once per month even if they open the app multiple times on the last day
    if (shownMonth === currentMonth) return;

    setShowMonthlyModal(true);

    try {
      await AsyncStorage.setItem(MONTHLY_POPUP_SEEN_KEY, currentMonth);
    } catch (_) {}
  }, []);

  const loadDashboardData = useCallback(async () => {
    const userProfile = await getUserProfile();
    let userAssignments = await getAssignments();

    // Auto-sync assignments from Musician on dashboard load
    if (userProfile?.email) {
      try {
        const _ctrl = new AbortController();
        const _tid = setTimeout(() => _ctrl.abort(), 4000);
        let res;
        const _fullName = [userProfile.name, userProfile.lastName].filter(Boolean).join(' ').trim();
        const _assignUrl = _fullName
          ? `${SYNC_URL}/sync/assignments?email=${encodeURIComponent(userProfile.email)}&name=${encodeURIComponent(_fullName)}`
          : `${SYNC_URL}/sync/assignments?email=${encodeURIComponent(userProfile.email)}`;
        try { res = await fetch(_assignUrl, { headers: syncHeaders(), signal: _ctrl.signal }); } finally { clearTimeout(_tid); }
        if (res.ok) {
          const remote = await res.json();
          // Always replace local cache with server's authoritative list.
          // Preserve only stronger local decisions; never let a stale local
          // "pending" overwrite a real accepted/declined server response.
          const localMap = Object.fromEntries(userAssignments.map(a => [a.id, a]));
          const merged = dedupAssignments(remote.map(r =>
            localMap[r.id]
              ? {
                  ...r,
                  status: pickPreferredAssignmentStatus(localMap[r.id].status, r.status),
                  readiness: localMap[r.id].readiness,
                }
              : r
          ));
          await saveAssignments(merged);
          userAssignments = merged;
        }
      } catch (_) {}
    }

    // Check if this user has an MD/Admin grant
    if (userProfile?.email) {
      try {
        const _ctrl = new AbortController();
        const _tid = setTimeout(() => _ctrl.abort(), 4000);
        let roleRes;
        try {
          roleRes = await fetch(
            `${SYNC_URL}/sync/role?email=${encodeURIComponent(userProfile.email)}`,
            { headers: syncHeaders(), signal: _ctrl.signal }
          );
        } finally { clearTimeout(_tid); }
        if (roleRes?.ok) {
          const data = await roleRes.json();
          // Use grantedRole (Playback permission: md/admin) if available, else org role
          const role = data.grantedRole || null;
          if (role) {
            setMdRole(role);
            if (userProfile.grantedRole !== role) {
              await saveUserProfile({ ...userProfile, grantedRole: role });
            }
          } else {
            setMdRole(null);
          }
        }
      } catch (_) {}
    }

    const nowMs = Date.now();
    // Filter expired assignments for display only — do NOT save back so past assignments
    // remain in storage and can be re-fetched from the server on next sync.
    const dashboardAssignments = userAssignments.filter((a) => !isSetlistExpired(a, nowMs));

    setProfile(userProfile);
    setAssignments(dashboardAssignments);

    // Group ALL upcoming assigned services — accepted OR pending, all orgs, all roles
    const upcomingRaw = dashboardAssignments
      .filter((a) => a.status !== 'declined')
      .filter((a) => {
        const d = new Date(String(a.service_date).includes('T') ? a.service_date : a.service_date + 'T00:00:00');
        return d >= new Date(new Date().setHours(0, 0, 0, 0));
      });
    // Conflict rule: same day + same time → only first-assigned service keeps the slot
    const conflictResolved = resolveTimeConflicts(upcomingRaw);
    const upcomingGrouped = groupByService(conflictResolved)
      .sort((g1, g2) => new Date(g1[0].service_date) - new Date(g2[0].service_date));

    setUpcomingServices(upcomingGrouped);

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const monthlyAssignments = userAssignments.filter((a) => {
      const ms = parseAssignmentMonthSourceMs(a);
      if (!ms) return false;
      const dt = new Date(ms);
      return dt.getFullYear() === currentYear && dt.getMonth() === currentMonth;
    });

    const orgSet = new Set(
      monthlyAssignments
        .map((a) => getOrgLabel(a).trim())
        .filter(Boolean)
    );
    const roleSet = new Set(
      monthlyAssignments
        .map((a) => ROLE_LABELS[a.role] || a.role)
        .filter(Boolean)
    );
    const stats = {
      assignmentCount: groupByService(monthlyAssignments).length, // count services, not roles
      uniqueOrgCount: orgSet.size,
      roleLabels: Array.from(roleSet),
    };
    setMonthlyStats(stats);
    await maybeShowMonthlyPopup(stats);
  }, [maybeShowMonthlyPopup]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  }, [loadDashboardData]);

  useEffect(() => {
    loadDashboardData();
    const unsub = navigation?.addListener?.('focus', loadDashboardData);
    return unsub;
  }, [navigation, loadDashboardData]);

  useEffect(() => {
    maybeShowVersePopup();
    const sub = AppState.addEventListener('change', (nextState) => {
      const wasBackground = appStateRef.current === 'background' || appStateRef.current === 'inactive';
      if (wasBackground && nextState === 'active') {
        maybeShowVersePopup();
      }
      appStateRef.current = nextState;
    });
    return () => {
      sub?.remove?.();
    };
  }, [maybeShowVersePopup]);

  // Load persisted trigger timestamp so we don't re-fire on app restart
  useEffect(() => {
    AsyncStorage.getItem('@up_last_trigger_ts').then(ts => {
      if (ts) lastTriggerTsRef.current = ts;
    }).catch(() => {});
  }, []);

  // Poll Cloudflare every 4s — navigate to Setlist when UM sends a trigger
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`${SYNC_URL}/sync/playback-trigger`, { headers: syncHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        if (!data?.serviceId || !data?.timestamp) return;
        if (data.timestamp === lastTriggerTsRef.current) return;
        lastTriggerTsRef.current = data.timestamp;
        AsyncStorage.setItem('@up_last_trigger_ts', data.timestamp).catch(() => {});
        navigation.navigate('SetlistTab', { serviceId: data.serviceId });
      } catch (_) {}
    };
    const interval = setInterval(poll, 4000);
    return () => clearInterval(interval);
  }, [navigation]);

  // Only count upcoming/today assignments (not past services)
  const activeAssignments = assignments.filter(a => !isPastService(a.service_date));
  const serviceGroups = groupByService(activeAssignments);
  const pendingCount  = serviceGroups.filter(g => groupStatus(g) === 'pending').length;
  const acceptedCount = serviceGroups.filter(g => groupStatus(g) === 'accepted').length;

  // ── Service card tap: always go straight to Setlist with full group ──────────
  function openServiceCard(group) {
    navigation.navigate('Setlist', {
      serviceId: group[0].service_id,
      assignmentGroup: group,
    });
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      nestedScrollEnabled={true}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#4F46E5" />
      }
    >
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <Text style={styles.logo}>🎵</Text>
        <Text style={styles.title}>Ultimate Playback</Text>
        <Text style={styles.subtitle}>powered by CineStage</Text>
      </View>

      {profile ? (
        <View style={styles.welcomeCard}>
          <Text style={styles.welcomeText}>
            Welcome back, {profile.name} {profile.lastName}!
          </Text>
          <Text style={styles.roleText}>
            {profile.roleAssignments
              ? `Roles: ${profile.roleAssignments}`
              : 'No roles set yet'}
          </Text>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.setupCard}
          onPress={() => navigation.navigate('ProfileTab')}
        >
          <Text style={styles.setupIcon}>👋</Text>
          <Text style={styles.setupTitle}>Get Started</Text>
          <Text style={styles.setupText}>
            Set up your profile to receive assignments from your team
          </Text>
        </TouchableOpacity>
      )}

      {/* Admin / Manager / MD Panel card */}
      {mdRole && mdRole !== 'leader' && (
        <TouchableOpacity
          style={styles.adminCard}
          onPress={() => navigation.navigate('AdminDashboard', { mdRole })}
        >
          <View style={styles.adminCardLeft}>
            <View style={styles.adminBadge}>
              <Text style={styles.adminBadgeText}>
                {mdRole === 'org_owner' ? '🏛 Org Owner'
                  : mdRole === 'admin'   ? '👑 Admin'
                  : mdRole === 'manager' ? '🛡 Worship Leader'
                  : '🎛 Music Director'}
              </Text>
            </View>
            <Text style={styles.adminCardTitle}>Admin Panel</Text>
            <Text style={styles.adminCardDesc}>
              Manage messages, services, team & songs
            </Text>
          </View>
          <Text style={styles.adminCardArrow}>›</Text>
        </TouchableOpacity>
      )}

      {/* Leader Dashboard card */}
      {mdRole === 'leader' && (
        <TouchableOpacity
          style={[styles.adminCard, { borderColor: '#7C3AED44' }]}
          onPress={() => navigation.navigate('LeaderDashboard', { leaderEmail: profile?.email, leaderName: profile?.name })}
        >
          <View style={styles.adminCardLeft}>
            <View style={[styles.adminBadge, { backgroundColor: '#7C3AED22', borderColor: '#7C3AED' }]}>
              <Text style={[styles.adminBadgeText, { color: '#A78BFA' }]}>🎼 Leader</Text>
            </View>
            <Text style={styles.adminCardTitle}>Leader Dashboard</Text>
            <Text style={styles.adminCardDesc}>
              Services, team, library & setlists
            </Text>
          </View>
          <Text style={styles.adminCardArrow}>›</Text>
        </TouchableOpacity>
      )}

      {/* Quick Stats */}
      <View style={styles.statsRow}>
        <TouchableOpacity style={styles.statCard} activeOpacity={0.7} onPress={() => navigation.navigate('Assignments')}>
          <Text style={styles.statNumber}>{pendingCount}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.statCard} activeOpacity={0.7} onPress={() => navigation.navigate('Assignments')}>
          <Text style={styles.statNumber}>{acceptedCount}</Text>
          <Text style={styles.statLabel}>Accepted</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.statCard} activeOpacity={0.7} onPress={() => navigation.navigate('ProfileSetup')}>
          <Text style={styles.statNumber}>{profile?.roles?.length || 0}</Text>
          <Text style={styles.statLabel}>Roles</Text>
        </TouchableOpacity>
      </View>




      <View style={styles.verseCard}>
        <View style={styles.verseHeader}>
          <Text style={styles.verseLabel}>Verse of the Day</Text>
          <Text style={styles.verseSeason}>{seasonTheme.label}</Text>
        </View>
        <Text style={styles.verseText}>"{verseOfDay.text}"</Text>
        <Text style={styles.verseRef}>{verseOfDay.ref}</Text>
        <View style={styles.readingDivider} />
        <Text style={styles.readingTitle}>📖 Day {readingPlan.day} of 365</Text>
        <Text style={styles.readingLine}>OT · {readingPlan.ot}</Text>
        <Text style={styles.readingLine}>NT · {readingPlan.nt}</Text>
        <Text style={styles.readingLine}>{readingPlan.wisdom}</Text>
      </View>

      {/* Pending Assignments */}
      {pendingCount > 0 && (
        <TouchableOpacity
          style={styles.alertCard}
          onPress={() => navigation.navigate('Assignments')}
        >
          <View style={styles.alertHeader}>
            <Text style={styles.alertIcon}>📬</Text>
            <View style={styles.alertContent}>
              <Text style={styles.alertTitle}>
                {pendingCount} Pending Assignment{pendingCount > 1 ? 's' : ''}
              </Text>
              <Text style={styles.alertText}>
                You have assignments waiting for your response
              </Text>
            </View>
          </View>
          <Text style={styles.alertAction}>Review →</Text>
        </TouchableOpacity>
      )}

      {/* Upcoming Services */}
      {upcomingServices.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Upcoming Services</Text>
          {upcomingServices.map((group) => {
            const first = group[0];
            const orgName = first.org_name || first.organization_name || first.church_name || '';
            const city = first.branch_city || '';
            const orgLabel = city ? `${orgName} — ${city}` : orgName;
            const roles = group.map(a => ROLE_LABELS[a.role] || a.role);
            return (
              <TouchableOpacity
                key={first.service_id || first.id}
                style={styles.serviceCard}
                onPress={() => setServiceDetailGroup(group)}
                activeOpacity={0.75}
              >
                <Text style={styles.serviceDate}>
                  📅 {new Date(
                    String(first.service_date).includes('T')
                      ? first.service_date
                      : first.service_date + 'T00:00:00'
                  ).toLocaleDateString('en-US', {
                    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
                  })}
                </Text>
                {!!orgLabel && (
                  <Text style={styles.serviceOrg}>🏛 {orgLabel}</Text>
                )}
                <View style={styles.serviceRoleRow}>
                  {roles.map((r, i) => (
                    <View key={i} style={styles.serviceRoleChip}>
                      <Text style={styles.serviceRoleChipText}>{r}</Text>
                    </View>
                  ))}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* ── Monthly Assignment Tracker (hidden — last day of month only) ── */}
      <Modal
        visible={showMonthlyModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMonthlyModal(false)}
      >
        <Pressable style={styles.monthlyBackdrop} onPress={() => setShowMonthlyModal(false)}>
          <Pressable style={styles.monthlySheet} onPress={() => {}}>
            <View style={styles.monthlyHeader}>
              <Text style={styles.monthlyIcon}>📊</Text>
              <Text style={styles.monthlyTitle}>Monthly Assignment Tracker</Text>
              <Text style={styles.monthlySubtitle}>{getMonthKey(new Date())}</Text>
            </View>
            <View style={styles.monthlyDivider} />
            <View style={styles.monthlyRow}>
              <Text style={styles.monthlyNum}>{monthlyStats.assignmentCount}</Text>
              <Text style={styles.monthlyLabel}>service{monthlyStats.assignmentCount === 1 ? '' : 's'} this month</Text>
            </View>
            <View style={styles.monthlyRow}>
              <Text style={styles.monthlyNum}>{monthlyStats.uniqueOrgCount}</Text>
              <Text style={styles.monthlyLabel}>church{monthlyStats.uniqueOrgCount === 1 ? '' : 'es'} / organization{monthlyStats.uniqueOrgCount === 1 ? '' : 's'}</Text>
            </View>
            {monthlyStats.roleLabels.length > 0 && (
              <View style={styles.monthlyRolesRow}>
                <Text style={styles.monthlyRolesLabel}>Roles this month</Text>
                <Text style={styles.monthlyRoles}>{monthlyStats.roleLabels.join('  ·  ')}</Text>
              </View>
            )}
            <TouchableOpacity style={styles.monthlyCloseBtn} onPress={() => setShowMonthlyModal(false)}>
              <Text style={styles.monthlyCloseTxt}>See you next month 🙌</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Service Detail Modal */}
      <Modal
        visible={!!serviceDetailGroup}
        transparent
        animationType="slide"
        onRequestClose={() => setServiceDetailGroup(null)}
      >
        <Pressable style={styles.detailBackdrop} onPress={() => setServiceDetailGroup(null)}>
          <Pressable style={styles.detailSheet} onPress={() => {}}>
            {serviceDetailGroup && (() => {
              const first = serviceDetailGroup[0];
              const orgName = first.org_name || first.organization_name || first.church_name || '';
              const city = first.branch_city || '';
              const orgLabel = city ? `${orgName} — ${city}` : orgName;
              const roles = serviceDetailGroup.map(a => ROLE_LABELS[a.role] || a.role);

              // Date + time
              const dateStr = String(first.service_date).includes('T')
                ? first.service_date
                : first.service_date + 'T00:00:00';
              const dateObj = new Date(dateStr);
              const dateFormatted = dateObj.toLocaleDateString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
              });
              const timeFormatted = first.service_time
                || (String(first.service_date).includes('T')
                  ? dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                  : null);

              return (
                <>
                  <View style={styles.detailHandle} />
                  <Text style={styles.detailTitle}>{first.service_name}</Text>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailIcon}>📅</Text>
                    <Text style={styles.detailValue}>{dateFormatted}</Text>
                  </View>

                  {!!timeFormatted && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailIcon}>🕐</Text>
                      <Text style={styles.detailValue}>{timeFormatted}</Text>
                    </View>
                  )}

                  {!!orgLabel && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailIcon}>🏛</Text>
                      <Text style={styles.detailValue}>{orgLabel}</Text>
                    </View>
                  )}

                  <View style={styles.detailRow}>
                    <Text style={styles.detailIcon}>🎵</Text>
                    <View style={styles.detailRoleChips}>
                      {roles.map((r, i) => (
                        <View key={i} style={styles.detailRoleChip}>
                          <Text style={styles.detailRoleChipText}>{r}</Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.detailClose}
                    onPress={() => setServiceDetailGroup(null)}
                  >
                    <Text style={styles.detailCloseText}>Close</Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('Setlist')}
        >
          <Text style={styles.actionIcon}>📋</Text>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>View Setlist</Text>
            <Text style={styles.actionDesc}>See role-specific content</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('Assignments')}
        >
          <Text style={styles.actionIcon}>📬</Text>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Assignments</Text>
            <Text style={styles.actionDesc}>Manage service assignments</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('BlockoutCalendar')}
        >
          <Text style={styles.actionIcon}>📅</Text>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Blockout Calendar</Text>
            <Text style={styles.actionDesc}>Mark unavailable dates</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('Messages')}
        >
          <Text style={styles.actionIcon}>💬</Text>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Messages</Text>
            <Text style={styles.actionDesc}>Team communication</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('ProfileSetup')}
        >
          <Text style={styles.actionIcon}>👤</Text>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Profile & Roles</Text>
            <Text style={styles.actionDesc}>Update your information</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, { borderColor: '#4F46E5', borderWidth: 1 }]}
          onPress={() => navigation.navigate('PersonalPractice')}
        >
          <Text style={styles.actionIcon}>🎧</Text>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>My Practice</Text>
            <Text style={styles.actionDesc}>Your personalized stem mix</Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Ultimate Playback • Team Member App
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
    flexGrow: 1,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logo: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#F9FAFB',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#9CA3AF',
  },
  welcomeCard: {
    padding: 20,
    backgroundColor: '#1E1B4B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4F46E5',
    marginBottom: 24,
  },
  welcomeText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#F9FAFB',
    marginBottom: 8,
  },
  roleText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  adminCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#1E1B4B',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#7C3AED',
    marginBottom: 20,
  },
  adminCardLeft: { flex: 1 },
  adminBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, backgroundColor: '#7C3AED40', borderRadius: 10, borderWidth: 1, borderColor: '#7C3AED', marginBottom: 6 },
  adminBadgeText: { fontSize: 11, fontWeight: '700', color: '#C4B5FD' },
  adminCardTitle: { fontSize: 18, fontWeight: '700', color: '#F9FAFB', marginBottom: 2 },
  adminCardDesc: { fontSize: 13, color: '#A78BFA' },
  adminCardArrow: { fontSize: 32, color: '#7C3AED', marginLeft: 12 },

  setupCard: {
    padding: 24,
    backgroundColor: '#0B1120',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#4F46E5',
    borderStyle: 'dashed',
    alignItems: 'center',
    marginBottom: 24,
  },
  setupIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  setupTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#F9FAFB',
    marginBottom: 8,
  },
  setupText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    padding: 16,
    backgroundColor: '#0B1120',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 32,
    fontWeight: '700',
    color: '#4F46E5',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Monthly tracker modal (hidden — last day of month only)
  monthlyBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  monthlySheet: {
    backgroundColor: '#1A1A2E', borderRadius: 20,
    borderWidth: 1, borderColor: '#4F46E5',
    padding: 24, width: '100%', maxWidth: 380,
  },
  monthlyHeader: { alignItems: 'center', marginBottom: 4 },
  monthlyIcon: { fontSize: 32, marginBottom: 6 },
  monthlyTitle: { color: '#E0E7FF', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  monthlySubtitle: { color: '#6366F1', fontSize: 12, fontWeight: '600', marginTop: 2 },
  monthlyDivider: { height: 1, backgroundColor: '#312E81', marginVertical: 16 },
  monthlyRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 10 },
  monthlyNum: { color: '#818CF8', fontSize: 32, fontWeight: '900', lineHeight: 34 },
  monthlyLabel: { color: '#C7D2FE', fontSize: 14, fontWeight: '500' },
  monthlyRolesRow: { marginTop: 6, marginBottom: 4 },
  monthlyRolesLabel: { color: '#6366F1', fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 4 },
  monthlyRoles: { color: '#A5B4FC', fontSize: 13, fontWeight: '600' },
  monthlyCloseBtn: {
    marginTop: 20, backgroundColor: '#4F46E5', borderRadius: 12,
    paddingVertical: 12, alignItems: 'center',
  },
  monthlyCloseTxt: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },

  // (kept for reference — card is no longer rendered inline)
  monthlyTrackerCard: {
    marginBottom: 20,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: '#4F46E5',
  },
  monthlyTrackerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#E0E7FF',
    marginBottom: 6,
  },
  monthlyTrackerText: {
    fontSize: 13,
    color: '#C7D2FE',
    marginBottom: 3,
  },
  monthlyTrackerRoles: {
    marginTop: 3,
    fontSize: 12,
    color: '#A5B4FC',
  },
  verseCard: {
    marginBottom: 20,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#172554',
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  verseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  verseLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#BFDBFE',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  verseSeason: {
    fontSize: 11,
    fontWeight: '600',
    color: '#93C5FD',
    backgroundColor: '#1E3A8A',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  verseText: {
    fontSize: 14,
    color: '#EFF6FF',
    lineHeight: 20,
    marginBottom: 6,
  },
  verseRef: {
    fontSize: 12,
    color: '#93C5FD',
    fontWeight: '600',
  },
  readingDivider: {
    height: 1,
    backgroundColor: '#1E3A8A',
    marginVertical: 10,
  },
  readingTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#BFDBFE',
    marginBottom: 5,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  readingLine: {
    fontSize: 12,
    color: '#93C5FD',
    lineHeight: 18,
  },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#7C3AED20',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#7C3AED',
    marginBottom: 24,
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  alertIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  alertContent: {
    flex: 1,
  },
  alertTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F9FAFB',
    marginBottom: 4,
  },
  alertText: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  alertAction: {
    fontSize: 14,
    fontWeight: '600',
    color: '#7C3AED',
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#E5E7EB',
    marginBottom: 16,
  },
  serviceCard: {
    padding: 16,
    backgroundColor: '#0B1120',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
    marginBottom: 12,
  },
  serviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  serviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F9FAFB',
    flex: 1,
  },
  serviceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#4F46E520',
    borderRadius: 4,
  },
  serviceBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4F46E5',
  },
  serviceDate: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 8,
  },
  readinessRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  readinessDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F59E0B',
    marginRight: 8,
  },
  readinessDotReady: {
    backgroundColor: '#10B981',
  },
  readinessText: {
    fontSize: 12,
    color: '#9CA3AF',
  },

  serviceOrg: {
    fontSize: 13,
    color: '#818CF8',
    marginTop: 4,
    marginBottom: 2,
  },
  detailBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  detailSheet: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  detailHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#374151',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  detailTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#F9FAFB',
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
    gap: 12,
  },
  detailIcon: {
    fontSize: 18,
    width: 24,
  },
  detailValue: {
    flex: 1,
    fontSize: 15,
    color: '#E5E7EB',
    lineHeight: 22,
  },
  detailRoleChips: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  detailRoleChip: {
    backgroundColor: '#1E1B4B',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#4F46E5',
  },
  detailRoleChipText: {
    color: '#A5B4FC',
    fontSize: 13,
    fontWeight: '700',
  },
  detailClose: {
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#1F2937',
    alignItems: 'center',
  },
  detailCloseText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  // ── Service card: multi-role chips ─────────────────────────────────────────
  serviceCardPending: {
    borderColor: '#F59E0B50',
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
  },
  serviceCardArrow: {
    fontSize: 22,
    color: '#374151',
  },
  serviceRoleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  serviceRoleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#4F46E520',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4F46E550',
  },
  serviceRoleChipPending: {
    backgroundColor: '#F59E0B15',
    borderColor: '#F59E0B50',
  },
  serviceRoleChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F59E0B',
  },
  serviceRoleChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#818CF8',
  },
  serviceRoleChipTextPending: {
    color: '#FBD38D',
  },
  multiRoleTapHint: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#1F2937',
    borderRadius: 6,
  },
  multiRoleTapText: {
    fontSize: 10,
    color: '#6B7280',
    fontWeight: '600',
  },

  // ── Role Picker Modal ───────────────────────────────────────────────────────
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 12,
  },
  pickerHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#374151',
    alignSelf: 'center',
    marginBottom: 18,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F9FAFB',
    marginBottom: 4,
  },
  pickerDate: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 16,
  },
  pickerSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4B5563',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E2740',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  pickerOptionIcon: {
    fontSize: 28,
    marginRight: 14,
  },
  pickerOptionBody: {
    flex: 1,
  },
  pickerOptionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F9FAFB',
    marginBottom: 2,
  },
  pickerOptionHint: {
    fontSize: 12,
    color: '#6B7280',
  },
  pickerOptionArrow: {
    fontSize: 26,
    color: '#4B5563',
    marginLeft: 8,
  },
  pickerCancel: {
    marginTop: 6,
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: '#1F2937',
  },
  pickerCancelText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#9CA3AF',
  },

  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#0B1120',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
    marginBottom: 12,
  },
  actionIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F9FAFB',
    marginBottom: 4,
  },
  actionDesc: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  footer: {
    alignItems: 'center',
    marginTop: 24,
  },
  footerText: {
    fontSize: 12,
    color: '#6B7280',
  },
});
