import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { SYNC_URL, syncHeaders } from '../config/syncConfig';

const POLL_MS = 2000;

function extractYouTubeId(url) {
  if (!url) return null;
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

function Spinner() {
  return (
    <svg className="animate-spin h-8 w-8 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

export default function LivePerformanceScreen() {
  const navigate = useNavigate();
  const [liveData, setLiveData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sectionIndex, setSectionIndex] = useState(0);
  const pollRef = useRef(null);
  const prevSongId = useRef(null);

  const fetchLiveStatus = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res = await fetch(`${SYNC_URL}/sync/live-status`, { headers: syncHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLiveData((prev) => {
        const newId = data?.songId || data?.id;
        if (newId && newId !== prevSongId.current) {
          setSectionIndex(0);
          prevSongId.current = newId;
        }
        return data;
      });
      setError('');
    } catch (err) {
      if (!quiet) setError('Could not connect to live status.');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLiveStatus(false);
    pollRef.current = setInterval(() => fetchLiveStatus(true), POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [fetchLiveStatus]);

  const sections = liveData?.sections || liveData?.lyrics || [];
  const currentSection = sections[sectionIndex] || null;
  const hasPrev = sectionIndex > 0;
  const hasNext = sectionIndex < sections.length - 1;
  const videoId = extractYouTubeId(liveData?.youtubeUrl || liveData?.youtube_url);

  const handlePrev = () => { if (hasPrev) setSectionIndex((i) => i - 1); };
  const handleNext = () => { if (hasNext) setSectionIndex((i) => i + 1); };

  // Unified keyboard handler: ESC + section navigation
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') navigate(-1);
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate, sectionIndex, sections.length]);

  // Loading state
  if (loading) {
    return (
      <div className="h-full bg-black flex flex-col items-center justify-center gap-6">
        <Spinner />
        <p className="text-slate-400 text-lg">Connecting to live feed…</p>
      </div>
    );
  }

  // Error state
  if (error && !liveData) {
    return (
      <div className="h-full bg-black flex flex-col items-center justify-center gap-6 px-8 text-center">
        <div className="w-16 h-16 rounded-full bg-red-900/30 flex items-center justify-center">
          <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.924-.833-2.694 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <div>
          <p className="text-white text-xl font-semibold">No live feed</p>
          <p className="text-slate-400 mt-2">{error}</p>
        </div>
        <button
          onClick={() => navigate(-1)}
          className="mt-4 text-slate-400 hover:text-white text-sm transition"
        >
          Go back
        </button>
      </div>
    );
  }

  // Lyrics text for current section
  const sectionLabel = currentSection?.label || currentSection?.name || currentSection?.type || '';
  const sectionText = currentSection?.text || currentSection?.lyrics || currentSection?.content || '';
  const allLyrics = typeof sections === 'string' ? sections : null;

  return (
    <div className="h-full bg-black flex flex-col overflow-hidden select-none">
      {/* Top bar — minimal */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 bg-black/80 border-b border-white/5">
        <button
          onClick={() => navigate(-1)}
          className="text-slate-500 hover:text-white transition flex items-center gap-1.5 text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        {/* Live indicator */}
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-slate-400 text-xs uppercase tracking-widest">Live</span>
        </div>

        {/* BPM */}
        {(liveData?.bpm || liveData?.tempo) && (
          <div className="flex items-center gap-1.5 bg-white/5 px-3 py-1 rounded-full">
            <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-white font-mono text-sm">{liveData.bpm || liveData.tempo} BPM</span>
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* YouTube panel (left, if video present) */}
        {videoId && (
          <div className="w-[45%] flex-shrink-0 bg-black flex items-center justify-center border-r border-white/5 p-4">
            <div className="w-full" style={{ aspectRatio: '16/9' }}>
              <iframe
                className="w-full h-full rounded-xl"
                src={`https://www.youtube.com/embed/${videoId}?autoplay=0&playsinline=1&controls=1`}
                title="Now Playing"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        )}

        {/* Lyrics panel */}
        <div className={`flex-1 flex flex-col items-center justify-center px-10 py-8 ${videoId ? '' : 'max-w-4xl mx-auto w-full'}`}>
          {/* Song title */}
          <div className="text-center mb-10">
            <h1 className="text-white font-bold text-5xl leading-tight tracking-tight mb-3">
              {liveData?.title || liveData?.songTitle || 'Untitled'}
            </h1>
            {(liveData?.key || liveData?.songKey) && (
              <div className="inline-flex items-center gap-2 bg-indigo-600/20 border border-indigo-600/40 rounded-full px-5 py-1.5 mt-2">
                <span className="text-indigo-300 text-sm uppercase tracking-widest">Key</span>
                <span className="text-white font-bold text-xl">{liveData.key || liveData.songKey}</span>
              </div>
            )}
          </div>

          {/* Section label */}
          {sectionLabel && (
            <div className="mb-6">
              <span className="text-indigo-400 text-sm font-semibold uppercase tracking-[0.2em] border border-indigo-500/40 rounded-full px-4 py-1">
                {sectionLabel}
              </span>
            </div>
          )}

          {/* Lyrics text */}
          <div className="text-center flex-1 flex items-center">
            {sectionText ? (
              <p className="text-white leading-relaxed whitespace-pre-line" style={{ fontSize: '3rem', lineHeight: '1.4' }}>
                {sectionText}
              </p>
            ) : allLyrics ? (
              <p className="text-white leading-relaxed whitespace-pre-line" style={{ fontSize: '2.5rem', lineHeight: '1.4' }}>
                {allLyrics}
              </p>
            ) : (
              <p className="text-slate-600 text-2xl italic">No lyrics for this section</p>
            )}
          </div>

          {/* Section navigation */}
          {sections.length > 0 && (
            <div className="mt-12 flex items-center gap-6">
              <button
                onClick={handlePrev}
                disabled={!hasPrev}
                className="w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-20 disabled:cursor-not-allowed text-white transition flex items-center justify-center"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              {/* Section dots */}
              <div className="flex gap-2">
                {sections.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setSectionIndex(i)}
                    className={`rounded-full transition ${i === sectionIndex ? 'w-6 h-2 bg-indigo-500' : 'w-2 h-2 bg-white/20 hover:bg-white/40'}`}
                  />
                ))}
              </div>

              <button
                onClick={handleNext}
                disabled={!hasNext}
                className="w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-20 disabled:cursor-not-allowed text-white transition flex items-center justify-center"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}

          <p className="mt-4 text-slate-600 text-xs">← → arrow keys to navigate · ESC to exit</p>
        </div>
      </div>
    </div>
  );
}
