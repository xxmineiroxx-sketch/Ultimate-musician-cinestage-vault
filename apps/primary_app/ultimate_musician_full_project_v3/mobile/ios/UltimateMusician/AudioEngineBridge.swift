import Foundation

@objc(AudioEngineBridge)
class AudioEngineBridge: NSObject {

  // React Native requires this to know whether to run setup on the main thread.
  @objc static func requiresMainQueueSetup() -> Bool { return false }

  @objc func play() {
    AudioEngineManager.shared.play()
  }

  @objc func stop() {
    AudioEngineManager.shared.stop()
  }

  /// Load a local file URI and prepare it for playback.
  /// uri should be a file:// path as passed from React Native's FileSystem.
  @objc func load(_ uri: String) {
    guard let url = URL(string: uri) else {
      print("[AudioEngineBridge] Invalid URI: \(uri)")
      return
    }
    AudioEngineManager.shared.load(url: url)
  }

  /// Fade in to full volume over `duration` milliseconds.
  @objc func fadeIn(_ duration: NSNumber) {
    AudioEngineManager.shared.fade(to: 1.0, duration: duration.doubleValue / 1000.0)
  }

  /// Fade out to silence over `duration` milliseconds.
  @objc func fadeOut(_ duration: NSNumber) {
    AudioEngineManager.shared.fade(to: 0.0, duration: duration.doubleValue / 1000.0)
  }

  /// Fade to an arbitrary volume (0.0–1.0) over `duration` milliseconds.
  @objc func fadeTo(_ volume: NSNumber, duration: NSNumber) {
    AudioEngineManager.shared.fade(
      to: volume.floatValue,
      duration: duration.doubleValue / 1000.0
    )
  }

  /// Returns current output volume (0.0–1.0) via a callback.
  @objc func getVolume(_ callback: @escaping RCTResponseSenderBlock) {
    callback([NSNull(), AudioEngineManager.shared.currentVolume])
  }
}
