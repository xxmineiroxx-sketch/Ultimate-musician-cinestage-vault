
# Ultimate Musician Mobile

Expo / React Native app for Ultimate Musician.

- NewSongScreen → create a song & stems job
- MixerScreen → vertical track faders with Solo/Mute
- LiveScreen → ONE global waveform-style timeline + section buttons + Click/Guide/Pad toggles + track strips
- Audio engine uses `expo-av` to play the generated stem WAVs served from the backend `/media` path.

To run:

```bash
cd mobile
npm install
npx expo start
```
