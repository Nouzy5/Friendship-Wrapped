import SwiftUI

/// One moment (the web app's MomentPage): its photos oldest first, posting into it while it's
/// open, and (for its creator or the group owner) ending or deleting it, from the menu at the top.
struct MomentDetailView: View {
    let momentID: String

    @Environment(MomentsStore.self) private var moments
    @Environment(PhotosStore.self) private var photos
    @Environment(GroupsStore.self) private var groups
    @Environment(AppRouter.self) private var router
    @Environment(\.dismiss) private var dismiss

    @State private var model: PhotoListModel
    @State private var failure: APIError?
    @State private var confirmingEnd = false
    @State private var confirmingDelete = false
    @State private var isWorking = false
    @State private var alertMessage: String?
    /// The moment's size when its photos were last loaded: coming back to it reloads them only if that changed.
    @State private var loadedPhotoCount: Int?
    /// Kept on screen while it closes after being deleted (the store has let it go by then).
    @State private var deletedMoment: Moment?

    init(momentID: String) {
        self.momentID = momentID
        _model = State(initialValue: PhotoListModel { cursor in
            try await APIClient.shared.fetchMomentPhotos(momentID, cursor: cursor)
        })
    }

    private var moment: Moment? {
        moments.moment(momentID) ?? deletedMoment
    }

    var body: some View {
        content
            .navigationTitle(moment?.heading ?? "")
            .navigationBarTitleDisplayMode(.large)
            .toolbar(.visible, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    optionsMenu
                }
            }
            .task { await load(force: false) }
            // No red: the buttons say what they do, and the alerts ask first.
            .alert("End this moment?", isPresented: $confirmingEnd) {
                Button("End moment") {
                    Task { await endMoment() }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("No more photos can be posted into it. The ones already there stay.")
            }
            .alert("Delete this moment?", isPresented: $confirmingDelete) {
                Button("Delete moment") {
                    Task { await deleteMoment() }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("The moment goes for everyone in the group. Its photos stay in the group.")
            }
            .errorAlert("Couldn’t do that", message: $alertMessage)
    }

    @ViewBuilder private var optionsMenu: some View {
        if isWorking {
            ProgressView()
        } else if let moment, moment.canManage {
            Menu {
                if moment.isStillOpen() {
                    Button("End moment", systemImage: "stop.circle") {
                        confirmingEnd = true
                    }
                }
                Button("Delete moment", systemImage: "trash") {
                    confirmingDelete = true
                }
            } label: {
                Image(systemName: "ellipsis.circle")
                    .font(.system(size: 19, weight: .medium))
            }
            .accessibilityLabel("Moment options")
        }
    }

    @ViewBuilder private var content: some View {
        if let moment {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(subtitle(moment))
                            .font(.subheadline)
                            .foregroundStyle(.sub)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(moment.endText())
                            .font(.system(.subheadline, design: .rounded, weight: .medium))
                    }

                    if moment.isStillOpen() {
                        Button {
                            Haptics.tap()
                            router.openCamera(groupID: moment.groupId, momentID: moment.id)
                        } label: {
                            Label("Add a photo", systemImage: "camera.fill")
                        }
                        .buttonStyle(.fwCompact(.accent))
                    }

                    photoSection(moment)
                }
                .padding(.horizontal, 16)
                .padding(.top, 4)
                .padding(.bottom, 32)
            }
            .screenBackground()
            .refreshable { await load(force: true) }
        } else if let error = failure {
            ScrollView {
                if error.status == 404 || error.status == 400 {
                    EmptyStateView(
                        emoji: "🔍",
                        title: "Moment not found",
                        message: "It may have been deleted, or it’s in a group you’re not part of."
                    ) {
                        Button("Back to Memories") { dismiss() }
                            .buttonStyle(.fwCompact(.primary))
                    }
                } else {
                    EmptyStateView(emoji: "📡", title: "Couldn’t load this moment") {
                        Button("Try again") {
                            failure = nil
                            Task { await load(force: true) }
                        }
                        .buttonStyle(.fwCompact(.primary))
                    }
                }
            }
            .screenBackground()
        } else {
            ScrollView {
                GridSkeleton()
                    .padding(.horizontal, 8)
                    .padding(.top, 8)
            }
            .screenBackground()
        }
    }

    @ViewBuilder private func photoSection(_ moment: Moment) -> some View {
        if model.phase == .failed {
            EmptyStateView(emoji: "📡", title: "Couldn’t load the photos") {
                Button("Try again") {
                    Task { await model.reload() }
                }
                .buttonStyle(.fwCompact(.primary))
            }
        } else if model.phase == .loaded && model.photos.isEmpty {
            EmptyStateView(
                emoji: "📸",
                title: "Nothing yet",
                message: moment.isStillOpen() ? "Be the first to post into it." : "No photos were posted into this one."
            )
        }
        MemoriesPhotoList(model: model, loadMoreLabel: "Load more photos")
    }

    private func subtitle(_ moment: Moment) -> String {
        var parts = [moment.photoCountText]
        if let creator = moment.createdBy { parts.append("started by \(creator.displayName)") }
        parts.append(Format.dateTime(moment.startsAt))
        return parts.joined(separator: " · ")
    }

    /// The moment, then its photos: on first showing, when `force`d (pull to refresh, try again),
    /// or when its size changed since they loaded.
    private func load(force: Bool) async {
        model.store = photos
        var found: Moment?
        do {
            found = try await moments.loadMoment(momentID)
            failure = nil
        } catch is CancellationError {
            return
        } catch {
            failure = error.asAPIError
            // Offline, it may still be cached; gone (404), the store has let it go.
            found = moments.moment(momentID)
        }
        guard let latest = found else { return }

        let groupID = latest.groupId
        Task { await groups.loadMembersIfNeeded(of: groupID) }

        if force || model.phase != .loaded || loadedPhotoCount != latest.photoCount {
            loadedPhotoCount = latest.photoCount
            await model.reload()
        }
    }

    private func endMoment() async {
        guard !isWorking else { return }
        isWorking = true
        defer { isWorking = false }
        do {
            try await moments.end(momentID)
            Haptics.success()
        } catch {
            alertMessage = error.asAPIError.message
        }
    }

    private func deleteMoment() async {
        guard let current = moment, !isWorking else { return }
        isWorking = true
        do {
            try await moments.delete(momentID)
            deletedMoment = current
            ToastCenter.shared.show("Moment deleted")
            dismiss()
            // The list underneath updates while this screen closes. The photos stay in the group.
            moments.forget(momentID)
        } catch {
            alertMessage = error.asAPIError.message
            isWorking = false
        }
    }
}
