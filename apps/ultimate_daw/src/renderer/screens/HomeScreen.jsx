/**
 * HomeScreen.jsx — Ultimate DAW (Desktop)
 * Full feature parity with mobile HomeScreen.js
 */

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import { SYNC_URL, syncHeaders } from '../config/syncConfig';
import { useBrain } from '../context/BrainContext';
import { store } from '../services/store';

// ── Constants ─────────────────────────────────────────────────────────────────
const SETLIST_HIDE_AFTER_SERVICE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MONTHLY_POPUP_SEEN_KEY = 'monthly_popup_seen';
const LAST_TRIGGER_TS_KEY = 'last_trigger_ts';

// ── Seasonal Verses ───────────────────────────────────────────────────────────
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

// ── Bible reading plan data ───────────────────────────────────────────────────
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

const OT_TOTAL = OT_BOOKS.reduce((sum, [, ch]) => sum + ch, 0);
const NT_TOTAL = NT_BOOKS.reduce((sum, [, ch]) => sum + ch, 0);

// ── Pure helper functions ─────────────────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function getThemeByDate(date = new Date()) {
  const month = date.getMonth() + 1;
  if (month === 4) return { key: 'easter', label: 'Easter Season' };
  if (month >= 3 && month <= 5) return { key: 'spring', label: 'Spring Renewal' };
  if (month >= 6 && month <= 8) return { key: 'summer', label: 'Summer Growth' };
  if (month >= 9 && month <= 11) return { key: 'fall', label: 'Fall Gratitude' };
  if (month === 12) return { key: 'christmas', label: 'Advent & Christmas' };
  return { key: 'winter', label: 'Winter Faithfulness' };
}

function getVerseByDay(date = new Date()) {
  const theme = getThemeByDate(date);
  const verses = THEMED_VERSES[theme.key];
  const dayToken = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  let hash = 0;
  for (let i = 0; i < dayToken.length; i++) {
    hash = ((hash << 5) - hash) + dayToken.charCodeAt(i);
    hash |= 0;
  }
  return { verse: verses[Math.abs(hash) % verses.length], theme };
}

function dayOfYear(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date - start) / 86400000);
}

function chapterAtIndex(books, index1Based) {
  let remaining = index1Based;
  for (const [book, chapters] of books) {
    if (remaining <= chapters) return { book, chapter: remaining };
    remaining -= chapters;
  }
  const [lastBook, lastCh] = books[books.length - 1];
  return { book: lastBook, chapter: lastCh };
}

function chapterRangeForDay(books, totalChapters, day) {
  const safeDay = Math.max(1, Math.min(365, day));
  const startIdx = Math.floor(((safeDay - 1) * totalChapters) / 365) + 1;
  let endIdx = Math.floor((safeDay * totalChapters) / 365);
  if (endIdx < startIdx) endIdx = startIdx;
  const s = chapterAtIndex(books, startIdx);
  const e = chapterAtIndex(books, endIdx);
  if (s.book === e.book) {
    return s.chapter === e.chapter ? `${s.book} ${s.chapter}` : `${s.book} ${s.chapter}-${e.chapter}`;
  }
  return `${s.book} ${s.chapter} - ${e.book} ${e.chapter}`;
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

function parseServiceEndMs(assignment) {
  const explicitEnd = assignment?.service_end_at || assignment?.end_at || assignment?.completed_at;
  if (explicitEnd) {
    const ms = new Date(explicitEnd).getTime();
    if (Number.isFinite(ms)) return ms;
  }
  const serviceDate = assignment?.service_date || assignment?.date;
  if (!serviceDate) return null;
  if (String(serviceDate).includes('T')) {
    const ms = new Date(serviceDate).getTime();
    if (Number.isFinite(ms)) return ms;
  }
  const timeRaw = assignment?.service_time || assignment?.time || '';
  const m = String(timeRaw).match(/(\d{1,2}):(\d{2})/);
  if (m) {
    const hh = Math.max(0, Math.min(23, Number(m[1] || 0)));
    const mm2 = Math.max(0, Math.min(59, Number(m[2] || 0)));
    const dt = new Date(serviceDate);
    if (Number.isFinite(dt.getTime())) {
      dt.setHours(hh, mm2, 0, 0);
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

function isPastService(dateStr) {
  if (!dateStr) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const svc = new Date(String(dateStr).includes('T') ? dateStr : dateStr + 'T00:00:00');
  svc.setHours(0, 0, 0, 0);
  return svc < today;
}

/**
 * Conflict detection: same date + same time = only first-assigned service keeps the slot.
 * Same day but different times are all allowed. No time = no conflict flagged.
 */
function resolveTimeConflicts(assignments) {
  const sorted = [...assignments].sort((a, b) => {
    const ta = new Date(a.assigned_at || a.created_at || 0).getTime();
    const tb = new Date(b.assigned_at || b.created_at || 0).getTime();
    return ta - tb;
  });
  const occupied = new Map();
  return sorted.filter(a => {
    const dateStr = a.service_date ? String(a.service_date) : null;
    if (!dateStr) return true;
    const dateKey = dateStr.split('T')[0];
    const timeKey = a.service_time || (dateStr.includes('T') ? dateStr.split('T')[1]?.slice(0, 5) : null);
    if (!timeKey) return true;
    const slotKey = `${dateKey}_${timeKey}`;
    const winner = occupied.get(slotKey);
    if (!winner) {
      occupied.set(slotKey, a.service_id || a.id);
      return true;
    }
    return winner === (a.service_id || a.id);
  });
}

function groupByService(list) {
  const map = new Map();
  for (const a of list) {
    const key = a.service_id || a.id;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(a);
  }
  return Array.from(map.values());
}

function groupStatus(group) {
  if (group.some(a => a.status === 'pending')) return 'pending';
  if (group.some(a => a.status === 'accepted')) return 'accepted';
  return 'declined';
}

function pickPreferredAssignmentStatus(currentValue, nextValue) {
  const normalize = v => String(v || '').trim().toLowerCase();
  const rank = { '': 0, pending: 1, accepted: 2, declined: 2 };
  const current = normalize(currentValue);
  const next = normalize(nextValue);
  const cr = rank[current] ?? 0;
  const nr = rank[next] ?? 0;
  if (nr > cr) return next;
  if (cr > nr) return current;
  if (next && next !== current && next !== 'pending') return next;
  return current || next || 'pending';
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

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(String(dateStr).includes('T') ? dateStr : dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  const parts = String(timeStr).match(/(\d{1,2}):(\d{2})/);
  if (!parts) return timeStr;
  const hour = parseInt(parts[1], 10);
  const min = parts[2];
  const ampm = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${min} ${ampm}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    accepted: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
    declined: 'bg-red-500/20 text-red-400 border border-red-500/30',
    pending: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
  };
  const label = status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Pending';
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${map[status] || map.pending}`}>
      {label}
    </span>
  );
}

function LoadingDots() {
  return (
    <span className="inline-flex gap-1 items-center">
      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }} />
      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }} />
      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }} />
    </span>
  );
}

// ── Monthly Stats Modal ───────────────────────────────────────────────────────
function MonthlyStatsModal({ stats, onClose }) {
  const monthKey = getMonthKey(new Date());
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/75">
      <div className="w-full max-w-sm bg-[#1a1a2e] border border-indigo-600/40 rounded-2xl p-6 shadow-2xl">
        <div className="flex flex-col items-center mb-4">
          <span className="text-3xl mb-2">📊</span>
          <h2 className="text-lg font-bold text-indigo-100">Monthly Stats</h2>
          <p className="text-indigo-400 text-xs font-semibold mt-1">{monthKey}</p>
        </div>
        <hr className="border-indigo-900/60 mb-4" />
        <div className="space-y-3 mb-5">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-indigo-400">{stats.servicesCompleted}</span>
            <span className="text-indigo-200 text-sm">service{stats.servicesCompleted !== 1 ? 's' : ''} completed</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-indigo-400">{stats.totalPracticeHours}</span>
            <span className="text-indigo-200 text-sm">hours practiced</span>
          </div>
          {stats.roleLabels.length > 0 && (
            <div>
              <p className="text-indigo-500 text-[11px] font-bold uppercase tracking-wider mb-1">Roles this month</p>
              <p className="text-indigo-300 text-sm font-semibold">{stats.roleLabels.join('  ·  ')}</p>
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-colors"
        >
          See you next month 🙌
        </button>
      </div>
    </div>
  );
}

// ── Service Command Center (MD/Admin/Leader) ──────────────────────────────────
function ServiceCommandCenter({ nextGroup, navigate }) {
  const first = nextGroup?.[0];
  return (
    <div className="p-5 rounded-2xl bg-gradient-to-br from-violet-900/30 to-indigo-900/20 border border-violet-500/30">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">🎛</span>
        <h3 className="text-white font-bold text-base">Service Command Center</h3>
      </div>
      {first ? (
        <div className="space-y-2 mb-4">
          <p className="text-slate-300 text-sm">
            Next service: <span className="text-white font-semibold">{formatDate(first.service_date || first.date)}</span>
            {(first.service_time || first.time) && (
              <span className="text-slate-400"> at {formatTime(first.service_time || first.time)}</span>
            )}
          </p>
          <p className="text-slate-400 text-xs">
            {first.service_name || first.org_name || 'Service'}
          </p>
        </div>
      ) : (
        <p className="text-slate-500 text-sm mb-4">No upcoming services scheduled.</p>
      )}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => navigate('/setlist')}
          className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-colors"
        >
          View Setlist
        </button>
        <button
          onClick={() => navigate('/messages')}
          className="px-4 py-2 rounded-lg bg-[#1e293b] hover:bg-[#293548] border border-[#334155] text-slate-300 text-xs font-semibold transition-colors"
        >
          Broadcast to Team
        </button>
        <button
          onClick={() => navigate('/assignments')}
          className="px-4 py-2 rounded-lg bg-[#1e293b] hover:bg-[#293548] border border-[#334155] text-slate-300 text-xs font-semibold transition-colors"
        >
          Team Readiness
        </button>
      </div>
    </div>
  );
}

// ── Preparation Hub (regular members) ────────────────────────────────────────
function PreparationHub({ nextGroup, navigate }) {
  const first = nextGroup?.[0];
  const checklist = [
    { label: 'Review setlist', done: false, action: () => navigate('/setlist') },
    { label: 'Practice songs', done: false, action: () => navigate('/practice') },
    { label: 'Respond to assignments', done: false, action: () => navigate('/assignments') },
  ];
  return (
    <div className="p-5 rounded-2xl bg-gradient-to-br from-teal-900/20 to-cyan-900/10 border border-teal-500/20">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">📋</span>
        <h3 className="text-white font-bold text-base">Preparation Hub</h3>
      </div>
      {first ? (
        <p className="text-slate-400 text-xs mb-3">
          Next: <span className="text-teal-400 font-semibold">{formatDate(first.service_date || first.date)}</span>
          {(first.service_name || first.org_name) && (
            <span className="text-slate-500"> · {first.service_name || first.org_name}</span>
          )}
        </p>
      ) : (
        <p className="text-slate-500 text-xs mb-3">No upcoming services — stay ready!</p>
      )}
      <div className="space-y-2">
        {checklist.map((item, i) => (
          <button
            key={i}
            onClick={item.action}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-[#0f172a]/60 border border-teal-500/10 hover:border-teal-500/30 transition-colors text-left"
          >
            <span className="w-4 h-4 rounded border border-teal-600/40 flex-shrink-0" />
            <span className="text-slate-300 text-xs font-medium">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main HomeScreen ───────────────────────────────────────────────────────────
export default function HomeScreen() {
  const navigate = useNavigate();
  const { user, profile, setProfile } = useAuth();

  // ── State ────────────────────────────────────────────────────────────────
  const [assignments, setAssignments] = useState([]);
  const [upcomingServices, setUpcomingServices] = useState([]); // array of groups
  const [grantedRole, setGrantedRole] = useState(profile?.grantedRole || null);
  const [isOffline, setIsOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [messageBadge, setMessageBadge] = useState(0);
  const [liveVisible, setLiveVisible] = useState(false);
  const [liveTitle, setLiveTitle] = useState('');
  const [showMonthlyModal, setShowMonthlyModal] = useState(false);
  const [monthlyStats, setMonthlyStats] = useState({ servicesCompleted: 0, totalPracticeHours: 0, roleLabels: [] });
  const [practiceStats, setPracticeStats] = useState(null);
  const [deadlineDismissed, setDeadlineDismissed] = useState(false);
  const { status: brainConnStatus, capabilities: brainCaps, openPanel } = useBrain();

  // Verse + reading plan — compute synchronously on first render
  const _initDate = new Date();
  const { verse: _initVerse, theme: _initTheme } = getVerseByDay(_initDate);
  const _initPlan = getDailyReadingPlan(_initDate);
  const [verseOfDay, setVerseOfDay] = useState(_initVerse);
  const [seasonTheme, setSeasonTheme] = useState(_initTheme);
  const [readingPlan, setReadingPlan] = useState(_initPlan);

  // Refs for polling cleanup
  const triggerIntervalRef = useRef(null);
  const msgIntervalRef = useRef(null);
  const liveBannerTimerRef = useRef(null);
  const liveBannerShown = useRef(false);
  const lastTriggerTsRef = useRef(null);
  const lastMsgTsRef = useRef(null);
  const msgInitialized = useRef(false);

  // ── Derived user info ─────────────────────────────────────────────────────
  const email = user?.email || profile?.email || '';
  const firstName = profile?.firstName || profile?.first_name || profile?.name?.split(' ')[0] || 'Musician';
  const fullName = profile?.name || profile?.displayName || '';
  const photoUrl = profile?.photo_url || profile?.photo || profile?.avatar || profile?.image || '';

  const isAdminOrMD = grantedRole === 'admin' || grantedRole === 'md' || grantedRole === 'manager' ||
    grantedRole === 'org_owner' || grantedRole === 'owner' || grantedRole === 'worship_leader';
  const isLeaderRole = grantedRole === 'leader';
  const showCommandCenter = isAdminOrMD;
  const showLeaderLink = isLeaderRole;
  const showAdminLink = isAdminOrMD;

  // ── Urgency: pending within 3 days ───────────────────────────────────────
  const urgentAssignments = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const threeDaysOut = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000);
    return assignments.filter(a => {
      if (a.status !== 'pending') return false;
      if (!a.service_date) return false;
      const svc = new Date(String(a.service_date).includes('T') ? a.service_date : a.service_date + 'T00:00:00');
      svc.setHours(0, 0, 0, 0);
      return svc >= today && svc <= threeDaysOut;
    });
  }, [assignments]);

  const urgentBannerLabel = useMemo(() => {
    if (urgentAssignments.length === 0) return null;
    const sorted = [...urgentAssignments].sort((a, b) => {
      const da = new Date(String(a.service_date).includes('T') ? a.service_date : a.service_date + 'T00:00:00');
      const db = new Date(String(b.service_date).includes('T') ? b.service_date : b.service_date + 'T00:00:00');
      return da - db;
    });
    const earliest = sorted[0];
    const svc = new Date(String(earliest.service_date).includes('T') ? earliest.service_date : earliest.service_date + 'T00:00:00');
    svc.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.round((svc - today) / (24 * 60 * 60 * 1000));
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = dayNames[svc.getDay()];
    const count = urgentAssignments.length;
    const countLabel = count === 1 ? '1 assignment needs' : `${count} assignments need`;
    const daysLabel = diffDays === 0 ? 'today' : diffDays === 1 ? '1 day away' : `${diffDays} days away`;
    return `${countLabel} your response — ${dayName} (${daysLabel})`;
  }, [urgentAssignments]);

  // ── Stat counts ───────────────────────────────────────────────────────────
  const activeAssignments = assignments.filter(a => !isPastService(a.service_date));
  const serviceGroups = groupByService(activeAssignments);
  const pendingCount = serviceGroups.filter(g => groupStatus(g) === 'pending').length;
  const acceptedCount = serviceGroups.filter(g => groupStatus(g) === 'accepted').length;

  // ── Live status check ─────────────────────────────────────────────────────
  const checkLiveStatus = useCallback(async () => {
    try {
      const res = await fetch(`${SYNC_URL}/sync/live-status`, { headers: syncHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.isLive && !liveBannerShown.current) {
        liveBannerShown.current = true;
        setLiveTitle(data.title || 'Service');
        setLiveVisible(true);
        clearTimeout(liveBannerTimerRef.current);
        liveBannerTimerRef.current = setTimeout(() => {
          setLiveVisible(false);
          liveBannerShown.current = false;
        }, 8000);
      } else if (!data?.isLive) {
        liveBannerShown.current = false;
      }
    } catch (_) {}
  }, []);

  // ── Main data load ────────────────────────────────────────────────────────
  const loadDashboardData = useCallback(async () => {
    if (!email) return;

    // Update verse + reading plan for today
    const now = new Date();
    const { verse, theme } = getVerseByDay(now);
    const plan = getDailyReadingPlan(now);
    setVerseOfDay(verse);
    setSeasonTheme(theme);
    setReadingPlan(plan);

    // ── Assignments sync ──────────────────────────────────────────────────
    let localAssignments = [];
    try {
      const stored = await store.getAssignments();
      if (Array.isArray(stored)) localAssignments = stored;
    } catch (_) {}

    try {
      const assignUrl = `${SYNC_URL}/sync/assignments?email=${encodeURIComponent(email)}&name=${encodeURIComponent(fullName)}`;
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 5000);
      let res;
      try {
        res = await fetch(assignUrl, { headers: syncHeaders(), signal: ctrl.signal });
      } finally {
        clearTimeout(tid);
      }
      if (res.ok) {
        const remote = await res.json();
        const remoteList = Array.isArray(remote) ? remote : (remote.assignments || []);
        if (remoteList.length > 0) {
          const localMap = Object.fromEntries(localAssignments.map(a => [a.id, a]));
          const merged = dedupAssignments(remoteList.map(r =>
            localMap[r.id]
              ? { ...r, status: pickPreferredAssignmentStatus(localMap[r.id].status, r.status) }
              : r
          ));
          localAssignments = merged;
          await store.setAssignments(merged);
        }
        setIsOffline(false);
      }
    } catch (_) {
      // Fall back to cache
      const cached = await store.getAssignments().catch(() => null);
      if (Array.isArray(cached) && cached.length > 0) {
        localAssignments = cached;
        setIsOffline(true);
      } else {
        setIsOffline(true);
      }
    }

    // ── Role check ────────────────────────────────────────────────────────
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 4000);
      let roleRes;
      try {
        roleRes = await fetch(`${SYNC_URL}/sync/role?email=${encodeURIComponent(email)}`, {
          headers: syncHeaders(),
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(tid);
      }
      if (roleRes?.ok) {
        const data = await roleRes.json();
        const role = data.grantedRole || null;
        setGrantedRole(role);
        if (role && profile?.grantedRole !== role) {
          // Persist to AuthContext (which persists to store)
          setProfile({ ...(profile || {}), grantedRole: role });
        }
      }
    } catch (_) {}

    // ── Filter + group for display ─────────────────────────────────────────
    const nowMs = Date.now();
    const dashboardAssignments = localAssignments.filter(a => !isSetlistExpired(a, nowMs));
    setAssignments(dashboardAssignments);

    const upcomingRaw = dashboardAssignments
      .filter(a => a.status !== 'declined')
      .filter(a => {
        const d = new Date(String(a.service_date || '').includes('T') ? a.service_date : (a.service_date || '') + 'T00:00:00');
        return d >= new Date(new Date().setHours(0, 0, 0, 0));
      });
    const conflictResolved = resolveTimeConflicts(upcomingRaw);
    const grouped = groupByService(conflictResolved)
      .sort((g1, g2) => new Date(g1[0].service_date) - new Date(g2[0].service_date));
    setUpcomingServices(grouped);

    // ── Heartbeat for next upcoming service ───────────────────────────────
    if (grouped.length > 0) {
      const nextSvc = grouped[0][0];
      const serviceId = nextSvc?.service_id || nextSvc?.id;
      if (serviceId) {
        fetch(`${SYNC_URL}/sync/heartbeat`, {
          method: 'POST',
          headers: syncHeaders(),
          body: JSON.stringify({ email, name: fullName, serviceId }),
        }).catch(() => {});
      }
    }

    // ── Monthly stats ─────────────────────────────────────────────────────
    const nowDate = new Date();
    const currentYear = nowDate.getFullYear();
    const currentMonth = nowDate.getMonth();
    const monthlyAssigns = localAssignments.filter(a => {
      const candidates = [a.assigned_at, a.created_at, a.service_date, a.date];
      for (const c of candidates) {
        if (!c) continue;
        const ms = new Date(c).getTime();
        if (Number.isFinite(ms)) {
          const dt = new Date(ms);
          return dt.getFullYear() === currentYear && dt.getMonth() === currentMonth && isPastService(a.service_date);
        }
      }
      return false;
    });
    const roleSet = new Set(monthlyAssigns.map(a => a.role).filter(Boolean));

    // Practice hours this month
    let totalPracticeHours = 0;
    try {
      const history = await store.get('practice_history');
      if (Array.isArray(history)) {
        const weekAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const thisWeek = history.filter(e => new Date(e.date || e.practiceDate || 0).getTime() >= weekAgoMs);
        if (thisWeek.length > 0) {
          const titleCounts = {};
          let totalMs = 0;
          thisWeek.forEach(e => {
            totalMs += e.durationMs || (e.minutes || 0) * 60000;
            const key = e.title || e.song || e.songId;
            if (key) titleCounts[key] = (titleCounts[key] || 0) + 1;
          });
          const mostPracticedSong = Object.entries(titleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
          setPracticeStats({
            sessionCount: thisWeek.length,
            totalMinutes: Math.round(totalMs / 60000),
            mostPracticedSong,
          });
          totalPracticeHours = Math.round(totalMs / 3600000);
        } else {
          setPracticeStats(null);
        }
      }
    } catch (_) {}

    const stats = {
      servicesCompleted: groupByService(monthlyAssigns).length,
      totalPracticeHours,
      roleLabels: Array.from(roleSet),
    };
    setMonthlyStats(stats);

    // Show monthly modal on last day only, once per month
    if (isLastDayOfMonth(nowDate)) {
      const currentMK = getMonthKey(nowDate);
      const seenMonth = await store.get(MONTHLY_POPUP_SEEN_KEY).catch(() => null);
      if (seenMonth !== currentMK) {
        setShowMonthlyModal(true);
        await store.set(MONTHLY_POPUP_SEEN_KEY, currentMK).catch(() => {});
      }
    }

    setLoading(false);
  }, [email, fullName, profile, setProfile]);

  // ── On mount: load data + live check + restore trigger ts ────────────────
  useEffect(() => {
    loadDashboardData();
    checkLiveStatus();

    // Restore last trigger ts so reload doesn't re-navigate
    store.get(LAST_TRIGGER_TS_KEY).then(ts => {
      if (ts) lastTriggerTsRef.current = ts;
    }).catch(() => {});

    return () => {
      clearTimeout(liveBannerTimerRef.current);
    };
  }, [loadDashboardData, checkLiveStatus]);

  // ── Playback trigger polling every 4 seconds ──────────────────────────────
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`${SYNC_URL}/sync/playback-trigger`, { headers: syncHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        if (!data?.serviceId || !data?.timestamp) return;
        if (data.timestamp === lastTriggerTsRef.current) return;
        lastTriggerTsRef.current = data.timestamp;
        store.set(LAST_TRIGGER_TS_KEY, data.timestamp).catch(() => {});
        navigate('/setlist-runner', { state: { serviceId: data.serviceId } });
      } catch (_) {}
    };
    triggerIntervalRef.current = setInterval(poll, 4000);
    return () => clearInterval(triggerIntervalRef.current);
  }, [navigate]);

  // ── Message polling every 8 seconds ──────────────────────────────────────
  useEffect(() => {
    if (!email) return;
    const poll = async () => {
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 5000);
        let res;
        try {
          res = await fetch(
            `${SYNC_URL}/sync/messages/replies?email=${encodeURIComponent(email)}`,
            { headers: syncHeaders(), signal: ctrl.signal }
          );
        } finally {
          clearTimeout(tid);
        }
        if (!res.ok) return;
        const msgs = await res.json();
        const list = Array.isArray(msgs) ? msgs : (msgs.replies || []);
        if (list.length === 0) { msgInitialized.current = true; return; }
        const latestTs = list[0]?.timestamp || list[0]?.id;
        if (!msgInitialized.current) {
          lastMsgTsRef.current = latestTs;
          msgInitialized.current = true;
          const unread = list.filter(m => !m.read).length;
          setMessageBadge(unread);
          return;
        }
        const unread = list.filter(m => !m.read).length;
        setMessageBadge(unread);
        lastMsgTsRef.current = latestTs;
      } catch (_) { msgInitialized.current = true; }
    };
    poll();
    msgIntervalRef.current = setInterval(poll, 8000);
    return () => clearInterval(msgIntervalRef.current);
  }, [email]);

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-[#020617]">
        <div className="text-center space-y-3">
          <LoadingDots />
          <p className="text-slate-400 text-sm">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  // ── Upcoming: next 3, show "View Setlist" & "Practice" ───────────────────
  const upcomingDisplay = upcomingServices.slice(0, 3);

  return (
    <div className="relative min-h-full bg-[#020617] overflow-x-hidden">
      {/* Background orbs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-indigo-600/15 blur-3xl" />
        <div className="absolute bottom-0 -left-24 w-72 h-72 rounded-full bg-sky-600/10 blur-3xl" />
        <div className="absolute top-1/2 left-1/4 w-48 h-48 rounded-full bg-violet-600/10 blur-3xl" />
      </div>

      {/* Monthly Stats Modal */}
      {showMonthlyModal && (
        <MonthlyStatsModal stats={monthlyStats} onClose={() => setShowMonthlyModal(false)} />
      )}

      <div className="relative z-10 max-w-5xl mx-auto space-y-6">

        {/* ── Offline banner ─────────────────────────────────────────── */}
        {isOffline && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-900/40 border border-amber-600/30 rounded-xl">
            <span className="text-amber-400 text-sm">📡</span>
            <p className="text-amber-300 text-xs font-semibold">Offline — using cached data</p>
          </div>
        )}

        {/* ── Live banner ────────────────────────────────────────────── */}
        {liveVisible && (
          <button
            onClick={() => navigate('/live-performance')}
            className="w-full flex items-center justify-between px-5 py-3.5 rounded-xl bg-emerald-900/40 border border-emerald-500/40 hover:bg-emerald-900/60 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
              </span>
              <span className="text-emerald-300 font-bold tracking-wide">
                🔴 WE'RE LIVE — {liveTitle}
              </span>
            </div>
            <span className="text-emerald-400 font-bold text-sm">Join Now →</span>
          </button>
        )}

        {/* ── Urgency banner ─────────────────────────────────────────── */}
        {urgentAssignments.length > 0 && !deadlineDismissed && urgentBannerLabel && (
          <div className="flex items-start gap-3 px-4 py-3 bg-amber-900/30 border border-amber-600/30 rounded-xl">
            <span className="text-amber-400 text-base mt-0.5">⏰</span>
            <div className="flex-1 min-w-0">
              <p className="text-amber-200 text-sm font-semibold leading-snug">{urgentBannerLabel}</p>
              <button
                onClick={() => navigate('/assignments')}
                className="mt-2 inline-flex items-center px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-black text-xs font-black transition-colors"
              >
                Respond Now →
              </button>
            </div>
            <button
              onClick={() => setDeadlineDismissed(true)}
              className="text-amber-500 hover:text-amber-300 text-lg leading-none font-bold flex-shrink-0"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        )}

        {/* ── Header: greeting + avatar ──────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              {getGreeting()}, {firstName}
            </h1>
            <p className="text-slate-400 text-sm mt-0.5">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {/* Messages button with badge */}
            <button
              onClick={() => navigate('/messages')}
              className="relative p-2 rounded-lg bg-[#0f172a] border border-[#1e293b] text-slate-300 hover:text-white hover:border-indigo-500/50 transition-colors"
              aria-label="Messages"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              {messageBadge > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-indigo-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center">
                  {messageBadge > 9 ? '9+' : messageBadge}
                </span>
              )}
            </button>
            {/* Profile avatar */}
            <button
              onClick={() => navigate('/profile')}
              className="w-10 h-10 rounded-full border-2 border-indigo-500/60 overflow-hidden bg-[#1e293b] flex items-center justify-center hover:border-indigo-400 transition-colors flex-shrink-0"
              aria-label="Profile"
            >
              {photoUrl ? (
                <img src={photoUrl} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-white font-bold text-base">
                  {firstName ? firstName.charAt(0).toUpperCase() : '👤'}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* ── Stats row ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => navigate('/assignments')}
            className="flex flex-col items-center py-4 px-2 rounded-xl bg-[#0b1120] border border-[#374151] hover:border-indigo-500/40 transition-colors"
          >
            <span className="text-3xl font-bold text-indigo-500">{pendingCount}</span>
            <span className="text-xs text-slate-400 uppercase tracking-wide mt-1">Pending</span>
          </button>
          <button
            onClick={() => navigate('/assignments')}
            className="flex flex-col items-center py-4 px-2 rounded-xl bg-[#0b1120] border border-[#374151] hover:border-emerald-500/40 transition-colors"
          >
            <span className="text-3xl font-bold text-emerald-500">{acceptedCount}</span>
            <span className="text-xs text-slate-400 uppercase tracking-wide mt-1">Accepted</span>
          </button>
          <button
            onClick={() => navigate('/profile')}
            className="flex flex-col items-center py-4 px-2 rounded-xl bg-[#0b1120] border border-[#374151] hover:border-violet-500/40 transition-colors"
          >
            <span className="text-3xl font-bold text-violet-500">
              {Array.isArray(profile?.roles) ? profile.roles.length : 0}
            </span>
            <span className="text-xs text-slate-400 uppercase tracking-wide mt-1">Roles</span>
          </button>
        </div>

        {/* ── Quick Actions ───────────────────────────────────────────── */}
        <section>
          <h2 className="text-white font-semibold text-sm uppercase tracking-wider mb-3 opacity-60">Quick Actions</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Setlist', icon: '📋', path: '/setlist', color: 'from-indigo-600/20 to-indigo-600/5' },
              { label: 'Assignments', icon: '📬', path: '/assignments', color: 'from-teal-600/20 to-teal-600/5', badge: pendingCount },
              { label: 'Messages', icon: '💬', path: '/messages', color: 'from-blue-600/20 to-blue-600/5', badge: messageBadge },
              { label: 'Practice', icon: '🎧', path: '/practice', color: 'from-purple-600/20 to-purple-600/5' },
            ].map(action => (
              <button
                key={action.path}
                onClick={() => navigate(action.path)}
                className={`relative flex flex-col items-start gap-2 p-4 rounded-xl bg-gradient-to-br ${action.color} border border-[#1e293b] hover:border-indigo-500/40 transition-all hover:scale-[1.02] active:scale-[0.98]`}
              >
                <span className="text-2xl">{action.icon}</span>
                <span className="text-slate-200 font-semibold text-sm">{action.label}</span>
                {action.badge > 0 && (
                  <span className="absolute top-3 right-3 w-5 h-5 bg-indigo-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center">
                    {action.badge > 9 ? '9+' : action.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>

        {/* ── Admin / Leader quick links ──────────────────────────────── */}
        {(showAdminLink || showLeaderLink) && (
          <div className="flex flex-wrap gap-3">
            {showAdminLink && (
              <button
                onClick={() => navigate('/admin')}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-900/30 to-rose-900/10 border border-rose-600/30 hover:border-rose-500/50 transition-colors"
              >
                <span>🔐</span>
                <span className="text-rose-300 font-semibold text-sm">Admin Dashboard</span>
              </button>
            )}
            {showLeaderLink && (
              <button
                onClick={() => navigate('/leader')}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-900/30 to-violet-900/10 border border-violet-600/30 hover:border-violet-500/50 transition-colors"
              >
                <span>👑</span>
                <span className="text-violet-300 font-semibold text-sm">Leader Dashboard</span>
              </button>
            )}
          </div>
        )}

        {/* ── Upcoming Services ───────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white font-semibold text-base">Upcoming Services</h2>
            <button onClick={() => navigate('/assignments')} className="text-indigo-400 text-xs hover:text-indigo-300 transition-colors">
              View all
            </button>
          </div>
          {upcomingDisplay.length === 0 ? (
            <div className="p-6 rounded-xl bg-[#0f172a] border border-[#1e293b] text-center text-slate-500 text-sm">
              No upcoming services
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingDisplay.map((group, i) => {
                const first = group[0];
                const roles = [...new Set(group.map(a => a.role).filter(Boolean))];
                const status = groupStatus(group);
                const dateStr = first.service_date || first.date || '';
                const timeStr = first.service_time || first.time || '';
                const location = first.location || first.venue || first.branch_city || '';
                const orgName = first.org_name || first.organization_name || first.church_name || '';
                return (
                  <div
                    key={first.service_id || first.id || i}
                    className="p-4 rounded-xl bg-[#0f172a] border border-[#1e293b] hover:border-indigo-500/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="space-y-0.5">
                        <p className="text-white font-medium text-sm">
                          {formatDate(dateStr)}
                          {timeStr && (
                            <span className="text-slate-400 font-normal ml-2">{formatTime(timeStr)}</span>
                          )}
                        </p>
                        {orgName && (
                          <p className="text-indigo-400/80 text-xs">🏛 {orgName}{location ? ` — ${location}` : ''}</p>
                        )}
                        {!orgName && location && (
                          <p className="text-slate-400 text-xs">{location}</p>
                        )}
                        {roles.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {roles.map((r, ri) => (
                              <span key={ri} className="px-2 py-0.5 rounded-md bg-indigo-500/15 border border-indigo-500/25 text-indigo-300 text-[11px] font-semibold">
                                {r}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <StatusBadge status={status} />
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => navigate('/setlist', { state: { serviceId: first.service_id || first.id } })}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600/80 hover:bg-indigo-600 text-white text-xs font-semibold transition-colors"
                      >
                        View Setlist
                      </button>
                      <button
                        onClick={() => navigate('/practice')}
                        className="px-3 py-1.5 rounded-lg bg-[#1e293b] hover:bg-[#293548] border border-[#334155] text-slate-300 text-xs font-semibold transition-colors"
                      >
                        Practice
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Service Command Center / Preparation Hub ────────────────── */}
        {showCommandCenter ? (
          <ServiceCommandCenter nextGroup={upcomingServices[0] || null} navigate={navigate} />
        ) : (
          <PreparationHub nextGroup={upcomingServices[0] || null} navigate={navigate} />
        )}

        {/* ── Practice Stats ──────────────────────────────────────────── */}
        {practiceStats && (
          <div className="p-4 rounded-xl bg-[#0f172a] border border-[#1e3a5f]">
            <h3 className="text-sky-400 text-xs font-bold uppercase tracking-wider mb-2">This Week's Practice</h3>
            <p className="text-sky-200 text-sm font-semibold">
              🎵 {practiceStats.sessionCount} session{practiceStats.sessionCount !== 1 ? 's' : ''} · {practiceStats.totalMinutes} min
            </p>
            {practiceStats.mostPracticedSong && (
              <p className="text-slate-500 text-xs mt-1">
                Most practiced: <span className="text-slate-400">{practiceStats.mostPracticedSong}</span>
              </p>
            )}
            <button
              onClick={() => navigate('/practice')}
              className="mt-2 text-xs text-sky-400 hover:text-sky-300 transition-colors"
            >
              Start a session →
            </button>
          </div>
        )}

        {/* ── CineStage Brain ─────────────────────────────────────────── */}
        {brainConnStatus !== 'offline' && (
          <div className="flex gap-2">
            <button
              onClick={() => navigate('/cinestage')}
              className="flex-1 p-5 rounded-xl bg-[#0b1120] border border-indigo-600/30 hover:border-indigo-500/50 transition-colors text-left"
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">🧠</span>
                <div>
                  <p className="text-white font-bold text-sm">CineStage Brain {brainConnStatus === 'online' ? 'Online' : 'Connecting'}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`w-2 h-2 rounded-full ${brainConnStatus === 'online' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-pulse'}`} />
                    <span className={`text-xs font-bold ${brainConnStatus === 'online' ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {brainConnStatus === 'online' ? 'Connected to CineStage Cloud' : 'Connecting to CineStage Cloud...'}
                    </span>
                  </div>
                </div>
              </div>
              <p className="text-slate-400 text-xs">
                {brainCaps.length > 0 ? `${brainCaps.length} capabilities` : 'AI intelligence layer'} · Click to open
              </p>
            </button>
            <button
              onClick={() => openPanel()}
              className="px-4 rounded-xl bg-indigo-600/20 border border-indigo-600/30 hover:bg-indigo-600/30 transition-colors flex items-center justify-center"
              title="Open Brain panel"
            >
              <span className="text-xl">💬</span>
            </button>
          </div>
        )}

        {/* ── Verse + Reading Plan ────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Verse of the Day */}
          <div className="p-5 rounded-xl bg-[#172554]/60 border border-blue-600/30 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <span className="text-blue-200 text-xs font-bold uppercase tracking-wider">Verse of the Day</span>
              <span className="px-2 py-0.5 rounded-full bg-blue-900/60 border border-blue-700/40 text-blue-300 text-[10px] font-semibold">
                {seasonTheme.label}
              </span>
            </div>
            <blockquote className="text-slate-100 text-sm leading-relaxed italic flex-1">
              "{verseOfDay.text}"
            </blockquote>
            <p className="text-blue-400 text-xs font-semibold mt-3">— {verseOfDay.ref}</p>
          </div>

          {/* Daily Reading Plan */}
          <div className="p-5 rounded-xl bg-[#0f172a] border border-[#1e293b] flex flex-col">
            <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-3">
              📖 Daily Reading — Day {readingPlan.day} of 365
            </h3>
            <div className="space-y-1.5 flex-1">
              <p className="text-slate-300 text-sm">
                <span className="text-slate-500 text-xs font-semibold mr-2">OT</span>
                {readingPlan.ot}
              </p>
              <p className="text-slate-300 text-sm">
                <span className="text-slate-500 text-xs font-semibold mr-2">NT</span>
                {readingPlan.nt}
              </p>
              <p className="text-slate-400 text-sm mt-2">{readingPlan.wisdom}</p>
            </div>
          </div>
        </div>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <div className="text-center pb-8 pt-2">
          <p className="text-slate-600 text-xs">Ultimate DAW · Desktop Dashboard</p>
        </div>
      </div>
    </div>
  );
}
