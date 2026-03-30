#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const { spawnSync } = require('child_process');

const DEFAULT_BUNDLE_ID = 'com.ultimatemusician.playback';
const DEFAULT_WARNING_DAYS = 21;
const LOCAL_FALLBACK_JSON = '/tmp/ultimateplayback_asc_api_key.json';

function parseArgs(argv) {
  const out = {
    bundleId: DEFAULT_BUNDLE_ID,
    buildNumber: null,
    dryRun: false,
    groupIds: [],
    warningDays: DEFAULT_WARNING_DAYS,
    notify: false,
    verboseBuilds: false,
    output: 'json',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--bundle-id') {
      out.bundleId = argv[i + 1] || out.bundleId;
      i += 1;
    } else if (arg === '--build-number') {
      out.buildNumber = argv[i + 1] || null;
      i += 1;
    } else if (arg === '--group-id') {
      if (argv[i + 1]) {
        out.groupIds.push(argv[i + 1]);
      }
      i += 1;
    } else if (arg === '--check' || arg === '--dry-run') {
      out.dryRun = true;
    } else if (arg === '--warning-days' || arg === '--require-days') {
      const parsed = Number(argv[i + 1]);
      if (Number.isFinite(parsed) && parsed >= 0) {
        out.warningDays = parsed;
      }
      i += 1;
    } else if (arg === '--notify') {
      out.notify = true;
    } else if (arg === '--all-valid-builds') {
      out.verboseBuilds = true;
    } else if (arg === '--text') {
      out.output = 'text';
    } else if (arg === '--json') {
      out.output = 'json';
    }
  }

  return out;
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readCredentials() {
  const jsonPath =
    process.env.ASC_API_KEY_JSON_PATH ||
    process.env.APP_STORE_CONNECT_API_KEY_JSON_PATH ||
    (fs.existsSync(LOCAL_FALLBACK_JSON) ? LOCAL_FALLBACK_JSON : null);

  if (jsonPath) {
    const parsed = readJsonFile(jsonPath);
    if (parsed.key_id && parsed.issuer_id && parsed.key) {
      return {
        keyId: parsed.key_id,
        issuerId: parsed.issuer_id,
        privateKey: parsed.key,
        source: jsonPath,
      };
    }
  }

  const jsonBlob =
    process.env.ASC_API_KEY_JSON ||
    process.env.APP_STORE_CONNECT_API_KEY_JSON;

  if (jsonBlob) {
    const parsed = JSON.parse(jsonBlob);
    if (parsed.key_id && parsed.issuer_id && parsed.key) {
      return {
        keyId: parsed.key_id,
        issuerId: parsed.issuer_id,
        privateKey: parsed.key,
        source: 'env:ASC_API_KEY_JSON',
      };
    }
  }

  const keyId =
    process.env.ASC_KEY_ID ||
    process.env.APP_STORE_CONNECT_KEY_ID ||
    process.env.APPLE_KEY_ID;
  const issuerId =
    process.env.ASC_ISSUER_ID ||
    process.env.APP_STORE_CONNECT_ISSUER_ID ||
    process.env.APPLE_ISSUER_ID;
  const privateKeyPath =
    process.env.ASC_PRIVATE_KEY_PATH ||
    process.env.APP_STORE_CONNECT_PRIVATE_KEY_PATH;
  const inlinePrivateKey =
    process.env.ASC_PRIVATE_KEY ||
    process.env.APP_STORE_CONNECT_PRIVATE_KEY;

  if (keyId && issuerId && (privateKeyPath || inlinePrivateKey)) {
    return {
      keyId,
      issuerId,
      privateKey: privateKeyPath
        ? fs.readFileSync(privateKeyPath, 'utf8')
        : inlinePrivateKey,
      source: privateKeyPath || 'env:ASC_PRIVATE_KEY',
    };
  }

  throw new Error(
    'Missing App Store Connect API credentials. Set ASC_API_KEY_JSON_PATH, ASC_API_KEY_JSON, or ASC_KEY_ID/ASC_ISSUER_ID/ASC_PRIVATE_KEY_PATH.'
  );
}

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function createJwt(creds) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: creds.keyId, typ: 'JWT' };
  const payload = {
    iss: creds.issuerId,
    aud: 'appstoreconnect-v1',
    exp: now + 1200,
  };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createSign('sha256')
    .update(signingInput)
    .end()
    .sign({ key: creds.privateKey, dsaEncoding: 'ieee-p1363' });

  return `${signingInput}.${base64url(signature)}`;
}

function requestJson(creds, method, path, body) {
  return new Promise((resolve, reject) => {
    const jwt = createJwt(creds);
    const req = https.request(
      {
        hostname: 'api.appstoreconnect.apple.com',
        path,
        method,
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`HTTP ${res.statusCode}: ${raw}`));
            return;
          }
          resolve(raw ? JSON.parse(raw) : {});
        });
      }
    );
    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function paginate(creds, path) {
  const rows = [];
  let nextPath = path;
  while (nextPath) {
    const page = await requestJson(creds, 'GET', nextPath);
    rows.push(...(page.data || []));
    nextPath =
      page.links && page.links.next
        ? page.links.next.replace('https://api.appstoreconnect.apple.com', '')
        : null;
  }
  return rows;
}

function byNewestUploaded(a, b) {
  const left = Date.parse(a.attributes.uploadedDate || 0);
  const right = Date.parse(b.attributes.uploadedDate || 0);
  return right - left;
}

function daysUntil(dateString) {
  if (!dateString) return null;
  const target = Date.parse(dateString);
  if (!Number.isFinite(target)) return null;
  return Math.ceil((target - Date.now()) / (24 * 60 * 60 * 1000));
}

function summarizeBuild(build) {
  const attrs = build.attributes || {};
  return {
    id: build.id,
    buildNumber: String(attrs.version || ''),
    uploadedDate: attrs.uploadedDate || null,
    expirationDate: attrs.expirationDate || null,
    daysRemaining: daysUntil(attrs.expirationDate),
    processingState: attrs.processingState || null,
    expired: Boolean(attrs.expired),
  };
}

async function getApp(creds, bundleId) {
  const apps = await requestJson(
    creds,
    'GET',
    `/v1/apps?filter[bundleId]=${encodeURIComponent(bundleId)}`
  );
  if (!apps.data || !apps.data.length) {
    throw new Error(`No App Store Connect app found for ${bundleId}`);
  }
  return apps.data[0];
}

async function getValidBuilds(creds, appId) {
  const builds = await paginate(
    creds,
    `/v1/builds?filter[app]=${encodeURIComponent(
      appId
    )}&sort=-uploadedDate&limit=200`
  );

  return builds
    .filter((build) => build.attributes.processingState === 'VALID')
    .sort(byNewestUploaded);
}

function getTargetBuild(validBuilds, buildNumber) {
  if (!validBuilds.length) {
    throw new Error('No VALID builds found for this app');
  }

  if (!buildNumber) {
    return validBuilds[0];
  }

  const exact = validBuilds.find(
    (build) => String(build.attributes.version) === String(buildNumber)
  );
  if (!exact) {
    throw new Error(`No VALID build ${buildNumber} found for this app`);
  }
  return exact;
}

async function getGroups(creds, appId, wantedIds) {
  const groups = await paginate(
    creds,
    `/v1/betaGroups?filter[app]=${encodeURIComponent(appId)}&limit=200`
  );

  if (!wantedIds.length) {
    return groups;
  }

  return groups.filter((group) => wantedIds.includes(group.id));
}

async function attachBuildToGroup(creds, groupId, buildId) {
  return requestJson(
    creds,
    'POST',
    `/v1/betaGroups/${groupId}/relationships/builds`,
    {
      data: [{ type: 'builds', id: buildId }],
    }
  );
}

function notify(message) {
  const safeMessage = String(message || '').replace(/"/g, '\\"');
  spawnSync('osascript', [
    '-e',
    `display notification "${safeMessage}" with title "Ultimate Playback TestFlight"`,
  ]);
}

function formatTextSummary(summary) {
  const lines = [];
  lines.push(`Bundle: ${summary.bundleId}`);
  lines.push(`App ID: ${summary.appId}`);
  lines.push(
    `Latest VALID build: ${summary.targetBuild.buildNumber} (${summary.targetBuild.processingState})`
  );
  if (summary.targetBuild.uploadedDate) {
    lines.push(`Uploaded: ${summary.targetBuild.uploadedDate}`);
  }
  if (summary.targetBuild.expirationDate) {
    lines.push(
      `Expires: ${summary.targetBuild.expirationDate} (${summary.targetBuild.daysRemaining} days remaining)`
    );
  }
  lines.push(`Credentials: ${summary.credentialsSource}`);
  lines.push(`Mode: ${summary.dryRun ? 'check-only' : 'share-latest'}`);
  lines.push('Groups:');
  for (const group of summary.groups) {
    lines.push(
      `- ${group.name}: ${group.action} (${group.isInternalGroup ? 'internal' : 'external'})`
    );
  }
  if (summary.alerts.length) {
    lines.push('Alerts:');
    for (const alert of summary.alerts) {
      lines.push(`- ${alert}`);
    }
  }
  if (summary.validBuilds && summary.validBuilds.length) {
    lines.push('Valid builds:');
    for (const build of summary.validBuilds) {
      lines.push(
        `- ${build.buildNumber}: uploaded ${build.uploadedDate || 'n/a'}, expires ${
          build.expirationDate || 'n/a'
        }`
      );
    }
  }
  return lines.join('\n');
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const creds = readCredentials();
  const app = await getApp(creds, options.bundleId);
  const validBuilds = await getValidBuilds(creds, app.id);
  const targetBuild = getTargetBuild(validBuilds, options.buildNumber);
  const groups = await getGroups(creds, app.id, options.groupIds);

  if (!groups.length) {
    throw new Error('No beta groups matched the requested filters');
  }

  const results = [];
  for (const group of groups) {
    const groupBuilds = await paginate(
      creds,
      `/v1/betaGroups/${group.id}/builds?limit=200`
    );
    const alreadyShared = groupBuilds.some(
      (build) => build.id === targetBuild.id
    );

    if (!alreadyShared && !options.dryRun) {
      await attachBuildToGroup(creds, group.id, targetBuild.id);
    }

    results.push({
      id: group.id,
      name: group.attributes.name,
      isInternalGroup: group.attributes.isInternalGroup,
      hasAccessToAllBuilds: group.attributes.hasAccessToAllBuilds ?? null,
      action: alreadyShared
        ? 'already_shared'
        : options.dryRun
        ? 'would_share'
        : 'shared',
    });
  }

  const targetSummary = summarizeBuild(targetBuild);
  const alerts = [];

  if (
    targetSummary.daysRemaining !== null &&
    targetSummary.daysRemaining <= options.warningDays
  ) {
    alerts.push(
      `Latest VALID TestFlight build ${targetSummary.buildNumber} expires in ${targetSummary.daysRemaining} day(s). Cut a new beta build soon.`
    );
  }

  const sharedGroups = results.filter((item) => item.action === 'shared');
  if (sharedGroups.length && options.notify) {
    notify(
      `Shared build ${targetSummary.buildNumber} with ${sharedGroups.length} TestFlight group(s).`
    );
  }

  if (alerts.length && options.notify) {
    notify(alerts[0]);
  }

  const summary = {
    bundleId: options.bundleId,
    appId: app.id,
    buildNumber: targetSummary.buildNumber,
    uploadedDate: targetSummary.uploadedDate,
    expirationDate: targetSummary.expirationDate,
    daysRemaining: targetSummary.daysRemaining,
    buildState: targetSummary.processingState,
    credentialsSource: creds.source,
    dryRun: options.dryRun,
    groups: results,
    alerts,
    targetBuild: targetSummary,
    latestValidBuild: summarizeBuild(validBuilds[0]),
    validBuilds: (options.verboseBuilds ? validBuilds : validBuilds.slice(0, 5)).map(
      summarizeBuild
    ),
  };

  if (options.output === 'text') {
    console.log(formatTextSummary(summary));
  } else {
    console.log(JSON.stringify(summary, null, 2));
  }

  if (alerts.length) {
    process.exitCode = 2;
  }

  return summary;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_BUNDLE_ID,
  DEFAULT_WARNING_DAYS,
  LOCAL_FALLBACK_JSON,
  parseArgs,
  readCredentials,
  requestJson,
  paginate,
  summarizeBuild,
  getApp,
  getValidBuilds,
  getTargetBuild,
  getGroups,
  attachBuildToGroup,
  main,
};
