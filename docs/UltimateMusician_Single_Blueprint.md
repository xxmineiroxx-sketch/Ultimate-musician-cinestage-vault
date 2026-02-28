# Ultimate Musician + Ultimate Playback — Single Blueprint (Master)

## 1) Apps
### Ultimate Musician (Organizer / Desktop + iPad Host)
- Library: songs, arrangements, media
- Planning Center: calendar, service plan editor, roles/assignments, publish
- Rehearsal Studio: rehearsal workflow, notes, exports
- Live Performance (optional)
- Settings: audio, lights, cues, language (i18n-ready)

### Ultimate Playback (Worship Team / Crew)
- My Services (assigned)
- Rehearse (service → song → my role chart)
- Offline download
- Readiness checklist (optional telemetry)

## 2) Planning Center (Service Plan)
A calendar + service planning workspace.
Service contains:
- date/time/type, status (draft/published), version
- setlist items (order, song, planned key, bpm, notes)
- roles + assignments (role → member)
- cues (ProPresenter/lighting/MIDI) placeholders
- publish history (versions)

## 3) Publishing pipeline (Organizer → Playback)
- Publish increments service version
- Playback sync downloads “Service Pack”
- Playback shows only assigned services
- Offline cache: JSON + assets

## 4) Chart engine (heart)
Deterministic pipeline:
1) master arrangement
2) transpose to planned key
3) apply musician override layer
4) apply instrument rules:
   - acoustic: auto capo + shapes
   - electric: toggle shapes on/off
   - bass: transposed roots; optional slash follow
   - keys: planned chords; optional voicing hints
5) render chart

Personal “My Version” overrides (per musician, per instrument):
- replace chord line
- simplify chords
- add notes/tags
- rhythm patterns

## 5) Ultimate Playback rehearsal UX
Service → Setlist → Song → Role picker → Tabs:
Chart / Notes / Media / Checklist
Download for offline

## 6) Next implementation priorities
1) Planning Center + Service plan editor
2) Roles + assignments + publish
3) Playback service pack + offline
4) Shared chart engine integration
5) Settings sections + schema-ready config objects

See `/docs` and `/starter`.
