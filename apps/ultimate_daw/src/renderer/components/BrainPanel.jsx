import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useBrain } from '../context/BrainContext';

const STATUS_DOT = {
  online:   'bg-emerald-400 animate-pulse',
  degraded: 'bg-amber-400 animate-pulse',
  offline:  'bg-slate-500',
};

const STATUS_LABEL = {
  online:   'Online',
  degraded: 'Degraded',
  offline:  'Offline',
};

function ChatMessage({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
          isUser
            ? 'bg-indigo-600 text-white rounded-br-sm'
            : msg.isError
            ? 'bg-red-500/15 border border-red-500/30 text-red-300 rounded-bl-sm'
            : 'bg-[#1e293b] text-slate-200 rounded-bl-sm'
        }`}
      >
        {msg.content}
      </div>
    </div>
  );
}

export default function BrainPanel() {
  const {
    status,
    capabilities,
    events,
    chatLog,
    queryLoading,
    isPanelOpen,
    screenContext,
    queryBrain,
    closePanel,
    reconnect,
  } = useBrain();

  const [tab, setTab] = useState('chat');
  const [input, setInput] = useState('');
  const chatEndRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (isPanelOpen && tab === 'chat') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatLog, isPanelOpen, tab]);

  useEffect(() => {
    if (!isPanelOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') closePanel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isPanelOpen, closePanel]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || queryLoading) return;
    setInput('');
    queryBrain(trimmed);
  }, [input, queryLoading, queryBrain]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isPanelOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={closePanel}
      />

      {/* Panel */}
      <div
        className="fixed right-0 top-0 h-full w-96 z-50 flex flex-col"
        style={{ background: '#0f172a', borderLeft: '1px solid #1e293b' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e293b] flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-base">🧠</span>
            <span className="text-white font-semibold text-sm">CineStage Brain</span>
            <span className={`w-2 h-2 rounded-full ${STATUS_DOT[status]}`} />
            <span className="text-xs text-slate-500">{STATUS_LABEL[status]}</span>
          </div>
          <div className="flex items-center gap-2">
            {status === 'offline' && (
              <button
                onClick={reconnect}
                className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-[#1e293b] transition-colors"
              >
                Reconnect
              </button>
            )}
            <button
              onClick={closePanel}
              className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-[#1e293b] transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Screen context badge */}
        {screenContext?.screen && (
          <div className="px-4 py-2 border-b border-[#1e293b] flex-shrink-0">
            <span className="text-xs text-slate-500">
              Context: <span className="text-indigo-400 capitalize">{screenContext.screen.replace(/-/g, ' ')}</span>
            </span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-[#1e293b] flex-shrink-0">
          {['chat', 'events', 'capabilities'].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 text-xs font-medium capitalize transition-colors ${
                tab === t
                  ? 'text-indigo-300 border-b-2 border-indigo-500'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {tab === 'chat' && (
            <div className="p-4">
              {chatLog.length === 0 ? (
                <div className="text-center py-12 space-y-2">
                  <div className="text-3xl">🧠</div>
                  <p className="text-slate-400 text-sm">Ask CineStage Brain anything about your team, setlist, or upcoming service.</p>
                  {screenContext?.screen && (
                    <p className="text-slate-600 text-xs">
                      I have context from: {screenContext.screen}
                    </p>
                  )}
                </div>
              ) : (
                chatLog.map((msg, i) => <ChatMessage key={i} msg={msg} />)
              )}
              {queryLoading && (
                <div className="flex justify-start mb-3">
                  <div className="bg-[#1e293b] rounded-xl rounded-bl-sm px-4 py-3 flex items-center gap-2">
                    <div className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce"
                          style={{ animationDelay: `${i * 0.15}s` }}
                        />
                      ))}
                    </div>
                    <span className="text-xs text-slate-500">Thinking...</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}

          {tab === 'events' && (
            <div className="p-4 space-y-2">
              {events.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-8">No events yet.</p>
              ) : (
                events.map((evt, i) => (
                  <div key={i} className="p-3 rounded-lg bg-[#1e293b] border border-[#334155]">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-indigo-300">{evt.type}</span>
                      <span className="text-xs text-slate-600">
                        {new Date(evt.ts).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 break-all">
                      {typeof evt.content === 'string' ? evt.content : JSON.stringify(evt.content)}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'capabilities' && (
            <div className="p-4 space-y-2">
              {capabilities.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-8">
                  {status === 'offline' ? 'Connect to load capabilities.' : 'Loading...'}
                </p>
              ) : (
                capabilities.map((cap, i) => (
                  <div key={i} className="p-3 rounded-lg bg-[#1e293b] border border-[#334155]">
                    <p className="text-sm font-medium text-white">{cap.name || cap.title || cap}</p>
                    {cap.description && (
                      <p className="text-xs text-slate-400 mt-1">{cap.description}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Input */}
        {tab === 'chat' && (
          <div className="p-4 border-t border-[#1e293b] flex-shrink-0">
            <div className="flex gap-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Ask the Brain..."
                rows={2}
                className="flex-1 bg-[#1e293b] border border-[#334155] text-white placeholder-slate-600 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40"
                disabled={status === 'offline'}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || queryLoading || status === 'offline'}
                className="w-10 h-10 self-end flex items-center justify-center rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors flex-shrink-0"
              >
                {queryLoading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                )}
              </button>
            </div>
            <p className="text-xs text-slate-600 mt-1.5">Enter to send · Shift+Enter for newline</p>
          </div>
        )}
      </div>
    </>
  );
}
