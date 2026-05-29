import React, { useState, useEffect, useCallback } from 'react';
import { SYNC_URL, syncHeaders } from '../config/syncConfig';
import { store } from '../services/store';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function toDateString(year, month, day) {
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

function todayString() {
  const n = new Date();
  return toDateString(n.getFullYear(), n.getMonth(), n.getDate());
}

function CalendarGrid({ year, month, blockedDates, onToggle }) {
  const today = todayString();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

  return (
    <div>
      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-slate-500 py-2">
            {d}
          </div>
        ))}
      </div>
      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: totalCells }, (_, i) => {
          const dayNum = i - firstDay + 1;
          const isValid = dayNum >= 1 && dayNum <= daysInMonth;
          if (!isValid) {
            return <div key={i} className="h-10" />;
          }
          const dateStr = toDateString(year, month, dayNum);
          const isToday = dateStr === today;
          const isBlocked = blockedDates.includes(dateStr);

          let cellClass = 'h-10 w-full rounded-lg text-sm font-medium transition-all cursor-pointer flex items-center justify-center ';

          if (isBlocked) {
            cellClass += 'bg-red-500/30 border border-red-500/40 text-red-300 hover:bg-red-500/40';
          } else if (isToday) {
            cellClass += 'bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 hover:bg-indigo-600/40';
          } else {
            cellClass += 'bg-[#0f172a] border border-transparent text-slate-300 hover:bg-[#1e293b] hover:border-[#1e293b]';
          }

          return (
            <button
              key={i}
              onClick={() => onToggle(dateStr)}
              className={cellClass}
            >
              {dayNum}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function BlockoutCalendarScreen() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [blockedDates, setBlockedDates] = useState([]);
  const [originalDates, setOriginalDates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // ── Load blockouts ───────────────────────────────────────────────────────
  const loadBlockouts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Load from store first
      const stored = await store.get('blockout_dates');
      if (stored && Array.isArray(stored)) {
        setBlockedDates(stored);
        setOriginalDates(stored);
        setLoading(false);
      }

      // Sync from server
      const res = await fetch(`${SYNC_URL}/sync/blockouts`, { headers: syncHeaders() });
      if (res.ok) {
        const data = await res.json();
        const raw = Array.isArray(data) ? data : (data.dates || data.blockouts || []);
        const dates = raw
          .map(d => (typeof d === 'string' ? d : (d?.date || d?.dateString || '')))
          .filter(s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s));
        setBlockedDates(dates);
        setOriginalDates(dates);
        await store.set('blockout_dates', dates);
      }
    } catch (err) {
      setError(`Failed to load blockouts: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBlockouts();
  }, [loadBlockouts]);

  // ── Track unsaved changes ───────────────────────────────────────────────
  useEffect(() => {
    const orig = [...originalDates].sort().join(',');
    const curr = [...blockedDates].sort().join(',');
    setHasChanges(orig !== curr);
  }, [blockedDates, originalDates]);

  // ── Toggle date ─────────────────────────────────────────────────────────
  function toggleDate(dateStr) {
    setBlockedDates((prev) =>
      prev.includes(dateStr) ? prev.filter((d) => d !== dateStr) : [...prev, dateStr].sort()
    );
    setSuccess(false);
  }

  // ── Save blockouts ──────────────────────────────────────────────────────
  async function handleSave() {
    try {
      setSaving(true);
      setError(null);
      setSuccess(false);

      const res = await fetch(`${SYNC_URL}/sync/blockouts`, {
        method: 'POST',
        headers: syncHeaders(),
        body: JSON.stringify({ dates: blockedDates }),
      });

      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { const b = await res.json(); msg = b.message || b.error || msg; } catch { /* ignore */ }
        throw new Error(msg);
      }

      await store.set('blockout_dates', blockedDates);
      setOriginalDates([...blockedDates]);
      setSuccess(true);
      setHasChanges(false);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // ── Navigation ──────────────────────────────────────────────────────────
  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  }

  // ── Dates in current view ───────────────────────────────────────────────
  const monthPrefix = toDateString(year, month, 1).slice(0, 7);
  const blockedThisMonth = blockedDates.filter((d) => d.startsWith(monthPrefix)).sort();
  const allBlockedSorted = [...blockedDates].sort();

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#020617] p-6 space-y-5">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Blockout Dates</h1>
          <p className="text-slate-400 text-sm mt-0.5">Mark dates when you are unavailable for services</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm transition-all ${
            hasChanges
              ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
              : 'bg-[#0f172a] border border-[#1e293b] text-slate-500 cursor-not-allowed'
          } disabled:opacity-60`}
        >
          {saving ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              Save Blockouts
            </>
          )}
        </button>
      </div>

      {/* ── Alerts ──────────────────────────────────────────────────────── */}
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={loadBlockouts} className="text-xs underline hover:no-underline">Retry</button>
        </div>
      )}
      {success && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
          Blockout dates saved successfully.
        </div>
      )}
      {hasChanges && !error && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm">
          You have unsaved changes. Click "Save Blockouts" to sync with the server.
        </div>
      )}

      {/* ── Calendar card ───────────────────────────────────────────────── */}
      <div className="rounded-xl bg-[#0f172a] border border-[#1e293b] overflow-hidden">
        {/* Month navigation */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e293b]">
          <button
            onClick={prevMonth}
            className="w-9 h-9 rounded-lg bg-[#1e293b] hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 className="text-white font-semibold">
            {MONTHS[month]} {year}
          </h2>
          <button
            onClick={nextMonth}
            className="w-9 h-9 rounded-lg bg-[#1e293b] hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Calendar grid */}
        <div className="p-5">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="text-center space-y-3">
                <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-slate-400 text-sm">Loading...</p>
              </div>
            </div>
          ) : (
            <CalendarGrid
              year={year}
              month={month}
              blockedDates={blockedDates}
              onToggle={toggleDate}
            />
          )}
        </div>

        {/* Legend */}
        <div className="px-5 pb-4 flex items-center gap-5">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-indigo-600/30 border border-indigo-500/40" />
            <span className="text-xs text-slate-500">Today</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-red-500/30 border border-red-500/40" />
            <span className="text-xs text-slate-500">Blocked</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-[#0f172a] border border-[#1e293b]" />
            <span className="text-xs text-slate-500">Available</span>
          </div>
        </div>
      </div>

      {/* ── This month's blocked dates ───────────────────────────────────── */}
      {blockedThisMonth.length > 0 && (
        <div className="p-5 rounded-xl bg-[#0f172a] border border-[#1e293b] space-y-3">
          <h3 className="text-white font-semibold text-sm">
            Blocked in {MONTHS[month]} ({blockedThisMonth.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {blockedThisMonth.map((d) => {
              const date = new Date(d + 'T00:00:00');
              return (
                <div
                  key={d}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20"
                >
                  <span className="text-red-300 text-sm">
                    {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                  <button
                    onClick={() => toggleDate(d)}
                    className="text-red-500 hover:text-red-300 transition-colors"
                    aria-label="Remove"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── All blocked dates ────────────────────────────────────────────── */}
      {allBlockedSorted.length > 0 && (
        <div className="p-5 rounded-xl bg-[#0f172a] border border-[#1e293b] space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-semibold text-sm">
              All Blockout Dates ({allBlockedSorted.length})
            </h3>
            <button
              onClick={() => {
                setBlockedDates([]);
                setSuccess(false);
              }}
              className="text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              Clear all
            </button>
          </div>
          <div className="space-y-1 max-h-52 overflow-y-auto pr-1">
            {allBlockedSorted.map((d) => {
              const date = new Date(d + 'T00:00:00');
              const isPast = new Date(d) < new Date(todayString());
              return (
                <div
                  key={d}
                  className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-[#1e293b] transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                    <span className={`text-sm ${isPast ? 'text-slate-500' : 'text-slate-300'}`}>
                      {date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                    </span>
                    {isPast && (
                      <span className="text-xs text-slate-600">(past)</span>
                    )}
                  </div>
                  <button
                    onClick={() => toggleDate(d)}
                    className="text-slate-600 hover:text-red-400 transition-colors p-1"
                    aria-label="Remove blockout"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {allBlockedSorted.length === 0 && !loading && (
        <div className="p-6 rounded-xl bg-[#0f172a] border border-[#1e293b] text-center">
          <p className="text-slate-500 text-sm">No blockout dates set. Click any date on the calendar to mark it as unavailable.</p>
        </div>
      )}
    </div>
  );
}
