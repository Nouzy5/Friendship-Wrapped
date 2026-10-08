import SwiftUI

/// Centered message for empty, error and not-found states (the web app's StateMessage): the
/// emoji pops in, the words rise after it.
struct EmptyStateView<Actions: View>: View {
    let emoji: String
    let title: String
    var message: String?
    @ViewBuilder var actions: () -> Actions

    var body: some View {
        VStack(spacing: 0) {
            Text(emoji)
                .font(.system(size: 52))
                .popIn(delay: 0.12)
                .accessibilityHidden(true)
            Text(title)
                .font(Theme.title(.title2))
                .multilineTextAlignment(.center)
                .padding(.top, 16)
                .accessibilityAddTraits(.isHeader)
            if let message {
                Text(message)
                    .font(.callout)
                    .foregroundStyle(.sub)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 320)
                    .padding(.top, 8)
            }
            actions()
                .padding(.top, 24)
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 48)
        .frame(maxWidth: .infinity)
        .fadeIn()
    }
}

extension EmptyStateView where Actions == EmptyView {
    init(emoji: String, title: String, message: String? = nil) {
        self.init(emoji: emoji, title: title, message: message, actions: { EmptyView() })
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
                Image(systemName: symbol)
                    .font(.footnote.weight(.semibold))
            }
            Text(label)
        }
        .font(.subheadline)
        .foregroundStyle(.sub)
    }

    private var label: String {
        switch status {
        case .checking: return "Checking…"
        case .ok: return "Operational"
        case .down: return "Unavailable"
        case .unknown: return "Unknown"
        }
    }

    // Shapes rather than traffic-light colours: colour only ever means a person.
    private var symbol: String {
        switch status {
        case .checking: return "circle.dotted"
        case .ok: return "checkmark.circle.fill"
        case .down: return "xmark.circle.fill"
        case .unknown: return "questionmark.circle"
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
