import SwiftUI
import UIKit

/// Settings → Appearance → Theme, applied to the app's windows. A change crossfades the whole
/// screen (the web app's view transition), unless motion is reduced.
@MainActor
enum ThemeApplier {
    static func apply(_ theme: DeviceSettings.ThemeChoice, animated: Bool) {
        let style: UIUserInterfaceStyle
        switch theme {
        case .system: style = .unspecified
        case .light: style = .light
        case .dark: style = .dark
        }
        for scene in UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }) {
            for window in scene.windows where window.overrideUserInterfaceStyle != style {
                if animated && !Motion.isReduced {
                    UIView.transition(with: window, duration: 0.35, options: [.transitionCrossDissolve, .allowUserInteraction]) {
                        window.overrideUserInterfaceStyle = style
                    }
                } else {
                    window.overrideUserInterfaceStyle = style
                }
            }
        }
    }
}

/// Settings → Appearance → App icon: the Home Screen icon. iOS confirms each change with an
/// alert of its own, so it only changes when you choose (here, or a new colour of yours while
/// "Your colour" is chosen), not when you switch groups.
@MainActor
enum AppIconApplier {
    /// The alternate icon's name in the asset catalog; nil is the primary (Classic) icon.
    static func iconName(for choice: DeviceSettings.AppIconChoice, color: MemberColor?) -> String? {
        switch choice {
        case .classic: return nil
        case .night: return "AppIcon-Night"
        case .yours: return "AppIcon-\((color ?? .cobalt).name)"
        }
    }

    static func apply(_ choice: DeviceSettings.AppIconChoice, color: MemberColor?) {
        let application = UIApplication.shared
        guard application.supportsAlternateIcons else { return }
        let name = iconName(for: choice, color: color)
        guard application.alternateIconName != name else { return }
        application.setAlternateIconName(name) { _ in
            // Rarely fails (e.g. mid-launch); the setting still shows the choice and it's
            // applied again next time it's chosen.
        }
    }
}

/// The app icons drawn in SwiftUI, for choosing between them (the same artwork as the icons in
/// the asset catalog and the web app's favicon).
struct AppIconArtwork: View {
    let choice: DeviceSettings.AppIconChoice
    var color: MemberColor?
    var size: CGFloat = 64

    /// The Night icon's bars, on a 64-point grid.
    private static let barHeights: [CGFloat] = [16, 30, 22, 36, 26]

    var body: some View {
        let unit = size / 64

        ZStack {
            switch choice {
            case .classic:
                HStack(spacing: 0) {
                    ForEach(MemberColor.markStripes) { stripe in
                        Rectangle().fill(stripe.fill)
                    }
                }
            case .night:
                Rectangle().fill(.black)
                HStack(alignment: .bottom, spacing: 2.4 * unit) {
                    ForEach(0..<MemberColor.markStripes.count, id: \.self) { index in
                        RoundedRectangle(cornerRadius: 2 * unit, style: .continuous)
                            .fill(MemberColor.markStripes[index].fill)
                            .frame(width: 6 * unit, height: Self.barHeights[index] * unit)
                    }
                }
                .frame(maxHeight: .infinity, alignment: .bottom)
                .padding(.bottom, 14 * unit)
            case .yours:
                let yours = color ?? .cobalt
                Rectangle().fill(yours.fill)
                Circle()
                    .strokeBorder(yours.ink, lineWidth: 4 * unit)
                    .frame(width: 30 * unit, height: 30 * unit)
                Circle()
                    .fill(yours.ink)
                    .frame(width: 15 * unit, height: 15 * unit)
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: 18 * unit, style: .continuous))
        .accessibilityHidden(true)
    }
}
