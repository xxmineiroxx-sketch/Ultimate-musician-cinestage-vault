# Ultimate Ecosystem — Complete Guide
### Ultimate Musician (Admin App) + Ultimate Playback (Team App)

---

## Overview

The Ultimate Ecosystem is a two-app worship team management platform:

| App | Role | Platform |
|-----|------|----------|
| **Ultimate Musician** | Admin / Music Director | React Native / Expo SDK 54 |
| **Ultimate Playback** | Team Members | React Native / Expo SDK 54 |
| **Sync Server** | Central hub connecting both apps | Node.js HTTP server |

Cross-app data (services, team assignments, messages, blockouts, proposals, song library) flows through the configured sync API. Local development can use `sync-server.js` on port `8099`; real iOS builds must use a stable HTTPS endpoint.

---

## Part 1 — Sync Server

### Location
```
/Users/studio/Desktop/UltimatePlatform_MONOREPO_MASTER.nosync/sync-server.js
```
Local data is persisted to `sync-data.json` automatically on every change. That file is local runtime state and is ignored by git.

### Starting the Server
```bash
node sync-server.js
```
The server starts on port **8099**. You should see:
```
Sync server running on port 8099
```

### API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/sync/debug` | Full store dump: services, plans (with songs), people |
| POST | `/sync/publish` | Overwrite store with `{ services, people, plans }` |
| GET | `/sync/people` | List all people |
| GET | `/sync/messages/admin` | All messages (admin view) |
| POST | `/sync/message` | Send a new message `{ from_email, from_name, subject, message }` |
| POST | `/sync/message/reply` | Reply to a message `{ messageId, from, message }` |
| GET | `/sync/grants` | List all role grants |
| POST | `/sync/grant` | Grant a role `{ email, name, role: 'md'\|'admin' }` |
| DELETE | `/sync/grant?email=` | Remove a grant |
| GET | `/sync/role?email=` | Get role for an email `{ role: 'md'\|'admin'\|null }` |
| POST | `/sync/blockout` | Add a blockout `{ email, name, date, reason }` |
| DELETE | `/sync/blockout?id=&email=` | Remove a blockout |
| GET | `/sync/blockouts?date=&email=` | List blockouts, optional filters |
| POST | `/sync/assignment/respond` | Submit response `{ assignmentId, email, status }` |
| GET | `/sync/assignment/responses?serviceId=` | Get responses for a service |
| POST | `/sync/proposal` | Submit content proposal `{ songId, serviceId, type, instrument, content, from_email, from_name, songTitle, songArtist }` |
| GET | `/sync/proposals?status=` | List proposals, optional status filter |
| POST | `/sync/proposal/approve?id=` | Approve a proposal (publishes content live) |
| POST | `/sync/proposal/reject?id=` | Reject a proposal `{ reason }` |
| GET | `/sync/song-library?songId=&since=` | Global song library (approved content) |

---

## Part 2 — Ultimate Musician (Admin App)

### Location
```
/Users/studio/Desktop/UltimatePlatform_MONOREPO_MASTER.nosync/apps/primary_app/ultimate_musician_full_project_v3/mobile
```

### Starting the App
```bash
cd /Users/studio/Desktop/UltimatePlatform_MONOREPO_MASTER.nosync/apps/primary_app/ultimate_musician_full_project_v3/mobile
EXPO_NO_TELEMETRY=1 npx expo start --ios --offline
```
Run on the **iPhone 17 Pro Simulator** (UUID: `95F839AC-F11D-4E01-91FF-DE60F903FAB5`).

---

### Screen-by-Screen Guide

#### 1. Landing Screen
The first screen on launch. Options:
- **Sign In** — Enter email + password
- **Register** — Create a new admin account
- **Continue as Guest** — Limited access

After login, you land on the **Home Screen**.

---

#### 2. Home Screen
The main hub. Contains:
- **Three mode tiles** — CineStage, Organizer, Live Mode
- **Quick Pills row** — Fast navigation to key screens

**Quick Pills available:**
| Pill | Destination |
|------|-------------|
| 🗓 Calendar | CalendarScreen |
| 👥 People | PeopleRolesScreen |
| 📋 Checklist | ChecklistScreen |
| 🎵 Library | LibraryScreen |
| ⚙️ Settings | SettingsScreen |
| 🔐 Permissions | PermissionsScreen *(new)* |
| 📝 Proposals | ProposalsScreen *(new)* |

---

#### 3. Permissions Screen *(new)*
**Path:** Home → 🔐 Permissions pill

Purpose: Grant elevated roles to team members so they get admin-level access in the Playback app.

**How to use:**
1. Tap the **🔐 Permissions** pill on Home
2. The screen loads all people from the server
3. Each person card shows their name, email, and current role badge:
   - **No badge** = regular team member
   - **MD badge** (purple) = Music Director
   - **Admin badge** (yellow) = Full Admin
4. **Tap any person** to cycle their role: `None → MD → Admin → None`
5. Changes save immediately to the server

**Role explanations:**
- **Music Director (MD):** Can see the full team inbox, create/edit services, manage team assignments, and edit songs from within Playback
- **Admin:** Full admin privileges — same as MD plus all content management

**Effect in Playback app:**
- When a person with MD/Admin role logs in to Playback, they see the **"MD Mode Active"** banner on their Home screen and can access the Admin Dashboard

---

#### 4. Proposals Screen *(new)*
**Path:** Home → 📝 Proposals pill

Purpose: Review content (lyrics and chord charts) submitted by team members from the Playback app.

**How to use:**
1. Tap **📝 Proposals** pill on Home
2. See all pending proposals listed as cards:
   - Proposer name and email
   - Song title
   - Content type badge: **Lyrics**, **Chord Chart**, or instrument badge (e.g., **🎹 Keys**)
   - Time submitted
3. **Tap a card** to expand it and see:
   - Full proposed content
   - If instrument-specific: a notice explaining only that instrument's part will be updated
4. **Approve** (green button): Content goes live immediately
   - Updates the song in the service plan
   - Updates the global song library
   - Syncs back to the Musician app's local library
5. **Reject** (red button): Optionally enter a reason; proposal is marked rejected

**Instrument-specific approvals:**
When a team member submits a Keys chart, approving it only updates the Keys part of that song. Other instruments (Guitar, Bass, Drums) keep their own separate charts. All parts live together under the same song.

---

#### 5. People & Roles Screen
**Path:** Home → 👥 People pill

Manage all team members:
- View all people with their roles
- Add new people
- Edit contact info, roles, and photos
- Delete team members

Each person has:
- **Name, Email, Phone**
- **Roles array** — e.g., `['Leader', 'Keys', 'Vocal Lead']`
- **Photo** (optional)

---

#### 6. Calendar / New Service Screen
**Path:** Home → 🗓 Calendar pill

Create and manage services:
- View upcoming services on the calendar
- Tap a date to create a new service
- Set service name, date, time, and type (Standard, Rehearsal, Easter, Christmas, etc.)
- Each service type has default settings (lead time, template)

---

#### 7. Service Plan Screen
Manage the full plan for a specific service:
- **Songs** — Add/remove/reorder songs from the library
- **Team** — Assign people by role to this service
- **Notes** — Service-wide notes
- **Lock service** — Prevent further edits once finalized

---

#### 8. Song Library Screen
**Path:** Home → 🎵 Library pill

All songs stored locally + synced from server:
- Browse, search, and filter songs
- Each song has: title, artist, key, BPM, time signature, tags
- **Instrument sheets** — Per-instrument content (Vocals, Keys, Guitar, Bass, Drums, etc.)
- Songs updated via approved proposals automatically merge new content here

---

### Data Persistence (Musician)
All data is stored in **AsyncStorage** under these keys:
| Key | Contents |
|-----|----------|
| `um.songs.v1` | Song library |
| `um.services.v1` | Services list |
| `um.people.v1` | People/team |
| `um.settings.v1` | App settings |
| `um.roles.v1` | Role options |
| `um.service_plan.v1` | Service plans |

---

## Part 3 — Ultimate Playback (Team App)

### Location
```
/Users/studio/Desktop/UltimatePlatform_MONOREPO_MASTER.nosync/apps/ultimate_playback
```

### Starting the App
```bash
cd /Users/studio/Desktop/UltimatePlatform_MONOREPO_MASTER.nosync/apps/ultimate_playback
npx expo start --ios
```

---

### Screen-by-Screen Guide

#### 1. Login / Profile Setup
On first launch, enter your:
- **Name** and **Last Name**
- **Email** — This must match the email in the Musician app's People list
- **Instrument** — Your primary role (Keys, Guitar, Drums, etc.)

Your email is how the system identifies you across both apps. Make sure it matches exactly (case-insensitive).

---

#### 2. Home Screen
The main dashboard for team members. Shows:
- **Next service** — Date, name, and days until service
- **Your assignments** — Services you've been assigned to
- **Recent messages** — Latest messages from admin
- **Quick actions** — Setlist, Messages, Assignments, Blockouts
- **Sync status** — Last sync time
- **Pull down** to refresh and sync all data from the server

**If you have MD/Admin role:**
A prominent **"🎛 MD Mode Active"** purple banner appears below the sync status with an **"Open Admin Panel →"** button.

**Pull-to-Refresh:**
Pull the screen down to force a full sync from the server. The spinner shows while data is loading.

---

#### 3. Assignments Screen
**Path:** Home → Assignments card

View all services you've been assigned to:
- See each service's date, name, and your assigned role
- **Accept** (green ✓) or **Decline** (red ✗) each assignment
- Your response is immediately pushed to the server so the admin sees it in real-time
- Status shows: **Accepted**, **Declined**, or **Pending**

**Admin visibility:** In the Musician app's Admin Dashboard, each team member's response shows as a badge on their assignment row.

---

#### 4. Blockout Calendar Screen
**Path:** Home → Blockouts (or from profile)

Mark dates when you're unavailable:
1. Tap any date on the calendar
2. Add a reason (optional, e.g., "Vacation", "Work travel")
3. Tap **Add Blockout**

Your blockout dates are:
- Saved locally on your device
- **Pushed to the sync server immediately**
- Visible to the admin when assigning team for services

**When an admin tries to assign you to a blocked date:**
- A warning banner appears showing your name is blocked
- The blocked person is shown with a red tint in the assignment list
- Admin can still override if needed

To remove a blockout: tap the date on the calendar → tap **Remove**.

---

#### 5. Messages Screen
**Path:** Home → Messages card

View messages from the admin:
- See all messages addressed to you or the full team
- **If you have MD/Admin role:** See ALL team messages (admin inbox view) + can reply to any message

**Regular member view:**
- Messages from admin only
- Read receipts tracked automatically

**MD/Admin view:**
- Full team inbox — all messages from all team members
- Reply button on every message thread
- "Admin Inbox" badge shown in header

---

#### 6. Setlist Screen
**Path:** Home → Setlist card → tap a service

View the song lineup for a service:
- Songs in order with key, BPM, and time signature
- Tap any song to expand details
- See your instrument-specific content (if available):
  - **Vocalists** see lyrics
  - **Keys/Guitar/Bass** see their chord chart
  - **Drums** see drum notes
- **✏️ Edit button** next to content → opens Content Editor

---

#### 7. Setlist Runner Screen
Full-screen performance mode:
- Navigate songs with large prev/next buttons
- Auto-scroll lyrics
- Chord chart with monospace display
- **✏️ Edit button** → opens Content Editor to submit changes

---

#### 8. Content Editor Screen *(new)*
**Path:** Setlist → tap ✏️ on any song content

Full-screen editor to add or update lyrics and chord charts:

**For Lyrics (type: lyrics):**
- Instrument automatically set to "Vocals"
- Multiline text editor with standard capitalization and spellcheck
- Enter lyrics line by line, blank lines separate sections (Verse, Chorus, Bridge)

**For Chord Charts (type: chord_chart):**
1. First, select your instrument from the chip row:
   - 🎹 Keys | 🎸 Acoustic Guitar | ⚡ Electric Guitar | 🎸 Bass | 🎛 Synth/Pad | 🥁 Drums
2. Each instrument's chart is saved **separately** — submitting a Keys chart doesn't affect the Guitar chart
3. A hint box confirms: *"This will only update the [instrument] part. Other instruments keep their own separate chart."*
4. Enter your chart in the monospace editor

**Submitting:**
- Regular members: tap **Submit** → content sent to admin for approval
- MD/Admin: tap **Apply** → content published immediately, no approval needed

**After submitting:**
You see a success screen: "📬 Submitted for Review — Your [instrument] part for [Song] has been sent to the admin. It will go live once approved."

---

#### 9. Admin Dashboard Screen *(new — MD/Admin only)*
**Path:** Home → "Open Admin Panel →" banner

Full admin control panel inside the Playback app for Music Directors:

**Four sections:**

**📬 Team Inbox**
- See all messages from all team members
- Reply to any message thread
- Messages marked as read automatically

**🗓 Services**
- List all upcoming services
- **+ New Service** button → form to create a service:
  - Date picker
  - Service name
  - Service type (Standard, Rehearsal, Special, etc.)
  - Time
- Changes published immediately to server (all apps see update)

**👥 Team**
- View all people and their roles
- Select a service to see its current team assignment
- **Assign member** button per role — opens picker:
  - People with blockout dates shown in red with ⚠️ warning
  - Blocked members have a "BLOCKED" label
  - Tap any person to assign them to that service role
- Assignment responses shown as badges:
  - **✓ Accepted** (green)
  - **✗ Declined** (red)
  - **? Pending** (grey)

**🎵 Songs**
- View songs in the current service plan
- Add songs to the setlist quickly

---

### Data Flow: How Playback Writes to Musician

When an MD/Admin creates a service or assigns team from the Admin Dashboard:
1. App fetches current full state from `GET /sync/debug`
2. Applies the change locally (adds service, adds team member, etc.)
3. Posts updated state to `POST /sync/publish`
4. Server overwrites and persists
5. Musician app sees the change on next sync/refresh

This is the same pattern used by Musician's admin — both apps are peers with equal write access when the user has the right role.

---

## Part 4 — End-to-End Workflows

### Workflow 1: Assigning a Team Member

1. **Musician (Admin):** Open Service Plan → Team tab → assign person to role → Publish
2. **Playback (Team member):** Home → Assignments → Accept or Decline
3. **Musician (Admin):** AdminDashboard → 👥 Team → see ✓/✗ badge next to their name

### Workflow 2: Submitting a Chord Chart

1. **Playback (Keys player):** Setlist → tap song → tap ✏️ → select "🎹 Keys" → enter chart → Submit
2. **Musician (Admin):** Home → 📝 Proposals → see new card "🎹 Keys — Song Title" → expand → Approve
3. **Playback (All users):** Song's Keys part is now live in the setlist
4. **Musician Library:** Song automatically updated with new Keys notes (other instruments unchanged)

### Workflow 3: Blocking Out Availability

1. **Playback (Team member):** Blockouts screen → tap date → add reason → Add Blockout
2. **Server:** Blockout stored and indexed by date
3. **Musician/AdminDashboard:** When assigning team for that date → blocked member shown with ⚠️ warning in red

### Workflow 4: Granting MD Role

1. **Musician (Admin):** Home → 🔐 Permissions → tap team member → set role to "MD"
2. **Server:** `store.grants[email] = { role: 'md', ... }` persisted
3. **Playback (MD user):** On next Home load → role checked → "MD Mode Active" banner appears
4. **Playback (MD user):** Tap "Open Admin Panel" → full admin access inside Playback

### Workflow 5: Team Member Sending a Message

1. **Playback:** Messages screen → compose message → Send
2. **Musician (Admin):** Messages inbox shows new message with unread badge
3. **Musician (Admin):** Reply → team member sees reply in their Messages thread
4. **Playback (MD user):** Sees ALL messages in admin inbox mode

---

## Part 5 — Architecture Summary

```
┌─────────────────────────────┐
│   Ultimate Musician (Admin) │
│   apps/primary_app/.../mobile │
│                             │
│  PermissionsScreen   ──────────► POST /sync/grant
│  ProposalsScreen     ──────────► GET  /sync/proposals
│                      ◄──────────     POST /sync/proposal/approve
│  HomeScreen (sync)   ──────────► GET  /sync/debug
│  ServicePlan         ──────────► POST /sync/publish
└─────────────────────────────┘
              │
              │  configured HTTPS sync API
              ▼
┌─────────────────────────────┐
│       Sync Server           │
│   sync-server.js or Worker   │
│   sync-data.json (storage)  │
│                             │
│  store.services []          │
│  store.plans {}             │
│  store.people []            │
│  store.messages []          │
│  store.grants {}            │
│  store.blockouts []         │
│  store.proposals []         │
│  store.assignmentResponses{}│
│  store.songLibrary {}       │
└─────────────────────────────┘
              │
              │  configured HTTPS sync API
              ▼
┌─────────────────────────────┐
│  Ultimate Playback (Team)   │
│  apps/ultimate_playback       │
│                             │
│  HomeScreen (pull refresh) ─────► GET /sync/role?email
│  AssignmentsScreen ─────────────► POST /sync/assignment/respond
│  BlockoutCalendar  ─────────────► POST /sync/blockout
│  MessagesScreen    ─────────────► GET  /sync/messages/admin (MD)
│  ContentEditor     ─────────────► POST /sync/proposal
│  AdminDashboard    ─────────────► GET+POST /sync/debug+publish
└─────────────────────────────┘
```

---

## Part 6 — Common Issues & Tips

### Server not reachable
- For local development, make sure `sync-server.js` is running from the monorepo root: `node sync-server.js`
- For real iOS/TestFlight, do not use localhost, LAN IPs, or temporary tunnels. Use a stable HTTPS sync URL.
- Ultimate Playback currently points to `https://ultimate-playback-sync.studio-cinestage.workers.dev` for auth/status recovery.

### Changes not showing up
- Pull down to refresh in the Playback app HomeScreen
- Pull down to refresh in Musician's relevant screen (Services, People, etc.)
- The server persists everything to `sync-data.json` — data survives server restarts

### Blockout not blocking assignment
- The team member must add their blockout in the **Playback app** (not just locally on device before the fix) — it now pushes to server automatically
- Admin dashboard loads all blockouts at startup, so the warning appears immediately when selecting a person

### Proposal not updating the library
- Proposals only update the library when **Approved** in the Proposals screen — rejected proposals have no effect
- After approval, the Musician app merges the new content into the local song library (AsyncStorage) automatically
- Instrument-specific parts are additive — each instrument is stored independently

### MD/Admin banner not showing in Playback
- Make sure the email in Playback profile matches exactly the email in the Permissions screen grant
- The role is checked on every Home screen load — try pulling down to refresh

---

## Quick Reference: Key File Paths

| File | Purpose |
|------|---------|
| `sync-server.js` | Local sync server |
| `sync-data.json` | Local persisted server data, ignored |
| `apps/primary_app/ultimate_musician_full_project_v3/mobile/screens/PermissionsScreen.js` | Role grant management |
| `apps/primary_app/ultimate_musician_full_project_v3/mobile/screens/ProposalsScreen.js` | Approve/reject content |
| `apps/primary_app/ultimate_musician_full_project_v3/mobile/screens/HomeScreen.js` | Quick pills + navigation hub |
| `apps/primary_app/ultimate_musician_full_project_v3/mobile/App.js` | Admin navigation stack |
| `apps/ultimate_playback/src/screens_v2/HomeScreen.js` | Dashboard + MD banner |
| `apps/ultimate_playback/src/screens_v2/AdminDashboardScreen.js` | MD/Admin control panel |
| `apps/ultimate_playback/src/screens_v2/AssignmentsScreen.js` | Accept/decline assignments |
| `apps/ultimate_playback/src/screens_v2/BlockoutCalendarScreen.js` | Availability management |
| `apps/ultimate_playback/src/screens_v2/MessagesScreen.js` | Team communications |
| `apps/ultimate_playback/src/screens_v2/SetlistScreen.js` | Song list view |
| `apps/ultimate_playback/src/screens_v2/SetlistRunnerScreen.js` | Performance mode |
| `apps/ultimate_playback/src/screens_v2/ContentEditorScreen.js` | Submit lyrics/chord charts |
| `apps/ultimate_playback/App.js` | Playback navigation stack |

---

*Built for Jefferson Nascimento and the worship team.*
*Cross-app features require a reachable configured sync API. Local development can run `sync-server.js`; real device builds must use stable HTTPS.*
