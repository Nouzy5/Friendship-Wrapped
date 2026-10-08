import SwiftUI

/// The group's picture: its photo if the owner set one, otherwise a badge of every member's
/// colour in the order they joined, with the group's emoji on top (the web app's GroupAvatar).
/// Decorative: the group's name is always shown too.
struct GroupBadge: View {
    @Environment(GroupsStore.self) private var groups

    /// Nil for a group you can't see into yet (an invite you haven't accepted): the emoji then
    /// sits on a plain tile instead of everyone's colours.
    let groupID: String?
    let emoji: String
    var avatarURL: String?
    /// Points. The emoji shows from 28 up.
    let size: CGFloat

    init(group: FriendGroup, size: CGFloat) {
        groupID = group.id
        emoji = group.emoji
        avatarURL = group.avatarUrl
        self.size = size
    }

    init(groupID: String?, emoji: String, avatarURL: String? = nil, size: CGFloat) {
        self.groupID = groupID
        self.emoji = emoji
        self.avatarURL = avatarURL
        self.size = size
    }

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: (size * 0.3).rounded(), style: .continuous)

        Group {
            if let avatarURL {
                AuthenticatedImage(path: avatarURL) { stripes }
            } else {
                stripes
            }
        }
        .frame(width: size, height: size)
        .clipShape(shape)
        .accessibilityHidden(true)
        .task(id: groupID) {
            guard avatarURL == nil, let groupID else { return }
            await groups.loadMembersIfNeeded(of: groupID)
        }
    }

    private var colors: [MemberColor?] {
        guard let groupID else { return [] }
        return groups.badgeColors(of: groupID) ?? []
    }

    private var stripes: some View {
        let shown = colors
        return ZStack {
            if shown.isEmpty {
                Rectangle().fill(.surface)
            } else {
                HStack(spacing: 0) {
                    ForEach(Array(shown.enumerated()), id: \.offset) { _, color in
                        Rectangle().fill(MemberFill(color).background)
                    }
                }
            }
            if size >= 28 {
                Text(emoji)
                    .font(.system(size: (size * (shown.isEmpty ? 0.5 : 0.36)).rounded()))
                    .frame(width: (size * 0.6).rounded(), height: (size * 0.6).rounded())
                    .background {
                        if !shown.isEmpty { Circle().fill(.white) }
                    }
            }
        }
        .motion(.fwEase, value: shown)
    }
}

/// The app's mark: five friends' colours side by side.
struct AppMark: View {
    var size: CGFloat = 64

    var body: some View {
        HStack(spacing: 0) {
            ForEach(MemberColor.markStripes) { color in
                Rectangle().fill(color.fill)
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: (size * 0.28).rounded(), style: .continuous))
        .accessibilityHidden(true)
    }
}

/// Who posted a photo, as a pill in their colour laid over its corner, with an optional detail
/// such as how long ago ("Tomáš  2 h").
struct NameTag: View {
    let name: String
    let color: MemberColor?
    var detail: String?
    var small = false

    var body: some View {
        let fill = MemberFill(color)

        HStack(spacing: 6) {
            Text(name)
                .fontWeight(.semibold)
                .lineLimit(1)
            if let detail {
                Text(detail)
                    .fontWeight(.regular)
                    .lineLimit(1)
                    .layoutPriority(1)
            }
        }
        .font(.system(size: small ? 12 : 15, design: .rounded))
        .foregroundStyle(fill.ink)
        .padding(.horizontal, small ? 9 : 14)
        .frame(height: small ? 24 : 34)
        .background(fill.background, in: Capsule())
        .motion(.fwEase, value: color)
    }
}
