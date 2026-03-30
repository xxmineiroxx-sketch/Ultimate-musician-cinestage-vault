# 🧪 Testing Guide - Ultimate Playback + Ultimate Musician Integration

## Complete Testing Setup for Desktop + iOS Simulator

**Your Setup:**
- Ultimate Musician: iPhone 17 Pro Simulator (iOS 26.2)
- Ultimate Playback: Web/Desktop App
- Backend: Python FastAPI server

---

## 📋 Prerequisites

### 1. Backend (CineStage)
```bash
cd "/Users/studio/Library/Mobile Documents/com~apple~CloudDocs/Ultimate Ecosystem /Cinestage/CineStage_Music_AI"
source venv/bin/activate
pip install -r requirements.txt
```

### 2. Ultimate Playback (Already Installed ✅)
```bash
cd "/Users/studio/Library/Mobile Documents/com~apple~CloudDocs/Ultimate Ecosystem /Utimate Musician app/UltimatePlatform_MONOREPO_MASTER/apps/ultimate_playback"
# Dependencies already installed!
```

### 3. Ultimate Musician (Already Running ✅)
- iPhone 17 Pro Simulator
- iOS 26.2

---

## 🚀 Step-by-Step Testing

### **Step 1: Start Backend Server**

```bash
cd "/Users/studio/Library/Mobile Documents/com~apple~CloudDocs/Ultimate Ecosystem /Cinestage/CineStage_Music_AI"
source venv/bin/activate
uvicorn app.main:app --port 8000 --reload
```

**Expected Output:**
```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete.
```

**Test Backend:**
```bash
curl http://localhost:8000/health
# Should return: {"status":"ok"}
```

---

### **Step 2: Start Ultimate Playback (Web/Desktop)**

Open a new terminal:

```bash
cd "/Users/studio/Library/Mobile Documents/com~apple~CloudDocs/Ultimate Ecosystem /Utimate Musician app/UltimatePlatform_MONOREPO_MASTER/apps/ultimate_playback"
npm start
```

**When Expo DevTools opens:**
- Press `w` for web browser
- Or open http://localhost:19006 in your browser

**The app will open in your default browser!**

---

### **Step 3: Test Ultimate Playback App**

#### **3.1 Create a Test Song**

1. Click "My Songs"
2. Click "Create New Song"
3. Enter:
   - **Title:** "Test Integration"
   - **Artist:** "Test Band"
   - **Key:** "G"
   - **Tempo:** "120"
4. Click "Save & Continue"

#### **3.2 Add Device Setup**

1. Click "Nord Stage 4"
2. Click "Add Program"
3. Enter:
   - **Program Number:** 1
   - **Name:** "Test Program"
4. Click "Save"

#### **3.3 Test Section Mapping (Optional)**

1. After saving preset, click "🎯 Map to Song Sections"
2. For "Intro" section:
   - Click "Program 1"
3. Click "Save Mappings"

#### **3.4 Test Preset Recall**

1. Go back to Device Setup
2. Click "🧪 Test Preset"
3. Verify device status shows:
   - ✅ Connected or ⚠️ Not Found (if no real device)
4. Click "🎹 Trigger All Devices"

**Expected:**
- If Nord Stage connected: Program 1 recalls
- If no device: Shows error (that's OK for testing)

---

### **Step 4: Test Ultimate Musician App**

#### **4.1 Check iPhone Simulator**

1. Ultimate Musician should already be running
2. Navigate to a song with the same title: "Test Integration"

#### **4.2 Open LiveScreen**

1. Click "Go Live" or navigate to LiveScreen
2. Look for the **Device Status Bar** (should appear near the top)

**Expected:**
```
┌─────────────────────────────────┐
│ ⚠️ CineStage Backend Offline    │  ← OR
│ 🎹 Nord Stage 4 🔌             │
│ ✅ Presets configured           │
└─────────────────────────────────┘
```

#### **4.3 Test Preset Triggering**

1. Click on any section pill (INTRO, VERSE, CHORUS)
2. Preset should automatically trigger
3. Check console logs for "Preset triggered"

---

### **Step 5: Test Deep Linking**

#### **5.1 From Ultimate Musician to Ultimate Playback**

1. In Ultimate Musician LiveScreen
2. Click "⚙️ Configure Devices" button in Device Status Bar

**Expected:**
- Should prompt: "Ultimate Playback Not Found" (deep linking from simulator to web won't work)
- This is normal! Deep linking works best on physical devices

**Alternative Test:**
Open this URL in your browser:
```
ultimateplayback://song/test_song_id/device-setup
```

(Browser will ask if you want to open Ultimate Playback)

---

### **Step 6: Test Key Change (Auto-Transpose)**

#### **In Ultimate Playback Web App:**

1. Go to "My Songs"
2. Click on "Test Integration"
3. Find "Change Key" button (if added to UI)
4. Or manually test transpose functions in browser console:

```javascript
// Open browser console (F12)
import transpose from './src/utils/transpose';

// Test transpose
transpose.transposeChord('C', 2);  // Should return 'D'
transpose.transposeChord('Gmaj7', -2);  // Should return 'Fmaj7'
```

---

### **Step 7: Test Preset Library Browser**

1. In Ultimate Playback
2. Navigate to Preset Library Browser
3. Search for "Piano"
4. Filter by category: "Piano"
5. Click on a preset
6. Select "Add to Song"

---

## 🔍 Troubleshooting

### **Problem: Backend Offline**

**Check:**
```bash
curl http://localhost:8000/health
```

**Fix:**
```bash
cd CineStage_Music_AI
source venv/bin/activate
uvicorn app.main:app --port 8000
```

---

### **Problem: Ultimate Playback Won't Start**

**Check node_modules:**
```bash
cd apps/ultimate_playback
ls node_modules/expo
```

**If missing:**
```bash
npm install
```

**Try clearing cache:**
```bash
npm start -- --clear
```

---

### **Problem: AsyncStorage Not Shared**

AsyncStorage in web runs in browser localStorage.
AsyncStorage in iOS Simulator runs in native storage.

**These are separate!**

**Solution:** For testing, create the same song in both apps:
1. Create "Test Integration" in Ultimate Playback (web)
2. Create "Test Integration" in Ultimate Musician (iOS)
3. Data will be separate but functional

**For Production:** Use cloud sync (Phase 3 feature)

---

### **Problem: Deep Linking Doesn't Work**

**iOS Simulator → Web deep linking is limited.**

**Test deep linking within the same platform:**

**Web → Web:**
```javascript
window.open('ultimateplayback://song/123/device-setup');
```

**iOS → iOS:**
- Install both apps on same physical device
- Or use Expo Go on physical device

---

### **Problem: MIDI Devices Not Found**

**This is expected!** MIDI devices require:
- Physical MIDI hardware (keyboards, guitar rigs)
- Connected via USB or WIDI Bluetooth
- Backend running with `python-rtmidi` installed

**For UI testing:** The "Not Found" state is OK. You can still test:
- Creating songs
- Setting up devices
- Mapping sections
- UI navigation
- Deep linking
- Transpose features

---

## 📱 Running Both Apps Side by Side

### **Recommended Setup:**

**Monitor 1:**
- Left: Ultimate Playback (web browser)
- Right: Terminal with backend logs

**Monitor 2 (or same monitor):**
- iPhone Simulator with Ultimate Musician

### **Workflow:**

1. **Create song in Ultimate Playback** (web):
   - Enter song details
   - Add devices
   - Configure presets
   - Map sections

2. **Test in Ultimate Musician** (simulator):
   - Open song with same name
   - Check device status
   - Test section navigation
   - Verify preset triggering

3. **Monitor Backend** (terminal):
   - Watch API calls
   - Check MIDI commands
   - See device detection logs

---

## 🎯 Test Checklist

### **Ultimate Playback (Web):**
- [ ] Home screen loads
- [ ] Create new song
- [ ] Add Nord Stage device
- [ ] Add MODX device
- [ ] Edit presets
- [ ] Map sections to presets
- [ ] Test mode shows device status
- [ ] Trigger preset API call works
- [ ] Preset library browser works
- [ ] Search/filter presets
- [ ] Key change screen loads
- [ ] Transpose functions work

### **Ultimate Musician (iOS):**
- [ ] LiveScreen loads
- [ ] Device status bar appears
- [ ] Shows connected devices (or offline state)
- [ ] Shows preset availability
- [ ] Section pills display
- [ ] Click section triggers preset
- [ ] Visual feedback (loading state)
- [ ] Error handling works

### **Integration:**
- [ ] Backend receives API calls
- [ ] Preset triggering works end-to-end
- [ ] Device detection works
- [ ] Bluetooth MIDI detection (if WIDI available)
- [ ] Error messages are clear
- [ ] Loading states appear
- [ ] Success feedback shows

---

## 🚀 Quick Start Commands

### **Terminal 1 - Backend:**
```bash
cd "/Users/studio/Library/Mobile Documents/com~apple~CloudDocs/Ultimate Ecosystem /Cinestage/CineStage_Music_AI"
source venv/bin/activate
uvicorn app.main:app --port 8000 --reload
```

### **Terminal 2 - Ultimate Playback:**
```bash
cd "/Users/studio/Library/Mobile Documents/com~apple~CloudDocs/Ultimate Ecosystem /Utimate Musician app/UltimatePlatform_MONOREPO_MASTER/apps/ultimate_playback"
npm start
# Press 'w' for web
```

### **Terminal 3 - Test API (Optional):**
```bash
# Scan devices
curl http://localhost:8000/api/devices/scan

# Test Nord Stage recall
curl -X POST http://localhost:8000/api/devices/test \
  -H "Content-Type: application/json" \
  -d '{"device_type":"nord_stage_4","config":{"program_number":1}}'
```

---

## 📊 Testing Data Flow

```
1. Create Song (Ultimate Playback Web):
   └─> AsyncStorage (browser localStorage)
       └─> Song: "Test Integration"

2. Click Section (Ultimate Musician iOS):
   └─> findSongPresetByTitle("Test Integration")
       └─> AsyncStorage (iOS native)
           └─> Not found (separate storage!)

3. Create Same Song (Ultimate Musician iOS):
   └─> AsyncStorage (iOS native)
       └─> Song: "Test Integration"

4. Click Section Again:
   └─> findSongPresetByTitle("Test Integration")
       └─> Found! ✅
       └─> cinestageAPI.triggerPreset()
           └─> POST http://localhost:8000/api/presets/trigger
               └─> Backend processes MIDI
                   └─> Device recalls preset ✅
```

---

## 💡 Tips

1. **Keep Backend Running:** Backend must stay running for preset triggering

2. **Check Console Logs:**
   - **Web:** Browser DevTools (F12)
   - **iOS:** Xcode Console or Terminal logs
   - **Backend:** Terminal running uvicorn

3. **Separate Storage:** Web and iOS have separate AsyncStorage
   - For demo, create same song in both apps
   - For production, use cloud sync

4. **MIDI Devices Optional:** Can test entire UI without real hardware

5. **Test Incrementally:** Test each feature one at a time

6. **Use Mock Data:** Preset library already has mock data for testing

---

## 🎉 Success Criteria

**You'll know it's working when:**

✅ Ultimate Playback opens in browser
✅ Can create songs and add presets
✅ Backend shows API requests in terminal
✅ Ultimate Musician shows device status
✅ Clicking sections logs "Preset triggered"
✅ No critical errors in any console

---

## 📞 Support

**If something doesn't work:**

1. Check all 3 terminals for errors
2. Verify URLs:
   - Backend: http://localhost:8000
   - Ultimate Playback: http://localhost:19006
3. Clear caches:
   - Browser: Hard refresh (Cmd+Shift+R)
   - Expo: `npm start -- --clear`
   - iOS: Reset simulator
4. Restart everything:
   - Kill all terminals
   - Close browser
   - Close simulator
   - Start fresh

---

**Happy Testing!** 🚀

**Created:** February 17, 2026
**For:** Ultimate Playback + Ultimate Musician Integration Testing
