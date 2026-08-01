# Ultimate Musician - Apple Notes Idea Inventory

This note mirrors `docs/apple-notes-idea-inventory-2026-08-01.md`.

Key captured themes:

- Service review workflow with creator tracking, Admin/Worship Leader approval, and assigned-team publishing.
- Notifications: message tone, assignment tone, 3-day and 1-day service reminders, restart-safe reminder tracking, musician-controlled notification preferences, future Apple Watch and iPhone widget support.
- Desktop Organizer Console as the Mac-first heavy processing and planning surface.
- YouTube-to-stems pipeline where desktop processes first, claims jobs with leases, and Cloudflare is fallback.
- Mixer scene intelligence with read-only detection first, approval before applying changes.
- Per-song cue timeline for mixer, FOH, lighting, lyrics, and live execution.
- Best-in-class waveform pipeline with vertical stem controls and tempo tap/type support.
- Branch-aware role verification and guest musician invites.
- CineStage Terminal / `csai` as the local command bridge.

Security note:

- Apple Notes contained live-looking API keys and credentials. Those values were not copied here. Rotate them and move secrets into proper secret stores.

Next implementation targets:

1. Service review metadata and dashboard filters.
2. Apple Watch controls and iPhone widget support. Playback notification preferences and scheduled service reminders are implemented as of 2026-08-01.
3. Song cue timeline model.
4. Read-only mixer profile discovery.
5. Admin Idea Vault / Blueprint Vault.
6. Role and branch verification tests.

Implemented on 2026-08-01: shared service time parsing and normalization across service creation, reminders, conflict detection, setlist expiry, and widget handoff.
Implemented on 2026-08-01: desktop stem worker registry plus claim/heartbeat leases for single-desktop processing and stale claim recovery.
