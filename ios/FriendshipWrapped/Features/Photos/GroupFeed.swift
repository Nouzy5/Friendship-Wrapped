import SwiftUI

/// How a group's photos are shown: as posts, or as a grid of thumbnails.
enum FeedLayout: Hashable {
    case feed, grid
}

/// One post in the group feed: who shared it and when, the photo, reactions, comments and caption.
/// Links push onto whichever navigation stack shows it.
struct PhotoCard: View {
    let photo: Photo

    /// Feed photos keep their shape within limits: very tall or very wide ones are cropped
    /// (the viewer shows them whole).
    private var feedAspectRatio: CGFloat {
        min(max(photo.aspectRatio, 3.0 / 4.0), 1.91)
    }

    private var commentsLabel: String {
        photo.commentCount == 1 ? "1 comment" : "\(photo.commentCount) comments"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            PhotoAttribution(uploader: photo.uploader, date: photo.createdAt)

            NavigationLink(value: AppRoute.photo(photo.id)) {
                Color(.tertiarySystemFill)
                    .aspectRatio(feedAspectRatio, contentMode: .fit)
                    .overlay {
                        AuthenticatedImage(path: photo.imageUrls.medium) {
                            Color.clear
                        }
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(photo.altText)

            HStack(spacing: 8) {
                ReactionBar(photo: photo)
                Spacer(minLength: 0)
                NavigationLink(value: AppRoute.photoComments(photo.id)) {
                    HStack(spacing: 4) {
                        Image(systemName: "bubble.right")
                        if photo.commentCount > 0 {
                            Text("\(photo.commentCount)")
                                .fontWeight(.semibold)
                                .monospacedDigit()
                        }
                    }
                    .font(.subheadline)
                    .padding(.horizontal, 8)
                    .frame(minHeight: 34)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .accessibilityLabel(commentsLabel)
            }

            if let caption = photo.caption {
                CaptionText(text: caption)
            }
        }
        .padding(.vertical, 6)
    }
}

/// Square thumbnails, three across, each opening the photo viewer (on whichever stack shows it).
struct PhotoGrid: View {
    let photos: [Photo]

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 2), count: 3)

    var body: some View {
        LazyVGrid(columns: columns, spacing: 2) {
            ForEach(photos) { photo in
                NavigationLink(value: AppRoute.photo(photo.id)) {
                    PhotoThumbnail(photo: photo)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(photo.altText)
            }
        }
    }
}

/// A square, centre-cropped thumbnail.
struct PhotoThumbnail: View {
    let photo: Photo

    var body: some View {
        Color(.tertiarySystemFill)
            .aspectRatio(1, contentMode: .fit)
            .overlay {
                AuthenticatedImage(path: photo.imageUrls.thumbnail) {
                    Color.clear
                }
            }
            .clipped()
            .contentShape(Rectangle())
    }
}

/// Who posted a photo, and when.
struct PhotoAttribution: View {
    let uploader: UserSummary
    let date: Date
    /// "5 Oct 2026 at 22:59" instead of "2 hours ago".
    var exactTime = false
    /// The group the photo was shared with.
    var group: Photo.GroupInfo?

    private var subtitle: String {
        let when = exactTime ? Format.dateTime(date) : Format.relative(date)
        guard let group else { return when }
        return "\(when) · \(group.emoji) \(group.name)"
    }

    var body: some View {
        HStack(spacing: 12) {
            AvatarView(name: uploader.displayName, seed: uploader.id, imagePath: uploader.avatarUrl)
            VStack(alignment: .leading, spacing: 2) {
                Text(uploader.displayName)
                    .font(.headline)
                    .lineLimit(1)
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
    }
}

/// A caption cut to three lines, with "more" to read the rest.
struct CaptionText: View {
    let text: String

    @State private var expanded = false

    private var isLong: Bool {
        text.count > 140 || text.filter { $0 == "\n" }.count >= 3
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(text)
                .font(.subheadline)
                .lineLimit(expanded ? nil : 3)
                .frame(maxWidth: .infinity, alignment: .leading)
            if isLong && !expanded {
                Button("more") {
                    withAnimation(.easeOut(duration: 0.2)) { expanded = true }
                }
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.secondary)
            }
        }
    }
}

/// "Load more" at the end of a list: a spinner while loading, a retry button if it failed.
struct LoadMoreRow: View {
    let title: String
    let isLoading: Bool
    let failed: Bool
    let action: () -> Void

    var body: some View {
        HStack {
            Spacer()
            if isLoading {
                ProgressView()
            } else {
                Button(failed ? "Couldn't load. Try again" : title, action: action)
                    .font(.subheadline)
            }
            Spacer()
        }
        .padding(.vertical, 8)
    }
}
