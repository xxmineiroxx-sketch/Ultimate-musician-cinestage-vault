# Planning Center / Service Plan — Definition

## Calendar
- Weekly/monthly view of services
- Special services appear 1–2 weeks prior (configurable)
- Filters: campus, team, type

## Service Plan Editor tabs
1) Overview
2) Setlist
3) Roles & Assignments
4) Rehearsal
5) Cues (ProPresenter/Lighting/MIDI)
6) Publish

## Minimal entities
- service(id, org_id, title, type, datetime, status)
- service_items(service_id, order, song_id, planned_key, bpm, notes)
- roles(org_id, name, category)
- assignments(service_id, role_id, member_id)
- publish_events(service_id, version, timestamp)
