#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  DEFAULT_WARNING_DAYS,
  readCredentials,
} = require('./sync-testflight-groups');

const LABEL = 'co.ultimatelabs.ultimateplayback.testflight-beta-lane';
const HOME = os.homedir();
const CONFIG_DIR = path.join(HOME, '.config', 'ultimate-playback');
const KEY_PATH = path.join(CONFIG_DIR, 'app-store-connect-api-key.json');
const LAUNCH_AGENTS_DIR = path.join(HOME, 'Library', 'LaunchAgents');
const PLIST_PATH = path.join(LAUNCH_AGENTS_DIR, `${LABEL}.plist`);
const LOG_DIR = path.join(HOME, 'Library', 'Logs');
const LOG_PATH = path.join(LOG_DIR, `${LABEL}.log`);
const SCRIPT_PATH = path.join(__dirname, 'sync-testflight-groups.js');

function parseArgs(argv) {
  const out = {
    hour: 9,
    minute: 0,
    warningDays: DEFAULT_WARNING_DAYS,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--hour') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value) && value >= 0 && value <= 23) {
        out.hour = value;
      }
      i += 1;
    } else if (arg === '--minute') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value) && value >= 0 && value <= 59) {
        out.minute = value;
      }
      i += 1;
    } else if (arg === '--warning-days') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value) && value >= 0) {
        out.warningDays = value;
      }
      i += 1;
    }
  }

  return out;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeStableCredentials() {
  const creds = readCredentials();
  ensureDir(CONFIG_DIR);
  fs.writeFileSync(
    KEY_PATH,
    JSON.stringify(
      {
        key_id: creds.keyId,
        issuer_id: creds.issuerId,
        key: creds.privateKey,
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
  fs.chmodSync(KEY_PATH, 0o600);
  return creds.source;
}

function plistXml({ hour, minute, warningDays }) {
  const nodePath = process.execPath;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${LABEL}</string>
    <key>ProgramArguments</key>
    <array>
      <string>${nodePath}</string>
      <string>${SCRIPT_PATH}</string>
      <string>--warning-days</string>
      <string>${warningDays}</string>
      <string>--notify</string>
      <string>--text</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
      <key>ASC_API_KEY_JSON_PATH</key>
      <string>${KEY_PATH}</string>
      <key>NODE_TLS_REJECT_UNAUTHORIZED</key>
      <string>0</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>StartCalendarInterval</key>
    <dict>
      <key>Hour</key>
      <integer>${hour}</integer>
      <key>Minute</key>
      <integer>${minute}</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>${LOG_PATH}</string>
    <key>StandardErrorPath</key>
    <string>${LOG_PATH}</string>
  </dict>
</plist>
`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const credentialsSource = writeStableCredentials();
  ensureDir(LAUNCH_AGENTS_DIR);
  ensureDir(LOG_DIR);
  fs.writeFileSync(PLIST_PATH, plistXml(options));

  const summary = {
    label: LABEL,
    plistPath: PLIST_PATH,
    credentialsPath: KEY_PATH,
    credentialsSource,
    logPath: LOG_PATH,
    schedule: {
      hour: options.hour,
      minute: options.minute,
      warningDays: options.warningDays,
    },
    loadCommand: `launchctl bootstrap gui/${process.getuid()} ${PLIST_PATH}`,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main();
