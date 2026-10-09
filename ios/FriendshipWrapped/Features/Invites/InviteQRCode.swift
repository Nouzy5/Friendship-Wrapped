import CoreImage
import CoreImage.CIFilterBuiltins
import SwiftUI
import UIKit

/// A QR code for an invite link. It's always black on white, whatever the theme: scanners
/// expect dark modules on a light ground, and inverted codes don't read reliably.
struct InviteQRCode: View {
    let url: URL
    let groupName: String
    var side: CGFloat = 192

    var body: some View {
        if let image = Self.image(for: url.absoluteString) {
            Image(uiImage: image)
                .interpolation(.none)
                .resizable()
                .scaledToFit()
                .frame(width: side, height: side)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .accessibilityElement()
                .accessibilityLabel("QR code for the invite link to \(groupName)")
        }
    }

    /// Pixels per module, and the blank margin scanners need: four modules on every side.
    private static let moduleScale: CGFloat = 10
    private static let quietZoneModules: CGFloat = 4

    static func image(for text: String) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(text.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage else { return nil }

        // The filter makes one pixel per module. Scaling up without smoothing keeps the edges sharp.
        let code = output.transformed(by: CGAffineTransform(scaleX: moduleScale, y: moduleScale))
        let margin = quietZoneModules * moduleScale
        let paper = CIImage(color: .white).cropped(to: code.extent.insetBy(dx: -margin, dy: -margin))
        let framed = code.composited(over: paper)

        guard let cgImage = CIContext().createCGImage(framed, from: framed.extent) else { return nil }
        return UIImage(cgImage: cgImage)
    }
}
