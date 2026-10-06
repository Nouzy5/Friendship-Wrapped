import SwiftUI

/// The app icon drawn in SwiftUI: the same artwork as the web favicon, on a 64-point grid.
struct AppLogo: View {
    var size: CGFloat = 64

    var body: some View {
        let unit = size / 64

        ZStack {
            RoundedRectangle(cornerRadius: 16 * unit, style: .continuous)
                .fill(LinearGradient.brand)

            // Camera body
            RoundedRectangle(cornerRadius: 6 * unit, style: .continuous)
                .stroke(Color.ink950, lineWidth: 4 * unit)
                .frame(width: 36 * unit, height: 28 * unit)
                .position(x: 32 * unit, y: 34 * unit)

            // Lens
            Circle()
                .stroke(Color.ink950, lineWidth: 4 * unit)
                .frame(width: 14 * unit, height: 14 * unit)
                .position(x: 32 * unit, y: 34 * unit)

            // Viewfinder bump
            RoundedRectangle(cornerRadius: 3 * unit, style: .continuous)
                .fill(Color.ink950)
                .frame(width: 16 * unit, height: 8 * unit)
                .position(x: 32 * unit, y: 18 * unit)
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

/// "Friendship Wrapped", with "Wrapped" in the brand gradient.
struct Wordmark: View {
    var size: CGFloat = 32

    var body: some View {
        Text("Friendship \(Text("Wrapped").foregroundStyle(LinearGradient.brandHorizontal))")
            .font(.system(size: size, weight: .black))
    }
}

#Preview {
    VStack(spacing: 16) {
        AppLogo(size: 96)
        Wordmark()
    }
}
