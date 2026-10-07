import SwiftUI
import UIKit

/// Loads a group's Wrapped for a year and plays it full screen.
struct WrappedStoryView: View {
    let groupID: String
    let year: Int

    @Environment(\.dismiss) private var dismiss

    @State private var wrapped: Wrapped?
    @State private var failure: APIError?

    var body: some View {
        ZStack {
            Color.ink950.ignoresSafeArea()

            if let wrapped {
                StoryPlayer(wrapped: wrapped) { dismiss() }
            } else {
                Group {
                    if let failure {
                        failureView(failure)
                    } else {
                        ProgressView()
                            .controlSize(.large)
                            .tint(.white)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .overlay(alignment: .topTrailing) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark")
                            .font(.title3.weight(.semibold))
                            .foregroundStyle(.white)
                            .frame(width: 44, height: 44)
                    }
                    .accessibilityLabel("Close")
                    .padding(.horizontal, 8)
                }
            }
        }
        .environment(\.colorScheme, .dark)
        .statusBarHidden()
        .task { await load() }
    }

    @ViewBuilder
    private func failureView(_ failure: APIError) -> some View {
        // Not a member, or no photos that year.
        if failure.status == 404 || failure.status == 400 {
            EmptyStateView(
                emoji: "🎁",
                title: "No Wrapped for \(year)",
                message: "A group's Wrapped for a year starts with its first photo that year. You'll only see your own groups'."
            ) {
                Button("See all Wrapped") { dismiss() }
                    .buttonStyle(.brand)
                    .frame(maxWidth: 240)
            }
        } else {
            EmptyStateView(emoji: "📡", title: "Couldn't load this Wrapped", message: "Check your connection and try again.") {
                Button("Try again") { Task { await load() } }
                    .buttonStyle(.borderedProminent)
            }
        }
    }

    private func load() async {
        failure = nil
        do {
            let loaded = try await APIClient.shared.fetchWrapped(groupID, year: year)
            if loaded.slides.isEmpty {
                failure = APIError(status: 404, code: "NOT_FOUND", message: "There's no Wrapped for \(year)")
            } else {
                wrapped = loaded
            }
        } catch is CancellationError {
            return
        } catch {
            failure = error.asAPIError
        }
    }
}

extension WrappedSlide {
    /// How long the slide stays up before the next: long enough to read it as it animates in.
    var duration: TimeInterval {
        switch self {
        case .intro: return 4.5
        case .photos: return 5.5
        case .topPhotographer: return 7
        case .busiestMonth: return 7.5
        case .mostReactedPhoto: return 7
        case .reactions: return 7
        case .collage: return 8
        case .outro, .unknown: return 6
        }
    }

    /// Images the slide shows, so they can load before it comes up.
    var imagePaths: [String] {
        switch self {
        case .topPhotographer(let top, let runnersUp):
            return ([top] + runnersUp).compactMap { $0.user.avatarUrl }
        case .mostReactedPhoto(let photo, _):
            return [photo.imageUrls.medium]
        case .reactions(_, _, let topReactor):
            return topReactor?.user.avatarUrl.map { [$0] } ?? []
        case .collage(let photos):
            return photos.map { $0.imageUrls.thumbnail }
        default:
            return []
        }
    }
}

/// How long the current slide has played, across pauses.
private struct SlideClock: Equatable {
    var played: TimeInterval = 0
    /// When it last started or resumed; nil while paused.
    var resumedAt: Date?

    func elapsed(at now: Date) -> TimeInterval {
        played + (resumedAt.map { now.timeIntervalSince($0) } ?? 0)
    }

    mutating func pause(at now: Date) {
        played = elapsed(at: now)
        resumedAt = nil
    }

    mutating func resume(at now: Date) {
        if resumedAt == nil { resumedAt = now }
    }
}

/// Which slide is showing, which way the story moved to get there, and a count of moves,
/// so a slide replays its entrance whenever it's entered (again).
private struct StoryPosition: Equatable {
    var index = 0
    var forward = true
    var visit = 0
}

private struct PlaybackKey: Equatable {
    let visit: Int
    let paused: Bool
}

/// One finger on the story, from touch-down to lift.
private struct Press {
    var active = false
    /// Set once the press has paused the story, so lifting the finger doesn't also count as a tap.
    var held = false
    var holdTimer: Task<Void, Never>?
}

/// The Wrapped as a full-screen story. Slides play on their own; tap the right of the screen
/// (or swipe left) for the next, the left third (or swipe right) for the previous. Press and
/// hold to pause; swipe down to close.
private struct StoryPlayer: View {
    let wrapped: Wrapped
    let onClose: () -> Void

    /// Pressing this long pauses the story instead of tapping.
    private static let holdDelay = Duration.milliseconds(250)
    /// A tap may wobble this much.
    private static let tapSlop: CGFloat = 12
    /// How far a swipe must travel, and how much more along its direction than across.
    private static let swipeDistance: CGFloat = 50
    private static let swipeRatio: CGFloat = 1.5

    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var position = StoryPosition()
    @State private var clock = SlideClock()
    @State private var userPaused = false
    @State private var holding = false
    @State private var press = Press()
    @GestureState private var touching = false

    private var slides: [WrappedSlide] { wrapped.slides }
    private var index: Int { min(position.index, slides.count - 1) }
    private var slide: WrappedSlide { slides[index] }
    private var isLast: Bool { index == slides.count - 1 }
    private var paused: Bool { userPaused || holding || scenePhase != .active }
    private var pauseLabel: String { userPaused ? "Play" : "Pause" }

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                StorySlideView(slide: slide, wrapped: wrapped)
                    .id(position.visit)
                    .transition(slideTransition)
                    .allowsHitTesting(false)

                Color.clear
                    .contentShape(Rectangle())
                    .gesture(storyGesture(width: geometry.size.width))
                    .accessibilityElement()
                    .accessibilityLabel("Slide \(index + 1) of \(slides.count)")
                    .accessibilityHint("Swipe up or down to change slides.")
                    .accessibilityAdjustableAction { direction in
                        switch direction {
                        case .increment: next()
                        case .decrement: previous()
                        @unknown default: break
                        }
                    }

                VStack(spacing: 0) {
                    topBar
                    Spacer(minLength: 0)
                    if case .outro = slide {
                        OutroActions(onRestart: restart, onClose: onClose)
                            .id(position.visit)
                    }
                }
            }
        }
        .background(Color.black)
        .onAppear {
            // VoiceOver users start paused, so the story doesn't move on while it's being read.
            if UIAccessibility.isVoiceOverRunning { userPaused = true }
            clock = SlideClock(resumedAt: paused ? nil : .now)
        }
        .task { prefetchImages() }
        .task(id: PlaybackKey(visit: position.visit, paused: paused)) { await playCurrentSlide() }
        .onChange(of: paused) { _, isPaused in
            if isPaused {
                clock.pause(at: .now)
            } else {
                clock.resume(at: .now)
            }
        }
        .onChange(of: touching) { _, isTouching in
            // Also catches a touch the system cancelled, which never reaches onEnded.
            if !isTouching { endPress() }
        }
        .accessibilityAction(.escape) { onClose() }
    }

    private var topBar: some View {
        VStack(alignment: .leading, spacing: 8) {
            StoryProgress(count: slides.count, index: index, clock: clock, duration: slide.duration, paused: paused)
                .allowsHitTesting(false)
            HStack(spacing: 8) {
                HStack(spacing: 8) {
                    Text(wrapped.group.emoji)
                        .font(.title3)
                        .accessibilityHidden(true)
                    Text(verbatim: "\(wrapped.group.name) · \(wrapped.year)")
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .allowsHitTesting(false)

                Button { userPaused.toggle() } label: {
                    Image(systemName: userPaused ? "play.fill" : "pause.fill")
                        .font(.body.weight(.semibold))
                        .frame(width: 40, height: 40)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel(pauseLabel)

                Button(action: onClose) {
                    Image(systemName: "xmark")
                        .font(.title3.weight(.semibold))
                        .frame(width: 40, height: 40)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("Close")
            }
            .foregroundStyle(.white)
            .shadow(color: .black.opacity(0.4), radius: 4, y: 1)
        }
        .padding(.horizontal, 12)
        .padding(.top, 8)
        .padding(.bottom, 32)
        .background {
            LinearGradient(colors: [.black.opacity(0.4), .clear], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea(edges: .top)
                .allowsHitTesting(false)
        }
    }

    /// Slides in from the side it's coming from; the old one fades out quickly.
    private var slideTransition: AnyTransition {
        let insertion = AnyTransition.opacity
            .combined(with: .offset(x: position.forward ? 40 : -40))
            .combined(with: .scale(scale: 0.98))
        return .asymmetric(insertion: insertion, removal: .opacity.animation(.easeOut(duration: 0.15)))
    }

    // MARK: - Playback

    /// Moves on when the slide's time is up. Restarted on every move, pause and resume.
    private func playCurrentSlide() async {
        guard !paused else { return }
        let remaining = slide.duration - clock.elapsed(at: .now)
        try? await Task.sleep(for: .seconds(max(0, remaining)))
        guard !Task.isCancelled, !isLast else { return }
        next()
    }

    private func goTo(_ target: Int) {
        guard slides.indices.contains(target) else { return }
        let destination = StoryPosition(index: target, forward: target >= index, visit: position.visit + 1)
        if reduceMotion {
            position = destination
        } else {
            withAnimation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.45)) {
                position = destination
            }
        }
        clock = SlideClock(resumedAt: paused ? nil : .now)
    }

    private func next() {
        goTo(index + 1)
    }

    private func previous() {
        goTo(index - 1)
    }

    private func restart() {
        userPaused = false
        goTo(0)
    }

    private func prefetchImages() {
        for path in slides.flatMap({ $0.imagePaths }) {
            ImageLoader.prefetch(path)
        }
    }

    // MARK: - Gestures

    /// Touch-down to lift as one gesture, so a tap, a swipe and a hold can be told apart
    /// the way the web story does it.
    private func storyGesture(width: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 0)
            .updating($touching) { _, state, _ in state = true }
            .onChanged { value in
                if !press.active {
                    startPress()
                } else if !press.held, hypot(value.translation.width, value.translation.height) > Self.tapSlop {
                    // Moving means a swipe is starting, not a hold.
                    press.holdTimer?.cancel()
                }
            }
            .onEnded { value in
                let held = press.held
                endPress()
                release(translation: value.translation, at: value.location, width: width, afterHold: held)
            }
    }

    private func startPress() {
        press.holdTimer?.cancel()
        press = Press(active: true)
        press.holdTimer = Task {
            try? await Task.sleep(for: Self.holdDelay)
            guard !Task.isCancelled else { return }
            press.held = true
            holding = true
        }
    }

    /// Lifted or cancelled: resumes if the press was holding. `held` stays set until the next
    /// press, for `onEnded` to read.
    private func endPress() {
        press.holdTimer?.cancel()
        press.holdTimer = nil
        press.active = false
        holding = false
    }

    private func release(translation: CGSize, at location: CGPoint, width: CGFloat, afterHold: Bool) {
        let dx = translation.width
        let dy = translation.height
        if abs(dx) >= Self.swipeDistance, abs(dx) >= abs(dy) * Self.swipeRatio {
            if dx < 0 { next() } else { previous() }
        } else if dy >= Self.swipeDistance * 2, dy >= abs(dx) * Self.swipeRatio {
            onClose()
        } else if !afterHold, abs(dx) <= Self.tapSlop, abs(dy) <= Self.tapSlop {
            if location.x < width / 3 { previous() } else { next() }
        }
    }
}

/// One bar per slide: the ones seen are full, the current one fills while it plays.
private struct StoryProgress: View {
    let count: Int
    let index: Int
    let clock: SlideClock
    let duration: TimeInterval
    let paused: Bool

    var body: some View {
        TimelineView(.animation(paused: paused)) { context in
            let progress = min(1, max(0, clock.elapsed(at: context.date) / duration))
            HStack(spacing: 4) {
                ForEach(0..<count, id: \.self) { bar in
                    Capsule()
                        .fill(.white.opacity(0.35))
                        .overlay(alignment: .leading) {
                            GeometryReader { geometry in
                                Capsule()
                                    .fill(.white)
                                    .frame(width: geometry.size.width * fill(of: bar, progress: progress))
                            }
                        }
                        .clipShape(Capsule())
                        .frame(height: 3)
                }
            }
        }
        .accessibilityHidden(true)
    }

    private func fill(of bar: Int, progress: Double) -> CGFloat {
        if bar < index { return 1 }
        if bar == index { return CGFloat(progress) }
        return 0
    }
}

/// The last slide's buttons. They sit above the story's tap area, so they get their taps.
private struct OutroActions: View {
    let onRestart: () -> Void
    let onClose: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Button("Watch again", action: onRestart)
                .buttonStyle(StoryPillStyle(prominent: false))
            Button("Done", action: onClose)
                .buttonStyle(StoryPillStyle(prominent: true))
        }
        .padding(.bottom, 40)
        .rise(after: 1.1)
    }
}

private struct StoryPillStyle: ButtonStyle {
    let prominent: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(prominent ? Color.ink50 : Color.ink950)
            .padding(.horizontal, 24)
            .frame(minHeight: 44)
            .background(prominent ? Color.ink950 : Color.white.opacity(0.3), in: Capsule())
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
    }
}
