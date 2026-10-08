import SwiftUI

/// How a group's photos are shown: as posts, or as a grid of thumbnails.
enum FeedLayout: Hashable {
    case feed, grid
}

/// One post in the group feed (the web app's PhotoCard): the photo, near-square with big rounded
/// corners, with a name tag in the poster's colour and the photo menu laid over it; then the
/// reactions, comments and your star; then the caption. Links push onto whichever navigation
/// stack shows it.
struct PhotoCard: View {
    let photo: Photo

    @Environment(GroupsStore.self) private var groups

    init(photo: Photo) {
        self.photo = photo
    }

    /// Feed photos are near-square, like the design: very tall or very wide ones are cropped
    /// (the viewer shows them whole).
    private var feedAspectRatio: CGFloat {
        min(max(photo.aspectRatio, 4.0 / 5.0), 5.0 / 4.0)
    }

    private var posterColor: MemberColor? {
        groups.colorOf(photo.uploader.id, in: photo.groupId)
    }

    private var commentsLabel: String {
        photo.commentCount == 1 ? "1 comment" : "\(Format.number(photo.commentCount)) comments"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            photoArea
                .padding(.horizontal, 8)

            HStack(alignment: .top, spacing: 6) {
                ReactionBar(photo: photo)
                    .frame(maxWidth: .infinity, alignment: .leading)
                HStack(spacing: 0) {
                    commentsLink
                    FavoriteButton(photo: photo)
                }
                .fixedSize()
            }
            .padding(.horizontal, 8)
            .padding(.top, 8)

            if let caption = photo.caption, !caption.isEmpty {
                CaptionText(text: caption)
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
            }

            if photo.commentCount > 1 {
                NavigationLink(value: AppRoute.photoComments(photo.id)) {
                    Text("View all \(Format.number(photo.commentCount)) comments")
                        .font(.subheadline)
                        .foregroundStyle(.sub)
                        .frame(minHeight: 32)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 16)
            }
        }
        // Everyone's colours: the poster's name tag and the dots on the reactions.
        .task(id: photo.groupId) { await groups.loadMembersIfNeeded(of: photo.groupId) }
    }

    private var photoArea: some View {
        let shape = RoundedRectangle(cornerRadius: 28, style: .continuous)

        return NavigationLink(value: AppRoute.photo(photo.id)) {
            Color.clear
                .aspectRatio(feedAspectRatio, contentMode: .fit)
                .overlay {
                    PhotoImage(photo: photo, variant: .medium)
                }
                .clipShape(shape)
                .contentShape(shape)
        }
        .buttonStyle(PressScaleButtonStyle(scale: 0.98))
        .accessibilityLabel("Photo by \(photo.uploader.displayName), \(Format.relative(photo.createdAt))")
        .accessibilityHint("Opens the photo")
        .overlay(alignment: .topLeading) {
            NameTag(
                name: photo.uploader.displayName,
                color: posterColor,
                detail: Format.shortAgo(photo.createdAt)
            )
            .padding(12)
            // Clear of the menu button in the other corner.
            .padding(.trailing, 56)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
        .overlay(alignment: .topTrailing) {
            PhotoMenu(photo: photo)
                .padding(6)
        }
    }

    private var commentsLink: some View {
        NavigationLink(value: AppRoute.photoComments(photo.id)) {
            HStack(spacing: 5) {
                Image(systemName: "bubble.left")
                    .font(.system(size: 20, weight: .medium))
                if photo.commentCount > 0 {
                    Text(Format.number(photo.commentCount))
                        .font(.system(.subheadline, design: .rounded, weight: .semibold))
                        .monospacedDigit()
                        .contentTransition(.numericText())
                }
            }
            .foregroundStyle(.fg)
            .padding(.horizontal, 6)
            .frame(minWidth: 44, minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleButtonStyle())
        .accessibilityLabel(commentsLabel)
        .accessibilityHint("Opens the comments")
    }
}

/// Square thumbnails, three across, each with a dot in the poster's colour and each opening the
/// photo viewer (on whichever stack shows it). New ones ease into place.
struct PhotoGrid: View {
    let photos: [Photo]

    @Environment(GroupsStore.self) private var groups

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 4), count: 3)

    init(photos: [Photo]) {
        self.photos = photos
    }

    /// The groups these photos are from (usually one), for their members' colours.
    private var groupIDs: [String] {
        Array(Set(photos.map(\.groupId))).sorted()
    }

    var body: some View {
        LazyVGrid(columns: columns, spacing: 4) {
            ForEach(Array(photos.enumerated()), id: \.element.id) { index, photo in
                NavigationLink(value: AppRoute.photo(photo.id)) {
                    PhotoTile(
                        photo: photo,
                        color: groups.colorOf(photo.uploader.id, in: photo.groupId),
                        showsDot: true
                    )
                }
                .buttonStyle(PressScaleButtonStyle(scale: 0.96))
                .listItemTransition(index: index)
            }
        }
        .motion(.fwEase, value: photos.map(\.id))
        .task(id: groupIDs) {
            for groupID in groupIDs {
                await groups.loadMembersIfNeeded(of: groupID)
            }
        }
    }
}

/// A caption cut to three lines, with "more" over the end of the last line to read the rest
/// (the web app's PhotoCaption). Aligned to the reading direction.
struct CaptionText: View {
    let text: String

    @State private var expanded = false
    /// Whether three lines cut it short (measured, so short captions never show "more").
    @State private var truncated = false

    init(text: String) {
        self.text = text
    }

    var body: some View {
        Text(text)
            .lineLimit(expanded ? nil : 3)
            .multilineTextAlignment(.leading)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                if !expanded { truncationProbe }
            }
            .overlay(alignment: .bottomTrailing) {
                if truncated && !expanded { moreButton }
            }
            .font(.subheadline)
            .foregroundStyle(.fg)
    }

    /// The whole caption, laid out unseen at the same width, to compare with what shows.
    private var truncationProbe: some View {
        GeometryReader { shown in
            let shownHeight = shown.size.height
            Text(text)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
                .frame(width: shown.size.width, alignment: .leading)
                .background {
                    GeometryReader { full in
                        Color.clear
                            .onAppear { measure(full: full.size.height, shown: shownHeight) }
                            .onChange(of: full.size.height) { _, height in measure(full: height, shown: shownHeight) }
                            .onChange(of: shownHeight) { _, height in measure(full: full.size.height, shown: height) }
                    }
                }
                .opacity(0)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private var moreButton: some View {
        Button("more") {
            withMotion(.fwQuick) { expanded = true }
        }
        .buttonStyle(.plain)
        .font(.subheadline.weight(.medium))
        .foregroundStyle(.sub)
        .padding(.leading, 40)
        .background {
            LinearGradient(
                stops: [
                    .init(color: Theme.bg.opacity(0), location: 0),
                    .init(color: Theme.bg, location: 0.4),
                ],
                startPoint: .leading,
                endPoint: .trailing
            )
        }
        .contentShape(Rectangle())
        // VoiceOver reads the whole caption already.
        .accessibilityHidden(true)
    }

    private func measure(full: CGFloat, shown: CGFloat) {
        let isCut = full > shown + 1
        if isCut != truncated { truncated = isCut }
    }
}

/// The end of a paged list (the web app's LoadMore). With `loadsWhenVisible` the next page loads
/// by itself as the row scrolls into view; otherwise it's a button. After a failed page it waits
/// for "Try again" instead of retrying in a loop.
struct LoadMoreRow: View {
    let title: String
    let isLoading: Bool
    let failed: Bool
    let loadsWhenVisible: Bool
    let action: () -> Void

    init(
        title: String,
        isLoading: Bool,
        failed: Bool,
        loadsWhenVisible: Bool = false,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.isLoading = isLoading
        self.failed = failed
        self.loadsWhenVisible = loadsWhenVisible
        self.action = action
    }

    var body: some View {
        Group {
            if failed && !isLoading {
                VStack(spacing: 12) {
                    Text("Couldn't load more. Check your connection.")
                        .font(.subheadline)
                        .foregroundStyle(.sub)
                        .multilineTextAlignment(.center)
                    Button("Try again", action: action)
                        .buttonStyle(.fwCompact(.secondary))
                }
                .padding(.vertical, 24)
                .padding(.horizontal, 16)
            } else if isLoading {
                ProgressView()
                    .frame(minHeight: 80)
                    .accessibilityLabel("Loading more")
            } else if loadsWhenVisible {
                // A separate view from the one above, so it appears (and loads) again when a page
                // has come in and the end of the list is still on screen.
                ProgressView()
                    .frame(minHeight: 80)
                    .onAppear(perform: action)
                    .accessibilityLabel("Loading more")
            } else {
                Button(title, action: action)
                    .buttonStyle(.fwCompact(.ghost))
                    .frame(minHeight: 80)
            }
        }
        .frame(maxWidth: .infinity)
    }
}
