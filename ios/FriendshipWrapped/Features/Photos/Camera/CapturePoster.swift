import Foundation
import Observation
import Photos
import UIKit

/// Posts the photo (or video) from the camera screen (the web app's PhotoComposer): scales a photo for
/// Settings → Photos & data → Photo quality, waits for a connection (and for Wi-Fi, when uploading on
/// mobile data is off), then uploads it with progress.
@MainActor
@Observable
final class CapturePoster {
    enum Phase: Equatable {
        case idle
        /// Scaling the photo down and encoding it as JPEG.
        case preparing
        case waitingForConnection
        case waitingForWifi
        /// The fraction sent so far, once known.
        case uploading(Double?)
    }

    /// What is being posted.
    enum Payload {
        case photo(UIImage)
        /// An MP4 on disk and, for a Live Photo, its still picture.
        case video(file: URL, still: UIImage?, isLive: Bool)
    }

    private(set) var phase: Phase = .idle
    private(set) var failure: APIError?

    @ObservationIgnored private var task: Task<Void, Never>?
    /// Bumped by every post and cancel, so an older post that's still finishing changes nothing.
    @ObservationIgnored private var attempts = 0
    /// "Post now" while waiting for Wi-Fi.
    @ObservationIgnored private var postAnyway = false

    var isBusy: Bool {
        phase != .idle
    }

    var isUploading: Bool {
        if case .uploading = phase { return true }
        return false
    }

    var uploadFraction: Double? {
        if case .uploading(let fraction) = phase { return fraction }
        return nil
    }

    /// Posts, then calls `onPosted` (unless cancelled first). Errors end up in `failure`.
    func post(
        _ payload: Payload,
        caption: String,
        to groupID: String,
        momentID: String? = nil,
        photos: PhotosStore,
        network: NetworkMonitor,
        settings: DeviceSettings,
        onPosted: @escaping @MainActor (Photo) -> Void
    ) {
        guard !isBusy else { return }
        attempts += 1
        let attempt = attempts
        failure = nil
        postAnyway = false
        phase = .preparing
        task = Task {
            await self.perform(
                attempt,
                payload: payload,
                caption: caption,
                groupID: groupID,
                momentID: momentID,
                photos: photos,
                network: network,
                settings: settings,
                onPosted: onPosted
            )
        }
    }

    /// Stops waiting for Wi-Fi and posts on mobile data.
    func postNow() {
        postAnyway = true
    }

    /// Stops a post that hasn't gone up yet (Retake, or closing the camera).
    func cancel() {
        attempts += 1
        task?.cancel()
        task = nil
        phase = .idle
    }

    func clearFailure() {
        failure = nil
    }

    private func perform(
        _ attempt: Int,
        payload: Payload,
        caption: String,
        groupID: String,
        momentID: String?,
        photos: PhotosStore,
        network: NetworkMonitor,
        settings: DeviceSettings,
        onPosted: @MainActor (Photo) -> Void
    ) async {
        // The server takes JPEG (not the camera's HEIC) and keeps 2560 px at most. A video goes up as the
        // MP4 that was made when it was chosen; a Live Photo's still goes with it.
        let image: UIImage?
        switch payload {
        case .photo(let photo): image = photo
        case .video(_, let still, _): image = still
        }
        let quality = settings.values.photoQuality
        let maxDimension = quality.maxDimension
        let jpegQuality: CGFloat = quality == .high ? 0.9 : 0.85
        let jpeg: Data?
        if let image {
            jpeg = await Task.detached(priority: .userInitiated) {
                image.jpegForUpload(maxDimension: maxDimension, quality: jpegQuality)
            }.value
        } else {
            jpeg = nil
        }
        guard isCurrent(attempt) else { return }
        if image != nil, jpeg == nil {
            fail(APIError(status: -1, code: "ENCODE_FAILED", message: "Couldn't prepare that photo. Try another one."))
            return
        }

        // Offline: wait for the connection. On mobile data with uploading on it turned off: wait
        // for Wi-Fi, or until "Post now". Either way it carries on by itself.
        while !Task.isCancelled {
            if !network.isOnline {
                phase = .waitingForConnection
                await network.waitUntilOnline()
            } else if !settings.values.uploadOnMobileData, network.isOnCellular, !postAnyway {
                phase = .waitingForWifi
                try? await Task.sleep(for: .milliseconds(300))
            } else {
                break
            }
            guard isCurrent(attempt) else { return }
        }
        guard isCurrent(attempt) else { return }

        phase = .uploading(nil)
        do {
            let report: @Sendable (Double) -> Void = { fraction in
                Task { @MainActor in
                    self.progressed(fraction, attempt: attempt)
                }
            }
            let photo: Photo
            switch payload {
            case .photo:
                guard let jpeg else { return }
                photo = try await photos.upload(jpeg, caption: caption, to: groupID, momentID: momentID, progress: report)
            case .video(let file, _, let isLive):
                photo = try await photos.uploadVideo(
                    file,
                    still: jpeg,
                    isLive: isLive,
                    caption: caption,
                    to: groupID,
                    momentID: momentID,
                    progress: report
                )
            }
            guard isCurrent(attempt) else { return }
            task = nil
            // Stays "Posting…" while the screen closes.
            onPosted(photo)
        } catch is CancellationError {
            // Normally `cancel()` has already reset everything.
            if attempt == attempts {
                phase = .idle
                task = nil
            }
        } catch {
            guard isCurrent(attempt) else { return }
            fail(error.asAPIError)
        }
    }

    private func isCurrent(_ attempt: Int) -> Bool {
        attempt == attempts && !Task.isCancelled
    }

    private func fail(_ error: APIError) {
        failure = error
        phase = .idle
        task = nil
    }

    private func progressed(_ fraction: Double, attempt: Int) {
        guard attempt == attempts, case .uploading = phase else { return }
        phase = .uploading(fraction)
    }
}

/// Settings → Photos & data → Save to this device: a copy of each photo you take and post goes
/// into your photo library (asking for add-only access the first time).
enum PostedPhotoSaver {
    @MainActor
    static func saveCopy(of image: UIImage) {
        Task.detached(priority: .utility) {
            let access = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
            guard access == .authorized || access == .limited else {
                await PostedPhotoSaver.report("Couldn't save a copy to your photos. Allow adding photos in Settings.")
                return
            }
            guard let data = image.jpegData(compressionQuality: 0.92) else {
                await PostedPhotoSaver.report("Couldn't save a copy to your photos.")
                return
            }
            do {
                try await PHPhotoLibrary.shared().performChanges {
                    PHAssetCreationRequest.forAsset().addResource(with: .photo, data: data, options: nil)
                }
            } catch {
                await PostedPhotoSaver.report("Couldn't save a copy to your photos.")
            }
        }
    }

    /// A copy of a video you posted. `file` is the MP4 that was sent.
    @MainActor
    static func saveCopy(ofVideoAt file: URL) {
        // The file is deleted once the post has gone, so the library gets its own copy now.
        let copy = FileManager.default.temporaryDirectory
            .appendingPathComponent("save-\(UUID().uuidString)")
            .appendingPathExtension("mp4")
        guard (try? FileManager.default.copyItem(at: file, to: copy)) != nil else { return }

        Task.detached(priority: .utility) {
            defer { try? FileManager.default.removeItem(at: copy) }
            let access = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
            guard access == .authorized || access == .limited else {
                await PostedPhotoSaver.report("Couldn't save a copy to your photos. Allow adding photos in Settings.")
                return
            }
            do {
                try await PHPhotoLibrary.shared().performChanges {
                    _ = PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: copy)
                }
            } catch {
                await PostedPhotoSaver.report("Couldn't save a copy to your photos.")
            }
        }
    }

    @MainActor
    private static func report(_ message: String) {
        ToastCenter.shared.show(message, isError: true)
    }
}
