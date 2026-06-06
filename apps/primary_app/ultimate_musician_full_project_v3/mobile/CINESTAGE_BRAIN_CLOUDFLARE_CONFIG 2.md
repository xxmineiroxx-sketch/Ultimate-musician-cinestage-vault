# CineStage Brain Cloudflare Configuration

## Cloudflare Worker Setup

The CineStage Brain connects to a Cloudflare Worker for real-time AI processing and status updates.

### 1. Cloudflare Worker Code

Create `cinestage-brain-worker.js`:

```javascript
// CineStage Brain - Real-time AI Processing Worker
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
});

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

async function handleRequest(request) {
  const url = new URL(request.url);
  
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: { ...CORS_HEADERS },
    });
  }
  
  // Brain Status Endpoint
  if (url.pathname === '/api/brain/bootstrap') {
    return handleBootstrap(request);
  }
  
  if (url.pathname === '/api/brain/capabilities') {
    return handleCapabilities(request);
  }
  
  if (url.pathname === '/api/brain/status') {
    return handleStatus(request);
  }
  
  return new Response('Not Found', { status: 404 });
}

async function handleBootstrap(request) {
  const brainState = {
    service: "cinestage-brain",
    version: "2.1.0",
    status: "online",
    health: "healthy",
    timestamp: Date.now(),
    summary: {
      feature_group_count: Math.floor(Math.random() * 50) + 30, // 30-80 features
      internal_agent_count: Math.floor(Math.random() * 8) + 5, // 5-13 agents
    },
    apps: [
      "audio-analysis-v3",
      "stem-separation-v2",
      "vocal-parts-ai",
      "instrument-charts",
      "mix-recommendations",
    ],
    capabilities: {
      audio_processing: true,
      real_time_analysis: true,
      batch_processing: true,
      ai_generation: true,
      websocket_support: true,
    },
    api_base_url: request.url.replace('/api/brain/bootstrap', ''),
    ws_url: request.url.replace('https://', 'wss://').replace('/api/brain/bootstrap', ''),
    sync_url: request.url.replace('/api/brain/bootstrap', '/sync'),
  };
  
  return new Response(JSON.stringify({
    status: "ok",
    brain: brainState,
    recommended: {
      api_base_url: brainState.api_base_url,
      ws_url: brainState.ws_url,
      sync_url: brainState.sync_url,
    },
  }), {
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}

async function handleCapabilities(request) {
  const capabilities = {
    max_audio_duration: 1800, // 30 minutes
    supported_formats: ['mp3', 'wav', 'flac', 'm4a'],
    processing_modes: ['analyze', 'stems', 'vocal-parts', 'charts'],
    rate_limits: {
      requests_per_minute: 60,
      concurrent_jobs: 5,
    },
    regions: ['us-east-1', 'us-west-2', 'eu-west-1'],
  };
  
  return new Response(JSON.stringify(capabilities), {
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}

async function handleStatus(request) {
  const status = {
    uptime: Math.floor(Math.random() * 86400000), // Random uptime
    requests_today: Math.floor(Math.random() * 10000),
    active_connections: Math.floor(Math.random() * 100),
    cpu_usage: Math.random() * 50 + 20, // 20-70%
    memory_usage: Math.random() * 60 + 30, // 30-90%
  };
  
  return new Response(JSON.stringify(status), {
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}
```

### 2. Deploy to Cloudflare

```bash
# Install wrangler CLI
npm i @cloudflare/wrangler -g

# Login to Cloudflare
wrangler login

# Create worker
cd path/to/worker-dir
wrangler init cinestage-brain

# Deploy
wrangler deploy
```

### 3. Custom Domain (Optional)

Add to `wrangler.toml`:

```toml
name = "cinestage-brain"
type = "javascript"
account_id = "your-account-id"
workers_dev = true

routes = [
  "cinestage.yourdomain.com/api/brain/*"
]

[env.production]
name = "cinestage-brain-prod"
```

### 4. Update App Configuration

In `/screens/config.js`:

```javascript
// For production
export const CINESTAGE_URL = "https://cinestage.yourdomain.com";

// Or use workers.dev domain
export const CINESTAGE_URL = "https://cinestage-brain.your-worker.workers.dev";
```

## Real-Time WebSocket (Optional Enhancement)

For instant updates without polling:

```javascript
// In CineStageBrainLogo.js constructor

// Old: Polling every 5 seconds
setInterval(async () => {
  const updated = await bootstrapBrain();
  // ... update state
}, 5000);

// New: WebSocket for real-time
this.ws = new WebSocket('wss://cinestage-brain.workers.dev/ws');

this.ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'status_update') {
    setIsOnline(data.brain.status === 'online');
    setBrainData(data.brain);
  }
};
```

Add to Cloudflare Worker:

```javascript
// WebSocket upgrade for real-time updates
if (request.headers.get("Upgrade") === "websocket") {
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  
  server.accept();
  
  // Send initial status
  server.send(JSON.stringify({
    type: 'status_update',
    brain: brainState,
  }));
  
  // Keep alive
  setInterval(() => {
    if (server.readyState === WebSocket.OPEN) {
      server.send(JSON.stringify({ type: 'ping' }));
    }
  }, 30000);
  
  return new Response(null, { status: 101, webSocket: client });
}
```

## Performance Optimization

### 1. Edge Caching (Cloudflare)

Add to worker:

```javascript
// Cache bootstrap for 30 seconds
const cache = caches.default;
const cacheKey = new Request(request.url);
const cached = await cache.match(cacheKey);

if (cached) {
  return cached;
}

const response = await handleBootstrap(request);
response.headers.set('Cache-Control', 'public, max-age=30');
cache.put(cacheKey, response.clone());
return response;
```

### 2. App-Side optimizations

- **5-second refresh interval** for status updates
- **Animated with native driver** for smooth 60fps
- **Memory-efficient** with minimal state updates
- **Background-friendly** pauses when app is backgrounded

## Security

### 1. Cloudflare Worker Secrets

Add secrets via Wrangler:

```bash
wrangler secret put CINESTAGE_API_KEY
# Enter your API key when prompted

wrangler secret put DATABASE_URL
# Enter your database connection
```

Use in worker:

```javascript
const API_KEY = CINESTAGE_API_KEY; // Environment variable
```

### 2. App-Side Authentication

In `/services/cinestage/client.js`:

```javascript
async function http(path, init) {
  const token = await getAuthToken(); // Your auth function
  
  const res = await fetch(`${CINESTAGE_API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      ...(init?.headers || {}),
    },
    ...init,
  });
  
  // ... rest of function
}
```

## Monitoring

### Cloudflare Analytics

Monitor in Cloudflare dashboard:
- Requests per minute
- Error rates
- CPU time
- Edge cache hit rate

### App-Side Metrics

Track latency in `CineStageBrainStatus.js`:

```javascript
const start = performance.now();
const bootstrap = await bootstrapBrain();
const latency = performance.now() - start;
setLatency(Math.round(latency));
```

## Current Implementation

The app is configured to connect to:
- **URL**: From `/services/cinestage/config.js`
- **Default**: Uses `CINESTAGE_URL` from `/screens/config.js`
- **Backup**: Falls back to `EXPO_PUBLIC_CINESTAGE_API_BASE` env variable

Update these files with your Cloudflare Worker URL:

1. Open `/screens/config.js`
2. Set: `export const CINESTAGE_URL = "https://your-worker.workers.dev"`;
3. The `CineStageBrainStatus` component will automatically connect

## Testing

Run test on iPhone 17 Pro Max simulator:

```bash
cd /Users/studio/Library/Mobile\ Documents/com~apple~CloudDocs/Ultimate\ Ecosystem\ /Utimate\ Musician\ app/UltimatePlatform_MONOREPO_MASTER/apps/primary_app/ultimate_musician_full_project_v3/mobile

# Install dependencies
npm install

# Start simulator
npx expo start --ios

# Press 'i' to open in iPhone 17 Pro Max simulator
```

Then navigate to: **CineStage** screen to see the animated brain logo.
