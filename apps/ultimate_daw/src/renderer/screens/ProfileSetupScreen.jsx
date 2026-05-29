import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SYNC_URL, syncHeaders } from '../config/syncConfig';
import { store } from '../services/store';
import { useAuth } from '../App';

const ROLES = [
  'Lead Vocals',
  'BGV 1',
  'BGV 2',
  'BGV 3',
  'Keys',
  'Guitar',
  'Bass',
  'Drums',
  'Sound Tech',
  'Lighting',
  'Media Tech',
  'Worship Leader',
  'Music Director',
];

function Avatar({ firstName, lastName, photoUrl }) {
  const initials = `${(firstName || '?')[0]}${(lastName || '')[0] || ''}`.toUpperCase();
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt="Profile"
        className="w-20 h-20 rounded-full object-cover border-2 border-indigo-500/40"
      />
    );
  }
  return (
    <div className="w-20 h-20 rounded-full bg-indigo-600/30 border-2 border-indigo-500/40 flex items-center justify-center">
      <span className="text-2xl font-bold text-indigo-300">{initials}</span>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

const inputClass =
  'w-full bg-[#0f172a] border border-[#1e293b] text-white placeholder-slate-500 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 transition-colors';

const readonlyClass =
  'w-full bg-[#020617] border border-[#1e293b] text-slate-500 rounded-lg px-3 py-2.5 text-sm cursor-not-allowed';

export default function ProfileSetupScreen() {
  const navigate = useNavigate();
  const { setProfile, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState('');
  const [selectedRoles, setSelectedRoles] = useState([]);
  const [photoUrl, setPhotoUrl] = useState('');
  const [memberSince, setMemberSince] = useState(null);
  const [grantedRole, setGrantedRole] = useState('');

  // ── Load profile ────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        // Load from store first
        const stored = await store.getProfile();
        if (stored) applyProfile(stored);

        // Sync from server — match this user in /sync/people by email or id
        const storedUser = await store.getUser();
        const lookupEmail = (storedUser?.email || storedUser?.identifier || '').toLowerCase().trim();
        const lookupId = storedUser?.id || storedUser?.userId || '';

        const res = await fetch(`${SYNC_URL}/sync/people`, { headers: syncHeaders() });
        if (res.ok) {
          const payload = await res.json();
          const list = Array.isArray(payload) ? payload : (payload.people || payload.members || []);
          const me = list.find(p =>
            (lookupEmail && (p.email || '').toLowerCase().trim() === lookupEmail) ||
            (lookupId && p.id === lookupId)
          );
          if (me) {
            const p = { ...me, email: me.email || lookupEmail };
            applyProfile(p);
            await store.setProfile(p);
            setProfile(p);
          } else {
            // Fallback: org owner may not be in /sync/people — try /sync/profile
            const r2 = await fetch(`${SYNC_URL}/sync/profile`, { headers: syncHeaders() });
            if (r2.ok) {
              const d2 = await r2.json();
              const p2 = { ...(d2.profile || d2), email: lookupEmail };
              applyProfile(p2);
              await store.setProfile(p2);
              setProfile(p2);
            }
          }
        }
      } catch (err) {
        setError(`Could not load profile: ${err.message}`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function applyProfile(p) {
    setFirstName(p.firstName || p.first_name || p.name || '');
    setLastName(p.lastName || p.last_name || '');
    setEmail(p.email || '');
    setPhone(p.phone || '');
    setDob(p.dob || p.date_of_birth || p.dateOfBirth || '');
    setSelectedRoles(p.roles || p.instruments || []);
    setPhotoUrl(p.photoUrl || p.photo_url || p.avatar || '');
    setMemberSince(p.created_at || p.createdAt || p.memberSince || null);
    setGrantedRole(p.grantedRole || p.granted_role || '');
  }

  function toggleRole(role) {
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  }

  async function handlePhotoUpload() {
    if (!window.umDesktop?.file?.openImage) {
      setError('Photo upload is only available in the desktop app.');
      return;
    }
    try {
      setUploadingPhoto(true);
      const result = await window.umDesktop.file.openImage();
      if (result) setPhotoUrl(result);
    } catch (err) {
      setError(`Photo upload failed: ${err.message}`);
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleSave() {
    try {
      setSaving(true);
      setError(null);
      setSuccess(false);

      const payload = {
        firstName,
        lastName,
        phone,
        dob,
        roles: selectedRoles,
        photoUrl,
      };

      const res = await fetch(`${SYNC_URL}/sync/profile`, {
        method: 'POST',
        headers: syncHeaders(),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { const b = await res.json(); msg = b.message || b.error || msg; } catch { /* ignore */ }
        throw new Error(msg);
      }

      const data = await res.json();
      const saved = data.profile || data;
      const merged = { ...saved, email, grantedRole };
      await store.setProfile(merged);
      setProfile(merged);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#020617]">
        <div className="text-center space-y-3">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-400 text-sm">Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#020617] p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div>
          <h1 className="text-2xl font-bold text-white">Profile</h1>
          <p className="text-slate-400 text-sm mt-0.5">Manage your personal information and roles</p>
        </div>

        {/* ── Alerts ──────────────────────────────────────────────────── */}
        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
            Profile saved successfully.
          </div>
        )}

        {/* ── Avatar + meta ────────────────────────────────────────────── */}
        <div className="p-5 rounded-xl bg-[#0f172a] border border-[#1e293b]">
          <div className="flex items-center gap-5">
            <div className="relative">
              <Avatar firstName={firstName} lastName={lastName} photoUrl={photoUrl} />
              <button
                onClick={handlePhotoUpload}
                disabled={uploadingPhoto}
                className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-indigo-600 hover:bg-indigo-500 border-2 border-[#0f172a] flex items-center justify-center transition-colors"
              >
                {uploadingPhoto ? (
                  <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
            </div>
            <div className="space-y-1">
              <p className="text-white font-semibold">{firstName} {lastName}</p>
              <p className="text-slate-400 text-sm">{email}</p>
              {memberSince && (
                <p className="text-slate-500 text-xs">
                  Member since {new Date(memberSince).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </p>
              )}
              {grantedRole && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 capitalize">
                  {grantedRole.replace(/_/g, ' ')}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Personal info ────────────────────────────────────────────── */}
        <div className="p-5 rounded-xl bg-[#0f172a] border border-[#1e293b] space-y-4">
          <h2 className="text-white font-semibold text-sm">Personal Information</h2>

          <div className="grid grid-cols-2 gap-4">
            <Field label="First Name">
              <input
                className={inputClass}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
              />
            </Field>
            <Field label="Last Name">
              <input
                className={inputClass}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name"
              />
            </Field>
          </div>

          <Field label="Email (read-only)">
            <input className={readonlyClass} value={email} readOnly />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Phone">
              <input
                className={inputClass}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (555) 000-0000"
                type="tel"
              />
            </Field>
            <Field label="Date of Birth">
              <input
                className={inputClass}
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                type="date"
              />
            </Field>
          </div>
        </div>

        {/* ── Roles ────────────────────────────────────────────────────── */}
        <div className="p-5 rounded-xl bg-[#0f172a] border border-[#1e293b] space-y-4">
          <div>
            <h2 className="text-white font-semibold text-sm">Roles & Instruments</h2>
            <p className="text-slate-500 text-xs mt-0.5">Select all that apply to you</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {ROLES.map((role) => {
              const active = selectedRoles.includes(role);
              return (
                <button
                  key={role}
                  onClick={() => toggleRole(role)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                    active
                      ? 'bg-indigo-600/30 border-indigo-500/50 text-indigo-300'
                      : 'bg-transparent border-[#1e293b] text-slate-400 hover:border-slate-600 hover:text-slate-300'
                  }`}
                >
                  {role}
                </button>
              );
            })}
          </div>
          {selectedRoles.length > 0 && (
            <p className="text-slate-500 text-xs">
              Selected: {selectedRoles.join(', ')}
            </p>
          )}
        </div>

        {/* ── Actions ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4">
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 hover:text-red-300 font-medium text-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Log Out
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Save Profile
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
