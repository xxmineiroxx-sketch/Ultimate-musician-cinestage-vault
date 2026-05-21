# Ultimate Playback

Expo / React Native app for musicians and worship team members.

## Universal Template Fit

Ultimate Playback is the focused field app in the Ultimate Ecosystem. It should prioritize today's service, personal assignments, charts, stems, messages, blockouts, proposals, and live performance mode.

Success criteria from the universal template:

- Real iOS sign-in uses a stable HTTPS sync endpoint, not localhost, LAN IPs, or a temporary tunnel.
- The app keeps 1 to 2 tap access to the next service, my part, setlist, messages, and live mode.
- Unsupported sync endpoints fail gracefully with actionable messages.
- Offline or poor-network states should queue user actions where possible and make retry status visible.
- AI-assisted output such as charts, cues, and stem analysis should show confidence and require approval before publishing.

## Current Sync Endpoint

Playback currently uses this stable Cloudflare Worker endpoint for auth/status recovery:

```text
https://ultimate-playback-sync.studio-cinestage.workers.dev
```

The Worker source is tracked in:

```text
cloudflare/ultimate-playback-sync/
```

## Local Development

```bash
npm install
npx expo start
```

Use `.env.example` as the starting point for local configuration. Keep real secrets out of source control.

## Next Engineering Priorities

- Promote the recovery Worker to a full sync API or route Playback to a full production sync backend.
- Add lint and test scripts to match Ultimate Musician.
- Add offline event queue for assignment responses, messages, blockouts, and proposals.
- Standardize React Navigation with Ultimate Musician or document the v6/v7 boundary.
