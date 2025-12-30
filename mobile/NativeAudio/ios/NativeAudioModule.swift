import ExpoModulesCore
import AVFoundation
import CoreMedia

public class NativeAudioModule: Module {

  private let engine = AVAudioEngine()
  private var isRunning = false

  // Event throttle
  private var emitInterval: Double = 0.05 // 50ms
  private var lastEmitTime: Double = 0.0

  public func definition() -> ModuleDefinition {
    Name("NativeAudio")

    // JS tarafında dinleyeceğimiz event
    Events("onLevel", "onState", "onError")

    // İstersen event aralığını ayarlarsın (ms)
    Function("configure") { (frameMs: Double) in
      let ms = max(10.0, min(200.0, frameMs))
      self.emitInterval = ms / 1000.0
    }

    // Mic izni iste (Promise)
    AsyncFunction("requestPermission") { () async throws -> Bool in
      return try await self.requestMicPermission()
    }

    // Mic metering başlat (Promise)
    AsyncFunction("start") { () async throws -> Bool in
      if self.isRunning { return true }

      let granted = try await self.requestMicPermission()
      if !granted {
        self.sendEvent("onError", ["message": "Microphone permission denied"])
        return false
      }

      try self.configureAudioSession()
      try self.startEngineTap()

      self.isRunning = true
      self.sendEvent("onState", ["state": "running"])
      return true
    }

    // Durdur
    Function("stop") {
      self.stopInternal()
      self.sendEvent("onState", ["state": "stopped"])
    }

    // ✅ Asistan konuşma dosyasını analiz et (MP3 -> PCM -> frame frame level)
    AsyncFunction("analyzeFile") { (uri: String, frameMs: Double) async throws -> [Double] in
      return try self.analyzeAudioFileLevels(uri: uri, frameMs: frameMs)
    }
  }

  // MARK: - Permissions

  private func requestMicPermission() async throws -> Bool {
    let session = AVAudioSession.sharedInstance()
    return await withCheckedContinuation { continuation in
      session.requestRecordPermission { granted in
        continuation.resume(returning: granted)
      }
    }
  }

  // MARK: - Audio session

  private func configureAudioSession() throws {
    let session = AVAudioSession.sharedInstance()

    // ✅ allowBluetooth deprecated → allowBluetoothHFP
    // playAndRecord + measurement: metering için ideal
    try session.setCategory(
      .playAndRecord,
      mode: .measurement,
      options: [.defaultToSpeaker, .allowBluetoothHFP]
    )
    try session.setActive(true, options: [])
  }

  // MARK: - Engine + Tap

  private func startEngineTap() throws {
    let input = engine.inputNode
    let format = input.outputFormat(forBus: 0)

    // Tap zaten varsa kaldır
    input.removeTap(onBus: 0)

    input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
      guard let self else { return }
      self.handlePCM(buffer: buffer)
    }

    engine.prepare()
    try engine.start()
  }

  private func stopInternal() {
    if !isRunning {
      engine.inputNode.removeTap(onBus: 0)
      engine.stop()
      return
    }

    isRunning = false
    engine.inputNode.removeTap(onBus: 0)
    engine.stop()

    do {
      try AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
    } catch {
      // Sessiz geç
    }
  }

  // MARK: - PCM -> RMS / dB (Mic)

  private func handlePCM(buffer: AVAudioPCMBuffer) {
    // throttle
    let now = CACurrentMediaTime()
    if (now - lastEmitTime) < emitInterval { return }
    lastEmitTime = now

    guard let channelData = buffer.floatChannelData else { return }
    let channel = channelData[0]
    let frameLength = Int(buffer.frameLength)
    if frameLength <= 0 { return }

    var sum: Float = 0.0
    var peak: Float = 0.0

    for i in 0..<frameLength {
      let x = channel[i]
      sum += x * x
      let ax = abs(x)
      if ax > peak { peak = ax }
    }

    let mean = sum / Float(frameLength)
    let rms = sqrt(mean)

    let level = min(1.0, Double(rms * 6.0)) // UI için ölçek
    let db = (rms > 0) ? (20.0 * log10(Double(rms))) : -160.0

    self.sendEvent("onLevel", [
      "level": level,
      "rms": Double(rms),
      "db": db,
      "peak": Double(peak)
    ])
  }

  // MARK: - File analysis (TTS playback)

  private func analyzeAudioFileLevels(uri: String, frameMs: Double) throws -> [Double] {
    let url: URL
    if uri.hasPrefix("file://") {
      guard let u = URL(string: uri) else {
        throw NSError(domain: "NativeAudio", code: -10, userInfo: [NSLocalizedDescriptionKey: "Invalid file URI"])
      }
      url = u
    } else {
      url = URL(fileURLWithPath: uri)
    }

    let asset = AVAsset(url: url)

    guard let track = asset.tracks(withMediaType: .audio).first else {
      throw NSError(domain: "NativeAudio", code: -11, userInfo: [NSLocalizedDescriptionKey: "No audio track"])
    }

    let reader = try AVAssetReader(asset: asset)

    // Decode to 16-bit PCM (interleaved)
    let outputSettings: [String: Any] = [
      AVFormatIDKey: kAudioFormatLinearPCM,
      AVLinearPCMIsFloatKey: false,
      AVLinearPCMBitDepthKey: 16,
      AVLinearPCMIsBigEndianKey: false,
      AVLinearPCMIsNonInterleaved: false
    ]

    let output = AVAssetReaderTrackOutput(track: track, outputSettings: outputSettings)
    output.alwaysCopiesSampleData = false
    reader.add(output)

    guard reader.startReading() else {
      throw NSError(domain: "NativeAudio", code: -12, userInfo: [NSLocalizedDescriptionKey: "AVAssetReader failed to start"])
    }

    // Sample rate from track description (fallback 44100)
    var sampleRate: Double = 44100.0

    // ✅ Conditional downcast hatası → conditional cast kaldırıldı
    if let firstDescAny = track.formatDescriptions.first {
      let fd = firstDescAny as! CMAudioFormatDescription
      if let asbdPtr = CMAudioFormatDescriptionGetStreamBasicDescription(fd) {
        sampleRate = asbdPtr.pointee.mSampleRate
      }
    }

    let samplesPerFrame = Int(sampleRate * (frameMs / 1000.0))
    if samplesPerFrame <= 0 { return [] }

    var levels: [Double] = []
    var sampleBuffer: [Int16] = []
    sampleBuffer.reserveCapacity(samplesPerFrame * 4)

    func flushFramesIfPossible() {
      while sampleBuffer.count >= samplesPerFrame {
        let frame = sampleBuffer.prefix(samplesPerFrame)
        sampleBuffer.removeFirst(samplesPerFrame)

        var sum: Double = 0
        for s in frame {
          let x = Double(s) / 32768.0
          sum += x * x
        }
        let rms = sqrt(sum / Double(frame.count))

        // normalize 0..1 (boost)
        let level = min(1.0, rms * 2.2)
        levels.append(level)
      }
    }

    while reader.status == .reading {
      guard let sbuf = output.copyNextSampleBuffer() else { break }
      guard let block = CMSampleBufferGetDataBuffer(sbuf) else { continue }

      var length = 0
      var dataPointer: UnsafeMutablePointer<Int8>?
      CMBlockBufferGetDataPointer(
        block,
        atOffset: 0,
        lengthAtOffsetOut: nil,
        totalLengthOut: &length,
        dataPointerOut: &dataPointer
      )

      guard let ptr = dataPointer, length > 0 else { continue }

      let count = length / MemoryLayout<Int16>.size
      let int16Ptr = ptr.withMemoryRebound(to: Int16.self, capacity: count) { $0 }

      for i in 0..<count {
        sampleBuffer.append(int16Ptr[i])
      }

      flushFramesIfPossible()
    }

    // tail
    if !sampleBuffer.isEmpty {
      var sum: Double = 0
      for s in sampleBuffer {
        let x = Double(s) / 32768.0
        sum += x * x
      }
      let rms = sqrt(sum / Double(sampleBuffer.count))
      let level = min(1.0, rms * 2.2)
      levels.append(level)
    }

    return levels
  }
}
