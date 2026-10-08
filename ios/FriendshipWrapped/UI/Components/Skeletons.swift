import SwiftUI

// Grey shapes where content is loading, so the screen doesn't jump when it arrives (the web
// app's skeletons). They pulse gently, except with reduced motion.

private struct SkeletonBar: View {
    var width: CGFloat?
    var height: CGFloat = 12
    var color: Color = Theme.surface

    var body: some View {
        Capsule()
            .fill(color)
            .frame(width: width, height: height)
    }
}

/// Feed posts while a group's photos load.
struct FeedSkeleton: View {
    var count = 2

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            ForEach(0..<count, id: \.self) { _ in
                VStack(alignment: .leading, spacing: 8) {
                    RoundedRectangle(cornerRadius: 28, style: .continuous)
                        .fill(.surface)
                        .aspectRatio(1, contentMode: .fit)
                    HStack(spacing: 6) {
                        SkeletonBar(width: 64, height: 44)
                        SkeletonBar(width: 64, height: 44)
                        Circle().fill(.surface).frame(width: 44, height: 44)
                    }
                    .padding(.horizontal, 2)
                }
            }
        }
        .padding(.horizontal, 8)
        .modifier(SkeletonPulse())
        .accessibilityElement()
        .accessibilityLabel("Loading photos")
    }
}

/// A grid of squares while photos load.
struct GridSkeleton: View {
    var count = 9

    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 3), spacing: 4) {
            ForEach(0..<count, id: \.self) { _ in
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(.surface)
                    .aspectRatio(1, contentMode: .fit)
            }
        }
        .modifier(SkeletonPulse())
        .accessibilityElement()
        .accessibilityLabel("Loading photos")
    }
}

/// Settings-style rows while a list loads.
struct ListSkeleton: View {
    var rows = 4

    var body: some View {
        VStack(spacing: 0) {
            ForEach(0..<rows, id: \.self) { index in
                HStack(spacing: 14) {
                    Circle().fill(.line).frame(width: 36, height: 36)
                    VStack(alignment: .leading, spacing: 8) {
                        SkeletonBar(width: index.isMultiple(of: 2) ? 150 : 110, height: 13, color: Theme.line)
                        SkeletonBar(width: 80, height: 10, color: Theme.line)
                    }
                    Spacer()
                }
                .padding(.horizontal, 16)
                .frame(minHeight: 60)
            }
        }
        .background(.surface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .modifier(SkeletonPulse())
        .accessibilityElement()
        .accessibilityLabel("Loading")
    }
}
