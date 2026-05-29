import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../App';

const NAV_GROUPS = [
  {
    label: 'Team',
    items: [
      { to: '/home',        icon: '🏠', label: 'Home' },
      { to: '/assignments', icon: '📬', label: 'Assignments' },
      { to: '/setlist',     icon: '📋', label: 'Setlist' },
      { to: '/messages',    icon: '💬', label: 'Messages' },
      { to: '/blockout',    icon: '📅', label: 'Blockout Calendar' },
      { to: '/profile',     icon: '👤', label: 'Profile' },
    ],
  },
  {
    label: 'Performance',
    items: [
      { to: '/live-performance', icon: '🎤', label: 'Live Performance' },
      { to: '/lyrics',           icon: '📝', label: 'Lyrics View' },
      { to: '/setlist-runner',   icon: '▶️',  label: 'Setlist Runner' },
    ],
  },
  {
    label: 'Practice',
    items: [
      { to: '/practice', icon: '🎧', label: 'Personal Practice' },
      { to: '/daw',      icon: '🎛️', label: 'DAW Workspace' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { to: '/admin',          icon: '🔐', label: 'Admin Dashboard' },
      { to: '/leader',         icon: '👑', label: 'Leader Dashboard' },
      { to: '/content-editor', icon: '✏️',  label: 'Content Editor' },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/cinestage', icon: '🧠', label: 'CineStage Brain' },
      { to: '/feedback',  icon: '📊', label: 'Feedback' },
    ],
  },
];

export default function Sidebar() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <aside
      style={{
        width: 240,
        minWidth: 240,
        background: '#0f172a',
        borderRight: '1px solid #1e293b',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Logo — double as drag region for macOS title bar */}
      <div
        className="drag-region"
        style={{
          height: 40,
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 80,
          borderBottom: '1px solid #1e293b',
          flexShrink: 0,
        }}
      >
        <span
          className="no-drag"
          style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.01em' }}
        >
          🎵 Ultimate Musician
        </span>
      </div>

      {/* Scrollable nav */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {NAV_GROUPS.map((group) => (
          <div key={group.label} style={{ marginBottom: 4 }}>
            <p
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.08em',
                color: '#475569',
                textTransform: 'uppercase',
                padding: '10px 16px 4px',
                margin: 0,
              }}
            >
              {group.label}
            </p>
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '7px 16px',
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? '#e0e7ff' : '#94a3b8',
                  background: isActive ? '#312e81' : 'transparent',
                  borderRadius: 6,
                  margin: '1px 8px',
                  textDecoration: 'none',
                  transition: 'background 0.15s, color 0.15s',
                })}
                onMouseEnter={(e) => {
                  if (!e.currentTarget.getAttribute('data-active')) {
                    e.currentTarget.style.background = '#1e293b';
                    e.currentTarget.style.color = '#e2e8f0';
                  }
                }}
                onMouseLeave={(e) => {
                  // Let React Router re-apply active styles via the style prop on next render
                  // We only reset non-active items
                  const isActive = e.currentTarget.classList.contains('active') ||
                    window.location.hash.includes(item.to);
                  if (!isActive) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = '#94a3b8';
                  }
                }}
              >
                <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>{item.icon}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.label}
                </span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Logout button */}
      <div
        style={{
          padding: '12px 8px',
          borderTop: '1px solid #1e293b',
          flexShrink: 0,
        }}
      >
        <button
          onClick={handleLogout}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 16px',
            fontSize: 13,
            color: '#94a3b8',
            background: 'transparent',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'background 0.15s, color 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#450a0a';
            e.currentTarget.style.color = '#fca5a5';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = '#94a3b8';
          }}
        >
          <span style={{ fontSize: 14 }}>🚪</span>
          <span>Log out</span>
        </button>
      </div>
    </aside>
  );
}
