All seven research tracks came back with verified data. Here is the merged benchmark.

---

# Ultimate Musician — Competitive Benchmark (researched Aug 2026)

## Competitor landscape quick map

**1. Stems/practice:** Moises (category leader, ~75M users claimed; Free / Premium $5.99/mo or $39.99/yr / Pro $29.99/mo — live App Store IAP), LALAL.AI (Lite $7.50/mo, Pro $15/mo, 10 stem types, Orion model, local processing on Pro), RipX DAW ($99 / PRO $198 perpetual, fully on-device, note-level "edit audio like MIDI"; v8 shipped Dec 2025), AudioSourceRE DeMIX Pro V6 ($495, GPU/on-device, real-time VOXLESS/DRUMLESS plugins), Stemz (mobile stem player), Jamzone (licensed 73k backing-track catalog with mixer).

**2. Live playback:** Prime by Loop Community (iOS/Mac, free tier; v8.x added Prime MD AI cues, Tonic Pad Player, Loop Connect), Playback by MultiTracks.com (iOS + recent Mac version w/ Dante, 32 outs, SMPTE; Premium $9.99/mo annual, Live Bundle $29.99/mo w/ 30 team seats), Stage Traxx 4 ($29.99 one-time incl. 12 months of features, perpetual fallback; 32 tracks/16 buses, network sessions, MTC — the solo/cover-act favorite), Ableton Live 12 ($99/$349/$749; 12.3 added stem separation in Suite, 12.4 added Link Audio), Gig Performer 5 (Pro $169, Essentials $59; plugin host first, backing tracks second), One Man Band ($29.99, unmaintained since 2018 — cautionary data point).

**3. Charts/lyrics/setlists:** forScore ($24.99 one-time + Pro $14.99/yr; PDF-only, no ChordPro transpose; Cue companion turns pages on 15 follower devices), OnSong 2026 (Essentials $3.99/mo or $29.99/yr, Premium $5.99/mo or $59.99/yr), Ultimate Guitar (Pro $9.99/mo; catalog app, no setlists/pedals), Planning Center Music Stand (free app but needs paid Services plan + $5–10/mo add-on; 3.53★ — weakest in set), SongbookPro (~$6/platform one-time solo; Groups from $4/user/yr launched Nov 2024), BandHelper ($40–200/yr per band by size; scheduling + finance + MIDI automation).

**4. Notation/learning:** MuseScore Studio 4.7 (free/open-source desktop; .com PRO paywall for downloads), Soundslice (Plus $5/mo; notation synced to real audio; scanner, auto-stems, auto-sync), Yousician ($19.99/mo one instrument; Premium+ $29.99/mo; mic-based note recognition), Anytune (Pro+ $14.99 one-time iOS; new Android version uniquely slows Spotify/Apple Music streams + offers Demix AI stems — Android-only features), Transcribe! ($39 one-time, desktop).

**5. Band collaboration/cloud:** Planning Center Services (80k+ churches, per-person pricing, auto-scheduling), MultiTracks.com stack (ChartBuilder $1.99/seat/mo, RehearsalMix per-instrument practice mixes $14.95/mo per 5 members, Playback Team Sharing), BandLab (100M+ users, cloud DAW + Splitter AI stems, but no band-ops workflow), BandHelper, Back On Stage ($49/mo leader, auto-booking), Band Pencil ($24–80/mo, agency CRM).

---

## (a) Table-stakes checklist per category (2026)

**Stems/practice**
- 4-stem split (vocals/drums/bass/other) baseline; 6–10 stem types at paid tiers
- Stem mixer with mute/solo + export; independent pitch/key (12 keys) and tempo change with auto BPM/key detection
- AI chord detection synced to bars; AI lyric transcription; chords+lyrics combined view (Moises has set this expectation)
- Song-generated click/smart metronome + count-in; section detection and looping
- Free tier; mobile + desktop + web; DAW plugin (VST/AU) in pro tier

**Live playback**
- Fully offline playback of downloaded tracks (non-negotiable for gigs); free entry tier
- Per-stem mixer; separate click + spoken guide cues (AutoPan click-L/tracks-R is the worship default)
- Setlists with auto-advance, crossfade/gapless transitions, per-song transition settings
- Section loop/jump/live re-order; multi-output USB interface routing with pre-assigned buses
- MIDI out (PC/CC) to drive lyrics/lights/patches; Bluetooth/MIDI foot-pedal mapping
- Cloud setlist sync + team sharing; safety features (double-tap stop protection, backup/restore)

**Charts/lyrics/setlists**
- ChordPro + PDF import; instant transpose/capo on text charts
- Stylus-grade annotation (layers, highlighter, undo); Bluetooth pedal page turns (AirTurn/PageFlip), half-page turns, autoscroll
- Setlist building + sharing to bandmates; offline-first libraries; cloud backup
- Dark mode/stage readability (high contrast, visual-flash metronome); built-in tuner + metronome
- Linked audio/backing tracks per chart; lyrics teleprompter/external-display output

**Notation/learning**
- Variable speed with pitch preservation (≤0.5×, artifact-free); pitch shift in cents
- A-B looping with named loops; auto-ramping "speed trainer" loops
- MusicXML + MIDI import/export (Guitar Pro import expected); realistic playback sounds
- Cloud sync, offline for owned content, genuinely usable free tier

**Band collaboration**
- Cloud song/chart library with team access; role permissions (leader vs member; members see only their gigs/charts)
- Availability collection, accept/decline, automated reminders, blockout dates
- Setlist builder synced to every device; charts transposable to all 12 keys (capo/Nashville-number options)
- Per-member rehearsal audio (part-isolated mixes — RehearsalMix is the reference implementation)
- Leader→follower page/chart sync; calendar sync; for gigging bands: contracts/invoices/payroll

---

## (b) Emerging / AI-forward differentiators

- **On-device, real-time stem separation** is the hot axis: Algoriddim djay's Neural Mix proves real-time stems run on an iPhone Neural Engine (patented, local files only); RipX and DeMIX V6 are fully on-device desktop; Ableton Live 12.3 Suite ships separation (Music.AI). **Moises is still cloud-only** — offline/privacy gap.
- **AI practice layer**: Moises (chord detection, lyric transcription, smart metronome, generative "Stem Generation"/Voice Studio), Stage Traxx 4 (automatic chord detection, LRC-timed scroll), Soundslice (sheet-music scanner OMR, auto-sync notation↔recording, auto-stems), Anytune Android (Demix stems).
- **On-device AI in charts**: OnSong 2026 leads — ChordFlow detects chords inside PDFs for real transpose, Key Finder derives key from a sung phrase, voice control. No rival ships comparable chart AI.
- **Auto-advancing charts tied to the arrangement**: Playback Sync → ChartBuilder ("never swipe charts again"); forScore Cue and Music Stand linked devices make "bandleader drives, members follow" a real feature axis. Nobody yet ships a *true* role-based collaboration model around this.
- **Networked band sync**: Stage Traxx 4 Network Sessions (host/client lyric+playback sync), Playback Remote.
- **Show automation**: MIDI cues for lyrics/lights (Playback's 14k premade cues, Prime MIDI out, BandHelper per-song patches), SMPTE/LTC (Playback) vs MTC (Stage Traxx), Dante + 32 outs (Playback Mac), Ableton Link / Link Audio (Live only).
- **Generative audio**: Moises Stem Generation/Lyric Writer, BandLab SongStarter/AutoMaster, LALAL.AI Voice Cloner, MuseScore 4.6.4 Cantai AI voices singing lyrics.
- **Redundancy as a marketed feature**: PlayAudio 12 hardware failover (Playback), failover output signal (ST4) — pro rigs expect a documented failover story.
- **Open whitespace (nobody tracked ships it)**: Apple Watch remote for performance apps, spatial audio, any real Spotify/Apple Music stem integration, audio→notation auto-transcription (Soundslice and Transcribe! explicitly refuse on accuracy grounds), real-time note-feedback outside Yousician.

---

## (c) Platform & technical constraints (verified against official docs)

**Spotify — effectively closed for your use case.** Mobile SDKs are app-remote only: the Spotify app owns playback; your app never touches audio (no PCM, no effects, no offline). The Nov 27, 2024 Web API changes removed Audio Features, Audio Analysis, Recommendations, and preview URLs from development-mode/new apps. Developer Policy v10 (eff. May 15, 2025) bans derivative works (stems are derivative works), feeding content to ML models, **mixing/segueing Spotify audio with any other audio**, and all commercial use of streaming apps (no IAP, no ads). Extended quota now requires an organization with **≥250k MAU**. Sources: [Nov-2024 API changes](https://developer.spotify.com/blog/2024-11-27-changes-to-the-web-api), [Developer Terms](https://developer.spotify.com/terms), [quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes).

**Apple Music — playback yes, processing no.** MusicKit allows full-track playback for subscribers, catalog search, library access — but playback is delegated to the system player with no PCM/buffer access and no public API to route the stream into AVAudioEngine (no tap/EQ/effects), no DRM-free access, no offline export, no recording. FairPlay DRM; no Android MusicKit playback SDK exists. Sources: [MusicKit docs](https://developer.apple.com/documentation/musikit), [Media Services Terms](https://www.apple.com/legal/internet-services/itunes/us/terms.html).

**Consequence (this is why Moises works the way it does)**: stem features must run on user-imported/licensed files only (Moises: local files, Drive/Dropbox/iCloud, URL; Jamzone sidesteps via a licensed catalog). Anytune's Android-only stream slow-down shows even plain tempo-on-streams is a licensing exception, not the rule. App Review Guideline 5.2.3 bars saving/converting third-party media without authorization.

**iOS audio/live rig**: 64–128-frame buffers @48 kHz (≈1.3–5.3 ms/buffer) make ~10 ms round-trip latency achievable; background audio is a legitimate background mode (2.5.4) but sustained Neural Engine load invites 2.4.2 battery/heat scrutiny; digital features must use IAP (3.1.1). [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)

**Android**: AAudio/Oboe with LowLatency performance mode; HAL buffer sizes vary 96–512 frames per device (fragmentation tax; effects kill the fast-mixer path); CDD `audio.pro` = ≤20 ms round-trip, but most devices are far worse. Android 14+ requires `mediaPlayback` foreground-service type + Play Console declaration with a demo video. Sources: [Oboe FullGuide](https://raw.githubusercontent.com/google/oboe/main/docs/FullGuide.md), [Play FGS policy](https://support.google.com/googleplay/android-developer/answer/13392821).

**On-device ML reality check**: Demucs htdemucs runs ≈1.5× track duration on desktop CPU (3–7 GB GPU RAM) — fine for batch on high-end phones, not real-time without distilled/proprietary models. Cloud separation (Moises) trades latency + upload waits + privacy for quality.

---

## (d) Top user pain points (by recurrence)

**Very high recurrence**
- **Ultimate Guitar**: ads/upsells shown even to paying users, dark-pattern billing (trials converting to $75–$200 charges, refused refunds), forced launch questionnaires, broken pedal scroll on Pro tabs. Sitejabber 1.5★/103; dominant themes on r/UltimateGuitar.
- **Yousician**: unannounced $19.99→$29.99/mo hike, mass licensed-catalog removals (Sony: Bowie, ABBA…), AI-generated songs replacing real ones ("can't stand the sound"), cancellation/billing traps.
- **BandLab**: uncloseable launch ads, paywall creep ("used to be free"), social-feed bloat burying projects, Splitter caps/errors.
- **Worship-stack cost**: PCO + Playback + ChartBuilder + content rentals stack to ~$135/mo+; "churches shouldn't pay enterprise prices" resonates; per-seat pricing multiplies painfully across volunteer teams.

**High recurrence**
- **Playback/Prime reliability**: glitches "3 of 4 Sundays" (settings resetting, sync drops); a cloud-vs-local setlist conflict silently overwrote a custom arrangement pre-service; click "not keeping time" over IEM rigs. Reliability trust is the live category's weakest point.
- **Ableton-as-tracks-rig setup burden**: worship MDs manually rebuilding sets weekly ("two hours every Saturday night") — the exact pain Prime/Playback exist to solve.
- **Music Stand (3.53★)**: annotations lost ("deletes ALL of my notes"), page-load delays mid-set, update bricked 6 church iPads at once.
- **ChartBuilder**: audio stops when phone locks/backgrounds; sync delays of minutes–hours; buggy annotations.

**Moderate**
- **Moises**: upload-wait (no local processing), free-tier tightness, Pro price ($29.99/mo), artifacts, opaque support.
- **OnSong**: complexity/learning curve, version fragmentation breaking shared songs; legacy subscription backlash (2019–20) never fully healed.
- **forScore/Stage Traxx/OnSong/Prime/Playback**: Apple-only — Android gigging musicians are locked out of nearly the whole category.
- **MuseScore**: .com paywall vs free .org app confusion is chronic (r/musescore bans download-requests in its sidebar).
- **Bluetooth pedals** (AirTurn, iRig BlueBoard): widely reported unreliable mid-gig; users seek wired.
- **LALAL.AI**: minute-metered pricing disliked; Logic Pro's free built-in Stem Splitter cited as a cancellation reason.

**Unmet needs users explicitly voice** (r/worshipleaders and elsewhere):
1. **One app combining charts + stems/tracks + setlists that auto-advances charts with the arrangement** — currently duct-taped from PCO + Playback + ChartBuilder (+ Ableton); multiple builders pitch exactly this. This is precisely Ultimate Musician's stated center.
2. Cheaper worship/small-team stacks; per-seat pricing fatigue.
3. Viable Android options across the board.
4. Accurate charts ("atrociously incorrect" official/AI charts fixed by hand at rehearsal).
5. Song-change notifications to team members; per-member rehearsal mixes without a $15/mo add-on.

---

**Confidence notes**: items the researchers flagged unverified include Prime's paid-tier prices, Playback Mac's exact launch date, Moises' current model names, LALAL.AI's newest model lineup (Perseus/Andromeda/Lynx — third-party claims), DeMIX V6's cloud-vs-local split, and Yousician's price hike (user-reported). Moises pricing above comes from the live App Store IAP list (Aug 2026); a third-party review aggregator showed lower figures — trust the App Store numbers. Key primary sources: developer.spotify.com, developer.apple.com, moises.ai/features, lalal.ai/pricing, hitnmix.com, multitracks.com/products/*, stagetraxx.com, forscore.co, songbook-pro.com, bandhelper.com, planningcenter.com, soundslice.com/plans, seventhstring.com, plus Reddit/App Store review feeds linked in the per-category reports.