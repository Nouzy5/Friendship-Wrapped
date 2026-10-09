import Photos
import SwiftUI
import UIKit

/// Something chosen in a photo's menu that opens a sheet or asks first.
enum PhotoMenuRequest: Hashable {
    case albums, report, block, delete
}

/// "More" for a photo (the web app's PhotoMenu): add to an album, save it to your phone (when
/// the poster allows it), report it, block whoever posted it, delete your own. Destructive
/// choices say what they do and ask first, without red.
///
/// The button and what it opens in one. In a navigation bar, use `PhotoMenuButton` there and
/// `.photoMenuPresentations` on the screen instead, so the sheets and questions hang off the screen.
struct PhotoMenu: View {
    enum Style {
        /// White dots with a shadow, over the photo's corner (feed cards).
        case overPhoto
        /// Ink dots, in a navigation bar (the viewer).
        case toolbar
    }

    let photo: Photo
    let style: Style
    /// After the photo is deleted, before it's dropped from every list (a viewer closes here).
    let onDeleted: (() -> Void)?
    /// After its poster is blocked (their photos are gone from the cache by then).
    let onBlocked: (() -> Void)?

    @State private var request: PhotoMenuRequest? = nil

    init(
        photo: Photo,
        style: Style = .overPhoto,
        onDeleted: (() -> Void)? = nil,
        onBlocked: (() -> Void)? = nil
    ) {
        self.photo = photo
        self.style = style
        self.onDeleted = onDeleted
        self.onBlocked = onBlocked
    }

    var body: some View {
        PhotoMenuButton(photo: photo, style: style, request: $request)
            .photoMenuPresentations(photo: photo, request: $request, onDeleted: onDeleted, onBlocked: onBlocked)
    }
}

/// The "…" button and its list. Saving happens right here; the other choices set `request` for
/// `.photoMenuPresentations` to open.
struct PhotoMenuButton: View {
    let photo: Photo
    let style: PhotoMenu.Style
    @Binding var request: PhotoMenuRequest?

    @Environment(SessionStore.self) private var session
    @State private var isSaving = false

    init(photo: Photo, style: PhotoMenu.Style = .overPhoto, request: Binding<PhotoMenuRequest?>) {
        self.photo = photo
        self.style = style
        _request = request
    }

    private var isMine: Bool {
        photo.uploader.id == session.user?.id
    }

    private var posterFirstName: String {
        let name = photo.uploader.displayName
        return name.split(whereSeparator: \.isWhitespace).first.map { String($0) } ?? name
    }

    private var ink: Color {
        style == .overPhoto ? Color.white : Theme.fg
    }

    var body: some View {
        Menu {
            if photo.canInteract {
                Button("Add to an album", systemImage: "rectangle.stack.badge.plus") {
                    request = .albums
                }
            }
            if photo.canSave {
                Button("Save \(photo.noun)", systemImage: "square.and.arrow.down") {
                    Task { await save() }
                }
                .disabled(isSaving)
            }
            if !isMine {
                Button("Report \(photo.noun)", systemImage: "flag") {
                    request = .report
                }
                Button("Block \(posterFirstName)", systemImage: "nosign") {
                    request = .block
                }
            }
            if photo.canDelete {
                Button("Delete \(photo.noun)", systemImage: "trash") {
                    request = .delete
                }
            }
        } label: {
            ZStack {
                if isSaving {
                    ProgressView()
                        .tint(ink)
                } else {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(ink)
                        .shadow(color: .black.opacity(style == .overPhoto ? 0.5 : 0), radius: 2, y: 1)
                }
            }
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
        }
        .menuOrder(.fixed)
        .tint(ink)
        .accessibilityLabel("More options")
    }

    /// Downloads the full-size photo or the video (only allowed when `canSave`) and adds it to the
    /// photo library, asking for add-only access the first time.
    private func save() async {
        guard !isSaving else { return }
        isSaving = true
        defer { isSaving = false }

        if photo.isVideo {
            await saveVideo()
            return
        }

        do {
            let data = try await APIClient.shared.downloadFullImage(of: photo)
            // Photos are WebP on the server; the library gets a plain image.
            guard let image = UIImage(data: data) else {
                ToastCenter.shared.show("Couldn't save the photo.", isError: true)
                return
            }
            let access = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
            guard access == .authorized || access == .limited else {
                ToastCenter.shared.show("To save photos, allow Friendship Wrapped to add to your photos in the Settings app.", isError: true)
                return
            }
            try await PHPhotoLibrary.shared().performChanges {
                _ = PHAssetChangeRequest.creationRequestForAsset(from: image)
            }
            Haptics.success()
            ToastCenter.shared.show("Saved to your photos")
        } catch is CancellationError {
            // Nothing to say.
        } catch let error as APIError {
            ToastCenter.shared.show(error.message, isError: true)
        } catch {
            ToastCenter.shared.show("Couldn't save the photo.", isError: true)
        }
    }
}

extension PhotoMenuButton {
    @MainActor
    fileprivate func saveVideo() async {
        do {
            let file = try await APIClient.shared.downloadVideo(of: photo)
            defer { try? FileManager.default.removeItem(at: file) }
            let access = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
            guard access == .authorized || access == .limited else {
                ToastCenter.shared.show("To save videos, allow Friendship Wrapped to add to your photos in the Settings app.", isError: true)
                return
            }
            try await PHPhotoLibrary.shared().performChanges {
                _ = PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: file)
            }
            Haptics.success()
            ToastCenter.shared.show("Saved to your photos")
        } catch is CancellationError {
            // Nothing to say.
        } catch let error as APIError {
            ToastCenter.shared.show(error.message, isError: true)
        } catch {
            ToastCenter.shared.show("Couldn't save the video.", isError: true)
        }
    }
}

extension View {
    /// What a photo menu's choices open: the albums sheet, the report sheet, and the questions
    /// before blocking its poster or deleting it. `onDeleted` runs once it's deleted (before
    /// it's dropped from every list, so a viewer can close first); `onBlocked` once its poster
    /// is blocked.
    func photoMenuPresentations(
        photo: Photo,
        request: Binding<PhotoMenuRequest?>,
        onDeleted: (() -> Void)? = nil,
        onBlocked: (() -> Void)? = nil
    ) -> some View {
        modifier(PhotoMenuPresentations(photo: photo, request: request, onDeleted: onDeleted, onBlocked: onBlocked))
    }
}

private struct PhotoMenuPresentations: ViewModifier {
    @Environment(PhotosStore.self) private var photos
    @Environment(GroupsStore.self) private var groups
    @Environment(WrappedStore.self) private var wrapped

    let photo: Photo
    @Binding var request: PhotoMenuRequest?
    let onDeleted: (() -> Void)?
    let onBlocked: (() -> Void)?

    init(
        photo: Photo,
        request: Binding<PhotoMenuRequest?>,
        onDeleted: (() -> Void)?,
        onBlocked: (() -> Void)?
    ) {
        self.photo = photo
        _request = request
        self.onDeleted = onDeleted
        self.onBlocked = onBlocked
    }

    @MainActor
    private var groupName: String {
        photo.group?.name ?? groups.group(photo.groupId)?.name ?? "the group"
    }

    func body(content: Content) -> some View {
        content
            .sheet(isPresented: isPresented(.albums)) {
                PhotoAlbumsSheet(photo: photo)
                    .presentationDetents([.medium, .large])
            }
            .sheet(isPresented: isPresented(.report)) {
                ReportSheet(photoID: photo.id, title: "Report this \(photo.noun)")
            }
            .blockConfirmation(personToBlock, context: groupName) {
                onBlocked?()
            }
            .alert("Delete this \(photo.noun)?", isPresented: isPresented(.delete)) {
                Button("Delete \(photo.noun)") {
                    Task { await delete() }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("It will be removed for everyone in \(groupName). This can't be undone.")
            }
    }

    private func isPresented(_ kind: PhotoMenuRequest) -> Binding<Bool> {
        Binding(
            get: { request == kind },
            set: { shown in
                if !shown, request == kind { request = nil }
            }
        )
    }

    /// The poster, while "Block …" is being asked.
    private var personToBlock: Binding<UserSummary?> {
        Binding(
            get: { request == .block ? photo.uploader : nil },
            set: { person in
                if person == nil, request == .block { request = nil }
            }
        )
    }

    @MainActor
    private func delete() async {
        do {
            try await photos.delete(photo)
            Haptics.success()
            ToastCenter.shared.show(photo.isVideo ? "Video deleted" : "Photo deleted")
            onDeleted?()
            photos.forget(photo.id)
            wrapped.setNeedsRefresh()
        } catch {
            ToastCenter.shared.show(error.asAPIError.message, isError: true)
        }
    }
}
