# Apple Watch + iOS Widget — Xcode Setup Guide
## Ultimate Playback

All the Swift/ObjC source code has been written. You just need to wire it
together in Xcode. Follow these steps in order.

---

## Prerequisites

```bash
# 1. Generate the ios/ folder (if you haven't already)
cd /Users/studio/Desktop/Ultimate_Workspace/UltimatePlayback_RUN
npx expo prebuild --platform ios --clean

# 2. Open Xcode
open ios/UltimatePlayback.xcworkspace
```

---

## Step 1 — Add Native Modules to the iOS app target

In Xcode, select the **UltimatePlayback** target (not UltimatePlayback-tvOS).

1. In the Project Navigator, right-click the `UltimatePlayback/` folder → **Add Files to "UltimatePlayback"**
2. Navigate to `../native/RN/` and add all 4 files:
   - `WatchBridgeModule.swift`
   - `WatchBridgeModule.m`
   - `WidgetDataModule.swift`
   - `WidgetDataModule.m`
3. When Xcode asks "Would you like to configure a bridging header?", click **Create Bridging Header**
   (or add the lines below to the existing `UltimatePlayback-Bridging-Header.h`):

```objc
// UltimatePlayback-Bridging-Header.h
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
```

---

## Step 2 — Add App Groups entitlement to the iOS target

1. Select the **UltimatePlayback** target → **Signing & Capabilities** tab
2. Click **+ Capability** → search and add **App Groups**
3. Add the group: `group.com.ultimatemusician.playback`

---

## Step 3 — Create the WatchKit App target

1. **File → New → Target**
2. Choose **watchOS → Watch App** (NOT "Watch App for Existing iOS App" if it's greyed — choose the plain one)
3. Name it: `UltimatePlaybackWatch`
4. Set **Bundle ID**: `com.ultimatemusician.playback.watchkitapp`
5. Uncheck "Include Notification Scene" (not needed)
6. Click **Finish**

Xcode creates two new folders:
- `UltimatePlaybackWatch/`        ← the watchOS app code
- `UltimatePlaybackWatchExtension/`  ← only present for older watchOS; for watchOS 7+ it's merged

---

## Step 4 — Add Watch source files

1. In Project Navigator, right-click the `UltimatePlaybackWatch/` folder → **Add Files**
2. Navigate to `../native/Watch/` and add:
   - `WatchApp.swift`
   - `ContentView.swift`
   - `WatchSessionManager.swift`
3. When prompted about targets, make sure **only** `UltimatePlaybackWatch` is checked.
4. Delete the placeholder `ContentView.swift` that Xcode generated (keep ours).

---

## Step 5 — Add WatchConnectivity framework to Watch target

1. Select the **UltimatePlaybackWatch** target → **General** tab
2. Scroll to **Frameworks, Libraries and Embedded Content**
3. Click **+** → search `WatchConnectivity.framework` → **Add**

Also add it to the **UltimatePlayback** (iOS) target if it's not already there.

---

## Step 6 — Add App Groups to the Watch target

1. Select **UltimatePlaybackWatch** target → **Signing & Capabilities**
2. **+ Capability → App Groups**
3. Add the same group: `group.com.ultimatemusician.playback`

---

## Step 7 — Create the Widget Extension target

1. **File → New → Target**
2. Choose **iOS → Widget Extension**
3. Name it: `UltimatePlaybackWidget`
4. Set **Bundle ID**: `com.ultimatemusician.playback.widget`
5. Uncheck "Include Configuration App Intent" (keep it simple)
6. Click **Finish**

---

## Step 8 — Add Widget source files

1. In Project Navigator, right-click the `UltimatePlaybackWidget/` folder → **Add Files**
2. Navigate to `../native/Widget/` and add:
   - `WidgetEntry.swift`
   - `UltimateWidget.swift`
3. When prompted about targets, check **only** `UltimatePlaybackWidget`.
4. Delete the default placeholder `.swift` file Xcode generated.

---

## Step 9 — Add App Groups to the Widget target

1. Select **UltimatePlaybackWidget** target → **Signing & Capabilities**
2. **+ Capability → App Groups**
3. Add: `group.com.ultimatemusician.playback`

---

## Step 10 — Update app.json for App Groups

Add the following to your `app.json` `ios` section:

```json
{
  "expo": {
    "ios": {
      "bundleIdentifier": "com.ultimatemusician.playback",
      "entitlements": {
        "com.apple.security.application-groups": [
          "group.com.ultimatemusician.playback"
        ]
      }
    }
  }
}
```

---

## Step 11 — Build & Run

1. In Xcode, select the **UltimatePlayback** scheme → build target **your iPhone / physical device**
   (WatchConnectivity does NOT work on simulators)
2. Build with **⌘B** — fix any signing issues by selecting your personal Team in each target
3. Run with **⌘R** — the iOS app installs on your phone
4. Xcode will also automatically install the Watch app on the paired Apple Watch
5. Open Ultimate Playback → go to the Setlist Runner → press Play
6. On the Watch: you should see the Now Playing page update with the song title + transport controls
7. Press the **⏭** button on the Watch → the phone should skip to the next song

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "WatchBridgeModule not found" in RN | Make sure both `.swift` + `.m` files are in the UltimatePlayback target (check target membership in File Inspector) |
| Watch app installs but shows no data | Verify both the iOS app AND the Watch target have the same App Group ID (`group.com.ultimatemusician.playback`). Open the Watch app AFTER launching the iOS app. |
| Widget shows empty / "Open app to load verse" | The widget reads `widget_data.json` from App Group. Make sure the iOS app has the entitlement and WidgetDataModule ran at least once. |
| "No module 'WatchConnectivity'" | Add WatchConnectivity.framework to the Watch target frameworks (Step 5) |
| Signing error on Watch/Widget targets | Select your Apple Developer Team in each target → Signing & Capabilities → Team |

---

## What's already done (no Xcode needed)

| File | What it does |
|------|-------------|
| `src/services/watchBridge.js` | JS wrapper — sends state to Watch, receives commands |
| `src/services/widgetDataWriter.js` | JS wrapper — writes JSON to App Groups for the Widget |
| `native/RN/WatchBridgeModule.swift` | iPhone WCSession native module (RCTEventEmitter) |
| `native/RN/WatchBridgeModule.m` | ObjC bridge for the above |
| `native/RN/WidgetDataModule.swift` | App Groups file writer native module |
| `native/RN/WidgetDataModule.m` | ObjC bridge for the above |
| `native/Watch/WatchSessionManager.swift` | WCSession on Watch side — publishes state to SwiftUI |
| `native/Watch/ContentView.swift` | Watch UI: transport (▶/⏸/⏮/⏭), verse, service tabs |
| `native/Watch/WatchApp.swift` | watchOS app entry point |
| `native/Widget/WidgetEntry.swift` | Widget timeline provider + payload decoder |
| `native/Widget/UltimateWidget.swift` | Widget views (small/medium/large) |
| `SetlistRunnerScreen.js` | Now calls `sendPlaybackState` on every song/play change; handles Watch commands |
| `HomeScreen.js` | Now calls `sendVerseToWatch`, `sendServiceInfoToWatch`, `updateWidgetData` |
