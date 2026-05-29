import React, { useState, useEffect } from 'react';
import { SYNC_URL, syncHeaders } from '../config/syncConfig';
import { store } from '../services/store';

const ISSUE_TYPES = [
  { value: 'bug', label: 'Bug Report', icon: '🐛', color: 'text-red-400 border-red-500/30 bg-red-500/10' },
  { value: 'feature', label: 'Feature Request', icon: '✨', color: 'text-indigo-400 border-indigo-500/30 bg-indigo-500/10' },
  { value: 'general', label: 'General Feedback', icon: '💬', color: 'text-slate-300 border-slate-600 bg-slate-700/30' },
  { value: 'crash', label: 'Crash Report', icon: '💥', color: 'text-orange-400 border-orange-500/30 bg-orange-500/10' },
];

const PRIORITIES = [
  { value: 'low', label: 'Low', color: 'text-slate-400 border-slate-600 bg-slate-700/30' },
  { value: 'medium', label: 'Medium', color: 'text-amber-400 border-amber-500/30 bg-amber-500/10' },
  { value: 'high', label: 'High', color: 'text-orange-400 border-orange-500/30 bg-orange-500/10' },
  { value: 'critical', label: 'Critical', color: 'text-red-400 border-red-500/30 bg-red-500/10' },
];

function HistoryItem({ item }) {
  const typeInfo = ISSUE_TYPES.find((t) => t.value === item.type) || ISSUE_TYPES[2];
  const priorityInfo = PRIORITIES.find((p) => p.value === item.priority) || PRIORITIES[0];
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span>{typeInfo.icon}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full border ${typeInfo.color}`}>{typeInfo.label}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full border ${priorityInfo.color}`}>{priorityInfo.label}</span>
        </div>
        <span className="text-slate-500 text-xs">{item.submittedAt ? new Date(item.submittedAt).toLocaleDateString() : 'Recent'}</span>
      </div>
      <p className="text-slate-300 text-sm leading-relaxed line-clamp-3">{item.description}</p>
      {item.screenshot && (
        <p className="text-slate-500 text-xs mt-2">📎 Screenshot attached</p>
      )}
    </div>
  );
}

export default function FeedbackScreen() {
  const [issueType, setIssueType] = useState('bug');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [screenshotPath, setScreenshotPath] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const [history, setHistory] = useState([]);

  useEffect(() => {
    // Load feedback history from local store
    store.get('feedback_history').then((data) => {
      if (Array.isArray(data)) setHistory(data);
    }).catch(() => {});
  }, []);

  const handleOpenScreenshot = async () => {
    try {
      const filePath = await window.umDesktop.file.openImage();
      if (filePath) setScreenshotPath(filePath);
    } catch (err) {
      setError(`Could not open image: ${err.message}`);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!description.trim()) {
      setError('Description is required.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const payload = {
        type: issueType,
        description: description.trim(),
        priority,
        screenshot: screenshotPath || undefined,
        appVersion: '1.0.0',
        platform: 'desktop',
      };

      const res = await fetch(`${SYNC_URL}/sync/feedback`, {
        method: 'POST',
        headers: syncHeaders(),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.message || `HTTP ${res.status}`);
      }

      // Persist to local history
      const newEntry = { ...payload, submittedAt: new Date().toISOString(), id: Date.now() };
      const updatedHistory = [newEntry, ...history].slice(0, 20); // keep last 20
      setHistory(updatedHistory);
      await store.set('feedback_history', updatedHistory);

      setSubmitted(true);
      setDescription('');
      setScreenshotPath('');
      setIssueType('bug');
      setPriority('medium');
    } catch (err) {
      setError(`Submission failed: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendAnother = () => {
    setSubmitted(false);
    setError('');
  };

  return (
    <div className="min-h-screen bg-[#020617] text-white">
      {/* Header */}
      <div className="border-b border-slate-800 px-6 py-4">
        <h1 className="text-xl font-bold">Feedback &amp; Support</h1>
        <p className="text-slate-400 text-sm">Help us improve Ultimate Musician</p>
      </div>

      <div className="px-6 py-6 grid grid-cols-5 gap-6">
        {/* Form */}
        <div className="col-span-3">
          {submitted ? (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-10 text-center">
              <div className="text-5xl mb-4">🎉</div>
              <h2 className="text-white text-2xl font-bold mb-2">Thank you for your feedback!</h2>
              <p className="text-slate-400 text-sm mb-6">We appreciate you taking the time to help us improve. Our team will review your submission shortly.</p>
              <button
                onClick={handleSendAnother}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg px-6 py-2.5 text-sm transition"
              >
                Send Another
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="bg-red-900/30 border border-red-800 text-red-300 text-sm rounded-lg px-4 py-3">{error}</div>
              )}

              {/* Issue Type */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">Issue Type</h3>
                <div className="grid grid-cols-2 gap-3">
                  {ISSUE_TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setIssueType(t.value)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition ${
                        issueType === t.value
                          ? t.color + ' border-2'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                      }`}
                    >
                      <span className="text-xl">{t.icon}</span>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <label className="block text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">
                  Description *
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={
                    issueType === 'bug'
                      ? 'Describe what happened, what you expected, and steps to reproduce…'
                      : issueType === 'crash'
                      ? 'Describe what you were doing before the crash, any error messages shown…'
                      : issueType === 'feature'
                      ? "Describe the feature you'd like and why it would be helpful…"
                      : 'Share your thoughts, suggestions, or general feedback…'
                  }
                  rows={7}
                  className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-4 py-3 text-sm resize-none focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                />
                <p className="text-slate-600 text-xs mt-2">{description.length} characters</p>
              </div>

              {/* Priority */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">Priority</h3>
                <div className="flex gap-2">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setPriority(p.value)}
                      className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition ${
                        priority === p.value
                          ? p.color + ' border-2'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Screenshot */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">Screenshot (Optional)</h3>
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={handleOpenScreenshot}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-lg px-4 py-2.5 border border-slate-700 transition"
                  >
                    📎 Attach Screenshot
                  </button>
                  {screenshotPath ? (
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-400 text-xs">✓</span>
                      <span className="text-slate-400 text-xs truncate max-w-xs" title={screenshotPath}>
                        {screenshotPath.split('/').pop() || screenshotPath}
                      </span>
                      <button
                        type="button"
                        onClick={() => setScreenshotPath('')}
                        className="text-slate-500 hover:text-red-400 text-xs transition"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <span className="text-slate-500 text-xs">No file selected</span>
                  )}
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={submitting || !description.trim()}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-3.5 text-sm transition flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Submitting…
                  </>
                ) : 'Submit Feedback'}
              </button>
            </form>
          )}
        </div>

        {/* History Sidebar */}
        <div className="col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold">Recent Submissions</h2>
            {history.length > 0 && (
              <button
                onClick={async () => {
                  setHistory([]);
                  await store.set('feedback_history', []);
                }}
                className="text-slate-500 hover:text-red-400 text-xs transition"
              >
                Clear all
              </button>
            )}
          </div>
          {history.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
              <p className="text-3xl mb-3">📭</p>
              <p className="text-slate-500 text-sm">No submissions yet.</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
              {history.map((item) => <HistoryItem key={item.id || item.submittedAt} item={item} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
