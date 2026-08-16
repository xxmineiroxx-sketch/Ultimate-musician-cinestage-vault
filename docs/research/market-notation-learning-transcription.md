I have enough verified material across all five products. Compiling the final report now.

---

# Benchmark: Notation / Learning / Transcription Practice (Aug 2026)

## 1. Product Snapshots

**MuseScore Studio 4 + MuseScore.com** — Muse Group (owns Ultimate Guitar, Audacity), Cyprus.
- *Desktop:* free/open-source (GPL-3.0) scorewriter, Win/macOS/Linux. Current **4.7.x** (4.7 May 2026; 4.7.3 Jun 11 2026; [news](https://musescore.org/en/news), [Wikipedia](https://en.wikipedia.org/wiki/MuseScore)). Renamed "MuseScore Studio" Jan 2024.
- 2024–26 additions: 4.4 (Aug 2024) Qt6/native Apple Silicon; **4.5** (Mar 2025) dynamics popup, drum-pad percussion panel, Finale-style "input by duration" ([4.5 notes](https://musescore.org/en/4.5)); **4.6** (Sep 2025) hide-empty-staves, chord-symbol overhaul w/ polychords, auto-filling fretboard diagrams, TablEdit import, VST3 on Linux ([4.6 notes](https://musescore.org/en/4.6)); 4.6.4 added **Cantai online AI voices that sing lyrics in playback**; **4.7** (May 2026) guitar dive lines, capo transposition, searchable mixer, ASIO, MP4 export.
- Import/export: MusicXML 4.0, MIDI, Guitar Pro, MEI, TablEdit; PDF/SVG/PNG; WAV/MP3/FLAC/OGG audio out; VST3 + free MuseSounds libraries.
- *MuseScore.com + mobile app (iOS/Android):* "over 3 million free scores" ([Google Play](https://play.google.com/store/apps/details?id=com.musescore.playerlite)); in-app practice player: tempo change, section looping, metronome, on-screen piano with note highlighting, transposition, auto-scroll, PDF/MIDI/MP3 export; **MuseScore LEARN** courses (piano/guitar/violin, theory, ear training). **PRO subscription** gates downloads/offline; **Official Scores** (licensed publisher content, launched Sep 2021) cost extra. Exact 2026 PRO price unverified (musescore.com blocks crawlers; historically ~$49.99/yr).

**Soundslice** — independent, web-only (PWA); [plans](https://www.soundslice.com/plans/): Free $0 / **Plus $5/mo** / Teacher $20/mo (100 students) / **Licensing $100/mo** (B2B embed + API; e.g. TrueFire). Yearly −16%.
- Signature: notation/TAB **synced to real audio/video** (YouTube free; own MP3/video = Plus). Drag-across-notes looping, saved "clips," slowdown w/o pitch change, MP3 pitch correction, transpose, part solo, speed training, practice history, private notes.
- AI-adjacent: **sheet-music scanner** (PDF/photo→notation; 2 pages/mo free, 100 on Plus), **auto-sync** of notation to recordings, **auto-generated stems** (vocals/drums/bass) — all paid tiers. Explicitly **no automatic audio transcription**: "No software in the world does that with any reasonable degree of accuracy" ([transcribe page](https://www.soundslice.com/transcribe/)).
- Editor free, unlimited scores; MusicXML/Guitar Pro import; MusicXML/GPX/PDF/MIDI export on paid plans. **Store** sells creator-made courses/transcriptions at per-item prices set by creators ($3–$97 observed; [store](https://www.soundslice.com/store/), [sell page](https://www.soundslice.com/sell/)) — per-score purchase model, no all-you-can-eat catalog of commercial songs.

**Yousician** — iOS/Android/PC (+visionOS listing); v5.36.0 (Aug 4, 2026). Guitar, bass, ukulele, piano (separate "Piano by Yousician" app), singing; siblings GuitarTuna, Simply Sing.
- Core: **mic-based real-time note recognition** scoring pitch/timing as you play a real instrument; 10,000+ lessons/songs, guided paths, progress tracking across 300+ techniques; weekly new songs; artist lesson series (Metallica, Jason Mraz, Juanes); claims 20M monthly users across apps ([App Store](https://apps.apple.com/us/app/yousician-learn-play-guitar/id959883039), [site](https://yousician.com/)).
- Pricing (current US IAP): One-instrument **$19.99/mo or $119.99/yr**; **Premium+ $29.99/mo; yearly listed at both $159.99 and $179.99** (implies a recent hike/A-B test); 3-month $59.99; Family = 4 Premium+ accounts. No lifetime tier.

**Anytune (Pro+)** — iOS/iPadOS universal, macOS (separate), **Android (new, 100K+ Play downloads)**, Apple Watch/visionOS support. v4.9.4 (Jul 14, 2026).
- Pricing: Free tier + à-la-carte packs ($1.99 Basic, $2.99 Import, $4.99 Pro, $4.99 Studio, $4.99 Export, $4.99 Remote/Watch); **Pro+ $14.99 one-time** (all packs); **Mac $34.99 one-time** w/ 30-day trial ([App Store](https://apps.apple.com/us/app/anytune-transcribe-practice/id415365180), [Mac App Store via archive](https://web.archive.org/web/2026/https://www.anytune.app/anytune-mac/)). No subscription on Apple platforms.
- Features: slowdown to 0.05x pitch-preserved, ±24-semitone pitch shift, marks/loops, **Step-It-Up loop interval trainer** (auto tempo ramp), Transcribe mode, **ReFrame** stereo-field instrument isolation, FineTouch EQ, LiveMix (play into the mix), scrolling lyrics/tabs (rich text in 4.9), iCloud file sync (4.9), MIDI/Bluetooth foot-pedal control, Watch remote, performance recording.
- **Android-only exclusives**: tempo-adjust **Spotify/Apple Music streams (free)** and **Demix AI stem separation** (paid credits); feature parity still in progress ([site](https://www.anytune.app/)). Apple builds cannot touch DRM streams.

**Transcribe! (Seventh String)** — Win/Mac/Linux desktop only; **$39 one-time** (volume to $15), 30-day trial, 3-computer cross-OS license ([buy](https://www.seventhstring.com/xscribe/buy.html)). Current **9.60.x** (Jul–Aug 2026); 9.50 (Jan 2026) added video cropping, Windows-on-ARM support ([history](https://www.seventhstring.com/xscribe/history.html)).
- Waveform-centric navigation, section/beat markers + annotations, unlimited named loops, speed 1/20×–2×, pitch in cents (±3 octaves), EQ, karaoke/center-cancel, **spectrum analysis + note/chord guessing with piano-roll view**, clickable piano, video display, stem-file support (9.30), metronome, **foot-pedal support**, scripting/automation. Deliberately manual: "It doesn't do the transcribing for you" ([overview](https://www.seventhstring.com/xscribe/overview.html)).

## 2. Table Stakes 2026
- Variable speed with pitch preservation (down to ≤0.5×, artifact-free); pitch shift/key change (±12–24 st, cent-fine).
- A-B looping with named/savable loops and markers; auto-advancing "speed trainer" loops.
- MusicXML + MIDI import/export (Guitar Pro import expected in notation tools).
- Cloud library sync across devices; offline access for owned content.
- Freemium entry: genuinely usable free tier (MuseScore, Soundslice, Anytune, Yousician all qualify).
- For notation tools: realistic playback (MuseSounds/VST), mobile viewer apps, TAB + standard notation + fretboard diagrams.

## 3. Emerging / AI-Forward Differentiators
- **AI stem separation (source separation)**: Soundslice (auto vocals/drums/bass stems on paid plans), Anytune Android (**Demix**, metered credits). Anytune iOS/Mac still ships DSP-based ReFrame instead.
- **OMR scanning** (photo/PDF→editable notation): Soundslice's scanner is a headline feature.
- **AI auto-sync** notation↔recording (Soundslice).
- **Singing-score synthesis**: MuseScore 4.6.4 + Cantai online AI voices.
- **Streaming-service practice**: Anytune Android slows Spotify/Apple Music streams — unique in category; Apple platforms blocked by DRM.
- **Real-time note-recognition feedback**: still essentially Yousician-only at consumer scale.
- **Notable holdouts**: Soundslice and Transcribe! explicitly refuse audio→notation auto-transcription on accuracy grounds — a positioning gap as competitors (Moises, etc.) normalize it.
- Hands-free control: Anytune (MIDI, Watch, Bluetooth pedals), Transcribe! (foot pedals) — relevant to live/stand use.

## 4. User Pain Points
- **MuseScore.com**: subscription flow criticized as "dark patterns" (GIGAZINE, via Wikipedia); 2019 Disney/Hal Leonard takedowns and paywalling all downloads left lasting distrust.
- **Soundslice**: scanner accuracy complaints — "failed to produce a single accurate music score… help requests ignored" ([r/… search result](https://old.reddit.com/search?q=soundslice+worth+it&sort=relevance&t=year)); no mobile app (PWA only).
- **Yousician**: price — redditor notes Rocksmith+ matches "$140/year" ([r/yousician](https://old.reddit.com/r/yousician/search?q=price&restrict_sr=on&sort=relevance&t=year)); dual $159.99/$179.99 yearly IAPs suggest a hike; licensing-driven song removals are a long-standing complaint theme (unverified this session).
- **Anytune**: Mac and iOS are **separate purchases**; confusing pack structure ([r/musicians thread](https://old.reddit.com/r/musicians/search?q=anytune&restrict_sr=on&sort=relevance&t=year)); no Windows version.
- **Transcribe!**: same thread — user on a pirated Intel build faces forced purchase as macOS drops Intel; desktop-only, utilitarian UI, zero automation.

## 5. Sources
musescore.org ([4.5](https://musescore.org/en/4.5), [4.6](https://musescore.org/en/4.6), [news](https://musescore.org/en/news)) · [Wikipedia: MuseScore](https://en.wikipedia.org/wiki/MuseScore) · [MuseScore on Google Play](https://play.google.com/store/apps/details?id=com.musescore.playerlite) · [Soundslice plans](https://www.soundslice.com/plans/), [home](https://www.soundslice.com/), [transcribe](https://www.soundslice.com/transcribe/), [store](https://www.soundslice.com/store/), [sell](https://www.soundslice.com/sell/) · [Yousician site](https://yousician.com/) + [App Store listing](https://apps.apple.com/us/app/yousician-learn-play-guitar/id959883039) · [Anytune site](https://www.anytune.app/) + [iOS App Store](https://apps.apple.com/us/app/anytune-transcribe-practice/id415365180) + [Mac listing (Wayback)](https://web.archive.org/web/2026/https://www.anytune.app/anytune-mac/) + [Play search](https://play.google.com/store/search?q=anytune&c=apps) · Seventh String ([overview](https://www.seventhstring.com/xscribe/overview.html), [buy](https://www.seventhstring.com/xscribe/buy.html), [history](https://www.seventhstring.com/xscribe/history.html)) · Reddit via old.reddit search ([Soundslice](https://old.reddit.com/search?q=soundslice+worth+it&sort=relevance&t=year), [Anytune/Transcribe!](https://old.reddit.com/r/musicians/search?q=anytune&restrict_sr=on&sort=relevance&t=year), [Yousician](https://old.reddit.com/r/yousician/search?q=price&restrict_sr=on&sort=relevance&t=year)).

*Verification notes: musescore.com pricing page is bot-blocked (403) — PRO/Official-Scores prices marked unverified. Soundslice per-score store rationale is documented as creator-set pricing, not publisher licensing; Soundslice's "Licensing" plan is B2B embedding, not music rights. Anytune Android launch date unverified (Play shows 100K+ downloads as of Aug 2026).