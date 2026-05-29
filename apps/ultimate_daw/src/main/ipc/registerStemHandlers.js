'use strict';

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

/**
 * registerStemHandlers
 * IPC handler for Demucs stem separation.
 * @param {{ ipcMain: Electron.IpcMain }} opts
 */
function registerStemHandlers({ ipcMain }) {
  ipcMain.handle('stems:separate', async (event, payload) => {
    const { audioPath, outputDir, model = 'htdemucs_6s' } = payload;

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    return new Promise((resolve, reject) => {
      const args = ['-m', 'demucs', '--out', outputDir, '-n', model, audioPath];
      const proc = spawn('python3', args);

      function sendLine(line) {
        if (line && !event.sender.isDestroyed()) {
          event.sender.send('stems:progress', { line });
        }
      }

      // Demucs prints progress to stderr
      proc.stderr.on('data', (chunk) => {
        const lines = chunk.toString().split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) sendLine(trimmed);
        }
      });

      proc.stdout.on('data', (chunk) => {
        const lines = chunk.toString().split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) sendLine(trimmed);
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to launch python3: ${err.message}`));
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Demucs exited with code ${code}`));
          return;
        }

        try {
          // Demucs outputs to: <outputDir>/<model>/<song_name>/*.wav
          const stems = scanStemOutput(outputDir, model, audioPath);
          resolve({ success: true, stems });
        } catch (err) {
          resolve({ success: true, stems: {} });
        }
      });
    });
  });
}

/**
 * Scan the Demucs output directory for generated WAV files.
 * Demucs creates: <outputDir>/<model>/<trackName>/<stem>.wav
 */
function scanStemOutput(outputDir, model, audioPath) {
  const trackName = path.basename(audioPath, path.extname(audioPath));
  const stemDir = path.join(outputDir, model, trackName);

  if (!fs.existsSync(stemDir)) {
    // Try scanning outputDir recursively for any WAV files
    const found = findWavFiles(outputDir);
    return buildStemMap(found);
  }

  const wavFiles = fs.readdirSync(stemDir)
    .filter(f => f.toLowerCase().endsWith('.wav'))
    .map(f => ({ name: path.basename(f, '.wav').toLowerCase(), filePath: path.join(stemDir, f) }));

  return buildStemMap(wavFiles);
}

function findWavFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findWavFiles(fullPath));
    } else if (entry.name.toLowerCase().endsWith('.wav')) {
      results.push({ name: path.basename(entry.name, '.wav').toLowerCase(), filePath: fullPath });
    }
  }
  return results;
}

function buildStemMap(wavFiles) {
  const stems = {};
  const STEM_KEYS = ['vocals', 'drums', 'bass', 'guitar', 'piano', 'other'];
  for (const { name, filePath } of wavFiles) {
    for (const key of STEM_KEYS) {
      if (name.includes(key)) {
        stems[key] = filePath;
        break;
      }
    }
  }
  return stems;
}

module.exports = { registerStemHandlers };
