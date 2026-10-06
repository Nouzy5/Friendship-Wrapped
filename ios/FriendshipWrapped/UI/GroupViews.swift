import SwiftUI

/// The group's emoji on a tile. Decorative: the group name is always shown alongside.
struct GroupEmojiTile: View {
    enum Size {
        case medium, large, extraLarge

        var side: CGFloat {
            switch self {
            case .medium: return 48
            case .large: return 80
            case .extraLarge: return 96
            }
        }

        var cornerRadius: CGFloat {
            switch self {
            case .medium: return 14
            case .large: return 22
            case .extraLarge: return 28
            }
        }

        var fontSize: CGFloat {
            switch self {
            case .medium: return 26
            case .large: return 42
            case .extraLarge: return 52
            }
        }
    }

    let emoji: String
    var size: Size = .medium

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: size.cornerRadius, style: .continuous)

        Text(emoji)
            .font(.system(size: size.fontSize))
            .frame(width: size.side, height: size.side)
            .background(
                LinearGradient(
                    colors: [Color(.tertiarySystemFill), Color(.quaternarySystemFill)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ),
                in: shape
            )
            .overlay(shape.strokeBorder(Color(.separator).opacity(0.6), lineWidth: 0.5))
            .accessibilityHidden(true)
    }
}

struct GroupRow: View {
    let group: FriendGroup

    var body: some View {
        HStack(spacing: 14) {
            GroupEmojiTile(emoji: group.emoji)
            VStack(alignment: .leading, spacing: 2) {
                Text(group.name)
                    .font(.headline)
                    .lineLimit(1)
                Text(group.isOwner ? "\(Format.memberCount(group.memberCount)) · Owner" : Format.memberCount(group.memberCount))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
}

struct MemberRow: View {
    let member: GroupMember
    let isYou: Bool
    var isRemoving = false

    var body: some View {
        HStack(spacing: 12) {
            AvatarView(name: member.user.displayName, seed: member.user.id, imagePath: member.user.avatarUrl)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Text(member.user.displayName).lineLimit(1)
                    if isYou {
                        Text("(you)").foregroundStyle(.secondary)
                    }
                }
                Text("@\(member.user.username)")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            if isRemoving {
                ProgressView()
            } else if member.role == .owner {
                OwnerBadge()
            }
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
    }
}

struct OwnerBadge: View {
    var body: some View {
        Text("Owner")
            .font(.caption.weight(.semibold))
            .foregroundStyle(Color.accentColor)
            .padding(.horizontal, 10)
            .padding(.vertical, 3)
            .background(Color.accentColor.opacity(0.12), in: Capsule())
            .overlay(Capsule().strokeBorder(Color.accentColor.opacity(0.4)))
    }
}
