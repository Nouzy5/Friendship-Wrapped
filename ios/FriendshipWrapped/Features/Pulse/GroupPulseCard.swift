import SwiftUI

/// "This month" in the group and its weekly streak, above the feed (the web app's GroupPulseCard).
/// Only numbers about the group: nothing here says who has posted, or who hasn't.
struct GroupPulseCard: View {
    let group: FriendGroup
    /// The newest photo in the feed. When it changes (a post, a deletion) the numbers are fetched again.
    let latestPhotoID: String?

    @State private var pulse: GroupPulse?
    @State private var failed = false

    var body: some View {
        Group {
            if let pulse {
                card(pulse)
                    .transition(.opacity)
            } else if !failed {
                // Reserves the card's space, so the feed doesn't jump down when it arrives.
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(.surface)
                    .frame(height: 152)
                    .modifier(SkeletonPulse())
                    .accessibilityHidden(true)
            }
        }
        .motion(.fwEase, value: pulse)
        .task(id: "\(group.id)/\(latestPhotoID ?? "")") { await load() }
    }

    private func card(_ pulse: GroupPulse) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text("This month")
                    .font(Theme.title(.title3))
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: 8)
                Text(monthName(pulse.month.month))
                    .font(.footnote)
                    .foregroundStyle(.sub)
            }

            if pulse.month.isQuiet {
                Text("A fresh month. Whatever happens in \(group.name) shows up here.")
                    .font(.subheadline)
                    .foregroundStyle(.sub)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 8)
            } else {
                HStack(spacing: 8) {
                    stat(pulse.month.photos, "photo")
                    stat(pulse.month.reactions, "reaction")
                    stat(pulse.month.comments, "comment")
                }
                .padding(.top, 12)
            }

            streakLine(pulse.streak)
                .padding(.top, 12)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.surface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    private func stat(_ value: Int, _ noun: String) -> some View {
        VStack(spacing: 2) {
            Text(Format.number(value))
                .font(Theme.title(.title2))
                .monospacedDigit()
            Text(Format.noun(value, noun))
                .font(.footnote)
                .foregroundStyle(.sub)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        // On a grey panel, tiles take the page's colour.
        .background(.bg, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    @ViewBuilder private func streakLine(_ streak: GroupPulse.Streak) -> some View {
        if streak.weeks > 0 {
            let count = Text("\(streak.weeks) \(Format.noun(streak.weeks, "week")) in a row").fontWeight(.semibold)
            let hint = Text(streak.thisWeekDone ? "" : " · a photo this week keeps it going").foregroundStyle(.sub)
            let line = Text("🔥 ") + count + hint
            line
                .font(.subheadline)
                .fixedSize(horizontal: false, vertical: true)
        } else {
            Text("A photo this week starts a streak.")
                .font(.subheadline)
                .foregroundStyle(.sub)
        }
    }

    private func monthName(_ month: Int) -> String {
        let names = Calendar.current.standaloneMonthSymbols
        return names.indices.contains(month - 1) ? names[month - 1] : ""
    }

    private func load() async {
        do {
            pulse = try await APIClient.shared.fetchGroupPulse(group.id)
            failed = false
        } catch is CancellationError {
            return
        } catch {
            // A card that can't load isn't worth an error: the feed is what matters.
            if pulse == nil { failed = true }
        }
    }
}
