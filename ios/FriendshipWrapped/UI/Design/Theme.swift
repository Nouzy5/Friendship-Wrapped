import SwiftUI
import UIKit

// The "Colour-coded" look (README → Redesign): black and white paper and ink, and one colour
// per friend. Colour only ever means a person; your own colour is your accent (the shutter,
// switches, your reactions). The web app's tokens live in client/src/index.css.

extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: 1
        )
    }

    /// A colour that follows light and dark mode (Settings → Appearance, or the device).
    init(light: UInt32, dark: UInt32) {
        self.init(uiColor: UIColor { traits in
            UIColor(hex: traits.userInterfaceStyle == .dark ? dark : light)
        })
    }
}

extension UIColor {
    convenience init(hex: UInt32) {
        self.init(
            red: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: 1
        )
    }
}

/// The screen's colours, as `.foregroundStyle(.sub)`, `.background(.surface)`, `Color.fg` and so on.
extension ShapeStyle where Self == Color {
    /// Paper: the page.
    static var bg: Color { Theme.bg }
    /// Ink: text and icons.
    static var fg: Color { Theme.fg }
    /// Pencil: secondary text.
    static var sub: Color { Theme.sub }
    /// Mist: panels, pills and fields on the page.
    static var surface: Color { Theme.surface }
    /// Hairlines between rows.
    static var line: Color { Theme.line }
    /// Things lifted above the page (menus, the segmented control's marker).
    static var raised: Color { Theme.raised }
    /// The primary button: black on light, white on dark.
    static var inverse: Color { Theme.inverse }
    static var onInverse: Color { Theme.onInverse }
    /// A switch that's off, and people without a colour.
    static var switchOff: Color { Theme.switchOff }
}

enum Theme {
    static let bg = Color(light: 0xFFFFFF, dark: 0x000000)
    static let fg = Color(light: 0x000000, dark: 0xFFFFFF)
    static let sub = Color(light: 0x6E6E6A, dark: 0xA3A39E)
    static let surface = Color(light: 0xF2F2F0, dark: 0x1C1C1B)
    static let line = Color(light: 0xE0E0DC, dark: 0x2E2E2C)
    static let raised = Color(light: 0xFFFFFF, dark: 0x3A3A38)
    static let inverse = Color(light: 0x000000, dark: 0xFFFFFF)
    static let onInverse = Color(light: 0xFFFFFF, dark: 0x000000)
    static let switchOff = Color(light: 0xD0D0CC, dark: 0x3A3A38)

    /// For UIKit (navigation bars): the same paper and ink.
    static let uiBackground = UIColor { $0.userInterfaceStyle == .dark ? UIColor(hex: 0x000000) : UIColor(hex: 0xFFFFFF) }
    static let uiInk = UIColor { $0.userInterfaceStyle == .dark ? UIColor(hex: 0xFFFFFF) : UIColor(hex: 0x000000) }

    /// Big screen titles and headings: rounded and a little wide, like the web app's Fredoka.
    static func title(_ style: Font.TextStyle = .largeTitle) -> Font {
        .system(style, design: .rounded, weight: .semibold).width(.expanded)
    }

    /// Wrapped and other big moments: wide and bold, at a fixed size (they're laid out to fit).
    static func display(size: CGFloat) -> Font {
        .system(size: size, weight: .bold, design: .rounded).width(.expanded)
    }

    /// Rounds the navigation bars' titles to match (back buttons stay ink, not the accent).
    @MainActor
    static func configureNavigationBars() {
        func rounded(_ style: UIFont.TextStyle, weight: UIFont.Weight) -> UIFont {
            let base = UIFont.preferredFont(forTextStyle: style)
            let font = UIFont.systemFont(ofSize: base.pointSize, weight: weight)
            guard let descriptor = font.fontDescriptor.withDesign(.rounded) else { return font }
            return UIFontMetrics(forTextStyle: style).scaledFont(for: UIFont(descriptor: descriptor, size: 0))
        }

        let appearance = UINavigationBarAppearance()
        appearance.configureWithOpaqueBackground()
        appearance.backgroundColor = uiBackground
        appearance.shadowColor = .clear
        appearance.titleTextAttributes = [.foregroundColor: uiInk, .font: rounded(.headline, weight: .semibold)]
        appearance.largeTitleTextAttributes = [.foregroundColor: uiInk, .font: rounded(.largeTitle, weight: .semibold)]

        let bar = UINavigationBar.appearance()
        bar.standardAppearance = appearance
        bar.compactAppearance = appearance
        bar.scrollEdgeAppearance = appearance
        bar.tintColor = uiInk
    }
}

/// Everyone in a group has one of these; no two people in a group share one. The order matters:
/// new members get the first free one (`server/src/modules/groups/group.dto.ts`).
enum MemberColor: String, CaseIterable, Codable, Identifiable, Hashable {
    case lime = "LIME"
    case cobalt = "COBALT"
    case tomato = "TOMATO"
    case sun = "SUN"
    case bubblegum = "BUBBLEGUM"
    case mint = "MINT"
    case lilac = "LILAC"
    case plum = "PLUM"
    case sky = "SKY"
    case forest = "FOREST"
    case tangerine = "TANGERINE"
    case cherry = "CHERRY"

    var id: String { rawValue }

    var name: String {
        switch self {
        case .lime: return "Lime"
        case .cobalt: return "Cobalt"
        case .tomato: return "Tomato"
        case .sun: return "Sun"
        case .bubblegum: return "Bubblegum"
        case .mint: return "Mint"
        case .lilac: return "Lilac"
        case .plum: return "Plum"
        case .sky: return "Sky"
        case .forest: return "Forest"
        case .tangerine: return "Tangerine"
        case .cherry: return "Cherry"
        }
    }

    var hex: UInt32 {
        switch self {
        case .lime: return 0xB6EE3A
        case .cobalt: return 0x3355FF
        case .tomato: return 0xFF5533
        case .sun: return 0xFFC629
        case .bubblegum: return 0xFF9EDB
        case .mint: return 0x35D6A5
        case .lilac: return 0xB49BFF
        case .plum: return 0x8E3BD9
        case .sky: return 0x5BC8F5
        case .forest: return 0x1A7A50
        case .tangerine: return 0xFF9A1F
        case .cherry: return 0xC2185B
        }
    }

    /// Text that reads on the fill (at least 4.5:1): white on the dark ones, black on the rest.
    var inkIsWhite: Bool {
        switch self {
        case .cobalt, .plum, .forest, .cherry: return true
        default: return false
        }
    }

    var fill: Color { Color(hex: hex) }
    var ink: Color { inkIsWhite ? .white : .black }

    /// The five colours of the app's mark, in order.
    static let markStripes: [MemberColor] = [.lime, .cobalt, .tomato, .sun, .bubblegum]
}

extension KeyedDecodingContainer {
    /// A colour from the server, or nil when it's missing or one this version of the app
    /// doesn't know (so a new colour never stops a whole group or photo from loading).
    func decodeMemberColor(forKey key: Key) -> MemberColor? {
        guard let raw = try? decodeIfPresent(String.self, forKey: key) else { return nil }
        return MemberColor(rawValue: raw)
    }
}

/// What to paint for a person: their colour and the ink that reads on it. People without one
/// (beyond twelve members, or who have left the group) are neutral.
struct MemberFill: Equatable {
    let background: Color
    let ink: Color

    init(_ color: MemberColor?) {
        if let color {
            background = color.fill
            ink = color.ink
        } else {
            background = Theme.switchOff
            ink = Theme.fg
        }
    }
}

private struct AccentColorKey: EnvironmentKey {
    static let defaultValue: MemberColor? = nil
}

extension EnvironmentValues {
    /// Your colour in the group you're looking at (set at the root from the current group).
    /// Nil before you have a group: the accent is then Cobalt.
    var accentMemberColor: MemberColor? {
        get { self[AccentColorKey.self] }
        set { self[AccentColorKey.self] = newValue }
    }

    /// The accent to paint with: your colour, or Cobalt.
    var accent: MemberFill {
        MemberFill(accentMemberColor ?? .cobalt)
    }
}
