# Ultimate Musician - Competitive Feature Gap Audit 2026-08-01

Source repo doc: `docs/competitive-feature-gap-audit-2026-08-01.md`

## Core Finding

Ultimate already has many features found in Asaph, MultiTracks, Loop Community, Planning Center, WorshipTools, OnSong, SongSelect, WorshipTeam.ai, and WorshipTeam.com. The main gap is not idea count. The main gap is consolidation: existing features need one clear service-readiness workflow across Ultimate Musician, Ultimate Playback, CineStage Desktop, and Cloudflare sync.

## What Is Already Built

- Lead Singer/setlist creator grants.
- Setlist submit, pending review, approve/publish, and reject workflow.
- Song/chord/lyrics/instrument part proposals with approval.
- Assignment accept/decline and assignment stats endpoint.
- Playback tabs for Home, Setlist, Assignments, Messages, Practice.
- CineStage Brain route status for desktop stem processing versus fallback.
- Desktop-primary stem job worker design with Cloudflare coordination.
- Planning Center import in Ultimate Musician for services, people, songs, team scheduling, status, and blockouts.
- Waveform rehearsal/live specs and prototype surfaces in Ultimate Musician.

## Biggest Product Gaps

- One Service Readiness Dashboard.
- Polished Playback rehearsal workspace.
- Unified ChartKit with transpose, capo, Nashville/Numbers, annotations, PDF, and instrument notes.
- CCLI/SongSelect reporting/import workflow.
- Clear "Desktop online / Cloud fallback" stem processing UX.
- Service-level monthly assignment load and fairness view.
- UX cleanup so admin screens are scannable and Playback stays musician-focused.

## Recommended Next Build

Build the Service Readiness Dashboard first.

Admin/Worship Leader should see pending setlist approvals, missing confirmations, monthly assignment load, open content proposals, stem job route/status, missing charts/lyrics/stems/cues, and publish status.

Playback members should see next service, assigned role, practice packet readiness, charts, lyrics, stems, messages, reminders, and accept/decline/blockout actions.

## Product Rule

Do not rebuild features that already exist. Promote, connect, and polish them.
