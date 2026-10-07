import SwiftUI

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

    // Same palette as the web client's Tailwind theme.
    static let brandRose = Color(hex: 0xFF3D7F)
    static let brandOrange = Color(hex: 0xFF8A3D)
    static let brandGold = Color(hex: 0xFFC93D)
    static let ink950 = Color(hex: 0x0C0A14)
    static let ink50 = Color(hex: 0xF7F5FC)
}

extension LinearGradient {
    /// The "Wrapped" sunset gradient, as in the app icon.
    static let brand = LinearGradient(
        stops: [
            .init(color: .brandRose, location: 0),
            .init(color: .brandOrange, location: 0.55),
            .init(color: .brandGold, location: 1),
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    /// Left to right, for buttons and the wordmark.
    static let brandHorizontal = LinearGradient(
        colors: [.brandRose, .brandOrange, .brandGold],
        startPoint: .leading,
        endPoint: .trailing
    )
}

/// The soft sunset glow behind the welcome screen (the web app's RootLayout backdrop).
struct BrandGlow: View {
    var body: some View {
        LinearGradient.brand
            .opacity(0.3)
            .frame(height: 360)
            .blur(radius: 90)
            .offset(y: -200)
            .frame(maxHeight: .infinity, alignment: .top)
            .ignoresSafeArea()
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}
