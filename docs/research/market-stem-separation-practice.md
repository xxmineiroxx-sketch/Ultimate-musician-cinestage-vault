I have enough verified material across all products. Compiling the report now.

---

# STEM SEPARATION / PRACTICE TOOLS — Competitive Benchmark (as of Aug 2026)

## 1. PRODUCT SNAPSHOTS

**Moises** (Moises Systems Inc.) — *practice-first musician app; category leader*
- Platforms: iOS/iPadOS 17+, macOS 14+ (Apple Silicon), Android, Windows, web, Apple Vision Pro, Apple TV. Live listing shows v2.140.0 updated mid-Aug 2026; 4.7★/27K iOS ratings; claims ~75M users.
- Pricing (live App Store IAP): Free tier (vocals/drums/bass separation, chord detection, metronome click, pitch shift, BPM detection, setlists); **Premium $5.99/mo or $39.99/yr** (unlimited separation, lead/rhythm + acoustic/electric guitar, main/backing vocals, full practice tools); **Pro $29.99/mo** (Hi-Fi models, drum-parts + multimedia stems, 180-min uploads, Voice Studio, VST plugins).
- Feature set (live features page): stem separation/mixer, smart metronome + count-in, AI chord detection (3 skill tiers), key detection/transpose to 12 keys, Capo Mode, AI lyric transcription (EN/ES/PT/FR/IT), chords+lyrics view, song-section detection/looping, pitch & speed change, collaborative setlists, mastering, video recording, DAW plugin, Lyric Writer (AI), Voice Conversion, **Stem Generation (generative parts from a riff/sketch — "AI Studio")**, multimedia dialogue/music/effects separation.
- Notable: won **Apple iPad App of the Year 2024** (widely reported; third-party corroboration). Processing is cloud-based (upload → separate).

**LALAL.AI** — *separation utility for producers/DJs/content (not a practice app)*
- Platforms: web, Windows, macOS, Linux, Android, iOS; API; **VST plugin (Pro plan)**; **local/on-device processing in desktop app (Pro plan)**.
- Pricing (live page, Aug 2026): Starter free (10 min, relaxed queue); **Lite $7.50/mo ($90/yr)**: unlimited relaxed + 90 fast-queue min/mo; **Pro $15/mo ($180/yr)**: 250 fast-queue min/mo, VST, local processing, API, early access. (Replaced older per-minute packs.)
- Stems: official splitter offers vocals, instrumental, drums, bass, guitar, synth, strings, wind (10 stem types incl. piano/electric+acoustic guitar per third-party sources; self-described "world's first 10-stem splitter"). User-selectable neural network per split; vocal reverb/echo reduction option.
- Models: Rocknet → Cassiopeia → Phoenix → **Orion** (official announcement Oct 2023: direct-synthesis vs mask-based, 2× faster, 20× training compute, +2.5 dB SDR vs Phoenix, 70% fewer artifacts) → **Perseus** (vocal separation; r/lalalai release post, ~2025 unverified) → "Andromeda" and current "Lynx" claimed only by third-party lalalai.org (unverified). Also ships Voice Cleaner, Echo/Reverb Remover, Lead/Back Splitter, Voice Changer, Voice Cloner.

**RipX DAW / RipX DAW PRO** (Hit'n'Mix Ltd; formerly DeepRemix/DeepAudio/DeepCreate) — *production/remix/post; note-level editing niche*
- Platforms: macOS 10.15+ (incl. Apple Silicon) / Windows 64-bit; fully **on-device** (GPU-accelerated ripping; internet only for license check every 15 launches; offline activation available).
- Pricing (official buy page + SOS/Recording Mag): **RipX DAW $99/£99/€114; PRO $198/£198/€228** perpetual; constant discounting (live Aug 2026 summer sale $74/$148; a May 2025 promo sold PRO at $99). 21-day trial; 50% edu discount.
- Features: **6+ stem separation** (Voice, Bass, Drums/Percussion, Guitar, Piano, Other — SOS v7 review); "edit audio like it's MIDI" note/harmonic-level editing (Rip format); pitch/time per note; MIDI export; AI-music-generator integration (e.g. Stable Audio). PRO adds Audioshop sound tools, Harmonic Editor, Clean & Repair, RipScripts scripting, **RipLink VST3/ARA2/AU + AudioSuite**; external-editor workflow for Logic/Ableton/FL Studio. **v8 shipped Dec 2025**: one-click looping, new effects, dynamic Track Starters (MusicTech).

**AudioSourceRE DeMIX Pro / Essentials V6** — *pro production/post/restoration; Essentials targets DJs/karaoke*
- Platforms: macOS 12.7+/Windows 10+ standalone; iLok required. Plugins: **VOXLESS v2 (real-time vocal separation), DRUMLESS (real-time drums), RePAN (pan-based)** — VST/AU/AAX.
- DeMIX Pro V6 (official page): separators for all/lead/backing vocals, drums, bass, guitar, piano, strings; unlimited non-destructive separations; merge; multichannel mixer; batch; 24-bit/192 kHz. **V6 adds instant playback during processing, simultaneous multi-stem (interleaved) separation, GPU/Apple Silicon acceleration, new models** — i.e. shifted from its historically cloud-based architecture (SOS 2019) toward on-device (exact current split unverified).
- Pricing: **DeMIX Pro $495** (B&H listing, corroborated by Yahoo Shopping financing math; B&H snapshot is older — flag as "last verified retail $495"); Essentials price unverified (site is JS/FastSpring gated). Essentials removes vocals/drums/bass for quick backing tracks.

**Mobile stem players** — **Stemz** (iOS "Stemz: remover vocal audio pro" ~4.7★/16K ratings; Android v5.01.01; launched Mar 2023; claims 2.5M users): AI separation into a fader-style stem mixer, vocal removal/karaoke, tempo change; freemium (IAP pricing unverified). Adjacent: **Jamzone** — licensed catalog of 73,000 backing tracks (+400/mo), multitrack mixer, synced chords/lyrics, isolate/slow/pitch/loop, setlists, AUv3, live audio routing. *Jammr is an online jamming platform, not a stem player — excluded.*

## 2. TABLE STAKES 2026
- 4-stem split (vocals/drums/bass/other) as baseline; 6–10 stem types (guitar, piano, strings, wind, lead/backing vocal) at paid tiers.
- Stem mixer with mute/solo + stem export; backing-track/karaoke creation.
- Independent pitch/key and tempo change with auto BPM/key detection.
- AI chord detection synced to bars/beats (Moises standard; absent in LALAL/DeMIX/RipX).
- AI lyric transcription + synced lyrics/chords view (Moises).
- Song-generated click track/smart metronome + count-in; section detection/looping.
- Free tier; mobile+desktop+web coverage; batch processing and DAW plugin (VST/AU) in pro tiers.

## 3. EMERGING / AI-FORWARD DIFFERENTIATORS
- **On-device AI separation**: RipX (fully local), DeMIX V6 (GPU/Apple Silicon), LALAL.AI Pro desktop (local processing). Moises remains cloud-only — privacy/latency/offline gap.
- **Generative audio**: Moises Stem Generation ("AI Studio"), Voice Conversion/Voice Studio, Lyric Writer; LALAL.AI Voice Cloner/Changer; RipX v8 Track Starters + AI-generator (Stable Audio) pipeline.
- **Synthesis-based separation** (fill-in rather than mask-cut): LALAL Orion; RipX note/harmonic resynthesis.
- **Real-time separation plugins**: AudioSourceRE VOXLESS/DRUMLESS/RePAN; RipX RipLink ARA2; LALAL VST. (Moises VST exists but users report it is *not* real-time.)
- **Note-level MIDI extraction/editing**: unique to RipX.
- **Multimedia/dialogue-MFX stems**: Moises Pro module (podcast/video creators).
- **Mastering**: Moises built-in.
- **Whitespace (no tracked product ships it)**: Apple Watch or foot-pedal control, spatial audio, direct Spotify/Apple Music streaming integration (licensing forces file/URL import; Jamzone sidesteps via licensed catalog).

## 4. USER PAIN POINTS
- **Moises**: Pro tier seen as pricey ("$340/yr… looking for a replacement," r/drums Nov 2024); own-file uploads erroring (FLAC rips, r/guitarlessons Nov 2025); opaque support/"cash grab," VST plugin standalone-only not real-time (r/guitarlessons Jan 2024); Trustpilot (Jun 2026): stem-generation attempt caps pushing upgrades, artifacts in generated stems, weak mastering, ignored refunds, "VSTs coming soon" for ages, stagnant interface.
- **LALAL.AI**: pricing historically mocked as "nuts" (€18/90 min era, Reddit); Logic Pro's free built-in Stem Splitter (2024+) cited as reason to cancel (Reddit); third-party benchmarks place it below open-source HTDemucs-FT on dense full mixes (lalal-ai.net — third-party claim).
- **RipX**: steep learning curve from unique workflow (Sound on Sound); stem quality "not the best, not the worst — free online separators can beat it; the magic is in MIDI conversion" (r/SunoAI, May 2025); periodic online license checks.
- **DeMIX**: iLok dependency; historically slow cloud processing with ~3-min/track waits and non-undoable separations (SOS 2019 — predates V6's local acceleration); artifacts persist on difficult mixes.
- **Stemz**: limited independent review coverage; monetization gating typical of the genre (unverified specifics).

## 5. SOURCES
- Moises features/pricing/platforms: [features](https://moises.ai/features/), [App Store listing (live IAP prices)](https://apps.apple.com/us/app/moises-the-musicians-app/id1515796612), [Google Play](https://play.google.com/store/apps/details?id=ai.moises), [Moises pain points via Brave snippets of r/drums, r/guitarlessons, Trustpilot](https://search.brave.com/search?q=moises+app+reddit+complaints+stems); iPad App of the Year 2024 per [moisesai.org](https://moisesai.org) (third-party).
- LALAL.AI: [pricing](https://www.lalal.ai/pricing/), [stem splitter](https://www.lalal.ai/stem-splitter/), [product lineup/blog nav](https://www.lalal.ai/blog/), [Orion announcement + Perseus post, r/LALALAI via Brave](https://search.brave.com/search?q=LALAL.AI+Orion+neural+network+stem+separation+announcement), model lineup incl. Andromeda/Lynx per [lalalai.org](https://lalalai.org) (unverified third-party).
- RipX: [official site/buy](https://hitnmix.com/), [RipX DAW PRO page](https://hitnmix.com/products/ripx-daw-pro), [download/system reqs](https://hitnmix.com/download/), [Sound on Sound v7 review](https://www.soundonsound.com/reviews/hitnmix-ripx-daw-pro), [Wikipedia history](https://en.wikipedia.org/wiki/RipX), prices + v8 (Dec 2025) + r/SunoAI via [Brave](https://search.brave.com/search?q=%22RipX+DAW%22+%22%2499%22+%22RipX+DAW+PRO%22+price) (Gearspace, Recording Mag, MusicTech, BPB snippets).
- DeMIX: [AudioSourceRE homepage](https://www.audiosourcere.com/), [DeMIX Pro V6 product page](https://www.audiosourcere.com/products/demix-pro-audio-separation-software), [B&H $495 listing via Wayback](https://web.archive.org/web/2025/https://www.bhphotovideo.com/c/product/1663579-REG/audiosourcere_demix_pro_sound_seperation.html), [SOS 2019 review](https://www.soundonsound.com/reviews/audiosourcere-demix-pro).
- Stemz/Jamzone: [Yahoo snippets for Stemz store listings](https://search.yahoo.com/search?p=%22Stemz%22+remover+vocal+audio+pro+app+store), [Jamzone](https://jamzone.com/).

*Caveats: DeMIX Essentials price, Stemz IAP pricing, Perseus/Andromeda/Lynx dates, and DeMIX V6 cloud-vs-local architecture could not be confirmed against official 2026 sources (JS-gated storefronts, search rate limits); flagged inline.*