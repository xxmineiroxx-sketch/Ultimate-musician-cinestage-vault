import React, { useState, useEffect, useRef } from 'react';
import { SYNC_URL, syncHeaders } from '../config/syncConfig';
import { useBrain } from '../context/BrainContext';

// ── Energy helpers ────────────────────────────────────────────────────────────

const ENERGY_MAP = [
  { minBpm: 130, level: 'high',    label: 'HIGH',   heightPct: 1.0,  color: '#EF4444' },
  { minBpm: 108, level: 'medHigh', label: 'UPBEAT', heightPct: 0.75, color: '#F97316' },
  { minBpm: 84,  level: 'med',     label: 'MID',    heightPct: 0.52, color: '#38BDF8' },
  { minBpm: 0,   level: 'low',     label: 'SLOW',   heightPct: 0.28, color: '#10B981' },
];

function songEnergy(song, fallbackIndex, total) {
  const bpm = Number(song?.tempo || song?.bpm || 0);
  if (bpm > 0) return ENERGY_MAP.find(e => bpm >= e.minBpm) || ENERGY_MAP[ENERGY_MAP.length - 1];
  const pos = total > 1 ? fallbackIndex / (total - 1) : 0;
  const arc = Math.sin(pos * Math.PI);
  const idx = arc > 0.65 ? 0 : arc > 0.4 ? 1 : arc > 0.2 ? 2 : 3;
  return ENERGY_MAP[idx];
}

function timeAgo(isoString) {
  if (!isoString) return null;
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function memberStatus(lastSeen) {
  if (!lastSeen) return 'offline';
  const diff = Date.now() - new Date(lastSeen).getTime();
  if (diff < 30 * 60 * 1000)      return 'active';
  if (diff < 24 * 60 * 60 * 1000) return 'synced';
  return 'offline';
}

const STATUS_COLOR = { active: '#10B981', synced: '#F59E0B', offline: '#475569' };

function serviceCountdown(service) {
  const rawDate = service?.service_date || '';
  const rawTime = service?.service_time || '09:00';
  if (!rawDate) return null;
  const localStr = rawDate.includes('T') ? rawDate : `${rawDate}T${rawTime}:00`;
  const diff = new Date(localStr).getTime() - Date.now();
  if (diff <= 0) return null;
  const hrs  = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hrs >= 48) return `${Math.floor(hrs / 24)}d away`;
  if (hrs >= 1)  return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

function computeBriefs(songs, teamPulse) {
  const briefs = [];
  const offlineMembers = teamPulse.filter(m => memberStatus(m.lastSeen) === 'offline');
  if (offlineMembers.length > 0) {
    const names = offlineMembers.slice(0, 2).map(m => m.name?.split(' ')[0]).join(', ');
    const extra = offlineMembers.length > 2 ? ` +${offlineMembers.length - 2}` : '';
    briefs.push({ icon: '⚠', color: '#F59E0B', text: `${names}${extra} not synced yet` });
  }
  if (songs.length >= 2) {
    for (let i = 0; i < songs.length - 1 && briefs.length < 4; i++) {
      const a = songs[i], b = songs[i + 1];
      const bpmA = Number(a?.tempo || a?.bpm || 0);
      const bpmB = Number(b?.tempo || b?.bpm || 0);
      if (bpmA > 0 && bpmB > 0 && Math.abs(bpmA - bpmB) >= 35) {
        const dir = bpmB > bpmA ? '▲' : '▼';
        briefs.push({ icon: '⚡', color: '#38BDF8', text: `S${i+1}→S${i+2}: ${bpmA}→${bpmB} BPM ${dir} sharp tempo shift` });
      }
      if (a?.key && b?.key && a.key !== b.key) {
        briefs.push({ icon: '🎵', color: '#A78BFA', text: `S${i+1}→S${i+2}: ${a.key}→${b.key} key change — vocals heads up` });
      }
    }
    for (let i = 0; i < songs.length - 1 && briefs.length < 4; i++) {
      const ea = songEnergy(songs[i], i, songs.length);
      const eb = songEnergy(songs[i + 1], i + 1, songs.length);
      if (ea.level === 'high' && eb.level === 'high') {
        briefs.push({ icon: '🔥', color: '#EF4444', text: `S${i+1} + S${i+2}: back-to-back high energy — plan transition` });
        break;
      }
    }
  }
  if (briefs.length === 0) {
    briefs.push({ icon: '✓', color: '#10B981', text: "All transitions look smooth — you're ready" });
  }
  return briefs;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusPill({ status }) {
  const map = {
    online:   { dot: 'bg-emerald-400 animate-pulse', text: 'text-emerald-400', label: 'Online',   bg: 'bg-emerald-500/10 border-emerald-500/20' },
    degraded: { dot: 'bg-amber-400',                 text: 'text-amber-400',   label: 'Degraded', bg: 'bg-amber-500/10 border-amber-500/20' },
    offline:  { dot: 'bg-red-500',                   text: 'text-red-400',     label: 'Offline',  bg: 'bg-red-500/10 border-red-500/20' },
  };
  const s = map[status] || map.offline;
  return (
    <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium ${s.bg} ${s.text}`}>
      <span className={`w-2 h-2 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function SectionLabel({ children }) {
  return (
    <div className="flex items-center gap-2 mb-2.5 mt-4">
      <span className="text-[10px] font-black text-slate-500 tracking-widest uppercase">{children}</span>
      <div className="flex-1 h-px bg-slate-800" />
    </div>
  );
}

function eventColor(type) {
  const t = (type || '').toLowerCase();
  if (t === 'error') return 'text-red-400';
  if (t === 'warn' || t === 'warning') return 'text-amber-400';
  if (t === 'success') return 'text-emerald-400';
  return 'text-slate-300';
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function CineStageBrainScreen() {
  const {
    status: connectionStatus,
    capabilities,
    brainStats: rawBrainStats,
    events: liveEvents,
    chatLog,
    queryLoading,
    queryBrain,
    reconnect,
    registerScreenContext,
  } = useBrain();

  const brainStats = rawBrainStats || { uptime: null, requestsHandled: null, avgResponseTime: null };

  // Local chat input
  const [queryInput, setQueryInput] = useState('');
  const chatEndRef = useRef(null);

  // Intelligence state (stays local — fetched from SYNC_URL, not CineStage)
  const [songs, setSongs] = useState([]);
  const [teamPulse, setTeamPulse] = useState([]);
  const [practiceData, setPracticeData] = useState(null);
  const [nextService, setNextService] = useState(null);
  const [intelLoading, setIntelLoading] = useState(true);
  const [rightTab, setRightTab] = useState('intelligence');

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatLog]);

  // ── Intelligence: load service data ────────────────────────────────────────

  useEffect(() => {
    (async () => {
      setIntelLoading(true);
      try {
        const aRes = await fetch(`${SYNC_URL}/sync/assignments`, { headers: syncHeaders() });
        let serviceId = null;
        let svc = null;
        if (aRes.ok) {
          const aData = await aRes.json();
          const list = Array.isArray(aData) ? aData : (aData.assignments || aData.services || []);
          const now = Date.now();
          const upcoming = list
            .filter(s => {
              const d = s.service_date || s.serviceDate || s.date || '';
              return d ? new Date(d).getTime() >= now - 86400000 : false;
            })
            .sort((a, b) => {
              const da = new Date(a.service_date || a.serviceDate || a.date || 0).getTime();
              const db = new Date(b.service_date || b.serviceDate || b.date || 0).getTime();
              return da - db;
            });
          svc = upcoming[0] || list[0] || null;
          setNextService(svc);
          serviceId = svc?.service_id || svc?.id;
        }

        if (!serviceId) return;

        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 6000);

        const [setlistRes, pulseRes, practiceRes] = await Promise.all([
          fetch(`${SYNC_URL}/sync/setlist?serviceId=${encodeURIComponent(serviceId)}`, { headers: syncHeaders(), signal: ctrl.signal }),
          fetch(`${SYNC_URL}/sync/team-pulse?serviceId=${encodeURIComponent(serviceId)}`, { headers: syncHeaders(), signal: ctrl.signal }),
          fetch(`${SYNC_URL}/sync/practice?serviceId=${encodeURIComponent(serviceId)}`, { headers: syncHeaders(), signal: ctrl.signal }),
        ]).finally(() => clearTimeout(tid));

        if (setlistRes.ok) {
          const d = await setlistRes.json();
          setSongs(Array.isArray(d) ? d : (d.songs || d.setlist || []));
        }
        if (pulseRes.ok) {
          const d = await pulseRes.json();
          if (Array.isArray(d)) setTeamPulse(d);
        }
        if (practiceRes.ok) {
          const d = await practiceRes.json();
          if (d?.songs || d?.members) setPracticeData(d);
        }
      } catch { /* intelligence is non-critical */ } finally {
        setIntelLoading(false);
      }
    })();
  }, []);

  // Register rich screen context once intelligence loads
  useEffect(() => {
    if (intelLoading) return;
    registerScreenContext({
      screen: 'cinestage',
      service: nextService
        ? {
            id: nextService.service_id || nextService.id,
            name: nextService.service_name || nextService.org_name,
            date: nextService.service_date || nextService.date,
          }
        : null,
      songs: songs.map(s => ({ title: s.title, key: s.key, tempo: s.tempo || s.bpm })),
      team: teamPulse.map(m => ({ name: m.name, role: m.role, status: memberStatus(m.lastSeen) })),
      briefs: computeBriefs(songs, teamPulse).map(b => b.text),
    });
  }, [intelLoading, nextService, songs, teamPulse, registerScreenContext]);

  // ── Derived values ──────────────────────────────────────────────────────────

  const briefs = computeBriefs(songs, teamPulse);
  const countdown = serviceCountdown(nextService);
  const readyCount = teamPulse.filter(m => memberStatus(m.lastSeen) !== 'offline').length;
  const capIcons = ['🔍', '🛠️', '⚡', '🧬', '📊', '🔒', '🌐', '🤖'];

  const handleSendQuery = () => {
    const q = queryInput.trim();
    if (!q || queryLoading) return;
    setQueryInput('');
    queryBrain(q);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="h-full bg-[#020617] text-white flex flex-col overflow-hidden">

      {/* ── Header ── */}
      <div className="border-b border-slate-800 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-3xl select-none">🧠</span>
          <div>
            <h1 className="text-xl font-bold">CineStage Brain</h1>
            <p className="text-slate-400 text-sm">AI Intelligence Layer · cinestage.ultimatelabs.co</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {countdown && (
            <span className="text-xs font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full">
              ⏱ {countdown}
            </span>
          )}
          {teamPulse.length > 0 && (
            <span className="text-xs font-black text-sky-400 bg-sky-500/10 border border-sky-500/20 px-3 py-1.5 rounded-full">
              {readyCount}/{teamPulse.length} ready
            </span>
          )}
          <StatusPill status={connectionStatus} />
          <button
            onClick={reconnect}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg px-4 py-2 border border-slate-700 transition"
          >
            Reconnect
          </button>
        </div>
      </div>

      {/* ── Stats + Capabilities ── */}
      <div className="px-6 pt-4 pb-3 flex-shrink-0">
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: 'Uptime',           value: brainStats.uptime },
            { label: 'Requests Handled', value: brainStats.requestsHandled },
            { label: 'Avg Response',     value: brainStats.avgResponseTime ? `${brainStats.avgResponseTime}ms` : null },
          ].map(({ label, value }) => (
            <div key={label} className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
              <p className="text-white text-lg font-bold">{value ?? '—'}</p>
              <p className="text-slate-400 text-xs mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {capabilities.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {capabilities.map((cap, i) => (
              <span
                key={cap.id || cap.name || i}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-900 border border-slate-800 rounded-full text-xs text-slate-300 hover:border-indigo-500/40 transition"
              >
                <span>{cap.icon || capIcons[i % capIcons.length]}</span>
                {cap.name || cap.title || `Cap ${i+1}`}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Main area: Chat + Right Panel ── */}
      <div className="flex flex-1 px-6 pb-6 gap-5 overflow-hidden min-h-0">

        {/* ── Chat ── */}
        <div className="flex-1 flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden min-w-0">
          <div className="px-4 py-3 border-b border-slate-800 flex-shrink-0">
            <h3 className="text-white font-semibold text-sm">Send to Brain</h3>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatLog.length === 0 && (
              <div className="text-center text-slate-500 py-12">
                <p className="text-3xl mb-3">🧠</p>
                <p className="text-sm">Ask the brain anything — crash analysis, code fixes, insights…</p>
              </div>
            )}
            {chatLog.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-sm'
                    : msg.isError
                    ? 'bg-red-900/40 border border-red-800 text-red-300 rounded-bl-sm'
                    : 'bg-slate-800 text-slate-200 rounded-bl-sm'
                }`}>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  <p className={`text-xs mt-1 ${msg.role === 'user' ? 'text-indigo-200' : 'text-slate-500'}`}>
                    {new Date(msg.ts).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}
            {queryLoading && (
              <div className="flex justify-start">
                <div className="bg-slate-800 px-4 py-3 rounded-2xl rounded-bl-sm flex items-center gap-2">
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="p-4 border-t border-slate-800 flex gap-3 flex-shrink-0">
            <textarea
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendQuery(); } }}
              placeholder="Ask the brain something… (Enter to send, Shift+Enter for newline)"
              rows={2}
              className="flex-1 bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
              disabled={connectionStatus === 'offline'}
            />
            <button
              onClick={handleSendQuery}
              disabled={!queryInput.trim() || queryLoading || connectionStatus === 'offline'}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg px-5 transition self-end py-2.5 text-sm"
            >
              Send
            </button>
          </div>
        </div>

        {/* ── Right panel: Intelligence + Live Events ── */}
        <div className="w-80 flex flex-col min-h-0">

          {/* Tabs */}
          <div className="flex rounded-xl overflow-hidden border border-slate-800 mb-3 flex-shrink-0">
            {['intelligence', 'events'].map(tab => (
              <button
                key={tab}
                onClick={() => setRightTab(tab)}
                className={`flex-1 py-2 text-xs font-black uppercase tracking-wider transition ${
                  rightTab === tab
                    ? 'bg-slate-800 text-white'
                    : 'bg-transparent text-slate-500 hover:text-slate-300'
                }`}
              >
                {tab === 'intelligence' ? '⚡ Intelligence' : '📡 Live Events'}
              </button>
            ))}
          </div>

          {/* ── Intelligence tab ── */}
          {rightTab === 'intelligence' && (
            <div className="flex-1 overflow-y-auto bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
              {intelLoading ? (
                <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
                  <svg className="animate-spin h-4 w-4 text-sky-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Loading service data…
                </div>
              ) : (
                <>
                  {nextService && (
                    <div className="mb-2">
                      <span className="text-[9px] font-black text-sky-400 tracking-widest uppercase border border-sky-500/25 bg-sky-500/10 rounded px-1.5 py-0.5">
                        SERVICE COMMAND
                      </span>
                      <p className="text-white font-bold text-sm mt-1.5 leading-tight">
                        {nextService.service_name || nextService.org_name || 'Upcoming Service'}
                      </p>
                    </div>
                  )}
                  {!nextService && (
                    <p className="text-slate-500 text-xs italic py-2">No upcoming service found.</p>
                  )}

                  <SectionLabel>Team Heartbeat</SectionLabel>
                  {teamPulse.length === 0 ? (
                    <p className="text-slate-500 text-xs italic">Members appear here as they open the app today</p>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {teamPulse.map((member, i) => {
                        const status = memberStatus(member.lastSeen);
                        const color = STATUS_COLOR[status];
                        const ago = member.lastSeen ? timeAgo(member.lastSeen) : 'not seen';
                        return (
                          <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-lg" style={{ backgroundColor: color + '14' }}>
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                            <div className="flex-1 min-w-0">
                              <p className="text-slate-100 text-xs font-bold truncate">{member.name || '—'}</p>
                              <p className="text-xs font-semibold" style={{ color }}>{member.role || '—'}</p>
                            </div>
                            <span className="text-slate-500 text-[10px] font-semibold flex-shrink-0">{ago}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {songs.length > 0 && (
                    <>
                      <SectionLabel>Service Energy Arc</SectionLabel>
                      <div className="flex items-end gap-1.5 h-16">
                        {songs.map((song, i) => {
                          const energy = songEnergy(song, i, songs.length);
                          const h = Math.round(energy.heightPct * 56);
                          return (
                            <div key={i} className="flex flex-col items-center flex-1 min-w-0">
                              <div className="w-full flex items-end justify-center" style={{ height: 56 }}>
                                <div className="w-full rounded-t" style={{ height: h, backgroundColor: energy.color, minHeight: 4 }} />
                              </div>
                              <span className="text-[9px] font-bold text-slate-500 mt-0.5">S{i+1}</span>
                              {song.key && (
                                <span className="text-[8px] font-bold" style={{ color: energy.color }}>{song.key}</span>
                              )}
                            </div>
                          );
                        })}
                        <div className="flex flex-col gap-1 pl-1 pb-3 flex-shrink-0">
                          {ENERGY_MAP.slice(0, 3).map(e => (
                            <div key={e.level} className="flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: e.color }} />
                              <span className="text-[8px] text-slate-500 font-bold">{e.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-1 overflow-x-auto pb-1">
                        {songs.map((song, i) => (
                          <div key={i} className="text-center flex-shrink-0" style={{ minWidth: 36 }}>
                            <p className="text-[8px] text-slate-500 leading-tight truncate w-10">{song.title || `S${i+1}`}</p>
                            {(song.tempo || song.bpm) && (
                              <p className="text-[7px] text-slate-600">{song.tempo || song.bpm}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  <SectionLabel>The Brief</SectionLabel>
                  <div className="flex flex-col gap-1.5">
                    {briefs.map((brief, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 rounded-lg px-2.5 py-2 border-l-2"
                        style={{ backgroundColor: brief.color + '14', borderLeftColor: brief.color }}
                      >
                        <span className="text-sm flex-shrink-0 leading-tight">{brief.icon}</span>
                        <p className="text-xs font-semibold leading-snug" style={{ color: brief.color === '#10B981' ? '#10B981' : '#CBD5E1' }}>
                          {brief.text}
                        </p>
                      </div>
                    ))}
                  </div>

                  {practiceData && (practiceData.songs?.length > 0 || practiceData.members?.length > 0) && (
                    <>
                      <SectionLabel>Practice Tracker</SectionLabel>
                      {practiceData.songs?.map((s, i) => {
                        const pct = s.memberCount > 0 ? s.readyCount / s.memberCount : 0;
                        const color = pct >= 0.8 ? '#10B981' : pct >= 0.5 ? '#F59E0B' : '#EF4444';
                        const mins = Math.round((s.totalDurationSec || 0) / 60);
                        return (
                          <div key={i} className="mb-2">
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-xs font-bold text-slate-200 truncate mr-2">{s.title}</span>
                              <span className="text-[10px] font-black flex-shrink-0" style={{ color }}>
                                {Math.round(pct * 100)}%
                              </span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all" style={{ width: `${Math.round(pct * 100)}%`, backgroundColor: color }} />
                            </div>
                            <p className="text-[10px] text-slate-500 mt-0.5">
                              {s.readyCount}/{s.memberCount} ready{mins > 0 ? ` · ${mins}m practiced` : ''}
                            </p>
                          </div>
                        );
                      })}
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Live Events tab ── */}
          {rightTab === 'events' && (
            <div className="flex-1 flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden min-h-0">
              <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between flex-shrink-0">
                <h3 className="text-white font-semibold text-sm">Live Brain Events</h3>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {liveEvents.length === 0 && (
                  <p className="text-slate-500 text-xs text-center py-6">Waiting for brain events…</p>
                )}
                {liveEvents.map((ev, i) => (
                  <div key={i} className="bg-slate-800/60 rounded-lg px-3 py-2 border border-slate-700/50">
                    <p className={`text-xs font-mono leading-relaxed ${eventColor(ev.type)}`}>
                      {typeof ev.content === 'string' ? ev.content : JSON.stringify(ev.content)}
                    </p>
                    <p className="text-slate-600 text-xs mt-0.5">{new Date(ev.ts).toLocaleTimeString()}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
