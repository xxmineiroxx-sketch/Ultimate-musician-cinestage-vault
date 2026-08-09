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

function mergeRoots(currentRoots = [], nextRoots = []) {
  return Array.from(new Set([...(currentRoots || []), ...(nextRoots || [])].map((root) => String(root || '').trim()).filter(Boolean)));
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
  const [chartRequest, setChartRequest] = useState({ artist: '', title: '', key: '', bpm: '' });
  const [chartAnalysis, setChartAnalysis] = useState(null);
  const [chartState, setChartState] = useState('idle');
  const [workerStatus, setWorkerStatus] = useState({ running: false, pid: null, lastExit: null });
  const [brainStatus, setBrainStatus] = useState(null);
  const [organizeState, setOrganizeState] = useState('idle');
  const [organizeReport, setOrganizeReport] = useState(null);

  const rootsText = useMemo(() => (config?.libraryRoots || []).join('\n'), [config]);
  const intakeRootsText = useMemo(() => (config?.intakeRoots || []).join('\n'), [config]);

  useEffect(() => {
    if (!api) return;
    Promise.all([api.getConfig(), api.getIndex(), api.brainStatus()])
      .then(([nextConfig, nextIndex, nextBrainStatus]) => {
        setConfig(nextConfig);
        setIndex(nextIndex);
        setBrainStatus(nextBrainStatus);
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

  const chooseFolders = async (kind = 'library') => {
    const title = kind === 'charts'
      ? 'Choose Song Chords and Chart Folder'
      : kind === 'intake'
        ? 'Choose Raw VS, Stems, Lyrics, or Chart Intake Folder'
        : kind === 'stems'
        ? 'Choose VS or Stem Folder'
        : 'Choose CineStage Library Folder';
    const folders = await api.chooseLibraryRoots({ title });
    if (!folders.length) return;
    if (kind === 'intake') {
      const nextConfig = { ...config, intakeRoots: mergeRoots(config.intakeRoots, folders) };
      const saved = await api.saveConfig(nextConfig);
      setConfig(saved);
      setMessage('Intake folder added. Run Organize Intake to move supported files into the clean CineStage Library.');
      return;
    }
    const nextConfig = { ...config, libraryRoots: mergeRoots(config.libraryRoots, folders) };
    const saved = await api.saveConfig(nextConfig);
    setConfig(saved);
    setMessage('Library folder added. Run Scan Libraries to refresh stems, chords, and lyrics.');
  };

  const removeRoot = async (rootToRemove) => {
    const nextConfig = {
      ...config,
      libraryRoots: (config.libraryRoots || []).filter((root) => root !== rootToRemove),
    };
    const saved = await api.saveConfig(nextConfig);
    setConfig(saved);
    setMessage('Library folder removed. Run Scan Libraries to refresh the index.');
  };

  const removeIntakeRoot = async (rootToRemove) => {
    const nextConfig = {
      ...config,
      intakeRoots: (config.intakeRoots || []).filter((root) => root !== rootToRemove),
    };
    const saved = await api.saveConfig(nextConfig);
    setConfig(saved);
    setMessage('Intake folder removed.');
  };

  const chooseBrainPath = async () => {
    const result = await api.chooseBrainPath();
    if (result?.config) setConfig(result.config);
    if (result?.brain) {
      setBrainStatus({ selected: result.brain, candidates: [result.brain] });
      setMessage(result.brain.installed ? 'CineStage Brain folder connected.' : 'Selected folder does not contain CineStage Brain.');
    }
  };

  const scanLibraries = async () => {
    setScanState('scanning');
    setMessage('');
    try {
      const saved = await api.saveConfig(config);
      setConfig(saved);
      const nextIndex = await api.scanLibraries({ libraryRoots: saved.libraryRoots, indexPath: saved.indexPath });
      setIndex(nextIndex);
      setMessage(`Indexed ${nextIndex.songCount} songs, ${nextIndex.stemCount} stems, and ${nextIndex.chartCount || 0} charts.`);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setScanState('idle');
    }
  };

  const organizeIntake = async () => {
    setOrganizeState('organizing');
    setMessage('');
    try {
      const saved = await api.saveConfig(config);
      setConfig(saved);
      const result = await api.organizeIntake({
        targetRoot: saved.libraryRoots?.[0],
        intakeRoots: saved.intakeRoots || [],
        indexPath: saved.indexPath,
      });
      setOrganizeReport(result);
      if (result.index) setIndex({ ...(index || {}), ...result.index });
      const refreshed = await api.getConfig();
      setConfig(refreshed);
      setMessage(`Organized ${result.imported.length} song workspaces into CineStage Library. Future jobs will search the clean index first.`);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setOrganizeState('idle');
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

  const analyzeChart = async () => {
    setChartState('analyzing');
    setMessage('');
    try {
      const result = await api.analyzeChartRequest({ ...chartRequest, minScore: 30 });
      setChartAnalysis(result);
      setMessage(result?.analysis?.hasChart ? 'Chart vault match analyzed.' : 'No local chart match found yet. Choose the chart folder and scan again.');
    } catch (err) {
      setMessage(err.message);
    } finally {
      setChartState('idle');
    }
  };

  const prepareChartWorkspace = async () => {
    setChartState('preparing');
    setMessage('');
    try {
      const result = await api.prepareChartWorkspace({ ...chartRequest, minScore: 30 });
      setChartAnalysis(result);
      setPreviewSong({
        artist: result.analysis.artist || chartRequest.artist,
        album: result.analysis.album || 'Singles',
        title: result.analysis.title || chartRequest.title,
      });
      setPreview({ path: result.workspace.songDir, ...result.analysis });
      setMessage('Chart workspace prepared with metadata for CineStage Brain review.');
    } catch (err) {
      setMessage(err.message);
    } finally {
      setChartState('idle');
    }
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
        <Stat label="Charts Found" value={index?.chartCount || 0} />
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

      <section className="mt-5 border border-cyan-900/70 bg-cyan-950/20 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-cyan-300">Local Intelligence</p>
            <h2 className="mt-1 text-lg font-black">CineStage Brain Installation</h2>
            <p className="mt-1 text-sm text-slate-400">The desktop should host the heavy music brain: song pipeline, stems, chords, charts, partsheets, and worship memory.</p>
          </div>
          <div className={`border px-3 py-2 text-sm font-black ${brainStatus?.selected?.installed ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300' : 'border-amber-500 bg-amber-500/10 text-amber-200'}`}>
            {brainStatus?.selected?.installed ? `${brainStatus.selected.status} · ${brainStatus.selected.capabilityCount || 0} engines` : 'Not connected'}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-[1fr_auto] gap-3">
          <Field label="Brain Path" value={config.brainPath} onChange={(value) => updateConfig({ brainPath: value })} placeholder="Choose or paste CineStage Brain folder" />
          <button onClick={chooseBrainPath} className="self-end border border-cyan-500 bg-cyan-600 px-4 py-2 text-sm font-bold text-white">Choose Brain</button>
        </div>
        <Toggle label="Enable local CineStage Brain for worker jobs" checked={config.brainEnabled} onChange={(value) => updateConfig({ brainEnabled: value })} />
        <div className="mt-4 grid grid-cols-4 gap-2 text-xs">
          {Object.entries(brainStatus?.selected?.capabilities || {}).map(([name, enabled]) => (
            <div key={name} className={`border px-3 py-2 ${enabled ? 'border-emerald-900 bg-emerald-950/40 text-emerald-200' : 'border-slate-800 bg-slate-950 text-slate-500'}`}>
              <span className="font-bold">{name}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Charts indexed: {brainStatus?.selected?.storage?.charts || 0} · stems indexed: {brainStatus?.selected?.storage?.stems || 0} · memory DB: {brainStatus?.selected?.storage?.memoryDbBytes || 0} bytes
        </p>
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
          <div>
            <h2 className="text-lg font-black">Local Library Folders</h2>
            <p className="mt-1 text-sm text-slate-400">Add your VS/stems folder and your separate song chords/charts folder. CineStage scans both and matches by song.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => chooseFolders('stems')} className="border border-cyan-600 bg-cyan-700 px-3 py-2 text-sm font-bold text-white">Add VS/Stems Folder</button>
            <button onClick={() => chooseFolders('charts')} className="border border-amber-600 bg-amber-700 px-3 py-2 text-sm font-bold text-white">Add Chord Chart Folder</button>
          </div>
        </div>
        <textarea
          value={rootsText}
          onChange={(event) => updateConfig({ libraryRoots: event.target.value.split('\n').map((line) => line.trim()).filter(Boolean) })}
          className="mt-4 h-24 w-full border border-slate-800 bg-slate-950 p-3 font-mono text-xs text-slate-200 outline-none focus:border-indigo-500"
        />
        {(config.libraryRoots || []).length ? (
          <div className="mt-3 space-y-2">
            {(config.libraryRoots || []).map((root) => (
              <div key={root} className="flex items-center justify-between gap-3 border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300">
                <span className="break-all font-mono">{root}</span>
                <button onClick={() => removeRoot(root)} className="shrink-0 border border-red-900 bg-red-950/50 px-2 py-1 font-bold text-red-200">Remove</button>
              </div>
            ))}
          </div>
        ) : null}
        <p className="mt-2 text-xs text-slate-500">Use one folder per line or the add buttons. External drives, shared folders, and your always-on laptop library mounts can all be indexed together.</p>
      </section>

      <section className="mt-5 border border-emerald-900/70 bg-emerald-950/10 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">Clean Database Intake</p>
            <h2 className="mt-1 text-lg font-black">Organize VS, Lyrics, and Chord Charts</h2>
            <p className="mt-1 text-sm text-slate-400">Move raw folders into the main CineStage Library once, then remove raw folders from daily scanning so future song requests hit the organized index first.</p>
          </div>
          <button onClick={() => chooseFolders('intake')} className="border border-emerald-600 bg-emerald-700 px-3 py-2 text-sm font-bold text-white">Add Intake Folder</button>
        </div>
        <div className="mt-4 grid grid-cols-[1fr_0.9fr] gap-4">
          <div>
            <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">Raw Intake Folders</span>
            <textarea
              value={intakeRootsText}
              onChange={(event) => updateConfig({ intakeRoots: event.target.value.split('\n').map((line) => line.trim()).filter(Boolean) })}
              placeholder={'/Users/name/Downloads/VS\n/Volumes/Drive/Cifras'}
              className="h-28 w-full border border-slate-800 bg-slate-950 p-3 font-mono text-xs text-slate-200 outline-none focus:border-emerald-500"
            />
            {(config.intakeRoots || []).length ? (
              <div className="mt-3 space-y-2">
                {(config.intakeRoots || []).map((root) => (
                  <div key={root} className="flex items-center justify-between gap-3 border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300">
                    <span className="break-all font-mono">{root}</span>
                    <button onClick={() => removeIntakeRoot(root)} className="shrink-0 border border-red-900 bg-red-950/50 px-2 py-1 font-bold text-red-200">Remove</button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <div className="border border-slate-800 bg-slate-950 p-4">
            <p className="text-sm font-bold text-white">Target Library</p>
            <p className="mt-2 break-all font-mono text-xs text-emerald-300">{config.libraryRoots?.[0] || 'Choose a CineStage Library folder first.'}</p>
            <button
              onClick={organizeIntake}
              disabled={organizeState !== 'idle' || !(config.intakeRoots || []).length || !config.libraryRoots?.[0]}
              className="mt-4 w-full border border-emerald-500 bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {organizeState === 'organizing' ? 'Organizing...' : 'Organize Intake'}
            </button>
            <p className="mt-3 text-xs text-slate-500">Creates stems, charts, original, and metadata folders per song. Raw intake roots are not kept in the clean library scan path after organization.</p>
          </div>
        </div>
        {organizeReport ? (
          <div className="mt-4 grid grid-cols-[0.8fr_1.2fr] gap-4">
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Imported" value={organizeReport.imported?.length || 0} />
              <Stat label="Intake Songs" value={organizeReport.intake?.songCount || 0} />
              <Stat label="Skipped" value={organizeReport.skipped?.length || 0} />
            </div>
            <div className="max-h-56 overflow-auto border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300">
              {(organizeReport.imported || []).map((song) => (
                <div key={`${song.artist}-${song.title}-${song.songDir}`} className="border-b border-slate-800 py-2 last:border-b-0">
                  <p className="font-bold text-white">{song.title} · {song.artist}</p>
                  <p className="mt-1 text-slate-500">{song.copiedCounts.stems} stems · {song.copiedCounts.charts} charts · {song.copiedCounts.original} originals</p>
                  <p className="mt-1 break-all font-mono text-emerald-300">{song.songDir}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="mt-5 border border-amber-900/70 bg-amber-950/10 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">Chart Vault</p>
            <h2 className="mt-1 text-lg font-black">Local Chart and Lyrics Search</h2>
            <p className="mt-1 text-sm text-slate-400">Search selected folders for existing charts before CineStage Brain fills missing key, BPM, chords, lyrics, or stems.</p>
          </div>
          <div className="border border-amber-700 bg-amber-950/50 px-3 py-2 text-sm font-black text-amber-200">
            {(index?.chartCount || 0)} charts indexed
          </div>
        </div>
        <div className="mt-4 grid grid-cols-[1fr_1fr_90px_90px] gap-3">
          <Field label="Artist / Band" value={chartRequest.artist} onChange={(value) => setChartRequest((request) => ({ ...request, artist: value }))} placeholder="Maverick City Music" />
          <Field label="Song" value={chartRequest.title} onChange={(value) => setChartRequest((request) => ({ ...request, title: value }))} placeholder="Firm Foundation" />
          <Field label="Key" value={chartRequest.key} onChange={(value) => setChartRequest((request) => ({ ...request, key: value }))} placeholder="C" />
          <Field label="BPM" type="number" value={chartRequest.bpm} onChange={(value) => setChartRequest((request) => ({ ...request, bpm: value }))} placeholder="72" />
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={analyzeChart} disabled={chartState !== 'idle'} className="border border-amber-500 bg-amber-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {chartState === 'analyzing' ? 'Analyzing...' : 'Analyze Local Chart'}
          </button>
          <button onClick={prepareChartWorkspace} disabled={chartState !== 'idle'} className="border border-indigo-500 bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {chartState === 'preparing' ? 'Preparing...' : 'Create Working Area'}
          </button>
        </div>
        <div className="mt-4 grid grid-cols-[0.8fr_1.2fr] gap-4">
          <div className="border border-slate-800 bg-slate-950 p-3 text-sm text-slate-300">
            {chartAnalysis?.analysis ? (
              <div>
                <p className="font-bold text-white">{chartAnalysis.analysis.title || 'Untitled'} · {chartAnalysis.analysis.artist || 'Unknown Artist'}</p>
                <p className="mt-1 text-xs text-slate-500">Confidence {chartAnalysis.analysis.confidence}% · Key {chartAnalysis.analysis.key || 'missing'} · BPM {chartAnalysis.analysis.bpm || 'missing'}</p>
                <p className="mt-2 text-xs text-slate-400">Source: <span className="break-all font-mono text-slate-300">{chartAnalysis.sourcePath || 'No local chart found'}</span></p>
                {chartAnalysis.workspace?.songDir ? (
                  <p className="mt-2 text-xs text-emerald-300 break-all">Workspace: {chartAnalysis.workspace.songDir}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {['hasChart', 'hasChords', 'hasLyrics'].map((key) => (
                    <span key={key} className={`border px-2 py-1 text-[11px] font-bold ${chartAnalysis.analysis[key] ? 'border-emerald-700 bg-emerald-950/40 text-emerald-200' : 'border-slate-700 bg-slate-900 text-slate-500'}`}>
                      {key.replace('has', '')}
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-xs text-slate-500">Needs review: {(chartAnalysis.analysis.missing || []).join(', ') || 'ready for approval'}</p>
              </div>
            ) : 'No chart analysis yet.'}
          </div>
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300">
            {chartAnalysis?.analysis?.preview || 'Chart preview will appear here for text, ChordPro, markdown, CRD, or TXT files. PDF and DOCX files are indexed by filename until a parser is added.'}
          </pre>
        </div>
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
