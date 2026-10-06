import Foundation

/// Display formatting shared across screens (the web app's lib/format.ts).
enum Format {
    /// "1 member", "5 members".
    static func memberCount(_ count: Int) -> String {
        count == 1 ? "1 member" : "\(count) members"
    }

    /// e.g. "October 2026" in the viewer's locale.
    static func monthYear(_ date: Date) -> String {
        date.formatted(.dateTime.month(.wide).year())
    }

    /// e.g. "12 Oct" in the viewer's locale.
    static func dayMonth(_ date: Date) -> String {
        date.formatted(.dateTime.day().month(.abbreviated))
    }

    /// e.g. "5 Oct 2026 at 22:59" in the viewer's locale.
    static func dateTime(_ date: Date) -> String {
        date.formatted(date: .abbreviated, time: .shortened)
    }

    /// "45s", "12m", "3h 20m".
    static func uptime(_ seconds: Int) -> String {
        if seconds < 60 { return "\(seconds)s" }
        if seconds < 3600 { return "\(seconds / 60)m" }
        return "\(seconds / 3600)h \((seconds % 3600) / 60)m"
    }
}
