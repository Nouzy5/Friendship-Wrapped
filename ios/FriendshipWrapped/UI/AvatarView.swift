import SwiftUI

/// Profile picture, falling back to initials. Decorative: always show the person's name next to it.
/// The initials use the same colour hash as the web client, so each friend has the same colours on both.
struct AvatarView: View {
    let name: String
    /// Usually the user id.
    let seed: String
    /// The user's `avatarUrl`. Initials show while it loads, or if it's nil or fails.
    var imagePath: String? = nil
    var size: CGFloat = 40

    var body: some View {
        AuthenticatedImage(path: imagePath) {
            initialsView
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .accessibilityHidden(true)
    }

    private var initialsView: some View {
        Text(initials)
            .font(.system(size: size * 0.36, weight: .bold, design: .rounded))
            .foregroundStyle(Color.ink950)
            .frame(width: size, height: size)
            .background(LinearGradient(colors: colors, startPoint: .topLeading, endPoint: .bottomTrailing))
    }

    private var initials: String {
        let words = name.split(whereSeparator: \.isWhitespace)
        let first = words.first?.first.map { String($0) } ?? "?"
        let last = words.count > 1 ? (words.last?.first.map { String($0) } ?? "") : ""
        return (first + last).uppercased()
    }

    /// Mirrors `gradientFor()` in the web client's Avatar.tsx: `hash = (hash * 31 + charCode) >>> 0`.
    private var colors: [Color] {
        var hash: UInt32 = 0
        for scalar in seed.unicodeScalars {
            let codeUnit = String(scalar).utf16.first ?? 0
            hash = hash &* 31 &+ UInt32(codeUnit)
        }
        return Self.gradients[Int(hash % UInt32(Self.gradients.count))]
    }

    private static let violet = Color(hex: 0x8E51FF)
    private static let sky = Color(hex: 0x00A6F4)
    private static let emerald = Color(hex: 0x00D492)

    private static let gradients: [[Color]] = [
        [.brandRose, .brandOrange],
        [.brandOrange, .brandGold],
        [violet, .brandRose],
        [sky, violet],
        [emerald, sky],
        [.brandGold, emerald],
    ]
}

/// Overlapping avatar stack. Decorative: pair it with a text member count.
struct MemberAvatarStack: View {
    let members: [GroupMember]
    private let maxShown = 5

    var body: some View {
        HStack(spacing: -8) {
            ForEach(members.prefix(maxShown)) { member in
                AvatarView(
                    name: member.user.displayName,
                    seed: member.user.id,
                    imagePath: member.user.avatarUrl,
                    size: 30
                )
                .overlay(Circle().stroke(Color(.secondarySystemGroupedBackground), lineWidth: 2))
            }
            if members.count > maxShown {
                Text("+\(members.count - maxShown)")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .frame(width: 30, height: 30)
                    .background(Color(.tertiarySystemFill), in: Circle())
                    .overlay(Circle().stroke(Color(.secondarySystemGroupedBackground), lineWidth: 2))
            }
        }
        .accessibilityHidden(true)
    }
}

#Preview {
    HStack {
        AvatarView(name: "Nicolas Szántai", seed: "0199b5c2-0000-7000-8000-000000000001", size: 64)
        AvatarView(name: "Ana", seed: "0199b5c2-0000-7000-8000-000000000002", size: 64)
    }
}
