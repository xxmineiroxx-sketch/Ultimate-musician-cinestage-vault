import React, { useEffect, useMemo, useState } from 'react';

const api = window.umDesktop?.stemHub;

const WORKER_MODES = {
  account_desktop: 'Account desktop',
  backup_worker: 'Backup laptop',
  library_server: 'Library server',
};

function Stat({ label, value }) {
  return (
    <div className="border border-slate-800 bg-slate-950 px-4 py-3">
      <p className="text-[10px] uppercase tracking-widest text-slate-500 font-black">{label}</p>
      <p className="mt-1 text-2xl font-black text-white">{value}</p>
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center justify-between gap-4 border border-slate-800 bg-slate-950 px-4 py-3">
      <span className="text-sm font-semibold text-slate-200">{label}</span>
      <input
        type="checkbox"
        checked={Boolean(checked)}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 accent-indigo-500"
      />
    </label>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</span>
      <input
        type={type}
        value={value || ''}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
      />
    </label>
  );
}

export default function CineStageHubScreen() {
  const [config, setConfig] = useState(null);
  const [index, setIndex] = useState(null);
  const [scanState, setScanState] = useState('idle');
  const [message, setMessage] = useState('');
  const [previewSong, setPreviewSong] = useState({ artist: 'Elevation Worship', album: 'Can You Imagine', title: 'Praise' });
  const [preview, setPreview] = useState(null);
  const [matchQuery, setMatchQuery] = useState({ artist: '', title: '' });
  const [match, setMatch] = useState(null);
  const [workerStatus, setWorkerStatus] = useState({ running: false, pid: null, lastExit: null });

  const rootsText = useMemo(() => (config?.libraryRoots || []).join('\n'), [config]);

  useEffect(() => {
    if (!api) return;
    Promise.all([api.getConfig(), api.getIndex()])
      .then(([nextConfig, nextIndex]) => {
        setConfig(nextConfig);
        setIndex(nextIndex);
      })
      .catch((err) => setMessage(err.message));
    api.workerStatus().then(setWorkerStatus).catch(() => null);
  }, []);

  useEffect(() => {
    if (!api || !config) return;
    api.previewSongFolder({ root: config.libraryRoots?.[0], song: previewSong })
      .then(setPreview)
      .catch(() => null);
  }, [config, previewSong]);

  const updateConfig = (patch) => setConfig((current) => ({ ...(current || {}), ...patch }));

  const saveConfig = async () => {
    const saved = await api.saveConfig(config);
    setConfig(saved);
    setMessage('CineStage Hub settings saved.');
  };

  const chooseFolders = async () => {
    const folders = await api.chooseLibraryRoots();
    if (folders.length) updateConfig({ libraryRoots: folders });
  };

  const scanLibraries = async () => {
    setScanState('scanning');
    setMessage('');
    try {
      const saved = await api.saveConfig(config);
      setConfig(saved);
      const nextIndex = await api.scanLibraries({ libraryRoots: saved.libraryRoots, indexPath: saved.indexPath });
      setIndex(nextIndex);
      setMessage(`Indexed ${nextIndex.songCount} songs and ${nextIndex.stemCount} stems.`);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setScanState('idle');
    }
  };

  const startWorker = async () => {
    await api.saveConfig(config);
    const status = await api.startWorker();
    setWorkerStatus(status);
    setMessage(status.running ? 'Stem worker started.' : 'Stem worker did not start.');
  };

  const stopWorker = async () => {
    const status = await api.stopWorker();
    setWorkerStatus(status);
    setMessage('Stem worker stop requested.');
    setTimeout(() => api.workerStatus().then(setWorkerStatus).catch(() => null), 1000);
  };

  const createWorkspace = async () => {
    const dirs = await api.createSongWorkspace({ root: config.libraryRoots?.[0], song: previewSong });
    setPreview({ path: dirs.songDir, ...previewSong });
    setMessage('Song workspace folders created.');
  };

  const findMatch = async () => {
    const result = await api.findMatch({ ...matchQuery, minScore: 40 });
    setMatch(result);
  };

  if (!api) {
    return (
      <div className="h-full bg-[#020617] text-white p-6">
        <h1 className="text-2xl font-black">CineStage Hub</h1>
        <p className="mt-2 text-slate-400">Desktop bridge is not available in this renderer.</p>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="h-full bg-[#020617] text-white flex items-center justify-center">
        <div className="h-8 w-8 animate-spin border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-[#020617] text-white">
      <div className="mb-6 flex items-center justify-between border-b border-slate-800 pb-5">
        <div>
          <p className="text-[11px] font-black uppercase tracking-widest text-indigo-400">CineStage Cloud</p>
          <h1 className="mt-1 text-2xl font-black">Desktop Stem Hub</h1>
          <p className="mt-1 text-sm text-slate-400">Organize, index, and reuse local stems before running separation.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={workerStatus.running ? stopWorker : startWorker} className={`border px-4 py-2 text-sm font-bold text-white ${workerStatus.running ? 'border-red-500 bg-red-600' : 'border-cyan-500 bg-cyan-600'}`}>
            {workerStatus.running ? 'Stop Worker' : 'Start Worker'}
          </button>
          <button onClick={saveConfig} className="border border-indigo-500 bg-indigo-600 px-4 py-2 text-sm font-bold text-white">Save</button>
          <button onClick={scanLibraries} disabled={scanState === 'scanning'} className="border border-emerald-500 bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {scanState === 'scanning' ? 'Scanning...' : 'Scan Libraries'}
          </button>
        </div>
      </div>

      {message ? <div className="mb-5 border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-200">{message}</div> : null}

      <div className="grid grid-cols-4 gap-3">
        <Stat label="Songs Indexed" value={index?.songCount || 0} />
        <Stat label="Stems Found" value={index?.stemCount || 0} />
        <Stat label="Library Roots" value={(config.libraryRoots || []).length} />
        <Stat label="Mode" value={WORKER_MODES[config.workerMode] || 'Desktop'} />
      </div>

      <section className="mt-5 border border-slate-800 bg-slate-900/40 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black">Background Worker</h2>
            <p className="mt-1 text-sm text-slate-400">This process checks Cloudflare for stem jobs, searches this library first, then separates only when needed.</p>
          </div>
          <div className={`border px-3 py-2 text-sm font-black ${workerStatus.running ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 bg-slate-950 text-slate-400'}`}>
            {workerStatus.running ? `Online · PID ${workerStatus.pid}` : 'Offline'}
          </div>
        </div>
        {workerStatus.lastExit ? (
          <p className="mt-3 text-xs text-slate-500">Last exit: code {workerStatus.lastExit.code ?? 'n/a'} · signal {workerStatus.lastExit.signal || 'none'} · {workerStatus.lastExit.at}</p>
        ) : null}
      </section>

      <div className="mt-6 grid grid-cols-[1.2fr_0.8fr] gap-5">
        <section className="border border-slate-800 bg-slate-900/40 p-5">
          <h2 className="text-lg font-black">Worker Identity</h2>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <Field label="Sync URL" value={config.syncUrl} onChange={(value) => updateConfig({ syncUrl: value })} />
            <Field label="Desktop Name" value={config.desktopName} onChange={(value) => updateConfig({ desktopName: value })} placeholder="Jeff MacBook Pro" />
            <Field label="Account Email" value={config.accountEmail} onChange={(value) => updateConfig({ accountEmail: value })} placeholder="admin@church.com" />
            <Field label="Account ID" value={config.accountId} onChange={(value) => updateConfig({ accountId: value })} placeholder="optional account id" />
          </div>
          <label className="mt-4 block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">Worker Mode</span>
            <select
              value={config.workerMode}
              onChange={(event) => updateConfig({ workerMode: event.target.value })}
              className="w-full border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
            >
              {Object.entries(WORKER_MODES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </section>

        <section className="border border-slate-800 bg-slate-900/40 p-5">
          <h2 className="text-lg font-black">Processing Rules</h2>
          <div className="mt-4 space-y-3">
            <Toggle label="Search library before stem separation" checked={config.searchBeforeSeparate} onChange={(value) => updateConfig({ searchBeforeSeparate: value })} />
            <Toggle label="Keep master stems on this drive" checked={config.keepMasterStems} onChange={(value) => updateConfig({ keepMasterStems: value })} />
            <Toggle label="Allow this machine as backup worker" checked={config.allowBackupWorker} onChange={(value) => updateConfig({ allowBackupWorker: value })} />
            <Toggle label="Allow YouTube downloader integration" checked={config.allowYouTubeDownload} onChange={(value) => updateConfig({ allowYouTubeDownload: value })} />
          </div>
          <Field label="Service export TTL hours" type="number" value={config.serviceExportTtlHours} onChange={(value) => updateConfig({ serviceExportTtlHours: Number(value) })} />
        </section>
      </div>

      <section className="mt-5 border border-slate-800 bg-slate-900/40 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black">Stem Library Roots</h2>
          <button onClick={chooseFolders} className="border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-bold text-slate-100">Choose Folders</button>
        </div>
        <textarea
          value={rootsText}
          onChange={(event) => updateConfig({ libraryRoots: event.target.value.split('\n').map((line) => line.trim()).filter(Boolean) })}
          className="mt-4 h-24 w-full border border-slate-800 bg-slate-950 p-3 font-mono text-xs text-slate-200 outline-none focus:border-indigo-500"
        />
        <p className="mt-2 text-xs text-slate-500">Use one folder per line. External drives, shared folders, and your always-on laptop library mounts can all be indexed.</p>
      </section>

      <div className="mt-5 grid grid-cols-2 gap-5">
        <section className="border border-slate-800 bg-slate-900/40 p-5">
          <h2 className="text-lg font-black">Folder Organizer Preview</h2>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <Field label="Artist / Band" value={previewSong.artist} onChange={(value) => setPreviewSong((song) => ({ ...song, artist: value }))} />
            <Field label="Album" value={previewSong.album} onChange={(value) => setPreviewSong((song) => ({ ...song, album: value }))} />
            <Field label="Song" value={previewSong.title} onChange={(value) => setPreviewSong((song) => ({ ...song, title: value }))} />
          </div>
          <div className="mt-4 border border-slate-800 bg-slate-950 p-3 font-mono text-xs text-emerald-300 break-all">{preview?.path}</div>
          <button onClick={createWorkspace} className="mt-4 border border-indigo-500 bg-indigo-600 px-4 py-2 text-sm font-bold text-white">Create Folder Set</button>
        </section>

        <section className="border border-slate-800 bg-slate-900/40 p-5">
          <h2 className="text-lg font-black">Library Match Test</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field label="Artist" value={matchQuery.artist} onChange={(value) => setMatchQuery((query) => ({ ...query, artist: value }))} />
            <Field label="Song" value={matchQuery.title} onChange={(value) => setMatchQuery((query) => ({ ...query, title: value }))} />
          </div>
          <button onClick={findMatch} className="mt-4 border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-bold text-slate-100">Find Match</button>
          <div className="mt-4 min-h-20 border border-slate-800 bg-slate-950 p-3 text-sm text-slate-300">
            {match?.song ? (
              <div>
                <p className="font-bold text-white">{match.song.title} · {match.song.artist}</p>
                <p className="mt-1 text-xs text-slate-500">Score {match.score} · {Object.keys(match.song.stems || {}).length} stems · missing {(match.song.missing || []).join(', ') || 'nothing'}</p>
              </div>
            ) : 'No match selected.'}
          </div>
        </section>
      </div>

      <section className="mt-5 border border-slate-800 bg-slate-900/40 p-5">
        <h2 className="text-lg font-black">Worker Environment</h2>
        <p className="mt-2 text-sm text-slate-400">The background stem worker reads these saved settings through environment variables or the Hub config.</p>
        <div className="mt-4 grid grid-cols-3 gap-3 text-xs text-slate-300">
          <div className="border border-slate-800 bg-slate-950 p-3">Priority 1<br /><span className="font-bold text-white">Account desktop</span></div>
          <div className="border border-slate-800 bg-slate-950 p-3">Priority 2<br /><span className="font-bold text-white">Backup laptop library</span></div>
          <div className="border border-slate-800 bg-slate-950 p-3">Priority 3<br /><span className="font-bold text-white">New stem separation</span></div>
        </div>
      </section>
    </div>
  );
}
