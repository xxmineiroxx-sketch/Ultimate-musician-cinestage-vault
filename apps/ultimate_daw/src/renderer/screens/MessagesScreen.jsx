/**
 * MessagesScreen — Desktop (Electron / React)
 *
 * Matches mobile MessagesScreen.js feature set:
 *  - GET  /sync/messages/replies?email=X  (8-second polling, quiet)
 *  - POST /sync/message  { fromEmail, fromName, subject, message, to:'admin' }
 *  - DELETE /sync/message?messageId=X&scope=viewer&email=X
 *  - isPersonalInboxMessage filter (user's own + all_team broadcasts)
 *  - Broadcast "Team" badge, unread dot, thread view, "Send Follow-up" UX
 *  - Right-click context menu or Delete button in thread view → confirmation dialog
 *  - Compose is always fixed to admin
 *  - Tailwind dark theme, 3-panel desktop layout
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../App';
import { SYNC_URL, syncHeaders } from '../config/syncConfig';

// ── helpers ────────────────────────────────────────────────────────────────

async function fetchJson(url, opts = {}) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    clearTimeout(tid);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(tid);
  }
}

function isPersonalInboxMessage(thread, email = '') {
  const norm = String(email || '').trim().toLowerCase();
  if (!thread || typeof thread !== 'object') return false;
  if (thread.visibility === 'admin_only' || thread.isSystemMsg) return false;
  return (
    (thread.fromEmail || '').toLowerCase() === norm ||
    thread.to === 'all_team' ||
    (thread.to || '').toLowerCase() === norm
  );
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diffH = Math.floor((now - d) / 3_600_000);
  if (diffH < 1) return 'Just now';
  if (diffH < 24) return `${diffH}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── ConfirmDialog ─────────────────────────────────────────────────────────

function ConfirmDialog({ open, title, message, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0B1120] border border-[#374151] rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h3 className="text-[#F9FAFB] font-bold text-lg mb-2">{title}</h3>
        <p className="text-[#9CA3AF] text-sm leading-relaxed mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-[#9CA3AF] hover:text-white bg-[#1F2937] hover:bg-[#374151] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ContextMenu ───────────────────────────────────────────────────────────

function ContextMenu({ x, y, onDelete, onClose }) {
  useEffect(() => {
    const handler = () => onClose();
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [onClose]);

  return (
    <div
      className="fixed z-50 bg-[#0B1120] border border-[#374151] rounded-xl shadow-2xl py-1 min-w-[160px]"
      style={{ top: y, left: x }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-[#1F2937] hover:text-red-300 transition-colors"
        onClick={() => { onDelete(); onClose(); }}
      >
        Delete from inbox
      </button>
    </div>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────

export default function MessagesScreen() {
  const { user, profile } = useAuth();

  // Derive email + display name from profile (preferred) or user fallback
  const email = profile?.email || user?.email || '';
  const displayName = [profile?.name, profile?.lastName].filter(Boolean).join(' ').trim()
    || user?.name
    || email;

  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [view, setView] = useState('inbox'); // 'inbox' | 'thread' | 'compose'
  const [selected, setSelected] = useState(null);

  // Compose fields
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  // Unread tracking
  const [unreadIds, setUnreadIds] = useState(new Set());
  const seenIdsRef = useRef(new Set());

  // Context menu
  const [ctxMenu, setCtxMenu] = useState(null); // { x, y, thread }

  // Confirm dialog
  const [confirmState, setConfirmState] = useState(null); // { thread } | null

  const pollingRef = useRef(null);

  // ── Data loading ────────────────────────────────────────────────────────

  const refreshInbox = useCallback(async (quiet = false) => {
    if (!email) return;
    if (!quiet) setLoading(true);
    try {
      const data = await fetchJson(
        `${SYNC_URL}/sync/messages/replies?email=${encodeURIComponent(email)}`,
        { headers: syncHeaders() },
      );
      const filtered = Array.isArray(data)
        ? data.filter((t) => isPersonalInboxMessage(t, email))
        : [];

      // Track newly arrived threads for the unread dot
      const freshIds = new Set();
      for (const t of filtered) {
        if (t.id && !seenIdsRef.current.has(t.id)) {
          freshIds.add(t.id);
        }
      }
      if (freshIds.size > 0) {
        seenIdsRef.current = new Set([...seenIdsRef.current, ...filtered.map((t) => t.id)]);
        setUnreadIds((prev) => new Set([...prev, ...freshIds]));
      }

      setThreads(filtered);
    } catch {
      // server unreachable — keep existing list
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [email]);

  useEffect(() => {
    if (!email) return;
    refreshInbox(false);
    pollingRef.current = setInterval(() => refreshInbox(true), 8000);
    return () => clearInterval(pollingRef.current);
  }, [email, refreshInbox]);

  // ── Compose / Send ──────────────────────────────────────────────────────

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) return;
    if (!email) return;
    setSending(true);
    try {
      await fetchJson(`${SYNC_URL}/sync/message`, {
        method: 'POST',
        headers: syncHeaders(),
        body: JSON.stringify({
          fromEmail: email,
          fromName: displayName,
          subject: subject.trim(),
          message: body.trim(),
          to: 'admin',
        }),
      });
      setSubject('');
      setBody('');
      setView('inbox');
      refreshInbox(false);
    } catch (e) {
      alert(`Could not send message: ${e.message}`);
    } finally {
      setSending(false);
    }
  };

  // ── Delete ──────────────────────────────────────────────────────────────

  const doDelete = async (thread) => {
    if (!thread?.id || !email) return;
    setDeleting(true);
    try {
      await fetchJson(
        `${SYNC_URL}/sync/message?messageId=${encodeURIComponent(thread.id)}&scope=viewer&email=${encodeURIComponent(email)}`,
        { method: 'DELETE', headers: syncHeaders() },
      );
      if (selected?.id === thread.id) { setSelected(null); setView('inbox'); }
      setUnreadIds((prev) => { const next = new Set(prev); next.delete(thread.id); return next; });
      await refreshInbox(false);
    } catch (e) {
      alert(`Could not delete: ${e.message}`);
    } finally {
      setDeleting(false);
      setConfirmState(null);
    }
  };

  const confirmDelete = (thread) => {
    setCtxMenu(null);
    setConfirmState({ thread });
  };

  // ── Context menu (right-click) ──────────────────────────────────────────

  const handleContextMenu = (e, thread) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, thread });
  };

  // ── Thread open ─────────────────────────────────────────────────────────

  const openThread = (thread) => {
    setSelected(thread);
    setView('thread');
    setUnreadIds((prev) => { const next = new Set(prev); next.delete(thread.id); return next; });
    seenIdsRef.current.add(thread.id);
  };

  // ── Views ───────────────────────────────────────────────────────────────

  const openCompose = (prefillSubject = '') => {
    setSubject(prefillSubject);
    setBody('');
    setView('compose');
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  const unreadCount = unreadIds.size;

  return (
    <div className="h-full flex flex-col bg-[#020617] text-white overflow-hidden">

      {/* ── Confirm dialog overlay ── */}
      <ConfirmDialog
        open={!!confirmState}
        title="Delete from your inbox?"
        message="This removes the thread only from your inbox. Admin records stay intact."
        onConfirm={() => doDelete(confirmState?.thread)}
        onCancel={() => setConfirmState(null)}
      />

      {/* ── Context menu ── */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onDelete={() => confirmDelete(ctxMenu.thread)}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {/* ── Header bar ── */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-[#1F2937]">
        <div className="flex items-center gap-3">
          <span className="text-2xl">💬</span>
          <div>
            <h1 className="text-lg font-bold text-[#F9FAFB]">Messages</h1>
            {email && <p className="text-xs text-[#6B7280]">{email}</p>}
          </div>
          {unreadCount > 0 && (
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white text-xs font-bold">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {view !== 'inbox' && (
            <button
              onClick={() => { setView('inbox'); setSelected(null); }}
              className="px-3 py-1.5 text-sm text-[#8B5CF6] hover:text-white border border-[#8B5CF6] hover:border-indigo-400 rounded-lg transition-colors"
            >
              ← Inbox
            </button>
          )}
          <button
            onClick={() => openCompose('')}
            className="px-4 py-2 text-sm font-semibold text-white bg-[#8B5CF6] hover:bg-indigo-500 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <span>✉️</span> New Message
          </button>
        </div>
      </div>

      {/* ── Body area ── */}
      <div className="flex-1 overflow-hidden flex">

        {/* ── LEFT: Inbox list (sidebar when in thread/compose view) ── */}
        <div className={`flex flex-col border-r border-[#1F2937] ${view === 'inbox' ? 'flex-1' : 'w-80 flex-shrink-0'}`}>
          {loading && (
            <div className="px-4 py-2 text-xs text-[#6B7280] flex items-center gap-2">
              <span className="inline-block w-3 h-3 border border-indigo-500 border-t-transparent rounded-full animate-spin" />
              Refreshing…
            </div>
          )}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {threads.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <span className="text-5xl mb-4">📭</span>
                <p className="text-[#F9FAFB] font-semibold text-lg mb-2">No Messages Yet</p>
                <p className="text-[#9CA3AF] text-sm max-w-xs leading-relaxed">
                  Send a message to your admin or manager using the button above.
                </p>
              </div>
            )}
            {threads.map((thread) => {
              const hasReply = (thread.replies?.length ?? 0) > 0;
              const lastReply = hasReply ? thread.replies[thread.replies.length - 1] : null;
              const isUnread = unreadIds.has(thread.id);
              const isActive = selected?.id === thread.id && view === 'thread';

              return (
                <div
                  key={thread.id}
                  onClick={() => openThread(thread)}
                  onContextMenu={(e) => handleContextMenu(e, thread)}
                  className={`cursor-pointer rounded-xl border p-4 transition-all select-none ${
                    isActive
                      ? 'bg-[#1E1B4B] border-indigo-500'
                      : hasReply
                        ? 'bg-[#0B1120] border-[#8B5CF6]/40 hover:border-[#8B5CF6]'
                        : 'bg-[#0B1120] border-[#374151] hover:border-[#6B7280]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <span className={`text-sm font-bold flex-1 truncate ${isUnread ? 'text-white' : 'text-[#F9FAFB]'}`}>
                      {isUnread && (
                        <span className="inline-block w-2 h-2 rounded-full bg-indigo-400 mr-1.5 align-middle mb-0.5" />
                      )}
                      {thread.subject}
                    </span>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {thread.to === 'all_team' && (
                        <span className="px-1.5 py-0.5 bg-emerald-900/60 border border-emerald-600 rounded text-[10px] font-bold text-emerald-400">
                          👥 Team
                        </span>
                      )}
                      <span className="text-[11px] text-[#6B7280] whitespace-nowrap">
                        {formatTime(thread.timestamp)}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-[#9CA3AF] line-clamp-2 mb-2">{thread.message}</p>

                  <div className="flex items-center justify-between">
                    {hasReply ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-[#8B5CF6] bg-[#8B5CF6]/10 text-[11px] font-semibold text-[#A78BFA]">
                        💬 {thread.replies.length} {thread.replies.length === 1 ? 'reply' : 'replies'}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#1F2937] text-[11px] text-[#6B7280]">
                        ⏳ Awaiting reply
                      </span>
                    )}
                    <span className="text-[10px] text-[#4B5563]">Right-click to delete</span>
                  </div>

                  {lastReply && (
                    <div className="mt-2 pt-2 border-t border-[#1F2937]">
                      <p className="text-xs text-[#9CA3AF] italic truncate">
                        <span className="font-bold text-[#818CF8]">{lastReply.from}:</span>{' '}
                        {lastReply.message}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── RIGHT: Thread view ── */}
        {view === 'thread' && selected && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Thread header */}
            <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-[#1F2937] bg-[#080F1E]">
              <div className="flex-1 min-w-0 mr-4">
                <h2 className="text-base font-bold text-[#F9FAFB] truncate">{selected.subject}</h2>
                <p className="text-xs text-[#6B7280] mt-0.5">{formatTime(selected.timestamp)}</p>
              </div>
              <button
                onClick={() => confirmDelete(selected)}
                disabled={deleting}
                className="px-3 py-1.5 text-sm font-semibold text-red-400 hover:text-red-300 border border-red-800 hover:border-red-600 rounded-lg transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Original message (from user) */}
              <div className="p-4 bg-[#0B1120] border border-[#374151] rounded-xl">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-bold text-[#9CA3AF]">You</span>
                  <span className="text-xs text-[#6B7280]">{formatTime(selected.timestamp)}</span>
                </div>
                <p className="text-sm text-[#E5E7EB] leading-relaxed">{selected.message}</p>
              </div>

              {/* Admin replies */}
              {(selected.replies || []).length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-[#6B7280] italic">Waiting for admin reply…</p>
                </div>
              ) : (
                (selected.replies || []).map((r) => (
                  <div key={r.id || r.timestamp} className="p-4 bg-[#1E1B4B] border border-indigo-700 rounded-xl">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-bold text-[#818CF8]">👤 {r.from}</span>
                      <span className="text-xs text-[#6B7280]">{formatTime(r.timestamp)}</span>
                    </div>
                    <p className="text-sm text-[#E5E7EB] leading-relaxed">{r.message}</p>
                  </div>
                ))
              )}
            </div>

            {/* Footer: Send Follow-up */}
            <div className="flex-shrink-0 px-6 py-4 border-t border-[#1F2937]">
              <button
                onClick={() => openCompose(`Re: ${selected.subject}`)}
                className="w-full py-3 rounded-xl text-sm font-bold text-white bg-[#8B5CF6] hover:bg-indigo-500 transition-colors"
              >
                ↩ Send Follow-up
              </button>
            </div>
          </div>
        )}

        {/* ── RIGHT: Compose view ── */}
        {view === 'compose' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Compose header */}
            <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-[#1F2937] bg-[#080F1E]">
              <h2 className="text-base font-bold text-[#F9FAFB]">New Message</h2>
              <button
                onClick={handleSend}
                disabled={sending || !subject.trim() || !body.trim() || !email}
                className="px-4 py-2 text-sm font-semibold text-white bg-[#8B5CF6] hover:bg-indigo-500 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>

            {/* Compose body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* To (fixed) */}
              <div className="flex items-center gap-3">
                <span className="text-sm text-[#9CA3AF] font-semibold w-14">To:</span>
                <span className="px-3 py-1.5 bg-[#1E1B4B] border border-indigo-700 rounded-full text-sm font-semibold text-[#A5B4FC]">
                  👤 Admin / Manager
                </span>
              </div>

              {/* From */}
              {email ? (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-[#9CA3AF] font-semibold w-14">From:</span>
                  <span className="text-sm text-[#6B7280]">{email}</span>
                </div>
              ) : (
                <div className="p-3 bg-orange-900/20 border border-orange-600 rounded-lg">
                  <p className="text-sm text-orange-400">Set your email in Profile to send messages.</p>
                </div>
              )}

              <p className="text-xs text-[#6B7280] leading-relaxed">
                Messages is your personal inbox. Team-wide broadcasts and the shared admin inbox stay in Admin Dashboard.
              </p>

              {/* Subject */}
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject"
                className="w-full px-4 py-3 bg-[#0B1120] border border-[#374151] rounded-xl text-[#F9FAFB] placeholder-[#6B7280] text-sm focus:outline-none focus:border-indigo-500 transition-colors"
              />

              {/* Body */}
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your message…"
                rows={10}
                className="w-full px-4 py-3 bg-[#0B1120] border border-[#374151] rounded-xl text-[#F9FAFB] placeholder-[#6B7280] text-sm focus:outline-none focus:border-indigo-500 transition-colors resize-none leading-relaxed"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
