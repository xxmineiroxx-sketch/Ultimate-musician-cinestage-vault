
# Ultimate Musician Mobile

Expo / React Native app for Ultimate Musician.

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
