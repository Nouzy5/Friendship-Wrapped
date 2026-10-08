import SwiftUI

/// The Wrapped tab (the web app's WrappedListPage): every Wrapped you can play, one per group and
/// year with photos, newest year first. Tapping a card plays it full screen.
struct WrappedListView: View {
    @Environment(WrappedStore.self) private var wrapped
    @Environment(GroupsStore.self) private var groups
    @Environment(AppRouter.self) private var router

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text("Wrapped")
                    .font(Theme.title())
                    .accessibilityAddTraits(.isHeader)
                content
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 32)
        }
        .screenBackground()
        .refreshable { await wrapped.loadList() }
        .toolbar(.hidden, for: .navigationBar)
        .task { await wrapped.loadList() }
    }

    @ViewBuilder private var content: some View {
        if wrapped.hasAny {
            ForEach(years) { year in
                VStack(alignment: .leading, spacing: 12) {
                    YearHeader(year: year.year, final: year.final)
                    ForEach(Array(year.items.enumerated()), id: \.element.id) { index, item in
                        WrappedCard(summary: item, avatarURL: groups.group(item.group.id)?.avatarUrl) {
                            play(item)
                        }
                        .riseIn(delay: Double(min(index, 6)) * 0.07)
                    }
                }
            }
        } else {
            switch wrapped.listState {
            case .idle, .loading:
                WrappedListSkeleton()
            case .failed:
                EmptyStateView(emoji: "📡", title: "Couldn't load your Wrapped") {
                    Button("Try again") { Task { await wrapped.loadList() } }
                        .buttonStyle(.fwCompact(.primary))
                }
                .background(.surface, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            case .loaded:
                EmptyStateView(
                    emoji: "🎁",
                    title: "No Wrapped yet",
                    message: "Your group's Wrapped starts with its first photo. Every photo, reaction and comment ends up in it."
                ) {
                    Button("Take a photo") { router.openCamera(groupID: groups.currentGroup?.id) }
                        .buttonStyle(.fwCompact(.accent))
                }
                .background(.surface, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            }
        }
    }

    private func play(_ summary: WrappedSummary) {
        Haptics.tap()
        router.playingWrapped = summary
    }

    /// The list is newest year first, so consecutive runs are the years.
    private var years: [WrappedYear] {
        var years: [WrappedYear] = []
        for item in wrapped.list {
            if years.last?.year == item.year {
                years[years.count - 1].items.append(item)
            } else {
                years.append(WrappedYear(year: item.year, final: item.final, items: [item]))
            }
        }
        return years
    }
}

private struct WrappedYear: Identifiable {
    let year: Int
    let final: Bool
    var items: [WrappedSummary]

    var id: Int { year }
}

private struct YearHeader: View {
    let year: Int
    let final: Bool

    var body: some View {
        HStack(spacing: 8) {
            Text(verbatim: String(year))
                .font(Theme.title(.title))
            if !final {
                Text("In progress")
                    .font(.system(.caption, design: .rounded, weight: .semibold))
                    .foregroundStyle(.fg)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 3)
                    .background(.surface, in: Capsule())
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

/// A group's Wrapped for a year, ready to play (the web app's WrappedCard): the group's badge,
/// its name and the year on a grey panel, with a play button.
private struct WrappedCard: View {
    let summary: WrappedSummary
    /// The group photo, when the group has one (from your groups).
    let avatarURL: String?
    let play: () -> Void

    private var yearText: String { String(summary.year) }
    private var subtitle: String { summary.final ? "\(yearText) Wrapped" : "\(yearText) so far" }
    private var label: String {
        "Play \(summary.group.name): \(yearText) Wrapped" + (summary.final ? "" : " so far")
    }

    var body: some View {
        Button(action: play) {
            HStack(spacing: 16) {
                GroupBadge(groupID: summary.group.id, emoji: summary.group.emoji, avatarURL: avatarURL, size: 60)
                VStack(alignment: .leading, spacing: 2) {
                    Text(summary.group.name)
                        .font(Theme.title(.title3))
                        .foregroundStyle(.fg)
                        .lineLimit(1)
                    Text(subtitle)
                        .font(.subheadline)
                        .foregroundStyle(.sub)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .buttonStyle(WrappedCardStyle())
        .accessibilityLabel(label)
    }
}

/// The card's panel and its play button, which grows a little while the card is pressed.
private struct WrappedCardStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        let shape = RoundedRectangle(cornerRadius: 24, style: .continuous)

        HStack(spacing: 16) {
            configuration.label
            Image(systemName: "play.fill")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(.onInverse)
                .offset(x: 1)
                .frame(width: 44, height: 44)
                .background(.inverse, in: Circle())
                .scaleEffect(configuration.isPressed ? 1.1 : 1)
                .motion(.fwPop, value: configuration.isPressed)
                .accessibilityHidden(true)
        }
        .padding(.leading, 12)
        .padding(.trailing, 16)
        .padding(.vertical, 12)
        .background(configuration.isPressed ? Theme.line : Theme.surface, in: shape)
        .contentShape(shape)
        .scaleEffect(configuration.isPressed ? 0.98 : 1)
        .motion(.fwQuick, value: configuration.isPressed)
    }
}

/// A year and two cards while the list loads.
private struct WrappedListSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Capsule()
                .fill(.surface)
                .frame(width: 96, height: 28)
            ForEach(0..<2, id: \.self) { _ in
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .fill(.surface)
                    .frame(height: 84)
            }
        }
        .modifier(SkeletonPulse())
        .accessibilityElement()
        .accessibilityLabel("Loading")
    }
}
