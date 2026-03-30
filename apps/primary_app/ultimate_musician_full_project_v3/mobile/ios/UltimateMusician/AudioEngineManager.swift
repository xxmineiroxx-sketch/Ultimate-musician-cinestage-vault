import AVFoundation

class AudioEngineManager {
  static let shared = AudioEngineManager()

  private let engine = AVAudioEngine()
  private let player = AVAudioPlayerNode()
  private var audioFile: AVAudioFile?

  private init() {
    engine.attach(player)
    engine.connect(player, to: engine.mainMixerNode, format: nil)

    // Allow playback through the speaker even in silent mode (iOS only)
    #if os(iOS)
    try? AVAudioSession.sharedInstance().setCategory(
      .playback,
      mode: .default,
      options: [.mixWithOthers]
    )
    try? AVAudioSession.sharedInstance().setActive(true)
    #endif

    do {
      try engine.start()
    } catch {
      print("[AudioEngineManager] Engine failed to start: \(error)")
    }
  }

  func load(url: URL) {
    do {
      audioFile = try AVAudioFile(forReading: url)
    } catch {
      print("[AudioEngineManager] Failed to load file: \(error)")
    }
  }

  func play() {
    guard let file = audioFile else {
      print("[AudioEngineManager] play() called but no file loaded")
      return
    }
    if !engine.isRunning {
      try? engine.start()
    }
    player.stop()
    player.scheduleFile(file, at: nil, completionHandler: nil)
    player.play()
  }

  func stop() {
    player.stop()
  }

  /// Smoothly ramp outputVolume from current to `volume` over `duration` seconds.
  func fade(to volume: Float, duration: Double) {
    let mixer = engine.mainMixerNode
    let steps = 20
    let stepTime = duration / Double(steps)
    let start = mixer.outputVolume
    let delta = (volume - start) / Float(steps)

    for i in 0..<steps {
      DispatchQueue.main.asyncAfter(deadline: .now() + stepTime * Double(i)) {
        let next = mixer.outputVolume + delta
        mixer.outputVolume = max(0.0, min(1.0, next))
      }
    }
    // Guarantee exact final value
    DispatchQueue.main.asyncAfter(deadline: .now() + duration) {
      mixer.outputVolume = volume
    }
  }

  var currentVolume: Float {
    return engine.mainMixerNode.outputVolume
  }
}
