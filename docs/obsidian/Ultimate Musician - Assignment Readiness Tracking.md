# Ultimate Musician - Assignment Readiness Tracking

Date: August 8, 2026

Leadership dashboards now track assignment acceptance and setlist engagement.

- Assignment responses are stored through `/sync/assignment/respond`.
- Playback setlist engagement is stored through `/sync/assignments/event`.
- Service tracking is readable through `/sync/assignment/tracking`.
- Service readiness includes accepted, viewed, and listened counts.

App surfaces:

- Playback Admin Dashboard: service readiness cards show Viewed and Listened.
- Ultimate Musician Service Plan: each team row can show Viewed/Listened badges.
- Ultimate DAW Desktop Analytics: service rows show Accepted, Viewed, and Listened totals.

Worker version: `2.4.9-assignment-tracking`.
