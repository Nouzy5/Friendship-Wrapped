import SwiftUI

/// The Wrapped tab: every Wrapped you can play, one per group and year with photos.
struct WrappedListView: View {
    @Environment(WrappedStore.self) private var wrapped
    @Environment(AppRouter.self) private var router

    var body: some View {
        content
            .navigationTitle("Wrapped")
            .task { await wrapped.loadList() }
    }

    @ViewBuilder private var content: some View {
        if wrapped.hasAny {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 24) {
                    ForEach(years) { year in
                        VStack(alignment: .leading, spacing: 12) {
                            YearHeader(year: year.year, final: year.final)
                            ForEach(year.items) { item in
                                WrappedCard(summary: item) { router.playingWrapped = item }
                            }
                        }
                    }
                }
                .padding(.horizontal)
                .padding(.vertical, 8)
            }
            .refreshable { await wrapped.loadList() }
        } else {
            switch wrapped.listState {
            case .idle, .loading:
                ProgressView()
            case .failed:
                EmptyStateView(emoji: "📡", title: "Couldn't load your Wrapped", message: "Check your connection and try again.") {
                    Button("Try again") { Task { await wrapped.loadList() } }
                        .buttonStyle(.borderedProminent)
                }
            case .loaded:
                EmptyStateView(
                    emoji: "🎁",
                    title: "No Wrapped yet",
                    message: "Your group's Wrapped starts with its first photo. Every photo, reaction and comment ends up in it."
                ) {
                    Button("Take a photo") { router.openCamera(groupID: nil) }
                        .buttonStyle(.brand)
                        .frame(maxWidth: 240)
                }
            }
        }
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
            Text(String(year))
                .font(.title3.bold())
            if !final {
                Text("In progress")
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .foregroundStyle(.tint)
                    .background(.tint.opacity(0.15), in: Capsule())
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

/// A group's Wrapped for a year, ready to play.
private struct WrappedCard: View {
    let summary: WrappedSummary
    let play: () -> Void

    private var yearText: String { String(summary.year) }
    private var kicker: String { summary.final ? "\(yearText) Wrapped" : "\(yearText) so far" }

    var body: some View {
        Button(action: play) {
            HStack(spacing: 16) {
                Text(summary.group.emoji)
                    .font(.system(size: 30))
                    .frame(width: 56, height: 56)
                    .background(.white.opacity(0.3), in: RoundedRectangle(cornerRadius: 16))
                VStack(alignment: .leading, spacing: 2) {
                    Text(kicker)
                        .font(.caption.bold())
                        .tracking(2.4)
                        .textCase(.uppercase)
                        .opacity(0.75)
                    Text(summary.group.name)
                        .font(.title3.weight(.black))
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                Image(systemName: "play.fill")
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(Color.ink950, in: Circle())
            }
            .padding(16)
            .foregroundStyle(Color.ink950)
            .background(LinearGradient.brand, in: RoundedRectangle(cornerRadius: 24))
            .shadow(color: .brandRose.opacity(0.2), radius: 16, y: 8)
        }
        .buttonStyle(PressableCardStyle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Play \(summary.group.name): \(kicker)")
        .accessibilityAddTraits(.isButton)
    }
}

private struct PressableCardStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.99 : 1)
            .brightness(configuration.isPressed ? 0.03 : 0)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}
