import SwiftUI

/// A photo's comments, oldest first (the web app's CommentsSection): each with its author's
/// avatar in their colour in the photo's group, and delete for your own. New comments rise into
/// place; deleted ones fade.
struct CommentsList: View {
    let thread: CommentThread
    /// The photo's group, for everyone's colours.
    let groupID: String
    let commentCount: Int
    let canInteract: Bool
    /// Called with -1 after a comment is deleted, so the photo's count stays right.
    let onCountChange: (Int) -> Void

    @Environment(GroupsStore.self) private var groups
    @State private var commentToDelete: Comment?

    init(
        thread: CommentThread,
        groupID: String,
        commentCount: Int,
        canInteract: Bool,
        onCountChange: @escaping (Int) -> Void
    ) {
        self.thread = thread
        self.groupID = groupID
        self.commentCount = commentCount
        self.canInteract = canInteract
        self.onCountChange = onCountChange
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            heading

            switch thread.phase {
            case .loading:
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
            case .failed:
                VStack(alignment: .leading, spacing: 12) {
                    Text("Couldn't load comments.")
                        .font(.subheadline)
                        .foregroundStyle(.sub)
                    Button("Try again") {
                        Task { await thread.load() }
                    }
                    .buttonStyle(.fwCompact(.secondary))
                }
            case .loaded:
                VStack(alignment: .leading, spacing: 16) {
                    if thread.comments.isEmpty {
                        Text("No comments yet. Say something nice.")
                            .font(.subheadline)
                            .foregroundStyle(.sub)
                            .transition(.opacity)
                    }
                    ForEach(thread.comments) { comment in
                        CommentRow(comment: comment, color: groups.colorOf(comment.author.id, in: groupID)) {
                            commentToDelete = comment
                        }
                        .listItemTransition(index: 0)
                    }
                }
                .motion(.fwEase, value: thread.comments.map(\.id))

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

            if !canInteract {
                Text("You've left this group, so you can't comment any more.")
                    .font(.footnote)
                    .foregroundStyle(.sub)
            }
        }
        .task(id: groupID) { await groups.loadMembersIfNeeded(of: groupID) }
        // No red: the question says what happens.
        .alert(
            "Delete your comment?",
            isPresented: Binding(
                get: { commentToDelete != nil },
                set: { if !$0 { commentToDelete = nil } }
            ),
            presenting: commentToDelete
        ) { comment in
            Button("Delete") {
                Task { await delete(comment) }
            }
            Button("Cancel", role: .cancel) {}
        } message: { _ in
            Text("It will be removed for everyone. This can't be undone.")
        }
    }

    private var heading: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text("Comments")
                .font(Theme.title(.title3))
            if commentCount > 0 {
                Text(Format.number(commentCount))
                    .font(.system(.title3, design: .rounded))
                    .foregroundStyle(.sub)
                    .contentTransition(.numericText())
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }

    private func delete(_ comment: Comment) async {
        do {
            try await thread.delete(comment)
            onCountChange(-1)
        } catch {
            ToastCenter.shared.show(error.asAPIError.message, isError: true)
        }
    }
}

/// One comment: who wrote it (their avatar in their colour), when, and what they said.
struct CommentRow: View {
    let comment: Comment
    /// The author's colour in the photo's group (nil: neutral).
    let color: MemberColor?
    let onDelete: () -> Void

    init(comment: Comment, color: MemberColor? = nil, onDelete: @escaping () -> Void) {
        self.comment = comment
        self.color = color
        self.onDelete = onDelete
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            PersonAvatar(
                name: comment.author.displayName,
                imagePath: comment.author.avatarUrl,
                color: color,
                size: .sm
            )

            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(comment.author.displayName)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                    Text(Format.relative(comment.createdAt))
                        .font(.footnote)
                        .foregroundStyle(.sub)
                        .lineLimit(1)
                        .layoutPriority(1)
                }
                Text(comment.body)
                    .font(.subheadline)
                    .multilineTextAlignment(.leading)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .foregroundStyle(.fg)
            .accessibilityElement(children: .combine)

            if comment.canDelete {
                Button(action: onDelete) {
                    Image(systemName: "trash")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(.sub)
                        .frame(width: 44, height: 44)
                        .contentShape(Circle())
                }
                .buttonStyle(PressScaleButtonStyle())
                .padding(.top, -8)
                .padding(.trailing, -10)
                .accessibilityLabel("Delete comment")
            }
        }
    }
}

/// The "Add a comment…" bar pinned to the bottom of the photo viewer (the web app's
/// CommentComposer): a rounded field that's outlined in ink while you type, and a round send button.
struct CommentComposer: View {
    let thread: CommentThread
    /// Called after a comment is posted, so the photo's count stays right.
    let onPosted: () -> Void

    @Environment(\.displayScale) private var displayScale
    @State private var text = ""
    @State private var isSending = false
    @State private var errorMessage: String?
    @FocusState private var focused: Bool

    /// The server's limit, in code points.
    private static let maxLength = 500

    init(thread: CommentThread, onPosted: @escaping () -> Void) {
        self.thread = thread
        self.onPosted = onPosted
    }

    private var trimmed: String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var canSend: Bool {
        !trimmed.isEmpty && !isSending
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .bottom, spacing: 8) {
                TextField("Add a comment…", text: $text, axis: .vertical)
                    .lineLimit(1...4)
                    .focused($focused)
                    .characterLimit(Self.maxLength, text: $text)
                    .font(.body)
                    .foregroundStyle(.fg)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .frame(minHeight: 48)
                    .background(.surface, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: 24, style: .continuous)
                            .strokeBorder(Theme.fg, lineWidth: 2)
                            .opacity(focused || errorMessage != nil ? 1 : 0)
                    }
                    .motion(.fwQuick, value: focused)
                    .accessibilityLabel("Add a comment")

                Button {
                    Task { await send() }
                } label: {
                    ZStack {
                        if isSending {
                            ProgressView()
                                .tint(Theme.onInverse)
                        } else {
                            Image(systemName: "arrow.up")
                                .font(.system(size: 18, weight: .bold))
                        }
                    }
                    .foregroundStyle(.onInverse)
                    .frame(width: 48, height: 48)
                    .background(.inverse, in: Circle())
                }
                .buttonStyle(PressScaleButtonStyle())
                .disabled(!canSend)
                .opacity(canSend || isSending ? 1 : 0.3)
                .motion(.fwQuick, value: canSend)
                .accessibilityLabel("Post comment")
            }

            if let errorMessage {
                Label(errorMessage, systemImage: "exclamationmark.circle")
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(.fg)
                    .padding(.horizontal, 16)
                    .transition(.opacity)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background {
            Theme.bg
                .ignoresSafeArea(edges: .bottom)
                .overlay(alignment: .top) {
                    Rectangle().fill(.line).frame(height: 1 / displayScale)
                }
        }
        .motion(.fwQuick, value: errorMessage)
        .onChange(of: text) { errorMessage = nil }
    }

    private func send() async {
        guard canSend else { return }
        isSending = true
        errorMessage = nil
        do {
            _ = try await thread.add(text)
            text = ""
            Haptics.tap()
            onPosted()
        } catch {
            let apiError = error.asAPIError
            errorMessage = apiError.fieldErrors["body"] ?? apiError.formMessage ?? apiError.message
        }
        isSending = false
    }
}
