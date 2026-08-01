# Ultimate Musician - Apple Notes Idea Inventory

This note mirrors `docs/apple-notes-idea-inventory-2026-08-01.md`.

Key captured themes:

- Service review workflow with creator tracking, Admin/Worship Leader approval, and assigned-team publishing.
- Notifications: message tone, 3-day and 1-day service reminders, restart-safe reminder tracking, future Apple Watch and iPhone widget support.
- Desktop Organizer Console as the Mac-first heavy processing and planning surface.
- YouTube-to-stems pipeline where desktop processes first and Cloudflare is fallback.
- Mixer scene intelligence with read-only detection first, approval before applying changes.
- Per-song cue timeline for mixer, FOH, lighting, lyrics, and live execution.
- Best-in-class waveform pipeline with vertical stem controls and tempo tap/type support.
- Branch-aware role verification and guest musician invites.
- CineStage Terminal / `csai` as the local command bridge.

Security note:

- Apple Notes contained live-looking API keys and credentials. Those values were not copied here. Rotate them and move secrets into proper secret stores.

Next implementation targets:

1. Service review metadata and dashboard filters.
2. Notification preferences for reminder/tone settings. Scheduled service reminders are implemented in Ultimate Playback as of 2026-08-01.
3. Time parsing utility for service times.
4. Desktop worker registry for stem processing.
5. Song cue timeline model.
6. Read-only mixer profile discovery.
7. Admin Idea Vault / Blueprint Vault.
8. Role and branch verification tests.
