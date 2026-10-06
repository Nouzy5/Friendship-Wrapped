import SwiftUI

/// The five reactions with their counts. Tap one to react, another to change, and your current
/// one again to take it back. Without access to the group (you posted this, then left) it's
/// read-only, except that you can still take back your own reaction.
struct ReactionBar: View {
    let photo: Photo

    @Environment(PhotosStore.self) private var photos
    @State private var errorMessage: String?

    var body: some View {
        HStack(spacing: 6) {
            ForEach(ReactionType.allCases) { type in
                let selected = photo.reactions.mine == type
                let count = photo.reactions.count(type)
                let enabled = photo.canInteract || selected

                Button {
                    Task { await react(selected ? nil : type) }
                } label: {
                    HStack(spacing: 4) {
                        Text(type.emoji)
                        if count > 0 {
                            Text("\(count)")
                                .font(.subheadline.weight(.semibold))
                                .monospacedDigit()
                        }
                    }
                    .padding(.horizontal, 9)
                    .frame(minWidth: 44, minHeight: 34)
                    .background(selected ? Color.accentColor.opacity(0.15) : Color(.tertiarySystemFill), in: Capsule())
                    .overlay(Capsule().strokeBorder(selected ? Color.accentColor.opacity(0.7) : Color.clear))
                }
                .buttonStyle(.plain)
                .disabled(!enabled)
                .opacity(enabled ? 1 : 0.4)
                .accessibilityLabel(count > 0 ? "\(type.label), \(count)" : type.label)
                .accessibilityAddTraits(selected ? .isSelected : [])
            }
        }
        .sensoryFeedback(.selection, trigger: photo.reactions.mine)
        .errorAlert("Couldn't react", message: $errorMessage)
    }

    private func react(_ type: ReactionType?) async {
        do {
            try await photos.react(to: photo.id, with: type)
        } catch {
            errorMessage = error.asAPIError.message
        }
    }
}

/// Who reacted to a photo, and with what.
struct ReactionsSheet: View {
    let photoID: String

    @Environment(\.dismiss) private var dismiss
    @State private var entries: [ReactionEntry]?
    @State private var failed = false

    var body: some View {
        NavigationStack {
            Group {
                if let entries {
                    if entries.isEmpty {
                        Text("No reactions yet.")
                            .foregroundStyle(.secondary)
                    } else {
                        List(entries) { entry in
                            HStack(spacing: 12) {
                                AvatarView(
                                    name: entry.user.displayName,
                                    seed: entry.user.id,
                                    imagePath: entry.user.avatarUrl,
                                    size: 32
                                )
                                Text(entry.user.displayName)
                                    .lineLimit(1)
                                Spacer()
                                Text(entry.type.emoji)
                                    .font(.title3)
                                    .accessibilityLabel(entry.type.label)
                            }
                            .accessibilityElement(children: .combine)
                        }
                    }
                } else if failed {
                    EmptyStateView(emoji: "📡", title: "Couldn't load reactions", message: "Check your connection.") {
                        Button("Try again") { Task { await load() } }
                            .buttonStyle(.borderedProminent)
                    }
                } else {
                    ProgressView()
                }
            }
            .navigationTitle("Reactions")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .task { await load() }
    }

    private func load() async {
        failed = false
        do {
            entries = try await APIClient.shared.fetchReactions(onPhoto: photoID)
        } catch {
            failed = true
        }
    }
}
