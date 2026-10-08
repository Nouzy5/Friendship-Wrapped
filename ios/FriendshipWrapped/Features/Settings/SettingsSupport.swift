import PhotosUI
import SwiftUI
import UIKit

// Pieces shared by the Settings screens and group settings.

/// A small form in a sheet (your name, username or password, a group's name and emoji,
/// deleting your account): a title, Cancel, and the fields on the page. Cancel and swiping the
/// sheet away are off while it saves.
struct SettingsFormSheet<Content: View>: View {
    let title: String
    var isBusy: Bool
    let content: Content

    @Environment(\.dismiss) private var dismiss

    init(title: String, isBusy: Bool = false, @ViewBuilder content: () -> Content) {
        self.title = title
        self.isBusy = isBusy
        self.content = content()
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    content
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)
                .padding(.bottom, 32)
            }
            .screenBackground()
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(isBusy)
                }
            }
        }
        .interactiveDismissDisabled(isBusy)
    }
}

/// A list that couldn't load: what went wrong and a way to try again.
struct SettingsLoadError: View {
    let message: String
    let retry: () async -> Void

    @State private var isRetrying = false

    init(_ message: String, retry: @escaping () async -> Void) {
        self.message = message
        self.retry = retry
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            InlineAlert(message: message)
            Button(isRetrying ? "Trying again…" : "Try again") {
                Task {
                    isRetrying = true
                    await retry()
                    isRetrying = false
                }
            }
            .buttonStyle(.fwCompact(.secondary))
            .disabled(isRetrying)
        }
    }
}

/// A photo picked for a profile or group picture, as a square JPEG: the middle of the photo,
/// at most `side` pixels across (the server crops and shrinks it again anyway).
enum SquarePhotoUpload {
    static func jpeg(from item: PhotosPickerItem, side: CGFloat = 1024) async -> Data? {
        guard let data = try? await item.loadTransferable(type: Data.self) else { return nil }
        return await Task.detached(priority: .userInitiated) {
            SquarePhotoUpload.squareJPEG(from: data, side: side)
        }.value
    }

    /// The image's centre square (orientation applied), scaled to at most `side` pixels.
    static func squareJPEG(from data: Data, side: CGFloat, quality: CGFloat = 0.88) -> Data? {
        guard let image = UIImage(data: data) else { return nil }
        let pixelWidth = image.size.width * image.scale
        let pixelHeight = image.size.height * image.scale
        let crop = min(pixelWidth, pixelHeight)
        guard crop > 0 else { return nil }

        let target = min(side, crop).rounded()
        let factor = target / crop
        let drawSize = CGSize(width: pixelWidth * factor, height: pixelHeight * factor)
        let origin = CGPoint(x: (target - drawSize.width) / 2, y: (target - drawSize.height) / 2)

        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let rendered = UIGraphicsImageRenderer(size: CGSize(width: target, height: target), format: format).image { _ in
            image.draw(in: CGRect(origin: origin, size: drawSize))
        }
        return rendered.jpegData(compressionQuality: quality)
    }
}
