# Ultimate Musician - Setlist Approval Workflow

Date: 2026-08-01

Decision: CineStage/Ultimate Musician should treat setlist publishing as an approval workflow, not an automatic action.

Roles:
- Admin: grants access, approves or rejects setlists.
- Worship Leader: grants Lead Singer or Service Planner access, approves or rejects setlists.
- Lead Singer: assigned to lead a specific service, builds that service setlist, assigns vocals and musicians, and submits it for inspection.
- Team Member: receives approved setlists and is counted in monthly assignment history.

Implemented in repo:
- Cloudflare sync Worker now supports pending setlists, approval/rejection, creator grants, and monthly assignment stats.
- Admin dashboard now supports assigning a service Lead Singer and shows each member's assignment count for the current month.
- App UI now separates direct publishing from Submit for Approval, with Lead Singer shown as a planning entry point only for assigned services.
- Assigning a service Lead Singer sends that singer a direct message so they know they can create the setlist and assign the team.
- Submitting a setlist creates an Admin Panel message; approval creates a message for assigned team members.
- Everyone can suggest songs; suggestions stay pending until Admin/Worship Leader approves or rejects them.
- Musicians can edit/add lyrics, chord charts, and instrument-specific parts as proposals; approval applies them to the live service/library song.
- Playback Admin Dashboard now has a Readiness tab backed by `/sync/service-readiness`, showing service score, blockers, assignment confirmation gaps, chart/proposal gaps, stem status, and desktop/cloud processing route.
- Repo documentation added at `docs/setlist-approval-workflow.md`.
- Standalone GitHub sync server `xxmineiroxx-sketch/ultimate-sync-server` now mirrors the same setlist approval endpoints in `server.js`.

Product rule:
- AI and helper roles can prepare plans, but sending a plan to the whole team requires Admin or Worship Leader approval.
- Song library changes and musician chart edits also require Admin or Worship Leader approval unless made directly by an approved leader/admin role.
