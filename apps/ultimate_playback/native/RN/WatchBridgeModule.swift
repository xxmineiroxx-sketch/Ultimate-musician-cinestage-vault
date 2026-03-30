// WatchBridgeModule.swift
// Drop this file into ios/UltimatePlayback/ after running expo prebuild.
// Bridges React Native ↔ WCSession (iPhone side).

import Foundation
import React
import WatchConnectivity

@objc(WatchBridgeModule)
class WatchBridgeModule: RCTEventEmitter, WCSessionDelegate {

  private var session: WCSession?

  override init() {
    super.init()
    if WCSession.isSupported() {
      session = WCSession.default
      session?.delegate = self
      session?.activate()
    }
  }

  // ── RCT Setup ─────────────────────────────────────────────────────────────

  override static func requiresMainQueueSetup() -> Bool { return false }

  override func supportedEvents() -> [String]! {
    return ["WatchCommand", "WatchReachabilityChanged"]
  }

  // ── RN-exposed methods ────────────────────────────────────────────────────

  @objc func sendMessage(_ payload: NSDictionary,
                          resolve: @escaping RCTPromiseResolveBlock,
                          reject: @escaping RCTPromiseRejectBlock) {
    guard let session = session, session.isReachable,
          let dict = payload as? [String: Any] else {
      reject("NOT_REACHABLE", "Watch not reachable", nil)
      return
    }
    session.sendMessage(dict, replyHandler: nil) { error in
      reject("SEND_FAILED", error.localizedDescription, error)
    }
    resolve(nil)
  }

  @objc func updateApplicationContext(_ payload: NSDictionary,
                                       resolve: @escaping RCTPromiseResolveBlock,
                                       reject: @escaping RCTPromiseRejectBlock) {
    guard let session = session, session.activationState == .activated,
          let dict = payload as? [String: Any] else {
      reject("NOT_ACTIVATED", "WCSession not activated", nil)
      return
    }
    do {
      try session.updateApplicationContext(dict)
      resolve(nil)
    } catch {
      reject("CONTEXT_FAILED", error.localizedDescription, error)
    }
  }

  @objc func isReachable(_ resolve: @escaping RCTPromiseResolveBlock,
                           reject: @escaping RCTPromiseRejectBlock) {
    resolve(session?.isReachable ?? false)
  }

  // ── WCSessionDelegate ────────────────────────────────────────────────────

  func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {}
  func sessionDidBecomeInactive(_ session: WCSession) {}
  func sessionDidDeactivate(_ session: WCSession) { session.activate() }

  // Watch sent a command (PLAY, PAUSE, NEXT, PREV)
  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    sendEvent(withName: "WatchCommand", body: message)
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any],
               replyHandler: @escaping ([String: Any]) -> Void) {
    sendEvent(withName: "WatchCommand", body: message)
    replyHandler(["ok": true])
  }
}
