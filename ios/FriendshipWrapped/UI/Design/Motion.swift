import SwiftUI

// App-wide motion, the web app's index.css animations: screens slide in (native pushes), tabs
// rise into place, menus and sheets grow from where they open, reactions pop and bounce, and
// lists ease in. Reduce motion (Settings → Appearance, or the device's own setting) turns all
// of it off: things just appear. The Wrapped progress bar and spinners keep moving, because
// they say something.

extension Animation {
    /// Entrances and slides: quick out, gentle landing (cubic-bezier(0.2, 0.8, 0.2, 1)).
    static let fwEase = Animation.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.34)
    /// Small and quick: menus, checks, colour changes.
    static let fwQuick = Animation.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.2)
    /// Pops and bounces that overshoot a little (cubic-bezier(0.34, 1.56, 0.64, 1)).
    static let fwPop = Animation.spring(response: 0.38, dampingFraction: 0.62)
    /// A switch's knob, a segmented control's marker.
    static let fwSlide = Animation.spring(response: 0.32, dampingFraction: 0.78)
}

/// Whether to keep things still. Kept here as well as in the environment so actions outside
/// views (`withMotion`) can ask too; the root keeps both up to date.
@MainActor
enum Motion {
    static var isReduced = false
}

private struct ReduceMotionKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    /// The app's own reduce-motion: the setting in Appearance, or the device's when it's "Match device".
    var fwReduceMotion: Bool {
        get { self[ReduceMotionKey.self] }
        set { self[ReduceMotionKey.self] = newValue }
    }
}

/// `withAnimation`, unless motion is reduced (then the change just happens).
@MainActor
@discardableResult
func withMotion<Result>(_ animation: Animation = .fwEase, _ body: () throws -> Result) rethrows -> Result {
    if Motion.isReduced { return try body() }
    return try withAnimation(animation, body)
}

extension View {
    /// `.animation(_:value:)` that stays still when motion is reduced.
    func motion<V: Equatable>(_ animation: Animation = .fwEase, value: V) -> some View {
        modifier(MotionAnimation(animation: animation, value: value))
    }

    /// Pops in from small when it first appears (reactions, emoji, checks).
    func popIn(delay: Double = 0) -> some View {
        modifier(AppearEffect(kind: .pop, delay: delay))
    }

    /// Rises a little and fades in when it first appears (headers, messages, cards).
    func riseIn(delay: Double = 0) -> some View {
        modifier(AppearEffect(kind: .rise, delay: delay))
    }

    /// Just fades in when it first appears.
    func fadeIn(delay: Double = 0) -> some View {
        modifier(AppearEffect(kind: .fade, delay: delay))
    }

    /// For items in a list that's animated with `.motion(value:)`: new items rise in one after
    /// another (the first few staggered), removed ones fade out. Nothing moves with reduced motion.
    func listItemTransition(index: Int) -> some View {
        modifier(ListItemTransition(index: index))
    }

    /// Springs up and back each time `trigger` changes (your reaction, the tab you switch to).
    func bounceOnce<T: Equatable>(trigger: T) -> some View {
        modifier(BounceOnce(trigger: trigger))
    }

    /// Shrinks a touch while pressed, for things that aren't Buttons (cards with gestures).
    func pressable(_ isPressed: Bool) -> some View {
        scaleEffect(isPressed ? 0.97 : 1)
            .motion(.fwQuick, value: isPressed)
    }
}

extension AnyTransition {
    /// A new list item: rises 12 points and fades in, staggered by its place in the first few.
    static func listItem(index: Int) -> AnyTransition {
        .asymmetric(
            insertion: .opacity.combined(with: .offset(y: 12))
                .animation(.fwEase.delay(Double(min(max(index, 0), 4)) * 0.07)),
            removal: .opacity.animation(.fwQuick)
        )
    }

    /// Menus and pickers: grow from their top edge and fade (menu-in).
    static var menu: AnyTransition {
        .asymmetric(
            insertion: .scale(scale: 0.96, anchor: .top).combined(with: .opacity).combined(with: .offset(y: -4)),
            removal: .opacity
        )
    }

    /// Panels that come up from the bottom (sheet-up), e.g. the caption field over a photo.
    static var sheetUp: AnyTransition {
        .asymmetric(
            insertion: .move(edge: .bottom).combined(with: .opacity),
            removal: .opacity
        )
    }
}

private struct ListItemTransition: ViewModifier {
    @Environment(\.fwReduceMotion) private var reduceMotion
    let index: Int

    func body(content: Content) -> some View {
        // The transition carries its own (staggered) animation, so it has to be switched off here.
        content.transition(reduceMotion ? AnyTransition.identity : AnyTransition.listItem(index: index))
    }
}

private struct MotionAnimation<V: Equatable>: ViewModifier {
    @Environment(\.fwReduceMotion) private var reduceMotion
    let animation: Animation
    let value: V

    func body(content: Content) -> some View {
        content.animation(reduceMotion ? nil : animation, value: value)
    }
}

private struct AppearEffect: ViewModifier {
    enum Kind {
        case pop, rise, fade
    }

    @Environment(\.fwReduceMotion) private var reduceMotion
    let kind: Kind
    let delay: Double
    @State private var shown = false

    func body(content: Content) -> some View {
        let visible = shown || reduceMotion
        content
            .opacity(visible ? 1 : 0)
            .scaleEffect(kind == .pop && !visible ? 0.6 : 1)
            .offset(y: kind == .rise && !visible ? 10 : 0)
            .onAppear {
                guard !shown, !reduceMotion else { return }
                let animation: Animation = kind == .pop ? .fwPop : .fwEase
                withAnimation(animation.delay(delay)) { shown = true }
            }
    }
}

private struct BounceOnce<T: Equatable>: ViewModifier {
    @Environment(\.fwReduceMotion) private var reduceMotion
    let trigger: T

    func body(content: Content) -> some View {
        if reduceMotion {
            content
        } else {
            content.keyframeAnimator(initialValue: CGFloat(1), trigger: trigger) { view, scale in
                view.scaleEffect(scale)
            } keyframes: { _ in
                KeyframeTrack(\.self) {
                    SpringKeyframe(CGFloat(1.28), duration: 0.18, spring: .snappy)
                    SpringKeyframe(CGFloat(1), duration: 0.27, spring: .bouncy)
                }
            }
        }
    }
}

/// Skeletons pulse gently while content loads (not with reduced motion).
struct SkeletonPulse: ViewModifier {
    @Environment(\.fwReduceMotion) private var reduceMotion
    @State private var dimmed = false

    func body(content: Content) -> some View {
        content
            .opacity(dimmed ? 0.5 : 1)
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) {
                    dimmed = true
                }
            }
    }
}
