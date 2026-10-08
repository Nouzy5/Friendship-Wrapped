import SwiftUI

/// A photo at a size, loaded with the session (photos are served behind it), on a grey tile
/// while it loads. Minds Data saver for the full size.
struct PhotoImage: View {
    let photo: Photo
    var variant: Photo.Variant = .medium
    var contentMode: ContentMode = .fill

    var body: some View {
        AuthenticatedImage(path: photo.imagePath(variant), contentMode: contentMode) {
            Rectangle().fill(.surface)
        }
        .accessibilityLabel(photo.altText)
    }
}

/// A square photo for grids (timeline, albums, favorites, the feed's grid). With `color`, a dot
/// in the poster's colour sits in its corner.
struct PhotoTile: View {
    let photo: Photo
    var color: MemberColor?
    var showsDot = false
    var cornerRadius: CGFloat = 14

    var body: some View {
        Color.clear
            .aspectRatio(1, contentMode: .fit)
            .overlay {
                PhotoImage(photo: photo, variant: .thumbnail)
            }
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .overlay(alignment: .bottomLeading) {
                if showsDot {
                    Circle()
                        .fill(MemberFill(color).background)
                        .frame(width: 14, height: 14)
                        .overlay(Circle().strokeBorder(.bg, lineWidth: 2).padding(-2))
                        .padding(8)
                        .accessibilityHidden(true)
                }
            }
            .contentShape(Rectangle())
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Photo by \(photo.uploader.displayName), \(Format.dayMonth(photo.createdAt))")
    }
}
