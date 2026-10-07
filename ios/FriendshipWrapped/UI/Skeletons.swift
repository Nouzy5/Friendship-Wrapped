import SwiftUI

/// Grey shapes where content is loading, so the screen doesn't jump when it arrives
/// (the web client's skeletons). They pulse gently, except with Reduce Motion.
private struct SkeletonPulse: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
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

private struct SkeletonBar: View {
    let width: CGFloat
    var height: CGFloat = 12

    var body: some View {
        Capsule()
            .fill(.quaternary)
            .frame(width: width, height: height)
    }
}

/// A group row while your groups load.
struct GroupRowSkeleton: View {
    var body: some View {
        HStack(spacing: 14) {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(.quaternary)
                .frame(width: 48, height: 48)
            VStack(alignment: .leading, spacing: 8) {
                SkeletonBar(width: 140, height: 14)
                SkeletonBar(width: 90, height: 11)
            }
        }
        .padding(.vertical, 4)
        .modifier(SkeletonPulse())
        .accessibilityElement()
        .accessibilityLabel("Loading")
    }
}

/// Two feed posts while a group's photos load.
struct FeedSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            ForEach(0..<2, id: \.self) { _ in
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 10) {
                        Circle()
                            .fill(.quaternary)
                            .frame(width: 32, height: 32)
                        VStack(alignment: .leading, spacing: 6) {
                            SkeletonBar(width: 110)
                            SkeletonBar(width: 60, height: 10)
                        }
                    }
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .fill(.quaternary)
                        .aspectRatio(4.0 / 5.0, contentMode: .fit)
                    HStack(spacing: 6) {
                        ForEach(0..<5, id: \.self) { _ in
                            SkeletonBar(width: 44, height: 34)
                        }
                    }
                }
            }
        }
        .modifier(SkeletonPulse())
        .accessibilityElement()
        .accessibilityLabel("Loading photos")
    }
}
