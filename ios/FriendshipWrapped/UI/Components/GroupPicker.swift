import SwiftUI

/// Switches between your groups: the current one's name opens a list of all of them (the web
/// app's GroupPicker). On iPhone the list is a small popover under the name.
struct GroupPicker: View {
    enum Style {
        /// The big name at the top of the feed.
        case title
        /// A compact chip with the badge (Memories, the camera).
        case pill
    }

    @Environment(GroupsStore.self) private var groups

    let current: FriendGroup
    var style: Style = .title
    /// Read out before the name, e.g. "Sharing with".
    var context = "Showing"
    /// A "New group" entry at the end of the list.
    var onNewGroup: (() -> Void)?
    let onSelect: (FriendGroup) -> Void

    @State private var isOpen = false

    private var newGroupAction: (() -> Void)? {
        guard let onNewGroup else { return nil }
        return {
            isOpen = false
            // One presentation at a time: let the popover close before whatever opens next.
            Task {
                try? await Task.sleep(for: .milliseconds(350))
                onNewGroup()
            }
        }
    }

    var body: some View {
        Button {
            Haptics.tap()
            isOpen = true
        } label: {
            HStack(spacing: style == .title ? 4 : 8) {
                if style == .pill {
                    GroupBadge(group: current, size: 32)
                }
                Text(current.name)
                    .lineLimit(1)
                    .truncationMode(.tail)
                Image(systemName: "chevron.down")
                    .font(.system(size: style == .title ? 17 : 13, weight: .bold))
                    .rotationEffect(.degrees(isOpen ? 180 : 0))
                    .motion(.fwQuick, value: isOpen)
            }
            .font(style == .title ? Theme.title(.title) : .system(.subheadline, design: .rounded, weight: .semibold))
            .foregroundStyle(.fg)
            .padding(.leading, style == .pill ? 6 : 0)
            .padding(.trailing, style == .pill ? 12 : 0)
            .frame(minHeight: 44)
            .background {
                if style == .pill { Capsule().fill(.surface) }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleButtonStyle(scale: 0.97))
        .accessibilityLabel("\(context) \(current.name). Change group")
        .popover(isPresented: $isOpen, arrowEdge: .top) {
            GroupList(current: current, onNewGroup: newGroupAction) { group in
                isOpen = false
                if group.id != current.id { onSelect(group) }
            }
            .presentationCompactAdaptation(.popover)
        }
    }
}

private struct GroupList: View {
    @Environment(GroupsStore.self) private var groups

    let current: FriendGroup
    let onNewGroup: (() -> Void)?
    let onSelect: (FriendGroup) -> Void

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                ForEach(Array(groups.groups.enumerated()), id: \.element.id) { index, group in
                    Button {
                        Haptics.tap()
                        onSelect(group)
                    } label: {
                        HStack(spacing: 12) {
                            GroupBadge(group: group, size: 36)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(group.name)
                                    .lineLimit(1)
                                Text(Format.memberCount(group.memberCount))
                                    .font(.footnote)
                                    .foregroundStyle(.sub)
                            }
                            Spacer(minLength: 8)
                            if group.id == current.id {
                                Image(systemName: "checkmark")
                                    .font(.system(size: 16, weight: .semibold))
                                    .accessibilityHidden(true)
                            }
                        }
                        .foregroundStyle(.fg)
                        .padding(.horizontal, 14)
                        .frame(minHeight: 60)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.settingsRow)
                    .accessibilityAddTraits(group.id == current.id ? [.isButton, .isSelected] : .isButton)
                    .riseIn(delay: Double(index) * 0.035)
                }
                if let onNewGroup {
                    Divider().overlay(Color.line)
                    Button(action: onNewGroup) {
                        HStack(spacing: 12) {
                            Image(systemName: "plus")
                                .font(.system(size: 17, weight: .semibold))
                                .frame(width: 36, height: 36)
                                .background(.surface, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                            Text("New group")
                                .fontWeight(.semibold)
                            Spacer()
                        }
                        .foregroundStyle(.fg)
                        .padding(.horizontal, 14)
                        .frame(minHeight: 56)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.settingsRow)
                }
            }
            .padding(.vertical, 6)
        }
        // A short list doesn't bounce, so it can't set off the pull-to-refresh of the screen behind.
        .scrollBounceBehavior(.basedOnSize)
        .frame(width: 300)
        .frame(maxHeight: 420)
        .fixedSize(horizontal: false, vertical: true)
        .background(.raised)
    }
}
