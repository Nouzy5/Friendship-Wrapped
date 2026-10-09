import SwiftUI

/// One photo, large (the web app's PhotoViewer): who posted it, in their colour; when and where;
/// its caption, reactions and comments; your star and the photo menu in the navigation bar.
/// Swiping or the arrows step through the group's feed (left = newer, as if scrolling the feed
/// up), the next photo sliding in from its side. Tapping the photo shows it full size.
struct PhotoDetailView: View {
    /// Opens with the comments in view (a feed card's comment button).
    let scrollToComments: Bool

    @Environment(PhotosStore.self) private var photos
    @Environment(GroupsStore.self) private var groups
    @Environment(AppRouter.self) private var router
    @Environment(\.dismiss) private var dismiss

    private enum StepDirection {
        case newer, older
    }

    /// The photo on screen; changes as you step through the feed.
    @State private var currentID: String
    @State private var thread: CommentThread
    /// Kept so the screen doesn't blank out while it closes after a delete.
    @State private var lastShown: Photo?
    @State private var failure: APIError?
    @State private var didScrollToComments = false
    /// Which side the photo you step to comes in from.
    @State private var stepDirection: StepDirection = .older
    @State private var fullSizePhoto: Photo?
    @State private var reactionsPhoto: Photo?
    @State private var menuRequest: PhotoMenuRequest?

    init(photoID: String, scrollToComments: Bool = false) {
        self.scrollToComments = scrollToComments
        _currentID = State(initialValue: photoID)
        _thread = State(initialValue: CommentThread(photoID: photoID))
    }

    private var photo: Photo? {
        photos.photo(currentID) ?? (lastShown?.id == currentID ? lastShown : nil)
    }

    var body: some View {
        ZStack {
            if let photo {
                viewer(photo)
                    .id(photo.id)
                    .transition(slide)
            } else if let failure {
                failureView(failure)
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
        .background(Theme.bg.ignoresSafeArea())
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                if let photo {
                    FavoriteButton(photo: photo)
                    PhotoMenuButton(photo: photo, style: .toolbar, request: $menuRequest)
                }
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            composer
        }
        .task(id: currentID) { await load() }
        .sheet(item: $reactionsPhoto) { photo in
            ReactionsSheet(photoID: photo.id, groupID: photo.groupId)
        }
        .fullScreenCover(item: $fullSizePhoto) { photo in
            FullSizePhotoView(photo: photo)
        }
    }

    /// The next photo slides in from the side it's on; the one you leave fades.
    private var slide: AnyTransition {
        .asymmetric(
            insertion: .move(edge: stepDirection == .older ? .trailing : .leading).combined(with: .opacity),
            removal: .opacity
        )
    }

    @ViewBuilder private var composer: some View {
        if let photo, photo.canInteract {
            // The photo is captured now: by the time the comment is saved you may have swiped on.
            CommentComposer(thread: thread) { [photoID = thread.photoID] in
                photos.adjustCommentCount(of: photoID, by: 1)
            }
            // A fresh, empty composer for each photo you step to.
            .id(currentID)
        }
    }

    private func viewer(_ photo: Photo) -> some View {
        GeometryReader { geometry in
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        photoView(photo, in: geometry.size)
                        details(photo)
                        CommentsList(
                            thread: thread,
                            groupID: photo.groupId,
                            commentCount: photo.commentCount,
                            canInteract: photo.canInteract
                        ) { [photoID = thread.photoID] delta in
                            photos.adjustCommentCount(of: photoID, by: delta)
                        }
                        .padding(.horizontal, 8)
                        .padding(.top, 8)
                        .id("comments")
                    }
                    .padding(.horizontal, 8)
                    .padding(.top, 8)
                    .padding(.bottom, 24)
                }
                .scrollDismissesKeyboard(.interactively)
                .refreshable { await load() }
                .onAppear {
                    if thread.phase == .loaded { revealComments(proxy) }
                }
                .onChange(of: thread.phase) { _, phase in
                    if phase == .loaded { revealComments(proxy) }
                }
            }
        }
        .task(id: photo.groupId) { await groups.loadMembersIfNeeded(of: photo.groupId) }
        .photoMenuPresentations(
            photo: photo,
            request: $menuRequest,
            onDeleted: {
                // Back to where you came from; the list there updates underneath.
                lastShown = photo
                dismiss()
            },
            onBlocked: {
                dismiss()
            }
        )
    }

    /// The photo at its own shape across the screen, at most 70% of it tall, with the poster's
    /// name tag and arrows to the photos either side.
    @ViewBuilder private func photoView(_ photo: Photo, in container: CGSize) -> some View {
        if let video = photo.video {
            videoView(photo, video: video, in: container)
        } else {
            stillView(photo, in: container)
        }
    }

    /// A video: its poster frame, then the player. No swiping through the feed on top of it (that
    /// would fight with scrubbing); the arrows step instead.
    private func videoView(_ photo: Photo, video: Photo.Video, in container: CGSize) -> some View {
        let width = max(container.width - 16, 1)
        let height = min(width / max(photo.aspectRatio, 0.01), max(container.height * 0.7, 160))

        return Color.black
            .frame(width: width, height: height)
            .overlay {
                PhotoVideoPlayer(photo: photo, video: video)
            }
            .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
            .overlay(alignment: .topLeading) {
                NameTag(name: photo.uploader.displayName, color: groups.colorOf(photo.uploader.id, in: photo.groupId))
                    .padding(12)
                    .padding(.trailing, 24)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }
            .overlay(alignment: .leading) {
                stepButton(to: photo.feed?.newerId, direction: .newer)
            }
            .overlay(alignment: .trailing) {
                stepButton(to: photo.feed?.olderId, direction: .older)
            }
    }

    private func stillView(_ photo: Photo, in container: CGSize) -> some View {
        let width = max(container.width - 16, 1)
        let height = min(width / max(photo.aspectRatio, 0.01), max(container.height * 0.7, 160))

        return Color.black
            .frame(width: width, height: height)
            .overlay {
                PhotoImage(photo: photo, variant: .medium, contentMode: .fit)
            }
            .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
            .onTapGesture {
                fullSizePhoto = photo
            }
            .accessibilityElement()
            .accessibilityLabel(photo.altText)
            .accessibilityHint("Shows the photo full size")
            .accessibilityAddTraits([.isButton, .isImage])
            .accessibilityAction {
                fullSizePhoto = photo
            }
            .overlay(alignment: .topLeading) {
                NameTag(name: photo.uploader.displayName, color: groups.colorOf(photo.uploader.id, in: photo.groupId))
                    .padding(12)
                    .padding(.trailing, 24)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }
            .overlay(alignment: .leading) {
                stepButton(to: photo.feed?.newerId, direction: .newer)
            }
            .overlay(alignment: .trailing) {
                stepButton(to: photo.feed?.olderId, direction: .older)
            }
            .simultaneousGesture(
                DragGesture(minimumDistance: 30).onEnded { value in
                    let dx = value.translation.width
                    guard abs(dx) > 60, abs(dx) > abs(value.translation.height) * 1.5 else { return }
                    if dx < 0, let older = photo.feed?.olderId {
                        step(to: older, direction: .older)
                    } else if dx > 0, let newer = photo.feed?.newerId {
                        step(to: newer, direction: .newer)
                    }
                }
            )
    }

    @ViewBuilder private func stepButton(to photoID: String?, direction: StepDirection) -> some View {
        if let photoID {
            Button {
                step(to: photoID, direction: direction)
            } label: {
                Image(systemName: direction == .newer ? "chevron.left" : "chevron.right")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Color.white)
                    .frame(width: 44, height: 44)
                    .background(Color.black.opacity(0.45), in: Circle())
                    .contentShape(Circle())
            }
            .buttonStyle(PressScaleButtonStyle())
            .padding(8)
            .accessibilityLabel(direction == .newer ? "Newer post" : "Older post")
        }
    }

    /// When and where, the caption, and the reactions.
    private func details(_ photo: Photo) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            metaLine(photo)

            if let caption = photo.caption, !caption.isEmpty {
                Text(caption)
                    .font(.body)
                    .multilineTextAlignment(.leading)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            VStack(alignment: .leading, spacing: 2) {
                ReactionBar(photo: photo)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if photo.reactions.total > 0 {
                    Button("See who reacted") {
                        reactionsPhoto = photo
                    }
                    .buttonStyle(.plain)
                    .font(.subheadline)
                    .foregroundStyle(.sub)
                    .frame(minHeight: 36)
                    .contentShape(Rectangle())
                    .transition(.opacity)
                }
            }
            .motion(.fwQuick, value: photo.reactions.total > 0)
        }
        .padding(.horizontal, 8)
    }

    /// "5 Oct 2026 at 22:59 in The Boys": the group opens its feed. Without the feed (you posted
    /// this, then left the group) there's no group to go to.
    @ViewBuilder private func metaLine(_ photo: Photo) -> some View {
        let when = Format.dateTime(photo.createdAt)
        if photo.feed != nil, let info = groupInfo(for: photo) {
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text("\(when) in")
                    .foregroundStyle(.sub)
                Button {
                    router.openGroup(info.id)
                } label: {
                    Text(info.name)
                        .fontWeight(.medium)
                        .foregroundStyle(.fg)
                        .lineLimit(1)
                }
                .buttonStyle(.plain)
                .accessibilityHint("Opens the group's photos")
            }
            .font(.footnote)
        } else {
            Text(when)
                .font(.footnote)
                .foregroundStyle(.sub)
        }
    }

    @ViewBuilder private func failureView(_ failure: APIError) -> some View {
        if failure.status == 404 || failure.status == 400 {
            EmptyStateView(
                emoji: "🔍",
                title: "Photo not found",
                message: "It may have been deleted, or it's in a group you're not part of."
            ) {
                Button("Go back") { dismiss() }
                    .buttonStyle(.fwCompact(.primary))
            }
        } else {
            EmptyStateView(
                emoji: "📡",
                title: "Couldn't load this photo",
                message: "Check your connection and try again."
            ) {
                Button("Try again") {
                    Task { await load() }
                }
                .buttonStyle(.fwCompact(.primary))
            }
        }
    }

    private func groupInfo(for photo: Photo) -> Photo.GroupInfo? {
        if let group = photo.group { return group }
        guard let group = groups.group(photo.groupId) else { return nil }
        return Photo.GroupInfo(id: group.id, name: group.name, emoji: group.emoji)
    }

    // MARK: - Actions

    /// Scrolls the comments into view once, when the screen was opened for them.
    private func revealComments(_ proxy: ScrollViewProxy) {
        guard scrollToComments, !didScrollToComments else { return }
        didScrollToComments = true
        Task { @MainActor in
            // Let the comments lay out first.
            try? await Task.sleep(for: .milliseconds(120))
            withMotion(.fwEase) { proxy.scrollTo("comments", anchor: .top) }
        }
    }

    private func step(to photoID: String, direction: StepDirection) {
        guard photoID != currentID else { return }
        Haptics.tap()
        stepDirection = direction
        thread = CommentThread(photoID: photoID)
        failure = nil
        menuRequest = nil
        withMotion(.fwEase) {
            currentID = photoID
        }
    }

    private func load() async {
        let photoID = currentID
        let thread = self.thread
        let comments = Task { await thread.load() }

        do {
            let loaded = try await photos.loadPhoto(photoID)
            if photoID == currentID {
                lastShown = loaded
                failure = nil
                prefetchNeighbors(of: loaded)
            }
        } catch is CancellationError {
            // Stepped to another photo.
        } catch {
            if photoID == currentID {
                lastShown = nil
                failure = error.asAPIError
            }
        }
        await comments.value
    }

    /// Stepping to the next or previous photo is then instant.
    private func prefetchNeighbors(of photo: Photo) {
        for neighborID in [photo.feed?.newerId, photo.feed?.olderId].compactMap({ $0 }) {
            if let cached = photos.photo(neighborID) {
                ImageLoader.prefetch(cached.imagePath(.medium))
            } else {
                Task {
                    if let neighbor = try? await photos.loadPhoto(neighborID) {
                        ImageLoader.prefetch(neighbor.imagePath(.medium))
                    }
                }
            }
        }
    }
}

/// The full-size photo on black (the web app's FullscreenPhoto). Pinch or double-tap to zoom,
/// tap or swipe down to close; the medium size (already loaded) shows until the full size
/// arrives, in exactly the same spot. Data saver stops at the medium size.
struct FullSizePhotoView: View {
    let photo: Photo

    @Environment(\.dismiss) private var dismiss
    @State private var scale: CGFloat = 1
    @State private var lastScale: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var lastOffset: CGSize = .zero
    /// How far it's been pulled down to close (not while zoomed in).
    @State private var pull: CGFloat = 0

    init(photo: Photo) {
        self.photo = photo
    }

    var body: some View {
        let mediumPath = photo.imagePath(.medium)
        let fullPath = photo.imagePath(.full)

        ZStack(alignment: .topTrailing) {
            Color.black
                .opacity(1 - Double(min(pull / 600, 0.4)))
                .ignoresSafeArea()

            ZStack {
                AuthenticatedImage(path: mediumPath, contentMode: .fit) {
                    ProgressView().tint(.white)
                }
                if fullPath != mediumPath {
                    AuthenticatedImage(path: fullPath, contentMode: .fit) {
                        Color.clear
                    }
                }
            }
            .scaleEffect(scale)
            .offset(x: offset.width, y: offset.height + pull)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .contentShape(Rectangle())
            .gesture(
                MagnifyGesture()
                    .onChanged { value in
                        scale = min(max(lastScale * value.magnification, 1), 5)
                    }
                    .onEnded { _ in
                        lastScale = scale
                        if scale <= 1 { withMotion(.fwEase) { reset() } }
                    }
            )
            .simultaneousGesture(
                DragGesture()
                    .onChanged { value in
                        if scale > 1 {
                            offset = CGSize(
                                width: lastOffset.width + value.translation.width,
                                height: lastOffset.height + value.translation.height
                            )
                        } else {
                            pull = max(value.translation.height, 0)
                        }
                    }
                    .onEnded { value in
                        if scale > 1 {
                            lastOffset = offset
                        } else if value.translation.height > 120 {
                            dismiss()
                        } else {
                            withMotion(.fwEase) { pull = 0 }
                        }
                    }
            )
            .onTapGesture(count: 2) {
                withMotion(.fwEase) {
                    if scale > 1 {
                        reset()
                    } else {
                        scale = 2.5
                        lastScale = 2.5
                    }
                }
            }
            .onTapGesture {
                // A tap closes it, but not while zoomed in (that's for looking around).
                if scale <= 1 { dismiss() }
            }
            .accessibilityElement()
            .accessibilityLabel(photo.altText)
            .accessibilityAddTraits(.isImage)

            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(Color.white)
                    .frame(width: 44, height: 44)
                    .background(Color.black.opacity(0.6), in: Circle())
                    .contentShape(Circle())
            }
            .buttonStyle(PressScaleButtonStyle())
            .padding(12)
            .accessibilityLabel("Close")
        }
        .statusBarHidden()
        .accessibilityAction(.escape) { dismiss() }
    }

    private func reset() {
        scale = 1
        lastScale = 1
        offset = .zero
        lastOffset = .zero
        pull = 0
    }
}
