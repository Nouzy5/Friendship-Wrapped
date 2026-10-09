import SwiftUI
import UIKit

/// Loads a group's Wrapped for a year and plays it full screen (the web app's WrappedPage).
struct WrappedStoryView: View {
    let groupID: String
    let year: Int

    @Environment(\.dismiss) private var dismiss
    @Environment(GroupsStore.self) private var groups

    @State private var wrapped: Wrapped?
    @State private var failure: APIError?

    var body: some View {
        ZStack {
            Color.bg.ignoresSafeArea()

            if let wrapped {
                StoryPlayer(wrapped: wrapped) { dismiss() }
                    .transition(.opacity)
            } else {
                Group {
                    if let failure {
                        failureView(failure)
                    } else {
                        ProgressView()
                            .controlSize(.large)
                            .tint(Theme.fg)
                            .accessibilityLabel("Loading")
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .overlay(alignment: .topTrailing) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundStyle(.fg)
                            .frame(width: 44, height: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(PressScaleButtonStyle())
                    .accessibilityLabel("Close")
                    .padding(.horizontal, 8)
                }
            }
        }
        .statusBarHidden()
        .task { await load() }
        // People's colours and names (the reactors on the most reacted-to photo).
        .task { await groups.loadMembersIfNeeded(of: groupID) }
    }

    @ViewBuilder
    private func failureView(_ failure: APIError) -> some View {
        // Not a member, or no photos that year.
        if failure.status == 404 || failure.status == 400 {
            EmptyStateView(
                emoji: "🎁",
                title: "No Wrapped for \(String(year))",
                message: "A group's Wrapped for a year starts with its first photo that year. You'll only see your own groups'."
            ) {
                Button("See all Wrapped") { dismiss() }
                    .buttonStyle(.fwCompact(.primary))
            }
        } else {
            EmptyStateView(emoji: "📡", title: "Couldn't load this Wrapped", message: "Check your connection and try again.") {
                Button("Try again") { Task { await load() } }
                    .buttonStyle(.fwCompact(.primary))
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
                withMotion(.fwQuick) { wrapped = loaded }
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
        case .you: return 8
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
        case .you(let yours):
            return yours.bestPhoto.map { [$0.photo.imageUrls.medium] } ?? []
        default:
            return []
        }
    }
}

/// How long the current slide has played, across pauses. Slides read it from the environment,
/// so their looping decorations freeze while the story is paused.
struct StoryClock: Equatable {
    var played: TimeInterval = 0
    /// When it last started or resumed; nil while paused.
    var resumedAt: Date?

    var isPaused: Bool { resumedAt == nil }

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

private struct StoryClockKey: EnvironmentKey {
    static let defaultValue = StoryClock(resumedAt: .distantPast)
}

extension EnvironmentValues {
    /// The clock of the slide on screen.
    var storyClock: StoryClock {
        get { self[StoryClockKey.self] }
        set { self[StoryClockKey.self] = newValue }
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

/// The Wrapped as a full-screen story (the web app's WrappedStory). Slides play on their own; tap
/// the right of the screen (or swipe left) for the next, the left third (or swipe right) for the
/// previous. Press and hold to pause; swipe down to close. The progress bar and the buttons over
/// the slides take the slide's ink: paper, night, or the colour of the person it's about.
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
    /// Moving between slides (the web story's enter-forward / enter-back).
    private static let slideAnimation = Animation.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.45)

    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.fwReduceMotion) private var reduceMotion
    @Environment(GroupsStore.self) private var groups
    @Environment(SessionStore.self) private var session

    @State private var position = StoryPosition()
    @State private var clock = StoryClock()
    @State private var userPaused = false
    /// Whether it was paused before the share sheet paused it, so closing the sheet puts it back.
    @State private var pausedBeforeShare = false
    @State private var holding = false
    @State private var press = Press()
    @GestureState private var touching = false
    /// A share card is being made, or is waiting in the share sheet.
    @State private var sharing = false
    @State private var sharedFile: SharedCardFile?
    @State private var shareFailed = false

    private var slides: [WrappedSlide] { wrapped.slides }
    private var index: Int { min(position.index, slides.count - 1) }
    private var slide: WrappedSlide { slides[index] }
    private var isLast: Bool { index == slides.count - 1 }
    private var paused: Bool { userPaused || holding || scenePhase != .active }
    private var pauseLabel: String { userPaused ? "Play" : "Pause" }

    private var tone: StoryTone {
        StoryTone.of(slide, me: session.user?.id) { userID in groups.colorOf(userID, in: wrapped.group.id) }
    }

    /// The slide as a card to share, or nil for the intro.
    private var sharePlan: ShareCardPlan? {
        guard let me = session.user else { return nil }
        return ShareCardPlan.make(for: slide, wrapped: wrapped, meID: me.id, meName: me.displayName) { userID in
            groups.colorOf(userID, in: wrapped.group.id)
        }
    }

    var body: some View {
        let currentTone = tone

        GeometryReader { geometry in
            ZStack {
                // The slides in a stack of their own, so the incoming one can sit above the
                // outgoing one (fading out underneath) without covering the controls.
                ZStack {
                    StorySlideView(slide: slide, wrapped: wrapped, size: geometry.size)
                        .environment(\.storyClock, clock)
                        .id(position.visit)
                        .zIndex(Double(position.visit))
                        .transition(slideTransition)
                }
                .allowsHitTesting(false)

                Color.clear
                    .contentShape(Rectangle())
                    .ignoresSafeArea()
                    .gesture(storyGesture(width: geometry.size.width))
                    .accessibilityElement()
                    .accessibilityLabel(Text(verbatim: "\(wrapped.group.name), \(String(wrapped.year)) Wrapped"))
                    .accessibilityValue("Slide \(index + 1) of \(slides.count)")
                    .accessibilityAdjustableAction { direction in
                        switch direction {
                        case .increment: next()
                        case .decrement: previous()
                        @unknown default: break
                        }
                    }

                VStack(spacing: 0) {
                    topBar(tone: currentTone)
                    Spacer(minLength: 0)
                    if case .outro = slide {
                        OutroActions(onRestart: restart, onClose: onClose)
                            .id(position.visit)
                    }
                }
            }
        }
        .background(Color.bg.ignoresSafeArea())
        .onAppear {
            // VoiceOver users start paused, so the story doesn't move on while it's being read.
            if UIAccessibility.isVoiceOverRunning { userPaused = true }
            clock = StoryClock(resumedAt: paused ? nil : .now)
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
        .sheet(item: $sharedFile, onDismiss: {
            sharing = false
            userPaused = pausedBeforeShare
        }) { file in
            CardShareSheet(url: file.url)
                .ignoresSafeArea()
                .presentationDetents([.medium, .large])
        }
        .alert("Couldn’t make that card", isPresented: $shareFailed) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("Try again in a moment.")
        }
    }

    /// Draws this slide as a card on this phone and opens the share sheet with it. It leaves
    /// only through that sheet: nothing is sent to the server.
    private func shareCurrentSlide() async {
        guard let plan = sharePlan, !sharing else { return }
        sharing = true
        pausedBeforeShare = userPaused
        userPaused = true

        let url = FileManager.default.temporaryDirectory.appendingPathComponent(plan.filename)
        guard
            let image = await ShareCardRenderer.render(plan),
            let png = image.pngData(),
            (try? png.write(to: url, options: .atomic)) != nil
        else {
            sharing = false
            userPaused = pausedBeforeShare
            shareFailed = true
            return
        }
        sharedFile = SharedCardFile(url: url)
    }

    /// The progress bars, then the group, pause and close, in the slide's ink.
    private func topBar(tone: StoryTone) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            StoryProgress(
                count: slides.count,
                index: index,
                clock: clock,
                duration: slide.duration,
                paused: paused,
                color: tone.ink
            )
            .allowsHitTesting(false)

            HStack(spacing: 8) {
                HStack(spacing: 8) {
                    GroupBadge(
                        groupID: wrapped.group.id,
                        emoji: wrapped.group.emoji,
                        avatarURL: groups.group(wrapped.group.id)?.avatarUrl,
                        size: 28
                    )
                    Text(wrapped.group.name)
                        .font(.system(size: 15, weight: .semibold, design: .rounded))
                        .lineLimit(1)
                    Text(verbatim: String(wrapped.year))
                        .font(.system(size: 15, design: .rounded))
                        .foregroundStyle(tone.secondary)
                        .layoutPriority(1)
                }
                .padding(.leading, 4)
                .frame(maxWidth: .infinity, alignment: .leading)
                .allowsHitTesting(false)
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isHeader)

                if sharePlan != nil {
                    Button { Task { await shareCurrentSlide() } } label: {
                        Image(systemName: "square.and.arrow.up")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(tone.ink)
                            .frame(width: 44, height: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(PressScaleButtonStyle())
                    .disabled(sharing)
                    .opacity(sharing ? 0.4 : 1)
                    .accessibilityLabel("Share this slide as an image")
                }

                Button { userPaused.toggle() } label: {
                    Image(systemName: userPaused ? "play.fill" : "pause.fill")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(tone.ink)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(PressScaleButtonStyle())
                .accessibilityLabel(pauseLabel)

                Button(action: onClose) {
                    Image(systemName: "xmark")
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundStyle(tone.ink)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(PressScaleButtonStyle())
                .accessibilityLabel("Close")
            }
        }
        .foregroundStyle(tone.ink)
        .padding(.horizontal, 12)
        .padding(.top, 8)
    }

    /// Slides in from the side it's coming from while the outgoing slide fades out underneath
    /// (the web story's enter-forward, enter-back and exit). Reduced motion: it just changes.
    private var slideTransition: AnyTransition {
        guard !reduceMotion else { return .identity }
        let insertion = AnyTransition.opacity
            .combined(with: .offset(x: position.forward ? 40 : -40))
            .combined(with: .scale(scale: 0.98))
        let removal = AnyTransition.opacity
            .combined(with: .scale(scale: 0.96))
            .animation(.easeIn(duration: 0.45))
        return .asymmetric(insertion: insertion, removal: removal)
    }

    // MARK: - Playback

    /// Moves on when the slide's time is up. Restarted on every move, pause and resume.
    private func playCurrentSlide() async {
        guard !paused else { return }
        let visit = position.visit
        let remaining = slide.duration - clock.elapsed(at: .now)
        try? await Task.sleep(for: .seconds(max(0, remaining)))
        // A tap or pause may land in the same moment, before this task is cancelled.
        guard !Task.isCancelled, position.visit == visit, !paused, !isLast else { return }
        next()
    }

    private func goTo(_ target: Int) {
        guard slides.indices.contains(target) else { return }
        let destination = StoryPosition(index: target, forward: target >= index, visit: position.visit + 1)
        withMotion(Self.slideAnimation) {
            position = destination
        }
        clock = StoryClock(resumedAt: paused ? nil : .now)
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
            // `touching` too: a touch the system cancels straight away never reaches endPress().
            guard !Task.isCancelled, touching else { return }
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

/// One bar per slide, in the slide's ink: the ones seen are full, the current one fills while it
/// plays. It keeps moving with reduced motion: it says how long the slide has left.
private struct StoryProgress: View {
    let count: Int
    let index: Int
    let clock: StoryClock
    let duration: TimeInterval
    let paused: Bool
    let color: Color

    var body: some View {
        TimelineView(.animation(paused: paused)) { context in
            let progress = min(1, max(0, clock.elapsed(at: context.date) / duration))
            HStack(spacing: 4) {
                ForEach(0..<count, id: \.self) { bar in
                    Capsule()
                        .fill(color.opacity(0.25))
                        .overlay(alignment: .leading) {
                            GeometryReader { geometry in
                                Capsule()
                                    .fill(color)
                                    .frame(width: geometry.size.width * fill(of: bar, progress: progress))
                            }
                        }
                        .clipShape(Capsule())
                        .frame(height: 4)
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

/// The last slide's buttons. They sit above the story's tap area, so they get their taps. The
/// last slide is on paper, so they're the app's own grey and black pills.
private struct OutroActions: View {
    let onRestart: () -> Void
    let onClose: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Button("Watch again", action: onRestart)
                .buttonStyle(.fwCompact(.secondary))
            Button("Done", action: onClose)
                .buttonStyle(.fwCompact(.primary))
        }
        .padding(.bottom, 40)
        .storyRise(after: 1.1)
    }
}
