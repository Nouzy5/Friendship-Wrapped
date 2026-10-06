import SwiftUI

let presetEmojis = ["🍻", "🎉", "🏖️", "🏔️", "✈️", "🎮", "⚽", "🎸", "🍕", "🔥", "💛", "🌴", "🎓", "🏠", "🐶", "🎄", "🚗", "📸"]

/// Name + emoji sections shared by "new group", onboarding and group settings. The server does the validation.
struct GroupFormFields: View {
    @Binding var name: String
    @Binding var emoji: String
    var errors: [String: String] = [:]

    var body: some View {
        Section {
            TextField("e.g. The Boys", text: $name)
                .characterLimit(50, text: $name)
        } header: {
            Text("Group name")
        } footer: {
            FieldFooter(error: errors["name"])
        }

        Section {
            EmojiGrid(selection: $emoji)
            TextField("Or type any emoji", text: customEmoji)
        } header: {
            Text("Emoji")
        } footer: {
            FieldFooter(error: errors["emoji"])
        }
    }

    /// Shows a non-preset emoji; typing keeps only the last character, since a group has exactly one.
    private var customEmoji: Binding<String> {
        Binding(
            get: { presetEmojis.contains(emoji) ? "" : emoji },
            set: { newValue in emoji = newValue.last.map { String($0) } ?? "" }
        )
    }
}

struct EmojiGrid: View {
    @Binding var selection: String

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 8), count: 6)

    var body: some View {
        LazyVGrid(columns: columns, spacing: 8) {
            ForEach(presetEmojis, id: \.self) { emoji in
                let isSelected = emoji == selection
                let shape = RoundedRectangle(cornerRadius: 12, style: .continuous)

                Button {
                    selection = emoji
                } label: {
                    Text(emoji)
                        .font(.system(size: 26))
                        .frame(maxWidth: .infinity, minHeight: 46)
                        .background(isSelected ? Color.accentColor.opacity(0.18) : Color(.tertiarySystemFill), in: shape)
                        .overlay(shape.strokeBorder(isSelected ? Color.accentColor : Color.clear, lineWidth: 2))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text(emoji))
                .accessibilityAddTraits(isSelected ? .isSelected : [])
            }
        }
        .padding(.vertical, 6)
        .sensoryFeedback(.selection, trigger: selection)
    }
}
