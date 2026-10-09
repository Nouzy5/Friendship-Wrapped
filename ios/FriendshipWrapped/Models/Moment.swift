import Foundation

/// Something the group is doing right now, or did: "Friday at the lake". For a few hours it is
/// open, and photos posted into it are collected on its page. Not an album: an album is picked
/// together by hand afterwards.
struct Moment: Codable, Identifiable, Hashable {
    struct Cover: Codable, Hashable {
        let photoId: String
        let thumbnailUrl: String
    }

    let id: String
    let groupId: String
    let title: String
    /// One emoji, or nil.
    let emoji: String?
    let startsAt: Date
    /// When it closes to new photos (or closed, if that is in the past).
    let endsAt: Date
    /// Still taking photos, as the server saw it. Use `isStillOpen(at:)` for what's true now.
    let isOpen: Bool
    /// Nil once the creator's account is gone.
    let createdBy: UserSummary?
    let photoCount: Int
    /// The newest photo in it.
    let cover: Cover?
    /// Ending and deleting it are for its creator and the group owner.
    let canManage: Bool

    var photoCountText: String {
        photoCount == 1 ? "1 photo" : "\(photoCount) photos"
    }

    /// The emoji and the title together.
    var heading: String {
        emoji.map { "\($0) \(title)" } ?? title
    }

    /// Whether it is still taking photos. Checked against the clock, so one that runs out while
    /// the app is open stops counting as open without a reload.
    func isStillOpen(at now: Date = Date()) -> Bool {
        isOpen && endsAt > now
    }

    /// "Ends in 2 h 10 min", "Ends in 40 min", or, once over, "Ended yesterday".
    func endText(at now: Date = Date()) -> String {
        let remaining = endsAt.timeIntervalSince(now)
        guard isOpen, remaining > 0 else { return "Ended \(Format.relative(endsAt, now: now).lowercased())" }
        if remaining < 60 { return "Ends in under a minute" }
        if remaining < 3_600 { return "Ends in \(Int((remaining / 60).rounded(.up))) min" }
        // Long spans to the nearest hour (12 hours reads "12 h" a moment after starting); short ones to the minute.
        if remaining >= 6 * 3_600 { return "Ends in \(Int((remaining / 3_600).rounded())) h" }
        let hours = Int(remaining / 3_600)
        let minutes = Int(((remaining - Double(hours) * 3_600) / 60).rounded())
        return minutes == 0 ? "Ends in \(hours) h" : "Ends in \(hours) h \(minutes) min"
    }
}

/// How long a moment stays open, in hours.
enum MomentDuration {
    static let options: [SegmentedPicker<Int>.Option] = [
        .init(value: 1, label: "1 hour"),
        .init(value: 3, label: "3 hours"),
        .init(value: 12, label: "12 hours"),
        .init(value: 24, label: "1 day"),
    ]
    static let defaultHours = 3
}

/// A few emoji to put on a moment, or none.
enum MomentEmoji {
    static let choices = ["🌙", "🏖️", "🎉", "🍕", "⚽", "🏔️", "🎸", "🔥"]
}
