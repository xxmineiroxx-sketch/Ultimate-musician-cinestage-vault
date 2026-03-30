// WatchApp.swift
// watchOS app entry point.
// Lives in the WatchKit Extension target (or @main watchOS app target for watchOS 7+).

import SwiftUI

@main
struct UltimatePlaybackWatchApp: App {
  @WKApplicationDelegateAdaptor var appDelegate: WatchAppDelegate

  var body: some Scene {
    WindowGroup {
      ContentView()
    }
  }
}

// App delegate — activate WCSession early so context arrives before first render.
class WatchAppDelegate: NSObject, WKApplicationDelegate {
  func applicationDidFinishLaunching() {
    _ = WatchSessionManager.shared   // triggers activate()
  }
}
