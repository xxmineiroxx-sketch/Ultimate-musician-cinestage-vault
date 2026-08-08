# Assignment Readiness Tracking

Date: August 8, 2026

## Decision

Org Owner, Admin, and Worship Leader dashboards should show who accepted an assignment and who has opened/listened to the service setlist.

## Implementation

- `/sync/assignment/respond` records accepted, declined, or pending responses.
- `/sync/assignments/event` records setlist engagement events from Playback.
- `/sync/assignment/tracking?serviceId=...` returns member-level tracking for a service.
- `/sync/service-readiness` includes `setlistViewed`, `setlistNotViewed`, `setlistListened`, and `setlistNotListened` counts per service.

## App Behavior

- Ultimate Playback records `setlist_viewed` when an accepted team member opens a service setlist.
- Ultimate Playback records `setlist_listened` when the member starts a Practice Session from the setlist.
- Ultimate Playback Admin readiness cards show Viewed and Listened counts.
- Ultimate Musician Service Plan rows show Viewed/Listened badges for each assigned member.
- Ultimate DAW desktop Analytics shows accepted, viewed, listened, and follow-up counts by service.

Worker version: `2.4.9-assignment-tracking`.
