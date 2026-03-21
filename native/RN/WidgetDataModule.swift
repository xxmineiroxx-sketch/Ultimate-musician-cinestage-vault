// WidgetDataModule.swift
// Drop into ios/UltimatePlayback/ after expo prebuild.
// Writes shared JSON to App Groups container so the iOS Widget can read it.

import Foundation

@objc(WidgetDataModule)
class WidgetDataModule: NSObject {

  private let appGroupId = "group.com.ultimatemusician.playback"
  private let fileName   = "widget_data.json"

  @objc static func requiresMainQueueSetup() -> Bool { return false }

  // ── RN-exposed method ──────────────────────────────────────────────────────
  // Called from JS: WidgetDataModule.writeWidgetData(jsonString)
  @objc func writeWidgetData(_ jsonString: String,
                              resolve: RCTPromiseResolveBlock,
                              reject: RCTPromiseRejectBlock) {
    guard let container = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: appGroupId) else {
      reject("NO_CONTAINER",
             "App Group '\(appGroupId)' not found. Check Xcode entitlements.",
             nil)
      return
    }
    let fileURL = container.appendingPathComponent(fileName)
    do {
      try jsonString.write(to: fileURL, atomically: true, encoding: .utf8)
      // Tell WidgetKit to reload timelines so the widget updates immediately.
      if #available(iOS 14.0, *) {
        reloadWidgetTimelines()
      }
      resolve(nil)
    } catch {
      reject("WRITE_FAILED", error.localizedDescription, error)
    }
  }

  // ── WidgetKit reload (dynamic import avoids compile error on iOS <14) ──────
  @available(iOS 14.0, *)
  private func reloadWidgetTimelines() {
    // Using NSClassFromString so we don't need to import WidgetKit in this file
    // (WidgetKit is only available in the Widget Extension target).
    // The main app can still call WidgetCenter.shared.reloadAllTimelines() directly;
    // here we do a safe runtime call.
    if let wkCenter = NSClassFromString("WidgetCenter") as? NSObject.Type,
       let center = wkCenter.value(forKey: "shared") as? NSObject {
      center.perform(NSSelectorFromString("reloadAllTimelines"))
    }
  }
}
