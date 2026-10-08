import AVFoundation
import Observation
import UIKit

// The live camera (the web app's useCamera and capture.ts): an AVCaptureSession shown in a square
// viewfinder, taking square photos. AVFoundation work happens on the engine's own serial queue;
// what the screen shows lives in `CameraModel`, on the main actor.

/// Which camera.
enum CameraSide: Equatable, Sendable {
    case back, front

    var position: AVCaptureDevice.Position {
        switch self {
        case .back: return .back
        case .front: return .front
        }
    }

    var other: CameraSide {
        self == .back ? .front : .back
    }
}

/// What the camera in use can do.
struct CameraCapabilities: Equatable, Sendable {
    let side: CameraSide
    let hasFlash: Bool
    /// Both a back and a front camera.
    let canSwitch: Bool
}

enum CameraStartOutcome: Sendable {
    case running(CameraCapabilities, interrupted: Bool)
    /// No camera at all (the Simulator).
    case noCamera
    case failed
}

/// What the camera screen shows, and its controls' state.
@MainActor
@Observable
final class CameraModel {
    enum Status: Equatable {
        /// Not started (or stopped: in the background, or showing a photo).
        case idle
        /// Asking for access or starting up.
        case starting
        case live
        /// Interrupted (a call, another app using the camera); it carries on by itself.
        case paused(String)
        /// Camera access is off in Settings.
        case denied
        /// No camera on this device: the photo library still works.
        case noCamera
        case failed
    }

    private(set) var status: Status = .idle
    /// The camera in use, once one has started.
    private(set) var side: CameraSide?
    private(set) var hasFlash = false
    private(set) var canSwitch = false
    private(set) var isSwitching = false
    private(set) var isCapturing = false
    /// The flash toggle. Only used while the camera in use has a flash.
    var flashOn = false

    @ObservationIgnored private var engineStorage: CameraEngine?
    @ObservationIgnored private var wantsRunning = false
    /// Bumped on every start and stop, so a late answer from an earlier start is ignored.
    @ObservationIgnored private var generation = 0

    /// Made on first use, so creating the model (each time the screen's view is rebuilt) stays cheap.
    private var engine: CameraEngine {
        if let engineStorage { return engineStorage }
        let engine = CameraEngine()
        engineStorage = engine
        return engine
    }

    /// For the preview, and to tell this session's notifications apart.
    var captureSession: AVCaptureSession {
        engine.session
    }

    var isLive: Bool {
        status == .live
    }

    /// Whether the live picture (or its last frame) belongs in the viewfinder.
    var showsPreview: Bool {
        switch status {
        case .idle, .starting, .live, .paused: return true
        case .denied, .noCamera, .failed: return false
        }
    }

    // MARK: - Starting and stopping

    /// Starts the camera (asking for access the first time), on `preferred` unless one was
    /// already chosen with the switch button.
    func activate(preferred: CameraSide) {
        guard !wantsRunning else { return }
        wantsRunning = true
        generation += 1
        let attempt = generation

        guard CameraEngine.hasCamera else {
            status = .noCamera
            return
        }

        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            start(attempt, preferred: preferred)
        case .notDetermined:
            status = .starting
            Task {
                let granted = await AVCaptureDevice.requestAccess(for: .video)
                guard attempt == self.generation else { return }
                if granted {
                    self.start(attempt, preferred: preferred)
                } else {
                    self.status = .denied
                }
            }
        default:
            // Denied, or restricted (Screen Time, a managed phone).
            status = .denied
        }
    }

    /// Stops the camera: its light goes out and the battery is spared.
    func deactivate() {
        wantsRunning = false
        generation += 1
        engineStorage?.stop()
        isSwitching = false
        switch status {
        case .starting, .live, .paused:
            status = .idle
        default:
            break
        }
    }

    func retry(preferred: CameraSide) {
        deactivate()
        activate(preferred: preferred)
    }

    private func start(_ attempt: Int, preferred: CameraSide) {
        status = .starting
        engine.start(side ?? preferred) { outcome in
            Task { @MainActor in
                self.finishStart(outcome, attempt: attempt)
            }
        }
    }

    private func finishStart(_ outcome: CameraStartOutcome, attempt: Int) {
        guard attempt == generation, wantsRunning else { return }
        switch outcome {
        case .running(let capabilities, interrupted: let interrupted):
            apply(capabilities)
            if !interrupted {
                status = .live
            } else if case .paused = status {
                // The interruption's notice already said why.
            } else {
                status = .paused(Self.pausedMessage(nil))
            }
        case .noCamera:
            status = .noCamera
        case .failed:
            status = .failed
        }
    }

    private func apply(_ capabilities: CameraCapabilities) {
        side = capabilities.side
        hasFlash = capabilities.hasFlash
        canSwitch = capabilities.canSwitch
    }

    // MARK: - Controls

    /// Back to front and back again.
    func switchCamera() {
        guard status == .live, canSwitch, !isSwitching, !isCapturing else { return }
        isSwitching = true
        let attempt = generation
        engine.switchCamera { capabilities in
            Task { @MainActor in
                self.finishSwitch(capabilities, attempt: attempt)
            }
        }
    }

    private func finishSwitch(_ capabilities: CameraCapabilities?, attempt: Int) {
        guard attempt == generation else { return }
        isSwitching = false
        if let capabilities { apply(capabilities) }
    }

    /// Takes a photo: the middle square, exactly what the viewfinder shows. With `mirrorFront`
    /// (Settings → Photos & data → Mirror front camera) a selfie comes out as it looked on screen.
    /// Nil if it didn't work.
    func capture(mirrorFront: Bool) async -> UIImage? {
        guard status == .live, !isCapturing, !isSwitching else { return nil }
        isCapturing = true
        defer { isCapturing = false }

        let flash = hasFlash && flashOn
        let mirror = mirrorFront && side == .front
        let engine = self.engine
        let data: Data? = await withCheckedContinuation { (continuation: CheckedContinuation<Data?, Never>) in
            engine.capture(flash: flash) { data in
                continuation.resume(returning: data)
            }
        }
        guard let data else { return nil }
        return await Task.detached(priority: .userInitiated) {
            CameraImage.square(from: data, mirrored: mirror)
        }.value
    }

    // MARK: - Interruptions

    func sessionWasInterrupted(_ notification: Notification) {
        guard wantsRunning else { return }
        let code = notification.userInfo?[CameraEngine.interruptionReasonKey] as? Int
        let reason = code.flatMap { AVCaptureSession.InterruptionReason(rawValue: $0) }
        status = .paused(Self.pausedMessage(reason))
    }

    func sessionInterruptionEnded() {
        guard wantsRunning, case .paused = status else { return }
        status = .live
    }

    func sessionRuntimeError(_ notification: Notification) {
        guard wantsRunning else { return }
        let error = notification.userInfo?[CameraEngine.errorKey] as? NSError
        if error?.code == AVError.Code.mediaServicesWereReset.rawValue {
            // The system's media services restarted: start again.
            engine.restart()
        } else {
            status = .failed
        }
    }

    private static func pausedMessage(_ reason: AVCaptureSession.InterruptionReason?) -> String {
        guard let reason else { return "The camera is paused for now." }
        switch reason {
        case .videoDeviceInUseByAnotherClient:
            return "Another app is using the camera."
        case .videoDeviceNotAvailableDueToSystemPressure:
            return "Your phone is too warm to use the camera. Try again in a moment."
        case .videoDeviceNotAvailableWithMultipleForegroundApps:
            return "The camera can't be used while another app is open beside this one."
        default:
            return "The camera is paused for now."
        }
    }
}

/// The capture session and everything AVFoundation. Configuring, starting and stopping a session
/// block, so all of it runs on one serial queue, off the main thread.
final class CameraEngine: NSObject, @unchecked Sendable {
    // The session's notifications and their userInfo keys (the SDK's own constants: the keys'
    // string values aren't documented, so they mustn't be spelled out by hand).
    static let wasInterrupted: Notification.Name = AVCaptureSession.wasInterruptedNotification
    static let interruptionEnded: Notification.Name = AVCaptureSession.interruptionEndedNotification
    static let runtimeError: Notification.Name = AVCaptureSession.runtimeErrorNotification
    static let interruptionReasonKey: String = AVCaptureSessionInterruptionReasonKey
    static let errorKey: String = AVCaptureSessionErrorKey

    let session = AVCaptureSession()

    private let queue = DispatchQueue(label: "FriendshipWrapped.Camera", qos: .userInitiated)
    private let photoOutput = AVCapturePhotoOutput()
    // Only touched on `queue`.
    private var input: AVCaptureDeviceInput?
    private var isConfigured = false
    /// Photos being taken: the output doesn't keep their delegates alive.
    private var captures: [Int64: PhotoCaptureProcessor] = [:]

    /// The camera on a side, if the device has one (the Simulator has none).
    static func device(for side: CameraSide) -> AVCaptureDevice? {
        AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: side.position)
    }

    static var hasCamera: Bool {
        device(for: .back) != nil || device(for: .front) != nil
    }

    /// Sets the session up the first time (on `side`, or the other camera if there's only that
    /// one) and starts it. `completion` is called on the session queue.
    func start(_ side: CameraSide, completion: @escaping @Sendable (CameraStartOutcome) -> Void) {
        queue.async {
            completion(self.startOnQueue(side))
        }
    }

    func stop() {
        queue.async {
            if self.session.isRunning {
                self.session.stopRunning()
            }
        }
    }

    /// After a runtime error (the media services restarting), the session needs starting again.
    func restart() {
        queue.async {
            if self.isConfigured, !self.session.isRunning {
                self.session.startRunning()
            }
        }
    }

    /// Swaps between the back and front cameras. `completion` gets the camera now in use (or nil
    /// if nothing changed), on the session queue.
    func switchCamera(completion: @escaping @Sendable (CameraCapabilities?) -> Void) {
        queue.async {
            completion(self.switchOnQueue())
        }
    }

    /// Takes a photo, upright for the portrait-only app and never mirrored (the caller mirrors
    /// selfies when the setting says so). `completion` gets the photo's file data, or nil.
    func capture(flash: Bool, completion: @escaping @Sendable (Data?) -> Void) {
        queue.async {
            guard
                self.session.isRunning,
                let connection = self.photoOutput.connection(with: .video),
                connection.isEnabled,
                connection.isActive
            else {
                completion(nil)
                return
            }
            if connection.isVideoRotationAngleSupported(90) {
                connection.videoRotationAngle = 90
            }
            if connection.isVideoMirroringSupported {
                connection.automaticallyAdjustsVideoMirroring = false
                connection.isVideoMirrored = false
            }

            let settings = AVCapturePhotoSettings()
            let mode: AVCaptureDevice.FlashMode = flash ? .on : .off
            if self.photoOutput.supportedFlashModes.contains(mode) {
                settings.flashMode = mode
            }

            let id = settings.uniqueID
            let processor = PhotoCaptureProcessor { data in
                completion(data)
                self.queue.async {
                    self.captures[id] = nil
                }
            }
            self.captures[id] = processor
            self.photoOutput.capturePhoto(with: settings, delegate: processor)
        }
    }

    // MARK: - On the queue

    private func startOnQueue(_ side: CameraSide) -> CameraStartOutcome {
        if !isConfigured {
            guard let device = Self.device(for: side) ?? Self.device(for: side.other) else { return .noCamera }
            guard configure(with: device) else { return .failed }
        }
        if !session.isRunning {
            session.startRunning()
        }
        guard let input, session.isRunning || session.isInterrupted else { return .failed }
        return .running(capabilities(of: input.device), interrupted: session.isInterrupted)
    }

    private func configure(with device: AVCaptureDevice) -> Bool {
        session.beginConfiguration()
        defer { session.commitConfiguration() }

        if session.canSetSessionPreset(.photo) {
            session.sessionPreset = .photo
        }
        guard let newInput = try? AVCaptureDeviceInput(device: device), session.canAddInput(newInput) else {
            return false
        }
        session.addInput(newInput)
        guard session.canAddOutput(photoOutput) else {
            session.removeInput(newInput)
            return false
        }
        session.addOutput(photoOutput)
        input = newInput
        isConfigured = true
        return true
    }

    private func switchOnQueue() -> CameraCapabilities? {
        guard let current = input else { return nil }
        let target: CameraSide = current.device.position == .front ? .back : .front
        guard let device = Self.device(for: target), let next = try? AVCaptureDeviceInput(device: device) else {
            return nil
        }

        session.beginConfiguration()
        session.removeInput(current)
        if session.canAddInput(next) {
            session.addInput(next)
            input = next
        } else if session.canAddInput(current) {
            session.addInput(current)
        }
        session.commitConfiguration()

        guard let now = input else { return nil }
        return capabilities(of: now.device)
    }

    private func capabilities(of device: AVCaptureDevice) -> CameraCapabilities {
        CameraCapabilities(
            side: device.position == .front ? .front : .back,
            hasFlash: photoOutput.supportedFlashModes.contains(.on),
            canSwitch: Self.device(for: .back) != nil && Self.device(for: .front) != nil
        )
    }
}

/// Receives one photo, then reports its file data (JPEG or HEIC) once the capture is over.
private final class PhotoCaptureProcessor: NSObject, AVCapturePhotoCaptureDelegate, @unchecked Sendable {
    private let completion: @Sendable (Data?) -> Void
    private var data: Data?

    init(completion: @escaping @Sendable (Data?) -> Void) {
        self.completion = completion
    }

    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        if error == nil {
            data = photo.fileDataRepresentation()
        }
    }

    func photoOutput(
        _ output: AVCapturePhotoOutput,
        didFinishCaptureFor resolvedSettings: AVCaptureResolvedPhotoSettings,
        error: Error?
    ) {
        completion(data)
    }
}

/// Image work for the camera, off the main thread.
enum CameraImage {
    /// The middle square of a photo, the part the square viewfinder shows; flipped like a mirror
    /// when `mirrored` (selfies, as previewed).
    static func square(from data: Data, mirrored: Bool) -> UIImage? {
        guard let photo = UIImage(data: data) else { return nil }
        // `size` already has the orientation applied.
        let width = photo.size.width * photo.scale
        let height = photo.size.height * photo.scale
        let side = min(width, height).rounded(.down)
        guard side > 0 else { return nil }

        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        return UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format).image { context in
            if mirrored {
                context.cgContext.translateBy(x: side, y: 0)
                context.cgContext.scaleBy(x: -1, y: 1)
            }
            photo.draw(in: CGRect(x: (side - width) / 2, y: (side - height) / 2, width: width, height: height))
        }
    }

    /// A smaller, upright copy for showing on screen, so a 48-megapixel photo from the library
    /// doesn't fill the memory. The full photo is what's uploaded.
    static func displayCopy(of image: UIImage, maxDimension: CGFloat = 1600) -> UIImage {
        let width = image.size.width * image.scale
        let height = image.size.height * image.scale
        guard width > 0, height > 0 else { return image }

        let factor = min(1, maxDimension / max(width, height))
        let target = CGSize(width: max(1, (width * factor).rounded()), height: max(1, (height * factor).rounded()))
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        return UIGraphicsImageRenderer(size: target, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: target))
        }
    }
}
