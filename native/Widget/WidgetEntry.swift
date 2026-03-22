// WidgetEntry.swift
// Timeline entry + provider for the Ultimate Playback iOS Home Screen Widget.
// Lives in the Widget Extension target.

import WidgetKit
import SwiftUI

// ── Data shape (mirrors widgetDataWriter.js output) ─────────────────────────
struct WidgetPayload: Codable {
  struct Verse: Codable {
    var text: String
    var ref: String
    var theme: String?
  }
  struct NextService: Codable {
    var name: String
    var date: String
    var time: String?
  }
  var verse: Verse?
  var nextService: NextService?
  var role: String?
  var assignmentStatus: String?
  var updatedAt: String?
}

// ── Timeline Entry ────────────────────────────────────────────────────────────
struct UltimateEntry: TimelineEntry {
  let date: Date
  let payload: WidgetPayload?
}

// ── Provider ──────────────────────────────────────────────────────────────────
struct UltimateWidgetProvider: TimelineProvider {
  private let appGroupId = "group.com.ultimatemusician.playback"
  private let fileName   = "widget_data.json"

  func placeholder(in context: Context) -> UltimateEntry {
    UltimateEntry(date: Date(), payload: nil)
  }

  func getSnapshot(in context: Context, completion: @escaping (UltimateEntry) -> Void) {
    completion(UltimateEntry(date: Date(), payload: loadPayload()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<UltimateEntry>) -> Void) {
    let currentDate = Date()
    let entry = UltimateEntry(date: currentDate, payload: loadPayload())
    // Refresh every 15 minutes
    let nextRefresh = Calendar.current.date(byAdding: .minute, value: 15, to: currentDate)!
    completion(Timeline(entries: [entry], policy: .after(nextRefresh)))
  }

  private func loadPayload() -> WidgetPayload? {
    guard let container = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: appGroupId) else { return nil }
    let url = container.appendingPathComponent(fileName)
    guard let data = try? Data(contentsOf: url) else { return nil }
    return try? JSONDecoder().decode(WidgetPayload.self, from: data)
  }
}
