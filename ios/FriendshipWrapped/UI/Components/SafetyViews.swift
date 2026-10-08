import SwiftUI

/// Reports a photo, a person, or a problem with the app (`POST /reports`). Opened as a sheet.
struct ReportSheet: View {
    @Environment(AccountStore.self) private var account
    @Environment(\.dismiss) private var dismiss

    var photoID: String?
    var userID: String?
    var title = "Report a problem"

    @State private var message = ""
    @State private var isSending = false
    @State private var error: String?
    @FocusState private var focused: Bool

    private static let maxLength = 1000

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text(photoID != nil || userID != nil
                         ? "Say what's wrong. Whoever runs this server will see your report; the person isn't told."
                         : "Something not working, or a suggestion? Say what happened.")
                        .font(.callout)
                        .foregroundStyle(.sub)

                    TextEditor(text: $message)
                        .focused($focused)
                        .scrollContentBackground(.hidden)
                        .padding(12)
                        .frame(minHeight: 160)
                        .background(.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .characterLimit(Self.maxLength, text: $message)
                        .accessibilityLabel("What's wrong")

                    if let error {
                        InlineAlert(message: error)
                    }

                    PrimaryButton(title: "Send report", pendingTitle: "Sending…", isPending: isSending) {
                        Task { await send() }
                    }
                    .disabled(message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                .padding(16)
            }
            .screenBackground()
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(isSending)
                }
            }
            .interactiveDismissDisabled(isSending)
            .onAppear { focused = true }
        }
        .presentationDetents([.medium, .large])
    }

    private func send() async {
        isSending = true
        error = nil
        do {
            try await account.report(ReportInput(photoId: photoID, userId: userID, message: message))
            Haptics.success()
            ToastCenter.shared.show("Thanks. Your report was sent.")
            dismiss()
        } catch {
            self.error = error.asAPIError.message
        }
        isSending = false
    }
}

extension View {
    /// Asks before blocking `person` and does it: neither of you sees the other's photos,
    /// comments or reactions, anywhere. `context` names where you are ("The Boys"). Cached photos
    /// are dropped; `onBlocked` reloads whatever the screen shows.
    func blockConfirmation(_ person: Binding<UserSummary?>, context: String, onBlocked: @escaping () -> Void = {}) -> some View {
        modifier(BlockConfirmation(person: person, context: context, onBlocked: onBlocked))
    }
}

private struct BlockConfirmation: ViewModifier {
    @Environment(AccountStore.self) private var account
    @Environment(PhotosStore.self) private var photos
    @Environment(GroupsStore.self) private var groups

    @Binding var person: UserSummary?
    let context: String
    let onBlocked: () -> Void

    func body(content: Content) -> some View {
        content.alert(
            "Block \(person?.displayName ?? "them")?",
            isPresented: Binding(get: { person != nil }, set: { if !$0 { person = nil } }),
            presenting: person
        ) { target in
            Button("Block") {
                Task { await block(target) }
            }
            Button("Cancel", role: .cancel) {}
        } message: { _ in
            Text("You won't see each other's photos, comments or reactions, even in \(context). They aren't told. You can unblock them in Settings → Privacy & safety.")
        }
    }

    @MainActor
    private func block(_ target: UserSummary) async {
        do {
            try await account.block(target)
            photos.clearCachedPhotos()
            groups.invalidateMembers()
            ToastCenter.shared.show("\(target.displayName) is blocked")
            onBlocked()
        } catch {
            ToastCenter.shared.show(error.asAPIError.message, isError: true)
        }
    }
}
