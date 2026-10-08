import SwiftUI

/// One photo, large, with who posted it, when, its caption, reactions and comments.
/// Swiping or the arrow buttons step through the group's feed (right = newer, as if scrolling
/// the feed up). Tapping the photo shows it full size.
struct PhotoDetailView: View {
    /// Opens with the comments in view (from a feed card's comment button).
    let scrollToComments: Bool

    @Environment(PhotosStore.self) private var photos
    @Environment(GroupsStore.self) private var groups
    @Environment(WrappedStore.self) private var wrapped
    @Environment(\.dismiss) private var dismiss

    /// The photo on screen; changes as you step through the feed.
    @State private var currentID: String
    @State private var thread: CommentThread
    /// Kept so the screen doesn't blank out while it closes after a delete.
    @State private var lastShown: Photo?
    @State private var failure: APIError?
    @State private var didScrollToComments = false
    @State private var showingFullSize = false
    @State private var showingReactions = false
    @State private var showingAlbums = false
    @State private var confirmingDelete = false
    @State private var isDeleting = false
    @State private var alertMessage: String?

    init(photoID: String, scrollToComments: Bool = false) {
        self.scrollToComments = scrollToComments
        _currentID = State(initialValue: photoID)
        _thread = State(initialValue: CommentThread(photoID: photoID))
    }

    private var photo: Photo? {
        photos.photo(currentID) ?? (lastShown?.id == currentID ? lastShown : nil)
    }

    var body: some View {
        content
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    if let photo {
                        if photo.canInteract {
                            Button {
                                showingAlbums = true
                            } label: {
                                Image(systemName: "rectangle.stack.badge.plus")
                            }
                            .accessibilityLabel("Add to an album")
                        }

                        Button {
                            Task { await toggleFavorite(photo) }
                        } label: {
                            Image(systemName: photo.isFavorite ? "star.fill" : "star")
                        }
                        .accessibilityLabel(photo.isFavorite ? "Remove from favorites" : "Add to favorites")

                        if photo.canDelete {
                            Button {
                                confirmingDelete = true
                            } label: {
                                if isDeleting { ProgressView() } else { Image(systemName: "trash") }
                            }
                            .disabled(isDeleting)
                            .accessibilityLabel("Delete photo")
                        }
                    }
                }
            }
            .safeAreaInset(edge: .bottom) {
                if photo?.canInteract == true {
                    // The photo is captured now: by the time the comment is saved you may have swiped on.
                    CommentComposer(thread: thread) { [photoID = thread.photoID] in
                        photos.adjustCommentCount(of: photoID, by: 1)
                    }
                    // A fresh, empty composer for each photo you step to.
                    .id(currentID)
                }
            }
            .task(id: currentID) { await load() }
            .sheet(isPresented: $showingReactions) {
                ReactionsSheet(photoID: currentID)
                    .presentationDetents([.medium, .large])
            }
            .sheet(isPresented: $showingAlbums) {
                if let photo {
                    PhotoAlbumsSheet(photo: photo)
                        .presentationDetents([.medium, .large])
                }
            }
            .fullScreenCover(isPresented: $showingFullSize) {
                if let photo {
                    FullSizePhotoView(photo: photo)
                }
            }
            .confirmationDialog("Delete this photo?", isPresented: $confirmingDelete, titleVisibility: .visible) {
                Button("Delete photo", role: .destructive) {
                    Task { await deletePhoto() }
                }
            } message: {
                Text("It will be removed for everyone in \(groupName). This can't be undone.")
            }
            .errorAlert("Something went wrong", message: $alertMessage)
            .sensoryFeedback(.selection, trigger: currentID)
    }

    @ViewBuilder private var content: some View {
        if let photo {
            GeometryReader { geometry in
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 16) {
                            photoView(photo, in: geometry.size)

                            PhotoAttribution(
                                uploader: photo.uploader,
                                date: photo.createdAt,
                                exactTime: true,
                                group: photo.feed != nil ? groupInfo(for: photo) : nil
                            )

                            if let caption = photo.caption {
                                Text(caption)
                                    .textSelection(.enabled)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }

                            VStack(alignment: .leading, spacing: 8) {
                                ReactionBar(photo: photo)
                                if photo.reactions.total > 0 {
                                    Button(reactionsLabel(photo)) { showingReactions = true }
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                }
                            }

                            Divider()

                            CommentsList(
                                thread: thread,
                                commentCount: photo.commentCount,
                                canInteract: photo.canInteract
                            ) { [photoID = thread.photoID] delta in
                                photos.adjustCommentCount(of: photoID, by: delta)
                            }
                            .id("comments")
                        }
                        .padding()
                    }
                    .refreshable { await load() }
                    .onChange(of: thread.phase) { _, phase in
                        guard scrollToComments, !didScrollToComments, phase == .loaded else { return }
                        didScrollToComments = true
                        withAnimation { proxy.scrollTo("comments", anchor: .top) }
                    }
                }
            }
        } else if let failure {
            if failure.status == 404 || failure.status == 400 {
                EmptyStateView(
                    emoji: "🔍",
                    title: "Photo not found",
                    message: "It may have been deleted, or it's in a group you're not part of."
                ) {
                    Button("Go back") { dismiss() }
                        .buttonStyle(.bordered)
                }
            } else {
                EmptyStateView(
                    emoji: "📡",
                    title: "Couldn't load this photo",
                    message: "Check your connection and try again."
                ) {
                    Button("Try again") { Task { await load() } }
                        .buttonStyle(.borderedProminent)
                }
            }
        } else {
            ProgressView()
        }
    }

    /// The photo at its own shape, at most 70% of the screen tall, with arrows either side.
    private func photoView(_ photo: Photo, in container: CGSize) -> some View {
        let maxWidth = max(container.width - 32, 1)
        let height = min(maxWidth / photo.aspectRatio, container.height * 0.7)
        let width = height * photo.aspectRatio

        return Color(.tertiarySystemFill)
            .frame(width: width, height: height)
            .overlay {
                AuthenticatedImage(path: photo.imageUrls.medium, contentMode: .fit) {
                    ProgressView()
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            .onTapGesture { showingFullSize = true }
            .accessibilityElement()
            .accessibilityLabel(photo.altText)
            .accessibilityHint("Shows the photo full size")
            .accessibilityAddTraits(.isButton)
            .frame(maxWidth: .infinity)
            .overlay(alignment: .leading) {
                stepButton(to: photo.feed?.newerId, systemImage: "chevron.left", label: "Newer photo")
            }
            .overlay(alignment: .trailing) {
                stepButton(to: photo.feed?.olderId, systemImage: "chevron.right", label: "Older photo")
            }
            .simultaneousGesture(
                DragGesture(minimumDistance: 30).onEnded { value in
                    let dx = value.translation.width
                    guard abs(dx) > 60, abs(dx) > abs(value.translation.height) * 1.5 else { return }
                    if dx < 0, let older = photo.feed?.olderId {
                        step(to: older)
                    } else if dx > 0, let newer = photo.feed?.newerId {
                        step(to: newer)
                    }
                }
            )
    }

    @ViewBuilder private func stepButton(to photoID: String?, systemImage: String, label: String) -> some View {
        if let photoID {
            Button {
                step(to: photoID)
            } label: {
                Image(systemName: systemImage)
                    .font(.headline)
                    .foregroundStyle(.white)
                    .frame(width: 40, height: 40)
                    .background(Color.black.opacity(0.45), in: Circle())
            }
            .padding(8)
            .accessibilityLabel(label)
        }
    }

    private var groupName: String {
        photo?.group?.name ?? photo.flatMap { groups.group($0.groupId)?.name } ?? "the group"
    }

    private func groupInfo(for photo: Photo) -> Photo.GroupInfo? {
        if let group = photo.group { return group }
        guard let group = groups.group(photo.groupId) else { return nil }
        return Photo.GroupInfo(id: group.id, name: group.name, emoji: group.emoji)
    }

    private func reactionsLabel(_ photo: Photo) -> String {
        let count = photo.reactions.total == 1 ? "1 reaction" : "\(photo.reactions.total) reactions"
        return "\(count) · see who"
    }

    // MARK: - Actions

    private func step(to photoID: String) {
        guard photoID != currentID else { return }
        thread = CommentThread(photoID: photoID)
        failure = nil
        withAnimation(.easeInOut(duration: 0.2)) {
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
                ImageLoader.prefetch(cached.imageUrls.medium)
            } else {
                Task {
                    if let neighbor = try? await photos.loadPhoto(neighborID) {
                        ImageLoader.prefetch(neighbor.imageUrls.medium)
                    }
                }
            }
        }
    }

    private func toggleFavorite(_ photo: Photo) async {
        do {
            try await photos.setFavorite(!photo.isFavorite, photoID: photo.id)
        } catch {
            alertMessage = error.asAPIError.message
        }
    }

    private func deletePhoto() async {
        guard let photo else { return }
        isDeleting = true
        do {
            try await photos.delete(photo)
            lastShown = photo
            // Close first so the feed updates underneath, not this screen.
            dismiss()
            photos.forget(photo.id)
            wrapped.setNeedsRefresh()
        } catch {
            alertMessage = error.asAPIError.message
            isDeleting = false
        }
    }
}

/// The full-size photo on black. Pinch or double-tap to zoom; the medium size (already loaded)
/// shows until the full size arrives, in exactly the same spot.
struct FullSizePhotoView: View {
    let photo: Photo

    @Environment(\.dismiss) private var dismiss
    @State private var scale: CGFloat = 1
    @State private var lastScale: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var lastOffset: CGSize = .zero

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Color.black.ignoresSafeArea()

            ZStack {
                AuthenticatedImage(path: photo.imageUrls.medium, contentMode: .fit) {
                    ProgressView().tint(.white)
                }
                AuthenticatedImage(path: photo.imageUrls.full, contentMode: .fit) {
                    Color.clear
                }
            }
            .scaleEffect(scale)
            .offset(offset)
            .gesture(
                MagnifyGesture()
                    .onChanged { value in
                        scale = min(max(lastScale * value.magnification, 1), 5)
                    }
                    .onEnded { _ in
                        lastScale = scale
                        if scale <= 1 { reset() }
                    }
            )
            .simultaneousGesture(
                DragGesture()
                    .onChanged { value in
                        guard scale > 1 else { return }
                        offset = CGSize(
                            width: lastOffset.width + value.translation.width,
                            height: lastOffset.height + value.translation.height
                        )
                    }
                    .onEnded { _ in lastOffset = offset }
            )
            .onTapGesture(count: 2) {
                withAnimation(.easeInOut(duration: 0.25)) {
                    if scale > 1 {
                        reset()
                    } else {
                        scale = 2.5
                        lastScale = 2.5
                    }
                }
            }
            .accessibilityLabel(photo.altText)

            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(Color.black.opacity(0.55), in: Circle())
            }
            .padding()
            .accessibilityLabel("Close")
        }
        .statusBarHidden()
    }

    private func reset() {
        scale = 1
        lastScale = 1
        offset = .zero
        lastOffset = .zero
    }
}
