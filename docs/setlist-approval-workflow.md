# Setlist Approval Workflow

This workflow makes CineStage/Ultimate Musician the planning brain while keeping publishing under human approval.

## Roles

- Admin: manages access, reviews setlists, approves or rejects publishing.
- Worship Leader: can grant Lead Singer or Service Planner access, reviews setlists, approves or rejects publishing.
- Lead Singer: assigned to lead a specific service, builds that service setlist, assigns vocals and musicians, and submits it for review.
- Team Member: receives the approved setlist when assigned to the service.

## Flow

```mermaid
flowchart TD
  A["Admin or Worship Leader assigns Lead Singer"] --> B["Lead Singer builds service setlist and assigns vocals/musicians"]
  B --> C["Lead Singer submits setlist for review"]
  C --> D["Admin or Worship Leader inspects setlist"]
  D -->|Reject| E["Lead Singer receives review note and revises"]
  E --> B
  D -->|Approve| F["Setlist is published to the service"]
  F --> G["Assigned team members receive the approved setlist message"]
  G --> H["Assignment history records who served this month"]
  H --> I["Admin sees monthly assignment counts per person"]
```

## Product Rules

- A Lead Singer cannot directly publish to the whole team.
- A Lead Singer can submit only for a service where they are assigned as Lead Singer.
- Assigning a Lead Singer sends that singer a direct message and opens their setlist planning entry point.
- Submitting a completed setlist creates an Admin Panel message for Admin/Worship Leader inspection.
- Approval turns a pending setlist into the service plan that members receive.
- Approval creates a message for only the assigned team members.
- Rejection keeps the setlist out of the published service plan.
- Assignment tracking is recorded only when a plan is approved or directly published by an authorized planner.
- Monthly stats should help leaders rotate people fairly and avoid overusing the same members.
- Any team member can suggest a song; it stays pending until Admin/Worship Leader approves it into the library.
- Musicians can submit lyrics, chord charts, and instrument-specific notes as proposals; Admin/Worship Leader approval applies them live.

## Implemented Sync Surface

- `POST /sync/grant`: grants roles and can set `canCreateSetlists`.
- `POST /sync/setlist/submit`: stores a pending setlist for review.
- `POST /sync/setlist/approve`: publishes the setlist, sends it to assigned members through sync, and records assignment history.
- `POST /sync/setlist/reject`: marks the setlist rejected with a review note.
- `POST /sync/library/song-propose`: lets any member suggest a library song.
- `GET /sync/library/pending-songs`: lists song suggestions awaiting approval.
- `POST /sync/library/song-approve`: approves a song suggestion into the library.
- `POST /sync/library/song-reject`: rejects a song suggestion.
- `POST /sync/proposal`: stores a musician lyrics/chart/instrument-note proposal.
- `POST /sync/proposal/approve`: applies an approved lyrics/chart proposal.
- `POST /sync/proposal/reject`: rejects a lyrics/chart proposal.
- `GET /sync/setlist/creators`: lists people allowed to create setlists.
- `GET /sync/setlist/pending`: lists setlists awaiting approval.
- `GET /sync/assignment-stats?month=YYYY-MM`: returns per-person assignment counts for the month.

## Implemented App Behavior

- Admin and Worship Leader can assign Lead Singer from a service roster.
- Lead Singer sees a Setlist Planning entry point and can edit only services where they are assigned as Lead Singer.
- Service Planner submissions include role metadata so the backend recognizes the permission.
- Admin/Worship Leader approval publishes the plan to Playback.
- Team roster management stays limited to Admin/Worship Leader roles.
