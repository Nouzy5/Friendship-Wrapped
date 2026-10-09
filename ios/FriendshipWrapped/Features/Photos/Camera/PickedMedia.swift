import AVFoundation
import Photos
import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// A video chosen in the photo picker, copied out of it into a temporary file.
struct PickedMovie: Transferable {
    let url: URL

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(contentType: .movie) { movie in
            SentTransferredFile(movie.url)
        } importing: { received in
            // The picker's file is deleted when this closure returns, so keep a copy.
            let ext = received.file.pathExtension.isEmpty ? "mov" : received.file.pathExtension
            let copy = FileManager.default.temporaryDirectory
                .appendingPathComponent("picked-\(UUID().uuidString)")
                .appendingPathExtension(ext)
            try FileManager.default.copyItem(at: received.file, to: copy)
            return PickedMovie(url: copy)
        }
    }
}

/// A video ready to post: small, upright, and no longer than the server allows.
enum VideoPreparation {
    enum Failure: Error {
        /// Longer than a minute.
        case tooLong
        /// Not something the phone can read as a video.
        case unreadable
    }

    struct Prepared {
        /// An H.264 MP4 in a temporary file.
        let file: URL
        let durationMs: Int
        /// A frame from the video (a Live Photo posts its own still instead).
        let poster: UIImage
    }

    /// The most a video can last, in seconds. Matches the server.
    static let maxSeconds: Double = 60

    /// Converts a video from the library or a Live Photo's motion to a 720p H.264 MP4. The camera's HEVC
    /// and 4K recordings can be hundreds of megabytes, far over the server's 100 MB limit (and it
    /// converts them again anyway), so this is done on the phone first.
    static func prepare(_ source: URL) async throws -> Prepared {
        let asset = AVURLAsset(url: source)
        let duration: Double
        do {
            duration = try await asset.load(.duration).seconds
        } catch {
            throw Failure.unreadable
        }
        guard duration.isFinite, duration > 0 else { throw Failure.unreadable }
        guard duration <= maxSeconds + 0.5 else { throw Failure.tooLong }

        let output = FileManager.default.temporaryDirectory
            .appendingPathComponent("video-\(UUID().uuidString)")
            .appendingPathExtension("mp4")
        do {
            try await export(asset, to: output)
            let poster = try await posterFrame(of: AVURLAsset(url: output), at: min(1, duration / 2))
            return Prepared(file: output, durationMs: Int((duration * 1000).rounded()), poster: poster)
        } catch {
            try? FileManager.default.removeItem(at: output)
            throw Failure.unreadable
        }
    }

    private static func export(_ asset: AVAsset, to url: URL) async throws {
        guard let session = AVAssetExportSession(asset: asset, presetName: AVAssetExportPreset1280x720) else {
            throw Failure.unreadable
        }
        session.shouldOptimizeForNetworkUse = true
        if #available(iOS 18.0, *) {
            try await session.export(to: url, as: .mp4)
        } else {
            session.outputURL = url
            session.outputFileType = .mp4
            await session.export()
            guard session.status == .completed else { throw session.error ?? Failure.unreadable }
        }
    }

    private static func posterFrame(of asset: AVAsset, at seconds: Double) async throws -> UIImage {
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 1280, height: 1280)
        let frame = try await generator.image(at: CMTime(seconds: seconds, preferredTimescale: 600))
        return UIImage(cgImage: frame.image)
    }
}

/// The motion of a Live Photo picked from the library.
enum LivePhotoMotion {
    /// The Live Photo's video as a temporary file, or nil if the library can't be read (access not
    /// given) or the item isn't a Live Photo. The still picture is then posted on its own.
    static func file(forAssetIdentifier identifier: String) async -> URL? {
        var status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        if status == .notDetermined {
            status = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
        }
        guard status == .authorized || status == .limited else { return nil }

        guard
            let asset = PHAsset.fetchAssets(withLocalIdentifiers: [identifier], options: nil).firstObject,
            asset.mediaSubtypes.contains(.photoLive),
            let resource = PHAssetResource.assetResources(for: asset).first(where: { $0.type == .pairedVideo })
        else { return nil }

        let destination = FileManager.default.temporaryDirectory
            .appendingPathComponent("live-\(UUID().uuidString)")
            .appendingPathExtension("mov")
        let options = PHAssetResourceRequestOptions()
        options.isNetworkAccessAllowed = true
        do {
            try await PHAssetResourceManager.default().writeData(for: resource, toFile: destination, options: options)
            return destination
        } catch {
            try? FileManager.default.removeItem(at: destination)
            return nil
        }
    }
}
