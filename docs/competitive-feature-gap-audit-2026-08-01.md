# Competitive Feature Gap Audit - 2026-08-01

## Purpose

This audit compares Ultimate Musician, Ultimate Playback, CineStage Desktop, and the Cloudflare sync worker against the current worship-planning and multitrack market. The goal is to prevent duplicated work: many competitor features already exist in this repo or in the wider scanned ecosystem, but some are buried, split between apps, or not productized into one clear workflow.

## External References Checked

- Asaph: https://help.asaph.io/en/articles/12706078-what-is-asaph
- Asaph iPhone: https://asaph.io/iphone
- Asaph worship leader page: https://asaph.io/solutions/worship-leader
- MultiTracks: https://www.multitracks.com/
- MultiTracks ChartBuilder: https://www.multitracks.com/products/chartbuilder/
- MultiTracks ChartBuilder guide: https://helpcenter.multitracks.com/en/articles/5132233-chartbuilder-user-guide
- MultiTracks Playback App Store: https://apps.apple.com/us/app/playback/id751755884
- Loop Community: https://loopcommunity.com/en-US/
- Loop Community Prime: https://loopcommunity.com/en-US/prime-multitrack-app
- Planning Center Services: https://www.planningcenter.com/services
- WorshipTools Planning: https://www.worshiptools.com/en-us/planning
- WorshipTools: https://www.worshiptools.com/
- OnSong features: https://www.onsongapp.com/features/
- OnSong voice control: https://www.onsongapp.com/docs/2026/features/voice-control/
- SongSelect: https://ccli.com/us/er/songselect
- Planning Center SongSelect integration: https://www.planningcenter.com/integrations/songselect
- WorshipTeam.ai setlists: https://www.worshipteam.ai/setlists
- WorshipTeam.com: https://www.worshipteam.com/more_info.html

## Local Sources Checked

- `apps/ultimate_playback/App.js`
- `apps/ultimate_playback/src/screens_v2/SetlistScreen.js`
- `apps/ultimate_playback/src/screens_v2/AdminDashboardScreen.js`
- `apps/ultimate_playback/src/screens_v2/ContentEditorScreen.js`
- `apps/ultimate_playback/src/screens_v2/PersonalPracticeScreen.js`
- `apps/ultimate_playback/cloudflare/ultimate-playback-sync/worker.js`
- `apps/primary_app/ultimate_musician_full_project_v3/mobile/App.js`
- `apps/primary_app/ultimate_musician_full_project_v3/mobile/screens/PCOIntegrationScreen.js`
- `apps/primary_app/ultimate_musician_full_project_v3/mobile/screens/PlanTeamScreen.js`
- `apps/primary_app/ultimate_musician_full_project_v3/mobile/screens/ProposalsScreen.js`
- `apps/primary_app/ultimate_musician_full_project_v3/mobile/services/planningCenterService.js`
- `apps/primary_app/ultimate_musician_full_project_v3/mobile/docs/REHEARSAL_LIVE_WAVEFORM_PIPELINE_SPEC.md`
- `apps/primary_app/ultimate_musician_full_project_v3/mobile/docs/WAVEPIPELINE_MARKET_REFERENCES.md`
- `apps/primary_app/ultimate_musician_full_project_v3/mobile/docs/ONE_OF_A_KIND_WAVEPIPELINE_STACK.md`
- `docs/apple-notes-idea-inventory-2026-08-01.md`
- `docs/icloud-idea-inventory-2026-08-01.md`
- `docs/cinestage-desktop-stem-worker.md`

## Executive Finding

Ultimate already has much more than a basic worship app. The biggest gap is not raw feature count. The biggest gap is consolidation, UX hierarchy, and product reliability.

Competitors win because their strongest workflows feel finished: build a service, schedule people, prepare charts/tracks, rehearse, and go live. Ultimate has many of those pieces, plus several unique ideas, but they are spread across Ultimate Playback, Ultimate Musician, docs, Cloudflare Worker endpoints, and desktop worker code.

The right next step is to promote the strongest existing pieces into a single "Service Readiness" workflow across apps:

1. Admin/Worship Leader assigns Lead Singer.
2. Lead Singer creates setlist and assigns vocals/musicians.
3. Admin/Worship Leader reviews and approves.
4. Approved service packet is published to Playback.
5. Playback gives each assigned person charts, stems, messages, reminders, and practice status.
6. CineStage Desktop handles heavy stem processing when online; Cloudflare is fallback.

## Feature Matrix

| Category | Competitors | Current Ultimate State | Judgment | Next Move |
| --- | --- | --- | --- | --- |
| Service planning | Planning Center, WorshipTools, WorshipTeam.com | Ultimate Musician has Planning, NewService, ServicePlan, Calendar, Checklist, LiveService | Implemented, split | Make Ultimate Musician the admin command center and keep Playback focused on assigned services |
| Lead singer delegation | Planning apps partially cover roles, not this exact flow | Playback Worker has grants and setlist creator role; AdminDashboard supports setlist submit/approve/reject | Implemented | Polish into a visible "Lead Singer for this service" flow |
| Setlist approval | Planning Center approvals are indirect; Asaph drafts setlists | Playback has `/sync/setlist/submit`, pending setlists, approve/publish, reject with note | Implemented | Add notification copy and review status timeline |
| Team assignments | Planning Center/WorshipTools strong | Playback has assignments, accept/decline, stats; Musician has PlanTeam and PCO status | Implemented, needs dashboard | Add monthly assignment load and fairness view to admin/leader workflow |
| Availability/blockouts | Planning Center/WorshipTools strong | Playback has BlockoutCalendar; Musician PlanTeam reads PCO blockouts | Implemented/partial | Unify local and PCO blockout display |
| Messaging | Asaph, Planning Center, WorshipTools all include team messages | Playback and Worker have admin messages/replies; notes call for tones | Implemented | Thread messages per service and role |
| Song suggestions | Asaph focuses feedback/song health | Playback ContentEditor submits proposals; AdminDashboard reviews; Musician ProposalsScreen approves/rejects | Implemented | Rename as "Suggestions & Fixes" so users understand it |
| Lyrics/chords edits | ChartBuilder, OnSong, SongSelect strong | Playback allows lyrics, chord charts, instrument notes, keyboard rigs proposals/direct apply | Implemented | Create one polished ChartKit instead of separate ad hoc editors |
| Chart rendering | ChartBuilder/OnSong very strong | Playback setlist has transpose/capo/chord parsing; Musician has PartSheet/SongMap | Partial | Add annotations, PDF import/export, Nashville/Number charts, section-aware layout |
| Practice player | RehearsalMix, Prime, Playback dominate | Playback has PersonalPractice and setlist practice concepts; Musician has richer rehearsal/wave pipeline | Partial in Playback, strong prototype in Musician | Build a Playback Rehearsal Workspace from existing services/screens |
| Multitrack live playback | MultiTracks/Loop dominate with mature routing, MIDI, loops | Musician docs and screens include Rehearsal, Performance, StemMixer, waveform, quantized jumps, automation lanes | Prototype/advanced | Stabilize iPad live/rehearsal first before expanding musician-facing controls |
| Desktop stem processing | WorshipTeam.ai mentions stems; competitors usually cloud/catalog based | CineStage desktop-primary stem worker and Cloudflare routing status are implemented | Unique differentiator | Productize desktop online status, job review, publish, cleanup |
| Planning Center integration | Planning Center is the source; many competitors integrate | Musician has PCOIntegrationScreen and planningCenterService for services, people, songs, team scheduling | Implemented in Musician | Decide whether Playback consumes only published service bundles or gets limited PCO visibility |
| SongSelect/CCLI | Planning Center, WorshipTools, SongSelect strong | PCO song import stores CCLI number; no full SongSelect licensing/reporting flow found | Missing/partial | Treat as integration roadmap after PCO stabilizes |
| AI setlist/theology | Asaph and WorshipTeam.ai emphasize AI setlists | Ultimate has CineStage "brain" docs and approval doctrine, but no finished AI setlist composer flow found in Playback | Partial | Build AI draft assistant inside admin/leader review only |
| Voice/Siri-like control | OnSong has voice actions; Siri-like assistant is user vision | Notes define `csai` terminal and approval-gated command layer | Concept/partial | Desktop first: local commands for prepare service, process stems, check confirmations |
| Licensing/catalog marketplace | MultiTracks/Loop/SongSelect have licensed catalogs | User explicitly does not want website stem storage yet | Intentionally not built | Do not build now |

## Already Built And Worth Keeping

- Playback has the correct musician tabs: Profile, Home, Setlist, Assignments, Messages, Practice.
- Playback has stack routes for AdminDashboard, LeaderDashboard, ContentEditor, PersonalPractice, LivePerformance, SetlistRunner, and CineStageBrain.
- Admin/Worship Leader setlist approval is already wired through the Worker and Playback UI.
- Lead Singer/setlist creator grants are represented in the Worker.
- Non-admin content edits already go through proposal approval before becoming live.
- Playback setlists already merge server setlist data with library data and use offline cache fallback.
- Playback has service expiry behavior so old setlists are hidden after the service window.
- Playback has desktop stem route status in the CineStage Brain card/screen.
- Ultimate Musician already contains Planning Center integration for services, people, songs, team members, statuses, and blockouts.
- Ultimate Musician already contains advanced rehearsal/live/waveform/stem concepts that match or exceed competitor feature lists on paper.
- The Cloudflare sync worker already has desktop heartbeat, desktop worker listing, stem job creation, claims, updates, approval, publish, cleanup, and asset upload/download endpoints.
- The iCloud and Apple Notes audits already preserved older product ideas for desktop processing, mixer intelligence, role verification, notification preferences, and asset indexing.

## Built But Buried

These features should not be rebuilt from scratch. They need a clearer surface and shared data contracts.

- PCO integration: strong in Ultimate Musician, not clearly surfaced as a connected ecosystem pipeline into Playback.
- Waveform/live pipeline: strong in Musician docs/screens, not yet reduced into a simple musician practice experience.
- Proposal approval: implemented, but user-facing labels should make it feel like song suggestions, chord fixes, and part edits.
- Monthly assignment tracking: Worker endpoint exists, but it needs a strong Admin/Leader visual view.
- Desktop stem routing: implemented technically, but needs a clear "Desktop online / Cloud fallback" status and job queue UX in CineStage Cloud.
- Role model: grants exist, but the flow should read as "Admin assigns Lead Singer for service" rather than generic permission management.

## Missing Or Weak Compared To Competitors

- Polished chart experience: annotations, PDF import/export, Nashville/Number charts, chord diagrams, display preferences, foot-pedal control.
- Licensed content moat: MultiTracks, Loop, SongSelect, Planning Center, and WorshipTools benefit from official catalogs or integrations.
- Finished rehearsal flow in Playback: competitors make practice feel immediate; Ultimate has the pieces but not yet one obvious screen.
- MIDI and automation productization: Musician has advanced concepts, but needs a stable live-safe release path.
- CCLI reporting: not yet a first-class flow.
- Service readiness score: no single place tells leaders "ready/not ready" across setlist approval, team confirmations, charts, stems, reminders, and cues.
- Mobile-first UX density: some screens use many cards and large visual blocks. Admin tools should become more scannable and operational.

## Unique Advantages Ultimate Can Own

- Desktop-primary stem processing with Cloudflare fallback reduces cloud cost and gives churches local ownership.
- Approval-gated AI fits church leadership better than fully autonomous AI publishing.
- Role-specific practice delivery can send each musician exactly the parts they need.
- CineStage can become a cross-app brain: songs, stems, charts, service context, team readiness, cues, and local assets.
- Local iCloud/desktop asset indexing can turn existing presets, scenes, Kontakt sounds, Ableton sessions, and mixer templates into recommendations.
- Rehearsal-to-live waveform pipeline with safety policies, quantized jumps, diff history, rollback, and automation lanes is a differentiator if stabilized.

## Recommended Build Order

### 1. Service Readiness Dashboard

Build this next because it connects existing features into one workflow.

Admin/Worship Leader should see:

- Pending setlist approvals.
- Missing confirmations.
- Monthly assignment load per person.
- Open song/chord/part proposals.
- Stem job status and desktop/cloud route.
- Missing charts, lyrics, stems, or cue maps.
- Final "Publish to Team" status.

Playback member should see:

- Next service.
- Assigned role(s).
- Practice packet readiness.
- Their charts/lyrics/stems.
- Messages.
- Reminders.
- Accept/decline/blockout actions.

### 2. Lead Singer Assignment Flow

Use the existing grants and setlist submit endpoints, but make it feel intentional:

- Admin assigns Lead Singer on a service.
- Assigned singer receives a notification.
- Lead Singer gets limited service editor access.
- Lead Singer creates setlist and assigns team parts.
- Submit sends the service packet to Admin/Worship Leader review.
- Approval publishes to all assigned team members.

### 3. Playback Rehearsal Workspace

Do not build another rehearsal system. Promote existing pieces:

- Setlist row opens a rehearsal screen.
- Show chart/lyrics and role part side by side.
- Show stem status and download button only after approval.
- Let musicians mute their own part for practice.
- Keep advanced cue/waveform editing in Ultimate Musician/iPad/Desktop.

### 4. ChartKit

Create one shared chart layer:

- Chords and lyrics.
- Transpose.
- Capo.
- Nashville/Numbers.
- Section headers.
- Instrument notes.
- Keyboard rig notes.
- PDF import/export.
- Later: annotations and foot-pedal support.

### 5. Integration Roadmap

- Phase 1: Planning Center services, people, songs, team status.
- Phase 2: SongSelect/CCLI import and reporting.
- Phase 3: ProPresenter/lyrics/lights cue export.
- Phase 4: Apple Watch/widget after notification reliability is stable.
- Phase 5: marketplace/catalog only after licensing and storage strategy are intentional.

## UX/UI Direction

- Playback should be a calm musician cockpit, not an admin dashboard.
- Home should prioritize "next service" and "what I need to do now."
- Admin screens should use compact lists, status chips, filters, and actionable queues.
- Live screens should be stable, landscape-friendly, and avoid layout shifts.
- Avoid burying critical actions behind many cards. Use tabs for queues: Services, Team, Songs, Stems, Messages.
- Use explicit status language: Draft, Submitted, Needs Changes, Approved, Published, Expired.
- Make CineStage Cloud status visible everywhere stem processing is requested.

## Do Not Build Now

- A public MultiTracks-style stem marketplace.
- Website-hosted long-term stem storage.
- Fully autonomous AI publishing.
- Full mixer write automation before read-only discovery and approval flows exist.
- Too many pricing tiers before the core readiness workflow is reliable.

## Next Concrete Implementation Target

Start with a Service Readiness Dashboard in Playback/AdminDashboard and sync Worker data normalization.

This gives the user-visible value of the whole ecosystem without requiring new competitor-scale licensing, catalog, or cloud processing infrastructure. It also turns existing work into a coherent product: setlist approval, team assignment tracking, proposals, stems, desktop route status, and notifications in one place.
