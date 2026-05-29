import React, { useState, useEffect, useRef, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------
const BG_MAIN   = '#020617';
const BG_PANEL  = '#0f172a';
const BG_TRACK  = '#1e293b';
const ACCENT    = '#4F46E5';
const CLR_GREEN = '#22c55e';
const CLR_RED   = '#ef4444';
const CLR_YELLOW = '#eab308';

function pad(n, w = 2) { return String(n).padStart(w, '0'); }

function formatBar(transport) {
  const bar = String(transport.bar ?? 1).padStart(3, '0');
  const beat = transport.beat ?? 1;
  const sixteenth = transport.sixteenth ?? 1;
  return `${bar}:${beat}:${sixteenth}`;
}

function formatTime(secs) {
  if (secs == null || isNaN(secs)) return '00:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${pad(m)}:${pad(s)}`;
}

function cpuColor(load) {
  if (load >= 0.8) return CLR_RED;
  if (load >= 0.5) return CLR_YELLOW;
  return CLR_GREEN;
}

function peakColor(peak) {
  if (peak >= 0.9) return CLR_RED;
  if (peak >= 0.7) return CLR_YELLOW;
  return CLR_GREEN;
}

function meterColor(val) {
  if (val >= 0.9) return CLR_RED;
  if (val >= 0.7) return CLR_YELLOW;
  return CLR_GREEN;
}

function dbLabel(peak) {
  if (!peak || peak <= 0) return '-∞';
  return (20 * Math.log10(peak)).toFixed(1);
}

// Safe API call – engine might not be present in dev without Electron
function eng() { return window?.umDesktop?.engine; }

// ---------------------------------------------------------------------------
// Default snapshot (used before first engine event)
// ---------------------------------------------------------------------------
const DEFAULT_SNAPSHOT = {
  projectName: 'Untitled Project',
  transport: { playing: false, bpm: 120, bar: 1, beat: 1, sixteenth: 1, currentTimeSeconds: 0 },
  config: { sampleRate: 44100, blockSize: 256, channelCount: 2, timeSignature: [4, 4] },
  stats: { cpuLoad: 0, activeVoices: 0, masterPeak: 0, previewWaveform: [] },
  scenes: [
    { id: 's1', name: 'Intro', color: '#6366f1' },
    { id: 's2', name: 'Verse', color: '#22c55e' },
    { id: 's3', name: 'Hook',  color: '#f59e0b' },
    { id: 's4', name: 'Break', color: '#ec4899' },
  ],
  buses: [
    { id: 'b1', name: 'Master', peak: 0 },
    { id: 'b2', name: 'FX',     peak: 0 },
  ],
  tracks: [
    {
      id: 't1', name: 'Drums', type: 'instrument', color: '#22c55e',
      volume: 0.8, pan: 0, meter: 0.6, outputBus: 'Master', activeClipId: null,
      clips: [
        { slotId: 0, sceneId: 's1', name: 'Kick Intro', color: '#22c55e', active: false },
        { slotId: 1, sceneId: 's2', name: 'Full Kit',   color: '#22c55e', active: false },
        { slotId: 2, sceneId: 's3', name: 'Hook Beat',  color: '#22c55e', active: false },
        { slotId: 3, sceneId: 's4', name: null,         color: '#22c55e', active: false },
      ],
      arrangementClips: [
        { id: 'ac1', name: 'Intro Drums', color: '#22c55e', startBar: 1,  lengthBars: 8 },
        { id: 'ac2', name: 'Main Drums',  color: '#22c55e', startBar: 9,  lengthBars: 16 },
      ],
    },
    {
      id: 't2', name: 'Bass', type: 'instrument', color: '#f59e0b',
      volume: 0.75, pan: -0.1, meter: 0.4, outputBus: 'Master', activeClipId: null,
      clips: [
        { slotId: 0, sceneId: 's1', name: 'Bass Intro', color: '#f59e0b', active: false },
        { slotId: 1, sceneId: 's2', name: 'Groove',     color: '#f59e0b', active: false },
        { slotId: 2, sceneId: 's3', name: null,         color: '#f59e0b', active: false },
        { slotId: 3, sceneId: 's4', name: 'Bass Break', color: '#f59e0b', active: false },
      ],
      arrangementClips: [
        { id: 'ac3', name: 'Bass Line', color: '#f59e0b', startBar: 5, lengthBars: 20 },
      ],
    },
    {
      id: 't3', name: 'Keys', type: 'instrument', color: '#6366f1',
      volume: 0.7, pan: 0.15, meter: 0.3, outputBus: 'Master', activeClipId: null,
      clips: [
        { slotId: 0, sceneId: 's1', name: null,        color: '#6366f1', active: false },
        { slotId: 1, sceneId: 's2', name: 'Keys Pad',  color: '#6366f1', active: false },
        { slotId: 2, sceneId: 's3', name: 'Lead Keys', color: '#6366f1', active: false },
        { slotId: 3, sceneId: 's4', name: null,        color: '#6366f1', active: false },
      ],
      arrangementClips: [
        { id: 'ac4', name: 'Keys', color: '#6366f1', startBar: 9, lengthBars: 16 },
      ],
    },
    {
      id: 't4', name: 'Vocals', type: 'audio', color: '#ec4899',
      volume: 0.9, pan: 0, meter: 0.5, outputBus: 'Master', activeClipId: null,
      clips: [
        { slotId: 0, sceneId: 's1', name: null,     color: '#ec4899', active: false },
        { slotId: 1, sceneId: 's2', name: 'Verse 1', color: '#ec4899', active: false },
        { slotId: 2, sceneId: 's3', name: 'Chorus',  color: '#ec4899', active: false },
        { slotId: 3, sceneId: 's4', name: null,      color: '#ec4899', active: false },
      ],
      arrangementClips: [
        { id: 'ac5', name: 'Lead Vox', color: '#ec4899', startBar: 9, lengthBars: 24 },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

// ---- Transport Bar ----
function TransportBar({ snapshot, onBpmChange, onPlay, onStop }) {
  const { transport, stats, config } = snapshot;
  const [editingBpm, setEditingBpm] = useState(false);
  const [bpmInput, setBpmInput] = useState(String(transport.bpm));
  const bpmRef = useRef(null);

  useEffect(() => {
    if (!editingBpm) setBpmInput(String(transport.bpm));
  }, [transport.bpm, editingBpm]);

  function commitBpm() {
    const val = parseFloat(bpmInput);
    if (!isNaN(val) && val >= 20 && val <= 300) onBpmChange(val);
    setEditingBpm(false);
  }

  function handleBpmKey(e) {
    if (e.key === 'Enter') commitBpm();
    if (e.key === 'Escape') { setBpmInput(String(transport.bpm)); setEditingBpm(false); }
  }

  const cpu = stats.cpuLoad ?? 0;
  const peak = stats.masterPeak ?? 0;
  const [num, denom] = config.timeSignature ?? [4, 4];

  return (
    <div
      style={{
        height: 64,
        background: BG_PANEL,
        borderBottom: '1px solid #1e293b',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: 24,
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      {/* ---- BPM ---- */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          onClick={() => onBpmChange(Math.max(20, transport.bpm - 1))}
          style={btnSmall}
        >−</button>
        {editingBpm ? (
          <input
            ref={bpmRef}
            value={bpmInput}
            onChange={e => setBpmInput(e.target.value)}
            onBlur={commitBpm}
            onKeyDown={handleBpmKey}
            autoFocus
            style={{
              width: 56,
              background: '#0f172a',
              border: `1px solid ${ACCENT}`,
              borderRadius: 4,
              color: '#f8fafc',
              fontSize: 20,
              fontWeight: 700,
              fontFamily: 'monospace',
              textAlign: 'center',
              outline: 'none',
              padding: '2px 4px',
            }}
          />
        ) : (
          <div
            onClick={() => setEditingBpm(true)}
            style={{
              fontSize: 20,
              fontWeight: 700,
              fontFamily: 'monospace',
              color: '#f8fafc',
              cursor: 'pointer',
              minWidth: 56,
              textAlign: 'center',
              letterSpacing: 1,
            }}
            title="Click to edit BPM"
          >
            {transport.bpm}
          </div>
        )}
        <button
          onClick={() => onBpmChange(Math.min(300, transport.bpm + 1))}
          style={btnSmall}
        >+</button>
        <span style={{ fontSize: 10, color: '#64748b', marginLeft: 2 }}>BPM</span>
      </div>

      {/* ---- Time Sig ---- */}
      <div style={{ fontFamily: 'monospace', color: '#94a3b8', fontSize: 14, fontWeight: 600 }}>
        {num}/{denom}
      </div>

      {/* ---- Center spacer + Position display ---- */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <div style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 700, color: '#f8fafc', letterSpacing: 3 }}>
          {formatBar(transport)}
        </div>
        <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#64748b' }}>
          {formatTime(transport.currentTimeSeconds)}
        </div>
      </div>

      {/* ---- Playback controls ---- */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Record - placeholder */}
        <button
          style={{ ...btnControl, color: '#ef4444', borderColor: '#3f3f46', opacity: 0.45, cursor: 'not-allowed' }}
          title="Record (coming soon)"
          disabled
        >
          ⏺
        </button>
        {/* Stop */}
        <button
          onClick={onStop}
          style={{ ...btnControl, background: transport.playing ? 'transparent' : '#1e293b', borderColor: transport.playing ? '#334155' : '#64748b' }}
          title="Stop"
        >
          ■
        </button>
        {/* Play */}
        <button
          onClick={onPlay}
          style={{
            ...btnControl,
            background: transport.playing ? ACCENT : 'transparent',
            borderColor: transport.playing ? ACCENT : '#334155',
            color: transport.playing ? '#fff' : '#94a3b8',
            fontSize: 18,
          }}
          title="Play"
        >
          ▶
        </button>
      </div>

      {/* ---- Right: meters ---- */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginLeft: 'auto' }}>
        {/* CPU */}
        <MeterDisplay label="CPU" value={cpu} colorFn={cpuColor} format={v => `${Math.round(v * 100)}%`} />
        {/* Master Peak */}
        <MeterDisplay label="PEAK" value={peak} colorFn={peakColor} format={v => dbLabel(v) + ' dB'} />
        {/* Voices */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#c4b5fd', fontFamily: 'monospace' }}>
            {stats.activeVoices ?? 0}
          </span>
          <span style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>VOICES</span>
        </div>
      </div>
    </div>
  );
}

function MeterDisplay({ label, value, colorFn, format }) {
  const color = colorFn(value);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 60 }}>
      <div style={{ width: '100%', height: 6, background: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${Math.min(100, value * 100)}%`,
          background: color,
          borderRadius: 3,
          transition: 'width 80ms linear, background 200ms',
        }} />
      </div>
      <span style={{ fontSize: 11, fontFamily: 'monospace', color }}>{format(value)}</span>
      <span style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</span>
    </div>
  );
}

// ---- Track Strip (left mixer) ----
function TrackStrip({ track, selected, onSelect, onVolumeChange, onMuteToggle, onPanReset }) {
  const muted = track.mute ?? false;
  const volumeTimerRef = useRef(null);

  function handleVolume(e) {
    const val = parseFloat(e.target.value) / 100;
    if (volumeTimerRef.current) clearTimeout(volumeTimerRef.current);
    volumeTimerRef.current = setTimeout(() => {
      onVolumeChange(track.id, val);
    }, 100);
  }

  function toggleMute() {
    onMuteToggle(track.id, !muted);
  }

  const panDisplay = Math.round((track.pan ?? 0) * 50);
  const panLabel = panDisplay === 0 ? 'C' : panDisplay > 0 ? `R${panDisplay}` : `L${Math.abs(panDisplay)}`;

  const meterVal = Math.max(0, Math.min(1, track.meter ?? 0));

  return (
    <div
      onClick={onSelect}
      style={{
        height: 64,
        background: selected ? '#1e3a5f' : BG_TRACK,
        borderBottom: '1px solid #0f172a',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '0 8px 0 0',
        cursor: 'pointer',
        position: 'relative',
        transition: 'background 150ms',
        flexShrink: 0,
      }}
    >
      {/* Color strip */}
      <div style={{ width: 4, height: '100%', background: track.color, flexShrink: 0 }} />

      {/* VU Meter */}
      <div style={{ width: 5, height: 44, background: '#0f172a', borderRadius: 2, overflow: 'hidden', flexShrink: 0, position: 'relative' }}>
        <div style={{
          position: 'absolute',
          bottom: 0,
          width: '100%',
          height: `${meterVal * 100}%`,
          background: meterColor(meterVal),
          transition: 'height 80ms linear',
          borderRadius: 2,
        }} />
      </div>

      {/* Name + controls */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        {/* Row 1: name + M + S */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            color: selected ? '#e0e7ff' : '#cbd5e1',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}>{track.name}</span>
          <button
            onClick={e => { e.stopPropagation(); toggleMute(); }}
            style={{
              ...btnTiny,
              background: muted ? '#854d0e' : '#1e293b',
              color: muted ? '#fde047' : '#64748b',
              borderColor: muted ? '#fde047' : '#334155',
            }}
            title="Mute"
          >M</button>
          <button
            onClick={e => e.stopPropagation()}
            style={{ ...btnTiny, color: '#475569', borderColor: '#1e293b', cursor: 'not-allowed', opacity: 0.5 }}
            title="Solo (coming soon)"
            disabled
          >S</button>
        </div>

        {/* Row 2: Volume slider */}
        <input
          type="range"
          min={0} max={100} step={1}
          value={Math.round((track.volume ?? 1) * 100)}
          onChange={handleVolume}
          onClick={e => e.stopPropagation()}
          style={{ width: '100%', accentColor: ACCENT, height: 4, cursor: 'pointer' }}
        />

        {/* Row 3: Pan + bus */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            onClick={e => { e.stopPropagation(); onPanReset(track.id); }}
            title="Click to center pan"
            style={{
              fontSize: 10,
              fontFamily: 'monospace',
              color: '#94a3b8',
              cursor: 'pointer',
              minWidth: 28,
              textAlign: 'center',
              background: '#0f172a',
              borderRadius: 3,
              padding: '1px 3px',
            }}
          >{panLabel}</span>
          <span style={{ fontSize: 9, color: '#475569', background: '#0f172a', borderRadius: 3, padding: '1px 4px' }}>
            {track.outputBus ?? 'Master'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ---- Clip Launcher ----
function ClipLauncher({ snapshot, selectedTrackId }) {
  const { tracks, scenes } = snapshot;

  async function handleLaunchClip(trackId, slotId) {
    try { await eng()?.launchClip(trackId, slotId); } catch (err) { console.warn('launchClip error', err); }
  }

  async function handleStopAll() {
    try { await eng()?.stopAllClips(); } catch (err) { console.warn('stopAllClips error', err); }
  }

  // scene rows — each row launches all clips in that scene across all tracks
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header row: track column headers + stop-all */}
      <div style={{
        display: 'flex',
        background: BG_PANEL,
        borderBottom: '1px solid #1e293b',
        flexShrink: 0,
        height: 32,
        alignItems: 'center',
      }}>
        {/* Scene label column */}
        <div style={{ width: 90, flexShrink: 0, padding: '0 8px', fontSize: 10, color: '#475569', fontWeight: 600, textTransform: 'uppercase' }}>SCENE</div>
        {/* Track headers */}
        {tracks.map(track => (
          <div
            key={track.id}
            style={{
              flex: 1,
              minWidth: 80,
              padding: '0 6px',
              fontSize: 10,
              fontWeight: 600,
              color: track.id === selectedTrackId ? '#e0e7ff' : '#94a3b8',
              borderLeft: '1px solid #1e293b',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              borderBottom: `2px solid ${track.color}`,
            }}
          >{track.name}</div>
        ))}
        {/* Stop all */}
        <div style={{ width: 72, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={handleStopAll}
            style={{
              fontSize: 10,
              padding: '3px 8px',
              background: '#450a0a',
              color: CLR_RED,
              border: `1px solid ${CLR_RED}`,
              borderRadius: 4,
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >■ STOP</button>
        </div>
      </div>

      {/* Scene rows */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {scenes.map((scene, sceneIndex) => (
          <div
            key={scene.id}
            style={{
              display: 'flex',
              height: 80,
              borderBottom: '1px solid #1e293b',
              alignItems: 'stretch',
            }}
          >
            {/* Scene launch button */}
            <div
              style={{
                width: 90,
                flexShrink: 0,
                background: BG_PANEL,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRight: '1px solid #1e293b',
              }}
            >
              <button
                onClick={() => {
                  tracks.forEach(track => {
                    const clip = track.clips?.[sceneIndex];
                    if (clip?.name) handleLaunchClip(track.id, clip.slotId);
                  });
                }}
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '6px 10px',
                  background: scene.color + '22',
                  color: scene.color,
                  border: `1px solid ${scene.color}44`,
                  borderRadius: 6,
                  cursor: 'pointer',
                  width: 72,
                  textAlign: 'center',
                }}
              >▶ {scene.name}</button>
            </div>

            {/* Clip cells */}
            {tracks.map(track => {
              const clip = track.clips?.[sceneIndex];
              const hasClip = clip && clip.name;
              const isActive = clip?.active === true;
              return (
                <div
                  key={track.id}
                  onClick={() => hasClip && handleLaunchClip(track.id, clip.slotId)}
                  style={{
                    flex: 1,
                    minWidth: 80,
                    borderLeft: '1px solid #1e293b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 6,
                    cursor: hasClip ? 'pointer' : 'default',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  {hasClip ? (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        background: isActive ? track.color : track.color + '33',
                        border: `1px solid ${track.color}${isActive ? 'ff' : '66'}`,
                        borderRadius: 6,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '4px 6px',
                        animation: isActive ? 'clipPulse 1s ease-in-out infinite' : 'none',
                      }}
                    >
                      <span style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: isActive ? '#fff' : track.color,
                        textAlign: 'center',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: '100%',
                      }}>{clip.name}</span>
                    </div>
                  ) : (
                    <div style={{
                      width: '100%',
                      height: '100%',
                      border: '1px dashed #1e293b',
                      borderRadius: 6,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <span style={{ fontSize: 18, color: '#1e293b' }}>+</span>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Spacer to match stop-all column */}
            <div style={{ width: 72, flexShrink: 0 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Arrangement View ----
const BARS_VISIBLE = 32;
const BAR_WIDTH = 40; // px per bar

function ArrangementView({ snapshot }) {
  const { tracks, transport } = snapshot;
  const containerRef = useRef(null);
  const totalBars = BARS_VISIBLE;

  async function handleSeek(e) {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    // offset for track label column (120px) + ruler
    const labelWidth = 120;
    const clickX = e.clientX - rect.left - labelWidth;
    if (clickX < 0) return;
    const bar = Math.max(1, Math.floor(clickX / BAR_WIDTH) + 1);
    try { await eng()?.seekToBar(bar); } catch (err) { console.warn('seekToBar error', err); }
  }

  const playheadX = ((transport.bar ?? 1) - 1) * BAR_WIDTH;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Ruler */}
      <div
        ref={containerRef}
        style={{
          display: 'flex',
          flexShrink: 0,
          height: 28,
          background: BG_PANEL,
          borderBottom: '1px solid #1e293b',
          position: 'relative',
          cursor: 'crosshair',
          overflow: 'hidden',
        }}
        onClick={handleSeek}
      >
        {/* Label column spacer */}
        <div style={{ width: 120, flexShrink: 0, borderRight: '1px solid #1e293b' }} />
        {/* Bar markers */}
        <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
          {Array.from({ length: totalBars }, (_, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: i * BAR_WIDTH,
                top: 0,
                height: '100%',
                width: BAR_WIDTH,
                borderLeft: '1px solid #1e293b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                paddingLeft: 3,
              }}
            >
              <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#64748b' }}>{i + 1}</span>
            </div>
          ))}
          {/* Playhead */}
          <div
            style={{
              position: 'absolute',
              left: playheadX,
              top: 0,
              width: 2,
              height: '100%',
              background: CLR_RED,
              zIndex: 10,
              pointerEvents: 'none',
              transition: 'left 100ms linear',
            }}
          />
        </div>
      </div>

      {/* Track rows */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {tracks.map(track => (
          <div
            key={track.id}
            style={{
              display: 'flex',
              height: 56,
              borderBottom: '1px solid #1e293b',
              alignItems: 'stretch',
            }}
          >
            {/* Track label */}
            <div style={{
              width: 120,
              flexShrink: 0,
              background: BG_TRACK,
              borderRight: '1px solid #1e293b',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '0 8px',
            }}>
              <div style={{ width: 3, height: 32, background: track.color, borderRadius: 2, flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {track.name}
              </span>
            </div>

            {/* Clip blocks */}
            <div
              style={{ position: 'relative', flex: 1, background: '#0a0f1e', cursor: 'crosshair' }}
              onClick={handleSeek}
            >
              {/* Grid lines */}
              {Array.from({ length: totalBars }, (_, i) => (
                <div key={i} style={{
                  position: 'absolute', left: i * BAR_WIDTH, top: 0, bottom: 0,
                  width: 1, background: '#1e293b',
                }} />
              ))}
              {/* Arrangement clips */}
              {(track.arrangementClips ?? []).map(clip => (
                <div
                  key={clip.id}
                  style={{
                    position: 'absolute',
                    left: (clip.startBar - 1) * BAR_WIDTH + 1,
                    width: clip.lengthBars * BAR_WIDTH - 2,
                    top: 6,
                    bottom: 6,
                    background: clip.color + '55',
                    border: `1px solid ${clip.color}`,
                    borderRadius: 4,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 6px',
                    overflow: 'hidden',
                    zIndex: 2,
                    pointerEvents: 'none',
                  }}
                >
                  <span style={{ fontSize: 10, fontWeight: 600, color: clip.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {clip.name}
                  </span>
                </div>
              ))}
              {/* Playhead */}
              <div style={{
                position: 'absolute',
                left: playheadX,
                top: 0, bottom: 0,
                width: 2,
                background: CLR_RED + 'cc',
                zIndex: 10,
                pointerEvents: 'none',
                transition: 'left 100ms linear',
              }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Stem Separator Panel ----
const STEM_MODELS = [
  { value: 'htdemucs_6s', label: 'htdemucs_6s (6 stems)' },
  { value: 'htdemucs',    label: 'htdemucs (4 stems)' },
  { value: 'htdemucs_ft', label: 'htdemucs_ft (fine-tuned)' },
];

const STEM_NAMES_6 = ['Vocals', 'Drums', 'Bass', 'Guitar', 'Piano', 'Other'];
const STEM_NAMES_4 = ['Vocals', 'Drums', 'Bass', 'Other'];

function StemSeparatorPanel() {
  const [audioPath, setAudioPath] = useState(null);
  const [model, setModel] = useState('htdemucs_6s');
  const [separating, setSeparating] = useState(false);
  const [progress, setProgress] = useState([]);
  const [done, setDone] = useState(false);
  const [stemPaths, setStemPaths] = useState({});
  const [toast, setToast] = useState(null);
  const progressRef = useRef(null);

  async function handleBrowse() {
    try {
      const path = await window?.umDesktop?.file?.openAudio?.();
      if (path) { setAudioPath(path); setDone(false); setProgress([]); }
    } catch (err) { console.warn('openAudio error', err); }
  }

  async function handleSeparate() {
    if (!audioPath) return;
    setSeparating(true);
    setDone(false);
    setProgress(['Starting Demucs...']);
    const baseDir = await window.umDesktop.file.getAppDataPath();
    const outputDir = baseDir + '/stems/';
    try {
      const unsub = window.umDesktop.stems.onProgress(line => {
        setProgress(prev => [...prev, line]);
        if (progressRef.current) progressRef.current.scrollTop = progressRef.current.scrollHeight;
      });
      const result = await window.umDesktop.stems.separate(audioPath, outputDir, model);
      unsub();
      if (result?.stems) setStemPaths(result.stems);
      setDone(true);
    } catch (err) {
      setProgress(prev => [...prev, `Error: ${err?.message ?? String(err)}`]);
    } finally {
      setSeparating(false);
    }
  }

  function showToast(name) {
    const filePath = stemPaths[name.toLowerCase()] || '';
    const msg = filePath
      ? `"${name}" → ${filePath}`
      : `"${name}" stem queued for track load (coming soon)`;
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  const stemNames = model === 'htdemucs_6s' ? STEM_NAMES_6 : STEM_NAMES_4;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', padding: 12, gap: 10, position: 'relative' }}>
      {toast && (
        <div style={{
          position: 'absolute',
          top: 8, right: 12,
          background: '#14532d',
          border: `1px solid ${CLR_GREEN}`,
          color: CLR_GREEN,
          fontSize: 12,
          padding: '6px 14px',
          borderRadius: 6,
          zIndex: 100,
          fontWeight: 600,
        }}>{toast}</div>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Drop zone */}
        <div
          onClick={handleBrowse}
          style={{
            flex: '0 0 220px',
            height: 60,
            border: `2px dashed ${audioPath ? ACCENT : '#334155'}`,
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            background: audioPath ? ACCENT + '11' : 'transparent',
            padding: '0 10px',
            transition: 'all 200ms',
          }}
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) setAudioPath(file.path ?? file.name);
          }}
        >
          <div style={{ textAlign: 'center' }}>
            {audioPath ? (
              <span style={{ fontSize: 11, color: '#94a3b8', wordBreak: 'break-all' }}>
                {audioPath.split('/').pop()}
              </span>
            ) : (
              <span style={{ fontSize: 11, color: '#475569' }}>Drag audio file here<br />or click to browse</span>
            )}
          </div>
        </div>

        {/* Model selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>Model</label>
          <select
            value={model}
            onChange={e => setModel(e.target.value)}
            style={{
              background: BG_TRACK,
              border: '1px solid #334155',
              borderRadius: 6,
              color: '#cbd5e1',
              fontSize: 12,
              padding: '6px 10px',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            {STEM_MODELS.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        {/* Separate button */}
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button
            onClick={handleSeparate}
            disabled={!audioPath || separating}
            style={{
              padding: '8px 18px',
              background: audioPath && !separating ? ACCENT : '#1e293b',
              color: audioPath && !separating ? '#fff' : '#475569',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 700,
              cursor: audioPath && !separating ? 'pointer' : 'not-allowed',
              transition: 'all 200ms',
            }}
          >{separating ? 'Separating...' : 'Separate Stems'}</button>
        </div>

        {/* Stem buttons when done */}
        {done && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {stemNames.map(name => (
              <button
                key={name}
                onClick={() => showToast(name)}
                style={{
                  padding: '5px 10px',
                  background: '#1e293b',
                  border: `1px solid ${ACCENT}`,
                  borderRadius: 6,
                  color: '#c4b5fd',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
                }}
              >
                <span>{name}</span>
                <span style={{ fontSize: 9, color: '#6366f1' }}>Load →</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Progress log */}
      {progress.length > 0 && (
        <div
          ref={progressRef}
          style={{
            flex: 1,
            background: '#020617',
            border: '1px solid #1e293b',
            borderRadius: 6,
            padding: '6px 10px',
            overflowY: 'auto',
            fontFamily: 'monospace',
            fontSize: 11,
            color: '#4ade80',
            maxHeight: 80,
          }}
        >
          {progress.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared button styles
// ---------------------------------------------------------------------------
const btnSmall = {
  width: 22,
  height: 22,
  background: '#1e293b',
  border: '1px solid #334155',
  color: '#94a3b8',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 14,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 700,
  lineHeight: 1,
  padding: 0,
};

const btnControl = {
  width: 36,
  height: 36,
  background: 'transparent',
  border: '1px solid #334155',
  color: '#94a3b8',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 16,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 700,
  lineHeight: 1,
  padding: 0,
  transition: 'all 150ms',
};

const btnTiny = {
  width: 18,
  height: 18,
  fontSize: 9,
  fontWeight: 700,
  background: '#1e293b',
  border: '1px solid #334155',
  color: '#64748b',
  borderRadius: 3,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  flexShrink: 0,
};

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------
export default function DAWWorkspaceScreen() {
  const [snapshot, setSnapshot] = useState(DEFAULT_SNAPSHOT);
  const [selectedTrackId, setSelectedTrackId] = useState(null);
  const [arrangementView, setArrangementView] = useState(false);
  const [stemOpen, setStemOpen] = useState(false);

  // Engine subscription
  useEffect(() => {
    const engine = eng();
    if (!engine) return;

    let unsub;
    engine.getSnapshot().then(snap => {
      if (snap) setSnapshot(snap);
    }).catch(err => console.warn('getSnapshot error', err));

    unsub = engine.subscribe(event => {
      if (event?.snapshot) setSnapshot(event.snapshot);
    });

    return () => { try { unsub?.(); } catch (_) {} };
  }, []);

  // --- Engine actions ---
  async function handlePlay() {
    try { await eng()?.play(); } catch (err) { console.warn('play error', err); }
  }

  async function handleStop() {
    try { await eng()?.stop(); } catch (err) { console.warn('stop error', err); }
  }

  async function handleBpmChange(bpm) {
    setSnapshot(prev => ({
      ...prev,
      transport: { ...prev.transport, bpm },
    }));
    try { await eng()?.setBpm(bpm); } catch (err) { console.warn('setBpm error', err); }
  }

  async function handleVolumeChange(trackId, volume) {
    try { await eng()?.setTrackVolume(trackId, volume); } catch (err) { console.warn('setTrackVolume error', err); }
  }

  async function handleMuteToggle(trackId, mute) {
    try { await eng()?.setTrackMute(trackId, mute); } catch (err) { console.warn('setTrackMute error', err); }
  }

  async function handlePanReset(trackId) {
    try { await eng()?.setTrackPan(trackId, 0); } catch (err) { console.warn('setTrackPan error', err); }
    setSnapshot(prev => ({
      ...prev,
      tracks: prev.tracks.map(t => t.id === trackId ? { ...t, pan: 0 } : t),
    }));
  }

  return (
    <>
      {/* Keyframe injection */}
      <style>{`
        @keyframes clipPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.65; }
        }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: #020617; }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 2px; }
        ::-webkit-scrollbar-thumb:hover { background: #475569; }
        input[type="range"] { -webkit-appearance: none; }
        input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 10px; height: 10px; border-radius: 50%; background: ${ACCENT}; cursor: pointer; }
        input[type="range"]::-webkit-slider-runnable-track { height: 3px; background: #334155; border-radius: 2px; }
      `}</style>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          width: '100vw',
          background: BG_MAIN,
          color: '#f8fafc',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          overflow: 'hidden',
        }}
      >
        {/* PANEL 1: Transport Bar */}
        <TransportBar
          snapshot={snapshot}
          onBpmChange={handleBpmChange}
          onPlay={handlePlay}
          onStop={handleStop}
        />

        {/* Main content area */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

          {/* PANEL 2: Left mixer / track list */}
          <div
            style={{
              width: 280,
              flexShrink: 0,
              background: BG_PANEL,
              borderRight: '1px solid #1e293b',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Mixer header */}
            <div style={{
              height: 32,
              borderBottom: '1px solid #1e293b',
              display: 'flex',
              alignItems: 'center',
              padding: '0 12px',
              gap: 8,
              flexShrink: 0,
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 1 }}>
                Mixer
              </span>
              <span style={{ fontSize: 10, color: '#334155' }}>•</span>
              <span style={{ fontSize: 10, color: '#334155' }}>
                {snapshot.projectName}
              </span>
            </div>

            {/* Track strips */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {snapshot.tracks.map(track => (
                <TrackStrip
                  key={track.id}
                  track={track}
                  selected={selectedTrackId === track.id}
                  onSelect={() => setSelectedTrackId(prev => prev === track.id ? null : track.id)}
                  onVolumeChange={handleVolumeChange}
                  onMuteToggle={handleMuteToggle}
                  onPanReset={handlePanReset}
                />
              ))}
            </div>

            {/* Bus section */}
            <div style={{
              borderTop: '1px solid #1e293b',
              padding: 8,
              flexShrink: 0,
              background: '#080e1c',
            }}>
              <div style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Buses</div>
              {snapshot.buses.map(bus => (
                <div key={bus.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: '#94a3b8', flex: 1 }}>{bus.name}</span>
                  <div style={{ width: 60, height: 5, background: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${Math.min(100, (bus.peak ?? 0) * 100)}%`,
                      background: peakColor(bus.peak ?? 0),
                      transition: 'width 80ms linear',
                      borderRadius: 3,
                    }} />
                  </div>
                  <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#64748b', minWidth: 36 }}>
                    {dbLabel(bus.peak ?? 0)} dB
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* PANEL 3: Center — Clip Launcher / Arrangement */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
            {/* View toggle toolbar */}
            <div style={{
              height: 32,
              background: BG_PANEL,
              borderBottom: '1px solid #1e293b',
              display: 'flex',
              alignItems: 'center',
              padding: '0 12px',
              gap: 8,
              flexShrink: 0,
            }}>
              <button
                onClick={() => setArrangementView(false)}
                style={{
                  ...viewToggleBtn,
                  background: !arrangementView ? ACCENT : 'transparent',
                  color: !arrangementView ? '#fff' : '#64748b',
                  border: `1px solid ${!arrangementView ? ACCENT : '#334155'}`,
                }}
              >Clip Launcher</button>
              <button
                onClick={() => setArrangementView(true)}
                style={{
                  ...viewToggleBtn,
                  background: arrangementView ? ACCENT : 'transparent',
                  color: arrangementView ? '#fff' : '#64748b',
                  border: `1px solid ${arrangementView ? ACCENT : '#334155'}`,
                }}
              >Arrangement</button>

              {/* Config info */}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: '#334155' }}>
                  {snapshot.config.sampleRate / 1000}kHz / {snapshot.config.blockSize} buf / {snapshot.config.channelCount}ch
                </span>
              </div>
            </div>

            {/* Main view */}
            <div style={{ flex: 1, overflow: 'hidden' }}>
              {arrangementView
                ? <ArrangementView snapshot={snapshot} />
                : <ClipLauncher snapshot={snapshot} selectedTrackId={selectedTrackId} />
              }
            </div>
          </div>
        </div>

        {/* PANEL 4: Bottom — Stem Separator (collapsible) */}
        <div style={{
          background: BG_PANEL,
          borderTop: '1px solid #1e293b',
          flexShrink: 0,
          transition: 'height 250ms ease',
          height: stemOpen ? 200 : 38,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Toggle header */}
          <div
            onClick={() => setStemOpen(v => !v)}
            style={{
              height: 38,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              padding: '0 14px',
              cursor: 'pointer',
              gap: 8,
              borderBottom: stemOpen ? '1px solid #1e293b' : 'none',
              userSelect: 'none',
            }}
          >
            <span style={{ fontSize: 13 }}>🎵</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', letterSpacing: 0.5 }}>Stem Separator</span>
            <span style={{
              marginLeft: 'auto',
              fontSize: 12,
              color: '#475569',
              transform: stemOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 200ms',
              display: 'inline-block',
            }}>▼</span>
          </div>

          {/* Panel content */}
          {stemOpen && (
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <StemSeparatorPanel />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

const viewToggleBtn = {
  fontSize: 11,
  fontWeight: 600,
  padding: '3px 12px',
  borderRadius: 4,
  cursor: 'pointer',
  transition: 'all 150ms',
  letterSpacing: 0.3,
};
