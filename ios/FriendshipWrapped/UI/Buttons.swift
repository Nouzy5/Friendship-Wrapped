import SwiftUI

/// The main call to action: brand gradient with dark text (the web app's primary button).
struct BrandButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(Color.ink950)
            .frame(maxWidth: .infinity, minHeight: 50)
            .padding(.horizontal, 20)
            .background(LinearGradient.brandHorizontal, in: Capsule())
            .opacity(isEnabled ? 1 : 0.5)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}

/// A quieter full-width button for the second choice.
struct BrandSecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(.primary)
            .frame(maxWidth: .infinity, minHeight: 50)
            .padding(.horizontal, 20)
            .background(Color(.secondarySystemFill), in: Capsule())
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}

extension ButtonStyle where Self == BrandButtonStyle {
    static var brand: BrandButtonStyle { BrandButtonStyle() }
}

extension ButtonStyle where Self == BrandSecondaryButtonStyle {
    static var brandSecondary: BrandSecondaryButtonStyle { BrandSecondaryButtonStyle() }
}

/// A brand button that shows a spinner and a "…ing" label while its action runs.
struct PrimaryButton: View {
    let title: String
    var pendingTitle: String?
    var isPending = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if isPending {
                    ProgressView().tint(Color.ink950)
                }
                Text(isPending ? (pendingTitle ?? title) : title)
            }
        }
        .buttonStyle(.brand)
        .disabled(isPending)
    }
}
