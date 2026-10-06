import SwiftUI
import UIKit

/// Decoded images from the API, kept in memory. Cleared on sign-out.
final class ImageCache {
    static let shared = ImageCache()

    private let cache: NSCache<NSString, UIImage> = {
        let cache = NSCache<NSString, UIImage>()
        cache.totalCostLimit = 100 * 1024 * 1024
        return cache
    }()

    func image(for path: String) -> UIImage? {
        cache.object(forKey: path as NSString)
    }

    func insert(_ image: UIImage, for path: String) {
        let pixels = image.size.width * image.scale * image.size.height * image.scale
        cache.setObject(image, forKey: path as NSString, cost: Int(pixels * 4))
    }

    func removeAll() {
        cache.removeAllObjects()
    }
}

/// An image the API serves behind the session (photos, profile pictures).
/// AsyncImage can't send the session cookie, so this loads through `APIClient`.
struct AuthenticatedImage<Placeholder: View>: View {
    let path: String?
    let contentMode: ContentMode
    private let placeholder: Placeholder

    @State private var image: UIImage?

    init(path: String?, contentMode: ContentMode = .fill, @ViewBuilder placeholder: () -> Placeholder) {
        self.path = path
        self.contentMode = contentMode
        self.placeholder = placeholder()
        // Already-loaded images show straight away, with no placeholder flash while scrolling.
        _image = State(initialValue: path.flatMap { ImageCache.shared.image(for: $0) })
    }

    var body: some View {
        ZStack {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: contentMode)
            } else {
                placeholder
            }
        }
        .task(id: path) { await load() }
    }

    private func load() async {
        guard let path else {
            image = nil
            return
        }
        if let cached = ImageCache.shared.image(for: path) {
            image = cached
            return
        }
        do {
            let data = try await APIClient.shared.imageData(atServerPath: path)
            guard let decoded = UIImage(data: data) else { return }
            let prepared = await decoded.byPreparingForDisplay() ?? decoded
            ImageCache.shared.insert(prepared, for: path)
            image = prepared
        } catch {
            // Keep the placeholder (e.g. initials for a profile picture).
        }
    }
}

extension UIImage {
    /// A JPEG at most `maxDimension` pixels on its longest side, with the orientation applied.
    /// The server takes JPEG, PNG, WebP or AVIF but not HEIC (the iPhone camera's default),
    /// and stores photos at 2560 px at most anyway, so this also keeps uploads small.
    func jpegForUpload(maxDimension: CGFloat, quality: CGFloat = 0.88) -> Data? {
        let pixelWidth = size.width * scale
        let pixelHeight = size.height * scale
        guard pixelWidth > 0, pixelHeight > 0 else { return nil }

        let factor = min(1, maxDimension / max(pixelWidth, pixelHeight))
        let target = CGSize(width: (pixelWidth * factor).rounded(), height: (pixelHeight * factor).rounded())

        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let resized = UIGraphicsImageRenderer(size: target, format: format).image { _ in
            draw(in: CGRect(origin: .zero, size: target))
        }
        return resized.jpegData(compressionQuality: quality)
    }
}
