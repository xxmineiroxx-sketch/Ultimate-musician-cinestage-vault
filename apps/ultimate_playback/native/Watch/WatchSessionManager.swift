// WatchSessionManager.swift
// watchOS side of WatchConnectivity.
// Receives playback state from iPhone; sends commands back.
// Lives in the WatchKit Extension target.

import Foundation
import WatchConnectivity
import Combine

final class WatchSessionManager: NSObject, ObservableObject, WCSessionDelegate {

  static let shared = WatchSessionManager()

  // ── Published state (ContentView observes these) ──────────────────────────
  @Published var isPlaying: Bool   = false
  @Published var songTitle: String = "—"
  @Published var artist: String    = ""
  @Published var songIndex: Int    = 0
  @Published var totalSongs: Int   = 0
  @Published var sectionLabel: String = ""
  @Published var bpm: Int?         = nil
  @Published var key: String?      = nil

  @Published var verseText: String  = ""
  @Published var verseRef: String   = ""

  @Published var serviceName: String = ""
  @Published var serviceDate: String = ""
  @Published var role: String        = ""

  @Published var isReachable: Bool = false

  // ── Init ──────────────────────────────────────────────────────────────────
  private override init() {
    super.init()
    if WCSession.isSupported() {
      WCSession.default.delegate = self
      WCSession.default.activate()
    }
  }

  // ── Send command to iPhone ────────────────────────────────────────────────
  func send(_ command: String) {
    guard WCSession.default.isReachable else { return }
    WCSession.default.sendMessage(["cmd": command], replyHandler: nil, errorHandler: nil)
  }

  // ── WCSessionDelegate ─────────────────────────────────────────────────────
  func session(_ session: WCSession,
               activationDidCompleteWith state: WCSessionActivationState,
               error: Error?) {
    DispatchQueue.main.async { self.isReachable = session.isReachable }
  }

  func sessionReachabilityDidChange(_ session: WCSession) {
    DispatchQueue.main.async { self.isReachable = session.isReachable }
  }

  // Receive real-time message from iPhone (sendMessage)
  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    DispatchQueue.main.async { self.apply(message) }
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any],
               replyHandler: @escaping ([String: Any]) -> Void) {
    DispatchQueue.main.async { self.apply(message) }
    replyHandler(["ok": true])
  }

  // Receive persistent context from iPhone (updateApplicationContext)
  func session(_ session: WCSession,
               didReceiveApplicationContext applicationContext: [String: Any]) {
    DispatchQueue.main.async { self.apply(applicationContext) }
  }

  // ── Apply any incoming dict to published state ────────────────────────────
  private func apply(_ d: [String: Any]) {
    if let v = d["isPlaying"]    as? Bool   { isPlaying    = v }
    if let v = d["songTitle"]    as? String { songTitle    = v.isEmpty ? "—" : v }
    if let v = d["artist"]       as? String { artist       = v }
    if let v = d["songIndex"]    as? Int    { songIndex    = v }
    if let v = d["totalSongs"]   as? Int    { totalSongs   = v }
    if let v = d["sectionLabel"] as? String { sectionLabel = v }
    if let v = d["bpm"]          as? Int    { bpm          = v }
    if let v = d["key"]          as? String { key          = v }
    if let v = d["verseText"]    as? String { verseText    = v }
    if let v = d["verseRef"]     as? String { verseRef     = v }
    if let v = d["serviceName"]  as? String { serviceName  = v }
    if let v = d["serviceDate"]  as? String { serviceDate  = v }
    if let v = d["role"]         as? String { role         = v }
  }
}
