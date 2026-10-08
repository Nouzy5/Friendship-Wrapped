import SwiftUI

/// A person: their initial on their colour, or their profile picture ringed in it (the web app's
/// Avatar). Without a colour (outside a group, or people who left) it's neutral. Decorative:
/// always show the person's name next to it, or label its container.
struct PersonAvatar: View {
    enum Size {
        case xs, sm, md, lg, xl

        var side: CGFloat {
            switch self {
            case .xs: return 24
            case .sm: return 32
            case .md: return 40
            case .lg: return 64
            case .xl: return 88
            }
        }

        var fontSize: CGFloat {
            switch self {
            case .xs: return 11
            case .sm: return 15
            case .md: return 16
            case .lg: return 28
            case .xl: return 38
            }
        }

        var ring: CGFloat {
            switch self {
            case .xs: return 1.5
            case .sm, .md: return 2
            case .lg: return 3
            case .xl: return 4
            }
        }
    }

    let name: String
    /// The person's `avatarUrl`. The initial shows while it loads, or if it's nil or fails.
    var imagePath: String?
    var color: MemberColor?
    var size: Size = .md

    var body: some View {
        let fill = MemberFill(color)

        AuthenticatedImage(path: imagePath) {
            Text(PersonAvatar.initial(of: name))
                .font(.system(size: size.fontSize, weight: .semibold, design: .rounded))
                .foregroundStyle(fill.ink)
                .frame(width: size.side, height: size.side)
                .background(fill.background)
        }
        .frame(width: size.side, height: size.side)
        .clipShape(Circle())
        .overlay {
            if imagePath != nil, color != nil {
                Circle().strokeBorder(fill.background, lineWidth: size.ring)
            }
        }
        .motion(.fwEase, value: color)
        .accessibilityHidden(true)
    }

    /// The first character as you'd see it, so 👩🏽‍🚀 or "Á" isn't cut in half.
    static func initial(of name: String) -> String {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let first = trimmed.first else { return "?" }
        return String(first).uppercased()
    }
}

/// A row of overlapping people (who'll see a photo, who reacted), each in their colour.
/// Decorative: pair it with their names in text.
struct PersonDots: View {
    struct Person: Identifiable, Hashable {
        let id: String
        let name: String
        let color: MemberColor?
    }

    let people: [Person]
    var size: CGFloat = 22
    var maxShown = 4
    /// The colour behind the dots (each dot is ringed in it so they read as separate).
    var ring: Color = .bg

    var body: some View {
        HStack(spacing: -size * 0.27) {
            ForEach(Array(people.prefix(maxShown).enumerated()), id: \.element.id) { index, person in
                let fill = MemberFill(person.color)
                Text(PersonAvatar.initial(of: person.name))
                    .font(.system(size: size * 0.5, weight: .semibold, design: .rounded))
                    .foregroundStyle(fill.ink)
                    .frame(width: size, height: size)
                    .background(fill.background, in: Circle())
                    .overlay(Circle().strokeBorder(ring, lineWidth: 2).padding(-2))
                    .zIndex(Double(maxShown - index))
                    .popIn(delay: Double(index) * 0.04)
            }
            if people.count > maxShown {
                Text("+\(people.count - maxShown)")
                    .font(.system(size: size * 0.55, weight: .semibold, design: .rounded))
                    .padding(.leading, size * 0.27 + 4)
            }
        }
        .accessibilityHidden(true)
    }
}
