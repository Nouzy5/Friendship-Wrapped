import SwiftUI

/// Centered message for empty, error and not-found states (the web app's StateMessage).
struct EmptyStateView<Actions: View>: View {
    let emoji: String
    let title: String
    var message: String?
    @ViewBuilder var actions: () -> Actions

    var body: some View {
        ContentUnavailableView {
            VStack(spacing: 12) {
                Text(emoji)
                    .font(.system(size: 52))
                    .accessibilityHidden(true)
                Text(title)
                    .font(.title3.bold())
            }
        } description: {
            if let message {
                Text(message)
            }
        } actions: {
            actions()
        }
    }
}

extension EmptyStateView where Actions == EmptyView {
    init(emoji: String, title: String, message: String? = nil) {
        self.init(emoji: emoji, title: title, message: message, actions: { EmptyView() })
    }
}

/// A form-level error shown at the top of a form.
struct FormErrorSection: View {
    let message: String

    var body: some View {
        Section {
            Label(message, systemImage: "exclamationmark.triangle.fill")
                .font(.subheadline)
                .foregroundStyle(.red)
        }
    }
}

/// A form section footer: the server's validation message if there is one, otherwise a hint.
struct FieldFooter: View {
    let error: String?
    var hint: String?

    var body: some View {
        if let error {
            Text(error).foregroundStyle(.red)
        } else if let hint {
            Text(hint)
        }
    }
}

enum ServiceStatus {
    case checking, ok, down, unknown
}

struct StatusIndicator: View {
    let status: ServiceStatus

    var body: some View {
        HStack(spacing: 6) {
            if status == .checking {
                ProgressView().controlSize(.mini)
            } else {
                Circle().fill(color).frame(width: 9, height: 9)
            }
            Text(label).foregroundStyle(.secondary)
        }
        .font(.subheadline)
    }

    private var label: String {
        switch status {
        case .checking: return "Checking…"
        case .ok: return "Operational"
        case .down: return "Unavailable"
        case .unknown: return "Unknown"
        }
    }

    private var color: Color {
        switch status {
        case .checking: return .yellow
        case .ok: return .green
        case .down: return .red
        case .unknown: return .gray
        }
    }
}

extension View {
    /// Shows `message` in an alert while it's non-nil.
    func errorAlert(_ title: String, message: Binding<String?>) -> some View {
        alert(
            title,
            isPresented: Binding(
                get: { message.wrappedValue != nil },
                set: { if !$0 { message.wrappedValue = nil } }
            )
        ) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(message.wrappedValue ?? "")
        }
    }

    /// Full-width content (a button, a photo) on its own in a form, without the row background.
    func buttonRow() -> some View {
        listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
    }

    /// Keeps a text field to `limit` code points, the limit the server checks.
    func characterLimit(_ limit: Int, text: Binding<String>) -> some View {
        onChange(of: text.wrappedValue) { _, newValue in
            // The server (and its database) count Unicode code points, not characters as seen:
            // 👨‍👩‍👧‍👦 is one character but seven code points. Whole characters come off the end.
            guard newValue.unicodeScalars.count > limit else { return }
            // One pass, so a huge paste doesn't freeze the field.
            var used = 0
            var end = newValue.startIndex
            for character in newValue {
                used += character.unicodeScalars.count
                if used > limit { break }
                end = newValue.index(after: end)
            }
            text.wrappedValue = String(newValue[..<end])
        }
    }
}
