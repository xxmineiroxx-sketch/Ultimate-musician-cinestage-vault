
# Ultimate Musician Mobile

Expo / React Native app for Ultimate Musician.

## Universal Template Fit

Ultimate Musician is the admin and music-director app in the Ultimate Ecosystem. It owns service planning, people, roles, proposals, messages, song library management, stems, CineStage control, and team readiness.

Success criteria from the universal template:

- Keep admin decisions fast and exception-led: missing confirmations, blocked team members, open proposals, stale sync, and stem readiness should be visible without digging.
- Use stable HTTPS services for production builds. LAN addresses are local-only.
- Keep org credentials in `.env`, EAS secrets, GitHub secrets, or runtime branch storage.
- Update Obsidian, Graphify, and GitHub when durable architecture or deployment knowledge changes.

- NewSongScreen → create a song & stems job
- MixerScreen → vertical track faders with Solo/Mute
- LiveScreen → ONE global waveform-style timeline + section buttons + Click/Guide/Pad toggles + track strips

To run:

```bash
cd mobile
npm install
npx expo start
```

Expo Go (quick start):

```bash
EXPO_PUBLIC_API_BASE=http://<your-ip>:8000 npx expo start --go --host lan
```

Dev client (recommended for native modules):

```bash
npx expo run:ios
npx expo start --dev-client --host lan
```

Production sync defaults are configured through `screens/config.js` and `.env`. Do not hardcode real credentials or temporary tunnel URLs in source.
