#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const https = require('https');

const DEFAULT_BUNDLE_ID = 'com.ultimatemusician.playback';
const LOCAL_FALLBACK_JSON = '/tmp/ultimateplayback_asc_api_key.json';

function parseArgs(argv) {
  const out = {
    bundleId: DEFAULT_BUNDLE_ID,
    buildNumber: null,
    dryRun: false,
    groupIds: [],
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

async function getTargetBuild(creds, appId, buildNumber) {
  const builds = await paginate(
    creds,
    `/v1/builds?filter[app]=${encodeURIComponent(
      appId
    )}&sort=-uploadedDate&limit=200`
  );

  if (!builds.length) {
    throw new Error('No builds found for this app');
  }

  const candidates = builds
    .filter((build) => build.attributes.processingState === 'VALID')
    .sort(byNewestUploaded);

  if (buildNumber) {
    const exact = candidates.find(
      (build) => String(build.attributes.version) === String(buildNumber)
    );
    if (!exact) {
      throw new Error(`No VALID build ${buildNumber} found for this app`);
    }
    return exact;
  }

  if (!candidates.length) {
    throw new Error('No VALID builds found for this app');
  }

  return candidates[0];
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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const creds = readCredentials();
  const app = await getApp(creds, options.bundleId);
  const targetBuild = await getTargetBuild(
    creds,
    app.id,
    options.buildNumber
  );
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
      action: alreadyShared ? 'already_shared' : options.dryRun ? 'would_share' : 'shared',
    });
  }

  const summary = {
    bundleId: options.bundleId,
    appId: app.id,
    buildNumber: targetBuild.attributes.version,
    uploadedDate: targetBuild.attributes.uploadedDate,
    buildState: targetBuild.attributes.processingState,
    credentialsSource: creds.source,
    dryRun: options.dryRun,
    groups: results,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
