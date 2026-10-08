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
    /// The path `image` was loaded from. The view can be handed a new path while keeping its
    /// state (swiping to the next photo), and must never show the previous picture for it.
    @State private var imagePath: String?

    init(path: String?, contentMode: ContentMode = .fill, @ViewBuilder placeholder: () -> Placeholder) {
        self.path = path
        self.contentMode = contentMode
        self.placeholder = placeholder()
        // Already-loaded images show straight away, with no placeholder flash while scrolling.
        let cached = path.flatMap { ImageCache.shared.image(for: $0) }
        _image = State(initialValue: cached)
        _imagePath = State(initialValue: cached == nil ? nil : path)
    }

    /// This path's picture: the one loaded, or straight from the cache (e.g. prefetched) so a
    /// new path doesn't flash the placeholder.
    private var shownImage: UIImage? {
        if let image, imagePath == path { return image }
        return path.flatMap { ImageCache.shared.image(for: $0) }
    }

    var body: some View {
        ZStack {
            if let shownImage {
                Image(uiImage: shownImage)
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
            imagePath = nil
            return
        }
        // On failure keep the placeholder (e.g. initials for a profile picture). A load for a
        // path the view has since moved on from is dropped.
        if let loaded = await ImageLoader.load(path), !Task.isCancelled {
            image = loaded
            imagePath = path
        }
    }
}

/// Fetches, decodes and caches API images.
enum ImageLoader {
    static func load(_ path: String) async -> UIImage? {
        if let cached = ImageCache.shared.image(for: path) { return cached }
        guard
            let data = try? await APIClient.shared.imageData(atServerPath: path),
            let decoded = UIImage(data: data)
        else { return nil }
        let prepared = await decoded.byPreparingForDisplay() ?? decoded
        ImageCache.shared.insert(prepared, for: path)
        return prepared
    }

    /// Warms the cache, e.g. for the photos either side of the one on screen.
    static func prefetch(_ path: String) {
        guard ImageCache.shared.image(for: path) == nil else { return }
        Task.detached(priority: .utility) {
            _ = await ImageLoader.load(path)
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
