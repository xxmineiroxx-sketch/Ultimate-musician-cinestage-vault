import React from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../App';
import { useBrain } from '../context/BrainContext';

const ROUTE_TITLES = {
  '/home':             'Home',
  '/profile':          'Profile',
  '/assignments':      'Assignments',
  '/blockout':         'Blockout Calendar',
  '/setlist':          'Setlist',
  '/messages':         'Messages',
  '/live-performance': 'Live Performance',
  '/lyrics':           'Lyrics View',
  '/setlist-runner':   'Setlist Runner',
  '/admin':            'Admin Dashboard',
  '/leader':           'Leader Dashboard',
  '/content-editor':   'Content Editor',
  '/practice':         'Personal Practice',
  '/cinestage':        'CineStage Brain',
  '/feedback':         'Feedback',
  '/daw':              'DAW Workspace',
};

function getInitial(user) {
  if (!user) return '?';
  const name =
    user.displayName ||
    user.name ||
    user.fullName ||
    user.email ||
    '';
  return name.charAt(0).toUpperCase() || '?';
}

function getDisplayName(user) {
  if (!user) return '';
  return (
    user.displayName ||
    user.name ||
    user.fullName ||
    user.email ||
    'User'
  );
}

const BRAIN_DOT = {
  connecting: { color: '#fbbf24', pulse: true },
  online:     { color: '#34d399', pulse: true },
  degraded:   { color: '#fbbf24', pulse: true },
  offline:    { color: '#475569', pulse: false },
};

export default function TopBar() {
  const location = useLocation();
  const { user } = useAuth();
  const brain = useBrain();

  const title = ROUTE_TITLES[location.pathname] ?? 'Ultimate Musician';
  const initial = getInitial(user);
  const displayName = getDisplayName(user);

  return (
    <header
      className="drag-region"
      style={{
        height: 40,
        minHeight: 40,
        background: '#020617',
        borderBottom: '1px solid #1e293b',
        display: 'flex',
        alignItems: 'center',
        flexShrink: 0,
        position: 'relative',
        userSelect: 'none',
      }}
    >
      {/* macOS traffic-light spacer (hiddenInset titlebar) */}
      <div
        className="no-drag"
        style={{ width: 80, flexShrink: 0 }}
      />

      {/* Centered route title */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: 13,
          fontWeight: 600,
          color: '#e2e8f0',
          letterSpacing: '-0.01em',
          whiteSpace: 'nowrap',
        }}
      >
        {title}
      </div>

      {/* Right: Brain button + user info */}
      <div
        className="no-drag"
        style={{
          marginLeft: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          paddingRight: 16,
        }}
      >
        {/* Brain status + button */}
        {brain && (
          <button
            onClick={() => brain.openPanel()}
            title={`CineStage Brain — ${brain.status}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '3px 8px',
              borderRadius: 6,
              border: '1px solid #1e293b',
              background: brain.isPanelOpen ? '#312e81' : 'transparent',
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { if (!brain.isPanelOpen) e.currentTarget.style.background = '#1e293b'; }}
            onMouseLeave={(e) => { if (!brain.isPanelOpen) e.currentTarget.style.background = 'transparent'; }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: BRAIN_DOT[brain.status]?.color ?? '#475569',
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 12, color: '#94a3b8' }}>🧠</span>
          </button>
        )}

        {displayName && (
          <span
            style={{
              fontSize: 12,
              color: '#64748b',
              maxWidth: 140,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {displayName}
          </span>
        )}
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: '#4F46E5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 700,
            color: '#fff',
            flexShrink: 0,
          }}
        >
          {initial}
        </div>
      </div>
    </header>
  );
}
