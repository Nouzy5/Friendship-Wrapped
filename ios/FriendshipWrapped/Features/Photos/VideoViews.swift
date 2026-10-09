import AVFoundation
import AVKit
import Combine
import Observation
import SwiftUI

// MARK: - Showing a player

/// An `AVPlayer`'s picture without the system controls.
struct PlayerLayerView: UIViewRepresentable {
    let player: AVPlayer
    var gravity: AVLayerVideoGravity = .resizeAspect

    func makeUIView(context: Context) -> PlayerLayerUIView {
        let view = PlayerLayerUIView()
        view.playerLayer.player = player
        view.playerLayer.videoGravity = gravity
        return view
    }

    func updateUIView(_ view: PlayerLayerUIView, context: Context) {
        if view.playerLayer.player !== player {
            view.playerLayer.player = player
        }
        view.playerLayer.videoGravity = gravity
    }
}

final class PlayerLayerUIView: UIView {
    override class var layerClass: AnyClass {
        AVPlayerLayer.self
    }

    // `layerClass` makes this always an AVPlayerLayer.
    var playerLayer: AVPlayerLayer {
        layer as! AVPlayerLayer
    }
}

// MARK: - A clip that repeats

/// A muted clip that plays over and over: the preview of a video about to be posted.
struct LoopingVideoView: View {
    let url: URL
    var gravity: AVLayerVideoGravity = .resizeAspect

    /// Made when the view appears (not on every redraw of the screen around it).
    @State private var looping: LoopingPlayer?

    var body: some View {
        ZStack {
            if let looping {
                PlayerLayerView(player: looping.player, gravity: gravity)
            }
        }
        .onAppear {
            if looping == nil {
                looping = LoopingPlayer(item: AVPlayerItem(url: url))
            }
            looping?.player.play()
        }
        .onDisappear { looping?.player.pause() }
    }
}

final class LoopingPlayer {
    let player: AVQueuePlayer
    /// Keeps the looping going; it stops when this is released.
    private let looper: AVPlayerLooper

    init(item: AVPlayerItem) {
        let queue = AVQueuePlayer()
        queue.isMuted = true
        player = queue
        looper = AVPlayerLooper(player: queue, templateItem: item)
    }
}

// MARK: - Playing a video post

/// Loads a video post for playing, from the API with the session cookie. If the player can't stream it
/// that way (it's the first thing to check on a real phone: `AVPlayer` sends no cookies of its own),
/// the video is downloaded in full and played from there.
@MainActor
@Observable
final class VideoPlayback {
    enum Phase {
        case idle, loading, ready, failed
    }

    private(set) var phase: Phase = .idle
    private(set) var player: AVPlayer?

    @ObservationIgnored private var task: Task<Void, Never>?
    @ObservationIgnored private var endObserver: NSObjectProtocol?
    @ObservationIgnored private var downloaded: URL?
    @ObservationIgnored private var usesAudioSession = false

    /// Starts loading. A Live Photo's motion (`loops`) is muted and repeats; anything else plays with sound.
    func start(_ video: Photo.Video, loops: Bool, playNow: Bool) {
        guard phase == .idle || phase == .failed else { return }
        phase = .loading
        task = Task { await self.load(video, loops: loops, playNow: playNow) }
    }

    /// Pauses and lets go of the video (the screen is closing, or moving to another post).
    func stop() {
        task?.cancel()
        task = nil
        player?.pause()
        player = nil
        if let endObserver {
            NotificationCenter.default.removeObserver(endObserver)
            self.endObserver = nil
        }
        if let downloaded {
            try? FileManager.default.removeItem(at: downloaded)
            self.downloaded = nil
        }
        if usesAudioSession {
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            usesAudioSession = false
        }
        phase = .idle
    }

    func togglePlayback() {
        guard let player else { return }
        if player.timeControlStatus == .paused {
            player.play()
        } else {
            player.pause()
        }
    }

    private func load(_ video: Photo.Video, loops: Bool, playNow: Bool) async {
        do {
            let source = try APIClient.shared.mediaSource(atServerPath: video.url)
            let asset = AVURLAsset(url: source.url, options: ["AVURLAssetHTTPHeaderFieldsKey": source.headers])
            let streamed = AVPlayer(playerItem: AVPlayerItem(asset: asset))
            if await isReady(streamed) {
                guard !Task.isCancelled else { return }
                present(streamed, loops: loops, playNow: playNow)
                return
            }
            guard !Task.isCancelled else { return }

            // Streaming didn't work: play a copy from disk instead.
            let file = try await APIClient.shared.downloadFile(atServerPath: video.url, named: "play-\(UUID().uuidString).mp4")
            guard !Task.isCancelled else {
                try? FileManager.default.removeItem(at: file)
                return
            }
            if let old = downloaded { try? FileManager.default.removeItem(at: old) }
            downloaded = file
            let local = AVPlayer(url: file)
            if await isReady(local) {
                guard !Task.isCancelled else { return }
                present(local, loops: loops, playNow: playNow)
            } else if !Task.isCancelled {
                phase = .failed
            }
        } catch is CancellationError {
            // Closed or stepped past.
        } catch {
            if !Task.isCancelled { phase = .failed }
        }
    }

    /// Whether the player's video becomes ready to play (not within 20 seconds counts as no).
    private func isReady(_ player: AVPlayer) async -> Bool {
        guard let item = player.currentItem else { return false }
        return await withTaskGroup(of: Bool.self) { group in
            group.addTask {
                for await status in item.publisher(for: \.status).values {
                    if status == .readyToPlay { return true }
                    if status == .failed { return false }
                }
                return false
            }
            group.addTask {
                try? await Task.sleep(for: .seconds(20))
                return false
            }
            let first = await group.next() ?? false
            group.cancelAll()
            return first
        }
    }

    private func present(_ ready: AVPlayer, loops: Bool, playNow: Bool) {
        player = ready
        if loops {
            ready.isMuted = true
            ready.actionAtItemEnd = .none
            endObserver = NotificationCenter.default.addObserver(
                forName: .AVPlayerItemDidPlayToEndTime,
                object: ready.currentItem,
                queue: .main
            ) { [weak ready] _ in
                ready?.seek(to: .zero)
                ready?.play()
            }
        } else {
            // Sound even with the ring/silent switch on, as in the Photos app.
            let session = AVAudioSession.sharedInstance()
            try? session.setCategory(.playback, mode: .moviePlayback)
            try? session.setActive(true)
            usesAudioSession = true
        }
        phase = .ready
        if playNow { ready.play() }
    }
}

/// A video post in the viewer: its poster frame, then the video with the system's controls. A
/// Live Photo's motion plays by itself, muted and looping (tap to pause); with Data saver on, or
/// motion reduced for a Live Photo, nothing loads until you tap play.
struct PhotoVideoPlayer: View {
    let photo: Photo
    let video: Photo.Video

    @Environment(DeviceSettings.self) private var settings
    @Environment(\.fwReduceMotion) private var reduceMotion
    @State private var playback = VideoPlayback()

    /// Waits for a tap before loading anything.
    private var waitsForTap: Bool {
        settings.values.dataSaver || (video.isLive && reduceMotion)
    }

    var body: some View {
        ZStack {
            PhotoImage(photo: photo, variant: .medium, contentMode: .fit)

            switch playback.phase {
            case .ready:
                if let player = playback.player {
                    if video.isLive {
                        PlayerLayerView(player: player)
                            .contentShape(Rectangle())
                            .onTapGesture { playback.togglePlayback() }
                            .accessibilityAddTraits(.isButton)
                            .accessibilityLabel("\(photo.altText). Live Photo. Double-tap to pause or play.")
                    } else {
                        VideoPlayer(player: player)
                    }
                }
            case .loading:
                ProgressView()
                    .controlSize(.large)
                    .tint(Color.white)
            case .failed:
                VStack(spacing: 12) {
                    Text("Couldn't play this video")
                        .font(.subheadline)
                        .foregroundStyle(Color.white)
                    Button("Try again") { begin(playNow: true) }
                        .buttonStyle(.fwCompact(.secondary))
                }
                .padding(16)
                .background(Color.black.opacity(0.55), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            case .idle:
                if waitsForTap {
                    Button {
                        begin(playNow: true)
                    } label: {
                        Image(systemName: "play.fill")
                            .font(.system(size: 26, weight: .semibold))
                            .foregroundStyle(Color.white)
                            .frame(width: 64, height: 64)
                            .background(Color.black.opacity(0.55), in: Circle())
                    }
                    .buttonStyle(PressScaleButtonStyle())
                    .accessibilityLabel("Play video")
                }
            }
        }
        .onAppear {
            if !waitsForTap { begin(playNow: video.isLive) }
        }
        .onDisappear { playback.stop() }
    }

    private func begin(playNow: Bool) {
        playback.start(video, loops: video.isLive, playNow: playNow)
    }
}

// MARK: - Marking a video

/// Over a video's poster picture: a play symbol and its length, or "LIVE" for a Live Photo's motion.
struct VideoBadge: View {
    let durationMs: Int
    let isLive: Bool

    init(video: Photo.Video) {
        durationMs = video.durationMs
        isLive = video.isLive
    }

    init(durationMs: Int, isLive: Bool) {
        self.durationMs = durationMs
        self.isLive = isLive
    }

    var body: some View {
        HStack(spacing: 4) {
            if isLive {
                Text("LIVE")
            } else {
                Image(systemName: "play.fill")
                    .font(.system(size: 9, weight: .bold))
                Text(Format.duration(milliseconds: durationMs))
                    .monospacedDigit()
            }
        }
        .font(.system(size: 11, weight: .semibold, design: .rounded))
        .foregroundStyle(Color.white)
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(Color.black.opacity(0.6), in: Capsule())
        .accessibilityHidden(true)
    }
}
