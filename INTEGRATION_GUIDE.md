# Ultimate Musician ↔ Ultimate Playback Integration Guide

## Overview
This guide explains how Ultimate Musician (admin/manager app) and Ultimate Playback (team member app) share data and communicate.

---

## Architecture

### Two-App Ecosystem

**Ultimate Musician** (Admin/Manager)
- Manages team members
- Creates services & assignments
- Sends messages to team
- Plans setlists
- Coordinates schedules

**Ultimate Playback** (Team Member)
- Receives assignments
- Views setlists & role-specific content
- Manages blockout dates
- Receives messages
- Updates readiness status

### Data Flow

```
Ultimate Musician (Admin)
        ↓
   AsyncStorage (Shared Keys)
        ↓
Ultimate Playback (Team Member)
```

---

## Shared AsyncStorage Keys

Both apps read/write to these shared storage keys:

### Team Members
**Key:** `@shared_team_members`
**Format:**
```javascript
[
  {
    id: "person_xxxxx",
    name: "John",
    lastName: "Doe",
    email: "john@example.com",
    phone: "555-1234",
    dateOfBirth: "1990-01-15",
    photo_url: "https://...",
    roles: ["Keyboard", "Vocals"],
    roleAssignments: "Keyboard, Vocals, Bass",
    blockout_dates: [
      {
        id: "blockout_xxxxx",
        date: "2026-03-15",
        reason: "Vacation",
        created_at: "2026-02-19T..."
      }
    ],
    createdAt: "2026-02-19T...",
    updatedAt: "2026-02-19T..."
  }
]
```

### Assignments
**Key:** `@shared_assignments`
**Format:**
```javascript
[
  {
    id: "assignment_xxxxx",
    service_id: "svc_xxxxx",
    service_name: "Sunday Service",
    service_date: "2026-03-15",
    person_id: "person_xxxxx",
    person_name: "John Doe",
    role: "keyboard",
    status: "pending" | "accepted" | "declined",
    setlist: [
      {
        id: "song_xxxxx",
        title: "Amazing Grace",
        role_content: {
          keyboard: { notes: "Play in G major", chords: "..." },
          vocals: { notes: "Lead on verse 2", lyrics: "..." }
        }
      }
    ],
    readiness: {
      ready_for_rehearsal: false,
      notes_reviewed: false,
      parts_practiced: false
    },
    created_at: "2026-02-19T...",
    updated_at: "2026-02-19T...",
    responded_at: "2026-02-19T..." | null
  }
]
```

### Messages
**Key:** `@shared_messages`
**Format:**
```javascript
[
  {
    id: "msg_xxxxx",
    from: "Manager" | "Team" | "System" | "You",
    sender_id: "person_xxxxx" | "system",
    sender_name: "Jane Smith",
    to: "person_xxxxx" | "team" | "all",
    subject: "Rehearsal this Thursday",
    message: "Don't forget rehearsal at 7pm...",
    content: "Don't forget rehearsal at 7pm...",
    timestamp: "2026-02-19T...",
    read: false,
    type: "admin" | "team" | "system"
  }
]
```

### Services/Events
**Key:** `@shared_services`
**Format:**
```javascript
[
  {
    id: "svc_xxxxx",
    date: "2026-03-15",
    title: "Sunday Service",
    service_name: "Sunday Service",
    setlist: ["song_xxxxx", "song_xxxxx"],
    assignments: [
      { person_id: "person_xxxxx", role: "keyboard" },
      { person_id: "person_yyyyy", role: "vocals" }
    ],
    status: "draft" | "confirmed",
    createdAt: "2026-02-19T...",
    updatedAt: "2026-02-19T..."
  }
]
```

### Songs Library
**Key:** `@shared_songs`
**Format:**
```javascript
[
  {
    id: "song_xxxxx",
    title: "Amazing Grace",
    artist: "Traditional",
    originalKey: "G",
    bpm: 80,
    role_content: {
      keyboard: {
        notes: "Play in G major",
        chords: "G-C-D-G",
        sheet_url: "https://..."
      },
      vocals: {
        notes: "Lead on verse 2",
        lyrics: "Amazing grace...",
        vocal_range: "G3-D5"
      },
      bass: {
        notes: "Root notes, follow kick",
        chart_url: "https://..."
      },
      foh_engineer: {
        notes: "Boost vocals on chorus",
        mix_notes: "Compression 4:1"
      }
    },
    createdAt: "2026-02-19T...",
    updatedAt: "2026-02-19T..."
  }
]
```

---

## Data Sync Functions

### Shared Storage Helper

Create `/shared/sharedStorage.js` in both apps:

```javascript
import AsyncStorage from '@react-native-async-storage/async-storage';

// Team Members
export const getSharedTeamMembers = async () => {
  try {
    const data = await AsyncStorage.getItem('@shared_team_members');
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error loading shared team members:', error);
    return [];
  }
};

export const saveSharedTeamMembers = async (members) => {
  try {
    await AsyncStorage.setItem('@shared_team_members', JSON.stringify(members));
  } catch (error) {
    console.error('Error saving shared team members:', error);
  }
};

// Assignments
export const getSharedAssignments = async () => {
  try {
    const data = await AsyncStorage.getItem('@shared_assignments');
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error loading shared assignments:', error);
    return [];
  }
};

export const saveSharedAssignments = async (assignments) => {
  try {
    await AsyncStorage.setItem('@shared_assignments', JSON.stringify(assignments));
  } catch (error) {
    console.error('Error saving shared assignments:', error);
  }
};

// Messages
export const getSharedMessages = async () => {
  try {
    const data = await AsyncStorage.getItem('@shared_messages');
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error loading shared messages:', error);
    return [];
  }
};

export const saveSharedMessages = async (messages) => {
  try {
    await AsyncStorage.setItem('@shared_messages', JSON.stringify(messages));
  } catch (error) {
    console.error('Error saving shared messages:', error);
  }
};

// Services
export const getSharedServices = async () => {
  try {
    const data = await AsyncStorage.getItem('@shared_services');
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error loading shared services:', error);
    return [];
  }
};

export const saveSharedServices = async (services) => {
  try {
    await AsyncStorage.setItem('@shared_services', JSON.stringify(services));
  } catch (error) {
    console.error('Error saving shared services:', error);
  }
};

// Songs
export const getSharedSongs = async () => {
  try {
    const data = await AsyncStorage.getItem('@shared_songs');
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error loading shared songs:', error);
    return [];
  }
};

export const saveSharedSongs = async (songs) => {
  try {
    await AsyncStorage.setItem('@shared_songs', JSON.stringify(songs));
  } catch (error) {
    console.error('Error saving shared songs:', error);
  }
};
```

---

## Integration Workflows

### 1. Team Member Registration & Profile Setup

**Ultimate Musician (Admin):**
1. Admin creates team member in `PeopleRolesScreen`
2. Saves to `@shared_team_members`
3. Optionally sends invitation message to `@shared_messages`

**Ultimate Playback (Team Member):**
1. User logs in with email (matches `@shared_team_members`)
2. Loads profile from shared storage
3. Can update personal info (name, photo, date of birth)
4. Can update role assignments (free text)
5. Saves updates back to `@shared_team_members`

### 2. Service Planning & Assignments

**Ultimate Musician (Admin):**
1. Admin creates service in `PlanningScreen`
2. Assigns team members to roles
3. Creates assignments for each member
4. Saves to `@shared_assignments` and `@shared_services`
5. Sends notification message to each assignee

**Ultimate Playback (Team Member):**
1. Receives assignment notification
2. Views assignment in `AssignmentsScreen`
3. Can accept/decline assignment
4. Updates assignment status in `@shared_assignments`
5. If accepted, can view setlist and role-specific content

### 3. Message Communication

**Ultimate Musician (Admin → Team):**
1. Admin composes message in `MessageCenterScreen`
2. Selects recipients (individual, team, all)
3. Saves message to `@shared_messages`
4. Message includes `from: "Manager"`, `type: "admin"`

**Ultimate Playback (Team Member → Manager):**
1. Team member composes message
2. Selects recipient (Manager or Team)
3. Saves to `@shared_messages`
4. Message includes `from: "You"`, `sender_id: person_id`

**Both Apps:**
- Poll `@shared_messages` on screen focus
- Filter messages by recipient
- Mark messages as read
- Display unread count badge

### 4. Blockout Calendar Management

**Ultimate Playback (Team Member):**
1. Team member selects dates in calendar
2. Adds reason (optional)
3. Saves blockout dates to their profile in `@shared_team_members`

**Ultimate Musician (Admin):**
1. Reads team member profiles from `@shared_team_members`
2. Views blockout dates when assigning services
3. Warns if assigning on blocked date
4. Can override if necessary

### 5. Setlist & Role-Specific Content

**Ultimate Musician (Admin):**
1. Creates/edits songs in library
2. Adds role-specific content (notes, chords, lyrics, etc.)
3. Saves to `@shared_songs`
4. Assigns songs to service setlist

**Ultimate Playback (Team Member):**
1. Views accepted assignments
2. Loads setlist from `@shared_assignments`
3. Displays only role-specific content
4. Can update readiness status

---

## Role Mapping

### Standard Roles

Both apps use these role identifiers:

```javascript
const ROLE_LABELS = {
  keyboard: 'Keyboard',
  bass: 'Bass',
  drums: 'Drums',
  electric_guitar: 'Electric Guitar',
  acoustic_guitar: 'Acoustic Guitar',
  vocals: 'Vocals',
  bgv: 'Background Vocals',
  sound: 'Sound/FOH',
  foh_engineer: 'FOH Engineer',
  media: 'Media/Visuals',
  lights: 'Lighting',
  leader: 'Leader',
  music_director: 'Music Director',
  worship_leader: 'Worship Leader'
};
```

### Role-Specific Content Types

```javascript
{
  keyboard: { notes, chords, sheet_url },
  bass: { notes, chart_url },
  drums: { notes, chart_url },
  electric_guitar: { notes, chords, tab_url },
  acoustic_guitar: { notes, chords, tab_url },
  vocals: { notes, lyrics, vocal_range },
  bgv: { notes, lyrics, harmony_parts },
  sound: { notes, mix_notes },
  foh_engineer: { notes, mix_notes, eq_settings },
  media: { notes, slide_deck_url, cues },
  lights: { notes, lighting_cues }
}
```

---

## Testing Integration

### Test Scenario 1: Team Member Registration
1. Open Ultimate Musician
2. Add team member: "John Doe", email: "john@test.com", roles: "Keyboard, Vocals"
3. Open Ultimate Playback
4. Login with "john@test.com"
5. Verify profile loaded with correct name and roles

### Test Scenario 2: Assignment Workflow
1. Open Ultimate Musician
2. Create service for Sunday, March 15
3. Assign John Doe to Keyboard role
4. Open Ultimate Playback (logged in as John)
5. Verify assignment appears in Assignments tab
6. Accept assignment
7. Verify setlist appears in Setlist tab
8. Open Ultimate Musician
9. Verify assignment status changed to "accepted"

### Test Scenario 3: Messaging
1. Open Ultimate Musician
2. Send message to John: "Rehearsal Thursday at 7pm"
3. Open Ultimate Playback (logged in as John)
4. Verify message appears in Messages tab
5. Mark as read
6. Reply to Manager: "I'll be there"
7. Open Ultimate Musician
8. Verify reply appears in Messages

### Test Scenario 4: Blockout Calendar
1. Open Ultimate Playback (logged in as John)
2. Block out March 20-22 with reason "Vacation"
3. Open Ultimate Musician
4. Try to assign John to service on March 21
5. Verify warning shows about blocked date

---

## Future Enhancements

### Real-Time Sync
- Replace AsyncStorage polling with WebSocket connection
- Push notifications for new messages/assignments
- Real-time assignment status updates

### Backend Integration
- Move from local AsyncStorage to cloud database
- RESTful API for data CRUD operations
- Authentication with JWT tokens
- Multi-device sync

### Advanced Features
- File attachments in messages
- Group chat channels
- Assignment swap requests
- Availability polling
- Conflict resolution
- Rehearsal notes/feedback
- Performance recordings

---

## Storage Keys Summary

| Feature | Storage Key | Owner | Shared |
|---------|------------|-------|---------|
| Team Members | `@shared_team_members` | Both | ✅ |
| Assignments | `@shared_assignments` | Both | ✅ |
| Messages | `@shared_messages` | Both | ✅ |
| Services | `@shared_services` | Ultimate Musician | ✅ |
| Songs | `@shared_songs` | Ultimate Musician | ✅ |
| User Session | `user_session` | Ultimate Playback | ❌ |
| User Profile | `@up_user_profile` | Ultimate Playback | ❌ |
| UM Settings | `um.settings.v1` | Ultimate Musician | ❌ |

---

## Powered by CineStage

Both Ultimate Musician and Ultimate Playback are part of the CineStage Ultimate Music Ecosystem, designed to streamline worship team management and performance coordination.

**Ultimate Musician** - Admin & Planning
**Ultimate Playback** - Team Member Experience

---

**Version:** 1.0
**Last Updated:** February 19, 2026
**Created by:** Claude Sonnet 4.5
