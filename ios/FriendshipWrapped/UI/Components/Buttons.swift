import SwiftUI

/// primary: black on light, white on dark. accent: your own colour (posting a photo, turning
/// something on). secondary: a grey pill. ghost: just the label. There's no red: colour only
/// ever means a person, so destructive actions say what they do and ask first.
enum FWButtonVariant {
    case primary, accent, secondary, ghost
}

struct FWButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accent) private var accent

    var variant: FWButtonVariant = .primary
    /// Stretches across its container (forms, sheets); off for buttons inside a row.
    var fullWidth = true

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(.callout, design: .rounded, weight: .semibold))
            .foregroundStyle(foreground)
            .padding(.horizontal, 20)
            .frame(maxWidth: fullWidth ? .infinity : nil, minHeight: 48)
            .background(background, in: Capsule())
            .contentShape(Capsule())
            .opacity(isEnabled ? (configuration.isPressed && variant == .ghost ? 0.6 : 1) : 0.4)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .motion(.fwQuick, value: configuration.isPressed)
    }

    private var foreground: Color {
        switch variant {
        case .primary: return Theme.onInverse
        case .accent: return accent.ink
        case .secondary, .ghost: return Theme.fg
        }
    }

    private var background: Color {
        switch variant {
        case .primary: return Theme.inverse
        case .accent: return accent.background
        case .secondary: return Theme.surface
        case .ghost: return .clear
        }
    }
}

extension ButtonStyle where Self == FWButtonStyle {
    static var fwPrimary: FWButtonStyle { FWButtonStyle(variant: .primary) }
    static var fwAccent: FWButtonStyle { FWButtonStyle(variant: .accent) }
    static var fwSecondary: FWButtonStyle { FWButtonStyle(variant: .secondary) }
    static var fwGhost: FWButtonStyle { FWButtonStyle(variant: .ghost) }

    /// A pill that's only as wide as its label, e.g. "Edit profile" in a row.
    static func fwCompact(_ variant: FWButtonVariant) -> FWButtonStyle {
        FWButtonStyle(variant: variant, fullWidth: false)
    }
}

/// A button that shows a spinner and a "…ing" label while its action runs.
struct PrimaryButton: View {
    let title: String
    var pendingTitle: String?
    var isPending = false
    var variant: FWButtonVariant = .primary
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if isPending {
                    ProgressView()
                        .controlSize(.small)
                        .tint(variant == .primary ? Theme.onInverse : Theme.fg)
                }
                Text(isPending ? (pendingTitle ?? title) : title)
            }
        }
        .buttonStyle(FWButtonStyle(variant: variant))
        .disabled(isPending)
    }
}

/// A round 44-point icon button for headers and photo overlays.
struct IconButton: View {
    let systemImage: String
    let label: String
    /// "On" (e.g. a favorited star) is filled in your colour.
    var isOn = false
    var action: () -> Void

    @Environment(\.accent) private var accent

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 20, weight: .medium))
                .foregroundStyle(isOn ? accent.background : Theme.fg)
                .frame(width: 44, height: 44)
                .contentShape(Circle())
        }
        .buttonStyle(PressScaleButtonStyle())
        .accessibilityLabel(label)
    }
}

/// Shrinks a little while pressed, springing back: for cards, chips and icons.
struct PressScaleButtonStyle: ButtonStyle {
    var scale: CGFloat = 0.92

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? scale : 1)
            .motion(.fwQuick, value: configuration.isPressed)
    }
}

/// A grey pill chip that can be selected (filters, "Taken by"): selected is ink on paper inverted.
struct ChipButtonStyle: ButtonStyle {
    var isSelected: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(.subheadline, design: .rounded, weight: isSelected ? .semibold : .medium))
            .foregroundStyle(isSelected ? Theme.onInverse : Theme.fg)
            .padding(.horizontal, 14)
            .frame(minHeight: 44)
            .background(isSelected ? Theme.inverse : Theme.surface, in: Capsule())
            .scaleEffect(configuration.isPressed ? 0.95 : 1)
            .motion(.fwQuick, value: configuration.isPressed)
            .motion(.fwQuick, value: isSelected)
    }
}
