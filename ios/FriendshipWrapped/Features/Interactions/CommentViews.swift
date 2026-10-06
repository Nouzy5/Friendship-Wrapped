import SwiftUI

/// A photo's comments, oldest first, with delete for your own.
struct CommentsList: View {
    let thread: CommentThread
    let commentCount: Int
    let canInteract: Bool
    /// Called with -1 after a comment is deleted, so the photo's count stays right.
    let onCountChange: (Int) -> Void

    @State private var commentToDelete: Comment?
    @State private var alertMessage: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 4) {
                Text("Comments")
                    .font(.headline)
                if commentCount > 0 {
                    Text("· \(commentCount)")
                        .font(.headline)
                        .foregroundStyle(.secondary)
                }
            }

            switch thread.phase {
            case .loading:
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
            case .failed:
                VStack(alignment: .leading, spacing: 8) {
                    Text("Couldn't load comments.")
                        .foregroundStyle(.secondary)
                    Button("Try again") { Task { await thread.load() } }
                        .buttonStyle(.bordered)
                }
            case .loaded:
                if thread.comments.isEmpty {
                    Text("No comments yet.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(thread.comments) { comment in
                        CommentRow(comment: comment) { commentToDelete = comment }
                    }
                    if thread.hasMore {
                        LoadMoreRow(
                            title: "Show more comments",
                            isLoading: thread.isLoadingMore,
                            failed: thread.loadMoreFailed
                        ) {
                            Task { await thread.loadMore() }
                        }
                    }
                }
            }

            if !canInteract {
                Text("You've left this group, so you can't comment any more.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .confirmationDialog(
            "Delete your comment?",
            isPresented: Binding(
                get: { commentToDelete != nil },
                set: { if !$0 { commentToDelete = nil } }
            ),
            titleVisibility: .visible,
            presenting: commentToDelete
        ) { comment in
            Button("Delete", role: .destructive) {
                Task { await delete(comment) }
            }
        } message: { _ in
            Text("It will be removed for everyone. This can't be undone.")
        }
        .errorAlert("Couldn't delete comment", message: $alertMessage)
    }

    private func delete(_ comment: Comment) async {
        do {
            try await thread.delete(comment)
            onCountChange(-1)
        } catch {
            alertMessage = error.asAPIError.message
        }
    }
}

struct CommentRow: View {
    let comment: Comment
    let onDelete: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            AvatarView(
                name: comment.author.displayName,
                seed: comment.author.id,
                imagePath: comment.author.avatarUrl,
                size: 32
            )
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(comment.author.displayName)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                    Text(Format.relative(comment.createdAt))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Text(comment.body)
                    .font(.subheadline)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
            if comment.canDelete {
                Button(action: onDelete) {
                    Image(systemName: "trash")
                        .font(.footnote)
                        .frame(width: 32, height: 32)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .accessibilityLabel("Delete comment")
            }
        }
    }
}

/// The "Add a comment…" bar pinned to the bottom of the photo viewer.
struct CommentComposer: View {
    let thread: CommentThread
    /// Called after a comment is posted, so the photo's count stays right.
    let onPosted: () -> Void

    @State private var text = ""
    @State private var isSending = false
    @State private var errorMessage: String?

    private var trimmed: String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var canSend: Bool {
        !trimmed.isEmpty && !isSending
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .bottom, spacing: 8) {
                TextField("Add a comment…", text: $text, axis: .vertical)
                    .lineLimit(1...4)
                    .characterLimit(500, text: $text)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 9)
                    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 20, style: .continuous))

                Button {
                    Task { await send() }
                } label: {
                    Group {
                        if isSending {
                            ProgressView().tint(Color.ink950)
                        } else {
                            Image(systemName: "arrow.up")
                                .font(.headline)
                        }
                    }
                    .foregroundStyle(Color.ink950)
                    .frame(width: 38, height: 38)
                    .background(LinearGradient.brand, in: Circle())
                }
                .disabled(!canSend)
                .opacity(canSend || isSending ? 1 : 0.4)
                .accessibilityLabel("Post comment")
            }

            if let errorMessage {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .padding(.horizontal, 14)
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
        .background(.bar)
        .onChange(of: text) { errorMessage = nil }
    }

    private func send() async {
        guard canSend else { return }
        isSending = true
        errorMessage = nil
        do {
            _ = try await thread.add(text)
            text = ""
            onPosted()
        } catch {
            let apiError = error.asAPIError
            errorMessage = apiError.fieldErrors["body"] ?? apiError.formMessage ?? apiError.message
        }
        isSending = false
    }
}
